// components/SignalCard.tsx
"use client";

import { useState } from "react";
import type { FeedSignal } from "@/lib/signals";
import { STATUS_COLOR, telegramText } from "@/lib/signals";
import { fmtUsd, fmtPct } from "@/lib/format";
import { Badge, TONE } from "./ui/primitives";

function Field({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div>
      <div className="label">{label}</div>
      <div className="tnum text-sm mt-0.5" style={{ color: color ?? TONE.bright }}>{value}</div>
    </div>
  );
}

export default function SignalCard({ s }: { s: FeedSignal }) {
  const [copied, setCopied] = useState(false);
  const dirColor = s.direction === "LONG" ? TONE.long : TONE.short;
  const statusColor = STATUS_COLOR[s.status];

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(telegramText(s));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable */
    }
  };

  return (
    <div className="card" style={{ borderColor: `${dirColor}33` }}>
      {/* header */}
      <div className="card-pad flex items-center justify-between" style={{ paddingBottom: 12 }}>
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg grid place-items-center text-[11px] font-bold" style={{ background: `${dirColor}1a`, color: dirColor }}>
            {s.symbol.replace("USDT", "")}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-bright font-semibold text-sm">{s.symbol}</span>
              <span className="text-xs font-bold tracking-wide" style={{ color: dirColor }}>{s.direction}</span>
              {s.isTest && <Badge color={TONE.warn}>TEST SIGNAL</Badge>}
            </div>
            <div className="label mt-0.5">{new Date(s.time).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })} · {s.timeframe}</div>
          </div>
        </div>
        <Badge color={statusColor}>{s.status}</Badge>
      </div>

      {/* trade grid */}
      <div className="px-[18px] grid grid-cols-3 md:grid-cols-4 gap-y-4 gap-x-3 pb-2">
        <Field label="Entry" value={fmtUsd(s.entry)} color={TONE.accent} />
        <Field label="Stop Loss" value={fmtUsd(s.stopLoss)} color={TONE.short} />
        <Field label="Take Profit 1" value={fmtUsd(s.takeProfit)} color={TONE.long} />
        <Field label="Take Profit 2" value={s.takeProfit2 ? fmtUsd(s.takeProfit2) : "—"} color={s.takeProfit2 ? TONE.long : TONE.neutral} />
        <Field label="Take Profit 3" value={s.takeProfit3 ? fmtUsd(s.takeProfit3) : "—"} color={s.takeProfit3 ? TONE.long : TONE.neutral} />
        <Field label="Risk / Reward" value={s.riskReward ? s.riskReward.toFixed(2) : "—"} />
        <Field label="Leverage" value={s.leverage ? `${s.leverage.toFixed(1)}×` : "—"} />
        <Field label="Confidence" value={fmtPct(s.confidence, 0)} color={dirColor} />
        <Field label="Strategy" value={s.strategyName ?? "—"} />
      </div>

      {(s.takeProfit2 != null || s.takeProfit3 != null) && (
        <div className="px-[18px] pb-1">
          <span className="label">TP2 / TP3 are extended reference targets — not used in validation or paper tracking (only TP1 is).</span>
        </div>
      )}

      <div className="px-[18px] pb-3">
        <div className="label mb-1">Reason for entry</div>
        <p className="text-xs text-text leading-relaxed">{s.reason}</p>
      </div>

      {/* Telegram-style preview */}
      <div className="hairline px-[18px] py-3">
        <div className="flex items-center justify-between mb-2">
          <span className="label">Telegram-style alert</span>
          <button onClick={copy} className="pill focusable" style={{ padding: "3px 10px" }}>
            {copied ? "copied ✓" : "copy"}
          </button>
        </div>
        <pre
          className="tnum text-[12px] leading-relaxed whitespace-pre-wrap rounded-lg p-3"
          style={{ background: "#0a0e14", border: "1px solid #1c2430", color: "#c5d0dd" }}
        >
{telegramText(s)}
        </pre>
      </div>
    </div>
  );
}
