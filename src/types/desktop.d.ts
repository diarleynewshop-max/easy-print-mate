interface EasyPrintBridge {
  isDesktop: boolean;
  getInfo(): Promise<{ dataDir: string; storePath: string; printerName: string }>;
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<boolean>;
  removeItem(key: string): Promise<boolean>;
  printRawPrn(content: string, printerName?: string): Promise<{ ok: boolean; printerName: string; savedPath?: string }>;
  printHealth(): Promise<{ ok: boolean; printerName: string; dataDir: string }>;
}

interface Window {
  easyPrint?: EasyPrintBridge;
}
