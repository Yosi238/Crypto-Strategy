// app/research/page.tsx — Research Lab
"use client";

import { useEffect, useState } from "react";
import { useTerminal } from "@/lib/terminal-context";
import ResearchLabTable from "@/components/ResearchLabTable";
import { Card, SectionTitle, Stat, Badge, Dot, TONE } from "@/components/ui/primitives";
import type { HistoryResponse } from "@/lib/dashboard-types";

function fmtDate(t: number | null | undefined) {
  return t ? new Date(t).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";
}

function ScheduleHistory() {
  const { research } = useTerminal();
  const [hist, setHist] = useState<HistoryResponse | null>(null);

  useEffect(() => {
    fetch("/api/history", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setHist(d))
      .catch(() => setHist(null));
  }, []);

  const records = [...(hist?.records ?? [])].reverse(); // newest first
  const selectedName =
    research?.strategies.find((s) => s.id === research.selectedStrategyId)?.name ?? "none";

  return (
    <Card>
      <SectionTitle
        title="Automatic Weekly Research"
        sub="Re-runs every Sunday · re-ranks all strategies · keeps history · scanner uses the top-ranked validated strategy"
        right={
          research?.selectedChangedFromPrev ? (
            <Badge color={TONE.warn}>selection changed last run</Badge>
          ) : (
            <Badge color={TONE.long}>scanner in sync</Badge>
          )
        }
      />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
        <Stat label="Last Run" value={fmtDate(research?.schedule.lastRunAt)} size="sm" />
        <Stat label="Next Run (Sun)" value={fmtDate(research?.schedule.nextRunAt)} size="sm" />
        <div className="flex flex-col gap-1">
          <span className="stat-label">Currently Selected</span>
          <span className="stat-value sm" style={{ color: research?.selectedStrategyId ? TONE.long : TONE.short }}>
            {selectedName}
          </span>
        </div>
        <Stat label="Runs Recorded" value={String(hist?.records.length ?? 0)} size="sm" />
      </div>

      <p className="text-[11px] text-muted leading-relaxed mb-4">
        Start the scheduler with <span className="tnum text-accent">npm run schedule</span> (keep it
        running), or point OS cron / Task Scheduler at <span className="tnum text-accent">npm run research</span> weekly.
        Either way, every run is recorded below and compared to the one before it.
      </p>

      {records.length === 0 ? (
        <p className="text-xs text-muted">No runs recorded yet. The first research run starts the history.</p>
      ) : (
        <div className="flex flex-col gap-2">
          <div className="label">Ranking history (newest first)</div>
          {records.map((rec, i) => {
            const prev = records[i + 1];
            const changed = prev && prev.selectedStrategyId !== rec.selectedStrategyId;
            return (
              <div key={rec.generatedAt} className="flex items-center gap-3 text-xs border border-line rounded-lg px-3 py-2" style={{ background: "#0b1018" }}>
                <Dot color={changed ? TONE.warn : TONE.neutral} />
                <span className="tnum text-muted w-[130px] shrink-0">{fmtDate(rec.generatedAt)}</span>
                <span className="text-text">
                  {rec.selectedName ?? <span style={{ color: TONE.short }}>none selected</span>}
                </span>
                {changed && <Badge color={TONE.warn}>changed</Badge>}
                <span className="ml-auto text-muted truncate hidden md:block">
                  top: {rec.top.map((t) => `#${t.rank} ${t.name}`).join("  ·  ")}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

export default function ResearchLab() {
  const { research } = useTerminal();

  if (!research) return <Card><p className="text-sm text-muted">Loading research…</p></Card>;

  if (!research.hasResearch || research.strategies.length === 0) {
    return (
      <Card>
        <SectionTitle title="Research Lab" sub="Every tested strategy, ranked and explained" />
        <p className="text-sm text-muted leading-relaxed">No research has been run yet. With network access:</p>
        <pre className="mt-3 text-xs tnum text-accent bg-[#0a0e14] border border-line rounded-lg p-3">
{`npm run download      # fetch BTC & ETH history from Binance
npm run research      # sweep all 22 strategies, walk-forward validated
npm run schedule      # (optional) auto re-run every Sunday`}
        </pre>
      </Card>
    );
  }

  const total = research.strategies.length;
  const passed = research.strategies.filter((s) => s.passedBoth).length;
  const top = [...research.strategies].sort((a, b) => a.rank - b.rank).slice(0, 20);

  return (
    <div className="flex flex-col gap-5">
      <Card>
        <SectionTitle
          title="Research Lab"
          sub={`Walk-forward validated · timeframe ${research.timeframe} · generated ${fmtDate(research.generatedAt)}`}
          right={passed > 0 ? <Badge color={TONE.long}>{passed} passed validation</Badge> : <Badge color={TONE.short}>0 passed validation</Badge>}
        />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Stat label="Strategies Tested" value={String(total)} size="sm" />
          <Stat label="Passed Both Assets" value={String(passed)} tone={passed ? TONE.long : TONE.short} size="sm" />
          <Stat label="Families" value={String(new Set(research.strategies.map((s) => s.category)).size)} size="sm" />
          <Stat label="Pass Rate" value={`${((passed / total) * 100).toFixed(0)}%`} size="sm" />
        </div>
        {passed === 0 && (
          <p className="text-[11px] text-muted leading-relaxed mt-4">
            Nothing cleared every gate on both BTC and ETH out-of-sample — an honest, valid outcome.
            The table still ranks the full search, including the exact gate each strategy failed.
          </p>
        )}
      </Card>

      <ScheduleHistory />

      <Card pad={false}>
        <div className="card-pad pb-0">
          <SectionTitle title="Top 20 Strategies" sub="Ranked by composite score · click a row for per-asset metrics and failure reasons · click a column to re-sort" />
        </div>
        <ResearchLabTable rows={top} />
      </Card>
    </div>
  );
}
