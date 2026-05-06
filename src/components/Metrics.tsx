import { useMemo, useState } from "react";
import { storage } from "@/services/storage";
import { PrintEvent } from "@/types/label";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Trash2, Download, Tag, Package, Timer, Activity } from "lucide-react";
import { toast } from "sonner";

interface Props {
  events: PrintEvent[];
  onClear: () => void;
}

function fmtDuration(ms: number) {
  if (!isFinite(ms) || ms <= 0) return "—";
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}m ${r}s`;
}

export function Metrics({ events, onClear }: Props) {
  const [range, setRange] = useState<"today" | "7d" | "30d" | "all">("today");

  const filtered = useMemo(() => {
    const now = Date.now();
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const limits: Record<string, number> = {
      today: startOfToday.getTime(),
      "7d": now - 7 * 86400000,
      "30d": now - 30 * 86400000,
      all: 0,
    };
    return events.filter((e) => e.at >= limits[range]);
  }, [events, range]);

  const totals = useMemo(() => {
    const totalLabels = filtered.reduce((s, e) => s + e.quantidade, 0);
    const totalPrints = filtered.length;
    const uniqueProducts = new Set(filtered.map((e) => e.ean)).size;
    const durations = filtered.map((e) => e.durationMs).filter((d) => d > 0 && d < 5 * 60_000);
    const avg =
      durations.length > 0 ? durations.reduce((a, b) => a + b, 0) / durations.length : 0;
    return { totalLabels, totalPrints, uniqueProducts, avg };
  }, [filtered]);

  const byProduct = useMemo(() => {
    const map = new Map<string, { ean: string; descricao: string; qtd: number; vezes: number; last: number }>();
    for (const e of filtered) {
      const cur = map.get(e.ean);
      if (cur) {
        cur.qtd += e.quantidade;
        cur.vezes += 1;
        cur.last = Math.max(cur.last, e.at);
      } else {
        map.set(e.ean, { ean: e.ean, descricao: e.descricao, qtd: e.quantidade, vezes: 1, last: e.at });
      }
    }
    return Array.from(map.values()).sort((a, b) => b.qtd - a.qtd);
  }, [filtered]);

  const exportCsv = () => {
    const header = "ean;descricao;quantidade;vezes;ultima\n";
    const rows = byProduct
      .map(
        (p) =>
          `${p.ean};"${p.descricao.replace(/"/g, '""')}";${p.qtd};${p.vezes};${new Date(p.last).toISOString()}`,
      )
      .join("\n");
    const blob = new Blob([header + rows], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `metricas-etiquetas-${range}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("CSV exportado");
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-bold">Métricas de impressão</h2>
        <div className="flex items-center gap-2">
          {(["today", "7d", "30d", "all"] as const).map((r) => (
            <Button
              key={r}
              size="sm"
              variant={range === r ? "default" : "outline"}
              onClick={() => setRange(r)}
            >
              {r === "today" ? "Hoje" : r === "7d" ? "7 dias" : r === "30d" ? "30 dias" : "Tudo"}
            </Button>
          ))}
          <Button size="sm" variant="outline" onClick={exportCsv} disabled={!byProduct.length}>
            <Download className="h-4 w-4" /> CSV
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              if (confirm("Apagar todo o histórico de impressões?")) onClear();
            }}
          >
            <Trash2 className="h-4 w-4" /> Limpar
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard icon={<Tag />} label="Etiquetas impressas" value={totals.totalLabels.toString()} />
        <KpiCard icon={<Activity />} label="Impressões" value={totals.totalPrints.toString()} />
        <KpiCard icon={<Package />} label="Produtos únicos" value={totals.uniqueProducts.toString()} />
        <KpiCard icon={<Timer />} label="Tempo médio / etiqueta" value={fmtDuration(totals.avg)} />
      </div>

      <div className="rounded-lg border bg-card">
        <div className="p-4 border-b">
          <h3 className="font-semibold">Itens etiquetados</h3>
          <p className="text-xs text-muted-foreground">
            Agregado por EAN no período selecionado
          </p>
        </div>
        <div className="max-h-[420px] overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>EAN</TableHead>
                <TableHead>Descrição</TableHead>
                <TableHead className="text-right">Qtd. etiquetas</TableHead>
                <TableHead className="text-right">Vezes impresso</TableHead>
                <TableHead>Última impressão</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {byProduct.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                    Nenhuma impressão no período.
                  </TableCell>
                </TableRow>
              )}
              {byProduct.map((p) => (
                <TableRow key={p.ean}>
                  <TableCell className="font-mono text-xs">{p.ean}</TableCell>
                  <TableCell className="max-w-xs truncate">{p.descricao}</TableCell>
                  <TableCell className="text-right font-bold">{p.qtd}</TableCell>
                  <TableCell className="text-right">{p.vezes}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {new Date(p.last).toLocaleString("pt-BR")}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      <div className="rounded-lg border bg-card">
        <div className="p-4 border-b">
          <h3 className="font-semibold">Últimas impressões</h3>
        </div>
        <div className="max-h-[300px] overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Quando</TableHead>
                <TableHead>EAN</TableHead>
                <TableHead>Descrição</TableHead>
                <TableHead className="text-right">Qtd</TableHead>
                <TableHead className="text-right">Tempo</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.slice(0, 100).map((e, i) => (
                <TableRow key={e.at + "-" + i}>
                  <TableCell className="text-xs">
                    {new Date(e.at).toLocaleString("pt-BR")}
                  </TableCell>
                  <TableCell className="font-mono text-xs">{e.ean}</TableCell>
                  <TableCell className="max-w-xs truncate">{e.descricao}</TableCell>
                  <TableCell className="text-right">{e.quantidade}</TableCell>
                  <TableCell className="text-right text-xs text-muted-foreground">
                    {fmtDuration(e.durationMs)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}

function KpiCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-card p-4 flex items-center gap-3">
      <div className="h-10 w-10 rounded-md bg-primary/10 text-primary flex items-center justify-center [&_svg]:h-5 [&_svg]:w-5">
        {icon}
      </div>
      <div>
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="text-2xl font-bold leading-tight">{value}</div>
      </div>
    </div>
  );
}
