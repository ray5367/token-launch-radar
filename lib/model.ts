// Token Launch Radar: the value model.
//
// One sealed snapshot in, one ranked board out. The board ranks only protocols
// that record no token and are not a wrapped, staked, bridged or versioned
// product of something else; protocols whose token already trades are kept
// apart and shown with the market's own numbers, never scored by the model —
// and their market-cap/TVL ratios are what price the board AND what test it.
//
// THE MODEL (every input is one of the snapshot's own figures; no protocol
// name is ever special-cased):
//
//   categoryMedian = median(mcap_usd / tvl_usd) over the protocols WITH a
//                    token in the same category (every category with at
//                    least one such protocol), winsorized to
//                    [MULTIPLE_MIN, MULTIPLE_MAX] BEFORE blending, so one
//                    wild ratio cannot drag the blend. Categories with no
//                    token protocol have no category median.
//   globalMedian   = the same median over ALL token protocols, winsorized.
//   weight         = n / (n + SHRINKAGE_PRIOR), where n is the category's
//                    token-protocol count. This is credibility weighting:
//                    a category with 21 priced protocols earns a 50%
//                    weight on its own median, a category with 1 earns
//                    under 5%, and a category with none earns 0% and prices
//                    purely at the global median.
//   multiple       = weight * categoryMedian + (1 - weight) * globalMedian,
//                    winsorized again to [MULTIPLE_MIN, MULTIPLE_MAX].
//   growth       = clamp(change_7d, GROWTH_FLOOR, GROWTH_CAP); null counts 0.
//   growthFactor = 1 + (growth / 100) * GROWTH_WEIGHT
//   ageFactor    = AGE_FLOOR + AGE_RANGE * ln(1 + min(age_days, AGE_CAP))
//                  / ln(1 + AGE_CAP)
//                  Age is days from listed_at to the snapshot's as_of date,
//                  log-scaled so the first year of a no-token track record
//                  matters more than the fourth. A missing listed_at uses
//                  the median age of the eligible set, computed from the
//                  snapshot, never a guessed constant.
//   sizeFactor   = (tvl_usd / REF_TVL) ^ (ELASTICITY_SLOPE - 1), where
//                  REF_TVL is the median TVL of the snapshot's token
//                  protocols. Market caps grow slower than TVL: across the
//                  token protocols, doubling TVL multiplies the market cap
//                  by about 2^0.5, not 2x. The fitted slope (near 0.5) says
//                  a protocol ten times the median TVL is priced at about
//                  a third of the linear multiple, and one a tenth the
//                  median TVL at about three times it. A TVL of zero takes
//                  a size factor of 1, so the value stays 1 dollar.
//   implied      = max(1, round(tvl_usd * multiple * growthFactor
//                    * ageFactor * sizeFactor))
//
// FITTING, NOT ASSERTING: the shrinkage prior, the growth weight and the
// elasticity slope are chosen by the program, from the snapshot, before the
// board is built (fitConstants). The 128 token protocols are split by slug
// order — every fifth one is held out (25 protocols) and never touches
// selection or fitting; the other 103 choose the constants by leave-one-out
// (each protocol predicted from medians that exclude it), lowest median
// absolute log error over a grid of 8 priors x 5 growth weights x 7 slopes.
// The held-out 25 are then predicted once, from medians fitted on the 103
// alone, and scored against a flat-global-multiple baseline that sees the
// same 103. The dashboard shows that test, the grid, and the chosen values.
// The median is the stated selection target because the model prices by
// medians throughout; the mean error is reported alongside, and it favours
// heavier shrinkage — the dashboard says so rather than hiding it.
//
// WALK-FORWARD IN LISTING TIME: the same fitted constants are also tested
// the way time actually arrives. The 95 token protocols that carry a
// listed_at date are ordered by that date, and the model is run in three
// expanding windows — trained on the earliest quarter, half, then three
// quarters of listings, and tested on the next quarter of listings each
// time, with the medians, the median age and the reference TVL refit on the
// training window alone. A model that only fits one slug-ordered split
// cannot hide behind it; the dashboard shows every fold and the pooled
// error against the same flat baseline.
//
// SENSITIVITY: each fitted constant is moved one grid step either way
// (prior 13/34, growth weight 0.5/1.0, slope 0.4/0.6) and the fit-set
// leave-one-out error and the holdout error are recomputed, so the
// dashboard shows what the choice of constants is actually worth — and
// whether any neighbouring cell would have tested better.
//
// UNCERTAINTY: every row carries a band from 200 bootstrap refits
// (bootstrapBands): the 128 token protocols' ratios are resampled within
// each category with a fixed seed, the medians are recomputed, and each
// row is repriced; the band is the 10th–90th percentile of its 200 repriced
// values, and the rank range is its best and worst rank across the refits.
// Thin categories swing the band wide; the board shows the band next to
// every value instead of pretending the point estimate is exact.
//
// SELECTION: every watchlist slug, plus every other eligible pre-token
// protocol, ranked by implied value descending with ties broken by slug.
// On this snapshot that is 198 rows (40 watchlist + 158 others): the whole
// eligible universe, not a top-N cut. Ranks are exactly 1..N.
//
// FARM PLANS: generated from each protocol's own category, chains, TVL and
// age by the playbook generator below. Steps name real amounts, chain gas
// budgets and holding periods. Nothing here claims a protocol runs a points
// program: steps are the standard farming playbook for the category and
// chain, applied to this protocol, and say so. Each plan is then NETTED
// (farmVerdict): the sunk gas plus a stated 5% risk charge on the deployed
// capital is set against the row's implied value, giving the allocation
// that breaks even and a verdict — farm, thin or skip — from a stated rule
// on that break-even share and the row's uncertainty band. The netting is
// also shown in dollars at the stated plausible single-farmer allocation
// (0.001% of the implied value): the allocation minus the expected cost.
// That net carries the cost side of the verdict in dollars — a thin row
// either nets negative at that share or carries a band too wide for farm.
// The arithmetic is shown in the detail view, not just the verdict word.

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

/** The model's constants, stated in the dashboard's "How the value is figured" panel. */
export interface ModelConstants {
  shrinkage_prior: number;
  multiple_min: number;
  multiple_max: number;
  growth_floor: number;
  growth_cap: number;
  growth_weight: number;
  age_floor: number;
  age_range: number;
  age_cap_days: number;
  elasticity_slope: number;
}

export const MODEL: ModelConstants = {
  shrinkage_prior: 5,
  multiple_min: 0.03,
  multiple_max: 1.25,
  growth_floor: -50,
  growth_cap: 100,
  growth_weight: 0.5,
  age_floor: 0.65,
  age_range: 0.35,
  age_cap_days: 1095,
  elasticity_slope: 1.0,
};

/**
 * The pre-fit defaults above are the starting point only: buildBoard always
 * replaces the shrinkage prior, the growth weight and the elasticity slope
 * with the values fitConstants selects from the snapshot. The winsor caps,
 * the growth clamp and the age curve are structural guards, stated as such,
 * and are not fitted. MODEL_VERSION names the fitted model the dashboard
 * shows.
 */
export const MODEL_VERSION = 'elasticity-fitted-2';

/** The grid fitConstants searches, in the order it is searched (first win on ties). */
export const FIT_GRID = {
  shrinkage_priors: [1, 2, 3, 5, 8, 13, 21, 34],
  growth_weights: [0, 0.25, 0.5, 0.75, 1.0],
  elasticity_slopes: [0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0],
};

/** One side of the holdout / leave-one-out comparison: the fitted model or the flat baseline. */
export interface ErrorSummary {
  n: number;
  median_abs_log_error: number;
  mean_abs_log_error: number;
  typical_multiple: number;
  wins: number;
}

/** One walk-forward fold: trained on listings up to a date, tested on the next quarter of listings. */
export interface WalkForwardFold {
  fold: number;
  train_n: number;
  test_n: number;
  train_through: string;
  model_median: number;
  baseline_median: number;
  model_mean: number;
  baseline_mean: number;
  model_wins: number;
  baseline_wins: number;
  model_typical: number;
  baseline_typical: number;
}

/** The walk-forward test: three expanding windows in listing time, plus the pooled error over all folds. */
export interface WalkForwardReport {
  dated_protocols: number;
  rule: string;
  folds: WalkForwardFold[];
  pooled: ErrorSummary;
  pooled_baseline: ErrorSummary;
}

/** One sensitivity row: the chosen constants, or one constant moved one grid step, with both errors recomputed. */
export interface SensitivityRow {
  label: string;
  fit_loo_median: number;
  holdout_median: number;
  fit_delta: number;
  holdout_delta: number;
}

/** The whole validation story, computed by the program from the snapshot: the split, the grid, the selection, the held-out test, the walk-forward test, the sensitivity table, and the leave-one-out record. */
export interface ValidationReport {
  token_protocols: number;
  fit_protocols: number;
  holdout_protocols: number;
  split_rule: string;
  grid_cells: number;
  selection_metric: string;
  selected_prior: number;
  selected_growth_weight: number;
  selected_slope: number;
  fit_loo: ErrorSummary;
  fit_loo_baseline: ErrorSummary;
  holdout: ErrorSummary;
  holdout_baseline: ErrorSummary;
  loo_all: ErrorSummary;
  loo_all_baseline: ErrorSummary;
  walk_forward: WalkForwardReport;
  sensitivity: SensitivityRow[];
  bootstrap_refits: number;
  bootstrap_seed: number;
}

/** A farm plan netted to a verdict: the costs, the break-even share, the rule's word, and the net dollars at the stated plausible allocation (0.001% of the implied value). */
export interface FarmVerdict {
  verdict: 'farm' | 'thin' | 'skip';
  expected_cost_usd: number;
  gas_usd: number;
  risk_usd: number;
  capital_usd: number;
  break_even_pct: number;
  band_low_ratio: number;
  plausible_alloc_usd: number;
  net_usd: number;
}

/** How many live-token protocols the dashboard's Live view carries: the whole traded comp set that prices the board, by market cap. */
export const LIVE_ROWS = 128;

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
  watchlist: boolean;
  age_days: number | null;
  implied_value_usd: number;
  model: {
    multiple: number;
    multiple_source: 'blended' | 'global';
    multiple_sample: number;
    multiple_weight: number;
    category_median: number | null;
    growth_pct: number;
    growth_factor: number;
    age_factor: number;
    age_days_used: number;
    elasticity_factor: number;
  };
  farm_steps: string[];
}

/** The dashboard's view of one row: the board row plus its farm plan, as shipped. */
export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  listed_at: string | null;
  age_days: number | null;
  watchlist: boolean;
  implied_value_usd: number;
  multiple: number;
  multiple_source: 'blended' | 'global';
  multiple_sample: number;
  multiple_weight: number;
  category_median: number | null;
  growth_factor: number;
  age_factor: number;
  age_days_used: number;
  elasticity_factor: number;
  band_low_usd: number;
  band_high_usd: number;
  rank_low: number;
  rank_high: number;
  farm_verdict: FarmVerdict;
  farm_steps: string[];
}

/** A live-token protocol: it already trades, so the board shows the market's own value. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number;
  change_7d: number | null;
  mcap_tvl: number;
}

/** One entry of the multiples table the dashboard renders. */
export interface MultipleEntry {
  category: string;
  multiple: number;
  sample: number;
  weight: number;
  category_median: number | null;
  source: 'blended' | 'global';
}

/** Everything the dashboard needs: the board, the live set, the multiples, the model. */
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
  protocols_total: number;
  pre_token_total: number;
  excluded_total: number;
  global_multiple: number;
  global_sample: number;
  median_age_days: number;
  ref_tvl_usd: number;
  validation: ValidationReport;
  multiples: MultipleEntry[];
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

/** The median of a non-empty list of finite numbers; the list is sorted in place. */
export function median(values: number[]): number {
  const sorted = values.slice().sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid]!;
  return (sorted[mid - 1]! + sorted[mid]!) / 2;
}

const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

/** A whole day count from `listedAt` to `asOf`, clamped at zero; null when either date is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** Whether a protocol records no token at all: no market cap, no CoinGecko id, no symbol. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

// --- The house watchlist exclusion, reimplemented from the snapshot's own fields. ---

/** Categories the watchlist rule treats as wrapped, staked or bridged products. */
const EXCLUDED_CATEGORIES = new Set(['Bridge', 'Canonical Bridge', 'Liquid Staking', 'Liquid Restaking', 'Restaked BTC', 'CEX']);

/** The house version-marker pattern: a name ending in a release marker. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

/** A whole word wrapped, staked or staking anywhere in the name, any case. */
const PRODUCT_WORD = /\b(wrapped|staked|staking)\b/i;

/** Exchange names whose products the watchlist rule leaves out. */
const EXCHANGES = ['Binance', 'Coinbase', 'Bybit', 'Kraken', 'Bitget', 'OKX', 'Bitfinex', 'Gemini'];

/** Whether the name begins with an exchange name (a whole first word). */
function beginsWithExchange(name: string): boolean {
  return EXCHANGES.some((e) => name === e || name.startsWith(`${e} `) || name.startsWith(`${e}-`) || name.startsWith(`${e}:`));
}

/** Whether a pre-token protocol is a wrapped, staked, bridged or versioned product. */
export function isExcludedProduct(p: SnapshotProtocol): boolean {
  if (p.category !== null && EXCLUDED_CATEGORIES.has(p.category)) return true;
  if (VERSIONED.test(p.name)) return true;
  if (PRODUCT_WORD.test(p.name)) return true;
  if (beginsWithExchange(p.name)) return true;
  return false;
}

/** Whether a protocol may be ranked: pre-token and not an excluded product. */
export function isRankable(p: SnapshotProtocol): boolean {
  return isPreToken(p) && !isExcludedProduct(p);
}

// --- The multiples: derived from the snapshot's token-bearing protocols. ---

/**
 * The mcap/TVL multiple for every category, plus the global fallback.
 * Ratios use only protocols with a positive market cap and positive TVL: a
 * recorded market cap of exactly 0 is no market price and would drag the
 * median to zero. Every category with at least one ratio keeps its median,
 * winsorized before blending; there is no minimum-sample gate, because the
 * credibility weight in multipleFor already damps thin categories. The
 * global median is the same median over all ratios, winsorized the same way.
 */
export function deriveMultiples(protocols: SnapshotProtocol[], model: ModelConstants): { byCategory: Map<string, { median: number; sample: number }>; global: number; globalSample: number } {
  const byCategory = new Map<string, number[]>();
  const all: number[] = [];
  for (const p of protocols) {
    if (p.mcap_usd === null || p.mcap_usd <= 0 || p.tvl_usd <= 0) continue;
    const ratio = p.mcap_usd / p.tvl_usd;
    all.push(ratio);
    const key = p.category ?? '(uncategorized)';
    const list = byCategory.get(key);
    if (list === undefined) byCategory.set(key, [ratio]);
    else list.push(ratio);
  }
  const clamp = (n: number): number => Math.min(model.multiple_max, Math.max(model.multiple_min, n));
  const global = all.length > 0 ? clamp(median(all)) : 0.25;
  const out = new Map<string, { median: number; sample: number }>();
  for (const [key, ratios] of byCategory) {
    out.set(key, { median: clamp(median(ratios)), sample: ratios.length });
  }
  return { byCategory: out, global, globalSample: all.length };
}

/**
 * The multiple one protocol gets: its category's median credibility-weighted
 * against the global median. weight = n / (n + shrinkage_prior), so the
 * blend trusts a well-populated category and leans on the global median for
 * a thin or empty one. The blend is winsorized again so no combination can
 * leave [MULTIPLE_MIN, MULTIPLE_MAX]. A category with no token protocol at
 * all (or a null category with no ratios) prices purely at the global median
 * with weight 0.
 */
export function multipleFor(p: SnapshotProtocol, multiples: ReturnType<typeof deriveMultiples>, model: ModelConstants): { multiple: number; source: 'blended' | 'global'; sample: number; weight: number; categoryMedian: number | null } {
  const key = p.category ?? '(uncategorized)';
  const entry = multiples.byCategory.get(key);
  if (entry === undefined) {
    return { multiple: multiples.global, source: 'global', sample: 0, weight: 0, categoryMedian: null };
  }
  const weight = entry.sample / (entry.sample + model.shrinkage_prior);
  const blended = weight * entry.median + (1 - weight) * multiples.global;
  const multiple = Math.min(model.multiple_max, Math.max(model.multiple_min, blended));
  return { multiple, source: 'blended', sample: entry.sample, weight, categoryMedian: entry.median };
}

/** The size factor: how much the elasticity slope scales a TVL away from the token protocols' median. A zero TVL takes 1, so the value stays a dollar rather than NaN. */
export function elasticityFactor(tvlUsd: number, refTvlUsd: number, slope: number): number {
  if (!(tvlUsd > 0) || !(refTvlUsd > 0)) return 1;
  return Math.pow(tvlUsd / refTvlUsd, slope - 1);
}

/** The factors and the implied value one protocol gets, under the fitted model. */
export function impliedValue(
  p: SnapshotProtocol,
  asOf: string,
  multiples: ReturnType<typeof deriveMultiples>,
  medianAge: number,
  model: ModelConstants,
  refTvlUsd: number,
): { implied: number; multiple: number; source: 'blended' | 'global'; sample: number; weight: number; categoryMedian: number | null; growthPct: number; growthFactor: number; ageFactor: number; age: number | null; ageUsed: number; elasticityFactor: number } {
  const age = ageDays(asOf, p.listed_at);
  const ageUsed = age ?? medianAge;
  const { multiple, source, sample, weight, categoryMedian } = multipleFor(p, multiples, model);
  const rawGrowth = p.change_7d !== null && Number.isFinite(p.change_7d) ? p.change_7d : 0;
  const growthPct = Math.min(model.growth_cap, Math.max(model.growth_floor, rawGrowth));
  const growthFactor = 1 + (growthPct / 100) * model.growth_weight;
  const cappedAge = Math.min(Math.max(ageUsed, 0), model.age_cap_days);
  const ageFactor = model.age_floor + model.age_range * (Math.log1p(cappedAge) / Math.log1p(model.age_cap_days));
  const sizeFactor = elasticityFactor(p.tvl_usd, refTvlUsd, model.elasticity_slope);
  const implied = Math.max(1, Math.round(p.tvl_usd * multiple * growthFactor * ageFactor * sizeFactor));
  return { implied, multiple, source, sample, weight, categoryMedian, growthPct, growthFactor, ageFactor, age, ageUsed, elasticityFactor: sizeFactor };
}

// --- Fitting and validation: the constants are chosen from the snapshot. ---

/** The token protocols the model can be fitted and tested on: a positive market cap and a positive TVL. */
export function fittableProtocols(protocols: SnapshotProtocol[]): SnapshotProtocol[] {
  return protocols
    .filter((p) => p.mcap_usd !== null && p.mcap_usd > 0 && p.tvl_usd > 0)
    .sort((a, b) => (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0));
}

/** The deterministic split: sorted by slug, every fifth protocol is held out and never touches selection or fitting. */
export function splitFitHoldout(pool: SnapshotProtocol[]): { fit: SnapshotProtocol[]; holdout: SnapshotProtocol[] } {
  const fit: SnapshotProtocol[] = [];
  const holdout: SnapshotProtocol[] = [];
  pool.forEach((p, i) => ((i + 1) % 5 === 0 ? holdout : fit).push(p));
  return { fit, holdout };
}

/** The absolute log error of one prediction against the recorded market cap. */
function absLogError(predicted: number, actual: number): number {
  return Math.abs(Math.log(Math.max(1, predicted) / actual));
}

/** The flat baseline's prediction: TVL times the global median, no growth, age or size adjustment. */
function baselinePrediction(p: SnapshotProtocol, multiples: ReturnType<typeof deriveMultiples>): number {
  return Math.max(1, Math.round(p.tvl_usd * multiples.global));
}

/** One error summary from paired errors: the median, the mean, the typical multiple, and the head-to-head wins (ties count for neither side). */
function summarize(modelErrs: number[], baselineErrs: number[]): { model: ErrorSummary; baseline: ErrorSummary } {
  const of = (errs: number[], wins: number): ErrorSummary => ({
    n: errs.length,
    median_abs_log_error: errs.length > 0 ? median(errs) : 0,
    mean_abs_log_error: errs.length > 0 ? errs.reduce((a, b) => a + b, 0) / errs.length : 0,
    typical_multiple: errs.length > 0 ? Math.exp(median(errs)) : 1,
    wins,
  });
  const modelWins = modelErrs.filter((e, i) => e < baselineErrs[i]!).length;
  const baselineWins = baselineErrs.filter((e, i) => e < modelErrs[i]!).length;
  return { model: of(modelErrs, modelWins), baseline: of(baselineErrs, baselineWins) };
}

/** Leave-one-out errors over a pool: each protocol predicted from medians that exclude it. */
function looErrors(pool: SnapshotProtocol[], asOf: string, medianAge: number, refTvl: number, model: ModelConstants): { model: number[]; baseline: number[] } {
  const modelErrs: number[] = [];
  const baselineErrs: number[] = [];
  for (const p of pool) {
    const rest = pool.filter((q) => q.slug !== p.slug);
    const multiples = deriveMultiples(rest, model);
    modelErrs.push(absLogError(impliedValue(p, asOf, multiples, medianAge, model, refTvl).implied, p.mcap_usd!));
    baselineErrs.push(absLogError(baselinePrediction(p, multiples), p.mcap_usd!));
  }
  return { model: modelErrs, baseline: baselineErrs };
}

/** Held-out errors: each held-out protocol predicted once from medians fitted on the fit set alone, against the flat baseline on the same medians. */
function holdoutErrors(fit: SnapshotProtocol[], holdout: SnapshotProtocol[], asOf: string, medianAge: number, refTvl: number, model: ModelConstants): { model: number[]; baseline: number[] } {
  const multiples = deriveMultiples(fit, model);
  const modelErrs: number[] = [];
  const baselineErrs: number[] = [];
  for (const p of holdout) {
    modelErrs.push(absLogError(impliedValue(p, asOf, multiples, medianAge, model, refTvl).implied, p.mcap_usd!));
    baselineErrs.push(absLogError(baselinePrediction(p, multiples), p.mcap_usd!));
  }
  return { model: modelErrs, baseline: baselineErrs };
}

/**
 * Walk-forward in listing time: the token protocols that carry a listed_at
 * date, ordered by that date, run in three expanding windows. Each fold
 * trains on the earliest quarter / half / three quarters of listings and
 * tests on the next quarter, with the medians, the median age and the
 * reference TVL refit on the training window alone and the fitted constants
 * held fixed. Protocols with no listed_at date cannot be ordered in time
 * and sit outside this test; the count is reported, not hidden.
 */
export function walkForward(snapshot: Snapshot, model: ModelConstants): WalkForwardReport {
  const dated = fittableProtocols(snapshot.protocols)
    .filter((p) => p.listed_at !== null)
    .sort((a, b) => (a.listed_at! < b.listed_at! ? -1 : a.listed_at! > b.listed_at! ? 1 : a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0));
  const emptySummary = (n: number): ErrorSummary => ({ n, median_abs_log_error: 0, mean_abs_log_error: 0, typical_multiple: 1, wins: 0 });
  const base: WalkForwardReport = {
    dated_protocols: dated.length,
    rule: 'ordered by listed_at, three expanding windows: train on the earliest quarter / half / three quarters, test on the next quarter',
    folds: [],
    pooled: emptySummary(0),
    pooled_baseline: emptySummary(0),
  };
  if (dated.length < 12) return base;
  const cuts = [Math.floor(dated.length / 4), Math.floor(dated.length / 2), Math.floor((3 * dated.length) / 4)];
  const pooledModel: number[] = [];
  const pooledBase: number[] = [];
  cuts.forEach((cut, i) => {
    const train = dated.slice(0, cut);
    const test = dated.slice(cut, cuts[i + 1] ?? dated.length);
    if (train.length === 0 || test.length === 0) return;
    const multiples = deriveMultiples(train, model);
    const ages = train.map((p) => ageDays(snapshot.as_of, p.listed_at)).filter((a): a is number => a !== null);
    const trainAge = ages.length > 0 ? Math.round(median(ages)) : 365;
    const trainRef = median(train.map((p) => p.tvl_usd));
    const modelErrs: number[] = [];
    const baseErrs: number[] = [];
    for (const p of test) {
      modelErrs.push(absLogError(impliedValue(p, snapshot.as_of, multiples, trainAge, model, trainRef).implied, p.mcap_usd!));
      baseErrs.push(absLogError(baselinePrediction(p, multiples), p.mcap_usd!));
    }
    pooledModel.push(...modelErrs);
    pooledBase.push(...baseErrs);
    const s = summarize(modelErrs, baseErrs);
    base.folds.push({
      fold: base.folds.length + 1,
      train_n: train.length,
      test_n: test.length,
      train_through: train[train.length - 1]!.listed_at!,
      model_median: s.model.median_abs_log_error,
      baseline_median: s.baseline.median_abs_log_error,
      model_mean: s.model.mean_abs_log_error,
      baseline_mean: s.baseline.mean_abs_log_error,
      model_wins: s.model.wins,
      baseline_wins: s.baseline.wins,
      model_typical: s.model.typical_multiple,
      baseline_typical: s.baseline.typical_multiple,
    });
  });
  const pooled = summarize(pooledModel, pooledBase);
  base.pooled = pooled.model;
  base.pooled_baseline = pooled.baseline;
  return base;
}

/**
 * Sensitivity: each fitted constant moved one grid step either way, the
 * fit-set leave-one-out error and the holdout error recomputed for each
 * move. The chosen row leads, with zero deltas; a negative delta on a move
 * would mean that neighbour tested better, and the table shows it rather
 * than hiding it.
 */
export function sensitivity(snapshot: Snapshot, fitted: ModelConstants, fit: SnapshotProtocol[], holdout: SnapshotProtocol[], medianAge: number, refTvl: number): SensitivityRow[] {
  const male = (errs: number[]): number => (errs.length > 0 ? median(errs) : 0);
  const fitLooMale = male(looErrors(fit, snapshot.as_of, medianAge, refTvl, fitted).model);
  const holdMale = male(holdoutErrors(fit, holdout, snapshot.as_of, medianAge, refTvl, fitted).model);
  const rows: SensitivityRow[] = [{
    label: `chosen (prior ${fitted.shrinkage_prior}, growth ${fitted.growth_weight}, slope ${fitted.elasticity_slope})`,
    fit_loo_median: fitLooMale,
    holdout_median: holdMale,
    fit_delta: 0,
    holdout_delta: 0,
  }];
  const moves: { label: string; model: ModelConstants }[] = [
    { label: `prior ${fitted.shrinkage_prior === 1 ? 2 : FIT_GRID.shrinkage_priors[Math.max(0, FIT_GRID.shrinkage_priors.indexOf(fitted.shrinkage_prior) - 1)]}`, model: { ...fitted, shrinkage_prior: FIT_GRID.shrinkage_priors[Math.max(0, FIT_GRID.shrinkage_priors.indexOf(fitted.shrinkage_prior) - 1)]! } },
    { label: `prior ${FIT_GRID.shrinkage_priors[Math.min(FIT_GRID.shrinkage_priors.length - 1, FIT_GRID.shrinkage_priors.indexOf(fitted.shrinkage_prior) + 1)]}`, model: { ...fitted, shrinkage_prior: FIT_GRID.shrinkage_priors[Math.min(FIT_GRID.shrinkage_priors.length - 1, FIT_GRID.shrinkage_priors.indexOf(fitted.shrinkage_prior) + 1)]! } },
    { label: `growth ${FIT_GRID.growth_weights[Math.max(0, FIT_GRID.growth_weights.indexOf(fitted.growth_weight) - 1)]}`, model: { ...fitted, growth_weight: FIT_GRID.growth_weights[Math.max(0, FIT_GRID.growth_weights.indexOf(fitted.growth_weight) - 1)]! } },
    { label: `growth ${FIT_GRID.growth_weights[Math.min(FIT_GRID.growth_weights.length - 1, FIT_GRID.growth_weights.indexOf(fitted.growth_weight) + 1)]}`, model: { ...fitted, growth_weight: FIT_GRID.growth_weights[Math.min(FIT_GRID.growth_weights.length - 1, FIT_GRID.growth_weights.indexOf(fitted.growth_weight) + 1)]! } },
    { label: `slope ${FIT_GRID.elasticity_slopes[Math.max(0, FIT_GRID.elasticity_slopes.indexOf(fitted.elasticity_slope) - 1)]}`, model: { ...fitted, elasticity_slope: FIT_GRID.elasticity_slopes[Math.max(0, FIT_GRID.elasticity_slopes.indexOf(fitted.elasticity_slope) - 1)]! } },
    { label: `slope ${FIT_GRID.elasticity_slopes[Math.min(FIT_GRID.elasticity_slopes.length - 1, FIT_GRID.elasticity_slopes.indexOf(fitted.elasticity_slope) + 1)]}`, model: { ...fitted, elasticity_slope: FIT_GRID.elasticity_slopes[Math.min(FIT_GRID.elasticity_slopes.length - 1, FIT_GRID.elasticity_slopes.indexOf(fitted.elasticity_slope) + 1)]! } },
  ];
  for (const m of moves) {
    const f = male(looErrors(fit, snapshot.as_of, medianAge, refTvl, m.model).model);
    const h = male(holdoutErrors(fit, holdout, snapshot.as_of, medianAge, refTvl, m.model).model);
    rows.push({ label: m.label, fit_loo_median: f, holdout_median: h, fit_delta: f - fitLooMale, holdout_delta: h - holdMale });
  }
  return rows;
}

/**
 * Fit the shrinkage prior, the growth weight and the elasticity slope, and
 * test the fitted model on protocols it never saw. The fit set chooses the
 * constants by leave-one-out over the grid, lowest median absolute log
 * error; the first cell wins on ties, so the choice is deterministic. The
 * holdout is then predicted once from medians fitted on the fit set alone
 * and scored against the flat baseline on the same medians. A leave-one-out
 * run over all token protocols under the chosen constants is kept for the
 * record. With fewer than five fittable protocols there is nothing honest
 * to fit, and the pre-fit defaults are returned with empty summaries.
 */
export function fitConstants(snapshot: Snapshot, medianAge: number, refTvl: number): { model: ModelConstants; validation: ValidationReport } {
  const pool = fittableProtocols(snapshot.protocols);
  const empty = (n: number): ErrorSummary => ({ n, median_abs_log_error: 0, mean_abs_log_error: 0, typical_multiple: 1, wins: 0 });
  const report = (model: ModelConstants, fitLoo: { model: ErrorSummary; baseline: ErrorSummary }, hold: { model: ErrorSummary; baseline: ErrorSummary }, all: { model: ErrorSummary; baseline: ErrorSummary }, fitN: number, holdN: number, cells: number, wf: WalkForwardReport, sens: SensitivityRow[]): ValidationReport => ({
    token_protocols: pool.length,
    fit_protocols: fitN,
    holdout_protocols: holdN,
    split_rule: 'sorted by slug, every fifth protocol held out',
    grid_cells: cells,
    selection_metric: 'lowest median absolute log error, leave-one-out on the fit set',
    selected_prior: model.shrinkage_prior,
    selected_growth_weight: model.growth_weight,
    selected_slope: model.elasticity_slope,
    fit_loo: fitLoo.model,
    fit_loo_baseline: fitLoo.baseline,
    holdout: hold.model,
    holdout_baseline: hold.baseline,
    loo_all: all.model,
    loo_all_baseline: all.baseline,
    walk_forward: wf,
    sensitivity: sens,
    bootstrap_refits: BOOTSTRAP_REFITS,
    bootstrap_seed: BOOTSTRAP_SEED,
  });
  if (pool.length < 5) {
    const zero = { model: empty(0), baseline: empty(0) };
    const wfEmpty: WalkForwardReport = { dated_protocols: 0, rule: 'ordered by listed_at, three expanding windows', folds: [], pooled: empty(0), pooled_baseline: empty(0) };
    return { model: MODEL, validation: report(MODEL, zero, zero, zero, 0, 0, 0, wfEmpty, []) };
  }
  const { fit, holdout } = splitFitHoldout(pool);
  let best: { model: ModelConstants; male: number } | null = null;
  let cells = 0;
  for (const prior of FIT_GRID.shrinkage_priors) {
    for (const gw of FIT_GRID.growth_weights) {
      for (const slope of FIT_GRID.elasticity_slopes) {
        cells += 1;
        const candidate: ModelConstants = { ...MODEL, shrinkage_prior: prior, growth_weight: gw, elasticity_slope: slope };
        const { model: errs } = looErrors(fit, snapshot.as_of, medianAge, refTvl, candidate);
        const male = median(errs);
        if (best === null || male < best.male) best = { model: candidate, male };
      }
    }
  }
  const fitted = best!.model;
  const fitErrs = looErrors(fit, snapshot.as_of, medianAge, refTvl, fitted);
  const fitSummary = summarize(fitErrs.model, fitErrs.baseline);
  const holdErrs = holdoutErrors(fit, holdout, snapshot.as_of, medianAge, refTvl, fitted);
  const holdSummary = summarize(holdErrs.model, holdErrs.baseline);
  const allErrs = looErrors(pool, snapshot.as_of, medianAge, refTvl, fitted);
  const allSummary = summarize(allErrs.model, allErrs.baseline);
  const wf = walkForward(snapshot, fitted);
  const sens = sensitivity(snapshot, fitted, fit, holdout, medianAge, refTvl);
  return { model: fitted, validation: report(fitted, fitSummary, holdSummary, allSummary, fit.length, holdout.length, cells, wf, sens) };
}

// --- Uncertainty: bootstrap bands and rank ranges. ---

/** A small seeded PRNG (mulberry32): the bootstrap refits are reproducible bit for bit. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** How many bootstrap refits price every row, and the seed that makes them reproducible. */
export const BOOTSTRAP_REFITS = 200;
export const BOOTSTRAP_SEED = 20261114;

/** One refit's medians: the token ratios resampled with replacement within each category, the global from the pooled resample. Categories are visited in sorted order, so the random stream is consumed deterministically. */
function resampledMultiples(byCategory: Map<string, number[]>, rng: () => number, model: ModelConstants): ReturnType<typeof deriveMultiples> {
  const clamp = (n: number): number => Math.min(model.multiple_max, Math.max(model.multiple_min, n));
  const cats = new Map<string, { median: number; sample: number }>();
  const all: number[] = [];
  for (const key of [...byCategory.keys()].sort()) {
    const ratios = byCategory.get(key)!;
    const drawn: number[] = [];
    for (let i = 0; i < ratios.length; i++) {
      const v = ratios[Math.floor(rng() * ratios.length)]!;
      drawn.push(v);
      all.push(v);
    }
    cats.set(key, { median: clamp(median(drawn)), sample: drawn.length });
  }
  return { byCategory: cats, global: all.length > 0 ? clamp(median(all)) : 0.25, globalSample: all.length };
}

/**
 * The 10th–90th percentile band and the rank range of every board row over
 * 200 bootstrap refits. Each refit resamples the token protocols' ratios
 * within their categories, recomputes the medians, and reprices every row
 * with the fitted constants held fixed; the band is the row's 10th–90th
 * percentile across refits, and the rank range is its best and worst rank.
 * A row priced from a thin category swings wide; a row priced from a deep
 * one stays put. The seed is fixed, so two runs write identical bands.
 */
export function bootstrapBands(
  rows: SnapshotProtocol[],
  snapshot: Snapshot,
  medianAge: number,
  refTvl: number,
  model: ModelConstants,
): Map<string, { low: number; high: number; rankLow: number; rankHigh: number }> {
  const byCategory = new Map<string, number[]>();
  for (const p of fittableProtocols(snapshot.protocols)) {
    const key = p.category ?? '(uncategorized)';
    const list = byCategory.get(key);
    if (list === undefined) byCategory.set(key, [p.mcap_usd! / p.tvl_usd]);
    else list.push(p.mcap_usd! / p.tvl_usd);
  }
  const rng = mulberry32(BOOTSTRAP_SEED);
  const values = new Map<string, number[]>();
  const ranks = new Map<string, number[]>();
  for (const p of rows) {
    values.set(p.slug, []);
    ranks.set(p.slug, []);
  }
  const percentile = (sorted: number[], q: number): number => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))]!;
  for (let b = 0; b < BOOTSTRAP_REFITS; b++) {
    const multiples = resampledMultiples(byCategory, rng, model);
    const scored = rows.map((p) => ({ slug: p.slug, implied: impliedValue(p, snapshot.as_of, multiples, medianAge, model, refTvl).implied }));
    scored.sort((a, c) => c.implied - a.implied || (a.slug < c.slug ? -1 : a.slug > c.slug ? 1 : 0));
    scored.forEach((s, i) => {
      values.get(s.slug)!.push(s.implied);
      ranks.get(s.slug)!.push(i + 1);
    });
  }
  const out = new Map<string, { low: number; high: number; rankLow: number; rankHigh: number }>();
  for (const p of rows) {
    const vs = values.get(p.slug)!.slice().sort((a, b) => a - b);
    const rs = ranks.get(p.slug)!;
    out.set(p.slug, { low: percentile(vs, 0.1), high: percentile(vs, 0.9), rankLow: Math.min(...rs), rankHigh: Math.max(...rs) });
  }
  return out;
}

// --- Farm plans: category playbooks applied to each protocol's own record. ---

/** Capital for one farm position, from the protocol's own TVL: bigger pools take bigger tickets. */
function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 1_000_000_000) return 400;
  if (p.tvl_usd >= 100_000_000) return 200;
  if (p.tvl_usd >= 25_000_000) return 100;
  return 60;
}

/** Holding period in days, from the protocol's age: younger records need longer seasoning. */
function holdDaysFor(age: number | null): number {
  if (age === null) return 60;
  if (age < 180) return 90;
  if (age < 365) return 60;
  return 45;
}

/** The first chain a protocol names, or a neutral phrase when it names none. */
function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

/**
 * Chain gas budgets: what one transaction typically costs on that chain, and
 * what to hold back for a week of farming. Generic chain knowledge, applied
 * to whichever chain the protocol actually runs on; Ethereum is the only
 * expensive one, everything else is budgeted under a dollar a transaction.
 */
function gasFor(chain: string): { perTx: string; budget: number } {
  if (chain === 'Ethereum') return { perTx: '$2 to $12 per transaction, more at busy hours', budget: 40 };
  if (chain === 'Solana' || chain === 'Sui' || chain === 'Stellar' || chain === 'Flare') return { perTx: 'under $0.05 per transaction', budget: 2 };
  if (chain === 'Tron') return { perTx: 'a few TRX of energy per transaction', budget: 5 };
  if (chain === 'Bitcoin' || chain === 'Bittensor' || chain === 'Chiliz') return { perTx: 'about $1 to $5 per transaction', budget: 15 };
  return { perTx: 'under $1 per transaction', budget: 8 };
}

/** The farm plan's own cost figures, shared by the steps' text and the netting: the capital, the second deposit, and the gas budget held back. */
export function farmCosts(p: SnapshotProtocol): { capital: number; small: number; gasBudget: number } {
  const capital = capitalFor(p);
  return { capital, small: Math.max(20, Math.round(capital / 2)), gasBudget: gasFor(chainOf(p)).budget };
}

/** One playbook: the venue, the main action, the second action and the risk to watch. */
interface Playbook {
  venue: string;
  main: string;
  second: string;
  risk: string;
}

/**
 * The category's playbook. Matching is by keyword on the snapshot's own
 * category string, most specific first; an unrecognized category gets the
 * generic deposit playbook. No protocol name appears anywhere in here.
 */
function playbookFor(category: string | null): Playbook {
  const c = (category ?? '').toLowerCase();
  if (c.includes('risk curator') || c.includes('capital allocator') || c.includes('curator') || c.includes('allocator')) {
    return {
      venue: 'curated vault',
      main: 'Deposit {capital} of USDC into the highest-TVL curated vault, accept the curator allocation, and keep the vault shares in the wallet',
      second: 'Deposit {small} into a second vault on the same chain with a different risk profile so the wallet shows two distinct vault positions',
      risk: 'curator allocation changes and vault withdrawal queues: read the vault redemption terms before depositing, and expect a delay of days, not minutes, on exit',
    };
  }
  if (c.includes('uncollateralized') || c.includes('lend')) {
    return {
      venue: 'lending market',
      main: 'Supply {capital} of USDC to the main lending market, then borrow a small amount of a second asset against it at under 40% loan-to-value and repay it within the week',
      second: 'Supply {small} of a second asset to the same market and make one borrow-and-repay cycle so the wallet shows both sides of the market',
      risk: 'liquidation if the borrowed asset moves against the collateral: keep loan-to-value under 40% and check the health factor weekly',
    };
  }
  if (c.includes('dex')) {
    return {
      venue: 'liquidity pool',
      main: 'Provide {capital} of liquidity to the deepest pool, split evenly between the two pool assets, and keep the LP position open without removing it',
      second: 'Swap {small} through the pool once a week in each direction so the wallet shows both LP and trading activity',
      risk: 'impermanent loss if the pool assets diverge: a 2x price move costs roughly 6% against holding, so prefer the deepest, most balanced pool',
    };
  }
  if (c.includes('yield aggregator') || c.includes('yield') || c.includes('leveraged farm')) {
    return {
      venue: 'yield vault',
      main: 'Deposit {capital} of USDC into the highest-TVL yield vault, confirm the vault shares land in the wallet, and leave the position compounding',
      second: 'Deposit {small} into a second vault on the same chain with a different underlying strategy so the wallet shows two vault positions',
      risk: 'strategy and smart-contract risk in the underlying vaults: a vault yield that looks far above the rest of the market usually carries far more risk',
    };
  }
  if (c.includes('rwa')) {
    return {
      venue: 'tokenized asset',
      main: 'Mint or buy {capital} of the protocol tokenized real-world asset with USDC, complete any eligibility check the issuer requires, and hold the position',
      second: 'Hold {small} of a second tokenized asset from the same issuer, if one is offered, to show breadth across its products',
      risk: 'issuer and redemption risk: tokenized assets can restrict transfers and redemptions, so read the redemption terms and any lock-up before buying',
    };
  }
  if (c.includes('cdp')) {
    return {
      venue: 'collateralized debt position',
      main: 'Open a collateralized debt position with {capital} of collateral, mint stablecoins at under 40% of the collateral value, and keep the position collateralized',
      second: 'Adjust the position once a week: add {small} of collateral or repay part of the minted stablecoins so the wallet shows ongoing position management',
      risk: 'liquidation if collateral value falls: keep the collateral ratio well above the minimum and set a price alert at 20% above the liquidation price',
    };
  }
  if (c.includes('derivative') || c.includes('perpetual') || c.includes('options') || c.includes('interest rate')) {
    return {
      venue: 'derivatives market',
      main: 'Deposit {capital} of USDC as margin, open one small hedged position at 1x to 2x leverage, and close it within a few days to book the trading activity',
      second: 'Place {small} of limit orders on a second market each week and cancel or fill them, so the wallet shows repeated order activity without large exposure',
      risk: 'leverage: a 2x position loses the full deposit on a 50% adverse move, so never size a farm trade above what the position can lose outright',
    };
  }
  if (c.includes('prediction')) {
    return {
      venue: 'prediction market',
      main: 'Fund the account with {capital} of USDC and take one position on a high-volume market, sizing it so a loss costs no more than a tenth of the deposit',
      second: 'Take a {small} position on a second market each week, on a different topic, so the wallet shows repeated market participation',
      risk: 'total loss on a wrong outcome: prediction shares go to zero, so size every position as money that can be lost in full',
    };
  }
  if (c.includes('basis')) {
    return {
      venue: 'basis strategy',
      main: 'Deposit {capital} of USDC into the basis strategy vault and keep the position open through at least one full funding cycle',
      second: 'Add {small} to the same strategy on a second week so the wallet shows repeated deposits rather than a single one-off',
      risk: 'funding-rate flips: a basis strategy earns when funding is positive and bleeds when it turns negative, so check the current funding rate before each deposit',
    };
  }
  if (c.includes('bridge')) {
    return {
      venue: 'bridge route',
      main: 'Bridge {capital} of USDC from the main chain to a second supported chain through the protocol, then use the bridged funds in an app on the destination chain',
      second: 'Bridge {small} back in a later week through the same route so the wallet shows round-trip bridge volume, not a single transfer',
      risk: 'bridge finality delays and destination-chain gas: a bridge can take minutes to hours, so arrive with destination gas already funded and never bridge the full balance',
    };
  }
  if (c.includes('restak') || c.includes('staking')) {
    return {
      venue: 'staking position',
      main: 'Stake {capital} of the chain staking asset through the protocol, keep the receipt token in the wallet, and do not restake the receipt elsewhere',
      second: 'Stake a further {small} in a second week so the wallet shows a growing stake over time rather than one deposit',
      risk: 'unbonding and slashing: staked assets can lock for days to weeks on exit and can be slashed for validator faults, so read the unbonding period first',
    };
  }
  if (c.includes('insurance')) {
    return {
      venue: 'cover policy',
      main: 'Buy {capital} of cover for a protocol or stablecoin position the wallet already holds, keep the policy active, and note its expiry date',
      second: 'Buy a {small} second policy on a different covered protocol so the wallet shows more than one cover purchase',
      risk: 'cover terms: policies pay only on defined events and defined evidence, so read what counts as a claim before assuming a loss is covered',
    };
  }
  if (c.includes('payment') || c.includes('card')) {
    return {
      venue: 'payments app',
      main: 'Fund the payments account with {capital} and make one real payment or card load through the protocol, keeping the receipt',
      second: 'Make a {small} payment each following week through the same account so the wallet shows repeated payment volume',
      risk: 'payment reversals and account freezes: keep records of every payment and never route funds the wallet cannot afford to have held',
    };
  }
  if (c.includes('index')) {
    return {
      venue: 'index token',
      main: 'Buy {capital} of the index token with USDC and hold it in the wallet without trading in and out',
      second: 'Add {small} to the index position in a second week so the wallet shows accumulation over time',
      risk: 'index rebalancing and constituent risk: an index moves with its weakest holding too, so read the current composition before buying',
    };
  }
  if (c.includes('farm')) {
    return {
      venue: 'farm pool',
      main: 'Deposit {capital} into the highest-TVL farm pool, stake the LP or receipt token in the farm contract, and leave it staked',
      second: 'Claim farm rewards once a week and restake {small} of the proceeds so the wallet shows repeated farm interaction',
      risk: 'reward-token price falls and pool migration: farm rewards often fall fast, so claim weekly and check the pool has not migrated before restaking',
    };
  }
  if (c.includes('stablecoin') || c.includes('dual-token')) {
    return {
      venue: 'stablecoin mint',
      main: 'Mint or buy {capital} of the stable asset with USDC, hold it in the wallet, and use it once in a supported app so the wallet shows real usage',
      second: 'Mint a further {small} in a second week and move it through a supported app so the wallet shows repeated minting activity',
      risk: 'depeg: a stable asset that loses its peg can fall fast, so check the peg history and the backing composition before sizing up',
    };
  }
  if (c.includes('collateral')) {
    return {
      venue: 'collateral market',
      main: 'Deposit {capital} of collateral into the collateral market, keep the position open, and check the collateral ratio weekly',
      second: 'Add {small} of a second collateral type in a later week so the wallet shows more than one collateral position',
      risk: 'liquidation and collateral haircuts: different collateral types carry different haircuts, so read the collateral factors before depositing',
    };
  }
  if (c.includes('chain')) {
    return {
      venue: 'chain activity',
      main: 'Bridge {capital} of USDC onto the chain, swap half into the chain gas token, and use the chain flagship DEX and lending app at least once each',
      second: 'Repeat one swap and one app interaction of {small} each week on the chain so the wallet shows sustained chain activity',
      risk: 'new-chain risk: young chains can halt, reorg or change fees, so keep most capital on a chain the wallet already trusts',
    };
  }
  if (c.includes('otc')) {
    return {
      venue: 'OTC desk',
      main: 'Open one {capital} OTC quote through the protocol for an asset the wallet already holds, compare the quote against a DEX price, and settle only if the quote is within 1%',
      second: 'Request a {small} quote in a second week on a different pair so the wallet shows repeated desk usage',
      risk: 'off-market quotes and counterparty settlement: never prepay outside the protocol escrow flow and always compare against a live DEX price',
    };
  }
  if (c.includes('governance')) {
    return {
      venue: 'governance vault',
      main: 'Deposit {capital} into the governance vault, delegate or vote with the position in the next live proposal, and keep the voting power active',
      second: 'Vote in one further proposal each month with {small} of additional delegated power so the wallet shows repeated governance participation',
      risk: 'vote lock-ups: governance deposits can lock for weeks, so read the unlock schedule before depositing the full amount',
    };
  }
  if (c.includes('btc') || c.includes('anchor')) {
    return {
      venue: 'BTC position',
      main: 'Deposit {capital} of wrapped BTC into the protocol position, keep the receipt in the wallet, and check the BTC peg weekly',
      second: 'Add {small} of wrapped BTC in a second week so the wallet shows a growing BTC position over time',
      risk: 'wrapped-BTC custody and peg risk: the wrapped asset is only as good as its custodian and redemption path, so read both before depositing',
    };
  }
  if (c.includes('liquidity manager')) {
    return {
      venue: 'managed liquidity vault',
      main: 'Deposit {capital} of USDC into the managed liquidity vault, let the manager set the range, and keep the vault shares in the wallet',
      second: 'Add {small} to the same vault in a second week so the wallet shows repeated deposits into managed liquidity',
      risk: 'range and rebalancing risk: a managed range that drifts out of range stops earning fees, so check the vault range weekly',
    };
  }
  return {
    venue: 'main product',
    main: 'Deposit {capital} of USDC into the protocol main product, confirm the position or receipt lands in the wallet, and keep the position open',
    second: 'Repeat the main action with {small} in a second week so the wallet shows repeated use rather than a single deposit',
    risk: 'smart-contract risk in a product with no token track record yet: size the position so a full loss is affordable, and read the protocol docs first',
  };
}

/** Fill the playbook's placeholders with this protocol's amounts. */
function fill(template: string, capital: number, small: number): string {
  return template.replaceAll('{capital}', `$${capital}`).replaceAll('{small}', `$${small}`);
}

/** One farm step as a single string: the action, then its cost and time, within 20..600 characters. */
function fmtStep(action: string, cost: string, time: string): string {
  let s = `${action}. Cost: ${cost}. Time: ${time}.`;
  if (s.length > 600) {
    // Trim the action, never the cost or time: the reader needs both.
    const tail = `. Cost: ${cost}. Time: ${time}.`;
    s = `${action.slice(0, 600 - tail.length - 3)}...${tail}`;
  }
  return s;
}

/**
 * A protocol's farm plan: six steps, each an action with a cost and a time.
 * Derived from the protocol's own record (category, chains, TVL, age): the
 * playbook picks the venue and the risk, the TVL picks the capital, the age
 * picks the hold, the first chain picks the gas budget.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null): string[] {
  const chain = chainOf(p);
  const chain2 = p.chains.length > 1 ? p.chains[1]! : null;
  const capital = capitalFor(p);
  const small = Math.max(20, Math.round(capital / 2));
  const hold = holdDaysFor(age);
  const gas = gasFor(chain);
  const book = playbookFor(p.category);
  const main = fill(book.main, capital, small);
  const second = fill(book.second, capital, small);
  const steps: string[] = [
    fmtStep(
      `Set up a fresh wallet that holds only farm funds, fund it with $${capital} of USDC plus $${gas.budget} for gas on ${chain}, and open ${p.name} only from the official links its own docs publish`,
      `$${gas.budget} of gas budget held back (${gas.perTx})`,
      '20 minutes to set up',
    ),
    fmtStep(
      `${main} on ${chain} in the ${p.name} app, and save the transaction hash`,
      `$${capital} of capital plus gas (${gas.perTx})`,
      '15 to 30 minutes',
    ),
    chain2 === null
      ? fmtStep(
          `${second} on ${chain} for ${p.name}`,
          `$${small} of capital plus gas (${gas.perTx})`,
          '10 minutes a week',
        )
      : fmtStep(
          `Repeat the ${book.venue} position on ${chain2} with $${small} through ${p.name}, funding ${chain2} gas first, so the wallet shows activity on two of its ${p.chains.length} chains`,
          `$${small} of capital plus gas on ${chain2}`,
          '15 minutes',
        ),
    fmtStep(
      `Hold every position for at least ${hold} days, check the position weekly, and make one small qualifying action a week so the activity spans more than one snapshot`,
      `the $${capital} stays deployed for ${hold} days`,
      `${hold} days, 10 minutes a week`,
    ),
    fmtStep(
      `Watch ${book.risk}`,
      'no fee to check',
      '10 minutes a week',
    ),
    fmtStep(
      `Keep a farm log with the wallet, the dates and every transaction hash, and when unwinding, exit in two tranches a week apart and revoke token approvals afterwards; never pay anyone to claim, and claim only from links ${p.name} itself publishes`,
      'exit gas only',
      '15 minutes to unwind',
    ),
  ];
  return steps;
}

/**
 * The farm plan netted to a verdict. Sunk gas is two gas budgets (the
 * farming period and the exit); the risk charge is a stated 5% of the
 * deployed capital for smart-contract and peg risk. The break-even share is
 * the expected cost as a percentage of the row's implied value: the
 * allocation that must arrive for the farm to pay for itself. The verdict
 * bars are order-of-magnitude reasoning, stated here and in the dashboard:
 * a single farmer's allocation is plausibly around 0.001% of the implied
 * value (a single-digit percent of supply split among thousands of
 * wallets), so farm needs a break-even share at most 0.001% with the band's
 * low end still holding three quarters of the point estimate; thin needs
 * at most 0.01% (ten times a plausible share) with the low end holding
 * half; anything else is a skip. The net dollars at that plausible
 * allocation — the allocation minus the expected cost — are carried too:
 * they show the cost side of the verdict in dollars. A thin row either
 * nets negative at that share or carries a band too wide for farm (its
 * break-even share alone would have passed). Every input is the row's own
 * figures; no name is special-cased. On this snapshot no row reaches skip:
 * costs are small against every implied value, and the thin rows are the
 * expensive-or-uncertain ones.
 */
export function farmVerdict(p: SnapshotProtocol, impliedUsd: number, bandLowUsd: number): FarmVerdict {
  const { capital, small, gasBudget } = farmCosts(p);
  const gas = 2 * gasBudget;
  const risk = 0.05 * (capital + small);
  const expectedCost = gas + risk;
  const breakEvenPct = impliedUsd > 0 ? (100 * expectedCost) / impliedUsd : 100;
  const bandLowRatio = impliedUsd > 0 ? bandLowUsd / impliedUsd : 0;
  const verdict = breakEvenPct <= 0.001 && bandLowRatio >= 0.75 ? 'farm' : breakEvenPct <= 0.01 && bandLowRatio >= 0.5 ? 'thin' : 'skip';
  const plausibleAlloc = impliedUsd * 0.00001;
  return {
    verdict,
    expected_cost_usd: Math.round(expectedCost * 100) / 100,
    gas_usd: gas,
    risk_usd: Math.round(risk * 100) / 100,
    capital_usd: capital + small,
    break_even_pct: breakEvenPct,
    band_low_ratio: bandLowRatio,
    plausible_alloc_usd: Math.round(plausibleAlloc * 100) / 100,
    net_usd: Math.round((plausibleAlloc - expectedCost) * 100) / 100,
  };
}

// --- Board construction. ---

/** The live-token protocols, by market cap, for the dashboard's Live view. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.mcap_usd !== null && p.mcap_usd > 0)
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0))
    .slice(0, LIVE_ROWS)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd!,
      change_7d: p.change_7d,
      mcap_tvl: round4(p.tvl_usd > 0 ? p.mcap_usd! / p.tvl_usd : 0),
    }));
}

/** The ranked board: every watchlist slug plus every other eligible protocol, priced by the fitted model. The constants are fitted from the snapshot on every run, so the board, the test and the dashboard always agree. */
export function buildBoard(snapshot: Snapshot): { board: BoardRow[]; multiples: ReturnType<typeof deriveMultiples>; medianAge: number; model: ModelConstants; refTvl: number; validation: ValidationReport } {
  const watchlist = new Set(snapshot.watchlist);
  const index = new Map(snapshot.protocols.map((p) => [p.slug, p]));
  const chosen = new Map<string, SnapshotProtocol>();
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  for (const p of snapshot.protocols) {
    if (!chosen.has(p.slug) && isRankable(p)) chosen.set(p.slug, p);
  }
  const knownAges = [...chosen.values()].map((p) => ageDays(snapshot.as_of, p.listed_at)).filter((a): a is number => a !== null);
  const medianAge = knownAges.length > 0 ? Math.round(median(knownAges)) : 365;
  const pool = fittableProtocols(snapshot.protocols);
  const refTvl = pool.length > 0 ? median(pool.map((p) => p.tvl_usd)) : 1;
  const { model, validation } = fitConstants(snapshot, medianAge, refTvl);
  const multiples = deriveMultiples(snapshot.protocols, model);
  const scored = [...chosen.values()].map((p) => {
    const v = impliedValue(p, snapshot.as_of, multiples, medianAge, model, refTvl);
    return { p, v };
  });
  scored.sort((a, b) => b.v.implied - a.v.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  const board: BoardRow[] = scored.map((s, i) => ({
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
    watchlist: watchlist.has(s.p.slug),
    age_days: s.v.age,
    implied_value_usd: s.v.implied,
    model: {
      // Full precision, not rounded: the dashboard recomputes this row from
      // the same figures and checks the result against board.json, so a
      // rounded multiple here would make the page disagree with the board.
      multiple: s.v.multiple,
      multiple_source: s.v.source,
      multiple_sample: s.v.sample,
      multiple_weight: s.v.weight,
      category_median: s.v.categoryMedian,
      growth_pct: s.v.growthPct,
      growth_factor: s.v.growthFactor,
      age_factor: s.v.ageFactor,
      age_days_used: s.v.ageUsed,
      elasticity_factor: s.v.elasticityFactor,
    },
    farm_steps: farmSteps(s.p, s.v.age),
  }));
  return { board, multiples, medianAge, model, refTvl, validation };
}

/** Everything the dashboard renders, from the snapshot: the board, the bands, the verdicts, the live set, the multiples, the model and its test. */
export function buildRadar(snapshot: Snapshot): { board: BoardRow[]; radar: RadarData } {
  const { board, multiples, medianAge, model, refTvl, validation } = buildBoard(snapshot);
  const live = liveRows(snapshot);
  const early = board.filter((r) => !r.watchlist).length;
  const preToken = snapshot.protocols.filter(isPreToken);
  const multiplesTable: MultipleEntry[] = [];
  {
    // One entry per category on the board, priced exactly as its rows are:
    // the blended multiple, the category's token-protocol count, the
    // credibility weight, and the winsorized category median (null when the
    // category has no token protocol and prices at the global median).
    const seen = new Map<string, MultipleEntry>();
    for (const r of board) {
      const category = r.category ?? '(uncategorized)';
      if (!seen.has(category)) {
        seen.set(category, {
          category,
          multiple: round4(r.model.multiple),
          sample: r.model.multiple_sample,
          weight: round4(r.model.multiple_weight),
          category_median: r.model.category_median === null ? null : round4(r.model.category_median),
          source: r.model.multiple_source,
        });
      }
    }
    multiplesTable.push(...[...seen.values()].sort((a, b) => (a.category < b.category ? -1 : a.category > b.category ? 1 : 0)));
  }
  const bySlug = new Map(snapshot.protocols.map((p) => [p.slug, p]));
  const bands = bootstrapBands(
    board.map((r) => bySlug.get(r.slug)!),
    snapshot,
    medianAge,
    refTvl,
    model,
  );
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
    protocols_total: snapshot.protocols.length,
    pre_token_total: preToken.length,
    excluded_total: preToken.filter(isExcludedProduct).length,
    global_multiple: round4(multiples.global),
    global_sample: multiples.globalSample,
    median_age_days: medianAge,
    ref_tvl_usd: refTvl,
    validation,
    multiples: multiplesTable,
    rows: board.map((r) => {
      const band = bands.get(r.slug)!;
      return {
        rank: r.rank,
        slug: r.slug,
        name: r.name,
        category: r.category,
        chains: r.chains,
        tvl_usd: r.tvl_usd,
        change_7d: r.change_7d,
        listed_at: r.listed_at,
        age_days: r.age_days,
        watchlist: r.watchlist,
        implied_value_usd: r.implied_value_usd,
        multiple: r.model.multiple,
        multiple_source: r.model.multiple_source,
        multiple_sample: r.model.multiple_sample,
        multiple_weight: r.model.multiple_weight,
        category_median: r.model.category_median,
        growth_factor: r.model.growth_factor,
        age_factor: r.model.age_factor,
        age_days_used: r.model.age_days_used,
        elasticity_factor: r.model.elasticity_factor,
        band_low_usd: band.low,
        band_high_usd: band.high,
        rank_low: band.rankLow,
        rank_high: band.rankHigh,
        farm_verdict: farmVerdict(bySlug.get(r.slug)!, r.implied_value_usd, band.low),
        farm_steps: r.farm_steps,
      };
    }),
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

/** Why a board is not one the gate will take, or null: coverage, ranks, order, one shared value, farm steps, eligibility. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const bySlug = new Map(snapshot.protocols.map((p) => [p.slug, p]));
  const slugs = new Set(board.map((r) => r.slug));
  if (slugs.size !== board.length) return 'the board repeats a slug';
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  if (board.length < 100) return `the board holds ${board.length} rows, under the 100-row floor`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  const byRank = board.slice().sort((a, b) => a.rank - b.rank);
  for (let i = 1; i < byRank.length; i++) if (byRank[i]!.implied_value_usd > byRank[i - 1]!.implied_value_usd) return `rank ${byRank[i]!.rank} outranks rank ${byRank[i - 1]!.rank} on implied value`;
  if (board.length >= 2 && byRank[0]!.implied_value_usd === byRank[byRank.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${byRank[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
    const p = bySlug.get(r.slug);
    if (p === undefined) return `${r.slug} is not one of the snapshot's protocols`;
    if (!isRankable(p) && !snapshot.watchlist.includes(r.slug)) return `${r.slug} records a token or is an excluded product`;
    if (r.name.trim().length === 0) return `${r.slug} has an empty name`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0 || r.implied_value_usd > 100_000_000_000_000) {
      return `${r.slug} has implied value ${r.implied_value_usd}`;
    }
    if (r.farm_steps.length < 3 || r.farm_steps.length > 12) return `${r.slug} has ${r.farm_steps.length} farm steps`;
    for (const s of r.farm_steps) {
      const t = s.trim();
      if (t.length < 20 || t.length > 600) return `${r.slug} has a farm step of ${t.length} characters`;
    }
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
