// components/MonteCarloPanel.tsx
"use client";

import { useMemo } from "react";
import { monteCarlo } from "@/core/montecarlo";
import { fmtPct } from "@/lib/format";
import { Card, SectionTitle, Stat, TONE, ddTone } from "./ui/primitives";

export default function MonteCarloPanel({ rMultiples }: { rMultiples: number[] }) {
  const mc = useMemo(() => monteCarlo(rMultiples, { riskFraction: 0.01 }), [rMultiples]);

  if (!mc) {
    return (
      <Card>
        <SectionTitle title="Monte Carlo Risk" sub="Bootstrap resampling of realised trade outcomes" />
        <p className="text-xs text-muted leading-relaxed">
          Needs at least 10 closed trades to resample. Once enough paper trades accumulate, this
          estimates risk of ruin and the drawdown distribution by reshuffling what actually happened.
        </p>
      </Card>
    );
  }

  const ruinTone = mc.riskOfRuin < 0.05 ? TONE.long : mc.riskOfRuin < 0.2 ? TONE.warn : TONE.short;
  const pctls = [
    { k: "p5", v: mc.returnPctls.p5 },
    { k: "p25", v: mc.returnPctls.p25 },
    { k: "p50", v: mc.returnPctls.p50 },
    { k: "p75", v: mc.returnPctls.p75 },
    { k: "p95", v: mc.returnPctls.p95 },
  ];
  const maxAbs = Math.max(...pctls.map((p) => Math.abs(p.v)), 0.0001);

  return (
    <Card>
      <SectionTitle
        title="Monte Carlo Risk"
        sub={`${mc.runs.toLocaleString()} resampled paths · ${mc.trades} trades · ${fmtPct(mc.riskFraction, 0)} risk/trade · ruin = ${fmtPct(mc.ruinThresholdPct, 0)} account loss`}
      />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-5">
        <Stat label="Risk of Ruin" value={fmtPct(mc.riskOfRuin, 1)} tone={ruinTone} size="sm" />
        <Stat label="Prob. Profitable" value={fmtPct(mc.probProfit, 0)} tone={mc.probProfit >= 0.5 ? TONE.long : TONE.short} size="sm" />
        <Stat label="Median Max DD" value={fmtPct(mc.medianMaxDrawdown, 0)} tone={ddTone(mc.medianMaxDrawdown)} size="sm" />
        <Stat label="P95 Max DD" value={fmtPct(mc.p95MaxDrawdown, 0)} tone={ddTone(mc.p95MaxDrawdown)} size="sm" />
      </div>

      <div className="label mb-2">Outcome distribution (return vs start)</div>
      <div className="flex flex-col gap-1.5">
        {pctls.map((p) => {
          const pos = p.v >= 0;
          const w = (Math.abs(p.v) / maxAbs) * 50;
          return (
            <div key={p.k} className="flex items-center gap-2 text-[11px]">
              <span className="label w-8">{p.k}</span>
              <div className="flex-1 flex items-center" style={{ height: 16 }}>
                <div className="flex justify-end" style={{ width: "50%" }}>
                  {!pos && <div style={{ width: `${w}%`, height: 10, background: TONE.short, borderRadius: 2 }} />}
                </div>
                <div style={{ width: 1, height: 16, background: "#2a3543" }} />
                <div style={{ width: "50%" }}>
                  {pos && <div style={{ width: `${w}%`, height: 10, background: TONE.long, borderRadius: 2 }} />}
                </div>
              </div>
              <span className="tnum w-14 text-right" style={{ color: pos ? TONE.long : TONE.short }}>{fmtPct(p.v, 0)}</span>
            </div>
          );
        })}
      </div>
      <p className="text-[10px] text-muted leading-relaxed mt-3">
        Resamples your realised trade outcomes (with replacement) to show how the same edge could
        have played out under a different sequence. It does not predict the future — it characterises
        the risk in what already happened.
      </p>
    </Card>
  );
}
