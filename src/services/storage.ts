import { LabelTemplate, VFConfig, HistoryEntry, PrintEvent } from "@/types/label";
import { elginPreset, ELGIN_PRESET_ID, anelPreset, ANEL_PRESET_ID, amarelaPreset, AMARELA_PRESET_ID } from "./presets";

const K = {
  templates: "vf_label_templates",
  activeTemplate: "vf_label_active_template",
  config: "vf_api_config",
  history: "vf_history",
  prints: "vf_print_events",
  names: "vf_print_names",
  aliases: "vf_code_aliases",
};

const memoryStore: Record<string, string> = {};
let localLoaded = false;

function mergePrintEvents(current: PrintEvent[], archived: PrintEvent[]) {
  const map = new Map<string, PrintEvent>();
  for (const event of [...current, ...archived]) {
    if (!event?.ean || !event.at) continue;
    map.set(`${event.at}:${event.ean}:${event.quantidade}:${event.status || ""}`, event);
  }
  return Array.from(map.values()).sort((a, b) => b.at - a.at);
}

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

function normalizeCode(value: string) {
  return value.trim().toUpperCase();
}

export async function loadLocalData() {
  if (!window.easyPrint?.isDesktop || localLoaded) return;
  await Promise.all(
    Object.values(K).map(async (key) => {
      const value = await window.easyPrint!.getItem(key);
      if (typeof value === "string") memoryStore[key] = value;
    }),
  );
  const archivedPrints = await window.easyPrint.readPrintEvents().catch(() => []);
  if (archivedPrints.length) {
    let currentPrints: PrintEvent[] = [];
    try {
      currentPrints = memoryStore[K.prints] ? JSON.parse(memoryStore[K.prints]) as PrintEvent[] : [];
    } catch {
      currentPrints = [];
    }
    memoryStore[K.prints] = JSON.stringify(mergePrintEvents(currentPrints, archivedPrints));
  }
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
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<VFConfig> & { empresa?: string };
        return {
          companyName: parsed.companyName || parsed.empresa || "",
          baseUrl: parsed.baseUrl || "",
          username: parsed.username || "",
          password: parsed.password || "",
          token: parsed.token || "",
          loja: parsed.loja || "",
          empresa: parsed.empresa,
          labelPrinterName: parsed.labelPrinterName || "",
          a4PrinterName: parsed.a4PrinterName || "",
        };
      }
    } catch {
      // Ignore errors reading local storage config
    }
    return { companyName: "", baseUrl: "", username: "", password: "", token: "", loja: "", labelPrinterName: "", a4PrinterName: "" };
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
    if (window.easyPrint?.isDesktop) {
      void window.easyPrint.appendPrintEvent(e);
    }
  },
  clearPrintEvents() {
    removeLocal(K.prints);
  },
  getNames(): string[] {
    try {
      const raw = readLocal(K.names);
      const list = raw ? (JSON.parse(raw) as unknown) : [];
      return Array.isArray(list) ? list.filter((n): n is string => typeof n === "string" && n.trim().length > 0) : [];
    } catch {
      return [];
    }
  },
  saveNames(names: string[]) {
    const unique = Array.from(new Set(names.map((n) => n.trim()).filter(Boolean)));
    writeLocal(K.names, JSON.stringify(unique));
  },
  addName(name: string) {
    const clean = name.trim();
    if (!clean) return storage.getNames();
    const list = storage.getNames();
    // Evita duplicado ignorando maiusculas/minusculas, mantendo o mais recente no topo
    const filtered = list.filter((n) => n.toLowerCase() !== clean.toLowerCase());
    const next = [clean, ...filtered].slice(0, 50);
    storage.saveNames(next);
    return next;
  },
  removeName(name: string) {
    const next = storage.getNames().filter((n) => n.toLowerCase() !== name.trim().toLowerCase());
    storage.saveNames(next);
    return next;
  },
  getCodeAliases(): Record<string, string> {
    try {
      const raw = readLocal(K.aliases);
      const parsed = raw ? JSON.parse(raw) as Record<string, unknown> : {};
      const aliases: Record<string, string> = {};
      for (const [source, target] of Object.entries(parsed)) {
        const cleanSource = normalizeCode(source);
        const cleanTarget = typeof target === "string" ? target.trim() : "";
        if (cleanSource && cleanTarget) aliases[cleanSource] = cleanTarget;
      }
      return aliases;
    } catch {
      return {};
    }
  },
  resolveCodeAlias(code: string): string | null {
    const key = normalizeCode(code);
    if (!key) return null;
    return storage.getCodeAliases()[key] || null;
  },
  saveCodeAlias(sourceCode: string, targetCode: string) {
    const source = normalizeCode(sourceCode);
    const target = targetCode.trim();
    if (!source || !target) return;
    const aliases = storage.getCodeAliases();
    aliases[source] = target;
    writeLocal(K.aliases, JSON.stringify(aliases));
  },
  removeCodeAlias(sourceCode: string) {
    const source = normalizeCode(sourceCode);
    if (!source) return;
    const aliases = storage.getCodeAliases();
    delete aliases[source];
    writeLocal(K.aliases, JSON.stringify(aliases));
  },
};

export function ensureDefaultTemplates(templates: LabelTemplate[]): LabelTemplate[] {
  let result = [...templates];
  if (!result.some((t) => t.id === ELGIN_PRESET_ID)) {
    result = [elginPreset(), ...result];
  } else {
    // Fix broken ZB+RTL settings introduced in v1.3.1
    result = result.map((t) =>
      t.id === ELGIN_PRESET_ID && (t.printRotation === 180 || t.columnOrder === "rtl")
        ? { ...t, printRotation: 0, columnOrder: "ltr" }
        : t
    );
  }
  if (!result.some((t) => t.id === ANEL_PRESET_ID)) {
    result = [...result, anelPreset()];
  } else {
    // Corrige somente a assinatura conhecida do preset legado de anel.
    // Margens e medidas sao configuraveis pelo operador; comparar qualquer
    // diferenca com o preset atual apagaria uma calibracao salva no editor.
    result = result.map((t) => {
      if (t.id !== ANEL_PRESET_ID) return t;
      const preset = anelPreset();
      const isLegacyCalibration =
        Math.abs(t.widthMm - 55) <= 0.01 &&
        Math.abs(t.heightMm - 10) <= 0.01 &&
        Math.abs(t.marginLeftMm ?? 0) <= 0.01 &&
        Math.abs(t.marginTopMm ?? 0) <= 0.01 &&
        Math.abs(t.marginBottomMm ?? 0) <= 0.01;

      return isLegacyCalibration
        ? { ...preset, preferredPrinterName: t.preferredPrinterName || preset.preferredPrinterName }
        : t;
    });
  }
  if (!result.some((t) => t.id === AMARELA_PRESET_ID)) result = [...result, amarelaPreset()];
  return result;
}

export function restoreElginPreset(templates: LabelTemplate[]): LabelTemplate[] {
  const PRESET_IDS = [ELGIN_PRESET_ID, ANEL_PRESET_ID, AMARELA_PRESET_ID];
  const withoutPresets = templates.filter((t) => !PRESET_IDS.includes(t.id));
  return [elginPreset(), anelPreset(), amarelaPreset(), ...withoutPresets];
}

export const defaultTemplates = (): LabelTemplate[] => [
  elginPreset(),
  anelPreset(),
  amarelaPreset(),
];
