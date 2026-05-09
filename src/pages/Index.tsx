import { useEffect, useMemo, useRef, useState } from "react";
import { Product, LabelTemplate, VFConfig, HistoryEntry, PrintEvent, PrintQueueItem } from "@/types/label";
import { storage, defaultTemplates, ensureDefaultTemplates, restoreElginPreset } from "@/services/storage";
import { ELGIN_PRESET_ID } from "@/services/presets";
import { fetchProductByEan, VFError } from "@/api/varejoFacil";
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
} from "lucide-react";
import { cn } from "@/lib/utils";

type View = "scan" | "editor" | "config" | "metrics" | "a4";

const Index = () => {
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

  const printerStatus = usePrintServerStatus(8000);

  const [config, setConfig] = useState<VFConfig>(() => storage.getConfig());
  const [history, setHistory] = useState<HistoryEntry[]>(() => storage.getHistory());
  const [templates, setTemplates] = useState<LabelTemplate[]>(() => {
    const t = storage.getTemplates();
    const d = t.length ? ensureDefaultTemplates(t) : defaultTemplates();
    storage.saveTemplates(d);
    return d;
  });
  const [activeTemplateId, setActiveTemplateId] = useState<string>(() => {
    storage.setActiveTemplateId(ELGIN_PRESET_ID);
    return ELGIN_PRESET_ID;
  });

  const activeTemplate = useMemo(
    () => templates.find((t) => t.id === activeTemplateId) || templates[0],
    [templates, activeTemplateId],
  );

  const issues = useMemo(() => validateTemplate(activeTemplate), [activeTemplate]);
  const hasErrors = issues.some((i) => i.level === "error");
  const hasWarnings = issues.some((i) => i.level === "warning");

  const cols = Math.max(1, activeTemplate.columns || 1);
  const horizontalSpacing = computeHorizontalSpacing(activeTemplate);
  const queueTotal = printQueue.reduce((sum, item) => sum + item.quantity, 0);
  const queueRows = Math.ceil(queueTotal / cols);

  useEffect(() => {
    document.title = "Easy Print Mate — Elgin L42PRO";
  }, []);

  const focusInput = () => setTimeout(() => inputRef.current?.focus(), 50);

  const search = async (rawCode?: string) => {
    const ean = (rawCode ?? code).trim();
    if (!ean) return;
    setLoading(true);
    setScanState("searching");
    setError(null);
    setErrorDebug(null);
    setProduct(null);
    try {
      const p = await fetchProductByEan(config, ean);
      setProduct(p);
      setScanState("found");
      const entry: HistoryEntry = { ean: p.ean, descricao: p.descricao, at: Date.now() };
      storage.pushHistory(entry);
      setHistory(storage.getHistory());
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

  const recordEvent = (p: Product, qty: number, status: "success" | "error") => {
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
    };
    storage.pushPrintEvent(evt);
    setPrintEvents(storage.getPrintEvents());
    lastActionRef.current = now;
  };

  const sendRaw = async (content: string, label: string) => {
    try {
      await printService.printRawPrn(content);
      toast.success(`${label} enviado para ELGIN L42PRO FULL`);
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
    if (printerStatus !== "online") return toast.error("Servidor de impressão offline");
    if (hasErrors) return toast.error("Corrija o modelo antes de imprimir");
    const ok = await sendRaw(buildEplPrn(activeTemplate, product, copies), `${copies} etiqueta(s)`);
    recordEvent(product, copies, ok ? "success" : "error");
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
    toast.success(`${copies} etiqueta(s) adicionada(s) à fila`);
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
    if (printerStatus !== "online") return toast.error("Servidor de impressão offline");
    if (hasErrors) return toast.error("Corrija o modelo antes de imprimir");
    const ok = await sendRaw(buildEplBatchPrn(activeTemplate, printQueue), `Fila com ${queueTotal} etiqueta(s)`);
    printQueue.forEach((item) => recordEvent(item.product, item.quantity, ok ? "success" : "error"));
    if (ok) {
      lastPrintedRef.current = printQueue[printQueue.length - 1]?.product || null;
      setPrintQueue([]);
      setCode("");
      focusInput();
    }
  };

  const handleReprintLast = async () => {
    const p = lastPrintedRef.current;
    if (!p) return toast.error("Nenhuma impressão anterior");
    if (printerStatus !== "online") return toast.error("Servidor de impressão offline");
    const ok = await sendRaw(buildEplPrn(activeTemplate, p, copies), "Reimpressão");
    recordEvent(p, copies, ok ? "success" : "error");
  };

  const handleTestPrint = async () => {
    if (printerStatus !== "online") return toast.error("Servidor de impressão offline");
    await sendRaw(buildTestPrn(activeTemplate), "Etiqueta de teste");
  };

  const handleCalibration = async () => {
    if (printerStatus !== "online") return toast.error("Servidor de impressão offline");
    await sendRaw(buildCalibrationPrn(activeTemplate), "Calibração");
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
    toast.success("Preset Elgin restaurado");
  };

  const reuseFromHistory = (ean: string) => {
    setCode(ean);
    setView("scan");
    search(ean);
  };

  const lastEvent = printEvents[0];
  const printDisabled = !product || printerStatus !== "online" || hasErrors || copies < 1;
  const queuePrintDisabled = !printQueue.length || printerStatus !== "online" || hasErrors;

  return (
    <div className="flex h-screen overflow-hidden bg-background text-foreground">
      <aside className="no-print w-60 bg-sidebar text-sidebar-foreground flex flex-col border-r border-sidebar-border">
        <div className="p-4 border-b border-sidebar-border flex items-center gap-2">
          <Tag className="h-5 w-5 text-sidebar-primary" />
          <div>
            <h1 className="font-bold leading-tight text-sm">Easy Print Mate</h1>
            <p className="text-[11px] opacity-70">Elgin L42PRO · EPL RAW</p>
          </div>
        </div>

        <nav className="p-2 space-y-1">
          <NavBtn icon={<Tag />} label="Bipar / Imprimir" active={view === "scan"} onClick={() => { setView("scan"); focusInput(); }} />
          <NavBtn icon={<Pencil />} label="Editor de etiqueta" active={view === "editor"} onClick={() => setView("editor")} />
          <NavBtn icon={<FileText />} label="Etiquetas A4 / PDF" active={view === "a4"} onClick={() => setView("a4")} />
          <NavBtn icon={<BarChart3 />} label="Métricas" active={view === "metrics"} onClick={() => setView("metrics")} />
          <NavBtn icon={<Settings />} label="Configuração API" active={view === "config"} onClick={() => setView("config")} />
        </nav>

        <div className="px-3 mt-2 flex items-center justify-between text-[10px] uppercase opacity-60">
          <span className="flex items-center gap-1"><History className="h-3 w-3" /> Histórico</span>
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

        <div className="p-3 border-t border-sidebar-border text-[11px] opacity-80 space-y-2">
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
            <RotateCw className="h-3 w-3" /> Restaurar Elgin
          </Button>
        </div>
      </aside>

      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Top status bar */}
        <div className="no-print flex shrink-0 items-center gap-3 border-b bg-card px-4 py-2 text-xs">
          <StatusBadge
            online={printerStatus === "online"}
            checking={printerStatus === "checking"}
            label={printerStatus === "online" ? "Servidor de impressão online" : printerStatus === "checking" ? "Verificando servidor..." : "Servidor offline"}
            iconOk={<Wifi className="h-3.5 w-3.5" />}
            iconFail={<WifiOff className="h-3.5 w-3.5" />}
          />
          <div className="flex items-center gap-1.5 rounded-md border bg-background px-2 py-1">
            <Printer className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="font-mono">ELGIN L42PRO FULL</span>
          </div>
          <div className="flex items-center gap-1.5 rounded-md border bg-background px-2 py-1">
            <Tag className="h-3.5 w-3.5 text-muted-foreground" />
            <span>{activeTemplate.name}</span>
            <span className="text-muted-foreground">· {activeTemplate.widthMm}×{activeTemplate.heightMm}mm</span>
          </div>
          {lastEvent && (
            <div className="ml-auto flex items-center gap-1.5 rounded-md border bg-background px-2 py-1 text-muted-foreground">
              Última: <span className="font-mono text-foreground">{lastEvent.ean}</span>
              · {lastEvent.quantidade}x · {new Date(lastEvent.at).toLocaleTimeString()}
            </div>
          )}
        </div>

        {view === "scan" && (
          <div className="flex-1 grid grid-cols-1 xl:grid-cols-[1fr_400px] gap-4 p-4 overflow-auto no-print">
            <section className="space-y-4">
              <ProductSearch
                ref={inputRef}
                value={code}
                onChange={setCode}
                onSubmit={() => search()}
                loading={loading}
              />

              <ScanStateBar state={scanState} loading={loading} />

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
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <Row label="EAN" value={product.ean} mono />
                    <Row label="Cód. interno" value={product.codigoInterno} mono />
                    <Row label="Descrição" value={product.descricao} full />
                    <Row label="Seção" value={product.secao || product.grupo} />
                    <Row label="Estoque" value={product.estoque?.toString()} />
                    <Row label="Preço varejo" value={product.precoVarejo != null ? `R$ ${product.precoVarejo.toFixed(2)}` : undefined} bold />
                    <Row label="Preço atacado" value={product.precoAtacado != null ? `R$ ${product.precoAtacado.toFixed(2)}` : undefined} />
                  </div>
                )}
                {!loading && !error && !product && (
                  <p className="text-sm text-muted-foreground">Bipe um código de barras para começar.</p>
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
                    <div key={idx} className="opacity-90">• {i.message}</div>
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
                  <span>Espaço entre col.: <strong className="text-foreground">{horizontalSpacing.toFixed(1)} mm</strong></span>
                  <span>Folha: <strong className="text-foreground">{(activeTemplate.paperWidthMm ?? 0).toFixed(0)} mm</strong></span>
                </div>
              </div>

              <div className="rounded-lg border bg-card p-3 space-y-3">
                <div>
                  <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground mb-1.5">
                    Quantidade ({cols} col → múltiplos de {cols})
                  </div>
                  <div className="flex items-center gap-2">
                    <Button size="icon" variant="outline" className="h-9 w-9" onClick={() => setCopies((c) => Math.max(1, c - 1))}>
                      <Minus className="h-4 w-4" />
                    </Button>
                    <div className="flex-1 text-center text-2xl font-bold tabular-nums">{copies}</div>
                    <Button size="icon" variant="outline" className="h-9 w-9" onClick={() => setCopies((c) => c + 1)}>
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
                  <Plus className="h-4 w-4" /> Adicionar à fila
                </Button>

                <div className="grid grid-cols-2 gap-2">
                  <Button onClick={handleReprintLast} variant="outline" size="sm" className="h-9 text-xs" disabled={!lastPrintedRef.current || printerStatus !== "online"}>
                    <RotateCw className="h-3.5 w-3.5" /> Reimprimir último
                  </Button>
                  <Button onClick={handleDownloadPrn} variant="outline" size="sm" className="h-9 text-xs" disabled={!product}>
                    <Download className="h-3.5 w-3.5" /> Baixar PRN
                  </Button>
                  <Button onClick={handleTestPrint} variant="outline" size="sm" className="h-9 text-xs" disabled={printerStatus !== "online"}>
                    <TestTube2 className="h-3.5 w-3.5" /> Testar impressão
                  </Button>
                  <Button onClick={handleCalibration} variant="outline" size="sm" className="h-9 text-xs" disabled={printerStatus !== "online"}>
                    <Crosshair className="h-3.5 w-3.5" /> Calibração
                  </Button>
                </div>
              </div>

              <div className="rounded-lg border bg-card p-3 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-semibold">Fila de impressão</h3>
                    <p className="text-[10px] text-muted-foreground">
                      {queueTotal} etiqueta{queueTotal === 1 ? "" : "s"} · {queueRows || 0} carreira{queueRows === 1 ? "" : "s"} · {cols} colunas
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
                    Adicione produtos para preencher as colunas sem desperdiçar etiqueta.
                  </div>
                ) : (
                  <div className="max-h-56 space-y-2 overflow-auto pr-1">
                    {printQueue.map((item, index) => (
                      <div key={item.id} className="rounded-md border bg-background p-2">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="text-[10px] font-mono text-muted-foreground">Item {index + 1} · {item.product.ean}</div>
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
                  <Printer className="h-4 w-4" /> Imprimir fila sem desperdício
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
              onChange={(t, id) => { setTemplates(t); setActiveTemplateId(id); }}
            />
          </div>
        )}

        {view === "config" && (
          <div className="flex-1 p-6 overflow-auto no-print">
            <h2 className="text-xl font-bold mb-4">Configuração da API Varejo Fácil</h2>
            <ApiConfig config={config} onSave={setConfig} />
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
      </main>
    </div>
  );
};

function NavBtn({ icon, label, active, onClick }: { icon: React.ReactNode; label: string; active?: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors",
        active ? "bg-sidebar-primary text-sidebar-primary-foreground" : "hover:bg-sidebar-accent",
      )}
    >
      <span className="[&_svg]:h-4 [&_svg]:w-4">{icon}</span>
      {label}
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
        {rows} carreira{rows > 1 ? "s" : ""} × {cols} coluna{cols > 1 ? "s" : ""} = {rows * cols} etiquetas (qtd: {copies})
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
        {waste === 0 ? "Sem coluna em branco." : `${waste} coluna${waste > 1 ? "s" : ""} em branco na última carreira.`}
      </div>
    </div>
  );
}

function Row({ label, value, mono, bold, full }: { label: string; value?: string; mono?: boolean; bold?: boolean; full?: boolean }) {
  return (
    <div className={cn("flex flex-col gap-0.5 border-b last:border-0 pb-1.5", full && "col-span-2")}>
      <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className={cn("truncate", mono && "font-mono text-xs", bold && "font-bold text-base")}>{value || "—"}</dd>
    </div>
  );
}

export default Index;
