const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("easyPrint", {
  isDesktop: true,
  getInfo: () => ipcRenderer.invoke("local-data:get-info"),
  listPrinters: () => ipcRenderer.invoke("printer:list"),
  getItem: (key) => ipcRenderer.invoke("local-data:get-item", key),
  setItem: (key, value) => ipcRenderer.invoke("local-data:set-item", key, value),
  removeItem: (key) => ipcRenderer.invoke("local-data:remove-item", key),
  appendPrintEvent: (event) => ipcRenderer.invoke("metrics:append-print-event", event),
  readPrintEvents: () => ipcRenderer.invoke("metrics:read-print-events"),
  fetchProductByEan: (config, codigo) => ipcRenderer.invoke("erp:fetch-product", config, codigo),
  printRawPrn: (content, printerName) => ipcRenderer.invoke("print:raw-prn", content, printerName),
  printHealth: (printerName) => ipcRenderer.invoke("print:health", printerName),
});
