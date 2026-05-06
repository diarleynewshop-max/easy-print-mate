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
  descricao: "Descricao",
  precoVarejo: "Preco Varejo",
  precoAtacado: "Preco Atacado",
  ean: "EAN (texto)",
  barcode: "Codigo de Barras",
  secao: "Secao",
  estoque: "Estoque",
  codigoInterno: "Codigo Interno",
};

interface Props {
  templates: LabelTemplate[];
  activeId: string;
  onChange: (templates: LabelTemplate[], activeId: string) => void;
}

function normalizeTemplate(template: LabelTemplate): LabelTemplate {
  return {
    ...template,
    columns: Math.max(1, template.columns || 1),
    columnGapMm: template.columnGapMm ?? 2,
    fields: template.fields.map((field) => ({
      ...field,
      widthMm: field.widthMm ?? Math.max(8, template.widthMm - field.x - template.marginMm),
      heightMm: field.heightMm ?? (field.key === "barcode" ? 9 : Math.max(5, field.fontSize * 0.42)),
    })),
  };
}

function parseBtwTemplate(fileName: string, text: string): LabelTemplate {
  const metaSize = text.match(/<TemplateSize>\s*([0-9.,]+)\s*x\s*([0-9.,]+)\s*mm\s*<\/TemplateSize>/i);
  const name = fileName.replace(/\.btw$/i, "").trim() || `BTw ${Date.now()}`;
  const widthMm = metaSize ? Number(metaSize[1].replace(",", ".")) : 60;
  const heightMm = metaSize ? Number(metaSize[2].replace(",", ".")) : 40;
  const base = defaultTemplates()[0];

  return normalizeTemplate({
    ...base,
    id: `btw-${Date.now()}`,
    name,
    widthMm: Number.isFinite(widthMm) ? widthMm : 60,
    heightMm: Number.isFinite(heightMm) ? heightMm : 40,
    marginMm: 2,
    fields: base.fields.map((field) => {
      if (field.key === "descricao") return { ...field, x: 2, y: 2, widthMm: Math.max(10, widthMm - 4) };
      if (field.key === "precoVarejo") return { ...field, x: 2, y: Math.max(8, heightMm * 0.35), widthMm: Math.max(10, widthMm * 0.45) };
      if (field.key === "barcode") return { ...field, x: 2, y: Math.max(16, heightMm - 10), widthMm: Math.max(20, widthMm - 4), heightMm: Math.min(10, heightMm / 3) };
      return field;
    }),
  });
}

export function LabelEditor({ templates, activeId, onChange }: Props) {
  const [local, setLocal] = useState<LabelTemplate[]>(templates.map(normalizeTemplate));
  const [currentId, setCurrentId] = useState(activeId);
  const [selectedField, setSelectedField] = useState<LabelFieldKey | null>("barcode");
  const current = local.find((t) => t.id === currentId) || local[0];

  const update = (patch: Partial<LabelTemplate>) => {
    const next = local.map((t) => (t.id === current.id ? normalizeTemplate({ ...t, ...patch }) : t));
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
    const t: LabelTemplate = normalizeTemplate({
      ...defaultTemplates()[0],
      id,
      name: "Novo modelo",
    });
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

  const importTemplateFile = async (file: File) => {
    try {
      const text = await file.text();

      if (file.name.toLowerCase().endsWith(".btw")) {
        const template = parseBtwTemplate(file.name, text.slice(0, 12000));
        setLocal((prev) => [...prev, template]);
        setCurrentId(template.id);
        toast.success(`Modelo importado do BarTender: ${template.widthMm}x${template.heightMm}mm`);
        return;
      }

      const data = JSON.parse(text) as LabelTemplate[];
      const next = data.map(normalizeTemplate);
      setLocal(next);
      setCurrentId(next[0]?.id || "");
      toast.success("Modelos importados");
    } catch {
      toast.error("Arquivo invalido");
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[380px_1fr] gap-4 h-full">
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

        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label>Colunas</Label>
            <Input
              type="number"
              min={1}
              max={6}
              value={current.columns || 1}
              onChange={(e) => update({ columns: Math.max(1, +e.target.value || 1) })}
            />
          </div>
          <div>
            <Label>Espaco colunas (mm)</Label>
            <Input
              type="number"
              value={current.columnGapMm ?? 2}
              onChange={(e) => update({ columnGapMm: Math.max(0, +e.target.value || 0) })}
            />
          </div>
        </div>

        <div>
          <Label>Fonte</Label>
          <Input value={current.fontFamily} onChange={(e) => update({ fontFamily: e.target.value })} />
        </div>

        <div className="rounded-md border bg-muted/40 p-3 text-xs text-muted-foreground">
          Arraste qualquer campo no preview. Clique no campo e use o ponto azul para redimensionar.
        </div>

        <div className="space-y-3 border-t pt-3">
          <div className="text-sm font-semibold">Campos</div>
          {current.fields.map((f) => (
            <div key={f.key} className={`rounded-md border p-2 space-y-2 ${selectedField === f.key ? "border-primary" : ""}`}>
              <div className="flex items-center justify-between">
                <button type="button" onClick={() => setSelectedField(f.key)} className="text-sm font-medium text-left">
                  {FIELD_LABELS[f.key]}
                </button>
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
                    <Label className="text-xs">Larg.</Label>
                    <Input type="number" value={f.widthMm ?? 10} onChange={(e) => updateField(f.key, { widthMm: +e.target.value })} />
                  </div>
                  <div>
                    <Label className="text-xs">Alt.</Label>
                    <Input type="number" value={f.heightMm ?? 5} onChange={(e) => updateField(f.key, { heightMm: +e.target.value })} />
                  </div>
                  <div>
                    <Label className="text-xs">Fonte</Label>
                    <Input type="number" value={f.fontSize} onChange={(e) => updateField(f.key, { fontSize: +e.target.value })} />
                  </div>
                  <div className="flex items-end">
                    <label className="flex items-center gap-1 text-xs">
                      <input type="checkbox" checked={!!f.bold} onChange={(e) => updateField(f.key, { bold: e.target.checked })} />
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
              accept=".json,.btw,application/json"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && importTemplateFile(e.target.files[0])}
            />
            <Button variant="outline" asChild>
              <span>
                <Upload /> Importar JSON/BTW
              </span>
            </Button>
          </label>
        </div>
      </div>

      <div className="bg-muted/40 rounded-md p-6 flex items-center justify-center overflow-auto">
        <LabelPreview
          template={current}
          product={null}
          editable
          selectedField={selectedField}
          onSelectField={setSelectedField}
          onFieldChange={updateField}
        />
      </div>
    </div>
  );
}
