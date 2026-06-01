// app/scanner/page.tsx — Market Scanner
"use client";

import { useTerminal } from "@/lib/terminal-context";
import MarketCard from "@/components/MarketCard";
import ChartPanel from "@/components/ChartPanel";
import { Card, SectionTitle, Badge, Dot, TONE } from "@/components/ui/primitives";

export default function Scanner() {
  const { scan, research, signalFor } = useTerminal();
  const live = !!scan && !scan.fetchError;

  return (
    <div className="flex flex-col gap-5">
      <Card>
        <SectionTitle
          title="Market Scanner"
          sub={`Scanning ${scan?.timeframe ?? ""} · selected strategy applied to the latest closed candle`}
          right={
            <span className="flex items-center gap-2">
              <Dot color={live ? TONE.long : TONE.neutral} live={live} />
              <span className="text-[11px]" style={{ color: live ? TONE.long : TONE.neutral }}>
                {live ? "LIVE" : "OFFLINE"}
              </span>
            </span>
          }
        />
        {scan?.fetchError ? (
          <p className="text-xs text-warn leading-relaxed">{scan.fetchError}</p>
        ) : !research?.selectedStrategyId ? (
          <p className="text-xs text-muted leading-relaxed">
            No validated strategy is selected, so the scanner is idle by design. Run research to
            promote a strategy. <Badge>honest mode</Badge>
          </p>
        ) : (
          <p className="text-xs text-muted leading-relaxed">
            Active strategy: <span className="text-text">{scan?.signals[0]?.strategyName}</span>.
            Signals update every 30 seconds.
          </p>
        )}
      </Card>

      <div className="grid md:grid-cols-2 gap-5">
        {(scan?.signals ?? []).map((sig) => (
          <MarketCard key={sig.symbol} signal={sig} />
        ))}
      </div>

      {(scan?.signals ?? []).map((sig) => {
        const candles = scan?.candles?.[sig.symbol] ?? [];
        if (candles.length === 0) return null;
        return (
          <Card key={sig.symbol}>
            <ChartPanel candles={candles} signal={signalFor(sig.symbol)} title={`${sig.symbol} · ${scan?.timeframe ?? ""}`} />
          </Card>
        );
      })}
    </div>
  );
}
