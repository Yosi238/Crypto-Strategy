// telegram/alerts.ts
// Formats and sends signal alerts via the Telegram Bot API. Uses plain fetch —
// no SDK. Requires TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID in the environment.

import type { LiveSignal } from "../core/scanner";

const API = (token: string, method: string) =>
  `https://api.telegram.org/bot${token}/${method}`;

export function formatSignal(sig: LiveSignal): string {
  if (sig.action === "none") return "";
  const dir = sig.action === "long" ? "LONG" : "SHORT";
  const emoji = sig.action === "long" ? "🚀" : "🔻";
  const f = (x: number | null) => (x == null ? "—" : x.toLocaleString(undefined, { maximumFractionDigits: 2 }));
  const conf = Math.round(sig.confidence * 100);

  return [
    `${emoji} <b>${sig.symbol} ${dir}</b>`,
    ``,
    `Entry: ${f(sig.entry)}`,
    `Stop Loss: ${f(sig.stopLoss)}`,
    `Take Profit: ${f(sig.takeProfit)}`,
    `Risk/Reward: 1:${sig.riskReward ? sig.riskReward.toFixed(1) : "—"}`,
    `Recommended Leverage: ${sig.recommendedLeverage ?? "—"}x (max 5x)`,
    `Confidence Score: ${conf}%`,
    ``,
    `<b>Reason:</b>`,
    sig.reason,
    ``,
    `<i>⚠️ Backtested results do not guarantee future performance. This is a research signal, not financial advice.</i>`,
  ].join("\n");
}

export async function sendTelegram(
  text: string,
  opts?: { token?: string; chatId?: string }
): Promise<boolean> {
  const token = opts?.token ?? process.env.TELEGRAM_BOT_TOKEN;
  const chatId = opts?.chatId ?? process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) {
    console.warn("Telegram disabled: set TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID.");
    return false;
  }
  const res = await fetch(API(token, "sendMessage"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: "HTML",
      disable_web_page_preview: true,
    }),
  });
  if (!res.ok) {
    console.error("Telegram send failed:", await res.text());
    return false;
  }
  return true;
}

export async function alertSignal(sig: LiveSignal): Promise<boolean> {
  const text = formatSignal(sig);
  if (!text) return false;
  return sendTelegram(text);
}
