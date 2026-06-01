// app/api/research/route.ts
// Serves the research snapshot mapped to Research Lab rows — EVERY tested
// strategy, ranked, with full walk-forward metrics, failure reasons, and the
// week-over-week rank movement vs the previous recorded run. Nothing hidden.

import { NextResponse } from "next/server";
import { loadResearch, loadRankingHistory } from "@/data/store";
import { getStrategy } from "@/core/strategies";
import { rankStrategies, diffRankings } from "@/core/ranking";
import type { ResearchResponse, StrategyRow, SymbolMetrics, ScheduleInfo } from "@/lib/dashboard-types";
import type { DiscoveryResult } from "@/core/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function nextSunday(hour = 1): number {
  const now = new Date();
  const d = new Date(now);
  d.setHours(hour, 0, 0, 0);
  let add = (0 - d.getDay() + 7) % 7;
  if (add === 0 && d.getTime() <= now.getTime()) add = 7;
  d.setDate(d.getDate() + add);
  return d.getTime();
}

function symbolMetrics(d: DiscoveryResult): SymbolMetrics {
  const m = d.walkForward;
  return {
    winRate: m.winRate,
    profitFactor: m.profitFactor,
    maxDrawdown: m.maxDrawdown,
    totalTrades: m.totalTrades,
    avgRR: m.avgRR,
    feesPaid: m.feesPaid,
    netProfitPct: m.netProfitPct,
    oosNetProfit: d.outOfSample.netProfitPct,
    robustness: d.robustness,
    passed: d.passed,
    failedGates: d.failedGates,
    bestPeriod: m.bestPeriod ? { label: m.bestPeriod.label, netProfit: m.bestPeriod.netProfit } : null,
    worstPeriod: m.worstPeriod ? { label: m.worstPeriod.label, netProfit: m.worstPeriod.netProfit } : null,
  };
}

const mean = (xs: number[]) =>
  xs.length ? xs.reduce((a, b) => a + (Number.isFinite(b) ? b : 0), 0) / xs.length : 0;

export async function GET() {
  const telegramConfigured = !!process.env.TELEGRAM_BOT_TOKEN && !!process.env.TELEGRAM_CHAT_ID;
  const snap = await loadResearch();
  const schedule: ScheduleInfo = { lastRunAt: snap?.generatedAt ?? null, nextRunAt: nextSunday() };

  if (!snap) {
    const empty: ResearchResponse = {
      hasResearch: false,
      telegramConfigured,
      timeframe: null,
      generatedAt: null,
      selectedStrategyId: null,
      selectedChangedFromPrev: false,
      schedule,
      strategies: [],
    };
    return NextResponse.json(empty);
  }

  // Current ranking from the authoritative snapshot results.
  const ranking = rankStrategies(snap.results).map((r) => ({
    ...r,
    category: getStrategy(r.strategyId)?.category ?? "Other",
  }));

  // Previous recorded run = most recent history entry strictly before this snapshot.
  const history = await loadRankingHistory();
  const previous =
    [...history].reverse().find((rec) => rec.generatedAt < snap.generatedAt) ?? null;
  const diff = diffRankings(ranking, previous?.ranking ?? null);
  const rankById = new Map(ranking.map((r) => [r.strategyId, r]));

  const strategies: StrategyRow[] = snap.results.map((r) => {
    const def = getStrategy(r.strategyId);
    const perSymbol: Record<string, SymbolMetrics> = {};
    for (const [sym, d] of Object.entries(r.perSymbol)) perSymbol[sym] = symbolMetrics(d);
    const syms = Object.values(perSymbol);
    const failedUnion = Array.from(new Set(syms.flatMap((s) => s.failedGates)));
    const rk = rankById.get(r.strategyId);
    const dl = diff[r.strategyId];
    return {
      id: r.strategyId,
      name: r.strategyName,
      category: def?.category ?? "Other",
      logic: def?.logic ?? "",
      passedBoth: r.passedBoth,
      trades: Math.round(mean(syms.map((s) => s.totalTrades))),
      winRate: mean(syms.map((s) => s.winRate)),
      profitFactor: mean(syms.map((s) => s.profitFactor)),
      netProfitPct: mean(syms.map((s) => s.netProfitPct)),
      maxDrawdown: mean(syms.map((s) => s.maxDrawdown)),
      robustness: mean(syms.map((s) => s.robustness)),
      oosNetProfit: mean(syms.map((s) => s.oosNetProfit)),
      failedGates: failedUnion,
      perSymbol,
      rank: rk?.rank ?? 999,
      score: rk?.score ?? 0,
      rankDelta: dl?.rankDelta ?? null,
      prevRank: dl?.prevRank ?? null,
      isNew: dl?.isNew ?? false,
    };
  });

  const res: ResearchResponse = {
    hasResearch: true,
    telegramConfigured,
    timeframe: snap.timeframe,
    generatedAt: snap.generatedAt,
    selectedStrategyId: snap.selectedStrategyId,
    selectedChangedFromPrev: !!previous && previous.selectedStrategyId !== snap.selectedStrategyId,
    schedule,
    strategies,
  };
  return NextResponse.json(res);
}
