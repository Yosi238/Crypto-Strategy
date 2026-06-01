// lib/signals.ts
// Builds one unified "feed signal" list from the live scan + the paper-trade
// journal, and renders the Telegram-style text. Pure — shared by the Signal
// Center page and the dashboard panel.

import type { PaperResponse, ScanResponse, ScanSignal, PaperTradeRow } from "./dashboard-types";

export type SignalStatus = "Waiting" | "Active" | "TP Hit" | "SL Hit" | "Expired" | "Cancelled";

export interface FeedSignal {
  id: string;
  symbol: string;
  direction: "LONG" | "SHORT";
  entry: number | null;
  stopLoss: number | null;
  takeProfit: number | null;
  takeProfit2: number | null;
  takeProfit3: number | null;
  riskReward: number | null;
  leverage: number | null;
  confidence: number;
  strategyName: string | null;
  timeframe: string;
  time: number;
  reason: string;
  status: SignalStatus;
  isTest: boolean;
}

export const STATUS_COLOR: Record<SignalStatus, string> = {
  Waiting: "#f5a623",
  Active: "#39c0ed",
  "TP Hit": "#1fd6a0",
  "SL Hit": "#ff5470",
  Expired: "#5b6878",
  Cancelled: "#5b6878",
};

const rrOf = (entry: number, sl: number, tp: number) => {
  const risk = Math.abs(entry - sl);
  return risk > 0 ? Math.abs(tp - entry) / risk : null;
};

function fromPaper(t: PaperTradeRow, fallbackTf: string): FeedSignal {
  const status: SignalStatus = t.status === "tp" ? "TP Hit" : t.status === "sl" ? "SL Hit" : "Active";
  return {
    id: t.id,
    symbol: t.symbol,
    direction: t.side === "long" ? "LONG" : "SHORT",
    entry: t.entry,
    stopLoss: t.stopLoss,
    takeProfit: t.takeProfit,
    takeProfit2: t.takeProfit2 ?? null,
    takeProfit3: t.takeProfit3 ?? null,
    riskReward: t.riskReward ?? rrOf(t.entry, t.stopLoss, t.takeProfit),
    leverage: t.leverage ?? null,
    confidence: t.confidence ?? 0,
    strategyName: t.strategyName ?? null,
    timeframe: t.timeframe ?? fallbackTf,
    time: t.openedAt,
    reason: t.reason,
    status,
    isTest: !!t.isTest,
  };
}

function fromScan(s: ScanSignal, tf: string): FeedSignal {
  return {
    id: `${s.symbol}-${s.time}`,
    symbol: s.symbol,
    direction: s.action === "short" ? "SHORT" : "LONG",
    entry: s.entry,
    stopLoss: s.stopLoss,
    takeProfit: s.takeProfit,
    takeProfit2: s.takeProfit2,
    takeProfit3: s.takeProfit3,
    riskReward: s.riskReward,
    leverage: s.recommendedLeverage,
    confidence: s.confidence,
    strategyName: s.strategyName,
    timeframe: tf,
    time: s.time,
    reason: s.reason,
    status: "Waiting",
    isTest: false,
  };
}

/** Merge live scan setups + paper journal into one newest-first feed. */
export function buildFeed(scan: ScanResponse | null, paper: PaperResponse | null): FeedSignal[] {
  const tf = scan?.timeframe ?? "1h";
  const byId = new Map<string, FeedSignal>();

  for (const t of paper?.trades ?? []) byId.set(t.id, fromPaper(t, tf));

  // A live setup that hasn't been journaled yet shows as "Waiting".
  for (const s of scan?.signals ?? []) {
    if (s.action === "none") continue;
    const id = `${s.symbol}-${s.time}`;
    if (!byId.has(id)) byId.set(id, fromScan(s, tf));
  }

  return [...byId.values()].sort((a, b) => b.time - a.time);
}

/** The single most relevant signal to headline (active/waiting first, else most recent). */
export function headlineSignal(feed: FeedSignal[]): FeedSignal | null {
  const live = feed.filter((f) => f.status === "Active" || f.status === "Waiting");
  return live[0] ?? feed[0] ?? null;
}

const fmt = (x: number | null) =>
  x == null ? "—" : x.toLocaleString("en-US", { maximumFractionDigits: 2 });

/** Telegram-style alert text shown as a preview inside each card. */
export function telegramText(s: FeedSignal): string {
  const emoji = s.direction === "LONG" ? "🟢" : "🔴";
  const lines = [
    `${s.direction === "LONG" ? "🚀" : "🔻"} ${s.symbol} ${s.direction} ${emoji}`,
    `Entry: ${fmt(s.entry)}`,
    `SL: ${fmt(s.stopLoss)}`,
    `TP1: ${fmt(s.takeProfit)}`,
    `TP2: ${fmt(s.takeProfit2)}`,
    `TP3: ${fmt(s.takeProfit3)}`,
    `RR: ${s.riskReward ? s.riskReward.toFixed(2) : "—"}`,
    `Leverage: ${s.leverage ? s.leverage.toFixed(1) + "×" : "—"}`,
    `Confidence: ${(s.confidence * 100).toFixed(0)}%`,
    `TF: ${s.timeframe}`,
    `Reason: ${s.reason}`,
  ];
  if (s.isTest) lines.unshift("⚠️ TEST SIGNAL — not a real setup");
  return lines.join("\n");
}
