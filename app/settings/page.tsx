// app/settings/page.tsx — Settings
"use client";

import { useEffect, useState } from "react";
import { useTerminal } from "@/lib/terminal-context";
import { Card, SectionTitle, Badge, Dot, TONE } from "@/components/ui/primitives";
import type { TerminalSettings } from "@/core/settings";

export default function Settings() {
  const { settings, reloadSettings } = useTerminal();
  const [form, setForm] = useState<TerminalSettings | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (settings && !form) setForm(settings.settings);
  }, [settings, form]);

  if (!settings || !form) return <Card><p className="text-sm text-muted">Loading settings…</p></Card>;

  const set = <K extends keyof TerminalSettings>(k: K, v: TerminalSettings[K]) => {
    setForm((f) => (f ? { ...f, [k]: v } : f));
    setSaved(false);
  };
  const setGate = (k: keyof TerminalSettings["gates"], v: number | boolean) => {
    setForm((f) => (f ? { ...f, gates: { ...f.gates, [k]: v } } : f));
    setSaved(false);
  };

  async function save() {
    if (!form) return;
    setSaving(true);
    await fetch("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    await reloadSettings();
    setSaving(false);
    setSaved(true);
  }

  const Num = ({ label, value, step, onChange, suffix }: { label: string; value: number; step: number; onChange: (n: number) => void; suffix?: string }) => (
    <label className="block">
      <div className="label mb-1.5">{label}{suffix ? ` (${suffix})` : ""}</div>
      <input className="field" type="number" step={step} value={value} onChange={(e) => onChange(parseFloat(e.target.value))} />
    </label>
  );

  return (
    <div className="flex flex-col gap-5">
      {/* Honesty warning */}
      <Card>
        <div className="flex items-start gap-3">
          <Dot color={TONE.warn} />
          <div>
            <div className="section-title" style={{ color: TONE.warn }}>A note on validation thresholds</div>
            <p className="text-xs text-muted leading-relaxed mt-1.5">
              Loosening a gate does not make a strategy better — it only lowers the bar it must
              clear. A strategy that &quot;passes&quot; after you weaken the gates is exactly as
              unproven as before; you&apos;ve just chosen to see less of the truth. These controls
              exist for legitimate research (e.g. studying higher timeframes with fewer trades), not
              to manufacture winners. Threshold changes take effect on your <span className="text-text">next</span> <span className="tnum text-accent">npm run research</span> run.
            </p>
          </div>
        </div>
      </Card>

      <div className="grid md:grid-cols-2 gap-5">
        <Card>
          <SectionTitle title="Market & Risk" sub="Applied to scanning and the next research run" />
          <div className="flex flex-col gap-4">
            <label className="block">
              <div className="label mb-1.5">Timeframe</div>
              <select className="field" value={form.timeframe} onChange={(e) => set("timeframe", e.target.value as TerminalSettings["timeframe"])}>
                <option value="15m">15m</option>
                <option value="1h">1h</option>
                <option value="4h">4h</option>
              </select>
            </label>
            <Num label="Risk per trade" suffix="fraction" step={0.001} value={form.riskPerTrade} onChange={(n) => set("riskPerTrade", n)} />
            <Num label="Max leverage" suffix="×" step={0.5} value={form.maxLeverage} onChange={(n) => set("maxLeverage", n)} />
            <Num label="Reward / Risk target" step={0.5} value={form.rr} onChange={(n) => set("rr", n)} />
          </div>
        </Card>

        <Card>
          <SectionTitle title="Validation Gates" sub="A strategy must clear ALL of these on BOTH assets" />
          <div className="flex flex-col gap-4">
            <Num label="Min trades" step={10} value={form.gates.minTrades} onChange={(n) => setGate("minTrades", n)} />
            <Num label="Min profit factor" step={0.1} value={form.gates.minProfitFactor} onChange={(n) => setGate("minProfitFactor", n)} />
            <Num label="Max drawdown" suffix="fraction" step={0.05} value={form.gates.maxDrawdown} onChange={(n) => setGate("maxDrawdown", n)} />
            <label className="flex items-center justify-between">
              <span className="label">Require positive out-of-sample</span>
              <input type="checkbox" checked={form.gates.requirePositiveOOS} onChange={(e) => setGate("requirePositiveOOS", e.target.checked)} />
            </label>
          </div>
        </Card>
      </div>

      <Card>
        <SectionTitle title="Integrations & Status" />
        <div className="grid md:grid-cols-3 gap-4">
          <div className="flex items-center gap-2">
            <Dot color={settings.telegramConfigured ? TONE.long : TONE.neutral} />
            <span className="text-xs text-muted">Telegram</span>
            <span className="text-xs" style={{ color: settings.telegramConfigured ? TONE.long : TONE.neutral }}>
              {settings.telegramConfigured ? "configured" : "set via .env"}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Dot color={settings.dataReady ? TONE.long : TONE.short} />
            <span className="text-xs text-muted">Market data</span>
            <span className="text-xs">{settings.dataReady ? "ready" : "missing"}</span>
          </div>
          <div className="flex items-center gap-2">
            <Dot color={settings.researchReady ? TONE.long : TONE.short} />
            <span className="text-xs text-muted">Research</span>
            <span className="text-xs">{settings.researchReady ? "strategy selected" : "none selected"}</span>
          </div>
        </div>
        <p className="text-[11px] text-muted mt-3">
          Telegram credentials are read from environment variables (TELEGRAM_BOT_TOKEN,
          TELEGRAM_CHAT_ID) and never stored in settings.
        </p>
      </Card>

      <div className="flex items-center gap-3">
        <button onClick={save} disabled={saving} className="pill focusable" style={{ borderColor: "#39c0ed66", color: "#eef3f9", background: "#0e1620", padding: "8px 18px" }}>
          {saving ? "Saving…" : "Save settings"}
        </button>
        {saved && <Badge color={TONE.long}>saved</Badge>}
      </div>
    </div>
  );
}
