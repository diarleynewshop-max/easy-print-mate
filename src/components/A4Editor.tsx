import { useMemo, useRef, useState } from "react";
import { A4Element, A4Template, A4DynamicKey, A4ElementType } from "@/types/a4";
import { getBlockRects, A4_HEIGHT_MM, A4_WIDTH_MM, getDynamicValue } from "@/services/a4PdfService";
import { Product } from "@/types/label";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Trash2, Plus, Type, Database, Barcode as BarcodeIcon, Bold as BoldIcon } from "lucide-react";
import { cn } from "@/lib/utils";

const MM_TO_PX = 2.4; // canvas zoom para preview

interface Props {
  template: A4Template;
  product: Product | null;
  onChange: (t: A4Template) => void;
}

const DYNAMIC_LABELS: Record<A4DynamicKey, string> = {
  descricao: "Descrição",
  ean: "EAN",
  codigoInterno: "Código interno",
  precoVarejo: "Preço varejo",
  precoAtacado: "Preço atacado",
  secao: "Seção",
  grupo: "Grupo",
  estoque: "Estoque",
};

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

export function A4Editor({ template, product, onChange }: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const blockRects = useMemo(() => getBlockRects(template.blocks), [template.blocks]);
  const firstBlock = blockRects[0];
  const blockRef = useRef<HTMLDivElement>(null);

  const selected = template.elements.find((e) => e.id === selectedId) || null;

  const update = (patch: Partial<A4Template>) => onChange({ ...template, ...patch });

  const addElement = (type: A4ElementType) => {
    const base: A4Element = {
      id: uid(),
      type,
      x: 5,
      y: 5,
      widthMm: type === "barcode" ? 60 : 80,
      heightMm: type === "barcode" ? 22 : 12,
      fontSize: type === "barcode" ? 8 : 14,
      align: "left",
      ...(type === "text" ? { text: "Texto fixo" } : {}),
      ...(type === "dynamic" ? { field: "descricao" as A4DynamicKey } : {}),
      ...(type === "barcode" ? { barcodeFormat: "auto", barcodeDisplayValue: true } : {}),
    };
    onChange({ ...template, elements: [...template.elements, base] });
    setSelectedId(base.id);
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
          widthMm: Math.max(5, Math.round((start.w + dx) * 10) / 10),
          heightMm: Math.max(4, Math.round((start.h + dy) * 10) / 10),
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
    <div className="grid h-full grid-cols-[280px_1fr_320px] gap-3 overflow-hidden">
      {/* PAINEL ESQUERDO — Modelo */}
      <div className="flex flex-col gap-3 overflow-auto rounded-lg border bg-card p-3">
        <div>
          <Label className="text-xs">Nome do modelo</Label>
          <Input value={template.name} onChange={(e) => update({ name: e.target.value })} className="h-8 text-sm" />
        </div>

        <div>
          <Label className="text-xs">Divisão da folha</Label>
          <div className="mt-1 grid grid-cols-3 gap-1">
            {([1, 2, 4] as const).map((n) => (
              <Button
                key={n}
                size="sm"
                variant={template.blocks === n ? "default" : "outline"}
                className="h-9 text-xs"
                onClick={() => update({ blocks: n })}
              >
                {n}/folha
              </Button>
            ))}
          </div>
        </div>

        <div>
          <Label className="text-xs">Padding interno (mm)</Label>
          <Input
            type="number"
            value={template.paddingMm}
            onChange={(e) => update({ paddingMm: Number(e.target.value) || 0 })}
            className="h-8 text-sm"
          />
        </div>

        <label className="flex items-center gap-2 text-xs">
          <input
            type="checkbox"
            checked={template.showBorder ?? false}
            onChange={(e) => update({ showBorder: e.target.checked })}
          />
          Mostrar borda dos blocos
        </label>

        <div className="border-t pt-3">
          <Label className="text-xs uppercase opacity-60">Adicionar elemento</Label>
          <div className="mt-2 grid grid-cols-3 gap-1">
            <Button size="sm" variant="outline" className="h-9 text-xs" onClick={() => addElement("text")}>
              <Type className="h-3.5 w-3.5" /> Texto
            </Button>
            <Button size="sm" variant="outline" className="h-9 text-xs" onClick={() => addElement("dynamic")}>
              <Database className="h-3.5 w-3.5" /> Campo
            </Button>
            <Button size="sm" variant="outline" className="h-9 text-xs" onClick={() => addElement("barcode")}>
              <BarcodeIcon className="h-3.5 w-3.5" /> Barras
            </Button>
          </div>
        </div>

        <div className="border-t pt-3">
          <Label className="text-xs uppercase opacity-60">Camadas ({template.elements.length})</Label>
          <div className="mt-2 space-y-1">
            {template.elements.map((el) => (
              <button
                key={el.id}
                className={cn(
                  "flex w-full items-center justify-between rounded border px-2 py-1.5 text-left text-xs hover:bg-accent",
                  selectedId === el.id && "border-primary bg-primary/10",
                )}
                onClick={() => setSelectedId(el.id)}
              >
                <span className="truncate">
                  {el.type === "text" && `T: ${el.text}`}
                  {el.type === "dynamic" && `# ${DYNAMIC_LABELS[el.field || "descricao"]}`}
                  {el.type === "barcode" && `Código de barras`}
                </span>
                <Trash2
                  className="h-3 w-3 opacity-60 hover:text-destructive"
                  onClick={(e) => {
                    e.stopPropagation();
                    removeElement(el.id);
                  }}
                />
              </button>
            ))}
            {!template.elements.length && (
              <p className="text-[11px] opacity-60">Nenhum elemento. Adicione um texto, campo ou código.</p>
            )}
          </div>
        </div>
      </div>

      {/* CENTRO — Canvas A4 */}
      <div className="overflow-auto rounded-lg border bg-muted/30 p-4">
        <div className="mx-auto" style={{ width: A4_WIDTH_MM * MM_TO_PX }}>
          <div className="mb-2 text-center text-[11px] opacity-60">
            A4 210×297mm · {template.blocks} bloco{template.blocks > 1 ? "s" : ""} · zoom {Math.round(MM_TO_PX * 10) * 10}%
          </div>
          <div
            className="relative bg-white shadow"
            style={{ width: A4_WIDTH_MM * MM_TO_PX, height: A4_HEIGHT_MM * MM_TO_PX }}
          >
            {blockRects.map((rect, blockIdx) => (
              <div
                key={blockIdx}
                ref={blockIdx === 0 ? blockRef : undefined}
                className={cn(
                  "absolute border border-dashed border-primary/40",
                  blockIdx === 0 ? "bg-white" : "bg-muted/10",
                )}
                style={{
                  left: rect.x * MM_TO_PX,
                  top: rect.y * MM_TO_PX,
                  width: rect.width * MM_TO_PX,
                  height: rect.height * MM_TO_PX,
                }}
              >
                <div className="absolute left-1 top-1 rounded bg-primary/10 px-1 text-[9px] text-primary">
                  Bloco {blockIdx + 1}
                </div>
                {/* área editável só no primeiro bloco */}
                {blockIdx === 0 && (
                  <div
                    className="absolute"
                    style={{
                      left: template.paddingMm * MM_TO_PX,
                      top: template.paddingMm * MM_TO_PX,
                      right: template.paddingMm * MM_TO_PX,
                      bottom: template.paddingMm * MM_TO_PX,
                    }}
                    onClick={() => setSelectedId(null)}
                  >
                    {template.elements.map((el) => (
                      <ElementBox
                        key={el.id}
                        element={el}
                        product={product}
                        selected={selectedId === el.id}
                        onPointerDown={(e, mode) => startDrag(e, el, mode)}
                      />
                    ))}
                  </div>
                )}
                {/* preview "fantasma" nos demais blocos */}
                {blockIdx > 0 && (
                  <div
                    className="absolute opacity-40"
                    style={{
                      left: template.paddingMm * MM_TO_PX,
                      top: template.paddingMm * MM_TO_PX,
                      right: template.paddingMm * MM_TO_PX,
                      bottom: template.paddingMm * MM_TO_PX,
                    }}
                  >
                    {template.elements.map((el) => (
                      <ElementBox key={el.id} element={el} product={product} ghost />
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
          <p className="mt-2 text-center text-[10px] opacity-60">
            Edite o layout no <strong>Bloco 1</strong>. Os demais blocos repetem o mesmo desenho ao gerar o PDF.
          </p>
        </div>
      </div>

      {/* PAINEL DIREITO — Propriedades */}
      <div className="flex flex-col gap-3 overflow-auto rounded-lg border bg-card p-3">
        <Label className="text-xs uppercase opacity-60">Propriedades</Label>
        {!selected && <p className="text-xs opacity-60">Selecione um elemento no canvas para editar.</p>}
        {selected && (
          <ElementProps
            element={selected}
            onChange={(patch) => updateElement(selected.id, patch)}
            onDelete={() => removeElement(selected.id)}
          />
        )}
      </div>
    </div>
  );
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
      className={cn(
        "absolute box-border overflow-hidden",
        !ghost && "cursor-move",
        selected ? "outline outline-2 outline-primary" : !ghost && "outline-dashed outline-1 outline-primary/30",
      )}
      style={{
        left: element.x * MM_TO_PX,
        top: element.y * MM_TO_PX,
        width: element.widthMm * MM_TO_PX,
        height: element.heightMm * MM_TO_PX,
      }}
    >
      {element.type === "barcode" ? (
        <div className="flex h-full w-full items-center justify-center bg-muted/40 text-[10px] opacity-80">
          ▮▯▮▯▮ {product?.codigo_barras || product?.ean || "EAN"}
        </div>
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
        <div
          onPointerDown={(e) => onPointerDown(e, "resize")}
          className="absolute -bottom-1 -right-1 h-3 w-3 cursor-nwse-resize rounded-sm border border-white bg-primary"
        />
      )}
    </div>
  );
}

function ElementProps({
  element,
  onChange,
  onDelete,
}: {
  element: A4Element;
  onChange: (patch: Partial<A4Element>) => void;
  onDelete: () => void;
}) {
  return (
    <div className="space-y-3 text-xs">
      <div className="flex items-center justify-between">
        <span className="rounded bg-primary/10 px-2 py-0.5 text-primary">{element.type}</span>
        <Button size="sm" variant="ghost" onClick={onDelete} className="h-7 text-destructive">
          <Trash2 className="h-3.5 w-3.5" /> Remover
        </Button>
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
                {Object.entries(DYNAMIC_LABELS).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Prefixo (opcional)</Label>
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
            <input
              type="checkbox"
              checked={element.barcodeDisplayValue ?? true}
              onChange={(e) => onChange({ barcodeDisplayValue: e.target.checked })}
            />
            Mostrar números
          </label>
        </>
      )}

      <div className="grid grid-cols-2 gap-2">
        <NumField label="X (mm)" value={element.x} onChange={(v) => onChange({ x: v })} />
        <NumField label="Y (mm)" value={element.y} onChange={(v) => onChange({ y: v })} />
        <NumField label="Largura" value={element.widthMm} onChange={(v) => onChange({ widthMm: v })} />
        <NumField label="Altura" value={element.heightMm} onChange={(v) => onChange({ heightMm: v })} />
      </div>

      {element.type !== "barcode" && (
        <>
          <div className="grid grid-cols-2 gap-2">
            <NumField label="Fonte (pt)" value={element.fontSize} onChange={(v) => onChange({ fontSize: v })} />
            <div>
              <Label className="text-xs">Família</Label>
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
            <Button size="sm" variant={element.italic ? "default" : "outline"} className="h-8 italic" onClick={() => onChange({ italic: !element.italic })}>
              I
            </Button>
            <Select value={element.align || "left"} onValueChange={(v) => onChange({ align: v as A4Element["align"] })}>
              <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="left">Esquerda</SelectItem>
                <SelectItem value="center">Centro</SelectItem>
                <SelectItem value="right">Direita</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="text-xs">Cor</Label>
            <Input
              type="color"
              value={element.color || "#000000"}
              onChange={(e) => onChange({ color: e.target.value })}
              className="h-8 w-full"
            />
          </div>
        </>
      )}
    </div>
  );
}

function NumField({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div>
      <Label className="text-xs">{label}</Label>
      <Input
        type="number"
        step="0.1"
        value={value}
        onChange={(e) => onChange(Number(e.target.value) || 0)}
        className="h-8 text-sm"
      />
    </div>
  );
}
