// core/strategies/emaRsiTrend.ts
// Trend-following with a momentum pullback entry.
//
// Logic: Use EMA50 vs EMA200 as the regime filter (the classic "golden/death
// cross" state). Only go WITH the trend. Enter when RSI dips into a pullback
// zone and turns back up — i.e. buy a shallow dip inside an uptrend, sell a
// shallow bounce inside a downtrend. ATR sets the stop; RR sets the target.

import { cachedAtr, cachedEma, cachedRsi } from "../indicatorCache";
import type { StrategyDef, StrategyContext, StrategySignal } from "../types";

export const emaRsiTrend: StrategyDef = {
  id: "ema-rsi-trend",
  name: "EMA Trend + RSI Pullback",
  category: "Trend",
  logic:
    "Regime filter EMA50/EMA200. In an uptrend, buy when RSI pulls back below " +
    "the buy threshold and ticks up. In a downtrend, mirror for shorts. Stop = " +
    "entry ± ATR×mult; target = RR × stop distance.",
  defaults: { emaFast: 50, emaSlow: 200, rsiLen: 14, rsiBuy: 40, rsiSell: 60, atrLen: 14, atrMult: 1.8, rr: 2 },
  grid: {
    rsiBuy: [35, 40, 45],
    rsiSell: [55, 60, 65],
    atrMult: [1.5, 1.8, 2.2],
    rr: [2, 3],
  },
  evaluate(ctx: StrategyContext): StrategySignal {
    const { candles, i, params } = ctx;
    const need = Math.max(params.emaSlow, params.atrLen, params.rsiLen) + 2;
    if (i < need) return null;

    const emaFast = cachedEma(candles, params.emaFast);
    const emaSlow = cachedEma(candles, params.emaSlow);
    const r = cachedRsi(candles, params.rsiLen);
    const a = cachedAtr(candles, params.atrLen);

    const fast = emaFast[i];
    const slow = emaSlow[i];
    const rNow = r[i];
    const rPrev = r[i - 1];
    const atrNow = a[i];
    const price = candles[i].close;
    if ([fast, slow, rNow, rPrev, atrNow].some(Number.isNaN)) return null;

    const upTrend = fast > slow;
    const downTrend = fast < slow;
    const stopDist = atrNow * params.atrMult;
    if (stopDist <= 0) return null;

    // Confidence scales with trend separation and RSI turn strength.
    const sep = Math.abs(fast - slow) / price; // 0..~0.1
    const conf = Math.min(1, 0.45 + sep * 6 + Math.min(0.2, Math.abs(rNow - rPrev) / 50));

    if (upTrend && rPrev < params.rsiBuy && rNow > rPrev) {
      return {
        side: "long",
        refPrice: price,
        stopLoss: price - stopDist,
        takeProfit: price + stopDist * params.rr,
        confidence: conf,
        reason:
          `Uptrend (EMA${params.emaFast} above EMA${params.emaSlow}). RSI dipped to ` +
          `${rPrev.toFixed(0)} and turned up — buying the pullback.`,
      };
    }
    if (downTrend && rPrev > params.rsiSell && rNow < rPrev) {
      return {
        side: "short",
        refPrice: price,
        stopLoss: price + stopDist,
        takeProfit: price - stopDist * params.rr,
        confidence: conf,
        reason:
          `Downtrend (EMA${params.emaFast} below EMA${params.emaSlow}). RSI bounced to ` +
          `${rPrev.toFixed(0)} and rolled over — selling the rally.`,
      };
    }
    return null;
  },
};
