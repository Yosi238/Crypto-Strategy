// components/StrategyCard.tsx
"use client";

import type { StrategyRow } from "@/lib/dashboard-types";
import { fmtPct, fmtPf } from "@/lib/format";
import { Badge, Card, SectionTitle, Stat, TONE, pfTone, ddTone, netTone } from "./ui/primitives";

export default function StrategyCard({ strategy }: { strategy: StrategyRow | null }) {
  if (!strategy) {
    return (
      <Card>
        <SectionTitle title="Active Strategy" sub="The validated strategy driving live signals" />
        <p className="text-sm text-muted leading-relaxed">
          No strategy has cleared validation on both BTC and ETH out-of-sample. That&apos;s an
          honest result — the scanner stays idle until something earns its place. Open the{" "}
          <span className="text-accent">Research Lab</span> to see every tested idea and exactly
          why each one failed.
        </p>
      </Card>
    );
  }

  return (
    <Card>
      <SectionTitle
        title="Active Strategy"
        sub={strategy.category}
        right={<Badge color={TONE.long}>validated · both assets</Badge>}
      />
      <div className="text-bright font-semibold mb-1">{strategy.name}</div>
      <p className="text-xs text-muted leading-relaxed mb-4">{strategy.logic}</p>

      <div className="grid grid-cols-4 gap-4">
        <Stat label="Profit Factor" value={fmtPf(strategy.profitFactor)} tone={pfTone(strategy.profitFactor)} size="sm" />
        <Stat label="Win Rate" value={fmtPct(strategy.winRate)} size="sm" />
        <Stat label="Max DD" value={fmtPct(strategy.maxDrawdown)} tone={ddTone(strategy.maxDrawdown)} size="sm" />
        <Stat label="Robustness" value={strategy.robustness.toFixed(2)} size="sm" />
        <Stat label="WF Trades" value={String(strategy.trades)} size="sm" />
        <Stat label="OOS Net" value={fmtPct(strategy.oosNetProfit)} tone={netTone(strategy.oosNetProfit)} size="sm" />
      </div>
    </Card>
  );
}
