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

export interface LabelField {
  key: LabelFieldKey;
  visible: boolean;
  x: number; // mm
  y: number; // mm
  widthMm?: number;
  heightMm?: number;
  fontSize: number; // pt
  bold?: boolean;
  label?: string; // optional prefix like "R$"
}

export interface LabelTemplate {
  id: string;
  name: string;
  widthMm: number;
  heightMm: number;
  marginMm: number;
  columns?: number;
  columnGapMm?: number;
  fontFamily: string;
  fields: LabelField[];
}

export interface VFConfig {
  baseUrl: string;
  token: string;
  empresa: string;
  loja: string;
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
  durationMs: number; // tempo desde a ação anterior (scan/print)
}
