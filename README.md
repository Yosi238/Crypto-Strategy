# Strategy Research Terminal

A premium dark "trading-terminal" web dashboard for **researching, backtesting,
paper-tracking and alerting** on BTCUSDT / ETHUSDT using Binance Futures *market
data only*.

> **This is not a trading bot.** It places **no orders**, holds **no exchange
> trading keys**, and cannot move money. It downloads public market data,
> searches for a statistically validated strategy, scans the latest candle for
> setups, records every signal as a paper trade, and (optionally) sends Telegram
> alerts. That is the entire scope, by design.

---

## The honest part first

Most "find a profitable crypto strategy" projects quietly cheat: they fit
parameters on all the data, report the in-sample curve, and call it a system.
This one is built to *fail loudly* instead.

- **No guaranteed profit. Ever.** Whether any strategy actually clears the gates
  is an empirical result of running the engine on real data — it is not promised
  by this code. If nothing passes, the terminal says **"NO strategy cleared every
  gate — nothing selected"** rather than inventing a winner.
- **Parameters are chosen only on the training slice.** The verdict is read on
  out-of-sample data the optimiser never saw, plus anchored walk-forward folds.
- **A `robustness` score** (out-of-sample profit factor ÷ in-sample profit factor)
  must be ≥ 0.5. Strategies whose edge collapses off the training data are
  rejected even if their headline numbers look great.
- **Costs are always charged:** taker fees both sides + slippage against you.
- **Pessimistic fills:** if a single bar spans both stop and target, the stop is
  assumed hit first.
- Every results panel carries the warning **"Backtested results do not guarantee
  future performance"** and the Strategy card spells out *why the selected
  strategy may fail live*.

If you only take one thing from this README: **the engine tests ideas; the data
decides; the UI reports the decision without sugar-coating it.**

---

## Run order

```bash
# 1. install
npm install

# 2. download 2 years of OHLCV for BTCUSDT + ETHUSDT (15m / 1h / 4h)
npm run download            # all three timeframes
# or a single timeframe:
#   npx tsx scripts/download.ts 1h

# 3. discover + validate strategies on the REAL cached data
npm run research            # defaults to 1h
#   npx tsx scripts/research.ts 4h

# 4. launch the dashboard
npm run dev                 # http://localhost:3000

# optional: full diagnostic report (data, signals, trades, failures, candidates)
npm run diagnose            # defaults to 1h; pass 4h to override

# optional: automatic weekly research (re-runs every Sunday, keeps ranking history)
npm run schedule            # keep this process running
npm run schedule -- --now   # also run once immediately on startup

# 5. (optional) run the read-only Telegram bot
npm run bot
```

`download` and `research` write to a local `./.data` folder (gitignored). The
dashboard and the Telegram bot both read from that snapshot.

### "It can't download — network error"

The download script talks to Binance Futures public endpoints
(`fapi.binance.com`). Run it on a machine with normal internet access. Some
sandboxed/CI environments (including the one this project was assembled in) block
outbound traffic to Binance, so the 2-year download must run on **your** machine.
No API keys are involved — these are public market-data endpoints.

---

## What's new in this version

**Portfolio of edges (V2.0):** research no longer hunts for one global winner. It now slices every
strategy's trades into **segments — asset × direction × regime × strategy** — tags each trade with
the regime in force at entry (causal), and validates each segment independently. The **Edge Map**
page shows where a real edge exists (VALIDATED EDGE badges) plus a risk-weighted **Portfolio of
Edges** allocation and per-edge Monte Carlo. **Strategy Diagnostics** shows each strategy's best/worst
environment, long-vs-short, BTC-vs-ETH, and failure reasons. Segment validation uses a labelled
40-trade minimum (vs 200 for full-strategy validation) — smaller samples, surfaced honestly.

**Institutional research upgrades:** a **7-state market regime** classifier (Bull/Bear Trend,
Range, High/Low Volatility, Expansion, Compression) feeding a **transparent confidence model**
(regime fit × robustness × recent performance — never invented). **Monte Carlo** bootstrap on
realised trades gives risk of ruin, drawdown distribution, and outcome percentiles (Performance
page). Signals now carry **TP1/TP2/TP3** (TP1 validated; TP2/TP3 extended references, labelled).

**New pages:** **Signal Desk** (Active / Pending / Closed, full detail) and the mandatory
**Why Not Trade** (per-symbol reasons when there is no setup — trend too weak, low volatility,
regime mismatch, risk too high). Performance adds **Sharpe & Sortino**.

**Signal Center** — a dedicated page (sidebar, between Market Scanner and Performance) with a
live signal feed. Each card shows symbol, direction, entry, stop, TP1/TP2, R:R, leverage,
confidence, strategy, timeframe, time, reason, and a status (Waiting / Active / TP Hit / SL Hit
/ Expired / Cancelled), plus a copyable Telegram-style alert preview. The dashboard shows a
large **Latest Trading Signal** panel, and the chart draws entry/SL/TP lines with shaded
risk/reward zones, an entry arrow, and labels. A **Create Test Signal** button previews the UI;
test signals are clearly marked and never counted in performance. Every real setup is journaled
to Paper Trades automatically (TP-vs-SL resolved with the same pessimistic rule as the backtest).

A full **multi-page terminal** (sidebar + live top bar): Dashboard, Research Lab, Market
Scanner, Performance (BTC/ETH × 7D/30D/all filters), Paper Trades, and Settings. The chart
supports scroll-zoom, drag-pan, a crosshair tooltip, entry/stop/target markers, S/R lines,
and an EMA overlay. The strategy library grew to **22 strategies across 6 families**.

**Automatic weekly research** (`npm run schedule`) re-runs discovery every Sunday, re-ranks
all strategies, keeps a ranking history, and compares each run to the previous one. The
Research Lab shows each strategy's rank, its week-over-week movement, and a timeline of which
strategy was selected. The live scanner always uses the highest-ranked **validated** strategy.

## What you get

**Top status bar** — BTC/ETH price, active timeframe, and Research / Scanner /
Telegram status pills.

**Strategy card** — the selected (validated) strategy, its plain-language logic,
and walk-forward win rate, profit factor, max drawdown, total trades, average RR,
fees paid, best/worst period, plus a `VALIDATED` / `BELOW GATES` badge and a
"why it may fail live" note.

**Market cards** (BTC + ETH) — price, trend, Long/Short/No-Trade signal, entry,
stop loss, take profit, risk/reward, recommended leverage and confidence, with a
human-readable reason.

**Chart** — custom SVG candlesticks with entry / stop / target lines, the
risk-and-reward zones shaded, and detected support/resistance pivots.

**Performance** — last 7 days, last 30 days and all-time paper results (wins,
losses, win rate, profit factor, drawdown) plus an equity curve, all built from
real recorded signals being marked TP or SL.

---

## Deploy to Vercel

The Next.js dashboard + API deploy to Vercel as-is; the CLI pipeline runs
locally. Because Vercel's filesystem is read-only/ephemeral, generate research
locally and commit it for the hosted dashboard:

```bash
npm run research && npm run seed   # writes ./seed (commit it)
```

`npm run build` passes, all env vars are optional, and `.data` writes degrade
gracefully on read-only filesystems. Full guide: **[DEPLOY-VERCEL.md](./DEPLOY-VERCEL.md)**.

## Automatic weekly research

`npm run schedule` starts a dependency-free loop that, **every Sunday** (01:00 local by
default; override with `SCHEDULE_HOUR`), downloads fresh data, re-runs discovery, re-ranks
every strategy, records the ranking to `.data/research_history.json`, and updates the
snapshot. On startup it runs a catch-up pass if the last run is over a week old.

- **Re-ranked each run** by a transparent composite score (profit factor, drawdown, trade
  count, and out-of-sample edge that survived). Every strategy is ranked, pass or fail.
- **History is kept** and the Research Lab shows each strategy's rank plus its movement vs
  the previous run, and a timeline of which strategy was selected each week.
- **The live scanner always uses the highest-ranked *validated* strategy.** If nothing is
  validated, nothing is selected and the scanner stays idle — the honesty rule is unchanged;
  ranking never promotes a strategy that failed the gates.

Prefer OS-level scheduling? Point cron / Windows Task Scheduler at `npm run research`
weekly — it records history and updates the selection identically.

## Validation gates

A strategy is only marked `VALIDATED` if, **on both BTCUSDT and ETHUSDT**, it:

- produces **≥ 200** trades,
- is **profitable out-of-sample**,
- has **profit factor > 1.4**,
- keeps **max drawdown < 20%**,
- survives walk-forward with **robustness ≥ 0.5**,
- and uses clear entry / stop / target rules with **no martingale, no averaging
  down, one position at a time**.

These thresholds live in `DEFAULT_GATES` (`core/validation.ts`) — adjust them if
you want, but loosening gates to manufacture a "winner" defeats the point.

## Risk model

1% equity risked per trade by default; RR tested at 1:2 and 1:3; position size
derived from stop distance; recommended leverage from the same stop distance,
**hard-capped at 5×**. See `core/risk.ts`.

---

## Telegram (optional)

Copy `.env.example` to `.env` and set:

```
TELEGRAM_BOT_TOKEN=...
TELEGRAM_CHAT_ID=...
```

The bot (`npm run bot`) is **read-only** — it answers `/help`, `/stats`,
`/open_trades`, `/performance`, `/btc`, `/eth`. It cannot place a trade because
no trading code or keys exist anywhere in this project.

Alert format:

```
🚀 BTCUSDT LONG
Entry / Stop Loss / Take Profit / Risk-Reward
Recommended Leverage / Confidence
Reason: …
⚠️ Backtested results do not guarantee future performance.
```

---

## Architecture

```
core/        framework-agnostic engine (runs under tsx, Next routes, or the bot)
  types.ts            shared types + DEFAULT_BACKTEST_CONFIG
  indicators.ts       causal EMA/RSI/MACD/ATR/Bollinger/volume-z/swings/donchian
  indicatorCache.ts   memoisation — turns O(n²) backtests into O(n)
  risk.ts             position sizing + leverage-from-stop
  backtest.ts         event-driven, next-bar-open fills, pessimistic intrabar
  metrics.ts          PF, win rate, drawdown, expectancy, best/worst period
  scanner.ts          evaluate the latest closed candle -> LiveSignal
  validation.ts       70/30 split, walk-forward, robustness, cross-asset gates
  strategies/         22 strategies across 6 families (trend, breakout,
                      mean-reversion, smart-money, momentum, support/resistance)
data/        binance.ts (public klines, no keys) + store.ts (local JSON; swap for Supabase)
paper/       tracker.ts — record signals, resolve TP/SL, compute metrics
telegram/    alerts.ts (formatting + send) + bot.ts (read-only commands)
scripts/     download.ts, research.ts, demo.ts (synthetic offline check), synthetic.ts
app/         Next.js dashboard + /api/{research,scan,performance} route handlers
components/  StatusBar, StrategyCard, MarketCard, ChartPanel, PerformancePanel
```

Swapping the local JSON store for Supabase only touches `data/store.ts`.

---

## Notes & limitations

- **Security advisory:** this project pins `next@14.2.35` (latest patched 14.2.x)
  to match the requested stack. A few advisories on the Next 14 line are only
  fully resolved in Next 15/16; they concern `next/image` optimisation and
  `rewrites`, **neither of which this app uses**. To clear them entirely, upgrade
  with `npm install next@latest react@latest react-dom@latest` and retest — the
  app router code here is largely Next 15-compatible (it uses `cache: "no-store"`
  fetches and no async request APIs).
- The live scanner approximates entry as the latest close (market fill). Real
  fills, funding and slippage will differ from the backtest.
- `npm run demo` runs the full pipeline on *synthetic* data purely to prove the
  plumbing end-to-end offline. On random synthetic data no strategy passes — that
  is the validation layer behaving correctly, not a bug.

**Research, education and paper-tracking only. Not financial advice. Not a
trading bot.**
