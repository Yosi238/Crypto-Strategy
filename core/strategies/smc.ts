// core/strategies/smc.ts
// "Smart Money Concepts" family. These read market structure from confirmed
// swing pivots. CAUSALITY: swingPoints confirms a pivot only `look` bars after
// it forms, so we only ever reference pivots at index <= i-look.

import { cachedAtr, cachedSwings } from "../indicatorCache";
import type { StrategyDef, StrategyContext, StrategySignal } from "../types";

interface Pivot { idx: number; price: number; }

// Last two confirmed swing highs / lows at or before (i - look).
function recentPivots(
  highs: number[],
  lows: number[],
  i: number,
  look: number
): { highs: Pivot[]; lows: Pivot[] } {
  const limit = i - look;
  const H: Pivot[] = [];
  const L: Pivot[] = [];
  for (let j = limit; j >= Math.max(0, limit - 300) && (H.length < 2 || L.length < 2); j--) {
    if (H.length < 2 && !Number.isNaN(highs[j])) H.push({ idx: j, price: highs[j] });
    if (L.length < 2 && !Number.isNaN(lows[j])) L.push({ idx: j, price: lows[j] });
  }
  return { highs: H, lows: L };
}

// ── Break of Structure ───────────────────────────────────────────────────────
// Trend continuation: in an uptrend (higher highs/lows), a close above the most
// recent confirmed swing high confirms continuation. Mirror for downtrend.
export const breakOfStructure: StrategyDef = {
  id: "break-of-structure",
  name: "Break of Structure",
  category: "Smart Money",
  logic:
    "Identify trend from confirmed swings (HH/HL or LH/LL). A close beyond the " +
    "latest swing in the trend direction = break of structure. Stop beyond the " +
    "protected swing; RR target.",
  defaults: { look: 5, atrLen: 14, atrMult: 1.5, rr: 2 },
  grid: { look: [4, 5, 7], atrMult: [1.2, 1.5, 2], rr: [2, 3] },
  evaluate(ctx: StrategyContext): StrategySignal {
    const { candles, i, params } = ctx;
    const look = params.look;
    if (i < look + 30) return null;
    const { highs, lows } = cachedSwings(candles, look);
    const a = cachedAtr(candles, params.atrLen);
    const c = candles[i];
    if (Number.isNaN(a[i])) return null;
    const p = recentPivots(highs, lows, i, look);
    if (p.highs.length < 2 || p.lows.length < 2) return null;

    const higherHighs = p.highs[0].price > p.highs[1].price;
    const higherLows = p.lows[0].price > p.lows[1].price;
    const lowerHighs = p.highs[0].price < p.highs[1].price;
    const lowerLows = p.lows[0].price < p.lows[1].price;
    const stop = a[i] * params.atrMult;
    if (stop <= 0) return null;

    if (higherHighs && higherLows && c.close > p.highs[0].price && candles[i - 1].close <= p.highs[0].price) {
      const sl = Math.min(p.lows[0].price, c.close - stop);
      return { side: "long", refPrice: c.close, stopLoss: sl, takeProfit: c.close + (c.close - sl) * params.rr, confidence: 0.62, reason: "Uptrend structure (HH/HL); closed above last swing high — BOS up." };
    }
    if (lowerHighs && lowerLows && c.close < p.lows[0].price && candles[i - 1].close >= p.lows[0].price) {
      const sl = Math.max(p.highs[0].price, c.close + stop);
      return { side: "short", refPrice: c.close, stopLoss: sl, takeProfit: c.close - (sl - c.close) * params.rr, confidence: 0.62, reason: "Downtrend structure (LH/LL); closed below last swing low — BOS down." };
    }
    return null;
  },
};

// ── Market Structure Shift ───────────────────────────────────────────────────
// Reversal: a downtrend (LH/LL) that suddenly closes above the most recent
// lower-high signals a shift to bullish (and mirror). Counter-trend by nature.
export const marketStructureShift: StrategyDef = {
  id: "market-structure-shift",
  name: "Market Structure Shift",
  category: "Smart Money",
  logic:
    "Detect a reversal: in a down-structure, a close above the latest lower-high " +
    "flips structure bullish (mirror for bearish). Stop beyond the origin swing; RR target.",
  defaults: { look: 5, atrLen: 14, atrMult: 1.5, rr: 2.5 },
  grid: { look: [4, 5, 7], atrMult: [1.2, 1.5, 2], rr: [2, 2.5, 3] },
  evaluate(ctx: StrategyContext): StrategySignal {
    const { candles, i, params } = ctx;
    const look = params.look;
    if (i < look + 30) return null;
    const { highs, lows } = cachedSwings(candles, look);
    const a = cachedAtr(candles, params.atrLen);
    const c = candles[i];
    if (Number.isNaN(a[i])) return null;
    const p = recentPivots(highs, lows, i, look);
    if (p.highs.length < 2 || p.lows.length < 2) return null;

    const wasDown = p.highs[0].price < p.highs[1].price && p.lows[0].price < p.lows[1].price;
    const wasUp = p.highs[0].price > p.highs[1].price && p.lows[0].price > p.lows[1].price;
    const stop = a[i] * params.atrMult;
    if (stop <= 0) return null;

    if (wasDown && c.close > p.highs[0].price && candles[i - 1].close <= p.highs[0].price) {
      const sl = Math.min(p.lows[0].price, c.close - stop);
      return { side: "long", refPrice: c.close, stopLoss: sl, takeProfit: c.close + (c.close - sl) * params.rr, confidence: 0.58, reason: "Down-structure broken: close above last lower-high — bullish MSS." };
    }
    if (wasUp && c.close < p.lows[0].price && candles[i - 1].close >= p.lows[0].price) {
      const sl = Math.max(p.highs[0].price, c.close + stop);
      return { side: "short", refPrice: c.close, stopLoss: sl, takeProfit: c.close - (sl - c.close) * params.rr, confidence: 0.58, reason: "Up-structure broken: close below last higher-low — bearish MSS." };
    }
    return null;
  },
};

// ── Retest Continuation ──────────────────────────────────────────────────────
// After a break of a swing level, wait for price to RETEST the broken level and
// hold it, then continue. Distinct from BOS: entry is on the pullback, not the break.
export const retestContinuation: StrategyDef = {
  id: "retest-continuation",
  name: "Retest Continuation",
  category: "Smart Money",
  logic:
    "After price breaks a confirmed swing level, enter when it retests that level " +
    "from the other side and closes holding it. Stop beyond the retest; RR target.",
  defaults: { look: 5, atrLen: 14, atrMult: 1.3, rr: 2, tol: 0.0015 },
  grid: { look: [4, 5, 7], atrMult: [1.2, 1.5], rr: [2, 3], tol: [0.001, 0.0015, 0.0025] },
  evaluate(ctx: StrategyContext): StrategySignal {
    const { candles, i, params } = ctx;
    const look = params.look;
    if (i < look + 30) return null;
    const { highs, lows } = cachedSwings(candles, look);
    const a = cachedAtr(candles, params.atrLen);
    const c = candles[i];
    if (Number.isNaN(a[i])) return null;
    const p = recentPivots(highs, lows, i, look);
    if (p.highs.length < 1 || p.lows.length < 1) return null;
    const stop = a[i] * params.atrMult;
    if (stop <= 0) return null;

    const level = p.highs[0].price;
    const support = p.lows[0].price;
    const tol = c.close * params.tol;

    // Broke above a swing high earlier, now retesting it from above and holding.
    const retestUp = c.low <= level + tol && c.low >= level - tol && c.close > level;
    // Broke below a swing low earlier, now retesting from below and rejecting.
    const retestDn = c.high >= support - tol && c.high <= support + tol && c.close < support;

    if (retestUp)
      return { side: "long", refPrice: c.close, stopLoss: c.close - stop, takeProfit: c.close + stop * params.rr, confidence: 0.6, reason: "Retested broken swing high as support and held — continuation long." };
    if (retestDn)
      return { side: "short", refPrice: c.close, stopLoss: c.close + stop, takeProfit: c.close - stop * params.rr, confidence: 0.6, reason: "Retested broken swing low as resistance and rejected — continuation short." };
    return null;
  },
};
