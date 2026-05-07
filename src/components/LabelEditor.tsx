import { useMemo, useState } from "react";
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
  Bold,
  Columns3,
  DollarSign,
  Download,
  Eye,
  EyeOff,
  FileText,
  Grid3x3,
  Hash,
  Layers3,
  LayoutGrid,
  Maximize2,
  MousePointer2,
  Palette,
  Plus,
  Ruler,
  Save,
  
  Square,
  Tags,
  Trash2,
  Type,
  Upload,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { cn } from "@/lib/utils";

const FIELD_LABELS: Record<LabelFieldKey, string> = {
  descricao: "Descrição",
  precoVarejo: "Preço Varejo",
  precoAtacado: "Preço Atacado",
  ean: "EAN",
  barcode: "Código de Barras",
  secao: "Seção",
  estoque: "Estoque",
  codigoInterno: "Código Interno",
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

const COLUMN_PRESETS = [
  { columns: 1, label: "1 col", icon: Square },
  { columns: 2, label: "2 col", icon: Columns3 },
  { columns: 3, label: "3 col", icon: Grid3x3 },
  { columns: 4, label: "4 col", icon: LayoutGrid },
];

const SHEET_PRESETS = [
  { name: "40 × 30 mm", widthMm: 40, heightMm: 30 },
  { name: "60 × 40 mm", widthMm: 60, heightMm: 40 },
  { name: "100 × 50 mm", widthMm: 100, heightMm: 50 },
  { name: "33 × 22 mm", widthMm: 33, heightMm: 22 },
];

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
  suffix,
}: {
  label: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onChange: (value: number) => void;
  suffix?: string;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{label}</Label>
      <div className="relative">
        <Input
          type="number"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="h-8 px-2 pr-7 text-xs"
        />
        {suffix && (
          <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground">
            {suffix}
          </span>
        )}
      </div>
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
    <div className="space-y-1">
      <Label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{label}</Label>
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
    <div className="space-y-1">
      <Label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{label}</Label>
      <Input
        list="label-font-options"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-8 px-2 text-xs"
      />
    </div>
  );
}

function Section({
  icon: Icon,
  title,
  children,
  defaultOpen = true,
}: {
  icon: React.ElementType;
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b last:border-b-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-3 py-2 text-left transition-colors hover:bg-muted/40"
      >
        <span className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          <Icon className="h-3.5 w-3.5 text-primary" />
          {title}
        </span>
        <span className="text-[10px] text-muted-foreground">{open ? "−" : "+"}</span>
      </button>
      {open && <div className="space-y-3 px-3 pb-3 pt-1">{children}</div>}
    </div>
  );
}

const MM_TO_PX = 3.78;

export function LabelEditor({ templates, activeId, onChange }: Props) {
  const [local, setLocal] = useState<LabelTemplate[]>(templates.map(normalizeTemplate));
  const [currentId, setCurrentId] = useState(activeId);
  const [selectedField, setSelectedField] = useState<LabelFieldKey | null>("barcode");
  const [zoom, setZoom] = useState(1.4);
  const [previewMode, setPreviewMode] = useState<"single" | "sheet">("single");
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
      toast.error("Arquivo inválido");
    }
  };

  const cols = Math.max(1, current.columns || 1);
  const sheetWidthMm =
    cols * current.widthMm +
    (cols - 1) * (current.columnGapMm ?? 0) +
    (current.marginLeftMm ?? 0) +
    (current.marginRightMm ?? 0);

  // Sheet preview rows (2 lines for visualization)
  const sheetRows = 2;

  const sheetCells = useMemo(
    () => Array.from({ length: cols * sheetRows }),
    [cols],
  );

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-lg border bg-background shadow-sm">
      <datalist id="label-font-options">
        {FONT_OPTIONS.map((font) => (
          <option key={font} value={font} />
        ))}
      </datalist>

      {/* TOP BAR */}
      <div className="flex h-12 shrink-0 items-center justify-between border-b bg-card px-3">
        <div className="flex min-w-0 items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10 text-primary">
            <Tags className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold leading-tight">Editor de Etiqueta</p>
            <p className="text-[11px] text-muted-foreground">
              {current.widthMm} × {current.heightMm} mm · {cols} {cols > 1 ? "colunas" : "coluna"} · folha {sheetWidthMm.toFixed(0)} mm
            </p>
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

      <div className="grid min-h-0 flex-1 grid-cols-[260px_minmax(360px,1fr)_320px]">
        {/* LEFT PANEL: layers */}
        <aside className="flex min-h-0 flex-col border-r bg-card/70">
          <div className="flex items-center justify-between border-b px-3 py-2">
            <span className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              <Layers3 className="h-3.5 w-3.5 text-primary" />
              Camadas
            </span>
          </div>

          <div className="flex-1 overflow-auto p-2">
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
                    active
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-transparent hover:border-border hover:bg-muted/60",
                    !field.visible && "opacity-50"
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-medium">{FIELD_LABELS[field.key]}</span>
                    <span className="block truncate text-[10px] text-muted-foreground">
                      {field.x}, {field.y} · {Math.round(field.widthMm ?? 0)}×{Math.round(field.heightMm ?? 0)}mm
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
                    {field.visible ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="grid shrink-0 grid-cols-2 gap-2 border-t p-3">
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
        </aside>

        {/* CANVAS */}
        <main className="flex min-h-0 flex-col bg-muted/30">
          {/* Canvas toolbar */}
          <div className="flex h-10 shrink-0 items-center justify-between border-b bg-card/80 px-3">
            <div className="flex items-center gap-1 rounded-md border bg-background p-0.5">
              <button
                type="button"
                onClick={() => setPreviewMode("single")}
                className={cn(
                  "flex items-center gap-1.5 rounded px-2.5 py-1 text-[11px] font-medium transition-colors",
                  previewMode === "single" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                )}
              >
                <Square className="h-3 w-3" /> Etiqueta
              </button>
              <button
                type="button"
                onClick={() => setPreviewMode("sheet")}
                className={cn(
                  "flex items-center gap-1.5 rounded px-2.5 py-1 text-[11px] font-medium transition-colors",
                  previewMode === "sheet" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                )}
              >
                <LayoutGrid className="h-3 w-3" /> Folha ({cols} col)
              </button>
            </div>

            <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
              <MousePointer2 className="h-3 w-3" />
              {selected ? FIELD_LABELS[selected.key] : "Selecione um campo"}
            </div>

            <div className="flex items-center gap-1">
              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setZoom((z) => Math.max(0.5, z - 0.2))}>
                <ZoomOut className="h-3.5 w-3.5" />
              </Button>
              <span className="w-12 text-center text-[11px] tabular-nums text-muted-foreground">{Math.round(zoom * 100)}%</span>
              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setZoom((z) => Math.min(3, z + 0.2))}>
                <ZoomIn className="h-3.5 w-3.5" />
              </Button>
              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setZoom(1.4)} title="Ajustar">
                <Maximize2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>

          {/* Canvas area with checkerboard */}
          <div
            className="min-h-0 flex-1 overflow-auto"
            style={{
              backgroundImage:
                "linear-gradient(45deg, hsl(var(--muted)) 25%, transparent 25%), linear-gradient(-45deg, hsl(var(--muted)) 25%, transparent 25%), linear-gradient(45deg, transparent 75%, hsl(var(--muted)) 75%), linear-gradient(-45deg, transparent 75%, hsl(var(--muted)) 75%)",
              backgroundSize: "20px 20px",
              backgroundPosition: "0 0, 0 10px, 10px -10px, -10px 0",
            }}
          >
            <div className="flex min-h-full items-start justify-center p-8">
              <div style={{ transform: `scale(${zoom})`, transformOrigin: "top center" }}>
                {previewMode === "single" ? (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between rounded-md border bg-card px-3 py-1 text-[10px] text-muted-foreground shadow-sm">
                      <span>Edição</span>
                      <span>{current.widthMm} × {current.heightMm} mm</span>
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
                ) : (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between rounded-md border bg-card px-3 py-1 text-[10px] text-muted-foreground shadow-sm">
                      <span>Visualização da folha · {cols} × {sheetRows}</span>
                      <span>Espaçamento {current.columnGapMm ?? 0} / {current.rowGapMm ?? 0} mm</span>
                    </div>
                    <div
                      className="rounded-sm border-2 border-dashed border-primary/40 bg-white"
                      style={{
                        padding: `${current.marginTopMm ?? 0}mm ${current.marginRightMm ?? 0}mm ${current.marginBottomMm ?? 0}mm ${current.marginLeftMm ?? 0}mm`,
                      }}
                    >
                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: `repeat(${cols}, ${current.widthMm}mm)`,
                          columnGap: `${current.columnGapMm ?? 0}mm`,
                          rowGap: `${current.rowGapMm ?? 0}mm`,
                        }}
                      >
                        {sheetCells.map((_, i) => (
                          <div key={i} style={{ width: `${current.widthMm}mm`, height: `${current.heightMm}mm` }}>
                            <LabelPreview template={current} product={null} forPrint={false} />
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </main>

        {/* RIGHT PANEL: properties */}
        <aside className="min-h-0 overflow-auto border-l bg-card/80">
          <Section icon={FileText} title="Modelo">
            <div className="space-y-1">
              <Label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Nome</Label>
              <Input className="h-8 text-xs" value={current.name} onChange={(e) => update({ name: e.target.value })} />
            </div>

            <div>
              <Label className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                Tamanhos rápidos
              </Label>
              <div className="grid grid-cols-2 gap-1.5">
                {SHEET_PRESETS.map((p) => (
                  <button
                    key={p.name}
                    type="button"
                    onClick={() => update({ widthMm: p.widthMm, heightMm: p.heightMm })}
                    className={cn(
                      "rounded-md border px-2 py-1.5 text-[11px] transition-colors hover:border-primary hover:text-primary",
                      current.widthMm === p.widthMm && current.heightMm === p.heightMm
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border"
                    )}
                  >
                    {p.name}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <NumberControl label="Largura" suffix="mm" value={current.widthMm} min={1} step={0.5} onChange={(value) => update({ widthMm: value })} />
              <NumberControl label="Altura" suffix="mm" value={current.heightMm} min={1} step={0.5} onChange={(value) => update({ heightMm: value })} />
            </div>

            <FontControl label="Fonte padrão" value={current.fontFamily} onChange={(value) => update({ fontFamily: value })} />
          </Section>

          <Section icon={LayoutGrid} title="Folha & Colunas">
            <div>
              <Label className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                Layout de colunas
              </Label>
              <div className="grid grid-cols-4 gap-1.5">
                {COLUMN_PRESETS.map((p) => {
                  const Icon = p.icon;
                  const active = (current.columns || 1) === p.columns;
                  return (
                    <button
                      key={p.columns}
                      type="button"
                      onClick={() => update({ columns: p.columns })}
                      className={cn(
                        "flex flex-col items-center gap-1 rounded-md border py-2 text-[10px] transition-colors hover:border-primary",
                        active ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground"
                      )}
                      title={`${p.columns} colunas`}
                    >
                      <Icon className="h-4 w-4" />
                      {p.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <NumberControl
                label="Colunas"
                value={current.columns || 1}
                min={1}
                max={8}
                onChange={(value) => update({ columns: Math.max(1, value) })}
              />
              <NumberControl
                label="Esp. H"
                suffix="mm"
                value={current.columnGapMm ?? 0}
                min={0}
                step={0.5}
                onChange={(value) => update({ columnGapMm: Math.max(0, value) })}
              />
              <NumberControl
                label="Esp. V"
                suffix="mm"
                value={current.rowGapMm ?? 0}
                min={0}
                step={0.5}
                onChange={(value) => update({ rowGapMm: Math.max(0, value) })}
              />
            </div>

            <div className="rounded-md bg-primary/5 px-2.5 py-1.5 text-[10px] leading-relaxed text-muted-foreground">
              Folha total: <strong className="text-foreground">{sheetWidthMm.toFixed(1)} mm</strong> de largura.
              Veja como ficará impresso na aba <strong>Folha</strong>.
            </div>
          </Section>

          <Section icon={Ruler} title="Margens da folha" defaultOpen={false}>
            <div className="grid grid-cols-2 gap-2">
              <NumberControl label="Esquerda" suffix="mm" value={current.marginLeftMm ?? 0} min={0} step={0.5} onChange={(value) => update({ marginLeftMm: Math.max(0, value) })} />
              <NumberControl label="Direita" suffix="mm" value={current.marginRightMm ?? 0} min={0} step={0.5} onChange={(value) => update({ marginRightMm: Math.max(0, value) })} />
              <NumberControl label="Topo" suffix="mm" value={current.marginTopMm ?? 0} min={0} step={0.5} onChange={(value) => update({ marginTopMm: Math.max(0, value) })} />
              <NumberControl label="Base" suffix="mm" value={current.marginBottomMm ?? 0} min={0} step={0.5} onChange={(value) => update({ marginBottomMm: Math.max(0, value) })} />
            </div>
          </Section>

          {selected && (
            <Section icon={SelectedIcon} title={`Campo: ${FIELD_LABELS[selected.key]}`}>
              <div className="flex h-9 items-center justify-between rounded-md border bg-background px-3">
                <span className="text-xs font-medium">Visível</span>
                <Switch checked={selected.visible} onCheckedChange={(value) => updateField(selected.key, { visible: value })} />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <NumberControl label="X" suffix="mm" value={selected.x} step={0.5} onChange={(value) => updateField(selected.key, { x: value })} />
                <NumberControl label="Y" suffix="mm" value={selected.y} step={0.5} onChange={(value) => updateField(selected.key, { y: value })} />
                <NumberControl label="Largura" suffix="mm" value={selected.widthMm ?? 10} step={0.5} min={1} onChange={(value) => updateField(selected.key, { widthMm: value })} />
                <NumberControl label="Altura" suffix="mm" value={selected.heightMm ?? 5} step={0.5} min={1} onChange={(value) => updateField(selected.key, { heightMm: value })} />
              </div>

              <FontControl
                label={selected.key === "barcode" ? "Fonte dos números" : "Fonte"}
                value={selected.fontFamily || current.fontFamily}
                onChange={(value) => updateField(selected.key, { fontFamily: value })}
              />

              <div className="grid grid-cols-3 gap-2">
                <NumberControl label="Tamanho" suffix="pt" value={selected.fontSize} min={1} onChange={(value) => updateField(selected.key, { fontSize: value })} />
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
                  <Label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Estilo</Label>
                  <Button
                    type="button"
                    variant={selected.bold ? "default" : "outline"}
                    className="h-8 w-full text-xs"
                    onClick={() => updateField(selected.key, { bold: !selected.bold })}
                  >
                    <Bold className="h-3 w-3" />
                  </Button>
                </div>
              </div>

              <div>
                <Label className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  <span className="inline-flex items-center gap-1"><Palette className="h-3 w-3" /> Cor</span>
                </Label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={selected.color || "#000000"}
                    onChange={(e) => updateField(selected.key, { color: e.target.value })}
                    className="h-8 w-10 cursor-pointer rounded-md border bg-background p-1"
                    aria-label="Cor"
                  />
                  <Input
                    value={selected.color || "#000000"}
                    onChange={(e) => updateField(selected.key, { color: e.target.value })}
                    className="h-8 flex-1 px-2 text-xs"
                  />
                </div>
              </div>

              {selected.key === "barcode" && (
                <div className="space-y-2 rounded-md border bg-background p-2">
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Opções do código
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <SelectControl
                      label="Tipo"
                      value={selected.barcodeFormat || "auto"}
                      options={[...BARCODE_FORMATS]}
                      onChange={(value) => updateField(selected.key, { barcodeFormat: value as LabelField["barcodeFormat"] })}
                    />
                    <SelectControl
                      label="Números"
                      value={selected.barcodeDisplayValue === false ? "false" : "true"}
                      options={[
                        { value: "true", label: "Mostrar" },
                        { value: "false", label: "Ocultar" },
                      ]}
                      onChange={(value) => updateField(selected.key, { barcodeDisplayValue: value === "true" })}
                    />
                    <SelectControl
                      label="Posição"
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
                </div>
              )}

              <div className="space-y-1">
                <Label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Prefixo</Label>
                <Input
                  className="h-8 text-xs"
                  value={selected.label || ""}
                  placeholder="Ex.: R$"
                  onChange={(e) => updateField(selected.key, { label: e.target.value })}
                />
              </div>
            </Section>
          )}
        </aside>
      </div>
    </div>
  );
}
