import { useEffect, useRef } from "react";
import JsBarcode from "jsbarcode";
import { LabelField, LabelFieldKey, LabelTemplate, Product } from "@/types/label";
import { cn } from "@/lib/utils";

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

function useBarcode(ean: string, visible: boolean, widthMm: number, barAreaPx: number, field?: LabelField, template?: LabelTemplate) {
  const barcodeRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!barcodeRef.current || !visible) return;
    const options = {
      displayValue: false, // numbers rendered separately as plain text
      lineColor: field?.barcodeLineColor || field?.color || "#000000",
      height: Math.max(8, barAreaPx),
      width: Math.max(0.4, field?.barcodeBarWidth ?? widthMm / 42),
      margin: 0,
    };

    const fixViewBox = (svg: SVGSVGElement) => {
      const w = svg.getAttribute("width");
      const h = svg.getAttribute("height");
      if (w && h) {
        svg.setAttribute("viewBox", `0 0 ${w} ${h}`);
        svg.setAttribute("preserveAspectRatio", "none"); // stretch to fill bar area exactly
        svg.removeAttribute("width");
        svg.removeAttribute("height");
      }
    };

    try {
      JsBarcode(barcodeRef.current, ean, { format: getBarcodeFormat(ean, field), ...options });
      fixViewBox(barcodeRef.current);
    } catch {
      try {
        JsBarcode(barcodeRef.current, ean, { format: "CODE128", ...options });
        fixViewBox(barcodeRef.current);
      } catch {
        // If CODE128 also fails, we have a fundamental issue with the EAN data
      }
    }
  }, [ean, visible, widthMm, barAreaPx, field, template]);

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
  const previewRotation: string | undefined = undefined;
  const barcodeField = template.fields.find((f) => f.key === "barcode");

  // Pre-compute bar area height for the hook (independent of number text height)
  const barcodeShowNums = barcodeField?.barcodeDisplayValue !== false;
  const barcodeTextSizePx = Math.max(4, barcodeField?.fontSize ?? 9);
  const barcodeTextMarginPx = Math.max(0, barcodeField?.barcodeTextMargin ?? 1);
  const barcodeTotalPx = barcodeField ? getFieldHeight(barcodeField) * MM_TO_PX : 30;
  const barcodeNumAreaPx = barcodeShowNums ? barcodeTextSizePx + barcodeTextMarginPx : 0;
  const barcodeBarAreaPx = Math.max(8, barcodeTotalPx - barcodeNumAreaPx);

  const barcodeRef = useBarcode(
    product?.codigo_barras || product?.ean || "7891234567890",
    Boolean(barcodeField?.visible),
    barcodeField ? getFieldWidth(template, barcodeField) : 36,
    barcodeBarAreaPx,
    barcodeField,
    template
  );

  type ResizeDir = "move" | "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";

  const startPointerEdit = (event: React.PointerEvent, field: LabelField, dir: ResizeDir) => {
    if (!editable || !onFieldChange) return;
    event.preventDefault();
    event.stopPropagation();
    onSelectField?.(field.key);

    const startX = event.clientX;
    const startY = event.clientY;
    const orig = {
      x: field.x,
      y: field.y,
      w: getFieldWidth(template, field),
      h: getFieldHeight(field),
    };

    const onMove = (e: PointerEvent) => {
      const dxMm = (e.clientX - startX) / MM_TO_PX;
      const dyMm = (e.clientY - startY) / MM_TO_PX;

      if (dir === "move") {
        onFieldChange(field.key, {
          x: Number(clamp(orig.x + dxMm, 0, template.widthMm - 2).toFixed(1)),
          y: Number(clamp(orig.y + dyMm, 0, template.heightMm - 2).toFixed(1)),
        });
        return;
      }

      let x = orig.x, y = orig.y, w = orig.w, h = orig.h;

      if (dir.includes("e")) w = clamp(orig.w + dxMm, 4, template.widthMm - orig.x);
      if (dir.includes("s")) h = clamp(orig.h + dyMm, 3, template.heightMm - orig.y);
      if (dir.includes("w")) {
        const nx = clamp(orig.x + dxMm, 0, orig.x + orig.w - 4);
        w = orig.w - (nx - orig.x);
        x = nx;
      }
      if (dir.includes("n")) {
        const ny = clamp(orig.y + dyMm, 0, orig.y + orig.h - 3);
        h = orig.h - (ny - orig.y);
        y = ny;
      }

      onFieldChange(field.key, {
        x: Number(x.toFixed(1)),
        y: Number(y.toFixed(1)),
        widthMm: Number(w.toFixed(1)),
        heightMm: Number(h.toFixed(1)),
      });
    };

    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  const HANDLES: { dir: Exclude<ResizeDir, "move">; top?: number | string; bottom?: number | string; left?: number | string; right?: number | string; cursor: string }[] = [
    { dir: "nw", top: -5, left: -5, cursor: "nwse-resize" },
    { dir: "n",  top: -5, left: "calc(50% - 4px)", cursor: "ns-resize" },
    { dir: "ne", top: -5, right: -5, cursor: "nesw-resize" },
    { dir: "w",  top: "calc(50% - 4px)", left: -5, cursor: "ew-resize" },
    { dir: "e",  top: "calc(50% - 4px)", right: -5, cursor: "ew-resize" },
    { dir: "sw", bottom: -5, left: -5, cursor: "nesw-resize" },
    { dir: "s",  bottom: -5, left: "calc(50% - 4px)", cursor: "ns-resize" },
    { dir: "se", bottom: -5, right: -5, cursor: "nwse-resize" },
  ];

  return (
    <div className={cn("relative", editable && "p-8 bg-muted/20 rounded-xl border border-dashed border-primary/20")}>
      {editable && (
        <>
          {/* Horizontal Ruler */}
          <div 
            className="absolute left-8 top-0 flex border-b border-primary/20 bg-background/50 overflow-hidden"
            style={{ width: measure(template.widthMm), height: 24 }}
          >
            {Array.from({ length: Math.ceil(template.widthMm) + 1 }).map((_, i) => (
              <div 
                key={i} 
                className="absolute bottom-0 border-l border-primary/30" 
                style={{ 
                  left: measure(i), 
                  height: i % 10 === 0 ? 12 : i % 5 === 0 ? 8 : 4,
                  borderColor: i % 5 === 0 ? "rgba(37,99,235,0.5)" : "rgba(37,99,235,0.2)"
                }}
              >
                {i % 10 === 0 && (
                  <span className="absolute -left-1 -top-4 text-[9px] font-mono font-bold text-primary/60">{i}</span>
                )}
              </div>
            ))}
          </div>

          {/* Vertical Ruler */}
          <div 
            className="absolute left-0 top-8 flex flex-col border-r border-primary/20 bg-background/50 overflow-hidden"
            style={{ width: 24, height: measure(template.heightMm) }}
          >
            {Array.from({ length: Math.ceil(template.heightMm) + 1 }).map((_, i) => (
              <div 
                key={i} 
                className="absolute right-0 border-t border-primary/30" 
                style={{ 
                  top: measure(i), 
                  width: i % 10 === 0 ? 12 : i % 5 === 0 ? 8 : 4,
                  borderColor: i % 5 === 0 ? "rgba(37,99,235,0.5)" : "rgba(37,99,235,0.2)"
                }}
              >
                {i % 10 === 0 && (
                  <span className="absolute -top-2 -left-4 w-4 text-right text-[9px] font-mono font-bold text-primary/60">{i}</span>
                )}
              </div>
            ))}
          </div>

          {/* Origin Indicator (0,0) */}
          <div className="absolute left-4 top-4 h-4 w-4 flex items-center justify-center">
            <div className="h-px w-full bg-primary/20 absolute" />
            <div className="w-px h-full bg-primary/20 absolute" />
            <span className="text-[8px] font-bold text-primary/40 relative z-10 bg-background px-0.5">MM</span>
          </div>
        </>
      )}

      <div
        ref={canvasRef}
        className="label-canvas relative z-10"
        style={{
          width: measure(template.widthMm),
          height: measure(template.heightMm),
          fontFamily: template.fontFamily,
          border: forPrint ? "none" : "1px solid #2563eb33",
          backgroundColor: "#fff",
          backgroundImage: editable
            ? "linear-gradient(rgba(37,99,235,.08) 1px, transparent 1px), linear-gradient(90deg, rgba(37,99,235,.08) 1px, transparent 1px)"
            : undefined,
          backgroundSize: editable ? `${MM_TO_PX * 2}px ${MM_TO_PX * 2}px` : undefined,
          boxShadow: editable ? "0 25px 50px -12px rgba(0, 0, 0, 0.25)" : undefined,
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
            const scaleX = f.scaleX ?? 1;
            const textOrigin = f.align === "center" ? "center center" : f.align === "right" ? "right center" : "left center";

            const commonStyle: React.CSSProperties = {
              position: "absolute",
              left: measure(f.x),
              top: measure(f.y),
              width: measure(widthMm),
              height: measure(heightMm),
              outline: selected ? "1.5px solid #2563eb" : editable ? "1px dashed rgba(37,99,235,.25)" : "none",
              cursor: editable ? "move" : "default",
              boxSizing: "border-box",
              overflow: "visible",
            };

            return (
              <div
                key={f.key}
                style={commonStyle}
                onPointerDown={(event) => startPointerEdit(event, f, "move")}
                onClick={() => onSelectField?.(f.key)}
              >
                {f.key === "barcode" ? (() => {
                  const showNums = f.barcodeDisplayValue !== false;
                  const textSizePx = Math.max(4, f.fontSize ?? 9);
                  const textMarginPx = Math.max(0, f.barcodeTextMargin ?? 1);
                  const totalPx = heightMm * MM_TO_PX;
                  const numAreaPx = showNums ? textSizePx + textMarginPx : 0;
                  const barPx = Math.max(8, totalPx - numAreaPx);
                  const isTop = f.barcodeTextPosition === "top";
                  const eanStr = product?.codigo_barras || product?.ean || "7891234567890";

                  return (
                    <div style={{
                      width: "100%",
                      height: "100%",
                      overflow: "hidden",
                      display: "flex",
                      flexDirection: isTop ? "column-reverse" : "column",
                    }}>
                      <div style={{ width: "100%", height: `${barPx}px`, flexShrink: 0 }}>
                        <svg ref={barcodeRef} style={{ width: "100%", height: "100%", display: "block" }} />
                      </div>
                      {showNums && (
                        <div style={{
                          width: "100%",
                          height: `${textSizePx}px`,
                          marginTop: isTop ? 0 : `${textMarginPx}px`,
                          marginBottom: isTop ? `${textMarginPx}px` : 0,
                          fontSize: `${textSizePx}px`,
                          fontFamily: f.fontFamily || template.fontFamily,
                          fontWeight: f.bold ? 700 : 400,
                          color: f.color || "#000000",
                          textAlign: (f.align || "center") as React.CSSProperties["textAlign"],
                          lineHeight: 1,
                          overflow: "hidden",
                          flexShrink: 0,
                          letterSpacing: "0.05em",
                        }}>
                          {eanStr}
                        </div>
                      )}
                    </div>
                  );
                })() : (
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
                      transform: scaleX !== 1 ? `scaleX(${scaleX})` : undefined,
                      transformOrigin: scaleX !== 1 ? textOrigin : undefined,
                    }}
                  >
                    {f.label ? `${f.label} ` : ""}
                    {getValue(f.key, product, f)}
                  </div>
                )}

                {editable && selected && HANDLES.map(({ dir, cursor, ...pos }) => (
                  <button
                    key={dir}
                    type="button"
                    aria-label={`Redimensionar ${dir}`}
                    onPointerDown={(event) => startPointerEdit(event, f, dir)}
                    style={{
                      position: "absolute",
                      ...pos,
                      width: 9,
                      height: 9,
                      borderRadius: 2,
                      border: "1.5px solid #fff",
                      background: "#2563eb",
                      cursor,
                      padding: 0,
                      zIndex: 10,
                    }}
                  />
                ))}
              </div>
            );
          })}
        </div>
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
