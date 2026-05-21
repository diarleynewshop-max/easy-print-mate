import { useEffect, useMemo, useRef, useState } from "react";
import { A4Template, A4FilledBlock, A4BlockCount } from "@/types/a4";
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
import { toast } from "sonner";
import {
  FileText,
  Printer,
  Download,
  Plus,
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
  const [blocks, setBlocks] = useState<A4FilledBlock[]>([]);
  const [activeBlock, setActiveBlock] = useState(0);
  const [repeatMode, setRepeatMode] = useState(true);
  const [printBlocks, setPrintBlocks] = useState<A4BlockCount>(1);
  const inputRef = useRef<HTMLInputElement>(null);

  const active = templates.find((t) => t.id === activeId) || templates[0];
  const printTemplate = active ? { ...active, blocks: printBlocks, sourceBlocks: active.blocks } : active;

  // resetar blocos quando trocar template (qtd de blocos pode mudar)
  useEffect(() => {
    if (!active) return;
    setPrintBlocks(active.blocks);
    setBlocks(Array.from({ length: active.blocks }, () => ({ product: null })));
    setActiveBlock(0);
  }, [active, active?.id, active?.blocks]);

  const changePrintBlocks = (count: A4BlockCount) => {
    setPrintBlocks(count);
    setBlocks((prev) => Array.from({ length: count }, (_, i) => prev[i] || { product: null }));
    setActiveBlock((current) => Math.min(current, count - 1));
  };

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

  const handleNew = () => {
    const t = newA4Template(active?.blocks || 1);
    persist([...templates, t], t.id);
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

  const fillBlock = (index: number, product: Product) => {
    setBlocks((prev) => {
      const next = [...prev];
      if (repeatMode) {
        for (let i = 0; i < next.length; i++) next[i] = { product };
      } else {
        next[index] = { product };
      }
      return next;
    });
    if (!repeatMode) {
      setActiveBlock(Math.min(index + 1, printBlocks - 1));
    }
  };

  const search = async () => {
    const ean = code.trim();
    if (!ean) return;
    if (!active) return;
    setLoading(true);
    try {
      const p = await fetchProductByEan(config, ean);
      fillBlock(activeBlock, p);
      setCode("");
    } catch (e) {
      toast.error(e instanceof VFError ? e.message : "Erro ao buscar produto");
    } finally {
      setLoading(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  };

  const clearBlock = (i: number) => {
    setBlocks((prev) => {
      const next = [...prev];
      next[i] = { product: null };
      return next;
    });
  };

  const clearAll = () => {
    if (!active) return;
    setBlocks(Array.from({ length: printBlocks }, () => ({ product: null })));
    setActiveBlock(0);
  };

  const products = useMemo(() => blocks.map((b) => b.product), [blocks]);
  const hasAnyProduct = blocks.some((b) => b.product);

  const handleDownload = () => {
    if (!active) return;
    if (!hasAnyProduct) return toast.error("Bipe pelo menos um produto");
    downloadA4Pdf(printTemplate, products, `${active.name.replace(/\s+/g, "_")}_${printBlocks}por_folha.pdf`);
    toast.success("PDF gerado");
  };

  const handlePrint = () => {
    if (!active) return;
    if (!hasAnyProduct) return toast.error("Bipe pelo menos um produto");
    const usuario = requestPrintUserName();
    if (config.a4PrinterName) {
      toast.info(`No dialogo do Windows, escolha a impressora A4: ${config.a4PrinterName}`);
    }
    printA4Pdf(printTemplate, products);
    products.forEach((product) => {
      if (!product) return;
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
  };

  if (!active) {
    return (
      <div className="p-6">
        <Button onClick={handleRestore}>Carregar modelos padrão</Button>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Toolbar do módulo */}
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b bg-card px-4 py-2 text-xs">
        <FileText className="h-4 w-4 text-primary" />
        <strong>Etiquetas A4 / PDF</strong>

        <select
          className="ml-2 h-8 rounded border bg-background px-2 text-xs"
          value={active.id}
          onChange={(e) => { setActiveId(e.target.value); a4Storage.setActive(e.target.value); }}
        >
          {templates.map((t) => (
            <option key={t.id} value={t.id}>{t.name} · {t.blocks}/folha</option>
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
          <A4Editor template={active} product={blocks[0]?.product || null} onChange={updateActive} />
        </div>
      )}

      {tab === "print" && (
        <div className="grid flex-1 grid-cols-1 gap-4 overflow-auto p-4 lg:grid-cols-[1fr_460px]">
          <section className="space-y-3">
            <div className="rounded-lg border bg-card p-4">
              <Label className="text-xs uppercase opacity-60">Bipar produto</Label>
              <div className="mt-2 flex gap-2">
                <Input
                  ref={inputRef}
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && search()}
                  placeholder="Bipe ou digite o EAN..."
                  className="h-12 text-lg"
                  autoFocus
                />
                <Button onClick={search} disabled={loading} className="h-12 px-6">
                  {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : "Buscar"}
                </Button>
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-3 text-xs">
                <div className="flex items-center gap-1">
                  <span className="mr-1 opacity-70">Dividir A4:</span>
                  {([1, 2, 4] as const).map((count) => (
                    <Button
                      key={count}
                      type="button"
                      size="sm"
                      variant={printBlocks === count ? "default" : "outline"}
                      className="h-7 px-2 text-xs"
                      onClick={() => changePrintBlocks(count)}
                    >
                      {count}/folha
                    </Button>
                  ))}
                </div>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={repeatMode}
                    onChange={(e) => setRepeatMode(e.target.checked)}
                  />
                  <Repeat className="h-3.5 w-3.5" />
                  Repetir o mesmo produto em todos os blocos
                </label>
                {!repeatMode && (
                  <span className="rounded bg-primary/10 px-2 py-0.5 text-primary">
                    Bipando para o bloco {activeBlock + 1} de {printBlocks}
                  </span>
                )}
              </div>
            </div>

            {/* Blocos */}
            <div className="rounded-lg border bg-card p-4">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-semibold">Blocos da folha ({printBlocks})</h3>
                <Button size="sm" variant="ghost" onClick={clearAll}>
                  <Trash2 className="h-3.5 w-3.5" /> Limpar tudo
                </Button>
              </div>
              <div
                className={cn(
                  "grid gap-2",
                  printBlocks === 1 && "grid-cols-1",
                  printBlocks === 2 && "grid-cols-1",
                  printBlocks === 4 && "grid-cols-2",
                )}
              >
                {blocks.map((b, i) => (
                  <div
                    key={i}
                    onClick={() => !repeatMode && setActiveBlock(i)}
                    className={cn(
                      "relative cursor-pointer rounded border bg-background p-3 text-sm transition-colors",
                      !repeatMode && activeBlock === i && "border-primary ring-2 ring-primary/30",
                    )}
                  >
                    <div className="mb-1 flex items-center justify-between">
                      <span className="text-[10px] uppercase opacity-60">Bloco {i + 1}</span>
                      {b.product && (
                        <button
                          onClick={(e) => { e.stopPropagation(); clearBlock(i); }}
                          className="opacity-60 hover:text-destructive"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                    {b.product ? (
                      <div>
                        <div className="font-mono text-[10px] text-muted-foreground">{b.product.ean}</div>
                        <div className="truncate text-xs font-medium">{b.product.descricao}</div>
                        <div className="text-xs">
                          {b.product.precoVarejo != null && <span>R$ {b.product.precoVarejo.toFixed(2).replace(".", ",")}</span>}
                        </div>
                      </div>
                    ) : (
                      <div className="text-xs italic opacity-50">vazio — bipe um produto</div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <Button onClick={handleDownload} disabled={!hasAnyProduct} className="h-12">
                <Download className="h-4 w-4" /> Gerar PDF
              </Button>
              <Button onClick={handlePrint} disabled={!hasAnyProduct} variant="default" className="h-12">
                <Printer className="h-4 w-4" /> Imprimir PDF
              </Button>
            </div>
          </section>

          <aside className="rounded-lg border bg-card p-3">
            <Label className="text-xs uppercase opacity-60">Pré-visualização A4</Label>
            <A4Preview template={printTemplate} blocks={blocks} />
          </aside>
        </div>
      )}
    </div>
  );
}

const PREVIEW_SCALE = 1.4;

function A4Preview({ template, blocks }: { template: A4Template; blocks: A4FilledBlock[] }) {
  const rects = getBlockRects(template.blocks);
  return (
    <div className="mt-2 overflow-auto rounded bg-muted/30 p-3">
      <div
        className="mx-auto bg-white shadow"
        style={{
          width: A4_WIDTH_MM * PREVIEW_SCALE,
          height: A4_HEIGHT_MM * PREVIEW_SCALE,
          position: "relative",
        }}
      >
        {rects.map((rect, i) => {
          const render = getA4RenderMetrics(template, rect);
          return (
          <div
            key={i}
            className="absolute border border-dashed border-primary/30"
            style={{
              left: rect.x * PREVIEW_SCALE,
              top: rect.y * PREVIEW_SCALE,
              width: rect.width * PREVIEW_SCALE,
              height: rect.height * PREVIEW_SCALE,
            }}
          >
            <div
              className="absolute"
              style={{
                left: (render.x - rect.x) * PREVIEW_SCALE,
                top: (render.y - rect.y) * PREVIEW_SCALE,
              }}
            >
              {template.elements.map((el) => {
                const text =
                  el.type === "text"
                    ? el.text || ""
                    : el.type === "dynamic"
                      ? `${el.prefix || ""}${getDynamicValue(el.field, blocks[i]?.product || null)}`
                      : "";
                return (
                  <div
                    key={el.id}
                    className="absolute overflow-hidden"
                    style={{
                      left: el.x * render.scale * PREVIEW_SCALE,
                      top: el.y * render.scale * PREVIEW_SCALE,
                      width: el.widthMm * render.scale * PREVIEW_SCALE,
                      height: el.heightMm * render.scale * PREVIEW_SCALE,
                    }}
                  >
                    {el.type === "shape" ? (
                      <div
                        className={cn(
                          "h-full w-full",
                          el.shapeKind !== "line" && "border",
                          el.shapeKind === "circle" && "rounded-full",
                          el.shapeKind === "roundRect" && "rounded-full",
                        )}
                        style={
                          el.shapeKind === "line"
                            ? {
                                borderTop: `${Math.max(1, (el.strokeWidthMm || 1) * render.scale * PREVIEW_SCALE)}px solid ${el.strokeColor || "#000"}`,
                                marginTop: "50%",
                              }
                            : {
                                backgroundColor: el.fillColor || "#e60000",
                                borderColor: el.strokeColor || el.fillColor || "#e60000",
                                borderWidth: `${(el.strokeWidthMm || 0) * render.scale * PREVIEW_SCALE}px`,
                                opacity: el.opacity ?? 1,
                              }
                        }
                      />
                    ) : el.type === "image" ? (
                      el.imageDataUrl ? (
                        <img
                          src={el.imageDataUrl}
                          alt={el.imageName || "arte"}
                          className="h-full w-full"
                          style={{
                            objectFit:
                              el.imageFit === "contain" ? "contain" : el.imageFit === "cover" ? "cover" : "fill",
                          }}
                        />
                      ) : null
                    ) : el.type === "barcode" ? (
                      <div className="flex h-full w-full items-center justify-center bg-muted/40 text-[9px]">
                        ▮▯▮▯ {blocks[i]?.product?.ean || "EAN"}
                      </div>
                    ) : (
                      <div
                        style={{
                          fontSize: `${el.fontSize * render.scale * 0.6}pt`,
                          fontWeight: el.bold ? 700 : 400,
                          fontStyle: el.italic ? "italic" : "normal",
                          textAlign: el.align || "left",
                          color: el.color || "#000",
                          lineHeight: 1.05,
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
    </div>
  );
}
