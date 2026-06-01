// core/settings.ts
// User-editable settings. These OVERRIDE the engine defaults at run time.
// Threshold changes only take effect on the next `npm run research` run —
// and loosening a gate never makes a strategy good, it just lowers the bar.

import { DEFAULT_BACKTEST_CONFIG, type BacktestConfig, type Timeframe } from "./types";
import { DEFAULT_GATES, type Gates } from "./validation";

export interface TerminalSettings {
  timeframe: Timeframe;
  riskPerTrade: number; // fraction, e.g. 0.01
  maxLeverage: number;
  rr: number;
  gates: Gates;
}

export const DEFAULT_SETTINGS: TerminalSettings = {
  timeframe: "1h",
  riskPerTrade: DEFAULT_BACKTEST_CONFIG.riskPerTrade,
  maxLeverage: DEFAULT_BACKTEST_CONFIG.maxLeverage,
  rr: DEFAULT_BACKTEST_CONFIG.rr,
  gates: { ...DEFAULT_GATES },
};

/** Clamp user input into safe, honest ranges. */
export function sanitizeSettings(s: Partial<TerminalSettings>): TerminalSettings {
  const tf = (["15m", "1h", "4h"] as Timeframe[]).includes(s.timeframe as Timeframe)
    ? (s.timeframe as Timeframe)
    : DEFAULT_SETTINGS.timeframe;
  const g: Partial<Gates> = s.gates ?? {};
  return {
    timeframe: tf,
    riskPerTrade: clamp(s.riskPerTrade ?? DEFAULT_SETTINGS.riskPerTrade, 0.001, 0.05),
    maxLeverage: clamp(s.maxLeverage ?? DEFAULT_SETTINGS.maxLeverage, 1, 5),
    rr: clamp(s.rr ?? DEFAULT_SETTINGS.rr, 1, 5),
    gates: {
      minTrades: Math.round(clamp(g.minTrades ?? DEFAULT_GATES.minTrades, 30, 1000)),
      minProfitFactor: clamp(g.minProfitFactor ?? DEFAULT_GATES.minProfitFactor, 1, 5),
      maxDrawdown: clamp(g.maxDrawdown ?? DEFAULT_GATES.maxDrawdown, 0.05, 0.6),
      requirePositiveOOS: g.requirePositiveOOS ?? DEFAULT_GATES.requirePositiveOOS,
    },
  };
}

export function configFromSettings(s: TerminalSettings): BacktestConfig {
  return {
    ...DEFAULT_BACKTEST_CONFIG,
    riskPerTrade: s.riskPerTrade,
    maxLeverage: s.maxLeverage,
    rr: s.rr,
  };
}

function clamp(x: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, Number.isFinite(x) ? x : lo));
}
