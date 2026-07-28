import { useEffect, useMemo, useRef, useState } from "react";
import { Product, LabelTemplate, VFConfig, HistoryEntry, PrintEvent, PrintQueueItem } from "@/types/label";
import { storage, defaultTemplates, ensureDefaultTemplates, restoreElginPreset } from "@/services/storage";
import { ELGIN_PRESET_ID } from "@/services/presets";
import { fetchProductByEan, fetchProductById, searchProducts, VFError } from "@/api/varejoFacil";
import { buildEplBatchPrn, buildEplPrn, buildTestPrn, buildCalibrationPrn, downloadEplPrn } from "@/services/eplService";
import { printService } from "@/services/printService";
import { validateTemplate, computeHorizontalSpacing } from "@/services/labelValidation";
import { usePrintServerStatus } from "@/hooks/usePrintServerStatus";
import { ProductSearch } from "@/components/ProductSearch";
import { LabelPreview } from "@/components/LabelPreview";
import { LabelEditor } from "@/components/LabelEditor";
import { ApiConfig } from "@/components/ApiConfig";
import { Metrics } from "@/components/Metrics";
import { A4Module } from "@/components/A4Module";
import { PromoModule } from "@/components/PromoModule";
import { NamePromptModal } from "@/components/NamePromptModal";
import { useProductDiscovery } from "@/hooks/useProductDiscovery";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";
import {
  Download,
  Printer,
  Tag,
  Settings,
  History,
  Pencil,
  Loader2,
  Trash2,
  BarChart3,
  Wifi,
  WifiOff,
  Crosshair,
  RotateCw,
  TestTube2,
  Plus,
  Minus,
  AlertTriangle,
  CheckCircle2,
  FileText,
  ChevronLeft,
  ChevronRight,
  BadgePercent,
  UserCircle2,
  LogOut,
} from "lucide-react";
import { cn } from "@/lib/utils";

type View = "scan" | "editor" | "config" | "metrics" | "a4" | "promo";

const Index = () => {
  useProductDiscovery();
  const inputRef = useRef<HTMLInputElement>(null);
  const [view, setView] = useState<View>("scan");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [product, setProduct] = useState<Product | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [errorDebug, setErrorDebug] = useState<unknown>(null);
  const [copies, setCopies] = useState(3);
  const [previewTab, setPreviewTab] = useState<"label" | "sheet">("label");
  const [printQueue, setPrintQueue] = useState<PrintQueueItem[]>([]);
  const lastActionRef = useRef<number>(Date.now());
  const lastPrintedRef = useRef<Product | null>(null);
  const [printEvents, setPrintEvents] = useState<PrintEvent[]>(() => storage.getPrintEvents());
  const [scanState, setScanState] = useState<"idle" | "searching" | "found" | "error" | "sent" | "fail">("idle");
  const [printers, setPrinters] = useState<Array<{ name: string; isDefault?: boolean; isOffline?: boolean }>>([]);

  const [config, setConfig] = useState<VFConfig>(() => storage.getConfig());
  const [history, setHistory] = useState<HistoryEntry[]>(() => storage.getHistory());
  const [templates, setTemplates] = useState<LabelTemplate[]>(() => {
    const t = storage.getTemplates();
    const d = t.length ? ensureDefaultTemplates(t) : defaultTemplates();
    storage.saveTemplates(d);
    return d;
  });
  const [activeTemplateId, setActiveTemplateId] = useState<string>(() => {
    return storage.getActiveTemplateId() || ELGIN_PRESET_ID;
  });
  const [searchResults, setSearchResults] = useState<Product[]>([]);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [printName, setPrintName] = useState<string | null>(null);
  const [namePromptOpen, setNamePromptOpen] = useState(false);
  const nameResolveRef = useRef<((name: string | null) => void) | null>(null);

  const activeTemplate = useMemo(
    () => templates.find((t) => t.id === activeTemplateId) || templates[0],
    [templates, activeTemplateId],
  );
  const templateChoices = useMemo(
    () => templates.map((template) => ({ id: template.id, label: template.category || template.name })),
    [templates],
  );
  const printerStatus = usePrintServerStatus(activeTemplate?.preferredPrinterName || config.labelPrinterName, 8000);

  const issues = useMemo(() => validateTemplate(activeTemplate), [activeTemplate]);
  const hasErrors = issues.some((i) => i.level === "error");
  const hasWarnings = issues.some((i) => i.level === "warning");

  const cols = Math.max(1, activeTemplate.columns || 1);
  const horizontalSpacing = computeHorizontalSpacing(activeTemplate);
  const queueTotal = printQueue.reduce((sum, item) => sum + item.quantity, 0);
  const queueRows = Math.ceil(queueTotal / cols);

  useEffect(() => {
    if (view === "scan") {
      const refreshed = storage.getTemplates();
      if (refreshed.length) {
        const next = ensureDefaultTemplates(refreshed);
        storage.saveTemplates(next);
        setTemplates(next);
        const activeId = storage.getActiveTemplateId() || ELGIN_PRESET_ID;
        setActiveTemplateId(activeId);
      }
      focusInput();
    }
  }, [view]);

  useEffect(() => {
    document.title = "Easy Print Mate - Elgin L42PRO";
  }, []);

  useEffect(() => {
    if (!activeTemplate) return;
    storage.setActiveTemplateId(activeTemplate.id);
    if (!activeTemplate.preferredPrinterName) return;
    setConfig((current) => {
      if (current.labelPrinterName === activeTemplate.preferredPrinterName) return current;
      const next = { ...current, labelPrinterName: activeTemplate.preferredPrinterName };
      storage.saveConfig(next);
      return next;
    });
  }, [activeTemplate]);

  useEffect(() => {
    if (!window.easyPrint?.isDesktop) return;
    void window.easyPrint.listPrinters().then((items) => {
      setPrinters(items);
      setConfig((current) => {
        if (current.labelPrinterName) return current;
        const preferred = items.find((item) => item.name === "ELGIN L42PRO FULL")?.name || items.find((item) => item.isDefault)?.name || items[0]?.name || "";
        if (!preferred) return current;
        const next = { ...current, labelPrinterName: preferred };
        storage.saveConfig(next);
        return next;
      });
    }).catch(() => setPrinters([]));
  }, []);

  const focusInput = () => setTimeout(() => inputRef.current?.focus(), 50);

  const pushProductHistory = (p: Product) => {
    const entry: HistoryEntry = { ean: p.ean || p.codigo_barras || String(p.id || ""), descricao: p.descricao, at: Date.now() };
    storage.pushHistory(entry);
    setHistory(storage.getHistory());
  };

  const syncLocalProduct = async (p: Product) => {
    if (!window.easyPrint?.isDesktop) return;
    await window.easyPrint.dbSyncProducts([p]).catch(() => null);
  };

  const loadProductDetails = async (candidate: Product) => {
    const lookupConfig = candidate.empresa ? { ...config, companyName: candidate.empresa, empresa: candidate.empresa } : config;
    const id = candidate.id != null ? String(candidate.id) : "";
    if (id) {
      try {
        return await fetchProductById(lookupConfig, id);
      } catch {
        // Alguns registros locais antigos foram salvos sem o ID real do ERP.
      }
    }

    const lookup = candidate.codigo_barras || candidate.ean || candidate.codigoInterno || "";
    if (!lookup) return candidate;
    return fetchProductByEan(lookupConfig, lookup);
  };

  const applyFoundProduct = async (p: Product) => {
    setProduct(p);
    setScanState("found");
    pushProductHistory(p);
    await syncLocalProduct(p);
  };

  const shouldTryDirectLookup = (query: string) => {
    if (/\s/.test(query)) return false;
    if (/^\d{6,14}$/.test(query.replace(/\D/g, ""))) return true;
    return /^[A-Za-z0-9._-]{3,}$/.test(query);
  };

  const search = async (rawCode?: string) => {
    const query = (rawCode ?? code).trim();
    if (!query) return;
    setLoading(true);
    setScanState("searching");
    setError(null);
    setErrorDebug(null);
    setProduct(null);
    setSearchResults([]);

    try {
      let lastLookupError: unknown = null;
      const locals = window.easyPrint?.isDesktop ? await window.easyPrint.dbSearchProducts(query) : [];

      if (locals.length === 1) {
        const p = await loadProductDetails(locals[0]);
        await applyFoundProduct(p);
        return;
      }

      if (locals.length > 1) {
        setSearchResults(locals);
        setScanState("idle");
        return;
      }

      if (shouldTryDirectLookup(query)) {
        try {
          const p = await fetchProductByEan(config, query);
          await applyFoundProduct(p);
          return;
        } catch (err) {
          lastLookupError = err;
          if (!(err instanceof VFError) || ![404, 409].includes(err.status || 0)) throw err;
        }
      }

      const remoteResults = await searchProducts(config, query, 20);
      if (remoteResults.length === 1) {
        const p = await loadProductDetails(remoteResults[0]);
        await applyFoundProduct(p);
        return;
      }

      if (remoteResults.length > 1) {
        setSearchResults(remoteResults);
        setScanState("idle");
        if (window.easyPrint?.isDesktop) {
          await window.easyPrint.dbSyncProducts(remoteResults).catch(() => null);
        }
        return;
      }

      if (lastLookupError) throw lastLookupError;
      setError("Produto nao encontrado no ERP.");
      setScanState("error");
    } catch (e) {
      const msg = e instanceof VFError ? e.message : "Erro inesperado";
      setErrorDebug(e instanceof VFError ? e.debug : null);
      setError(msg);
      setScanState("error");
      toast.error(msg);
    } finally {
      setLoading(false);
      focusInput();
    }
  };

  const selectProduct = async (p: Product) => {
    setLoading(true);
    setScanState("searching");
    setSearchResults([]);
    try {
      const full = await loadProductDetails(p);
      await applyFoundProduct(full);
    } catch (e) {
      toast.error("Erro ao carregar detalhes do produto");
      setScanState("error");
    } finally {
      setLoading(false);
      focusInput();
    }
  };

  const recordEvent = (p: Product, qty: number, status: "success" | "error", usuario = printName || "padrao") => {
    const now = Date.now();
    const evt: PrintEvent = {
      ean: p.ean,
      descricao: p.descricao,
      quantidade: qty,
      templateId: activeTemplateId,
      at: now,
      durationMs: now - lastActionRef.current,
      status,
      precoVarejo: p.precoVarejo,
      precoAtacado: p.precoAtacado,
      estoque: p.estoque,
      secao: p.secao,
      grupo: p.grupo,
      codigoInterno: p.codigoInterno,
      usuario,
    };
    storage.pushPrintEvent(evt);
    setPrintEvents(storage.getPrintEvents());
    lastActionRef.current = now;
  };

  const ensureName = (): Promise<string | null> => {
    if (printName) return Promise.resolve(printName);
    setNamePromptOpen(true);
    return new Promise((resolve) => {
      nameResolveRef.current = resolve;
    });
  };

  const handleNameConfirm = (name: string) => {
    setPrintName(name);
    setNamePromptOpen(false);
    nameResolveRef.current?.(name);
    nameResolveRef.current = null;
  };

  const handleNameCancel = () => {
    setNamePromptOpen(false);
    nameResolveRef.current?.(null);
    nameResolveRef.current = null;
  };

  const handleSwitchName = () => {
    setPrintName(null);
    setNamePromptOpen(true);
  };

  const sendRaw = async (content: string, label: string) => {
    try {
      const printerName = activeTemplate?.preferredPrinterName || config.labelPrinterName || "ELGIN L42PRO FULL";
      await printService.printRawPrn(content, printerName);
      toast.success(`${label} enviado para ${printerName}`);
      setScanState("sent");
      return true;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao imprimir");
      setScanState("fail");
      return false;
    }
  };

  const handlePrint = async () => {
    if (!product) return toast.error("Nenhum produto selecionado");
    if (printerStatus !== "online") return toast.error("Servidor de impressao offline");
    if (hasErrors) return toast.error("Corrija o modelo antes de imprimir");
    const name = await ensureName();
    if (!name) return toast.error("Informe um nome para imprimir");
    const ok = await sendRaw(buildEplPrn(activeTemplate, product, copies), `${copies} etiqueta(s)`);
    recordEvent(product, copies, ok ? "success" : "error", name);
    if (ok) {
      lastPrintedRef.current = product;
      setTimeout(() => {
        setCode("");
        focusInput();
      }, 300);
    }
  };

  const handleAddToQueue = () => {
    if (!product) return toast.error("Nenhum produto selecionado");
    setPrintQueue((items) => {
      const existing = items.find((item) => item.product.ean === product.ean);
      if (existing) {
        return items.map((item) =>
          item.id === existing.id ? { ...item, quantity: item.quantity + copies } : item,
        );
      }
      return [
        ...items,
        {
          id: `${product.ean}-${Date.now()}`,
          product,
          quantity: copies,
        },
      ];
    });
    toast.success(`${copies} etiqueta(s) adicionada(s) a fila`);
    setCode("");
    focusInput();
  };

  const updateQueueItem = (id: string, quantity: number) => {
    setPrintQueue((items) =>
      items
        .map((item) => (item.id === id ? { ...item, quantity: Math.max(1, quantity) } : item))
        .filter((item) => item.quantity > 0),
    );
  };

  const removeQueueItem = (id: string) => {
    setPrintQueue((items) => items.filter((item) => item.id !== id));
  };

  const handlePrintQueue = async () => {
    if (!printQueue.length) return toast.error("Fila vazia");
    if (printerStatus !== "online") return toast.error("Servidor de impressao offline");
    if (hasErrors) return toast.error("Corrija o modelo antes de imprimir");
    const name = await ensureName();
    if (!name) return toast.error("Informe um nome para imprimir");
    const ok = await sendRaw(buildEplBatchPrn(activeTemplate, printQueue), `Fila com ${queueTotal} etiqueta(s)`);
    printQueue.forEach((item) => recordEvent(item.product, item.quantity, ok ? "success" : "error", name));
    if (ok) {
      lastPrintedRef.current = printQueue[printQueue.length - 1]?.product || null;
      setPrintQueue([]);
      setCode("");
      focusInput();
    }
  };

  const handleReprintLast = async () => {
    const p = lastPrintedRef.current;
    if (!p) return toast.error("Nenhuma impressao anterior");
    if (printerStatus !== "online") return toast.error("Servidor de impressao offline");
    const name = await ensureName();
    if (!name) return toast.error("Informe um nome para imprimir");
    const ok = await sendRaw(buildEplPrn(activeTemplate, p, copies), "Reimpressao");
    recordEvent(p, copies, ok ? "success" : "error", name);
  };

  const handleTestPrint = async () => {
    if (printerStatus !== "online") return toast.error("Servidor de impressao offline");
    await sendRaw(buildTestPrn(activeTemplate), "Etiqueta de teste");
  };

  const handleCalibration = async () => {
    if (printerStatus !== "online") return toast.error("Servidor de impressao offline");
    await sendRaw(buildCalibrationPrn(activeTemplate), "Calibracao");
  };

  const handleDownloadPrn = () => {
    if (!product) return toast.error("Nenhum produto selecionado");
    downloadEplPrn(activeTemplate, product, copies);
    toast.success("PRN EPL gerado");
  };

  const handleRestoreElgin = () => {
    const next = restoreElginPreset(templates);
    setTemplates(next);
    storage.saveTemplates(next);
    setActiveTemplateId(ELGIN_PRESET_ID);
    storage.setActiveTemplateId(ELGIN_PRESET_ID);
    toast.success("Presets de etiqueta restaurados");
  };

  const reuseFromHistory = (ean: string) => {
    setCode(ean);
    setView("scan");
    search(ean);
  };

  const lastEvent = printEvents[0];
  const printDisabled = !product || printerStatus !== "online" || hasErrors || copies < 1;
  const queuePrintDisabled = !printQueue.length || printerStatus !== "online" || hasErrors;

  const handleImportFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
      const text = e.target?.result as string;
      const lines = text.split(/\r?\n/).filter(line => line.trim());
      
      toast.info(`Processando ${lines.length} itens do arquivo...`);
      let successCount = 0;
      let failCount = 0;

      for (const line of lines) {
        // Suporta ';' ou ',' como separador
        const parts = line.split(/[;,]/);
        const ean = parts[0]?.trim();
        const qty = parseInt(parts[1]?.trim() || "1", 10);

        if (!ean) continue;

        try {
          const p = await fetchProductByEan(config, ean);
          setPrintQueue((items) => {
            const existing = items.find((item) => item.product.ean === p.ean);
            if (existing) {
              return items.map((item) =>
                item.id === existing.id ? { ...item, quantity: item.quantity + qty } : item,
              );
            }
            return [...items, { id: `${p.ean}-${Date.now()}-${Math.random()}`, product: p, quantity: qty }];
          });
          successCount++;
        } catch (err) {
          console.error(`Erro ao importar ${ean}:`, err);
          failCount++;
        }
      }

      if (failCount > 0) {
        toast.warning(`Importação concluída: ${successCount} sucessos, ${failCount} falhas.`);
      } else {
        toast.success(`${successCount} itens adicionados à fila com sucesso!`);
      }
      // Limpa o input para permitir re-importar o mesmo arquivo
      event.target.value = "";
    };
    reader.readAsText(file);
  };

  return (
    <div className="flex h-screen overflow-hidden bg-background text-foreground">
      <aside className={cn(
        "no-print flex flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-all duration-200 shrink-0 overflow-hidden",
        sidebarCollapsed ? "w-12" : "w-60"
      )}>
        <div className="flex shrink-0 items-center justify-between border-b border-sidebar-border px-3 py-3">
          {!sidebarCollapsed && (
            <div className="flex items-center gap-2 min-w-0">
              <Tag className="h-4 w-4 text-sidebar-primary shrink-0" />
              <div className="min-w-0">
                <h1 className="font-bold leading-tight text-sm truncate">Easy Print Mate</h1>
                <p className="text-[10px] opacity-60">Elgin L42PRO</p>
              </div>
            </div>
          )}
          {sidebarCollapsed && <Tag className="h-4 w-4 text-sidebar-primary mx-auto" />}
          <button
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            className="shrink-0 rounded-md p-1 hover:bg-sidebar-accent transition-colors"
            title={sidebarCollapsed ? "Expandir menu" : "Recolher menu"}
          >
            {sidebarCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </button>
        </div>

        <nav className="p-2 space-y-1">
          <NavBtn icon={<Tag />} label="Bipar / Imprimir" active={view === "scan"} onClick={() => { setView("scan"); focusInput(); }} collapsed={sidebarCollapsed} />
          <NavBtn icon={<Pencil />} label="Editor de etiqueta" active={view === "editor"} onClick={() => setView("editor")} collapsed={sidebarCollapsed} />
          <NavBtn icon={<FileText />} label="Etiquetas A4 / PDF" active={view === "a4"} onClick={() => setView("a4")} collapsed={sidebarCollapsed} />
          <NavBtn icon={<BadgePercent />} label="Item em Promoção" active={view === "promo"} onClick={() => setView("promo")} collapsed={sidebarCollapsed} />
          <NavBtn icon={<BarChart3 />} label="Metricas" active={view === "metrics"} onClick={() => setView("metrics")} collapsed={sidebarCollapsed} />
          <NavBtn icon={<Settings />} label="Configuracao API" active={view === "config"} onClick={() => setView("config")} collapsed={sidebarCollapsed} />
        </nav>

        {!sidebarCollapsed && (
          <div className="mt-auto shrink-0 border-t border-sidebar-border p-2">
            <div className="flex items-center justify-between gap-1.5 rounded-md bg-sidebar-accent/50 px-2 py-1.5">
              <div className="flex items-center gap-1.5 min-w-0">
                <UserCircle2 className="h-3.5 w-3.5 shrink-0 opacity-70" />
                <span className="text-xs truncate">
                  {printName || "Sem nome"}
                </span>
              </div>
              <button
                onClick={handleSwitchName}
                className="shrink-0 rounded-md p-1 hover:bg-sidebar-accent transition-colors"
                title="Trocar nome"
              >
                <LogOut className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        )}

        {!sidebarCollapsed && (
          <>
            <div className="px-3 mt-2 flex items-center justify-between text-[10px] uppercase opacity-60">
              <span className="flex items-center gap-1"><History className="h-3 w-3" /> Historico</span>
              {history.length > 0 && (
                <button className="hover:text-sidebar-primary" onClick={() => { storage.clearHistory(); setHistory([]); }}>
                  <Trash2 className="h-3 w-3" />
                </button>
              )}
            </div>
            <div className="flex-1 overflow-auto px-2 py-2 space-y-1">
              {history.length === 0 && <p className="text-[11px] opacity-50 px-2">Nenhum produto ainda.</p>}
              {history.map((h) => (
                <button
                  key={h.ean + h.at}
                  onClick={() => reuseFromHistory(h.ean)}
                  className="w-full text-left p-2 rounded hover:bg-sidebar-accent transition-colors"
                >
                  <div className="text-[10px] font-mono opacity-70">{h.ean}</div>
                  <div className="text-xs truncate">{h.descricao}</div>
                </button>
              ))}
            </div>

            <div className="p-3 border-t border-sidebar-border text-[11px] opacity-80 space-y-2 shrink-0">
              <div className="opacity-70">Modelo ativo:</div>
              <select
                className="w-full bg-sidebar-accent text-sidebar-accent-foreground rounded px-2 py-1 text-xs"
                value={activeTemplateId}
                onChange={(e) => { setActiveTemplateId(e.target.value); storage.setActiveTemplateId(e.target.value); }}
              >
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
              <Button size="sm" variant="outline" className="h-7 w-full text-[11px]" onClick={handleRestoreElgin}>
                <RotateCw className="h-3 w-3" /> Restaurar presets
              </Button>
            </div>
          </>
        )}
      </aside>

      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Top status bar */}
        <div className="no-print flex shrink-0 flex-wrap items-center gap-2 border-b bg-card px-3 py-1.5 text-xs">
          <StatusBadge
            online={printerStatus === "online"}
            checking={printerStatus === "checking"}
            label={printerStatus === "online" ? "Online" : printerStatus === "checking" ? "Verificando..." : "Offline"}
            iconOk={<Wifi className="h-3.5 w-3.5" />}
            iconFail={<WifiOff className="h-3.5 w-3.5" />}
          />
          {window.easyPrint?.isDesktop ? (
            <select
              className="h-7 rounded-md border bg-background px-2 py-0.5 text-xs"
              value={config.labelPrinterName || ""}
              onChange={(e) => {
                const next = { ...config, labelPrinterName: e.target.value };
                setConfig(next);
                storage.saveConfig(next);
              }}
            >
              <option value="">Escolher impressora</option>
              {printers.map((printer) => (
                <option key={printer.name} value={printer.name}>
                  {printer.name}{printer.isDefault ? " (padrao)" : ""}{printer.isOffline ? " [offline]" : ""}
                </option>
              ))}
            </select>
          ) : (
            <div className="flex items-center gap-1 rounded-md border bg-background px-2 py-0.5">
              <Printer className="h-3 w-3 text-muted-foreground" />
              <span className="font-mono">{config.labelPrinterName || "Sem impressora"}</span>
            </div>
          )}
          <div className="flex items-center gap-1 rounded-md border bg-background px-2 py-0.5">
            <Tag className="h-3 w-3 text-muted-foreground" />
            <span>{activeTemplate.name}</span>
            <span className="text-muted-foreground">· {activeTemplate.widthMm}x{activeTemplate.heightMm}mm</span>
          </div>
          {lastEvent && (
            <div className="ml-auto flex items-center gap-1 rounded-md border bg-background px-2 py-0.5 text-muted-foreground">
              Ultima: <span className="font-mono text-foreground">{lastEvent.ean}</span>
              · {lastEvent.quantidade}x · {new Date(lastEvent.at).toLocaleTimeString()}
            </div>
          )}
        </div>

        {view === "scan" && (
          <div className="flex-1 grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-4 p-4 overflow-auto no-print">
            <section className="space-y-4">
              <div className="flex items-center gap-2">
                <div className="flex-1">
                  <ProductSearch
                    ref={inputRef}
                    value={code}
                    onChange={setCode}
                    onSubmit={() => search()}
                    loading={loading}
                  />
                </div>
                <div className="shrink-0">
                  <input
                    type="file"
                    id="csv-import"
                    accept=".csv,.txt"
                    className="hidden"
                    onChange={handleImportFile}
                  />
                  <Button
                    variant="outline"
                    className="h-12 px-4 flex flex-col items-center justify-center gap-0"
                    onClick={() => document.getElementById("csv-import")?.click()}
                  >
                    <FileText className="h-4 w-4" />
                    <span className="text-[10px] font-bold uppercase">Importar</span>
                  </Button>
                </div>
              </div>

              <div className="rounded-lg border bg-card p-4">
                <div className="grid gap-3 md:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                      Tipo de etiqueta
                    </label>
                    <select
                      className="h-10 w-full rounded-md border bg-background px-3 py-2 text-sm"
                      value={activeTemplateId}
                      onChange={(e) => setActiveTemplateId(e.target.value)}
                    >
                      {templateChoices.map((template) => (
                        <option key={template.id} value={template.id}>{template.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                      Quantidade
                    </label>
                    <input
                      type="number"
                      min={1}
                      step={1}
                      className="h-10 w-full rounded-md border bg-background px-3 py-2 text-sm"
                      value={copies}
                      onChange={(e) => setCopies(Math.max(1, Number(e.target.value) || 1))}
                    />
                  </div>
                </div>
              </div>

              <ScanStateBar state={scanState} loading={loading} />

              {searchResults.length > 0 && (
                <div className="rounded-lg border bg-card p-4 space-y-3">
                  <h3 className="text-sm font-semibold flex items-center gap-2">
                    <History className="h-4 w-4" /> Resultados da busca ({searchResults.length})
                  </h3>
                  <div className="grid gap-2 max-h-96 overflow-auto pr-1">
                    {searchResults.map((p, index) => (
                      <button
                        key={p.id || p.ean || p.codigoInterno || `${p.descricao}-${index}`}
                        onClick={() => selectProduct(p)}
                        className="flex items-center justify-between p-3 rounded-md border bg-background hover:bg-accent transition-colors text-left"
                      >
                        <div className="min-w-0">
                          <div className="text-[10px] font-mono opacity-70">{p.ean || p.codigo_barras || p.codigoInterno || p.id}</div>
                          <div className="text-sm font-medium truncate">{p.descricao}</div>
                          <div className="text-[10px] text-muted-foreground">
                            {[p.empresa, p.secao, p.grupo].filter(Boolean).join(" / ")}
                          </div>
                        </div>
                        <div className="shrink-0 text-sm font-bold text-primary">
                          Selecionar
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="rounded-lg border bg-card p-4">
                <h2 className="text-sm font-semibold mb-3 flex items-center gap-2">
                  <Tag className="h-4 w-4 text-primary" /> Produto
                </h2>
                {loading && <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Buscando...</div>}
                {!loading && error && (
                  <div className="space-y-2">
                    <div className="text-destructive text-sm font-medium">{error}</div>
                    {errorDebug ? (
                      <pre className="max-h-40 overflow-auto rounded-md bg-muted p-2 text-[10px] text-muted-foreground whitespace-pre-wrap">
                        {JSON.stringify(errorDebug, null, 2)}
                      </pre>
                    ) : null}
                  </div>
                )}
                {!loading && !error && product && (
                  <div className="flex gap-3">
                    {product.imageUrl && (
                      <div className="shrink-0">
                        <img
                          src={product.imageUrl}
                          alt={product.descricao}
                          className="h-24 w-24 rounded-md border object-contain bg-muted/30"
                          onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                        />
                      </div>
                    )}
                    <div className="flex-1 grid grid-cols-2 gap-2 text-sm">
                      <Row label="EAN" value={product.ean} mono />
                      <Row label="Cod. interno" value={product.codigoInterno} mono />
                      <Row label="Descricao" value={product.descricao} full />
                      <Row label="Secao" value={product.secao || product.grupo} />
                      <Row label="Estoque" value={product.estoque?.toString()} />
                      <Row label="Preco varejo" value={product.precoVarejo != null ? `R$ ${product.precoVarejo.toFixed(2)}` : undefined} bold />
                      <Row label="Preco atacado" value={product.precoAtacado != null ? `R$ ${product.precoAtacado.toFixed(2)}` : undefined} />
                    </div>
                  </div>
                )}
                {!loading && !error && !product && (
                  <p className="text-sm text-muted-foreground">Bipe um codigo de barras para comecar.</p>
                )}
              </div>

              {(hasErrors || hasWarnings) && (
                <div className={cn(
                  "rounded-lg border p-3 text-xs space-y-1",
                  hasErrors ? "border-destructive/40 bg-destructive/5 text-destructive" : "border-amber-500/40 bg-amber-50 text-amber-900",
                )}>
                  <div className="flex items-center gap-1.5 font-semibold">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    {hasErrors ? "Modelo com erros" : "Avisos no modelo"}
                  </div>
                  {issues.map((i, idx) => (
                    <div key={idx} className="opacity-90">- {i.message}</div>
                  ))}
                </div>
              )}
            </section>

            <aside className="space-y-3">
              <div className="rounded-lg border bg-card p-3">
                <Tabs value={previewTab} onValueChange={(v) => setPreviewTab(v as "label" | "sheet")}>
                  <TabsList className="grid grid-cols-2 h-8">
                    <TabsTrigger value="label" className="text-xs">Etiqueta</TabsTrigger>
                    <TabsTrigger value="sheet" className="text-xs">Folha ({cols} col)</TabsTrigger>
                  </TabsList>
                  <TabsContent value="label" className="mt-3">
                    <div className="flex justify-center rounded-md bg-muted/40 p-3">
                      <LabelPreview template={activeTemplate} product={product} />
                    </div>
                  </TabsContent>
                  <TabsContent value="sheet" className="mt-3">
                    <SheetPreviewMini template={activeTemplate} product={product} copies={copies} />
                  </TabsContent>
                </Tabs>

                <div className="mt-2 flex items-center justify-between text-[10px] text-muted-foreground">
                  <span>Espaco entre col.: <strong className="text-foreground">{horizontalSpacing.toFixed(1)} mm</strong></span>
                  <span>Folha: <strong className="text-foreground">{(activeTemplate.paperWidthMm ?? 0).toFixed(0)} mm</strong></span>
                </div>
              </div>

              <div className="rounded-lg border bg-card p-3 space-y-3">
                <div>
                  <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground mb-1.5">
                    Quantidade ({cols} col, multiplos de {cols})
                  </div>
                  <div className="flex items-center gap-2">
                    <Button size="icon" variant="outline" className="h-9 w-9 shrink-0" onClick={() => setCopies((c) => Math.max(1, c - 1))}>
                      <Minus className="h-4 w-4" />
                    </Button>
                    <input
                      type="number"
                      min={1}
                      step={1}
                      className="h-9 flex-1 min-w-0 rounded-md border bg-background px-3 text-center text-2xl font-bold tabular-nums [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                      value={copies}
                      onChange={(e) => setCopies(Math.max(1, Number(e.target.value) || 1))}
                    />
                    <Button size="icon" variant="outline" className="h-9 w-9 shrink-0" onClick={() => setCopies((c) => c + 1)}>
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                  <div className="mt-2 grid grid-cols-3 gap-1.5">
                    {[3, 6, 9].map((n) => (
                      <Button
                        key={n}
                        variant={copies === n ? "default" : "outline"}
                        size="sm"
                        className="h-8 text-xs"
                        onClick={() => setCopies(n)}
                      >
                        {n} et.
                      </Button>
                    ))}
                  </div>
                </div>

                <Button
                  onClick={handlePrint}
                  disabled={printDisabled}
                  className="w-full h-12 text-base"
                >
                  <Printer /> Imprimir {copies} etiqueta{copies > 1 ? "s" : ""}
                </Button>

                <Button
                  onClick={handleAddToQueue}
                  disabled={!product || copies < 1}
                  variant="secondary"
                  className="w-full h-10 text-sm"
                >
                  <Plus className="h-4 w-4" /> Adicionar a fila
                </Button>

                <div className="grid grid-cols-2 gap-2">
                  <Button onClick={handleReprintLast} variant="outline" size="sm" className="h-9 text-xs" disabled={!lastPrintedRef.current || printerStatus !== "online"}>
                    <RotateCw className="h-3.5 w-3.5" /> Reimprimir ultimo
                  </Button>
                  <Button onClick={handleDownloadPrn} variant="outline" size="sm" className="h-9 text-xs" disabled={!product}>
                    <Download className="h-3.5 w-3.5" /> Baixar PRN
                  </Button>
                  <Button onClick={handleTestPrint} variant="outline" size="sm" className="h-9 text-xs" disabled={printerStatus !== "online"}>
                    <TestTube2 className="h-3.5 w-3.5" /> Testar impressao
                  </Button>
                  <Button onClick={handleCalibration} variant="outline" size="sm" className="h-9 text-xs" disabled={printerStatus !== "online"}>
                    <Crosshair className="h-3.5 w-3.5" /> Calibracao
                  </Button>
                </div>
              </div>

              <div className="rounded-lg border bg-card p-3 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-semibold">Fila de impressao</h3>
                    <p className="text-[10px] text-muted-foreground">
                      {queueTotal} etiqueta{queueTotal === 1 ? "" : "s"} - {queueRows || 0} carreira{queueRows === 1 ? "" : "s"} - {cols} colunas
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-8 px-2 text-xs"
                    disabled={!printQueue.length}
                    onClick={() => setPrintQueue([])}
                  >
                    <Trash2 className="h-3.5 w-3.5" /> Limpar
                  </Button>
                </div>

                {printQueue.length === 0 ? (
                  <div className="rounded-md border border-dashed bg-muted/30 p-3 text-center text-xs text-muted-foreground">
                    Adicione produtos para preencher as colunas sem desperdicio de etiqueta.
                  </div>
                ) : (
                  <div className="max-h-56 space-y-2 overflow-auto pr-1">
                    {printQueue.map((item, index) => (
                      <div key={item.id} className="rounded-md border bg-background p-2">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="text-[10px] font-mono text-muted-foreground">Item {index + 1} - {item.product.ean}</div>
                            <div className="truncate text-xs font-medium">{item.product.descricao}</div>
                          </div>
                          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => removeQueueItem(item.id)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                        <div className="mt-2 flex items-center gap-2">
                          <Button size="icon" variant="outline" className="h-7 w-7" onClick={() => updateQueueItem(item.id, item.quantity - 1)}>
                            <Minus className="h-3.5 w-3.5" />
                          </Button>
                          <div className="w-12 text-center text-sm font-bold tabular-nums">{item.quantity}</div>
                          <Button size="icon" variant="outline" className="h-7 w-7" onClick={() => updateQueueItem(item.id, item.quantity + 1)}>
                            <Plus className="h-3.5 w-3.5" />
                          </Button>
                          <div className="ml-auto text-[10px] text-muted-foreground">
                            ocupa {Math.ceil(item.quantity / cols)} carreira{Math.ceil(item.quantity / cols) === 1 ? "" : "s"} se sozinho
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <QueueGridPreview queue={printQueue} columns={cols} />

                <Button
                  onClick={handlePrintQueue}
                  disabled={queuePrintDisabled}
                  className="w-full h-11 text-sm"
                >
                  <Printer className="h-4 w-4" /> Imprimir fila sem desperdicio
                </Button>
              </div>
            </aside>
          </div>
        )}

        {view === "editor" && (
          <div className="flex-1 p-3 overflow-hidden no-print">
            <LabelEditor
              templates={templates}
              activeId={activeTemplateId}
              printers={printers}
              onChange={(t, id) => { setTemplates(t); setActiveTemplateId(id); }}
            />
          </div>
        )}

        {view === "config" && (
          <div className="flex-1 p-6 overflow-auto no-print">
            <h2 className="text-xl font-bold mb-4">Configuracao da API Varejo Facil</h2>
            <ApiConfig config={config} onSave={setConfig} printers={printers} />
          </div>
        )}

        {view === "metrics" && (
          <div className="flex-1 p-6 overflow-auto no-print">
            <Metrics
              events={printEvents}
              onClear={() => { storage.clearPrintEvents(); setPrintEvents([]); }}
            />
          </div>
        )}

        {view === "a4" && (
          <div className="flex-1 overflow-hidden no-print">
            <A4Module config={config} ensureName={ensureName} />
          </div>
        )}

        {view === "promo" && (
          <div className="flex-1 flex flex-col overflow-hidden no-print">
            <PromoModule config={config} />
          </div>
        )}

      </main>

      <NamePromptModal
        open={namePromptOpen}
        onConfirm={handleNameConfirm}
        onCancel={handleNameCancel}
      />
    </div>
  );
};

function NavBtn({ icon, label, active, onClick, collapsed = false }: { icon: React.ReactNode; label: string; active?: boolean; onClick: () => void; collapsed?: boolean }) {
  return (
    <button
      onClick={onClick}
      title={collapsed ? label : undefined}
      className={cn(
        "w-full flex items-center rounded-md text-sm transition-colors",
        collapsed ? "justify-center px-2 py-2" : "gap-2 px-3 py-2",
        active ? "bg-sidebar-primary text-sidebar-primary-foreground" : "hover:bg-sidebar-accent",
      )}
    >
      <span className="[&_svg]:h-4 [&_svg]:w-4 shrink-0">{icon}</span>
      {!collapsed && label}
    </button>
  );
}

function StatusBadge({ online, checking, label, iconOk, iconFail }: { online: boolean; checking: boolean; label: string; iconOk: React.ReactNode; iconFail: React.ReactNode }) {
  return (
    <div
      className={cn(
        "flex items-center gap-1.5 rounded-md border px-2 py-1",
        checking ? "border-muted bg-muted/40 text-muted-foreground" : online ? "border-emerald-500/40 bg-emerald-50 text-emerald-700" : "border-destructive/40 bg-destructive/5 text-destructive",
      )}
    >
      {checking ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : online ? iconOk : iconFail}
      <span className="font-medium">{label}</span>
    </div>
  );
}

function ScanStateBar({ state, loading }: { state: string; loading: boolean }) {
  const map: Record<string, { label: string; cls: string; icon: React.ReactNode }> = {
    idle: { label: "Aguardando bipagem", cls: "border-muted bg-muted/40 text-muted-foreground", icon: <Tag className="h-3.5 w-3.5" /> },
    searching: { label: "Buscando produto...", cls: "border-blue-500/40 bg-blue-50 text-blue-700", icon: <Loader2 className="h-3.5 w-3.5 animate-spin" /> },
    found: { label: "Produto encontrado", cls: "border-emerald-500/40 bg-emerald-50 text-emerald-700", icon: <CheckCircle2 className="h-3.5 w-3.5" /> },
    error: { label: "Erro ao buscar produto", cls: "border-destructive/40 bg-destructive/5 text-destructive", icon: <AlertTriangle className="h-3.5 w-3.5" /> },
    sent: { label: "Enviado para impressora", cls: "border-emerald-500/40 bg-emerald-50 text-emerald-700", icon: <CheckCircle2 className="h-3.5 w-3.5" /> },
    fail: { label: "Falha ao imprimir", cls: "border-destructive/40 bg-destructive/5 text-destructive", icon: <AlertTriangle className="h-3.5 w-3.5" /> },
  };
  const s = loading ? map.searching : map[state] || map.idle;
  return (
    <div className={cn("flex items-center gap-2 rounded-md border px-3 py-2 text-xs font-medium", s.cls)}>
      {s.icon}
      {s.label}
    </div>
  );
}

function SheetPreviewMini({ template, product, copies }: { template: LabelTemplate; product: Product | null; copies: number }) {
  const cols = Math.max(1, template.columns || 1);
  const rows = Math.max(1, Math.ceil(copies / cols));
  const cells = Array.from({ length: rows * cols });
  const paperWidth = template.paperWidthMm ?? cols * template.widthMm;
  // Scale to fit container width (~360px)
  const targetPx = 340;
  const scale = Math.min(2.5, targetPx / (paperWidth * 3.78));

  return (
    <div className="space-y-2">
      <div className="overflow-auto rounded-md bg-muted/30 p-3">
        <div style={{ transform: `scale(${scale})`, transformOrigin: "top left", display: "inline-block" }}>
          <div
            className="bg-white border border-dashed border-primary/40"
            style={{
              width: `${paperWidth}mm`,
              padding: `${template.marginTopMm ?? 0}mm ${template.marginRightMm ?? 0}mm ${template.marginBottomMm ?? 0}mm ${template.marginLeftMm ?? 0}mm`,
              boxSizing: "border-box",
            }}
          >
            <div
              style={{
                display: "grid",
                gridTemplateColumns: `repeat(${cols}, ${template.widthMm}mm)`,
                columnGap: `${template.columnGapMm ?? 0}mm`,
                rowGap: `${template.rowGapMm ?? 0}mm`,
              }}
            >
              {cells.map((_, i) => (
                <div key={i} style={{ width: `${template.widthMm}mm`, height: `${template.heightMm}mm` }}>
                  <LabelPreview template={template} product={product} />
                </div>
              ))}
            </div>
            {/* Cut line */}
            <div className="border-t border-dashed border-destructive/60 mt-1" />
          </div>
        </div>
      </div>
      <p className="text-[10px] text-muted-foreground text-center">
        {rows} carreira{rows > 1 ? "s" : ""} x {cols} coluna{cols > 1 ? "s" : ""} = {rows * cols} etiquetas (qtd: {copies})
      </p>
    </div>
  );
}

function QueueGridPreview({ queue, columns }: { queue: PrintQueueItem[]; columns: number }) {
  const expanded = queue.flatMap((item, itemIndex) =>
    Array.from({ length: item.quantity }, () => itemIndex + 1),
  );
  if (!expanded.length) return null;

  const rows = Math.ceil(expanded.length / columns);
  const cells = Array.from({ length: rows * columns }, (_, index) => expanded[index] || null);
  const waste = cells.filter((cell) => cell == null).length;

  return (
    <div className="rounded-md border bg-background p-2">
      <div
        className="grid gap-1"
        style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
      >
        {cells.map((cell, index) => (
          <div
            key={index}
            className={cn(
              "flex h-7 items-center justify-center rounded border text-xs font-bold tabular-nums",
              cell ? "border-primary/30 bg-primary/10 text-primary" : "border-dashed bg-muted/30 text-muted-foreground",
            )}
          >
            {cell ? cell : ""}
          </div>
        ))}
      </div>
      <div className="mt-2 text-center text-[10px] text-muted-foreground">
        {waste === 0 ? "Sem coluna em branco." : `${waste} coluna${waste > 1 ? "s" : ""} em branco na ultima carreira.`}
      </div>
    </div>
  );
}

function Row({ label, value, mono, bold, full }: { label: string; value?: string; mono?: boolean; bold?: boolean; full?: boolean }) {
  return (
    <div className={cn("flex flex-col gap-0.5 border-b last:border-0 pb-1.5", full && "col-span-2")}>
      <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className={cn("truncate", mono && "font-mono text-xs", bold && "font-bold text-base")}>{value || "-"}</dd>
    </div>
  );
}

export default Index;

