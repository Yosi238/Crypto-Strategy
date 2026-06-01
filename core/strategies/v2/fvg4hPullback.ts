// core/strategies/v2/fvg4hPullback.ts
// 4H Fair Value Gap with 1H Pullback Entry
//
// Identifies an unmitigated 4H Fair Value Gap (displacement candle + 3-bar
// imbalance) in the direction of the 4H trend, then enters when the 1H price
// pulls back into the FVG with a confirming 1H close.
//
// 4H candles are built by resampling the 1H candles in-strategy, cached via
// a module-level WeakMap so the build runs at most once per candle array
// (the same reference the backtester reuses across all bar evaluations).
//
// Causality:
//   - 4H EMA and ATR use only 4H bars fully completed before bar `i`.
//   - FVG check reads candles4h[j4+1] which must be ≤ idx4h (last complete 4H).
//   - Mitigation check reads no bar past idx4h.
//   - All 1H reads are at index ≤ i.

import { cachedAtr, cachedEma } from "../../indicatorCache";
import type { StrategyDef, StrategyContext, StrategySignal, Candle } from "../../types";

const FOUR_H_MS = 4 * 60 * 60 * 1000;

// ── 4H resampling ────────────────────────────────────────────────────────────
// Cached per unique 1H candle array reference so repeated evaluate() calls
// across all bars pay the build cost only once.
const _cache4h = new WeakMap<Candle[], Candle[]>();

/** Resample a 1H candle array into complete 4H OHLCV bars (only full periods). */
function build4h(c1h: Candle[]): Candle[] {
  const cached = _cache4h.get(c1h);
  if (cached) return cached;

  const result: Candle[] = [];
  if (c1h.length === 0) { _cache4h.set(c1h, result); return result; }

  let periodStart = Math.floor(c1h[0].time / FOUR_H_MS) * FOUR_H_MS;
  let bucket: Candle[] = [];

  for (const bar of c1h) {
    const barPeriod = Math.floor(bar.time / FOUR_H_MS) * FOUR_H_MS;
    if (barPeriod !== periodStart) {
      // Require ≥ 3 of the 4 expected 1H bars (tolerates rare gap).
      if (bucket.length >= 3) {
        result.push({
          time:   periodStart,
          open:   bucket[0].open,
          high:   Math.max(...bucket.map((b) => b.high)),
          low:    Math.min(...bucket.map((b) => b.low)),
          close:  bucket[bucket.length - 1].close,
          volume: bucket.reduce((s, b) => s + b.volume, 0),
        });
      }
      periodStart = barPeriod;
      bucket = [];
    }
    bucket.push(bar);
  }
  // The last (possibly incomplete) bucket is intentionally omitted.

  _cache4h.set(c1h, result);
  return result;
}

/**
 * Return the index of the last complete 4H bar whose period start ≤ the 4H
 * period containing `time1h`. Uses binary search (O(log n)).
 */
function find4hIdx(c4h: Candle[], time1h: number): number {
  const period = Math.floor(time1h / FOUR_H_MS) * FOUR_H_MS;
  let lo = 0, hi = c4h.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >>> 1;
    if (c4h[mid].time === period) return mid;
    if (c4h[mid].time < period)   lo = mid + 1;
    else                           hi = mid - 1;
  }
  // hi < lo: no exact match. hi is the largest index with time < period.
  return hi;
}

// ── Strategy definition ──────────────────────────────────────────────────────

export const fvg4hPullback: StrategyDef = {
  id: "fvg-4h-pullback",
  name: "4H FVG with 1H Pullback Entry",
  category: "Smart Money",
  logic:
    "Resamples 1H data into 4H bars, detects an unmitigated 4H Fair Value Gap " +
    "(displacement candle + 3-candle price gap) aligned with the 4H EMA trend, " +
    "then enters on a 1H bar whose close is inside the FVG and in the trend " +
    "direction. Stop beyond the FVG far edge; target = RR × risk.",
  defaults: {
    atrLen:        14,
    ema4hPeriod:   50,
    dispBodyMin:   0.55,
    dispRangeMult: 1.3,
    fvgLookback:   12,
    atrMult:       1.2,
    rr:            2,
  },
  grid: {
    ema4hPeriod:   [34, 50],
    dispBodyMin:   [0.50, 0.60],
    fvgLookback:   [8, 12],
    rr:            [2, 3],
  },

  evaluate(ctx: StrategyContext): StrategySignal {
    const { candles, i, params } = ctx;
    if (i < 50) return null;

    // ── Build / retrieve cached 4H candles ───────────────────────────────────
    const c4h = build4h(candles);
    if (c4h.length < 10) return null;

    // ── Find the last complete 4H bar for bar `i` ────────────────────────────
    const idx4h = find4hIdx(c4h, candles[i].time);
    if (idx4h < 5) return null;

    const emaPeriod = Math.floor(params.ema4hPeriod);
    if (idx4h < emaPeriod) return null;

    // ── 4H trend: EMA on 4H closes (cached via indicatorCache) ──────────────
    const ema4h = cachedEma(c4h, emaPeriod);
    const atr4h = cachedAtr(c4h, 14);

    const price4h = c4h[idx4h].close;
    const emaVal  = ema4h[idx4h];
    if (Number.isNaN(emaVal)) return null;

    const trend4h: "bullish" | "bearish" | "neutral" =
      price4h > emaVal * 1.0005 ? "bullish" :
      price4h < emaVal * 0.9995 ? "bearish" : "neutral";
    if (trend4h === "neutral") return null;

    // ── 1H data ──────────────────────────────────────────────────────────────
    const atr1h = cachedAtr(candles, params.atrLen);
    const atrNow = atr1h[i];
    if (Number.isNaN(atrNow) || atrNow <= 0) return null;

    const price1h = candles[i].close;

    // ── Scan recent 4H bars for an unmitigated FVG in the trend direction ────
    // j4 is the displacement candle. FVG check needs j4-1 and j4+1.
    // j4+1 must be ≤ idx4h (causal).
    const fvgMax = Math.floor(params.fvgLookback);
    const j4Start = Math.max(2, idx4h - fvgMax);

    for (let j4 = idx4h - 1; j4 >= j4Start; j4--) {
      if (j4 + 1 > idx4h) continue; // j4+1 must be a completed bar
      if (j4 - 1 < 0)     continue;

      const bar4  = c4h[j4];
      const barRange = bar4.high - bar4.low;
      if (barRange <= 0) continue;

      const bodyRatio = Math.abs(bar4.close - bar4.open) / barRange;

      // Use the 4H ATR at this bar for the displacement range check.
      const atr4At = atr4h[j4];
      if (Number.isNaN(atr4At) || atr4At <= 0) continue;
      const rangeMult = barRange / atr4At;

      // Displacement gate: large body, large range.
      if (bodyRatio < params.dispBodyMin || rangeMult < params.dispRangeMult) continue;

      const prev4 = c4h[j4 - 1];
      const next4 = c4h[j4 + 1];

      // ── Bullish 4H FVG ────────────────────────────────────────────────────
      if (trend4h === "bullish" && prev4.high < next4.low) {
        const fvgBottom = prev4.high;
        const fvgTop    = next4.low;

        // FVG must be wide enough to be meaningful.
        if (fvgTop - fvgBottom < atr4At * 0.3) continue;

        // Check if any completed 4H bar since j4+1 has closed BELOW fvgBottom
        // (which would mitigate the FVG).
        let mitigated = false;
        for (let m = j4 + 2; m <= idx4h; m++) {
          if (c4h[m].close < fvgBottom) { mitigated = true; break; }
        }
        if (mitigated) continue;

        // 1H price must be inside the 4H FVG.
        if (price1h < fvgBottom || price1h > fvgTop) continue;

        // 1H confirmation: bullish close inside the FVG.
        if (candles[i].close <= candles[i].open) continue;

        const stop = fvgBottom - atrNow * params.atrMult;
        const risk = price1h - stop;
        if (risk <= 0) continue;

        return {
          side: "long",
          refPrice: price1h,
          stopLoss: stop,
          takeProfit: price1h + risk * params.rr,
          confidence: 0.63,
          reason:
            `4H FVG pullback: 1H price inside 4H bullish FVG ` +
            `(${fvgBottom.toFixed(1)}–${fvgTop.toFixed(1)}); 4H trend bullish.`,
        };
      }

      // ── Bearish 4H FVG ────────────────────────────────────────────────────
      if (trend4h === "bearish" && prev4.low > next4.high) {
        const fvgTop    = prev4.low;
        const fvgBottom = next4.high;

        if (fvgTop - fvgBottom < atr4At * 0.3) continue;

        // Mitigated if any later 4H bar closed ABOVE fvgTop.
        let mitigated = false;
        for (let m = j4 + 2; m <= idx4h; m++) {
          if (c4h[m].close > fvgTop) { mitigated = true; break; }
        }
        if (mitigated) continue;

        // 1H price must be inside the 4H FVG.
        if (price1h < fvgBottom || price1h > fvgTop) continue;

        // 1H confirmation: bearish close inside the FVG.
        if (candles[i].close >= candles[i].open) continue;

        const stop = fvgTop + atrNow * params.atrMult;
        const risk = stop - price1h;
        if (risk <= 0) continue;

        return {
          side: "short",
          refPrice: price1h,
          stopLoss: stop,
          takeProfit: price1h - risk * params.rr,
          confidence: 0.63,
          reason:
            `4H FVG pullback: 1H price inside 4H bearish FVG ` +
            `(${fvgBottom.toFixed(1)}–${fvgTop.toFixed(1)}); 4H trend bearish.`,
        };
      }
    }

    return null;
  },
};
