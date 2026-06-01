// app/diagnostics/page.tsx — Strategy Diagnostics
"use client";

import { useEffect, useState } from "react";
import { fmtPf } from "@/lib/format";
import { Card, SectionTitle, Badge, TONE } from "@/components/ui/primitives";

interface Agg { trades: number; netR: number; expectancy: number }
interface Row {
  strategyId: string; strategyName: string; category: string;
  validatedEdges: number;
  bestSegment: { symbol: string; direction: string; regime: string; profitFactor: number; trades: number; validated: boolean } | null;
  worstRegime: { regime: string; direction: string; symbol: string; netProfitR: number } | null;
  long: Agg; short: Agg; btc: Agg; eth: Agg;
  passedBoth: boolean; failedGates: string[]; logic: string;
}

const rTone = (r: number) => (r > 0 ? TONE.long : r < 0 ? TONE.short : TONE.neutral);
const fmtR = (r: number) => `${r >= 0 ? "+" : ""}${r.toFixed(1)}R`;

export default function Diagnostics() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [hasEdges, setHasEdges] = useState(true);

  useEffect(() => {
    fetch("/api/diagnostics", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { setRows(d?.rows ?? []); setHasEdges(!!d?.hasEdges); })
      .catch(() => setRows([]));
  }, []);

  if (!rows) return <Card><p className="text-sm text-muted">Loading diagnostics…</p></Card>;

  if (!hasEdges) {
    return (
      <Card>
        <SectionTitle title="Strategy Diagnostics" sub="Where each strategy works — and where it doesn't" />
        <p className="text-sm text-muted leading-relaxed">
          No edge data yet. Run <span className="text-accent tnum">npm run research</span> to map each
          strategy across assets, directions and regimes.
        </p>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <SectionTitle title="Strategy Diagnostics" sub="Per-strategy breakdown: best/worst environment, long vs short, BTC vs ETH, and failure reasons" />
      </Card>

      {rows.map((r) => (
        <Card key={r.strategyId}>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className="text-bright font-semibold text-sm">{r.strategyName}</span>
              <Badge color={TONE.neutral}>{r.category}</Badge>
              {r.validatedEdges > 0 ? (
                <Badge color={TONE.long}>{r.validatedEdges} validated edge{r.validatedEdges > 1 ? "s" : ""}</Badge>
              ) : (
                <Badge color={TONE.short}>no validated edge</Badge>
              )}
            </div>
            {r.passedBoth && <Badge color={TONE.long}>full-strategy validated</Badge>}
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-3">
            <Cell label="Best Environment" value={r.bestSegment ? `${r.bestSegment.symbol.replace("USDT", "")} ${r.bestSegment.direction}` : "—"} hint={r.bestSegment ? `${r.bestSegment.regime} · PF ${fmtPf(r.bestSegment.profitFactor)} · ${r.bestSegment.trades} tr` : undefined} tone={r.bestSegment?.validated ? TONE.long : undefined} />
            <Cell label="Worst Regime" value={r.worstRegime ? `${r.worstRegime.regime}` : "—"} hint={r.worstRegime ? `${r.worstRegime.symbol.replace("USDT", "")} ${r.worstRegime.direction} · ${fmtR(r.worstRegime.netProfitR)}` : undefined} tone={r.worstRegime ? rTone(r.worstRegime.netProfitR) : undefined} />
            <Cell label="Long vs Short" value={`${fmtR(r.long.netR)} / ${fmtR(r.short.netR)}`} hint={`${r.long.trades} / ${r.short.trades} trades`} />
            <Cell label="BTC vs ETH" value={`${fmtR(r.btc.netR)} / ${fmtR(r.eth.netR)}`} hint={`${r.btc.trades} / ${r.eth.trades} trades`} />
          </div>

          {r.failedGates.length > 0 && (
            <div>
              <div className="label mb-1">Full-strategy failure reasons</div>
              <div className="flex flex-wrap gap-1.5">
                {r.failedGates.map((g, i) => <Badge key={i} color={TONE.short}>{g}</Badge>)}
              </div>
            </div>
          )}
        </Card>
      ))}
    </div>
  );
}

function Cell({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: string }) {
  return (
    <div>
      <div className="label">{label}</div>
      <div className="text-sm mt-0.5" style={{ color: tone ?? TONE.bright }}>{value}</div>
      {hint && <div className="text-[10px] mt-0.5 text-muted tnum">{hint}</div>}
    </div>
  );
}
