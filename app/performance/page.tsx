// app/performance/page.tsx — Performance Center
"use client";

import { useState } from "react";
import { useTerminal } from "@/lib/terminal-context";
import { filteredPaperMetrics, type PaperTrade } from "@/paper/tracker";
import PerformancePanel from "@/components/PerformancePanel";
import MonteCarloPanel from "@/components/MonteCarloPanel";
import { Card, SectionTitle, Stat, TONE } from "@/components/ui/primitives";

// Per-trade Sharpe / Sortino from the realised R-multiple series.
function riskRatios(r: number[]): { sharpe: number; sortino: number } {
  if (r.length < 2) return { sharpe: 0, sortino: 0 };
  const mean = r.reduce((a, b) => a + b, 0) / r.length;
  const variance = r.reduce((a, b) => a + (b - mean) ** 2, 0) / r.length;
  const std = Math.sqrt(variance);
  const downside = Math.sqrt(r.reduce((a, b) => a + (b < 0 ? b * b : 0), 0) / r.length);
  return { sharpe: std > 0 ? mean / std : 0, sortino: downside > 0 ? mean / downside : 0 };
}

type SymFilter = "ALL" | "BTCUSDT" | "ETHUSDT";
type Period = { label: string; days?: number };

const PERIODS: Period[] = [
  { label: "7D", days: 7 },
  { label: "30D", days: 30 },
  { label: "All", days: undefined },
];

export default function Performance() {
  const { paper } = useTerminal();
  const [sym, setSym] = useState<SymFilter>("ALL");
  const [period, setPeriod] = useState<Period>(PERIODS[2]);

  if (!paper) return <Card><p className="text-sm text-muted">Loading performance…</p></Card>;

  const trades = paper.trades as unknown as PaperTrade[];
  const { metrics, equityCurve, rMultiples } = filteredPaperMetrics(trades, {
    symbol: sym === "ALL" ? undefined : sym,
    days: period.days,
  });
  const { sharpe, sortino } = riskRatios(rMultiples);

  const Btn = ({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) => (
    <button
      onClick={onClick}
      className="pill focusable"
      style={active ? { borderColor: "#39c0ed66", color: "#eef3f9", background: "#0e1620" } : undefined}
    >
      {children}
    </button>
  );

  return (
    <div className="flex flex-col gap-5">
      <Card>
        <SectionTitle title="Performance Center" sub="Filter realised paper trades by asset and recency" />
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex gap-2">
            {(["ALL", "BTCUSDT", "ETHUSDT"] as SymFilter[]).map((s) => (
              <Btn key={s} active={sym === s} onClick={() => setSym(s)}>
                {s === "ALL" ? "All assets" : s}
              </Btn>
            ))}
          </div>
          <div className="flex gap-2">
            {PERIODS.map((p) => (
              <Btn key={p.label} active={period.label === p.label} onClick={() => setPeriod(p)}>
                {p.label}
              </Btn>
            ))}
          </div>
        </div>
      </Card>

      <PerformancePanel
        metrics={metrics}
        equityCurve={equityCurve}
        title={`${sym === "ALL" ? "All assets" : sym} · ${period.label}`}
        sub={paper.fetchError ?? "Realised paper-trade performance (R-based equity)"}
      />

      <Card>
        <SectionTitle title="Risk-Adjusted Returns" sub="Per-trade ratios from the realised R-multiple series" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Stat label="Sharpe (per trade)" value={sharpe.toFixed(2)} tone={sharpe >= 0.3 ? TONE.long : sharpe >= 0 ? TONE.warn : TONE.short} size="sm" />
          <Stat label="Sortino (per trade)" value={sortino.toFixed(2)} tone={sortino >= 0.5 ? TONE.long : sortino >= 0 ? TONE.warn : TONE.short} size="sm" />
          <Stat label="Expectancy" value={`${metrics.expectancy.toFixed(2)}R`} tone={metrics.expectancy >= 0 ? TONE.long : TONE.short} size="sm" />
          <Stat label="Sample" value={`${rMultiples.length} trades`} size="sm" />
        </div>
      </Card>

      <MonteCarloPanel rMultiples={rMultiples} />

      {metrics.totalTrades === 0 && (
        <Card>
          <p className="text-xs text-muted leading-relaxed">
            No closed paper trades match this filter yet. Paper trades accumulate as the scanner
            issues signals and they resolve against subsequent price action.
          </p>
        </Card>
      )}
    </div>
  );
}
