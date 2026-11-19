# Token Radar — Model Note (radar-2)

Entry for **token-radar-01** (best token launch radar). The model lives in
`entry/lib/model.ts` (`MODEL_VERSION = 'radar-2'`); it is a fresh implementation that keeps the
starter's exported interface (same types, same function names) so `main.ts` and the dashboard keep
working. Nothing in it is copied from the starter; the formula, the calibration and the farm plans
are all new.

## The formula

```
implied = TVL × categoryMultiple × growthFactor × maturityFactor × breadthFactor
```

Every factor is derived at run time from the snapshot being scored — `buildModelContext()` computes
them from that snapshot's own live protocols and rankable population. No protocol name is ever
special-cased; the same function scores every row.

- **categoryMultiple** — the live market's own mcap/TVL for the protocol's category. From the 119
  live protocols (market cap > 0 and TVL > 0, not a CEX): per-category median mcap/TVL, shrunk
  toward the global median in **log space** with a prior weight of 4 —
  `exp((n·ln(catMed) + 4·ln(global)) / (n + 4))` — then clamped to [0.03, 1.25]. Log-space shrinkage
  is what keeps one live outlier (a 400× prediction market, a 12× collateral manager) from dragging
  its whole category to the clamp. A category with no live protocol, or a null category, gets the
  global median. On this snapshot the global median is **0.246** and 11 of the 34 board categories
  fall back to it.
- **growthFactor** — 7d TVL growth **centred on the market**: the snapshot's median 7d growth across
  rankable pre-token protocols (−5.61%) is subtracted first, so a protocol is scored on how it moved
  against its own market, not on a market-wide drawdown (79% of pre-token growth is negative). The
  relative move is clamped to [−40, +80] and the factor is
  `1 + 0.004·max(rel, 0) + 0.007·min(rel, 0)` — downside is penalised ~1.75× as hard as upside is
  rewarded, because fast TVL flight is mercenary capital leaving. Range [0.72, 1.32] on this board.
  A null `change_7d` (2 board rows) takes its category's median pre-token growth, else the
  population median.
- **maturityFactor** — a saturating curve on age, `0.55 + 0.45·(1 − exp(−age/540))`, divided by the
  same curve at the snapshot's median rankable age (483.5 days), so the median-age protocol scores
  exactly 1.0. A protocol listed yesterday scores ~0.68, a five-year-old ~1.21. A null `listed_at`
  (11 board rows) takes the median rankable age and therefore scores 1.0.
- **breadthFactor** — `1 + 0.02·min(chains − 1, 10)`, range [1.00, 1.20]. Deliberately small: bridges
  already carry high category multiples partly for being multi-chain, so a bigger premium would
  double-count it.

The value is a **market-cap-style estimate**: it is calibrated on live protocols' circulating market
cap over TVL, so it is *not* a fully-diluted-value estimate and it understates FDV for low-float
tokenomics. That is the honest reading of the calibration set.

## How each factor was derived from the snapshot (2026-11-14, 758 protocols)

- Live calibration set: 144 protocols carry a market cap; 119 have mcap > 0 and TVL > 0 and are not
  a CEX. **15 protocols report mcap exactly $0** (dead/rounded tokens, incl. Multichain and
  Orbit Bridge) and are excluded from the calibration — a $0 market cap is not a market valuation,
  and including them would drag the global median from 0.246 to 0.186 and Bridge's multiple from
  0.40 to 0.11 on the strength of two dead bridges. Sensitivity is stated, not hidden.
- Growth: pre-token median −6.82%, rankable median −5.61%, p1 −29%, p99 +161%, max +4448% — hence
  the [−50, +100] raw clamp and the market-centring.
- Age: rankable median 483.5 days, p25 201, p75 740, max 1851 — hence the 540-day time constant
  and the median normalisation.
- Chains: 65% of rankable protocols run on one chain; max 176 (Gate, a CEX, excluded from the
  board) — hence the cap at 10 extra chains.
- The coefficients (0.004/0.007, 0.55/0.45, 0.02) were reviewed by Gemini 4 Hydrogen before
  finalising; the review's three fixes were adopted: log-space shrinkage (was linear), market-centred
  growth (was centred on 0%), and median-normalised maturity (was an unanchored 0.55–0.98 haircut
  that biased every row ~20% down). The review also flagged the mcap-vs-FDV mismatch, which is why
  the value is labelled market-cap-style above.

## Category multiples (applied values on this snapshot)

| Category | n live | Median mcap/TVL | Applied multiple |
|---|---:|---:|---:|
| Prediction Market | 1 | 400.204 | 1.079 |
| Token Locker | 2 | 9.520 | 0.832 |
| Cross Chain Bridge | 4 | 1.220 | 0.548 |
| Collateral Management | 1 | 12.160 | 0.537 |
| Canonical Bridge | 8 | 0.746 | 0.516 |
| Derivatives | 2 | 2.162 | 0.508 |
| Basis Trading | 8 | 0.482 | 0.458 |
| Privacy | 3 | 0.969 | 0.443 |
| Chain | 1 | 3.026 | 0.406 |
| Risk Curators | 1 | 2.975 | 0.405 |
| Bridge | 6 | 0.557 | 0.402 |
| Decentralized AI | 1 | 2.060 | 0.376 |
| NFT Marketplace | 1 | 2.002 | 0.374 |
| Options | 1 | 1.515 | 0.354 |
| AI Agents | 2 | 0.605 | 0.332 |
| Dexs | 11 | 0.342 | 0.314 |
| RWA | 9 | 0.275 | 0.266 |
| Leveraged Farming | 1 | 0.172 | 0.229 |
| Liquid Restaking | 2 | 0.183 | 0.223 |
| Payments | 2 | 0.181 | 0.222 |
| Launchpad | 1 | 0.131 | 0.217 |
| CDP | 3 | 0.169 | 0.209 |
| Yield | 13 | 0.121 | 0.207 |
| DOR | 1 | 0.090 | 0.201 |
| Indexes | 3 | 0.148 | 0.198 |
| Yield Aggregator | 5 | 0.050 | 0.193 |
| Dual-Token Stablecoin | 2 | 0.016 | 0.163 |
| Lending | 15 | 0.132 | 0.151 |
| Liquidity Manager | 1 | 0.015 | 0.141 |
| Restaking | 2 | 0.025 | 0.114 |
| Onchain Capital Allocator | 3 | 0.006 | 0.091 |
| Liquid Staking | 11 | 0.034 | 0.071 |
| Staking Pool | 2 | 0.002 | 0.067 |
| **Global fallback** | **119** | **0.246** | **0.246** |

Fallback categories on this board (11): Anchor BTC, CeDeFi, Collateral Markets, Crypto Card
Issuer, Decentralized BTC, Farm, Governance Incentives, Insurance, Interest Rate Derivatives,
Stablecoin Wrapper, Uncollateralized Lending.

## Board size: 226 rows

40 watchlist + **all 186** rankable pre-token protocols below the $50M floor. `EARLY_ROWS` is set
to 186, which is the whole below-floor population (289 rankable − 40 watchlist − 63 rankable at or
above the floor that are neither watched nor early), so the cap binds nothing and no rankable
protocol is left out. The starter carried only the top 160 early rows by TVL and dropped 26; this
board drops none. 226 is well inside the gate's 100–4000.

## Farm plans

7 steps per protocol, all derived from the protocol's own record:

1. **Setup** — a fresh wallet holding only farm funds (hardware wallet named for $250-tier capital).
2. **Core action** — category-specific, two variants per category family (13 families cover all 37
   rankable categories), picked deterministically by a slug hash, so all 226 step-2 texts are
   distinct. Lending supplies/borrows, DEXes LP/swap, staking mints receipt tokens, bridges bridge,
   RWA mints Treasury assets, perps hedge, curators allocate to vaults, prediction markets take
   positions, CDPs mint stables, insurance buys cover.
3. **Second action** — repeats the position on the protocol's second chain when it has one (83 of
   226 board rows are multi-chain), otherwise a complementary move in the category's own verbs.
4. **Weekly action** — a category-specific qualifying action, every week.
5. **Hold** — 60 days if listed < 180 days, 45 days if < 365, else 30 days.
6. **Claim safety** — check the protocol's *own* points/rewards page, claim only from the link it
   publishes, never pay to claim, never follow a claim link from a reply or DM.
7. **Record-keeping** — wallet, dates, transaction hashes in a farm log.

Capital tiers follow the protocol's TVL ($250 ≥ $5B, $150 ≥ $1B, $100 ≥ $100M, else $50); every
step states a concrete $ cost and a time. No step promises a token or an airdrop. All 226 × 7 steps
are 137–269 characters (gate: 20–600).

## How it beats the starter (radar-1)

- **Flat 0.25 for everything → 33 live-derived category multiples.** The starter valued a liquid
  staking protocol and a bridge identically; the market does not (0.071 vs 0.402). The starter's
  flat multiple also overvalued the average protocol: the live median is 0.246, and liquid staking
  / capital allocators trade far below it.
- **Growth centred on 0% → centred on the market median**, with asymmetric downside. The starter
  penalised every protocol in a market-wide drawdown; radar-2 scores relative outperformance.
- **Linear maturity 0.6–1.0 → saturating, median-normalised curve.** The starter's floor
  discounted every young protocol the same way and never let an old one exceed 1.0; radar-2's curve
  rises steeply early (where survival is informative) and saturates.
- **No breadth term → capped multi-chain premium.**
- **200 rows → 226 rows: every rankable early protocol**, not just the top 160 by TVL.
- **6 generic templated steps → 7 category-specific steps**, 226 distinct core actions, with
  second-chain, hold-by-age and claim-safety steps the starter lacked.
- Every factor's derivation is reproducible from the snapshot: delete the snapshot and the model
  re-derives its multiples, medians and normaliser from whatever snapshot replaces it.

## Top 5 rows (this snapshot)

| Rank | Protocol | Implied value | TVL | 7d | Age | Multiple |
|---:|---|---:|---:|---:|---:|---:|
| 1 | steakhouse-financial | $1,390M | $2,754M | −2.2% | 543d | 0.405 |
| 2 | gauntlet | $820M | $1,578M | +5.6% | 543d | 0.405 |
| 3 | usdd | $243M | $1,056M | −2.8% | 611d | 0.209 |
| 4 | veda | $177M | $1,563M | −8.3% | 632d | 0.091 |
| 5 | nonce-capital | $148M | $514M | −9.7% | 45d | 0.405 |

Implied-value distribution across the board: min $397K, median $4.2M, max $1.39B; no two rows
share the top value.

## Open items / notes for the dashboard owner

- `starter/dashboard/app.js` lines 32–36 and 290 recompute the *starter* formula from
  `model.base_multiple / growth_weight / maturity_*` and print it as the model. Those lines need
  updating to the radar-2 formula (category multiple per row is already in
  `row.model.base_multiple`, plus `growth_relative_pct` and `breadth_multiplier`), or the sandbox
  display will disagree with the board. The `ModelConstants` field names were kept so nothing
  crashes; only the formula text and the recompute are stale.
- `MODEL.base_multiple` (0.246) is the global fallback, not a flat multiple — the dashboard
  should not present it as "the" multiple any more.
