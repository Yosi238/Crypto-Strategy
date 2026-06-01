// paper/tracker.ts
// Records every signal the scanner emits and resolves it against subsequent
// price action: which came first, take-profit or stop-loss? It NEVER places a
// real order — it just journals hypothetical trades so live performance can be
// compared honestly against the backtest.

import { computeMetrics, tradesInWindow } from "../core/metrics";
import type { ClosedTrade, PerformanceMetrics, Side, Symbol } from "../core/types";
import type { LiveSignal } from "../core/scanner";
import type { Candle } from "../core/types";

export interface PaperTrade {
  id: string;
  symbol: Symbol;
  side: Side;
  entry: number;
  stopLoss: number;
  takeProfit: number;
  openedAt: number;
  status: "open" | "tp" | "sl";
  closedAt?: number;
  exitPrice?: number;
  rMultiple?: number;
  reason: string;
  /** True for manually-created demo signals — shown in the UI but NEVER counted in performance. */
  isTest?: boolean;
  // Snapshot of signal context at creation time (display only).
  strategyName?: string;
  timeframe?: string;
  confidence?: number;
  leverage?: number;
  riskReward?: number;
  takeProfit2?: number;
  takeProfit3?: number;
}

export function signalToPaperTrade(sig: LiveSignal): PaperTrade | null {
  if (sig.action === "none" || sig.entry == null || sig.stopLoss == null || sig.takeProfit == null)
    return null;
  return {
    id: `${sig.symbol}-${sig.time}`,
    symbol: sig.symbol,
    side: sig.action,
    entry: sig.entry,
    stopLoss: sig.stopLoss,
    takeProfit: sig.takeProfit,
    openedAt: sig.time,
    status: "open",
    reason: sig.reason,
    confidence: sig.confidence,
    leverage: sig.recommendedLeverage ?? undefined,
    riskReward: sig.riskReward ?? undefined,
  };
}

/**
 * Walk forward through candles that occurred AFTER a trade opened and decide
 * the outcome. Same pessimistic rule as the backtester: if a single bar spans
 * both levels, the stop is assumed hit first.
 *
 * `takerFee` is passed through to finalize() so the R-multiple matches the
 * backtest's accounting (both sides charged taker fee on the round trip).
 */
export function resolveOpenTrades(
  trades: PaperTrade[],
  candlesBySymbol: Record<string, Candle[]>,
  takerFee = 0.0004
): PaperTrade[] {
  return trades.map((t) => {
    if (t.status !== "open" || t.isTest) return t;
    const candles = candlesBySymbol[t.symbol] ?? [];
    for (const c of candles) {
      if (c.time <= t.openedAt) continue;
      const hitStop = t.side === "long" ? c.low <= t.stopLoss : c.high >= t.stopLoss;
      const hitTp = t.side === "long" ? c.high >= t.takeProfit : c.low <= t.takeProfit;
      if (hitStop) return finalize(t, "sl", t.stopLoss, c.time, takerFee);
      if (hitTp)   return finalize(t, "tp", t.takeProfit, c.time, takerFee);
    }
    return t;
  });
}

/**
 * Compute the net R-multiple for a closed paper trade, deducting the
 * round-trip taker fee so paper metrics align with backtest metrics.
 *
 * Fee derivation (fixed-fractional sizing):
 *   qty        = riskAmount / stopDistance
 *   notional   = qty × entry = riskAmount / stopDistancePct
 *   fee_USDT   = 2 × takerFee × notional
 *   fee_R      = fee_USDT / riskAmount = 2 × takerFee / stopDistancePct
 *
 * This is independent of riskPerTrade and equity — it depends only on stop
 * distance and taker fee, both of which are available on the paper trade.
 */
function finalize(
  t: PaperTrade,
  status: "tp" | "sl",
  exit: number,
  time: number,
  takerFee: number
): PaperTrade {
  const risk = Math.abs(t.entry - t.stopLoss);
  const pnlPerUnit = t.side === "long" ? exit - t.entry : t.entry - exit;
  const grossR = risk > 0 ? pnlPerUnit / risk : 0;
  // Round-trip fee drag expressed as a fraction of the risked amount.
  const stopDistPct = t.entry > 0 ? risk / t.entry : 0;
  const feeR = stopDistPct > 0 ? (2 * takerFee) / stopDistPct : 0;
  return {
    ...t,
    status,
    closedAt: time,
    exitPrice: exit,
    rMultiple: grossR - feeR,
  };
}

/** Convert resolved paper trades into the same metrics shape as the backtester. */
export function paperMetrics(
  trades: PaperTrade[],
  initialEquity = 10_000,
  riskPerTrade = 0.01
): { all: PerformanceMetrics; last7: PerformanceMetrics; last30: PerformanceMetrics } {
  const closed = trades.filter((t) => t.status !== "open" && !t.isTest);
  let equity = initialEquity;
  const curve: { time: number; equity: number }[] = [];
  const ct: ClosedTrade[] = [];
  for (const t of closed.sort((a, b) => (a.closedAt ?? 0) - (b.closedAt ?? 0))) {
    const r = t.rMultiple ?? 0;
    const pnl = r * (initialEquity * riskPerTrade);
    equity += pnl;
    curve.push({ time: t.closedAt ?? t.openedAt, equity });
    ct.push({
      side: t.side,
      entry: { time: t.openedAt, price: t.entry },
      exit: { time: t.closedAt ?? t.openedAt, price: t.exitPrice ?? t.entry },
      stopLoss: t.stopLoss,
      takeProfit: t.takeProfit,
      qty: 0,
      pnl,
      rMultiple: r,
      feesPaid: 0,
      reason: t.reason,
      outcome: t.status === "tp" ? "tp" : "sl",
      barsHeld: 0,
    });
  }
  const mk = (subset: ClosedTrade[]) => {
    let eq = initialEquity;
    const c = subset.map((t) => ({ time: t.exit.time, equity: (eq += t.pnl) }));
    return computeMetrics(subset, c, initialEquity);
  };
  return {
    all: computeMetrics(ct, curve, initialEquity),
    last7: mk(tradesInWindow(ct, 7)),
    last30: mk(tradesInWindow(ct, 30)),
  };
}

/**
 * Flexible metrics over paper trades with optional symbol + recency filters.
 * Pure (no IO) so it can run on the server or in client components.
 */
export function filteredPaperMetrics(
  trades: PaperTrade[],
  opts: { symbol?: string; days?: number } = {},
  initialEquity = 10_000,
  riskPerTrade = 0.01
): { metrics: PerformanceMetrics; equityCurve: { time: number; equity: number }[]; rMultiples: number[] } {
  const now = Date.now();
  const cutoff = opts.days ? now - opts.days * 86_400_000 : 0;
  const closed = trades
    .filter((t) => t.status !== "open" && !t.isTest)
    .filter((t) => (opts.symbol ? t.symbol === opts.symbol : true))
    .filter((t) => (opts.days ? (t.closedAt ?? 0) >= cutoff : true))
    .sort((a, b) => (a.closedAt ?? 0) - (b.closedAt ?? 0));

  let equity = initialEquity;
  const curve: { time: number; equity: number }[] = [];
  const ct: ClosedTrade[] = [];
  for (const t of closed) {
    const r = t.rMultiple ?? 0;
    const pnl = r * (initialEquity * riskPerTrade);
    equity += pnl;
    curve.push({ time: t.closedAt ?? t.openedAt, equity });
    ct.push({
      side: t.side,
      entry: { time: t.openedAt, price: t.entry },
      exit: { time: t.closedAt ?? t.openedAt, price: t.exitPrice ?? t.entry },
      stopLoss: t.stopLoss,
      takeProfit: t.takeProfit,
      qty: 0,
      pnl,
      rMultiple: r,
      feesPaid: 0,
      reason: t.reason,
      outcome: t.status === "tp" ? "tp" : "sl",
      barsHeld: 0,
    });
  }
  if (curve.length) curve.unshift({ time: closed[0].openedAt, equity: initialEquity });
  return {
    metrics: computeMetrics(ct, curve, initialEquity),
    equityCurve: curve,
    rMultiples: closed.map((t) => t.rMultiple ?? 0),
  };
}
