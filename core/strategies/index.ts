// core/strategies/index.ts
// Registry of every strategy the discovery engine sweeps over, grouped by
// family. Adding a strategy here makes it appear automatically in research,
// the Research Lab table, and the diagnose report.

import type { StrategyDef } from "../types";

import { emaRsiTrend } from "./emaRsiTrend";
import { breakoutRetest } from "./breakoutRetest";
import { bbReversion } from "./bbReversion";
import { liquiditySweep } from "./liquiditySweep";

import { emaCross, mtfEma, trendContinuation } from "./trend";
import { donchianBreakout, atrBreakout, volCompressionBreakout, rangeExpansion } from "./breakout";
import { rsiReversion, vwapReversion } from "./meanReversion";
import { breakOfStructure, marketStructureShift, retestContinuation } from "./smc";
import { rsiMomentum, macdMomentum, volumeMomentum } from "./momentum";
import { srBounce, srRetest, failedBreakout } from "./supportResistance";

export const STRATEGIES: StrategyDef[] = [
  // Trend
  emaRsiTrend,
  emaCross,
  mtfEma,
  trendContinuation,
  // Breakout
  breakoutRetest,
  donchianBreakout,
  atrBreakout,
  volCompressionBreakout,
  rangeExpansion,
  // Mean Reversion
  bbReversion,
  rsiReversion,
  vwapReversion,
  // Smart Money
  liquiditySweep,
  breakOfStructure,
  marketStructureShift,
  retestContinuation,
  // Momentum
  rsiMomentum,
  macdMomentum,
  volumeMomentum,
  // Support / Resistance
  srBounce,
  srRetest,
  failedBreakout,
];

export function getStrategy(id: string): StrategyDef | undefined {
  return STRATEGIES.find((s) => s.id === id);
}

/** Distinct families, in display order. */
export const CATEGORIES = Array.from(new Set(STRATEGIES.map((s) => s.category)));
