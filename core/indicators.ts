// core/indicators.ts
// Causal technical indicators. Every function returns an array aligned to the
// input candles, with `NaN` in the warm-up region. Nothing here ever reads a
// value at an index greater than the one being computed.

import type { Candle } from "./types";

const closes = (c: Candle[]) => c.map((x) => x.close);

/** Simple moving average. */
export function sma(values: number[], period: number): number[] {
  const out = new Array(values.length).fill(NaN);
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= period) sum -= values[i - period];
    if (i >= period - 1) out[i] = sum / period;
  }
  return out;
}

/** Exponential moving average, seeded with an SMA for stability. */
export function ema(values: number[], period: number): number[] {
  const out = new Array(values.length).fill(NaN);
  const k = 2 / (period + 1);
  let prev = NaN;
  let seedSum = 0;
  for (let i = 0; i < values.length; i++) {
    if (i < period - 1) {
      seedSum += values[i];
      continue;
    }
    if (i === period - 1) {
      seedSum += values[i];
      prev = seedSum / period;
      out[i] = prev;
      continue;
    }
    prev = values[i] * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}

/** Wilder's RSI. */
export function rsi(candles: Candle[], period = 14): number[] {
  const v = closes(candles);
  const out = new Array(v.length).fill(NaN);
  let avgGain = 0;
  let avgLoss = 0;
  for (let i = 1; i < v.length; i++) {
    const change = v[i] - v[i - 1];
    const gain = Math.max(change, 0);
    const loss = Math.max(-change, 0);
    if (i <= period) {
      avgGain += gain;
      avgLoss += loss;
      if (i === period) {
        avgGain /= period;
        avgLoss /= period;
        out[i] = 100 - 100 / (1 + avgGain / (avgLoss || 1e-9));
      }
    } else {
      avgGain = (avgGain * (period - 1) + gain) / period;
      avgLoss = (avgLoss * (period - 1) + loss) / period;
      out[i] = 100 - 100 / (1 + avgGain / (avgLoss || 1e-9));
    }
  }
  return out;
}

export interface MacdResult {
  macd: number[];
  signal: number[];
  histogram: number[];
}

export function macd(
  candles: Candle[],
  fast = 12,
  slow = 26,
  signalPeriod = 9
): MacdResult {
  const v = closes(candles);
  const emaFast = ema(v, fast);
  const emaSlow = ema(v, slow);
  const macdLine = v.map((_, i) =>
    Number.isNaN(emaFast[i]) || Number.isNaN(emaSlow[i])
      ? NaN
      : emaFast[i] - emaSlow[i]
  );
  // Signal EMA only over the defined portion of the macd line.
  const firstValid = macdLine.findIndex((x) => !Number.isNaN(x));
  const signal = new Array(v.length).fill(NaN);
  if (firstValid >= 0) {
    const sliced = macdLine.slice(firstValid);
    const sig = ema(sliced, signalPeriod);
    for (let i = 0; i < sig.length; i++) signal[firstValid + i] = sig[i];
  }
  const histogram = macdLine.map((m, i) =>
    Number.isNaN(m) || Number.isNaN(signal[i]) ? NaN : m - signal[i]
  );
  return { macd: macdLine, signal, histogram };
}

/** Wilder's Average True Range. Used for stop placement & volatility filter. */
export function atr(candles: Candle[], period = 14): number[] {
  const out = new Array(candles.length).fill(NaN);
  const tr: number[] = new Array(candles.length).fill(NaN);
  for (let i = 0; i < candles.length; i++) {
    if (i === 0) {
      tr[i] = candles[i].high - candles[i].low;
      continue;
    }
    const h = candles[i].high;
    const l = candles[i].low;
    const pc = candles[i - 1].close;
    tr[i] = Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc));
  }
  let prev = NaN;
  for (let i = 1; i < candles.length; i++) {
    if (i < period) continue;
    if (i === period) {
      let sum = 0;
      for (let j = 1; j <= period; j++) sum += tr[j];
      prev = sum / period;
      out[i] = prev;
    } else {
      prev = (prev * (period - 1) + tr[i]) / period;
      out[i] = prev;
    }
  }
  return out;
}

export interface BollingerResult {
  middle: number[];
  upper: number[];
  lower: number[];
  /** Band width as fraction of mid — a clean volatility-regime proxy. */
  width: number[];
}

export function bollinger(
  candles: Candle[],
  period = 20,
  mult = 2
): BollingerResult {
  const v = closes(candles);
  const mid = sma(v, period);
  const upper = new Array(v.length).fill(NaN);
  const lower = new Array(v.length).fill(NaN);
  const width = new Array(v.length).fill(NaN);
  for (let i = period - 1; i < v.length; i++) {
    let sumSq = 0;
    for (let j = i - period + 1; j <= i; j++) sumSq += (v[j] - mid[i]) ** 2;
    const sd = Math.sqrt(sumSq / period);
    upper[i] = mid[i] + mult * sd;
    lower[i] = mid[i] - mult * sd;
    width[i] = (upper[i] - lower[i]) / mid[i];
  }
  return { middle: mid, upper, lower, width };
}

/**
 * Rolling-volume z-score, for spotting volume spikes. Compares current volume
 * to the mean/std of the trailing `period` bars (excluding the current bar).
 */
export function volumeZScore(candles: Candle[], period = 20): number[] {
  const out = new Array(candles.length).fill(NaN);
  for (let i = period; i < candles.length; i++) {
    let sum = 0;
    for (let j = i - period; j < i; j++) sum += candles[j].volume;
    const mean = sum / period;
    let sq = 0;
    for (let j = i - period; j < i; j++) sq += (candles[j].volume - mean) ** 2;
    const sd = Math.sqrt(sq / period) || 1e-9;
    out[i] = (candles[i].volume - mean) / sd;
  }
  return out;
}

/**
 * Swing highs/lows over a symmetric window. A pivot is confirmed only `look`
 * bars AFTER it forms, so consumers must offset by `look` to stay causal.
 */
export function swingPoints(candles: Candle[], look = 5) {
  const highs: number[] = new Array(candles.length).fill(NaN);
  const lows: number[] = new Array(candles.length).fill(NaN);
  for (let i = look; i < candles.length - look; i++) {
    let isHigh = true;
    let isLow = true;
    for (let j = i - look; j <= i + look; j++) {
      if (j === i) continue;
      if (candles[j].high >= candles[i].high) isHigh = false;
      if (candles[j].low <= candles[i].low) isLow = false;
    }
    if (isHigh) highs[i] = candles[i].high;
    if (isLow) lows[i] = candles[i].low;
  }
  return { highs, lows };
}

/**
 * Rolling support / resistance from the highest high & lowest low of the
 * trailing window (Donchian-style). Fully causal.
 */
export function donchian(candles: Candle[], period = 20) {
  const upper = new Array(candles.length).fill(NaN);
  const lower = new Array(candles.length).fill(NaN);
  for (let i = period; i < candles.length; i++) {
    let hi = -Infinity;
    let lo = Infinity;
    for (let j = i - period; j < i; j++) {
      hi = Math.max(hi, candles[j].high);
      lo = Math.min(lo, candles[j].low);
    }
    upper[i] = hi;
    lower[i] = lo;
  }
  return { upper, lower };
}

/**
 * Rolling VWAP over a trailing window. True VWAP resets each session; with
 * continuous crypto futures and no session boundaries in our data, a rolling
 * window is the honest approximation. Uses the typical price (H+L+C)/3.
 * Fully causal — bar i uses only bars [i-period+1 .. i].
 */
export function rollingVwap(candles: Candle[], period = 20): number[] {
  const out = new Array(candles.length).fill(NaN);
  for (let i = period - 1; i < candles.length; i++) {
    let pv = 0;
    let vol = 0;
    for (let j = i - period + 1; j <= i; j++) {
      const tp = (candles[j].high + candles[j].low + candles[j].close) / 3;
      pv += tp * candles[j].volume;
      vol += candles[j].volume;
    }
    out[i] = vol > 0 ? pv / vol : NaN;
  }
  return out;
}
