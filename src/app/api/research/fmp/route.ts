import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { readUserEntitlements } from "@/lib/db";

export const runtime = "nodejs";

const CACHE_TTL_MS = 15 * 60 * 1000;
let cache: { data: FmpPayload; expiresAt: number } | null = null;

interface IndexQuote { symbol: string; name: string; price: number | null; changePct: number | null; }
interface CommodityQuote { symbol: string; name: string; price: number | null; changePct: number | null; unit: string; }
interface FxRate { pair: string; label: string; rate: number | null; changePct: number | null; }
interface EconEvent { date: string; country: string; event: string; actual: string | null; estimate: string | null; prior: string | null; impact: string; }
interface EarningsEvent { date: string; symbol: string; name: string; epsEstimate: number | null; }
interface SectorPerf { sector: string; changePct: number; }
interface AnalystRating { symbol: string; rating: string; targetConsensus: number | null; targetLow: number | null; targetHigh: number | null; }
interface FmpNewsItem { title: string; publishedDate: string; url: string; symbol: string; site: string; }

interface FmpPayload {
  fetchedAt: string;
  indices: IndexQuote[];
  commodities: CommodityQuote[];
  fx: FxRate[];
  economicCalendar: EconEvent[];
  earningsCalendar: EarningsEvent[];
  sectorPerformance: SectorPerf[];
  analystRatings: AnalystRating[];
  news: FmpNewsItem[];
}

const YAHOO_HEADERS = { "User-Agent": "Mozilla/5.0 (compatible; SPECTRE/1.0)", Accept: "application/json" };

async function yahooQuote(symbol: string): Promise<{ price: number | null; prevClose: number | null; name: string | null }> {
  const url = `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=5d`;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 8_000);
    const res = await fetch(url, { cache: "no-store", signal: ctrl.signal, headers: YAHOO_HEADERS });
    clearTimeout(t);
    if (!res.ok) return { price: null, prevClose: null, name: null };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = (await res.json()) as any;
    const meta = data?.chart?.result?.[0]?.meta ?? {};
    const price = typeof meta.regularMarketPrice === "number" ? meta.regularMarketPrice : null;
    const prevClose = typeof meta.previousClose === "number" ? meta.previousClose
      : typeof meta.chartPreviousClose === "number" ? meta.chartPreviousClose : null;
    const name = meta.shortName ?? meta.longName ?? null;
    return { price, prevClose, name };
  } catch { return { price: null, prevClose: null, name: null }; }
}

function changePct(price: number | null, prev: number | null): number | null {
  if (!price || !prev || prev === 0) return null;
  return ((price - prev) / prev) * 100;
}

// ---- Global Indices via Yahoo Finance ----
const INDEX_SYMBOLS: { sym: string; name: string }[] = [
  { sym: "^GSPC",    name: "S&P 500"     },
  { sym: "^IXIC",    name: "NASDAQ"      },
  { sym: "^DJI",     name: "Dow Jones"   },
  { sym: "^FTSE",    name: "FTSE 100"    },
  { sym: "^GDAXI",   name: "DAX"         },
  { sym: "^N225",    name: "Nikkei 225"  },
  { sym: "^HSI",     name: "Hang Seng"   },
  { sym: "^AXJO",    name: "ASX 200"     },
  { sym: "000001.SS",name: "Shanghai"    },
];

async function fetchIndices(): Promise<IndexQuote[]> {
  const results = await Promise.allSettled(INDEX_SYMBOLS.map(({ sym }) => yahooQuote(sym)));
  return INDEX_SYMBOLS.map(({ sym, name }, i) => {
    const r = results[i];
    const q = r.status === "fulfilled" ? r.value : { price: null, prevClose: null, name: null };
    return { symbol: sym, name, price: q.price, changePct: changePct(q.price, q.prevClose) };
  }).filter((q) => q.price !== null);
}

// ---- Commodities via Yahoo Finance ----
const COMMODITY_SYMBOLS: { sym: string; name: string; unit: string }[] = [
  { sym: "CL=F",   name: "Crude Oil (WTI)", unit: "USD/bbl"  },
  { sym: "BZ=F",   name: "Brent Crude",     unit: "USD/bbl"  },
  { sym: "GC=F",   name: "Gold",            unit: "USD/oz"   },
  { sym: "SI=F",   name: "Silver",          unit: "USD/oz"   },
  { sym: "HG=F",   name: "Copper",          unit: "USD/lb"   },
  { sym: "NG=F",   name: "Natural Gas",     unit: "USD/MMBtu"},
  { sym: "ZW=F",   name: "Wheat",           unit: "USD/bu"   },
  { sym: "ZS=F",   name: "Soybeans",        unit: "USD/bu"   },
];

async function fetchCommodities(): Promise<CommodityQuote[]> {
  const results = await Promise.allSettled(COMMODITY_SYMBOLS.map(({ sym }) => yahooQuote(sym)));
  return COMMODITY_SYMBOLS.map(({ sym, name, unit }, i) => {
    const r = results[i];
    const q = r.status === "fulfilled" ? r.value : { price: null, prevClose: null, name: null };
    return { symbol: sym, name, unit, price: q.price, changePct: changePct(q.price, q.prevClose) };
  }).filter((q) => q.price !== null);
}

// ---- FX via Frankfurter (ECB data) — all AUD crosses in one call ----
async function fetchFx(): Promise<FxRate[]> {
  const TARGETS = ["USD","EUR","GBP","JPY","CNY","NZD","CAD","SGD"];
  const labels: Record<string, string> = { USD:"AUD/USD",EUR:"AUD/EUR",GBP:"AUD/GBP",JPY:"AUD/JPY",CNY:"AUD/CNY",NZD:"AUD/NZD",CAD:"AUD/CAD",SGD:"AUD/SGD" };
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 8_000);
    const res = await fetch(`https://api.frankfurter.app/latest?from=AUD&to=${TARGETS.join(",")}`, { cache: "no-store", signal: ctrl.signal });
    clearTimeout(t);
    if (!res.ok) return [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = (await res.json()) as any;
    const rates = data?.rates ?? {};
    return TARGETS
      .filter((t) => typeof rates[t] === "number")
      .map((t) => ({ pair: `AUD${t}`, label: labels[t], rate: rates[t], changePct: null }));
  } catch { return []; }
}

// ---- Sector Performance via US sector ETFs (Yahoo Finance) ----
const SECTOR_ETFS: { sym: string; sector: string }[] = [
  { sym: "XLK",  sector: "Technology"            },
  { sym: "XLF",  sector: "Financials"             },
  { sym: "XLV",  sector: "Healthcare"             },
  { sym: "XLE",  sector: "Energy"                 },
  { sym: "XLI",  sector: "Industrials"            },
  { sym: "XLY",  sector: "Consumer Discretionary" },
  { sym: "XLP",  sector: "Consumer Staples"       },
  { sym: "XLB",  sector: "Materials"              },
  { sym: "XLRE", sector: "Real Estate"            },
  { sym: "XLU",  sector: "Utilities"              },
  { sym: "XLC",  sector: "Communication"          },
];

async function fetchSectorPerformance(): Promise<SectorPerf[]> {
  const results = await Promise.allSettled(SECTOR_ETFS.map(({ sym }) => yahooQuote(sym)));
  return SECTOR_ETFS
    .map(({ sector }, i) => {
      const r = results[i];
      const q = r.status === "fulfilled" ? r.value : { price: null, prevClose: null, name: null };
      const pct = changePct(q.price, q.prevClose);
      return { sector, changePct: pct ?? 0 };
    })
    .filter((_, i) => {
      const r = results[i];
      return r.status === "fulfilled" && r.value.price !== null;
    })
    .sort((a, b) => b.changePct - a.changePct);
}

// ---- News via RSS (no paid API needed) ----
const NEWS_FEEDS = [
  { url: "https://finance.yahoo.com/rss/topfinstories", source: "Yahoo Finance" },
  { url: "https://www.abc.net.au/news/feed/51120/rss.xml", source: "ABC Business" },
  { url: "https://www.afr.com/rss", source: "AFR" },
  { url: "https://feeds.bloomberg.com/markets/news.rss", source: "Bloomberg" },
];

function extractXml(xml: string, tag: string): string {
  const s = xml.indexOf(`<${tag}`); if (s === -1) return "";
  const cs = xml.indexOf(">", s) + 1;
  const e = xml.indexOf(`</${tag}>`, cs); if (e === -1) return "";
  return xml.slice(cs, e).replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").trim();
}

async function fetchNews(): Promise<FmpNewsItem[]> {
  const results = await Promise.allSettled(
    NEWS_FEEDS.map(async ({ url, source }) => {
      try {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 6_000);
        const res = await fetch(url, { cache: "no-store", signal: ctrl.signal, headers: { "User-Agent": "Mozilla/5.0" } });
        clearTimeout(t);
        if (!res.ok) return [];
        const xml = await res.text();
        const items: FmpNewsItem[] = [];
        let cur = 0;
        while (items.length < 5) {
          const s = xml.indexOf("<item>", cur); if (s === -1) break;
          const e = xml.indexOf("</item>", s); if (e === -1) break;
          const block = xml.slice(s, e + 7); cur = e + 7;
          const title = extractXml(block, "title");
          const link = extractXml(block, "link");
          const date = extractXml(block, "pubDate");
          if (!title) continue;
          items.push({ title, url: link, publishedDate: date, symbol: "", site: source });
        }
        return items;
      } catch { return []; }
    })
  );
  return results.flatMap((r) => r.status === "fulfilled" ? r.value : []).slice(0, 15);
}

export async function GET(request: NextRequest) {
  const isDemo = request.nextUrl.searchParams.get("demo") === "1";
  if (!isDemo) {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Please sign in first." }, { status: 401 });
    const entitlements = readUserEntitlements(user.id);
    if (entitlements.planTier === "none" && !entitlements.proEnabled) {
      return NextResponse.json({ error: "Subscription required." }, { status: 403 });
    }
  }

  const now = Date.now();
  if (cache && now < cache.expiresAt) {
    return NextResponse.json(cache.data, { headers: { "Cache-Control": "no-store" } });
  }

  const [indices, commodities, fx, sectorPerformance, news] = await Promise.all([
    fetchIndices(), fetchCommodities(), fetchFx(), fetchSectorPerformance(), fetchNews(),
  ]);

  const payload: FmpPayload = {
    fetchedAt: new Date().toISOString(),
    indices, commodities, fx, sectorPerformance, news,
    economicCalendar: [],
    earningsCalendar: [],
    analystRatings: [],
  };

  cache = { data: payload, expiresAt: now + CACHE_TTL_MS };
  return NextResponse.json(payload, { headers: { "Cache-Control": "no-store" } });
}
