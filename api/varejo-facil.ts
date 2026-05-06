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

type PrecosNormalizados = {
  precoVarejo?: number;
  precoAtacado?: number;
};

type JsonResult<T> = {
  response: Response;
  data: T | null;
  text: string;
};

const HOSTS: Record<EmpresaKey, string> = {
  NEWSHOP: "newshop.varejofacil.com",
  FACIL: "facil.varejofacil.com",
  SOYE: "soye.varejofacil.com",
};

const tokenCache = new Map<string, string>();

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
  const configuredToken = getEnv(empresa, "TOKEN");
  if (configuredToken) return configuredToken;

  const username = getEnv(empresa, "USERNAME");
  const password = getEnv(empresa, "PASSWORD");
  const cacheKey = `${empresa}:${baseUrl}:${username}`;
  const cachedToken = tokenCache.get(cacheKey);
  if (cachedToken) return cachedToken;

  if (!username || !password) {
    throw new Error(`Credenciais do ERP nao configuradas para ${empresa}.`);
  }

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
  return token;
}

async function fetchErpJson<T>(baseUrl: string, token: string, path: string): Promise<JsonResult<T>> {
  const response = await fetch(`${baseUrl}${path}`, {
    headers: {
      Authorization: token,
      Accept: "application/json",
    },
  });

  if (response.status === 401) tokenCache.clear();

  const text = await response.text();
  const contentType = response.headers.get("content-type") || "";
  let data: T | null = null;

  if (contentType.includes("application/json") && text) {
    data = JSON.parse(text) as T;
  }

  return { response, data, text };
}

function normalizarEans(codigo: string): string[] {
  const limpo = codigo.replace(/\s+/g, "");
  const candidatos = [limpo];
  if (/^\d{13}$/.test(limpo)) candidatos.push(`0${limpo}`);
  if (/^0\d{13}$/.test(limpo)) candidatos.push(limpo.slice(1));
  return [...new Set(candidatos.filter(Boolean))];
}

function getItems<T>(data: unknown): T[] {
  if (Array.isArray(data)) return data as T[];
  if (data && typeof data === "object" && Array.isArray((data as { items?: unknown[] }).items)) {
    return (data as { items: T[] }).items;
  }
  return [];
}

async function buscarProdutoPorCodigo(baseUrl: string, token: string, codigo: string): Promise<{ produto: ErpProduto; ean: string } | null> {
  for (const candidato of normalizarEans(codigo)) {
    const fiql = encodeURIComponent(`id==${candidato}`);
    const codAux = await fetchErpJson<{ items?: Array<{ id?: string; produtoId?: number }> }>(
      baseUrl,
      token,
      `/v1/produto/codigos-auxiliares?q=${fiql}&count=5`
    );

    const item = getItems<{ id?: string; produtoId?: number }>(codAux.data).find((aux) => aux?.produtoId);
    if (item?.produtoId) {
      const produto = await fetchErpJson<ErpProduto>(baseUrl, token, `/v1/produto/produtos/${item.produtoId}`);
      if (produto.response.ok && produto.data?.id) {
        return { produto: produto.data, ean: item.id || candidato };
      }
    }
  }

  const consulta = await fetchErpJson<ErpProduto>(
    baseUrl,
    token,
    `/v1/produto/produtos/consulta/${encodeURIComponent(codigo)}`
  );

  if (consulta.response.ok && consulta.data?.id) {
    return { produto: consulta.data, ean: codigo };
  }

  return null;
}

function normalizarPreco(precoVenda?: number, precoOferta?: number): number | undefined {
  if (typeof precoOferta === "number" && precoOferta > 0) return precoOferta;
  if (typeof precoVenda === "number") return precoVenda;
  return undefined;
}

async function buscarPrecos(baseUrl: string, token: string, produtoId: string, lojaId?: number): Promise<PrecosNormalizados> {
  const result = await fetchErpJson<ErpPreco[] | { items?: ErpPreco[] }>(
    baseUrl,
    token,
    `/v1/produto/produtos/${encodeURIComponent(produtoId)}/precos`
  );

  if (!result.response.ok) return {};

  const precos = getItems<ErpPreco>(result.data);
  const selecionado = lojaId
    ? precos.find((preco) => Number(preco.lojaId) === lojaId) || precos[0]
    : precos[0];

  return {
    precoVarejo: normalizarPreco(selecionado?.precoVenda1, selecionado?.precoOferta1),
    precoAtacado:
      normalizarPreco(selecionado?.precoVenda2, selecionado?.precoOferta2) ??
      selecionado?.precoAtacado,
  };
}

async function buscarEstoque(baseUrl: string, token: string, produtoId: string, lojaId?: number): Promise<number | undefined> {
  const fiql = encodeURIComponent(`produtoId==${produtoId}`);
  const result = await fetchErpJson<{ items?: ErpSaldo[] } | ErpSaldo[]>(
    baseUrl,
    token,
    `/v1/estoque/saldos?q=${fiql}&count=100`
  );

  if (!result.response.ok) return undefined;

  const saldos = getItems<ErpSaldo>(result.data);
  const selecionado = lojaId
    ? saldos.find((saldo) => Number(saldo.lojaId) === lojaId) || saldos[0]
    : saldos[0];

  return selecionado?.saldo ?? selecionado?.saldoEstoque ?? selecionado?.estoque;
}

async function buscarSecao(baseUrl: string, token: string, secaoId?: number): Promise<string | undefined> {
  if (!secaoId) return undefined;
  const result = await fetchErpJson<{ descricao?: string }>(baseUrl, token, `/v1/produto/secoes/${secaoId}`);
  return result.response.ok ? result.data?.descricao : undefined;
}

async function montarProduto(baseUrl: string, token: string, codigo: string, lojaId?: number) {
  const encontrado = await buscarProdutoPorCodigo(baseUrl, token, codigo);
  if (!encontrado?.produto?.id) {
    const error = new Error(`Produto nao encontrado para o codigo ${codigo}`);
    (error as Error & { status?: number }).status = 404;
    throw error;
  }

  const produtoId = String(encontrado.produto.id);
  const [precos, estoque, secao] = await Promise.all([
    buscarPrecos(baseUrl, token, produtoId, lojaId).catch((): PrecosNormalizados => ({})),
    buscarEstoque(baseUrl, token, produtoId, lojaId).catch(() => undefined),
    buscarSecao(baseUrl, token, encontrado.produto.secaoId).catch(() => undefined),
  ]);

  return {
    id: produtoId,
    ean: encontrado.ean,
    descricao:
      encontrado.produto.descricao ||
      encontrado.produto.descricaoReduzida ||
      encontrado.produto.codigoInterno ||
      "(sem descricao)",
    codigoInterno: encontrado.produto.codigoInterno,
    secao: encontrado.produto.secao?.descricao || secao,
    grupo: encontrado.produto.grupo?.descricao,
    precoVarejo: precos.precoVarejo,
    precoAtacado: precos.precoAtacado,
    estoque,
  };
}

export default async function handler(req: any, res: any) {
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

  try {
    const token = await getAccessToken(empresa, baseUrl);
    const product = await montarProduto(baseUrl, token, codigo, Number.isFinite(lojaId) ? lojaId : undefined);
    return res.status(200).json({ product, empresa, lojaId: Number.isFinite(lojaId) ? lojaId : null });
  } catch (error) {
    const status = (error as Error & { status?: number }).status || 500;
    const message = error instanceof Error ? error.message : "Erro desconhecido";
    return res.status(status).json({ error: message, empresa });
  }
}
