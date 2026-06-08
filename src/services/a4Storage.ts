import { A4Template } from "@/types/a4";

const K_TEMPLATES = "vf_a4_templates";
const K_ACTIVE = "vf_a4_active_template";

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

export function defaultA4Templates(): A4Template[] {
  return [
    {
      id: "a4-default-cartaz",
      name: "Cartaz A4 — Oferta com Foto",
      rows: 1,
      cols: 1,
      marginTop: 0,
      marginBottom: 0,
      marginLeft: 0,
      marginRight: 0,
      rowGap: 0,
      colGap: 0,
      blocks: 1,
      paddingMm: 5,
      showBorder: false,
      elements: [
        // Fundo/Shape Vermelho no Topo
        { id: uid(), type: "shape", shapeKind: "rect", x: 0, y: 0, widthMm: 210, heightMm: 45, fillColor: "#e60000", strokeWidthMm: 0 },
        { id: uid(), type: "text", text: "OFERTA", x: 10, y: 10, widthMm: 190, heightMm: 25, fontSize: 80, bold: true, align: "center", color: "#ffffff", fontFamily: "Anton" },
        
        // Foto do Produto do ERP
        { id: uid(), type: "dynamic", field: "imageUrl", x: 25, y: 55, widthMm: 160, heightMm: 120, align: "center" },
        
        // Descrição
        { id: uid(), type: "dynamic", field: "descricao", x: 10, y: 185, widthMm: 190, heightMm: 20, fontSize: 32, bold: true, align: "center", fontFamily: "Roboto" },
        
        // Preço
        { id: uid(), type: "dynamic", field: "precoVarejo", prefix: "R$ ", x: 10, y: 215, widthMm: 190, heightMm: 50, fontSize: 110, bold: true, align: "center", color: "#e60000", fontFamily: "Anton" },
        
        // EAN pequeno no rodapé
        { id: uid(), type: "dynamic", field: "ean", prefix: "EAN: ", x: 10, y: 280, widthMm: 190, heightMm: 8, fontSize: 10, align: "center", color: "#666666" },
      ],
    },
    {
      id: "a4-default-1",
      name: "A4 — 1 por folha (Simples)",
      rows: 1,
      cols: 1,
      marginTop: 0,
      marginBottom: 0,
      marginLeft: 0,
      marginRight: 0,
      rowGap: 0,
      colGap: 0,
      blocks: 1,
      paddingMm: 15,
      showBorder: false,
      elements: [
        { id: uid(), type: "dynamic", field: "descricao", x: 10, y: 20, widthMm: 180, heightMm: 30, fontSize: 36, bold: true, align: "center", fontFamily: "Roboto" },
        { id: uid(), type: "text", text: "OFERTA", x: 10, y: 60, widthMm: 180, heightMm: 15, fontSize: 22, bold: true, align: "center", color: "#c0392b", fontFamily: "Anton" },
        { id: uid(), type: "dynamic", field: "precoVarejo", prefix: "R$ ", x: 10, y: 90, widthMm: 180, heightMm: 60, fontSize: 100, bold: true, align: "center", color: "#c0392b", fontFamily: "Anton" },
        { id: uid(), type: "dynamic", field: "precoAtacado", prefix: "Atacado: R$ ", x: 10, y: 170, widthMm: 180, heightMm: 15, fontSize: 18, align: "center" },
        { id: uid(), type: "barcode", field: undefined, x: 60, y: 200, widthMm: 90, heightMm: 30, fontSize: 10, barcodeFormat: "auto", barcodeDisplayValue: true },
        { id: uid(), type: "dynamic", field: "ean", prefix: "EAN: ", x: 10, y: 245, widthMm: 180, heightMm: 10, fontSize: 11, align: "center" },
      ],
    },
    {
      id: "a4-default-4",
      name: "A4 — 4 por folha (2x2)",
      rows: 2,
      cols: 2,
      marginTop: 10,
      marginBottom: 10,
      marginLeft: 10,
      marginRight: 10,
      rowGap: 5,
      colGap: 5,
      blocks: 4,
      paddingMm: 5,
      showBorder: true,
      elements: [
        { id: uid(), type: "dynamic", field: "descricao", x: 2, y: 5, widthMm: 86, heightMm: 15, fontSize: 18, bold: true, align: "center" },
        { id: uid(), type: "dynamic", field: "precoOriginal", prefix: "De: R$ ", x: 2, y: 22, widthMm: 86, heightMm: 10, fontSize: 14, align: "center", color: "#666666" },
        { id: uid(), type: "dynamic", field: "precoVarejo", prefix: "Por: R$ ", x: 2, y: 32, widthMm: 86, heightMm: 25, fontSize: 48, bold: true, align: "center", color: "#e60000" },
        { id: uid(), type: "barcode", x: 25, y: 100, widthMm: 40, heightMm: 15, fontSize: 8, barcodeFormat: "auto", barcodeDisplayValue: true },
      ],
    },
    {
      id: "a4-default-16",
      name: "A4 — 16 por folha (4x4)",
      rows: 4,
      cols: 4,
      marginTop: 10,
      marginBottom: 10,
      marginLeft: 10,
      marginRight: 10,
      rowGap: 2,
      colGap: 2,
      blocks: 16,
      paddingMm: 2,
      showBorder: true,
      elements: [
        { id: uid(), type: "dynamic", field: "descricao", x: 1, y: 2, widthMm: 43, heightMm: 10, fontSize: 10, bold: true, align: "left" },
        { id: uid(), type: "dynamic", field: "precoVarejo", prefix: "R$ ", x: 1, y: 15, widthMm: 43, heightMm: 15, fontSize: 24, bold: true, align: "center", color: "#e60000" },
        { id: uid(), type: "dynamic", field: "ean", x: 1, y: 32, widthMm: 43, heightMm: 5, fontSize: 7, align: "center" },
      ],
    },
    {
      id: "a4-default-60",
      name: "Pimaco 60 etiquetas (A4)",
      rows: 20,
      cols: 3,
      marginTop: 12,
      marginBottom: 12,
      marginLeft: 7,
      marginRight: 7,
      rowGap: 0,
      colGap: 3,
      blocks: 60,
      paddingMm: 2,
      showBorder: true,
      elements: [
        { id: uid(), type: "dynamic", field: "descricao", x: 1, y: 1, widthMm: 60, heightMm: 4, fontSize: 6, bold: true, align: "left" },
        { id: uid(), type: "dynamic", field: "precoVarejo", prefix: "R$ ", x: 1, y: 8, widthMm: 60, heightMm: 5, fontSize: 10, bold: true, align: "right", color: "#e60000" },
        { id: uid(), type: "barcode", x: 10, y: 4, widthMm: 40, heightMm: 5, fontSize: 5, barcodeFormat: "auto", barcodeDisplayValue: true },
      ],
    },
  ];
}

export const a4Storage = {
  getTemplates(): A4Template[] {
    try {
      const raw = localStorage.getItem(K_TEMPLATES);
      const parsed = raw ? (JSON.parse(raw) as A4Template[]) : [];
      
      // Migração para novo formato se necessário
      const migrated = parsed.map(t => {
        if (t.rows === undefined) {
          const blocks = t.blocks || 1;
          if (blocks === 1) return { ...t, rows: 1, cols: 1, marginTop: 0, marginBottom: 0, marginLeft: 0, marginRight: 0, rowGap: 0, colGap: 0 };
          if (blocks === 2) return { ...t, rows: 2, cols: 1, marginTop: 0, marginBottom: 0, marginLeft: 0, marginRight: 0, rowGap: 0, colGap: 0 };
          if (blocks === 4) return { ...t, rows: 2, cols: 2, marginTop: 0, marginBottom: 0, marginLeft: 0, marginRight: 0, rowGap: 0, colGap: 0 };
          return { ...t, rows: 1, cols: blocks, marginTop: 0, marginBottom: 0, marginLeft: 0, marginRight: 0, rowGap: 0, colGap: 0 };
        }
        return t;
      });

      if (!migrated.length) {
        const def = defaultA4Templates();
        localStorage.setItem(K_TEMPLATES, JSON.stringify(def));
        return def;
      }
      return migrated;
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

export function newA4Template(rows = 1, cols = 1): A4Template {
  return {
    id: `a4-${Date.now()}`,
    name: `Novo modelo A4 (${rows}x${cols})`,
    rows,
    cols,
    marginTop: 10,
    marginBottom: 10,
    marginLeft: 10,
    marginRight: 10,
    rowGap: 0,
    colGap: 0,
    blocks: rows * cols,
    paddingMm: 5,
    showBorder: true,
    elements: [],
  };
}
