const { app, BrowserWindow, ipcMain } = require("electron");
const fs = require("fs");
const fsp = require("fs/promises");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");
const { consultarProduto, loadErpEnv } = require("./varejo-facil.cjs");

const RAW_PRINTER_NAME = process.env.RAW_PRINTER_NAME || "ELGIN L42PRO FULL";

const ERP_ENV_TEMPLATE = [
  "# Preencha conforme o cliente. Pode usar usuario/senha ou token.",
  "# O app cria este arquivo em Documentos\\Easy Print Mate e nunca sobrescreve depois.",
  "",
  "ERP_API_URL_NEWSHOP=",
  "ERP_API_USERNAME_NEWSHOP=",
  "ERP_API_PASSWORD_NEWSHOP=",
  "ERP_API_TOKEN_NEWSHOP=",
  "ERP_API_LOJA_ID_NEWSHOP=",
  "",
  "ERP_API_URL_SOYE=",
  "ERP_API_USERNAME_SOYE=",
  "ERP_API_PASSWORD_SOYE=",
  "ERP_API_TOKEN_SOYE=",
  "ERP_API_LOJA_ID_SOYE=",
  "",
  "ERP_API_URL_FACIL=",
  "ERP_API_USERNAME_FACIL=",
  "ERP_API_PASSWORD_FACIL=",
  "ERP_API_TOKEN_FACIL=",
  "ERP_API_LOJA_ID_FACIL=",
  "",
].join("\n");

function getDataDir() {
  return path.join(app.getPath("documents"), "Easy Print Mate");
}

function ensureDataDir() {
  const dataDir = getDataDir();
  fs.mkdirSync(dataDir, { recursive: true });
  const envPath = path.join(dataDir, ".env");
  if (!fs.existsSync(envPath)) {
    fs.writeFileSync(envPath, ERP_ENV_TEMPLATE, "utf8");
  }
  const envExamplePath = path.join(dataDir, ".env.example");
  if (!fs.existsSync(envExamplePath)) {
    fs.writeFileSync(envExamplePath, ERP_ENV_TEMPLATE, "utf8");
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

function pad2(value) {
  return String(value).padStart(2, "0");
}

function getHistoryDir(at = Date.now()) {
  const date = new Date(Number(at) || Date.now());
  const dir = path.join(
    getDataDir(),
    "historico",
    String(date.getFullYear()),
    pad2(date.getMonth() + 1),
    pad2(date.getDate()),
  );
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function getMetricsLogPath(at = Date.now()) {
  return path.join(getHistoryDir(at), "impressoes.csv");
}

async function findPrintLogFiles(dir = path.join(getDataDir(), "historico")) {
  if (!fs.existsSync(dir)) return [];
  const entries = await fsp.readdir(dir, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) return findPrintLogFiles(fullPath);
    return entry.isFile() && entry.name === "impressoes.csv" ? [fullPath] : [];
  }));
  return nested.flat();
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
    icon: path.join(__dirname, "..", "build", "icon.ico"),
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
  metricsLogPath: getMetricsLogPath(),
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

ipcMain.handle("metrics:append-print-event", async (_event, event) => {
  const filePath = getMetricsLogPath(event.at);
  const header = "Codigo;descrição;preço;quantidade;Nome_usuario\n";
  if (!fs.existsSync(filePath)) await fsp.writeFile(filePath, header, "utf8");
  const clean = (value) => String(value ?? "").replace(/[\r\n;]/g, " ").trim();
  const line = [
    clean(event.ean),
    clean(event.descricao),
    event.precoVarejo ?? "",
    Number(event.quantidade) || 0,
    clean(event.usuario || "padrao"),
  ].join(";") + "\n";
  await fsp.appendFile(filePath, line, "utf8");
  return { ok: true, filePath };
});

ipcMain.handle("metrics:read-print-events", async () => {
  const newLogFiles = await findPrintLogFiles();
  const oldLogPath = path.join(getDataDir(), "historico", "metricas-impressao.txt");
  const files = fs.existsSync(oldLogPath) ? [...newLogFiles, oldLogPath] : newLogFiles;
  const events = [];

  for (const filePath of files) {
    const text = await fsp.readFile(filePath, "utf8");
    const isOldLog = path.basename(filePath) === "metricas-impressao.txt";
    const fileDateMatch = filePath.match(/[\\/]historico[\\/](\d{4})[\\/](\d{2})[\\/](\d{2})[\\/]/);
    const fileAt = fileDateMatch
      ? new Date(`${fileDateMatch[1]}-${fileDateMatch[2]}-${fileDateMatch[3]}T00:00:00`).getTime()
      : Date.now();

    for (const line of text.split(/\r?\n/).slice(1).filter(Boolean)) {
      const parts = line.split(";");
      if (isOldLog) {
        const [dataIso, timestamp, ean, descricao, quantidade, templateId, durationMs, status, precoVarejo, precoAtacado, estoque, secao, grupo, codigoInterno] = parts;
        events.push({
          ean: ean || "",
          descricao: descricao || "",
          quantidade: Number(quantidade) || 0,
          templateId: templateId || "",
          at: Number(timestamp) || Date.parse(dataIso) || Date.now(),
          durationMs: Number(durationMs) || 0,
          status: status === "error" ? "error" : "success",
          precoVarejo: precoVarejo ? Number(precoVarejo) : undefined,
          precoAtacado: precoAtacado ? Number(precoAtacado) : undefined,
          estoque: estoque ? Number(estoque) : undefined,
          secao: secao || undefined,
          grupo: grupo || undefined,
          codigoInterno: codigoInterno || undefined,
        });
        continue;
      }

      const [ean, descricao, precoVarejo, quantidade, usuario] = parts;
      events.push({
        ean: ean || "",
        descricao: descricao || "",
        quantidade: Number(quantidade) || 0,
        templateId: "",
        at: fileAt,
        durationMs: 0,
        status: "success",
        precoVarejo: precoVarejo ? Number(String(precoVarejo).replace(",", ".")) : undefined,
        usuario: usuario || undefined,
      });
    }
  }

  return events.sort((a, b) => b.at - a.at);
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
