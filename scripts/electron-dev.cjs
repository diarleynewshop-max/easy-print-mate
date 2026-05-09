const http = require("http");
const path = require("path");
const { spawn } = require("child_process");

const viteBin = path.join(__dirname, "..", "node_modules", "vite", "bin", "vite.js");
const electronBin = path.join(__dirname, "..", "node_modules", ".bin", process.platform === "win32" ? "electron.cmd" : "electron");
const url = "http://localhost:8080";

const vite = spawn(process.execPath, [viteBin, "--host", "0.0.0.0", "--port", "8080"], {
  stdio: "inherit",
  cwd: path.join(__dirname, ".."),
});

function waitForVite(attempt = 0) {
  http.get(url, (res) => {
    res.resume();
    startElectron();
  }).on("error", () => {
    if (attempt > 80) {
      console.error("Vite nao iniciou em tempo.");
      shutdown(1);
      return;
    }
    setTimeout(() => waitForVite(attempt + 1), 250);
  });
}

let electron;

function startElectron() {
  if (electron) return;
  if (process.env.SKIP_ELECTRON === "1" || !require("fs").existsSync(electronBin)) {
    console.log("[electron-dev] Electron desabilitado, mantendo apenas Vite.");
    return;
  }
  try {
    electron = spawn(electronBin, ["."], {
      stdio: "inherit",
      cwd: path.join(__dirname, ".."),
      env: { ...process.env, ELECTRON_RENDERER_URL: url },
    });
    electron.on("error", (err) => {
      console.warn("[electron-dev] Electron nao pode ser iniciado, seguindo apenas com Vite:", err.message);
      electron = null;
    });
    electron.on("exit", (code) => {
      if (code && code !== 0) {
        console.warn(`[electron-dev] Electron saiu com codigo ${code}, mantendo Vite ativo.`);
        electron = null;
        return;
      }
      shutdown(code || 0);
    });
  } catch (err) {
    console.warn("[electron-dev] Falha ao iniciar Electron:", err.message);
  }
}

function shutdown(code = 0) {
  if (electron) electron.kill();
  vite.kill();
  process.exit(code);
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

waitForVite();
