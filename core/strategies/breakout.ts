// core/strategies/breakout.ts
// Breakout family. All entries are momentum continuations through a level; the
// stop sits back inside the structure that was broken.

import { cachedAtr, cachedBollinger, cachedDonchian, cachedEma } from "../indicatorCache";
import type { StrategyDef, StrategyContext, StrategySignal } from "../types";

// ── Donchian Breakout ────────────────────────────────────────────────────────
export const donchianBreakout: StrategyDef = {
  id: "donchian-breakout",
  name: "Donchian Breakout",
  category: "Breakout",
  logic:
    "Enter long when price closes above the prior N-bar high (short below the " +
    "N-bar low). Stop = ATR-based, back inside the channel; RR target.",
  defaults: { dcLen: 20, atrLen: 14, atrMult: 2, rr: 2, emaTrend: 200 },
  grid: { dcLen: [20, 30, 55], atrMult: [1.8, 2.2, 2.6], rr: [2, 3] },
  evaluate(ctx: StrategyContext): StrategySignal {
    const { candles, i, params } = ctx;
    const need = Math.max(params.dcLen, params.atrLen, params.emaTrend) + 2;
    if (i < need) return null;
    const dc = cachedDonchian(candles, params.dcLen);
    const a = cachedAtr(candles, params.atrLen);
    const t = cachedEma(candles, params.emaTrend);
    const c = candles[i];
    if ([dc.upper[i], dc.lower[i], a[i], t[i]].some(Number.isNaN)) return null;

    const stop = a[i] * params.atrMult;
    if (stop <= 0) return null;
    const brokeUp = c.close > dc.upper[i] && c.close > t[i];
    const brokeDn = c.close < dc.lower[i] && c.close < t[i];
    const conf = Math.min(1, 0.55 + Math.abs(c.close - (brokeUp ? dc.upper[i] : dc.lower[i])) / c.close * 6);

    if (brokeUp)
      return { side: "long", refPrice: c.close, stopLoss: c.close - stop, takeProfit: c.close + stop * params.rr, confidence: conf, reason: `Closed above the ${params.dcLen}-bar high, with trend.` };
    if (brokeDn)
      return { side: "short", refPrice: c.close, stopLoss: c.close + stop, takeProfit: c.close - stop * params.rr, confidence: conf, reason: `Closed below the ${params.dcLen}-bar low, with trend.` };
    return null;
  },
};

// ── ATR Breakout ─────────────────────────────────────────────────────────────
// Enter when the bar's range expands beyond a multiple of recent ATR in one
// direction — a volatility-thrust breakout independent of fixed price levels.
export const atrBreakout: StrategyDef = {
  id: "atr-breakout",
  name: "ATR Breakout",
  category: "Breakout",
  logic:
    "Enter when a single bar closes more than k×ATR beyond the prior close in " +
    "the trend direction — a volatility thrust. Stop = ATR-based; RR target.",
  defaults: { atrLen: 14, thrust: 1.2, atrMult: 1.8, rr: 2, emaTrend: 100 },
  grid: { thrust: [1, 1.2, 1.5], atrMult: [1.5, 1.8, 2.2], rr: [2, 3] },
  evaluate(ctx: StrategyContext): StrategySignal {
    const { candles, i, params } = ctx;
    const need = Math.max(params.atrLen, params.emaTrend) + 2;
    if (i < need) return null;
    const a = cachedAtr(candles, params.atrLen);
    const t = cachedEma(candles, params.emaTrend);
    const c = candles[i];
    const pc = candles[i - 1].close;
    if ([a[i], t[i]].some(Number.isNaN)) return null;

    const move = c.close - pc;
    const thrustDist = a[i] * params.thrust;
    const stop = a[i] * params.atrMult;
    if (stop <= 0) return null;
    const up = move > thrustDist && c.close > t[i];
    const dn = -move > thrustDist && c.close < t[i];
    const conf = Math.min(1, 0.5 + Math.abs(move) / (a[i] * 3));

    if (up)
      return { side: "long", refPrice: c.close, stopLoss: c.close - stop, takeProfit: c.close + stop * params.rr, confidence: conf, reason: "Bullish volatility thrust (>k×ATR) with trend." };
    if (dn)
      return { side: "short", refPrice: c.close, stopLoss: c.close + stop, takeProfit: c.close - stop * params.rr, confidence: conf, reason: "Bearish volatility thrust (>k×ATR) with trend." };
    return null;
  },
};

// ── Volatility Compression Breakout ──────────────────────────────────────────
// Bollinger band-width squeeze (volatility at a local low) followed by a close
// outside the bands — the classic "coil then expand".
export const volCompressionBreakout: StrategyDef = {
  id: "vol-compression-breakout",
  name: "Volatility Compression Breakout",
  category: "Breakout",
  logic:
    "Detect a Bollinger band-width squeeze (width below its recent floor), then " +
    "enter on the first close outside the band. Stop = ATR-based; RR target.",
  defaults: { bbLen: 20, bbMult: 2, lookback: 50, atrLen: 14, atrMult: 1.8, rr: 2.5 },
  grid: { lookback: [40, 50, 80], atrMult: [1.5, 1.8, 2.2], rr: [2, 2.5, 3] },
  evaluate(ctx: StrategyContext): StrategySignal {
    const { candles, i, params } = ctx;
    const need = Math.max(params.bbLen + params.lookback, params.atrLen) + 2;
    if (i < need) return null;
    const bb = cachedBollinger(candles, params.bbLen, params.bbMult);
    const a = cachedAtr(candles, params.atrLen);
    const c = candles[i];
    if ([bb.upper[i], bb.lower[i], bb.width[i], a[i]].some(Number.isNaN)) return null;

    // Was last bar's width at/near the lowest of the lookback window? (causal:
    // we compare the PRIOR bar's width to the window ending at the prior bar)
    let minW = Infinity;
    for (let j = i - 1 - params.lookback; j < i - 1; j++) {
      if (j >= 0 && !Number.isNaN(bb.width[j])) minW = Math.min(minW, bb.width[j]);
    }
    const wasSqueezed = Number.isFinite(minW) && bb.width[i - 1] <= minW * 1.05;
    const stop = a[i] * params.atrMult;
    if (stop <= 0) return null;
    const up = wasSqueezed && c.close > bb.upper[i];
    const dn = wasSqueezed && c.close < bb.lower[i];
    const conf = wasSqueezed ? 0.62 : 0;

    if (up)
      return { side: "long", refPrice: c.close, stopLoss: c.close - stop, takeProfit: c.close + stop * params.rr, confidence: conf, reason: "Volatility squeeze released — closed above the upper band." };
    if (dn)
      return { side: "short", refPrice: c.close, stopLoss: c.close + stop, takeProfit: c.close - stop * params.rr, confidence: conf, reason: "Volatility squeeze released — closed below the lower band." };
    return null;
  },
};

// ── Range Expansion ──────────────────────────────────────────────────────────
// After a series of narrowing ranges (an inside/NR bar cluster), trade the
// first bar whose range expands well beyond the recent average range.
export const rangeExpansion: StrategyDef = {
  id: "range-expansion",
  name: "Range Expansion",
  category: "Breakout",
  logic:
    "After a contraction in true range, enter in the direction of a bar whose " +
    "range expands beyond k× the recent average range. Stop = ATR-based; RR target.",
  defaults: { rangeLen: 10, expand: 1.6, atrLen: 14, atrMult: 1.8, rr: 2 },
  grid: { rangeLen: [7, 10, 14], expand: [1.4, 1.6, 2], rr: [2, 3] },
  evaluate(ctx: StrategyContext): StrategySignal {
    const { candles, i, params } = ctx;
    const need = Math.max(params.rangeLen, params.atrLen) + 2;
    if (i < need) return null;
    const a = cachedAtr(candles, params.atrLen);
    const c = candles[i];
    if (Number.isNaN(a[i])) return null;

    let sum = 0;
    for (let j = i - params.rangeLen; j < i; j++) sum += candles[j].high - candles[j].low;
    const avgRange = sum / params.rangeLen;
    const curRange = c.high - c.low;
    const expanded = curRange > avgRange * params.expand;
    const stop = a[i] * params.atrMult;
    if (stop <= 0 || avgRange <= 0) return null;
    const up = expanded && c.close > c.open;
    const dn = expanded && c.close < c.open;
    const conf = Math.min(1, 0.5 + (curRange / avgRange - params.expand) * 0.3);

    if (up)
      return { side: "long", refPrice: c.close, stopLoss: c.close - stop, takeProfit: c.close + stop * params.rr, confidence: conf, reason: "Range expanded sharply on a bullish bar after contraction." };
    if (dn)
      return { side: "short", refPrice: c.close, stopLoss: c.close + stop, takeProfit: c.close - stop * params.rr, confidence: conf, reason: "Range expanded sharply on a bearish bar after contraction." };
    return null;
  },
};
