// core/backtest.ts
// Event-driven backtester. Design choices that matter for honesty:
//
//  1. NO LOOK-AHEAD. A strategy is evaluated at the CLOSE of bar `i`. If it
//     fires, the entry is filled at the OPEN of bar `i+1`. We never peek at
//     data the strategy could not have known.
//
//  2. CONSERVATIVE INTRABAR FILLS. If a single bar's range touches BOTH the
//     stop and the target, we assume the STOP filled first. Real backtests
//     can't know intrabar path, so we take the pessimistic side. This biases
//     results DOWN, which is the safe direction.
//
//  3. COSTS ARE REAL. Taker fee on entry and exit, plus slippage on both
//     fills (worse price for us each time).
//
//  4. ONE POSITION AT A TIME. No pyramiding, no averaging down, no martingale.

import {
  type BacktestConfig,
  type BacktestResult,
  type Candle,
  type ClosedTrade,
  type StrategyDef,
} from "./types";
import { computeMetrics } from "./metrics";
import { computePositionSize } from "./risk";

export function runBacktest(
  candles: Candle[],
  strategy: StrategyDef,
  params: Record<string, number>,
  config: BacktestConfig
): BacktestResult {
  const trades: ClosedTrade[] = [];
  const equityCurve: { time: number; equity: number }[] = [];
  let equity = config.initialEquity;

  // Pointer to an open position; null when flat.
  let open: null | {
    side: "long" | "short";
    qty: number;
    entryPrice: number;
    entryTime: number;
    stopLoss: number;
    takeProfit: number;
    reason: string;
    riskAmount: number;
    entryBar: number;
  } = null;

  for (let i = 0; i < candles.length; i++) {
    // --- 1. Manage an open position against THIS bar's high/low ---
    if (open) {
      const bar = candles[i];
      const hitStop =
        open.side === "long" ? bar.low <= open.stopLoss : bar.high >= open.stopLoss;
      const hitTp =
        open.side === "long"
          ? bar.high >= open.takeProfit
          : bar.low <= open.takeProfit;

      let exitPrice: number | null = null;
      let outcome: ClosedTrade["outcome"] | null = null;

      if (hitStop && hitTp) {
        // Both in range — assume the stop went first (pessimistic).
        exitPrice = open.stopLoss;
        outcome = "sl";
      } else if (hitStop) {
        exitPrice = open.stopLoss;
        outcome = "sl";
      } else if (hitTp) {
        exitPrice = open.takeProfit;
        outcome = "tp";
      } else if (
        config.maxBarsInTrade > 0 &&
        i - open.entryBar >= config.maxBarsInTrade
      ) {
        exitPrice = bar.close;
        outcome = "timeout";
      }

      if (exitPrice !== null && outcome) {
        // Slippage worsens the exit; long exits a touch lower, short a touch higher.
        const slipped =
          open.side === "long"
            ? exitPrice * (1 - config.slippage)
            : exitPrice * (1 + config.slippage);

        const gross =
          open.side === "long"
            ? (slipped - open.entryPrice) * open.qty
            : (open.entryPrice - slipped) * open.qty;

        const exitFee = slipped * open.qty * config.takerFee;
        const entryFee = open.entryPrice * open.qty * config.takerFee;
        const fees = entryFee + exitFee;
        const pnl = gross - fees;

        equity += pnl;
        trades.push({
          side: open.side,
          entry: { time: open.entryTime, price: open.entryPrice },
          exit: { time: bar.time, price: slipped },
          stopLoss: open.stopLoss,
          takeProfit: open.takeProfit,
          qty: open.qty,
          pnl,
          rMultiple: open.riskAmount > 0 ? pnl / open.riskAmount : 0,
          feesPaid: fees,
          reason: open.reason,
          outcome,
          barsHeld: i - open.entryBar,
        });
        equityCurve.push({ time: bar.time, equity });
        open = null;
      }
    }

    // --- 2. Look for a NEW signal at the close of this bar (only if flat) ---
    if (!open && i < candles.length - 1) {
      const signal = strategy.evaluate({ candles, i, params });
      if (signal) {
        // Fill at NEXT bar's open, with slippage against us.
        const next = candles[i + 1];
        const fillBase = next.open;
        const entryPrice =
          signal.side === "long"
            ? fillBase * (1 + config.slippage)
            : fillBase * (1 - config.slippage);

        const sizing = computePositionSize({
          equity,
          entry: entryPrice,
          stopLoss: signal.stopLoss,
          riskPerTrade: config.riskPerTrade,
          maxLeverage: config.maxLeverage,
        });

        if (sizing.qty > 0 && Number.isFinite(entryPrice)) {
          open = {
            side: signal.side,
            qty: sizing.qty,
            entryPrice,
            entryTime: next.time,
            stopLoss: signal.stopLoss,
            takeProfit: signal.takeProfit,
            reason: signal.reason,
            riskAmount: sizing.riskAmount,
            entryBar: i + 1,
          };
        }
      }
    }
  }

  // Mark the final equity point even if no trade closed on the last bar.
  if (
    candles.length &&
    (equityCurve.length === 0 ||
      equityCurve[equityCurve.length - 1].time !==
        candles[candles.length - 1].time)
  ) {
    equityCurve.push({ time: candles[candles.length - 1].time, equity });
  }

  return {
    trades,
    equityCurve,
    metrics: computeMetrics(trades, equityCurve, config.initialEquity),
  };
}
