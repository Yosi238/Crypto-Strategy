// app/api/test-signal/route.ts
// Creates a clearly-flagged TEST paper signal so the UI can be previewed
// without waiting for a live setup. Test signals are stored alongside real
// paper trades but carry isTest=true, so they are shown everywhere yet NEVER
// counted in performance stats. DELETE removes all test signals.

import { NextResponse } from "next/server";
import { loadPaperTrades, savePaperTrades } from "@/data/store";
import type { PaperTrade } from "@/paper/tracker";
import type { Symbol } from "@/core/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FALLBACK_PRICE: Record<string, number> = { BTCUSDT: 68000, ETHUSDT: 3500 };

export async function POST(req: Request) {
  let body: { symbol?: string; direction?: string; price?: number } = {};
  try {
    body = await req.json();
  } catch {
    /* defaults below */
  }
  const symbol = (body.symbol === "ETHUSDT" ? "ETHUSDT" : "BTCUSDT") as Symbol;
  const side: "long" | "short" = body.direction === "short" ? "short" : "long";
  const price = body.price && body.price > 0 ? body.price : FALLBACK_PRICE[symbol];

  // Realistic-looking levels: ~0.8% stop, 2R target.
  const stopDist = price * 0.008;
  const entry = price;
  const stopLoss = side === "long" ? entry - stopDist : entry + stopDist;
  const takeProfit = side === "long" ? entry + stopDist * 2 : entry - stopDist * 2;

  const trade: PaperTrade = {
    id: `TEST-${symbol}-${Date.now()}`,
    symbol,
    side,
    entry,
    stopLoss,
    takeProfit,
    openedAt: Date.now(),
    status: "open",
    reason: "Manually created TEST signal for UI preview. Not a real setup; excluded from performance.",
    isTest: true,
  };

  const existing = await loadPaperTrades();
  await savePaperTrades([...existing, trade]);
  return NextResponse.json({ ok: true, trade });
}

export async function DELETE() {
  const existing = await loadPaperTrades();
  const kept = existing.filter((t) => !t.isTest);
  await savePaperTrades(kept);
  return NextResponse.json({ ok: true, removed: existing.length - kept.length });
}
