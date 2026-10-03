/**
 * Reading an issuer's holdings page with a real browser.
 *
 * Vanguard, VanEck and the rest publish holdings through their own websites and
 * render them with JavaScript, so fetching the HTML returns a shell. A headless
 * browser runs that JavaScript and can read the table — which is why this
 * exists, after an earlier conclusion that the data "could not be fetched" that
 * was really a statement about curl.
 *
 * The important finding is what those pages actually contain. They show the top
 * ten holdings, not the portfolio: VAS renders five rows, MVW ten. Rescaling
 * those to 100% — which is what the look-through engine does with a complete
 * file — would report BHP at roughly thirty per cent of VAS instead of eleven.
 * So what comes back is treated exactly like a 13F: the weights account for
 * part of the fund, that part is allocated, and the rest stays as the holding
 * itself. A partial answer with the remainder visible, never a complete-looking
 * wrong one.
 *
 * Costs, since this runs when a person is waiting: a browser launch and render
 * is ten to fifteen seconds and a few hundred megabytes. It is therefore
 * single-flighted per ticker, hard-capped, and cached like every other source.
 */
import type { FundConstituent } from "@/lib/lookthrough";

export interface RenderedHoldings {
  constituents: FundConstituent[];
  /** Share of the fund the page's own weights add up to. */
  coveragePct: number;
  source: string;
  sourceUrl: string;
}

/**
 * Where each issuer publishes holdings.
 *
 * Vanguard addresses funds by an internal portfolio id that cannot be derived
 * from the ticker, so the mapping has to be written down. Kept as data rather
 * than code so a moved page is a one-line change.
 */
const ISSUER_PAGES: Readonly<Record<string, { url: string; issuer: string }>> = {
  // Vanguard Australia
  VAS:  { url: "https://www.vanguard.com.au/personal/invest-with-us/etf?portId=8205", issuer: "Vanguard Australia" },
  VGS:  { url: "https://www.vanguard.com.au/personal/invest-with-us/etf?portId=8212", issuer: "Vanguard Australia" },
  VAP:  { url: "https://www.vanguard.com.au/personal/invest-with-us/etf?portId=8206", issuer: "Vanguard Australia" },
  VSO:  { url: "https://www.vanguard.com.au/personal/invest-with-us/etf?portId=8207", issuer: "Vanguard Australia" },
  VGAD: { url: "https://www.vanguard.com.au/personal/invest-with-us/etf?portId=8213", issuer: "Vanguard Australia" },
  VDHG: { url: "https://www.vanguard.com.au/personal/invest-with-us/etf?portId=8221", issuer: "Vanguard Australia" },
  // VanEck Australia
  MVW:  { url: "https://www.vaneck.com.au/etf/equity/mvw/holdings/", issuer: "VanEck Australia" },
  QUAL: { url: "https://www.vaneck.com.au/etf/equity/qual/holdings/", issuer: "VanEck Australia" },
  MOAT: { url: "https://www.vaneck.com.au/etf/equity/moat/holdings/", issuer: "VanEck Australia" },
  GOLD: { url: "https://www.vaneck.com.au/etf/commodities/nugg/holdings/", issuer: "VanEck Australia" },
};

export function hasIssuerPage(ticker: string): boolean {
  return Boolean(ISSUER_PAGES[ticker.trim().toUpperCase().replace(/\.(AX|AU)$/i, "")]);
}

export function issuerPageFor(ticker: string): { url: string; issuer: string } | null {
  return ISSUER_PAGES[ticker.trim().toUpperCase().replace(/\.(AX|AU)$/i, "")] ?? null;
}

/** One render at a time per ticker, however many people ask at once. */
const inFlight = new Map<string, Promise<RenderedHoldings | null>>();

const NAV_TIMEOUT_MS = 45_000;
const SETTLE_MS = 6_000;

/**
 * Extract holdings from whatever table the page drew.
 *
 * Deliberately not pinned to a selector: issuer markup is redesigned without
 * notice, and a pinned selector fails silently the day it changes. Instead
 * every table is scored on whether its header looks like a name column beside a
 * weight column, which survives a reskin.
 *
 * Runs inside the page, so it is written as a self-contained function body.
 */
const EXTRACT = `(() => {
  const headerText = (t) => [...t.querySelectorAll("th")].map((h) => (h.textContent || "").trim());
  const NAME = /(holding|security|company|name|issuer)/i;
  const WEIGHT = /(%|percent|weight)/i;

  let best = null;
  for (const table of document.querySelectorAll("table")) {
    const head = headerText(table);
    if (head.length < 2) continue;
    const nameAt = head.findIndex((h) => NAME.test(h));
    const weightAt = head.findIndex((h) => WEIGHT.test(h));
    if (nameAt < 0 || weightAt < 0) continue;

    const rows = [];
    for (const tr of table.querySelectorAll("tbody tr")) {
      // Descendants, not direct children. Vanguard's markup wraps the value
      // cell in a div and puts a decorative div first, so the row's children
      // are [div, th, div] and nothing lines up with the header. Selecting the
      // actual cells restores the alignment and survives that kind of nesting
      // generally.
      const cells = [...tr.querySelectorAll("th,td")].map((c) => (c.textContent || "").trim());
      const name = cells[nameAt];
      const weight = parseFloat(String(cells[weightAt]).replace(/[^0-9.\\-]/g, ""));
      if (!name || !isFinite(weight) || weight <= 0) continue;
      rows.push({ name, weight });
    }
    if (rows.length && (!best || rows.length > best.rows.length)) {
      best = { rows, head };
    }
  }
  return best;
})()`;

async function render(ticker: string): Promise<RenderedHoldings | null> {
  const page = issuerPageFor(ticker);
  if (!page) return null;

  // Imported lazily so a deployment without a browser still starts, and so the
  // cost is paid only by the request that asked for it.
  const puppeteer = (await import("puppeteer")).default;

  const launchArgs = ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"];
  const proxy = process.env.HTTPS_PROXY || process.env.https_proxy;
  if (proxy) launchArgs.push(`--proxy-server=${proxy}`);
  // Trusts exactly one key — the egress proxy's, where one is configured.
  // Everything else is still verified; this is not --ignore-certificate-errors.
  const pinned = String(process.env.PROXY_CA_SPKI ?? "").trim();
  if (pinned) launchArgs.push(`--ignore-certificate-errors-spki-list=${pinned}`);

  let browser;
  try {
    browser = await puppeteer.launch({ headless: true, args: launchArgs });
  } catch (error) {
    // Chromium is downloaded by puppeteer's postinstall into PUPPETEER_CACHE_DIR.
    // If a host wipes that between build and run, launching fails with a message
    // about a missing browser — which is worth saying plainly rather than
    // letting it surface as "no holdings table could be read".
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      /could not find|does not exist|ENOENT/i.test(message)
        ? "No browser is available on this server, so issuer pages cannot be read. "
          + "Check that PUPPETEER_CACHE_DIR survives from build to run."
        : message,
    );
  }

  try {
    const tab = await browser.newPage();
    await tab.setUserAgent(
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
      + "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    );
    await tab.setViewport({ width: 1400, height: 1200 });
    await tab.goto(page.url, { waitUntil: "networkidle2", timeout: NAV_TIMEOUT_MS });

    // Holdings usually sit behind a tab or an accordion.
    await tab.evaluate(() => {
      for (const el of document.querySelectorAll("a,button,[role=tab],li,summary,h2,h3")) {
        if (/^\s*(portfolio\s+)?holdings\s*$/i.test((el.textContent || "").trim())) {
          (el as HTMLElement).click();
          return;
        }
      }
    });
    await new Promise((r) => setTimeout(r, SETTLE_MS));

    const found = (await tab.evaluate(EXTRACT)) as { rows: Array<{ name: string; weight: number }> } | null;
    if (!found || found.rows.length === 0) return null;

    const coveragePct = found.rows.reduce((sum, r) => sum + r.weight, 0);
    // A page that somehow reports a full portfolio is capped at 100 rather than
    // trusted past it; weights above that mean the column was misread.
    if (!Number.isFinite(coveragePct) || coveragePct <= 0 || coveragePct > 101) return null;

    return {
      constituents: found.rows.map((r) => ({
        name: r.name,
        weightPct: r.weight,
        country: "AU",
        assetClass: "EC",
      })),
      coveragePct: Math.min(100, coveragePct),
      source: `${page.issuer} website`,
      sourceUrl: page.url,
    };
  } finally {
    await browser.close().catch(() => { /* the request is already answered */ });
  }
}

/**
 * Holdings for one fund, read from the issuer's page.
 *
 * Returns null for anything not in the registry, and for a page that rendered
 * without a readable table — the caller keeps the holding whole rather than
 * showing a portfolio that may be a misparse.
 */
export async function fetchRenderedHoldings(ticker: string): Promise<RenderedHoldings | null> {
  const symbol = ticker.trim().toUpperCase().replace(/\.(AX|AU)$/i, "");
  if (!hasIssuerPage(symbol)) return null;

  const existing = inFlight.get(symbol);
  if (existing) return existing;

  const job = render(symbol)
    .catch(() => null)
    .finally(() => inFlight.delete(symbol));
  inFlight.set(symbol, job);
  return job;
}
