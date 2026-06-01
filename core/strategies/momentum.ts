// core/strategies/momentum.ts
// Momentum family. Unlike mean-reversion, these go WITH a fresh surge in
// momentum, filtered by trend so they don't buy blow-off tops blindly.

import { cachedAtr, cachedEma, cachedMacd, cachedRsi, cachedVolumeZ } from "../indicatorCache";
import type { StrategyDef, StrategyContext, StrategySignal } from "../types";

// ── RSI Momentum ─────────────────────────────────────────────────────────────
// Enter when RSI crosses up through the midline (50) with the trend — momentum
// turning positive, not an oversold bounce.
export const rsiMomentum: StrategyDef = {
  id: "rsi-momentum",
  name: "RSI Momentum",
  category: "Momentum",
  logic:
    "With trend (price vs long EMA), enter when RSI crosses up through 50 " +
    "(down through 50 for shorts). ATR stop; RR target.",
  defaults: { rsiLen: 14, mid: 50, atrLen: 14, atrMult: 1.8, rr: 2, emaTrend: 200 },
  grid: { mid: [50, 55], atrMult: [1.5, 1.8, 2.2], rr: [2, 3] },
  evaluate(ctx: StrategyContext): StrategySignal {
    const { candles, i, params } = ctx;
    const need = Math.max(params.rsiLen, params.atrLen, params.emaTrend) + 2;
    if (i < need) return null;
    const r = cachedRsi(candles, params.rsiLen);
    const a = cachedAtr(candles, params.atrLen);
    const t = cachedEma(candles, params.emaTrend);
    const c = candles[i];
    if ([r[i], r[i - 1], a[i], t[i]].some(Number.isNaN)) return null;
    const stop = a[i] * params.atrMult;
    if (stop <= 0) return null;

    const crossUp = r[i - 1] <= params.mid && r[i] > params.mid && c.close > t[i];
    const crossDn = r[i - 1] >= params.mid && r[i] < params.mid && c.close < t[i];
    const conf = Math.min(1, 0.5 + Math.abs(r[i] - params.mid) / 50);

    if (crossUp)
      return { side: "long", refPrice: c.close, stopLoss: c.close - stop, takeProfit: c.close + stop * params.rr, confidence: conf, reason: "RSI crossed up through the midline, with trend." };
    if (crossDn)
      return { side: "short", refPrice: c.close, stopLoss: c.close + stop, takeProfit: c.close - stop * params.rr, confidence: conf, reason: "RSI crossed down through the midline, with trend." };
    return null;
  },
};

// ── MACD Momentum ────────────────────────────────────────────────────────────
// Enter on a MACD line / signal cross while the histogram confirms, filtered by trend.
export const macdMomentum: StrategyDef = {
  id: "macd-momentum",
  name: "MACD Momentum",
  category: "Momentum",
  logic:
    "With trend, enter when the MACD line crosses its signal (histogram flips " +
    "sign in the trend direction). ATR stop; RR target.",
  defaults: { fast: 12, slow: 26, sig: 9, atrLen: 14, atrMult: 1.8, rr: 2, emaTrend: 200 },
  grid: { fast: [8, 12], slow: [21, 26], atrMult: [1.5, 1.8, 2.2], rr: [2, 3] },
  evaluate(ctx: StrategyContext): StrategySignal {
    const { candles, i, params } = ctx;
    const need = Math.max(params.slow + params.sig, params.atrLen, params.emaTrend) + 2;
    if (i < need) return null;
    const m = cachedMacd(candles, params.fast, params.slow, params.sig);
    const a = cachedAtr(candles, params.atrLen);
    const t = cachedEma(candles, params.emaTrend);
    const c = candles[i];
    if ([m.histogram[i], m.histogram[i - 1], a[i], t[i]].some(Number.isNaN)) return null;
    const stop = a[i] * params.atrMult;
    if (stop <= 0) return null;

    const flipUp = m.histogram[i - 1] <= 0 && m.histogram[i] > 0 && c.close > t[i];
    const flipDn = m.histogram[i - 1] >= 0 && m.histogram[i] < 0 && c.close < t[i];
    const conf = Math.min(1, 0.5 + Math.abs(m.histogram[i]) / c.close * 50);

    if (flipUp)
      return { side: "long", refPrice: c.close, stopLoss: c.close - stop, takeProfit: c.close + stop * params.rr, confidence: conf, reason: "MACD histogram flipped positive, with trend." };
    if (flipDn)
      return { side: "short", refPrice: c.close, stopLoss: c.close + stop, takeProfit: c.close - stop * params.rr, confidence: conf, reason: "MACD histogram flipped negative, with trend." };
    return null;
  },
};

// ── Volume Momentum ──────────────────────────────────────────────────────────
// A directional bar on a clear volume z-spike, with trend — participation
// confirming the move.
export const volumeMomentum: StrategyDef = {
  id: "volume-momentum",
  name: "Volume Momentum",
  category: "Momentum",
  logic:
    "With trend, enter on a directional bar accompanied by a volume z-score " +
    "spike above threshold. ATR stop; RR target.",
  defaults: { volLen: 20, zThresh: 2, atrLen: 14, atrMult: 1.8, rr: 2, emaTrend: 100 },
  grid: { zThresh: [1.5, 2, 2.5], atrMult: [1.5, 1.8, 2.2], rr: [2, 3] },
  evaluate(ctx: StrategyContext): StrategySignal {
    const { candles, i, params } = ctx;
    const need = Math.max(params.volLen, params.atrLen, params.emaTrend) + 2;
    if (i < need) return null;
    const z = cachedVolumeZ(candles, params.volLen);
    const a = cachedAtr(candles, params.atrLen);
    const t = cachedEma(candles, params.emaTrend);
    const c = candles[i];
    if ([z[i], a[i], t[i]].some(Number.isNaN)) return null;
    const stop = a[i] * params.atrMult;
    if (stop <= 0) return null;

    const spike = z[i] >= params.zThresh;
    const up = spike && c.close > c.open && c.close > t[i];
    const dn = spike && c.close < c.open && c.close < t[i];
    const conf = Math.min(1, 0.5 + (z[i] - params.zThresh) * 0.15);

    if (up)
      return { side: "long", refPrice: c.close, stopLoss: c.close - stop, takeProfit: c.close + stop * params.rr, confidence: conf, reason: `Bullish bar on a ${z[i].toFixed(1)}σ volume spike, with trend.` };
    if (dn)
      return { side: "short", refPrice: c.close, stopLoss: c.close + stop, takeProfit: c.close - stop * params.rr, confidence: conf, reason: `Bearish bar on a ${z[i].toFixed(1)}σ volume spike, with trend.` };
    return null;
  },
};
