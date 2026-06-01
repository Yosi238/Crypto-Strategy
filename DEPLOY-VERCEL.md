# Deploying to Vercel

This app is a **Next.js dashboard + API routes**. That part deploys to Vercel
cleanly. The heavy pipeline (`download`, `research`, `diagnose`, `schedule`,
`bot`) is **command-line tooling that does not run on Vercel** — it needs a real
disk, network access, and (for the scheduler/bot) a long-running process.

It never places orders and needs no exchange keys.

---

## The one thing to understand: storage

Vercel runs your code on a **read-only serverless filesystem** (only `/tmp` is
writable, and it is wiped between cold starts). The app stores state as JSON
under `.data`, so on Vercel:

- **Reads** work — the store falls back to a committed, read-only `seed/`
  directory (see below).
- **Writes** (saving settings, auto-journaling paper trades, test signals) go
  to `/tmp` and are **ephemeral** — fine within a warm instance, gone on the
  next cold start or deploy. They never crash the app; they just don't persist.

There are two ways to give the deployed dashboard real data.

### Option A — Seeded data (recommended, simplest)

Generate research locally, then commit it so the hosted dashboard can serve it.
Candles are fetched **live** by the scanner, so you only seed small JSON files.

```bash
npm run download        # fetch BTC/ETH history (needs network)
npm run research        # validate + rank all strategies
npm run seed            # copies research.json + history (+ settings) into ./seed
git add seed && git commit -m "seed research" && git push
```

Vercel redeploys, and the Research Lab, Signal Center, and the scanner's
selected strategy all read from `seed/`. Refresh weekly by re-running
`research` + `seed` and pushing.

### Option B — Persistent volume or external store

- On a host that *has* a writable disk (a VM, Docker, Railway, Fly.io, a
  long-running Node server), set `DATA_DIR` to a persistent path and everything
  persists normally.
- For true serverless persistence on Vercel, swap the JSON store for a database.
  Everything funnels through **`data/store.ts`** — replace the read/write
  helpers there with Vercel KV / Postgres / Upstash / Supabase and nothing else
  changes.

---

## Deploy steps

1. **Push the repo to GitHub/GitLab/Bitbucket.**
2. *(optional but recommended)* run `npm run research` then `npm run seed`
   locally and commit `seed/` so the dashboard shows real results.
3. In **Vercel → Add New → Project**, import the repo. The framework is
   auto-detected as **Next.js**; leave Build Command (`npm run build`) and
   Output Directory at their defaults.
4. **Environment variables** — all optional (see `.env.example`). Add
   `TELEGRAM_BOT_TOKEN` / `TELEGRAM_CHAT_ID` only if you want the status to show
   "ON". No keys are required to deploy.
5. **Deploy.**

`vercel.json` pins the function **region to `fra1` (Frankfurt)** because Binance
Futures blocks many US/cloud IPs — the default US region would make the live
scanner fail to fetch candles. Change the region there if Binance is reachable
from elsewhere for you.

---

## What works where

| Feature | On Vercel | Notes |
|---|---|---|
| Dashboard, Research Lab, Signal Center, Performance, Paper, Settings UI | ✅ | Reads from `seed/` (Option A) or your store (Option B) |
| Market Scanner & charts | ✅* | Fetch **live** candles from Binance; *needs a non-blocked region |
| Save settings / test signals / auto paper-journal | ⚠️ ephemeral | Written to `/tmp`; reset on cold start & deploy |
| `download` / `research` / `diagnose` | ❌ run locally | Need disk + network |
| `schedule` (weekly loop) | ❌ run elsewhere | Serverless can't keep a process alive — use a VM/your machine, or re-run `research`+`seed`+redeploy weekly |
| `bot` (Telegram) | ❌ run elsewhere | Long-running process |

---

## Verified pre-deploy checklist

- `npm run build` passes (Next builds fonts at build time; Vercel's build has
  network, so no action needed).
- No `localhost`/hardcoded hosts — the client uses relative `/api/...` paths.
- API routes are `runtime = "nodejs"`, `dynamic = "force-dynamic"`; the two that
  fetch Binance set `maxDuration = 30`.
- `.data` writes never throw on a read-only filesystem; reads fall back to
  `seed/`.
- All environment variables are optional and documented in `.env.example`.
- Telegram is optional — unset means "Telegram: OFF", nothing breaks.

Reminder: this is a research / alerting / paper-tracking tool. It does **not**
place real orders.
