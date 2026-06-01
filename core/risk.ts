// core/risk.ts
// Position sizing and leverage. The golden rule: the dollar amount risked is
// fixed at `riskPerTrade * equity`. Position size falls out of the stop
// distance — never the other way around. Leverage is a *consequence*, capped.

export interface PositionSizing {
  /** Base-asset quantity to trade. */
  qty: number;
  /** Notional value of the position in USDT. */
  notional: number;
  /** Dollar amount at risk if the stop is hit (≈ riskPerTrade * equity). */
  riskAmount: number;
  /** Distance to stop as a fraction of entry. */
  stopDistancePct: number;
  /** Leverage implied to hold this notional against current equity, capped. */
  recommendedLeverage: number;
  /** True if the cap forced a smaller-than-ideal position. */
  cappedByLeverage: boolean;
}

export function computePositionSize(params: {
  equity: number;
  entry: number;
  stopLoss: number;
  riskPerTrade: number;
  maxLeverage: number;
}): PositionSizing {
  const { equity, entry, stopLoss, riskPerTrade, maxLeverage } = params;
  const stopDistance = Math.abs(entry - stopLoss);
  const stopDistancePct = stopDistance / entry;
  const riskAmount = equity * riskPerTrade;

  // Ideal qty so that (qty * stopDistance) == riskAmount.
  let qty = stopDistance > 0 ? riskAmount / stopDistance : 0;
  let notional = qty * entry;

  // Leverage = notional / equity. If that exceeds the cap, shrink the position.
  let recommendedLeverage = notional / equity;
  let cappedByLeverage = false;
  if (recommendedLeverage > maxLeverage) {
    cappedByLeverage = true;
    notional = maxLeverage * equity;
    qty = notional / entry;
    recommendedLeverage = maxLeverage;
  }

  return {
    qty,
    notional,
    riskAmount,
    stopDistancePct,
    // Round leverage up to the next whole multiple a trader would actually set,
    // but never above the cap.
    recommendedLeverage: Math.min(
      maxLeverage,
      Math.max(1, Math.ceil(recommendedLeverage))
    ),
    cappedByLeverage,
  };
}

/**
 * Suggest leverage purely from stop distance, independent of sizing. Tighter
 * stops tolerate more leverage; this is what we surface in alerts as a sane
 * ceiling. Always clamped to [1, maxLeverage].
 */
export function leverageFromStop(
  stopDistancePct: number,
  maxLeverage: number
): number {
  if (stopDistancePct <= 0) return 1;
  // Target ~10% notional move to liquidation buffer: lev ≈ 0.1 / stopDist.
  const raw = 0.1 / stopDistancePct;
  return Math.min(maxLeverage, Math.max(1, Math.floor(raw)));
}
