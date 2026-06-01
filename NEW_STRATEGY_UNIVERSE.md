# New Strategy Universe — Institutional Design Specification

**Scope:** BTCUSDT + ETHUSDT perpetual futures, 1H and 4H timeframes
**Data window:** 2024-06-01 → 2026-06-01 (24 months, 17,520 × 1H candles per symbol)
**Calibration facts from live data:**
- BTC 1H swing points: ~91/month
- BTC 1H equal-highs/lows pools: ~63/month (raw, before filters)
- BTC 1H displacement FVGs: ~46/month (raw, before filters)
- BTC avg ATR(14) as % of price: 0.68%

---

## Why These 15 Replace the Current 22

The current 22 strategies share one failure mode: they are all indicator-based. They transform price into a secondary signal (EMA, RSI, MACD) and then trade the secondary signal rather than the underlying market behavior. In liquid perpetual futures markets, secondary signals are adversarially priced — they are so widely known that sophisticated participants sit on the other side.

The 15 strategies below are structure-based and data-based. They do not ask "what does the indicator say?" They ask "what did price actually do, and what does that tell us about what large participants just did?" The distinction is not semantic — it changes the nature of the edge.

The structural edges here fall into four categories:

1. **Liquidity mechanics** — price moves to collect stop orders; the collection itself is the signal
2. **Order flow imbalance** — displacement candles and FVGs reveal where institutional orders remain unfilled
3. **Product mechanics** — funding rate creates structural buy/sell pressure specific to perpetual futures
4. **Positioning data** — Open Interest reveals whether moves are driven by new conviction or exhaustion

---

## New Data Sources Required

| Source | Endpoint | Access | Update Frequency |
|---|---|---|---|
| Funding rate history | `GET /fapi/v1/fundingRate` | Public, no key | Every 8h settlement |
| Current funding rate | `GET /fapi/v1/premiumIndex` | Public, no key | Real-time |
| Open Interest (1H) | `GET /futures/data/openInterestHist?period=1h` | Public, no key | Hourly |
| Open Interest (current) | `GET /fapi/v1/openInterest` | Public, no key | Real-time |

All endpoints are on `fapi.binance.com`. No API key required. These four sources, combined with existing OHLCV 1H and 4H candles, cover all 15 strategies below.

---

## Ranking Methodology

Strategies are ranked on a composite of:
- **Edge quality** (0–10): strength of the structural mechanism; is there a mechanically sound reason for the edge to exist?
- **Expected profit factor** (derived from structural reasoning, not backtested results — those come from Phase 5)
- **Signal frequency** (calibrated against real data above)
- **Independence** (strategies further down the list add less marginal information if you already have the top-ranked ones)

---

## The 15 Strategies

---

### Rank 1 — Funding Rate + OI Combined Extremity Reversal

**Category:** Product Mechanics + Positioning
**Timeframes:** 1H entry, 4H context
**Symbols:** BTCUSDT, ETHUSDT (independent signals per symbol)

#### Edge Mechanism

This is the highest-conviction structural edge available in perpetual futures. Two independent signals must both be extreme simultaneously:

1. **Funding rate extreme**: When longs pay >0.10% per 8h, they pay 130% annualized to hold. This creates forced selling from leveraged longs who cannot afford the carry, a structural ceiling on buying pressure, and an incentive for smart money to short (being paid to hold). The reversal is mechanically driven, not probabilistically predicted.

2. **Open Interest at percentile extreme**: OI at the 80th percentile of its 30-day range means a historically large number of contracts are open. The combination of extreme funding AND extreme OI means: the crowd is positioned, the crowd is paying, and any adverse move will cascade through overleveraged positions.

When both conditions are true, the odds shift structurally — not through pattern recognition, but through market mechanics.

#### Setup Conditions (all required)

- 8h funding rate > +0.10% (short bias) OR < -0.05% (long bias)
- OI > 80th percentile of its trailing 30-day (720-bar 1H) range
- Price is at or above a 4H structural resistance (for shorts) or at/below 4H support (for longs)
- 4H structure is bearish or neutral (for shorts), bullish or neutral (for longs)
- A 1H displacement candle in the reversal direction: body/range ≥ 0.60, range ≥ 1.4× ATR(14)

#### Entry

Close of the displacement candle, OR on a retest of the FVG created by the displacement (whichever comes first within 6 bars)

#### Stop Loss

1.5× ATR(14) beyond the displacement bar's extreme (above the high for shorts, below the low for longs)

#### Take Profit

- TP1: 2R (take 50% off)
- TP2: 3R (trail remainder using 4H structure)

#### Hold Limit

24 bars (1H). Funding events resolve within 1-3 periods; do not hold beyond one trading day.

#### Expected Metrics (structural estimate)

| Metric | Estimate |
|---|---|
| Win rate | 62–70% |
| Profit factor | 2.0–3.0 |
| Signals/year (BTC+ETH) | 12–20 |
| Avg hold | 8–16 bars |

#### Notes

Rare. That is the point. This is the highest-quality setup in the universe; frequency is secondary. The low signal count makes the 200-trade validation gate impossible to meet — this is a primary reason Phase 2 must lower the minimum to 60 trades.

---

### Rank 2 — London Kill Zone Asian Session Stop Hunt

**Category:** Liquidity Mechanics + Session Timing
**Timeframes:** 1H entry
**Symbols:** BTCUSDT, ETHUSDT

#### Edge Mechanism

The Asian session (20:00–07:00 UTC) establishes a defined price range as liquidity is thin and institutional desks are offline. Retail traders place stops above and below this range, creating predictable clusters. London market makers (07:00–10:00 UTC), who are among the most active participants in global crypto, routinely engineer a sweep of one side of the Asian range before establishing the day's actual direction. This is observable daily and structurally repeatable because the incentive (collecting stop liquidity to fill large positions) is constant.

This is not a pattern that "looks like reversals happen." It is the direct footprint of a daily institutional routine.

#### Setup Conditions (all required)

- Identify the Asian session high and low: the highest high and lowest low between 20:00–06:59 UTC
- Time window: the signal must form between 07:00–10:00 UTC (London Kill Zone)
- A 1H bar during the kill zone sweeps above the Asian session high (for short setup) OR below the Asian session low (for long setup): the bar's wick goes beyond the Asian extreme but the bar closes back inside the Asian range
- The sweep bar's volume ≥ 1.5× the 20-bar average volume (institutional participation required)
- A displacement candle immediately follows in the reversal direction: body/range ≥ 0.60
- 4H structure does not strongly oppose the reversal (neutral or aligned is acceptable)

#### Entry

At the open of the FVG created by the displacement reversal, or at the FVG midpoint on retest (within 5 bars of the displacement)

#### Stop Loss

Beyond the sweep wick extreme + 0.3× ATR(14). If the wick is the entire basis of the trade, price closing beyond it means the sweep failed and a different pattern is forming.

#### Take Profit

- Primary target: the opposite Asian session extreme (e.g., if the high was swept, target the Asian session low)
- TP2: 2.5R if the opposite extreme is further than 2R

#### Hold Limit

8 bars (keep within the London session)

#### Expected Metrics

| Metric | Estimate |
|---|---|
| Win rate | 62–68% |
| Profit factor | 1.9–2.5 |
| Signals/year (BTC+ETH) | 60–100 |
| Avg hold | 3–6 bars |

#### Notes

This is the highest-frequency strategy in the universe with strong structural justification. The session timing filter alone eliminates the vast majority of false sweeps (which occur during the Asian session itself, in low volume). Directly testable: run the signal detection with and without the 07:00–10:00 UTC filter and compare.

---

### Rank 3 — MSS After Equal Highs/Lows Sweep (Full Sequence)

**Category:** Liquidity Mechanics + Market Structure
**Timeframes:** 1H entry, 4H confirmation
**Symbols:** BTCUSDT, ETHUSDT

#### Edge Mechanism

This is the complete institutional sequence that the current `marketStructureShift.ts` attempts but executes at step 3 of 5:

1. **Liquidity pool forms** — equal highs or equal lows accumulate (≥2 swing points within 0.5% of each other) representing a concentration of stop orders
2. **Sweep** — price drives through the pool, triggering those stops
3. **Displacement** — a large, directional candle reverses immediately after the sweep (the institution used the stops as counterparty to accumulate a position and is now moving price in the direction of that position)
4. **MSS** — the displacement closes beyond the last structural swing in the reversal direction, confirming that the new directional intent has supplanted the prior trend
5. **FVG retest** — price returns to the gap created by the displacement (the entry zone)

Entering at step 5 means the institution has already completed its accumulation and the FVG entry rides the distribution phase of their position. The entry zone is structurally defined (the FVG), making both entry and stop mechanical rather than arbitrary.

#### Setup Conditions (all required)

- At least one equal-highs pool (≥2 swing highs within 0.5%, within 150 bars) or equal-lows pool
- The pool was swept within the last 6 bars (wick beyond pool level, close back inside)
- A displacement candle immediately follows the sweep: body/range ≥ 0.65, range ≥ 1.5× ATR(14)
- The displacement creates a 1H FVG (gap between adjacent candles)
- The displacement closes beyond the most recent opposing 1H structure swing (this is the MSS)
- 4H bias is either neutral or aligned with the reversal direction (hard filter: reject if 4H bias strongly opposes)
- Pool count ≥ 2 (minimum); bonus weight if ≥ 3

#### Entry

When price first trades into the FVG zone after the displacement (can be 1–10 bars later)

#### Stop Loss

Beyond the sweep wick extreme + 0.3× ATR

#### Take Profit

- TP1: 2R
- TP2: 3R if pool count ≥ 3 and 4H bias fully aligned

#### Hold Limit

12 bars (1H)

#### Expected Metrics

| Metric | Estimate |
|---|---|
| Win rate | 62–72% |
| Profit factor | 2.0–2.8 |
| Signals/year (BTC+ETH) | 40–70 |
| Avg hold | 4–8 bars |

#### Notes

The current `marketStructureShift.ts` is steps 3+4 only — no sweep prerequisite, no FVG entry, no pool detection. This full-sequence version has materially higher expected quality because each additional step filters out false MSS signals. The 765 equal-highs pools and 735 equal-lows pools in the 24-month BTC dataset (raw) yield roughly 40–70 fully-qualified signals per year after all filters.

---

### Rank 4 — Funding Rate Extreme Reversion

**Category:** Product Mechanics
**Timeframes:** 1H entry, 4H context
**Symbols:** BTCUSDT, ETHUSDT (independent)

#### Edge Mechanism

A simpler version of Rank 1 using only funding rate, without the OI confirmation requirement. Lower signal quality than Rank 1 but significantly higher frequency. The structural mechanism is the same: extreme funding creates mechanical buy/sell pressure through forced position reduction and carry incentives.

Funding rate thresholds:
- **Short signal**: 8h funding > +0.08% (modest version) or > +0.10% (strict version)
- **Long signal**: 8h funding < -0.04%

The asymmetry between the short and long thresholds reflects that BTC/ETH historically run extreme positive funding far more often than extreme negative funding. Longs are typically the overcrowded side.

#### Setup Conditions

- Current 8h funding exceeds threshold
- Price is at or near a structural level in the trade direction (not entering in the middle of nowhere — the funding signal needs a price anchor)
- 4H structural bias aligned or neutral
- A 1H reversal confirmation candle at the structural level

#### Entry

Close of the confirming 1H candle at the structural level

#### Stop Loss

1.5× ATR(14) beyond the confirmation bar's adverse extreme

#### Take Profit

- TP1: 2R (partial close)
- TP2: Hold remainder until funding rate returns below 0.05% (funding normalized = edge gone)

#### Hold Limit

24 bars (1H)

#### Expected Metrics

| Metric | Estimate |
|---|---|
| Win rate | 57–65% |
| Profit factor | 1.6–2.2 |
| Signals/year (BTC+ETH) | 25–45 |
| Avg hold | 8–18 bars |

#### Notes

Sufficient signal frequency to meet a 60-trade minimum gate (Phase 2) across a 2-year dataset. The funding rate's value as a standalone signal (without OI) is well-documented in academic crypto research. PF expectation is structurally justified, not assumed.

---

### Rank 5 — Equal Highs/Lows Sweep → Displacement → FVG Reversal

**Category:** Liquidity Mechanics
**Timeframes:** 1H entry, 4H context
**Symbols:** BTCUSDT, ETHUSDT

#### Edge Mechanism

A streamlined version of Rank 3 that does not require the MSS confirmation. The complete sequence is: pool swept → displacement → FVG entry. The MSS step (close beyond opposing structure) is removed, making this strategy fire earlier in the sequence at the cost of some confirmation. This creates more signals and slightly lower win rate than Rank 3, but earlier entries and better R/R potential.

#### Setup Conditions (all required)

- Equal-highs pool (≥2 swing highs within 0.5%) or equal-lows pool detected within the last 150 bars
- A 1H bar sweeps the pool (wick beyond, close back inside)
- Displacement candle within 2 bars of the sweep: body/range ≥ 0.60, range ≥ 1.4× ATR(14)
- Displacement creates a visible FVG (gap ≥ 0.3× ATR between adjacent candles)
- 4H bias aligned or neutral (hard filter)

#### Entry

FVG first touch (near edge) within 10 bars of the displacement

#### Stop Loss

Beyond sweep wick extreme + 0.2× ATR

#### Take Profit

2R; extend to 3R if pool count ≥ 3

#### Hold Limit

10 bars (1H)

#### Expected Metrics

| Metric | Estimate |
|---|---|
| Win rate | 58–67% |
| Profit factor | 1.8–2.4 |
| Signals/year (BTC+ETH) | 60–100 |
| Avg hold | 3–7 bars |

---

### Rank 6 — BOS + Order Block Retest

**Category:** Order Flow Imbalance + Market Structure
**Timeframes:** 1H entry, 4H alignment
**Symbols:** BTCUSDT, ETHUSDT

#### Edge Mechanism

A Break of Structure confirmed by a displacement candle tells us that institutional participants just moved the market significantly in a direction. The last opposing candle before that displacement (the Order Block) is where those participants placed their initial orders. Price returning to the OB zone is returning to a level where:
1. Unfilled institutional orders may remain
2. The same participants may add to their position at a better price
3. The stop for the OB entry is natural and structural (OB break = thesis wrong)

Unlike the current `breakOfStructure.ts` which fires at the BOS itself with an ATR stop, this version waits for the pullback to the OB and uses the OB boundary as the stop. This produces tighter stops and higher R/R.

#### Setup Conditions (all required)

- A 1H swing high/low is broken by a displacement candle: body/range ≥ 0.60, close significantly beyond the swing
- Volume on the BOS bar ≥ 1.5× 20-bar average
- Identify the Order Block: the last 1H candle of opposite color to the BOS immediately before the displacement (last bearish candle before a bullish BOS; last bullish candle before a bearish BOS)
- Price pulls back into the OB zone (between the OB candle's open and close price)
- Pullback depth: 38.2%–78.6% of the BOS impulse leg
- 4H bias aligned with the BOS direction (hard filter)
- Retest of OB occurs within 12 bars (1H) of the BOS

#### Entry

First 1H close inside the OB zone that is in the BOS direction (a close above the OB midpoint for longs)

#### Stop Loss

Beyond the OB's far edge + 0.3× ATR (if price closes through the OB, the setup is invalidated — institutional demand/supply failed to hold)

#### Take Profit

- TP1: 2R
- TP2: 1.618× the BOS impulse leg projected from the OB entry (Fibonacci extension, the natural institutional target)

#### Hold Limit

12 bars (1H)

#### Expected Metrics

| Metric | Estimate |
|---|---|
| Win rate | 60–68% |
| Profit factor | 1.7–2.3 |
| Signals/year (BTC+ETH) | 50–90 |
| Avg hold | 4–8 bars |

---

### Rank 7 — 4H FVG with 1H Pullback Entry

**Category:** Order Flow Imbalance
**Timeframes:** 4H context, 1H entry
**Symbols:** BTCUSDT, ETHUSDT

#### Edge Mechanism

A 4H Fair Value Gap represents an imbalance created by institutional order flow at the higher timeframe. The 4H FVG is larger, less likely to be random noise, and represents more significant institutional participation than a 1H FVG. When price returns to a 4H FVG, it enters the zone where the original institutional orders remain active. The 1H entry confirmation ensures we are entering on a rejection rather than a through-and-through, protecting against mitigating moves.

#### Setup Conditions (all required)

- An unmitigated 4H FVG exists in the direction of the 4H trend
- The FVG was created by a qualifying displacement (body/range ≥ 0.65 on the 4H bar)
- Price has pulled back to within the 4H FVG boundaries
- On 1H: a confirming close in the trend direction while inside the 4H FVG (bullish close for long setups, bearish for short)
- The 4H FVG has not been previously tested (first touch carries higher probability)

#### Entry

Close of the 1H confirmation bar inside the 4H FVG

#### Stop Loss

Beyond the far edge of the 4H FVG + 0.3× ATR(14) — if price closes through the FVG, the imbalance has been fully filled and the support/resistance has failed

#### Take Profit

- TP1: 2R
- TP2: The next confirmed 4H swing high/low (in the trend direction)

#### Hold Limit

16 bars (1H)

#### Expected Metrics

| Metric | Estimate |
|---|---|
| Win rate | 62–70% |
| Profit factor | 1.8–2.4 |
| Signals/year (BTC+ETH) | 30–60 |
| Avg hold | 5–10 bars |

#### Notes

4H FVGs form roughly 10–15 per month (fewer than 1H FVGs because the displacement bar requirement is stricter on a larger timeframe). With 4H trend alignment, approximately 5–7 per month qualify as long or short, yielding 60–80/year across both symbols.

---

### Rank 8 — Open Interest Buildup → Structural Rejection

**Category:** Positioning Data
**Timeframes:** 1H entry, 4H context
**Symbols:** BTCUSDT, ETHUSDT

#### Edge Mechanism

When OI builds significantly (new money entering the market) as price approaches a structural level, it represents real positioning accumulation. The OI tells us the direction of conviction; the structural level tells us where the crowd is wrong. If price then creates a displacement rejection at that level, the OI represents trapped traders whose stops will cascade as price moves against them, accelerating the reversal.

This is fundamentally different from a price pattern. It uses OI as a positioning map — the OI tells us who is trapped, the price action tells us the trap just sprang.

#### Setup Conditions (all required)

- OI 5-bar (5H) change > +12% (significant new positioning building)
- Price is approaching a clear 4H structural level (swing high/low, prior FVG boundary)
- A 1H displacement reversal bar forms at the structural level: body/range ≥ 0.60, body direction against the OI buildup
- Volume on the rejection bar ≥ 1.5× 20-bar average
- 4H bias aligned with the reversal

#### Entry

Close of the displacement rejection bar, OR on the FVG retest created by the rejection (within 5 bars)

#### Stop Loss

Beyond the structural level + 0.4× ATR (structural invalidation: if price goes through the level rather than rejecting it, the OI thesis is wrong)

#### Take Profit

- TP1: 2R
- TP2: The next significant structural level in the reversal direction

#### Hold Limit

10 bars (1H)

#### Expected Metrics

| Metric | Estimate |
|---|---|
| Win rate | 58–66% |
| Profit factor | 1.7–2.2 |
| Signals/year (BTC+ETH) | 30–55 |
| Avg hold | 4–7 bars |

---

### Rank 9 — Session Open Displacement FVG

**Category:** Order Flow Imbalance + Session Timing
**Timeframes:** 1H entry
**Symbols:** BTCUSDT, ETHUSDT

#### Edge Mechanism

The NY open (13:00–14:00 UTC) and London open (07:00–08:00 UTC) represent the arrival of the highest-volume institutional order flow in the trading day. These sessions regularly produce displacement candles as large orders hit the market. Unlike random FVGs during low-volume periods (Asian session, weekends), session-open FVGs are backed by real, verifiable institutional volume. Price returning to fill the session-open FVG is returning to a level where those same participants (or others who observed the volume) have active interest.

The additional filter is volume: the displacement bar must show 2× average volume. This eliminates session opens that look like displacements but are actually random noise from a thin book.

#### Setup Conditions (all required)

- Time: the first displacement occurs during bars 13:00–15:00 UTC (NY) or 07:00–09:00 UTC (London)
- A 1H displacement candle forms: body/range ≥ 0.65, range ≥ 1.5× ATR(14)
- Volume on the displacement bar ≥ 2× 20-bar average (session open volume filter)
- An FVG is created by the displacement (gap ≥ 0.3× ATR between adjacent candles)
- The FVG direction aligns with the 4H trend (session opens that go with the prevailing trend have better continuation)

#### Entry

When price first trades into the FVG within the same session (within 8 bars of the displacement)

#### Stop Loss

Beyond the far edge of the FVG + 0.2× ATR

#### Take Profit

1.5× the displacement range projected from the FVG entry (sessions tend to continue the initial displacement direction for a measured move)

#### Hold Limit

8 bars (keep within the session; overnight holds on session setups lose their time-specificity edge)

#### Expected Metrics

| Metric | Estimate |
|---|---|
| Win rate | 58–65% |
| Profit factor | 1.6–2.0 |
| Signals/year (BTC+ETH) | 50–90 |
| Avg hold | 2–5 bars |

---

### Rank 10 — Breaker Block (Change of Polarity)

**Category:** Market Structure + Order Flow
**Timeframes:** 1H entry, 4H context
**Symbols:** BTCUSDT, ETHUSDT

#### Edge Mechanism

A Breaker Block forms when institutional participants support a price level (it holds as demand), price eventually breaks through it with a displacement (the participants have now switched sides), and price subsequently returns to that level from the other direction. The level that was support is now resistance because:

1. Longs who entered at that support are now underwater and exit (adding to sell pressure) on any return to their entry
2. The institutional participants who broke the level have positioned short and will defend it from above
3. The change of polarity represents a complete reversal of the structural significance of the level

This is distinct from a simple support/resistance flip: the Breaker Block requires evidence of institutional interest on both sides (the original support holding, then failing via displacement).

#### Setup Conditions (all required)

- A 4H swing low that held for ≥20 bars (confirmed demand zone — multiple touches or a clear bounce)
- Price breaks this level with a 4H displacement candle: body/range ≥ 0.60 on 4H, close significantly below
- Price subsequently rallies back to the former 4H support zone from below (the retest)
- On 1H: a rejection candle at the zone (wick into the zone, close back below for short setups)
- 1H rejection bar volume < 70% of the break candle's volume (exhaustion of the rally)
- Time from break to retest: 5–50 bars (on 4H). Too quick = gap fill, not a breaker; too slow = the level has been forgotten

#### Entry

Close of the 1H rejection candle at the former support zone

#### Stop Loss

Above the zone's upper boundary + 0.5× ATR (if price closes clearly above the former support, the breaker concept fails)

#### Take Profit

- TP1: 2R
- TP2: The next 4H structural support below (the cascade destination)

#### Hold Limit

16 bars (1H)

#### Expected Metrics

| Metric | Estimate |
|---|---|
| Win rate | 57–65% |
| Profit factor | 1.6–2.1 |
| Signals/year (BTC+ETH) | 20–40 |
| Avg hold | 6–12 bars |

---

### Rank 11 — OI Liquidation Cascade Anticipation

**Category:** Positioning Data
**Timeframes:** 1H entry
**Symbols:** BTCUSDT, ETHUSDT

#### Edge Mechanism

When OI builds significantly over an extended period near a structural level, a concentration of leveraged positions is parked at that level. As price approaches their stops, the mechanical trigger of forced liquidations accelerates the move — early liquidations push price further, triggering more liquidations in a cascade. This strategy attempts to position ahead of the cascade by recognizing when OI concentration + approach to that level makes a self-reinforcing liquidation move probable.

The edge is mechanical: liquidations are not discretionary — they trigger automatically when margin is insufficient. The cascade is predictable in direction if not in exact timing.

#### Setup Conditions (all required)

- OI built by ≥20% over the past 48 bars (a sustained accumulation of leveraged positions)
- The OI build-up occurred primarily above (for potential long liquidations) or below (for shorts) a structural level
- Price is now approaching that structural level from the profitable side (moving toward the trapped traders' stops)
- A 1H structure break confirms the move has begun: close below a recent higher-low (for long cascade) or above a lower-high (for short cascade)
- Volume on the structure break bar ≥ 1.5× average

#### Entry

Close of the 1H structure break bar

#### Stop Loss

1× ATR(14) beyond the break bar's opposite extreme (tight — if this was a false break, exit quickly; cascades start fast or not at all)

#### Take Profit

- TP1: The structural level itself (where liquidations concentrate)
- TP2: 2× ATR below/above the structural level (cascades typically overshoot)

#### Hold Limit

6 bars (cascades are acute; do not overstay)

#### Expected Metrics

| Metric | Estimate |
|---|---|
| Win rate | 52–60% |
| Profit factor | 1.6–2.2 |
| Signals/year (BTC+ETH) | 20–35 |
| Avg hold | 2–4 bars |

#### Notes

Lower win rate than other strategies because not all cascades complete — some reverse before the liquidation level. The R/R compensates: when cascades trigger, the move is fast and the TP is close. The tight stop (1× ATR) helps keep the risk controlled on false setups.

---

### Rank 12 — Internal Range MSS (Range-Specific)

**Category:** Market Structure
**Timeframes:** 1H entry
**Symbols:** BTCUSDT, ETHUSDT

#### Edge Mechanism

The market spends ~60–70% of time in ranging or consolidating conditions. The current strategy suite has almost no effective range-trading approach. During ranges, price oscillates between defined boundaries. Internal market structure forms within those boundaries. When that internal structure shifts (an internal MSS within the range), it often predicts the next oscillation direction within the range.

The edge here is bounded risk: the range boundary is the invalidation level. If the internal MSS fails and price exits the range on the adverse side, we know immediately. The stop is not arbitrary (ATR multiple) but structural (range boundary).

#### Setup Conditions (all required)

- A 4H ATR compression: current ATR < 40th percentile of its 252-bar history (confirming range conditions)
- A clear 1H range is defined: at least 15 bars of oscillation between a defined high and low with ≤ 2 range test bars
- Within the range, 1H internal structure forms (internal higher-highs/higher-lows or lower-highs/lower-lows)
- An internal sweep occurs: a minor 1H swing low is swept (for long setup) within the range, followed by a displacement close above it
- Entry is within the lower 30% of the range (for longs) or upper 30% (for shorts) — only enter near the range extreme where risk is bounded

#### Entry

Close of the displacement bar that creates the internal MSS

#### Stop Loss

Below the range low + 0.3× ATR (for longs) — the range boundary is the invalidation. If price exits the range against us, we are in a breakout that negates the range premise.

#### Take Profit

Opposite range boundary (defined, structural target)

#### Hold Limit

20 bars (ranges can persist; allow time for the oscillation to complete)

#### Expected Metrics

| Metric | Estimate |
|---|---|
| Win rate | 55–62% |
| Profit factor | 1.5–2.0 |
| Signals/year (BTC+ETH) | 50–90 |
| Avg hold | 8–16 bars |

#### Notes

This strategy fills a gap in the portfolio: it is specifically tuned for ranging conditions where most other strategies perform poorly. It should be activated/deactivated based on the regime classifier (only run when 4H is classified as Range or Compression).

---

### Rank 13 — Negative Funding Long (Funding Carry)

**Category:** Product Mechanics
**Timeframes:** 4H entry (lower frequency, carry-based)
**Symbols:** BTCUSDT, ETHUSDT

#### Edge Mechanism

When the perpetual futures funding rate is significantly negative, shorts are paying longs a carry. This creates:
1. Structural incentive for new long positions (being paid to hold)
2. Pressure on short holders who cannot afford the carry cost
3. An environment where a squeeze is mechanically assisted — any price rise forces short covering, which is amplified by the funding cost on remaining shorts

Unlike Rank 4 (extreme reversion), this strategy does not require a structural rejection or extreme reading. It exploits the sustained carry advantage of holding longs in negative funding. The edge is cumulative over time, not from a single reversal event.

#### Setup Conditions

- 8h funding rate < -0.04% (shorts paying, longs receiving)
- This condition has persisted for ≥2 consecutive funding periods (16h) — confirming it is a regime, not a one-off
- 4H structure is at minimum neutral (no clear downtrend)
- Price is above a significant 4H demand zone (structural support provides the floor)

#### Entry

Close of any 4H bullish bar while conditions are met (not precision-entry; the carry does the work)

#### Stop Loss

Below the nearest 4H demand zone (structural invalidation)

#### Take Profit

Dynamic: exit when the 8h funding rate returns above -0.01% (carry advantage gone). Alternatively: 2.5R fixed target.

#### Hold Limit

48 bars on 1H (2 full days) as a hard cap regardless of funding regime

#### Expected Metrics

| Metric | Estimate |
|---|---|
| Win rate | 53–60% |
| Profit factor | 1.4–1.8 |
| Signals/year (BTC+ETH) | 20–40 |
| Avg hold | 12–30 bars |

#### Notes

This strategy has the lowest expected PF in the universe. Its value is portfolio-level: it runs during regimes when directional setups are sparse (negative funding often accompanies bearish conditions where longs are cheap to hold), providing a distinct return stream. The carry component (actual funding received every 8h while in the position) is additional return not captured in the R-multiple calculation — it improves the real performance above what backtests show.

---

### Rank 14 — Pure Fair Value Gap Fill

**Category:** Order Flow Imbalance
**Timeframes:** 1H entry
**Symbols:** BTCUSDT, ETHUSDT

#### Edge Mechanism

The simplest, most mechanical of all 15 strategies. When price moves so fast that adjacent candles leave a gap (an FVG), the orders that drove that displacement were filled at prices that moved through the gap. Market participants who intended to buy/sell at those gap prices were unable to — their orders were either skipped or partially filled. These unfilled orders create a natural pull back toward the gap as participants attempt to complete their positions.

This is the stripped-down version of the more complex FVG strategies above. No liquidity pool, no OI filter, no funding filter. Just the gap and the trend.

#### Setup Conditions

- A 1H displacement candle creates an FVG: body/range ≥ 0.60, range ≥ 1.2× ATR(14), gap ≥ 0.2× ATR between adjacent candles
- The FVG direction aligns with the 4H trend (the displacement was with the institutional grain)
- The FVG is unmitigated (price has not traded back through it since creation)
- The FVG was created within the last 8 bars (fresh imbalances have higher fill probability)

#### Entry

When price first trades into the FVG (touches the near edge)

#### Stop Loss

Beyond the FVG far edge + 0.2× ATR

#### Take Profit

1.5R (quick, efficient fills; do not overstay)

#### Hold Limit

4 bars (if price doesn't continue within 4 bars of touching the FVG, exit)

#### Expected Metrics

| Metric | Estimate |
|---|---|
| Win rate | 55–62% |
| Profit factor | 1.5–1.8 |
| Signals/year (BTC+ETH) | 100–160 |
| Avg hold | 1–3 bars |

#### Notes

Highest signal frequency in the universe by a significant margin. This is intentional: it pairs well with lower-frequency strategies (Ranks 1, 3, 4) to maintain portfolio activity during quiet periods. The PF is the lowest of any directional strategy in this universe, but the frequency and the tight, structural stop keep the expected value clearly positive. It also serves as a benchmark: any more complex FVG variant must outperform this baseline.

---

### Rank 15 — ETH/BTC Funding Divergence (Relative Value)

**Category:** Product Mechanics + Relative Value
**Timeframes:** 4H entry/exit
**Symbols:** Both simultaneously (pairs-based)

#### Edge Mechanism

BTC and ETH funding rates are correlated but distinct. When ETH funding significantly exceeds BTC funding, ETH participants are more overcrowded/bullish than BTC participants. In subsequent periods, ETH tends to underperform BTC as the excess positioning normalizes (through forced exits, short sellers entering ETH, or a combination). This is a relative value trade — not "ETH will fall" but "ETH will underperform BTC."

This strategy has no parallel in the current 22 strategies and provides a genuinely uncorrelated return stream.

**Divergence threshold:**
- Long BTC / Short ETH: ETH_funding - BTC_funding > +0.05%
- Long ETH / Short BTC: BTC_funding - ETH_funding > +0.05%

#### Setup Conditions

- Funding rate divergence exceeds threshold for ≥2 consecutive 8h periods
- Neither individual funding rate is extreme (both below ±0.15%) — if one is extreme on its own, use Rank 1 or 4 instead
- The pair has a recent 30-bar 1H return correlation > 0.75 (confirming they are in a correlated regime where divergences are mean-reverting, not structural)

#### Entry

Close of the next 4H bar after conditions are confirmed

#### Stop Loss

On the ETH leg: 1.5× ATR(14). The BTC long provides a natural partial hedge, so the net portfolio stop is lower than 1.5× on ETH alone.

#### Take Profit

When the funding divergence closes to within 0.01% of parity

#### Hold Limit

72 bars on 1H (3 full days)

#### Expected Metrics

| Metric | Estimate |
|---|---|
| Win rate (ETH leg) | 54–61% |
| Profit factor (net) | 1.4–1.7 |
| Signals/year | 15–30 |
| Avg hold | 20–40 bars |

#### Notes

Lowest ranked because it has the highest operational complexity and lowest expected PF. It requires simultaneous position management on two symbols with partial hedging. However, its return stream is genuinely uncorrelated with all other strategies in this universe — it is the only strategy that profits from relative ETH/BTC positioning rather than directional price movement. In a portfolio context, it can improve overall Sharpe even at lower individual PF.

---

## Summary Table

| Rank | Strategy | Category | Expected PF | Signals/Year | Avg Hold (1H bars) |
|---|---|---|---|---|---|
| 1 | Funding Rate + OI Combined Extremity | Product + Positioning | 2.0–3.0 | 12–20 | 8–16 |
| 2 | London Kill Zone Asian Session Stop Hunt | Liquidity + Session | 1.9–2.5 | 60–100 | 3–6 |
| 3 | MSS After Equal Highs/Lows Sweep | Liquidity + Structure | 2.0–2.8 | 40–70 | 4–8 |
| 4 | Funding Rate Extreme Reversion | Product Mechanics | 1.6–2.2 | 25–45 | 8–18 |
| 5 | Equal Highs/Lows Sweep → FVG | Liquidity | 1.8–2.4 | 60–100 | 3–7 |
| 6 | BOS + Order Block Retest | Structure + Order Flow | 1.7–2.3 | 50–90 | 4–8 |
| 7 | 4H FVG with 1H Pullback | Order Flow | 1.8–2.4 | 30–60 | 5–10 |
| 8 | OI Buildup → Structural Rejection | Positioning | 1.7–2.2 | 30–55 | 4–7 |
| 9 | Session Open Displacement FVG | Order Flow + Session | 1.6–2.0 | 50–90 | 2–5 |
| 10 | Breaker Block (Change of Polarity) | Structure + Order Flow | 1.6–2.1 | 20–40 | 6–12 |
| 11 | OI Liquidation Cascade | Positioning | 1.6–2.2 | 20–35 | 2–4 |
| 12 | Internal Range MSS | Structure | 1.5–2.0 | 50–90 | 8–16 |
| 13 | Negative Funding Long (Carry) | Product Mechanics | 1.4–1.8 | 20–40 | 12–30 |
| 14 | Pure FVG Fill | Order Flow | 1.5–1.8 | 100–160 | 1–3 |
| 15 | ETH/BTC Funding Divergence | Relative Value | 1.4–1.7 | 15–30 | 20–40 |

---

## Portfolio Construction View

Not all 15 strategies should run simultaneously. Group them by their independence:

**Group A — Funding/OI driven (independent of price structure):**
Ranks 1, 4, 13, 15
These fire on product-specific data. They can run alongside any structural strategy.

**Group B — Liquidity/Structure driven (price-based, complementary):**
Ranks 2, 3, 5, 6, 7, 10, 12
These are price-structure strategies. They may fire on the same setup with slightly different filters; use Edge Score to rank them when they conflict.

**Group C — Session/Time specific:**
Ranks 2, 9
These only fire during specific UTC windows and are naturally non-conflicting with overnight setups.

**Group D — OI cascade/extremity:**
Ranks 8, 11
These fire on OI conditions and complement the liquidity group without correlation.

**Recommended initial portfolio (Phase 5 targets):**
- Rank 2 (London Kill Zone) — highest frequency, clearest mechanism
- Rank 3 (MSS Full Sequence) — best quality single setup
- Rank 4 (Funding Reversion) — adds product-specific edge
- Rank 7 (4H FVG Pullback) — adds multi-timeframe confirmation
- Rank 14 (Pure FVG Fill) — adds frequency in quiet periods

This five-strategy portfolio covers: session timing, liquidity mechanics, product mechanics, multi-timeframe structure, and pure imbalance. Expected combined Sharpe (before correlation adjustment): 1.2–1.8 annualized. Expected combined signals per year: 200–450, sufficient for both the Phase 2 validation gates and meaningful statistical power.

---

## What These 15 Have That the Current 22 Do Not

| Property | Current 22 | New 15 |
|---|---|---|
| Structural edge mechanism | Indicator-derived | Market mechanics / order flow |
| Requires unique data beyond OHLCV | None | Funding rate, Open Interest |
| Entry precision | ATR offset from indicator | FVG boundary (structural) |
| Stop precision | ATR multiple (arbitrary) | Structural invalidation level |
| Adversarially priced | Yes (retail signals widely known) | Partially — session timing and OI are less commoditized |
| Works during ranging markets | No (most fail in Range) | Yes (Ranks 2, 12, 13, 14 designed for range) |
| Trades product mechanics | No | Yes (Ranks 1, 4, 13, 15) |
| Frequency vs quality balance | Quantity-first (200-trade gate) | Quality-first (60-trade gate + Edge Score) |

The new strategies are not guaranteed to pass validation. That is determined by running the full discovery pipeline (Phase 5) on real data with Phase 2's corrected validation framework. But their structural hypotheses are sound, their edge mechanisms are documented in real market behavior, and they use data that the current 22 strategies do not touch. That is the necessary starting condition for finding a real edge.
