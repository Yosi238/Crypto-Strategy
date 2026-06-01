// components/ChartPanel.tsx
"use client";

import { useMemo, useRef, useState, useEffect } from "react";
import type { Candle } from "@/core/types";
import { fmtUsd } from "@/lib/format";
import { TONE } from "./ui/primitives";

const W = 1000;
const H = 460;
const padL = 8;
const padR = 92;
const padT = 16;
const padB = 26;

/** Minimal trade shape the chart can visualise — works for live or paper signals. */
export interface ChartTrade {
  action: "long" | "short" | "none";
  entry: number | null;
  stopLoss: number | null;
  takeProfit: number | null;
  takeProfit2?: number | null;
  takeProfit3?: number | null;
}

function ema(values: number[], period: number): number[] {
  const k = 2 / (period + 1);
  const out: number[] = [];
  let prev = values[0];
  for (let i = 0; i < values.length; i++) {
    prev = i === 0 ? values[i] : values[i] * k + prev * (1 - k);
    out.push(prev);
  }
  return out;
}

const lbl = (n: number) => Math.round(n).toLocaleString("en-US");

export default function ChartPanel({
  candles,
  signal,
  title,
}: {
  candles: Candle[];
  signal?: ChartTrade | null;
  title?: string;
}) {
  const n = candles.length;
  const [view, setView] = useState({ start: 0, count: 0 });
  const [hover, setHover] = useState<number | null>(null);
  const drag = useRef<{ x: number; start: number } | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);

  useEffect(() => {
    if (n === 0) return;
    const count = Math.min(n, 140);
    setView({ start: Math.max(0, n - count), count });
  }, [n]);

  const overlay = useMemo(() => ema(candles.map((c) => c.close), 50), [candles]);

  if (n === 0) {
    return <div className="grid place-items-center h-[360px] text-muted text-sm">No candles to chart yet.</div>;
  }

  const active = !!signal && signal.action !== "none" && signal.entry != null;
  const count = view.count || Math.min(n, 140);
  const start = Math.min(Math.max(0, view.start), Math.max(0, n - count));
  const end = Math.min(n, start + count);
  const slice = candles.slice(start, end);
  const cw = (W - padL - padR) / slice.length;

  let minP = Infinity;
  let maxP = -Infinity;
  for (const c of slice) {
    minP = Math.min(minP, c.low);
    maxP = Math.max(maxP, c.high);
  }
  for (const m of [signal?.entry, signal?.stopLoss, signal?.takeProfit, signal?.takeProfit2, signal?.takeProfit3]) {
    if (typeof m === "number") {
      minP = Math.min(minP, m);
      maxP = Math.max(maxP, m);
    }
  }
  const pad = (maxP - minP) * 0.06 || 1;
  minP -= pad;
  maxP += pad;

  const yOf = (p: number) => padT + (1 - (p - minP) / (maxP - minP)) * (H - padT - padB);
  const xOf = (i: number) => padL + i * cw + cw / 2;
  const plotR = W - padR;

  const srWindow = slice.slice(0, Math.max(5, Math.floor(slice.length * 0.6)));
  const srHigh = Math.max(...srWindow.map((c) => c.high));
  const srLow = Math.min(...srWindow.map((c) => c.low));

  function clientToIndex(clientX: number): number {
    const svg = svgRef.current;
    if (!svg) return 0;
    const rect = svg.getBoundingClientRect();
    const sx = ((clientX - rect.left) / rect.width) * W;
    return Math.min(slice.length - 1, Math.max(0, Math.floor((sx - padL) / cw)));
  }
  function onWheel(e: React.WheelEvent) {
    const focus = start + clientToIndex(e.clientX);
    const factor = e.deltaY > 0 ? 1.15 : 0.87;
    const newCount = Math.min(n, Math.max(30, Math.round(count * factor)));
    const ratio = count > 0 ? (focus - start) / count : 0.5;
    const newStart = Math.round(focus - ratio * newCount);
    setView({ start: Math.max(0, Math.min(newStart, n - newCount)), count: newCount });
  }
  function onDown(e: React.PointerEvent) {
    drag.current = { x: e.clientX, start };
    (e.target as Element).setPointerCapture?.(e.pointerId);
  }
  function onMove(e: React.PointerEvent) {
    setHover(clientToIndex(e.clientX));
    if (drag.current && svgRef.current) {
      const dx = e.clientX - drag.current.x;
      const rect = svgRef.current.getBoundingClientRect();
      const barsMoved = Math.round(((dx / rect.width) * W) / cw);
      const ns = Math.max(0, Math.min(drag.current.start - barsMoved, n - count));
      setView((v) => ({ ...v, start: ns }));
    }
  }
  function onUp() {
    drag.current = null;
  }

  const hc = hover != null ? slice[hover] : null;

  // Trade line with a filled label tag on the right axis gutter.
  const tradeLine = (price: number | null | undefined, color: string, text: string, dashed = false) => {
    if (typeof price !== "number") return null;
    const y = yOf(price);
    return (
      <g>
        <line x1={padL} x2={plotR} y1={y} y2={y} stroke={color} strokeWidth={1.4} strokeDasharray={dashed ? "3 3" : "6 4"} opacity={0.95} />
        <rect x={plotR} y={y - 9} width={padR} height={18} rx={3} fill={color} opacity={0.9} />
        <text x={plotR + 5} y={y + 4} fontSize={10} fontWeight={700} fill="#06121a" className="tnum">{text}</text>
      </g>
    );
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <div className="text-bright text-sm font-semibold">{title ?? "Chart"}</div>
        <div className="label">scroll to zoom · drag to pan</div>
      </div>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        className="w-full touch-none select-none"
        style={{ cursor: drag.current ? "grabbing" : "crosshair" }}
        onWheel={onWheel}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerLeave={() => { setHover(null); onUp(); }}
      >
        {/* price gridlines */}
        {Array.from({ length: 5 }).map((_, k) => {
          const p = minP + ((maxP - minP) * k) / 4;
          const y = yOf(p);
          return (
            <g key={k}>
              <line x1={padL} x2={plotR} y1={y} y2={y} stroke="#141b24" strokeWidth={1} />
              <text x={plotR + 5} y={y + 3} fontSize={9} fill="#5b6878" className="tnum">{fmtUsd(p)}</text>
            </g>
          );
        })}

        {/* trade zones: profit (entry→TP) and stop (entry→SL) */}
        {active && signal!.takeProfit != null && (
          <rect x={padL} y={Math.min(yOf(signal!.entry!), yOf(signal!.takeProfit))} width={plotR - padL}
                height={Math.abs(yOf(signal!.entry!) - yOf(signal!.takeProfit)) || 1} fill={TONE.long} opacity={0.08} />
        )}
        {active && signal!.stopLoss != null && (
          <rect x={padL} y={Math.min(yOf(signal!.entry!), yOf(signal!.stopLoss))} width={plotR - padL}
                height={Math.abs(yOf(signal!.entry!) - yOf(signal!.stopLoss)) || 1} fill={TONE.short} opacity={0.08} />
        )}

        {/* S/R reference lines */}
        <line x1={padL} x2={plotR} y1={yOf(srHigh)} y2={yOf(srHigh)} stroke={TONE.accent} strokeWidth={1} opacity={0.25} />
        <line x1={padL} x2={plotR} y1={yOf(srLow)} y2={yOf(srLow)} stroke={TONE.accent} strokeWidth={1} opacity={0.25} />

        {/* EMA50 overlay */}
        <polyline fill="none" stroke={TONE.warn} strokeWidth={1.3} opacity={0.65}
                  points={slice.map((_, i) => `${xOf(i)},${yOf(overlay[start + i])}`).join(" ")} />

        {/* candles */}
        {slice.map((c, i) => {
          const up = c.close >= c.open;
          const color = up ? TONE.long : TONE.short;
          const x = xOf(i);
          const bw = Math.max(1, cw * 0.62);
          return (
            <g key={i}>
              <line x1={x} x2={x} y1={yOf(c.high)} y2={yOf(c.low)} stroke={color} strokeWidth={1} opacity={0.85} />
              <rect x={x - bw / 2} y={yOf(Math.max(c.open, c.close))} width={bw}
                    height={Math.max(1, Math.abs(yOf(c.open) - yOf(c.close)))} fill={color} opacity={0.9} />
            </g>
          );
        })}

        {/* trade lines + labels */}
        {active && (
          <>
            {tradeLine(signal!.takeProfit3, TONE.long, `TP3 ${lbl(signal!.takeProfit3!)}`, true)}
            {tradeLine(signal!.takeProfit2, TONE.long, `TP2 ${lbl(signal!.takeProfit2!)}`, true)}
            {tradeLine(signal!.takeProfit, TONE.long, `TP1 ${lbl(signal!.takeProfit!)}`)}
            {tradeLine(signal!.entry, TONE.accent, `ENTRY ${lbl(signal!.entry!)}`)}
            {tradeLine(signal!.stopLoss, TONE.short, `SL ${lbl(signal!.stopLoss!)}`)}
            {/* entry arrow at the latest candle */}
            {(() => {
              const ex = xOf(slice.length - 1);
              const ey = yOf(signal!.entry!);
              const long = signal!.action === "long";
              const dy = long ? 16 : -16;
              const col = long ? TONE.long : TONE.short;
              return (
                <g>
                  <line x1={ex} x2={ex} y1={ey + dy} y2={ey} stroke={col} strokeWidth={2} />
                  <path d={`M${ex - 5},${ey + (long ? 6 : -6)} L${ex + 5},${ey + (long ? 6 : -6)} L${ex},${ey} Z`} fill={col} />
                </g>
              );
            })()}
          </>
        )}

        {/* crosshair + OHLC tooltip */}
        {hc && hover != null && (
          <g>
            <line x1={xOf(hover)} x2={xOf(hover)} y1={padT} y2={H - padB} stroke="#2a3543" strokeWidth={1} strokeDasharray="3 3" />
            <line x1={padL} x2={plotR} y1={yOf(hc.close)} y2={yOf(hc.close)} stroke="#2a3543" strokeWidth={1} strokeDasharray="3 3" />
            <g transform={`translate(${Math.min(xOf(hover) + 8, plotR - 150)}, ${padT + 6})`}>
              <rect width={150} height={70} rx={6} fill="#0b1018" stroke="#1c2430" />
              <text x={8} y={16} fontSize={9} fill="#5b6878">{new Date(hc.time).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit" })}</text>
              <text x={8} y={32} fontSize={10} fill="#c5d0dd" className="tnum">O {fmtUsd(hc.open)}  H {fmtUsd(hc.high)}</text>
              <text x={8} y={46} fontSize={10} fill="#c5d0dd" className="tnum">L {fmtUsd(hc.low)}  C {fmtUsd(hc.close)}</text>
              <text x={8} y={60} fontSize={9} fill="#5b6878" className="tnum">vol {hc.volume.toFixed(0)}</text>
            </g>
          </g>
        )}
      </svg>
    </div>
  );
}
