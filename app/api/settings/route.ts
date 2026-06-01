// app/api/settings/route.ts
// GET returns current settings (merged over defaults) + readiness flags.
// POST persists sanitized settings. Threshold/risk changes take effect on the
// NEXT `npm run research` run — we never silently re-grade existing results.

import { NextResponse } from "next/server";
import { loadSettings, saveSettings, loadResearch, loadCandles } from "@/data/store";
import { DEFAULT_SETTINGS, sanitizeSettings } from "@/core/settings";
import type { SettingsResponse } from "@/lib/dashboard-types";
import type { Timeframe } from "@/core/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function readiness(tf: Timeframe) {
  const btc = await loadCandles("BTCUSDT", tf);
  const eth = await loadCandles("ETHUSDT", tf);
  const dataReady = !!btc && !!eth && btc.length > 1000 && eth.length > 1000;
  const snap = await loadResearch();
  const researchReady = !!snap && !!snap.selectedStrategyId;
  return { dataReady, researchReady };
}

export async function GET() {
  const settings = (await loadSettings()) ?? DEFAULT_SETTINGS;
  const telegramConfigured = !!process.env.TELEGRAM_BOT_TOKEN && !!process.env.TELEGRAM_CHAT_ID;
  const { dataReady, researchReady } = await readiness(settings.timeframe);
  const res: SettingsResponse = { settings, telegramConfigured, dataReady, researchReady };
  return NextResponse.json(res);
}

export async function POST(req: Request) {
  let body: unknown = {};
  try {
    body = await req.json();
  } catch {
    /* empty body */
  }
  const settings = sanitizeSettings((body ?? {}) as Record<string, never>);
  await saveSettings(settings);
  const telegramConfigured = !!process.env.TELEGRAM_BOT_TOKEN && !!process.env.TELEGRAM_CHAT_ID;
  const { dataReady, researchReady } = await readiness(settings.timeframe);
  const res: SettingsResponse = { settings, telegramConfigured, dataReady, researchReady };
  return NextResponse.json(res);
}
