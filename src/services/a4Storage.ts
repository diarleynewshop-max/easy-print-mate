import { A4Template } from "@/types/a4";

const K_TEMPLATES = "vf_a4_templates";
const K_ACTIVE = "vf_a4_active_template";

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

export function defaultA4Templates(): A4Template[] {
  return [
    {
      id: "a4-default-1",
      name: "A4 — 1 por folha (cartaz)",
      blocks: 1,
      paddingMm: 15,
      showBorder: false,
      elements: [
        { id: uid(), type: "dynamic", field: "descricao", x: 10, y: 20, widthMm: 180, heightMm: 30, fontSize: 36, bold: true, align: "center" },
        { id: uid(), type: "text", text: "OFERTA", x: 10, y: 60, widthMm: 180, heightMm: 15, fontSize: 22, bold: true, align: "center", color: "#c0392b" },
        { id: uid(), type: "dynamic", field: "precoVarejo", prefix: "R$ ", x: 10, y: 90, widthMm: 180, heightMm: 60, fontSize: 100, bold: true, align: "center", color: "#c0392b" },
        { id: uid(), type: "dynamic", field: "precoAtacado", prefix: "Atacado: R$ ", x: 10, y: 170, widthMm: 180, heightMm: 15, fontSize: 18, align: "center" },
        { id: uid(), type: "barcode", field: undefined, x: 60, y: 200, widthMm: 90, heightMm: 30, fontSize: 10, barcodeFormat: "auto", barcodeDisplayValue: true },
        { id: uid(), type: "dynamic", field: "ean", prefix: "EAN: ", x: 10, y: 245, widthMm: 180, heightMm: 10, fontSize: 11, align: "center" },
      ],
    },
    {
      id: "a4-default-2",
      name: "A4 — 2 por folha",
      blocks: 2,
      paddingMm: 10,
      showBorder: true,
      elements: [
        { id: uid(), type: "dynamic", field: "descricao", x: 5, y: 10, widthMm: 180, heightMm: 18, fontSize: 22, bold: true, align: "center" },
        { id: uid(), type: "dynamic", field: "precoVarejo", prefix: "R$ ", x: 5, y: 40, widthMm: 180, heightMm: 35, fontSize: 60, bold: true, align: "center", color: "#c0392b" },
        { id: uid(), type: "barcode", x: 60, y: 90, widthMm: 80, heightMm: 25, fontSize: 9, barcodeFormat: "auto", barcodeDisplayValue: true },
        { id: uid(), type: "dynamic", field: "ean", x: 5, y: 122, widthMm: 180, heightMm: 8, fontSize: 10, align: "center" },
      ],
    },
    {
      id: "a4-default-4",
      name: "A4 — 4 por folha",
      blocks: 4,
      paddingMm: 8,
      showBorder: true,
      elements: [
        { id: uid(), type: "dynamic", field: "descricao", x: 4, y: 6, widthMm: 90, heightMm: 14, fontSize: 14, bold: true, align: "center" },
        { id: uid(), type: "dynamic", field: "precoVarejo", prefix: "R$ ", x: 4, y: 30, widthMm: 90, heightMm: 30, fontSize: 36, bold: true, align: "center", color: "#c0392b" },
        { id: uid(), type: "barcode", x: 18, y: 70, widthMm: 60, heightMm: 22, fontSize: 8, barcodeFormat: "auto", barcodeDisplayValue: true },
        { id: uid(), type: "dynamic", field: "ean", x: 4, y: 100, widthMm: 90, heightMm: 8, fontSize: 9, align: "center" },
      ],
    },
  ];
}

export const a4Storage = {
  getTemplates(): A4Template[] {
    try {
      const raw = localStorage.getItem(K_TEMPLATES);
      const parsed = raw ? (JSON.parse(raw) as A4Template[]) : [];
      if (!parsed.length) {
        const def = defaultA4Templates();
        localStorage.setItem(K_TEMPLATES, JSON.stringify(def));
        return def;
      }
      return parsed;
    } catch {
      return defaultA4Templates();
    }
  },
  saveTemplates(t: A4Template[]) {
    localStorage.setItem(K_TEMPLATES, JSON.stringify(t));
  },
  getActive(): string | null {
    return localStorage.getItem(K_ACTIVE);
  },
  setActive(id: string) {
    localStorage.setItem(K_ACTIVE, id);
  },
};

export function newA4Template(blocks: 1 | 2 | 4 = 1): A4Template {
  return {
    id: `a4-${Date.now()}`,
    name: `Novo modelo A4 (${blocks}/folha)`,
    blocks,
    paddingMm: 10,
    showBorder: true,
    elements: [],
  };
}
