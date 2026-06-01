// core/strategies/liquiditySweep.ts
// "Liquidity sweep" / stop-hunt reversal. The idea traders describe: price pokes
// just beyond a recent swing low (sweeping the stops resting there), then snaps
// back above it on the SAME or NEXT close — a failed breakdown. We trade the
// reclaim, not the poke.
//
// We use confirmed swing pivots (offset to stay causal) as the liquidity levels.

import { cachedAtr, cachedSwings } from "../indicatorCache";
import type { StrategyDef, StrategyContext, StrategySignal } from "../types";

export const liquiditySweep: StrategyDef = {
  id: "liquidity-sweep",
  name: "Liquidity Sweep Reversal",
  category: "Smart Money",
  logic:
    "Find a confirmed swing low/high (a resting-liquidity level). A long fires when " +
    "the current bar's LOW pierces that swing low but the bar CLOSES back above it — " +
    "a failed breakdown / stop sweep. Stop below the sweep wick; target = RR × risk.",
  defaults: { swingLook: 5, atrLen: 14, atrMult: 0.8, rr: 2, maxAgeBars: 40 },
  grid: {
    swingLook: [4, 5, 7],
    atrMult: [0.6, 0.8, 1.2],
    rr: [2, 3],
  },
  evaluate(ctx: StrategyContext): StrategySignal {
    const { candles, i, params } = ctx;
    const look = params.swingLook;
    const need = Math.max(look * 2, params.atrLen) + 2;
    if (i < need) return null;

    const { highs, lows } = cachedSwings(candles, look);
    const a = cachedAtr(candles, params.atrLen);
    const bar = candles[i];
    const atrNow = a[i];
    if (Number.isNaN(atrNow)) return null;

    // Most recent CONFIRMED swing low/high (confirmation lags by `look` bars).
    let swingLow = NaN;
    let swingHigh = NaN;
    for (let j = i - look; j >= Math.max(0, i - look - params.maxAgeBars); j--) {
      if (Number.isNaN(swingLow) && !Number.isNaN(lows[j])) swingLow = lows[j];
      if (Number.isNaN(swingHigh) && !Number.isNaN(highs[j])) swingHigh = highs[j];
      if (!Number.isNaN(swingLow) && !Number.isNaN(swingHigh)) break;
    }

    const buffer = atrNow * params.atrMult;

    // Bullish sweep: wick below the swing low, close back above it.
    if (!Number.isNaN(swingLow) && bar.low < swingLow && bar.close > swingLow) {
      const stop = bar.low - buffer;
      const risk = bar.close - stop;
      if (risk <= 0) return null;
      const conf = Math.min(1, 0.5 + Math.min(0.4, (swingLow - bar.low) / (atrNow || 1) * 0.2));
      return {
        side: "long",
        refPrice: bar.close,
        stopLoss: stop,
        takeProfit: bar.close + risk * params.rr,
        confidence: conf,
        reason:
          `Price swept liquidity below the prior swing low (${swingLow.toFixed(1)}) then ` +
          `reclaimed it on the close — a failed breakdown. Stop sits below the sweep wick.`,
      };
    }
    // Bearish sweep: wick above the swing high, close back below it.
    if (!Number.isNaN(swingHigh) && bar.high > swingHigh && bar.close < swingHigh) {
      const stop = bar.high + buffer;
      const risk = stop - bar.close;
      if (risk <= 0) return null;
      const conf = Math.min(1, 0.5 + Math.min(0.4, (bar.high - swingHigh) / (atrNow || 1) * 0.2));
      return {
        side: "short",
        refPrice: bar.close,
        stopLoss: stop,
        takeProfit: bar.close - risk * params.rr,
        confidence: conf,
        reason:
          `Price swept liquidity above the prior swing high (${swingHigh.toFixed(1)}) then ` +
          `rejected it on the close — a failed breakout. Stop sits above the sweep wick.`,
      };
    }
    return null;
  },
};
