// scripts/download.ts
// Downloads ~2 years of OHLCV for BTCUSDT & ETHUSDT across 15m/1h/4h and caches
// them under ./.data. Run on a machine that can reach fapi.binance.com:
//   npx tsx scripts/download.ts
// Optional: npx tsx scripts/download.ts 1h   (single timeframe)

import { downloadKlines } from "../data/binance";
import { saveCandles } from "../data/store";
import type { Symbol, Timeframe } from "../core/types";

const SYMBOLS: Symbol[] = ["BTCUSDT", "ETHUSDT"];
const ALL_TF: Timeframe[] = ["15m", "1h", "4h"];

async function main() {
  const arg = process.argv[2] as Timeframe | undefined;
  const timeframes = arg && ALL_TF.includes(arg) ? [arg] : ALL_TF;

  for (const tf of timeframes) {
    for (const sym of SYMBOLS) {
      process.stdout.write(`Downloading ${sym} ${tf} (730d)… `);
      const candles = await downloadKlines(sym, tf, 730);
      await saveCandles(sym, tf, candles);
      console.log(`${candles.length} candles saved.`);
    }
  }
  console.log("\nDone. Now run: npx tsx scripts/research.ts");
}

main().catch((e) => {
  console.error("\nDownload failed:", e.message);
  console.error(
    "If this is a network/region error, Binance Futures may be blocked on your network."
  );
  process.exit(1);
});
