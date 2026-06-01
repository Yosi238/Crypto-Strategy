// components/PerformancePanel.tsx
"use client";

import type { PerformanceMetrics } from "@/core/types";
import { fmtPct, fmtPf, fmtUsd } from "@/lib/format";
import { Card, SectionTitle, Stat, TONE, pfTone, ddTone, netTone } from "./ui/primitives";

type Point = { time: number; equity: number };

function EquityCurve({ curve, initial }: { curve: Point[]; initial: number }) {
  if (curve.length < 2) {
    return (
      <div className="grid place-items-center h-[180px] text-muted text-xs">
        No closed trades yet — the equity curve appears once paper trades resolve.
      </div>
    );
  }
  const W = 900;
  const H = 200;
  const pad = 24;
  const eqs = curve.map((p) => p.equity);
  const min = Math.min(initial, ...eqs);
  const max = Math.max(initial, ...eqs);
  const xOf = (i: number) => pad + (i / (curve.length - 1)) * (W - pad * 2);
  const yOf = (e: number) => pad + (1 - (e - min) / (max - min || 1)) * (H - pad * 2);
  const line = curve.map((p, i) => `${xOf(i)},${yOf(p.equity)}`).join(" ");
  const area = `${pad},${H - pad} ${line} ${W - pad},${H - pad}`;
  const baseY = yOf(initial);
  const last = curve[curve.length - 1].equity;
  const up = last >= initial;
  const color = up ? TONE.long : TONE.short;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
      <defs>
        <linearGradient id="eqfill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.25} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      <line x1={pad} x2={W - pad} y1={baseY} y2={baseY} stroke="#2a3543" strokeWidth={1} strokeDasharray="4 4" />
      <text x={pad} y={baseY - 4} fontSize={9} fill="#5b6878" className="tnum">start {fmtUsd(initial, 0)}</text>
      <polygon points={area} fill="url(#eqfill)" />
      <polyline points={line} fill="none" stroke={color} strokeWidth={1.6} />
    </svg>
  );
}

export default function PerformancePanel({
  metrics,
  equityCurve,
  initial = 10000,
  title = "Performance",
  sub,
}: {
  metrics: PerformanceMetrics;
  equityCurve: Point[];
  initial?: number;
  title?: string;
  sub?: string;
}) {
  return (
    <Card>
      <SectionTitle title={title} sub={sub ?? "Realised paper-trade performance"} />
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-5">
        <Stat label="Trades" value={String(metrics.totalTrades)} size="sm" />
        <Stat label="Win Rate" value={fmtPct(metrics.winRate)} size="sm" />
        <Stat label="Profit Factor" value={fmtPf(metrics.profitFactor)} tone={pfTone(metrics.profitFactor)} size="sm" />
        <Stat label="Net Return" value={fmtPct(metrics.netProfitPct)} tone={netTone(metrics.netProfitPct)} size="sm" />
        <Stat label="Max DD" value={fmtPct(metrics.maxDrawdown)} tone={ddTone(metrics.maxDrawdown)} size="sm" />
        <Stat label="Expectancy" value={`${metrics.expectancy.toFixed(2)}R`} size="sm" />
      </div>
      <EquityCurve curve={equityCurve} initial={initial} />
    </Card>
  );
}
