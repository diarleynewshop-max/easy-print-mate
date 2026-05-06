export interface Product {
  id?: number | string;
  ean: string;
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
