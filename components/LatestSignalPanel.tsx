// components/LatestSignalPanel.tsx
"use client";

import type { FeedSignal } from "@/lib/signals";
import { STATUS_COLOR } from "@/lib/signals";
import { fmtUsd, fmtPct } from "@/lib/format";
import { Card, Badge, Dot, TONE } from "./ui/primitives";

function Big({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="flex flex-col gap-1 min-w-0">
      <span className="label">{label}</span>
      <span className="tnum truncate" style={{ fontSize: 26, lineHeight: 1.1, color: color ?? TONE.bright }}>
        {value}
      </span>
    </div>
  );
}

export default function LatestSignalPanel({ signal }: { signal: FeedSignal | null }) {
  if (!signal || signal.entry == null) {
    return (
      <Card>
        <div className="flex items-center gap-3">
          <Dot color={TONE.neutral} />
          <div>
            <div className="section-title">Latest Trading Signal</div>
            <p className="text-sm text-muted mt-1">No active trade. Waiting for confirmed setup.</p>
          </div>
        </div>
      </Card>
    );
  }

  const dirColor = signal.direction === "LONG" ? TONE.long : TONE.short;
  return (
    <Card>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <Dot color={dirColor} live={signal.status === "Active" || signal.status === "Waiting"} />
          <div className="flex items-center gap-2">
            <span className="section-title">Latest Trading Signal</span>
            <span className="text-bright font-semibold">{signal.symbol}</span>
            <span className="text-sm font-bold" style={{ color: dirColor }}>{signal.direction}</span>
            {signal.isTest && <Badge color={TONE.warn}>TEST</Badge>}
          </div>
        </div>
        <Badge color={STATUS_COLOR[signal.status]}>{signal.status}</Badge>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-5">
        <Big label="Entry" value={fmtUsd(signal.entry)} color={TONE.accent} />
        <Big label="Stop Loss" value={fmtUsd(signal.stopLoss)} color={TONE.short} />
        <Big label="Take Profit" value={fmtUsd(signal.takeProfit)} color={TONE.long} />
        <Big label="Leverage" value={signal.leverage ? `${signal.leverage.toFixed(1)}×` : "—"} />
        <Big label="Confidence" value={fmtPct(signal.confidence, 0)} color={dirColor} />
      </div>

      <p className="text-xs text-muted leading-relaxed mt-4">{signal.reason}</p>
    </Card>
  );
}
