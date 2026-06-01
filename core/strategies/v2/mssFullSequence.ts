// core/strategies/v2/mssFullSequence.ts
// MSS Full Sequence: Equal Highs/Lows Pool → Sweep → Displacement + FVG → MSS
//
// Detects the complete institutional sequence:
//   1. A liquidity pool forms: 2+ confirmed swing highs (or lows) within
//      `poolTol` % of each other within the last `poolLookback` bars.
//   2. A sweep bar: the bar's wick goes beyond the pool level and the bar
//      CLOSES back on the other side (stop hunt confirmed).
//   3. The sweep bar is a displacement: high body/range ratio + range > ATR × mult.
//   4. A Fair Value Gap is created by the displacement (3-candle imbalance).
//   5. The current bar closes in the reversal direction (MSS confirmation).
//
// Entry: close of bar `i` (the confirming bar). Fill at next bar open.
// Stop:  beyond the sweep wick extreme + ATR buffer.
// TP:    RR × risk.
//
// Causality: the FVG check reads candles[k+1] where k ≤ i-1, so k+1 ≤ i.
// Every read is at or before the current bar's close.

import { cachedAtr, cachedSwings } from "../../indicatorCache";
import type { StrategyDef, StrategyContext, StrategySignal, Candle } from "../../types";

interface Pool {
  level: number;
  type: "high" | "low";
  newerIdx: number; // index of the newer swing point in the pair
}

/**
 * Find the most recent equal-highs or equal-lows pool within the lookback
 * window. Returns the pool with the highest newerIdx (most recent).
 */
function findPool(
  swingHighs: number[],
  swingLows:  number[],
  limitIdx:   number,   // i - look  (most recent confirmed swing index)
  poolLookback: number,
  poolTol: number
): Pool | null {
  const start = Math.max(0, limitIdx - poolLookback);

  // Collect confirmed swing highs in [start, limitIdx]
  const highs: Array<{ price: number; idx: number }> = [];
  const lows:  Array<{ price: number; idx: number }> = [];
  for (let j = start; j <= limitIdx; j++) {
    if (!Number.isNaN(swingHighs[j])) highs.push({ price: swingHighs[j], idx: j });
    if (!Number.isNaN(swingLows[j]))  lows.push({ price: swingLows[j],  idx: j });
  }

  // Find the most recent pair of equal highs (scan newest-first).
  for (let a = highs.length - 1; a >= 1; a--) {
    for (let b = a - 1; b >= 0; b--) {
      if (highs[a].idx - highs[b].idx > 150) break; // too far apart
      const relDiff = Math.abs(highs[a].price - highs[b].price) / (highs[b].price || 1);
      if (relDiff <= poolTol) {
        return {
          level: (highs[a].price + highs[b].price) / 2,
          type: "high",
          newerIdx: highs[a].idx,
        };
      }
    }
  }

  // Find the most recent pair of equal lows.
  for (let a = lows.length - 1; a >= 1; a--) {
    for (let b = a - 1; b >= 0; b--) {
      if (lows[a].idx - lows[b].idx > 150) break;
      const relDiff = Math.abs(lows[a].price - lows[b].price) / (lows[b].price || 1);
      if (relDiff <= poolTol) {
        return {
          level: (lows[a].price + lows[b].price) / 2,
          type: "low",
          newerIdx: lows[a].idx,
        };
      }
    }
  }

  return null;
}

export const mssFullSequence: StrategyDef = {
  id: "mss-full-sequence",
  name: "MSS Full Sequence (Pool → Sweep → FVG → MSS)",
  category: "Smart Money",
  logic:
    "Detects the full institutional sequence: (1) equal-highs or equal-lows " +
    "liquidity pool forms, (2) pool is swept by a displacement candle that " +
    "closes back inside the pool range, (3) a Fair Value Gap is created by the " +
    "sweep displacement, (4) the current bar confirms the reversal direction. " +
    "Stop beyond the sweep wick; target = RR × risk.",
  defaults: {
    look:          5,
    atrLen:        14,
    poolTol:       0.005,
    poolLookback:  80,
    sweepLook:     8,
    dispBodyMin:   0.55,
    dispRangeMult: 1.3,
    atrMult:       1.3,
    rr:            2,
  },
  grid: {
    look:        [4, 5],
    poolTol:     [0.004, 0.006],
    dispBodyMin: [0.50, 0.60],
    rr:          [2, 3],
  },

  evaluate(ctx: StrategyContext): StrategySignal {
    const { candles, i, params } = ctx;
    const look = Math.floor(params.look);
    if (i < look + 30) return null;

    const { highs, lows } = cachedSwings(candles, look);
    const atrArr = cachedAtr(candles, params.atrLen);
    const atrNow = atrArr[i];
    if (Number.isNaN(atrNow) || atrNow <= 0) return null;

    // Most recent confirmed swing index (swings lag by `look` bars).
    const limitIdx = i - look;

    const pool = findPool(
      highs, lows, limitIdx,
      Math.floor(params.poolLookback),
      params.poolTol
    );
    if (!pool) return null;

    // Scan backwards for a qualifying sweep bar:
    //   - wick beyond the pool level
    //   - close back inside (on the reversal side)
    //   - displacement body and range
    //   - FVG created (3-candle gap; reads candles[k+1] which must be ≤ i, so k ≤ i-1)
    const sweepStart = Math.max(pool.newerIdx + 1, i - Math.floor(params.sweepLook));
    const sweepEnd   = i - 1; // keep k ≤ i-1 so candles[k+1] ≤ candles[i] (causal)

    let sweepSide:    "long" | "short" | null = null;
    let sweepExtreme: number = NaN;

    for (let k = sweepEnd; k >= sweepStart; k--) {
      if (k < 1) continue; // need candles[k-1] for FVG check
      const bar    = candles[k];
      const barRange = bar.high - bar.low;
      if (barRange <= 0) continue;

      const atrK     = atrArr[k];
      if (Number.isNaN(atrK) || atrK <= 0) continue;
      const bodyRatio = Math.abs(bar.close - bar.open) / barRange;
      const rangeMult = barRange / atrK;

      // Displacement quality gate.
      if (bodyRatio < params.dispBodyMin || rangeMult < params.dispRangeMult) continue;

      const prev = candles[k - 1];
      const next = candles[k + 1]; // k+1 ≤ i (causal, since k ≤ i-1)

      if (pool.type === "high") {
        // Bearish sweep: wick above pool, close back below, bar is bearish.
        if (bar.high > pool.level && bar.close < pool.level && bar.close < bar.open) {
          // Bearish FVG: gap between prev.low and next.high (price moved down so fast
          // that the area between next.high and prev.low was never traded).
          if (prev.low > next.high) {
            sweepSide    = "short";
            sweepExtreme = bar.high;
            break;
          }
        }
      } else {
        // Bullish sweep: wick below pool, close back above, bar is bullish.
        if (bar.low < pool.level && bar.close > pool.level && bar.close > bar.open) {
          // Bullish FVG: gap between prev.high and next.low.
          if (prev.high < next.low) {
            sweepSide    = "long";
            sweepExtreme = bar.low;
            break;
          }
        }
      }
    }

    if (sweepSide === null) return null;

    // MSS confirmation: current bar closes in the reversal direction.
    const current = candles[i];

    if (sweepSide === "long") {
      if (current.close <= current.open) return null; // need bullish confirmation
      const stop = sweepExtreme - atrNow * params.atrMult;
      const risk = current.close - stop;
      if (risk <= 0) return null;
      return {
        side: "long",
        refPrice: current.close,
        stopLoss: stop,
        takeProfit: current.close + risk * params.rr,
        confidence: 0.62,
        reason:
          `MSS full sequence: equal-lows pool (${pool.level.toFixed(1)}) swept → ` +
          `displacement FVG → bullish MSS confirmation.`,
      };
    } else {
      if (current.close >= current.open) return null; // need bearish confirmation
      const stop = sweepExtreme + atrNow * params.atrMult;
      const risk = stop - current.close;
      if (risk <= 0) return null;
      return {
        side: "short",
        refPrice: current.close,
        stopLoss: stop,
        takeProfit: current.close - risk * params.rr,
        confidence: 0.62,
        reason:
          `MSS full sequence: equal-highs pool (${pool.level.toFixed(1)}) swept → ` +
          `displacement FVG → bearish MSS confirmation.`,
      };
    }
  },
};
