// app/api/diagnostics/route.ts
// Per-strategy diagnostics derived from the segmented edges + strategy-level
// validation: where each strategy works best/worst, long vs short, BTC vs ETH,
// and why it failed.

import { NextResponse } from "next/server";
import { loadResearch } from "@/data/store";
import { getStrategy, STRATEGIES } from "@/core/strategies";
import type { Edge } from "@/core/edges";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const sumR = (es: Edge[]) => es.reduce((s, e) => s + e.netProfitR, 0);
const agg = (es: Edge[]) => {
  const trades = es.reduce((s, e) => s + e.trades, 0);
  const netR = sumR(es);
  return { trades, netR, expectancy: trades > 0 ? netR / trades : 0 };
};

export async function GET() {
  const snap = await loadResearch();
  const edges: Edge[] = snap?.edges ?? [];

  const rows = STRATEGIES.map((strat) => {
    const mine = edges.filter((e) => e.strategyId === strat.id);
    const cross = snap?.results.find((r) => r.strategyId === strat.id);
    const validated = mine.filter((e) => e.validated).sort((a, b) => b.score - a.score);
    const best = validated[0] ?? [...mine].sort((a, b) => b.netProfitR - a.netProfitR)[0] ?? null;
    const worst = [...mine].sort((a, b) => a.netProfitR - b.netProfitR)[0] ?? null;

    const longE = mine.filter((e) => e.direction === "LONG");
    const shortE = mine.filter((e) => e.direction === "SHORT");
    const btcE = mine.filter((e) => e.symbol === "BTCUSDT");
    const ethE = mine.filter((e) => e.symbol === "ETHUSDT");

    // Strategy-level failure reasons (from full validation), union across symbols.
    const failedGates = cross
      ? Array.from(new Set(Object.values(cross.perSymbol).flatMap((d) => d.failedGates)))
      : [];

    return {
      strategyId: strat.id,
      strategyName: strat.name,
      category: strat.category,
      validatedEdges: validated.length,
      bestSegment: best ? { symbol: best.symbol, direction: best.direction, regime: best.regime, profitFactor: best.profitFactor, trades: best.trades, validated: best.validated } : null,
      worstRegime: worst ? { regime: worst.regime, direction: worst.direction, symbol: worst.symbol, netProfitR: worst.netProfitR } : null,
      long: agg(longE),
      short: agg(shortE),
      btc: agg(btcE),
      eth: agg(ethE),
      passedBoth: cross?.passedBoth ?? false,
      failedGates,
      logic: getStrategy(strat.id)?.logic ?? "",
    };
  });

  // Strategies with the most validated edges first.
  rows.sort((a, b) => b.validatedEdges - a.validatedEdges || b.btc.netR + b.eth.netR - (a.btc.netR + a.eth.netR));

  return NextResponse.json({ hasResearch: !!snap, hasEdges: edges.length > 0, rows });
}
