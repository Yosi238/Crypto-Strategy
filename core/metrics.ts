// core/metrics.ts
// Turns a list of closed trades + an equity curve into the numbers shown on the
// Strategy card and Performance panel, and used by the validation gates.

import type {
  ClosedTrade,
  PerformanceMetrics,
  PeriodStat,
} from "./types";

export function computeMetrics(
  trades: ClosedTrade[],
  equityCurve: { time: number; equity: number }[],
  initialEquity: number
): PerformanceMetrics {
  const wins = trades.filter((t) => t.pnl > 0);
  const losses = trades.filter((t) => t.pnl <= 0);
  const grossProfit = wins.reduce((s, t) => s + t.pnl, 0);
  const grossLoss = Math.abs(losses.reduce((s, t) => s + t.pnl, 0));
  const netProfit = trades.reduce((s, t) => s + t.pnl, 0);
  const feesPaid = trades.reduce((s, t) => s + t.feesPaid, 0);

  const profitFactor =
    grossLoss === 0 ? (grossProfit > 0 ? Infinity : 0) : grossProfit / grossLoss;

  const avgRR =
    trades.length === 0
      ? 0
      : trades.reduce((s, t) => s + t.rMultiple, 0) / trades.length;

  return {
    totalTrades: trades.length,
    wins: wins.length,
    losses: losses.length,
    winRate: trades.length ? wins.length / trades.length : 0,
    profitFactor,
    maxDrawdown: maxDrawdown(equityCurve),
    netProfit,
    netProfitPct: initialEquity ? netProfit / initialEquity : 0,
    avgRR,
    expectancy: avgRR, // realised R per trade
    feesPaid,
    bestPeriod: extremePeriod(trades, "best"),
    worstPeriod: extremePeriod(trades, "worst"),
  };
}

/** Peak-to-trough drawdown as a fraction of the running peak. */
export function maxDrawdown(curve: { equity: number }[]): number {
  let peak = -Infinity;
  let maxDd = 0;
  for (const point of curve) {
    peak = Math.max(peak, point.equity);
    if (peak > 0) maxDd = Math.max(maxDd, (peak - point.equity) / peak);
  }
  return maxDd;
}

function extremePeriod(
  trades: ClosedTrade[],
  which: "best" | "worst"
): PeriodStat | null {
  if (trades.length === 0) return null;
  const buckets = new Map<string, { net: number; n: number }>();
  for (const t of trades) {
    const d = new Date(t.exit.time);
    const label = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    const b = buckets.get(label) ?? { net: 0, n: 0 };
    b.net += t.pnl;
    b.n += 1;
    buckets.set(label, b);
  }
  let chosen: PeriodStat | null = null;
  for (const [label, b] of buckets) {
    if (
      chosen === null ||
      (which === "best" && b.net > chosen.netProfit) ||
      (which === "worst" && b.net < chosen.netProfit)
    ) {
      chosen = { label, netProfit: b.net, trades: b.n };
    }
  }
  return chosen;
}

/** Filter a closed-trade list to those that exited within the last N days. */
export function tradesInWindow(
  trades: ClosedTrade[],
  days: number,
  now = Date.now()
): ClosedTrade[] {
  const cutoff = now - days * 86_400_000;
  return trades.filter((t) => t.exit.time >= cutoff);
}
