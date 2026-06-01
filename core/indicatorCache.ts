// core/indicatorCache.ts
// The backtester calls strategy.evaluate() once per bar, always passing the
// SAME candles array reference. Recomputing full-series indicators on every
// call is O(n^2). We memoize each indicator array per (candles-array, params)
// using a WeakMap, so the first call computes and every later call is a lookup.
//
// Correctness note: the cached arrays are the SAME causal arrays as the direct
// functions — caching changes speed, never look-ahead behaviour.

import {
  atr,
  bollinger,
  donchian,
  ema,
  macd,
  rsi,
  swingPoints,
  volumeZScore,
  rollingVwap,
  type BollingerResult,
  type MacdResult,
} from "./indicators";
import type { Candle } from "./types";

type Bucket = Map<string, unknown>;
const cache = new WeakMap<Candle[], Bucket>();

function bucket(candles: Candle[]): Bucket {
  let b = cache.get(candles);
  if (!b) {
    b = new Map();
    cache.set(candles, b);
  }
  return b;
}

function memo<T>(candles: Candle[], key: string, compute: () => T): T {
  const b = bucket(candles);
  if (b.has(key)) return b.get(key) as T;
  const v = compute();
  b.set(key, v);
  return v;
}

const closesOf = (c: Candle[]) =>
  memo(c, "closes", () => c.map((x) => x.close));

export const cachedEma = (c: Candle[], period: number) =>
  memo(c, `ema:${period}`, () => ema(closesOf(c), period));

export const cachedRsi = (c: Candle[], period: number) =>
  memo(c, `rsi:${period}`, () => rsi(c, period));

export const cachedAtr = (c: Candle[], period: number) =>
  memo(c, `atr:${period}`, () => atr(c, period));

export const cachedMacd = (
  c: Candle[],
  fast = 12,
  slow = 26,
  sig = 9
): MacdResult => memo(c, `macd:${fast}:${slow}:${sig}`, () => macd(c, fast, slow, sig));

export const cachedBollinger = (
  c: Candle[],
  period = 20,
  mult = 2
): BollingerResult =>
  memo(c, `bb:${period}:${mult}`, () => bollinger(c, period, mult));

export const cachedDonchian = (c: Candle[], period = 20) =>
  memo(c, `dc:${period}`, () => donchian(c, period));

export const cachedVolumeZ = (c: Candle[], period = 20) =>
  memo(c, `volz:${period}`, () => volumeZScore(c, period));

export const cachedSwings = (c: Candle[], look = 5) =>
  memo(c, `swing:${look}`, () => swingPoints(c, look));

export const cachedVwap = (c: Candle[], period = 20) =>
  memo(c, `vwap:${period}`, () => rollingVwap(c, period));
