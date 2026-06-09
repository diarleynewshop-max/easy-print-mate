const fs = require("fs");
const path = require("path");

const HOSTS = {
  NEWSHOP: "newshop.varejofacil.com",
  FACIL: "facil.varejofacil.com",
  SOYE: "soye.varejofacil.com",
};

const ERP_LOJA_BY_EMPRESA = {
  FACIL: 1,
  NEWSHOP: 2,
  SOYE: 1,
};

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
    const response = await fetch(`${baseUrl}/auth`, {
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

async function fetchErpJson(baseUrl, token, requestPath, debug, step = "fetch") {
  let lastResult = null;
  for (const candidate of getAuthorizationCandidates(token)) {
    const response = await fetch(`${baseUrl}${requestPath}`, {
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

async function consultarProduto({ codigo, empresa: empresaInput, companyName, loja, baseUrl: configuredBaseUrl, token: configuredToken, username: configuredUsername, password: configuredPassword }) {
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
    const error = new Error(debug.some((step) => step.status === 401) ? "ERP recusou o Authorization. Verifique token, usuario ou senha." : `Produto nao encontrado para o codigo ${codigo}`);
    error.status = debug.some((step) => step.status === 401) ? 401 : 404;
    error.debug = debug;
    throw error;
  }

  const produtoId = String(produto.id);
  const lojaAtiva = Number.isFinite(lojaId) ? Number(lojaId) : ERP_LOJA_BY_EMPRESA[empresa] || 1;
  const [precos, estoque, secao, grupo] = await Promise.all([
    buscarPrecos(baseUrl, token, produtoId, lojaAtiva, debug).catch(() => ({ precoVarejo: 0, precoAtacado: 0, precoOriginal: 0 })),
    buscarEstoque(baseUrl, token, produtoId, lojaAtiva, debug).catch(() => undefined),
    buscarSecao(baseUrl, token, produto.secaoId, debug).catch(() => ""),
    buscarGrupo(baseUrl, token, produto.secaoId, produto.grupoId, debug).catch(() => ""),
  ]);

  const imageUrl = produto.urlFoto || produto.fotoPrincipal || produto.urlFotoPrincipal || produto.urlImagem || produto.imagem || produto.foto || undefined;
  if (!imageUrl) {
    const imageKeys = Object.keys(produto).filter((k) => /foto|imagem|image|photo|url/i.test(k));
    if (imageKeys.length) debug.push({ step: "image-fields-found", path: "produto", message: imageKeys.map((k) => `${k}=${JSON.stringify(produto[k])}`).join("; ") });
  }

  return {
    product: {
      id: produtoId,
      ean: eanResolvido,
      codigo_barras: eanResolvido,
      descricao: produto.descricao || produto.descricaoReduzida || produto.codigoInterno || "Produto sem descricao",
      codigoInterno: produto.codigoInterno,
      secao: produto.secao?.descricao || secao || undefined,
      grupo: produto.grupo?.descricao || grupo || undefined,
      precoVarejo: precos.precoVarejo,
      precoAtacado: precos.precoAtacado,
      precoOriginal: precos.precoOriginal,
      estoque,
      imageUrl: imageUrl || undefined,
    },
    empresa,
    lojaId: Number.isFinite(lojaId) ? lojaId : null,
    debug,
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

  // Busca preços em paralelo (max 5 simultâneos)
  const CONCURRENCY = 5;
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
  }

  return enriched;
}

module.exports = { consultarProduto, loadErpEnv, listarProdutosPaginado, sincronizarAlterados };
