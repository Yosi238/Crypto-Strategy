// components/ResearchLabTable.tsx
"use client";

import { useState, Fragment } from "react";
import type { StrategyRow } from "@/lib/dashboard-types";
import { fmtPct, fmtPf } from "@/lib/format";
import { Badge, TONE, pfTone, ddTone, netTone } from "./ui/primitives";
import { IconCheck, IconX, IconArrowUp, IconArrowDown, IconMinus } from "./ui/icons";

type SortKey = "rank" | "profitFactor" | "robustness" | "trades" | "oosNetProfit" | "winRate" | "maxDrawdown";

const COLS: { key: SortKey; label: string }[] = [
  { key: "profitFactor", label: "Profit Factor" },
  { key: "robustness", label: "Robustness" },
  { key: "trades", label: "Trades" },
  { key: "winRate", label: "Win %" },
  { key: "maxDrawdown", label: "Max DD" },
  { key: "oosNetProfit", label: "OOS Net" },
];

function Delta({ row }: { row: StrategyRow }) {
  if (row.isNew) return <span className="text-[10px]" style={{ color: TONE.accent }}>NEW</span>;
  if (row.rankDelta == null || row.rankDelta === 0)
    return <span className="inline-flex items-center text-[10px] text-muted"><IconMinus width={10} height={10} /></span>;
  const up = row.rankDelta > 0;
  const c = up ? TONE.long : TONE.short;
  const I = up ? IconArrowUp : IconArrowDown;
  return (
    <span className="inline-flex items-center gap-0.5 text-[10px]" style={{ color: c }}>
      <I width={10} height={10} />
      {Math.abs(row.rankDelta)}
    </span>
  );
}

export default function ResearchLabTable({ rows }: { rows: StrategyRow[] }) {
  const [sort, setSort] = useState<SortKey>("rank");
  const [dir, setDir] = useState<"asc" | "desc">("asc");
  const [open, setOpen] = useState<string | null>(null);

  const sorted = [...rows].sort((a, b) => {
    const av = a[sort];
    const bv = b[sort];
    const cmp = (Number.isFinite(av) ? av : -Infinity) - (Number.isFinite(bv) ? bv : -Infinity);
    return dir === "desc" ? -cmp : cmp;
  });

  const toggle = (k: SortKey) => {
    if (k === sort) setDir((d) => (d === "desc" ? "asc" : "desc"));
    else {
      setSort(k);
      setDir(k === "rank" ? "asc" : "desc");
    }
  };
  const arrow = (k: SortKey) => (sort === k ? (dir === "desc" ? "↓" : "↑") : "");

  return (
    <div className="overflow-x-auto">
      <table className="dt">
        <thead>
          <tr>
            <th className="num" onClick={() => toggle("rank")}>Rank {arrow("rank")}</th>
            <th style={{ cursor: "default" }}>Δ wk</th>
            <th style={{ cursor: "default" }}>Strategy</th>
            <th style={{ cursor: "default" }}>Family</th>
            {COLS.map((c) => (
              <th key={c.key} className="num" onClick={() => toggle(c.key)}>
                {c.label} {arrow(c.key)}
              </th>
            ))}
            <th style={{ cursor: "default" }}>Status</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((r) => {
            const isOpen = open === r.id;
            return (
              <Fragment key={r.id}>
                <tr onClick={() => setOpen(isOpen ? null : r.id)} style={{ cursor: "pointer" }}>
                  <td className="num text-bright">#{r.rank}</td>
                  <td><Delta row={r} /></td>
                  <td className="text-bright">{r.name}</td>
                  <td className="text-muted">{r.category}</td>
                  <td className="num" style={{ color: pfTone(r.profitFactor) }}>{fmtPf(r.profitFactor)}</td>
                  <td className="num">{r.robustness.toFixed(2)}</td>
                  <td className="num">{r.trades}</td>
                  <td className="num">{fmtPct(r.winRate)}</td>
                  <td className="num" style={{ color: ddTone(r.maxDrawdown) }}>{fmtPct(r.maxDrawdown)}</td>
                  <td className="num" style={{ color: netTone(r.oosNetProfit) }}>{fmtPct(r.oosNetProfit)}</td>
                  <td>
                    {r.passedBoth ? (
                      <Badge color={TONE.long}><IconCheck width={11} height={11} /> passed</Badge>
                    ) : (
                      <Badge color={TONE.short}><IconX width={11} height={11} /> failed</Badge>
                    )}
                  </td>
                </tr>
                {isOpen && (
                  <tr>
                    <td colSpan={11} style={{ background: "#0a0e14" }}>
                      <div className="p-3">
                        <div className="text-xs text-muted mb-3">{r.logic}</div>
                        {!r.passedBoth && r.failedGates.length > 0 && (
                          <div className="mb-3">
                            <div className="label mb-1">Why it failed</div>
                            <div className="flex flex-wrap gap-1.5">
                              {r.failedGates.map((g, k) => (
                                <Badge key={k} color={TONE.short}>{g}</Badge>
                              ))}
                            </div>
                          </div>
                        )}
                        <div className="grid md:grid-cols-2 gap-3">
                          {Object.entries(r.perSymbol).map(([sym, m]) => (
                            <div key={sym} className="card card-pad" style={{ padding: 12 }}>
                              <div className="flex items-center justify-between mb-2">
                                <span className="text-bright text-xs font-semibold">{sym}</span>
                                {m.passed ? (
                                  <Badge color={TONE.long}>passed</Badge>
                                ) : (
                                  <Badge color={TONE.short}>failed</Badge>
                                )}
                              </div>
                              <div className="grid grid-cols-3 gap-y-2 text-[11px]">
                                <KV k="PF" v={fmtPf(m.profitFactor)} c={pfTone(m.profitFactor)} />
                                <KV k="Win%" v={fmtPct(m.winRate)} />
                                <KV k="Trades" v={String(m.totalTrades)} />
                                <KV k="Max DD" v={fmtPct(m.maxDrawdown)} c={ddTone(m.maxDrawdown)} />
                                <KV k="Robust" v={m.robustness.toFixed(2)} />
                                <KV k="OOS Net" v={fmtPct(m.oosNetProfit)} c={netTone(m.oosNetProfit)} />
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function KV({ k, v, c }: { k: string; v: string; c?: string }) {
  return (
    <div>
      <div className="label">{k}</div>
      <div className="tnum text-xs" style={{ color: c ?? "#c5d0dd" }}>{v}</div>
    </div>
  );
}
