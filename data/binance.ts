// data/binance.ts
// Downloads OHLCV ("klines") from Binance USDT-M Futures. Runs on YOUR machine
// (this is plain fetch against fapi.binance.com — no API key needed for public
// market data, and NO trading keys are used anywhere in this project).
//
// Binance returns at most 1500 candles per request, so we page backwards from
// `endTime` until we've covered the requested span.

import type { Candle, Symbol, Timeframe } from "../core/types";

const BASE = "https://fapi.binance.com/fapi/v1/klines";

const TF_MS: Record<Timeframe, number> = {
  "15m": 15 * 60_000,
  "1h": 60 * 60_000,
  "4h": 4 * 60 * 60_000,
};

const LIMIT = 1500;

/** Download `days` of history for one symbol/timeframe. */
export async function downloadKlines(
  symbol: Symbol,
  timeframe: Timeframe,
  days = 730
): Promise<Candle[]> {
  const now = Date.now();
  const start = now - days * 86_400_000;
  const step = TF_MS[timeframe];
  const all: Candle[] = [];
  let cursor = start;

  while (cursor < now) {
    const url = `${BASE}?symbol=${symbol}&interval=${timeframe}&startTime=${cursor}&limit=${LIMIT}`;
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`Binance ${res.status}: ${await res.text()}`);
    }
    const rows = (await res.json()) as unknown[][];
    if (!rows.length) break;

    for (const r of rows) {
      all.push({
        time: Number(r[0]),
        open: Number(r[1]),
        high: Number(r[2]),
        low: Number(r[3]),
        close: Number(r[4]),
        volume: Number(r[5]),
      });
    }
    const last = Number(rows[rows.length - 1][0]);
    cursor = last + step;
    // Be polite to the public endpoint.
    await sleep(250);
    if (rows.length < LIMIT) break;
  }

  // De-dup and sort (Binance can overlap on boundaries).
  const seen = new Set<number>();
  return all
    .filter((c) => (seen.has(c.time) ? false : (seen.add(c.time), true)))
    .sort((a, b) => a.time - b.time);
}

/** Just the latest N candles (for the live scanner / dashboard). */
export async function fetchRecent(
  symbol: Symbol,
  timeframe: Timeframe,
  limit = 500
): Promise<Candle[]> {
  const url = `${BASE}?symbol=${symbol}&interval=${timeframe}&limit=${Math.min(limit, LIMIT)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Binance ${res.status}: ${await res.text()}`);
  const rows = (await res.json()) as unknown[][];
  return rows.map((r) => ({
    time: Number(r[0]),
    open: Number(r[1]),
    high: Number(r[2]),
    low: Number(r[3]),
    close: Number(r[4]),
    volume: Number(r[5]),
  }));
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
