/**
 * Look-through: what you actually own, not what you bought.
 *
 * A portfolio of three ETFs and a super balance looks diversified and reads as
 * four positions. It is not four positions. VAS and A200 hold nearly the same
 * hundred companies; a balanced super option is mostly equities too; and if you
 * also hold BHP directly, your real BHP exposure is the direct parcel plus a
 * slice of every fund that holds it. Concentration measured on the wrappers
 * misses all of that, and it misses it in the direction that matters — it
 * reports less risk than you are carrying.
 *
 * This module resolves wrappers into their constituents and folds them in with
 * the directly-held lines to produce one effective book. Everything downstream
 * — concentration, HHI, sector and country weights, correlation — is then
 * measured on securities rather than on product names.
 *
 * Resolution is best-effort by design. A fund whose holdings cannot be fetched
 * stays in the book as itself and is reported as unresolved, because silently
 * dropping an unresolvable position would understate the total, which is a far
 * worse failure than admitting the look-through is partial.
 */

export interface FundConstituent {
  /** Issuer-reported name. Always present; identifiers often are not. */
  name: string;
  /** Exchange ticker where one could be resolved. */
  ticker?: string;
  isin?: string;
  cusip?: string;
  /** Share of the fund, as a percentage. Issuer-reported where available. */
  weightPct: number;
  /** ISO-3166 alpha-2 where the issuer reports one. */
  country?: string;
  sector?: string;
  /** Equity, debt, cash, derivative — as reported. */
  assetClass?: string;
}

export interface FundComposition {
  /** The wrapper this describes, as the user holds it. */
  fundTicker: string;
  fundName?: string;
  constituents: FundConstituent[];
  /** Where it came from, for the provenance line in the UI. */
  source: string;
  /** Effective date of the underlying filing or file, not the fetch time. */
  asOf: string;
  /**
   * How much of the holding these constituents actually account for.
   *
   * A fund's N-PORT is the whole fund, so this is absent and the constituents
   * stand for all of it. A 13F is not: it reports only US-listed equities and
   * leaves out operating businesses, cash, bonds and foreign holdings — about
   * three quarters of Berkshire. Where that is the case, only this share is
   * allocated to the constituents and the rest stays as the holding itself,
   * because scaling a quarter of a company up to the whole of it would
   * overstate every underlying position by four times.
   */
  coveragePct?: number;
  /** Said plainly in the UI wherever coverage is partial. */
  coverageNote?: string;
}

/** One line of a holding the user actually bears, after resolution. */
export interface EffectivePosition {
  key: string;
  ticker?: string;
  name: string;
  isin?: string;
  cusip?: string;
  value: number;
  weightPct: number;
  country?: string;
  sector?: string;
  assetClass?: string;
  /** True when every dollar of this came from a line the user holds directly. */
  direct: boolean;
  /** Which wrappers contributed, and how much from each. */
  via: Array<{ fundTicker: string; value: number }>;
}

export interface FundOverlap {
  a: string;
  b: string;
  /** Portfolio value held through both, counted once. */
  sharedValue: number;
  /** That shared value as a share of the smaller of the two positions. */
  overlapPct: number;
  topShared: Array<{ name: string; ticker?: string; value: number }>;
}

export interface LookThroughResult {
  positions: EffectivePosition[];
  totalValue: number;
  /** Value that was resolved into underlying securities. */
  resolvedValue: number;
  /** Wrappers that could not be resolved, left in the book as themselves. */
  unresolved: Array<{ ticker: string; name: string; value: number; reason: string }>;
  overlaps: FundOverlap[];
  sources: Array<{ fundTicker: string; source: string; asOf: string; coveragePct?: number; coverageNote?: string }>;
}

/** The holding shape this operates on — a structural subset of PortfolioHolding. */
export interface LookThroughInput {
  ticker: string;
  name: string;
  value: number;
  sector?: string;
}

/**
 * Identity for a security across sources that disagree about how to name it.
 *
 * A constituent may arrive with an ISIN from one fund, a CUSIP from another and
 * nothing but "Apple Inc." from a third. Preferring the strongest identifier
 * present keeps those from becoming three separate positions, which would both
 * understate concentration and hide the overlap this module exists to find.
 */
export function constituentKey(c: { ticker?: string; isin?: string; cusip?: string; name: string }): string {
  if (c.isin && c.isin.trim()) return `isin:${c.isin.trim().toUpperCase()}`;
  if (c.cusip && c.cusip.trim()) return `cusip:${c.cusip.trim().toUpperCase()}`;
  if (c.ticker && c.ticker.trim()) return `tkr:${normaliseTicker(c.ticker)}`;
  return `name:${normaliseName(c.name)}`;
}

/** ASX lines arrive as both "BHP" and "BHP.AX" depending on the source. */
export function normaliseTicker(ticker: string): string {
  return ticker.trim().toUpperCase().replace(/\.(AX|AU|US|L|NZ|TO)$/i, "");
}

/**
 * Issuer files write the same company many ways — "Apple Inc.", "APPLE INC",
 * "Apple Inc Class A". Strip punctuation, the legal suffix and the share-class
 * tail so name matching is a usable last resort when no identifier is given.
 */
export function normaliseName(name: string): string {
  return name
    .toUpperCase()
    .replace(/[.,'"()]/g, "")
    .replace(/\b(CLASS|CL)\s+[A-Z]\b/g, "")
    .replace(/\b(INC|CORP|CORPORATION|CO|LTD|LIMITED|PLC|NV|SA|AG|LLC|LP|TRUST|GROUP|HOLDINGS?|THE)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

const EPSILON = 1e-9;

/**
 * Fold resolved wrappers into the directly-held lines.
 *
 * `compositions` is keyed by the normalised wrapper ticker. Anything absent
 * from it stays whole.
 */
export function buildEffectiveBook(
  holdings: readonly LookThroughInput[],
  compositions: ReadonlyMap<string, FundComposition>,
  options: { unresolvedReason?: (ticker: string) => string } = {},
): LookThroughResult {
  const byKey = new Map<string, EffectivePosition>();
  /*
   * Issuer name to the key already used for it.
   *
   * Identifiers alone are not enough to recognise one company across sources.
   * A fund reports Apple with an ISIN and no ticker; the user holds AAPL with a
   * ticker and no ISIN. Keyed on identifiers those are two positions, and the
   * portfolio reads as less concentrated in Apple than it is — the precise
   * error this module exists to correct, in the dangerous direction.
   *
   * Matching on the normalised issuer name closes that gap. It also folds share
   * classes together — Alphabet A and C, Berkshire A and B — which is correct
   * for concentration: two classes of one company are not diversification, they
   * move together. The normaliser keeps distinct issuers apart, since it strips
   * only legal suffixes and class markers ("Apple" and "Apple Hospitality REIT"
   * stay separate).
   */
  const byIssuerName = new Map<string, string>();
  const unresolved: LookThroughResult["unresolved"] = [];
  const sources: LookThroughResult["sources"] = [];
  // Which wrapper contributed what to each security — the raw material for
  // overlap, which cannot be recovered once everything is summed.
  const contributionsByFund = new Map<string, Map<string, number>>();

  let totalValue = 0;
  let resolvedValue = 0;

  const add = (
    rawKey: string,
    seed: Omit<EffectivePosition, "key" | "weightPct" | "via" | "value">,
    value: number,
    viaFund: string | null,
  ) => {
    // Fold onto the same issuer when one is already known under another
    // identifier, so a ticker and an ISIN for one company do not split.
    const issuer = normaliseName(seed.name);
    const key = byKey.has(rawKey) ? rawKey : (issuer ? byIssuerName.get(issuer) ?? rawKey : rawKey);
    if (issuer && !byIssuerName.has(issuer)) byIssuerName.set(issuer, key);

    const existing = byKey.get(key);
    if (existing) {
      existing.value += value;
      // A security held directly anywhere is a direct holding, even if other
      // dollars of it arrived through a fund.
      existing.direct = existing.direct || seed.direct;
      if (viaFund) {
        const hit = existing.via.find((v) => v.fundTicker === viaFund);
        if (hit) hit.value += value;
        else existing.via.push({ fundTicker: viaFund, value });
      }
      // Fill in identifiers and classification a thinner source omitted.
      existing.ticker ??= seed.ticker;
      existing.isin ??= seed.isin;
      existing.cusip ??= seed.cusip;
      existing.country ??= seed.country;
      existing.sector ??= seed.sector;
      existing.assetClass ??= seed.assetClass;
      return key;
    }
    byKey.set(key, {
      key,
      ...seed,
      value,
      weightPct: 0,
      via: viaFund ? [{ fundTicker: viaFund, value }] : [],
    });
    return key;
  };

  for (const holding of holdings) {
    const value = Number(holding.value);
    if (!Number.isFinite(value) || value <= 0) continue;
    totalValue += value;

    const wrapperKey = normaliseTicker(holding.ticker);
    const composition = compositions.get(wrapperKey);

    if (!composition || composition.constituents.length === 0) {
      // Not a fund, or a fund we could not resolve. Either way it stands as
      // itself — dropping it would quietly shrink the portfolio.
      add(constituentKey({ ticker: holding.ticker, name: holding.name }), {
        ticker: holding.ticker,
        name: holding.name,
        sector: holding.sector,
        direct: true,
      }, value, null);

      if (composition) {
        unresolved.push({
          ticker: holding.ticker, name: holding.name, value,
          reason: options.unresolvedReason?.(holding.ticker) ?? "No constituents reported",
        });
      }
      continue;
    }

    sources.push({
      fundTicker: wrapperKey,
      source: composition.source,
      asOf: composition.asOf,
      coveragePct: composition.coveragePct,
      coverageNote: composition.coverageNote,
    });

    // Issuer weights rarely sum to exactly 100 — they are rounded, and some
    // funds report only their largest positions. Rescale to what is actually
    // reported so the fund's value is neither inflated nor lost.
    const reported = composition.constituents.reduce(
      (sum, c) => sum + (Number.isFinite(c.weightPct) ? Math.max(0, c.weightPct) : 0), 0);
    if (reported <= EPSILON) {
      add(constituentKey({ ticker: holding.ticker, name: holding.name }), {
        ticker: holding.ticker, name: holding.name, sector: holding.sector, direct: true,
      }, value, null);
      unresolved.push({
        ticker: holding.ticker, name: holding.name, value,
        reason: "Reported constituent weights summed to zero",
      });
      continue;
    }

    /*
     * How much of this holding the constituents stand for.
     *
     * A fund's own filing covers the whole fund. A 13F does not — it reports
     * US-listed equities and omits operating businesses, cash, bonds and
     * foreign holdings. Allocating only the covered share and leaving the rest
     * as the holding itself is the difference between saying "a quarter of your
     * Berkshire is these companies" and claiming all of it is, which would
     * overstate every one of them fourfold.
     */
    const coverage = Number.isFinite(composition.coveragePct ?? Number.NaN)
      ? Math.min(1, Math.max(0, (composition.coveragePct as number) / 100))
      : 1;
    const coveredValue = value * coverage;
    const residual = value - coveredValue;

    if (residual > EPSILON) {
      // The part no filing describes stays visible as the holding itself,
      // rather than being quietly folded into the companies that are known.
      add(constituentKey({ ticker: holding.ticker, name: holding.name }), {
        ticker: holding.ticker,
        name: composition.coverageNote
          ? `${holding.name} — not covered by the filing`
          : holding.name,
        sector: holding.sector,
        direct: true,
      }, residual, null);
    }

    if (coveredValue <= EPSILON) {
      unresolved.push({
        ticker: holding.ticker, name: holding.name, value,
        reason: composition.coverageNote ?? "The filing covers none of this holding",
      });
      continue;
    }

    resolvedValue += coveredValue;
    const fundMap = contributionsByFund.get(wrapperKey) ?? new Map<string, number>();
    contributionsByFund.set(wrapperKey, fundMap);

    for (const c of composition.constituents) {
      const w = Number.isFinite(c.weightPct) ? Math.max(0, c.weightPct) : 0;
      if (w <= EPSILON) continue;
      const slice = coveredValue * (w / reported);
      const placedKey = add(constituentKey(c), {
        ticker: c.ticker,
        name: c.name,
        isin: c.isin,
        cusip: c.cusip,
        country: c.country,
        sector: c.sector,
        assetClass: c.assetClass,
        direct: false,
      }, slice, wrapperKey);
      fundMap.set(placedKey, (fundMap.get(placedKey) ?? 0) + slice);
    }
  }

  const positions = [...byKey.values()];
  if (totalValue > 0) {
    for (const p of positions) p.weightPct = (p.value / totalValue) * 100;
  }
  positions.sort((a, b) => b.value - a.value);
  for (const p of positions) p.via.sort((a, b) => b.value - a.value);

  return {
    positions,
    totalValue,
    resolvedValue,
    unresolved,
    overlaps: computeOverlaps(contributionsByFund),
    sources,
  };
}

/**
 * Where two funds hold the same securities.
 *
 * Expressed against the smaller of the two positions, because that is the
 * question being asked: "is this second fund actually adding anything?" Two
 * ASX-200 trackers overlap ~100% whatever their sizes, and that is the number
 * worth seeing.
 */
export function computeOverlaps(
  contributionsByFund: ReadonlyMap<string, ReadonlyMap<string, number>>,
): FundOverlap[] {
  const funds = [...contributionsByFund.keys()];
  const out: FundOverlap[] = [];

  for (let i = 0; i < funds.length; i += 1) {
    for (let j = i + 1; j < funds.length; j += 1) {
      const aMap = contributionsByFund.get(funds[i])!;
      const bMap = contributionsByFund.get(funds[j])!;
      const aTotal = sum(aMap.values());
      const bTotal = sum(bMap.values());
      if (aTotal <= EPSILON || bTotal <= EPSILON) continue;

      let shared = 0;
      const sharedLines: Array<{ key: string; value: number }> = [];
      for (const [key, aValue] of aMap) {
        const bValue = bMap.get(key);
        if (bValue === undefined) continue;
        // The overlap is the part held in common — the lesser of the two.
        const common = Math.min(aValue, bValue);
        shared += common;
        sharedLines.push({ key, value: common });
      }
      if (shared <= EPSILON) continue;

      sharedLines.sort((x, y) => y.value - x.value);
      out.push({
        a: funds[i],
        b: funds[j],
        sharedValue: shared,
        overlapPct: (shared / Math.min(aTotal, bTotal)) * 100,
        topShared: sharedLines.slice(0, 5).map((l) => ({ name: l.key, value: l.value })),
      });
    }
  }

  return out.sort((x, y) => y.overlapPct - x.overlapPct);
}

function sum(values: Iterable<number>): number {
  let total = 0;
  for (const v of values) total += v;
  return total;
}

/** Group the effective book by a reported attribute, largest first. */
export function exposureBy(
  positions: readonly EffectivePosition[],
  field: "country" | "sector" | "assetClass",
  fallback = "Unclassified",
): Array<{ label: string; value: number; pct: number }> {
  const totals = new Map<string, number>();
  let total = 0;
  for (const p of positions) {
    const label = (p[field] || "").trim() || fallback;
    totals.set(label, (totals.get(label) ?? 0) + p.value);
    total += p.value;
  }
  return [...totals.entries()]
    .map(([label, value]) => ({ label, value, pct: total > 0 ? (value / total) * 100 : 0 }))
    .sort((a, b) => b.value - a.value);
}

/**
 * Herfindahl index over the effective book.
 *
 * Measured on wrappers it says a three-ETF portfolio is concentrated; measured
 * on the securities underneath it says what the portfolio actually is. Scaled
 * 0-10,000 as the competition literature defines it.
 */
export function effectiveHhi(positions: readonly EffectivePosition[]): number {
  return positions.reduce((total, p) => total + p.weightPct * p.weightPct, 0);
}

/**
 * Securities whose true weight is materially above what the directly-held line
 * suggests — the headline output of doing any of this.
 */
export function hiddenConcentration(
  result: LookThroughResult,
  holdings: readonly LookThroughInput[],
  minPct = 1,
): Array<{ name: string; ticker?: string; directPct: number; effectivePct: number; via: string[] }> {
  const directValue = new Map<string, number>();
  for (const h of holdings) {
    const key = constituentKey({ ticker: h.ticker, name: h.name });
    directValue.set(key, (directValue.get(key) ?? 0) + (Number(h.value) || 0));
  }

  const out = [];
  for (const p of result.positions) {
    if (p.weightPct < minPct) continue;
    if (p.via.length === 0) continue; // nothing arrived through a fund
    const direct = directValue.get(p.key) ?? 0;
    const directPct = result.totalValue > 0 ? (direct / result.totalValue) * 100 : 0;
    if (p.weightPct - directPct < 0.25) continue; // immaterial
    out.push({
      name: p.name,
      ticker: p.ticker,
      directPct,
      effectivePct: p.weightPct,
      via: p.via.map((v) => v.fundTicker),
    });
  }
  return out.sort((a, b) => b.effectivePct - a.effectivePct);
}
