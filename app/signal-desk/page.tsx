// app/signal-desk/page.tsx — Signal Desk
// Answers one question: "Is there a trade right now?" Groups every signal into
// Active / Pending / Closed, each with full detail (TP1/2/3, regime, etc.).
"use client";

import { useTerminal } from "@/lib/terminal-context";
import { buildFeed, type FeedSignal, type SignalStatus } from "@/lib/signals";
import SignalCard from "@/components/SignalCard";
import { Card, SectionTitle, Badge, Dot, TONE } from "@/components/ui/primitives";

const isActive = (s: FeedSignal) => s.status === "Active";
const isPending = (s: FeedSignal) => s.status === "Waiting";
const isClosed = (s: FeedSignal) =>
  (["TP Hit", "SL Hit", "Expired", "Cancelled"] as SignalStatus[]).includes(s.status);

function Group({ title, color, items, empty }: { title: string; color: string; items: FeedSignal[]; empty: string }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <Dot color={color} live={title === "Active Signals"} />
        <span className="section-title">{title}</span>
        <Badge color={color}>{items.length}</Badge>
      </div>
      {items.length === 0 ? (
        <Card><p className="text-xs text-muted">{empty}</p></Card>
      ) : (
        items.map((s) => <SignalCard key={s.id} s={s} />)
      )}
    </div>
  );
}

export default function SignalDesk() {
  const { scan, paper, research } = useTerminal();
  const feed = buildFeed(scan, paper);
  const active = feed.filter(isActive);
  const pending = feed.filter(isPending);
  const closed = feed.filter(isClosed);

  const anyLive = active.length + pending.length > 0;

  return (
    <div className="flex flex-col gap-5">
      <Card>
        <SectionTitle
          title="Signal Desk"
          sub="Is there a trade right now? Active and pending setups, plus the closed history."
          right={
            <Badge color={anyLive ? TONE.long : TONE.neutral}>
              {anyLive ? `${active.length + pending.length} live` : "no live setups"}
            </Badge>
          }
        />
        {!research?.selectedStrategyId ? (
          <p className="text-xs text-muted leading-relaxed">
            No validated strategy is selected, so there are no real signals. See{" "}
            <span className="text-text">Why Not Trade</span> for the per-symbol reasons, or run research.
          </p>
        ) : !anyLive ? (
          <p className="text-xs text-muted leading-relaxed">
            No active or pending setups on the latest candle. The desk stays flat until the validated
            strategy confirms a trade — see <span className="text-text">Why Not Trade</span> for why.
          </p>
        ) : (
          <p className="text-xs text-muted leading-relaxed">
            TP1 is the validated target used for paper tracking. TP2 and TP3 are extended reference
            targets only.
          </p>
        )}
      </Card>

      <Group title="Active Signals" color={TONE.accent} items={active} empty="No active positions." />
      <Group title="Pending Signals" color={TONE.warn} items={pending} empty="No pending setups awaiting entry." />
      <Group title="Closed Signals" color={TONE.neutral} items={closed.slice(0, 30)} empty="No closed signals yet." />
    </div>
  );
}
