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
}

export function ApiConfig({ config, onSave }: Props) {
  const [c, setC] = useState<VFConfig>(config);

  const save = () => {
    storage.saveConfig(c);
    onSave(c);
    toast.success("Configuração salva");
  };

  return (
    <div className="max-w-xl space-y-4">
      <div>
        <Label>URL base do ERP</Label>
        <Input
          placeholder="https://suaempresa.varejofacil.com"
          value={c.baseUrl}
          onChange={(e) => setC({ ...c, baseUrl: e.target.value })}
        />
      </div>
      <div>
        <Label>Token (Bearer)</Label>
        <Input
          type="password"
          placeholder="Token de acesso"
          value={c.token}
          onChange={(e) => setC({ ...c, token: e.target.value })}
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>Empresa</Label>
          <Input value={c.empresa} onChange={(e) => setC({ ...c, empresa: e.target.value })} />
        </div>
        <div>
          <Label>Loja</Label>
          <Input value={c.loja} onChange={(e) => setC({ ...c, loja: e.target.value })} />
        </div>
      </div>
      <Button onClick={save}>Salvar configuração</Button>
      <p className="text-xs text-muted-foreground">
        Configurações ficam salvas localmente neste navegador. O app apenas consulta dados — nunca altera o cadastro no ERP.
      </p>
    </div>
  );
}
