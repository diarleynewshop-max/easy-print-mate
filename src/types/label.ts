export interface Product {
  id?: number | string;
  ean: string;
  codigo_barras?: string;
  descricao: string;
  precoVarejo?: number;
  precoAtacado?: number;
  secao?: string;
  grupo?: string;
  estoque?: number;
  codigoInterno?: string;
  imageUrl?: string;
  ultimaAlteracao?: string;
}

export type LabelFieldKey =
  | "descricao"
  | "precoVarejo"
  | "precoAtacado"
  | "ean"
  | "barcode"
  | "secao"
  | "estoque"
  | "codigoInterno";

export type DescriptionMode =
  | "first-word"
  | "first-two-words"
  | "internal-code"
  | "full"
  | "custom";

export interface LabelField {
  key: LabelFieldKey;
  visible: boolean;
  x: number; // mm
  y: number; // mm
  widthMm?: number;
  heightMm?: number;
  fontSize: number; // pt
  fontFamily?: string;
  bold?: boolean;
  label?: string; // optional prefix like "R$"
  align?: "left" | "center" | "right";
  color?: string;
  // Description rendering
  descriptionMode?: DescriptionMode;
  customText?: string;
  // Barcode
  barcodeFormat?: "auto" | "CODE128" | "EAN13" | "EAN8" | "UPC" | "ITF14";
  barcodeDisplayValue?: boolean;
  barcodeTextPosition?: "bottom" | "top";
  barcodeLineColor?: string;
  barcodeBarWidth?: number;
  barcodeTextMargin?: number;
  barcodeNarrow?: number; // dots
  barcodeWideRatio?: number; // 2..3
  // Text horizontal stretch (CSS scaleX). 1 = normal, >1 = wider, <1 = narrower
  scaleX?: number;
}

export interface LabelTemplate {
  id: string;
  name: string;
  category?: string;
  widthMm: number;
  heightMm: number;
  marginMm: number;
  marginLeftMm?: number;
  marginRightMm?: number;
  marginTopMm?: number;
  marginBottomMm?: number;
  paperWidthMm?: number;
  columns?: number;
  columnGapMm?: number;
  rowGapMm?: number;
  // Safe area padding (inside each label)
  safePaddingLeftMm?: number;
  safePaddingRightMm?: number;
  safePaddingTopMm?: number;
  safePaddingBottomMm?: number;
  preferredPrinterName?: string;
  printRotation?: 0 | 180;
  columnOrder?: "ltr" | "rtl";
  dpi?: 203 | 300;
  fontFamily: string;
  fields: LabelField[];
}

export interface VFConfig {
  companyName: string;
  baseUrl: string;
  username: string;
  password: string;
  token: string;
  loja: string;
  empresa?: string;
  labelPrinterName?: string;
  a4PrinterName?: string;
}

export interface HistoryEntry {
  ean: string;
  descricao: string;
  at: number;
}

export interface PrintEvent {
  ean: string;
  descricao: string;
  quantidade: number;
  templateId: string;
  at: number;
  durationMs: number;
  status?: "success" | "error";
  precoVarejo?: number;
  precoAtacado?: number;
  estoque?: number;
  secao?: string;
  grupo?: string;
  codigoInterno?: string;
  usuario?: string;
}

export interface PrintQueueItem {
  id: string;
  product: Product;
  quantity: number;
}
