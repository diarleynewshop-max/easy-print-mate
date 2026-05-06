import { useEffect, useRef } from "react";
import JsBarcode from "jsbarcode";
import { LabelTemplate, Product } from "@/types/label";

const MM_TO_PX = 3.78; // ~96dpi

interface Props {
  template: LabelTemplate;
  product: Product | null;
  forPrint?: boolean;
  copies?: number;
}

function formatBRL(v?: number) {
  if (v == null || isNaN(v)) return "—";
  return v.toFixed(2).replace(".", ",");
}

function getValue(key: string, p: Product | null): string {
  if (!p) {
    const samples: Record<string, string> = {
      descricao: "Produto Exemplo",
      precoVarejo: "9,90",
      precoAtacado: "8,50",
      ean: "7891234567890",
      secao: "Seção",
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

function SingleLabel({ template, product }: { template: LabelTemplate; product: Product | null }) {
  const barcodeRef = useRef<SVGSVGElement>(null);
  const ean = product?.ean || "7891234567890";

  useEffect(() => {
    if (barcodeRef.current && template.fields.find((f) => f.key === "barcode" && f.visible)) {
      try {
        JsBarcode(barcodeRef.current, ean, {
          format: ean.length === 13 ? "EAN13" : "CODE128",
          displayValue: true,
          fontSize: 10,
          height: 30,
          margin: 0,
        });
      } catch {
        try {
          JsBarcode(barcodeRef.current, ean, { format: "CODE128", height: 30, margin: 0, fontSize: 10 });
        } catch {}
      }
    }
  }, [ean, template]);

  return (
    <div
      className="label-canvas"
      style={{
        width: `${template.widthMm * MM_TO_PX}px`,
        height: `${template.heightMm * MM_TO_PX}px`,
        fontFamily: template.fontFamily,
        border: "1px dashed #999",
      }}
    >
      {template.fields
        .filter((f) => f.visible)
        .map((f) => {
          if (f.key === "barcode") {
            return (
              <svg
                key={f.key}
                ref={barcodeRef}
                style={{
                  position: "absolute",
                  left: `${f.x * MM_TO_PX}px`,
                  top: `${f.y * MM_TO_PX}px`,
                  width: `${(template.widthMm - f.x * 2) * MM_TO_PX}px`,
                  height: "auto",
                }}
              />
            );
          }
          const text = getValue(f.key, product);
          return (
            <div
              key={f.key}
              style={{
                position: "absolute",
                left: `${f.x * MM_TO_PX}px`,
                top: `${f.y * MM_TO_PX}px`,
                fontSize: `${f.fontSize}pt`,
                fontWeight: f.bold ? 700 : 400,
                lineHeight: 1.05,
                maxWidth: `${(template.widthMm - f.x) * MM_TO_PX}px`,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {f.label ? `${f.label} ` : ""}
              {text}
            </div>
          );
        })}
    </div>
  );
}

export function LabelPreview({ template, product, forPrint, copies = 1 }: Props) {
  if (forPrint) {
    return (
      <div id="print-area">
        {Array.from({ length: copies }).map((_, i) => (
          <div key={i} style={{ pageBreakAfter: "always" }}>
            <SingleLabel template={template} product={product} />
          </div>
        ))}
      </div>
    );
  }
  return <SingleLabel template={template} product={product} />;
}
