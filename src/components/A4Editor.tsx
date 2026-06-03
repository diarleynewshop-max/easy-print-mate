import { useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { A4DynamicKey, A4Element, A4ElementType, A4ShapeKind, A4Template } from "@/types/a4";
import { A4_HEIGHT_MM, A4_WIDTH_MM, getBlockRects, getDynamicValue } from "@/services/a4PdfService";
import { Product } from "@/types/label";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  BadgePercent,
  Barcode as BarcodeIcon,
  Bold as BoldIcon,
  Circle,
  Database,
  Image as ImageIcon,
  Layers,
  Minus,
  Square,
  Trash2,
  Type,
} from "lucide-react";
import { cn } from "@/lib/utils";

const MM_TO_PX = 2.4;

interface Props {
  template: A4Template;
  product: Product | null;
  onChange: (t: A4Template) => void;
}

const DYNAMIC_LABELS: Record<A4DynamicKey, string> = {
  descricao: "Descricao",
  ean: "EAN",
  codigoInterno: "Codigo interno",
  precoVarejo: "Preco varejo",
  precoAtacado: "Preco atacado",
  secao: "Secao",
  grupo: "Grupo",
  estoque: "Estoque",
};

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

export function A4Editor({ template, product, onChange }: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const blockRects = useMemo(() => getBlockRects(template), [template]);
  const firstBlock = blockRects[0];
  const imageInputRef = useRef<HTMLInputElement>(null);
  const selected = template.elements.find((e) => e.id === selectedId) || null;

  const update = (patch: Partial<A4Template>) => onChange({ ...template, ...patch });

  const addElement = (type: A4ElementType) => {
    const base: A4Element = {
      id: uid(),
      type,
      x: 2,
      y: 2,
      widthMm: type === "barcode" ? 30 : 20,
      heightMm: type === "barcode" ? 10 : 5,
      fontSize: type === "barcode" ? 6 : 10,
      align: "left",
      ...(type === "text" ? { text: "Texto fixo" } : {}),
      ...(type === "dynamic" ? { field: "descricao" as A4DynamicKey } : {}),
      ...(type === "barcode" ? { barcodeFormat: "auto", barcodeDisplayValue: true } : {}),
    };
    onChange({ ...template, elements: [...template.elements, base] });
    setSelectedId(base.id);
  };

  const addTextElement = (text: string, fontSize: number, bold = false) => {
    const base: A4Element = {
      id: uid(),
      type: "text",
      x: 2,
      y: 2,
      widthMm: Math.max(10, firstBlock.width - template.paddingMm * 2 - 4),
      heightMm: Math.max(5, fontSize * 0.5),
      fontSize,
      bold,
      align: "center",
      text,
      color: "#000000",
    };
    onChange({ ...template, elements: [...template.elements, base] });
    setSelectedId(base.id);
  };

  const addDynamicElement = (field: A4DynamicKey, prefix = "") => {
    const isPreco = field === "precoVarejo";
    const base: A4Element = {
      id: uid(),
      type: "dynamic",
      x: 2,
      y: isPreco ? 10 : 2,
      widthMm: Math.max(10, firstBlock.width - template.paddingMm * 2 - 4),
      heightMm: isPreco ? 8 : 4,
      fontSize: isPreco ? 16 : 8,
      bold: isPreco || field === "descricao",
      align: "center",
      field,
      prefix,
      color: isPreco ? "#e60000" : "#000000",
    };
    onChange({ ...template, elements: [...template.elements, base] });
    setSelectedId(base.id);
  };

  const addShapeElement = (shapeKind: A4ShapeKind, preset?: Partial<A4Element>) => {
    const base: A4Element = {
      id: uid(),
      type: "shape",
      x: 2,
      y: 2,
      widthMm: shapeKind === "line" ? Math.max(10, firstBlock.width - template.paddingMm * 2 - 4) : 10,
      heightMm: shapeKind === "line" ? 1 : 10,
      fontSize: 10,
      align: "center",
      shapeKind,
      fillColor: shapeKind === "line" ? "#000000" : "#e60000",
      strokeColor: shapeKind === "line" ? "#000000" : "#e60000",
      strokeWidthMm: shapeKind === "line" ? 0.5 : 0,
      ...preset,
    };
    onChange({ ...template, elements: [...template.elements, base] });
    setSelectedId(base.id);
  };

  const addImageElement = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      const base: A4Element = {
        id: uid(),
        type: "image",
        x: 0,
        y: 0,
        widthMm: Math.max(10, firstBlock.width - template.paddingMm * 2),
        heightMm: Math.max(10, firstBlock.height - template.paddingMm * 2),
        fontSize: 10,
        align: "center",
        imageDataUrl: String(reader.result || ""),
        imageName: file.name,
        imageFit: "stretch",
      };
      onChange({ ...template, elements: [base, ...template.elements] });
      setSelectedId(base.id);
    };
    reader.readAsDataURL(file);
  };

  const updateElement = (id: string, patch: Partial<A4Element>) => {
    onChange({
      ...template,
      elements: template.elements.map((el) => (el.id === id ? { ...el, ...patch } : el)),
    });
  };

  const removeElement = (id: string) => {
    onChange({ ...template, elements: template.elements.filter((el) => el.id !== id) });
    if (selectedId === id) setSelectedId(null);
  };

  const moveLayer = (id: string, direction: "up" | "down") => {
    const index = template.elements.findIndex((el) => el.id === id);
    const target = direction === "up" ? index + 1 : index - 1;
    if (index < 0 || target < 0 || target >= template.elements.length) return;
    const next = [...template.elements];
    [next[index], next[target]] = [next[target], next[index]];
    onChange({ ...template, elements: next });
  };

  const startDrag = (e: React.PointerEvent, el: A4Element, mode: "move" | "resize") => {
    e.preventDefault();
    e.stopPropagation();
    setSelectedId(el.id);
    const startX = e.clientX;
    const startY = e.clientY;
    const start = { x: el.x, y: el.y, w: el.widthMm, h: el.heightMm };

    const onMove = (ev: PointerEvent) => {
      const dx = (ev.clientX - startX) / MM_TO_PX;
      const dy = (ev.clientY - startY) / MM_TO_PX;
      if (mode === "move") {
        updateElement(el.id, {
          x: Math.max(0, Math.round((start.x + dx) * 10) / 10),
          y: Math.max(0, Math.round((start.y + dy) * 10) / 10),
        });
      } else {
        updateElement(el.id, {
          widthMm: Math.max(1, Math.round((start.w + dx) * 10) / 10),
          heightMm: Math.max(1, Math.round((start.h + dy) * 10) / 10),
        });
      }
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  return (
    <div className="grid h-full grid-cols-[300px_1fr_320px] gap-3 overflow-hidden">
      <div className="flex flex-col gap-3 overflow-auto rounded-lg border bg-card p-3">
        <Panel title="Modelo">
          <Label className="text-xs">Nome</Label>
          <Input value={template.name} onChange={(e) => update({ name: e.target.value })} className="h-8 text-sm" />

          <div className="mt-3 grid grid-cols-2 gap-2">
            <div>
              <Label className="text-[10px] uppercase opacity-60">Linhas</Label>
              <Input type="number" value={template.rows} onChange={(e) => update({ rows: Math.max(1, Number(e.target.value) || 1) })} className="h-8 text-sm" />
            </div>
            <div>
              <Label className="text-[10px] uppercase opacity-60">Colunas</Label>
              <Input type="number" value={template.cols} onChange={(e) => update({ cols: Math.max(1, Number(e.target.value) || 1) })} className="h-8 text-sm" />
            </div>
          </div>

          <div className="mt-2 grid grid-cols-2 gap-2">
            <div>
              <Label className="text-[10px] uppercase opacity-60">Esp. Linha</Label>
              <Input type="number" step="0.1" value={template.rowGap} onChange={(e) => update({ rowGap: Number(e.target.value) || 0 })} className="h-8 text-sm" />
            </div>
            <div>
              <Label className="text-[10px] uppercase opacity-60">Esp. Coluna</Label>
              <Input type="number" step="0.1" value={template.colGap} onChange={(e) => update({ colGap: Number(e.target.value) || 0 })} className="h-8 text-sm" />
            </div>
          </div>

          <Label className="mt-3 block text-xs">Margens da Folha (mm)</Label>
          <div className="grid grid-cols-2 gap-1">
            <Input type="number" placeholder="Topo" value={template.marginTop} onChange={(e) => update({ marginTop: Number(e.target.value) || 0 })} className="h-8 text-sm" title="Topo" />
            <Input type="number" placeholder="Base" value={template.marginBottom} onChange={(e) => update({ marginBottom: Number(e.target.value) || 0 })} className="h-8 text-sm" title="Base" />
            <Input type="number" placeholder="Esq" value={template.marginLeft} onChange={(e) => update({ marginLeft: Number(e.target.value) || 0 })} className="h-8 text-sm" title="Esquerda" />
            <Input type="number" placeholder="Dir" value={template.marginRight} onChange={(e) => update({ marginRight: Number(e.target.value) || 0 })} className="h-8 text-sm" title="Direita" />
          </div>

          <Label className="mt-3 block text-xs">Padding Interno do Bloco (mm)</Label>
          <Input type="number" value={template.paddingMm} onChange={(e) => update({ paddingMm: Number(e.target.value) || 0 })} className="h-8 text-sm" />

          <label className="mt-3 flex items-center gap-2 text-xs">
            <input type="checkbox" checked={template.showBorder ?? false} onChange={(e) => update({ showBorder: e.target.checked })} />
            Mostrar borda dos blocos
          </label>
        </Panel>

        <Panel title="Texto">
          <div className="grid grid-cols-2 gap-1">
            <PaletteButton icon={<Type />} label="Titulo" onClick={() => addTextElement("TITULO", 14, true)} />
            <PaletteButton icon={<Type />} label="Texto" onClick={() => addTextElement("Texto", 8)} />
          </div>
        </Panel>

        <Panel title="Campos">
          <div className="grid grid-cols-2 gap-1">
            <PaletteButton icon={<Database />} label="Descricao" onClick={() => addDynamicElement("descricao")} />
            <PaletteButton icon={<Database />} label="Preco" onClick={() => addDynamicElement("precoVarejo", "R$ ")} />
            <PaletteButton icon={<Database />} label="EAN" onClick={() => addDynamicElement("ean")} />
            <PaletteButton icon={<BarcodeIcon />} label="Barras" onClick={() => addElement("barcode")} />
          </div>
        </Panel>

        <Panel title="Elementos graficos">
          <div className="grid grid-cols-2 gap-1">
            <PaletteButton icon={<Square />} label="Caixa" onClick={() => addShapeElement("rect")} />
            <PaletteButton icon={<BadgePercent />} label="Faixa" onClick={() => addShapeElement("roundRect", { widthMm: 20, heightMm: 5 })} />
            <PaletteButton icon={<Circle />} label="Circulo" onClick={() => addShapeElement("circle", { widthMm: 10, heightMm: 10 })} />
            <PaletteButton icon={<Minus />} label="Linha" onClick={() => addShapeElement("line")} />
          </div>
        </Panel>

        <Panel title="Uploads">
          <PaletteButton icon={<ImageIcon />} label="Adicionar arte PNG/JPG" onClick={() => imageInputRef.current?.click()} wide />
          <input
            ref={imageInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) addImageElement(file);
              e.currentTarget.value = "";
            }}
          />
        </Panel>

        <Panel title={`Camadas (${template.elements.length})`} icon={<Layers className="h-3.5 w-3.5" />}>
          <div className="space-y-1">
            {template.elements.map((el, index) => (
              <button
                key={el.id}
                className={cn(
                  "flex w-full items-center justify-between rounded border px-2 py-1.5 text-left text-xs hover:bg-accent",
                  selectedId === el.id && "border-primary bg-primary/10",
                )}
                onClick={() => setSelectedId(el.id)}
              >
                <span className="truncate">Camada {index + 1}: {layerName(el)}</span>
                <Trash2
                  className="h-3 w-3 opacity-60 hover:text-destructive"
                  onClick={(e) => {
                    e.stopPropagation();
                    removeElement(el.id);
                  }}
                />
              </button>
            ))}
            {!template.elements.length && <p className="text-[11px] opacity-60">Adicione textos, campos, imagens ou formas.</p>}
          </div>
        </Panel>
      </div>

      <div className="overflow-auto rounded-lg border bg-muted/30 p-4">
        <div className="mx-auto" style={{ width: A4_WIDTH_MM * MM_TO_PX }}>
          <div className="mb-2 text-center text-[11px] opacity-60">
            A4 210x297mm - {template.rows}x{template.cols} - edite o bloco 1
          </div>
          <div className="relative bg-white shadow" style={{ width: A4_WIDTH_MM * MM_TO_PX, height: A4_HEIGHT_MM * MM_TO_PX }}>
            {blockRects.map((rect, blockIdx) => (
              <div
                key={blockIdx}
                className={cn("absolute border border-dashed border-primary/40", blockIdx === 0 ? "bg-white" : "bg-muted/10")}
                style={{ left: rect.x * MM_TO_PX, top: rect.y * MM_TO_PX, width: rect.width * MM_TO_PX, height: rect.height * MM_TO_PX }}
              >
                <div className="absolute left-1 top-1 z-20 rounded bg-primary/10 px-1 text-[9px] text-primary">Bloco {blockIdx + 1}</div>
                <div
                  className={cn("absolute", blockIdx > 0 && "opacity-40")}
                  style={{ left: template.paddingMm * MM_TO_PX, top: template.paddingMm * MM_TO_PX, right: template.paddingMm * MM_TO_PX, bottom: template.paddingMm * MM_TO_PX }}
                  onClick={() => blockIdx === 0 && setSelectedId(null)}
                >
                  {template.elements.map((el) => (
                    <ElementBox
                      key={`${blockIdx}-${el.id}`}
                      element={el}
                      product={product}
                      selected={blockIdx === 0 && selectedId === el.id}
                      ghost={blockIdx > 0}
                      onPointerDown={(e, mode) => blockIdx === 0 && startDrag(e, el, mode)}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-3 overflow-auto rounded-lg border bg-card p-3">
        <Label className="text-xs uppercase opacity-60">Propriedades</Label>
        {!selected && <p className="text-xs opacity-60">Selecione um item no canvas.</p>}
        {selected && (
          <ElementProps
            element={selected}
            onChange={(patch) => updateElement(selected.id, patch)}
            onDelete={() => removeElement(selected.id)}
            onLayerUp={() => moveLayer(selected.id, "up")}
            onLayerDown={() => moveLayer(selected.id, "down")}
          />
        )}
      </div>
    </div>
  );
}

function Panel({ title, icon, children }: { title: string; icon?: ReactNode; children: ReactNode }) {
  return (
    <div className="rounded-md border p-2">
      <Label className="mb-2 flex items-center gap-1 text-xs uppercase opacity-60">
        {icon}
        {title}
      </Label>
      {children}
    </div>
  );
}

function PaletteButton({ icon, label, onClick, wide }: { icon: ReactNode; label: string; onClick: () => void; wide?: boolean }) {
  return (
    <Button size="sm" variant="outline" className={cn("h-9 justify-start gap-1 px-2 text-xs", wide && "w-full")} onClick={onClick}>
      <span className="[&_svg]:h-3.5 [&_svg]:w-3.5">{icon}</span>
      <span className="truncate">{label}</span>
    </Button>
  );
}

function layerName(el: A4Element) {
  if (el.type === "text") return `Texto: ${el.text || ""}`;
  if (el.type === "dynamic") return `Campo: ${DYNAMIC_LABELS[el.field || "descricao"]}`;
  if (el.type === "barcode") return "Codigo de barras";
  if (el.type === "image") return `Imagem: ${el.imageName || "arte"}`;
  return `Forma: ${el.shapeKind || "rect"}`;
}

function ElementBox({
  element,
  product,
  selected,
  ghost,
  onPointerDown,
}: {
  element: A4Element;
  product: Product | null;
  selected?: boolean;
  ghost?: boolean;
  onPointerDown?: (e: React.PointerEvent, mode: "move" | "resize") => void;
}) {
  const text =
    element.type === "text"
      ? element.text || ""
      : element.type === "dynamic"
        ? `${element.prefix || ""}${getDynamicValue(element.field, product)}`
        : "";

  return (
    <div
      onPointerDown={(e) => !ghost && onPointerDown?.(e, "move")}
      onClick={(e) => {
        if (!ghost) e.stopPropagation();
      }}
      className={cn(
        "absolute box-border overflow-hidden",
        !ghost && "cursor-move",
        selected ? "outline outline-2 outline-primary" : !ghost && "outline-dashed outline-1 outline-primary/30",
      )}
      style={{ left: element.x * MM_TO_PX, top: element.y * MM_TO_PX, width: element.widthMm * MM_TO_PX, height: element.heightMm * MM_TO_PX }}
    >
      {element.type === "shape" ? (
        <ShapeBox element={element} />
      ) : element.type === "image" ? (
        element.imageDataUrl ? (
          <img
            src={element.imageDataUrl}
            alt={element.imageName || "arte"}
            className="h-full w-full select-none"
            draggable={false}
            style={{ objectFit: element.imageFit === "contain" ? "contain" : element.imageFit === "cover" ? "cover" : "fill" }}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-muted/40 text-[10px] opacity-80">Imagem</div>
        )
      ) : element.type === "barcode" ? (
        <div className="flex h-full w-full items-center justify-center bg-muted/40 text-[10px] opacity-80">||||| {product?.codigo_barras || product?.ean || "EAN"}</div>
      ) : (
        <div
          style={{
            fontSize: `${element.fontSize}pt`,
            fontWeight: element.bold ? 700 : 400,
            fontStyle: element.italic ? "italic" : "normal",
            textAlign: element.align || "left",
            color: element.color || "#000",
            lineHeight: 1.05,
            width: "100%",
            height: "100%",
            overflow: "hidden",
          }}
        >
          {text}
        </div>
      )}
      {selected && !ghost && onPointerDown && (
        <div onPointerDown={(e) => onPointerDown(e, "resize")} className="absolute -bottom-1 -right-1 h-3 w-3 cursor-nwse-resize rounded-sm border border-white bg-primary" />
      )}
    </div>
  );
}

function ShapeBox({ element }: { element: A4Element }) {
  const common = {
    backgroundColor: element.shapeKind === "line" ? "transparent" : element.fillColor || "#e60000",
    borderColor: element.strokeColor || element.fillColor || "#e60000",
    borderWidth: `${(element.strokeWidthMm || 0) * MM_TO_PX}px`,
    opacity: element.opacity ?? 1,
  };
  if (element.shapeKind === "circle") return <div className="h-full w-full rounded-full border" style={common} />;
  if (element.shapeKind === "line") {
    return <div className="h-full w-full" style={{ borderTop: `${Math.max(1, (element.strokeWidthMm || 1) * MM_TO_PX)}px solid ${element.strokeColor || "#000"}`, marginTop: "50%" }} />;
  }
  return <div className={cn("h-full w-full border", element.shapeKind === "roundRect" && "rounded-full")} style={common} />;
}

function ElementProps({
  element,
  onChange,
  onDelete,
  onLayerUp,
  onLayerDown,
}: {
  element: A4Element;
  onChange: (patch: Partial<A4Element>) => void;
  onDelete: () => void;
  onLayerUp: () => void;
  onLayerDown: () => void;
}) {
  return (
    <div className="space-y-3 text-xs">
      <div className="flex items-center justify-between">
        <span className="rounded bg-primary/10 px-2 py-0.5 text-primary">{element.type}</span>
        <Button size="sm" variant="ghost" onClick={onDelete} className="h-7 text-destructive">
          <Trash2 className="h-3.5 w-3.5" /> Remover
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-1">
        <Button size="sm" variant="outline" className="h-8 text-xs" onClick={onLayerDown}>Camada -</Button>
        <Button size="sm" variant="outline" className="h-8 text-xs" onClick={onLayerUp}>Camada +</Button>
      </div>

      {element.type === "text" && (
        <div>
          <Label className="text-xs">Texto fixo</Label>
          <Input value={element.text || ""} onChange={(e) => onChange({ text: e.target.value })} className="h-8" />
        </div>
      )}

      {element.type === "dynamic" && (
        <>
          <div>
            <Label className="text-xs">Campo</Label>
            <Select value={element.field} onValueChange={(v) => onChange({ field: v as A4DynamicKey })}>
              <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(DYNAMIC_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Prefixo</Label>
            <Input value={element.prefix || ""} onChange={(e) => onChange({ prefix: e.target.value })} className="h-8" placeholder="Ex.: R$ " />
          </div>
        </>
      )}

      {element.type === "barcode" && (
        <>
          <div>
            <Label className="text-xs">Formato</Label>
            <Select value={element.barcodeFormat || "auto"} onValueChange={(v) => onChange({ barcodeFormat: v as A4Element["barcodeFormat"] })}>
              <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="auto">Auto</SelectItem>
                <SelectItem value="EAN13">EAN13</SelectItem>
                <SelectItem value="CODE128">CODE128</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={element.barcodeDisplayValue ?? true} onChange={(e) => onChange({ barcodeDisplayValue: e.target.checked })} />
            Mostrar numeros
          </label>
        </>
      )}

      {element.type === "image" && (
        <div>
          <Label className="text-xs">Ajuste da imagem</Label>
          <Select value={element.imageFit || "stretch"} onValueChange={(v) => onChange({ imageFit: v as A4Element["imageFit"] })}>
            <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="stretch">Esticar no quadro</SelectItem>
              <SelectItem value="contain">Mostrar inteira</SelectItem>
              <SelectItem value="cover">Preencher cortando</SelectItem>
            </SelectContent>
          </Select>
          <p className="mt-1 text-[11px] opacity-60">{element.imageName || "Imagem do modelo"}</p>
        </div>
      )}

      {element.type === "shape" && (
        <>
          <div>
            <Label className="text-xs">Tipo</Label>
            <Select value={element.shapeKind || "rect"} onValueChange={(v) => onChange({ shapeKind: v as A4ShapeKind })}>
              <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="rect">Retangulo</SelectItem>
                <SelectItem value="roundRect">Faixa arredondada</SelectItem>
                <SelectItem value="circle">Circulo</SelectItem>
                <SelectItem value="line">Linha</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <ColorField label="Preenchimento" value={element.fillColor || "#e60000"} onChange={(fillColor) => onChange({ fillColor })} />
          <ColorField label="Contorno" value={element.strokeColor || "#e60000"} onChange={(strokeColor) => onChange({ strokeColor })} />
          <NumField label="Esp. contorno" value={element.strokeWidthMm ?? 0} onChange={(strokeWidthMm) => onChange({ strokeWidthMm })} />
        </>
      )}

      <div className="grid grid-cols-2 gap-2">
        <NumField label="X (mm)" value={element.x} onChange={(x) => onChange({ x })} />
        <NumField label="Y (mm)" value={element.y} onChange={(y) => onChange({ y })} />
        <NumField label="Largura" value={element.widthMm} onChange={(widthMm) => onChange({ widthMm })} />
        <NumField label="Altura" value={element.heightMm} onChange={(heightMm) => onChange({ heightMm })} />
      </div>

      {element.type !== "barcode" && element.type !== "image" && element.type !== "shape" && (
        <>
          <div className="grid grid-cols-2 gap-2">
            <NumField label="Fonte (pt)" value={element.fontSize} onChange={(fontSize) => onChange({ fontSize })} />
            <div>
              <Label className="text-xs">Familia</Label>
              <Select value={element.fontFamily || "helvetica"} onValueChange={(v) => onChange({ fontFamily: v as A4Element["fontFamily"] })}>
                <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="helvetica">Helvetica</SelectItem>
                  <SelectItem value="times">Times</SelectItem>
                  <SelectItem value="courier">Courier</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-1">
            <Button size="sm" variant={element.bold ? "default" : "outline"} className="h-8" onClick={() => onChange({ bold: !element.bold })}>
              <BoldIcon className="h-3.5 w-3.5" />
            </Button>
            <Button size="sm" variant={element.italic ? "default" : "outline"} className="h-8 italic" onClick={() => onChange({ italic: !element.italic })}>I</Button>
            <Select value={element.align || "left"} onValueChange={(v) => onChange({ align: v as A4Element["align"] })}>
              <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="left">Esquerda</SelectItem>
                <SelectItem value="center">Centro</SelectItem>
                <SelectItem value="right">Direita</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <ColorField label="Cor" value={element.color || "#000000"} onChange={(color) => onChange({ color })} />
        </>
      )}
    </div>
  );
}

function NumField({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div>
      <Label className="text-xs">{label}</Label>
      <Input type="number" step="0.1" value={value} onChange={(e) => onChange(Number(e.target.value) || 0)} className="h-8 text-sm" />
    </div>
  );
}

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <Label className="text-xs">{label}</Label>
      <Input type="color" value={value} onChange={(e) => onChange(e.target.value)} className="h-8 w-full" />
    </div>
  );
}
