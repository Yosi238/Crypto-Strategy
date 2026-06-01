// components/ui/primitives.tsx
"use client";

import type { ReactNode } from "react";

export const TONE = {
  long: "#1fd6a0",
  short: "#ff5470",
  warn: "#f5a623",
  accent: "#39c0ed",
  neutral: "#5b6878",
  bright: "#eef3f9",
  text: "#c5d0dd",
} as const;

export function Card({
  children,
  className = "",
  pad = true,
}: {
  children: ReactNode;
  className?: string;
  pad?: boolean;
}) {
  return <div className={`card ${pad ? "card-pad" : ""} ${className}`}>{children}</div>;
}

export function SectionTitle({
  title,
  sub,
  right,
}: {
  title: string;
  sub?: string;
  right?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between mb-4">
      <div>
        <div className="section-title">{title}</div>
        {sub && <div className="section-sub mt-0.5">{sub}</div>}
      </div>
      {right}
    </div>
  );
}

export function Stat({
  label,
  value,
  tone,
  size = "md",
}: {
  label: string;
  value: string;
  tone?: string;
  size?: "md" | "sm";
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="stat-label">{label}</span>
      <span className={`stat-value ${size === "sm" ? "sm" : ""}`} style={tone ? { color: tone } : undefined}>
        {value}
      </span>
    </div>
  );
}

export function Badge({
  children,
  color = TONE.neutral,
}: {
  children: ReactNode;
  color?: string;
}) {
  return (
    <span
      className="badge"
      style={{ color, background: `${color}14`, borderColor: `${color}33` }}
    >
      {children}
    </span>
  );
}

export function Pill({ children }: { children: ReactNode }) {
  return <span className="pill">{children}</span>;
}

export function Dot({ color, live = false }: { color: string; live?: boolean }) {
  return <span className={`dot ${live ? "live" : ""}`} style={{ background: color }} />;
}

/** Color for a profit factor against the 1.4 gate. */
export const pfTone = (pf: number) =>
  pf >= 1.4 ? TONE.long : pf >= 1 ? TONE.warn : TONE.short;
export const ddTone = (dd: number) => (dd <= 0.2 ? TONE.long : TONE.short);
export const netTone = (n: number) => (n >= 0 ? TONE.long : TONE.short);
export const regimeTone = (r: string) =>
  r === "up" || r === "bullish" ? TONE.long : r === "down" || r === "bearish" ? TONE.short : TONE.warn;
