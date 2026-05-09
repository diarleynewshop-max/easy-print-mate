import jsPDF from "jspdf";
import JsBarcode from "jsbarcode";
import { A4BlockCount, A4Element, A4Template, A4DynamicKey } from "@/types/a4";
import { Product } from "@/types/label";

export const A4_WIDTH_MM = 210;
export const A4_HEIGHT_MM = 297;

export interface BlockRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function getBlockRects(blocks: A4BlockCount): BlockRect[] {
  switch (blocks) {
    case 1:
      return [{ x: 0, y: 0, width: A4_WIDTH_MM, height: A4_HEIGHT_MM }];
    case 2:
      return [
        { x: 0, y: 0, width: A4_WIDTH_MM, height: A4_HEIGHT_MM / 2 },
        { x: 0, y: A4_HEIGHT_MM / 2, width: A4_WIDTH_MM, height: A4_HEIGHT_MM / 2 },
      ];
    case 4:
      return [
        { x: 0, y: 0, width: A4_WIDTH_MM / 2, height: A4_HEIGHT_MM / 2 },
        { x: A4_WIDTH_MM / 2, y: 0, width: A4_WIDTH_MM / 2, height: A4_HEIGHT_MM / 2 },
        { x: 0, y: A4_HEIGHT_MM / 2, width: A4_WIDTH_MM / 2, height: A4_HEIGHT_MM / 2 },
        { x: A4_WIDTH_MM / 2, y: A4_HEIGHT_MM / 2, width: A4_WIDTH_MM / 2, height: A4_HEIGHT_MM / 2 },
      ];
  }
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
      secao: "Seção",
      grupo: "Grupo",
      estoque: "10",
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
    case "secao":
      return p.secao || "";
    case "grupo":
      return p.grupo || "";
    case "estoque":
      return p.estoque?.toString() ?? "";
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

function applyFont(doc: jsPDF, el: A4Element) {
  const family = el.fontFamily || "helvetica";
  const style = el.bold && el.italic ? "bolditalic" : el.bold ? "bold" : el.italic ? "italic" : "normal";
  doc.setFont(family, style);
  doc.setFontSize(el.fontSize);
  if (el.color) {
    const hex = el.color.replace("#", "");
    if (hex.length === 6) {
      doc.setTextColor(parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16));
    }
  } else {
    doc.setTextColor(0, 0, 0);
  }
}

function drawElement(doc: jsPDF, el: A4Element, originX: number, originY: number, product: Product | null) {
  const ax = originX + el.x;
  const ay = originY + el.y;

  if (el.type === "barcode") {
    const value = (product?.codigo_barras || product?.ean || "7891234567890").trim();
    if (!value) return;
    const format = pickBarcodeFormat(value, el.barcodeFormat);
    const displayValue = el.barcodeDisplayValue ?? true;
    const dataUrl = renderBarcodeDataUrl(value, format, displayValue);
    if (dataUrl) {
      doc.addImage(dataUrl, "PNG", ax, ay, el.widthMm, el.heightMm);
    }
    return;
  }

  const text =
    el.type === "text"
      ? el.text || ""
      : `${el.prefix || ""}${getDynamicValue(el.field, product)}`;
  if (!text) return;

  applyFont(doc, el);
  // posicionar baseline próximo do topo da caixa
  const fontSizeMm = (el.fontSize * 0.3528); // pt -> mm
  const baselineY = ay + fontSizeMm * 0.85;

  let drawX = ax;
  const align = el.align || "left";
  if (align === "center") drawX = ax + el.widthMm / 2;
  else if (align === "right") drawX = ax + el.widthMm;

  // quebra texto se necessário (apenas por largura)
  const lines = doc.splitTextToSize(text, el.widthMm);
  doc.text(lines as string[], drawX, baselineY, { align, baseline: "alphabetic" });
}

export function renderA4Pdf(
  template: A4Template,
  blockProducts: (Product | null)[],
): jsPDF {
  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
  const rects = getBlockRects(template.blocks);

  rects.forEach((rect, i) => {
    const product = blockProducts[i] || null;
    if (template.showBorder) {
      doc.setDrawColor(180, 180, 180);
      doc.setLineDashPattern([1, 1], 0);
      doc.rect(rect.x + 2, rect.y + 2, rect.width - 4, rect.height - 4);
      doc.setLineDashPattern([], 0);
    }
    const innerX = rect.x + template.paddingMm;
    const innerY = rect.y + template.paddingMm;
    template.elements.forEach((el) => drawElement(doc, el, innerX, innerY, product));
  });

  return doc;
}

export function downloadA4Pdf(template: A4Template, products: (Product | null)[], filename = "etiquetas-a4.pdf") {
  const doc = renderA4Pdf(template, products);
  doc.save(filename);
}

export function printA4Pdf(template: A4Template, products: (Product | null)[]) {
  const doc = renderA4Pdf(template, products);
  const url = doc.output("bloburl");
  const w = window.open(url as unknown as string, "_blank");
  if (w) {
    setTimeout(() => {
      try {
        w.focus();
        w.print();
      } catch {}
    }, 500);
  }
}
