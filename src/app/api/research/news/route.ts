import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { readUserEntitlements } from "@/lib/db";

export const runtime = "nodejs";

interface NewsItem {
  tag: string;
  headline: string;
  date: string;
  source: string;
  url: string | null;
}

// In-memory cache: 15 minute TTL
let cachedNews: NewsItem[] | null = null;
let cacheExpiresAt = 0;
const CACHE_TTL_MS = 15 * 60 * 1000;

const FEEDS = [
  { url: "https://finance.yahoo.com/rss/topfinstories", source: "Yahoo Finance" },
  { url: "https://www.abc.net.au/news/feed/51120/rss.xml", source: "ABC Business" },
];

function extractText(xml: string, tag: string): string {
  const open = `<${tag}`;
  const close = `</${tag}>`;
  const start = xml.indexOf(open);
  if (start === -1) return "";
  const contentStart = xml.indexOf(">", start) + 1;
  const end = xml.indexOf(close, contentStart);
  if (end === -1) return "";
  // Use [\s\S]*? instead of .*? with /s flag — compatible with ES2017 target
  return xml.slice(contentStart, end).replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").trim();
}

function extractAttr(xml: string, tag: string, attr: string): string {
  const open = `<${tag}`;
  const start = xml.indexOf(open);
  if (start === -1) return "";
  const tagEnd = xml.indexOf(">", start);
  const tagStr = xml.slice(start, tagEnd);
  const attrMatch = tagStr.match(new RegExp(`${attr}="([^"]*)"`));
  return attrMatch ? attrMatch[1] : "";
}

function parseItems(xml: string, source: string): NewsItem[] {
  const items: NewsItem[] = [];
  let cursor = 0;

  while (true) {
    const itemStart = xml.indexOf("<item>", cursor);
    if (itemStart === -1) break;
    const itemEnd = xml.indexOf("</item>", itemStart);
    if (itemEnd === -1) break;
    const block = xml.slice(itemStart, itemEnd + 7);
    cursor = itemEnd + 7;

    const title = extractText(block, "title");
    const pubDate = extractText(block, "pubDate");
    const link = extractText(block, "link") || extractAttr(block, "link", "href");

    if (!title) continue;

    const tag = deriveTag(title);

    let dateStr = "";
    if (pubDate) {
      try {
        const d = new Date(pubDate);
        if (!isNaN(d.getTime())) {
          dateStr = d.toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
        }
      } catch {
        dateStr = "";
      }
    }

    items.push({
      tag,
      headline: title,
      date: dateStr || "Today",
      source,
      url: link || null,
    });
  }

  return items;
}

function deriveTag(title: string): string {
  const t = title.toUpperCase();
  if (t.includes("RBA") || t.includes("RESERVE BANK")) return "RBA";
  if (t.includes("INFLATION") || t.includes("CPI")) return "INFLATION";
  if (t.includes("ASX") || t.includes("S&P")) return "ASX";
  if (t.includes("BITCOIN") || t.includes("BTC") || t.includes("CRYPTO") || t.includes("ETH")) return "CRYPTO";
  if (t.includes("GOLD")) return "GOLD";
  if (t.includes("IRON ORE") || t.includes("IRON-ORE")) return "IRON ORE";
  if (t.includes("CHINA") || t.includes("CHINESE")) return "CHINA";
  if (t.includes("OIL") || t.includes("ENERGY")) return "ENERGY";
  if (t.includes("RATE") || t.includes("INTEREST")) return "RATES";
  if (t.includes("TRADE") || t.includes("TARIFF")) return "TRADE";
  if (t.includes("DOLLAR") || t.includes("AUD") || t.includes("USD")) return "FX";
  if (t.includes("BANK") || t.includes("BANKING")) return "BANKS";
  if (t.includes("MINING") || t.includes("BHP") || t.includes("RIO")) return "MINING";
  if (t.includes("RESULTS") || t.includes("EARNINGS") || t.includes("PROFIT")) return "EARNINGS";
  if (t.includes("RECESSION") || t.includes("GDP")) return "ECONOMY";
  return "MARKETS";
}

async function fetchFeed(feedUrl: string, source: string): Promise<NewsItem[]> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8_000);
    const res = await fetch(feedUrl, {
      signal: controller.signal,
      headers: { "User-Agent": "Mozilla/5.0 (compatible; SPECTRE/1.0)", Accept: "application/rss+xml, application/xml, text/xml" },
      cache: "no-store",
    });
    clearTimeout(timeout);
    if (!res.ok) return [];
    const xml = await res.text();
    return parseItems(xml, source);
  } catch {
    return [];
  }
}

async function fetchAllNews(): Promise<NewsItem[]> {
  const results = await Promise.all(FEEDS.map((f) => fetchFeed(f.url, f.source)));
  const all = results.flat();

  const seen = new Set<string>();
  const deduped: NewsItem[] = [];
  for (const item of all) {
    const key = item.headline.slice(0, 40).toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      deduped.push(item);
    }
    if (deduped.length >= 12) break;
  }

  return deduped;
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
  if (cachedNews && now < cacheExpiresAt) {
    return NextResponse.json({ news: cachedNews, cached: true }, { headers: { "Cache-Control": "no-store" } });
  }

  const news = await fetchAllNews();

  if (news.length > 0) {
    cachedNews = news;
    cacheExpiresAt = now + CACHE_TTL_MS;
  }

  return NextResponse.json(
    { news: news.length > 0 ? news : cachedNews ?? [], cached: false },
    { headers: { "Cache-Control": "no-store" } },
  );
}
