import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { A4Template, A4Element } from "@/types/a4";

// ─── Tipos internos ────────────────────────────────────────────────────────────

type Layout = "1x1" | "1x2" | "2x2" | "4x4";

interface WizardFields {
  descricao: boolean;
  precoOriginal: boolean;
  precoVarejo: boolean;
  ean: boolean;
  foto: boolean;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onConfirm: (template: A4Template) => void;
}

// ─── Configurações de layout ──────────────────────────────────────────────────

const LAYOUTS: { id: Layout; label: string; sub: string; rows: number; cols: number }[] = [
  { id: "1x1", label: "1 cartaz por folha", sub: "Folha A4 inteira", rows: 1, cols: 1 },
  { id: "1x2", label: "2 cartazes por folha", sub: "Dois cartazes em coluna", rows: 2, cols: 1 },
  { id: "2x2", label: "4 cartazes por folha", sub: "Grade 2×2", rows: 2, cols: 2 },
  { id: "4x4", label: "16 cartazes por folha", sub: "Grade 4×4", rows: 4, cols: 4 },
];

// ─── Geração de elementos por layout + campos ─────────────────────────────────

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function buildElements(layout: Layout, fields: WizardFields): A4Element[] {
  // Área disponível do bloco (já descontado o padding) depende do layout.
  // Usamos posições relativas ao bloco (x,y dentro do espaço útil).

  const isLarge = layout === "1x1";
  const isMed = layout === "1x2";
  const isSmall = layout === "2x2";
  // 4x4 é mini

  const els: A4Element[] = [];

  if (isLarge) {
    // Bloco: ~200 × 287 mm útil
    let curY = 5;

    // Fundo vermelho topo
    els.push({ id: uid(), type: "shape", shapeKind: "rect", x: 0, y: 0, widthMm: 200, heightMm: 35, fillColor: "#e60000", strokeWidthMm: 0 });
    els.push({ id: uid(), type: "text", text: "OFERTA", x: 5, y: 5, widthMm: 190, heightMm: 25, fontSize: 72, bold: true, align: "center", color: "#ffffff", fontFamily: "Anton" });
    curY = 40;

    if (fields.foto) {
      els.push({ id: uid(), type: "dynamic", field: "imageUrl", x: 25, y: curY, widthMm: 150, heightMm: 110, align: "center" });
      curY += 115;
    }

    if (fields.descricao) {
      els.push({ id: uid(), type: "dynamic", field: "descricao", x: 5, y: curY, widthMm: 190, heightMm: 22, fontSize: 28, bold: true, align: "center", fontFamily: "Roboto" });
      curY += 25;
    }

    if (fields.precoOriginal) {
      els.push({ id: uid(), type: "dynamic", field: "precoOriginal", prefix: "De: R$ ", x: 5, y: curY, widthMm: 190, heightMm: 12, fontSize: 16, align: "center", color: "#888888" });
      curY += 14;
    }

    if (fields.precoVarejo) {
      els.push({ id: uid(), type: "dynamic", field: "precoVarejo", prefix: "R$ ", x: 5, y: curY, widthMm: 190, heightMm: 55, fontSize: 96, bold: true, align: "center", color: "#e60000", fontFamily: "Anton" });
      curY += 58;
    }

    if (fields.ean) {
      els.push({ id: uid(), type: "barcode", x: 60, y: curY, widthMm: 80, heightMm: 25, fontSize: 8, barcodeFormat: "auto", barcodeDisplayValue: true });
      curY += 28;
      els.push({ id: uid(), type: "dynamic", field: "ean", prefix: "EAN: ", x: 5, y: curY, widthMm: 190, heightMm: 8, fontSize: 9, align: "center", color: "#666666" });
    }

  } else if (isMed) {
    // Bloco: ~200 × ~135 mm útil
    let curY = 3;

    els.push({ id: uid(), type: "shape", shapeKind: "rect", x: 0, y: 0, widthMm: 200, heightMm: 22, fillColor: "#e60000", strokeWidthMm: 0 });
    els.push({ id: uid(), type: "text", text: "OFERTA", x: 5, y: 3, widthMm: 190, heightMm: 16, fontSize: 44, bold: true, align: "center", color: "#ffffff", fontFamily: "Anton" });
    curY = 25;

    if (fields.foto) {
      els.push({ id: uid(), type: "dynamic", field: "imageUrl", x: 35, y: curY, widthMm: 130, heightMm: 55, align: "center" });
      curY += 58;
    }

    if (fields.descricao) {
      els.push({ id: uid(), type: "dynamic", field: "descricao", x: 5, y: curY, widthMm: 190, heightMm: 14, fontSize: 18, bold: true, align: "center", fontFamily: "Roboto" });
      curY += 16;
    }

    if (fields.precoOriginal) {
      els.push({ id: uid(), type: "dynamic", field: "precoOriginal", prefix: "De: R$ ", x: 5, y: curY, widthMm: 190, heightMm: 8, fontSize: 11, align: "center", color: "#888888" });
      curY += 10;
    }

    if (fields.precoVarejo) {
      els.push({ id: uid(), type: "dynamic", field: "precoVarejo", prefix: "R$ ", x: 5, y: curY, widthMm: 190, heightMm: 30, fontSize: 56, bold: true, align: "center", color: "#e60000", fontFamily: "Anton" });
      curY += 33;
    }

    if (fields.ean) {
      els.push({ id: uid(), type: "barcode", x: 65, y: curY, widthMm: 70, heightMm: 18, fontSize: 7, barcodeFormat: "auto", barcodeDisplayValue: true });
      curY += 20;
      els.push({ id: uid(), type: "dynamic", field: "ean", x: 5, y: curY, widthMm: 190, heightMm: 6, fontSize: 8, align: "center", color: "#666666" });
    }

  } else if (isSmall) {
    // Bloco: ~90 × ~123 mm útil
    let curY = 2;

    els.push({ id: uid(), type: "shape", shapeKind: "rect", x: 0, y: 0, widthMm: 92, heightMm: 16, fillColor: "#e60000", strokeWidthMm: 0 });
    els.push({ id: uid(), type: "text", text: "OFERTA", x: 2, y: 2, widthMm: 88, heightMm: 12, fontSize: 28, bold: true, align: "center", color: "#ffffff", fontFamily: "Anton" });
    curY = 18;

    if (fields.foto) {
      els.push({ id: uid(), type: "dynamic", field: "imageUrl", x: 15, y: curY, widthMm: 62, heightMm: 42, align: "center" });
      curY += 44;
    }

    if (fields.descricao) {
      els.push({ id: uid(), type: "dynamic", field: "descricao", x: 2, y: curY, widthMm: 88, heightMm: 12, fontSize: 13, bold: true, align: "center", fontFamily: "Roboto" });
      curY += 14;
    }

    if (fields.precoOriginal) {
      els.push({ id: uid(), type: "dynamic", field: "precoOriginal", prefix: "De: R$ ", x: 2, y: curY, widthMm: 88, heightMm: 7, fontSize: 9, align: "center", color: "#888888" });
      curY += 8;
    }

    if (fields.precoVarejo) {
      els.push({ id: uid(), type: "dynamic", field: "precoVarejo", prefix: "R$ ", x: 2, y: curY, widthMm: 88, heightMm: 22, fontSize: 38, bold: true, align: "center", color: "#e60000", fontFamily: "Anton" });
      curY += 24;
    }

    if (fields.ean) {
      els.push({ id: uid(), type: "barcode", x: 22, y: curY, widthMm: 48, heightMm: 14, fontSize: 6, barcodeFormat: "auto", barcodeDisplayValue: true });
      curY += 15;
      els.push({ id: uid(), type: "dynamic", field: "ean", x: 2, y: curY, widthMm: 88, heightMm: 5, fontSize: 7, align: "center", color: "#666666" });
    }

  } else {
    // 4×4 — mini bloco ~43 × ~57 mm
    let curY = 2;

    if (fields.descricao) {
      els.push({ id: uid(), type: "dynamic", field: "descricao", x: 1, y: curY, widthMm: 41, heightMm: 8, fontSize: 9, bold: true, align: "left", fontFamily: "Roboto" });
      curY += 9;
    }

    if (fields.foto) {
      els.push({ id: uid(), type: "dynamic", field: "imageUrl", x: 8, y: curY, widthMm: 27, heightMm: 18, align: "center" });
      curY += 19;
    }

    if (fields.precoOriginal) {
      els.push({ id: uid(), type: "dynamic", field: "precoOriginal", prefix: "De: R$ ", x: 1, y: curY, widthMm: 41, heightMm: 5, fontSize: 7, align: "center", color: "#888888" });
      curY += 6;
    }

    if (fields.precoVarejo) {
      els.push({ id: uid(), type: "dynamic", field: "precoVarejo", prefix: "R$ ", x: 1, y: curY, widthMm: 41, heightMm: 14, fontSize: 22, bold: true, align: "center", color: "#e60000", fontFamily: "Anton" });
      curY += 15;
    }

    if (fields.ean) {
      els.push({ id: uid(), type: "dynamic", field: "ean", x: 1, y: curY, widthMm: 41, heightMm: 5, fontSize: 6, align: "center", color: "#666666" });
    }
  }

  return els;
}

function buildTemplate(layout: Layout, fields: WizardFields, name: string): A4Template {
  const cfg = LAYOUTS.find((l) => l.id === layout)!;

  const marginMap: Record<Layout, number> = { "1x1": 0, "1x2": 0, "2x2": 8, "4x4": 5 };
  const gapMap: Record<Layout, number> = { "1x1": 0, "1x2": 0, "2x2": 4, "4x4": 2 };
  const padMap: Record<Layout, number> = { "1x1": 5, "1x2": 5, "2x2": 4, "4x4": 2 };

  const m = marginMap[layout];
  const g = gapMap[layout];

  return {
    id: `a4-wizard-${Date.now()}`,
    name: name || `${cfg.label}`,
    rows: cfg.rows,
    cols: cfg.cols,
    marginTop: m,
    marginBottom: m,
    marginLeft: m,
    marginRight: m,
    rowGap: g,
    colGap: g,
    blocks: cfg.rows * cfg.cols,
    paddingMm: padMap[layout],
    showBorder: layout !== "1x1",
    elements: buildElements(layout, fields),
  };
}

// ─── Toggle switch simples ────────────────────────────────────────────────────

function Toggle({ label, sub, checked, onChange }: { label: string; sub?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={`flex w-full items-center justify-between rounded-lg border px-3 py-2.5 text-left transition-colors ${checked ? "border-primary bg-primary/5" : "border-border bg-muted/30 opacity-60"}`}
    >
      <div>
        <div className="text-sm font-medium">{label}</div>
        {sub && <div className="text-[11px] text-muted-foreground">{sub}</div>}
      </div>
      <div className={`relative h-5 w-9 rounded-full transition-colors ${checked ? "bg-primary" : "bg-muted-foreground/30"}`}>
        <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${checked ? "translate-x-4" : "translate-x-0.5"}`} />
      </div>
    </button>
  );
}

// ─── Wizard ───────────────────────────────────────────────────────────────────

export function A4NewTemplateWizard({ open, onClose, onConfirm }: Props) {
  const [layout, setLayout] = useState<Layout>("1x1");
  const [fields, setFields] = useState<WizardFields>({
    descricao: true,
    precoOriginal: false,
    precoVarejo: true,
    ean: true,
    foto: false,
  });
  const [name, setName] = useState("");

  const toggleField = (k: keyof WizardFields) => setFields((f) => ({ ...f, [k]: !f[k] }));

  const handleConfirm = () => {
    const tpl = buildTemplate(layout, fields, name);
    onConfirm(tpl);
    // reset
    setLayout("1x1");
    setFields({ descricao: true, precoOriginal: false, precoVarejo: true, ean: true, foto: false });
    setName("");
  };

  const selectedLayout = LAYOUTS.find((l) => l.id === layout)!;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Novo modelo de cartaz</DialogTitle>
        </DialogHeader>

        <div className="space-y-5 py-1">
          {/* Layout */}
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Quantos cartazes por folha A4?</p>
            <div className="grid grid-cols-2 gap-2">
              {LAYOUTS.map((l) => (
                <button
                  key={l.id}
                  type="button"
                  onClick={() => setLayout(l.id)}
                  className={`rounded-lg border p-3 text-left transition-colors ${layout === l.id ? "border-primary bg-primary/5 ring-1 ring-primary" : "border-border hover:bg-muted/50"}`}
                >
                  <div className="text-sm font-semibold">{l.label}</div>
                  <div className="text-[11px] text-muted-foreground">{l.sub}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Campos */}
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Quais campos incluir?</p>
            <div className="space-y-2">
              <Toggle label="Descrição do produto" checked={fields.descricao} onChange={() => toggleField("descricao")} />
              <Toggle label='Preço "De"' sub="Preço antigo riscado (opcional)" checked={fields.precoOriginal} onChange={() => toggleField("precoOriginal")} />
              <Toggle label='Preço "Por"' sub="Preço de venda atual" checked={fields.precoVarejo} onChange={() => toggleField("precoVarejo")} />
              <Toggle label="Código de barras / EAN" checked={fields.ean} onChange={() => toggleField("ean")} />
              <Toggle label="Foto do produto" sub="Imagem vinda do ERP" checked={fields.foto} onChange={() => toggleField("foto")} />
            </div>
          </div>

          {/* Nome */}
          <div>
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Nome do modelo (opcional)</p>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={selectedLayout.label}
              className="h-9 text-sm"
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleConfirm} disabled={!fields.descricao && !fields.precoVarejo && !fields.ean && !fields.foto && !fields.precoOriginal}>
            Criar modelo
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
