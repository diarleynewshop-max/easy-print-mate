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

function applyDescriptionMode(field: LabelField, product: Product) {
  const mode = field.descriptionMode ?? "first-word";
  const desc = cleanText(product.descricao || "");
  const tokens = desc.split(/\s+/).filter(Boolean);
  switch (mode) {
    case "first-word":
      return tokens[0] || "";
    case "first-two-words":
      return tokens.slice(0, 2).join(" ");
    case "internal-code":
      return cleanText(product.codigoInterno || tokens[0] || "");
    case "custom":
      return cleanText(field.customText || "");
    case "full":
    default:
      return desc;
  }
}

function fieldValue(field: LabelField, product: Product) {
  switch (field.key) {
    case "descricao":
      return applyDescriptionMode(field, product).slice(0, 24);
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

function safeWidthMm(template: LabelTemplate) {
  return template.widthMm - (template.safePaddingLeftMm ?? 0) - (template.safePaddingRightMm ?? 0);
}

// Auto narrow: try to fit barcode within available width
function autoBarcodeNarrow(field: LabelField, template: LabelTemplate, payload: string) {
  if (field.barcodeNarrow && field.barcodeNarrow > 0) return field.barcodeNarrow;
  if (field.barcodeBarWidth && field.barcodeBarWidth > 0) return Math.round(field.barcodeBarWidth);
  const availableMm = field.widthMm ?? safeWidthMm(template);
  const availableDots = mmToDots(availableMm);
  const len = payload.length || 13;
  // CODE128 approx: narrow * (11*chars + 35); EAN13: narrow * 113
  const approxBars = Math.max(113, 11 * len + 35);
  const narrow = Math.max(1, Math.floor(availableDots / approxBars));
  return Math.min(narrow, 4);
}

function eplBarcodeType(field: LabelField, payload: string) {
  const format = field.barcodeFormat || "auto";
  if (format === "CODE128") return "1";
  if (format === "auto" && !/^\d+$/.test(payload)) return "1";
  return "E30";
}

export function buildEplPrn(template: LabelTemplate, product: Product, copies: number) {
  const columns = Math.max(1, template.columns || 1);
  const columnGapMm = template.columnGapMm ?? 0;
  const rowGapMm = template.rowGapMm ?? 0;
  const marginLeftMm = template.marginLeftMm ?? 0;
  const marginTopMm = template.marginTopMm ?? 0;
  const marginRightMm = template.marginRightMm ?? 0;
  const marginBottomMm = template.marginBottomMm ?? 0;
  const calculatedPageWidthMm =
    columns * template.widthMm + Math.max(0, columns - 1) * columnGapMm + marginLeftMm + marginRightMm;
  const pageWidthMm =
    template.paperWidthMm && template.paperWidthMm > 0 ? template.paperWidthMm : calculatedPageWidthMm;
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
          const narrow = autoBarcodeNarrow(field, template, barcode);
          const wide = Math.max(2, Math.min(4, field.barcodeWideRatio ?? 3));
          const printText = field.barcodeDisplayValue === false ? "N" : "B";
          lines.push(`B${x},${y},0,${eplBarcodeType(field, barcode)},${narrow},${wide},${barcodeHeight(field)},${printText},"${barcode}"`);
          return;
        }

        const value = cleanText(fieldValue(field, product));
        if (!value) return;
        const { font, h, w } = textFont(field);
        lines.push(`A${x},${y},0,${font},${h},${w},N,"${value}"`);
      });
  });

  lines.push(`P${rowCopies}`);
  return `${lines.join("\r\n")}\r\n`;
}

export function buildTestPrn(template: LabelTemplate) {
  const fakeProduct: Product = {
    ean: "7891234567890",
    codigo_barras: "7891234567890",
    descricao: "TESTE-001 PRODUTO TESTE",
    codigoInterno: "TESTE-001",
    precoVarejo: 9.9,
    precoAtacado: 8.5,
    secao: "TESTE",
    estoque: 99,
  };
  return buildEplPrn(template, fakeProduct, Math.max(1, template.columns || 1));
}

// Calibration: draw label borders and a tick at the start of each column
export function buildCalibrationPrn(template: LabelTemplate) {
  const columns = Math.max(1, template.columns || 1);
  const columnGapMm = template.columnGapMm ?? 0;
  const rowGapMm = template.rowGapMm ?? 0;
  const marginLeftMm = template.marginLeftMm ?? 0;
  const marginTopMm = template.marginTopMm ?? 0;
  const marginRightMm = template.marginRightMm ?? 0;
  const marginBottomMm = template.marginBottomMm ?? 0;
  const calculatedPageWidthMm =
    columns * template.widthMm + Math.max(0, columns - 1) * columnGapMm + marginLeftMm + marginRightMm;
  const pageWidthMm =
    template.paperWidthMm && template.paperWidthMm > 0 ? template.paperWidthMm : calculatedPageWidthMm;
  const pageHeightMm = template.heightMm + marginTopMm + marginBottomMm;
  const pageWidthDots = mmToDots(pageWidthMm);
  const pageHeightDots = mmToDots(pageHeightMm);
  const gapDots = mmToDots(rowGapMm);

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

  const wDots = mmToDots(template.widthMm);
  const hDots = mmToDots(template.heightMm);

  for (let col = 0; col < columns; col++) {
    const x0 = mmToDots(marginLeftMm + col * (template.widthMm + columnGapMm));
    const y0 = mmToDots(marginTopMm);
    // 4 borders via LO (line orient): top, bottom, left, right
    lines.push(`LO${x0},${y0},${wDots},2`);
    lines.push(`LO${x0},${y0 + hDots - 2},${wDots},2`);
    lines.push(`LO${x0},${y0},2,${hDots}`);
    lines.push(`LO${x0 + wDots - 2},${y0},2,${hDots}`);
    // small tick at top-left corner
    lines.push(`LO${x0},${y0},20,8`);
    // column number
    lines.push(`A${x0 + 8},${y0 + 6},0,3,1,1,N,"COL ${col + 1}"`);
  }

  lines.push("P1");
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
