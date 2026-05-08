const { spawn } = require("child_process");
const path = require("path");

const viteBin = path.join(__dirname, "..", "node_modules", "vite", "bin", "vite.js");
const printServer = spawn(process.execPath, [path.join(__dirname, "print-server.cjs")], {
  stdio: "inherit",
});
const vite = spawn(process.execPath, [viteBin, "--host", "0.0.0.0"], {
  stdio: "inherit",
});

function shutdown(code = 0) {
  printServer.kill();
  vite.kill();
  process.exit(code);
}

printServer.on("exit", (code) => {
  if (code) shutdown(code);
});

vite.on("exit", (code) => {
  shutdown(code || 0);
});

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));
