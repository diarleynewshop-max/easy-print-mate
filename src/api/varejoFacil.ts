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

type ProductSearchResponse = {
  items?: Product[];
  error?: string;
  debug?: unknown;
};

function bridgeError(error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message : fallback;
  const jsonStart = message.indexOf("{");
  const jsonEnd = message.lastIndexOf("}");
  const jsonMessage = jsonStart >= 0 && jsonEnd > jsonStart ? message.slice(jsonStart, jsonEnd + 1) : message;
  try {
    const parsed = JSON.parse(jsonMessage) as { message?: string; status?: number; debug?: unknown };
    return new VFError(parsed.message || fallback, parsed.status, parsed.debug);
  } catch {
    return new VFError(message);
  }
}

export async function fetchProductByEan(cfg: VFConfig, ean: string, signal?: AbortSignal): Promise<Product> {
  const code = ean.trim();
  if (!code) throw new VFError("Codigo vazio");

  if (window.easyPrint?.isDesktop) {
    try {
      const data = await window.easyPrint.fetchProductByEan(cfg, code);
      if (data.debug) console.info("[Varejo Facil][debug]", data.debug);
      return data.product;
    } catch (error) {
      throw bridgeError(error, "Erro ao consultar ERP");
    }
  }

  const params = new URLSearchParams({ codigo: code });
  if (cfg.companyName || cfg.empresa) params.set("empresa", cfg.companyName || cfg.empresa || "");
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

export async function fetchProductById(cfg: VFConfig, produtoId: string, signal?: AbortSignal): Promise<Product> {
  const id = produtoId.trim();
  if (!id) throw new VFError("ID do produto vazio");

  if (window.easyPrint?.isDesktop) {
    try {
      const data = await window.easyPrint.fetchProductById(cfg, id);
      if (data.debug) console.info("[Varejo Facil][debug]", data.debug);
      return data.product;
    } catch (error) {
      throw bridgeError(error, "Erro ao consultar ERP");
    }
  }

  const params = new URLSearchParams({ produtoId: id });
  if (cfg.companyName || cfg.empresa) params.set("empresa", cfg.companyName || cfg.empresa || "");
  if (cfg.loja) params.set("loja", cfg.loja);

  const response = await fetch(`/api/varejo-facil?${params.toString()}`, {
    headers: { Accept: "application/json" },
    signal,
  });
  const data = (await response.json().catch(() => ({}))) as ProductResponse;
  if (!response.ok || !data.product) {
    throw new VFError(data.error || `Produto nao encontrado para o ID ${id}`, response.status, data.debug);
  }
  return data.product;
}

export async function searchProducts(cfg: VFConfig, query: string, limit = 20, signal?: AbortSignal): Promise<Product[]> {
  const term = query.trim();
  if (!term) return [];

  if (window.easyPrint?.isDesktop) {
    try {
      const data = await window.easyPrint.searchProducts(cfg, term, limit);
      if (data.debug) console.info("[Varejo Facil][debug]", data.debug);
      return data.items || [];
    } catch (error) {
      throw bridgeError(error, "Erro ao pesquisar ERP");
    }
  }

  const params = new URLSearchParams({ search: term, limit: String(limit) });
  if (cfg.companyName || cfg.empresa) params.set("empresa", cfg.companyName || cfg.empresa || "");
  if (cfg.loja) params.set("loja", cfg.loja);

  const response = await fetch(`/api/varejo-facil?${params.toString()}`, {
    headers: { Accept: "application/json" },
    signal,
  });
  const data = (await response.json().catch(() => ({}))) as ProductSearchResponse;
  if (!response.ok) {
    throw new VFError(data.error || `Erro ${response.status} ao pesquisar ERP`, response.status, data.debug);
  }
  return data.items || [];
}
