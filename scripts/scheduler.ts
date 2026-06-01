// scripts/scheduler.ts
// Automatic weekly research scheduler — no external cron dependency.
// Every Sunday at SCHEDULE_HOUR (local, default 01:00) it:
//   1. downloads fresh BTC/ETH data,
//   2. re-runs discovery + validation,
//   3. re-ranks all strategies and records the ranking in history,
//   4. compares against the previous ranking and logs the changes,
//   5. updates the snapshot so the live scanner uses the highest-ranked
//      VALIDATED strategy.
//
//   npm run schedule           # run the loop (Sundays)
//   npm run schedule -- --now  # also run once immediately on startup
//
// Keep this process alive (pm2 / systemd / a terminal). For a fully managed
// alternative, point OS cron / Windows Task Scheduler at `npm run research`
// weekly — the pipeline and history behave identically either way.

import { runResearch, formatRunSummary } from "./runResearch";
import { loadRankingHistory } from "../data/store";

const SCHEDULE_DAY = 0; // Sunday
const SCHEDULE_HOUR = Number(process.env.SCHEDULE_HOUR ?? 1);
const RUN_NOW = process.argv.includes("--now");
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

const ts = () => new Date().toLocaleString("en-US");
const log = (s: string) => console.log(`[${ts()}] ${s}`);

function nextSunday(hour: number): Date {
  const now = new Date();
  const d = new Date(now);
  d.setHours(hour, 0, 0, 0);
  // advance to the next Sunday strictly in the future
  let add = (SCHEDULE_DAY - d.getDay() + 7) % 7;
  if (add === 0 && d.getTime() <= now.getTime()) add = 7;
  d.setDate(d.getDate() + add);
  return d;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function sleepUntil(target: Date) {
  // Sleep in <=6h chunks so we tolerate clock changes / machine sleep.
  const CHUNK = 6 * 60 * 60 * 1000;
  for (;;) {
    const remaining = target.getTime() - Date.now();
    if (remaining <= 0) return;
    await sleep(Math.min(remaining, CHUNK));
  }
}

async function doRun(reason: string) {
  log(`Starting research run (${reason})…`);
  try {
    const res = await runResearch({ download: true, onLog: (l) => log(l) });
    log(res.downloadSkipped ? "Note: used cached data (download unavailable)." : "Fresh data downloaded.");
    console.log(formatRunSummary(res));
    if (res.selectedChanged) {
      log(`⚠ Live scanner will now use a DIFFERENT strategy than last week.`);
    }
  } catch (e) {
    log(`Research run FAILED: ${(e as Error).message}`);
    log("The loop continues; it will retry on the next schedule.");
  }
}

async function main() {
  log(`Scheduler started. Weekly run: Sundays at ${String(SCHEDULE_HOUR).padStart(2, "0")}:00 local.`);

  const history = await loadRankingHistory();
  const last = history.length ? history[history.length - 1] : null;
  const stale = !last || Date.now() - last.generatedAt > WEEK_MS;

  if (RUN_NOW) {
    await doRun("--now flag");
  } else if (stale) {
    log(last ? "Last research run is over a week old — running a catch-up now." : "No prior research found — running an initial pass now.");
    await doRun("startup catch-up");
  } else {
    log(`Last run ${new Date(last!.generatedAt).toLocaleString("en-US")} is recent; waiting for Sunday.`);
  }

  for (;;) {
    const next = nextSunday(SCHEDULE_HOUR);
    log(`Next scheduled run: ${next.toLocaleString("en-US")}.`);
    await sleepUntil(next);
    await doRun("weekly schedule");
  }
}

main().catch((e) => {
  console.error("Scheduler crashed:", e);
  process.exit(1);
});
