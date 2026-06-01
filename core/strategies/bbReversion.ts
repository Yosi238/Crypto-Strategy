// core/strategies/bbReversion.ts
// Mean reversion at Bollinger Band extremes, gated by a volatility filter so we
// only fade in conditions where reversion historically behaves. MACD histogram
// is used as a "momentum is fading" confirmation to avoid catching falling knives.
//
// Logic: Price closes outside the lower band (oversold) AND the MACD histogram
// is turning up => long back toward the mean. Only when band width is within a
// sane regime (not a volatility explosion). Mirror for shorts.

import { cachedAtr, cachedBollinger, cachedMacd } from "../indicatorCache";
import type { StrategyDef, StrategyContext, StrategySignal } from "../types";

export const bbReversion: StrategyDef = {
  id: "bb-reversion",
  name: "Bollinger Reversion + MACD",
  category: "Mean Reversion",
  logic:
    "Fade Bollinger extremes only inside a controlled-volatility regime. Long when " +
    "price closes below the lower band and the MACD histogram turns up; short on the " +
    "mirror. Stop beyond the band; target back at the mean (band middle) or RR × risk.",
  defaults: { bbLen: 20, bbMult: 2, maxWidth: 0.12, atrLen: 14, atrMult: 1.0, rr: 2 },
  grid: {
    bbMult: [2, 2.5],
    maxWidth: [0.08, 0.12, 0.18],
    atrMult: [0.8, 1.0, 1.4],
    rr: [2, 3],
  },
  evaluate(ctx: StrategyContext): StrategySignal {
    const { candles, i, params } = ctx;
    const need = Math.max(params.bbLen, 26, params.atrLen) + 10;
    if (i < need) return null;

    const bb = cachedBollinger(candles, params.bbLen, params.bbMult);
    const m = cachedMacd(candles);
    const a = cachedAtr(candles, params.atrLen);

    const price = candles[i].close;
    const lower = bb.lower[i];
    const upper = bb.upper[i];
    const mid = bb.middle[i];
    const width = bb.width[i];
    const histNow = m.histogram[i];
    const histPrev = m.histogram[i - 1];
    const atrNow = a[i];
    if ([lower, upper, mid, width, histNow, histPrev, atrNow].some(Number.isNaN))
      return null;

    // Volatility filter: skip when bands are blown out (regime change risk).
    if (width > params.maxWidth) return null;
    const buffer = atrNow * params.atrMult;
    const conf = Math.min(1, 0.4 + Math.min(0.3, (params.maxWidth - width) * 2) + 0.1);

    // Oversold reversion long: closed below lower band, histogram turning up.
    if (price < lower && histNow > histPrev) {
      const stop = price - buffer;
      const target = Math.max(mid, price + (price - stop) * params.rr);
      return {
        side: "long",
        refPrice: price,
        stopLoss: stop,
        takeProfit: target,
        confidence: conf,
        reason:
          `Price closed below the lower Bollinger band (oversold) and MACD momentum ` +
          `is turning up. Volatility is contained — fading the extreme back toward the mean.`,
      };
    }
    // Overbought reversion short: mirror.
    if (price > upper && histNow < histPrev) {
      const stop = price + buffer;
      const target = Math.min(mid, price - (stop - price) * params.rr);
      return {
        side: "short",
        refPrice: price,
        stopLoss: stop,
        takeProfit: target,
        confidence: conf,
        reason:
          `Price closed above the upper Bollinger band (overbought) and MACD momentum ` +
          `is rolling over. Volatility is contained — fading the extreme back toward the mean.`,
      };
    }
    return null;
  },
};
