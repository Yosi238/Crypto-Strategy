// core/edges.ts
// The "portfolio of edges" engine. Instead of asking "does this strategy work
// everywhere?", we slice every strategy's realised trades into segments —
// (symbol × direction × regime) — and validate each segment on its own merits.
// An edge is a specific environment where a specific strategy actually held up.
//
// HONESTY: nothing is optimised here. We take the trades the validated params
// produced, tag each with the regime in force at entry (causal) and its side,
// then aggregate. A segment is only flagged VALIDATED if it independently
// clears the gates. Segments are smaller samples than a whole strategy, so we
// use a clearly-labelled segment minimum trade count and surface it honestly —
// we never claim a 20-trade cell is as trustworthy as a 200-trade strategy.

import type { Gates } from "./validation";

export interface TaggedTrade {
  side: "long" | "short";
  regime: string;
  rMultiple: number;
  time: number;
}

export interface StrategyTradeSet {
  strategyId: string;
  strategyName: string;
  category: string;
  symbol: string;
  timeframe: string;
  trades: TaggedTrade[];
}

export interface Edge {
  id: string;
  strategyId: string;
  strategyName: string;
  category: string;
  symbol: string;
  timeframe: string;
  direction: "LONG" | "SHORT";
  regime: string;
  trades: number;
  winRate: number;
  profitFactor: number;
  expectancy: number; // mean R
  avgRR: number;
  maxDrawdown: number; // 0..1, on an R-based equity curve
  netProfitR: number; // sum of R
  score: number; // quality score for ranking / allocation
  validated: boolean;
  failureReasons: string[];
  rMultiples: number[]; // stored only for validated edges (capped) → Monte Carlo
}

/** Segments smaller than a full strategy use a lower, clearly-labelled minimum. */
export const SEGMENT_MIN_TRADES = 40;

function ddFromR(rs: number[], riskFraction = 0.01): number {
  let eq = 1, peak = 1, maxDD = 0;
  for (const r of rs) {
    eq += r * riskFraction * eq;
    peak = Math.max(peak, eq);
    maxDD = Math.max(maxDD, peak > 0 ? 1 - eq / peak : 0);
  }
  return maxDD;
}

function scoreEdge(pf: number, maxDD: number, trades: number, winRate: number): number {
  const edge = Math.max(0, (Number.isFinite(pf) ? pf : 5) - 1);
  return edge * (1 - Math.min(0.9, maxDD)) * Math.log10(10 + trades) * (0.5 + 0.5 * winRate);
}

/** Build validated/candidate edges from every strategy's tagged trade set. */
export function buildEdges(
  sets: StrategyTradeSet[],
  gates: Gates,
  segmentMinTrades = SEGMENT_MIN_TRADES
): Edge[] {
  const edges: Edge[] = [];

  for (const set of sets) {
    // group by (direction, regime)
    const groups = new Map<string, TaggedTrade[]>();
    for (const t of set.trades) {
      const key = `${t.side}|${t.regime}`;
      const arr = groups.get(key) ?? [];
      arr.push(t);
      groups.set(key, arr);
    }

    for (const [key, trades] of groups) {
      const [side, regime] = key.split("|");
      const rs = trades.sort((a, b) => a.time - b.time).map((t) => t.rMultiple);
      const n = rs.length;
      if (n < 5) continue; // not worth listing

      const wins = rs.filter((r) => r > 0);
      const losses = rs.filter((r) => r <= 0);
      const grossWin = wins.reduce((a, b) => a + b, 0);
      const grossLoss = Math.abs(losses.reduce((a, b) => a + b, 0));
      const pf = grossLoss > 0 ? grossWin / grossLoss : grossWin > 0 ? Infinity : 0;
      const winRate = n > 0 ? wins.length / n : 0;
      const expectancy = rs.reduce((a, b) => a + b, 0) / n;
      const maxDD = ddFromR(rs);
      const netProfitR = rs.reduce((a, b) => a + b, 0);

      const failureReasons: string[] = [];
      if (n < segmentMinTrades) failureReasons.push(`Too few trades (${n} < ${segmentMinTrades})`);
      if (!(pf >= gates.minProfitFactor)) failureReasons.push(`Profit factor ${Number.isFinite(pf) ? pf.toFixed(2) : "∞"} < ${gates.minProfitFactor}`);
      if (maxDD > gates.maxDrawdown) failureReasons.push(`Max drawdown ${(maxDD * 100).toFixed(0)}% > ${(gates.maxDrawdown * 100).toFixed(0)}%`);
      if (expectancy <= 0) failureReasons.push("Negative expectancy");

      const validated = failureReasons.length === 0;
      edges.push({
        id: `${set.strategyId}|${set.symbol}|${side}|${regime}`,
        strategyId: set.strategyId,
        strategyName: set.strategyName,
        category: set.category,
        symbol: set.symbol,
        timeframe: set.timeframe,
        direction: side === "long" ? "LONG" : "SHORT",
        regime,
        trades: n,
        winRate,
        profitFactor: pf,
        expectancy,
        avgRR: expectancy,
        maxDrawdown: maxDD,
        netProfitR,
        score: validated ? scoreEdge(pf, maxDD, n, winRate) : 0,
        validated,
        failureReasons,
        rMultiples: validated ? rs.slice(-500) : [],
      });
    }
  }

  // Best edges first.
  return edges.sort((a, b) => b.score - a.score || b.netProfitR - a.netProfitR);
}

/** Allocate risk across validated edges proportional to quality score. */
export function allocatePortfolio(edges: Edge[]): { edge: Edge; weight: number }[] {
  const valid = edges.filter((e) => e.validated && e.score > 0);
  const total = valid.reduce((s, e) => s + e.score, 0);
  if (total <= 0) return [];
  return valid.map((e) => ({ edge: e, weight: e.score / total }));
}
