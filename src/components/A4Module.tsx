import { useEffect, useMemo, useRef, useState } from "react";
import { A4Template, A4FilledBlock } from "@/types/a4";
import { Product, VFConfig } from "@/types/label";
import { a4Storage, defaultA4Templates, newA4Template } from "@/services/a4Storage";
import { downloadA4Pdf, getA4RenderMetrics, getBlockRects, printA4Pdf, A4_WIDTH_MM, A4_HEIGHT_MM, getDynamicValue } from "@/services/a4PdfService";
import { requestPrintUserName } from "@/services/printUser";
import { storage } from "@/services/storage";
import { fetchProductByEan, VFError } from "@/api/varejoFacil";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { A4Editor } from "@/components/A4Editor";
import { A4NewTemplateWizard } from "@/components/A4NewTemplateWizard";
import { toast } from "sonner";
import {
  FileText,
  Printer,
  Download,
  Plus,
  Minus,
  Copy,
  Trash2,
  Pencil,
  Loader2,
  Repeat,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  config: VFConfig;
}

export function A4Module({ config }: Props) {
  const [tab, setTab] = useState<"print" | "editor">("print");
  const [templates, setTemplates] = useState<A4Template[]>(() => a4Storage.getTemplates());
  const [activeId, setActiveId] = useState<string>(() => a4Storage.getActive() || templates[0]?.id || "");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);

  // Fila de produtos para preenchimento sequencial
  const [productQueue, setProductQueue] = useState<Product[]>([]);
  const [repeatMode, setRepeatMode] = useState(false);
  const [zoom, setZoom] = useState(1.4);
  const inputRef = useRef<HTMLInputElement>(null);

  // Edição inline de preços
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editDe, setEditDe] = useState("");
  const [editPor, setEditPor] = useState("");

  // Wizard de novo modelo
  const [wizardOpen, setWizardOpen] = useState(false);

  const active = templates.find((t) => t.id === activeId) || templates[0];

  // Calculamos quantos blocos cabem em uma folha
  const blocksPerPage = useMemo(() => (active ? active.rows * active.cols : 1), [active]);

  // Preenchemos os blocos com base na fila e no modo de repetição
  const blocks = useMemo<A4FilledBlock[]>(() => {
    if (!active) return [];
    if (repeatMode && productQueue.length > 0) {
      return Array.from({ length: blocksPerPage }, () => ({ product: productQueue[0] }));
    }
    // No modo sequencial, mostramos exatamente o que está na fila (limitado ao que cabe em telas de preview, mas o PDF gera tudo)
    // Para o preview, vamos mostrar apenas a primeira página
    return Array.from({ length: blocksPerPage }, (_, i) => ({ product: productQueue[i] || null }));
  }, [active, productQueue, repeatMode, blocksPerPage]);

  const persist = (next: A4Template[], nextActive?: string) => {
    setTemplates(next);
    a4Storage.saveTemplates(next);
    if (nextActive) {
      setActiveId(nextActive);
      a4Storage.setActive(nextActive);
    }
  };

  const updateActive = (t: A4Template) => {
    persist(templates.map((x) => (x.id === t.id ? t : x)));
  };

  const handleNew = () => setWizardOpen(true);

  const handleWizardConfirm = (t: A4Template) => {
    persist([...templates, t], t.id);
    setWizardOpen(false);
    setTab("editor");
  };

  const handleDuplicate = () => {
    if (!active) return;
    const dup: A4Template = { ...active, id: `a4-${Date.now()}`, name: `${active.name} (cópia)` };
    persist([...templates, dup], dup.id);
  };

  const handleDelete = () => {
    if (!active || templates.length <= 1) return toast.error("Mantenha pelo menos um modelo");
    const next = templates.filter((t) => t.id !== active.id);
    persist(next, next[0].id);
  };

  const handleRestore = () => {
    persist(defaultA4Templates(), defaultA4Templates()[0].id);
    toast.success("Modelos padrão restaurados");
  };

  const search = async () => {
    const ean = code.trim();
    if (!ean) return;
    setLoading(true);
    try {
      const p = await fetchProductByEan(config, ean);
      if (repeatMode) {
        setProductQueue([p]);
      } else {
        setProductQueue(prev => [...prev, p]);
      }
      setCode("");
      toast.success(`${p.descricao.slice(0, 20)}... adicionado`);
    } catch (e) {
      toast.error(e instanceof VFError ? e.message : "Erro ao buscar produto");
    } finally {
      setLoading(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  };

  const clearQueue = () => {
    setProductQueue([]);
  };

  const removeFromQueue = (index: number) => {
    setProductQueue(prev => prev.filter((_, i) => i !== index));
  };

  const startEdit = (index: number) => {
    const p = productQueue[index];
    setEditDe(p.precoOriginal != null ? p.precoOriginal.toFixed(2).replace(".", ",") : "");
    setEditPor(p.precoVarejo != null ? p.precoVarejo.toFixed(2).replace(".", ",") : "");
    setEditingIndex(index);
  };

  const confirmEdit = () => {
    if (editingIndex === null) return;
    const parseBRL = (v: string) => {
      const n = parseFloat(v.replace(",", "."));
      return isNaN(n) ? undefined : n;
    };
    setProductQueue(prev =>
      prev.map((p, i) =>
        i === editingIndex
          ? { ...p, precoOriginal: parseBRL(editDe), precoVarejo: parseBRL(editPor) }
          : p
      )
    );
    setEditingIndex(null);
  };

  const handleDownload = async () => {
    if (!active || productQueue.length === 0) return toast.error("Bipe pelo menos um produto");
    try {
      const fullProducts = repeatMode
        ? Array.from({ length: blocksPerPage }, () => productQueue[0])
        : productQueue;
      downloadA4Pdf(active, fullProducts, `${active.name.replace(/\s+/g, "_")}.pdf`);
      toast.success("PDF gerado com sucesso");
    } catch (e) {
      toast.error("Erro ao gerar PDF: " + (e instanceof Error ? e.message : String(e)));
    }
  };

  const handlePrint = async () => {
    if (!active || productQueue.length === 0) return toast.error("Bipe pelo menos um produto");
    const currentConfig = storage.getConfig();
    const usuario = requestPrintUserName();

    const fullProducts = repeatMode
      ? Array.from({ length: blocksPerPage }, () => productQueue[0])
      : productQueue;

    try {
      toast.loading("Enviando para impressora...", { id: "a4-print" });
      await printA4Pdf(active, fullProducts, currentConfig.a4PrinterName);
      toast.success(
        currentConfig.a4PrinterName
          ? `Impresso em ${currentConfig.a4PrinterName}`
          : "PDF aberto no visualizador padrão",
        { id: "a4-print" }
      );
      productQueue.forEach((product) => {
        storage.pushPrintEvent({
          ean: product.ean,
          descricao: product.descricao,
          quantidade: 1,
          templateId: active.id,
          at: Date.now(),
          durationMs: 0,
          status: "success",
          precoVarejo: product.precoVarejo,
          precoAtacado: product.precoAtacado,
          estoque: product.estoque,
          secao: product.secao,
          grupo: product.grupo,
          codigoInterno: product.codigoInterno,
          usuario,
        });
      });
    } catch (e) {
      toast.error("Erro ao imprimir: " + (e instanceof Error ? e.message : String(e)), { id: "a4-print" });
    }
  };

  if (!active) {
    return (
      <div className="p-6">
        <Button onClick={handleRestore}>Carregar modelos padrão</Button>
      </div>
    );
  }

  return (
    <>
    <A4NewTemplateWizard open={wizardOpen} onClose={() => setWizardOpen(false)} onConfirm={handleWizardConfirm} />
    <div className="flex h-full flex-col overflow-hidden">
      {/* Toolbar do módulo */}
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b bg-card px-4 py-2 text-xs">
        <FileText className="h-4 w-4 text-primary" />
        <strong>A4 / Folha de Etiquetas</strong>

        <select
          className="ml-2 h-8 rounded border bg-background px-2 text-xs"
          value={active.id}
          onChange={(e) => { setActiveId(e.target.value); a4Storage.setActive(e.target.value); }}
        >
          {templates.map((t) => (
            <option key={t.id} value={t.id}>{t.name} ({t.rows}x{t.cols})</option>
          ))}
        </select>

        <Button size="sm" variant="outline" className="h-8 text-xs" onClick={handleNew}>
          <Plus className="h-3.5 w-3.5" /> Novo
        </Button>
        <Button size="sm" variant="outline" className="h-8 text-xs" onClick={handleDuplicate}>
          <Copy className="h-3.5 w-3.5" /> Duplicar
        </Button>
        <Button size="sm" variant="outline" className="h-8 text-xs text-destructive" onClick={handleDelete}>
          <Trash2 className="h-3.5 w-3.5" /> Excluir
        </Button>
        <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={handleRestore}>
          Restaurar padrão
        </Button>

        <div className="ml-auto">
          <Tabs value={tab} onValueChange={(v) => setTab(v as "print" | "editor")}>
            <TabsList className="h-8">
              <TabsTrigger value="print" className="text-xs h-7"><Printer className="h-3 w-3 mr-1" />Imprimir</TabsTrigger>
              <TabsTrigger value="editor" className="text-xs h-7"><Pencil className="h-3 w-3 mr-1" />Editor</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </div>

      {tab === "editor" && (
        <div className="flex-1 overflow-hidden p-3">
          <A4Editor template={active} product={productQueue[0] || null} onChange={updateActive} />
        </div>
      )}

      {tab === "print" && (
        <div className="grid flex-1 grid-cols-1 gap-4 overflow-auto p-4 lg:grid-cols-[1fr_minmax(300px,420px)]">
          <section className="space-y-4">
            <div className="rounded-lg border bg-card p-4">
              <div className="flex items-center justify-between">
                <Label className="text-xs uppercase opacity-60">Bipar produtos para a folha</Label>
                <div className="flex items-center gap-4">
                  <label className="flex items-center gap-2 text-xs cursor-pointer">
                    <input
                      type="checkbox"
                      checked={repeatMode}
                      onChange={(e) => {
                        setRepeatMode(e.target.checked);
                        if (e.target.checked && productQueue.length > 1) {
                          setProductQueue([productQueue[0]]);
                        }
                      }}
                    />
                    <Repeat className="h-3.5 w-3.5" />
                    Repetir 1º produto na folha toda
                  </label>
                </div>
              </div>
              
              <div className="mt-2 flex gap-2">
                <Input
                  ref={inputRef}
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && search()}
                  placeholder="Bipe o EAN do produto..."
                  className="h-12 text-lg"
                  autoFocus
                />
                <Button onClick={search} disabled={loading} className="h-12 px-6">
                  {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : "Adicionar"}
                </Button>
              </div>

              <div className="mt-2 flex items-center justify-between text-[11px]">
                <span className="text-muted-foreground">
                  {repeatMode 
                    ? "O produto bipado preencherá todos os blocos da página." 
                    : `Fila atual: ${productQueue.length} etiqueta(s). ${Math.ceil(productQueue.length / blocksPerPage)} página(s) necessária(s).`}
                </span>
                {productQueue.length > 0 && (
                   <Button size="sm" variant="ghost" onClick={clearQueue} className="h-6 text-destructive px-2">
                    <Trash2 className="h-3 w-3 mr-1" /> Limpar fila
                  </Button>
                )}
              </div>
            </div>

            {/* Lista da Fila */}
            {!repeatMode && productQueue.length > 0 && (
              <div className="rounded-lg border bg-card p-4">
                <h3 className="mb-3 text-sm font-semibold flex items-center gap-2">
                  Fila de Impressão
                  <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] text-primary">
                    {productQueue.length} itens
                  </span>
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-[300px] overflow-auto pr-1">
                  {productQueue.map((p, i) => (
                    <div key={i} className="group relative rounded border bg-background p-2 transition-hover hover:border-primary/50">
                      {editingIndex === i ? (
                        <div className="space-y-1.5">
                          <div className="truncate text-xs font-medium">{p.descricao}</div>
                          <div className="flex gap-2">
                            <div className="flex-1">
                              <label className="text-[10px] text-muted-foreground">De R$</label>
                              <Input
                                value={editDe}
                                onChange={(e) => setEditDe(e.target.value)}
                                onKeyDown={(e) => e.key === "Enter" && confirmEdit()}
                                className="h-7 text-xs mt-0.5"
                                placeholder="0,00"
                                autoFocus
                              />
                            </div>
                            <div className="flex-1">
                              <label className="text-[10px] text-muted-foreground">Por R$</label>
                              <Input
                                value={editPor}
                                onChange={(e) => setEditPor(e.target.value)}
                                onKeyDown={(e) => e.key === "Enter" && confirmEdit()}
                                className="h-7 text-xs mt-0.5"
                                placeholder="0,00"
                              />
                            </div>
                            <div className="flex items-end gap-1 pb-0.5">
                              <button
                                onClick={confirmEdit}
                                className="rounded bg-primary px-2 py-1 text-[10px] font-bold text-primary-foreground hover:bg-primary/90"
                              >
                                OK
                              </button>
                              <button
                                onClick={() => setEditingIndex(null)}
                                className="rounded border px-2 py-1 text-[10px] hover:bg-muted"
                              >
                                ✕
                              </button>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="truncate text-xs font-medium">{p.descricao}</div>
                            <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                              <span className="font-mono">{p.ean}</span>
                              <span>•</span>
                              {p.precoOriginal && p.precoOriginal > (p.precoVarejo || 0) ? (
                                <>
                                  <span className="line-through opacity-60">R$ {p.precoOriginal.toFixed(2).replace(".", ",")}</span>
                                  <span className="text-primary font-bold">R$ {p.precoVarejo?.toFixed(2).replace(".", ",")}</span>
                                </>
                              ) : (
                                <span className="text-primary font-bold">R$ {p.precoVarejo?.toFixed(2).replace(".", ",")}</span>
                              )}
                            </div>
                          </div>
                          <div className="flex opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                              onClick={() => startEdit(i)}
                              className="p-1 hover:text-primary"
                              title="Editar preços"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                            <button
                              onClick={() => removeFromQueue(i)}
                              className="p-1 hover:text-destructive"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>
                      )}
                      <div className="absolute -left-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-muted text-[8px] font-bold shadow-sm">
                        {i + 1}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <Button onClick={handleDownload} disabled={productQueue.length === 0} variant="outline" className="h-14 gap-2 border-2">
                <Download className="h-5 w-5" /> 
                <div className="flex flex-col items-start">
                  <span>Gerar PDF</span>
                  <span className="text-[10px] opacity-60">Para salvar ou e-mail</span>
                </div>
              </Button>
              <Button onClick={handlePrint} disabled={productQueue.length === 0} variant="default" className="h-14 gap-2 shadow-lg">
                <Printer className="h-5 w-5" /> 
                <div className="flex flex-col items-start text-left">
                  <span>Imprimir Agora</span>
                  <span className="text-[10px] opacity-80">Enviar direto p/ impressora</span>
                </div>
              </Button>
            </div>
          </section>

          <aside className="rounded-lg border bg-card p-3 flex flex-col h-full overflow-hidden">
            <div className="flex items-center justify-between mb-2">
              <Label className="text-xs uppercase opacity-60">Visualização da 1ª Página</Label>
              <div className="flex items-center gap-1 bg-muted/50 rounded-md p-0.5">
                <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => setZoom(z => Math.max(0.4, z - 0.2))}>
                  <Minus className="h-3 w-3" />
                </Button>
                <span className="text-[10px] font-bold w-9 text-center">{Math.round(zoom * 100)}%</span>
                <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => setZoom(z => Math.min(3, z + 0.2))}>
                  <Plus className="h-3 w-3" />
                </Button>
              </div>
            </div>
            <div className="flex-1 overflow-auto bg-muted/30 rounded border p-2">
               <A4Preview template={active} blocks={blocks} zoom={zoom} />
            </div>
            <p className="mt-2 text-center text-[10px] text-muted-foreground italic">
              * A visualização mostra como os produtos serão organizados na folha.
            </p>
          </aside>
        </div>
      )}
    </div>
    </>
  );
}

const PREVIEW_SCALE = 1.6;

function A4Preview({ template, blocks, zoom }: { template: A4Template; blocks: A4FilledBlock[]; zoom: number }) {
  const rects = useMemo(() => getBlockRects(template), [template]);
  
  return (
    <div
      className="mx-auto bg-white shadow-xl origin-top"
      style={{
        width: A4_WIDTH_MM * zoom,
        height: A4_HEIGHT_MM * zoom,
        position: "relative",
      }}
    >
      {rects.map((rect, i) => {
        const render = getA4RenderMetrics(template, rect);
        const product = blocks[i]?.product || null;
        
        return (
          <div
            key={i}
            className="absolute border border-dashed border-muted-foreground/20 overflow-hidden"
            style={{
              left: rect.x * zoom,
              top: rect.y * zoom,
              width: rect.width * zoom,
              height: rect.height * zoom,
            }}
          >
            {template.showBorder && (
               <div className="absolute inset-0 border border-muted/50" />
            )}
            
            <div
              className="absolute"
              style={{
                left: (render.x - rect.x) * zoom,
                top: (render.y - rect.y) * zoom,
              }}
            >
              {template.elements.map((el) => {
                const text =
                  el.type === "text"
                    ? el.text || ""
                    : el.type === "dynamic"
                      ? `${el.prefix || ""}${getDynamicValue(el.field, product)}`
                      : "";
                return (
                  <div
                    key={el.id}
                    className="absolute overflow-hidden"
                    style={{
                      left: el.x * render.scale * zoom,
                      top: el.y * render.scale * zoom,
                      width: el.widthMm * render.scale * zoom,
                      height: el.heightMm * render.scale * zoom,
                    }}
                  >
                    {el.type === "shape" ? (
                      <div
                        className={cn(
                          "h-full w-full",
                          el.shapeKind !== "line" && "border",
                          el.shapeKind === "circle" && "rounded-full",
                          el.shapeKind === "roundRect" && "rounded-sm",
                        )}
                        style={
                          el.shapeKind === "line"
                            ? {
                                borderTop: `${Math.max(1, (el.strokeWidthMm || 1) * render.scale * zoom)}px solid ${el.strokeColor || "#000"}`,
                                marginTop: "50%",
                              }
                            : {
                                backgroundColor: el.fillColor || "#e60000",
                                borderColor: el.strokeColor || el.fillColor || "#e60000",
                                borderWidth: `${(el.strokeWidthMm || 0) * render.scale * zoom}px`,
                                opacity: el.opacity ?? 1,
                              }
                        }
                      />
                    ) : el.type === "image" || (el.type === "dynamic" && el.field === "imageUrl") ? (
                      (el.type === "image" ? el.imageDataUrl : product?.imageUrl) ? (
                        <img
                          src={el.type === "image" ? el.imageDataUrl : product?.imageUrl}
                          alt={el.imageName || "arte"}
                          className="h-full w-full"
                          style={{
                            objectFit:
                              el.imageFit === "contain" ? "contain" : el.imageFit === "cover" ? "cover" : "fill",
                          }}
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center bg-muted/20 text-[8px] text-muted-foreground">
                          {el.field === "imageUrl" ? "Foto ERP" : "Sem Imagem"}
                        </div>
                      )
                    ) : el.type === "barcode" ? (
                      <div className="flex h-full w-full items-center justify-center bg-muted/40 text-[7px] leading-tight font-mono text-center">
                        ▮▮▮▮<br />{product?.ean || "EAN"}
                      </div>
                    ) : (
                      <div
                        style={{
                          fontSize: `${el.fontSize * render.scale * (zoom / 4)}pt`, // Ajuste de escala proporcional ao zoom
                          fontWeight: el.bold ? 700 : 400,
                          fontStyle: el.italic ? "italic" : "normal",
                          textAlign: el.align || "left",
                          color: el.color || "#000",
                          lineHeight: 1.1,
                        }}
                      >
                        {text}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
