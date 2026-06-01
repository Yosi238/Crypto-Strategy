// scripts/diagnose.ts
// A research diagnostic. Loads the cached data and reports, honestly:
//   - symbols + candles loaded
//   - strategies tested
//   - raw signals generated (per strategy, default params)
//   - trades completed (default-param backtest)
//   - validation failures (tally + reasons)
//   - best candidates
//   - research summary
//
//   npx tsx scripts/diagnose.ts            (defaults to 1h)
//   npx tsx scripts/diagnose.ts 4h
//
// It reuses an existing research snapshot if present; otherwise it runs the
// full discovery so the validation picture is real, never assumed.

import { loadCandles, loadResearch } from "../data/store";
import { STRATEGIES, CATEGORIES, getStrategy } from "../core/strategies";
import { runBacktest } from "../core/backtest";
import { discoverAcrossSymbols, DEFAULT_GATES, type CrossAssetResult } from "../core/validation";
import { DEFAULT_BACKTEST_CONFIG, type Candle, type Symbol, type Timeframe } from "../core/types";

const SYMBOLS: Symbol[] = ["BTCUSDT", "ETHUSDT"];
const pct = (x: number) => (Number.isFinite(x) ? (x * 100).toFixed(1) + "%" : "—");
const pf = (x: number) => (Number.isFinite(x) ? x.toFixed(2) : "∞");
const bar = (n: number, max: number, w = 24) => {
  const filled = max > 0 ? Math.round((n / max) * w) : 0;
  return "█".repeat(filled) + "·".repeat(Math.max(0, w - filled));
};
const line = (s = "") => console.log(s);
const rule = () => line("─".repeat(64));

async function main() {
  const tf = (process.argv[2] as Timeframe) || "1h";

  line("");
  line("  CRYPTO RESEARCH TERMINAL — DIAGNOSTICS");
  line(`  timeframe: ${tf}   gates: PF>${DEFAULT_GATES.minProfitFactor} · trades≥${DEFAULT_GATES.minTrades} · DD<${pct(DEFAULT_GATES.maxDrawdown)}`);
  rule();

  // 1) Data ------------------------------------------------------------------
  line("DATA LOADED");
  const data: Record<string, Candle[]> = {};
  let dataOk = true;
  for (const sym of SYMBOLS) {
    const c = await loadCandles(sym, tf);
    if (!c || c.length < 1000) {
      line(`  ${sym} ${tf}: MISSING or too short (${c?.length ?? 0} candles)`);
      dataOk = false;
    } else {
      const from = new Date(c[0].time).toISOString().slice(0, 10);
      const to = new Date(c[c.length - 1].time).toISOString().slice(0, 10);
      line(`  ${sym} ${tf}: ${c.length} candles  (${from} → ${to})`);
      data[sym] = c;
    }
  }
  if (!dataOk) {
    rule();
    line(`Cannot diagnose without data. Run:  npx tsx scripts/download.ts ${tf}`);
    process.exit(1);
  }

  // 2) Strategies + raw signals + default-param trades -----------------------
  rule();
  line(`STRATEGIES TESTED: ${STRATEGIES.length}  across ${CATEGORIES.length} families`);
  line(`  families: ${CATEGORIES.join(", ")}`);
  rule();
  line("SIGNALS & TRADES (default params, full series)");
  line("  strategy                         signals   trades   win%   PF");

  let totalSignals = 0;
  let totalTrades = 0;
  const perStrat: { id: string; name: string; signals: number; trades: number }[] = [];

  for (const strat of STRATEGIES) {
    let signals = 0;
    let trades = 0;
    let wins = 0;
    let gp = 0;
    let gl = 0;
    for (const sym of SYMBOLS) {
      const c = data[sym];
      // Raw signal count: how often the idea fires at all.
      for (let i = 0; i < c.length; i++) {
        if (strat.evaluate({ candles: c, i, params: strat.defaults })) signals++;
      }
      // Completed trades with default params.
      const res = runBacktest(c, strat, strat.defaults, DEFAULT_BACKTEST_CONFIG);
      trades += res.trades.length;
      for (const t of res.trades) {
        if (t.pnl > 0) { wins++; gp += t.pnl; } else { gl += Math.abs(t.pnl); }
      }
    }
    totalSignals += signals;
    totalTrades += trades;
    perStrat.push({ id: strat.id, name: strat.name, signals, trades });
    const win = trades > 0 ? wins / trades : 0;
    const factor = gl > 0 ? gp / gl : gp > 0 ? Infinity : 0;
    line(
      `  ${strat.name.padEnd(32).slice(0, 32)} ${String(signals).padStart(7)} ${String(trades).padStart(8)}  ${pct(win).padStart(5)}  ${pf(factor).padStart(5)}`
    );
  }
  line("");
  line(`  TOTAL signals: ${totalSignals}    TOTAL trades: ${totalTrades}`);

  // 3) Validation ------------------------------------------------------------
  rule();
  let results: CrossAssetResult[];
  let selectedStrategyId: string | null = null;
  const snap = await loadResearch();
  if (snap && snap.timeframe === tf) {
    line("VALIDATION (from existing research snapshot)");
    results = snap.results;
    selectedStrategyId = snap.selectedStrategyId;
  } else {
    line("VALIDATION (no snapshot for this timeframe — running discovery, this can take a minute)…");
    results = discoverAcrossSymbols(data, STRATEGIES, DEFAULT_BACKTEST_CONFIG, DEFAULT_GATES);
    selectedStrategyId = results.find((r) => r.passedBoth)?.strategyId ?? null;
  }

  // Tally failure reasons across all strategy×symbol results.
  const reasonTally: Record<string, number> = {};
  let passedBothCount = 0;
  for (const r of results) {
    if (r.passedBoth) passedBothCount++;
    for (const d of Object.values(r.perSymbol)) {
      for (const g of d.failedGates) {
        const key = g.replace(/[0-9.]+/g, "N").replace(/\(.*?\)/g, "").trim();
        reasonTally[key] = (reasonTally[key] ?? 0) + 1;
      }
    }
  }
  line(`  strategies passing BOTH symbols: ${passedBothCount} / ${results.length}`);
  line("");
  line("  failure reasons (count across strategy×symbol):");
  const maxReason = Math.max(1, ...Object.values(reasonTally));
  for (const [reason, n] of Object.entries(reasonTally).sort((a, b) => b[1] - a[1])) {
    line(`    ${bar(n, maxReason)} ${String(n).padStart(3)}  ${reason}`);
  }

  // 4) Best candidates -------------------------------------------------------
  rule();
  line("BEST CANDIDATES (ranked by mean walk-forward profit factor)");
  const ranked = [...results].sort((a, b) => meanPf(b) - meanPf(a)).slice(0, 5);
  for (const r of ranked) {
    const cat = getStrategy(r.strategyId)?.category ?? "";
    line(`  ${r.passedBoth ? "✓" : "·"} ${r.strategyName}  [${cat}]   meanPF=${pf(meanPf(r))}`);
    for (const [sym, d] of Object.entries(r.perSymbol)) {
      line(`      ${sym}: WF trades=${d.walkForward.totalTrades} PF=${pf(d.walkForward.profitFactor)} DD=${pct(d.walkForward.maxDrawdown)} robust=${d.robustness.toFixed(2)}`);
    }
  }

  // 5) Summary ---------------------------------------------------------------
  rule();
  line("RESEARCH SUMMARY");
  if (selectedStrategyId) {
    const s = getStrategy(selectedStrategyId);
    line(`  ✓ Selected strategy: ${s?.name ?? selectedStrategyId}  [${s?.category ?? ""}]`);
    line("    It cleared every gate on BOTH symbols out-of-sample.");
  } else {
    line("  ✗ NO strategy cleared every gate on both symbols.");
    line("    This is a valid, honest result — it means: do not trade these ideas on this data.");
  }
  rule();
  line("");
}

function meanPf(r: CrossAssetResult): number {
  const vals = Object.values(r.perSymbol).map((d) =>
    Number.isFinite(d.walkForward.profitFactor) ? d.walkForward.profitFactor : 0
  );
  return vals.reduce((s, v) => s + v, 0) / (vals.length || 1);
}

main().catch((e) => {
  console.error("\nDiagnose failed:", e.message);
  process.exit(1);
});
