type EmpresaKey = "NEWSHOP" | "FACIL" | "SOYE";

type ErpProduto = Record<string, unknown> & {
  id?: number | string;
  descricao?: string;
  descricaoReduzida?: string;
  codigoInterno?: string;
  secaoId?: number;
  grupoId?: number;
  secao?: { descricao?: string };
  grupo?: { descricao?: string };
};

type ErpPreco = {
  lojaId?: number;
  precoVenda1?: number;
  precoOferta1?: number;
  precoVenda2?: number;
  precoOferta2?: number;
  precoAtacado?: number;
};

type ErpSaldo = {
  lojaId?: number;
  saldo?: number;
  saldoEstoque?: number;
  estoque?: number;
};

type ErpCodigoAuxiliar = {
  id?: string;
  produtoId?: number;
  tipo?: string;
};

type ErpSecao = {
  id?: number;
  descricao?: string;
};

type ErpGrupo = {
  id?: number;
  descricao?: string;
};

type PrecosNormalizados = {
  precoVarejo: number;
  precoAtacado: number;
};

type JsonResult<T> = {
  response: Response;
  data: T | null;
  text: string;
};

type DebugStep = {
  step: string;
  path: string;
  status?: number;
  ok?: boolean;
  items?: number;
  found?: boolean;
  authMode?: string;
  message?: string;
  preview?: string;
};

const HOSTS: Record<EmpresaKey, string> = {
  NEWSHOP: "newshop.varejofacil.com",
  FACIL: "facil.varejofacil.com",
  SOYE: "facil.varejofacil.com",
};

const ERP_LOJA_BY_EMPRESA: Record<EmpresaKey, number> = {
  FACIL: 1,
  NEWSHOP: 2,
  SOYE: 1,
};

const ERP_EMPRESAS: EmpresaKey[] = ["NEWSHOP", "FACIL", "SOYE"];

const tokenCache = new Map<string, string>();
const tokenSourceCache = new Map<string, string>();

function getSingle(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function normalizeEmpresa(value: string | string[] | undefined): EmpresaKey {
  const normalized = getSingle(value).trim().toUpperCase();
  if (normalized.includes("SOYE")) return "SOYE";
  if (normalized.includes("FACIL")) return "FACIL";
  return "NEWSHOP";
}

function getEmpresasFallback(empresa: EmpresaKey): EmpresaKey[] {
  return [empresa, ...ERP_EMPRESAS.filter((item) => item !== empresa)];
}

function getEnv(empresa: EmpresaKey, key: "URL" | "USERNAME" | "PASSWORD" | "TOKEN" | "LOJA_ID"): string {
  return (
    process.env[`ERP_API_${key}_${empresa}`] ||
    process.env[`VITE_ERP_API_${key}_${empresa}`] ||
    process.env[`ERP_API_${key}`] ||
    process.env[`VITE_ERP_API_${key}`] ||
    ""
  );
}

function resolveBaseUrl(empresa: EmpresaKey): string {
  const configuredUrl = (getEnv(empresa, "URL") || `https://${HOSTS[empresa]}`).replace(/\/$/, "");
  return configuredUrl.endsWith("/api") ? configuredUrl : `${configuredUrl}/api`;
}

function resolveTokenFromAuth(data: Record<string, unknown>): string {
  return (
    (typeof data.accessToken === "string" && data.accessToken) ||
    (typeof data.access_token === "string" && data.access_token) ||
    (typeof data.token === "string" && data.token) ||
    (typeof data.jwt === "string" && data.jwt) ||
    ""
  );
}

async function getAccessToken(empresa: EmpresaKey, baseUrl: string): Promise<string> {
  const username = getEnv(empresa, "USERNAME");
  const password = getEnv(empresa, "PASSWORD");
  const configuredToken = getEnv(empresa, "TOKEN");
  const cacheKey = `${empresa}:${baseUrl}:${username}`;
  const cachedToken = tokenCache.get(cacheKey);
  if (cachedToken) return cachedToken;

  if (username && password) {
    const response = await fetch(`${baseUrl}/auth`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ username, password }),
    });

    if (!response.ok) {
      throw new Error(`Nao foi possivel autenticar no ERP (${response.status}).`);
    }

    const data = (await response.json()) as Record<string, unknown>;
    const token = resolveTokenFromAuth(data);
    if (!token) {
      throw new Error("O ERP nao retornou um access token valido no login.");
    }

    tokenCache.set(cacheKey, token);
    tokenSourceCache.set(cacheKey, "auth");
    return token;
  }

  if (configuredToken) {
    tokenCache.set(cacheKey, configuredToken);
    tokenSourceCache.set(cacheKey, "env-token");
    return configuredToken;
  }

  throw new Error(`Credenciais do ERP nao configuradas para ${empresa}.`);
}

async function fetchErpJson<T>(
  baseUrl: string,
  token: string,
  path: string,
  debug?: DebugStep[],
  step = "fetch"
): Promise<JsonResult<T>> {
  const authCandidates = getAuthorizationCandidates(token);
  let lastResult: JsonResult<T> | null = null;

  for (const candidate of authCandidates) {
    const response = await fetch(`${baseUrl}${path}`, {
      headers: {
        Authorization: candidate.value,
        Accept: "application/json",
      },
    });

    if (response.status === 401) tokenCache.clear();

    const text = await response.text();
    const contentType = response.headers.get("content-type") || "";
    let data: T | null = null;

    if (contentType.includes("application/json") && text) {
      try {
        data = JSON.parse(text) as T;
      } catch {
        data = null;
      }
    }

    lastResult = { response, data, text };

    debug?.push({
      step,
      path,
      status: response.status,
      ok: response.ok,
      items: getItems(data).length,
      authMode: candidate.mode,
      preview: text.replace(/\s+/g, " ").slice(0, 240),
    });

    if (response.status !== 401) return lastResult;
  }

  return lastResult!;
}

function getAuthorizationCandidates(token: string): Array<{ mode: string; value: string }> {
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

function normalizarEans(codigo: string): string[] {
  const limpo = codigo.replace(/\s+/g, "");
  const candidatos = [limpo];
  if (/^\d{13}$/.test(limpo)) candidatos.push(`0${limpo}`);
  if (/^0\d{13}$/.test(limpo)) candidatos.push(limpo.slice(1));
  return [...new Set(candidatos.filter(Boolean))];
}

function sanitizeSearchTerm(value: string): string {
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

function searchCandidates(value: string): string[] {
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

function extrairImagemProduto(produto: ErpProduto): string | undefined {
  const imagens = Array.isArray(produto.imagens) ? produto.imagens : [];
  for (const image of imagens) {
    if (typeof image === "string" && image.trim()) return image.trim();
    if (image && typeof image === "object") {
      const item = image as Record<string, unknown>;
      const value = item.url || item.imagem || item.src || item.foto || item.imageUrl;
      if (value) return String(value);
    }
  }
  return (
    (typeof produto.urlFoto === "string" && produto.urlFoto) ||
    (typeof produto.fotoPrincipal === "string" && produto.fotoPrincipal) ||
    (typeof produto.urlFotoPrincipal === "string" && produto.urlFotoPrincipal) ||
    (typeof produto.urlImagem === "string" && produto.urlImagem) ||
    (typeof produto.imagem === "string" && produto.imagem) ||
    (typeof produto.foto === "string" && produto.foto) ||
    undefined
  );
}

function produtoBasico(produto: ErpProduto, eanFallback = "") {
  const codigo = String(produto.gtin || produto.codigoBarras || eanFallback || produto.codigoInterno || produto.id || "");
  return {
    id: produto.id != null ? String(produto.id) : codigo,
    ean: codigo,
    codigo_barras: codigo,
    descricao: produto.descricao || produto.descricaoReduzida || produto.codigoInterno || "Produto sem descricao",
    codigoInterno: produto.codigoInterno,
    secao: produto.secao?.descricao,
    grupo: produto.grupo?.descricao,
    imageUrl: extrairImagemProduto(produto),
  };
}

function getErpLojaAtiva(empresa: EmpresaKey, lojaId?: number): number {
  return Number.isFinite(lojaId) ? Number(lojaId) : ERP_LOJA_BY_EMPRESA[empresa] || 1;
}

function getItems<T>(data: unknown): T[] {
  if (Array.isArray(data)) return data as T[];
  if (data && typeof data === "object" && Array.isArray((data as { items?: unknown[] }).items)) {
    return (data as { items: T[] }).items;
  }
  return [];
}

async function buscarCodigoAuxiliarPorEan(
  baseUrl: string,
  token: string,
  codigo: string,
  debug: DebugStep[]
): Promise<{ codigoAuxiliar: ErpCodigoAuxiliar; eanEncontrado: string } | null> {
  for (const candidato of normalizarEans(codigo)) {
    const fiql = encodeURIComponent(`id==${candidato}`);
    const path = `/v1/produto/codigos-auxiliares?q=${fiql}&count=5`;
    const codAux = await fetchErpJson<{ items?: ErpCodigoAuxiliar[] }>(
      baseUrl,
      token,
      path,
      debug,
      `codigo-auxiliar:${candidato}`
    );

    const items = getItems<ErpCodigoAuxiliar>(codAux.data);
    const codigoAuxiliar = items.find((item) => item?.produtoId && item?.tipo === "EAN") || items.find((item) => item?.produtoId);

    if (codigoAuxiliar?.produtoId) {
      debug.push({ step: "codigo-auxiliar-encontrado", path, found: true, message: `produtoId=${codigoAuxiliar.produtoId}` });
      return {
        codigoAuxiliar,
        eanEncontrado: codigoAuxiliar.id || candidato,
      };
    }
  }

  return null;
}

function normalizarPrecos(precoVenda?: number, precoOferta?: number): { varejo: number; original: number } {
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

function normalizarPreco(precoVenda?: number, precoOferta?: number): number {
  if (typeof precoOferta === "number" && precoOferta > 0) return precoOferta;
  if (typeof precoVenda === "number") return precoVenda;
  return 0;
}

async function buscarPrecos(
  baseUrl: string,
  token: string,
  produtoId: string,
  lojaId: number | undefined,
  debug: DebugStep[]
): Promise<PrecosNormalizados & { precoOriginal: number }> {
  const result = await fetchErpJson<ErpPreco[] | { items?: ErpPreco[] }>(
    baseUrl,
    token,
    `/v1/produto/produtos/${encodeURIComponent(produtoId)}/precos`,
    debug,
    `precos:${produtoId}`
  );

  if (!result.response.ok) return { precoVarejo: 0, precoAtacado: 0, precoOriginal: 0 };

  const precos = getItems<ErpPreco>(result.data);
  const lojaAtiva = Number.isFinite(lojaId) ? lojaId : undefined;
  const selecionado = lojaAtiva ? precos.find((preco) => Number(preco.lojaId) === lojaAtiva) || precos[0] : precos[0];

  const norm = normalizarPrecos(selecionado?.precoVenda1, selecionado?.precoOferta1);

  return {
    precoOriginal: norm.original,
    precoVarejo: norm.varejo,
    precoAtacado: normalizarPreco(selecionado?.precoVenda2 ?? selecionado?.precoAtacado, selecionado?.precoOferta2),
  };
}

async function buscarEstoque(
  baseUrl: string,
  token: string,
  produtoId: string,
  lojaId: number | undefined,
  debug: DebugStep[]
): Promise<number | undefined> {
  const fiql = encodeURIComponent(`produtoId==${produtoId}`);
  const result = await fetchErpJson<{ items?: ErpSaldo[] } | ErpSaldo[]>(
    baseUrl,
    token,
    `/v1/estoque/saldos?q=${fiql}&count=100`,
    debug,
    `estoque:${produtoId}`
  );

  if (!result.response.ok) return undefined;

  const saldos = getItems<ErpSaldo>(result.data);
  const selecionado = lojaId
    ? saldos.find((saldo) => Number(saldo.lojaId) === lojaId) || saldos[0]
    : saldos[0];

  return selecionado?.saldo ?? selecionado?.saldoEstoque ?? selecionado?.estoque;
}

async function buscarSecao(baseUrl: string, token: string, secaoId: number | undefined, debug: DebugStep[]): Promise<string> {
  if (!secaoId) return "";
  const result = await fetchErpJson<ErpSecao>(baseUrl, token, `/v1/produto/secoes/${secaoId}`, debug, `secao:${secaoId}`);
  return result.response.ok ? result.data?.descricao || "" : "";
}

async function buscarGrupo(
  baseUrl: string,
  token: string,
  secaoId: number | undefined,
  grupoId: number | undefined,
  debug: DebugStep[]
): Promise<string> {
  if (!secaoId || !grupoId) return "";
  const result = await fetchErpJson<ErpGrupo>(
    baseUrl,
    token,
    `/v1/produto/secoes/${secaoId}/grupos/${grupoId}`,
    debug,
    `grupo:${secaoId}:${grupoId}`
  );
  return result.response.ok ? result.data?.descricao || "" : "";
}

async function montarProdutoCompleto(
  baseUrl: string,
  token: string,
  empresa: EmpresaKey,
  produto: ErpProduto,
  eanResolvido: string,
  lojaId: number | undefined,
  debug: DebugStep[]
) {
  const produtoId = String(produto.id);
  const lojaAtiva = getErpLojaAtiva(empresa, lojaId);
  const [precos, estoque, secao, grupo] = await Promise.all([
    buscarPrecos(baseUrl, token, produtoId, lojaAtiva, debug).catch((error): PrecosNormalizados & { precoOriginal: number } => {
      debug.push({ step: "precos-erro", path: "-", message: error instanceof Error ? error.message : String(error) });
      return { precoVarejo: 0, precoAtacado: 0, precoOriginal: 0 };
    }),
    buscarEstoque(baseUrl, token, produtoId, lojaAtiva, debug).catch((error) => {
      debug.push({ step: "estoque-erro", path: "-", message: error instanceof Error ? error.message : String(error) });
      return undefined;
    }),
    buscarSecao(baseUrl, token, produto.secaoId, debug).catch((error) => {
      debug.push({ step: "secao-erro", path: "-", message: error instanceof Error ? error.message : String(error) });
      return "";
    }),
    buscarGrupo(baseUrl, token, produto.secaoId, produto.grupoId, debug).catch((error) => {
      debug.push({ step: "grupo-erro", path: "-", message: error instanceof Error ? error.message : String(error) });
      return "";
    }),
  ]);

  const codigo = String(produto.gtin || produto.codigoBarras || eanResolvido || produto.codigoInterno || produtoId);

  return {
    id: produtoId,
    ean: codigo,
    codigo_barras: codigo,
    descricao: produto.descricao || produto.descricaoReduzida || produto.codigoInterno || "Produto sem descricao",
    codigoInterno: produto.codigoInterno,
    empresa,
    secao: produto.secao?.descricao || secao || undefined,
    grupo: produto.grupo?.descricao || grupo || undefined,
    precoVarejo: precos.precoVarejo,
    precoAtacado: precos.precoAtacado,
    precoOriginal: precos.precoOriginal,
    estoque,
    imageUrl: extrairImagemProduto(produto),
  };
}

async function buscarProdutoCompletoPorId(
  baseUrl: string,
  token: string,
  empresa: EmpresaKey,
  produtoId: string,
  lojaId: number | undefined,
  debug: DebugStep[]
) {
  const result = await fetchErpJson<ErpProduto>(
    baseUrl,
    token,
    `/v1/produto/produtos/${encodeURIComponent(produtoId)}`,
    debug,
    `produto-por-id:${produtoId}`
  );

  if (!result.response.ok || !result.data?.id) {
    const error = new Error(`Produto nao encontrado para o ID ${produtoId}`);
    (error as Error & { status?: number }).status = result.response.status || 404;
    throw error;
  }

  return montarProdutoCompleto(baseUrl, token, empresa, result.data, "", lojaId, debug);
}

async function buscarProdutosPorTermo(
  baseUrl: string,
  token: string,
  termo: string,
  limit: number,
  debug: DebugStep[]
) {
  const clean = sanitizeSearchTerm(termo);
  const itemsById = new Map<string, ReturnType<typeof produtoBasico>>();
  if (!clean) return [];

  const addProduto = (produto: ErpProduto, eanFallback = "") => {
    if (!produto?.id || itemsById.size >= limit) return;
    const key = String(produto.id);
    if (!itemsById.has(key)) itemsById.set(key, produtoBasico(produto, eanFallback));
  };

  const digits = clean.replace(/\D/g, "");
  if (/^\d{6,14}$/.test(digits)) {
    const foundByEan = await buscarCodigoAuxiliarPorEan(baseUrl, token, digits, debug).catch(() => null);
    if (foundByEan?.codigoAuxiliar?.produtoId) {
      const result = await fetchErpJson<ErpProduto>(
        baseUrl,
        token,
        `/v1/produto/produtos/${foundByEan.codigoAuxiliar.produtoId}`,
        debug,
        `produto-opcao-ean:${digits}`
      );
      if (result.response.ok && result.data) addProduto(result.data, foundByEan.eanEncontrado || digits);
    }

    for (const field of ["gtin", "codigoBarras", "codigoInterno"]) {
      if (itemsById.size >= limit) break;
      const fiql = encodeURIComponent(`${field}==${digits}`);
      const requestPath = `/v1/produto/produtos?q=${fiql}&count=${limit}`;
      const result = await fetchErpJson<ErpProduto[] | { items?: ErpProduto[] }>(
        baseUrl,
        token,
        requestPath,
        debug,
        `busca-exata-${field}:${digits}`
      );
      if (!result.response.ok) continue;
      for (const produto of getItems<ErpProduto>(result.data)) addProduto(produto, digits);
    }
  }

  for (const candidate of searchCandidates(clean)) {
    for (const field of ["descricao", "codigoInterno"]) {
      if (itemsById.size >= limit) break;
      const fiql = encodeURIComponent(`${field}==*${candidate}*`);
      const requestPath = `/v1/produto/produtos?q=${fiql}&count=${limit}`;
      const result = await fetchErpJson<ErpProduto[] | { items?: ErpProduto[] }>(
        baseUrl,
        token,
        requestPath,
        debug,
        `busca-${field}:${candidate}`
      );
      if (!result.response.ok) continue;
      for (const produto of getItems<ErpProduto>(result.data)) addProduto(produto);
    }
  }

  return Array.from(itemsById.values()).slice(0, limit);
}

async function consultarPrecoProdutoVarejoFacil(
  baseUrl: string,
  token: string,
  empresa: EmpresaKey,
  codigoBarras: string,
  lojaId: number | undefined,
  debug: DebugStep[]
) {
  const codigo = codigoBarras.trim();
  const codigoAuxiliarEncontrado = await buscarCodigoAuxiliarPorEan(baseUrl, token, codigo, debug);
  let produto: ErpProduto | null = null;
  let eanResolvido = codigo;

  if (codigoAuxiliarEncontrado?.codigoAuxiliar.produtoId) {
    const produtoResult = await fetchErpJson<ErpProduto>(
      baseUrl,
      token,
      `/v1/produto/produtos/${codigoAuxiliarEncontrado.codigoAuxiliar.produtoId}`,
      debug,
      `produto-por-id:${codigoAuxiliarEncontrado.codigoAuxiliar.produtoId}`
    );
    produto = produtoResult.response.ok ? produtoResult.data : null;
    eanResolvido = codigoAuxiliarEncontrado.eanEncontrado;
  }

  if (!produto) {
    const produtoResult = await fetchErpJson<ErpProduto>(
      baseUrl,
      token,
      `/v1/produto/produtos/consulta/${encodeURIComponent(codigo)}`,
      debug,
      `produto-consulta:${codigo}`
    );
    produto = produtoResult.response.ok ? produtoResult.data : null;
  }

  if (!produto?.id) {
    const opcoes = await buscarProdutosPorTermo(baseUrl, token, codigo, 2, debug);
    if (opcoes.length === 1 && opcoes[0].id) {
      return buscarProdutoCompletoPorId(baseUrl, token, empresa, String(opcoes[0].id), lojaId, debug);
    }
    if (opcoes.length > 1) {
      const error = new Error(`Encontrei ${opcoes.length} produtos para "${codigo}". Escolha o item na lista de resultados.`);
      (error as Error & { status?: number }).status = 409;
      throw error;
    }
  }

  if (!produto?.id) {
    if (debug.some((step) => step.status === 401)) {
      const error = new Error("ERP recusou o Authorization nas consultas. Verifique se o token/usuario da Vercel tem permissao na API.");
      (error as Error & { status?: number }).status = 401;
      throw error;
    }

    debug.push({ step: "produto-nao-encontrado", path: "-", found: false, message: `codigo=${codigo}` });
    const error = new Error(`Produto nao encontrado para o codigo ${codigo}`);
    (error as Error & { status?: number }).status = 404;
    throw error;
  }

  debug.push({ step: "produto-encontrado", path: "-", found: true, message: `produtoId=${produto.id}` });

  return montarProdutoCompleto(baseUrl, token, empresa, produto, eanResolvido, lojaId, debug);
}

async function consultarPrecoProdutoTodasEmpresas(
  empresaInicial: EmpresaKey,
  codigo: string,
  lojaId: number | undefined,
  debug: DebugStep[]
) {
  let lastError: Error & { status?: number } | null = null;

  for (const empresa of getEmpresasFallback(empresaInicial)) {
    try {
      const baseUrl = resolveBaseUrl(empresa);
      const token = await getAccessToken(empresa, baseUrl);
      const product = await consultarPrecoProdutoVarejoFacil(baseUrl, token, empresa, codigo, lojaId, debug);
      if (empresa !== empresaInicial) {
        debug.push({ step: "fallback-empresa", path: "/api/varejo-facil", found: true, message: `produto encontrado em ${empresa} apos falhar em ${empresaInicial}` });
      }
      return { product, empresa };
    } catch (error) {
      lastError = error as Error & { status?: number };
      debug.push({
        step: "fallback-empresa-falhou",
        path: "/api/varejo-facil",
        status: lastError.status,
        message: `empresa=${empresa}; ${lastError.message || "falha desconhecida"}`,
      });
      if (lastError.status === 401 && empresa === empresaInicial) break;
    }
  }

  const error = new Error(`Produto nao encontrado para o codigo ${codigo} nas bases ${getEmpresasFallback(empresaInicial).join(", ")}`);
  (error as Error & { status?: number }).status = lastError?.status === 401 ? 401 : 404;
  throw error;
}

async function buscarProdutosPorTermoTodasEmpresas(
  empresaInicial: EmpresaKey,
  search: string,
  limit: number,
  debug: DebugStep[]
) {
  const itemsByKey = new Map<string, ReturnType<typeof produtoBasico> & { empresa?: EmpresaKey }>();

  for (const empresa of getEmpresasFallback(empresaInicial)) {
    if (itemsByKey.size >= limit) break;
    try {
      const baseUrl = resolveBaseUrl(empresa);
      const token = await getAccessToken(empresa, baseUrl);
      const items = await buscarProdutosPorTermo(baseUrl, token, search, limit - itemsByKey.size, debug);
      for (const item of items) {
        const key = `${empresa}:${item.id || item.ean || item.codigoInterno || item.descricao}`;
        if (!itemsByKey.has(key)) itemsByKey.set(key, { ...item, empresa });
      }
    } catch (error) {
      const err = error as Error & { status?: number };
      debug.push({
        step: "fallback-search-empresa-falhou",
        path: "/api/varejo-facil",
        status: err.status,
        message: `empresa=${empresa}; ${err.message || "falha desconhecida"}`,
      });
      if (err.status === 401 && empresa === empresaInicial) break;
    }
  }

  return Array.from(itemsByKey.values()).slice(0, limit);
}

export default async function handler(
  req: { method?: string; query: Record<string, string | string[] | undefined> },
  res: { status: (code: number) => { json: (data: unknown) => void }; json: (data: unknown) => void }
) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Metodo nao permitido" });
  }

  const codigo = getSingle(req.query.codigo).trim();
  const produtoId = getSingle(req.query.produtoId).trim();
  const search = sanitizeSearchTerm(getSingle(req.query.search));
  const limit = Math.max(1, Math.min(50, Number(getSingle(req.query.limit)) || 20));
  if (!codigo && !produtoId && !search) {
    return res.status(400).json({ error: "codigo, produtoId ou search obrigatorio" });
  }

  const empresa = normalizeEmpresa(req.query.empresa);
  const baseUrl = resolveBaseUrl(empresa);
  const lojaParam = getSingle(req.query.loja).trim() || getEnv(empresa, "LOJA_ID");
  const lojaId = lojaParam ? Number(lojaParam) : undefined;
  const debug: DebugStep[] = [
    {
      step: "entrada",
      path: "/api/varejo-facil",
      message: `empresa=${empresa}; codigo=${codigo || "-"}; produtoId=${produtoId || "-"}; search=${search || "-"}; loja=${Number.isFinite(lojaId) ? lojaId : "nao definida"}; base=${baseUrl}`,
    },
  ];

  try {
    if (produtoId) {
      const token = await getAccessToken(empresa, baseUrl);
      const username = getEnv(empresa, "USERNAME");
      const cacheKey = `${empresa}:${baseUrl}:${username}`;
      debug.push({
        step: "auth",
        path: `${baseUrl}/auth`,
        found: true,
        message: `token disponivel via ${tokenSourceCache.get(cacheKey) || (username ? "auth" : "env-token")}`,
      });
      const product = await buscarProdutoCompletoPorId(baseUrl, token, empresa, produtoId, Number.isFinite(lojaId) ? lojaId : undefined, debug);
      return res.status(200).json({ product, empresa, lojaId: Number.isFinite(lojaId) ? lojaId : null, debug });
    }

    if (search) {
      const items = await buscarProdutosPorTermoTodasEmpresas(empresa, search, limit, debug);
      return res.status(200).json({ items, empresa, lojaId: Number.isFinite(lojaId) ? lojaId : null, debug });
    }

    const result = await consultarPrecoProdutoTodasEmpresas(empresa, codigo, Number.isFinite(lojaId) ? lojaId : undefined, debug);
    console.info("[varejo-facil] produto resolvido", { empresa: result.empresa, codigo, produtoId: result.product.id, steps: debug });
    return res.status(200).json({ product: result.product, empresa: result.empresa, lojaId: Number.isFinite(lojaId) ? lojaId : null, debug });
  } catch (error) {
    const status = (error as Error & { status?: number }).status || 500;
    const message = error instanceof Error ? error.message : "Erro desconhecido";
    debug.push({ step: "erro-final", path: "-", status, message });
    console.warn("[varejo-facil] falha na consulta", { empresa, codigo, status, message, steps: debug });
    return res.status(status).json({ error: message, empresa, debug });
  }
}
