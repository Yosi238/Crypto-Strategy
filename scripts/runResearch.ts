// scripts/runResearch.ts
// The one place the full weekly pipeline lives, shared by the manual CLI
// (research.ts) and the scheduler (scheduler.ts):
//   (optional) download fresh data → discover+validate → rank → select the
//   highest-ranked VALIDATED strategy → save snapshot → append to history →
//   return the week-over-week diff.

import { downloadKlines } from "../data/binance";
import {
  loadCandles,
  saveCandles,
  saveResearch,
  loadSettings,
  loadRankingHistory,
  appendRankingRecord,
} from "../data/store";
import { STRATEGIES, getStrategy } from "../core/strategies";
import { discoverAcrossSymbols, DEFAULT_GATES } from "../core/validation";
import { runBacktest } from "../core/backtest";
import { regimeAt } from "../core/scanner";
import { buildEdges, type StrategyTradeSet, type TaggedTrade } from "../core/edges";
import { DEFAULT_BACKTEST_CONFIG, type Candle, type Symbol, type Timeframe } from "../core/types";
import { configFromSettings } from "../core/settings";
import {
  rankStrategies,
  selectTopValidated,
  diffRankings,
  type RankedStrategy,
  type RankingRecord,
  type RankDelta,
} from "../core/ranking";

const SYMBOLS: Symbol[] = ["BTCUSDT", "ETHUSDT"];

export interface RunResearchOptions {
  tf?: Timeframe;
  download?: boolean; // pull fresh candles before researching
  downloadDays?: number;
  onLog?: (line: string) => void;
}

export interface RunResearchResult {
  timeframe: Timeframe;
  ranking: RankedStrategy[];
  diff: Record<string, RankDelta>;
  previous: RankingRecord | null;
  selectedStrategyId: string | null;
  prevSelectedId: string | null;
  selectedChanged: boolean;
  downloadSkipped: boolean;
  generatedAt: number;
}

export async function runResearch(opts: RunResearchOptions = {}): Promise<RunResearchResult> {
  const log = opts.onLog ?? (() => {});
  const settings = await loadSettings();
  const tf = (opts.tf ?? settings?.timeframe ?? "1h") as Timeframe;
  const gates = settings?.gates ?? DEFAULT_GATES;
  const config = settings ? configFromSettings(settings) : DEFAULT_BACKTEST_CONFIG;

  // 1) Optional fresh download (best-effort; falls back to cached on failure).
  let downloadSkipped = !opts.download;
  if (opts.download) {
    try {
      for (const sym of SYMBOLS) {
        log(`Downloading ${sym} ${tf}…`);
        const c = await downloadKlines(sym, tf, opts.downloadDays ?? 730);
        await saveCandles(sym, tf, c);
        log(`  ${sym}: ${c.length} candles saved.`);
      }
    } catch (e) {
      downloadSkipped = true;
      log(`Download failed (${(e as Error).message}); researching cached data instead.`);
    }
  }

  // 2) Load candles.
  const bySymbol: Record<string, Candle[]> = {};
  for (const sym of SYMBOLS) {
    const c = await loadCandles(sym, tf);
    if (!c || c.length < 1000) {
      throw new Error(`Missing/short data for ${sym} ${tf}. Run download first.`);
    }
    bySymbol[sym] = c;
    log(`${sym} ${tf}: ${c.length} candles loaded.`);
  }

  // 3) Discover + validate.
  log("Running cross-asset discovery…");
  const results = discoverAcrossSymbols(bySymbol, STRATEGIES, config, gates);

  // 4) Rank everything; tag categories from the registry.
  const ranking = rankStrategies(results).map((r) => ({
    ...r,
    category: getStrategy(r.strategyId)?.category ?? "Other",
  }));
  const selectedStrategyId = selectTopValidated(ranking);

  // 4b) Build segmented edges: replay best params per (strategy, symbol),
  // tag every trade with its entry regime + side, aggregate into edges.
  log("Mapping edges across regimes & directions…");
  const tradeSets: StrategyTradeSet[] = [];
  for (const strat of STRATEGIES) {
    const cross = results.find((r) => r.strategyId === strat.id);
    for (const sym of SYMBOLS) {
      const candles = bySymbol[sym];
      const params = cross?.perSymbol[sym]?.bestParams ?? strat.defaults;
      const { trades } = runBacktest(candles, strat, params, config);
      if (trades.length === 0) continue;
      const timeToIdx = new Map<number, number>();
      candles.forEach((c, i) => timeToIdx.set(c.time, i));
      const tagged: TaggedTrade[] = trades.map((t) => {
        const idx = timeToIdx.get(t.entry.time) ?? 0;
        return { side: t.side, regime: regimeAt(candles, idx).label, rMultiple: t.rMultiple, time: t.entry.time };
      });
      tradeSets.push({
        strategyId: strat.id,
        strategyName: strat.name,
        category: strat.category,
        symbol: sym,
        timeframe: tf,
        trades: tagged,
      });
    }
  }
  const edges = buildEdges(tradeSets, gates);
  log(`Edges: ${edges.filter((e) => e.validated).length} validated / ${edges.length} candidate segments.`);

  // 5) Diff vs the previous run BEFORE appending this one.
  const history = await loadRankingHistory();
  const previous = history.length ? history[history.length - 1] : null;
  const diff = diffRankings(ranking, previous?.ranking ?? null);
  const prevSelectedId = previous?.selectedStrategyId ?? null;

  // 6) Persist snapshot (what the scanner reads) + append to history.
  const generatedAt = Date.now();
  await saveResearch({
    generatedAt,
    timeframe: tf,
    results,
    selectedStrategyId,
    config: config as unknown as Record<string, number>,
    edges,
  });
  await appendRankingRecord({ generatedAt, timeframe: tf, selectedStrategyId, ranking });

  return {
    timeframe: tf,
    ranking,
    diff,
    previous,
    selectedStrategyId,
    prevSelectedId,
    selectedChanged: selectedStrategyId !== prevSelectedId,
    downloadSkipped,
    generatedAt,
  };
}

/** Pretty multi-line summary used by both the CLI and the scheduler logs. */
export function formatRunSummary(res: RunResearchResult): string {
  const lines: string[] = [];
  const nameOf = (id: string | null) =>
    id ? getStrategy(id)?.name ?? id : "none";
  lines.push("=".repeat(60));
  if (res.selectedStrategyId) {
    const top = res.ranking.find((r) => r.strategyId === res.selectedStrategyId);
    lines.push(`SELECTED (highest-ranked validated): ${nameOf(res.selectedStrategyId)}  score=${top?.score.toFixed(3)}`);
  } else {
    lines.push("SELECTED: none — no strategy cleared every gate on both assets.");
  }
  if (res.previous) {
    if (res.selectedChanged) {
      lines.push(`↻ Selection changed: ${nameOf(res.prevSelectedId)} → ${nameOf(res.selectedStrategyId)}`);
    } else {
      lines.push(`Selection unchanged since ${new Date(res.previous.generatedAt).toLocaleDateString("en-US")}.`);
    }
    // Biggest movers.
    const movers = res.ranking
      .map((r) => ({ r, d: res.diff[r.strategyId] }))
      .filter((x) => x.d?.rankDelta != null && x.d.rankDelta !== 0)
      .sort((a, b) => Math.abs(b.d!.rankDelta!) - Math.abs(a.d!.rankDelta!))
      .slice(0, 3);
    if (movers.length) {
      lines.push("Biggest rank moves vs last run:");
      for (const m of movers) {
        const d = m.d!.rankDelta!;
        lines.push(`  ${d > 0 ? "▲" : "▼"}${Math.abs(d)}  #${m.r.rank} ${m.r.strategyName}`);
      }
    }
  } else {
    lines.push("First recorded run — no previous ranking to compare against yet.");
  }
  lines.push(`Top 5 by score:`);
  for (const r of res.ranking.slice(0, 5)) {
    const tag = r.passedBoth ? "✓" : "·";
    lines.push(`  ${tag} #${r.rank} ${r.strategyName} [${r.category}]  score=${r.score.toFixed(3)} PF=${r.meanProfitFactor.toFixed(2)}`);
  }
  lines.push("=".repeat(60));
  return lines.join("\n");
}
