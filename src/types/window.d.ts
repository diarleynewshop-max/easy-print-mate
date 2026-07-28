import { VFConfig, Product, PrintEvent } from "./label";

export interface ErpSyncState {
  running: boolean;
  lastRun: string | null;
  lastCount: number;
  error: string | null;
}

export interface EasyPrintBridge {
  isDesktop: boolean;
  getInfo: () => Promise<{
    dataDir: string;
    storePath: string;
    metricsLogPath: string;
    printerName: string;
  }>;
  listPrinters: () => Promise<Array<{ name: string; isDefault?: boolean; isOffline?: boolean }>>;
  getItem: (key: string) => Promise<unknown>;
  setItem: (key: string, value: unknown) => Promise<boolean>;
  removeItem: (key: string) => Promise<boolean>;
  appendPrintEvent: (event: PrintEvent) => Promise<{ ok: boolean; filePath: string }>;
  readPrintEvents: () => Promise<PrintEvent[]>;
  fetchProductByEan: (config: VFConfig, codigo: string) => Promise<{ product: Product; debug: unknown }>;
  fetchProductById: (config: VFConfig, produtoId: string) => Promise<{ product: Product; debug: unknown }>;
  searchProducts: (config: VFConfig, search: string, limit?: number) => Promise<{ items: Product[]; debug: unknown }>;
  erpListProducts: (config: VFConfig, pagina: number, quantidade: number, lastSync?: string) => Promise<{ items: Product[]; total: number; debug: unknown }>;
  printRawPrn: (content: string, printerName: string) => Promise<{ ok: boolean; savedPath: string }>;
  printPdf: (pdfDataUrl: string, printerName: string) => Promise<{ ok: boolean }>;
  printHealth: (printerName: string) => Promise<{ ok: boolean; printerName: string; printerFound: boolean }>;
  dbSyncProducts: (products: Product[]) => Promise<{ success: boolean; count: number }>;
  dbSearchProducts: (query: string) => Promise<Product[]>;
  dbGetLastSync: (chave: string) => Promise<string | null>;
  dbSetLastSync: (chave: string, valor: string) => Promise<boolean>;
  dbGetMaxId: () => Promise<number>;
  appCheckForUpdates: () => Promise<{ success: boolean; updateInfo?: unknown; message?: string }>;
  erpUpdatePromo: (config: VFConfig, produtoId: string, lojaId: number | null, precoOferta: number) => Promise<{ success: boolean; endpoint: string; lojaId: number; precoOferta: number; debug: unknown }>;
  erpSyncStatus: () => Promise<ErpSyncState>;
  erpTriggerSync: () => Promise<boolean>;
  onSyncUpdate: (cb: (data: ErpSyncState) => void) => void;
  offSyncUpdate: (cb: (data: ErpSyncState) => void) => void;
}

declare global {
  interface Window {
    easyPrint: EasyPrintBridge;
  }
}
