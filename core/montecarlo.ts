// core/montecarlo.ts
// Bootstrap Monte Carlo over a sequence of realised R-multiples. We resample
// the trade outcomes (with replacement) many times to estimate how the SAME
// edge could have played out under a different ordering/sampling — the honest
// way to talk about risk of ruin and expected drawdown rather than a single
// historical path. No distribution is assumed; we only reshuffle what happened.

export interface MonteCarloResult {
  runs: number;
  trades: number;
  riskFraction: number;
  riskOfRuin: number; // P(equity falls to/through the ruin threshold)
  ruinThresholdPct: number; // e.g. 0.5 = a 50% account loss counts as ruin
  medianMaxDrawdown: number; // 0..1
  p95MaxDrawdown: number; // 0..1 (a bad-but-plausible case)
  medianReturnPct: number; // 0..1+ relative to start
  returnPctls: { p5: number; p25: number; p50: number; p75: number; p95: number };
  probProfit: number; // fraction of paths ending above start
}

// Small deterministic RNG so results are reproducible.
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pctl = (sorted: number[], p: number) => {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.round(p * (sorted.length - 1))));
  return sorted[idx];
};

export function monteCarlo(
  rMultiples: number[],
  opts: { runs?: number; riskFraction?: number; ruinThresholdPct?: number; horizon?: number; seed?: number } = {}
): MonteCarloResult | null {
  const trades = rMultiples.length;
  if (trades < 10) return null; // too few outcomes to say anything honest

  const runs = opts.runs ?? 2000;
  const riskFraction = opts.riskFraction ?? 0.01;
  const ruinThresholdPct = opts.ruinThresholdPct ?? 0.5;
  const horizon = opts.horizon ?? trades;
  const rand = mulberry32(opts.seed ?? 1234567);

  const ruinFloor = 1 - ruinThresholdPct; // as fraction of starting equity (=1)
  let ruined = 0;
  let profitable = 0;
  const maxDDs: number[] = [];
  const finals: number[] = [];

  for (let r = 0; r < runs; r++) {
    let equity = 1; // normalised
    let peak = 1;
    let maxDD = 0;
    let hitRuin = false;
    for (let t = 0; t < horizon; t++) {
      const R = rMultiples[Math.floor(rand() * trades)];
      equity += R * riskFraction * equity; // risk a fraction of CURRENT equity (compounding)
      if (equity <= 0) equity = 0;
      peak = Math.max(peak, equity);
      const dd = peak > 0 ? 1 - equity / peak : 0;
      if (dd > maxDD) maxDD = dd;
      if (equity <= ruinFloor) hitRuin = true;
      if (equity <= 0) break;
    }
    if (hitRuin) ruined++;
    if (equity > 1) profitable++;
    maxDDs.push(maxDD);
    finals.push(equity - 1); // return relative to start
  }

  maxDDs.sort((a, b) => a - b);
  finals.sort((a, b) => a - b);

  return {
    runs,
    trades,
    riskFraction,
    riskOfRuin: ruined / runs,
    ruinThresholdPct,
    medianMaxDrawdown: pctl(maxDDs, 0.5),
    p95MaxDrawdown: pctl(maxDDs, 0.95),
    medianReturnPct: pctl(finals, 0.5),
    returnPctls: {
      p5: pctl(finals, 0.05),
      p25: pctl(finals, 0.25),
      p50: pctl(finals, 0.5),
      p75: pctl(finals, 0.75),
      p95: pctl(finals, 0.95),
    },
    probProfit: profitable / runs,
  };
}
