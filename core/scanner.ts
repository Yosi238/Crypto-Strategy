// core/scanner.ts
// Evaluates the MOST RECENT closed candle for a tradable signal using a chosen
// (already-validated) strategy + params, and dresses it with risk-managed
// levels, position size and recommended leverage. This is what the live
// dashboard cards and Telegram alerts consume.

import { computePositionSize, leverageFromStop } from "./risk";
import type {
  BacktestConfig,
  Candle,
  SignalAction,
  StrategyDef,
  Symbol,
} from "./types";

export interface LiveSignal {
  symbol: Symbol;
  action: SignalAction; // long | short | none
  price: number;
  entry: number | null;
  stopLoss: number | null;
  takeProfit: number | null;
  riskReward: number | null;
  recommendedLeverage: number | null;
  confidence: number; // 0..1
  reason: string;
  trend: "up" | "down" | "neutral";
  time: number;
}

/**
 * IMPORTANT: a strategy fires at the close of bar i and would fill on bar i+1's
 * open in the backtest. Live, the latest CLOSED candle is the signal candle and
 * the entry is "next candle's open" ≈ current price. We surface the signal-bar
 * close as the reference entry and let the trader fill at market.
 */
export function scan(
  symbol: Symbol,
  candles: Candle[],
  strategy: StrategyDef,
  params: Record<string, number>,
  config: BacktestConfig,
  equity: number
): LiveSignal {
  const i = candles.length - 1;
  const price = candles[i]?.close ?? 0;
  const trend = inferTrend(candles);

  const base: LiveSignal = {
    symbol,
    action: "none",
    price,
    entry: null,
    stopLoss: null,
    takeProfit: null,
    riskReward: null,
    recommendedLeverage: null,
    confidence: 0,
    reason: "No valid setup on the latest candle.",
    trend,
    time: candles[i]?.time ?? Date.now(),
  };

  const sig = strategy.evaluate({ candles, i, params });
  if (!sig) return base;

  const entry = price; // market fill approximation
  const stopDistancePct = Math.abs(entry - sig.stopLoss) / entry;
  const sizing = computePositionSize({
    equity,
    entry,
    stopLoss: sig.stopLoss,
    riskPerTrade: config.riskPerTrade,
    maxLeverage: config.maxLeverage,
  });
  const rr =
    Math.abs(sig.takeProfit - entry) / Math.max(1e-9, Math.abs(entry - sig.stopLoss));

  return {
    ...base,
    action: sig.side,
    entry,
    stopLoss: sig.stopLoss,
    takeProfit: sig.takeProfit,
    riskReward: rr,
    recommendedLeverage: Math.min(
      sizing.recommendedLeverage,
      leverageFromStop(stopDistancePct, config.maxLeverage)
    ),
    confidence: sig.confidence,
    reason: sig.reason,
  };
}

function inferTrend(candles: Candle[]): "up" | "down" | "neutral" {
  const n = candles.length;
  if (n < 200) return "neutral";
  const closes = candles.map((c) => c.close);
  const ma = (p: number) =>
    closes.slice(n - p).reduce((s, x) => s + x, 0) / p;
  const fast = ma(50);
  const slow = ma(200);
  if (fast > slow * 1.001) return "up";
  if (fast < slow * 0.999) return "down";
  return "neutral";
}

export type RegimeLabel =
  | "Bull Trend"
  | "Bear Trend"
  | "Range"
  | "High Volatility"
  | "Low Volatility"
  | "Expansion"
  | "Compression";

export interface RegimeInfo {
  label: RegimeLabel;
  trend: "up" | "down" | "neutral";
  atrPct: number; // ATR(14) as a fraction of price — volatility level
  volRatio: number; // recent ATR vs baseline ATR — >1 expanding, <1 compressing
  trendStrength: number; // |fastMA - slowMA| / price — how directional the market is
}

/**
 * Classifies the market into one of seven honest regimes from price structure
 * alone (no look-ahead, latest closed candle). Order of precedence: a clear
 * directional trend wins; otherwise we describe the volatility state.
 *
 *  • Bull/Bear Trend  — fast & slow MA separated and aligned (trendStrength high)
 *  • High/Low Volatility — ATR% above/below absolute bounds
 *  • Expansion/Compression — recent ATR rising vs / falling below its baseline
 *  • Range — none of the above (chop around a flat mean)
 */
export function inferRegime(candles: Candle[]): RegimeInfo {
  return regimeAt(candles, candles.length - 1);
}

/**
 * Regime as it would have been seen at the CLOSE of bar `end`, using only bars
 * up to and including `end` (no look-ahead). Lets us tag historical trades with
 * the regime in force at entry.
 */
export function regimeAt(candles: Candle[], end: number): RegimeInfo {
  const trend = inferTrendAt(candles, end);
  const blank: RegimeInfo = { label: "Range", trend, atrPct: 0, volRatio: 1, trendStrength: 0 };
  if (end < 210) return blank;

  const ma = (p: number) => {
    let s = 0;
    for (let i = end - p + 1; i <= end; i++) s += candles[i].close;
    return s / p;
  };
  const fast = ma(50);
  const slow = ma(200);
  const price = candles[end].close;

  const atr = (len: number) => {
    let tr = 0;
    for (let i = end - len + 1; i <= end; i++) {
      const h = candles[i].high, l = candles[i].low, pc = candles[i - 1].close;
      tr += Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc));
    }
    return tr / len;
  };

  const atr14 = atr(14);
  const atrBaseline = atr(50);
  const atrPct = atr14 / price;
  const volRatio = atrBaseline > 0 ? atr14 / atrBaseline : 1;
  const trendStrength = Math.abs(fast - slow) / price;

  if (trendStrength >= 0.012) {
    if (fast > slow) return { label: "Bull Trend", trend: "up", atrPct, volRatio, trendStrength };
    return { label: "Bear Trend", trend: "down", atrPct, volRatio, trendStrength };
  }
  if (atrPct > 0.04) return { label: "High Volatility", trend, atrPct, volRatio, trendStrength };
  if (atrPct < 0.006) return { label: "Low Volatility", trend: "neutral", atrPct, volRatio, trendStrength };
  if (volRatio >= 1.35) return { label: "Expansion", trend, atrPct, volRatio, trendStrength };
  if (volRatio <= 0.7) return { label: "Compression", trend: "neutral", atrPct, volRatio, trendStrength };
  return { label: "Range", trend: "neutral", atrPct, volRatio, trendStrength };
}

/** Trend direction at bar `end` (50/200 MA), causal. */
function inferTrendAt(candles: Candle[], end: number): "up" | "down" | "neutral" {
  if (end < 200) return "neutral";
  let f = 0, s = 0;
  for (let i = end - 49; i <= end; i++) f += candles[i].close;
  for (let i = end - 199; i <= end; i++) s += candles[i].close;
  f /= 50; s /= 200;
  const sep = (f - s) / candles[end].close;
  if (sep > 0.002) return "up";
  if (sep < -0.002) return "down";
  return "neutral";
}
