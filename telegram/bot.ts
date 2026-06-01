// telegram/bot.ts
// A minimal long-polling Telegram bot exposing the read-only commands from the
// brief. It reports research/paper state — it can NOT trade, by design.
//   TELEGRAM_BOT_TOKEN=... TELEGRAM_CHAT_ID=... npx tsx telegram/bot.ts
//
// Commands: /stats /open_trades /performance /btc /eth /help

import { sendTelegram, formatSignal } from "./alerts";
import { loadResearch, loadPaperTrades, loadCandles } from "../data/store";
import { paperMetrics } from "../paper/tracker";
import { scan } from "../core/scanner";
import { getStrategy } from "../core/strategies";
import { DEFAULT_BACKTEST_CONFIG, type Symbol } from "../core/types";

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const API = (m: string) => `https://api.telegram.org/bot${TOKEN}/${m}`;

function pct(x: number) {
  return (x * 100).toFixed(1) + "%";
}
function pf(x: number) {
  return Number.isFinite(x) ? x.toFixed(2) : "∞";
}

async function liveSignalFor(symbol: Symbol): Promise<string> {
  const research = await loadResearch();
  if (!research) return `No research snapshot yet. Run the research script first.`;
  const tf = research.timeframe;
  const candles = await loadCandles(symbol, tf);
  if (!candles) return `No ${symbol} candles cached for ${tf}.`;
  const selected = research.results.find((r) => r.passedBoth) ?? research.results[0];
  const strat = getStrategy(selected.strategyId);
  if (!strat) return `Selected strategy not found.`;
  const params = selected.perSymbol[symbol].bestParams;
  const sig = scan(symbol, candles, strat, params, DEFAULT_BACKTEST_CONFIG, 10_000);
  if (sig.action === "none")
    return `${symbol}: no valid setup right now (trend ${sig.trend}, price ${sig.price.toFixed(2)}).`;
  return formatSignal(sig);
}

async function handle(text: string): Promise<string> {
  const cmd = text.trim().split(/\s+/)[0].toLowerCase();
  switch (cmd) {
    case "/help":
    case "/start":
      return [
        "Research terminal bot. Commands:",
        "/stats — selected strategy + validation summary",
        "/open_trades — currently open paper trades",
        "/performance — paper-trading performance",
        "/btc — live BTCUSDT scan",
        "/eth — live ETHUSDT scan",
        "",
        "⚠️ Research only. No real orders are ever placed.",
      ].join("\n");

    case "/stats": {
      const r = await loadResearch();
      if (!r) return "No research snapshot yet.";
      const sel = r.results.find((x) => x.passedBoth) ?? r.results[0];
      if (!sel) return "No strategies evaluated.";
      const lines = [`<b>${sel.strategyName}</b> (passedBoth=${sel.passedBoth})`];
      for (const [sym, d] of Object.entries(sel.perSymbol)) {
        lines.push(
          `${sym}: WF PF ${pf(d.walkForward.profitFactor)}, win ${pct(d.walkForward.winRate)}, ` +
            `DD ${pct(d.walkForward.maxDrawdown)}, trades ${d.walkForward.totalTrades}`
        );
      }
      lines.push("\n⚠️ Backtested results do not guarantee future performance.");
      return lines.join("\n");
    }

    case "/open_trades": {
      const trades = (await loadPaperTrades()).filter((t) => t.status === "open");
      if (!trades.length) return "No open paper trades.";
      return trades
        .map((t) => `${t.symbol} ${t.side.toUpperCase()} @ ${t.entry.toFixed(2)} (SL ${t.stopLoss.toFixed(2)} / TP ${t.takeProfit.toFixed(2)})`)
        .join("\n");
    }

    case "/performance": {
      const m = paperMetrics(await loadPaperTrades());
      return [
        "<b>Paper performance (all-time)</b>",
        `Trades: ${m.all.totalTrades}  Wins: ${m.all.wins}  Losses: ${m.all.losses}`,
        `Win rate: ${pct(m.all.winRate)}  PF: ${pf(m.all.profitFactor)}  MaxDD: ${pct(m.all.maxDrawdown)}`,
        `Last 7d trades: ${m.last7.totalTrades} (PF ${pf(m.last7.profitFactor)})`,
        `Last 30d trades: ${m.last30.totalTrades} (PF ${pf(m.last30.profitFactor)})`,
      ].join("\n");
    }

    case "/btc":
      return liveSignalFor("BTCUSDT");
    case "/eth":
      return liveSignalFor("ETHUSDT");

    default:
      return "Unknown command. Send /help.";
  }
}

async function main() {
  if (!TOKEN) {
    console.error("Set TELEGRAM_BOT_TOKEN to run the bot.");
    process.exit(1);
  }
  console.log("Telegram bot polling… (Ctrl+C to stop)");
  let offset = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      const res = await fetch(API(`getUpdates?timeout=30&offset=${offset}`));
      const data = (await res.json()) as any;
      for (const upd of data.result ?? []) {
        offset = upd.update_id + 1;
        const msg = upd.message;
        if (!msg?.text) continue;
        const reply = await handle(msg.text);
        await sendTelegram(reply, { chatId: String(msg.chat.id) });
      }
    } catch (e) {
      console.error("poll error", e);
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
}

main();
