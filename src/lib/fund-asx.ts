/**
 * ASX ETF holdings, where the issuer actually publishes them.
 *
 * Australia has no EDGAR. ASIC's RG 282 does require transparent ETFs to
 * disclose their portfolio daily, but that disclosure goes to the market
 * operator so market makers can price units — it is not a public feed, and
 * there is no central database to read. What is public is whatever each issuer
 * chooses to put on its own website, and most of them render it with
 * JavaScript against private endpoints that change without notice.
 *
 * Betashares is the exception worth taking: a plain CSV at a predictable path,
 * refreshed daily, carrying ticker, sector, country and weight. Verified across
 * fourteen of their funds. One of the larger ASX issuers, so this turns a good
 * share of Australian ETF holdings from opaque lumps into real constituents
 * without a per-fund registry to maintain.
 *
 * Everything else stays on the upload path. A scraper against a JS-rendered
 * private endpoint works the week it is written and fails silently afterwards,
 * which in a risk tool is worse than admitting the data is not available.
 */
import type { FundComposition } from "@/lib/lookthrough";
import { parseHoldingsRows } from "@/lib/fund-holdings";

const BETASHARES_CSV = "https://www.betashares.com.au/files/csv";

/** Their CDN refuses the default fetch agent. */
const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
  + "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

/** Split a CSV, honouring quoted fields — disclaimer rows contain commas. */
export function parseCsvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 1; }
        else quoted = false;
      } else field += ch;
      continue;
    }
    if (ch === '"') { quoted = true; continue; }
    if (ch === ",") { row.push(field); field = ""; continue; }
    if (ch === "\n") { row.push(field); rows.push(row); row = []; field = ""; continue; }
    if (ch === "\r") continue;
    field += ch;
  }
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }
  return rows;
}

/** The "Date,2026-10-01" line in the file's preamble. */
function findAsOf(rows: readonly (readonly string[])[]): string | null {
  for (const row of rows.slice(0, 20)) {
    if (String(row[0] ?? "").trim().toLowerCase() !== "date") continue;
    const value = String(row[1] ?? "").trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
  }
  return null;
}

/**
 * Constituents for a Betashares fund, or null if the ticker is not one.
 *
 * A 404 is the ordinary answer — most ASX tickers are not Betashares funds —
 * so it is not treated as an error.
 */
export async function fetchBetasharesComposition(ticker: string): Promise<FundComposition | null> {
  const symbol = ticker.trim().toUpperCase().replace(/\.(AX|AU)$/i, "");
  // Their filenames are plain alphanumerics; anything else cannot be a fund
  // code and must not be interpolated into a URL.
  if (!/^[A-Z0-9]{2,8}$/.test(symbol)) return null;

  let res: Response;
  try {
    res = await fetch(`${BETASHARES_CSV}/${symbol}_Portfolio_Holdings.csv`, {
      headers: { "User-Agent": BROWSER_UA, Accept: "text/csv,*/*" },
      cache: "no-store",
      signal: AbortSignal.timeout(20000),
    });
  } catch {
    return null;
  }
  if (!res.ok) return null;

  const text = await res.text();
  // A missing fund can come back as an HTML error page with a 200.
  if (!text || /^\s*</.test(text) || !/portfolio holdings/i.test(text.slice(0, 200))) return null;

  const rows = parseCsvRows(text);
  const parsed = parseHoldingsRows(rows);
  if (parsed.constituents.length === 0) return null;

  return {
    fundTicker: symbol,
    fundName: String(rows.find((r) => /fund name/i.test(String(r[0] ?? "")))?.[1] ?? "").trim() || undefined,
    constituents: parsed.constituents,
    source: "Betashares daily holdings",
    // The file's own effective date, not when it was fetched.
    asOf: findAsOf(rows) ?? new Date().toISOString().slice(0, 10),
  };
}
