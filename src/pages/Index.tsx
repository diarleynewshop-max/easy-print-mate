import { useEffect, useMemo, useRef, useState } from "react";
import { Product, LabelTemplate, VFConfig, HistoryEntry, PrintEvent } from "@/types/label";
import { storage, defaultTemplates, ensureDefaultTemplates } from "@/services/storage";
import { fetchProductByEan, VFError } from "@/api/varejoFacil";
import { downloadEplPrn } from "@/services/eplService";
import { ProductSearch } from "@/components/ProductSearch";
import { LabelPreview } from "@/components/LabelPreview";
import { LabelEditor } from "@/components/LabelEditor";
import { ApiConfig } from "@/components/ApiConfig";
import { Metrics } from "@/components/Metrics";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Download, Printer, Tag, Settings, History, Pencil, Loader2, Trash2, BarChart3 } from "lucide-react";
import { cn } from "@/lib/utils";

type View = "scan" | "editor" | "config" | "metrics";

const Index = () => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [view, setView] = useState<View>("scan");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [product, setProduct] = useState<Product | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [errorDebug, setErrorDebug] = useState<unknown>(null);
  const [copies, setCopies] = useState(1);
  const lastActionRef = useRef<number>(Date.now());
  const [printEvents, setPrintEvents] = useState<PrintEvent[]>(() => storage.getPrintEvents());

  const [config, setConfig] = useState<VFConfig>(() => storage.getConfig());
  const [history, setHistory] = useState<HistoryEntry[]>(() => storage.getHistory());
  const [templates, setTemplates] = useState<LabelTemplate[]>(() => {
    const t = storage.getTemplates();
    const d = t.length ? ensureDefaultTemplates(t) : defaultTemplates();
    storage.saveTemplates(d);
    return d;
  });
  const [activeTemplateId, setActiveTemplateId] = useState<string>(
    () => {
      const id = "etiqueta-prn-102x21";
      storage.setActiveTemplateId(id);
      return id;
    },
  );

  const activeTemplate = useMemo(
    () => templates.find((t) => t.id === activeTemplateId) || templates[0],
    [templates, activeTemplateId],
  );

  useEffect(() => {
    document.title = "Etiquetas — Varejo Fácil";
  }, []);

  const focusInput = () => setTimeout(() => inputRef.current?.focus(), 50);

  const search = async (rawCode?: string) => {
    const ean = (rawCode ?? code).trim();
    if (!ean) return;
    setLoading(true);
    setError(null);
    setErrorDebug(null);
    setProduct(null);
    try {
      const p = await fetchProductByEan(config, ean);
      setProduct(p);
      const entry: HistoryEntry = { ean: p.ean, descricao: p.descricao, at: Date.now() };
      storage.pushHistory(entry);
      setHistory(storage.getHistory());
    } catch (e) {
      const msg = e instanceof VFError ? e.message : "Erro inesperado";
      setErrorDebug(e instanceof VFError ? e.debug : null);
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
      focusInput();
    }
  };

  const handlePrint = () => {
    if (!product) return toast.error("Nenhum produto selecionado");
    const now = Date.now();
    const evt: PrintEvent = {
      ean: product.ean,
      descricao: product.descricao,
      quantidade: copies,
      templateId: activeTemplateId,
      at: now,
      durationMs: now - lastActionRef.current,
    };
    storage.pushPrintEvent(evt);
    setPrintEvents(storage.getPrintEvents());
    lastActionRef.current = now;
    downloadEplPrn(activeTemplate, product, copies);
    toast.success("PRN EPL gerado");
    setTimeout(() => {
      setCode("");
      focusInput();
    }, 300);
  };

  const handleDownloadPrn = () => {
    if (!product) return toast.error("Nenhum produto selecionado");
    const now = Date.now();
    const evt: PrintEvent = {
      ean: product.ean,
      descricao: product.descricao,
      quantidade: copies,
      templateId: activeTemplateId,
      at: now,
      durationMs: now - lastActionRef.current,
    };
    storage.pushPrintEvent(evt);
    setPrintEvents(storage.getPrintEvents());
    lastActionRef.current = now;
    downloadEplPrn(activeTemplate, product, copies);
    toast.success("PRN EPL gerado");
    setTimeout(() => {
      setCode("");
      focusInput();
    }, 300);
  };

  const reuseFromHistory = (ean: string) => {
    setCode(ean);
    setView("scan");
    search(ean);
  };

  return (
    <div className="flex h-screen overflow-hidden bg-background text-foreground">
      {/* Sidebar */}
      <aside className="no-print w-64 bg-sidebar text-sidebar-foreground flex flex-col border-r border-sidebar-border">
        <div className="p-4 border-b border-sidebar-border flex items-center gap-2">
          <Tag className="h-5 w-5 text-sidebar-primary" />
          <div>
            <h1 className="font-bold leading-tight">Etiquetas</h1>
            <p className="text-xs opacity-70">Varejo Fácil · Elgin L42</p>
          </div>
        </div>

        <nav className="p-2 space-y-1">
          <NavBtn icon={<Tag />} label="Bipar / Imprimir" active={view === "scan"} onClick={() => { setView("scan"); focusInput(); }} />
          <NavBtn icon={<Pencil />} label="Editor de etiqueta" active={view === "editor"} onClick={() => setView("editor")} />
          <NavBtn icon={<BarChart3 />} label="Métricas" active={view === "metrics"} onClick={() => setView("metrics")} />
          <NavBtn icon={<Settings />} label="Configuração API" active={view === "config"} onClick={() => setView("config")} />
        </nav>

        <div className="px-3 mt-2 flex items-center justify-between text-xs uppercase opacity-60">
          <span className="flex items-center gap-1"><History className="h-3 w-3" /> Histórico</span>
          {history.length > 0 && (
            <button
              className="hover:text-sidebar-primary"
              onClick={() => { storage.clearHistory(); setHistory([]); }}
              title="Limpar"
            >
              <Trash2 className="h-3 w-3" />
            </button>
          )}
        </div>
        <div className="flex-1 overflow-auto px-2 py-2 space-y-1">
          {history.length === 0 && <p className="text-xs opacity-50 px-2">Nenhum produto ainda.</p>}
          {history.map((h) => (
            <button
              key={h.ean + h.at}
              onClick={() => reuseFromHistory(h.ean)}
              className="w-full text-left p-2 rounded hover:bg-sidebar-accent transition-colors"
            >
              <div className="text-xs font-mono opacity-70">{h.ean}</div>
              <div className="text-sm truncate">{h.descricao}</div>
            </button>
          ))}
        </div>

        <div className="p-3 border-t border-sidebar-border text-xs opacity-60">
          Modelo ativo:
          <select
            className="mt-1 w-full bg-sidebar-accent text-sidebar-accent-foreground rounded px-2 py-1 text-xs"
            value={activeTemplateId}
            onChange={(e) => { setActiveTemplateId(e.target.value); storage.setActiveTemplateId(e.target.value); }}
          >
            {templates.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {view === "scan" && (
          <div className="flex-1 grid grid-cols-1 xl:grid-cols-[1fr_380px] gap-4 p-6 overflow-auto no-print">
            <section className="space-y-6">
              <ProductSearch
                ref={inputRef}
                value={code}
                onChange={setCode}
                onSubmit={() => search()}
                loading={loading}
              />
              <div className="rounded-lg border bg-card p-6 min-h-[280px] flex items-center justify-center">
                {loading && <Loader2 className="h-10 w-10 animate-spin text-primary" />}
                {!loading && error && (
                  <div className="w-full max-w-3xl space-y-3">
                    <div className="text-destructive font-medium">{error}</div>
                    {errorDebug ? (
                      <pre className="max-h-64 overflow-auto rounded-md bg-muted p-3 text-xs text-muted-foreground whitespace-pre-wrap">
                        {JSON.stringify(errorDebug, null, 2)}
                      </pre>
                    ) : null}
                  </div>
                )}
                {!loading && !error && (
                  <LabelPreview template={activeTemplate} product={product} />
                )}
              </div>
            </section>

            <aside className="space-y-4">
              <div className="rounded-lg border bg-card p-4">
                <h2 className="font-semibold mb-3">Dados do produto</h2>
                {product ? (
                  <dl className="space-y-2 text-sm">
                    <Row label="EAN" value={product.ean} mono />
                    <Row label="Descrição" value={product.descricao} />
                    <Row label="Cód. interno" value={product.codigoInterno} mono />
                    <Row label="Seção" value={product.secao || product.grupo} />
                    <Row label="Preço varejo" value={product.precoVarejo != null ? `R$ ${product.precoVarejo.toFixed(2)}` : undefined} bold />
                    <Row label="Preço atacado" value={product.precoAtacado != null ? `R$ ${product.precoAtacado.toFixed(2)}` : undefined} />
                    <Row label="Estoque" value={product.estoque?.toString()} />
                  </dl>
                ) : (
                  <p className="text-sm text-muted-foreground">Bipe um código para começar.</p>
                )}
              </div>

              <div className="rounded-lg border bg-card p-4 space-y-3">
                <div>
                  <Label>Quantidade de etiquetas</Label>
                  <Input
                    type="number"
                    min={1}
                    value={copies}
                    onChange={(e) => setCopies(Math.max(1, +e.target.value || 1))}
                  />
                </div>
                <Button onClick={handlePrint} disabled={!product} className="w-full h-12 text-base">
                  <Printer /> Imprimir PRN {copies > 1 ? `(${copies})` : ""}
                </Button>
                <Button onClick={handleDownloadPrn} disabled={!product} variant="outline" className="w-full h-10">
                  <Download /> Baixar PRN
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

      {/* Print area (hidden on screen) */}
      <div className="hidden print:block">
        <LabelPreview template={activeTemplate} product={product} forPrint copies={copies} />
      </div>
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

function Row({ label, value, mono, bold }: { label: string; value?: string; mono?: boolean; bold?: boolean }) {
  return (
    <div className="flex justify-between gap-3 border-b last:border-0 pb-1">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={cn("text-right truncate", mono && "font-mono", bold && "font-bold text-base")}>{value || "—"}</dd>
    </div>
  );
}

export default Index;
