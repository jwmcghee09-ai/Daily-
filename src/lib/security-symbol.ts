/**
 * An ISIN or a CUSIP, turned into something that can be priced.
 *
 * Form N-PORT identifies holdings by ISIN and CUSIP and carries no ticker at
 * all — zero of IVV's 507 constituents have one. So the securities inside a
 * fund could be named, weighted and summed, but not priced, which is why every
 * price-derived risk figure stopped at the wrapper: there was no symbol to ask
 * Yahoo about.
 *
 * OpenFIGI maps both identifier types to tickers, free and without a key, ten
 * per request. It answers with every listing of a security across every
 * exchange — Apple comes back 297 times — so the work here is choosing one:
 * the composite listing for a market whose prices are actually available.
 *
 * Results are cached in the database and keyed by identifier, because an ISIN's
 * primary listing is a fact about the security rather than about any portfolio.
 * A failure is cached too, briefly, so a security with no US or ASX listing
 * does not cost a request on every page load — but briefly, because a failure
 * is usually a rate limit rather than a fact.
 */
import { readSecuritySymbol, writeSecuritySymbol } from "@/lib/db";

const OPENFIGI_URL = "https://api.openfigi.com/v3/mapping";

/** OpenFIGI's limit without an API key. */
const JOBS_PER_REQUEST = 10;
const REQUEST_TIMEOUT_MS = 20_000;

/*
 * Bloomberg exchange codes to the suffix Yahoo wants.
 *
 * Deliberately short. A security whose primary listing is Zurich or Tokyo has
 * a Yahoo symbol in principle and no reliable way to construct one, and a
 * wrong symbol prices the wrong company — far worse than not pricing it, since
 * the caller treats an unpriced constituent as part of the fund's own tail,
 * which is already represented by the fund's price series.
 */
const EXCHANGE_SUFFIX: Readonly<Record<string, string>> = {
  US: "",     // the US composite — Yahoo takes the bare ticker
  AU: ".AX",
};

export interface SecurityId {
  isin?: string;
  cusip?: string;
}

export interface ResolvedSymbol {
  /** Ready to pass to the Yahoo chart endpoint. */
  symbol: string;
  /** Which price feed it belongs to, matching the holdings' own sources. */
  market: "us" | "asx";
  name: string;
}

/** The cache key for an identifier pair: ISIN first, since it is unambiguous. */
export function securityIdKey(id: SecurityId): string | null {
  const isin = String(id.isin ?? "").trim().toUpperCase();
  if (/^[A-Z]{2}[A-Z0-9]{9}\d$/.test(isin)) return `isin:${isin}`;
  const cusip = String(id.cusip ?? "").trim().toUpperCase();
  if (/^[A-Z0-9]{9}$/.test(cusip)) return `cusip:${cusip}`;
  return null;
}

interface FigiRow {
  figi?: string;
  compositeFIGI?: string;
  ticker?: string;
  name?: string;
  exchCode?: string;
  marketSector?: string;
  securityType?: string;
}

/**
 * One listing out of the many OpenFIGI returns.
 *
 * Takes the composite row — the one standing for a security's primary market
 * rather than a single venue — for an exchange whose prices can be fetched,
 * and prefers the US composite when a security has both, since that is where
 * an N-PORT filer's holdings are listed.
 */
function pickListing(rows: readonly FigiRow[]): ResolvedSymbol | null {
  const composites = rows.filter(
    (r) => r.figi && r.compositeFIGI && r.figi === r.compositeFIGI
      && r.marketSector === "Equity"
      && String(r.ticker ?? "").trim().length > 0,
  );

  for (const code of ["US", "AU"]) {
    const hit = composites.find((r) => r.exchCode === code);
    if (!hit) continue;
    const ticker = String(hit.ticker).trim().toUpperCase();
    // A ticker carrying anything but letters, digits and a dot is a venue
    // decoration (AAPL*, BHP1) rather than a symbol Yahoo would know.
    if (!/^[A-Z0-9.]+$/.test(ticker)) continue;
    return {
      symbol: `${ticker}${EXCHANGE_SUFFIX[code]}`,
      market: code === "AU" ? "asx" : "us",
      name: String(hit.name ?? "").trim(),
    };
  }
  return null;
}

async function mapBatch(ids: readonly SecurityId[]): Promise<Array<ResolvedSymbol | null>> {
  const jobs = ids.map((id) => {
    const isin = String(id.isin ?? "").trim().toUpperCase();
    return /^[A-Z]{2}[A-Z0-9]{9}\d$/.test(isin)
      ? { idType: "ID_ISIN", idValue: isin }
      : { idType: "ID_CUSIP", idValue: String(id.cusip ?? "").trim().toUpperCase() };
  });

  const res = await fetch(OPENFIGI_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(jobs),
    cache: "no-store",
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  // 429 is the documented response past 25 requests a minute. Treated as "not
  // now" rather than "no such security", so nothing negative is cached.
  if (!res.ok) throw new Error(`OpenFIGI answered ${res.status}`);

  const body = (await res.json()) as Array<{ data?: FigiRow[]; error?: string }>;
  return ids.map((_, i) => {
    const entry = body?.[i];
    if (!entry || entry.error || !Array.isArray(entry.data)) return null;
    return pickListing(entry.data);
  });
}

export interface ResolveSymbolsOptions {
  /**
   * How many OpenFIGI requests this call may make. Each covers ten
   * identifiers, and the cache means the budget is only spent on new ones.
   */
  maxRequests?: number;
}

/**
 * Yahoo symbols for a set of identifiers, cache first.
 *
 * Never throws: an identifier that cannot be resolved is simply absent from the
 * result, and the caller keeps that constituent inside its fund's own series
 * rather than dropping it. Returns a map keyed by `securityIdKey`.
 */
export async function resolveSymbols(
  ids: readonly SecurityId[],
  options: ResolveSymbolsOptions = {},
): Promise<Map<string, ResolvedSymbol>> {
  const out = new Map<string, ResolvedSymbol>();
  const pending: Array<{ key: string; id: SecurityId }> = [];
  const seen = new Set<string>();

  for (const id of ids) {
    const key = securityIdKey(id);
    if (!key || seen.has(key)) continue;
    seen.add(key);

    const cached = readSecuritySymbol(key);
    if (cached) {
      // A stored blank is a remembered miss — no listing we can price.
      if (cached.symbol) {
        out.set(key, {
          symbol: cached.symbol,
          market: cached.market === "asx" ? "asx" : "us",
          name: cached.name,
        });
      }
      continue;
    }
    pending.push({ key, id });
  }

  const budget = Math.max(0, Math.trunc(options.maxRequests ?? 6));
  let spent = 0;

  for (let i = 0; i < pending.length && spent < budget; i += JOBS_PER_REQUEST) {
    const slice = pending.slice(i, i + JOBS_PER_REQUEST);
    spent += 1;

    let results: Array<ResolvedSymbol | null>;
    try {
      results = await mapBatch(slice.map((p) => p.id));
    } catch {
      // Rate limited or unreachable. Stop asking and leave the rest unresolved
      // for the next call, rather than caching a transient failure as a fact.
      break;
    }

    slice.forEach((p, index) => {
      const found = results[index] ?? null;
      try {
        writeSecuritySymbol({
          key: p.key,
          symbol: found?.symbol ?? "",
          market: found?.market ?? "",
          name: found?.name ?? "",
        });
      } catch {
        // The cache is a convenience.
      }
      if (found) out.set(p.key, found);
    });
  }

  return out;
}
