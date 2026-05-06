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
    return { baseUrl: "", token: "", empresa: "", loja: "" };
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

export const defaultTemplates = (): LabelTemplate[] => [
  {
    id: "preco-simples",
    name: "Etiqueta Preço Simples 40x30",
    widthMm: 40,
    heightMm: 30,
    marginMm: 2,
    fontFamily: "Arial, sans-serif",
    fields: [
      { key: "descricao", visible: true, x: 2, y: 2, fontSize: 8, bold: true },
      { key: "precoVarejo", visible: true, x: 2, y: 12, fontSize: 18, bold: true, label: "R$" },
      { key: "barcode", visible: true, x: 2, y: 22, fontSize: 8 },
      { key: "ean", visible: false, x: 0, y: 0, fontSize: 6 },
      { key: "precoAtacado", visible: false, x: 0, y: 0, fontSize: 7 },
      { key: "secao", visible: false, x: 0, y: 0, fontSize: 6 },
      { key: "estoque", visible: false, x: 0, y: 0, fontSize: 6 },
      { key: "codigoInterno", visible: false, x: 0, y: 0, fontSize: 6 },
    ],
  },
  {
    id: "gondola",
    name: "Etiqueta Gôndola 60x40",
    widthMm: 60,
    heightMm: 40,
    marginMm: 3,
    fontFamily: "Arial, sans-serif",
    fields: [
      { key: "descricao", visible: true, x: 3, y: 3, fontSize: 10, bold: true },
      { key: "precoVarejo", visible: true, x: 3, y: 14, fontSize: 22, bold: true, label: "R$" },
      { key: "precoAtacado", visible: true, x: 3, y: 28, fontSize: 8, label: "Atacado R$" },
      { key: "ean", visible: true, x: 3, y: 35, fontSize: 7 },
      { key: "barcode", visible: false, x: 0, y: 0, fontSize: 8 },
      { key: "secao", visible: false, x: 0, y: 0, fontSize: 7 },
      { key: "estoque", visible: false, x: 0, y: 0, fontSize: 7 },
      { key: "codigoInterno", visible: false, x: 0, y: 0, fontSize: 7 },
    ],
  },
  {
    id: "estoque",
    name: "Etiqueta Estoque 100x50",
    widthMm: 100,
    heightMm: 50,
    marginMm: 4,
    fontFamily: "Arial, sans-serif",
    fields: [
      { key: "codigoInterno", visible: true, x: 4, y: 4, fontSize: 10, bold: true, label: "Cód:" },
      { key: "descricao", visible: true, x: 4, y: 14, fontSize: 12, bold: true },
      { key: "secao", visible: true, x: 4, y: 28, fontSize: 9, label: "Seção:" },
      { key: "estoque", visible: true, x: 4, y: 38, fontSize: 11, bold: true, label: "Estoque:" },
      { key: "precoVarejo", visible: false, x: 0, y: 0, fontSize: 10 },
      { key: "precoAtacado", visible: false, x: 0, y: 0, fontSize: 9 },
      { key: "ean", visible: false, x: 0, y: 0, fontSize: 7 },
      { key: "barcode", visible: false, x: 0, y: 0, fontSize: 8 },
    ],
  },
];
