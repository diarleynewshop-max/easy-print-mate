const { app, BrowserWindow, ipcMain, dialog, shell } = require("electron");
const fs = require("fs");
const fsp = require("fs/promises");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");
const { consultarProduto, consultarProdutoPorId, pesquisarProdutos, loadErpEnv, listarProdutosPaginado, sincronizarAlterados, atualizarPrecoOferta } = require("./varejo-facil.cjs");
const { autoUpdater } = require("electron-updater");
const Database = require("better-sqlite3");

const RAW_PRINTER_NAME = process.env.RAW_PRINTER_NAME || "ELGIN L42PRO FULL";

let db;

function initDb() {
  try {
    const dataDir = getDataDir();
    fs.mkdirSync(dataDir, { recursive: true });
    const dbPath = path.join(dataDir, "easy-print.db");
    db = new Database(dbPath);
    
    // Criação das tabelas base
    db.exec(`
      CREATE TABLE IF NOT EXISTS produtos (
        id TEXT PRIMARY KEY,
        ean TEXT,
        codigo_barras TEXT,
        descricao TEXT,
        codigo_interno TEXT,
        secao TEXT,
        grupo TEXT,
        preco_varejo REAL,
        preco_atacado REAL,
        preco_original REAL,
        estoque REAL,
        image_url TEXT,
        ultima_alteracao DATETIME,
        sincronizado_em DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS sync_meta (
        chave TEXT PRIMARY KEY,
        valor TEXT,
        atualizado_em DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_produtos_ean ON produtos(ean);
      CREATE INDEX IF NOT EXISTS idx_produtos_descricao ON produtos(descricao);
    `);

    // Migração: Garante que colunas novas existam
    const tableInfo = db.prepare("PRAGMA table_info(produtos)").all();
    const hasUltimaAlteracao = tableInfo.some(col => col.name === "ultima_alteracao");
    if (!hasUltimaAlteracao) {
      try {
        db.exec("ALTER TABLE produtos ADD COLUMN ultima_alteracao DATETIME");
      } catch (e) {
        console.error("Erro ao adicionar coluna ultima_alteracao: ", e.message);
      }
    }

    const hasPrecoOriginal = tableInfo.some(col => col.name === "preco_original");
    if (!hasPrecoOriginal) {
      try {
        db.exec("ALTER TABLE produtos ADD COLUMN preco_original REAL");
      } catch (e) {
        console.error("Erro ao adicionar coluna preco_original: ", e.message);
      }
    }

    // Cria o índice da coluna de alteração apenas após garantir que ela existe
    db.exec("CREATE INDEX IF NOT EXISTS idx_produtos_alteracao ON produtos(ultima_alteracao)");

  } catch (error) {
    console.error("Falha ao inicializar o banco de dados:", error);
    dialog.showErrorBox(
      "Erro no Banco de Dados",
      "Não foi possível iniciar o banco de dados local. Tente reiniciar o computador ou apagar o arquivo easy-print.db em seus Documentos.\n\nErro: " + error.message
    );
  }
}

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
  const iconPath = process.platform === "win32" 
    ? path.join(__dirname, "..", "build", "icon.ico")
    : path.join(__dirname, "..", "build", "icon.png");

  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 960,
    minHeight: 640,
    title: "Easy Print Mate",
    icon: iconPath,
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

async function listInstalledPrinters() {
  const win = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0];
  if (!win) return [];
  try {
    const printers = await win.webContents.getPrintersAsync();
    return printers.map((printer) => ({
      name: printer.name,
      isDefault: Boolean(printer.isDefault),
      status: printer.status,
      isOffline: printer.status === 7,
    }));
  } catch {
    return [];
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

function runLpPrint(filePath, printerName) {
  return new Promise((resolve, reject) => {
    // lp -d "Printer_Name" -o raw /path/to/file.prn
    const child = spawn("lp", [
      "-d",
      printerName,
      "-o",
      "raw",
      filePath
    ]);

    let output = "";
    child.stdout.on("data", (data) => {
      output += data.toString();
    });
    child.stderr.on("data", (data) => {
      output += data.toString();
    });
    child.on("error", (err) => {
      if (err.code === "ENOENT") {
        reject(new Error("Comando 'lp' não encontrado. Certifique-se de que o CUPS está instalado."));
      } else {
        reject(err);
      }
    });
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(output || `lp saiu com codigo ${code}`));
    });
  });
}

ipcMain.handle("local-data:get-info", () => ({
  dataDir: getDataDir(),
  storePath: getStorePath(),
  metricsLogPath: getMetricsLogPath(),
  printerName: RAW_PRINTER_NAME,
}));

ipcMain.handle("printer:list", async () => listInstalledPrinters());

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

ipcMain.handle("print:health", async (_event, printerName = RAW_PRINTER_NAME) => {
  const printers = await listInstalledPrinters();
  const selected = String(printerName || RAW_PRINTER_NAME).trim();
  const printerFound = printers.some((printer) => printer.name === selected);
  return { ok: printerFound, printerName: selected, dataDir: getDataDir(), printerFound };
});

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

ipcMain.handle("erp:fetch-product-by-id", async (_event, config, produtoId) => {
  const id = String(produtoId || "").trim();
  if (!id) {
    const error = new Error("ID do produto vazio");
    error.status = 400;
    throw error;
  }

  try {
    return await consultarProdutoPorId({ ...config, produtoId: id });
  } catch (error) {
    const err = error instanceof Error ? error : new Error("Erro desconhecido");
    throw new Error(JSON.stringify({
      message: err.message,
      status: err.status,
      debug: err.debug,
    }));
  }
});

ipcMain.handle("erp:search-products", async (_event, config, search, limit = 20) => {
  const term = String(search || "").trim();
  if (!term) return { items: [], debug: [] };

  try {
    return await pesquisarProdutos({ ...config, search: term, limit });
  } catch (error) {
    const err = error instanceof Error ? error : new Error("Erro desconhecido");
    throw new Error(JSON.stringify({
      message: err.message,
      status: err.status,
      debug: err.debug,
    }));
  }
});

ipcMain.handle("erp:list-products", async (_event, config, pagina, quantidade, dataAlteracao) => {
  try {
    return await listarProdutosPaginado({ ...config, pagina, quantidade, dataAlteracao });
  } catch (error) {
    const err = error instanceof Error ? error : new Error("Erro desconhecido");
    throw new Error(JSON.stringify({
      message: err.message,
      status: err.status,
    }));
  }
});

ipcMain.handle("erp:update-promo", async (_event, config, produtoId, lojaId, precoOferta) => {
  try {
    return await atualizarPrecoOferta({ ...config, produtoId: String(produtoId), precoOferta: Number(precoOferta) });
  } catch (error) {
    const err = error instanceof Error ? error : new Error("Erro desconhecido");
    throw new Error(JSON.stringify({ message: err.message, debug: err.debug }));
  }
});

ipcMain.handle("print:raw-prn", async (_event, content, printerName = RAW_PRINTER_NAME) => {
  if (!content) throw new Error("Conteudo PRN vazio");
  const selectedPrinter = String(printerName || RAW_PRINTER_NAME).trim() || RAW_PRINTER_NAME;
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const savedPath = path.join(getPrnDir(), `etiqueta-${stamp}.prn`);
  const tempPath = path.join(os.tmpdir(), `easy-print-${Date.now()}.prn`);
  await fsp.writeFile(savedPath, content, "ascii");
  await fsp.writeFile(tempPath, content, "ascii");
  try {
    if (process.platform === "win32") {
      await runPowerShellPrint(tempPath, selectedPrinter);
    } else {
      await runLpPrint(tempPath, selectedPrinter);
    }
    return { ok: true, printerName: selectedPrinter, savedPath };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha desconhecida ao imprimir";
    throw new Error(`Falha ao imprimir em ${selectedPrinter}. PRN salvo em ${savedPath}. ${message}`);
  } finally {
    await fsp.rm(tempPath, { force: true });
  }
});

ipcMain.handle("print:pdf", async (_event, pdfBytesArr, printerName) => {
  if (!pdfBytesArr || !pdfBytesArr.length) throw new Error("PDF vazio");

  const tmpFile = path.join(os.tmpdir(), `easy-print-${Date.now()}.pdf`);
  fs.writeFileSync(tmpFile, Buffer.from(pdfBytesArr));

  // Se tiver impressora definida, tenta impressão silenciosa via BrowserWindow
  if (printerName) {
    const win = new BrowserWindow({
      show: false,
      webPreferences: { nodeIntegration: false, contextIsolation: true }
    });

    try {
      await win.loadFile(tmpFile);
      await new Promise((resolve, reject) => {
        setTimeout(() => {
          win.webContents.print(
            { silent: true, deviceName: printerName, printBackground: true, margins: { marginType: "none" } },
            (success, reason) => {
              win.close();
              try { fs.unlinkSync(tmpFile); } catch {}
              if (success) resolve({ ok: true });
              else reject(new Error(reason || "Falha na impressão"));
            }
          );
        }, 2000);
      });
      return { ok: true };
    } catch (err) {
      if (!win.isDestroyed()) win.close();
      // Fallback: abre no visualizador padrão
      shell.openPath(tmpFile);
      return { ok: true, fallback: true };
    }
  }

  // Sem impressora selecionada: abre no visualizador de PDF do sistema
  shell.openPath(tmpFile);
  return { ok: true, fallback: true };
});

ipcMain.handle("db:sync-products", (_event, products) => {
  const insert = db.prepare(`
    INSERT OR REPLACE INTO produtos (
      id, ean, codigo_barras, descricao, codigo_interno, secao, grupo, preco_varejo, preco_atacado, preco_original, estoque, image_url, ultima_alteracao
    ) VALUES (
      @id, @ean, @codigo_barras, @descricao, @codigo_interno, @secao, @grupo, @preco_varejo, @preco_atacado, @preco_original, @estoque, @image_url, @ultima_alteracao
    )
  `);

  const transaction = db.transaction((items) => {
    for (const item of items) {
      insert.run({
        id: String(item.id),
        ean: String(item.ean || ""),
        codigo_barras: String(item.codigo_barras || ""),
        descricao: String(item.descricao || ""),
        codigo_interno: String(item.codigoInterno || ""),
        secao: String(item.secao || ""),
        grupo: String(item.grupo || ""),
        preco_varejo: Number(item.precoVarejo || 0),
        preco_atacado: Number(item.precoAtacado || 0),
        preco_original: Number(item.precoOriginal || 0),
        estoque: Number(item.estoque || 0),
        image_url: String(item.imageUrl || ""),
        ultima_alteracao: item.ultimaAlteracao || null
      });
    }
  });

  transaction(products);
  return { success: true, count: products.length };
});

ipcMain.handle("db:search-products", (_event, query) => {
  const q = `%${query}%`;
  const stmt = db.prepare(`
    SELECT * FROM produtos 
    WHERE descricao LIKE ? OR ean LIKE ? OR codigo_interno LIKE ?
    LIMIT 50
  `);
  const rows = stmt.all(q, q, q);
  return rows.map(row => ({
    id: row.id,
    ean: row.ean,
    codigo_barras: row.codigo_barras,
    descricao: row.descricao,
    codigoInterno: row.codigo_interno,
    secao: row.secao,
    grupo: row.grupo,
    precoVarejo: row.preco_varejo,
    precoAtacado: row.preco_atacado,
    precoOriginal: row.preco_original,
    estoque: row.estoque,
    imageUrl: row.image_url
  }));
});

ipcMain.handle("db:get-last-sync", (_event, chave) => {
  const stmt = db.prepare("SELECT valor FROM sync_meta WHERE chave = ?");
  const row = stmt.get(chave);
  return row ? row.valor : null;
});

ipcMain.handle("db:set-last-sync", (_event, chave, valor) => {
  const stmt = db.prepare("INSERT OR REPLACE INTO sync_meta (chave, valor, atualizado_em) VALUES (?, ?, CURRENT_TIMESTAMP)");
  stmt.run(chave, valor);
  return true;
});

ipcMain.handle("db:get-max-id", () => {
  const stmt = db.prepare("SELECT MAX(CAST(id AS INTEGER)) as maxId FROM produtos");
  const row = stmt.get();
  return row ? (row.maxId || 0) : 0;
});

ipcMain.handle("app:check-for-updates", async () => {
  if (!app.isPackaged) return { success: false, message: "Modo desenvolvimento - atualização desativada" };
  try {
    const result = await autoUpdater.checkForUpdates();
    return { success: true, updateInfo: result?.updateInfo };
  } catch (error) {
    let msg = error.message || "Erro desconhecido";
    // Se o erro for uma string JSON longa (comum em HttpError do electron-updater)
    if (msg.includes("method:") || msg.includes("headers:")) {
      if (msg.includes("404")) msg = "Nenhuma atualização encontrada no servidor (404).";
      else if (msg.includes("403")) msg = "Acesso negado ao servidor de atualizações (403).";
      else msg = "Falha ao conectar com servidor de atualizações (Erro HTTP).";
    }
    return { success: false, message: msg };
  }
});

function setupAutoUpdater() {
  // Só roda no app empacotado, não no dev
  if (!app.isPackaged) return;

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on("update-available", (info) => {
    dialog.showMessageBox({
      type: "info",
      title: "Atualização disponível",
      message: `Nova versão ${info.version} disponível!\nBaixando em segundo plano...`,
      buttons: ["OK"],
    });
  });

  autoUpdater.on("update-downloaded", () => {
    dialog.showMessageBox({
      type: "info",
      title: "Atualização pronta",
      message: "Atualização baixada. Reiniciar o app para instalar?",
      buttons: ["Reiniciar agora", "Depois"],
      defaultId: 0,
    }).then(({ response }) => {
      if (response === 0) autoUpdater.quitAndInstall();
    });
  });

  autoUpdater.on("error", (err) => {
    console.error("AutoUpdater error:", err.message);
  });

  // Verifica 5 segundos após o app abrir para não travar a inicialização
  setTimeout(() => autoUpdater.checkForUpdates(), 5000);
}

// --- Worker de auto-sync ERP → SQLite ---
let autoSyncTimer = null;
let syncState = { running: false, lastRun: null, lastCount: 0, error: null };
let consecutiveSyncFailures = 0;
const AUTO_SYNC_INTERVAL_MS = 10 * 60 * 1000; // 10 min (era 3 min) — reduz carga no ERP
const AUTO_SYNC_MAX_BACKOFF_MS = 60 * 60 * 1000; // 1h max quando o ERP esta indisponivel

function getErpConfig() {
  try {
    const raw = readStore()["vf_api_config"];
    if (!raw) return null;
    const cfg = typeof raw === "string" ? JSON.parse(raw) : raw;
    const hasCredentials = cfg.token || (cfg.username && cfg.password);
    return hasCredentials ? cfg : null;
  } catch { return null; }
}

function notifyWindows(channel, data) {
  BrowserWindow.getAllWindows().forEach(win => {
    if (!win.isDestroyed()) win.webContents.send(channel, data);
  });
}

async function runAutoSyncCycle() {
  if (syncState.running) return;
  const config = getErpConfig();
  if (!config) return;

  syncState = { ...syncState, running: true };
  notifyWindows("erp:sync-status", syncState);

  try {
    const lastSyncRow = db.prepare("SELECT valor FROM sync_meta WHERE chave = 'auto_sync_last'").get();
    const lastSync = lastSyncRow?.valor || null;
    const now = new Date().toISOString().slice(0, 19);

    // Primeira execução: marca timestamp e aguarda próximo ciclo
    if (!lastSync) {
      db.prepare("INSERT OR REPLACE INTO sync_meta (chave, valor, atualizado_em) VALUES ('auto_sync_last', ?, CURRENT_TIMESTAMP)").run(now);
      syncState = { running: false, lastRun: now, lastCount: 0, error: null };
      notifyWindows("erp:sync-status", syncState);
      return;
    }

    const produtos = await sincronizarAlterados({ ...config, dataAlteracao: lastSync });

    if (produtos.length > 0) {
      const insert = db.prepare(`
        INSERT OR REPLACE INTO produtos
          (id, ean, codigo_barras, descricao, codigo_interno, preco_varejo, preco_atacado, preco_original, ultima_alteracao)
        VALUES
          (@id, @ean, @codigo_barras, @descricao, @codigo_interno, @preco_varejo, @preco_atacado, @preco_original, @ultima_alteracao)
      `);
      const tx = db.transaction((items) => {
        for (const p of items) {
          insert.run({
            id: p.id,
            ean: p.ean,
            codigo_barras: p.codigo_barras,
            descricao: p.descricao,
            codigo_interno: p.codigoInterno || "",
            preco_varejo: p.precoVarejo || 0,
            preco_atacado: p.precoAtacado || 0,
            preco_original: p.precoOriginal || 0,
            ultima_alteracao: p.ultimaAlteracao || null
          });
        }
      });
      tx(produtos);
    }

    db.prepare("INSERT OR REPLACE INTO sync_meta (chave, valor, atualizado_em) VALUES ('auto_sync_last', ?, CURRENT_TIMESTAMP)").run(now);
    syncState = { running: false, lastRun: now, lastCount: produtos.length, error: null };
    consecutiveSyncFailures = 0;
  } catch (err) {
    syncState = { running: false, lastRun: syncState.lastRun, lastCount: 0, error: err.message };
    consecutiveSyncFailures += 1;
    rescheduleAutoSync();
  }

  notifyWindows("erp:sync-status", syncState);
}

// Circuit breaker: se o ERP estiver fora do ar, espaca os ciclos exponencialmente
// em vez de continuar tentando no intervalo fixo (o que so aumenta a carga durante a queda).
function rescheduleAutoSync() {
  if (!autoSyncTimer) return;
  clearInterval(autoSyncTimer);
  const backoffMs = Math.min(
    AUTO_SYNC_INTERVAL_MS * 2 ** consecutiveSyncFailures,
    AUTO_SYNC_MAX_BACKOFF_MS
  );
  autoSyncTimer = setInterval(() => runAutoSyncCycle(), backoffMs);
}

function startAutoSync(intervalMs = AUTO_SYNC_INTERVAL_MS) {
  if (autoSyncTimer) clearInterval(autoSyncTimer);
  setTimeout(() => runAutoSyncCycle(), 20 * 1000);
  autoSyncTimer = setInterval(() => runAutoSyncCycle(), intervalMs);
}

ipcMain.handle("erp:sync-status", () => syncState);
ipcMain.handle("erp:trigger-sync", () => { runAutoSyncCycle(); return true; });

app.whenReady().then(() => {
  initDb();
  createWindow();
  setupAutoUpdater();
  startAutoSync();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

// Expõe versão atual para a interface
ipcMain.handle("app:version", () => app.getVersion());

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
