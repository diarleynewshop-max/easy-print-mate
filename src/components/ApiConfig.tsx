import { useState } from "react";
import { VFConfig } from "@/types/label";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { storage } from "@/services/storage";
import { dbService } from "@/services/dbService";
import { toast } from "sonner";
import { Loader2, RefreshCw } from "lucide-react";

interface Props {
  config: VFConfig;
  onSave: (cfg: VFConfig) => void;
  printers?: Array<{ name: string; isDefault?: boolean; isOffline?: boolean }>;
}

export function ApiConfig({ config, onSave, printers = [] }: Props) {
  const [syncing, setSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState(0);
  const [syncStatus, setSyncStatus] = useState("");
  const [checkingUpdates, setCheckingUpdates] = useState(false);
  const [c, setC] = useState<VFConfig>({
    companyName: config.companyName || config.empresa || "",
    baseUrl: config.baseUrl || "",
    username: config.username || "",
    password: config.password || "",
    token: config.token || "",
    loja: config.loja || "",
    empresa: config.empresa,
    labelPrinterName: config.labelPrinterName,
    a4PrinterName: config.a4PrinterName,
  });

  const updateField = (field: keyof VFConfig, value: string) => {
    setC((current) => ({ ...current, [field]: value }));
  };

  const save = () => {
    storage.saveConfig(c);
    onSave(c);
    toast.success("Configuracao salva");
  };

  const syncDatabase = async () => {
    if (syncing) return;
    setSyncing(true);
    setSyncProgress(0);
    setSyncStatus("Verificando última sincronização...");
    toast.info("Iniciando sincronizacao...");

    try {
      const syncKey = `products_${c.companyName || c.empresa}`;
      const lastSync = await dbService.getLastSync(syncKey);
      
      let page = 1;
      let totalFetched = 0;
      let hasMore = true;
      const count = 100;
      let newestSyncTimestamp = lastSync;

      while (hasMore) {
        setSyncStatus(`Buscando lote ${page}...`);
        const result = await window.easyPrint.erpListProducts(c, page, count, lastSync || undefined);
        
        if (!result.items || result.items.length === 0) {
          hasMore = false;
          break;
        }

        // Atualiza o timestamp mais recente encontrado neste lote
        result.items.forEach(item => {
          if (item.ultimaAlteracao && (!newestSyncTimestamp || item.ultimaAlteracao > newestSyncTimestamp)) {
            newestSyncTimestamp = item.ultimaAlteracao;
          }
        });

        await dbService.syncProducts(result.items);
        totalFetched += result.items.length;
        
        const progress = result.total > 0 ? Math.round((totalFetched / result.total) * 100) : 0;
        setSyncProgress(progress);

        if (totalFetched >= result.total || result.items.length < count) {
          hasMore = false;
        } else {
          setSyncStatus(`Aguardando próximo lote (5s)...`);
          await new Promise(resolve => setTimeout(resolve, 5000));
          page++;
        }
      }

      // Salva o novo timestamp de sincronização
      if (newestSyncTimestamp) {
        await dbService.setLastSync(syncKey, newestSyncTimestamp);
      }

      if (totalFetched === 0) {
        toast.info("Banco já está atualizado. Nenhum produto novo ou alterado.");
      } else {
        toast.success(`Sincronizacao concluida! ${totalFetched} produtos atualizados.`);
      }
    } catch (error) {
      console.error(error);
      toast.error("Erro na sincronizacao. Verifique a internet e as credenciais.");
    } finally {
      setSyncing(false);
      setSyncStatus("");
    }
  };

  const handleCheckUpdates = async () => {
    if (!window.easyPrint?.isDesktop) return;
    setCheckingUpdates(true);
    try {
      const res = await window.easyPrint.appCheckForUpdates();
      if (res.success) {
        toast.info("Verificação concluída. Se houver uma nova versão, o download começará em segundo plano.");
      } else {
        toast.error(`Erro ao verificar: ${res.message}`);
      }
    } catch (error) {
      toast.error("Falha na comunicação com o sistema de atualização.");
    } finally {
      setCheckingUpdates(false);
    }
  };

  return (
    <div className="max-w-xl space-y-4 pb-10">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Configurações Gerais</h2>
        <div className="flex items-center gap-2">
          <Button 
            variant="outline" 
            size="sm" 
            onClick={handleCheckUpdates} 
            disabled={checkingUpdates}
            className="gap-2"
          >
            {checkingUpdates ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Verificar Atualizações
          </Button>
          <div className="flex flex-col items-end gap-1">
            <Button 
              variant="outline" 
              size="sm" 
              onClick={syncDatabase} 
              disabled={syncing}
              className="gap-2"
            >
              {syncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              {syncing ? `Sincronizando ${syncProgress}%` : "Sincronizar Banco Local"}
            </Button>
            {syncing && <span className="text-[10px] text-muted-foreground animate-pulse">{syncStatus}</span>}
          </div>
        </div>
      </div>

      <div>
        <Label>Nome da empresa</Label>
        <Input
          placeholder="Ex.: NEWSHOP MATRIZ"
          value={c.companyName}
          onChange={(e) => updateField("companyName", e.target.value)}
        />
      </div>

      <div>
        <Label>Link</Label>
        <Input
          placeholder="https://empresa.varejofacil.com/api"
          value={c.baseUrl}
          onChange={(e) => updateField("baseUrl", e.target.value)}
        />
      </div>

      <div>
        <Label>Login</Label>
        <Input
          placeholder="usuario"
          value={c.username}
          onChange={(e) => updateField("username", e.target.value)}
        />
      </div>

      <div>
        <Label>Senha</Label>
        <Input
          type="password"
          placeholder="senha"
          value={c.password}
          onChange={(e) => updateField("password", e.target.value)}
        />
      </div>

      <div>
        <Label>Token API</Label>
        <Input
          placeholder="Bearer ... ou token puro"
          value={c.token}
          onChange={(e) => updateField("token", e.target.value)}
        />
      </div>

      <div>
        <Label>Impressora de etiqueta</Label>
        <select
          className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          value={c.labelPrinterName || ""}
          onChange={(e) => updateField("labelPrinterName", e.target.value)}
        >
          <option value="">Usar padrao antiga do app</option>
          {printers.map((printer) => (
            <option key={printer.name} value={printer.name}>
              {printer.name}{printer.isDefault ? " (padrao Windows)" : ""}{printer.isOffline ? " [offline]" : ""}
            </option>
          ))}
        </select>
      </div>

      <div>
        <Label>Impressora A4 preferida</Label>
        <select
          className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          value={c.a4PrinterName || ""}
          onChange={(e) => updateField("a4PrinterName", e.target.value)}
        >
          <option value="">Escolher no dialogo do Windows</option>
          {printers.map((printer) => (
            <option key={`a4-${printer.name}`} value={printer.name}>
              {printer.name}{printer.isDefault ? " (padrao Windows)" : ""}{printer.isOffline ? " [offline]" : ""}
            </option>
          ))}
        </select>
      </div>

      <div>
        <Label>Loja ID</Label>
        <Input
          placeholder="Ex.: 2"
          value={c.loja}
          onChange={(e) => updateField("loja", e.target.value)}
        />
      </div>

      <Button onClick={save}>Salvar configuracao</Button>

      <div className="rounded-md border bg-muted/40 p-3 text-xs text-muted-foreground space-y-2">
        <p>Se preencher login e senha, o app tenta autenticar no ERP automaticamente.</p>
        <p>Se preferir, pode deixar login e senha vazios e usar apenas o token API.</p>
        <p>O nome da empresa agora e livre. Nao fica mais preso em 3 opcoes.</p>
        <p>Etiqueta usa a impressora escolhida acima. A4 continua abrindo o dialogo de impressao do Windows.</p>
      </div>
    </div>
  );
}
