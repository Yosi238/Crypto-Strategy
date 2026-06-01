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
//  3. COSTS ARE REAL. Taker fee on entry and exit, plus volatility-scaled
//     slippage on both fills (higher during elevated-ATR regimes).
//
//  4. ONE POSITION AT A TIME. No pyramiding, no averaging down, no martingale.
//
//  5. OPEN TRADES ARE ALWAYS CLOSED. Any position still open when candles run
//     out is force-closed at the final bar's close. No trades are silently dropped.
//
//  6. MARK-TO-MARKET EQUITY. While a position is open, the equity curve records
//     the worst-case intrabar unrealised equity on each bar so that drawdown
//     calculations capture real intrabar adverse moves, not just closed-trade ticks.

import {
  type BacktestConfig,
  type BacktestResult,
  type Candle,
  type ClosedTrade,
  type StrategyDef,
} from "./types";
import { computeMetrics } from "./metrics";
import { computePositionSize } from "./risk";

// ---------------------------------------------------------------------------
// Volatility-scaled slippage (Task 1.3)
// ---------------------------------------------------------------------------

/**
 * Precompute a volatility tier for every bar in O(n) time.
 * Compares each bar's Wilder ATR(14) against its trailing 252-bar mean.
 *   0 = normal   (ATR ≤ 1.5× mean)
 *   1 = high     (ATR  > 1.5× mean)
 *   2 = extreme  (ATR  > 2.5× mean — liquidation cascade territory)
 */
function computeVolTiers(candles: Candle[]): Uint8Array {
  const n = candles.length;
  const atrLen = 14;
  const window = 252;
  const tiers = new Uint8Array(n);

  // Wilder's ATR(14)
  const atr: number[] = new Array(n).fill(NaN);
  let prevAtr = NaN;
  for (let i = 1; i < n; i++) {
    const tr = Math.max(
      candles[i].high - candles[i].low,
      Math.abs(candles[i].high - candles[i - 1].close),
      Math.abs(candles[i].low - candles[i - 1].close)
    );
    if (i < atrLen) continue;
    if (i === atrLen) {
      let s = 0;
      for (let j = 1; j <= atrLen; j++) {
        s += Math.max(
          candles[j].high - candles[j].low,
          Math.abs(candles[j].high - candles[j - 1].close),
          Math.abs(candles[j].low - candles[j - 1].close)
        );
      }
      prevAtr = s / atrLen;
    } else {
      prevAtr = (prevAtr * (atrLen - 1) + tr) / atrLen;
    }
    atr[i] = prevAtr;
  }

  // Compare current ATR to the trailing `window`-bar mean (excluding current bar).
  for (let i = atrLen; i < n; i++) {
    if (isNaN(atr[i])) continue;
    const start = Math.max(atrLen, i - window);
    let s = 0, cnt = 0;
    for (let j = start; j < i; j++) {
      if (!isNaN(atr[j])) { s += atr[j]; cnt++; }
    }
    if (cnt < 20) continue; // not enough history to classify
    const mean = s / cnt;
    const ratio = atr[i] / mean;
    if (ratio >= 2.5) tiers[i] = 2;
    else if (ratio >= 1.5) tiers[i] = 1;
  }
  return tiers;
}

function slippageAt(config: BacktestConfig, tier: number): number {
  if (tier === 2) return config.slippageExtreme;
  if (tier === 1) return config.slippageHigh;
  return config.slippage;
}

// ---------------------------------------------------------------------------
// Main backtester
// ---------------------------------------------------------------------------

export function runBacktest(
  candles: Candle[],
  strategy: StrategyDef,
  params: Record<string, number>,
  config: BacktestConfig
): BacktestResult {
  const trades: ClosedTrade[] = [];
  const equityCurve: { time: number; equity: number }[] = [];
  let equity = config.initialEquity;

  // Precompute volatility tier for every bar (used for slippage selection).
  const volTiers = computeVolTiers(candles);

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
    const bar = candles[i];

    // --- 1. Manage an open position against THIS bar's high/low ---
    if (open) {
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
        equity = closePosition(open, exitPrice, outcome, bar.time, i, equity, config, volTiers[i], trades, equityCurve);
        open = null;
      } else {
        // Task 1.2 — mark-to-market equity point at the worst intrabar price.
        // This ensures drawdown calculations capture unrealised adverse moves.
        const worstPrice = open.side === "long" ? bar.low : bar.high;
        const unrealised =
          open.side === "long"
            ? (worstPrice - open.entryPrice) * open.qty
            : (open.entryPrice - worstPrice) * open.qty;
        equityCurve.push({ time: bar.time, equity: equity + unrealised });
      }
    }

    // --- 2. Look for a NEW signal at the close of this bar (only if flat) ---
    if (!open && i < candles.length - 1) {
      const signal = strategy.evaluate({ candles, i, params });
      if (signal) {
        // Fill at NEXT bar's open, with volatility-scaled slippage against us.
        const next = candles[i + 1];
        const slip = slippageAt(config, volTiers[i + 1]);
        const fillBase = next.open;
        const entryPrice =
          signal.side === "long"
            ? fillBase * (1 + slip)
            : fillBase * (1 - slip);

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

  // Task 1.1 — force-close any position still open when candle data ends.
  // Without this, the last 1-3 trades are silently dropped from all metrics.
  if (open && candles.length > 0) {
    const lastBar = candles[candles.length - 1];
    equity = closePosition(
      open,
      lastBar.close,
      "timeout",
      lastBar.time,
      candles.length - 1,
      equity,
      config,
      volTiers[candles.length - 1],
      trades,
      equityCurve
    );
    open = null;
  }

  // Ensure the equity curve has a point at the very last bar.
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

// ---------------------------------------------------------------------------
// Shared close logic (used for normal exits and the end-of-data force-close)
// ---------------------------------------------------------------------------

function closePosition(
  open: {
    side: "long" | "short";
    qty: number;
    entryPrice: number;
    entryTime: number;
    stopLoss: number;
    takeProfit: number;
    reason: string;
    riskAmount: number;
    entryBar: number;
  },
  exitPrice: number,
  outcome: ClosedTrade["outcome"],
  exitTime: number,
  exitBarIndex: number,
  equity: number,
  config: BacktestConfig,
  volTier: number,
  trades: ClosedTrade[],
  equityCurve: { time: number; equity: number }[]
): number {
  const slip = slippageAt(config, volTier);
  const slipped =
    open.side === "long"
      ? exitPrice * (1 - slip)
      : exitPrice * (1 + slip);

  const gross =
    open.side === "long"
      ? (slipped - open.entryPrice) * open.qty
      : (open.entryPrice - slipped) * open.qty;

  const exitFee = slipped * open.qty * config.takerFee;
  const entryFee = open.entryPrice * open.qty * config.takerFee;
  const fees = entryFee + exitFee;
  const pnl = gross - fees;

  const newEquity = equity + pnl;
  trades.push({
    side: open.side,
    entry: { time: open.entryTime, price: open.entryPrice },
    exit: { time: exitTime, price: slipped },
    stopLoss: open.stopLoss,
    takeProfit: open.takeProfit,
    qty: open.qty,
    pnl,
    rMultiple: open.riskAmount > 0 ? pnl / open.riskAmount : 0,
    feesPaid: fees,
    reason: open.reason,
    outcome,
    barsHeld: exitBarIndex - open.entryBar,
  });
  equityCurve.push({ time: exitTime, equity: newEquity });
  return newEquity;
}
