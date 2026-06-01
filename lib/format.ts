// lib/format.ts
export const fmtUsd = (x: number | null | undefined, dp = 2) =>
  x == null || !Number.isFinite(x)
    ? "—"
    : x.toLocaleString("en-US", { minimumFractionDigits: dp, maximumFractionDigits: dp });

export const fmtPct = (x: number | null | undefined, dp = 1) =>
  x == null || !Number.isFinite(x) ? "—" : `${(x * 100).toFixed(dp)}%`;

export const fmtPf = (x: number | null | undefined) =>
  x == null ? "—" : Number.isFinite(x) ? x.toFixed(2) : "∞";

export const fmtNum = (x: number | null | undefined, dp = 2) =>
  x == null || !Number.isFinite(x) ? "—" : x.toFixed(dp);
