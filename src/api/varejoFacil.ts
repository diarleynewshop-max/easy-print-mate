import { Product, VFConfig } from "@/types/label";

/**
 * Camada de integração com a API do Varejo Fácil.
 * Endpoints utilizados (consulta apenas, nunca escrita):
 *  - /v1/produto/codigos-auxiliares?codigo={ean}
 *  - /v1/produto/produtos/{produtoId}
 *  - /v1/produto/produtos/{produtoId}/precos
 *  - /v1/estoque/saldos?produtoId={id}&lojaId={loja}
 */

export class VFError extends Error {
  status?: number;
  constructor(msg: string, status?: number) {
    super(msg);
    this.status = status;
  }
}

function buildHeaders(cfg: VFConfig): HeadersInit {
  const h: Record<string, string> = { "Content-Type": "application/json", Accept: "application/json" };
  if (cfg.token) h["Authorization"] = cfg.token.startsWith("Bearer ") ? cfg.token : `Bearer ${cfg.token}`;
  return h;
}

async function vfFetch<T>(cfg: VFConfig, path: string, signal?: AbortSignal): Promise<T> {
  if (!cfg.baseUrl) throw new VFError("URL base do ERP não configurada");
  const base = cfg.baseUrl.replace(/\/+$/, "");
  const url = `${base}${path.startsWith("/") ? "" : "/"}${path}`;
  let res: Response;
  try {
    res = await fetch(url, { headers: buildHeaders(cfg), signal });
  } catch (e: any) {
    throw new VFError(`Falha de conexão com o ERP: ${e?.message || e}`);
  }
  if (res.status === 401) throw new VFError("Não autorizado (401). Verifique token/credenciais.", 401);
  if (res.status === 404) throw new VFError("Recurso não encontrado (404).", 404);
  if (!res.ok) throw new VFError(`Erro ${res.status} do ERP`, res.status);
  return res.json() as Promise<T>;
}

interface AuxResp {
  items?: Array<{ produtoId: number; codigo: string }>;
  total?: number;
}
interface ProdutoResp {
  id: number;
  descricao?: string;
  descricaoReduzida?: string;
  codigoInterno?: string;
  secaoId?: number;
  grupoId?: number;
  secao?: { descricao?: string };
  grupo?: { descricao?: string };
}
interface PrecoItem {
  precoVenda1?: number;
  precoAtacado?: number;
  precoVenda2?: number;
}
interface PrecoResp {
  items?: PrecoItem[];
}
interface SaldoResp {
  items?: Array<{ saldoEstoque?: number; estoque?: number }>;
}

export async function fetchProductByEan(cfg: VFConfig, ean: string, signal?: AbortSignal): Promise<Product> {
  const code = ean.trim();
  if (!code) throw new VFError("Código vazio");

  // 1) Resolver produtoId pelo código auxiliar (EAN)
  let produtoId: number | undefined;
  try {
    const aux = await vfFetch<AuxResp>(cfg, `/v1/produto/codigos-auxiliares?codigo=${encodeURIComponent(code)}`, signal);
    produtoId = aux.items?.[0]?.produtoId;
  } catch (e) {
    if ((e as VFError).status !== 404) throw e;
  }

  // Fallback: tentar produto direto (caso o código já seja o id interno)
  if (!produtoId && /^\d+$/.test(code)) {
    try {
      const p = await vfFetch<ProdutoResp>(cfg, `/v1/produto/produtos/${code}`, signal);
      produtoId = p.id;
    } catch {
      /* ignora e cai para erro abaixo */
    }
  }

  if (!produtoId) throw new VFError(`Produto não encontrado para o código ${code}`, 404);

  // 2) Detalhes
  const prod = await vfFetch<ProdutoResp>(cfg, `/v1/produto/produtos/${produtoId}`, signal);

  // 3) Preços
  let precoVarejo: number | undefined;
  let precoAtacado: number | undefined;
  try {
    const precos = await vfFetch<PrecoResp>(cfg, `/v1/produto/produtos/${produtoId}/precos`, signal);
    const it = precos.items?.[0];
    precoVarejo = it?.precoVenda1;
    precoAtacado = it?.precoAtacado ?? it?.precoVenda2;
  } catch {
    /* opcional */
  }

  // 4) Estoque
  let estoque: number | undefined;
  try {
    const lojaQs = cfg.loja ? `&lojaId=${encodeURIComponent(cfg.loja)}` : "";
    const saldos = await vfFetch<SaldoResp>(cfg, `/v1/estoque/saldos?produtoId=${produtoId}${lojaQs}`, signal);
    const it = saldos.items?.[0];
    estoque = it?.saldoEstoque ?? it?.estoque;
  } catch {
    /* opcional */
  }

  return {
    id: produtoId,
    ean: code,
    descricao: prod.descricao || prod.descricaoReduzida || "(sem descrição)",
    codigoInterno: prod.codigoInterno,
    secao: prod.secao?.descricao,
    grupo: prod.grupo?.descricao,
    precoVarejo,
    precoAtacado,
    estoque,
  };
}
