// app/api/paper/route.ts
// Returns tracked paper trades, resolving any still-open ones against recent
// market data (same pessimistic SL-first rule as the backtester). The list is
// the single source the Performance and Paper Trades pages filter client-side.

import { NextResponse } from "next/server";
import { fetchRecent } from "@/data/binance";
import { loadPaperTrades, loadResearch, loadSettings, savePaperTrades } from "@/data/store";
import { resolveOpenTrades } from "@/paper/tracker";
import type { Candle, Symbol, Timeframe } from "@/core/types";
import type { PaperResponse } from "@/lib/dashboard-types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30; // Binance fetch headroom on Vercel

const SYMBOLS: Symbol[] = ["BTCUSDT", "ETHUSDT"];

export async function GET() {
  let trades = await loadPaperTrades();
  let fetchError: string | null = null;

  if (trades.some((t) => t.status === "open")) {
    const snap = await loadResearch();
    const settings = await loadSettings();
    const tf = (settings?.timeframe ?? snap?.timeframe ?? "1h") as Timeframe;
    const bySymbol: Record<string, Candle[]> = {};
    let ok = false;
    for (const sym of SYMBOLS) {
      try {
        bySymbol[sym] = await fetchRecent(sym, tf, 500);
        ok = true;
      } catch {
        bySymbol[sym] = [];
        fetchError = "Could not reach market data to resolve open trades; showing last known state.";
      }
    }
    if (ok) {
      trades = resolveOpenTrades(trades, bySymbol);
      await savePaperTrades(trades);
    }
  }

  const payload: PaperResponse = { trades, fetchError };
  return NextResponse.json(payload);
}
