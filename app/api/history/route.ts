// app/api/history/route.ts
// The recorded weekly ranking history (newest last) — what was selected each
// run and the top strategies at the time. Powers the "ranking history" view.

import { NextResponse } from "next/server";
import { loadRankingHistory } from "@/data/store";
import { getStrategy } from "@/core/strategies";
import type { HistoryResponse, HistoryEntry } from "@/lib/dashboard-types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const history = await loadRankingHistory();
  const records: HistoryEntry[] = history.map((rec) => ({
    generatedAt: rec.generatedAt,
    timeframe: rec.timeframe,
    selectedStrategyId: rec.selectedStrategyId,
    selectedName: rec.selectedStrategyId ? getStrategy(rec.selectedStrategyId)?.name ?? rec.selectedStrategyId : null,
    top: rec.ranking.slice(0, 3).map((r) => ({
      rank: r.rank,
      name: r.strategyName,
      score: r.score,
      passedBoth: r.passedBoth,
    })),
  }));
  const res: HistoryResponse = { records };
  return NextResponse.json(res);
}
