// The token radar's model, radar-2: one snapshot of the protocol universe in, one ranked board out.
//
// The board covers every slug in the snapshot's watchlist (the floor, never a ceiling) and adds every
// remaining rankable pre-token protocol below the watchlist floor: the early rows the radar exists to
// find. A protocol is pre-token when its index entry records no token (no market cap, no CoinGecko id,
// no symbol); the snapshot's live-token protocols are kept apart and shown as the market's own values,
// never mixed into the ranked board.
//
// Implied value follows only from the snapshot's own figures, and every factor is derived from the
// snapshot at run time — no protocol name is ever special-cased and no multiple is a house guess:
//
//   category multiple = the live market's own mcap/TVL for the protocol's category. The model takes
//     the live protocols (market cap and TVL both present, not a CEX), computes the median mcap/TVL
//     per category and the global median, then shrinks each category median toward the global median
//     in log space with a prior weight of 4:  exp((n*ln(catMed) + 4*ln(global)) / (n + 4)), clamped
//     to [0.03, 1.25]. A category with no live protocol, or a null category, gets the global median.
//     Log-space shrinkage is what keeps one live outlier (a 400x mcap/TVL prediction market, a 12x
//     collateral manager) from dragging its whole category to the clamp.
//   growth   = change_7d, centred on the market: the snapshot's median 7d growth across rankable
//     pre-token protocols is subtracted first, so a protocol is scored on how it moved against its
//     own market, not on a market-wide drawdown. The relative move is clamped to [-40, +80] and the
//     factor is 1 + 0.004*max(rel, 0) + 0.007*min(rel, 0): downside is penalised about 1.75x as
//     hard as upside is rewarded, because fast TVL flight is mercenary capital leaving. A null
//     change_7d takes its category's median pre-token growth, else the global median.
//   maturity = a saturating curve on age, 0.55 + 0.45*(1 - exp(-age/540)), divided by the same
//     curve evaluated at the snapshot's median rankable age, so the median-age protocol scores 1.0.
//     A protocol listed yesterday scores about 0.67, a five-year-old about 1.20. A null listed_at
//     takes the median rankable age (484 days on this snapshot).
//   breadth  = 1 + 0.02*min(chains - 1, 10): a small premium for running on more chains, capped at
//     1.20, kept deliberately small because bridges already carry high category multiples partly
//     for being multi-chain.
//
//   implied = max(1, round(tvl_usd x categoryMultiple x growthMult x maturityMult x breadthMult))
//
// The value is a market-cap-style estimate: it is calibrated on live protocols' circulating market
// cap over TVL, so it is not a fully-diluted-value estimate and it understates FDV for low-float
// tokenomics. That is the honest reading of the calibration set.

/** The snapshot's protocol entry: exactly the ten fields the sealed input carries. */
export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

/** The whole snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/**
 * The model's constants, as the dashboard states them and the sandbox may change them. The
 * `base_multiple` is the global fallback multiple (the live market's median mcap/TVL); each row's
 * own category multiple is what the model actually applies and is recorded per row. `growth_weight`
 * is kept as the upside growth weight for the dashboard's formula display; the downside weight is
 * `growth_down_weight`. `maturity_days` is the exponential time constant (tau) of the saturating
 * maturity curve, not a linear horizon. `unknown_age_days` is the fallback age when a snapshot
 * carries no context: the median rankable age.
 */
export interface ModelConstants {
  base_multiple: number;
  growth_weight: number;
  growth_down_weight: number;
  growth_floor: number;
  growth_cap: number;
  growth_rel_floor: number;
  growth_rel_cap: number;
  maturity_floor: number;
  maturity_range: number;
  maturity_days: number;
  unknown_age_days: number;
  category_floor: number;
  category_cap: number;
  shrink_prior: number;
  breadth_per_chain: number;
  breadth_max_chains: number;
}

export const MODEL: ModelConstants = {
  base_multiple: 0.246,
  growth_weight: 0.004,
  growth_down_weight: 0.007,
  growth_floor: -50,
  growth_cap: 100,
  growth_rel_floor: -40,
  growth_rel_cap: 80,
  maturity_floor: 0.55,
  maturity_range: 0.45,
  maturity_days: 540,
  unknown_age_days: 484,
  category_floor: 0.03,
  category_cap: 1.25,
  shrink_prior: 4,
  breadth_per_chain: 0.02,
  breadth_max_chains: 10,
};

/** The model's version label: the dashboard names it and the rules quote it. */
export const MODEL_VERSION = 'radar-2';

/**
 * How many pre-token protocols below the watchlist floor the early radar carries, by TVL. 186 is the
 * whole population below the floor on this snapshot (289 rankable minus 40 on the watchlist, minus
 * 63 rankable protocols at or above the floor that are neither watched nor early), so the cap binds
 * nothing and the board carries every early protocol the snapshot holds: 40 watchlist + 186 early.
 */
export const EARLY_ROWS = 186;

/** How many live-token protocols the Live token view carries, by market cap. */
export const LIVE_ROWS = 24;

/** A farm step: the action, what it costs, and how long it takes. */
export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

/** One row of board.json: the ranked board's row. */
export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: 'pre-token';
  age_days: number | null;
  implied_value_usd: number;
  model: {
    base_multiple: number;
    growth_pct: number;
    growth_relative_pct: number;
    growth_multiplier: number;
    maturity_multiplier: number;
    breadth_multiplier: number;
    age_days: number | null;
  };
  farm_steps: string[];
}

/** The dashboard's compact view of one row: its own full-precision radar-2 factors and its real farm steps. */
export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  age_days: number | null;
  implied_value_usd: number;
  base_multiple: number;
  growth_multiplier: number;
  maturity_multiplier: number;
  breadth_multiplier: number;
  farm_steps: string[];
}

/** A live-token protocol: it already trades, so the board shows the market's own value, not a model's. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
}

/** Everything the dashboard needs: the board, the live set, and the model it runs. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelConstants;
  model_version: string;
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  rows: RadarRow[];
  live: LiveRow[];
}

/** Why the snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;

/** A finite number, else `fallback`. */
function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** Clamp `value` into [`lo`, `hi`]. */
function clamp(value: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, value));
}

/** The median of a non-empty list; null when it is empty. */
function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/** A whole day count from `from` to `to`, clamped at zero; null when either date is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/**
 * Everything the model derives from one snapshot before it scores a single protocol: the live
 * market's category multiples, the global multiple, the median 7d growth and median age of the
 * rankable pre-token population, and the maturity curve's normaliser at that median age.
 */
export interface ModelContext {
  categoryMultiples: Map<string, number>;
  categoryGrowth: Map<string, number>;
  globalMultiple: number;
  medianGrowth: number;
  medianAge: number;
  maturityNorm: number;
}

/** The raw saturating maturity curve at `age` days, before normalisation. */
function rawMaturity(age: number, model: ModelConstants): number {
  return model.maturity_floor + model.maturity_range * (1 - Math.exp(-Math.max(age, 0) / model.maturity_days));
}

/** The snapshot's own market context: derived, never a house guess, recomputed for each snapshot. */
export function buildModelContext(snapshot: Snapshot, model: ModelConstants = MODEL): ModelContext {
  // The live market: protocols that already trade, with a market cap and a TVL, not an exchange.
  const live = snapshot.protocols.filter(
    (p) => p.mcap_usd !== null && p.mcap_usd > 0 && p.tvl_usd > 0 && p.category !== 'CEX',
  );
  const globalMultiple = median(live.map((p) => p.mcap_usd! / p.tvl_usd)) ?? model.base_multiple;

  // Per-category median mcap/TVL, shrunk toward the global median in log space so a single live
  // outlier cannot drag its category to the clamp, then clamped to the model's floor and cap.
  const ratiosByCategory = new Map<string, number[]>();
  for (const p of live) {
    const key = p.category ?? '';
    const list = ratiosByCategory.get(key);
    if (list === undefined) ratiosByCategory.set(key, [p.mcap_usd! / p.tvl_usd]);
    else list.push(p.mcap_usd! / p.tvl_usd);
  }
  const categoryMultiples = new Map<string, number>();
  for (const [category, ratios] of ratiosByCategory) {
    const catMed = median(ratios) ?? globalMultiple;
    const shrunk = Math.exp(
      (ratios.length * Math.log(Math.max(catMed, 0.005)) + model.shrink_prior * Math.log(Math.max(globalMultiple, 0.005))) /
        (ratios.length + model.shrink_prior),
    );
    categoryMultiples.set(category, clamp(shrunk, model.category_floor, model.category_cap));
  }

  // The rankable population the model actually scores: its median growth and median age centre the
  // growth and maturity factors, so the typical protocol scores 1.0 on both.
  const rankable = snapshot.protocols.filter((p) => isRankable(p));
  const growthByCategory = new Map<string, number[]>();
  for (const p of rankable) {
    if (p.change_7d === null) continue;
    const key = p.category ?? '';
    const list = growthByCategory.get(key);
    if (list === undefined) growthByCategory.set(key, [p.change_7d]);
    else list.push(p.change_7d);
  }
  const categoryGrowth = new Map<string, number>();
  for (const [category, values] of growthByCategory) {
    const med = median(values);
    if (med !== null) categoryGrowth.set(category, med);
  }
  const medianGrowth = median(rankable.map((p) => p.change_7d).filter((g): g is number => g !== null)) ?? 0;
  const medianAge =
    median(
      rankable
        .map((p) => ageDays(snapshot.as_of, p.listed_at))
        .filter((a): a is number => a !== null),
    ) ?? model.unknown_age_days;
  return {
    categoryMultiples,
    categoryGrowth,
    globalMultiple,
    medianGrowth,
    medianAge,
    maturityNorm: rawMaturity(medianAge, model),
  };
}

/** The context a bare `impliedValue` call falls back to: the model's own constants, uncentred. */
function defaultContext(model: ModelConstants): ModelContext {
  return {
    categoryMultiples: new Map(),
    categoryGrowth: new Map(),
    globalMultiple: model.base_multiple,
    medianGrowth: 0,
    medianAge: model.unknown_age_days,
    maturityNorm: rawMaturity(model.unknown_age_days, model),
  };
}

/** The five multipliers and the implied value one protocol gets under `model` and `context`. */
export function impliedValue(
  protocol: SnapshotProtocol,
  asOf: string,
  model: ModelConstants,
  context: ModelContext | null = null,
): {
  implied: number;
  categoryMult: number;
  growthPct: number;
  growthRel: number;
  growthMult: number;
  maturityMult: number;
  breadthMult: number;
  age: number | null;
} {
  const ctx = context ?? defaultContext(model);
  const age = ageDays(asOf, protocol.listed_at);
  const category = protocol.category ?? '';

  // The market's own multiple for this category, or the global median when the category has no
  // live protocol (11 of the 34 categories on this board).
  const categoryMult = ctx.categoryMultiples.get(category) ?? ctx.globalMultiple;

  // Growth against the market, not against zero: a null change_7d takes its category's median
  // pre-token growth, else the population median.
  const rawGrowth = protocol.change_7d ?? ctx.categoryGrowth.get(category) ?? ctx.medianGrowth;
  const growthPct = clamp(finite(rawGrowth, 0), model.growth_floor, model.growth_cap);
  const growthRel = clamp(growthPct - ctx.medianGrowth, model.growth_rel_floor, model.growth_rel_cap);
  const growthMult = 1 + model.growth_weight * Math.max(growthRel, 0) + model.growth_down_weight * Math.min(growthRel, 0);

  // Maturity, saturating and normalised so the median-age protocol scores exactly 1.0. A null
  // listed_at takes the population's median age.
  const ageForModel = age ?? ctx.medianAge;
  const maturityMult = rawMaturity(ageForModel, model) / ctx.maturityNorm;

  // Breadth: a small premium per extra chain, capped; bridges already carry high category
  // multiples partly for being multi-chain, so this stays deliberately small.
  const breadthMult =
    1 + model.breadth_per_chain * Math.min(Math.max(protocol.chains.length - 1, 0), model.breadth_max_chains);

  const implied = Math.max(1, Math.round(protocol.tvl_usd * categoryMult * growthMult * maturityMult * breadthMult));
  return { implied, categoryMult, growthPct, growthRel, growthMult, maturityMult, breadthMult, age };
}

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

/** Whether a protocol records no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/** Whether a protocol is one the board may rank: pre-token, not an exchange, not a versioned pool. */
export function isRankable(p: SnapshotProtocol): boolean {
  return isPreToken(p) && p.category !== 'CEX' && !VERSIONED.test(p.name);
}

/** The snapshot's protocol by slug. */
function bySlug(protocols: SnapshotProtocol[]): Map<string, SnapshotProtocol> {
  return new Map(protocols.map((p) => [p.slug, p]));
}

/** The headline sentence's figures: how many watchlist slugs, how many rows, how many live protocols. */
export interface BoardSummary {
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
}

/** The protocols the board ranks, strongest first, with ranks 1..n. */
export function buildBoard(snapshot: Snapshot, model: ModelConstants = MODEL): BoardRow[] {
  const context = buildModelContext(snapshot, model);
  const index = bySlug(snapshot.protocols);
  const chosen = new Map<string, SnapshotProtocol>();
  // The watchlist is the floor: every slug, even one the snapshot no longer carries (it cannot, but the
  // board's coverage is the gate's row and is never gambled on a missing record).
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  // The early radar: pre-token protocols below the watchlist floor, by TVL, capped. Never a replacement
  // for a watchlist row: a chosen protocol stays chosen. The cap equals the whole population below the
  // floor on this snapshot, so nothing rankable is left out.
  const early = snapshot.protocols
    .filter((p) => !chosen.has(p.slug) && isRankable(p) && p.tvl_usd < snapshot.floor_usd)
    .sort((a, b) => b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0))
    .slice(0, EARLY_ROWS);
  for (const p of early) chosen.set(p.slug, p);

  const scored = [...chosen.values()].map((p) => {
    const v = impliedValue(p, snapshot.as_of, model, context);
    return { p, ...v };
  });
  scored.sort((a, b) => b.implied - a.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  return scored.map((s, i) => ({
    rank: i + 1,
    slug: s.p.slug,
    name: s.p.name,
    category: s.p.category,
    chains: s.p.chains,
    tvl_usd: s.p.tvl_usd,
    change_7d: s.p.change_7d,
    mcap_usd: s.p.mcap_usd,
    listed_at: s.p.listed_at,
    gecko_id: s.p.gecko_id,
    symbol: s.p.symbol,
    token_status: 'pre-token',
    age_days: s.age,
    implied_value_usd: s.implied,
    model: {
      base_multiple: round4(s.categoryMult),
      growth_pct: round2(s.growthPct),
      growth_relative_pct: round2(s.growthRel),
      growth_multiplier: round4(s.growthMult),
      maturity_multiplier: round4(s.maturityMult),
      breadth_multiplier: round4(s.breadthMult),
      age_days: s.age,
    },
    farm_steps: farmSteps(s.p, s.age).map(stepText),
  }));
}

const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;
const round2 = (n: number): number => Math.round(n * 1e2) / 1e2;

/** A step as one string: its action, then its cost and time, within the gate's 20..600 characters. */
export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Hold the position and check the protocol's own page.`;
  return s;
}

/** The first chain a protocol names, or a neutral phrase. */
function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

/** The second chain a protocol names, or null when it runs on one chain. */
function secondChainOf(p: SnapshotProtocol): string | null {
  return p.chains.length > 1 ? p.chains[1]! : null;
}

/** How much capital one farm position needs, from the protocol's own TVL. */
function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 5_000_000_000) return 250;
  if (p.tvl_usd >= 1_000_000_000) return 150;
  if (p.tvl_usd >= 100_000_000) return 100;
  return 50;
}

/** How long to hold, from the protocol's age: younger protocols get a longer qualifying window. */
function holdDaysFor(age: number | null): number {
  if (age === null) return 30;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

/** A deterministic pick between two variants, from the slug, so the same protocol always reads the same. */
function variantOf(slug: string): 0 | 1 {
  let h = 0;
  for (let i = 0; i < slug.length; i++) h = (h * 31 + slug.charCodeAt(i)) >>> 0;
  return (h % 2) as 0 | 1;
}

/**
 * The category's two core actions, as templates over {name}, {chain} and {capital}. Two variants per
 * family keep 226 plans from reading as one template pasted 226 times; the slug hash picks one.
 * The wording is the action itself — a supply, a borrow, a stake, a bridge, a mint, a hedge — never
 * a promise that a token or an airdrop is coming.
 */
const ACTIONS: Array<[RegExp, [string, string]]> = [
  [
    /lend|uncollateral|cedefi|cdfi/i,
    [
      'Supply ${capital} of USDC as collateral to {name} on {chain} and enable it for borrowing',
      'Borrow up to half the value of ${capital} of supplied WETH on {name} on {chain}, then repay half after one interest cycle',
    ],
  ],
  [
    /dex|leveraged farm|liquidity manager/i,
    [
      'Provide ${capital} in a stablecoin pair to {name} on {chain} and reinvest the earned fees each week',
      'Swap ${capital} of USDC for ETH on {name} on {chain} with a limit order and note the execution price',
    ],
  ],
  [
    /liquid staking|restak|staking pool/i,
    [
      'Stake ${capital} of the native asset through {name} on {chain} and hold the receipt token',
      'Mint ${capital} of the liquid staked token on {name} on {chain} and track its peg against the native asset',
    ],
  ],
  [
    /bridge/i,
    [
      'Bridge ${capital} of USDC through {name} to a second chain and log the total fees paid',
      'Bridge ${capital} of USDC out of {chain} through {name}, then bridge it back after 24 hours',
    ],
  ],
  [
    /rwa|collateral market/i,
    [
      'Allocate ${capital} of USDC into the tokenised Treasury vault on {name} on {chain} and record the weekly NAV',
      'Deposit ${capital} into the tokenised T-bill fund on {name} on {chain} and note the redemption window',
    ],
  ],
  [
    /perpetual|derivative|basis trading|interest rate/i,
    [
      'Open a ${capital} notional ETH long on {name} on {chain} at low leverage with a stop loss set',
      'Hedge a ${capital} spot ETH position with an equal-size short perp on {name} on {chain}',
    ],
  ],
  [
    /curator|allocator|risk/i,
    [
      'Allocate ${capital} of USDC to a vault on {name} on {chain} managed by an independent risk curator',
      'Split ${capital} evenly across two curator-managed vaults on {name} on {chain} and compare their policies',
    ],
  ],
  [
    /prediction/i,
    [
      'Take a ${capital} YES position on one binary market on {name} on {chain} and record the resolution criteria',
      'Provide ${capital} of liquidity to an outcome pair on {name} on {chain}',
    ],
  ],
  [
    /stable|cdp|dual-token/i,
    [
      'Open a ${capital} collateral vault on {name} on {chain} and mint the minimum stable amount',
      'Deposit ${capital} into the stablecoin savings module on {name} on {chain} and watch the rate each week',
    ],
  ],
  [
    /insurance/i,
    [
      'Buy ${capital} of coverage on {name} on {chain} for a lending position and log the terms',
      'Cover a ${capital} LP position with {name} on {chain} and note the coverage period',
    ],
  ],
  [
    /yield|farm|index|governance/i,
    [
      'Deposit ${capital} of USDC into the highest-yield vault on {name} on {chain} and leave the position open',
      'Deposit ${capital} of USDC into a {name} vault on {chain} and compound the yield once a week',
    ],
  ],
  [
    /payment|card|otc/i,
    [
      'Fund ${capital} into {name} on {chain} and make one real payment or settlement through it',
      'Move ${capital} of USDC through {name} on {chain} and keep the receipt for the log',
    ],
  ],
  [
    /chain|anchor btc|decentralized btc|restaked btc|stablecoin wrapper/i,
    [
      'Deposit ${capital} of the wrapped asset through {name} on {chain} and hold the receipt',
      'Mint ${capital} of the protocol asset on {name} on {chain} and keep it in the farming wallet',
    ],
  ],
];

const DEFAULT_ACTION: [string, string] = [
  'Deposit ${capital} of USDC into {name} on {chain} and keep the position open',
  'Use ${capital} of USDC in the main feature of {name} on {chain} and keep the position open',
];

/** The category's core action, with the protocol's own name, chain and capital filled in. */
function actionFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = p.category ?? '';
  const entry = ACTIONS.find(([re]) => re.test(c));
  const template = (entry === undefined ? DEFAULT_ACTION : entry[1])[variantOf(p.slug)];
  return template
    .replace('{capital}', String(capital))
    .replace('{name}', p.name)
    .replace('{chain}', chain);
}

/** The second, different action for the same protocol: a repeat on its second chain, or a complementary move. */
function secondActionFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const second = secondChainOf(p);
  if (second !== null) {
    const c = (p.category ?? '').toLowerCase();
    const what = c.includes('bridge')
      ? `Bridge $${capital / 2} of USDC back through ${p.name} from ${second} to ${chain} and compare the fees`
      : c.includes('lend') || c.includes('cdp')
        ? `Supply $${capital / 2} of USDC to ${p.name} on ${second} so the position exists on two chains`
        : c.includes('dex') || c.includes('yield')
          ? `Provide $${capital / 2} of liquidity to ${p.name} on ${second} in the same pair as on ${chain}`
          : `Repeat the first position with $${capital / 2} on ${p.name} on ${second} so the activity spans two chains`;
    return what;
  }
  const c = (p.category ?? '').toLowerCase();
  if (c.includes('lend') || c.includes('cdp')) return `Borrow a small amount against the supplied collateral on ${p.name} on ${chain} and repay it within the week`;
  if (c.includes('dex') || c.includes('yield')) return `Make one swap on ${p.name} on ${chain} and leave the receipt token in the farming wallet`;
  if (c.includes('staking') || c.includes('restak')) return `Restake the receipt token once through ${p.name} on ${chain} and note the new balance`;
  if (c.includes('perpetual') || c.includes('derivative')) return `Close the first hedge on ${p.name} on ${chain} and open a fresh one half the size`;
  if (c.includes('prediction')) return `Take the opposite side of the first market on ${p.name} on ${chain} with $${capital / 2}`;
  if (c.includes('bridge')) return `Bridge a second, smaller amount of $${capital / 2} through ${p.name} on a different route`;
  if (c.includes('curator') || c.includes('allocator') || c.includes('risk')) return `Move $${capital / 2} into a second vault on ${p.name} on ${chain} with a different risk profile`;
  if (c.includes('rwa')) return `Check the redemption terms on ${p.name} on ${chain} and test a $${capital / 2} redemption`;
  return `Use a second feature of ${p.name} on ${chain} — a vote, a swap or a second deposit — with $${capital / 2}`;
}

/** The weekly qualifying action, in the category's own verbs. */
function weeklyActionFor(p: SnapshotProtocol): string {
  const c = (p.category ?? '').toLowerCase();
  if (c.includes('lend') || c.includes('cdp')) return 'Make one qualifying action each week: add a little collateral, borrow and repay a small amount, or vote in governance';
  if (c.includes('dex') || c.includes('yield') || c.includes('leveraged farm')) return 'Each week, collect the fees, add a little liquidity or make one swap so the position stays active';
  if (c.includes('staking') || c.includes('restak')) return 'Each week, check the staking rewards, restake what accrued and confirm the receipt balance';
  if (c.includes('bridge')) return 'Each week, bridge one small amount through the protocol so the address stays active on its routes';
  if (c.includes('perpetual') || c.includes('derivative')) return 'Each week, adjust or re-open one small hedge so the account shows recent trading activity';
  if (c.includes('prediction')) return 'Each week, place one small position on a fresh market and record the outcome when it resolves';
  if (c.includes('curator') || c.includes('allocator') || c.includes('risk')) return 'Each week, check the vault performance, read the curator update and rebalance a small amount if the policy changed';
  if (c.includes('rwa')) return 'Each week, record the NAV, check the yield accrual and confirm the redemption window is still open';
  if (c.includes('stable')) return 'Each week, check the peg and the savings rate, and top up or withdraw a small amount';
  if (c.includes('insurance')) return 'Each week, confirm the cover is still active and check whether any claim window has opened';
  return 'Make one qualifying action each week, such as a deposit, a swap, a vote or a claim check';
}

/**
 * A protocol's farm plan: seven steps, each an action with a cost and a time. The plan is derived
 * from the protocol's own record (category, chains, TVL, age), never from a hand-written list of
 * names. Every step states what it costs and how long it takes; the claim step points only at the
 * protocol's own published page and never asks for a payment to claim.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null): FarmStep[] {
  const chain = chainOf(p);
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  const gas = capital >= 150 ? 8 : 4;
  const walletNote =
    capital >= 250
      ? 'Use a fresh wallet that holds only the funds you plan to farm, ideally behind a hardware wallet, and keep its seed phrase offline'
      : 'Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline';
  return [
    {
      text: `${walletNote}.`,
      cost: 'under $3 of gas for the first transaction',
      time: '5 minutes',
    },
    {
      text: `${actionFor(p, capital, chain)}.`,
      cost: `$${capital} of capital and about $${gas} of gas`,
      time: '15 minutes to set up',
    },
    {
      text: `${secondActionFor(p, capital, chain)}.`,
      cost: `about $${capital / 2} of capital and about $3 of gas`,
      time: '10 minutes',
    },
    {
      text: `${weeklyActionFor(p)}.`,
      cost: 'about $2 of gas a week',
      time: '10 minutes a week',
    },
    {
      text: `Hold the position for at least ${hold} days so the activity is counted in more than one snapshot.`,
      cost: `the $${capital} stays in the position`,
      time: `${hold} days`,
    },
    {
      text: `Before you withdraw, open ${p.name}'s own points or rewards page and claim only from the link it publishes — never pay to claim, and never follow a claim link from a reply or a DM.`,
      cost: 'no fee to check, and never pay to claim',
      time: '10 minutes',
    },
    {
      text: `Write the wallet, the dates and every transaction hash in a farm log so you can repeat the position or unwind it.`,
      cost: 'nothing but the log',
      time: '5 minutes',
    },
  ];
}

/** The live-token protocols, by market cap, for the dashboard's Live token view. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .slice(0, LIVE_ROWS)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
    }));
}

/**
 * A board row's compact form for data.js. The row carries its own radar-2 factors at FULL
 * precision — `base_multiple` is the row's own category multiple, not the global fallback — so
 * the dashboard's recompute (TVL x base_multiple x growth x maturity x breadth, rounded) matches
 * the board value exactly. BoardRow.model stays rounded for display; the full-precision factors
 * come through `full`, re-derived by buildRadar from the same snapshot and context the board was
 * scored with. Without `full` the rounded display values are used instead. The row also carries
 * its real farm steps, so the page never regenerates a plan of its own.
 */
export function radarRow(
  row: BoardRow,
  full?: { categoryMult: number; growthMult: number; maturityMult: number; breadthMult: number },
): RadarRow {
  return {
    rank: row.rank,
    slug: row.slug,
    name: row.name,
    category: row.category,
    chains: row.chains,
    tvl_usd: row.tvl_usd,
    change_7d: row.change_7d,
    mcap_usd: row.mcap_usd,
    listed_at: row.listed_at,
    age_days: row.age_days,
    implied_value_usd: row.implied_value_usd,
    base_multiple: full === undefined ? row.model.base_multiple : full.categoryMult,
    growth_multiplier: full === undefined ? row.model.growth_multiplier : full.growthMult,
    maturity_multiplier: full === undefined ? row.model.maturity_multiplier : full.maturityMult,
    breadth_multiplier: full === undefined ? row.model.breadth_multiplier : full.breadthMult,
    farm_steps: row.farm_steps,
  };
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const board = buildBoard(snapshot, model);
  const live = liveRows(snapshot);
  const early = board.filter((r) => !snapshot.watchlist.includes(r.slug)).length;
  // The dashboard recomputes each row from the row's own factors, so hand it the exact ones:
  // re-derive them from the same snapshot and context the board was scored with. BoardRow.model
  // is rounded for display and would not reproduce the board value.
  const context = buildModelContext(snapshot, model);
  const rows = board.map((r) => {
    const v = impliedValue(
      {
        slug: r.slug,
        name: r.name,
        category: r.category,
        chains: r.chains,
        tvl_usd: r.tvl_usd,
        change_7d: r.change_7d,
        mcap_usd: r.mcap_usd,
        listed_at: r.listed_at,
        gecko_id: r.gecko_id,
        symbol: r.symbol,
      },
      snapshot.as_of,
      model,
      context,
    );
    return radarRow(r, {
      categoryMult: v.categoryMult,
      growthMult: v.growthMult,
      maturityMult: v.maturityMult,
      breadthMult: v.breadthMult,
    });
  });
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model,
    model_version: MODEL_VERSION,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: early,
    live_size: live.length,
    rows,
    live,
  };
  return { board, radar };
}

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return {
    as_of: o.as_of,
    source: o.source,
    floor_usd: o.floor_usd,
    protocols,
    watchlist: o.watchlist as string[],
  };
}

/** Why a board is not one the gate will take, or null: coverage, ranks, order, one shared implied value, and farm steps. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
    const steps = r.farm_steps;
    if (steps.length < 3 || steps.length > 12) return `${r.slug} has ${steps.length} farm steps`;
    for (const s of steps) if (s.length < 20 || s.length > 600) return `${r.slug} has a farm step of ${s.length} characters`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
