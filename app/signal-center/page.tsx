// app/signal-center/page.tsx — Signal Center
"use client";

import { useState } from "react";
import { useTerminal } from "@/lib/terminal-context";
import { buildFeed, headlineSignal, type FeedSignal } from "@/lib/signals";
import SignalCard from "@/components/SignalCard";
import LatestSignalPanel from "@/components/LatestSignalPanel";
import ChartPanel, { type ChartTrade } from "@/components/ChartPanel";
import { Card, SectionTitle, Badge, TONE } from "@/components/ui/primitives";

function toChartTrade(s: FeedSignal | null): ChartTrade | null {
  if (!s || s.entry == null) return null;
  return {
    action: s.direction === "LONG" ? "long" : "short",
    entry: s.entry,
    stopLoss: s.stopLoss,
    takeProfit: s.takeProfit,
    takeProfit2: s.takeProfit2,
    takeProfit3: s.takeProfit3,
  };
}

export default function SignalCenter() {
  const { scan, paper, prices, refreshAll } = useTerminal();
  const [sym, setSym] = useState<"BTCUSDT" | "ETHUSDT">("BTCUSDT");
  const [dir, setDir] = useState<"long" | "short">("long");
  const [busy, setBusy] = useState(false);

  const feed = buildFeed(scan, paper);
  const headline = headlineSignal(feed);
  const hasTest = feed.some((f) => f.isTest);

  const createTest = async () => {
    setBusy(true);
    await fetch("/api/test-signal", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ symbol: sym, direction: dir, price: prices[sym] }),
    }).catch(() => {});
    await refreshAll();
    setBusy(false);
  };
  const clearTest = async () => {
    setBusy(true);
    await fetch("/api/test-signal", { method: "DELETE" }).catch(() => {});
    await refreshAll();
    setBusy(false);
  };

  const chartCandles = headline ? scan?.candles?.[headline.symbol] ?? [] : [];

  const Btn = ({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) => (
    <button onClick={onClick} className="pill focusable" style={active ? { borderColor: "#39c0ed66", color: "#eef3f9", background: "#0e1620" } : undefined}>
      {children}
    </button>
  );

  return (
    <div className="flex flex-col gap-5">
      <LatestSignalPanel signal={headline} />

      {headline && chartCandles.length > 0 && (
        <Card>
          <SectionTitle title={`${headline.symbol} · trade plan`} sub="Entry, stop and target drawn on the chart with shaded risk/reward zones" />
          <ChartPanel candles={chartCandles} signal={toChartTrade(headline)} title={`${headline.symbol} · ${headline.timeframe}`} />
        </Card>
      )}

      <Card>
        <SectionTitle
          title="Create Test Signal"
          sub="Preview the UI without waiting for a live setup. Test signals are clearly marked and never counted in performance."
          right={hasTest ? <Badge color={TONE.warn}>test signals active</Badge> : undefined}
        />
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex gap-2">
            <Btn active={sym === "BTCUSDT"} onClick={() => setSym("BTCUSDT")}>BTCUSDT</Btn>
            <Btn active={sym === "ETHUSDT"} onClick={() => setSym("ETHUSDT")}>ETHUSDT</Btn>
          </div>
          <div className="flex gap-2">
            <Btn active={dir === "long"} onClick={() => setDir("long")}>LONG</Btn>
            <Btn active={dir === "short"} onClick={() => setDir("short")}>SHORT</Btn>
          </div>
          <button onClick={createTest} disabled={busy} className="pill focusable" style={{ borderColor: "#39c0ed66", color: "#eef3f9", background: "#0e1620", padding: "8px 16px" }}>
            {busy ? "…" : "+ Create Test Signal"}
          </button>
          {hasTest && (
            <button onClick={clearTest} disabled={busy} className="pill focusable" style={{ padding: "8px 16px", color: TONE.short, borderColor: `${TONE.short}55` }}>
              Clear test signals
            </button>
          )}
        </div>
      </Card>

      <div className="flex items-center justify-between">
        <div>
          <div className="section-title">Live Signal Feed</div>
          <div className="section-sub">All active and recent signals · newest first</div>
        </div>
        <Badge color={TONE.neutral}>{feed.length} signals</Badge>
      </div>

      {feed.length === 0 ? (
        <Card>
          <p className="text-sm text-muted leading-relaxed">
            No signals yet. When the validated strategy finds a BTC or ETH setup it appears here
            automatically and is journaled to Paper Trades. To preview the layout now, use{" "}
            <span className="text-text">Create Test Signal</span> above.
          </p>
        </Card>
      ) : (
        <div className="flex flex-col gap-4">
          {feed.map((s) => (
            <SignalCard key={s.id} s={s} />
          ))}
        </div>
      )}
    </div>
  );
}
