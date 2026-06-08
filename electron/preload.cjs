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
  erpListProducts: (config, pagina, quantidade, dataAlteracao) => ipcRenderer.invoke("erp:list-products", config, pagina, quantidade, dataAlteracao),
  printRawPrn: (content, printerName) => ipcRenderer.invoke("print:raw-prn", content, printerName),
  printPdf: (pdfDataUrl, printerName) => ipcRenderer.invoke("print:pdf", pdfDataUrl, printerName),
  printHealth: (printerName) => ipcRenderer.invoke("print:health", printerName),
  dbSyncProducts: (products) => ipcRenderer.invoke("db:sync-products", products),
  dbSearchProducts: (query) => ipcRenderer.invoke("db:search-products", query),
  dbGetLastSync: (chave) => ipcRenderer.invoke("db:get-last-sync", chave),
  dbSetLastSync: (chave, valor) => ipcRenderer.invoke("db:set-last-sync", chave, valor),
  dbGetMaxId: () => ipcRenderer.invoke("db:get-max-id"),
  appCheckForUpdates: () => ipcRenderer.invoke("app:check-for-updates"),
});
