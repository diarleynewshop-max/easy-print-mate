export const printService = {
  printBrowser() {
    window.print();
  },
  async printRawPrn(content: string, printerName = "ELGIN L42PRO FULL"): Promise<void> {
    const response = await fetch("http://127.0.0.1:8787/print-raw", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content, printerName }),
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      throw new Error(payload?.error || "Falha ao enviar PRN para a impressora");
    }
  },
  async printQZTray(_zpl: string): Promise<void> {
    throw new Error("QZ Tray ainda nao implementado");
  },
  async printWebUSB(_payload: Uint8Array): Promise<void> {
    throw new Error("WebUSB ainda nao implementado");
  },
};
