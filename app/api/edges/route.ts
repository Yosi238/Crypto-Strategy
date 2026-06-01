// app/api/edges/route.ts
// Serves the segmented edge map + the risk-weighted portfolio of validated
// edges. Reads what research produced; computes nothing new beyond allocation.

import { NextResponse } from "next/server";
import { loadResearch } from "@/data/store";
import { allocatePortfolio, SEGMENT_MIN_TRADES, type Edge } from "@/core/edges";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const snap = await loadResearch();
  const edges: Edge[] = snap?.edges ?? [];
  const portfolio = allocatePortfolio(edges).map((p) => ({
    id: p.edge.id,
    label: `${p.edge.symbol.replace("USDT", "")} ${p.edge.direction} · ${p.edge.regime}`,
    strategyName: p.edge.strategyName,
    weight: p.weight,
    profitFactor: p.edge.profitFactor,
    trades: p.edge.trades,
  }));

  return NextResponse.json({
    hasResearch: !!snap,
    hasEdges: edges.length > 0,
    timeframe: snap?.timeframe ?? null,
    generatedAt: snap?.generatedAt ?? null,
    segmentMinTrades: SEGMENT_MIN_TRADES,
    edges,
    portfolio,
  });
}
