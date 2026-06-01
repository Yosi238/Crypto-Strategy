// app/why-not-trade/page.tsx — Why Not Trade
// Mandatory page. When there is no trade, it says exactly why — per symbol,
// using the live regime + structure diagnostics computed server-side. An honest
// "no edge right now" is a valid, useful answer.
"use client";

import { useTerminal } from "@/lib/terminal-context";
import { fmtUsd, fmtPct } from "@/lib/format";
import { Card, SectionTitle, Badge, Dot, TONE } from "@/components/ui/primitives";
import { IconCheck, IconX } from "@/components/ui/icons";

export default function WhyNotTrade() {
  const { scan } = useTerminal();
  const signals = scan?.signals ?? [];

  return (
    <div className="flex flex-col gap-5">
      <Card>
        <SectionTitle
          title="Why Not Trade"
          sub="For each market: is there a setup, and if not, exactly why. No setup is the default state — that is normal and healthy."
        />
        {scan?.fetchError && <p className="text-xs text-warn leading-relaxed">{scan.fetchError}</p>}
        {signals.length === 0 && !scan?.fetchError && <p className="text-sm text-muted">Loading market state…</p>}
      </Card>

      {signals.map((s) => {
        const tradeable = s.action === "long" || s.action === "short";
        const color = tradeable ? (s.action === "long" ? TONE.long : TONE.short) : TONE.neutral;
        return (
          <Card key={s.symbol}>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-lg grid place-items-center text-[11px] font-bold" style={{ background: `${color}1a`, color }}>
                  {s.symbol.replace("USDT", "")}
                </div>
                <div>
                  <div className="text-bright font-semibold text-sm">{s.symbol}</div>
                  <div className="label mt-0.5">Regime: {s.regime} · {fmtUsd(s.price)}</div>
                </div>
              </div>
              {tradeable ? (
                <Badge color={color}><IconCheck width={11} height={11} /> {s.action.toUpperCase()} SETUP</Badge>
              ) : (
                <Badge color={TONE.short}><IconX width={11} height={11} /> NO TRADE</Badge>
              )}
            </div>

            {/* diagnostics row */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
              <Diag label="Regime" value={s.regime} />
              <Diag label="Trend strength" value={fmtPct(s.trendStrength, 2)} hint={s.trendStrength >= 0.012 ? "directional" : "weak"} />
              <Diag label="Volatility (ATR%)" value={fmtPct(s.atrPct, 2)} hint={s.atrPct > 0.04 ? "high" : s.atrPct < 0.006 ? "low" : "normal"} />
              <Diag label="Strategy" value={s.strategyName ?? "none"} />
            </div>

            {tradeable ? (
              <p className="text-sm leading-relaxed" style={{ color: TONE.text }}>
                A {s.action.toUpperCase()} setup is live. Entry {fmtUsd(s.entry)}, stop {fmtUsd(s.stopLoss)},
                target {fmtUsd(s.takeProfit)} — see the <span className="text-accent">Signal Desk</span> for full detail.
              </p>
            ) : (
              <div>
                <div className="label mb-2">Reasons there is no trade</div>
                <ul className="flex flex-col gap-2">
                  {s.noTradeReasons.map((r, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm" style={{ color: TONE.text }}>
                      <span style={{ color: TONE.short, marginTop: 2 }}><IconX width={13} height={13} /></span>
                      {r}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );
}

function Diag({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div>
      <div className="label">{label}</div>
      <div className="tnum text-sm mt-0.5 text-bright">{value}</div>
      {hint && <div className="text-[10px] mt-0.5" style={{ color: TONE.neutral }}>{hint}</div>}
    </div>
  );
}
