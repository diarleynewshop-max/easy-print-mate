import { Product, VFConfig } from "@/types/label";

export class VFError extends Error {
  status?: number;
  debug?: unknown;

  constructor(msg: string, status?: number, debug?: unknown) {
    super(msg);
    this.status = status;
    this.debug = debug;
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

  if (window.easyPrint?.isDesktop) {
    try {
      const data = await window.easyPrint.fetchProductByEan(cfg, code);
      if (data.debug) console.info("[Varejo Facil][debug]", data.debug);
      return data.product;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Falha de conexao com o ERP";
      try {
        const parsed = JSON.parse(message) as { message?: string; status?: number; debug?: unknown };
        return Promise.reject(new VFError(parsed.message || "Erro ao consultar ERP", parsed.status, parsed.debug));
      } catch {
        throw new VFError(message);
      }
    }
  }

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
    throw new VFError("ERP nao autorizado. Verifique token, usuario ou senha.", 401, data.debug);
  }

  if (response.status === 404) {
    throw new VFError(data.error || `Produto nao encontrado para o codigo ${code}`, 404, data.debug);
  }

  if (!response.ok) {
    console.warn("[Varejo Facil][erro]", {
      status: response.status,
      error: data.error,
      debug: data.debug,
    });
    throw new VFError(data.error || `Erro ${response.status} ao consultar ERP`, response.status, data.debug);
  }

  if (!data.product) {
    throw new VFError("API nao retornou produto valido", undefined, data.debug);
  }

  return data.product;
}
