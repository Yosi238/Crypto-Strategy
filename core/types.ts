// core/types.ts
// Shared types for the research / backtesting / signal engine.
// Kept framework-agnostic so the engine can run under `tsx`, in Next.js API
// routes, or inside the Telegram bot without dragging in React/Next deps.

export type Symbol = "BTCUSDT" | "ETHUSDT";
export type Timeframe = "15m" | "1h" | "4h";
export type Side = "long" | "short";
export type SignalAction = "long" | "short" | "none";

/** A single OHLCV candle. `time` is the candle OPEN time in ms (UTC). */
export interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

/**
 * A strategy proposes a trade *at the close of the signal candle*. Entry is
 * filled on the NEXT candle's open (see backtest.ts) to avoid look-ahead bias.
 */
export interface TradePlan {
  side: Side;
  /** Reference price used to derive SL/TP (usually the signal candle close). */
  refPrice: number;
  stopLoss: number;
  takeProfit: number;
  /** Human-readable explanation, surfaced in the UI and Telegram alerts. */
  reason: string;
  /** 0..1 model confidence, derived from confluence of conditions. */
  confidence: number;
}

/** What a strategy returns for a given bar index. `null` = no setup. */
export type StrategySignal = TradePlan | null;

export interface StrategyContext {
  candles: Candle[];
  /** Index of the candle currently being evaluated (the "signal candle"). */
  i: number;
  params: Record<string, number>;
}

export interface StrategyDef {
  id: string;
  name: string;
  /** Family/category for grouping in the Research Lab (e.g. "Trend"). */
  category: string;
  /** Plain-language description of the logic, shown in the Strategy card. */
  logic: string;
  /** Default tunable params. */
  defaults: Record<string, number>;
  /** Coarse grid used by the discovery engine. */
  grid: Record<string, number[]>;
  /**
   * Pure function. MUST only read candles at index <= ctx.i. Reading the
   * future is a bug the validation layer cannot catch for you.
   */
  evaluate(ctx: StrategyContext): StrategySignal;
}

export interface Fill {
  time: number;
  price: number;
}

export interface ClosedTrade {
  side: Side;
  entry: Fill;
  exit: Fill;
  stopLoss: number;
  takeProfit: number;
  qty: number; // base-asset units
  /** Net PnL in quote currency (USDT) after fees. */
  pnl: number;
  /** Return on the risked amount (R multiple), net of fees. */
  rMultiple: number;
  feesPaid: number;
  reason: string;
  outcome: "tp" | "sl" | "timeout";
  barsHeld: number;
}

export interface BacktestConfig {
  /** Starting paper equity in USDT. */
  initialEquity: number;
  /** Fraction of equity risked per trade (0.01 = 1%). */
  riskPerTrade: number;
  /** Taker fee per side as a fraction (e.g. 0.0004 = 0.04%). */
  takerFee: number;
  /** Slippage applied to entry & exit as a fraction of price. */
  slippage: number;
  /** Reward-to-risk multiple for the take profit. */
  rr: number;
  /** Hard cap on leverage regardless of stop distance. */
  maxLeverage: number;
  /** Max bars to hold before a timeout exit (0 = no timeout). */
  maxBarsInTrade: number;
}

export const DEFAULT_BACKTEST_CONFIG: BacktestConfig = {
  initialEquity: 10_000,
  riskPerTrade: 0.01,
  takerFee: 0.0004,
  slippage: 0.0002,
  rr: 2,
  maxLeverage: 5,
  maxBarsInTrade: 0,
};

export interface BacktestResult {
  trades: ClosedTrade[];
  metrics: PerformanceMetrics;
  equityCurve: { time: number; equity: number }[];
}

export interface PerformanceMetrics {
  totalTrades: number;
  wins: number;
  losses: number;
  winRate: number; // 0..1
  profitFactor: number; // gross profit / gross loss
  maxDrawdown: number; // 0..1 (fraction of peak equity)
  netProfit: number; // USDT
  netProfitPct: number; // vs initial equity
  avgRR: number; // average realised R multiple
  expectancy: number; // avg R per trade
  feesPaid: number;
  bestPeriod: PeriodStat | null;
  worstPeriod: PeriodStat | null;
}

export interface PeriodStat {
  label: string; // e.g. "2024-03"
  netProfit: number;
  trades: number;
}
