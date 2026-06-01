// core/validation.ts
// The discipline layer. This is what separates "I fit a curve to the past" from
// "this survived honest testing". Three guards:
//
//  1. OUT-OF-SAMPLE SPLIT. Parameters are chosen ONLY on the first 70% of bars
//     (the "discovery" set). The final verdict is read off the untouched last
//     30% (the "validation" set). A strategy that only works in-sample is junk.
//
//  2. WALK-FORWARD. We slide a train/test window across the whole series,
//     re-optimising on each train slice and trading the next test slice with
//     those params, then stitch the out-of-sample test trades together. This
//     approximates "what would I actually have earned trading this live as
//     params were re-tuned periodically".
//
//  3. HARD GATES. A strategy is only KEPT if it clears every threshold on the
//     out-of-sample data, for BOTH symbols. No partial credit.
//
// Overfitting guard: the grid is deliberately coarse, and we penalise configs
// whose in-sample edge collapses out-of-sample (see `robustness`).

import { runBacktest } from "./backtest";
import { computeMetrics } from "./metrics";
import type {
  BacktestConfig,
  BacktestResult,
  Candle,
  PerformanceMetrics,
  StrategyDef,
} from "./types";

export interface Gates {
  minTrades: number;
  minProfitFactor: number;
  maxDrawdown: number;
  requirePositiveOOS: boolean;
}

export const DEFAULT_GATES: Gates = {
  minTrades: 200,
  minProfitFactor: 1.4,
  maxDrawdown: 0.2,
  requirePositiveOOS: true,
};

export interface ParamSet {
  [k: string]: number;
}

/** Cartesian product of a coarse grid, merged onto the strategy defaults. */
export function expandGrid(strategy: StrategyDef): ParamSet[] {
  const keys = Object.keys(strategy.grid);
  if (keys.length === 0) return [{ ...strategy.defaults }];
  let combos: ParamSet[] = [{ ...strategy.defaults }];
  for (const key of keys) {
    const next: ParamSet[] = [];
    for (const base of combos) {
      for (const v of strategy.grid[key]) next.push({ ...base, [key]: v });
    }
    combos = next;
  }
  return combos;
}

export interface DiscoveryResult {
  strategyId: string;
  strategyName: string;
  bestParams: ParamSet;
  inSample: PerformanceMetrics;
  outOfSample: PerformanceMetrics;
  walkForward: PerformanceMetrics;
  /** OOS profit factor / IS profit factor — how much edge survived. */
  robustness: number;
  passed: boolean;
  failedGates: string[];
}

function score(m: PerformanceMetrics): number {
  // Selection objective on the DISCOVERY set. Reward profit factor and trade
  // count (statistical significance), penalise drawdown. Deliberately simple —
  // a fancy objective is just another way to overfit.
  if (m.totalTrades < 30) return -Infinity;
  const pf = Number.isFinite(m.profitFactor) ? m.profitFactor : 3;
  return pf * (1 - m.maxDrawdown) * Math.log10(10 + m.totalTrades);
}

/** Split candles by fraction without shuffling (time order is sacred). */
export function splitSeries(candles: Candle[], trainFrac = 0.7) {
  const cut = Math.floor(candles.length * trainFrac);
  return { train: candles.slice(0, cut), test: candles.slice(cut) };
}

/**
 * Walk-forward: anchored expanding-window is simpler and less leaky than a
 * rolling window for this purpose. We re-optimise on [0..k) and trade [k..k+step).
 */
function walkForward(
  candles: Candle[],
  strategy: StrategyDef,
  config: BacktestConfig,
  folds = 5
): { metrics: PerformanceMetrics; trades: BacktestResult["trades"] } {
  const grid = expandGrid(strategy);
  const n = candles.length;
  const initialTrain = Math.floor(n * 0.4);
  const step = Math.floor((n - initialTrain) / folds);
  const stitchedTrades: BacktestResult["trades"] = [];

  for (let f = 0; f < folds; f++) {
    const trainEnd = initialTrain + f * step;
    const testEnd = f === folds - 1 ? n : trainEnd + step;
    const train = candles.slice(0, trainEnd);
    const test = candles.slice(Math.max(0, trainEnd - 250), testEnd); // warm-up overlap
    if (test.length < 50) continue;

    let best: ParamSet | null = null;
    let bestScore = -Infinity;
    for (const p of grid) {
      const r = runBacktest(train, strategy, p, config);
      const s = score(r.metrics);
      if (s > bestScore) {
        bestScore = s;
        best = p;
      }
    }
    if (!best) continue;
    const testRun = runBacktest(test, strategy, best, config);
    // Only keep trades that ENTERED after the train cutoff (true OOS).
    const cutoffTime = candles[trainEnd - 1]?.time ?? 0;
    for (const t of testRun.trades) {
      if (t.entry.time > cutoffTime) stitchedTrades.push(t);
    }
  }

  // Rebuild an equity curve from the stitched OOS trades.
  let equity = config.initialEquity;
  const curve = [{ time: candles[0]?.time ?? 0, equity }];
  const sorted = [...stitchedTrades].sort((a, b) => a.exit.time - b.exit.time);
  for (const t of sorted) {
    equity += t.pnl;
    curve.push({ time: t.exit.time, equity });
  }
  return {
    trades: sorted,
    metrics: computeMetrics(sorted, curve, config.initialEquity),
  };
}

/** Run full discovery for ONE strategy on ONE symbol's candles. */
export function discoverStrategy(
  candles: Candle[],
  strategy: StrategyDef,
  config: BacktestConfig,
  gates: Gates = DEFAULT_GATES
): DiscoveryResult {
  const { train, test } = splitSeries(candles, 0.7);
  const grid = expandGrid(strategy);

  // 1. Choose params ONLY on the discovery (train) set.
  let bestParams: ParamSet = { ...strategy.defaults };
  let bestScore = -Infinity;
  let bestIS: PerformanceMetrics | null = null;
  for (const p of grid) {
    const r = runBacktest(train, strategy, p, config);
    const s = score(r.metrics);
    if (s > bestScore) {
      bestScore = s;
      bestParams = p;
      bestIS = r.metrics;
    }
  }

  // 2. Read the verdict off the untouched validation (test) set.
  const oos = runBacktest(test, strategy, bestParams, config).metrics;

  // 3. Walk-forward across the full series.
  const wf = walkForward(candles, strategy, config).metrics;

  const inSample = bestIS ?? runBacktest(train, strategy, bestParams, config).metrics;
  const robustness =
    inSample.profitFactor > 0 && Number.isFinite(inSample.profitFactor)
      ? (Number.isFinite(oos.profitFactor) ? oos.profitFactor : 3) /
        inSample.profitFactor
      : 0;

  // Gates are checked against the WALK-FORWARD result (the most honest proxy
  // for live trading), with the OOS slice as a secondary confirmation.
  const failed: string[] = [];
  if (wf.totalTrades < gates.minTrades)
    failed.push(`trades ${wf.totalTrades} < ${gates.minTrades}`);
  if (!(wf.profitFactor >= gates.minProfitFactor))
    failed.push(`profit factor ${fmt(wf.profitFactor)} < ${gates.minProfitFactor}`);
  if (wf.maxDrawdown > gates.maxDrawdown)
    failed.push(`max drawdown ${(wf.maxDrawdown * 100).toFixed(1)}% > ${gates.maxDrawdown * 100}%`);
  if (gates.requirePositiveOOS && oos.netProfit <= 0)
    failed.push("out-of-sample net profit not positive");
  if (robustness < 0.5)
    failed.push(`edge collapsed out-of-sample (robustness ${robustness.toFixed(2)})`);

  return {
    strategyId: strategy.id,
    strategyName: strategy.name,
    bestParams,
    inSample,
    outOfSample: oos,
    walkForward: wf,
    robustness,
    passed: failed.length === 0,
    failedGates: failed,
  };
}

function fmt(x: number) {
  return Number.isFinite(x) ? x.toFixed(2) : "∞";
}

/**
 * Discover across all strategies for BOTH symbols. A strategy only truly
 * "passes" if it clears the gates on BTC *and* ETH — that cross-asset
 * requirement is itself a strong anti-overfit filter.
 */
export interface CrossAssetResult {
  strategyId: string;
  strategyName: string;
  perSymbol: Record<string, DiscoveryResult>;
  passedBoth: boolean;
}

export function discoverAcrossSymbols(
  bySymbol: Record<string, Candle[]>,
  strategies: StrategyDef[],
  config: BacktestConfig,
  gates: Gates = DEFAULT_GATES
): CrossAssetResult[] {
  const symbols = Object.keys(bySymbol);
  const results: CrossAssetResult[] = [];
  for (const strat of strategies) {
    const perSymbol: Record<string, DiscoveryResult> = {};
    for (const sym of symbols) {
      perSymbol[sym] = discoverStrategy(bySymbol[sym], strat, config, gates);
    }
    results.push({
      strategyId: strat.id,
      strategyName: strat.name,
      perSymbol,
      passedBoth: symbols.every((s) => perSymbol[s].passed),
    });
  }
  // Rank: passed-both first, then by mean walk-forward profit factor.
  return results.sort((a, b) => {
    if (a.passedBoth !== b.passedBoth) return a.passedBoth ? -1 : 1;
    return meanPF(b) - meanPF(a);
  });
}

function meanPF(r: CrossAssetResult): number {
  const vals = Object.values(r.perSymbol).map((d) =>
    Number.isFinite(d.walkForward.profitFactor) ? d.walkForward.profitFactor : 3
  );
  return vals.reduce((s, v) => s + v, 0) / (vals.length || 1);
}
