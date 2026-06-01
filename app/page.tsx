// app/page.tsx — Dashboard
"use client";

import { useState } from "react";
import { useTerminal } from "@/lib/terminal-context";
import { filteredPaperMetrics, type PaperTrade } from "@/paper/tracker";
import { buildFeed, headlineSignal } from "@/lib/signals";
import StrategyCard from "@/components/StrategyCard";
import MarketCard from "@/components/MarketCard";
import ChartPanel from "@/components/ChartPanel";
import PerformancePanel from "@/components/PerformancePanel";
import LatestSignalPanel from "@/components/LatestSignalPanel";
import { Card } from "@/components/ui/primitives";

const SYMBOLS = ["BTCUSDT", "ETHUSDT"];

export default function Dashboard() {
  const { scan, paper, selectedStrategy, signalFor } = useTerminal();
  const [chartSym, setChartSym] = useState("BTCUSDT");

  const perf = paper
    ? filteredPaperMetrics(paper.trades as unknown as PaperTrade[], {})
    : null;

  const chartCandles = scan?.candles?.[chartSym] ?? [];
  const chartSignal = signalFor(chartSym);
  const headline = headlineSignal(buildFeed(scan, paper));

  return (
    <div className="flex flex-col gap-5">
      {scan?.fetchError && (
        <Card>
          <p className="text-xs text-warn leading-relaxed">{scan.fetchError}</p>
        </Card>
      )}

      <LatestSignalPanel signal={headline} />

      <StrategyCard strategy={selectedStrategy} />

      <div className="grid md:grid-cols-2 gap-5">
        {SYMBOLS.map((sym) => {
          const sig = signalFor(sym);
          return sig ? <MarketCard key={sym} signal={sig} /> : null;
        })}
      </div>

      <Card>
        <div className="flex items-center justify-between mb-3">
          <div className="flex gap-2">
            {SYMBOLS.map((s) => (
              <button
                key={s}
                onClick={() => setChartSym(s)}
                className="pill focusable"
                style={chartSym === s ? { borderColor: "#39c0ed66", color: "#eef3f9" } : undefined}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
        <ChartPanel candles={chartCandles} signal={chartSignal} title={`${chartSym} · ${scan?.timeframe ?? ""}`} />
      </Card>

      {perf && <PerformancePanel metrics={perf.metrics} equityCurve={perf.equityCurve} title="Paper Performance (all time)" />}
    </div>
  );
}
