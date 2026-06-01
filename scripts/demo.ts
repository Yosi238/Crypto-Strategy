// scripts/demo.ts
// Proves the whole pipeline runs end-to-end on synthetic data, with no network.
//   npx tsx scripts/demo.ts
// This is a PLUMBING test. The numbers are meaningless for real trading.

import { DEFAULT_BACKTEST_CONFIG } from "../core/types";
import { STRATEGIES } from "../core/strategies";
import { discoverAcrossSymbols, DEFAULT_GATES } from "../core/validation";
import { scan } from "../core/scanner";
import { getStrategy } from "../core/strategies";
import { makeSynthetic } from "./synthetic";

function pct(x: number) {
  return (x * 100).toFixed(1) + "%";
}
function pf(x: number) {
  return Number.isFinite(x) ? x.toFixed(2) : "∞";
}

function main() {
  console.log("Generating synthetic BTC/ETH series (plumbing test only)...\n");
  const bySymbol = {
    BTCUSDT: makeSynthetic(6000, 30_000, "1h", 7),
    ETHUSDT: makeSynthetic(6000, 2_000, "1h", 99),
  };

  console.log("Running cross-asset discovery + walk-forward...\n");
  const results = discoverAcrossSymbols(
    bySymbol,
    STRATEGIES,
    DEFAULT_BACKTEST_CONFIG,
    DEFAULT_GATES
  );

  for (const r of results) {
    console.log(`── ${r.strategyName} [${r.strategyId}]  passedBoth=${r.passedBoth}`);
    for (const [sym, d] of Object.entries(r.perSymbol)) {
      console.log(
        `   ${sym}: WF trades=${d.walkForward.totalTrades} ` +
          `PF=${pf(d.walkForward.profitFactor)} ` +
          `winRate=${pct(d.walkForward.winRate)} ` +
          `maxDD=${pct(d.walkForward.maxDrawdown)} ` +
          `robustness=${d.robustness.toFixed(2)} ` +
          `passed=${d.passed}`
      );
      if (!d.passed) console.log(`      gates failed: ${d.failedGates.join("; ")}`);
    }
    console.log("");
  }

  // Show a live-scan example using the top strategy's params on BTC.
  const top = results[0];
  const strat = getStrategy(top.strategyId)!;
  const params = top.perSymbol.BTCUSDT.bestParams;
  const sig = scan(
    "BTCUSDT",
    bySymbol.BTCUSDT,
    strat,
    params,
    DEFAULT_BACKTEST_CONFIG,
    10_000
  );
  console.log("Live-scan example (BTCUSDT, latest candle):");
  console.log(JSON.stringify(sig, null, 2));

  console.log(
    "\nNOTE: synthetic data — these numbers prove the engine runs, nothing more."
  );
}

main();
