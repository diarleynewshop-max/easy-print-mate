import { useEffect, useRef } from "react";
import JsBarcode from "jsbarcode";
import { LabelField, LabelFieldKey, LabelTemplate, Product } from "@/types/label";

const MM_TO_PX = 3.78;

interface Props {
  template: LabelTemplate;
  product: Product | null;
  forPrint?: boolean;
  copies?: number;
  editable?: boolean;
  selectedField?: LabelFieldKey | null;
  onSelectField?: (key: LabelFieldKey) => void;
  onFieldChange?: (key: LabelFieldKey, patch: Partial<LabelField>) => void;
}

function formatBRL(v?: number) {
  if (v == null || isNaN(v)) return "--";
  return v.toFixed(2).replace(".", ",");
}

function getValue(key: string, p: Product | null): string {
  if (!p) {
    const samples: Record<string, string> = {
      descricao: "Produto Exemplo",
      precoVarejo: "9,90",
      precoAtacado: "8,50",
      ean: "7891234567890",
      secao: "Secao",
      estoque: "10",
      codigoInterno: "1234",
    };
    return samples[key] ?? "";
  }

  switch (key) {
    case "descricao":
      return p.descricao;
    case "precoVarejo":
      return formatBRL(p.precoVarejo);
    case "precoAtacado":
      return formatBRL(p.precoAtacado);
    case "ean":
      return p.ean;
    case "secao":
      return p.secao || p.grupo || "";
    case "estoque":
      return p.estoque?.toString() ?? "";
    case "codigoInterno":
      return p.codigoInterno || "";
    default:
      return "";
  }
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function getFieldWidth(template: LabelTemplate, field: LabelField) {
  return field.widthMm ?? Math.max(8, template.widthMm - field.x - template.marginMm);
}

function getFieldHeight(field: LabelField) {
  return field.heightMm ?? (field.key === "barcode" ? 10 : Math.max(5, field.fontSize * 0.42));
}

function useBarcode(ean: string, visible: boolean, widthMm: number, heightMm: number) {
  const barcodeRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!barcodeRef.current || !visible) return;

    try {
      JsBarcode(barcodeRef.current, ean, {
        format: ean.length === 13 ? "EAN13" : "CODE128",
        displayValue: true,
        fontSize: 9,
        height: Math.max(16, heightMm * 2.8),
        width: Math.max(1, widthMm / 32),
        margin: 0,
      });
    } catch {
      try {
        JsBarcode(barcodeRef.current, ean, {
          format: "CODE128",
          displayValue: true,
          fontSize: 9,
          height: Math.max(16, heightMm * 2.8),
          margin: 0,
        });
      } catch {}
    }
  }, [ean, visible, widthMm, heightMm]);

  return barcodeRef;
}

function SingleLabel({
  template,
  product,
  forPrint = false,
  editable = false,
  selectedField,
  onSelectField,
  onFieldChange,
}: Props) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const measure = (mm: number) => (forPrint ? `${mm}mm` : `${mm * MM_TO_PX}px`);
  const barcodeField = template.fields.find((f) => f.key === "barcode");
  const barcodeRef = useBarcode(
    product?.ean || "7891234567890",
    Boolean(barcodeField?.visible),
    barcodeField ? getFieldWidth(template, barcodeField) : 36,
    barcodeField ? getFieldHeight(barcodeField) : 8
  );

  const startPointerEdit = (event: React.PointerEvent, field: LabelField, mode: "move" | "resize") => {
    if (!editable || !onFieldChange) return;
    event.preventDefault();
    event.stopPropagation();
    onSelectField?.(field.key);

    const startX = event.clientX;
    const startY = event.clientY;
    const startField = {
      x: field.x,
      y: field.y,
      widthMm: getFieldWidth(template, field),
      heightMm: getFieldHeight(field),
    };

    const onMove = (moveEvent: PointerEvent) => {
      const dxMm = (moveEvent.clientX - startX) / MM_TO_PX;
      const dyMm = (moveEvent.clientY - startY) / MM_TO_PX;

      if (mode === "move") {
        onFieldChange(field.key, {
          x: Number(clamp(startField.x + dxMm, 0, template.widthMm - 2).toFixed(1)),
          y: Number(clamp(startField.y + dyMm, 0, template.heightMm - 2).toFixed(1)),
        });
        return;
      }

      onFieldChange(field.key, {
        widthMm: Number(clamp(startField.widthMm + dxMm, 4, template.widthMm - field.x).toFixed(1)),
        heightMm: Number(clamp(startField.heightMm + dyMm, 3, template.heightMm - field.y).toFixed(1)),
      });
    };

    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  return (
    <div
      ref={canvasRef}
      className="label-canvas"
      style={{
        width: measure(template.widthMm),
        height: measure(template.heightMm),
        fontFamily: template.fontFamily,
        border: forPrint ? "none" : "1px dashed #999",
      }}
    >
      {template.fields
        .filter((f) => f.visible)
        .map((f) => {
          const widthMm = getFieldWidth(template, f);
          const heightMm = getFieldHeight(f);
          const selected = editable && selectedField === f.key;
          const commonStyle: React.CSSProperties = {
            position: "absolute",
            left: measure(f.x),
            top: measure(f.y),
            width: measure(widthMm),
            height: measure(heightMm),
            outline: selected ? "1.5px solid #2563eb" : editable ? "1px dashed rgba(37,99,235,.25)" : "none",
            cursor: editable ? "move" : "default",
            boxSizing: "border-box",
          };

          return (
            <div
              key={f.key}
              style={commonStyle}
              onPointerDown={(event) => startPointerEdit(event, f, "move")}
              onClick={() => onSelectField?.(f.key)}
            >
              {f.key === "barcode" ? (
                <svg ref={barcodeRef} style={{ width: "100%", height: "100%", display: "block" }} />
              ) : (
                <div
                  style={{
                    fontSize: `${f.fontSize}pt`,
                    fontWeight: f.bold ? 700 : 400,
                    lineHeight: 1.05,
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {f.label ? `${f.label} ` : ""}
                  {getValue(f.key, product)}
                </div>
              )}

              {editable && selected && (
                <button
                  type="button"
                  aria-label="Redimensionar campo"
                  onPointerDown={(event) => startPointerEdit(event, f, "resize")}
                  style={{
                    position: "absolute",
                    right: -5,
                    bottom: -5,
                    width: 10,
                    height: 10,
                    borderRadius: 2,
                    border: "1px solid #fff",
                    background: "#2563eb",
                    cursor: "nwse-resize",
                    padding: 0,
                  }}
                />
              )}
            </div>
          );
        })}
    </div>
  );
}

export function LabelPreview(props: Props) {
  const { template, product, forPrint, copies = 1 } = props;

  if (forPrint) {
    const columns = Math.max(1, template.columns || 1);
    const gap = template.columnGapMm ?? 2;

    return (
      <div
        id="print-area"
        style={{
          display: "grid",
          gridTemplateColumns: `repeat(${columns}, ${template.widthMm}mm)`,
          gap: `${gap}mm`,
          alignItems: "start",
        }}
      >
        {Array.from({ length: copies }).map((_, i) => (
          <SingleLabel key={i} template={template} product={product} forPrint />
        ))}
      </div>
    );
  }

  return <SingleLabel {...props} />;
}
