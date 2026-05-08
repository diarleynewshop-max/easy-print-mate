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
  electron = spawn(electronBin, ["."], {
    stdio: "inherit",
    cwd: path.join(__dirname, ".."),
    env: { ...process.env, ELECTRON_RENDERER_URL: url },
  });
  electron.on("exit", (code) => shutdown(code || 0));
}

function shutdown(code = 0) {
  if (electron) electron.kill();
  vite.kill();
  process.exit(code);
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

waitForVite();
