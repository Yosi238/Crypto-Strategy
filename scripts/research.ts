// scripts/research.ts
// Manual run of the full discovery + validation + ranking pipeline on the REAL
// cached data. Writes the research snapshot the dashboard/bot/scanner read, and
// appends to the ranking history so week-over-week comparisons accumulate.
//   npx tsx scripts/research.ts          (defaults to settings timeframe / 1h)
//   npx tsx scripts/research.ts 4h
//
// Honesty: this does NOT guarantee a passing strategy. If nothing clears the
// gates, nothing is selected and the scanner stays idle. That is a valid result.

import { runResearch, formatRunSummary } from "./runResearch";
import type { Timeframe } from "../core/types";

async function main() {
  const tf = process.argv[2] as Timeframe | undefined;
  const res = await runResearch({ tf, download: false, onLog: (l) => console.log(l) });
  console.log("\n" + formatRunSummary(res));
  console.log("Snapshot written to .data/research.json · history updated.");
}

main().catch((e) => {
  console.error("\nResearch failed:", e.message);
  process.exit(1);
});
