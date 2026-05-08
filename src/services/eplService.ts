import { LabelField, LabelTemplate, Product } from "@/types/label";

const DOTS_PER_MM = 8;

function mmToDots(mm: number) {
  return Math.round(mm * DOTS_PER_MM);
}

function cleanText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/"/g, "'")
    .replace(/[^\x20-\x7E]/g, "")
    .trim();
}

function formatBRL(value?: number) {
  if (value == null || Number.isNaN(value)) return "";
  return value.toFixed(2).replace(".", ",");
}

function firstDescriptionToken(product: Product) {
  const value = cleanText(product.descricao);
  return value.split(/\s+/)[0] || cleanText(product.codigoInterno || "");
}

function fieldValue(field: LabelField, product: Product) {
  switch (field.key) {
    case "descricao":
      return firstDescriptionToken(product).slice(0, 12);
    case "precoVarejo":
      return `${field.label ? `${field.label} ` : ""}${formatBRL(product.precoVarejo)}`.trim();
    case "precoAtacado":
      return `${field.label ? `${field.label} ` : ""}${formatBRL(product.precoAtacado)}`.trim();
    case "ean":
      return product.codigo_barras || product.ean;
    case "secao":
      return cleanText(product.secao || product.grupo || "");
    case "estoque":
      return product.estoque?.toString() || "";
    case "codigoInterno":
      return cleanText(product.codigoInterno || "");
    default:
      return "";
  }
}

function textFont(field: LabelField) {
  if (field.fontSize >= 18) return { font: 5, h: 1, w: 1 };
  if (field.fontSize >= 10) return { font: 4, h: 1, w: 1 };
  if (field.fontSize >= 6) return { font: 3, h: 1, w: 1 };
  return { font: 1, h: 1, w: 1 };
}

function barcodeHeight(field: LabelField) {
  return Math.max(24, mmToDots(field.heightMm ?? 8));
}

function fieldWidth(template: LabelTemplate, field: LabelField) {
  return field.widthMm ?? Math.max(8, template.widthMm - field.x - (template.marginRightMm ?? 0));
}

function fieldHeight(field: LabelField) {
  return field.heightMm ?? (field.key === "barcode" ? 10 : Math.max(4, field.fontSize * 0.42));
}

export function buildEplPrn(template: LabelTemplate, product: Product, copies: number) {
  const columns = Math.max(1, template.columns || 1);
  const columnGapMm = template.columnGapMm ?? 0;
  const rowGapMm = template.rowGapMm ?? 0;
  const marginLeftMm = template.marginLeftMm ?? 0;
  const marginTopMm = template.marginTopMm ?? 0;
  const marginRightMm = template.marginRightMm ?? 0;
  const marginBottomMm = template.marginBottomMm ?? 0;
  const calculatedPageWidthMm = columns * template.widthMm + Math.max(0, columns - 1) * columnGapMm + marginLeftMm + marginRightMm;
  const pageWidthMm = template.paperWidthMm && template.paperWidthMm > 0 ? template.paperWidthMm : calculatedPageWidthMm;
  const pageHeightMm = template.heightMm + marginTopMm + marginBottomMm;
  const pageWidthDots = mmToDots(pageWidthMm);
  const pageHeightDots = mmToDots(pageHeightMm);
  const gapDots = mmToDots(rowGapMm);
  const labelsInRow = Math.min(columns, Math.max(1, copies));
  const rowCopies = Math.max(1, Math.ceil(copies / columns));
  const lines = [
    "I8,1,001",
    `q${pageWidthDots}`,
    "OD",
    "JF",
    "WN",
    "ZT",
    `Q${pageHeightDots},${gapDots}`,
    "N",
  ];

  Array.from({ length: labelsInRow }).forEach((_, col) => {
    const offsetX = marginLeftMm + col * (template.widthMm + columnGapMm);

    template.fields
      .filter((field) => field.visible)
      .forEach((field) => {
        const x = mmToDots(offsetX + field.x);
        const y = mmToDots(marginTopMm + field.y);

        if (field.key === "barcode") {
          const barcode = cleanText(product.codigo_barras || product.ean);
          if (!barcode) return;
          lines.push(`B${x},${y},0,E30,2,4,${barcodeHeight(field)},N,"${barcode}"`);
          return;
        }

        const value = cleanText(fieldValue(field, product));
        if (!value) return;
        const { font, h, w } = textFont(field);
        const reverse = "N";
        lines.push(`A${x},${y},0,${font},${h},${w},${reverse},"${value}"`);
      });
  });

  lines.push(`P${rowCopies}`);
  return `${lines.join("\r\n")}\r\n`;
}

export function downloadEplPrn(template: LabelTemplate, product: Product, copies: number) {
  const content = buildEplPrn(template, product, copies);
  const blob = new Blob([content], { type: "application/octet-stream" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `etiqueta-${product.ean || "produto"}.prn`;
  a.click();
  URL.revokeObjectURL(url);
}
