// core/ranking.ts
// Ranks every tested strategy from cross-asset walk-forward results, and diffs
// one ranking against a previous one. Pure (no IO) so the scheduler, the CLI,
// and the API all share exactly one definition of "rank".
//
// HONESTY: the score is a transparent, monotonic function of REAL metrics —
// higher profit factor, more trades, lower drawdown, and more out-of-sample
// edge that survived all push the score up. Failing strategies are still
// ranked (so the full picture is visible) but are NEVER selected: selection is
// restricted to strategies that passed validation on both assets.

import type { CrossAssetResult } from "./validation";

export interface RankedStrategy {
  strategyId: string;
  strategyName: string;
  category: string;
  rank: number; // 1 = best
  score: number;
  passedBoth: boolean;
  meanProfitFactor: number;
  meanRobustness: number;
  meanTrades: number;
  meanMaxDrawdown: number;
  meanOosNetProfit: number;
}

export interface RankingRecord {
  generatedAt: number;
  timeframe: string;
  selectedStrategyId: string | null;
  ranking: RankedStrategy[];
}

export interface RankDelta {
  rankDelta: number | null; // prevRank - curRank ; positive = moved up ; null = new
  prevRank: number | null;
  isNew: boolean;
}

const mean = (xs: number[]) =>
  xs.length ? xs.reduce((a, b) => a + (Number.isFinite(b) ? b : 0), 0) / xs.length : 0;

// Cap a profit factor for scoring so an "infinite" PF (zero losses on a tiny
// sample) can't dominate the ranking.
const safePf = (pf: number) => (Number.isFinite(pf) ? pf : 5);
const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

/** Transparent composite score. Documented and monotonic in every good thing. */
export function scoreOf(r: CrossAssetResult): number {
  const ds = Object.values(r.perSymbol);
  if (ds.length === 0) return 0;
  const pf = mean(ds.map((d) => safePf(d.walkForward.profitFactor)));
  const dd = mean(ds.map((d) => d.walkForward.maxDrawdown));
  const trades = mean(ds.map((d) => d.walkForward.totalTrades));
  const robustness = mean(ds.map((d) => d.robustness));
  // Below break-even PF earns no positive score.
  const edge = Math.max(0, pf - 1);
  const ddFactor = 1 - clamp(dd, 0, 0.9);
  const sampleFactor = Math.log10(10 + trades); // ~1 at 0 trades, grows slowly
  const robustFactor = clamp(robustness, 0, 2); // OOS edge that survived IS
  return edge * ddFactor * sampleFactor * (0.5 + 0.5 * robustFactor);
}

/** Rank ALL strategies by score (desc). Stable, 1-indexed. */
export function rankStrategies(results: CrossAssetResult[]): RankedStrategy[] {
  const scored = results.map((r) => {
    const ds = Object.values(r.perSymbol);
    return {
      strategyId: r.strategyId,
      strategyName: r.strategyName,
      category: "", // filled by caller that knows the registry
      rank: 0,
      score: scoreOf(r),
      passedBoth: r.passedBoth,
      meanProfitFactor: mean(ds.map((d) => safePf(d.walkForward.profitFactor))),
      meanRobustness: mean(ds.map((d) => d.robustness)),
      meanTrades: Math.round(mean(ds.map((d) => d.walkForward.totalTrades))),
      meanMaxDrawdown: mean(ds.map((d) => d.walkForward.maxDrawdown)),
      meanOosNetProfit: mean(ds.map((d) => d.outOfSample.netProfitPct)),
    };
  });
  scored.sort((a, b) => b.score - a.score);
  scored.forEach((s, i) => (s.rank = i + 1));
  return scored;
}

/** The id of the highest-ranked strategy that passed validation, or null. */
export function selectTopValidated(ranking: RankedStrategy[]): string | null {
  return ranking.find((r) => r.passedBoth)?.strategyId ?? null;
}

/** Per-strategy rank movement vs a previous ranking. */
export function diffRankings(
  current: RankedStrategy[],
  previous: RankedStrategy[] | null
): Record<string, RankDelta> {
  const prevById = new Map((previous ?? []).map((r) => [r.strategyId, r.rank]));
  const out: Record<string, RankDelta> = {};
  for (const r of current) {
    const prevRank = prevById.get(r.strategyId);
    if (prevRank == null) {
      out[r.strategyId] = { rankDelta: null, prevRank: null, isNew: previous != null };
    } else {
      out[r.strategyId] = { rankDelta: prevRank - r.rank, prevRank, isNew: false };
    }
  }
  return out;
}
