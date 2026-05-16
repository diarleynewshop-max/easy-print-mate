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
  if (field.fontSize >= 18) return { font: 5, h: 1, w: 1, charWidth: 32 };
  if (field.fontSize >= 10) return { font: 4, h: 1, w: 1, charWidth: 14 };
  if (field.fontSize >= 7) return { font: 3, h: 1, w: 1, charWidth: 12 };
  if (field.fontSize >= 5) return { font: 2, h: 1, w: 1, charWidth: 10 };
  return { font: 1, h: 1, w: 1, charWidth: 8 };
}

function getAdjustedX(template: LabelTemplate, field: LabelField, x: number, text: string, charWidth: number) {
  if (field.align !== "center" && field.align !== "right") return x;
  const dotsPerMm = getDotsPerMm(template);
  const scaledCharWidth = (charWidth * dotsPerMm) / 8;
  const textWidthDots = text.length * scaledCharWidth;
  const fieldWidthDots = mmToDots(field.widthMm ?? 0, template);
  if (field.align === "center") return Math.round(x + (fieldWidthDots - textWidthDots) / 2);
  if (field.align === "right") return Math.round(x + fieldWidthDots - textWidthDots);
  return x;
}

function barcodeHeight(field: LabelField, template: LabelTemplate) {
  const h = field.heightMm || 8;
  return Math.max(16, mmToDots(h, template));
}

function safeWidthMm(template: LabelTemplate) {
  return template.widthMm - (template.safePaddingLeftMm ?? 0) - (template.safePaddingRightMm ?? 0);
}

function autoBarcodeNarrow(field: LabelField, template: LabelTemplate, payload: string) {
  const availableDots = mmToDots(field.widthMm ?? safeWidthMm(template), template);
  const len = payload.length || 13;
  const moduleCount = len === 13 ? 113 : len === 8 ? 67 : len === 12 ? 113 : len === 14 ? 143 : Math.max(113, 11 * len + 35);
  const maxNarrow = Math.max(1, Math.floor(availableDots / moduleCount));
  
  // Use explicit narrow if provided, or derive from barWidth (presets)
  let requested = field.barcodeNarrow || (field.barcodeBarWidth ? Math.round(field.barcodeBarWidth * 2) : 2);
  
  // Scale for 300 DPI
  if (template.dpi === 300 && requested < 3) {
    requested = Math.round(requested * 1.5);
  }
  
  // If we are very close to fitting a larger narrow (within 2mm), we allow it
  // and rely on the larger 'q' command to not clip the print.
  const marginDots = mmToDots(2, template);
  const relaxedMaxNarrow = Math.max(1, Math.floor((availableDots + marginDots) / moduleCount));

  return Math.min(requested, relaxedMaxNarrow);
}

function eplBarcodeType(field: LabelField, payload: string) {
  const requested = field.barcodeFormat || "auto";
  if (requested === "CODE128") return "1";
  if (requested === "EAN13") return "E30";
  if (requested === "EAN8") return "E80";
  if (requested === "UPC") return "UA0";
  if (requested === "ITF14") return "2";
  const digitsOnly = /^\d+$/.test(payload);
  if (!digitsOnly) return "1";
  if (payload.length === 8) return "E80";
  if (payload.length === 12) return "UA0";
  if (payload.length === 13) return "E30";
  if (payload.length === 14) return "2";
  return "1";
}

function getColumnIndices(template: LabelTemplate, total: number) {
  const cols = Math.max(1, template.columns || 1);
  if (template.columnOrder === "rtl") return Array.from({ length: total }, (_, i) => cols - 1 - i);
  return Array.from({ length: total }, (_, i) => i);
}

function getFieldPosition(template: LabelTemplate, field: LabelField, offsetXmm: number) {
  return {
    x: mmToDots(offsetXmm + field.x, template),
    y: mmToDots((template.marginTopMm ?? 0) + field.y, template),
    rotation: 0 as const,
  };
}

function appendProductFields(lines: string[], template: LabelTemplate, product: Product, xOffsetMm: number) {
  template.fields
    .filter((field) => field.visible)
    .forEach((field) => {
      const { x: baseX, y, rotation } = getFieldPosition(template, field, xOffsetMm);

      if (field.key === "barcode") {
        const barcode = cleanText(product.codigo_barras || product.ean);
        if (!barcode) return;
        const narrow = autoBarcodeNarrow(field, template, barcode);
        const wide = Math.max(2, Math.min(4, field.barcodeWideRatio ?? 3));
        const totalHeightDots = mmToDots(field.heightMm || 8, template);
        const hasText = field.barcodeDisplayValue !== false;
        const textHeightDots = hasText ? mmToDots(1.6, template) : 0;
        const actualBarcodeHeightDots = Math.max(12, totalHeightDots - textHeightDots);
        
        lines.push(`B${baseX},${y},${rotation},${eplBarcodeType(field, barcode)},${narrow},${wide},${actualBarcodeHeightDots},N,"${barcode}"`);
        
        if (hasText) {
          const textY = y + actualBarcodeHeightDots + mmToDots(0.2, template);
          const { font, h, w, charWidth } = { font: 1, h: 1, w: 1, charWidth: 8 };
          const textX = getAdjustedX(template, field, baseX, barcode, charWidth);
          lines.push(`A${textX},${textY},${rotation},${font},${h},${w},N,"${barcode}"`);
        }
        return;
      }

      const value = cleanText(fieldValue(field, product));
      if (!value) return;
      const { font, h, w, charWidth } = textFont(field);
      const x = getAdjustedX(template, field, baseX, value, charWidth);
      lines.push(`A${x},${y},${rotation},${font},${h},${w},N,"${value}"`);
    });
}

export function buildEplPrn(template: LabelTemplate, product: Product, copies: number) {
  const columns = Math.max(1, template.columns || 1);
  const columnGapMm = template.columnGapMm ?? 0;
  const rowGapMm = template.rowGapMm ?? 0;
  const marginLeftMm = template.marginLeftMm ?? 0;
  const marginTopMm = template.marginTopMm ?? 0;
  const marginRightMm = template.marginRightMm ?? 0;
  const marginBottomMm = template.marginBottomMm ?? 0;
  const pageWidthMm = template.paperWidthMm || (columns * template.widthMm + (columns - 1) * columnGapMm + marginLeftMm + marginRightMm);
  const pageHeightMm = template.heightMm + marginTopMm + marginBottomMm;
  const pageWidthDots = mmToDots(pageWidthMm, template);
  const pageHeightDots = mmToDots(pageHeightMm, template);
  const gapDots = mmToDots(rowGapMm, template);
  const labelsInRow = Math.min(columns, Math.max(1, copies));
  const rowCopies = Math.max(1, Math.ceil(copies / columns));
  const rotationCmd = template.printRotation === 180 ? "ZB" : "ZT";

  // Use a generous width limit (832 is common for 4-inch printers) to prevent command dropping
  const qLimit = Math.max(pageWidthDots, 800);

  const lines = ["I8,1,001", `q${qLimit}`, "OD", "JF", "WN", rotationCmd, `Q${pageHeightDots},${gapDots}`, "N"];
  const columnIndices = getColumnIndices(template, labelsInRow);
  columnIndices.forEach((actualColumn) => {
    const offsetX = marginLeftMm + actualColumn * (template.widthMm + columnGapMm);
    appendProductFields(lines, template, product, offsetX);
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
  const pageWidthMm = template.paperWidthMm || (columns * template.widthMm + (columns - 1) * columnGapMm + marginLeftMm + marginRightMm);
  const pageHeightMm = template.heightMm + marginTopMm + marginBottomMm;
  const rotationCmd = template.printRotation === 180 ? "ZB" : "ZT";
  const pageWidthDots = mmToDots(pageWidthMm, template);
  const qLimit = Math.max(pageWidthDots, 800);

  return {
    columns,
    columnGapMm,
    marginLeftMm,
    marginTopMm,
    pageLines: ["I8,1,001", `q${qLimit}`, "OD", "JF", "WN", rotationCmd, `Q${mmToDots(pageHeightMm, template)},${mmToDots(rowGapMm, template)}`, "N"],
  };
}

export function buildEplBatchPrn(template: LabelTemplate, queue: PrintQueueItem[]) {
  const expanded = queue.flatMap((item) => Array.from({ length: Math.max(0, item.quantity) }, () => item.product));
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
  const fakeProduct: Product = { ean: "7891234567890", codigo_barras: "7891234567890", descricao: "TESTE-001 PRODUTO TESTE", codigoInterno: "TESTE-001", precoVarejo: 9.9, precoAtacado: 8.5, secao: "TESTE", estoque: 99 };
  return buildEplPrn(template, fakeProduct, Math.max(1, template.columns || 1));
}

export function buildCalibrationPrn(template: LabelTemplate) {
  const { columns, columnGapMm, marginLeftMm, marginTopMm, pageLines } = eplHeader(template);
  const lines = [...pageLines];
  const wDots = mmToDots(template.widthMm, template);
  const hDots = mmToDots(template.heightMm, template);
  for (let col = 0; col < columns; col++) {
    const x0 = mmToDots(marginLeftMm + col * (template.widthMm + columnGapMm), template);
    const y0 = mmToDots(marginTopMm, template);
    lines.push(`LO${x0},${y0},${wDots},2`);
    lines.push(`LO${x0},${y0 + hDots - 2},${wDots},2`);
    lines.push(`LO${x0},${y0},2,${hDots}`);
    lines.push(`LO${x0 + wDots - 2},${y0},2,${hDots}`);
    lines.push(`LO${x0},${y0},20,8`);
    lines.push(`A${x0 + 8},${y0 + 6},0,3,1,1,N,"COL ${col + 1}"`);
  }
  lines.push("P1");
  return `${lines.join("\r\n")}\r\n`;
}

export function downloadEplPrn(template: LabelTemplate, product: Product, copies: number) {
  const content = buildEplPrn(template, product, copies);
  const blob = new Blob([content], { type: "application/octet-stream" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `etiqueta-${product.ean || "produto"}.prn`;
  a.click();
}
