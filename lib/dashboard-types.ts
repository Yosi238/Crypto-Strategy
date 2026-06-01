// lib/dashboard-types.ts
// Shapes exchanged between the API routes and the dashboard UI.

import type { LiveSignal } from "../core/scanner";
import type { Candle, PerformanceMetrics } from "../core/types";
import type { TerminalSettings } from "../core/settings";

/** Per-symbol metrics shown in the Research Lab (walk-forward based). */
export interface SymbolMetrics {
  winRate: number;
  profitFactor: number;
  maxDrawdown: number;
  totalTrades: number;
  avgRR: number;
  feesPaid: number;
  netProfitPct: number;
  oosNetProfit: number;
  robustness: number;
  passed: boolean;
  failedGates: string[];
  bestPeriod: { label: string; netProfit: number } | null;
  worstPeriod: { label: string; netProfit: number } | null;
}

/** One row of the Research Lab table — every tested strategy, passed or not. */
export interface StrategyRow {
  id: string;
  name: string;
  category: string;
  logic: string;
  passedBoth: boolean;
  trades: number;
  winRate: number;
  profitFactor: number;
  netProfitPct: number;
  maxDrawdown: number;
  robustness: number;
  oosNetProfit: number;
  failedGates: string[];
  perSymbol: Record<string, SymbolMetrics>;
  // Ranking + week-over-week movement
  rank: number;
  score: number;
  rankDelta: number | null; // prevRank - rank ; positive = improved ; null = new
  prevRank: number | null;
  isNew: boolean;
}

export interface ScheduleInfo {
  lastRunAt: number | null;
  nextRunAt: number | null; // next Sunday 01:00 (server local), display only
}

export interface ResearchResponse {
  hasResearch: boolean;
  telegramConfigured: boolean;
  timeframe: string | null;
  generatedAt: number | null;
  selectedStrategyId: string | null;
  selectedChangedFromPrev: boolean;
  schedule: ScheduleInfo;
  strategies: StrategyRow[];
}

export interface HistoryEntry {
  generatedAt: number;
  timeframe: string;
  selectedStrategyId: string | null;
  selectedName: string | null;
  top: { rank: number; name: string; score: number; passedBoth: boolean }[];
}

export interface HistoryResponse {
  records: HistoryEntry[]; // newest last
}

/** A live signal enriched with the strategy name and a regime label. */
export interface ScanSignal extends LiveSignal {
  strategyId: string | null;
  strategyName: string | null;
  regime: string;
  /** Extended reference targets (1.5× and 2.0× the TP1 distance). NOT validated/paper-tracked. */
  takeProfit2: number | null;
  takeProfit3: number | null;
  atrPct: number;
  trendStrength: number;
  noTradeReasons: string[];
  confidenceBreakdown: { base: number; regimeMatch: number; robustness: number; recent: number } | null;
}

export interface ScanResponse {
  timeframe: string;
  hasResearch: boolean;
  selectedStrategyId: string | null;
  signals: ScanSignal[];
  candles: Record<string, Candle[]>;
  generatedAt: number;
  fetchError: string | null;
}

export interface PerformancePayload {
  all: PerformanceMetrics;
  last7: PerformanceMetrics;
  last30: PerformanceMetrics;
  equityCurve: { time: number; equity: number }[];
}

export interface PaperTradeRow {
  id: string;
  symbol: string;
  side: "long" | "short";
  entry: number;
  stopLoss: number;
  takeProfit: number;
  openedAt: number;
  status: "open" | "tp" | "sl";
  closedAt?: number;
  exitPrice?: number;
  rMultiple?: number;
  reason: string;
  isTest?: boolean;
  strategyName?: string;
  timeframe?: string;
  confidence?: number;
  leverage?: number;
  riskReward?: number;
  takeProfit2?: number;
  takeProfit3?: number;
}

export interface PaperResponse {
  trades: PaperTradeRow[];
  fetchError: string | null;
}

export interface SettingsResponse {
  settings: TerminalSettings;
  telegramConfigured: boolean;
  dataReady: boolean;
  researchReady: boolean;
}
