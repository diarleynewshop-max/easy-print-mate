import { Product } from "./label";

export type A4BlockCount = number;

export type A4DynamicKey =
  | "descricao"
  | "ean"
  | "codigoInterno"
  | "precoVarejo"
  | "precoAtacado"
  | "secao"
  | "grupo"
  | "estoque"
  | "imageUrl"; // Novo campo para imagem do produto

export type A4ElementType = "text" | "dynamic" | "barcode" | "image" | "shape";
export type A4ShapeKind = "rect" | "roundRect" | "circle" | "line";

// Lista de fontes suportadas (nativas do jsPDF + customizadas base64)
export type A4FontFamily = 
  | "helvetica" 
  | "times" 
  | "courier" 
  | "Anton" 
  | "Roboto" 
  | "OpenSans"
  | "BebasNeue";

export interface A4Element {
  id: string;
  type: A4ElementType;
  // posição dentro do bloco, em mm
  x: number;
  y: number;
  widthMm: number;
  heightMm: number;
  // texto fixo (type=text) ou prefixo (type=dynamic)
  text?: string;
  prefix?: string;
  // para dynamic
  field?: A4DynamicKey;
  // tipografia
  fontSize: number; // pt
  fontFamily?: A4FontFamily;
  bold?: boolean;
  italic?: boolean;
  align?: "left" | "center" | "right";
  color?: string;
  // barcode
  barcodeFormat?: "auto" | "CODE128" | "EAN13";
  barcodeDisplayValue?: boolean;
  // image
  imageDataUrl?: string;
  imageName?: string;
  imageFit?: "contain" | "cover" | "stretch";
  // shape
  shapeKind?: A4ShapeKind;
  fillColor?: string;
  strokeColor?: string;
  strokeWidthMm?: number;
  opacity?: number;
}

export interface A4Template {
  id: string;
  name: string;
  // Layout da grade
  rows: number;
  cols: number;
  // Margens da folha (mm)
  marginTop: number;
  marginBottom: number;
  marginLeft: number;
  marginRight: number;
  // Espaçamento entre blocos (mm)
  rowGap: number;
  colGap: number;

  blocks: A4BlockCount; // total = rows * cols (mantido para compatibilidade legado)
  sourceBlocks?: A4BlockCount;
  // padding interno de cada bloco (mm)
  paddingMm: number;
  // borda em volta do bloco
  showBorder?: boolean;
  // elementos dentro do bloco (mesmo layout repetido em todos os blocos)
  elements: A4Element[];
}

export interface A4FilledBlock {
  product: Product | null;
}
