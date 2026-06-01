// core/strategies/v2/londonKillZone.ts
// London Kill Zone: Asian Session Stop Hunt
//
// The Asian session (20:00–06:59 UTC) establishes a defined price range.
// London market makers (07:00–09:59 UTC) routinely engineer a sweep of one
// side of that range to collect stop orders, then reverse. This strategy
// fires when a London-session bar wicks beyond the Asian extreme and closes
// back inside — a confirmed failed breakout — with above-average volume.
//
// Entry: close of the sweep bar.
// Stop:  beyond the sweep wick extreme + ATR buffer.
// TP:    RR × risk.
// Causality: everything evaluated at or before bar `i` close.

import { cachedAtr, cachedVolumeZ } from "../../indicatorCache";
import type { StrategyDef, StrategyContext, StrategySignal } from "../../types";

// London Kill Zone: 07:00–09:59 UTC
const LKZ_START = 7;
const LKZ_END = 9;

// Asian session hours (spanning midnight UTC)
const ASIAN_HOURS = new Set([20, 21, 22, 23, 0, 1, 2, 3, 4, 5, 6]);

// Maximum bars to look back when building the Asian session range.
// 15 bars covers: 11 Asian hours + up to 4 London bars in the kill zone.
const ASIAN_LOOKBACK = 15;

export const londonKillZone: StrategyDef = {
  id: "london-kill-zone",
  name: "London Kill Zone (Asian Stop Hunt)",
  category: "Liquidity",
  logic:
    "During 07:00–09:59 UTC, detects a bar that wicks beyond the prior Asian " +
    "session (20:00–06:59 UTC) high or low and closes back inside it — a " +
    "confirmed stop hunt. Volume must be elevated. Stop beyond the sweep wick; " +
    "target = RR × risk.",
  defaults: {
    atrLen: 14,
    atrMult: 1.2,
    minSweepMult: 0.3,
    volZ: 0.5,
    rr: 2,
  },
  grid: {
    atrMult: [1.0, 1.2, 1.5],
    minSweepMult: [0.2, 0.4],
    rr: [2, 2.5],
  },

  evaluate(ctx: StrategyContext): StrategySignal {
    const { candles, i, params } = ctx;
    if (i < 20) return null;

    const bar = candles[i];
    const hour = new Date(bar.time).getUTCHours();

    // Only evaluate during the London Kill Zone.
    if (hour < LKZ_START || hour > LKZ_END) return null;

    const atrArr = cachedAtr(candles, params.atrLen);
    const volZArr = cachedVolumeZ(candles, 20);
    const atrNow = atrArr[i];
    if (Number.isNaN(atrNow) || atrNow <= 0) return null;

    // Build Asian session high/low from the most recent Asian-hour bars.
    let asianHigh = -Infinity;
    let asianLow = Infinity;
    let asianBarCount = 0;

    for (let j = Math.max(0, i - ASIAN_LOOKBACK); j < i; j++) {
      if (ASIAN_HOURS.has(new Date(candles[j].time).getUTCHours())) {
        if (candles[j].high > asianHigh) asianHigh = candles[j].high;
        if (candles[j].low < asianLow)   asianLow  = candles[j].low;
        asianBarCount++;
      }
    }

    // Need a meaningful Asian range: at least 4 bars and range ≥ 1× ATR.
    if (asianBarCount < 4 || asianHigh <= asianLow) return null;
    if (asianHigh - asianLow < atrNow) return null;

    const minSweep = atrNow * params.minSweepMult;
    const vol = Number.isNaN(volZArr[i]) ? 0 : volZArr[i];

    // ── Bullish setup: swept below Asian low, closed back above ─────────────
    if (
      bar.low  < asianLow - minSweep &&   // wick pierced below the pool
      bar.close > asianLow &&             // closed back inside the range
      bar.close > bar.open &&             // body is bullish (reversal direction)
      vol >= params.volZ                  // elevated volume
    ) {
      const stop = bar.low - atrNow * params.atrMult;
      const risk = bar.close - stop;
      if (risk <= 0) return null;
      return {
        side: "long",
        refPrice: bar.close,
        stopLoss: stop,
        takeProfit: bar.close + risk * params.rr,
        confidence: 0.60,
        reason:
          `London KZ: swept Asian low (${asianLow.toFixed(1)}) by ` +
          `${(asianLow - bar.low).toFixed(1)} pts and reclaimed — bullish reversal.`,
      };
    }

    // ── Bearish setup: swept above Asian high, closed back below ─────────────
    if (
      bar.high  > asianHigh + minSweep && // wick pierced above the pool
      bar.close < asianHigh &&            // closed back inside the range
      bar.close < bar.open &&             // body is bearish (reversal direction)
      vol >= params.volZ                  // elevated volume
    ) {
      const stop = bar.high + atrNow * params.atrMult;
      const risk = stop - bar.close;
      if (risk <= 0) return null;
      return {
        side: "short",
        refPrice: bar.close,
        stopLoss: stop,
        takeProfit: bar.close - risk * params.rr,
        confidence: 0.60,
        reason:
          `London KZ: swept Asian high (${asianHigh.toFixed(1)}) by ` +
          `${(bar.high - asianHigh).toFixed(1)} pts and reversed — bearish reversal.`,
      };
    }

    return null;
  },
};
