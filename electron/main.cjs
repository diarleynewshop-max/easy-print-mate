const { app, BrowserWindow, ipcMain } = require("electron");
const fs = require("fs");
const fsp = require("fs/promises");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");
const { consultarProduto, loadErpEnv } = require("./varejo-facil.cjs");

const RAW_PRINTER_NAME = process.env.RAW_PRINTER_NAME || "ELGIN L42PRO FULL";

function getDataDir() {
  return path.join(app.getPath("documents"), "Easy Print Mate");
}

function ensureDataDir() {
  const dataDir = getDataDir();
  fs.mkdirSync(dataDir, { recursive: true });
  const envExamplePath = path.join(dataDir, ".env.example");
  if (!fs.existsSync(envExamplePath)) {
    fs.writeFileSync(envExamplePath, [
      "ERP_API_URL_NEWSHOP=https://newshop.varejofacil.com",
      "ERP_API_USERNAME_NEWSHOP=",
      "ERP_API_PASSWORD_NEWSHOP=",
      "ERP_API_TOKEN_NEWSHOP=",
      "ERP_API_LOJA_ID_NEWSHOP=2",
      "",
      "ERP_API_URL_SOYE=https://soye.varejofacil.com",
      "ERP_API_USERNAME_SOYE=",
      "ERP_API_PASSWORD_SOYE=",
      "ERP_API_TOKEN_SOYE=",
      "ERP_API_LOJA_ID_SOYE=1",
      "",
      "ERP_API_URL_FACIL=https://facil.varejofacil.com",
      "ERP_API_USERNAME_FACIL=",
      "ERP_API_PASSWORD_FACIL=",
      "ERP_API_TOKEN_FACIL=",
      "ERP_API_LOJA_ID_FACIL=1",
      "",
    ].join("\n"), "utf8");
  }
  loadErpEnv(dataDir);
}

function getStorePath() {
  ensureDataDir();
  return path.join(getDataDir(), "dados.json");
}

function getPrnDir() {
  const dir = path.join(getDataDir(), "prn");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function readStore() {
  try {
    return JSON.parse(fs.readFileSync(getStorePath(), "utf8"));
  } catch {
    return {};
  }
}

function writeStore(data) {
  fs.writeFileSync(getStorePath(), JSON.stringify(data, null, 2), "utf8");
}

function createWindow() {
  ensureDataDir();
  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 1100,
    minHeight: 720,
    title: "Easy Print Mate",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    win.loadFile(path.join(__dirname, "..", "dist", "index.html"));
  }
}

function runPowerShellPrint(filePath, printerName) {
  return new Promise((resolve, reject) => {
    const scriptPath = app.isPackaged
      ? path.join(process.resourcesPath, "app.asar.unpacked", "scripts", "print-raw.ps1")
      : path.join(__dirname, "..", "scripts", "print-raw.ps1");
    const child = spawn("powershell.exe", [
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-File",
      scriptPath,
      "-PrinterName",
      printerName,
      "-FilePath",
      filePath,
    ], { windowsHide: true });

    let output = "";
    child.stdout.on("data", (data) => {
      output += data.toString();
    });
    child.stderr.on("data", (data) => {
      output += data.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(output || `powershell saiu com codigo ${code}`));
    });
  });
}

ipcMain.handle("local-data:get-info", () => ({
  dataDir: getDataDir(),
  storePath: getStorePath(),
  printerName: RAW_PRINTER_NAME,
}));

ipcMain.handle("local-data:get-item", (_event, key) => {
  const store = readStore();
  return store[key] ?? null;
});

ipcMain.handle("local-data:set-item", (_event, key, value) => {
  const store = readStore();
  store[key] = value;
  writeStore(store);
  return true;
});

ipcMain.handle("local-data:remove-item", (_event, key) => {
  const store = readStore();
  delete store[key];
  writeStore(store);
  return true;
});

ipcMain.handle("print:health", () => ({ ok: true, printerName: RAW_PRINTER_NAME, dataDir: getDataDir() }));

ipcMain.handle("erp:fetch-product", async (_event, config, codigo) => {
  const code = String(codigo || "").trim();
  if (!code) {
    const error = new Error("Codigo vazio");
    error.status = 400;
    throw error;
  }

  try {
    return await consultarProduto({ ...config, codigo: code });
  } catch (error) {
    const err = error instanceof Error ? error : new Error("Erro desconhecido");
    throw new Error(JSON.stringify({
      message: err.message,
      status: err.status,
      debug: err.debug,
    }));
  }
});

ipcMain.handle("print:raw-prn", async (_event, content, printerName = RAW_PRINTER_NAME) => {
  if (!content) throw new Error("Conteudo PRN vazio");
  const filePath = path.join(os.tmpdir(), `easy-print-${Date.now()}.prn`);
  await fsp.writeFile(filePath, content, "ascii");
  try {
    await runPowerShellPrint(filePath, printerName);
    const savedPath = path.join(getPrnDir(), `etiqueta-${new Date().toISOString().replace(/[:.]/g, "-")}.prn`);
    await fsp.writeFile(savedPath, content, "ascii");
    return { ok: true, printerName, savedPath };
  } finally {
    await fsp.rm(filePath, { force: true });
  }
});

app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
