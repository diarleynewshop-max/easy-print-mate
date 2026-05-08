import { LabelTemplate, VFConfig, HistoryEntry, PrintEvent } from "@/types/label";
import { elginPreset, ELGIN_PRESET_ID } from "./presets";

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
  return defaultTemplates();
}

export function restoreElginPreset(templates: LabelTemplate[]): LabelTemplate[] {
  const fresh = elginPreset();
  return [fresh];
}

export const defaultTemplates = (): LabelTemplate[] => [
  elginPreset(),
];
