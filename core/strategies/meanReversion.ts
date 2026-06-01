// core/strategies/meanReversion.ts
// Mean-reversion family. These fade extremes and target a reversion to a mean
// (band middle / VWAP). They tend to fail in strong trends — the validation
// layer will expose that honestly via out-of-sample drawdown.

import { cachedAtr, cachedEma, cachedRsi, cachedVwap } from "../indicatorCache";
import type { StrategyDef, StrategyContext, StrategySignal } from "../types";

// ── RSI Reversion ────────────────────────────────────────────────────────────
export const rsiReversion: StrategyDef = {
  id: "rsi-reversion",
  name: "RSI Reversion",
  category: "Mean Reversion",
  logic:
    "Fade RSI extremes: buy when RSI exits oversold (crosses back above the low " +
    "threshold), sell when it exits overbought. ATR stop; target = RR × stop.",
  defaults: { rsiLen: 14, low: 30, high: 70, atrLen: 14, atrMult: 1.5, rr: 1.5 },
  grid: { low: [20, 25, 30], high: [70, 75, 80], atrMult: [1.2, 1.5, 2], rr: [1.5, 2] },
  evaluate(ctx: StrategyContext): StrategySignal {
    const { candles, i, params } = ctx;
    const need = Math.max(params.rsiLen, params.atrLen) + 2;
    if (i < need) return null;
    const r = cachedRsi(candles, params.rsiLen);
    const a = cachedAtr(candles, params.atrLen);
    const c = candles[i];
    if ([r[i], r[i - 1], a[i]].some(Number.isNaN)) return null;
    const stop = a[i] * params.atrMult;
    if (stop <= 0) return null;

    const exitedOversold = r[i - 1] < params.low && r[i] >= params.low;
    const exitedOverbought = r[i - 1] > params.high && r[i] <= params.high;
    const conf = Math.min(1, 0.5 + Math.abs(r[i] - 50) / 100);

    if (exitedOversold)
      return { side: "long", refPrice: c.close, stopLoss: c.close - stop, takeProfit: c.close + stop * params.rr, confidence: conf, reason: `RSI reclaimed ${params.low} from oversold — mean-reversion long.` };
    if (exitedOverbought)
      return { side: "short", refPrice: c.close, stopLoss: c.close + stop, takeProfit: c.close - stop * params.rr, confidence: conf, reason: `RSI lost ${params.high} from overbought — mean-reversion short.` };
    return null;
  },
};

// ── VWAP Reversion ───────────────────────────────────────────────────────────
// Fade stretches away from a rolling VWAP, but only in a non-trending regime
// (price oscillating around a flat EMA) to avoid fading strong trends.
export const vwapReversion: StrategyDef = {
  id: "vwap-reversion",
  name: "VWAP Reversion",
  category: "Mean Reversion",
  logic:
    "In a range regime, fade price when it stretches more than k×ATR from the " +
    "rolling VWAP, targeting a return toward VWAP. ATR stop beyond the extreme.",
  defaults: { vwapLen: 20, stretch: 1.5, atrLen: 14, atrMult: 1.5, rr: 1.5, emaTrend: 200 },
  grid: { vwapLen: [20, 30], stretch: [1.2, 1.5, 2], atrMult: [1.3, 1.6], rr: [1.5, 2] },
  evaluate(ctx: StrategyContext): StrategySignal {
    const { candles, i, params } = ctx;
    const need = Math.max(params.vwapLen, params.atrLen, params.emaTrend) + 2;
    if (i < need) return null;
    const vw = cachedVwap(candles, params.vwapLen);
    const a = cachedAtr(candles, params.atrLen);
    const t = cachedEma(candles, params.emaTrend);
    const c = candles[i];
    if ([vw[i], a[i], t[i], t[i - params.atrLen]].some(Number.isNaN)) return null;

    // Range regime: long-EMA roughly flat over the ATR window.
    const slope = Math.abs(t[i] - t[i - params.atrLen]) / c.close;
    const ranging = slope < 0.01;
    const stop = a[i] * params.atrMult;
    if (stop <= 0) return null;
    const dist = c.close - vw[i];
    const stretched = Math.abs(dist) > a[i] * params.stretch;
    const conf = Math.min(1, 0.5 + Math.abs(dist) / (a[i] * 4));

    if (ranging && stretched && dist < 0)
      return { side: "long", refPrice: c.close, stopLoss: c.close - stop, takeProfit: vw[i], confidence: conf, reason: "Price stretched below VWAP in a range — reverting up toward VWAP." };
    if (ranging && stretched && dist > 0)
      return { side: "short", refPrice: c.close, stopLoss: c.close + stop, takeProfit: vw[i], confidence: conf, reason: "Price stretched above VWAP in a range — reverting down toward VWAP." };
    return null;
  },
};
