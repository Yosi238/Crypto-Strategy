// app/api/performance/route.ts
// Loads tracked paper trades, resolves any still-open ones against recent
// market data (same pessimistic SL-first rule as the backtester), persists the
// updates, and returns period metrics + an equity curve for the dashboard.
//
// Every number here comes from REAL recorded signals being marked TP/SL — none
// of it is simulated or back-filled.

import { NextResponse } from "next/server";
import { fetchRecent } from "@/data/binance";
import { loadPaperTrades, loadResearch, savePaperTrades } from "@/data/store";
import { paperMetrics, resolveOpenTrades } from "@/paper/tracker";
import { DEFAULT_BACKTEST_CONFIG } from "@/core/types";
import type { Candle, Symbol, Timeframe } from "@/core/types";
import type { PerformancePayload } from "@/lib/dashboard-types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SYMBOLS: Symbol[] = ["BTCUSDT", "ETHUSDT"];

export async function GET() {
  let trades = await loadPaperTrades();

  // Try to resolve open trades against recent candles. Network failure is fine —
  // we just report on whatever is already resolved.
  const snap = await loadResearch();
  const tf = (snap?.timeframe ?? "1h") as Timeframe;
  const hasOpen = trades.some((t) => t.status === "open");
  if (hasOpen) {
    const bySymbol: Record<string, Candle[]> = {};
    let ok = false;
    for (const sym of SYMBOLS) {
      try {
        bySymbol[sym] = await fetchRecent(sym, tf, 500);
        ok = true;
      } catch {
        bySymbol[sym] = [];
      }
    }
    if (ok) {
      trades = resolveOpenTrades(trades, bySymbol);
      await savePaperTrades(trades);
    }
  }

  const { initialEquity, riskPerTrade } = DEFAULT_BACKTEST_CONFIG;
  const m = paperMetrics(trades, initialEquity, riskPerTrade);

  // Rebuild the equity curve from resolved trades for the chart.
  const closed = trades
    .filter((t) => t.status !== "open")
    .sort((a, b) => (a.closedAt ?? 0) - (b.closedAt ?? 0));
  let equity = initialEquity;
  const equityCurve = closed.map((t) => {
    equity += (t.rMultiple ?? 0) * (initialEquity * riskPerTrade);
    return { time: t.closedAt ?? t.openedAt, equity };
  });
  // Seed the curve with the starting point so the chart has a baseline.
  if (equityCurve.length > 0) {
    equityCurve.unshift({ time: closed[0].openedAt, equity: initialEquity });
  }

  const payload: PerformancePayload = {
    all: m.all,
    last7: m.last7,
    last30: m.last30,
    equityCurve,
  };

  return NextResponse.json(payload);
}
