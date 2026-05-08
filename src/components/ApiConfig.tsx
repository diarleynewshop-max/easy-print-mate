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
  const [c, setC] = useState<VFConfig>({
    ...config,
    empresa: config.empresa || "NEWSHOP",
  });

  const save = () => {
    storage.saveConfig(c);
    onSave(c);
    toast.success("Configuracao salva");
  };

  return (
    <div className="max-w-xl space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>Empresa</Label>
          <select
            className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            value={c.empresa || "NEWSHOP"}
            onChange={(e) => setC({ ...c, empresa: e.target.value })}
          >
            <option value="NEWSHOP">NEWSHOP</option>
            <option value="SOYE">SOYE</option>
            <option value="FACIL">FACIL</option>
          </select>
        </div>
        <div>
          <Label>Loja ID</Label>
          <Input placeholder="Ex.: 2" value={c.loja} onChange={(e) => setC({ ...c, loja: e.target.value })} />
        </div>
      </div>

      <Button onClick={save}>Salvar configuracao</Button>

      <div className="rounded-md border bg-muted/40 p-3 text-xs text-muted-foreground space-y-2">
        <p>No app local, token, usuario, senha e URL do ERP ficam no arquivo `.env` da pasta Documentos/Easy Print Mate.</p>
        <p>Na Web, a consulta continua usando o proxy interno `/api/varejo-facil`.</p>
        <p>Consulta apenas leitura: descricao, valor de venda, codigo de barras, estoque e dados opcionais.</p>
      </div>
    </div>
  );
}
