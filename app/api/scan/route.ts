// app/api/scan/route.ts
// Live scanner. Pulls recent PUBLIC market data (no keys, no orders), runs the
// selected & validated strategy over the latest closed candle, and returns
// enriched signals: 7-state market regime, multi-target levels (TP1 validated;
// TP2/TP3 extended references), a COMPUTED confidence score, and — when there
// is no setup — machine-generated reasons (for the Why Not Trade page).
// Every real setup is journaled to paper trades (one per candle, deduped).

import { NextResponse } from "next/server";
import { fetchRecent } from "@/data/binance";
import { loadResearch, loadSettings, loadPaperTrades, savePaperTrades } from "@/data/store";
import { getStrategy } from "@/core/strategies";
import { scan, inferRegime, type RegimeInfo } from "@/core/scanner";
import { computeConfidence, regimeMatch } from "@/core/confidence";
import { signalToPaperTrade, type PaperTrade } from "@/paper/tracker";
import { DEFAULT_BACKTEST_CONFIG } from "@/core/types";
import { configFromSettings } from "@/core/settings";
import type { Candle, Symbol, Timeframe } from "@/core/types";
import type { ScanResponse, ScanSignal } from "@/lib/dashboard-types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30; // Binance fetch headroom on Vercel

const SYMBOLS: Symbol[] = ["BTCUSDT", "ETHUSDT"];

const extTp = (entry: number | null, tp: number | null, mult: number): number | null =>
  entry == null || tp == null ? null : entry + (tp - entry) * mult;

function recentWinRate(trades: PaperTrade[], symbol: string): { wr: number; n: number } {
  const closed = trades
    .filter((t) => !t.isTest && t.symbol === symbol && t.status !== "open")
    .sort((a, b) => (b.closedAt ?? 0) - (a.closedAt ?? 0))
    .slice(0, 20);
  if (closed.length === 0) return { wr: 0.5, n: 0 };
  const wins = closed.filter((t) => t.status === "tp").length;
  return { wr: wins / closed.length, n: closed.length };
}

// Honest "why not trade" reasons derived from the regime + structure.
function noTradeReasons(regime: RegimeInfo, hasStrategy: boolean, category: string | null): string[] {
  const reasons: string[] = [];
  if (!hasStrategy) {
    reasons.push("No validated strategy is selected — research has not promoted an edge yet.");
    return reasons;
  }
  reasons.push("Selected strategy found no qualifying setup on the latest candle (no confirmation).");
  if (regime.trendStrength < 0.012 && (regime.label === "Range" || regime.label === "Low Volatility"))
    reasons.push("Trend too weak — moving averages are flat (directionless market).");
  if (regime.atrPct < 0.006) reasons.push("Low volatility — not enough range to justify risk.");
  if (regime.atrPct > 0.04) reasons.push("Risk too high — volatility is elevated; stops would be wide.");
  if (category && regimeMatch(category, regime.label) < 0.5)
    reasons.push(`Regime mismatch — the ${category} strategy is a poor fit for a ${regime.label} market.`);
  return reasons;
}

export async function GET() {
  const snap = await loadResearch();
  const settings = await loadSettings();
  const tf = (settings?.timeframe ?? snap?.timeframe ?? "1h") as Timeframe;
  const config = settings ? configFromSettings(settings) : DEFAULT_BACKTEST_CONFIG;

  const selectedId = snap?.selectedStrategyId ?? null;
  const strat = selectedId ? getStrategy(selectedId) : null;
  const result = snap?.results.find((r) => r.strategyId === selectedId);
  const paper = await loadPaperTrades();

  const candlesBySymbol: Record<string, Candle[]> = {};
  const signals: ScanSignal[] = [];
  let fetchError: string | null = null;
  const newPaperTrades: PaperTrade[] = [];

  for (const sym of SYMBOLS) {
    let candles: Candle[] = [];
    try {
      candles = await fetchRecent(sym, tf, 300);
    } catch {
      fetchError =
        "Could not reach Binance market data from this server. Live prices are unavailable here; run locally or deploy in a non-blocked region.";
      candlesBySymbol[sym] = [];
      continue;
    }
    candlesBySymbol[sym] = candles;
    const regime = inferRegime(candles);

    if (strat && result && candles.length > 0) {
      const params = result.perSymbol[sym]?.bestParams ?? strat.defaults;
      const sig = scan(sym, candles, strat, params, config, config.initialEquity);
      const robustness = result.perSymbol[sym]?.robustness ?? 0;
      const { wr, n } = recentWinRate(paper, sym);
      const conf = computeConfidence({
        base: sig.confidence,
        category: strat.category,
        regime: regime.label,
        robustness,
        recentWinRate: wr,
        recentSample: n,
      });
      const isSetup = sig.action !== "none";
      const enriched: ScanSignal = {
        ...sig,
        confidence: isSetup ? conf.score : 0,
        strategyId: strat.id,
        strategyName: strat.name,
        regime: regime.label,
        takeProfit2: extTp(sig.entry, sig.takeProfit, 1.5),
        takeProfit3: extTp(sig.entry, sig.takeProfit, 2.0),
        atrPct: regime.atrPct,
        trendStrength: regime.trendStrength,
        noTradeReasons: isSetup ? [] : noTradeReasons(regime, true, strat.category),
        confidenceBreakdown: isSetup ? conf.breakdown : null,
      };
      signals.push(enriched);

      if (isSetup) {
        const pt = signalToPaperTrade(sig);
        if (pt) {
          pt.strategyName = strat.name;
          pt.timeframe = tf;
          pt.confidence = conf.score;
          pt.takeProfit2 = extTp(sig.entry, sig.takeProfit, 1.5) ?? undefined;
          pt.takeProfit3 = extTp(sig.entry, sig.takeProfit, 2.0) ?? undefined;
          newPaperTrades.push(pt);
        }
      }
    } else {
      const price = candles[candles.length - 1]?.close ?? 0;
      signals.push({
        symbol: sym,
        action: "none",
        price,
        entry: null,
        stopLoss: null,
        takeProfit: null,
        riskReward: null,
        recommendedLeverage: null,
        confidence: 0,
        reason: strat ? "Selected strategy found no setup on the latest candle." : "No validated strategy selected. Run research first.",
        trend: regime.trend,
        time: candles[candles.length - 1]?.time ?? Date.now(),
        strategyId: strat?.id ?? null,
        strategyName: strat?.name ?? null,
        regime: regime.label,
        takeProfit2: null,
        takeProfit3: null,
        atrPct: regime.atrPct,
        trendStrength: regime.trendStrength,
        noTradeReasons: noTradeReasons(regime, !!strat, strat?.category ?? null),
        confidenceBreakdown: null,
      });
    }
  }

  if (newPaperTrades.length) {
    const ids = new Set(paper.map((t) => t.id));
    const toAdd = newPaperTrades.filter((t) => !ids.has(t.id));
    if (toAdd.length) await savePaperTrades([...paper, ...toAdd]);
  }

  const payload: ScanResponse = {
    timeframe: tf,
    hasResearch: !!snap,
    selectedStrategyId: selectedId,
    signals,
    candles: candlesBySymbol,
    generatedAt: Date.now(),
    fetchError,
  };
  return NextResponse.json(payload);
}
