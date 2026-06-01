// app/edge-map/page.tsx — Edge Map + Portfolio of Edges
"use client";

import { useEffect, useState } from "react";
import type { Edge } from "@/core/edges";
import { fmtPct, fmtPf } from "@/lib/format";
import { Card, SectionTitle, Stat, Badge, TONE, pfTone, ddTone } from "@/components/ui/primitives";
import MonteCarloPanel from "@/components/MonteCarloPanel";

interface EdgesResponse {
  hasResearch: boolean;
  hasEdges: boolean;
  timeframe: string | null;
  generatedAt: number | null;
  segmentMinTrades: number;
  edges: Edge[];
  portfolio: { id: string; label: string; strategyName: string; weight: number; profitFactor: number; trades: number }[];
}

const regimeColor = (r: string) =>
  r.includes("Bull") ? TONE.long : r.includes("Bear") ? TONE.short : r.includes("Volatility") || r === "Expansion" ? TONE.warn : TONE.accent;

export default function EdgeMap() {
  const [data, setData] = useState<EdgesResponse | null>(null);
  const [validatedOnly, setValidatedOnly] = useState(true);

  useEffect(() => {
    fetch("/api/edges", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then(setData)
      .catch(() => setData(null));
  }, []);

  if (!data) return <Card><p className="text-sm text-muted">Loading edge map…</p></Card>;

  if (!data.hasEdges) {
    return (
      <Card>
        <SectionTitle title="Edge Map" sub="Where a statistical edge actually exists" />
        <p className="text-sm text-muted leading-relaxed">
          No edges computed yet. Run <span className="text-accent tnum">npm run research</span> (it now
          maps every strategy across directions and regimes). On a fresh run the segmented edges are
          written into the research snapshot.
        </p>
      </Card>
    );
  }

  const validated = data.edges.filter((e) => e.validated);
  const shown = validatedOnly ? validated : data.edges;
  const topEdge = validated[0] ?? null;

  return (
    <div className="flex flex-col gap-5">
      <Card>
        <SectionTitle
          title="Edge Map"
          sub={`Specific edges in specific environments · timeframe ${data.timeframe} · segment minimum ${data.segmentMinTrades} trades`}
          right={<Badge color={validated.length ? TONE.long : TONE.short}>{validated.length} validated edges</Badge>}
        />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Stat label="Candidate Segments" value={String(data.edges.length)} size="sm" />
          <Stat label="Validated Edges" value={String(validated.length)} tone={validated.length ? TONE.long : TONE.short} size="sm" />
          <Stat label="Assets" value="BTC · ETH" size="sm" />
          <Stat label="Regimes Tracked" value="7" size="sm" />
        </div>
        {validated.length === 0 && (
          <p className="text-[11px] text-muted leading-relaxed mt-4">
            No segment cleared the gates (PF ≥ 1.4, DD ≤ 20%, positive expectancy, ≥ {data.segmentMinTrades} trades).
            That is an honest result — it means no reliable edge was found in these environments on this data.
            Segments are smaller samples than a full strategy, so treat even validated ones with appropriate caution.
          </p>
        )}
      </Card>

      {/* Portfolio of edges */}
      {data.portfolio.length > 0 && (
        <Card>
          <SectionTitle title="Portfolio of Edges" sub="Risk allocated across validated edges, weighted by quality score" />
          <div className="flex flex-col gap-2">
            {data.portfolio.map((p) => (
              <div key={p.id} className="flex items-center gap-3 text-xs">
                <span className="text-bright w-48 shrink-0 truncate">{p.label}</span>
                <span className="text-muted w-40 shrink-0 truncate hidden md:block">{p.strategyName}</span>
                <div className="flex-1 h-3 rounded" style={{ background: "#0a0e14" }}>
                  <div className="h-3 rounded" style={{ width: `${(p.weight * 100).toFixed(1)}%`, background: TONE.long }} />
                </div>
                <span className="tnum w-12 text-right text-bright">{fmtPct(p.weight, 0)}</span>
              </div>
            ))}
          </div>
          <p className="text-[10px] text-muted mt-3">
            Weights are relative quality, not a recommendation to deploy capital. Paper/research only.
          </p>
        </Card>
      )}

      {/* Edge table */}
      <Card pad={false}>
        <div className="card-pad pb-3 flex items-center justify-between">
          <SectionTitle title="Edges" sub="Asset × direction × regime × strategy" />
          <button onClick={() => setValidatedOnly((v) => !v)} className="pill focusable" style={validatedOnly ? { borderColor: "#39c0ed66", color: "#eef3f9" } : undefined}>
            {validatedOnly ? "validated only" : "all segments"}
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="dt">
            <thead>
              <tr>
                <th>Asset</th><th>Dir</th><th>TF</th><th>Regime</th><th>Strategy</th>
                <th className="num">PF</th><th className="num">Win%</th><th className="num">Trades</th><th className="num">Max DD</th><th>Status</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((e) => (
                <tr key={e.id}>
                  <td className="text-bright">{e.symbol.replace("USDT", "")}</td>
                  <td style={{ color: e.direction === "LONG" ? TONE.long : TONE.short }}>{e.direction}</td>
                  <td className="text-muted">{e.timeframe}</td>
                  <td><span style={{ color: regimeColor(e.regime) }}>{e.regime}</span></td>
                  <td className="text-text">{e.strategyName}</td>
                  <td className="num" style={{ color: pfTone(e.profitFactor) }}>{fmtPf(e.profitFactor)}</td>
                  <td className="num">{fmtPct(e.winRate)}</td>
                  <td className="num">{e.trades}</td>
                  <td className="num" style={{ color: ddTone(e.maxDrawdown) }}>{fmtPct(e.maxDrawdown)}</td>
                  <td>
                    {e.validated ? (
                      <Badge color={TONE.long}>VALIDATED EDGE</Badge>
                    ) : (
                      <Badge color={TONE.neutral}>{e.failureReasons[0] ?? "candidate"}</Badge>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {topEdge && topEdge.rMultiples.length >= 10 && (
        <div>
          <div className="section-sub mb-2">Monte Carlo · top edge: {topEdge.symbol.replace("USDT", "")} {topEdge.direction} · {topEdge.regime} ({topEdge.strategyName})</div>
          <MonteCarloPanel rMultiples={topEdge.rMultiples} />
        </div>
      )}
    </div>
  );
}
