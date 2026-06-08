import { VFConfig, Product, PrintEvent } from "./label";

export interface EasyPrintBridge {
  isDesktop: boolean;
  getInfo: () => Promise<{
    dataDir: string;
    storePath: string;
    metricsLogPath: string;
    printerName: string;
  }>;
  listPrinters: () => Promise<Array<{ name: string; isDefault?: boolean; isOffline?: boolean }>>;
  getItem: (key: string) => Promise<any>;
  setItem: (key: string, value: any) => Promise<boolean>;
  removeItem: (key: string) => Promise<boolean>;
  appendPrintEvent: (event: PrintEvent) => Promise<{ ok: boolean; filePath: string }>;
  readPrintEvents: () => Promise<PrintEvent[]>;
  fetchProductByEan: (config: VFConfig, codigo: string) => Promise<{ product: Product; debug: any }>;
  erpListProducts: (config: VFConfig, pagina: number, quantidade: number, lastSync?: string) => Promise<{ items: Product[]; total: number; debug: any }>;
  printRawPrn: (content: string, printerName: string) => Promise<{ ok: boolean; savedPath: string }>;
  printPdf: (pdfDataUrl: string, printerName: string) => Promise<{ ok: boolean }>;
  printHealth: (printerName: string) => Promise<{ ok: boolean; printerName: string; printerFound: boolean }>;
  dbSyncProducts: (products: Product[]) => Promise<{ success: boolean; count: number }>;
  dbSearchProducts: (query: string) => Promise<Product[]>;
  dbGetLastSync: (chave: string) => Promise<string | null>;
  dbSetLastSync: (chave: string, valor: string) => Promise<boolean>;
  dbGetMaxId: () => Promise<number>;
  appCheckForUpdates: () => Promise<{ success: boolean; updateInfo?: any; message?: string }>;
}

declare global {
  interface Window {
    easyPrint: EasyPrintBridge;
  }
}
