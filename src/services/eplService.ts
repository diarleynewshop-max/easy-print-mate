import { LabelField, LabelTemplate, PrintQueueItem, Product } from "@/types/label";

const DEFAULT_DPI = 203;

function getDotsPerMm(template?: LabelTemplate) {
  const dpi = template?.dpi || DEFAULT_DPI;
  return dpi === 300 ? 11.81 : 8;
}

function mmToDots(mm: number, template?: LabelTemplate) {
  return Math.round(mm * getDotsPerMm(template));
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

function barcodeHeight(field: LabelField, template: LabelTemplate) {
  return Math.max(24, mmToDots(field.heightMm ?? 8, template));
}

function safeWidthMm(template: LabelTemplate) {
  return template.widthMm - (template.safePaddingLeftMm ?? 0) - (template.safePaddingRightMm ?? 0);
}

// Auto narrow: fit barcode within field width, capping preset values if needed
function autoBarcodeNarrow(field: LabelField, template: LabelTemplate, payload: string) {
  const availableDots = mmToDots(field.widthMm ?? safeWidthMm(template), template);
  const len = payload.length || 13;
  // Module count per barcode type
  const moduleCount =
    len === 13 ? 113 :  // EAN-13
    len === 8  ? 67  :  // EAN-8
    len === 12 ? 113 :  // UPC-A
    len === 14 ? 143 :  // ITF-14
    Math.max(113, 11 * len + 35); // CODE128 approx
  const maxNarrow = Math.max(1, Math.floor(availableDots / moduleCount));

  if (field.barcodeNarrow && field.barcodeNarrow > 0) {
    // Cap preset value so barcode never exceeds field width
    return Math.min(field.barcodeNarrow, maxNarrow);
  }
  // barcodeBarWidth is jsbarcode visual units (not mm) — round directly, no mm conversion
  if (field.barcodeBarWidth && field.barcodeBarWidth > 0) {
    return Math.min(Math.max(1, Math.round(field.barcodeBarWidth)), maxNarrow);
  }
  return maxNarrow;
}

function eplBarcodeType(field: LabelField, payload: string) {
  const digitsOnly = /^\d+$/.test(payload);
  const requested = field.barcodeFormat || "auto";
  if (requested === "CODE128") return "1";
  if (requested === "EAN13") return "E30";
  if (requested === "EAN8") return "E80";
  if (requested === "UPC") return "UA0";
  if (requested === "ITF14") return "2";
  if (!digitsOnly) return "1";
  if (payload.length === 8) return "E80";
  if (payload.length === 12) return "UA0";
  if (payload.length === 13) return "E30";
  if (payload.length === 14) return "2";
  return "1";
}

function getColumnIndices(template: LabelTemplate, total: number) {
  const cols = Math.max(1, template.columns || 1);
  if (template.columnOrder === "rtl") {
    return Array.from({ length: total }, (_, i) => cols - 1 - i);
  }
  return Array.from({ length: total }, (_, i) => i);
}

function getFieldPosition(template: LabelTemplate, field: LabelField, offsetXmm: number) {
  return {
    x: mmToDots(offsetXmm + field.x, template),
    y: mmToDots((template.marginTopMm ?? 0) + field.y, template),
    rotation: 0 as const, // We use ZB in header for 180 rotation
  };
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
  const pageWidthDots = mmToDots(pageWidthMm, template);
  const pageHeightDots = mmToDots(pageHeightMm, template);
  const gapDots = mmToDots(rowGapMm, template);
  const labelsInRow = Math.min(columns, Math.max(1, copies));
  const rowCopies = Math.max(1, Math.ceil(copies / columns));

  const rotationCmd = template.printRotation === 180 ? "ZB" : "ZT";

  const lines = [
    "I8,1,001",
    `q${pageWidthDots}`,
    "OD",
    "JF",
    "WN",
    rotationCmd,
    `Q${pageHeightDots},${gapDots}`,
    "N",
  ];

  const columnIndices = getColumnIndices(template, labelsInRow);
  columnIndices.forEach((actualColumn) => {
    const offsetX = marginLeftMm + actualColumn * (template.widthMm + columnGapMm);

    template.fields
      .filter((field) => field.visible)
      .forEach((field) => {
        const { x, y, rotation } = getFieldPosition(template, field, offsetX);

        if (field.key === "barcode") {
          const barcode = cleanText(product.codigo_barras || product.ean);
          if (!barcode) return;
          const narrow = autoBarcodeNarrow(field, template, barcode);
          const wide = Math.max(2, Math.min(4, field.barcodeWideRatio ?? 3));
          const printText = field.barcodeDisplayValue === false ? "N" : "B";
          lines.push(`B${x},${y},${rotation},${eplBarcodeType(field, barcode)},${narrow},${wide},${barcodeHeight(field, template)},${printText},"${barcode}"`);
          return;
        }

        const value = cleanText(fieldValue(field, product));
        if (!value) return;
        const { font, h, w } = textFont(field);
        lines.push(`A${x},${y},${rotation},${font},${h},${w},N,"${value}"`);
      });
  });

  lines.push(`P${rowCopies}`);
  return `${lines.join("\r\n")}\r\n`;
}

function eplHeader(template: LabelTemplate) {
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

  const rotationCmd = template.printRotation === 180 ? "ZB" : "ZT";

  return {
    columns,
    columnGapMm,
    marginLeftMm,
    marginTopMm,
    pageLines: [
      "I8,1,001",
      `q${mmToDots(pageWidthMm, template)}`,
      "OD",
      "JF",
      "WN",
      rotationCmd,
      `Q${mmToDots(pageHeightMm, template)},${mmToDots(rowGapMm, template)}`,
      "N",
    ],
  };
}



function appendProductFields(lines: string[], template: LabelTemplate, product: Product, xOffsetMm: number) {
  template.fields
    .filter((field) => field.visible)
    .forEach((field) => {
      const { x, y, rotation } = getFieldPosition(template, field, xOffsetMm);

      if (field.key === "barcode") {
        const barcode = cleanText(product.codigo_barras || product.ean);
        if (!barcode) return;
        const narrow = autoBarcodeNarrow(field, template, barcode);
        const wide = Math.max(2, Math.min(4, field.barcodeWideRatio ?? 3));
        const printText = field.barcodeDisplayValue === false ? "N" : "B";
        lines.push(`B${x},${y},${rotation},${eplBarcodeType(field, barcode)},${narrow},${wide},${barcodeHeight(field, template)},${printText},"${barcode}"`);
        return;
      }

      const value = cleanText(fieldValue(field, product));
      if (!value) return;
      const { font, h, w } = textFont(field);
      lines.push(`A${x},${y},${rotation},${font},${h},${w},N,"${value}"`);
    });
}

export function buildEplBatchPrn(template: LabelTemplate, queue: PrintQueueItem[]) {
  const expanded = queue.flatMap((item) =>
    Array.from({ length: Math.max(0, item.quantity) }, () => item.product),
  );
  if (!expanded.length) return "";

  const { columns, columnGapMm, marginLeftMm, pageLines } = eplHeader(template);
  const jobs: string[] = [];

  for (let start = 0; start < expanded.length; start += columns) {
    const lines = [...pageLines];
    const rowItems = expanded.slice(start, start + columns);
    const columnIndices = getColumnIndices(template, rowItems.length);
    rowItems.forEach((product, index) => {
      const actualColumn = columnIndices[index];
      const offsetX = marginLeftMm + actualColumn * (template.widthMm + columnGapMm);
      appendProductFields(lines, template, product, offsetX);
    });
    lines.push("P1");
    jobs.push(lines.join("\r\n"));
  }

  return `${jobs.join("\r\n")}\r\n`;
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
  const pageWidthDots = mmToDots(pageWidthMm, template);
  const pageHeightDots = mmToDots(pageHeightMm, template);
  const gapDots = mmToDots(rowGapMm, template);

  const rotationCmd = template.printRotation === 180 ? "ZB" : "ZT";

  const lines = [
    "I8,1,001",
    `q${pageWidthDots}`,
    "OD",
    "JF",
    "WN",
    rotationCmd,
    `Q${pageHeightDots},${gapDots}`,
    "N",
  ];

  const wDots = mmToDots(template.widthMm, template);
  const hDots = mmToDots(template.heightMm, template);

  for (let col = 0; col < columns; col++) {
    const x0 = mmToDots(marginLeftMm + col * (template.widthMm + columnGapMm), template);
    const y0 = mmToDots(marginTopMm, template);
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
