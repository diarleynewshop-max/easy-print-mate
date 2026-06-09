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
  SOYE: "soye.varejofacil.com",
};

const ERP_LOJA_BY_EMPRESA: Record<EmpresaKey, number> = {
  FACIL: 1,
  NEWSHOP: 2,
  SOYE: 1,
};

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

  return {
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
  };
}

export default async function handler(
  req: { method?: string; query: Record<string, string | string[] | undefined> },
  res: { status: (code: number) => { json: (data: unknown) => void }; json: (data: unknown) => void }
) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Metodo nao permitido" });
  }

  const codigo = getSingle(req.query.codigo).trim();
  if (!codigo) {
    return res.status(400).json({ error: "codigo obrigatorio" });
  }

  const empresa = normalizeEmpresa(req.query.empresa);
  const baseUrl = resolveBaseUrl(empresa);
  const lojaParam = getSingle(req.query.loja).trim() || getEnv(empresa, "LOJA_ID");
  const lojaId = lojaParam ? Number(lojaParam) : undefined;
  const debug: DebugStep[] = [
    {
      step: "entrada",
      path: "/api/varejo-facil",
      message: `empresa=${empresa}; codigo=${codigo}; loja=${Number.isFinite(lojaId) ? lojaId : "nao definida"}; base=${baseUrl}`,
    },
  ];

  try {
    const token = await getAccessToken(empresa, baseUrl);
    const username = getEnv(empresa, "USERNAME");
    const cacheKey = `${empresa}:${baseUrl}:${username}`;
    debug.push({
      step: "auth",
      path: `${baseUrl}/auth`,
      found: true,
      message: `token disponivel via ${tokenSourceCache.get(cacheKey) || (username ? "auth" : "env-token")}`,
    });
    const product = await consultarPrecoProdutoVarejoFacil(baseUrl, token, empresa, codigo, Number.isFinite(lojaId) ? lojaId : undefined, debug);
    console.info("[varejo-facil] produto resolvido", { empresa, codigo, produtoId: product.id, steps: debug });
    return res.status(200).json({ product, empresa, lojaId: Number.isFinite(lojaId) ? lojaId : null, debug });
  } catch (error) {
    const status = (error as Error & { status?: number }).status || 500;
    const message = error instanceof Error ? error.message : "Erro desconhecido";
    debug.push({ step: "erro-final", path: "-", status, message });
    console.warn("[varejo-facil] falha na consulta", { empresa, codigo, status, message, steps: debug });
    return res.status(status).json({ error: message, empresa, debug });
  }
}
