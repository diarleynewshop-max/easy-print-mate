import { LabelTemplate, VFConfig, HistoryEntry, PrintEvent } from "@/types/label";

const K = {
  templates: "vf_label_templates",
  activeTemplate: "vf_label_active_template",
  config: "vf_api_config",
  history: "vf_history",
  prints: "vf_print_events",
};

export const storage = {
  getTemplates(): LabelTemplate[] {
    try {
      const raw = localStorage.getItem(K.templates);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  },
  saveTemplates(t: LabelTemplate[]) {
    localStorage.setItem(K.templates, JSON.stringify(t));
  },
  getActiveTemplateId(): string | null {
    return localStorage.getItem(K.activeTemplate);
  },
  setActiveTemplateId(id: string) {
    localStorage.setItem(K.activeTemplate, id);
  },
  getConfig(): VFConfig {
    try {
      const raw = localStorage.getItem(K.config);
      if (raw) return JSON.parse(raw);
    } catch {}
    return { baseUrl: "", token: "", empresa: "NEWSHOP", loja: "" };
  },
  saveConfig(cfg: VFConfig) {
    localStorage.setItem(K.config, JSON.stringify(cfg));
  },
  getHistory(): HistoryEntry[] {
    try {
      const raw = localStorage.getItem(K.history);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  },
  pushHistory(e: HistoryEntry) {
    const list = storage.getHistory().filter((x) => x.ean !== e.ean);
    list.unshift(e);
    localStorage.setItem(K.history, JSON.stringify(list.slice(0, 30)));
  },
  clearHistory() {
    localStorage.removeItem(K.history);
  },
  getPrintEvents(): PrintEvent[] {
    try {
      const raw = localStorage.getItem(K.prints);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  },
  pushPrintEvent(e: PrintEvent) {
    const list = storage.getPrintEvents();
    list.unshift(e);
    localStorage.setItem(K.prints, JSON.stringify(list.slice(0, 5000)));
  },
  clearPrintEvents() {
    localStorage.removeItem(K.prints);
  },
};

export function ensureDefaultTemplates(templates: LabelTemplate[]) {
  const defaults = defaultTemplates();
  const defaultsById = new Map(defaults.map((template) => [template.id, template]));
  const merged = templates.map((template) =>
    template.id === "etiqueta-prn-3col-28x15" ? defaultsById.get(template.id) || template : template,
  );
  const existingIds = new Set(merged.map((template) => template.id));
  const missingDefaults = defaults.filter((template) => !existingIds.has(template.id));
  return [...missingDefaults, ...merged];
}

export const defaultTemplates = (): LabelTemplate[] => [
  {
    id: "etiqueta-prn-3col-28x15",
    name: "PRN 3 COLUNAS 28x15",
    widthMm: 28,
    heightMm: 15,
    marginMm: 0,
    marginLeftMm: 0,
    marginRightMm: 0,
    marginTopMm: 0,
    marginBottomMm: 0,
    columns: 3,
    columnGapMm: 9,
    rowGapMm: 0,
    fontFamily: "Arial, sans-serif",
    fields: [
      { key: "descricao", visible: true, x: 1, y: 1, widthMm: 26, heightMm: 3, fontSize: 4, bold: true },
      { key: "barcode", visible: true, x: 1, y: 6, widthMm: 26, heightMm: 6, fontSize: 5 },
      { key: "codigoInterno", visible: false, x: 1, y: 1, widthMm: 6, heightMm: 3, fontSize: 4 },
      { key: "precoVarejo", visible: false, x: 20, y: 1, widthMm: 8, heightMm: 3, fontSize: 4, bold: true, label: "" },
      { key: "ean", visible: false, x: 1, y: 11, widthMm: 26, heightMm: 3, fontSize: 4 },
      { key: "precoAtacado", visible: false, x: 1, y: 11, widthMm: 20, heightMm: 3, fontSize: 4, label: "AT R$" },
      { key: "secao", visible: false, x: 1, y: 11, widthMm: 20, heightMm: 3, fontSize: 4 },
      { key: "estoque", visible: false, x: 21, y: 11, widthMm: 7, heightMm: 3, fontSize: 4 },
    ],
  },
  {
    id: "etiqueta-prn-102x21",
    name: "PRN 102x21 - PADRAO",
    widthMm: 102,
    heightMm: 21,
    marginMm: 0,
    marginLeftMm: 0,
    marginRightMm: 0,
    marginTopMm: 0,
    marginBottomMm: 0,
    columns: 1,
    columnGapMm: 0,
    rowGapMm: 0,
    fontFamily: "Arial, sans-serif",
    fields: [
      { key: "descricao", visible: true, x: 3, y: 4.875, widthMm: 50, heightMm: 4, fontSize: 6, bold: true },
      { key: "precoVarejo", visible: true, x: 19.625, y: 4.25, widthMm: 30, heightMm: 4, fontSize: 6, bold: true, label: "R$" },
      { key: "barcode", visible: true, x: 5, y: 10.375, widthMm: 48, heightMm: 5.5, fontSize: 5 },
      { key: "ean", visible: false, x: 5, y: 16, widthMm: 48, heightMm: 3, fontSize: 5 },
      { key: "precoAtacado", visible: false, x: 50, y: 10, widthMm: 30, heightMm: 4, fontSize: 6, label: "AT R$" },
      { key: "secao", visible: false, x: 3, y: 1, widthMm: 30, heightMm: 3, fontSize: 5 },
      { key: "estoque", visible: false, x: 75, y: 4, widthMm: 15, heightMm: 3, fontSize: 5 },
      { key: "codigoInterno", visible: false, x: 3, y: 1, widthMm: 18, heightMm: 3, fontSize: 5 },
    ],
  },
  {
    id: "etiqueta-branca-28x15",
    name: "ETIQUETA BRANCA 28x15",
    widthMm: 28,
    heightMm: 15,
    marginMm: 1,
    marginLeftMm: 0,
    marginRightMm: 0,
    marginTopMm: 0,
    marginBottomMm: 0,
    columns: 1,
    columnGapMm: 2,
    rowGapMm: 0,
    fontFamily: "Arial, sans-serif",
    fields: [
      { key: "descricao", visible: true, x: 1, y: 1, widthMm: 26, heightMm: 4, fontSize: 5, bold: true },
      { key: "precoVarejo", visible: true, x: 1, y: 5, widthMm: 16, heightMm: 5, fontSize: 9, bold: true, label: "R$" },
      { key: "barcode", visible: true, x: 1, y: 10, widthMm: 26, heightMm: 4, fontSize: 5 },
      { key: "ean", visible: false, x: 1, y: 10, widthMm: 20, heightMm: 3, fontSize: 4 },
      { key: "precoAtacado", visible: false, x: 1, y: 8, widthMm: 20, heightMm: 3, fontSize: 4, label: "AT R$" },
      { key: "secao", visible: false, x: 1, y: 1, widthMm: 20, heightMm: 3, fontSize: 4 },
      { key: "estoque", visible: false, x: 20, y: 5, widthMm: 7, heightMm: 3, fontSize: 4 },
      { key: "codigoInterno", visible: false, x: 1, y: 11, widthMm: 12, heightMm: 3, fontSize: 4 },
    ],
  },
  {
    id: "etiqueta-amarela-105x28",
    name: "ETIQUETA AMARELA 105x28",
    widthMm: 105,
    heightMm: 28,
    marginMm: 2,
    marginLeftMm: 0,
    marginRightMm: 0,
    marginTopMm: 0,
    marginBottomMm: 0,
    columns: 1,
    columnGapMm: 2,
    rowGapMm: 0,
    fontFamily: "Arial, sans-serif",
    fields: [
      { key: "descricao", visible: true, x: 3, y: 3, widthMm: 65, heightMm: 7, fontSize: 10, bold: true },
      { key: "precoVarejo", visible: true, x: 3, y: 11, widthMm: 42, heightMm: 13, fontSize: 24, bold: true, label: "R$" },
      { key: "precoAtacado", visible: true, x: 50, y: 12, widthMm: 36, heightMm: 6, fontSize: 8, label: "AT R$" },
      { key: "ean", visible: true, x: 50, y: 20, widthMm: 36, heightMm: 4, fontSize: 7 },
      { key: "barcode", visible: true, x: 74, y: 4, widthMm: 28, heightMm: 16, fontSize: 7 },
      { key: "secao", visible: false, x: 3, y: 22, widthMm: 35, heightMm: 4, fontSize: 6 },
      { key: "estoque", visible: false, x: 90, y: 22, widthMm: 12, heightMm: 4, fontSize: 6 },
      { key: "codigoInterno", visible: false, x: 50, y: 3, widthMm: 20, heightMm: 4, fontSize: 6, label: "Cod:" },
    ],
  },
  {
    id: "anel-56x12",
    name: "ANEL 56x12",
    widthMm: 56,
    heightMm: 12,
    marginMm: 1,
    marginLeftMm: 0,
    marginRightMm: 0,
    marginTopMm: 0,
    marginBottomMm: 0,
    columns: 1,
    columnGapMm: 2,
    rowGapMm: 0,
    fontFamily: "Arial, sans-serif",
    fields: [
      { key: "descricao", visible: true, x: 1, y: 1, widthMm: 38, heightMm: 4, fontSize: 6, bold: true },
      { key: "precoVarejo", visible: true, x: 40, y: 1, widthMm: 15, heightMm: 5, fontSize: 8, bold: true, label: "R$" },
      { key: "barcode", visible: true, x: 1, y: 6, widthMm: 54, heightMm: 5, fontSize: 5 },
      { key: "ean", visible: false, x: 1, y: 8, widthMm: 30, heightMm: 3, fontSize: 4 },
      { key: "precoAtacado", visible: false, x: 38, y: 6, widthMm: 17, heightMm: 3, fontSize: 4, label: "AT R$" },
      { key: "secao", visible: false, x: 1, y: 1, widthMm: 20, heightMm: 3, fontSize: 4 },
      { key: "estoque", visible: false, x: 48, y: 8, widthMm: 7, heightMm: 3, fontSize: 4 },
      { key: "codigoInterno", visible: false, x: 1, y: 8, widthMm: 15, heightMm: 3, fontSize: 4 },
    ],
  },
];
