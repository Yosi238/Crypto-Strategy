// components/TopBar.tsx
"use client";

import { useTerminal } from "@/lib/terminal-context";
import { fmtUsd } from "@/lib/format";
import { Dot, TONE } from "./ui/primitives";

function PriceTag({ sym, price, signal }: { sym: string; price?: number; signal?: string }) {
  const color =
    signal === "long" ? TONE.long : signal === "short" ? TONE.short : TONE.text;
  return (
    <div className="flex items-center gap-2">
      <span className="label">{sym.replace("USDT", "")}</span>
      <span className="tnum text-bright text-sm" style={{ color }}>
        {fmtUsd(price)}
      </span>
    </div>
  );
}

function Status({ label, ok, okText, offText }: { label: string; ok: boolean; okText: string; offText: string }) {
  return (
    <div className="flex items-center gap-2">
      <Dot color={ok ? TONE.long : TONE.neutral} live={ok} />
      <span className="label">{label}</span>
      <span className="tnum text-[11px]" style={{ color: ok ? TONE.long : TONE.neutral }}>
        {ok ? okText : offText}
      </span>
    </div>
  );
}

export default function TopBar() {
  const { research, scan, prices, signalFor, lastScan } = useTerminal();
  const researchReady = !!research?.hasResearch && !!research.selectedStrategyId;
  const scannerLive = !!scan && !scan.fetchError;
  const telegramOn = !!research?.telegramConfigured;
  const tf = research?.timeframe ?? scan?.timeframe ?? "1h";

  return (
    <div className="topbar">
      <PriceTag sym="BTCUSDT" price={prices.BTCUSDT} signal={signalFor("BTCUSDT")?.action} />
      <PriceTag sym="ETHUSDT" price={prices.ETHUSDT} signal={signalFor("ETHUSDT")?.action} />
      <div className="flex items-center gap-2">
        <span className="label">TF</span>
        <span className="tnum text-accent text-xs">{tf}</span>
      </div>

      <div className="ml-auto flex flex-wrap items-center gap-x-6 gap-y-2">
        <Status label="Research" ok={researchReady} okText="READY" offText="NONE" />
        <Status label="Scanner" ok={scannerLive} okText="LIVE" offText="IDLE" />
        <Status label="Telegram" ok={telegramOn} okText="ON" offText="OFF" />
        <span className="label tnum">
          {lastScan ? new Date(lastScan).toLocaleTimeString("en-US") : "—"}
        </span>
      </div>
    </div>
  );
}
