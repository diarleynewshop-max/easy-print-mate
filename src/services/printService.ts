/**
 * printService — abstrai a impressão da etiqueta.
 * Implementação atual: window.print() com CSS @media print.
 * Futuro: QZ Tray / WebUSB / WebSerial isolados aqui.
 */
export const printService = {
  printBrowser() {
    window.print();
  },
  // Stubs reservados para integrações futuras:
  async printQZTray(_zpl: string): Promise<void> {
    throw new Error("QZ Tray ainda não implementado");
  },
  async printWebUSB(_payload: Uint8Array): Promise<void> {
    throw new Error("WebUSB ainda não implementado");
  },
};
