// components/MarketCard.tsx
"use client";

import type { ScanSignal } from "@/lib/dashboard-types";
import { fmtUsd, fmtPct } from "@/lib/format";
import { Badge, Card, Dot, TONE, regimeTone } from "./ui/primitives";
import { IconArrowUp, IconArrowDown, IconMinus } from "./ui/icons";

const sideColor = (a: string) => (a === "long" ? TONE.long : a === "short" ? TONE.short : TONE.warn);

function TrendChip({ trend }: { trend: string }) {
  const c = trend === "up" ? TONE.long : trend === "down" ? TONE.short : TONE.warn;
  const I = trend === "up" ? IconArrowUp : trend === "down" ? IconArrowDown : IconMinus;
  return (
    <span className="inline-flex items-center gap-1 text-[11px]" style={{ color: c }}>
      <I width={13} height={13} /> {trend.toUpperCase()}
    </span>
  );
}

export default function MarketCard({ signal }: { signal: ScanSignal }) {
  const { symbol, action, price, confidence, regime, strategyName } = signal;
  const active = action === "long" || action === "short";
  const accent = sideColor(action);

  return (
    <Card pad={false}>
      {/* header */}
      <div className="flex items-center justify-between px-4 pt-4">
        <div className="flex items-center gap-2.5">
          <div
            className="h-8 w-8 rounded-lg grid place-items-center text-[11px] font-bold"
            style={{ background: `${accent}1a`, color: accent }}
          >
            {symbol.replace("USDT", "")}
          </div>
          <div>
            <div className="text-bright font-semibold text-sm leading-none">{symbol}</div>
            <div className="mt-1 flex items-center gap-2">
              <TrendChip trend={signal.trend} />
              <span className="text-[11px]" style={{ color: regimeTone(regime.toLowerCase().includes("bull") ? "up" : regime.toLowerCase().includes("bear") ? "down" : "neutral") }}>
                · {regime}
              </span>
            </div>
          </div>
        </div>
        <div className="text-right">
          <div className="tnum text-bright text-lg leading-none">{fmtUsd(price)}</div>
          <div className="label mt-1">last close</div>
        </div>
      </div>

      {/* signal banner */}
      <div
        className="mx-4 mt-3 rounded-lg px-3 py-2 flex items-center justify-between"
        style={{ background: `${accent}12`, border: `1px solid ${accent}33` }}
      >
        <div className="flex items-center gap-2">
          <Dot color={accent} live={active} />
          <span className="text-xs font-semibold" style={{ color: accent }}>
            {active ? `${action.toUpperCase()} SETUP` : "NO SETUP"}
          </span>
        </div>
        {active && (
          <span className="tnum text-[11px]" style={{ color: accent }}>
            conf {fmtPct(confidence, 0)}
          </span>
        )}
      </div>

      {/* trade plan */}
      {active ? (
        <div className="px-4 py-3 grid grid-cols-3 gap-y-3 gap-x-2">
          <Field label="Entry" value={fmtUsd(signal.entry)} />
          <Field label="Stop" value={fmtUsd(signal.stopLoss)} color={TONE.short} />
          <Field label="Target" value={fmtUsd(signal.takeProfit)} color={TONE.long} />
          <Field label="R / R" value={signal.riskReward ? `${signal.riskReward.toFixed(2)}` : "—"} />
          <Field label="Leverage" value={signal.recommendedLeverage ? `${signal.recommendedLeverage.toFixed(1)}×` : "—"} />
          <Field label="Confidence" value={fmtPct(confidence, 0)} color={accent} />
        </div>
      ) : (
        <div className="px-4 py-4">
          <p className="text-xs text-muted leading-relaxed">{signal.reason}</p>
        </div>
      )}

      {/* footer */}
      <div className="hairline px-4 py-2.5 flex items-center justify-between">
        <span className="label">Strategy</span>
        <span className="text-[11px] text-text truncate max-w-[60%] text-right">
          {strategyName ?? <Badge>none selected</Badge>}
        </span>
      </div>
    </Card>
  );
}

function Field({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div>
      <div className="label">{label}</div>
      <div className="tnum text-sm mt-0.5" style={{ color: color ?? TONE.bright }}>
        {value}
      </div>
    </div>
  );
}
