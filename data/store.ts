// data/store.ts
// Local persistence layer. Every read/write goes through this module, so the
// storage backend can change in one place.
//
// Deployment-aware paths:
//   • WRITE_DIR — where runtime writes go. Order of preference:
//       1. process.env.DATA_DIR (e.g. a mounted persistent volume)
//       2. /tmp/.data when running on Vercel / a read-only filesystem
//       3. <cwd>/.data for local dev and self-hosted servers
//   • SEED_DIR — <cwd>/seed, a READ-ONLY directory you can commit so a hosted
//     dashboard can serve research generated elsewhere (see `npm run seed`).
//
// Reads check WRITE_DIR first, then fall back to SEED_DIR. Writes are wrapped
// so a read-only filesystem (Vercel's, outside /tmp) degrades gracefully
// instead of crashing an API route — the app simply behaves as "no data yet".

import { promises as fs } from "fs";
import path from "path";
import type { Candle, Symbol, Timeframe } from "../core/types";
import type { CrossAssetResult } from "../core/validation";
import type { PaperTrade } from "../paper/tracker";
import type { TerminalSettings } from "../core/settings";
import type { RankingRecord } from "../core/ranking";
import type { Edge } from "../core/edges";

const onVercel = !!process.env.VERCEL || !!process.env.NOW_REGION;
const WRITE_DIR =
  process.env.DATA_DIR ??
  (onVercel ? path.join("/tmp", ".data") : path.resolve(process.cwd(), ".data"));
const SEED_DIR = path.resolve(process.cwd(), "seed");

export function getDataDir() {
  return WRITE_DIR;
}
export function getSeedDir() {
  return SEED_DIR;
}

async function ensureDir() {
  try {
    await fs.mkdir(WRITE_DIR, { recursive: true });
  } catch {
    /* read-only fs — writes will no-op below */
  }
}

/** Read JSON from WRITE_DIR, then SEED_DIR. Returns null if neither exists. */
async function readJson<T>(name: string): Promise<T | null> {
  for (const dir of [WRITE_DIR, SEED_DIR]) {
    try {
      const raw = await fs.readFile(path.join(dir, name), "utf8");
      return JSON.parse(raw) as T;
    } catch {
      /* try next location */
    }
  }
  return null;
}

/** Write JSON to WRITE_DIR. Never throws; returns false if the fs is read-only. */
async function writeJson(name: string, data: unknown, pretty = true): Promise<boolean> {
  try {
    await ensureDir();
    await fs.writeFile(path.join(WRITE_DIR, name), JSON.stringify(data, null, pretty ? 2 : 0));
    return true;
  } catch (e) {
    console.warn(`[store] could not persist ${name} (${(e as Error).message}). ` +
      `On Vercel, runtime writes are ephemeral — generate data with the CLI and commit it via 'npm run seed'.`);
    return false;
  }
}

// ── Candles ──────────────────────────────────────────────────────────────────
const candleName = (symbol: Symbol, tf: Timeframe) => `candles_${symbol}_${tf}.json`;

export async function saveCandles(symbol: Symbol, tf: Timeframe, candles: Candle[]) {
  await writeJson(candleName(symbol, tf), candles, false);
}
export async function loadCandles(symbol: Symbol, tf: Timeframe): Promise<Candle[] | null> {
  return readJson<Candle[]>(candleName(symbol, tf));
}

// ── Research snapshot ────────────────────────────────────────────────────────
export interface ResearchSnapshot {
  generatedAt: number;
  timeframe: Timeframe;
  results: CrossAssetResult[];
  /** id of the strategy the dashboard should treat as "selected", if any passed. */
  selectedStrategyId: string | null;
  config: Record<string, number>;
  /** Segmented edges (asset × direction × regime × strategy). Optional for back-compat. */
  edges?: Edge[];
}

export async function saveResearch(snap: ResearchSnapshot) {
  await writeJson("research.json", snap);
}
export async function loadResearch(): Promise<ResearchSnapshot | null> {
  return readJson<ResearchSnapshot>("research.json");
}

// ── Paper trades ─────────────────────────────────────────────────────────────
export async function loadPaperTrades(): Promise<PaperTrade[]> {
  return (await readJson<PaperTrade[]>("paper_trades.json")) ?? [];
}
export async function savePaperTrades(trades: PaperTrade[]) {
  await writeJson("paper_trades.json", trades);
}

// ── Settings ─────────────────────────────────────────────────────────────────
export async function loadSettings(): Promise<TerminalSettings | null> {
  return readJson<TerminalSettings>("settings.json");
}
export async function saveSettings(s: TerminalSettings) {
  await writeJson("settings.json", s);
}

// ── Ranking history ──────────────────────────────────────────────────────────
export async function loadRankingHistory(): Promise<RankingRecord[]> {
  return (await readJson<RankingRecord[]>("research_history.json")) ?? [];
}
export async function saveRankingHistory(records: RankingRecord[]) {
  await writeJson("research_history.json", records);
}
/** Append a ranking record, keeping at most `cap` most-recent entries. */
export async function appendRankingRecord(rec: RankingRecord, cap = 104): Promise<RankingRecord[]> {
  const all = await loadRankingHistory();
  all.push(rec);
  const trimmed = all.slice(-cap);
  await saveRankingHistory(trimmed);
  return trimmed;
}
