// app/paper/page.tsx — Paper Trades
"use client";

import { useTerminal } from "@/lib/terminal-context";
import { fmtUsd } from "@/lib/format";
import { Card, SectionTitle, Badge, TONE } from "@/components/ui/primitives";

export default function PaperTrades() {
  const { paper } = useTerminal();
  if (!paper) return <Card><p className="text-sm text-muted">Loading trades…</p></Card>;

  const trades = [...paper.trades].sort((a, b) => b.openedAt - a.openedAt);
  const open = trades.filter((t) => t.status === "open").length;

  return (
    <Card pad={false}>
      <div className="card-pad pb-3">
        <SectionTitle
          title="Paper Trades"
          sub={`Simulated executions of validated signals — no real orders · ${open} open`}
          right={<Badge>{trades.length} total</Badge>}
        />
        {paper.fetchError && <p className="text-[11px] text-warn">{paper.fetchError}</p>}
      </div>

      {trades.length === 0 ? (
        <div className="card-pad pt-0">
          <p className="text-xs text-muted leading-relaxed">
            No paper trades recorded yet. They are created when the scanner issues a setup from the
            validated strategy and tracked to their stop or target.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="dt">
            <thead>
              <tr>
                <th>Opened</th>
                <th>Symbol</th>
                <th>Side</th>
                <th className="num">Entry</th>
                <th className="num">Stop</th>
                <th className="num">Target</th>
                <th>Status</th>
                <th className="num">Result (R)</th>
              </tr>
            </thead>
            <tbody>
              {trades.map((t) => {
                const sideColor = t.side === "long" ? TONE.long : TONE.short;
                const statusColor =
                  t.status === "tp" ? TONE.long : t.status === "sl" ? TONE.short : TONE.warn;
                return (
                  <tr key={t.id}>
                    <td className="text-muted tnum text-[11px]">
                      {new Date(t.openedAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                    </td>
                    <td className="text-bright">{t.symbol}{t.isTest && <span className="ml-2"><Badge color={TONE.warn}>TEST</Badge></span>}</td>
                    <td style={{ color: sideColor }}>{t.side.toUpperCase()}</td>
                    <td className="num">{fmtUsd(t.entry)}</td>
                    <td className="num" style={{ color: TONE.short }}>{fmtUsd(t.stopLoss)}</td>
                    <td className="num" style={{ color: TONE.long }}>{fmtUsd(t.takeProfit)}</td>
                    <td><Badge color={statusColor}>{t.status === "open" ? "open" : t.status === "tp" ? "target" : "stopped"}</Badge></td>
                    <td className="num" style={{ color: (t.rMultiple ?? 0) >= 0 ? TONE.long : TONE.short }}>
                      {t.status === "open" ? "—" : `${(t.rMultiple ?? 0).toFixed(2)}R`}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
