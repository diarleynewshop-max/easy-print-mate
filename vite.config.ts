import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import fs from "fs/promises";
import os from "os";
import { spawn } from "child_process";
import { componentTagger } from "lovable-tagger";

const RAW_PRINTER_NAME = process.env.RAW_PRINTER_NAME || "ELGIN L42PRO FULL";

function rawPrintMiddleware() {
  return {
    name: "raw-print-middleware",
    configureServer(server) {
      server.middlewares.use("/api/print-raw", async (req, res) => {
        if (req.method !== "POST") {
          res.statusCode = 405;
          res.end("Method not allowed");
          return;
        }

        try {
          const chunks: Buffer[] = [];
          for await (const chunk of req) chunks.push(Buffer.from(chunk));
          const body = JSON.parse(Buffer.concat(chunks).toString("utf8")) as {
            content?: string;
            printerName?: string;
          };

          if (!body.content) {
            res.statusCode = 400;
            res.end(JSON.stringify({ error: "Conteudo PRN vazio" }));
            return;
          }

          const filePath = path.join(os.tmpdir(), `easy-print-${Date.now()}.prn`);
          const scriptPath = path.resolve(__dirname, "scripts", "print-raw.ps1");
          await fs.writeFile(filePath, body.content, "ascii");

          const printerName = body.printerName || RAW_PRINTER_NAME;
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
          ]);

          let stdout = "";
          let stderr = "";
          child.stdout.on("data", (data) => {
            stdout += data.toString();
          });
          child.stderr.on("data", (data) => {
            stderr += data.toString();
          });
          child.on("error", async (error) => {
            await fs.rm(filePath, { force: true });
            res.statusCode = 500;
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ error: error.message }));
          });

          child.on("close", async (code) => {
            await fs.rm(filePath, { force: true });
            res.setHeader("Content-Type", "application/json");
            if (code === 0) {
              res.end(JSON.stringify({ ok: true, printerName }));
              return;
            }
            res.statusCode = 500;
            res.end(JSON.stringify({ error: stderr || stdout || `Falha ao imprimir. Codigo ${code}` }));
          });
        } catch (error) {
          res.statusCode = 500;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ error: error instanceof Error ? error.message : "Erro inesperado" }));
        }
      });
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [react(), rawPrintMiddleware(), mode === "development" && componentTagger()].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    dedupe: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime", "@tanstack/react-query", "@tanstack/query-core"],
  },
}));
