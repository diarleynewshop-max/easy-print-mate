import { useEffect, useState } from "react";

export type PrintServerStatus = "online" | "offline" | "checking";

const SERVER_URL = "http://127.0.0.1:8787";

export async function pingPrintServer(): Promise<boolean> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 1500);
    const res = await fetch(`${SERVER_URL}/health`, { signal: ctrl.signal });
    clearTimeout(t);
    return res.ok;
  } catch {
    return false;
  }
}

export function usePrintServerStatus(intervalMs = 10000) {
  const [status, setStatus] = useState<PrintServerStatus>("checking");

  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      const ok = await pingPrintServer();
      if (!cancelled) setStatus(ok ? "online" : "offline");
    };
    check();
    const id = setInterval(check, intervalMs);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [intervalMs]);

  return status;
}
