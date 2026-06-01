// core/strategies/breakoutRetest.ts
// Breakout of a rolling range, confirmed by a volume spike, traded with a
// trend filter. This is the "breakout and retest / support-resistance / volume
// spike" family from the brief, expressed as one coherent rule set.
//
// Logic: Track the Donchian high/low of the last `lookback` bars. A close that
// breaks the prior high (with above-average volume) in an uptrend = long. The
// stop sits back inside the range (a failed breakout invalidates the idea);
// the target is RR × risk.

import { cachedAtr, cachedDonchian, cachedEma, cachedVolumeZ } from "../indicatorCache";
import type { StrategyDef, StrategyContext, StrategySignal } from "../types";

export const breakoutRetest: StrategyDef = {
  id: "breakout-retest",
  name: "Range Breakout + Volume",
  category: "Breakout",
  logic:
    "Donchian(lookback) range. Long when price closes above the prior range high " +
    "with a volume z-score spike and EMA-trend agreement; short on the mirror. " +
    "Stop is placed back inside the broken level (ATR-buffered); target = RR × risk.",
  defaults: { lookback: 20, volZ: 1.5, emaTrend: 100, atrLen: 14, atrMult: 1.2, rr: 2 },
  grid: {
    lookback: [20, 30, 50],
    volZ: [1.0, 1.5, 2.0],
    atrMult: [1.0, 1.2, 1.6],
    rr: [2, 3],
  },
  evaluate(ctx: StrategyContext): StrategySignal {
    const { candles, i, params } = ctx;
    const need = Math.max(params.lookback, params.emaTrend, params.atrLen) + 2;
    if (i < need) return null;

    const dc = cachedDonchian(candles, params.lookback);
    const trend = cachedEma(candles, params.emaTrend);
    const vz = cachedVolumeZ(candles, params.lookback);
    const a = cachedAtr(candles, params.atrLen);

    const price = candles[i].close;
    const prevHigh = dc.upper[i];
    const prevLow = dc.lower[i];
    const trendNow = trend[i];
    const volNow = vz[i];
    const atrNow = a[i];
    if ([prevHigh, prevLow, trendNow, volNow, atrNow].some(Number.isNaN)) return null;

    const buffer = atrNow * params.atrMult;
    const conf = Math.min(1, 0.4 + Math.min(0.4, (volNow - params.volZ) * 0.15) + 0.15);

    // Long breakout: close clears the prior high, volume confirms, price above trend EMA.
    if (price > prevHigh && volNow >= params.volZ && price > trendNow) {
      const stop = prevHigh - buffer; // back inside the broken level
      const risk = price - stop;
      if (risk <= 0) return null;
      return {
        side: "long",
        refPrice: price,
        stopLoss: stop,
        takeProfit: price + risk * params.rr,
        confidence: conf,
        reason:
          `Broke the ${params.lookback}-bar high with a ${volNow.toFixed(1)}σ volume ` +
          `spike, price above the EMA${params.emaTrend} trend. Stop sits back inside the level.`,
      };
    }
    // Short breakdown: mirror.
    if (price < prevLow && volNow >= params.volZ && price < trendNow) {
      const stop = prevLow + buffer;
      const risk = stop - price;
      if (risk <= 0) return null;
      return {
        side: "short",
        refPrice: price,
        stopLoss: stop,
        takeProfit: price - risk * params.rr,
        confidence: conf,
        reason:
          `Broke the ${params.lookback}-bar low with a ${volNow.toFixed(1)}σ volume ` +
          `spike, price below the EMA${params.emaTrend} trend. Stop sits back inside the level.`,
      };
    }
    return null;
  },
};
