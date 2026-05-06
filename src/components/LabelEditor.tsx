import { useState } from "react";
import { LabelTemplate, LabelField, LabelFieldKey } from "@/types/label";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { LabelPreview } from "./LabelPreview";
import { storage, defaultTemplates } from "@/services/storage";
import { toast } from "sonner";
import {
  Barcode,
  DollarSign,
  Download,
  Eye,
  EyeOff,
  Hash,
  Layers3,
  MousePointer2,
  Plus,
  Ruler,
  Save,
  Tags,
  Trash2,
  Type,
  Upload,
} from "lucide-react";
import { cn } from "@/lib/utils";

const FIELD_LABELS: Record<LabelFieldKey, string> = {
  descricao: "Descricao",
  precoVarejo: "Preco Varejo",
  precoAtacado: "Preco Atacado",
  ean: "EAN",
  barcode: "Codigo de Barras",
  secao: "Secao",
  estoque: "Estoque",
  codigoInterno: "Codigo Interno",
};

const FIELD_ICONS: Record<LabelFieldKey, React.ElementType> = {
  descricao: Type,
  precoVarejo: DollarSign,
  precoAtacado: DollarSign,
  ean: Hash,
  barcode: Barcode,
  secao: Tags,
  estoque: Hash,
  codigoInterno: Hash,
};

const FONT_OPTIONS = [
  "Arial, sans-serif",
  "Arial Black, sans-serif",
  "Barlow Condensed, Arial, sans-serif",
  "Calibri, Arial, sans-serif",
  "Courier New, monospace",
  "Georgia, serif",
  "Impact, Arial Black, sans-serif",
  "Inter, Arial, sans-serif",
  "Montserrat, Arial, sans-serif",
  "Roboto Condensed, Arial, sans-serif",
  "Tahoma, Arial, sans-serif",
  "Times New Roman, serif",
  "Verdana, Arial, sans-serif",
];

const BARCODE_FORMATS = [
  { value: "auto", label: "Auto" },
  { value: "EAN13", label: "EAN-13" },
  { value: "EAN8", label: "EAN-8" },
  { value: "CODE128", label: "Code 128" },
  { value: "UPC", label: "UPC" },
  { value: "ITF14", label: "ITF-14" },
] as const;

interface Props {
  templates: LabelTemplate[];
  activeId: string;
  onChange: (templates: LabelTemplate[], activeId: string) => void;
}

function normalizeTemplate(template: LabelTemplate): LabelTemplate {
  const marginLeftMm = template.marginLeftMm ?? 0;
  const marginRightMm = template.marginRightMm ?? 0;
  const marginTopMm = template.marginTopMm ?? 0;
  const marginBottomMm = template.marginBottomMm ?? 0;

  return {
    ...template,
    columns: Math.max(1, template.columns || 1),
    columnGapMm: template.columnGapMm ?? 0,
    rowGapMm: template.rowGapMm ?? 0,
    marginLeftMm,
    marginRightMm,
    marginTopMm,
    marginBottomMm,
    fields: template.fields.map((field) => {
      const normalized: LabelField = {
        ...field,
        widthMm: field.widthMm ?? Math.max(8, template.widthMm - field.x - marginRightMm),
        heightMm: field.heightMm ?? (field.key === "barcode" ? 9 : Math.max(5, field.fontSize * 0.42)),
        fontFamily: field.fontFamily ?? template.fontFamily,
        align: field.align ?? (field.key === "barcode" ? "center" : "left"),
        color: field.color ?? "#000000",
      };

      if (field.key !== "barcode") return normalized;

      return {
        ...normalized,
        barcodeFormat: field.barcodeFormat ?? "auto",
        barcodeDisplayValue: field.barcodeDisplayValue ?? true,
        barcodeTextPosition: field.barcodeTextPosition ?? "bottom",
        barcodeLineColor: field.barcodeLineColor ?? field.color ?? "#000000",
        barcodeBarWidth: field.barcodeBarWidth ?? 1,
        barcodeTextMargin: field.barcodeTextMargin ?? 1,
      };
    }),
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
      if (field.key === "barcode") return { ...field, x: 2, y: Math.max(6, heightMm - 7), widthMm: Math.max(20, widthMm - 4), heightMm: Math.min(10, heightMm / 3) };
      return field;
    }),
  });
}

function NumberControl({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
}: {
  label: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className="space-y-0.5">
      <Label className="text-[10px] font-medium text-muted-foreground">{label}</Label>
      <Input
        type="number"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-8 px-2 text-xs"
      />
    </div>
  );
}

function SelectControl({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}) {
  return (
    <div className="space-y-0.5">
      <Label className="text-[10px] font-medium text-muted-foreground">{label}</Label>
      <select
        className="h-8 w-full rounded-md border bg-background px-2 text-xs"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function FontControl({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <div className="space-y-0.5">
      <Label className="text-[10px] font-medium text-muted-foreground">{label}</Label>
      <Input
        list="label-font-options"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-8 px-2 text-xs"
      />
    </div>
  );
}

export function LabelEditor({ templates, activeId, onChange }: Props) {
  const [local, setLocal] = useState<LabelTemplate[]>(templates.map(normalizeTemplate));
  const [currentId, setCurrentId] = useState(activeId);
  const [selectedField, setSelectedField] = useState<LabelFieldKey | null>("barcode");
  const current = local.find((t) => t.id === currentId) || local[0];
  const selected = current.fields.find((field) => field.key === selectedField) || current.fields.find((field) => field.visible) || current.fields[0];
  const SelectedIcon = selected ? FIELD_ICONS[selected.key] : MousePointer2;

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
    const t = normalizeTemplate({ ...defaultTemplates()[0], id, name: "Novo modelo" });
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
        toast.success(`Modelo importado: ${template.widthMm}x${template.heightMm}mm`);
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
    <div className="h-full min-h-0 overflow-hidden rounded-lg border bg-background shadow-sm">
      <datalist id="label-font-options">
        {FONT_OPTIONS.map((font) => (
          <option key={font} value={font} />
        ))}
      </datalist>

      <div className="flex h-11 items-center justify-between border-b bg-card px-3">
        <div className="flex min-w-0 items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10 text-primary">
            <Tags className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold leading-tight">Editor de Etiqueta</p>
            <p className="text-xs text-muted-foreground">{current.widthMm} x {current.heightMm} mm · {current.columns || 1} coluna(s)</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <select
            className="h-8 w-56 rounded-md border bg-background px-2 text-xs"
            value={current.id}
            onChange={(e) => setCurrentId(e.target.value)}
          >
            {local.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
          <Button size="sm" variant="outline" className="h-8" onClick={newTemplate}>
            <Plus /> Novo
          </Button>
          <Button size="sm" variant="outline" className="h-8" onClick={remove}>
            <Trash2 /> Excluir
          </Button>
          <Button size="sm" className="h-8" onClick={save}>
            <Save /> Salvar
          </Button>
        </div>
      </div>

      <div className="grid h-[calc(100%-2.75rem)] min-h-0 grid-cols-[240px_minmax(360px,1fr)_280px]">
        <aside className="min-h-0 overflow-auto border-r bg-card/70">
          <div className="space-y-2 border-b p-3">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <Layers3 className="h-4 w-4 text-primary" />
              Campos
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Button variant="outline" size="sm" className="h-8 text-xs" onClick={exportJson}>
                <Download /> Exportar
              </Button>
              <label>
                <input
                  type="file"
                  accept=".json,.btw,application/json"
                  className="hidden"
                  onChange={(e) => e.target.files?.[0] && importTemplateFile(e.target.files[0])}
                />
                <Button variant="outline" size="sm" asChild className="h-8 w-full text-xs">
                  <span>
                    <Upload /> Importar
                  </span>
                </Button>
              </label>
            </div>
          </div>

          <div className="p-2">
            {current.fields.map((field) => {
              const Icon = FIELD_ICONS[field.key];
              const active = selected?.key === field.key;
              return (
                <button
                  key={field.key}
                  type="button"
                  onClick={() => setSelectedField(field.key)}
                  className={cn(
                    "mb-1 flex w-full items-center gap-2 rounded-md border px-2 py-1.5 text-left transition-colors",
                    active ? "border-primary bg-primary/10 text-primary" : "border-transparent hover:border-border hover:bg-muted/60"
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-medium">{FIELD_LABELS[field.key]}</span>
                    <span className="block truncate text-[11px] text-muted-foreground">
                      {field.x}mm, {field.y}mm · {field.widthMm ?? 0}x{field.heightMm ?? 0}mm
                    </span>
                  </span>
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={(event) => {
                      event.stopPropagation();
                      updateField(field.key, { visible: !field.visible });
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        updateField(field.key, { visible: !field.visible });
                      }
                    }}
                    className="rounded p-1 text-muted-foreground hover:bg-background hover:text-foreground"
                    aria-label={field.visible ? "Ocultar campo" : "Mostrar campo"}
                  >
                    {field.visible ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                  </span>
                </button>
              );
            })}
          </div>
        </aside>

        <main className="min-h-0 overflow-auto bg-[linear-gradient(45deg,#eef2f7_25%,transparent_25%),linear-gradient(-45deg,#eef2f7_25%,transparent_25%),linear-gradient(45deg,transparent_75%,#eef2f7_75%),linear-gradient(-45deg,transparent_75%,#eef2f7_75%)] bg-[length:22px_22px] bg-[position:0_0,0_11px,11px_-11px,-11px_0]">
          <div className="flex min-h-full items-center justify-center p-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between rounded-md border bg-card px-3 py-1.5 text-[11px] text-muted-foreground shadow-sm">
                <span className="flex items-center gap-2">
                  <MousePointer2 className="h-3.5 w-3.5" />
                  {selected ? FIELD_LABELS[selected.key] : "Selecione um campo"}
                </span>
                <span>{current.name}</span>
              </div>
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
        </main>

        <aside className="min-h-0 overflow-auto border-l bg-card/80">
          <div className="border-b px-3 py-2">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <Ruler className="h-4 w-4 text-primary" />
              Modelo
            </div>
          </div>

          <div className="space-y-3 p-3">
            <div className="space-y-1">
              <Label className="text-xs">Nome do modelo</Label>
              <Input className="h-8 text-xs" value={current.name} onChange={(e) => update({ name: e.target.value })} />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <NumberControl label="Largura total" value={current.widthMm} min={1} step={0.5} onChange={(value) => update({ widthMm: value })} />
              <NumberControl label="Altura etiqueta" value={current.heightMm} min={1} step={0.5} onChange={(value) => update({ heightMm: value })} />
            </div>

            <div className="grid grid-cols-3 gap-2">
              <NumberControl label="Colunas" value={current.columns || 1} min={1} max={6} onChange={(value) => update({ columns: Math.max(1, value) })} />
              <NumberControl label="Esp. horiz." value={current.columnGapMm ?? 0} min={0} step={0.5} onChange={(value) => update({ columnGapMm: Math.max(0, value) })} />
              <NumberControl label="Esp. vert." value={current.rowGapMm ?? 0} min={0} step={0.5} onChange={(value) => update({ rowGapMm: Math.max(0, value) })} />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <NumberControl label="Esquerda" value={current.marginLeftMm ?? 0} min={0} step={0.5} onChange={(value) => update({ marginLeftMm: Math.max(0, value) })} />
              <NumberControl label="Direita" value={current.marginRightMm ?? 0} min={0} step={0.5} onChange={(value) => update({ marginRightMm: Math.max(0, value) })} />
              <NumberControl label="Topo" value={current.marginTopMm ?? 0} min={0} step={0.5} onChange={(value) => update({ marginTopMm: Math.max(0, value) })} />
              <NumberControl label="Base" value={current.marginBottomMm ?? 0} min={0} step={0.5} onChange={(value) => update({ marginBottomMm: Math.max(0, value) })} />
            </div>

            <div className="grid grid-cols-[1fr_auto] items-end gap-2">
              <FontControl label="Fonte geral" value={current.fontFamily} onChange={(value) => update({ fontFamily: value })} />
              <div className="rounded-md border bg-muted/40 px-2 py-1.5 text-[10px] leading-tight text-muted-foreground">
                Arraste e redimensione no canvas.
              </div>
            </div>
          </div>

          {selected && (
            <>
              <div className="border-y px-3 py-2">
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  <SelectedIcon className="h-4 w-4 text-primary" />
                  {FIELD_LABELS[selected.key]}
                </div>
              </div>

              <div className="space-y-3 p-3">
                <div className="flex h-9 items-center justify-between rounded-md border px-3">
                  <span className="text-xs font-medium">Visivel</span>
                  <Switch checked={selected.visible} onCheckedChange={(value) => updateField(selected.key, { visible: value })} />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <NumberControl label="X" value={selected.x} step={0.5} onChange={(value) => updateField(selected.key, { x: value })} />
                  <NumberControl label="Y" value={selected.y} step={0.5} onChange={(value) => updateField(selected.key, { y: value })} />
                  <NumberControl label="Largura" value={selected.widthMm ?? 10} step={0.5} min={1} onChange={(value) => updateField(selected.key, { widthMm: value })} />
                  <NumberControl label="Altura" value={selected.heightMm ?? 5} step={0.5} min={1} onChange={(value) => updateField(selected.key, { heightMm: value })} />
                </div>

                <FontControl
                  label={selected.key === "ean" ? "Fonte do EAN" : selected.key === "barcode" ? "Fonte dos numeros" : "Fonte do campo"}
                  value={selected.fontFamily || current.fontFamily}
                  onChange={(value) => updateField(selected.key, { fontFamily: value })}
                />

                <div className="grid grid-cols-3 gap-2">
                  <NumberControl label="Tamanho" value={selected.fontSize} min={1} onChange={(value) => updateField(selected.key, { fontSize: value })} />
                  <SelectControl
                    label="Alinhar"
                    value={selected.align || "left"}
                    options={[
                      { value: "left", label: "Esq." },
                      { value: "center", label: "Centro" },
                      { value: "right", label: "Dir." },
                    ]}
                    onChange={(value) => updateField(selected.key, { align: value as LabelField["align"] })}
                  />
                  <div className="space-y-1">
                    <Label className="text-[10px] font-medium text-muted-foreground">Estilo</Label>
                    <Button
                      type="button"
                      variant={selected.bold ? "default" : "outline"}
                      className="h-8 w-full text-xs"
                      onClick={() => updateField(selected.key, { bold: !selected.bold })}
                    >
                      Negrito
                    </Button>
                  </div>
                </div>

                <div className="grid grid-cols-[1fr_72px] gap-2">
                  <div className="space-y-0.5">
                    <Label className="text-[10px] font-medium text-muted-foreground">Cor do texto</Label>
                    <Input
                      value={selected.color || "#000000"}
                      onChange={(e) => updateField(selected.key, { color: e.target.value })}
                      className="h-8 px-2 text-xs"
                    />
                  </div>
                  <input
                    type="color"
                    value={selected.color || "#000000"}
                    onChange={(e) => updateField(selected.key, { color: e.target.value })}
                    className="mt-[18px] h-8 w-full rounded-md border bg-background p-1"
                    aria-label="Cor do texto"
                  />
                </div>

                {selected.key === "barcode" && (
                  <div className="space-y-3 rounded-md border bg-background p-2">
                    <div className="grid grid-cols-2 gap-2">
                      <SelectControl
                        label="Tipo codigo"
                        value={selected.barcodeFormat || "auto"}
                        options={[...BARCODE_FORMATS]}
                        onChange={(value) => updateField(selected.key, { barcodeFormat: value as LabelField["barcodeFormat"] })}
                      />
                      <SelectControl
                        label="Numeros"
                        value={selected.barcodeDisplayValue === false ? "false" : "true"}
                        options={[
                          { value: "true", label: "Mostrar" },
                          { value: "false", label: "Ocultar" },
                        ]}
                        onChange={(value) => updateField(selected.key, { barcodeDisplayValue: value === "true" })}
                      />
                      <SelectControl
                        label="Posicao"
                        value={selected.barcodeTextPosition || "bottom"}
                        options={[
                          { value: "bottom", label: "Baixo" },
                          { value: "top", label: "Cima" },
                        ]}
                        onChange={(value) => updateField(selected.key, { barcodeTextPosition: value as LabelField["barcodeTextPosition"] })}
                      />
                      <NumberControl
                        label="Larg. barra"
                        value={selected.barcodeBarWidth ?? 1}
                        min={0.4}
                        step={0.1}
                        onChange={(value) => updateField(selected.key, { barcodeBarWidth: value })}
                      />
                    </div>

                    <div className="grid grid-cols-[1fr_72px] gap-2">
                      <div className="space-y-0.5">
                        <Label className="text-[10px] font-medium text-muted-foreground">Cor da barra</Label>
                        <Input
                          value={selected.barcodeLineColor || selected.color || "#000000"}
                          onChange={(e) => updateField(selected.key, { barcodeLineColor: e.target.value })}
                          className="h-8 px-2 text-xs"
                        />
                      </div>
                      <input
                        type="color"
                        value={selected.barcodeLineColor || selected.color || "#000000"}
                        onChange={(e) => updateField(selected.key, { barcodeLineColor: e.target.value })}
                        className="mt-[18px] h-8 w-full rounded-md border bg-background p-1"
                        aria-label="Cor da barra"
                      />
                    </div>
                  </div>
                )}

                <div className="space-y-1">
                  <Label className="text-xs">Prefixo</Label>
                  <Input
                    className="h-8 text-xs"
                    value={selected.label || ""}
                    placeholder="Ex.: R$"
                    onChange={(e) => updateField(selected.key, { label: e.target.value })}
                  />
                </div>

                <Button type="button" variant="outline" className="h-8 w-full text-xs" onClick={() => updateField(selected.key, { visible: false })}>
                  <EyeOff /> Ocultar campo
                </Button>
              </div>
            </>
          )}
        </aside>
      </div>
    </div>
  );
}
