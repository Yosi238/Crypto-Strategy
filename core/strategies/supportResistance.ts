// core/strategies/supportResistance.ts
// Support & Resistance family, built on Donchian channel levels (rolling
// highest-high / lowest-low). All causal — the channel at i uses bars before i.

import { cachedAtr, cachedDonchian } from "../indicatorCache";
import type { StrategyDef, StrategyContext, StrategySignal } from "../types";

// ── Bounce ───────────────────────────────────────────────────────────────────
// Price tags the channel floor (support) and closes back up = bounce long.
// Mirror at the channel ceiling for shorts.
export const srBounce: StrategyDef = {
  id: "sr-bounce",
  name: "S/R Bounce",
  category: "Support/Resistance",
  logic:
    "Buy when price dips to the rolling support (Donchian low) and closes back " +
    "above it; sell the mirror at resistance. ATR stop beyond the level; RR target.",
  defaults: { dcLen: 20, atrLen: 14, atrMult: 1.4, rr: 1.8, tol: 0.002 },
  grid: { dcLen: [20, 30], atrMult: [1.2, 1.4, 1.8], rr: [1.5, 2], tol: [0.0015, 0.002, 0.003] },
  evaluate(ctx: StrategyContext): StrategySignal {
    const { candles, i, params } = ctx;
    const need = Math.max(params.dcLen, params.atrLen) + 2;
    if (i < need) return null;
    const dc = cachedDonchian(candles, params.dcLen);
    const a = cachedAtr(candles, params.atrLen);
    const c = candles[i];
    if ([dc.upper[i], dc.lower[i], a[i]].some(Number.isNaN)) return null;
    const stop = a[i] * params.atrMult;
    if (stop <= 0) return null;
    const tol = c.close * params.tol;

    const atSupport = c.low <= dc.lower[i] + tol && c.close > dc.lower[i];
    const atResistance = c.high >= dc.upper[i] - tol && c.close < dc.upper[i];

    if (atSupport)
      return { side: "long", refPrice: c.close, stopLoss: dc.lower[i] - stop, takeProfit: c.close + (c.close - (dc.lower[i] - stop)) * params.rr, confidence: 0.58, reason: "Tagged rolling support and closed back above it — bounce long." };
    if (atResistance)
      return { side: "short", refPrice: c.close, stopLoss: dc.upper[i] + stop, takeProfit: c.close - ((dc.upper[i] + stop) - c.close) * params.rr, confidence: 0.58, reason: "Tagged rolling resistance and closed back below it — fade short." };
    return null;
  },
};

// ── Retest ───────────────────────────────────────────────────────────────────
// A level that was resistance, once broken, is retested as support and holds
// (classic role reversal). Uses the prior channel level vs the current one.
export const srRetest: StrategyDef = {
  id: "sr-retest",
  name: "S/R Retest",
  category: "Support/Resistance",
  logic:
    "After breaking the prior resistance, enter when price pulls back to that " +
    "old level (now support) and holds. Mirror for broken support. ATR stop; RR target.",
  defaults: { dcLen: 20, atrLen: 14, atrMult: 1.5, rr: 2, tol: 0.002, back: 5 },
  grid: { dcLen: [20, 30], atrMult: [1.3, 1.6], rr: [2, 3], tol: [0.0015, 0.0025] },
  evaluate(ctx: StrategyContext): StrategySignal {
    const { candles, i, params } = ctx;
    const need = Math.max(params.dcLen + params.back, params.atrLen) + 2;
    if (i < need) return null;
    const dc = cachedDonchian(candles, params.dcLen);
    const a = cachedAtr(candles, params.atrLen);
    const c = candles[i];
    const b = params.back;
    if ([dc.upper[i], dc.lower[i], dc.upper[i - b], dc.lower[i - b], a[i]].some(Number.isNaN)) return null;
    const stop = a[i] * params.atrMult;
    if (stop <= 0) return null;
    const tol = c.close * params.tol;

    const oldRes = dc.upper[i - b];
    const oldSup = dc.lower[i - b];
    // Broke above old resistance recently and is now retesting it as support.
    const retestSupport = c.close > oldRes && c.low <= oldRes + tol && c.low >= oldRes - tol;
    const retestResistance = c.close < oldSup && c.high >= oldSup - tol && c.high <= oldSup + tol;

    if (retestSupport)
      return { side: "long", refPrice: c.close, stopLoss: c.close - stop, takeProfit: c.close + stop * params.rr, confidence: 0.6, reason: "Broken resistance retested as support and held — role reversal long." };
    if (retestResistance)
      return { side: "short", refPrice: c.close, stopLoss: c.close + stop, takeProfit: c.close - stop * params.rr, confidence: 0.6, reason: "Broken support retested as resistance and rejected — role reversal short." };
    return null;
  },
};

// ── Failed Breakout ──────────────────────────────────────────────────────────
// Price pokes beyond the channel but closes back inside — a false break that
// often snaps back the other way.
export const failedBreakout: StrategyDef = {
  id: "failed-breakout",
  name: "Failed Breakout",
  category: "Support/Resistance",
  logic:
    "Price breaks the channel intrabar but closes back INSIDE it — a false break. " +
    "Fade it back toward the opposite side. ATR stop beyond the wick; RR target.",
  defaults: { dcLen: 20, atrLen: 14, atrMult: 1.4, rr: 2 },
  grid: { dcLen: [20, 30, 55], atrMult: [1.2, 1.4, 1.8], rr: [2, 3] },
  evaluate(ctx: StrategyContext): StrategySignal {
    const { candles, i, params } = ctx;
    const need = Math.max(params.dcLen, params.atrLen) + 2;
    if (i < need) return null;
    const dc = cachedDonchian(candles, params.dcLen);
    const a = cachedAtr(candles, params.atrLen);
    const c = candles[i];
    if ([dc.upper[i], dc.lower[i], a[i]].some(Number.isNaN)) return null;
    const stop = a[i] * params.atrMult;
    if (stop <= 0) return null;

    // False break above: high pierced resistance, close fell back inside.
    const falseUp = c.high > dc.upper[i] && c.close < dc.upper[i] && c.close < c.open;
    // False break below: low pierced support, close came back inside.
    const falseDn = c.low < dc.lower[i] && c.close > dc.lower[i] && c.close > c.open;

    if (falseDn)
      return { side: "long", refPrice: c.close, stopLoss: c.low - stop * 0.3, takeProfit: c.close + stop * params.rr, confidence: 0.6, reason: "Wick broke support but closed back inside — failed breakdown, fade long." };
    if (falseUp)
      return { side: "short", refPrice: c.close, stopLoss: c.high + stop * 0.3, takeProfit: c.close - stop * params.rr, confidence: 0.6, reason: "Wick broke resistance but closed back inside — failed breakout, fade short." };
    return null;
  },
};
