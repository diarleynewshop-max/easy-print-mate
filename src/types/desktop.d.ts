interface EasyPrintBridge {
  isDesktop: boolean;
  getInfo(): Promise<{ dataDir: string; storePath: string; metricsLogPath?: string; printerName: string }>;
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<boolean>;
  removeItem(key: string): Promise<boolean>;
  appendPrintEvent(event: import("@/types/label").PrintEvent): Promise<{ ok: boolean; filePath: string }>;
  readPrintEvents(): Promise<import("@/types/label").PrintEvent[]>;
  fetchProductByEan(config: import("@/types/label").VFConfig, codigo: string): Promise<{
    product: import("@/types/label").Product;
    empresa: string;
    lojaId: number | null;
    debug?: unknown;
  }>;
  printRawPrn(content: string, printerName?: string): Promise<{ ok: boolean; printerName: string; savedPath?: string }>;
  printHealth(): Promise<{ ok: boolean; printerName: string; dataDir: string }>;
}

interface Window {
  easyPrint?: EasyPrintBridge;
}
