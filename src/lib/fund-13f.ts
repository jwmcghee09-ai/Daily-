/**
 * Look-through for vehicles that file a 13F and no N-PORT.
 *
 * N-PORT covers registered funds — every ETF and mutual fund. It does not cover
 * holding companies, and some of those are held precisely for the portfolio
 * inside them: Berkshire files 44 13Fs and no N-PORT at all, so without this it
 * stays an opaque lump in a risk engine that exists to see inside things.
 *
 * The catch, and the reason this is deliberately conservative: a 13F is NOT the
 * whole entity. It reports only 13(f)-eligible US-listed equities. It excludes
 * wholly-owned operating businesses, cash, treasuries, bonds and foreign
 * listings. For Berkshire that is most of the company — a recent 13F totals
 * about $299B against $1,263B of assets, so the equity sleeve is roughly a
 * quarter of what a shareholder owns.
 *
 * Treating that 13F as the whole holding would multiply the reported Apple and
 * American Express exposure by about four. So coverage is estimated from the
 * filer's own balance sheet, only that fraction is allocated to the
 * constituents, and the remainder stays in the book as the holding itself. A
 * partial answer with an honest denominator; never a complete-looking wrong one.
 */
import type { FundConstituent } from "@/lib/lookthrough";

const SEC_UA = process.env.SEC_USER_AGENT?.trim()
  || "SPECTRE Portfolio Analytics admin@spectre-assets.com";

async function secFetch(url: string, timeoutMs = 25000): Promise<Response> {
  return fetch(url, {
    headers: { "User-Agent": SEC_UA, "Accept-Encoding": "gzip, deflate" },
    cache: "no-store",
    signal: AbortSignal.timeout(timeoutMs),
  });
}

// ticker -> CIK for operating companies. Separate from the fund map; a ticker
// in both is a registered fund and should never reach this module.
let tickerToCik: Map<string, number> | null = null;
let tickerMapAt = 0;
const TICKER_TTL_MS = 12 * 60 * 60 * 1000;

export async function loadCompanyTickerMap(): Promise<Map<string, number>> {
  if (tickerToCik && Date.now() - tickerMapAt < TICKER_TTL_MS) return tickerToCik;

  const res = await secFetch("https://www.sec.gov/files/company_tickers.json", 30000);
  if (!res.ok) throw new Error(`SEC company ticker map unavailable (${res.status})`);
  const body = (await res.json()) as Record<string, { cik_str?: number; ticker?: string }>;

  const map = new Map<string, number>();
  for (const entry of Object.values(body ?? {})) {
    const ticker = String(entry?.ticker ?? "").trim().toUpperCase();
    const cik = Number(entry?.cik_str);
    if (!ticker || !Number.isFinite(cik)) continue;
    if (!map.has(ticker)) map.set(ticker, cik);
  }

  tickerToCik = map;
  tickerMapAt = Date.now();
  return map;
}

export function invalidateCompanyTickerMap(): void {
  tickerToCik = null;
}

function decodeXml(value: string): string {
  return value
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, c) => String.fromCharCode(Number(c)))
    .replace(/&amp;/g, "&");
}

function tagText(xml: string, name: string): string | undefined {
  const m = xml.match(new RegExp(`<(?:\\w+:)?${name}>([\\s\\S]*?)</(?:\\w+:)?${name}>`));
  return m ? decodeXml(m[1].trim()) : undefined;
}

/**
 * Positions from a 13F information table.
 *
 * Duplicate issuers are summed rather than listed twice: a filer with several
 * named managers reports the same stock once per manager, so Berkshire's Apple
 * stake arrives as two entries that are one position.
 */
export function parse13fInfoTable(xml: string): { constituents: FundConstituent[]; totalValue: number } {
  const blocks = xml.match(/<(?:\w+:)?infoTable>[\s\S]*?<\/(?:\w+:)?infoTable>/g) ?? [];
  const byCusip = new Map<string, FundConstituent & { rawValue: number }>();
  let totalValue = 0;

  for (const block of blocks) {
    const name = tagText(block, "nameOfIssuer");
    const value = Number(tagText(block, "value"));
    if (!name || !Number.isFinite(value) || value <= 0) continue;

    // Put options and short exposure are not a holding you can concentrate in.
    const putCall = tagText(block, "putCall");
    if (putCall) continue;

    const cusipRaw = tagText(block, "cusip") ?? "";
    const cusip = /^[A-Za-z0-9]{9}$/.test(cusipRaw) ? cusipRaw.toUpperCase() : "";
    const key = cusip || name.toUpperCase();

    totalValue += value;
    const existing = byCusip.get(key);
    if (existing) {
      existing.rawValue += value;
      continue;
    }
    byCusip.set(key, {
      name,
      cusip: cusip || undefined,
      weightPct: 0,
      assetClass: "EC",
      country: "US", // 13(f) securities are US-listed by definition.
      rawValue: value,
    });
  }

  if (totalValue <= 0) return { constituents: [], totalValue: 0 };

  const constituents = [...byCusip.values()].map((c) => {
    const { rawValue, ...rest } = c;
    return { ...rest, weightPct: (rawValue / totalValue) * 100 };
  });

  return { constituents, totalValue };
}

/** The most recent 13F-HR for a filer, as an archive directory. */
async function latest13fDirectory(cik: number): Promise<{ directory: string; filingDate: string } | null> {
  const padded = String(cik).padStart(10, "0");
  const res = await secFetch(`https://data.sec.gov/submissions/CIK${padded}.json`, 25000);
  if (!res.ok) return null;
  const body = (await res.json()) as {
    filings?: { recent?: { form?: string[]; accessionNumber?: string[]; filingDate?: string[] } };
  };
  const recent = body.filings?.recent;
  if (!recent?.form) return null;

  for (let i = 0; i < recent.form.length; i += 1) {
    if (recent.form[i] !== "13F-HR") continue;
    const accession = (recent.accessionNumber?.[i] ?? "").replace(/-/g, "");
    if (!accession) continue;
    return {
      directory: `https://www.sec.gov/Archives/edgar/data/${cik}/${accession}`,
      filingDate: recent.filingDate?.[i] ?? "",
    };
  }
  return null;
}

/**
 * The information table inside a filing.
 *
 * Its filename is not fixed — BlackRock calls it form13fInfoTable.xml and
 * Berkshire calls it 56757.xml — so it is found by elimination: the XML in the
 * directory that is not the cover page.
 */
async function fetchInfoTable(directory: string): Promise<string | null> {
  const index = await secFetch(`${directory}/index.json`, 25000);
  if (!index.ok) return null;
  const body = (await index.json()) as { directory?: { item?: Array<{ name?: string }> } };

  const candidates = (body.directory?.item ?? [])
    .map((i) => String(i?.name ?? ""))
    .filter((n) => n.toLowerCase().endsWith(".xml") && n.toLowerCase() !== "primary_doc.xml");
  if (candidates.length === 0) return null;

  // Prefer an explicitly named table when one is there.
  const named = candidates.find((n) => /infotable/i.test(n)) ?? candidates[0];
  const res = await secFetch(`${directory}/${named}`, 60000);
  if (!res.ok) return null;

  const xml = await res.text();
  return xml.includes("infoTable") ? xml : null;
}

/** Total assets from the filer's own most recent 10-K or 10-Q. */
async function fetchTotalAssets(cik: number): Promise<number | null> {
  const padded = String(cik).padStart(10, "0");
  const res = await secFetch(
    `https://data.sec.gov/api/xbrl/companyconcept/CIK${padded}/us-gaap/Assets.json`, 25000);
  if (!res.ok) return null;

  const body = (await res.json()) as { units?: Record<string, Array<{ val?: number; end?: string; form?: string }>> };
  const series = Object.values(body.units ?? {})[0] ?? [];
  const periodic = series
    .filter((p) => typeof p.val === "number" && String(p.form ?? "").startsWith("10-"))
    .sort((a, b) => String(a.end ?? "").localeCompare(String(b.end ?? "")));

  const latest = periodic[periodic.length - 1];
  return latest && typeof latest.val === "number" && latest.val > 0 ? latest.val : null;
}

export interface Form13FResult {
  constituents: FundConstituent[];
  /** Share of the holding these constituents actually represent. */
  coveragePct: number | null;
  reportedValue: number;
  totalAssets: number | null;
  asOf: string;
  cik: number;
}

/**
 * The 13F portfolio for a listed company, with an honest coverage estimate.
 *
 * Returns null when the ticker is not a 13F filer — the usual case.
 */
export async function fetch13fComposition(ticker: string): Promise<Form13FResult | null> {
  const symbol = ticker.trim().toUpperCase();
  if (!symbol) return null;

  const map = await loadCompanyTickerMap();
  // SEC writes class shares with a hyphen; portfolios usually use a dot.
  const cik = map.get(symbol) ?? map.get(symbol.replace(/\./g, "-"));
  if (!cik) return null;

  const filing = await latest13fDirectory(cik);
  if (!filing) return null;

  const xml = await fetchInfoTable(filing.directory);
  if (!xml) return null;

  const { constituents, totalValue } = parse13fInfoTable(xml);
  if (constituents.length === 0) return null;

  const totalAssets = await fetchTotalAssets(cik).catch(() => null);

  /*
   * 13F values were reported in thousands until 2023 and in whole dollars
   * since. Rather than switch on the filing date, the magnitude is checked
   * against the filer's own balance sheet: a portfolio that appears to exceed
   * total assets many times over is being read in the wrong unit.
   */
  let reportedValue = totalValue;
  if (totalAssets && reportedValue > totalAssets * 10) reportedValue = totalValue * 1000;

  const coveragePct = totalAssets && totalAssets > 0
    ? Math.min(100, (reportedValue / totalAssets) * 100)
    : null;

  return {
    constituents,
    coveragePct,
    reportedValue,
    totalAssets,
    asOf: filing.filingDate,
    cik,
  };
}
