import { useState } from "react";
import { LabelTemplate, LabelField, LabelFieldKey } from "@/types/label";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { LabelPreview } from "./LabelPreview";
import { storage, defaultTemplates } from "@/services/storage";
import { toast } from "sonner";
import { Download, Upload, Save, Trash2, Plus } from "lucide-react";

const FIELD_LABELS: Record<LabelFieldKey, string> = {
  descricao: "Descrição",
  precoVarejo: "Preço Varejo",
  precoAtacado: "Preço Atacado",
  ean: "EAN (texto)",
  barcode: "Código de Barras",
  secao: "Seção",
  estoque: "Estoque",
  codigoInterno: "Código Interno",
};

interface Props {
  templates: LabelTemplate[];
  activeId: string;
  onChange: (templates: LabelTemplate[], activeId: string) => void;
}

export function LabelEditor({ templates, activeId, onChange }: Props) {
  const [local, setLocal] = useState<LabelTemplate[]>(templates);
  const [currentId, setCurrentId] = useState(activeId);
  const current = local.find((t) => t.id === currentId) || local[0];

  const update = (patch: Partial<LabelTemplate>) => {
    const next = local.map((t) => (t.id === current.id ? { ...t, ...patch } : t));
    setLocal(next);
  };

  const updateField = (key: LabelFieldKey, patch: Partial<LabelField>) => {
    update({ fields: current.fields.map((f) => (f.key === key ? { ...f, ...patch } : f)) });
  };

  const save = () => {
    storage.saveTemplates(local);
    storage.setActiveTemplateId(current.id);
    onChange(local, current.id);
    toast.success("Modelos salvos");
  };

  const newTemplate = () => {
    const id = `tpl-${Date.now()}`;
    const t: LabelTemplate = {
      ...defaultTemplates()[0],
      id,
      name: "Novo modelo",
    };
    setLocal([...local, t]);
    setCurrentId(id);
  };

  const remove = () => {
    if (local.length <= 1) return toast.error("Mantenha ao menos um modelo");
    const next = local.filter((t) => t.id !== current.id);
    setLocal(next);
    setCurrentId(next[0].id);
  };

  const exportJson = () => {
    const blob = new Blob([JSON.stringify(local, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "modelos-etiqueta.json";
    a.click();
    URL.revokeObjectURL(url);
  };

  const importJson = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result as string) as LabelTemplate[];
        setLocal(data);
        setCurrentId(data[0]?.id || "");
        toast.success("Modelos importados");
      } catch {
        toast.error("JSON inválido");
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[360px_1fr] gap-4 h-full">
      <div className="space-y-4 overflow-auto pr-2">
        <div className="flex gap-2">
          <select
            className="flex-1 h-9 rounded-md border bg-background px-2 text-sm"
            value={current.id}
            onChange={(e) => setCurrentId(e.target.value)}
          >
            {local.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
          <Button size="icon" variant="outline" onClick={newTemplate} title="Novo">
            <Plus />
          </Button>
          <Button size="icon" variant="outline" onClick={remove} title="Remover">
            <Trash2 />
          </Button>
        </div>

        <div className="space-y-2">
          <Label>Nome</Label>
          <Input value={current.name} onChange={(e) => update({ name: e.target.value })} />
        </div>

        <div className="grid grid-cols-3 gap-2">
          <div>
            <Label>Largura (mm)</Label>
            <Input type="number" value={current.widthMm} onChange={(e) => update({ widthMm: +e.target.value })} />
          </div>
          <div>
            <Label>Altura (mm)</Label>
            <Input type="number" value={current.heightMm} onChange={(e) => update({ heightMm: +e.target.value })} />
          </div>
          <div>
            <Label>Margem</Label>
            <Input type="number" value={current.marginMm} onChange={(e) => update({ marginMm: +e.target.value })} />
          </div>
        </div>

        <div>
          <Label>Fonte</Label>
          <Input value={current.fontFamily} onChange={(e) => update({ fontFamily: e.target.value })} />
        </div>

        <div className="space-y-3 border-t pt-3">
          <div className="text-sm font-semibold">Campos</div>
          {current.fields.map((f) => (
            <div key={f.key} className="rounded-md border p-2 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">{FIELD_LABELS[f.key]}</span>
                <Switch checked={f.visible} onCheckedChange={(v) => updateField(f.key, { visible: v })} />
              </div>
              {f.visible && (
                <div className="grid grid-cols-4 gap-2">
                  <div>
                    <Label className="text-xs">X</Label>
                    <Input type="number" value={f.x} onChange={(e) => updateField(f.key, { x: +e.target.value })} />
                  </div>
                  <div>
                    <Label className="text-xs">Y</Label>
                    <Input type="number" value={f.y} onChange={(e) => updateField(f.key, { y: +e.target.value })} />
                  </div>
                  <div>
                    <Label className="text-xs">Tam.</Label>
                    <Input
                      type="number"
                      value={f.fontSize}
                      onChange={(e) => updateField(f.key, { fontSize: +e.target.value })}
                    />
                  </div>
                  <div className="flex items-end">
                    <label className="flex items-center gap-1 text-xs">
                      <input
                        type="checkbox"
                        checked={!!f.bold}
                        onChange={(e) => updateField(f.key, { bold: e.target.checked })}
                      />
                      Negrito
                    </label>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="flex flex-wrap gap-2 sticky bottom-0 bg-background pt-2 border-t">
          <Button onClick={save} className="flex-1">
            <Save /> Salvar
          </Button>
          <Button variant="outline" onClick={exportJson}>
            <Download /> Exportar
          </Button>
          <label>
            <input
              type="file"
              accept="application/json"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && importJson(e.target.files[0])}
            />
            <Button variant="outline" asChild>
              <span>
                <Upload /> Importar
              </span>
            </Button>
          </label>
        </div>
      </div>

      <div className="bg-muted/40 rounded-md p-6 flex items-center justify-center overflow-auto">
        <LabelPreview template={current} product={null} />
      </div>
    </div>
  );
}
