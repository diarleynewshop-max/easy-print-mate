import { useEffect, useState } from "react";
import type { ErpSyncState } from "@/types/window";

export function useErpAutoSync() {
  const [state, setState] = useState<ErpSyncState>({
    running: false,
    lastRun: null,
    lastCount: 0,
    error: null,
  });

  useEffect(() => {
    if (!window.easyPrint?.erpSyncStatus) return;

    window.easyPrint.erpSyncStatus().then(setState).catch(() => {});

    const handler = (data: ErpSyncState) => setState(data);
    window.easyPrint.onSyncUpdate(handler);
    return () => window.easyPrint.offSyncUpdate(handler);
  }, []);

  const triggerSync = () => {
    if (!window.easyPrint?.erpTriggerSync) return;
    window.easyPrint.erpTriggerSync().catch(() => {});
  };

  return { ...state, triggerSync };
}
