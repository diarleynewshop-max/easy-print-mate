import { useRef, useState, useMemo } from "react";
import { Product, VFConfig } from "@/types/label";
import { fetchProductByEan, VFError } from "@/api/varejoFacil";
import { a4Storage } from "@/services/a4Storage";
import { downloadA4Pdf, printA4Pdf } from "@/services/a4PdfService";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";
import {
  Tag,
  Loader2,
  Percent,
  DollarSign,
  Trash2,
  Download,
  Printer,
  Lock,
  CheckCircle2,
  AlertTriangle,
  ChevronDown,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  config: VFConfig;
}

type RoundMode = "up" | "down" | "half";
type DiscountType = "percent" | "value";
type FillMode = "repeat" | "sequential";

interface PromoItem {
  id: string;
  product: Product;
  precoOriginal: number;
  precoOferta: number;
  updating: boolean;
  updated: boolean;
  error?: string;
}

const AUTH_LOGIN = "ADMIN";
const AUTH_SENHA = "ADMIN";

function applyRounding(price: number, mode: RoundMode): number {
  if (mode === "up") return Math.ceil(price);
  if (mode === "down") return Math.floor(price);
  return Math.round(price * 2) / 2;
}

function calcPromoPrice(basePrice: number, discountType: DiscountType, discountValue: number, roundMode: RoundMode): number {
  let raw: number;
  if (discountType === "percent") {
    raw = basePrice * (1 - discountValue / 100);
  } else {
    raw = basePrice - discountValue;
  }
  return Math.max(0.01, applyRounding(raw, roundMode));
}

function fmtBRL(v?: number) {
  if (v == null || isNaN(v)) return "—";
  return `R$ ${v.toFixed(2).replace(".", ",")}`;
}

function buildPromoProduct(product: Product, precoOriginal: number, precoOferta: number, descricao?: string): Product {
  return { ...product, precoOriginal, precoVarejo: precoOferta, descricao: descricao ?? product.descricao };
}

async function doPrintA4(products: Product[], templateId: string, fillMode: FillMode, config: VFConfig) {
  const templates = a4Storage.getTemplates();
  const template = templates.find((t) => t.id === templateId) || templates[0];
  if (!template) { toast.error("Nenhum modelo A4 configurado"); return; }

  const blocksPerPage = template.rows * template.cols;
  let toRender: Product[];

  if (fillMode === "repeat" && products.length > 0) {
    toRender = Array.from({ length: blocksPerPage }, (_, i) =>
      products[i % products.length]
    );
  } else {
    toRender = products;
  }

  const printerName = config.a4PrinterName || "";
  try {
    if (printerName && window.easyPrint?.isDesktop) {
      await printA4Pdf(template, toRender, printerName);
      toast.success(`Impresso em ${printerName}`);
    } else {
      downloadA4Pdf(template, toRender, "promo-a4.pdf");
      toast.success("PDF salvo");
    }
  } catch (e) {
    toast.error("Erro ao gerar PDF: " + (e instanceof Error ? e.message : String(e)));
  }
}

// ---- Auth Gate ----

function AuthGate({ onAuth }: { onAuth: () => void }) {
  const [login, setLogin] = useState("");
  const [senha, setSenha] = useState("");
  const [err, setErr] = useState(false);

  const submit = () => {
    if (login.toUpperCase() === AUTH_LOGIN && senha.toUpperCase() === AUTH_SENHA) {
      onAuth();
    } else {
      setErr(true);
    }
  };

  return (
    <div className="flex h-full items-center justify-center p-8">
      <div className="w-full max-w-sm rounded-xl border bg-card p-8 shadow-sm space-y-5">
        <div className="flex flex-col items-center gap-2">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <Lock className="h-6 w-6 text-primary" />
          </div>
          <h2 className="text-lg font-bold">Acesso Restrito</h2>
          <p className="text-xs text-muted-foreground text-center">
            Cadastro de preço de oferta requer autenticação
          </p>
        </div>
        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Login</label>
            <Input
              value={login}
              onChange={(e) => { setLogin(e.target.value); setErr(false); }}
              onKeyDown={(e) => e.key === "Enter" && submit()}
              placeholder="Login"
              autoFocus
            />
          </div>
          <div>
            <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Senha</label>
            <Input
              type="password"
              value={senha}
              onChange={(e) => { setSenha(e.target.value); setErr(false); }}
              onKeyDown={(e) => e.key === "Enter" && submit()}
              placeholder="Senha"
            />
          </div>
          {err && (
            <p className="text-xs text-destructive flex items-center gap-1">
              <AlertTriangle className="h-3 w-3" /> Login ou senha inválidos
            </p>
          )}
          <Button className="w-full" onClick={submit}>Entrar</Button>
        </div>
      </div>
    </div>
  );
}

// ---- Print Options Bar ----

function PrintOptionsBar({
  templateId, setTemplateId, fillMode, setFillMode,
}: {
  templateId: string;
  setTemplateId: (id: string) => void;
  fillMode: FillMode;
  setFillMode: (m: FillMode) => void;
}) {
  const templates = a4Storage.getTemplates();
  const active = templates.find((t) => t.id === templateId) || templates[0];
  const blocksPerPage = active ? active.rows * active.cols : 1;

  return (
    <div className="flex flex-wrap items-center gap-2 border-b bg-muted/20 px-4 py-2 text-xs">
      <span className="font-medium text-muted-foreground uppercase tracking-wide">Modelo A4:</span>
      <div className="relative">
        <select
          className="h-8 rounded border bg-background px-2 pr-7 text-xs appearance-none cursor-pointer"
          value={templateId}
          onChange={(e) => setTemplateId(e.target.value)}
        >
          {templates.map((t) => (
            <option key={t.id} value={t.id}>{t.name} ({t.rows}×{t.cols})</option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
      </div>

      {blocksPerPage > 1 && (
        <>
          <span className="font-medium text-muted-foreground uppercase tracking-wide ml-2">Preencher {blocksPerPage} espaços:</span>
          <div className="flex rounded border overflow-hidden">
            <button
              onClick={() => setFillMode("repeat")}
              className={cn("px-3 py-1.5 text-xs font-medium transition-colors", fillMode === "repeat" ? "bg-primary text-primary-foreground" : "hover:bg-accent")}
            >
              Repetir produto
            </button>
            <button
              onClick={() => setFillMode("sequential")}
              className={cn("px-3 py-1.5 text-xs font-medium transition-colors", fillMode === "sequential" ? "bg-primary text-primary-foreground" : "hover:bg-accent")}
            >
              1 cartaz/produto
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// ---- Shared subcomponents ----

function RoundPicker({ value, onChange }: { value: RoundMode; onChange: (v: RoundMode) => void }) {
  const opts: { v: RoundMode; label: string }[] = [
    { v: "up", label: "Para cima" },
    { v: "down", label: "Para baixo" },
    { v: "half", label: "R$ 0,50" },
  ];
  return (
    <div className="flex gap-1.5">
      {opts.map((o) => (
        <button
          key={o.v}
          onClick={() => onChange(o.v)}
          className={cn(
            "flex-1 rounded-md border py-1.5 text-xs font-medium transition-colors",
            value === o.v ? "border-primary bg-primary text-primary-foreground" : "hover:bg-accent",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function DiscountInput({
  discountType, setDiscountType, discountValue, setDiscountValue,
}: {
  discountType: DiscountType; setDiscountType: (v: DiscountType) => void;
  discountValue: string; setDiscountValue: (v: string) => void;
}) {
  return (
    <div className="flex gap-2">
      <div className="flex rounded-md border overflow-hidden">
        <button
          onClick={() => setDiscountType("percent")}
          className={cn("flex items-center gap-1 px-3 py-2 text-xs font-medium transition-colors", discountType === "percent" ? "bg-primary text-primary-foreground" : "hover:bg-accent")}
        >
          <Percent className="h-3 w-3" /> %
        </button>
        <button
          onClick={() => setDiscountType("value")}
          className={cn("flex items-center gap-1 px-3 py-2 text-xs font-medium transition-colors", discountType === "value" ? "bg-primary text-primary-foreground" : "hover:bg-accent")}
        >
          <DollarSign className="h-3 w-3" /> R$
        </button>
      </div>
      <Input
        type="number"
        min={0}
        step={discountType === "percent" ? 1 : 0.01}
        placeholder={discountType === "percent" ? "Ex: 20" : "Ex: 5,00"}
        value={discountValue}
        onChange={(e) => setDiscountValue(e.target.value)}
        className="flex-1"
      />
    </div>
  );
}

function PromoPreview({ original, promo }: { original: number; promo: number }) {
  return (
    <div className="rounded-lg border-2 border-primary/30 bg-primary/5 p-4 text-center space-y-1">
      <p className="text-xs text-muted-foreground uppercase tracking-wide">Prévia do cartaz</p>
      <p className="text-sm text-muted-foreground line-through">{fmtBRL(original)}</p>
      <p className="text-3xl font-black text-primary">{fmtBRL(promo)}</p>
      <p className="text-xs text-muted-foreground">
        DE <strong>{fmtBRL(original)}</strong> por <strong>{fmtBRL(promo)}</strong>
        {" "}({((1 - promo / original) * 100).toFixed(0)}% off)
      </p>
    </div>
  );
}

// ---- Individual Tab ----

function IndividualTab({ config, templateId, fillMode }: { config: VFConfig; templateId: string; fillMode: FillMode }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [product, setProduct] = useState<Product | null>(null);
  const [editedDesc, setEditedDesc] = useState("");
  const [discountType, setDiscountType] = useState<DiscountType>("percent");
  const [discountValue, setDiscountValue] = useState("20");
  const [roundMode, setRoundMode] = useState<RoundMode>("half");
  const [updating, setUpdating] = useState(false);
  const [printing, setPrinting] = useState(false);

  const precoBase = product?.precoVarejo ?? 0;
  const discNum = parseFloat(discountValue.replace(",", ".")) || 0;
  const promoPrice = useMemo(
    () => (product && precoBase > 0 && discNum > 0 ? calcPromoPrice(precoBase, discountType, discNum, roundMode) : 0),
    [product, precoBase, discountType, discNum, roundMode],
  );

  const search = async () => {
    const q = code.trim();
    if (!q) return;
    setLoading(true);
    setProduct(null);
    try {
      const p = await fetchProductByEan(config, q);
      setProduct(p);
      setEditedDesc(p.descricao || "");
    } catch (e) {
      toast.error(e instanceof VFError ? e.message : "Produto não encontrado");
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  };

  const handleUpdate = async () => {
    if (!product || promoPrice <= 0) return;
    setUpdating(true);
    try {
      if (window.easyPrint?.isDesktop) {
        await window.easyPrint.erpUpdatePromo(config, product.id as string, null, promoPrice);
        toast.success(`Preço de oferta atualizado: ${fmtBRL(promoPrice)}`);
        await window.easyPrint.dbSyncProducts([buildPromoProduct(product, precoBase, promoPrice, editedDesc)]);
      } else {
        toast.info("ERP não disponível no modo browser");
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Erro ao atualizar ERP";
      try { const parsed = JSON.parse(msg); toast.error(parsed.message || msg); } catch { toast.error(msg); }
    } finally {
      setUpdating(false);
    }
  };

  const handlePrintA4 = async () => {
    if (!product || promoPrice <= 0) return;
    setPrinting(true);
    await doPrintA4([buildPromoProduct(product, precoBase, promoPrice, editedDesc)], templateId, fillMode, config);
    setPrinting(false);
  };

  return (
    <div className="space-y-4 p-4 max-w-xl mx-auto">
      <div className="flex gap-2">
        <Input
          ref={inputRef}
          value={code}
          onChange={(e) => setCode(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && search()}
          placeholder="Bipe ou digite o código de barras..."
          className="font-mono text-base"
          autoFocus
        />
        <Button onClick={search} disabled={loading} className="shrink-0">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Tag className="h-4 w-4" />}
        </Button>
      </div>

      {product && (
        <>
          <div className="rounded-lg border bg-card p-4 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0 space-y-1.5">
                <p className="text-xs font-mono text-muted-foreground">{product.ean}</p>
                <div>
                  <label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Descrição no cartaz</label>
                  <Input
                    value={editedDesc}
                    onChange={(e) => setEditedDesc(e.target.value)}
                    className="h-8 text-sm font-medium mt-0.5"
                    placeholder="Edite a descrição para o cartaz..."
                  />
                </div>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-xs text-muted-foreground">Preço de venda</p>
                <p className="text-2xl font-black text-primary">{fmtBRL(product.precoVarejo)}</p>
              </div>
            </div>
          </div>

          <div className="rounded-lg border bg-card p-4 space-y-3">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Qual preço de oferta?</p>
            <DiscountInput
              discountType={discountType}
              setDiscountType={setDiscountType}
              discountValue={discountValue}
              setDiscountValue={setDiscountValue}
            />
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-1.5">Arredondamento</p>
              <RoundPicker value={roundMode} onChange={setRoundMode} />
            </div>
          </div>

          {promoPrice > 0 && (
            <>
              <PromoPreview original={precoBase} promo={promoPrice} />
              <div className="flex gap-2">
                <Button onClick={handleUpdate} disabled={updating} className="flex-1">
                  {updating ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                  Atualizar ERP
                </Button>
                <Button onClick={handlePrintA4} disabled={printing} variant="secondary" className="flex-1">
                  {printing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                  Catálogo A4
                </Button>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}

// ---- Lote Tab ----

function LoteTab({ config, templateId, fillMode }: { config: VFConfig; templateId: string; fillMode: FillMode }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [discountType, setDiscountType] = useState<DiscountType>("percent");
  const [discountValue, setDiscountValue] = useState("20");
  const [roundMode, setRoundMode] = useState<RoundMode>("half");
  const [items, setItems] = useState<PromoItem[]>([]);
  const [updatingAll, setUpdatingAll] = useState(false);
  const [printing, setPrinting] = useState(false);

  const discNum = parseFloat(discountValue.replace(",", ".")) || 0;

  const computedItems = useMemo(() =>
    items.map((item) => ({
      ...item,
      precoOferta: discNum > 0 ? calcPromoPrice(item.precoOriginal, discountType, discNum, roundMode) : item.precoOriginal,
    })),
    [items, discountType, discNum, roundMode],
  );

  const search = async () => {
    const q = code.trim();
    if (!q) return;
    setLoading(true);
    try {
      const p = await fetchProductByEan(config, q);
      const precoBase = p.precoVarejo ?? 0;
      setItems((prev) => {
        if (prev.find((x) => x.product.ean === p.ean)) {
          toast.info("Item já adicionado");
          return prev;
        }
        return [...prev, {
          id: `${p.ean}-${Date.now()}`,
          product: p,
          precoOriginal: precoBase,
          precoOferta: precoBase,
          updating: false,
          updated: false,
        }];
      });
      setCode("");
      toast.success(`${p.descricao} adicionado`);
    } catch (e) {
      toast.error(e instanceof VFError ? e.message : "Produto não encontrado");
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  };

  const removeItem = (id: string) => setItems((prev) => prev.filter((x) => x.id !== id));

  const handleUpdateAll = async () => {
    if (!computedItems.length || !window.easyPrint?.isDesktop) return;
    setUpdatingAll(true);
    let ok = 0;
    let fail = 0;
    for (const item of computedItems) {
      setItems((prev) => prev.map((x) => x.id === item.id ? { ...x, updating: true } : x));
      try {
        await window.easyPrint.erpUpdatePromo(config, item.product.id as string, null, item.precoOferta);
        setItems((prev) => prev.map((x) => x.id === item.id ? { ...x, updating: false, updated: true } : x));
        ok++;
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Erro";
        let errMsg = msg;
        try { errMsg = JSON.parse(msg).message || msg; } catch {}
        setItems((prev) => prev.map((x) => x.id === item.id ? { ...x, updating: false, error: errMsg } : x));
        fail++;
      }
    }
    setUpdatingAll(false);
    if (fail === 0) toast.success(`${ok} produto(s) atualizados no ERP`);
    else toast.warning(`${ok} atualizados, ${fail} com erro`);
  };

  const handlePrintAllA4 = async () => {
    if (!computedItems.length) return;
    setPrinting(true);
    const promoProducts = computedItems.map((item) =>
      buildPromoProduct(item.product, item.precoOriginal, item.precoOferta)
    );
    await doPrintA4(promoProducts, templateId, fillMode, config);
    setPrinting(false);
  };

  return (
    <div className="space-y-4 p-4">
      <div className="rounded-lg border bg-card p-4 space-y-3">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Desconto para todos os itens</p>
        <DiscountInput
          discountType={discountType}
          setDiscountType={setDiscountType}
          discountValue={discountValue}
          setDiscountValue={setDiscountValue}
        />
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-1.5">Arredondamento</p>
          <RoundPicker value={roundMode} onChange={setRoundMode} />
        </div>
      </div>

      <div className="flex gap-2">
        <Input
          ref={inputRef}
          value={code}
          onChange={(e) => setCode(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && search()}
          placeholder="Bipe o código do próximo item..."
          className="font-mono text-base"
          autoFocus
        />
        <Button onClick={search} disabled={loading} className="shrink-0">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Tag className="h-4 w-4" />}
        </Button>
      </div>

      {computedItems.length > 0 && (
        <>
          <div className="space-y-2 max-h-72 overflow-auto pr-1">
            {computedItems.map((item) => (
              <div key={item.id} className={cn("rounded-lg border bg-card p-3 flex items-center gap-3", item.updated && "border-emerald-500/40 bg-emerald-50", item.error && "border-destructive/40 bg-destructive/5")}>
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] font-mono text-muted-foreground">{item.product.ean}</p>
                  <p className="text-sm font-medium truncate">{item.product.descricao}</p>
                  <p className="text-xs text-muted-foreground">
                    DE <span className="line-through">{fmtBRL(item.precoOriginal)}</span>{" "}
                    → <span className="font-bold text-primary">{fmtBRL(item.precoOferta)}</span>
                    {discNum > 0 && ` (${((1 - item.precoOferta / item.precoOriginal) * 100).toFixed(0)}% off)`}
                  </p>
                  {item.error && <p className="text-[10px] text-destructive">{item.error}</p>}
                </div>
                <div className="shrink-0 flex items-center gap-1">
                  {item.updating && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
                  {item.updated && <CheckCircle2 className="h-4 w-4 text-emerald-600" />}
                  <button onClick={() => removeItem(item.id)} className="rounded p-1 hover:bg-destructive/10 hover:text-destructive">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>

          <div className="flex gap-2">
            <Button onClick={handleUpdateAll} disabled={updatingAll} className="flex-1">
              {updatingAll ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              Atualizar {computedItems.length} no ERP
            </Button>
            <Button onClick={handlePrintAllA4} disabled={printing} variant="secondary" className="flex-1">
              {printing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />}
              Catálogo em Lote
            </Button>
          </div>

          <Button variant="ghost" size="sm" className="w-full text-muted-foreground" onClick={() => setItems([])}>
            <Trash2 className="h-3.5 w-3.5" /> Limpar lista
          </Button>
        </>
      )}

      {computedItems.length === 0 && (
        <div className="rounded-lg border border-dashed bg-muted/20 p-8 text-center text-sm text-muted-foreground">
          Bipe os itens para adicionar à lista em lote.
        </div>
      )}
    </div>
  );
}

// ---- Main Export ----

export function PromoModule({ config }: Props) {
  const [authOk, setAuthOk] = useState(false);
  const [templateId, setTemplateId] = useState<string>(() => a4Storage.getActive() || a4Storage.getTemplates()[0]?.id || "");
  const [fillMode, setFillMode] = useState<FillMode>("repeat");

  if (!authOk) return <AuthGate onAuth={() => setAuthOk(true)} />;

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="border-b bg-card px-4 py-3 flex items-center gap-3">
        <Tag className="h-5 w-5 text-primary" />
        <div>
          <h2 className="font-bold text-sm">Item em Promoção</h2>
          <p className="text-[11px] text-muted-foreground">Cadastrar preço de oferta e gerar catálogo A4</p>
        </div>
      </div>

      <PrintOptionsBar
        templateId={templateId}
        setTemplateId={setTemplateId}
        fillMode={fillMode}
        setFillMode={setFillMode}
      />

      <div className="flex-1 overflow-auto">
        <Tabs defaultValue="individual" className="flex-1">
          <div className="px-4 pt-3">
            <TabsList className="grid grid-cols-2 w-full max-w-xs">
              <TabsTrigger value="individual">Individual</TabsTrigger>
              <TabsTrigger value="lote">Em Lote</TabsTrigger>
            </TabsList>
          </div>
          <TabsContent value="individual">
            <IndividualTab config={config} templateId={templateId} fillMode={fillMode} />
          </TabsContent>
          <TabsContent value="lote">
            <LoteTab config={config} templateId={templateId} fillMode={fillMode} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
