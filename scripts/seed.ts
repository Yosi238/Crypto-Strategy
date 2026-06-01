// scripts/seed.ts
// Copies the small research artifacts from your local data dir into ./seed so
// they can be COMMITTED and served by a hosted (e.g. Vercel) dashboard, where
// the filesystem is read-only/ephemeral.
//
//   npm run research      # generate data locally first
//   npm run seed          # copy research.json + history (+ settings) into ./seed
//   git add seed && git commit && deploy
//
// Candles are NOT seeded — the deployed scanner fetches recent candles live
// from Binance, so only these small JSON files are needed for the dashboard.

import { promises as fs } from "fs";
import path from "path";
import { getDataDir, getSeedDir } from "../data/store";

const FILES = ["research.json", "research_history.json", "settings.json"];

async function main() {
  const src = getDataDir();
  const dest = getSeedDir();
  await fs.mkdir(dest, { recursive: true });

  let copied = 0;
  for (const f of FILES) {
    try {
      const data = await fs.readFile(path.join(src, f));
      await fs.writeFile(path.join(dest, f), data);
      console.log(`seeded ${f}`);
      copied++;
    } catch {
      console.log(`skip   ${f} (not found in ${src})`);
    }
  }

  if (copied === 0) {
    console.log("\nNothing to seed. Run `npm run research` first.");
  } else {
    console.log(`\n${copied} file(s) written to ./seed`);
    console.log("Commit ./seed and deploy. Candles are fetched live, so they are not seeded.");
  }
}

main().catch((e) => {
  console.error("Seed failed:", e.message);
  process.exit(1);
});
