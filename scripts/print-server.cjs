const http = require("http");
const fs = require("fs/promises");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");

const PORT = Number(process.env.PRINT_SERVER_PORT || 8787);
const DEFAULT_PRINTER = process.env.RAW_PRINTER_NAME || "ELGIN L42PRO FULL";
const SCRIPT_PATH = path.join(__dirname, "print-raw.ps1");

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "content-type",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  });
  res.end(JSON.stringify(payload));
}

async function readJson(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk));
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function runPowerShell(filePath, printerName) {
  return new Promise((resolve, reject) => {
    const child = spawn("powershell.exe", [
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-File",
      SCRIPT_PATH,
      "-PrinterName",
      printerName,
      "-FilePath",
      filePath,
    ]);

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

const server = http.createServer(async (req, res) => {
  if (req.method === "OPTIONS") {
    sendJson(res, 200, { ok: true });
    return;
  }

  if (req.method === "GET" && req.url === "/health") {
    sendJson(res, 200, { ok: true, printerName: DEFAULT_PRINTER });
    return;
  }

  if (req.method !== "POST" || req.url !== "/print-raw") {
    sendJson(res, 404, { error: "Rota nao encontrada" });
    return;
  }

  let filePath = "";
  try {
    const body = await readJson(req);
    const content = Array.isArray(body.content) ? body.content.join("") : String(body.content || "");
    if (!content) {
      sendJson(res, 400, { error: "Conteudo PRN vazio" });
      return;
    }

    const printerName = body.printerName || DEFAULT_PRINTER;
    filePath = path.join(os.tmpdir(), `easy-print-${Date.now()}.prn`);
    await fs.writeFile(filePath, content, "ascii");
    await runPowerShell(filePath, printerName);
    sendJson(res, 200, { ok: true, printerName });
  } catch (error) {
    sendJson(res, 500, { error: error instanceof Error ? error.message : String(error) });
  } finally {
    if (filePath) await fs.rm(filePath, { force: true }).catch(() => {});
  }
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`Print server em http://127.0.0.1:${PORT}`);
});
