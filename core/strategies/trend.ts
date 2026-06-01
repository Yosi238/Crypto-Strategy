// core/strategies/trend.ts
// Trend-following family. All entries are WITH the prevailing trend; stops are
// ATR-based; targets are RR multiples of the stop distance. Every read is
// causal (index <= i).

import { cachedAtr, cachedEma } from "../indicatorCache";
import type { StrategyDef, StrategyContext, StrategySignal } from "../types";

// ── EMA Cross ────────────────────────────────────────────────────────────────
// Enter on the bar where the fast EMA crosses the slow EMA. The simplest, most
// honest trend entry — and a useful baseline: if fancier strategies can't beat
// a plain cross out-of-sample, they're probably overfit.
export const emaCross: StrategyDef = {
  id: "ema-cross",
  name: "EMA Cross",
  category: "Trend",
  logic:
    "Go long when the fast EMA crosses above the slow EMA, short on the cross " +
    "below. ATR stop, RR target. A deliberately simple trend baseline.",
  defaults: { emaFast: 21, emaSlow: 55, atrLen: 14, atrMult: 2, rr: 2 },
  grid: { emaFast: [13, 21, 34], emaSlow: [55, 89], atrMult: [1.5, 2, 2.5], rr: [2, 3] },
  evaluate(ctx: StrategyContext): StrategySignal {
    const { candles, i, params } = ctx;
    const need = Math.max(params.emaSlow, params.atrLen) + 2;
    if (i < need) return null;
    const f = cachedEma(candles, params.emaFast);
    const s = cachedEma(candles, params.emaSlow);
    const a = cachedAtr(candles, params.atrLen);
    const price = candles[i].close;
    if ([f[i], s[i], f[i - 1], s[i - 1], a[i]].some(Number.isNaN)) return null;

    const crossedUp = f[i - 1] <= s[i - 1] && f[i] > s[i];
    const crossedDn = f[i - 1] >= s[i - 1] && f[i] < s[i];
    const stop = a[i] * params.atrMult;
    if (stop <= 0) return null;
    const sep = Math.abs(f[i] - s[i]) / price;
    const conf = Math.min(1, 0.5 + sep * 8);

    if (crossedUp)
      return { side: "long", refPrice: price, stopLoss: price - stop, takeProfit: price + stop * params.rr, confidence: conf, reason: `EMA${params.emaFast} crossed above EMA${params.emaSlow}.` };
    if (crossedDn)
      return { side: "short", refPrice: price, stopLoss: price + stop, takeProfit: price - stop * params.rr, confidence: conf, reason: `EMA${params.emaFast} crossed below EMA${params.emaSlow}.` };
    return null;
  },
};

// ── Multi-Timeframe EMA ──────────────────────────────────────────────────────
// Each evaluate() call only sees ONE timeframe's candles. We approximate a
// higher-timeframe trend filter with a much longer EMA on the same series
// (a long EMA on 1h behaves like a shorter EMA on 4h). Honest approximation,
// not a true multi-feed — noted so nobody mistakes it for HTF data.
export const mtfEma: StrategyDef = {
  id: "mtf-ema",
  name: "Multi-Timeframe EMA",
  category: "Trend",
  logic:
    "Higher-timeframe bias via a long EMA proxy; entry on the lower-timeframe " +
    "fast/mid EMA alignment in the same direction. ATR stop, RR target.",
  defaults: { emaFast: 9, emaMid: 21, emaHtf: 200, atrLen: 14, atrMult: 2, rr: 2 },
  grid: { emaMid: [21, 34], emaHtf: [150, 200, 300], atrMult: [1.8, 2.2], rr: [2, 3] },
  evaluate(ctx: StrategyContext): StrategySignal {
    const { candles, i, params } = ctx;
    const need = Math.max(params.emaHtf, params.atrLen) + 2;
    if (i < need) return null;
    const f = cachedEma(candles, params.emaFast);
    const m = cachedEma(candles, params.emaMid);
    const h = cachedEma(candles, params.emaHtf);
    const a = cachedAtr(candles, params.atrLen);
    const price = candles[i].close;
    if ([f[i], m[i], h[i], f[i - 1], m[i - 1], a[i]].some(Number.isNaN)) return null;

    const htfUp = price > h[i];
    const htfDn = price < h[i];
    const ltfUp = f[i - 1] <= m[i - 1] && f[i] > m[i];
    const ltfDn = f[i - 1] >= m[i - 1] && f[i] < m[i];
    const stop = a[i] * params.atrMult;
    if (stop <= 0) return null;
    const conf = Math.min(1, 0.55 + Math.abs(price - h[i]) / price * 5);

    if (htfUp && ltfUp)
      return { side: "long", refPrice: price, stopLoss: price - stop, takeProfit: price + stop * params.rr, confidence: conf, reason: "Price above HTF EMA proxy; fast EMA crossed up on the lower timeframe." };
    if (htfDn && ltfDn)
      return { side: "short", refPrice: price, stopLoss: price + stop, takeProfit: price - stop * params.rr, confidence: conf, reason: "Price below HTF EMA proxy; fast EMA crossed down on the lower timeframe." };
    return null;
  },
};

// ── Trend Continuation ───────────────────────────────────────────────────────
// In an established trend, wait for a shallow pullback to the mid EMA, then
// enter on the first bar that closes back in the trend direction.
export const trendContinuation: StrategyDef = {
  id: "trend-continuation",
  name: "Trend Continuation",
  category: "Trend",
  logic:
    "Established trend (EMA fast>slow). Wait for a pullback that touches the mid " +
    "EMA, then enter when a bar closes back in the trend direction. ATR stop, RR target.",
  defaults: { emaFast: 21, emaMid: 50, emaSlow: 200, atrLen: 14, atrMult: 1.8, rr: 2.5 },
  grid: { emaMid: [34, 50], atrMult: [1.5, 1.8, 2.2], rr: [2, 2.5, 3] },
  evaluate(ctx: StrategyContext): StrategySignal {
    const { candles, i, params } = ctx;
    const need = Math.max(params.emaSlow, params.atrLen) + 2;
    if (i < need) return null;
    const f = cachedEma(candles, params.emaFast);
    const mid = cachedEma(candles, params.emaMid);
    const s = cachedEma(candles, params.emaSlow);
    const a = cachedAtr(candles, params.atrLen);
    const c = candles[i];
    const cp = candles[i - 1];
    if ([f[i], mid[i], s[i], a[i]].some(Number.isNaN)) return null;

    const up = f[i] > s[i] && mid[i] > s[i];
    const dn = f[i] < s[i] && mid[i] < s[i];
    const stop = a[i] * params.atrMult;
    if (stop <= 0) return null;
    // Pullback touched mid EMA last bar, resumption close this bar.
    const pulledBackUp = cp.low <= mid[i - 1] && c.close > c.open && c.close > mid[i];
    const pulledBackDn = cp.high >= mid[i - 1] && c.close < c.open && c.close < mid[i];
    const conf = Math.min(1, 0.55 + Math.abs(f[i] - s[i]) / c.close * 5);

    if (up && pulledBackUp)
      return { side: "long", refPrice: c.close, stopLoss: c.close - stop, takeProfit: c.close + stop * params.rr, confidence: conf, reason: "Uptrend pullback to mid EMA, resumed with a bullish close." };
    if (dn && pulledBackDn)
      return { side: "short", refPrice: c.close, stopLoss: c.close + stop, takeProfit: c.close - stop * params.rr, confidence: conf, reason: "Downtrend pullback to mid EMA, resumed with a bearish close." };
    return null;
  },
};
