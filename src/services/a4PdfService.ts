import jsPDF from "jspdf";
import JsBarcode from "jsbarcode";
import { A4Element, A4Template, A4DynamicKey, A4FontFamily } from "@/types/a4";
import { Product } from "@/types/label";

// Import das fontes Base64 (Seria ideal carregar de arquivos, mas para manter tudo no bundle usamos consts)
// Nota: Em um app real, colocaríamos as strings base64 aqui ou em um arquivo fonts.ts
import { FONTS_VFS } from "./fonts";

export const A4_WIDTH_MM = 210;
export const A4_HEIGHT_MM = 297;

export interface BlockRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function getBlockRects(template: A4Template): BlockRect[] {
  const { rows, cols, marginTop, marginBottom, marginLeft, marginRight, rowGap, colGap } = template;
  
  const availableWidth = A4_WIDTH_MM - marginLeft - marginRight;
  const availableHeight = A4_HEIGHT_MM - marginTop - marginBottom;
  
  const blockWidth = (availableWidth - (cols - 1) * colGap) / cols;
  const blockHeight = (availableHeight - (rows - 1) * rowGap) / rows;
  
  const rects: BlockRect[] = [];
  
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      rects.push({
        x: marginLeft + c * (blockWidth + colGap),
        y: marginTop + r * (blockHeight + rowGap),
        width: blockWidth,
        height: blockHeight
      });
    }
  }
  
  return rects;
}

function formatBRL(v?: number) {
  if (v == null || isNaN(v)) return "—";
  return v.toFixed(2).replace(".", ",");
}

export function getDynamicValue(key: A4DynamicKey | undefined, p: Product | null): string {
  if (!key) return "";
  if (!p) {
    const samples: Record<A4DynamicKey, string> = {
      descricao: "PRODUTO EXEMPLO",
      ean: "7891234567890",
      codigoInterno: "1234",
      precoVarejo: "9,90",
      precoAtacado: "8,50",
      precoOriginal: "12,90",
      secao: "Seção",
      grupo: "Grupo",
      estoque: "10",
      imageUrl: "",
    };
    return samples[key];
  }
  switch (key) {
    case "descricao":
      return p.descricao || "";
    case "ean":
      return p.codigo_barras || p.ean || "";
    case "codigoInterno":
      return p.codigoInterno || "";
    case "precoVarejo":
      return formatBRL(p.precoVarejo);
    case "precoAtacado":
      return formatBRL(p.precoAtacado);
    case "precoOriginal":
      return formatBRL(p.precoOriginal);
    case "secao":
      return p.secao || "";
    case "grupo":
      return p.grupo || "";
    case "estoque":
      return p.estoque?.toString() ?? "";
    case "imageUrl":
      return p.imageUrl || "";
  }
}

function renderBarcodeDataUrl(value: string, format: "CODE128" | "EAN13", displayValue: boolean): string | null {
  try {
    const canvas = document.createElement("canvas");
    JsBarcode(canvas, value, {
      format,
      displayValue,
      margin: 0,
      height: 60,
      fontSize: 14,
      width: 2,
    });
    return canvas.toDataURL("image/png");
  } catch {
    return null;
  }
}

function pickBarcodeFormat(value: string, requested?: A4Element["barcodeFormat"]): "CODE128" | "EAN13" {
  if (requested && requested !== "auto") return requested;
  return value.length === 13 && /^\d+$/.test(value) ? "EAN13" : "CODE128";
}

// Fontes nativas do jsPDF (não precisam de arquivo externo)
const JSPDF_NATIVE_FONTS = new Set(["helvetica", "courier", "times", "symbol", "zapfdingbats"]);

function applyFont(doc: jsPDF, el: A4Element, scale = 1) {
  const rawFamily = (el.fontFamily || "helvetica").toLowerCase();
  const style = el.bold && el.italic ? "bolditalic" : el.bold ? "bold" : el.italic ? "italic" : "normal";

  // Usa fonte nativa se disponível; senão tenta custom com fallback para helvetica
  if (JSPDF_NATIVE_FONTS.has(rawFamily)) {
    try {
      doc.setFont(rawFamily, style);
    } catch {
      doc.setFont("helvetica", "normal");
    }
  } else {
    // Tenta registrar e usar fonte customizada — só se houver dado VFS real (não placeholder)
    const customFonts: Record<string, { file: string; variant: string }[]> = {
      anton:    [{ file: "Anton-Regular.ttf", variant: "normal" }],
      roboto:   [{ file: "Roboto-Regular.ttf", variant: "normal" }, { file: "Roboto-Bold.ttf", variant: "bold" }],
      opensans: [{ file: "OpenSans-Regular.ttf", variant: "normal" }, { file: "OpenSans-Bold.ttf", variant: "bold" }],
      bebasneue:[{ file: "BebasNeue-Regular.ttf", variant: "normal" }],
    };

    const key = Object.keys(customFonts).find((k) => rawFamily.replace(/\s/g, "").toLowerCase().startsWith(k));
    let applied = false;

    if (key) {
      try {
        for (const { file, variant } of customFonts[key]) {
          const b64 = FONTS_VFS[file];
          // Só adiciona se o dado parecer um base64 real (>200 chars, sem '.')
          if (b64 && b64.length > 200 && !b64.includes(".")) {
            if (!doc.existsFileInVFS(file)) doc.addFileToVFS(file, b64);
            doc.addFont(file, key, variant);
          }
        }
        const wantBold = style.includes("bold");
        doc.setFont(key, customFonts[key].some((f) => f.variant === "bold") && wantBold ? "bold" : "normal");
        applied = true;
      } catch {
        applied = false;
      }
    }

    if (!applied) {
      // Fallback seguro para helvetica
      doc.setFont("helvetica", style === "bolditalic" || style === "bold" ? "bold" : "normal");
    }
  }

  doc.setFontSize(el.fontSize * scale);
  if (el.color) {
    const hex = el.color.replace("#", "");
    if (hex.length === 6) {
      doc.setTextColor(parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16));
    }
  } else {
    doc.setTextColor(0, 0, 0);
  }
}

function hexToRgb(hexValue?: string) {
  const hex = (hexValue || "#000000").replace("#", "");
  if (hex.length !== 6) return { r: 0, g: 0, b: 0 };
  return {
    r: parseInt(hex.slice(0, 2), 16),
    g: parseInt(hex.slice(2, 4), 16),
    b: parseInt(hex.slice(4, 6), 16),
  };
}

function drawShape(doc: jsPDF, el: A4Element, x: number, y: number, scale = 1) {
  const fill = hexToRgb(el.fillColor || "#ef4444");
  const stroke = hexToRgb(el.strokeColor || el.fillColor || "#ef4444");
  const lineWidth = Math.max(0, (el.strokeWidthMm ?? 0) * scale);
  const mode = lineWidth > 0 ? "FD" : "F";
  const width = el.widthMm * scale;
  const height = el.heightMm * scale;

  doc.setFillColor(fill.r, fill.g, fill.b);
  doc.setDrawColor(stroke.r, stroke.g, stroke.b);
  doc.setLineWidth(lineWidth);

  switch (el.shapeKind || "rect") {
    case "circle":
      doc.ellipse(x + width / 2, y + height / 2, width / 2, height / 2, mode);
      break;
    case "line":
      doc.setLineWidth(Math.max(0.2, lineWidth || 1));
      doc.line(x, y + height / 2, x + width, y + height / 2);
      break;
    case "roundRect":
      doc.roundedRect(x, y, width, height, 4 * scale, 4 * scale, mode);
      break;
    case "rect":
    default:
      doc.rect(x, y, width, height, mode);
      break;
  }
}

function drawElement(doc: jsPDF, el: A4Element, originX: number, originY: number, product: Product | null, scale = 1) {
  const ax = originX + el.x * scale;
  const ay = originY + el.y * scale;
  const width = el.widthMm * scale;
  const height = el.heightMm * scale;

  if (el.type === "shape") {
    drawShape(doc, el, ax, ay, scale);
    return;
  }

  // Foto do produto vinda do ERP (Dynamic field "imageUrl")
  if (el.type === "dynamic" && el.field === "imageUrl") {
    const url = product?.imageUrl || "";
    if (url) {
       // O jsPDF no front-end tem dificuldades com imagens externas (CORS)
       // Idealmente o bridge no Electron já deveria trazer o base64
       // Vamos assumir que se estiver no Electron, o URL é local ou tratável
       try {
         doc.addImage(url, "JPEG", ax, ay, width, height);
       } catch (e) {
         console.warn("Erro ao carregar imagem ERP no PDF", e);
       }
    }
    return;
  }

  if (el.type === "image" && el.imageDataUrl) {
    const format = el.imageDataUrl.startsWith("data:image/png") ? "PNG" : "JPEG";
    doc.addImage(el.imageDataUrl, format, ax, ay, width, height);
    return;
  }

  if (el.type === "barcode") {
    const value = (product?.codigo_barras || product?.ean || "7891234567890").trim();
    if (!value) return;
    const format = pickBarcodeFormat(value, el.barcodeFormat);
    const displayValue = el.barcodeDisplayValue ?? true;
    const dataUrl = renderBarcodeDataUrl(value, format, displayValue);
    if (dataUrl) {
      doc.addImage(dataUrl, "PNG", ax, ay, width, height);
    }
    return;
  }

  const text =
    el.type === "text"
      ? el.text || ""
      : `${el.prefix || ""}${getDynamicValue(el.field, product)}`;
  if (!text) return;

  applyFont(doc, el, scale);
  // posicionar baseline próximo do topo da caixa
  const fontSizeMm = (el.fontSize * scale * 0.3528); // pt -> mm
  const baselineY = ay + fontSizeMm * 0.85;

  let drawX = ax;
  const align = el.align || "left";
  if (align === "center") drawX = ax + width / 2;
  else if (align === "right") drawX = ax + width;

  // quebra texto se necessário (apenas por largura)
  const lines = doc.splitTextToSize(text, width);
  doc.text(lines as string[], drawX, baselineY, { align, baseline: "alphabetic" });
}

export function getA4RenderMetrics(template: A4Template, targetRect: BlockRect) {
  return {
    scale: 1,
    x: targetRect.x + template.paddingMm,
    y: targetRect.y + template.paddingMm,
  };
}

export function renderA4Pdf(
  template: A4Template,
  blockProducts: (Product | null)[],
): jsPDF {
  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
  const rects = getBlockRects(template);
  const blocksPerPage = template.rows * template.cols;

  for (let i = 0; i < blockProducts.length; i++) {
    const pageIndex = Math.floor(i / blocksPerPage);
    const blockIndex = i % blocksPerPage;
    
    if (pageIndex > 0 && blockIndex === 0) {
      doc.addPage();
    }
    
    const rect = rects[blockIndex];
    const product = blockProducts[i] || null;
    
    if (template.showBorder) {
      doc.setDrawColor(180, 180, 180);
      doc.setLineDashPattern([1, 1], 0);
      doc.rect(rect.x, rect.y, rect.width, rect.height);
      doc.setLineDashPattern([], 0);
    }
    
    const render = getA4RenderMetrics(template, rect);
    template.elements.forEach((el) => drawElement(doc, el, render.x, render.y, product, render.scale));
  }

  return doc;
}

export function downloadA4Pdf(template: A4Template, products: (Product | null)[], filename = "etiquetas-a4.pdf") {
  const doc = renderA4Pdf(template, products);
  doc.save(filename);
}

export async function printA4Pdf(template: A4Template, products: (Product | null)[], printerName?: string): Promise<void> {
  const doc = renderA4Pdf(template, products);

  if (window.easyPrint?.isDesktop) {
    // Envia os bytes do PDF via IPC — evita limitação de tamanho da data URL
    const buf = doc.output("arraybuffer") as ArrayBuffer;
    const bytes = Array.from(new Uint8Array(buf));
    await window.easyPrint.printPdf(bytes, printerName || "");
    return;
  }

  // Web fallback: abre blob URL e aciona diálogo de impressão
  const url = doc.output("bloburl") as unknown as string;
  const w = window.open(url, "_blank");
  if (w) {
    setTimeout(() => { try { w.focus(); w.print(); } catch {} }, 500);
  }
}
