// core/confidence.ts
// Confidence is NEVER invented. It is a transparent, documented blend of:
//   • the strategy's own setup conviction (base),
//   • regime match — does this strategy family suit the current market regime?
//   • robustness — did the edge survive out-of-sample (from validation)?
//   • recent performance — how the live paper track record looks lately.
// All four are 0..1; the weighted sum is clamped to 0..1.

import type { RegimeLabel } from "./scanner";

export interface ConfidenceInputs {
  base: number; // strategy's own confidence at the signal (0..1)
  category: string; // strategy family
  regime: RegimeLabel;
  robustness: number; // walk-forward robustness (~0..2)
  recentWinRate?: number; // 0..1 over recent paper trades
  recentSample?: number; // number of recent trades backing recentWinRate
}

export interface ConfidenceResult {
  score: number; // 0..1
  breakdown: { base: number; regimeMatch: number; robustness: number; recent: number };
}

const clamp = (x: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, x));

/**
 * How well a strategy family fits a regime (0.3..1). Documented judgement:
 * trend/momentum want trends, mean-reversion wants range/low-vol, breakouts
 * want compression/expansion, and high volatility discounts everyone.
 */
export function regimeMatch(category: string, regime: RegimeLabel): number {
  const M: Record<string, Partial<Record<RegimeLabel, number>>> = {
    Trend: { "Bull Trend": 1, "Bear Trend": 1, Expansion: 0.8, Range: 0.4, Compression: 0.5, "Low Volatility": 0.4, "High Volatility": 0.55 },
    Momentum: { "Bull Trend": 0.95, "Bear Trend": 0.95, Expansion: 0.9, Range: 0.4, Compression: 0.5, "Low Volatility": 0.4, "High Volatility": 0.6 },
    "Smart Money": { "Bull Trend": 0.9, "Bear Trend": 0.9, Expansion: 0.75, Range: 0.6, Compression: 0.6, "Low Volatility": 0.5, "High Volatility": 0.55 },
    Breakout: { Compression: 1, Expansion: 0.95, "Bull Trend": 0.75, "Bear Trend": 0.75, Range: 0.5, "Low Volatility": 0.55, "High Volatility": 0.6 },
    "Mean Reversion": { Range: 1, "Low Volatility": 0.85, Compression: 0.7, "Bull Trend": 0.35, "Bear Trend": 0.35, Expansion: 0.4, "High Volatility": 0.4 },
    "Support/Resistance": { Range: 0.9, "Low Volatility": 0.75, Compression: 0.7, "Bull Trend": 0.55, "Bear Trend": 0.55, Expansion: 0.55, "High Volatility": 0.5 },
  };
  return M[category]?.[regime] ?? 0.5;
}

const W = { base: 0.3, regime: 0.3, robust: 0.25, recent: 0.15 };

export function computeConfidence(inp: ConfidenceInputs): ConfidenceResult {
  const base = clamp(inp.base);
  const regimeFit = regimeMatch(inp.category, inp.regime);
  const robust = clamp(inp.robustness / 1); // robustness >=1 (OOS held up) saturates
  // Recent performance: neutral 0.5 until we have a meaningful sample.
  const recent =
    inp.recentSample && inp.recentSample >= 5 && inp.recentWinRate != null
      ? clamp((inp.recentWinRate - 0.3) / 0.3) // 30% → 0, 60% → 1
      : 0.5;

  const score = clamp(W.base * base + W.regime * regimeFit + W.robust * robust + W.recent * recent);
  return { score, breakdown: { base, regimeMatch: regimeFit, robustness: robust, recent } };
}
