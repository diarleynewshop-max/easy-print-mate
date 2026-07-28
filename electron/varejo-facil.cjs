const fs = require("fs");
const path = require("path");

const HOSTS = {
  NEWSHOP: "newshop.varejofacil.com",
  FACIL: "facil.varejofacil.com",
  SOYE: "facil.varejofacil.com",
};

const ERP_LOJA_BY_EMPRESA = {
  FACIL: 1,
  NEWSHOP: 2,
  SOYE: 1,
};

const ERP_EMPRESAS = ["NEWSHOP", "FACIL", "SOYE"];

const tokenCache = new Map();
const tokenSourceCache = new Map();

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const content = fs.readFileSync(filePath, "utf8");
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator < 0) continue;
    const key = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim().replace(/^["']|["']$/g, "");
    if (key && value && !process.env[key]) process.env[key] = value;
  }
}

function loadErpEnv(dataDir) {
  loadEnvFile(path.join(path.dirname(process.execPath), ".env"));
  loadEnvFile(path.join(process.cwd(), ".env"));
  loadEnvFile(path.join(dataDir, ".env"));
}

function normalizeEmpresa(value) {
  const normalized = String(value || "").trim().toUpperCase();
  if (!normalized) return "NEWSHOP";
  return normalized.replace(/[^A-Z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "NEWSHOP";
}

function getEmpresasFallback(empresa) {
  const primary = normalizeEmpresa(empresa);
  return [primary, ...ERP_EMPRESAS.filter((item) => item !== primary)];
}

function configuredBaseMatchesEmpresa(empresa, configuredBaseUrl) {
  if (!configuredBaseUrl || !HOSTS[empresa]) return false;
  return String(configuredBaseUrl).toLowerCase().includes(HOSTS[empresa].toLowerCase());
}

function paramsForEmpresa(params, targetEmpresa, primaryEmpresa) {
  const useConfiguredBase = targetEmpresa === primaryEmpresa || configuredBaseMatchesEmpresa(targetEmpresa, params.baseUrl);
  return {
    ...params,
    empresa: targetEmpresa,
    companyName: targetEmpresa,
    baseUrl: useConfiguredBase ? params.baseUrl : "",
  };
}

function getEnv(empresa, key) {
  return (
    process.env[`ERP_API_${key}_${empresa}`] ||
    process.env[`VITE_ERP_API_${key}_${empresa}`] ||
    process.env[`ERP_API_${key}`] ||
    process.env[`VITE_ERP_API_${key}`] ||
    ""
  );
}

function resolveBaseUrl(empresa, configuredBaseUrl) {
  const baseCandidate = configuredBaseUrl || getEnv(empresa, "URL") || (HOSTS[empresa] ? `https://${HOSTS[empresa]}` : "");
  if (!baseCandidate) throw new Error(`URL da API nao configurada para ${empresa}.`);
  const configuredUrl = String(baseCandidate).replace(/\/$/, "");
  return configuredUrl.endsWith("/api") ? configuredUrl : `${configuredUrl}/api`;
}

function resolveTokenFromAuth(data) {
  return data?.accessToken || data?.access_token || data?.token || data?.jwt || "";
}

async function getAccessToken(empresa, baseUrl, configuredToken, configuredUsername, configuredPassword) {
  const username = configuredUsername || getEnv(empresa, "USERNAME");
  const password = configuredPassword || getEnv(empresa, "PASSWORD");
  const tokenFromEnv = getEnv(empresa, "TOKEN");
  const cacheKey = `${empresa}:${baseUrl}:${username}`;
  const cachedToken = tokenCache.get(cacheKey);
  if (cachedToken) return cachedToken;

  if (username && password) {
    const response = await fetchWithRetry(`${baseUrl}/auth`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ username, password }),
    });

    if (!response.ok) throw new Error(`Nao foi possivel autenticar no ERP (${response.status}).`);
    const data = await response.json();
    const token = resolveTokenFromAuth(data);
    if (!token) throw new Error("O ERP nao retornou um access token valido no login.");

    tokenCache.set(cacheKey, token);
    tokenSourceCache.set(cacheKey, "auth");
    return token;
  }

  const token = configuredToken || tokenFromEnv;
  if (token) {
    tokenCache.set(cacheKey, token);
    tokenSourceCache.set(cacheKey, configuredToken ? "config-token" : "env-token");
    return token;
  }

  throw new Error(`Credenciais do ERP nao configuradas para ${empresa}.`);
}

function getAuthorizationCandidates(token) {
  const trimmed = token.trim();
  const raw = trimmed.replace(/^Bearer\s+/i, "");
  if (/^Bearer\s+/i.test(trimmed)) {
    return [
      { mode: "bearer-original", value: trimmed },
      { mode: "raw-from-bearer", value: raw },
    ];
  }
  return [
    { mode: "raw", value: trimmed },
    { mode: "bearer-added", value: `Bearer ${trimmed}` },
  ];
}

function getItems(data) {
  if (Array.isArray(data)) return data;
  if (data && typeof data === "object" && Array.isArray(data.items)) return data.items;
  return [];
}

const ERP_REQUEST_TIMEOUT_MS = 15000;
const ERP_MAX_RETRIES = 2;
const ERP_RETRY_BASE_DELAY_MS = 500;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Retry com backoff exponencial apenas para falhas transitorias (timeout, rede, 5xx, 429).
// Evita martelar o ERP em erros definitivos (401/404) ou quando ele esta fora do ar.
async function fetchWithRetry(url, options) {
  let lastError = null;
  for (let attempt = 0; attempt <= ERP_MAX_RETRIES; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ERP_REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch(url, { ...options, signal: controller.signal });
      clearTimeout(timer);
      if ((response.status === 429 || response.status >= 500) && attempt < ERP_MAX_RETRIES) {
        await sleep(ERP_RETRY_BASE_DELAY_MS * 2 ** attempt);
        continue;
      }
      return response;
    } catch (err) {
      clearTimeout(timer);
      lastError = err;
      if (attempt < ERP_MAX_RETRIES) {
        await sleep(ERP_RETRY_BASE_DELAY_MS * 2 ** attempt);
        continue;
      }
    }
  }
  throw lastError || new Error("Falha de rede ao acessar o ERP.");
}

async function fetchErpJson(baseUrl, token, requestPath, debug, step = "fetch") {
  let lastResult = null;
  for (const candidate of getAuthorizationCandidates(token)) {
    const response = await fetchWithRetry(`${baseUrl}${requestPath}`, {
      headers: { Authorization: candidate.value, Accept: "application/json" },
    });
    if (response.status === 401) tokenCache.clear();

    const text = await response.text();
    const contentType = response.headers.get("content-type") || "";
    let data = null;
    if (contentType.includes("application/json") && text) {
      try {
        data = JSON.parse(text);
      } catch {
        data = null;
      }
    }

    lastResult = { response, data, text };
    debug?.push({
      step,
      path: requestPath,
      status: response.status,
      ok: response.ok,
      items: getItems(data).length,
      authMode: candidate.mode,
      preview: text.replace(/\s+/g, " ").slice(0, 240),
    });

    if (response.status !== 401) return lastResult;
  }
  return lastResult;
}

function normalizarEans(codigo) {
  const limpo = codigo.replace(/\s+/g, "");
  const candidatos = [limpo];
  if (/^\d{13}$/.test(limpo)) candidatos.push(`0${limpo}`);
  if (/^0\d{13}$/.test(limpo)) candidatos.push(limpo.slice(1));
  return [...new Set(candidatos.filter(Boolean))];
}

function sanitizeSearchTerm(value) {
  return String(value || "")
    .split("")
    .map((char) => {
      const code = char.charCodeAt(0);
      return code < 32 || code === 127 ? " " : char;
    })
    .join("")
    .replace(/[;=(),*]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function searchCandidates(value) {
  const clean = sanitizeSearchTerm(value);
  if (!clean) return [];

  const candidates = [clean];
  const noHyphen = clean.replace(/-/g, " ").replace(/\s+/g, " ").trim();
  const compact = clean.replace(/[\s-]+/g, "");
  if (noHyphen && noHyphen !== clean) candidates.push(noHyphen);
  if (compact && compact !== clean) candidates.push(compact);

  const digits = clean.replace(/\D/g, "");
  if (digits.length >= 3 && digits !== clean) candidates.push(digits);

  const alphaNum = compact.match(/^([A-Za-z]+)(\d{2,})$/);
  if (alphaNum) {
    const [, prefix, numbers] = alphaNum;
    candidates.push(`${prefix}-${numbers}`, `${prefix} ${numbers}`);
    if (numbers.length > 3) {
      candidates.push(`${prefix}-${numbers.slice(0, -1)}`, `${prefix}${numbers.slice(0, -1)}`);
    }
  }

  return [...new Set(candidates.filter((candidate) => candidate.length >= 2))].slice(0, 8);
}

function extrairImagemProduto(produto) {
  if (!produto || typeof produto !== "object") return undefined;
  const imagens = Array.isArray(produto.imagens) ? produto.imagens : [];
  for (const image of imagens) {
    if (typeof image === "string" && image.trim()) return image.trim();
    if (image && typeof image === "object") {
      const value = image.url || image.imagem || image.src || image.foto || image.imageUrl;
      if (value) return String(value);
    }
  }
  return produto.urlFoto || produto.fotoPrincipal || produto.urlFotoPrincipal || produto.urlImagem || produto.imagem || produto.foto || undefined;
}

function produtoBasico(produto, eanFallback = "") {
  const codigo = produto.gtin || produto.codigoBarras || eanFallback || produto.codigoInterno || (produto.id != null ? String(produto.id) : "");
  return {
    id: produto.id != null ? String(produto.id) : codigo,
    ean: String(codigo || ""),
    codigo_barras: String(codigo || ""),
    descricao: produto.descricao || produto.descricaoReduzida || produto.codigoInterno || "Produto sem descricao",
    codigoInterno: produto.codigoInterno || "",
    secao: produto.secao?.descricao || undefined,
    grupo: produto.grupo?.descricao || undefined,
    imageUrl: extrairImagemProduto(produto),
  };
}

async function buscarCodigoAuxiliarPorEan(baseUrl, token, codigo, debug) {
  for (const candidato of normalizarEans(codigo)) {
    const fiql = encodeURIComponent(`id==${candidato}`);
    const requestPath = `/v1/produto/codigos-auxiliares?q=${fiql}&count=5`;
    const result = await fetchErpJson(baseUrl, token, requestPath, debug, `codigo-auxiliar:${candidato}`);
    const items = getItems(result.data);
    const codigoAuxiliar = items.find((item) => item?.produtoId && item?.tipo === "EAN") || items.find((item) => item?.produtoId);
    if (codigoAuxiliar?.produtoId) {
      debug.push({ step: "codigo-auxiliar-encontrado", path: requestPath, found: true, message: `produtoId=${codigoAuxiliar.produtoId}` });
      return { codigoAuxiliar, eanEncontrado: codigoAuxiliar.id || candidato };
    }
  }
  return null;
}

function normalizarPrecos(precoVenda, precoOferta) {
  const venda = typeof precoVenda === "number" && precoVenda > 0 ? precoVenda : 0;
  const oferta = typeof precoOferta === "number" && precoOferta > 0 ? precoOferta : 0;

  // precoVenda1 = "De" (preço original/antigo), precoOferta1 = "Por" (preço promocional)
  // Promoção válida apenas quando precoOferta1 < precoVenda1 (desconto real)
  if (oferta > 0 && oferta < venda) {
    return { varejo: oferta, original: venda };
  }

  // Sem promoção válida (oferta=0 ou oferta>=venda): preço de venda como preço principal
  return { varejo: venda, original: venda };
}

function normalizarPreco(precoVenda, precoOferta) {
  if (typeof precoOferta === "number" && precoOferta > 0) return precoOferta;
  if (typeof precoVenda === "number") return precoVenda;
  return 0;
}

async function buscarPrecos(baseUrl, token, produtoId, lojaId, debug) {
  const result = await fetchErpJson(baseUrl, token, `/v1/produto/produtos/${encodeURIComponent(produtoId)}/precos`, debug, `precos:${produtoId}`);
  if (!result.response.ok) return { precoVarejo: 0, precoAtacado: 0, precoOriginal: 0 };
  const precos = getItems(result.data);
  const selecionado = lojaId ? precos.find((preco) => Number(preco.lojaId) === lojaId) || precos[0] : precos[0];

  if (selecionado) {
    const keys = Object.keys(selecionado).filter((k) => /preco|venda|oferta|atacado/i.test(k));
    debug.push({ step: "preco-fields", path: `produto/${produtoId}/precos`, message: keys.map((k) => `${k}=${JSON.stringify(selecionado[k])}`).join("; ") });
  }

  const norm = normalizarPrecos(
    selecionado?.precoVenda1 ?? selecionado?.precoVenda ?? selecionado?.preco ?? selecionado?.precoVenda1Loja,
    selecionado?.precoOferta1 ?? selecionado?.precoOferta ?? selecionado?.precoPromocional,
  );
  const precoAtacado = normalizarPreco(
    selecionado?.precoVenda2 ?? selecionado?.precoAtacado ?? selecionado?.precoVenda2Loja,
    selecionado?.precoOferta2,
  );
  return { precoVarejo: norm.varejo, precoAtacado, precoOriginal: norm.original };
}

async function buscarEstoque(baseUrl, token, produtoId, lojaId, debug) {
  const fiql = encodeURIComponent(`produtoId==${produtoId}`);
  const result = await fetchErpJson(baseUrl, token, `/v1/estoque/saldos?q=${fiql}&count=100`, debug, `estoque:${produtoId}`);
  if (!result.response.ok) return undefined;
  const saldos = getItems(result.data);
  const selecionado = lojaId ? saldos.find((saldo) => Number(saldo.lojaId) === lojaId) || saldos[0] : saldos[0];
  return selecionado?.saldo ?? selecionado?.saldoEstoque ?? selecionado?.estoque;
}

async function buscarSecao(baseUrl, token, secaoId, debug) {
  if (!secaoId) return "";
  const result = await fetchErpJson(baseUrl, token, `/v1/produto/secoes/${secaoId}`, debug, `secao:${secaoId}`);
  return result.response.ok ? result.data?.descricao || "" : "";
}

async function buscarGrupo(baseUrl, token, secaoId, grupoId, debug) {
  if (!secaoId || !grupoId) return "";
  const result = await fetchErpJson(baseUrl, token, `/v1/produto/secoes/${secaoId}/grupos/${grupoId}`, debug, `grupo:${secaoId}:${grupoId}`);
  return result.response.ok ? result.data?.descricao || "" : "";
}

async function montarProdutoCompleto(baseUrl, token, empresa, produto, eanResolvido, lojaId, debug) {
  const produtoId = String(produto.id);
  const lojaAtiva = Number.isFinite(lojaId) ? Number(lojaId) : ERP_LOJA_BY_EMPRESA[empresa] || 1;
  const [precos, estoque, secao, grupo] = await Promise.all([
    buscarPrecos(baseUrl, token, produtoId, lojaAtiva, debug).catch(() => ({ precoVarejo: 0, precoAtacado: 0, precoOriginal: 0 })),
    buscarEstoque(baseUrl, token, produtoId, lojaAtiva, debug).catch(() => undefined),
    buscarSecao(baseUrl, token, produto.secaoId, debug).catch(() => ""),
    buscarGrupo(baseUrl, token, produto.secaoId, produto.grupoId, debug).catch(() => ""),
  ]);

  const codigo = produto.gtin || produto.codigoBarras || eanResolvido || produto.codigoInterno || produtoId;
  const imageUrl = extrairImagemProduto(produto);
  if (!imageUrl) {
    const imageKeys = Object.keys(produto).filter((k) => /foto|imagem|image|photo|url/i.test(k));
    if (imageKeys.length) debug.push({ step: "image-fields-found", path: "produto", message: imageKeys.map((k) => `${k}=${JSON.stringify(produto[k])}`).join("; ") });
  }

  return {
    id: produtoId,
    ean: String(codigo || ""),
    codigo_barras: String(codigo || ""),
    descricao: produto.descricao || produto.descricaoReduzida || produto.codigoInterno || "Produto sem descricao",
    codigoInterno: produto.codigoInterno,
    empresa,
    secao: produto.secao?.descricao || secao || undefined,
    grupo: produto.grupo?.descricao || grupo || undefined,
    precoVarejo: precos.precoVarejo,
    precoAtacado: precos.precoAtacado,
    precoOriginal: precos.precoOriginal,
    estoque,
    imageUrl: imageUrl || undefined,
  };
}

async function buscarProdutoCompletoPorId(baseUrl, token, empresa, produtoId, lojaId, debug) {
  const result = await fetchErpJson(baseUrl, token, `/v1/produto/produtos/${encodeURIComponent(produtoId)}`, debug, `produto-por-id:${produtoId}`);
  if (!result.response.ok || !result.data?.id) {
    const error = new Error(`Produto nao encontrado para o ID ${produtoId}`);
    error.status = result.response.status || 404;
    error.debug = debug;
    throw error;
  }
  return montarProdutoCompleto(baseUrl, token, empresa, result.data, "", lojaId, debug);
}

async function buscarProdutosPorTermo(baseUrl, token, termo, limit, debug) {
  const clean = sanitizeSearchTerm(termo);
  const itemsById = new Map();
  if (!clean) return [];

  const addProduto = (produto, eanFallback = "") => {
    if (!produto?.id || itemsById.size >= limit) return;
    const key = String(produto.id);
    if (!itemsById.has(key)) itemsById.set(key, produtoBasico(produto, eanFallback));
  };

  const digits = clean.replace(/\D/g, "");
  if (/^\d{6,14}$/.test(digits)) {
    const foundByEan = await buscarCodigoAuxiliarPorEan(baseUrl, token, digits, debug).catch(() => null);
    if (foundByEan?.codigoAuxiliar?.produtoId) {
      const result = await fetchErpJson(baseUrl, token, `/v1/produto/produtos/${foundByEan.codigoAuxiliar.produtoId}`, debug, `produto-opcao-ean:${digits}`);
      if (result.response.ok) addProduto(result.data, foundByEan.eanEncontrado || digits);
    }

    for (const field of ["gtin", "codigoBarras", "codigoInterno"]) {
      if (itemsById.size >= limit) break;
      const fiql = encodeURIComponent(`${field}==${digits}`);
      const requestPath = `/v1/produto/produtos?q=${fiql}&count=${limit}`;
      const result = await fetchErpJson(baseUrl, token, requestPath, debug, `busca-exata-${field}:${digits}`);
      if (!result.response.ok) continue;
      for (const produto of getItems(result.data)) {
        addProduto(produto, digits);
      }
    }
  }

  const fields = ["descricao", "codigoInterno"];
  for (const candidate of searchCandidates(clean)) {
    for (const field of fields) {
      if (itemsById.size >= limit) break;
      const fiql = encodeURIComponent(`${field}==*${candidate}*`);
      const requestPath = `/v1/produto/produtos?q=${fiql}&count=${limit}`;
      const result = await fetchErpJson(baseUrl, token, requestPath, debug, `busca-${field}:${candidate}`);
      if (!result.response.ok) continue;
      for (const produto of getItems(result.data)) {
        addProduto(produto);
      }
    }
  }

  return Array.from(itemsById.values()).slice(0, limit);
}

async function consultarProdutoEmpresa({ codigo, empresa: empresaInput, companyName, loja, baseUrl: configuredBaseUrl, token: configuredToken, username: configuredUsername, password: configuredPassword }) {
  const empresa = normalizeEmpresa(companyName || empresaInput);
  const baseUrl = resolveBaseUrl(empresa, configuredBaseUrl);
  const lojaParam = String(loja || "").trim() || getEnv(empresa, "LOJA_ID");
  const lojaId = lojaParam ? Number(lojaParam) : undefined;
  const debug = [{ step: "entrada", path: "electron:varejo-facil", message: `empresa=${empresa}; codigo=${codigo}; loja=${Number.isFinite(lojaId) ? lojaId : "nao definida"}; base=${baseUrl}` }];

  const token = await getAccessToken(empresa, baseUrl, configuredToken, configuredUsername, configuredPassword);
  const username = configuredUsername || getEnv(empresa, "USERNAME");
  const cacheKey = `${empresa}:${baseUrl}:${username}`;
  debug.push({ step: "auth", path: `${baseUrl}/auth`, found: true, message: `token disponivel via ${tokenSourceCache.get(cacheKey) || (username ? "auth" : "env-token")}` });

  const codigoAuxiliarEncontrado = await buscarCodigoAuxiliarPorEan(baseUrl, token, codigo, debug);
  let produto = null;
  let eanResolvido = codigo;

  if (codigoAuxiliarEncontrado?.codigoAuxiliar.produtoId) {
    const result = await fetchErpJson(baseUrl, token, `/v1/produto/produtos/${codigoAuxiliarEncontrado.codigoAuxiliar.produtoId}`, debug, `produto-por-id:${codigoAuxiliarEncontrado.codigoAuxiliar.produtoId}`);
    produto = result.response.ok ? result.data : null;
    eanResolvido = codigoAuxiliarEncontrado.eanEncontrado;
  }

  if (!produto) {
    const result = await fetchErpJson(baseUrl, token, `/v1/produto/produtos/consulta/${encodeURIComponent(codigo)}`, debug, `produto-consulta:${codigo}`);
    produto = result.response.ok ? result.data : null;
  }

  if (!produto?.id) {
    const opcoes = await buscarProdutosPorTermo(baseUrl, token, codigo, 2, debug);
    if (opcoes.length === 1 && opcoes[0].id) {
      const product = await buscarProdutoCompletoPorId(baseUrl, token, empresa, String(opcoes[0].id), Number.isFinite(lojaId) ? lojaId : undefined, debug);
      return { product, empresa, lojaId: Number.isFinite(lojaId) ? lojaId : null, debug };
    }
    if (opcoes.length > 1) {
      const error = new Error(`Encontrei ${opcoes.length} produtos para "${codigo}". Escolha o item na lista de resultados.`);
      error.status = 409;
      error.debug = debug;
      error.items = opcoes;
      throw error;
    }
  }

  if (!produto?.id) {
    const error = new Error(debug.some((step) => step.status === 401) ? "ERP recusou o Authorization. Verifique token, usuario ou senha." : `Produto nao encontrado para o codigo ${codigo}`);
    error.status = debug.some((step) => step.status === 401) ? 401 : 404;
    error.debug = debug;
    throw error;
  }

  // Sempre prioriza o GTIN/codigo de barras real do produto no ERP.
  // Sem isso, ao buscar por codigo interno ou nome, o campo "ean" ficava com o texto digitado.
  eanResolvido = produto.gtin || produto.codigoBarras || eanResolvido;
  const product = await montarProdutoCompleto(baseUrl, token, empresa, produto, eanResolvido, Number.isFinite(lojaId) ? lojaId : undefined, debug);

  return {
    product,
    empresa,
    lojaId: Number.isFinite(lojaId) ? lojaId : null,
    debug,
  };
}

async function consultarProduto(params) {
  const primary = normalizeEmpresa(params.companyName || params.empresa);
  const allDebug = [];
  let lastError = null;

  for (const empresa of getEmpresasFallback(primary)) {
    try {
      const result = await consultarProdutoEmpresa(paramsForEmpresa(params, empresa, primary));
      if (empresa !== primary) {
        result.debug.unshift({ step: "fallback-empresa", path: "electron:varejo-facil", found: true, message: `produto encontrado em ${empresa} apos falhar em ${primary}` });
      }
      return result;
    } catch (error) {
      lastError = error;
      const errDebug = Array.isArray(error?.debug) ? error.debug : [];
      allDebug.push(...errDebug);
      allDebug.push({
        step: "fallback-empresa-falhou",
        path: "electron:varejo-facil",
        status: error?.status,
        message: `empresa=${empresa}; ${error?.message || "falha desconhecida"}`,
      });

      if (error?.status === 401 && empresa === primary) break;
      if (error?.status && ![404, 409].includes(error.status)) continue;
    }
  }

  const error = new Error(`Produto nao encontrado para o codigo ${params.codigo} nas bases ${getEmpresasFallback(primary).join(", ")}`);
  error.status = lastError?.status === 401 ? 401 : 404;
  error.debug = allDebug.length ? allDebug : lastError?.debug;
  throw error;
}

async function consultarProdutoPorId({ produtoId, empresa: empresaInput, companyName, loja, baseUrl: configuredBaseUrl, token: configuredToken, username: configuredUsername, password: configuredPassword }) {
  const empresa = normalizeEmpresa(companyName || empresaInput);
  const baseUrl = resolveBaseUrl(empresa, configuredBaseUrl);
  const lojaParam = String(loja || "").trim() || getEnv(empresa, "LOJA_ID");
  const lojaId = lojaParam ? Number(lojaParam) : undefined;
  const debug = [{ step: "entrada-id", path: "electron:varejo-facil", message: `empresa=${empresa}; produtoId=${produtoId}; loja=${Number.isFinite(lojaId) ? lojaId : "nao definida"}; base=${baseUrl}` }];

  const token = await getAccessToken(empresa, baseUrl, configuredToken, configuredUsername, configuredPassword);
  const username = configuredUsername || getEnv(empresa, "USERNAME");
  const cacheKey = `${empresa}:${baseUrl}:${username}`;
  debug.push({ step: "auth", path: `${baseUrl}/auth`, found: true, message: `token disponivel via ${tokenSourceCache.get(cacheKey) || (username ? "auth" : "env-token")}` });

  const product = await buscarProdutoCompletoPorId(baseUrl, token, empresa, String(produtoId), Number.isFinite(lojaId) ? lojaId : undefined, debug);
  return {
    product,
    empresa,
    lojaId: Number.isFinite(lojaId) ? lojaId : null,
    debug,
  };
}

async function pesquisarProdutosEmpresa({ search, empresa: empresaInput, companyName, loja, baseUrl: configuredBaseUrl, token: configuredToken, username: configuredUsername, password: configuredPassword, limit = 20 }) {
  const termo = sanitizeSearchTerm(search);
  if (!termo) return { items: [], debug: [] };

  const empresa = normalizeEmpresa(companyName || empresaInput);
  const baseUrl = resolveBaseUrl(empresa, configuredBaseUrl);
  const lojaParam = String(loja || "").trim() || getEnv(empresa, "LOJA_ID");
  const lojaId = lojaParam ? Number(lojaParam) : undefined;
  const debug = [{ step: "entrada-search", path: "electron:varejo-facil", message: `empresa=${empresa}; search=${termo}; loja=${Number.isFinite(lojaId) ? lojaId : "nao definida"}; base=${baseUrl}` }];

  const token = await getAccessToken(empresa, baseUrl, configuredToken, configuredUsername, configuredPassword);
  const username = configuredUsername || getEnv(empresa, "USERNAME");
  const cacheKey = `${empresa}:${baseUrl}:${username}`;
  debug.push({ step: "auth", path: `${baseUrl}/auth`, found: true, message: `token disponivel via ${tokenSourceCache.get(cacheKey) || (username ? "auth" : "env-token")}` });

  const items = await buscarProdutosPorTermo(baseUrl, token, termo, Math.max(1, Math.min(50, Number(limit) || 20)), debug);
  return {
    items,
    empresa,
    lojaId: Number.isFinite(lojaId) ? lojaId : null,
    debug,
  };
}

async function pesquisarProdutos(params) {
  const termo = sanitizeSearchTerm(params.search);
  if (!termo) return { items: [], debug: [] };

  const primary = normalizeEmpresa(params.companyName || params.empresa);
  const limit = Math.max(1, Math.min(50, Number(params.limit) || 20));
  const itemsByKey = new Map();
  const allDebug = [];
  let foundEmpresa = primary;

  for (const empresa of getEmpresasFallback(primary)) {
    if (itemsByKey.size >= limit) break;
    try {
      const result = await pesquisarProdutosEmpresa(paramsForEmpresa({ ...params, limit: limit - itemsByKey.size }, empresa, primary));
      foundEmpresa = itemsByKey.size === 0 && result.items.length > 0 ? empresa : foundEmpresa;
      allDebug.push(...(result.debug || []));
      for (const item of result.items || []) {
        const key = `${empresa}:${item.id || item.ean || item.codigoInterno || item.descricao}`;
        if (!itemsByKey.has(key)) itemsByKey.set(key, { ...item, empresa });
      }
    } catch (error) {
      allDebug.push(...(Array.isArray(error?.debug) ? error.debug : []));
      allDebug.push({
        step: "fallback-search-empresa-falhou",
        path: "electron:varejo-facil",
        status: error?.status,
        message: `empresa=${empresa}; ${error?.message || "falha desconhecida"}`,
      });
      if (error?.status === 401 && empresa === primary) break;
    }
  }

  return {
    items: Array.from(itemsByKey.values()).slice(0, limit),
    empresa: foundEmpresa,
    lojaId: null,
    debug: allDebug,
  };
}

async function listarProdutosPaginado({ empresa: empresaInput, companyName, baseUrl: configuredBaseUrl, token: configuredToken, username: configuredUsername, password: configuredPassword, pagina = 1, quantidade = 100, dataAlteracao }) {
  const empresa = normalizeEmpresa(companyName || empresaInput);
  const baseUrl = resolveBaseUrl(empresa, configuredBaseUrl);
  const debug = [];
  const token = await getAccessToken(empresa, baseUrl, configuredToken, configuredUsername, configuredPassword);
  
  let requestPath = `/v1/produto/produtos?page=${pagina}&count=${quantidade}`;
  if (dataAlteracao) {
    // Formato esperado: YYYY-MM-DDTHH:mm:ss
    requestPath += `&dataAlteracao=${encodeURIComponent(dataAlteracao)}`;
  }
  
  const result = await fetchErpJson(baseUrl, token, requestPath, debug, `listar-produtos:${pagina}`);
  
  if (!result.response.ok) {
    throw new Error(`Erro ao listar produtos: ${result.response.status}`);
  }

  const items = getItems(result.data);
  return {
    items: items.map(p => ({
      id: p.id,
      ean: p.gtin || p.codigoBarras || "",
      codigo_barras: p.gtin || p.codigoBarras || "",
      descricao: p.descricao || p.descricaoReduzida || "",
      codigoInterno: p.codigoInterno || "",
      secao: p.secao?.descricao || "",
      grupo: p.grupo?.descricao || "",
      ultimaAlteracao: p.dataAtualizacao || p.dataAlteracao || null
    })),
    total: result.data?.total || items.length,
    debug
  };
}

async function sincronizarAlterados({ empresa: empresaInput, companyName, baseUrl: configuredBaseUrl,
  token: configuredToken, username: configuredUsername, password: configuredPassword,
  loja, dataAlteracao, quantidade = 200 }) {

  const empresa = normalizeEmpresa(companyName || empresaInput);
  const baseUrl = resolveBaseUrl(empresa, configuredBaseUrl);
  const lojaParam = String(loja || "").trim() || getEnv(empresa, "LOJA_ID");
  const lojaId = lojaParam ? Number(lojaParam) : (ERP_LOJA_BY_EMPRESA[empresa] || 1);
  const token = await getAccessToken(empresa, baseUrl, configuredToken, configuredUsername, configuredPassword);

  // Coleta todos os produtos alterados (paginado)
  let pagina = 1;
  let todos = [];
  while (true) {
    let requestPath = `/v1/produto/produtos?page=${pagina}&count=${quantidade}`;
    if (dataAlteracao) requestPath += `&dataAlteracao=${encodeURIComponent(dataAlteracao)}`;

    const result = await fetchErpJson(baseUrl, token, requestPath, [], `sync-p${pagina}`);
    if (!result.response.ok) break;

    const items = getItems(result.data);
    if (items.length === 0) break;
    todos = todos.concat(items);

    const total = result.data?.total || items.length;
    if (todos.length >= total || items.length < quantidade) break;
    pagina++;
  }

  if (todos.length === 0) return [];

  // Busca precos em paralelo com concorrencia reduzida e pausa entre lotes
  // para nao sobrecarregar o ERP (evita picos de requisicoes simultaneas).
  const CONCURRENCY = 2;
  const BATCH_DELAY_MS = 300;
  const enriched = [];
  for (let i = 0; i < todos.length; i += CONCURRENCY) {
    const batch = todos.slice(i, i + CONCURRENCY);
    const results = await Promise.all(batch.map(async (p) => {
      const precos = await buscarPrecos(baseUrl, token, String(p.id), lojaId, [])
        .catch(() => ({ precoVarejo: 0, precoAtacado: 0, precoOriginal: 0 }));
      return {
        id: String(p.id),
        ean: p.gtin || p.codigoBarras || "",
        codigo_barras: p.gtin || p.codigoBarras || "",
        descricao: p.descricao || p.descricaoReduzida || "",
        codigoInterno: p.codigoInterno || "",
        precoVarejo: precos.precoVarejo,
        precoAtacado: precos.precoAtacado,
        precoOriginal: precos.precoOriginal,
        ultimaAlteracao: p.dataAtualizacao || p.dataAlteracao || null
      };
    }));
    enriched.push(...results);
    if (i + CONCURRENCY < todos.length) await sleep(BATCH_DELAY_MS);
  }

  return enriched;
}

async function mutateErpJson(baseUrl, token, requestPath, method, body, debug) {
  let lastResult = null;
  for (const candidate of getAuthorizationCandidates(token)) {
    const response = await fetchWithRetry(`${baseUrl}${requestPath}`, {
      method,
      headers: {
        Authorization: candidate.value,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(body),
    });
    if (response.status === 401) tokenCache.clear();

    const text = await response.text();
    const contentType = response.headers.get("content-type") || "";
    let data = null;
    if (contentType.includes("application/json") && text) {
      try { data = JSON.parse(text); } catch { data = null; }
    }

    lastResult = { response, data, text };
    debug?.push({ step: `${method}:${requestPath}`, status: response.status, ok: response.ok, authMode: candidate.mode });

    if (response.status !== 401) return lastResult;
  }
  return lastResult;
}

async function atualizarPrecoOferta({ empresa: empresaInput, companyName, baseUrl: configuredBaseUrl, token: configuredToken, username: configuredUsername, password: configuredPassword, loja, produtoId, precoOferta }) {
  const empresa = normalizeEmpresa(companyName || empresaInput);
  const baseUrl = resolveBaseUrl(empresa, configuredBaseUrl);
  const lojaParam = String(loja || "").trim() || getEnv(empresa, "LOJA_ID");
  const lojaId = lojaParam ? Number(lojaParam) : (ERP_LOJA_BY_EMPRESA[empresa] || 1);
  const debug = [{ step: "entrada-update", message: `empresa=${empresa}; produtoId=${produtoId}; lojaId=${lojaId}; precoOferta=${precoOferta}` }];

  const token = await getAccessToken(empresa, baseUrl, configuredToken, configuredUsername, configuredPassword);

  // Busca o registro atual para obter o id do registro de preço (ex: id=270)
  const getResult = await fetchErpJson(baseUrl, token, `/v1/produto/produtos/${produtoId}/precos`, debug, `get-precos-update:${produtoId}`);
  if (!getResult.response.ok) throw new Error(`Nao foi possivel obter precos do produto ${produtoId}: ${getResult.response.status}`);

  const precos = getItems(getResult.data);
  const selecionado = precos.find((p) => Number(p.lojaId) === lojaId) || precos[0];
  if (!selecionado) throw new Error(`Nenhum registro de preco encontrado para produto ${produtoId}`);

  const lojaIdUsada = selecionado.lojaId ?? lojaId;
  const precoRecordId = selecionado.id; // id do registro de preço (ex: 270)
  const payload = { ...selecionado, precoOferta1: precoOferta };

  // Candidatos em ordem de probabilidade:
  // 1. PUT pelo id do registro de preço  (padrão REST com ID próprio)
  // 2. PUT pelo id do produto + lojaId
  // 3. POST (alguns ERPs usam POST para upsert)
  const candidates = [];

  if (precoRecordId != null) {
    candidates.push({ method: "PUT",   path: `/v1/produto/precos/${precoRecordId}` });
    candidates.push({ method: "PUT",   path: `/v1/produto/produto-precos/${precoRecordId}` });
    candidates.push({ method: "PATCH", path: `/v1/produto/precos/${precoRecordId}` });
    candidates.push({ method: "POST",  path: `/v1/produto/precos/${precoRecordId}` });
  }
  candidates.push({ method: "PUT",   path: `/v1/produto/produtos/${produtoId}/precos/${lojaIdUsada}` });
  candidates.push({ method: "PUT",   path: `/v1/produto/produtos/${produtoId}/precos` });
  candidates.push({ method: "POST",  path: `/v1/produto/produtos/${produtoId}/precos` });
  candidates.push({ method: "PUT",   path: `/v1/produto/precos/${lojaIdUsada}/${produtoId}` });

  for (const { method, path } of candidates) {
    const bodyToSend = method === "PATCH" ? { precoOferta1: precoOferta } : payload;
    const result = await mutateErpJson(baseUrl, token, path, method, bodyToSend, debug);
    if (result.response.ok) {
      return { success: true, endpoint: path, method, lojaId: lojaIdUsada, precoOferta, debug };
    }
    // Para em 401 (auth inválido) imediatamente
    if (result.response.status === 401) break;
  }

  const err = new Error("Nao foi possivel atualizar o preco de oferta no ERP. Verifique permissoes da API.");
  err.debug = debug;
  throw err;
}

module.exports = { consultarProduto, consultarProdutoPorId, pesquisarProdutos, loadErpEnv, listarProdutosPaginado, sincronizarAlterados, atualizarPrecoOferta };
