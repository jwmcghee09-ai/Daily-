/**
 * Fund constituents from SEC EDGAR.
 *
 * Every US registered fund — including every US-listed ETF — files Form N-PORT
 * with its complete portfolio. That makes EDGAR the only source here worth
 * building on: it is free, public to anyone anywhere, uniform across thousands
 * of funds, and it is a government filing system rather than a marketing site,
 * so the URLs do not rot the way issuer download links do. Scraping iShares and
 * Vanguard was tried first; both return a bot-check page rather than the file.
 *
 * The cost is freshness. Holdings are public quarterly with roughly a 60-day
 * lag, so a position opened last month will not appear. For measuring the shape
 * of a portfolio — concentration, overlap, country and sector exposure — a
 * quarter-old index constituent list is almost identical to today's. For
 * anything that turns on this week's holdings, it is not, and `asOf` is carried
 * all the way to the UI so nobody mistakes one for the other.
 *
 * Chain: ticker -> CIK + series (company_tickers_mf.json) -> filing index ->
 * N-PORT XML -> constituents.
 */
import type { FundComposition, FundConstituent } from "@/lib/lookthrough";

const SEC_UA = process.env.SEC_USER_AGENT?.trim()
  // EDGAR requires a contact address and throttles anonymous callers hard.
  || "SPECTRE Portfolio Analytics admin@spectre-assets.com";

const FILES = "https://www.sec.gov/files";



async function secFetch(url: string, timeoutMs = 20000): Promise<Response> {
  return fetch(url, {
    headers: { "User-Agent": SEC_UA, "Accept-Encoding": "gzip, deflate" },
    cache: "no-store",
    signal: AbortSignal.timeout(timeoutMs),
  });
}

interface SeriesRef {
  cik: number;
  seriesId: string;
  classId: string;
}

// The ticker map is ~1.2MB and changes when funds launch, so it is fetched once
// per process rather than per lookup.
let seriesMap: Map<string, SeriesRef> | null = null;
let seriesMapAt = 0;
const SERIES_TTL_MS = 12 * 60 * 60 * 1000;

/** ETF and mutual-fund tickers to their SEC series. ~28,000 entries. */
export async function loadSeriesMap(): Promise<Map<string, SeriesRef>> {
  if (seriesMap && Date.now() - seriesMapAt < SERIES_TTL_MS) return seriesMap;

  const res = await secFetch(`${FILES}/company_tickers_mf.json`, 30000);
  if (!res.ok) throw new Error(`SEC fund ticker map unavailable (${res.status})`);
  const body = (await res.json()) as { fields: string[]; data: Array<[number, string, string, string]> };

  const map = new Map<string, SeriesRef>();
  for (const [cik, seriesId, classId, symbol] of body.data ?? []) {
    if (!symbol) continue;
    // First class listed wins: a series may have several share classes, and
    // they all hold the same portfolio, which is the only part used here.
    const key = symbol.trim().toUpperCase();
    if (!map.has(key)) map.set(key, { cik, seriesId, classId });
  }

  seriesMap = map;
  seriesMapAt = Date.now();
  return map;
}

export function invalidateSeriesMap(): void {
  seriesMap = null;
}

interface FilingRef {
  /** Archive directory, e.g. ".../Archives/edgar/data/1100663/000207169126019760". */
  directory: string;
  filingDate: string;
}

/**
 * N-PORT filings for one fund, newest first.
 *
 * Queried by series rather than by registrant. A trust like iShares Trust holds
 * several hundred series and files for all of them on the same day, so reading
 * the registrant's recent filings and hoping to meet the right fund does not
 * work — IVV's own filing sits hundreds of entries deep. EDGAR accepts a series
 * id in place of a CIK and returns only that fund's filings, which turns an
 * unbounded walk into a single request.
 */
async function recentNportFilings(seriesId: string, limit = 6): Promise<FilingRef[]> {
  const url = `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${encodeURIComponent(seriesId)}`
    + `&type=NPORT-P&dateb=&owner=include&count=${limit}&output=atom`;
  const res = await secFetch(url, 25000);
  if (!res.ok) throw new Error(`SEC filing index unavailable for ${seriesId} (${res.status})`);
  const xml = await res.text();

  const hrefs = [...xml.matchAll(/<filing-href>([\s\S]*?)<\/filing-href>/g)].map((m) => decodeXml(m[1].trim()));
  const dates = [...xml.matchAll(/<filing-date>([\s\S]*?)<\/filing-date>/g)].map((m) => m[1].trim());

  const out: FilingRef[] = [];
  for (let i = 0; i < hrefs.length && out.length < limit; i += 1) {
    // ".../000207169126019760/0002071691-26-019760-index.htm" -> the directory.
    const directory = hrefs[i].replace(/\/[^/]*$/, "");
    if (!/\/Archives\/edgar\/data\/\d+\/\d+$/.test(directory)) continue;
    out.push({ directory, filingDate: dates[i] ?? "" });
  }
  return out;
}

/** Pull a single tag's text out of an XML fragment. */
function tag(xml: string, name: string): string | undefined {
  const m = xml.match(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`));
  return m ? decodeXml(m[1].trim()) : undefined;
}

function attr(xml: string, element: string, attribute: string): string | undefined {
  const m = xml.match(new RegExp(`<${element}[^>]*\\s${attribute}="([^"]*)"`));
  return m ? decodeXml(m[1].trim()) : undefined;
}

function decodeXml(value: string): string {
  return value
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&amp;/g, "&");
}

/**
 * What N-PORT's `issuerCat` actually says.
 *
 * It is tempting to read it as a sector and the form does not mean it that way:
 * it classifies the ISSUER, so every one of the 504 equities in IVV comes back
 * "CORP" and the panel reported "CORP 100%" where a reader expected Technology,
 * Financials, Energy. N-PORT carries no GICS classification at all, for any
 * fund — so rather than dress an issuer type up as a sector, the codes are
 * spelled out and the surfaces that show them say what they are.
 *
 * Unrecognised codes pass through unchanged; a new one should read oddly rather
 * than be silently folded into "Other".
 */
export const NPORT_ISSUER_CATEGORIES: Readonly<Record<string, string>> = {
  CORP: "Corporate issuer",
  MUN: "Municipal",
  UST: "US Treasury",
  USGA: "US government agency",
  USGSE: "US government-sponsored entity",
  NUSS: "Non-US sovereign or supranational",
  RF: "Registered fund",
  RA: "Repurchase agreement",
  "ABS-MBS": "Mortgage-backed",
  "ABS-ABCP": "Asset-backed commercial paper",
  "ABS-CBDO": "Collateralised debt obligation",
  "ABS-O": "Asset-backed, other",
  PF: "Private fund",
  O: "Other",
};

/** Whether a set of labels is N-PORT issuer categories rather than sectors. */
export function isIssuerCategorySet(labels: readonly string[]): boolean {
  const known = new Set(Object.values(NPORT_ISSUER_CATEGORIES));
  const present = labels.filter((l) => String(l ?? "").trim().length > 0);
  return present.length > 0 && present.every((l) => known.has(l));
}

/**
 * N-PORT reports weights as a fraction of net assets in `pctVal`, already
 * computed by the filer. Using it directly avoids re-deriving weights from
 * valUSD, which disagrees with the filer's own total for funds holding
 * derivatives or carrying leverage.
 */
export function parseNportHoldings(xml: string): FundConstituent[] {
  const out: FundConstituent[] = [];
  const blocks = xml.match(/<invstOrSec>[\s\S]*?<\/invstOrSec>/g) ?? [];

  for (const block of blocks) {
    const name = tag(block, "name") ?? tag(block, "title");
    if (!name || name === "N/A") continue;

    const pct = Number(tag(block, "pctVal"));
    if (!Number.isFinite(pct)) continue;

    // Shorts and written derivatives carry a negative weight. They are real
    // exposure but they are not a holding you can concentrate in, and letting
    // them through would make weights that no longer sum sensibly.
    if (pct <= 0) continue;

    const isin = attr(block, "isin", "value");
    const cusipRaw = tag(block, "cusip");
    const cusip = cusipRaw && /^[A-Z0-9]{9}$/i.test(cusipRaw) ? cusipRaw : undefined;
    const ticker = attr(block, "ticker", "value");

    out.push({
      name,
      ticker: ticker || undefined,
      isin: isin || undefined,
      cusip,
      // pctVal is a percentage already, not a fraction.
      weightPct: pct,
      country: tag(block, "invCountry") || undefined,
      assetClass: tag(block, "assetCat") || undefined,
      // An issuer category, spelled out. See NPORT_ISSUER_CATEGORIES: it is
      // not a sector, and the UI labels it accordingly.
      sector: (() => {
        const code = tag(block, "issuerCat");
        if (!code) return undefined;
        return NPORT_ISSUER_CATEGORIES[code.trim().toUpperCase()] ?? code;
      })(),
    });
  }

  return out;
}

/**
 * The N-PORT document for one filing.
 *
 * The series is verified even though the index was queried by series: picking
 * up a sibling fund's holdings would be completely wrong and entirely
 * plausible-looking, which is the worst combination to ship.
 */
async function loadFiling(filing: FilingRef, seriesId: string): Promise<string | null> {
  const res = await secFetch(`${filing.directory}/primary_doc.xml`, 45000);
  if (!res.ok) return null;
  const xml = await res.text();

  const filingSeries = tag(xml, "seriesId");
  if (filingSeries && filingSeries !== seriesId) return null;

  return xml;
}

export interface NportResult extends FundComposition {
  cik: number;
  seriesId: string;
}

/**
 * Constituents for a US-listed fund or ETF.
 *
 * Returns null when the ticker is not a US registered fund — the common case,
 * since most tickers in a portfolio are ordinary shares.
 */
export async function fetchNportComposition(ticker: string): Promise<NportResult | null> {
  const symbol = ticker.trim().toUpperCase();
  if (!symbol) return null;

  const map = await loadSeriesMap();
  const ref = map.get(symbol);
  if (!ref) return null; // not a registered fund

  const filings = await recentNportFilings(ref.seriesId);
  if (filings.length === 0) return null;

  // Newest first; fall back through older filings if one cannot be read.
  for (const filing of filings) {
    const xml = await loadFiling(filing, ref.seriesId);
    if (!xml) continue;

    const constituents = parseNportHoldings(xml);
    if (constituents.length === 0) continue;

    return {
      fundTicker: symbol,
      fundName: tag(xml, "seriesName") ?? tag(xml, "regName"),
      constituents,
      source: "SEC N-PORT",
      // The period the holdings describe, not when the form was filed.
      asOf: tag(xml, "repPdDate") || filing.filingDate,
      cik: ref.cik,
      seriesId: ref.seriesId,
    };
  }

  return null;
}

/** Whether a ticker is a US registered fund at all — no filing fetched. */
export async function isRegisteredFund(ticker: string): Promise<boolean> {
  try {
    return (await loadSeriesMap()).has(ticker.trim().toUpperCase());
  } catch {
    return false;
  }
}
