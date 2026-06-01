# Implementation Plan — crypto-research-terminal

Generated: 2026-06-01

---

## Sequencing Logic

The audit identifies 20 weaknesses across two distinct severity classes. The correct sequencing is not "most impactful first" — it is **dependency-first**. Fixing the strategy universe (Weakness #1) before the measurement apparatus is accurate (Weaknesses #9, #13, #18) means researching new strategies on a backtester that still understates drawdown and slippage. You would be making decisions based on wrong numbers about right strategies, which is worse than making wrong decisions because you can't tell the difference.

The correct order: **fix how you measure → fix what data you have → build what you test → maximize what you find**.

---

## Phase 1 — Backtest Engine Accuracy

**Objective:** Every number the research pipeline produces after this phase is mechanically correct. Drawdown is real. Costs are accurate. No trades are silently dropped.

**Rationale:** This phase touches `backtest.ts`, `metrics.ts`, and `tracker.ts`. Every subsequent phase depends on research results being trustworthy. Running a new strategy suite on a broken measurement layer produces confident-looking wrong answers.

**Weaknesses addressed:** #9, #13, #14, #18

---

### Task 1.1 — Force-close open trades at backtest end

**File:** `core/backtest.ts`

After the main loop at line 155, if `open !== null`, exit the position at the last candle's close price with outcome `"timeout"`. Apply normal slippage and fees. Push to `trades[]` and `equityCurve[]`.

**Why now:** Every backtest currently silently drops the last 1-3 trades. All downstream metrics (net profit, win rate, drawdown) are computed on an incomplete trade set. This is a correctness bug, not a performance optimization.

**Definition of done:** After a full research run, zero trades remain in the `open` state at backtest end. Final equity in `equityCurve` matches `initialEquity + sum(all trades' PnL)`.

---

### Task 1.2 — Add mark-to-market equity points for open positions

**File:** `core/backtest.ts`

Inside the open-position management loop (line 52-117), after checking SL/TP, if the position remains open emit an intermediate `equityCurve` point at the bar's worst-case unrealized equity:
- Long: `equity + qty × (bar.low - entryPrice)`
- Short: `equity + qty × (entryPrice - bar.high)`

This only adds intermediate points; the trade is still recorded when it closes. The `maxDrawdown()` computation in `metrics.ts` reads the equity curve and will automatically capture intrabar adverse moves.

**Why now:** Without this, reported max drawdown is computed on an equity curve that only ticks at trade-close events. A trade that dips 8% unrealized before recovering and closing at TP contributes zero drawdown. The gate at `validation.ts:193` is checking a systematically understated number.

**Definition of done:** For a strategy with wide stops on volatile assets, the reported max drawdown increases from the current closed-trade-only figure. The gate correctly identifies strategies with large intrabar adverse excursion even when most trades close profitably.

---

### Task 1.3 — Volatility-scaled slippage model

**Files:** `core/types.ts`, `core/backtest.ts`

Replace the single `slippage: number` field in `BacktestConfig` with a structured model:

```
slippageNormal:  0.0002  (current low-vol default)
slippageHigh:    0.0010  (ATR percentile > 80%)
slippageExtreme: 0.0030  (ATR percentile > 95%)
```

In `backtest.ts`, before computing the fill price on entry and exit, determine the current ATR percentile using the trailing 252 bars. Select the appropriate slippage tier. Apply it to both fills.

The ATR percentile can be computed with a simple rolling rank — no new module needed, inline in the fill logic.

**Why now:** Strategies that enter during high-volatility events (breakout and ATR-based strategies) are currently tested with 5-25× lower slippage than they will experience live. This distortion makes exactly the wrong strategies look best in backtests.

**Definition of done:** Run a full research on any vol-breakout strategy. Reported net profit decreases (more realistic costs). ATR-based strategies show lower PF relative to structure-based strategies that fire in calmer conditions.

---

### Task 1.4 — Fee inclusion in paper trade P&L

**File:** `paper/tracker.ts`

In `finalize()` (line 83-98), compute the round-trip fee cost and subtract it from the R-multiple:

```
notional = entry × (riskAmount / stopDistance)  // approximate position size
fee = 2 × takerFee × notional                    // round-trip taker cost
feeR = fee / riskAmount                          // fee expressed in R
rMultiple = pnlPerUnit / risk - feeR
```

`takerFee` needs to be passed into `finalize()`. The paper trade stores `leverage` and `entry` — compute notional, apply `2 × takerFee × notional`, subtract from the R-multiple-derived PnL.

**Why now:** Paper metrics currently overstate performance vs. backtest by approximately 0.5-1.0R per trade. The performance dashboard comparison between backtest and paper is meaningless until both are on the same accounting basis.

**Definition of done:** Paper metrics and backtest metrics, run on the same signal history, show the same net R-multiple within rounding error.

---

## Phase 2 — Validation Methodology Overhaul

**Objective:** The walk-forward correctly simulates live deployment. Gates select for quality, not frequency. The robustness gate rejects actual edge collapse rather than penalizing strong IS performance.

**Rationale:** Phase 1 fixed what the numbers mean. Phase 2 fixes what passes and fails. Running new strategies through old validation methodology means a genuinely good strategy might fail for the wrong reason (trade count too low, anchored WF shows IS contamination as OOS decay). Fix validation before introducing new strategies, so the first research run with new strategies gives a clean verdict.

**Weaknesses addressed:** #2, #3, #11, #17

---

### Task 2.1 — Rolling fixed-window walk-forward

**File:** `core/validation.ts`

Replace the `walkForward()` function (lines 96-146) with a rolling fixed-window implementation:

- Train window: 12 months (configurable)
- Test window: 3 months (configurable)
- Step: 1 month
- Computed folds: approximately `(total_months - train_months) / step_months`

For a 2-year series this produces ~12 folds instead of 5. Each fold's training data is different — earlier folds train on 2022, later folds on 2023-2024. The 2021 bull market correctly appears only in the earliest few folds and ages out.

The existing stitch-and-rebuild logic (lines 128-146) is correct — only the window generation loop changes.

Add `walkForwardConfig` parameters to `Gates`:
```
wfTrainMonths: number   // default 12
wfTestMonths:  number   // default 3
wfStepMonths:  number   // default 1
```

**Definition of done:** A research run on 2-year 1H data produces ~12 WF folds. The training windows visibly age (fold 1 ends in month 12, fold 12 ends in month 23). Strategies that happened to work only in 2021 show poor late-fold OOS performance and fail the gates.

---

### Task 2.2 — Timeframe-aware minimum trade count

**Files:** `core/validation.ts`, `core/settings.ts`, `core/types.ts`

Replace the single `minTrades: 200` with a computed value based on timeframe:

```
1h  → minimum 60 WF trades
4h  → minimum 30 WF trades
```

Add `timeframe` as a parameter to `discoverStrategy()` — it already receives candles; it just needs to know which timeframe they represent to apply the right minimum.

Add two complementary quality gates:
1. `minExpectancy: 0.25` — mean R-multiple across WF trades must be ≥ 0.25R
2. `minAvgHoldBars: 3` — mean bars held per trade must be ≥ 3 (prevents micro-scalp strategies gaming the trade count)

These additions go into the `Gates` interface and the gate check at lines 187-197.

**Definition of done:** A high-quality 4H strategy with 45 trades and 0.4R expectancy passes. A high-frequency 1H strategy with 220 trades and 0.1R expectancy fails the expectancy gate.

---

### Task 2.3 — Fix the robustness gate

**File:** `core/validation.ts`

Replace the single robustness gate (line 197) with two independent checks:

**Check A — Absolute OOS floor:** `OOS_PF >= 1.25`
This ensures the OOS period shows real absolute edge, regardless of how good the IS period was.

**Check B — Edge survival ratio:** `OOS_PF >= IS_PF × 0.35`
A looser version of the current 0.5 cutoff. A strategy with IS PF 3.0 needs only OOS PF ≥ 1.05 to survive the ratio check. Check A then catches any strategy where OOS PF is weak in absolute terms.

Both checks must pass. Remove the single `robustness < 0.5` gate.

**Definition of done:** A strategy with IS PF 3.0 and OOS PF 1.4 (currently rejected at robustness 0.47) now passes. A strategy with IS PF 1.6 and OOS PF 0.78 (currently passing at robustness 0.49) now fails Check A.

---

### Task 2.4 — Add drawdown concentration and Sharpe gates

**Files:** `core/metrics.ts`, `core/validation.ts`

Add to `computeMetrics()`:
1. **Max consecutive losses**: count the longest unbroken streak of losing trades in the trade list
2. **Annualized Sharpe**: compute from monthly return slices of the equity curve — `mean(monthly_returns) / std(monthly_returns) × sqrt(12)`

Add to `Gates`:
```
maxConsecutiveLosses: 12    // default
minSharpe: 0.5              // annualized, default
```

Add the corresponding gate checks to `discoverStrategy()`.

**Definition of done:** A strategy that loses 14 consecutive trades in a two-week cluster fails the consecutive-loss gate even if its overall max drawdown is 17%.

---

### Task 2.5 — Tiered cross-asset validation

**File:** `core/validation.ts`

Replace `passedBoth: boolean` in `CrossAssetResult` with a tiered system:

```typescript
crossAssetTier: 'both' | 'btc-only' | 'eth-only' | 'neither'
```

Update `discoverAcrossSymbols()` to compute the tier. Update `ranking.ts` to:
- Sort `both` tier above single-asset passes in selection
- Apply a 20% score penalty to single-asset passes: `score × 0.80`
- Exclude `neither` from selection entirely

`selectTopValidated()` in `ranking.ts` updates to: return the highest-scored strategy across `both` and single-asset tiers, preferring `both`.

**Definition of done:** A strategy that passes BTC but not ETH is selectable with a score penalty. A strategy that passes both still ranks above it.

---

## Phase 3 — Data Infrastructure

**Objective:** The engine has access to funding rate data and real 4H structural context. The scanner knows what session it is in. All subsequent strategies can use these inputs without further infrastructure work.

**Rationale:** Phases 1-2 fixed the measurement and selection machinery. Phase 3 adds the data these strategies will need. No strategy can use funding rate or HTF context until the data pipeline exists. Build the pipeline before the strategies that consume it.

**Weaknesses addressed:** #5 (data), #6 (data), #8 (partial)

---

### Task 3.1 — Funding rate fetcher and store

**Files:** `data/funding.ts` (new), `data/binance.ts`, `data/store.ts`

Create `data/funding.ts`:
- `fetchFundingRate(symbol)` — calls Binance `/fapi/v1/premiumIndex` (public, no key)
- `fetchFundingHistory(symbol, days)` — calls `/fapi/v1/fundingRate` with pagination
- Returns `FundingPoint = { symbol, rate, fundingTime }[]`
- In-process cache: if last fetch < 30 minutes old, return cached value

Add to `data/store.ts`:
- `saveFundingHistory(symbol, points)` — writes `funding_BTCUSDT.json` etc.
- `loadFundingHistory(symbol)` — reads same

Add to `scripts/download.ts`:
- After downloading candles, also download 730 days of funding history for both symbols

**Definition of done:** `npm run download` produces `.data/funding_BTCUSDT.json` and `.data/funding_ETHUSDT.json`. The live scanner can call `fetchFundingRate('BTCUSDT')` without hitting Binance on every scan request.

---

### Task 3.2 — 4H structural context injection

**Files:** `core/types.ts`, `core/htfContext.ts` (new), `core/scanner.ts`

Create `core/htfContext.ts`:
- `buildHTFContext(candles4h)` — identifies last 4 confirmed swing highs and lows on 4H using `swingPoints()` from `indicators.ts`
- `getHTFBias(context)` — returns `'bullish' | 'bearish' | 'neutral'` based on HH/HL vs LH/LL structure
- `htfBiasAt(candles4h, barIndex4h)` — point-in-time bias for backtesting (causal: only uses bars ≤ barIndex4h)

Add `htfBias` and `fundingRate` to `StrategyContext` in `core/types.ts`:
```typescript
interface StrategyContext {
  candles: Candle[];
  i: number;
  params: Record<string, number>;
  htfBias?: 'bullish' | 'bearish' | 'neutral';
  fundingRate?: number;
}
```

Update `scan()` in `core/scanner.ts` to:
1. Accept `candles4h: Candle[]` as a new parameter
2. Call `buildHTFContext(candles4h)` before evaluating the strategy
3. Pass `htfBias` and `fundingRate` in the `StrategyContext` given to `strategy.evaluate()`

For backtesting, update `runBacktest()` in `core/backtest.ts` to accept an optional `candles4h` parameter and compute `htfBiasAt()` for each bar.

**Why this design:** Making `htfBias` and `fundingRate` part of `StrategyContext` means every strategy can access them without any other change. Strategies that don't use them ignore them.

**Definition of done:** `ctx.htfBias` is available in every strategy's `evaluate()` call. A strategy that checks `ctx.htfBias === 'bearish'` and returns null for long signals compiles and runs correctly.

---

### Task 3.3 — Session and kill zone detection

**File:** `core/indicators/sessions.ts` (new)

```typescript
type KillZone = 'london' | 'newyork' | 'overlap' | 'active' | 'asian'

getKillZone(timestampMs: number): KillZone
killZoneScore(timestampMs: number): 0 | 5 | 10
isInstitutionalHours(timestampMs: number): boolean
```

Kill zone definitions (UTC):
- London: 07:00–10:00
- NY: 13:00–16:00
- Overlap: 10:00–13:00
- Active: 16:00–20:00
- Asian: 20:00–07:00

Implementation: convert `timestampMs` to UTC hour, map to kill zone. Pure function, no I/O.

Add `killZone` to `StrategyContext` and populate from each bar's `time` field in both `scan()` and `runBacktest()`.

**Definition of done:** A strategy can gate signals on `ctx.killZone === 'london' || ctx.killZone === 'newyork'`. Paper trade records show the kill zone of each signal entry.

---

### Task 3.4 — Percentile-based regime detection

**File:** `core/scanner.ts`

Replace the static-threshold regime classifier in `regimeAt()` (lines 144-181) with a percentile-rank approach:

- Compute ATR for each bar over the trailing 252 bars
- Rank the current ATR within that window: `atrPercentile = rank / 252`
- Regime thresholds become:
  - Trend: price deviation from 50-bar SMA is in the top 25th percentile of its own 252-bar history
  - High Volatility: `atrPercentile > 0.75`
  - Low Volatility: `atrPercentile < 0.25`
  - Expansion/Compression: ATR percentile change direction over 10 bars

The `RegimeLabel` type and interface are unchanged. All consuming code (`confidence.ts`, `edges.ts`) is unaffected.

**Definition of done:** Regime labels no longer break down during prolonged low-volatility or high-volatility periods. The same strategy is not labeled as "High Volatility" in June 2023 and June 2024 solely because the absolute ATR level is similar while the baseline has shifted.

---

## Phase 4 — Structural Indicators Library

**Objective:** Build a clean, well-typed, causal, cached library of structural price indicators that the new strategy suite depends on. These are pure functions that read candle arrays and return structural information.

**Rationale:** All five new strategies depend on some combination of FVG, OB, liquidity pools, displacement, and Fibonacci. Build the library once, correctly, with caching, before any strategy uses it. This prevents duplicate implementations and ensures correctness is testable in isolation.

**Weaknesses addressed:** #1 (enabler for new strategies)

---

### Task 4.1 — Displacement candle detector

**File:** `core/indicators/displacement.ts` (new)

```typescript
isDisplacement(candle: Candle, atr: number): boolean
displacementScore(candle: Candle, atr: number): number   // 0–1
```

A candle qualifies as displacement when:
- `bodyRatio = |close - open| / (high - low) >= 0.60`
- `rangeMultiple = (high - low) / atr >= 1.40`

`displacementScore` returns a continuous score: `(bodyRatio - 0.60) / 0.40 × 0.5 + (rangeMultiple - 1.40) / 0.60 × 0.5`, clamped to 0–1.

Add a cache wrapper to `core/indicatorCache.ts` for the displacement score array.

---

### Task 4.2 — Fair Value Gap detector

**File:** `core/indicators/fvg.ts` (new)

```typescript
interface FVG {
  direction: 'bullish' | 'bearish'
  top: number
  bottom: number
  midpoint: number
  barIndex: number  // the displacement candle's index
  width: number
}

detectFVGs(candles: Candle[], fromIndex: number, lookback: number): FVG[]
nearestOpenFVG(candles: Candle[], i: number, direction: 'bullish' | 'bearish'): FVG | null
isMitigated(fvg: FVG, candles: Candle[], currentIndex: number): boolean
```

A bullish FVG at bar `i` exists when `candles[i-1].high < candles[i+1].low` AND bar `i` qualifies as displacement. Causality: the FVG at bar `i` is only detectable at bar `i+1`. Consumers must account for this 1-bar offset.

`isMitigated`: returns true if any bar after `fvg.barIndex + 1` has traded within the FVG range.

Cache the FVG list per (candles array, lookback) in `indicatorCache.ts`.

---

### Task 4.3 — Order Block detector

**File:** `core/indicators/orderBlock.ts` (new)

```typescript
interface OrderBlock {
  direction: 'bullish' | 'bearish'
  top: number
  bottom: number
  barIndex: number
  impulseBarIndex: number
}

detectOrderBlocks(candles: Candle[], atr: number[], swingHighs: number[], swingLows: number[]): OrderBlock[]
nearestOpenOB(candles: Candle[], i: number, direction: 'bullish' | 'bearish', atr: number[]): OrderBlock | null
isMitigated(ob: OrderBlock, candles: Candle[], currentIndex: number): boolean
```

Bullish OB: the last bearish-body candle (close < open) immediately before a displacement up + confirmed swing high break. Valid until price closes below OB bottom.

Causality: OB detection requires confirmed swing break, which requires `look` bars lag. The OB barIndex is always ≥ `look` bars before the current bar.

---

### Task 4.4 — Liquidity pool detector

**File:** `core/indicators/liquidityPools.ts` (new)

```typescript
interface LiquidityPool {
  level: number
  type: 'high' | 'low'
  count: number
  barIndices: number[]
  swept: boolean
  sweptBarIndex?: number
}

detectLiquidityPools(candles: Candle[], swingHighs: number[], swingLows: number[], tolerance: number): LiquidityPool[]
wasPoolSwept(pool: LiquidityPool, candles: Candle[], currentIndex: number): boolean
nearestUnsweptPool(candles: Candle[], i: number, direction: 'above' | 'below', tolerance: number): LiquidityPool | null
```

Pool formation: group swing highs within `tolerance`% of each other (default: 0.4% for 4H, 0.6% for 1H). A pool requires ≥ 2 swing points. Level = mean of grouped prices.

Sweep detection: a pool is swept when a bar's extreme touches the pool level and the bar closes on the opposite side.

---

### Task 4.5 — Fibonacci retracement calculator

**File:** `core/indicators/fibonacci.ts` (new)

```typescript
interface RetracementResult {
  depth: number
  zone: 'none' | 'shallow' | 'optimal' | 'deep' | 'invalidated'
  score: number   // 0–10 for Edge Score
  levels: { 236: number; 382: number; 500: number; 618: number; 786: number }
}

computeRetracement(impulseLow: number, impulseHigh: number, currentPrice: number, direction: 'long' | 'short'): RetracementResult
```

Zones:
- `optimal`: 0.50 ≤ depth ≤ 0.618 → score 10
- `shallow`: 0.382 ≤ depth < 0.50 → score 6
- `deep`: 0.618 < depth ≤ 0.786 → score 5
- `deep_risk`: 0.786 < depth < 1.0 → score 2
- `invalidated`: depth ≥ 1.0 → score 0

---

## Phase 5 — New Strategy Universe

**Objective:** Replace the commoditized retail TA strategy registry with five structural strategies and one funding rate strategy, all using the infrastructure built in Phases 3-4. Keep the original 22 as benchmark-only (not in live selection).

**Rationale:** This is where the actual edge comes from. Every prior phase was preparation for this one. Building new strategies before the indicators exist (Phase 4) or before the validation is correct (Phase 2) would produce confusing results and require rebuilding.

**Weaknesses addressed:** #1 (primary fix), #5 (funding), #6 (HTF context usage)

---

### Task 5.1 — Edge Score system

**File:** `core/edgeScore.ts` (new)

```typescript
interface EdgeScoreComponents {
  htfBias: number         // –20 | 0 | +20
  liquiditySweep: number  // 0–15
  displacement: number    // 0–15
  fvgEntry: number        // 0–15
  orderBlock: number      // 0–10
  fibonacci: number       // 0–10
  killZone: number        // 0–10
  funding: number         // –5 to +5
}

interface EdgeScoreResult {
  total: number
  tier: 'A+' | 'A' | 'B' | 'skip'
  positionSizeMultiplier: number  // 1.0 | 0.75 | 0.5 | 0
  components: EdgeScoreComponents
  reasons: string[]
}

computeEdgeScore(ctx: StrategyContext, signal: StrategySignal, candles4h: Candle[]): EdgeScoreResult
```

Tier thresholds: A+ = 80+, A = 65–79, B = 50–64, skip = below 50 or 4H bias opposes.

Scoring rules:
- **4H Structural Bias**: agrees = +20, neutral = 0, opposes = −20 (signal rejected)
- **Liquidity Pool Swept**: equal-highs/lows pool in last 6 bars = 15; isolated swing = 10; further back = 5; none = 0
- **Displacement Quality**: body/range ≥ 0.80 + range ≥ 1.8×ATR = 15; scaled down to 0 for weak candles
- **FVG Entry**: entry inside open FVG = 15; near FVG edge = 8; FVG present but not inside = 3; none = 0
- **Order Block Confluence**: entry inside valid unmitigated OB = 10; near OB edge = 5; none = 0
- **Fibonacci Zone**: 50–61.8% = 10; 38.2–50% or 61.8–70% = 6; 70–78.6% = 3; outside = 0
- **Kill Zone**: London or NY = 10; overlap/active = 5; Asian = 0
- **Funding Alignment**: aligned = +5; neutral = 0; opposed mild = −2; opposed strong = −5

The Edge Score is computed after a strategy fires — it is the filter on top of the signal, not a replacement for it. Add `edgeScore?: EdgeScoreResult` to `LiveSignal` and store `edgeScore?.total` in `PaperTrade`.

---

### Task 5.2 — Funding Rate Reversion strategy

**File:** `core/strategies/v2/fundingReversion.ts` (new)

**Logic:**
- Access `ctx.fundingRate`
- **Short setup**: funding > +0.08% AND 4H structure is bearish or neutral AND price at or above the most recent FVG
- **Long setup**: funding < −0.04% AND 4H structure is bullish or neutral AND price at or below the most recent bearish FVG
- Stop: 1.5× ATR above/below the entry bar's extreme
- TP: 2R
- Hold limit: 24 bars on 1H, 8 bars on 4H
- Confidence base: `min(1, |fundingRate| / 0.12)`

**Grid:** `{ fundingShortThreshold: [0.06, 0.08, 0.10], fundingLongThreshold: [-0.03, -0.04, -0.05], atrMult: [1.2, 1.5] }`

This strategy has structural justification that does not exist in any of the current 22 strategies — the edge is a feature of the perpetual futures product itself, not a price pattern.

---

### Task 5.3 — MSS v2

**File:** `core/strategies/v2/mssV2.ts` (new)

The current `marketStructureShift` fires on any structure break. The v2 requires:

1. `ctx.htfBias` matches the signal direction (hard filter)
2. A liquidity pool was swept in the last 6 bars
3. The sweep was followed by a displacement candle (score ≥ 0.60)
4. An FVG was created by that displacement
5. Current price is inside or approaching the FVG (within 0.5× ATR)
6. Kill zone score ≥ 5

Entry: at FVG midpoint or on close into FVG range.
Stop: beyond FVG far edge + 0.3× ATR.
TP: 2R.
Confidence base: `0.55 + displacementScore × 0.20 + (london|ny killZone ? 0.15 : 0)`

**Grid:** `{ look: [4, 5, 7], atrBuffer: [0.2, 0.3, 0.5], rr: [2, 2.5, 3] }`

---

### Task 5.4 — Liquidity Sweep v2

**File:** `core/strategies/v2/liquiditySweepV2.ts` (new)

1. `ctx.htfBias` matches signal direction
2. Detect a liquidity pool (≥ 2 swing points) swept in the current or last 3 bars
3. Sweep bar closes back inside the pool range (failed sweep)
4. Displacement candle on the snap-back (score ≥ 0.55)
5. FVG created by the snap-back
6. Entry is NOT on the snap-back bar — wait for price to retrace into the FVG (up to 10 bars)
7. Entry on FVG touch

Stop: below/above the sweep wick extreme + 0.2× ATR.
TP: 2R; extend to 3R if pool count ≥ 3.
Confidence base: 2-point pool → 0.60, 3+ point pool → 0.70.

---

### Task 5.5 — Breakout Retest v2

**File:** `core/strategies/v2/breakoutRetestV2.ts` (new)

This fixes the naming and logic issue in the current strategy (which is a breakout entry, not a retest entry).

1. `ctx.htfBias` matches signal direction
2. A confirmed swing high/low was broken by a displacement candle (score ≥ 0.60) in the last 8 bars
3. Volume on breakout bar ≥ 1.5× 20-bar average
4. An FVG was created at the breakout candle
5. Price has returned to the FVG or broken swing level (the retest)
6. Retest quality: wick into level, close away from it, volume < 70% of breakout bar
7. Retest within 10 bars (1H) or 6 bars (4H) of breakout

Entry: close of the rejection candle.
Stop: beyond retest bar extreme + 0.3× ATR.
TP: 2R.

**Grid:** `{ look: [4, 5, 7], volumeRatio: [1.3, 1.5, 2.0], maxRetestBars: [8, 10, 12], rr: [2, 3] }`

---

### Task 5.6 — Trend Continuation v2

**File:** `core/strategies/v2/trendContinuationV2.ts` (new)

Replaces the EMA-pullback logic with a structural OB/FVG entry.

1. `ctx.htfBias === 'bullish'` for longs, `'bearish'` for shorts (mandatory)
2. Clear trend direction on 1H confirmed by swing structure (HH/HL for bullish)
3. Price has pulled back at least 3 bars from the last swing high
4. Identify a bullish Order Block in the pullback zone
5. OR identify an open bullish FVG in the pullback zone
6. Entry when price enters the OB range or FVG with a close back above midpoint
7. Fibonacci depth of pullback: reject if > 78.6% (structure at risk)

Stop: below OB bottom + 0.3× ATR (structural stop, not arbitrary ATR multiple).
TP: 1.618× impulse leg from OB entry.
Confidence base: `0.60` + Fibonacci score × 0.05 + kill zone contribution.

**Grid:** `{ look: [4, 5, 7], fibDepthMax: [0.70, 0.786], rr: [2, 2.5, 3] }`

---

### Task 5.7 — Pullback Entry v2

**File:** `core/strategies/v2/pullbackEntryV2.ts` (new)

1. `ctx.htfBias` matches direction (mandatory)
2. Identify the most recent complete impulse leg (confirmed swing low to swing high on 1H)
3. Compute Fibonacci levels on that leg
4. Price is currently in a pullback into the 50–61.8% zone
5. Within that Fib zone: an open FVG OR an unmitigated OB
6. Entry: bullish close inside the OB/FVG while within the Fib zone
7. Volume contracting on pullback bars (≤ 80% of impulse leg's average volume)

Stop: below the 78.6% Fib level (structural invalidation, not arbitrary ATR).
TP: 1.618× extension of the impulse leg.
Confidence base: `0.55 + fibScore/10 × 0.25` + OB/FVG bonus (+0.10 each).

**Grid:** `{ look: [4, 5, 7], fibMin: [0.45, 0.50], fibMax: [0.618, 0.65], rr: [2, 2.5, 3] }`

---

### Task 5.8 — Update strategy registry

**File:** `core/strategies/index.ts`

Create two exports:
- `BENCHMARK_STRATEGIES`: the existing 22 strategies — included in research for comparison, never eligible for live selection
- `V2_STRATEGIES`: the 6 new strategies — eligible for both research and live selection

`STRATEGIES` becomes `[...V2_STRATEGIES, ...BENCHMARK_STRATEGIES]`.

Update `selectTopValidated()` in `ranking.ts` to prefer strategies from `V2_STRATEGIES` over `BENCHMARK_STRATEGIES` when both pass gates. If a v2 strategy passes, it is selected over any benchmark strategy regardless of score difference.

---

## Phase 6 — Portfolio Construction and Risk

**Objective:** The system deploys multiple uncorrelated strategies simultaneously with correct aggregate risk limits. Portfolio-level risk is managed, not just per-trade risk.

**Rationale:** Phase 5 may produce multiple passing strategies. Without portfolio construction, the system still picks one. Without correlation management, running both BTC and ETH signals creates hidden 2× risk. Build this after you have strategies to construct a portfolio from.

**Weaknesses addressed:** #4, #7

---

### Task 6.1 — Multi-strategy portfolio selection

**File:** `core/ranking.ts`

Replace `selectTopValidated()` (returns one `string | null`) with `selectPortfolio()`:

```typescript
interface SelectedStrategy {
  strategyId: string
  allocationWeight: number   // 0–1, sums to 1 across portfolio
  params: ParamSet
  crossAssetTier: string
}

selectPortfolio(ranking: RankedStrategy[], maxStrategies: number = 5): SelectedStrategy[]
```

Portfolio construction rules:
1. Start with the highest-ranked passing strategy
2. Add the next-ranked strategy only if trade-timing overlap with already-selected strategies is < 40%
3. Continue until `maxStrategies` reached or no more passing strategies
4. Normalize weights proportional to score
5. Each strategy's effective position size: `riskPerTrade × allocationWeight`

Trade-timing overlap: for each pair, compute the fraction of bars where both are simultaneously in a position.

---

### Task 6.2 — Cross-asset correlation guard

**Files:** `core/scanner.ts`, `core/risk.ts`

Add to the live scanner: before returning an ETH signal, check whether a BTC signal was also generated in the same direction in the current scan.

- Realized 20-bar return correlation > 0.80: reduce ETH position size to 50% of normal
- Correlation > 0.90: skip ETH signal entirely

Add to `BacktestConfig`:
```typescript
maxPortfolioRiskPct: number  // default 0.015 (1.5% total at any time)
```

In `runBacktest()`, before opening a new position, check if effective portfolio risk would exceed `maxPortfolioRiskPct`. If yes, skip the signal.

---

## Phase 7 — Paper Trading and Operations

**Objective:** Paper trade metrics are accurate and continuous. Operations (seed aging, signal expiry) are reliable. The system is trustworthy end-to-end.

**Rationale:** These are important but not blockers for the research pipeline. They improve operational reliability and metric accuracy, but the system can run research and find edges without them.

**Weaknesses addressed:** #10, #12, #15, #19, #20

---

### Task 7.1 — Continuous paper trade resolution

**File:** `scripts/scheduler.ts`

Add a second interval alongside the weekly research loop:
- Every 15 minutes, fetch the latest 200 candles for both symbols (both 1H and 4H)
- Call `resolveOpenTrades()` on all open paper trades
- Write updated trades to the store
- Log resolution events (which trades closed, at what price, what outcome)

---

### Task 7.2 — Signal expiry and entry price validation

**Files:** `paper/tracker.ts`, `core/scanner.ts`

Add to `PaperTrade`:
```typescript
signalClosePrice: number  // the candle close that generated the signal
expiresAt: number         // openedAt + N × candleMs (e.g. 3 bars)
```

In `resolveOpenTrades()`: if `Date.now() > trade.expiresAt` and price never reached the entry level, mark trade as `'expired'`. Expired trades are excluded from performance metrics.

Record the next bar's open as the actual entry price (not signal close). Record `entrySlippage` as the gap between signal close and actual fill.

---

### Task 7.3 — Seed aging detection and warning

**Files:** `data/store.ts`, `scripts/deploy.mjs`, `app/api/research/route.ts`

Add to `ResearchSnapshot`:
```typescript
seededAt?: number  // unix ms when committed to seed/
```

In `scripts/seed.ts`: set `seededAt = Date.now()` before writing to `seed/`.

In `app/api/research/route.ts`: if `seededAt` is older than 7 days, add `{ stale: true, staleDays: N }` to the API response.

In `scripts/deploy.mjs`: before pushing, check if `seed/research.json` exists and if `seededAt` is older than 7 days. Print a visible warning but do not block the deploy.

---

### Task 7.4 — Confidence score renamed and calibrated

**Files:** `core/confidence.ts`, UI components

Step 1 — rename in the UI:
- Replace all display instances of "Confidence" with "Setup Quality"
- Replace percentage format with a tier label: A+ / A / B / Unrated
- Add a tooltip: "Blend of regime alignment, out-of-sample robustness, and recent paper track record. Not a win probability."

Step 2 — calibrate (requires ≥ 50 paper trades):
- In `app/api/performance/route.ts`, add a `confidenceCalibration` field
- For each decile of confidence score, report: `{ decile, tradeCount, meanRMultiple, winRate }`
- Display in the Performance page as a calibration chart: confidence decile vs. realized mean R

Step 3 (after 100+ paper trades): replace manually-chosen weights in `confidence.ts` with weights derived from a linear regression of confidence components against realized R-multiples.

---

## Dependency Map

```
Phase 1 (Backtest Accuracy)
    └── required by: all phases (numbers must be correct first)

Phase 2 (Validation Methodology)
    └── required by: Phase 5 (strategies need correct gates to be evaluated)

Phase 3 (Data Infrastructure)
    ├── Task 3.1 (Funding) → required by: Task 5.2 (Funding Reversion strategy)
    ├── Task 3.2 (HTF Context) → required by: Tasks 5.3–5.7 (all v2 strategies)
    ├── Task 3.3 (Sessions) → required by: Edge Score (Task 5.1)
    └── Task 3.4 (Regime) → standalone improvement, no downstream dependencies

Phase 4 (Structural Indicators)
    ├── Task 4.1 (Displacement) → required by: Tasks 4.2, 5.3, 5.4, 5.5
    ├── Task 4.2 (FVG) → required by: Tasks 5.3, 5.4, 5.5, 5.6, 5.7
    ├── Task 4.3 (OB) → required by: Tasks 5.6, 5.7
    ├── Task 4.4 (Liquidity Pools) → required by: Tasks 5.3, 5.4
    └── Task 4.5 (Fibonacci) → required by: Tasks 5.7, 5.1 (Edge Score)

Phase 5 (New Strategies)
    ├── Task 5.1 (Edge Score) → required by: Tasks 5.2–5.7 (all use it)
    └── Tasks 5.2–5.8 → required by: Phase 6

Phase 6 (Portfolio Construction)
    └── requires: Phase 5 complete (needs strategies to build portfolio from)

Phase 7 (Paper Trading + Operations)
    └── no hard dependencies; can run in parallel with Phase 6
```

---

## File Change Summary

| File | Action | Phase |
|---|---|---|
| `core/backtest.ts` | Modify: force-close open trades, MtM equity, vol-scaled slippage | 1 |
| `core/metrics.ts` | Modify: add consecutive-loss count, Sharpe calculation | 2 |
| `core/validation.ts` | Modify: rolling WF, new gates, fixed robustness, tiered cross-asset | 2 |
| `core/settings.ts` | Modify: expose new gate parameters | 2 |
| `core/types.ts` | Modify: slippage model, StrategyContext fields, new config fields | 1, 3 |
| `paper/tracker.ts` | Modify: fee inclusion, signal expiry, actual entry price | 1, 7 |
| `data/funding.ts` | Create: funding rate fetcher and cache | 3 |
| `data/store.ts` | Modify: funding storage, seededAt field | 3, 7 |
| `data/binance.ts` | Modify: add funding rate endpoint | 3 |
| `scripts/download.ts` | Modify: also download funding history | 3 |
| `core/htfContext.ts` | Create: 4H swing structure and bias | 3 |
| `core/indicators/sessions.ts` | Create: kill zone detection | 3 |
| `core/scanner.ts` | Modify: HTF context, regime percentile, Edge Score, funding | 3, 4, 5 |
| `core/indicators/displacement.ts` | Create | 4 |
| `core/indicators/fvg.ts` | Create | 4 |
| `core/indicators/orderBlock.ts` | Create | 4 |
| `core/indicators/liquidityPools.ts` | Create | 4 |
| `core/indicators/fibonacci.ts` | Create | 4 |
| `core/indicatorCache.ts` | Modify: add cache wrappers for new indicators | 4 |
| `core/edgeScore.ts` | Create | 5 |
| `core/strategies/v2/fundingReversion.ts` | Create | 5 |
| `core/strategies/v2/mssV2.ts` | Create | 5 |
| `core/strategies/v2/liquiditySweepV2.ts` | Create | 5 |
| `core/strategies/v2/breakoutRetestV2.ts` | Create | 5 |
| `core/strategies/v2/trendContinuationV2.ts` | Create | 5 |
| `core/strategies/v2/pullbackEntryV2.ts` | Create | 5 |
| `core/strategies/index.ts` | Modify: benchmark vs v2 registry split | 5 |
| `core/ranking.ts` | Modify: portfolio selection, v2 preference | 5, 6 |
| `core/risk.ts` | Modify: portfolio risk cap, correlation guard | 6 |
| `core/confidence.ts` | Modify: integrate Edge Score | 5, 7 |
| `scripts/scheduler.ts` | Modify: 15-min paper resolution loop | 7 |
| `scripts/deploy.mjs` | Modify: seed age warning | 7 |
| `scripts/seed.ts` | Modify: write seededAt timestamp | 7 |
| `app/api/research/route.ts` | Modify: stale data flag | 7 |

**Total: 12 modified files, 16 new files, 7 phases.**

---

## Expected Outcome by Phase

| After Phase | State of the System |
|---|---|
| Phase 1 | Backtest numbers are mechanically correct. Drawdown is real. Costs are realistic. |
| Phase 2 | Validation methodology simulates live deployment honestly. Gates select quality, not frequency. |
| Phase 3 | Funding rate and 4H context available to all strategies. Sessions known at each bar. Regime detection is self-calibrating. |
| Phase 4 | FVG, OB, liquidity pools, displacement, and Fibonacci all available and cached. |
| Phase 5 | Six structure-based strategies in the registry. Edge Score filters signal quality. First honest research run with non-commodity signals. |
| Phase 6 | System deploys a portfolio of passing strategies. BTC/ETH risk is managed at the portfolio level. |
| Phase 7 | Paper metrics are accurate and continuous. Operations are reliable. Confidence labeling is honest. |
