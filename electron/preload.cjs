const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("easyPrint", {
  isDesktop: true,
  getInfo: () => ipcRenderer.invoke("local-data:get-info"),
  getItem: (key) => ipcRenderer.invoke("local-data:get-item", key),
  setItem: (key, value) => ipcRenderer.invoke("local-data:set-item", key, value),
  removeItem: (key) => ipcRenderer.invoke("local-data:remove-item", key),
  fetchProductByEan: (config, codigo) => ipcRenderer.invoke("erp:fetch-product", config, codigo),
  printRawPrn: (content, printerName) => ipcRenderer.invoke("print:raw-prn", content, printerName),
  printHealth: () => ipcRenderer.invoke("print:health"),
});
