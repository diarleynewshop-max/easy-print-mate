import { LabelTemplate, VFConfig, HistoryEntry, PrintEvent } from "@/types/label";
import { elginPreset, ELGIN_PRESET_ID } from "./presets";

const K = {
  templates: "vf_label_templates",
  activeTemplate: "vf_label_active_template",
  config: "vf_api_config",
  history: "vf_history",
  prints: "vf_print_events",
};

const memoryStore: Record<string, string> = {};
let localLoaded = false;

function readLocal(key: string) {
  if (window.easyPrint?.isDesktop) return memoryStore[key] ?? null;
  return localStorage.getItem(key);
}

function writeLocal(key: string, value: string) {
  if (window.easyPrint?.isDesktop) {
    memoryStore[key] = value;
    void window.easyPrint.setItem(key, value);
    return;
  }
  localStorage.setItem(key, value);
}

function removeLocal(key: string) {
  if (window.easyPrint?.isDesktop) {
    delete memoryStore[key];
    void window.easyPrint.removeItem(key);
    return;
  }
  localStorage.removeItem(key);
}

export async function loadLocalData() {
  if (!window.easyPrint?.isDesktop || localLoaded) return;
  await Promise.all(
    Object.values(K).map(async (key) => {
      const value = await window.easyPrint!.getItem(key);
      if (value != null) memoryStore[key] = value;
    }),
  );
  localLoaded = true;
}

export const storage = {
  getTemplates(): LabelTemplate[] {
    try {
      const raw = readLocal(K.templates);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  },
  saveTemplates(t: LabelTemplate[]) {
    writeLocal(K.templates, JSON.stringify(t));
  },
  getActiveTemplateId(): string | null {
    return readLocal(K.activeTemplate);
  },
  setActiveTemplateId(id: string) {
    writeLocal(K.activeTemplate, id);
  },
  getConfig(): VFConfig {
    try {
      const raw = readLocal(K.config);
      if (raw) return JSON.parse(raw);
    } catch {}
    return { baseUrl: "", token: "", empresa: "NEWSHOP", loja: "" };
  },
  saveConfig(cfg: VFConfig) {
    writeLocal(K.config, JSON.stringify(cfg));
  },
  getHistory(): HistoryEntry[] {
    try {
      const raw = readLocal(K.history);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  },
  pushHistory(e: HistoryEntry) {
    const list = storage.getHistory().filter((x) => x.ean !== e.ean);
    list.unshift(e);
    writeLocal(K.history, JSON.stringify(list.slice(0, 30)));
  },
  clearHistory() {
    removeLocal(K.history);
  },
  getPrintEvents(): PrintEvent[] {
    try {
      const raw = readLocal(K.prints);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  },
  pushPrintEvent(e: PrintEvent) {
    const list = storage.getPrintEvents();
    list.unshift(e);
    writeLocal(K.prints, JSON.stringify(list.slice(0, 5000)));
  },
  clearPrintEvents() {
    removeLocal(K.prints);
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
