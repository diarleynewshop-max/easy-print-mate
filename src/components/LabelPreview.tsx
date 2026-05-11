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

function applyDescriptionMode(field: LabelField | undefined, descricao: string, codigoInterno?: string) {
  const mode = field?.descriptionMode ?? "full";
  const tokens = descricao.trim().split(/\s+/).filter(Boolean);
  switch (mode) {
    case "first-word":
      return tokens[0] || "";
    case "first-two-words":
      return tokens.slice(0, 2).join(" ");
    case "internal-code":
      return codigoInterno || tokens[0] || "";
    case "custom":
      return field?.customText || "";
    case "full":
    default:
      return descricao.trim().length > 28 ? descricao.trim().slice(0, 28) : descricao.trim();
  }
}

function getValue(key: string, p: Product | null, field?: LabelField): string {
  if (!p) {
    const samples: Record<string, string> = {
      descricao: applyDescriptionMode(field, "PRD-001 PRODUTO EXEMPLO", "PRD-001"),
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
      return applyDescriptionMode(field, p.descricao, p.codigoInterno);
    case "precoVarejo":
      return formatBRL(p.precoVarejo);
    case "precoAtacado":
      return formatBRL(p.precoAtacado);
    case "ean":
      return p.codigo_barras || p.ean;
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

function getTemplateRightMargin(template: LabelTemplate) {
  return template.marginRightMm ?? 0;
}

function getFieldWidth(template: LabelTemplate, field: LabelField) {
  return field.widthMm ?? Math.max(8, template.widthMm - field.x - getTemplateRightMargin(template));
}

function getFieldHeight(field: LabelField) {
  return field.heightMm ?? (field.key === "barcode" ? 10 : Math.max(5, field.fontSize * 0.42));
}

function overlaps(aStart: number, aSize: number, bStart: number, bSize: number) {
  return aStart < bStart + bSize && bStart < aStart + aSize;
}

function getSafeFieldSize(template: LabelTemplate, field: LabelField, visibleFields: LabelField[]) {
  let widthMm = getFieldWidth(template, field);
  let heightMm = getFieldHeight(field);

  if (field.key !== "descricao") return { widthMm, heightMm };

  for (const other of visibleFields) {
    if (other.key === field.key) continue;

    const otherWidthMm = getFieldWidth(template, other);
    const otherHeightMm = getFieldHeight(other);

    if (other.x > field.x && overlaps(field.y, heightMm, other.y, otherHeightMm)) {
      widthMm = Math.min(widthMm, Math.max(2, other.x - field.x - 0.5));
    }

    if (other.y > field.y && overlaps(field.x, widthMm, other.x, otherWidthMm)) {
      heightMm = Math.min(heightMm, Math.max(2, other.y - field.y - 0.2));
    }
  }

  return { widthMm, heightMm };
}

function getBarcodeFormat(ean: string, field?: LabelField) {
  if (field?.barcodeFormat && field.barcodeFormat !== "auto") return field.barcodeFormat;
  return ean.length === 13 ? "EAN13" : "CODE128";
}

function useBarcode(ean: string, visible: boolean, widthMm: number, heightMm: number, field?: LabelField, template?: LabelTemplate) {
  const barcodeRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!barcodeRef.current || !visible) return;
    const fontFamily = field?.fontFamily || template?.fontFamily || "Arial, sans-serif";
    const options = {
      displayValue: field?.barcodeDisplayValue ?? true,
      font: fontFamily,
      fontOptions: field?.bold ? "bold" : "",
      fontSize: Math.max(4, field?.fontSize ?? 9),
      textAlign: field?.align || "center",
      textPosition: field?.barcodeTextPosition || "bottom",
      textMargin: field?.barcodeTextMargin ?? 1,
      lineColor: field?.barcodeLineColor || field?.color || "#000000",
      height: Math.max(16, heightMm * 2.8),
      width: Math.max(0.6, field?.barcodeBarWidth ?? widthMm / 32),
      margin: 0,
    };

    try {
      JsBarcode(barcodeRef.current, ean, {
        format: getBarcodeFormat(ean, field),
        ...options,
      });
    } catch {
      try {
        JsBarcode(barcodeRef.current, ean, {
          format: "CODE128",
          ...options,
        });
      } catch {}
    }
  }, [ean, visible, widthMm, heightMm, field, template]);

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
  const visibleFields = template.fields.filter((f) => f.visible);
  // Rotation is handled at the printer level (EPL) — never rotate the
  // browser/PDF preview so what is printed matches exactly what the user sees
  // in the editor (fixes "Anel" template printing upside down).
  const previewRotation: string | undefined = undefined;
  const barcodeField = template.fields.find((f) => f.key === "barcode");
  const barcodeRef = useBarcode(
    product?.codigo_barras || product?.ean || "7891234567890",
    Boolean(barcodeField?.visible),
    barcodeField ? getFieldWidth(template, barcodeField) : 36,
    barcodeField ? getFieldHeight(barcodeField) : 8,
    barcodeField,
    template
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
        backgroundColor: "#fff",
        backgroundImage: editable
          ? "linear-gradient(rgba(37,99,235,.08) 1px, transparent 1px), linear-gradient(90deg, rgba(37,99,235,.08) 1px, transparent 1px)"
          : undefined,
        backgroundSize: editable ? `${MM_TO_PX * 2}px ${MM_TO_PX * 2}px` : undefined,
        boxShadow: editable ? "0 18px 50px rgba(15, 23, 42, .16)" : undefined,
      }}
    >
      <div
        style={{
          position: "relative",
          width: "100%",
          height: "100%",
          transform: previewRotation,
          transformOrigin: "center center",
        }}
      >
        {visibleFields
          .map((f) => {
            const { widthMm, heightMm } = getSafeFieldSize(template, f, visibleFields);
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
              overflow: "hidden",
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
                      width: "100%",
                      height: "100%",
                      fontSize: `${f.fontSize}pt`,
                      fontFamily: f.fontFamily || template.fontFamily,
                      fontWeight: f.bold ? 700 : 400,
                      color: f.color || "#000000",
                      textAlign: f.align || "left",
                      lineHeight: 1.05,
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      boxSizing: "border-box",
                    }}
                  >
                    {f.label ? `${f.label} ` : ""}
                    {getValue(f.key, product, f)}
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
    </div>
  );
}

export function LabelPreview(props: Props) {
  const { template, product, forPrint, copies = 1 } = props;

  if (forPrint) {
    const columns = Math.max(1, template.columns || 1);
    const columnGap = template.columnGapMm ?? 0;
    const rowGap = template.rowGapMm ?? 0;
    const marginLeft = template.marginLeftMm ?? 0;
    const marginRight = template.marginRightMm ?? 0;
    const marginTop = template.marginTopMm ?? 0;
    const marginBottom = template.marginBottomMm ?? 0;
    const rows = Math.max(1, Math.ceil(copies / columns));
    const pageWidthMm = columns * template.widthMm + (columns - 1) * columnGap + marginLeft + marginRight;
    const pageHeightMm = rows * template.heightMm + Math.max(0, rows - 1) * rowGap + marginTop + marginBottom;

    return (
      <>
        <style>
          {`
            @media print {
              @page {
                size: ${pageWidthMm}mm ${pageHeightMm}mm;
                margin: 0;
              }
              html,
              body {
                width: ${pageWidthMm}mm;
                min-height: ${pageHeightMm}mm;
              }
            }
          `}
        </style>
        <div
          id="print-area"
          style={{
            display: "grid",
            gridTemplateColumns: `repeat(${columns}, ${template.widthMm}mm)`,
            columnGap: `${columnGap}mm`,
            rowGap: `${rowGap}mm`,
            width: `${pageWidthMm}mm`,
            minHeight: `${pageHeightMm}mm`,
            padding: `${marginTop}mm ${marginRight}mm ${marginBottom}mm ${marginLeft}mm`,
            alignItems: "start",
            boxSizing: "border-box",
          }}
        >
          {Array.from({ length: copies }).map((_, i) => (
            <SingleLabel key={i} template={template} product={product} forPrint />
          ))}
        </div>
      </>
    );
  }

  return <SingleLabel {...props} />;
}
