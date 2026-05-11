import { useState } from "react";
import { VFConfig } from "@/types/label";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { storage } from "@/services/storage";
import { toast } from "sonner";

interface Props {
  config: VFConfig;
  onSave: (cfg: VFConfig) => void;
  printers?: Array<{ name: string; isDefault?: boolean; isOffline?: boolean }>;
}

export function ApiConfig({ config, onSave, printers = [] }: Props) {
  const [c, setC] = useState<VFConfig>({
    companyName: config.companyName || config.empresa || "",
    baseUrl: config.baseUrl || "",
    username: config.username || "",
    password: config.password || "",
    token: config.token || "",
    loja: config.loja || "",
    empresa: config.empresa,
  });

  const updateField = (field: keyof VFConfig, value: string) => {
    setC((current) => ({ ...current, [field]: value }));
  };

  const save = () => {
    storage.saveConfig(c);
    onSave(c);
    toast.success("Configuracao salva");
  };

  return (
    <div className="max-w-xl space-y-4">
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
