import { Product, VFConfig } from "@/types/label";

export class VFError extends Error {
  status?: number;

  constructor(msg: string, status?: number) {
    super(msg);
    this.status = status;
  }
}

type ProductResponse = {
  product?: Product;
  error?: string;
  debug?: unknown;
};

export async function fetchProductByEan(cfg: VFConfig, ean: string, signal?: AbortSignal): Promise<Product> {
  const code = ean.trim();
  if (!code) throw new VFError("Codigo vazio");

  const params = new URLSearchParams({ codigo: code });
  if (cfg.empresa) params.set("empresa", cfg.empresa);
  if (cfg.loja) params.set("loja", cfg.loja);

  let response: Response;
  try {
    response = await fetch(`/api/varejo-facil?${params.toString()}`, {
      headers: { Accept: "application/json" },
      signal,
    });
  } catch (error) {
    throw new VFError(error instanceof Error ? error.message : "Falha de conexao com a API");
  }

  const contentType = response.headers.get("content-type") || "";
  const data = contentType.includes("application/json")
    ? ((await response.json().catch(() => ({}))) as ProductResponse)
    : ({ error: await response.text().catch(() => "") } as ProductResponse);

  if (data.debug) {
    console.info("[Varejo Facil][debug]", data.debug);
  }

  if (response.status === 401) {
    throw new VFError("ERP nao autorizado. Verifique token, usuario ou senha na Vercel.", 401);
  }

  if (response.status === 404) {
    throw new VFError(data.error || `Produto nao encontrado para o codigo ${code}`, 404);
  }

  if (!response.ok) {
    console.warn("[Varejo Facil][erro]", {
      status: response.status,
      error: data.error,
      debug: data.debug,
    });
    throw new VFError(data.error || `Erro ${response.status} ao consultar ERP`, response.status);
  }

  if (!data.product) {
    throw new VFError("API nao retornou produto valido");
  }

  return data.product;
}
