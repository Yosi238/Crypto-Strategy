// scripts/synthetic.ts
// Generates plausible-looking OHLCV with trend + mean-reversion + volatility
// clustering, so the engine can be exercised WITHOUT network access. This is
// ONLY for proving the plumbing works — never for drawing conclusions about a
// strategy's edge. Real research must use real Binance data (scripts/download.ts).

import type { Candle, Timeframe } from "../core/types";

const TF_MS: Record<Timeframe, number> = {
  "15m": 15 * 60_000,
  "1h": 60 * 60_000,
  "4h": 4 * 60 * 60_000,
};

export function makeSynthetic(
  n: number,
  startPrice = 30_000,
  tf: Timeframe = "1h",
  seed = 42
): Candle[] {
  let s = seed;
  const rand = () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
  const gauss = () => (rand() + rand() + rand() + rand() - 2) / 2;

  const candles: Candle[] = [];
  let price = startPrice;
  let vol = 0.01;
  let drift = 0.0002;
  const step = TF_MS[tf];
  const start = Date.now() - n * step;

  for (let i = 0; i < n; i++) {
    // Slowly varying regime: drift flips, volatility clusters.
    if (i % 400 === 0) drift = (rand() - 0.5) * 0.0008;
    vol = Math.max(0.004, vol * 0.97 + Math.abs(gauss()) * 0.004);

    const open = price;
    const ret = drift + gauss() * vol;
    const close = open * (1 + ret);
    const hi = Math.max(open, close) * (1 + Math.abs(gauss()) * vol * 0.6);
    const lo = Math.min(open, close) * (1 - Math.abs(gauss()) * vol * 0.6);
    const volume = 1000 * (1 + Math.abs(gauss()) * 2) * (1 + Math.abs(ret) * 50);

    candles.push({
      time: start + i * step,
      open,
      high: hi,
      low: lo,
      close,
      volume,
    });
    price = close;
  }
  return candles;
}
