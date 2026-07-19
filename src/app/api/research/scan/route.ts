import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";

export const runtime = "nodejs";
export const maxDuration = 30;

interface Anomaly {
  severity: "alert" | "watch" | "info";
  title: string;
  detail: string;
}

interface YahooChart {
  chart?: {
    result?: Array<{
      meta?: { regularMarketPrice?: number; currency?: string; shortName?: string; longName?: string; exchangeName?: string };
      timestamp?: number[];
      indicators?: { quote?: Array<{ close?: (number | null)[]; open?: (number | null)[]; high?: (number | null)[]; low?: (number | null)[]; volume?: (number | null)[] }> };
    }>;
    error?: { description?: string } | null;
  };
}

type ChartResult = NonNullable<NonNullable<YahooChart["chart"]>["result"]>[number];

async function fetchChart(symbol: string): Promise<ChartResult | null> {
  try {
    const r = await fetch(
      `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1y`,
      { headers: { "User-Agent": "Mozilla/5.0" }, cache: "no-store", signal: AbortSignal.timeout(9000) },
    );
    if (!r.ok) return null;
    const d = (await r.json()) as YahooChart;
    const res = d?.chart?.result?.[0];
    if (!res?.indicators?.quote?.[0]?.close?.length) return null;
    return res;
  } catch {
    return null;
  }
}

function rsi14(closes: number[]): number | null {
  if (closes.length < 15) return null;
  let gain = 0, loss = 0;
  for (let i = closes.length - 14; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff >= 0) gain += diff; else loss -= diff;
  }
  if (gain + loss === 0) return 50;
  const rs = loss === 0 ? 100 : gain / loss;
  return 100 - 100 / (1 + rs);
}

function mean(xs: number[]): number { return xs.reduce((s, x) => s + x, 0) / (xs.length || 1); }
function stdev(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / (xs.length - 1));
}

export async function GET(request: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "Sign in to use the scanner" }, { status: 403 });

  const raw = (request.nextUrl.searchParams.get("symbol") ?? "").trim().toUpperCase();
  const cleaned = raw.replace(/[^A-Z0-9.\-]/g, "").slice(0, 12);
  if (!cleaned) return NextResponse.json({ error: "symbol required" }, { status: 400 });

  // AU-first resolution: bare tickers try ASX (.AX) before the US listing.
  const candidates = cleaned.includes(".")
    ? [cleaned]
    : [`${cleaned}.AX`, cleaned];

  let res = null;
  let used = "";
  for (const sym of candidates) {
    res = await fetchChart(sym);
    if (res) { used = sym; break; }
  }
  if (!res) return NextResponse.json({ error: `No data found for "${cleaned}" — check the ticker` }, { status: 404 });

  const q = res.indicators!.quote![0];
  const rows: { c: number; o: number; h: number; l: number; v: number }[] = [];
  for (let i = 0; i < (q.close?.length ?? 0); i++) {
    const c = q.close?.[i], o = q.open?.[i], h = q.high?.[i], l = q.low?.[i], v = q.volume?.[i];
    if (c != null && c > 0) rows.push({ c, o: o ?? c, h: h ?? c, l: l ?? c, v: v ?? 0 });
  }
  if (rows.length < 30) return NextResponse.json({ error: "Not enough trading history to scan" }, { status: 422 });

  const closes = rows.map(r => r.c);
  const vols = rows.map(r => r.v).filter(v => v > 0);
  const last = rows[rows.length - 1];
  const prev = rows[rows.length - 2];
  const price = last.c;
  const dayPct = prev.c > 0 ? ((last.c - prev.c) / prev.c) * 100 : 0;

  const ma50 = closes.length >= 50 ? mean(closes.slice(-50)) : null;
  const ma200 = closes.length >= 200 ? mean(closes.slice(-200)) : null;
  const rsi = rsi14(closes);
  const hi52 = Math.max(...rows.map(r => r.h));
  const lo52 = Math.min(...rows.map(r => r.l));
  const avgVol20 = vols.length >= 21 ? mean(vols.slice(-21, -1)) : null;
  const volRatio = avgVol20 && avgVol20 > 0 ? last.v / avgVol20 : null;
  const gapPct = prev.c > 0 ? ((last.o - prev.c) / prev.c) * 100 : 0;
  const rets = closes.slice(1).map((c, i) => (closes[i] > 0 ? (c - closes[i]) / closes[i] : 0));
  const vol10 = stdev(rets.slice(-10));
  const vol60 = stdev(rets.slice(-60));
  const drawdownPct = hi52 > 0 ? ((price - hi52) / hi52) * 100 : 0;
  const retFrom = (daysBack: number) => {
    const base = closes[closes.length - 1 - daysBack];
    return base != null && base > 0 ? ((price - base) / base) * 100 : null;
  };
  const ret30 = closes.length > 21 ? retFrom(21) : null;
  const ret90 = closes.length > 63 ? retFrom(63) : null;
  const ret1y = closes[0] > 0 ? ((price - closes[0]) / closes[0]) * 100 : null;
  const pos52w = hi52 > lo52 ? ((price - lo52) / (hi52 - lo52)) * 100 : null;
  const volXNorm = vol60 > 0 ? vol10 / vol60 : null;
  const annVolPct = vol60 > 0 ? vol60 * Math.sqrt(252) * 100 : null;
  const ma50DistPct = ma50 != null && ma50 > 0 ? ((price - ma50) / ma50) * 100 : null;
  const ma200DistPct = ma200 != null && ma200 > 0 ? ((price - ma200) / ma200) * 100 : null;

  const anomalies: Anomaly[] = [];
  const add = (severity: Anomaly["severity"], title: string, detail: string) => anomalies.push({ severity, title, detail });

  if (rsi != null && rsi >= 75) add("alert", `RSI ${rsi.toFixed(0)} — heavily overbought`, "Momentum is stretched. Late entries here historically face pullback risk.");
  else if (rsi != null && rsi >= 68) add("watch", `RSI ${rsi.toFixed(0)} — running hot`, "Approaching overbought territory. Watch for exhaustion.");
  else if (rsi != null && rsi <= 25) add("alert", `RSI ${rsi.toFixed(0)} — heavily oversold`, "Selling pressure is extreme. Sometimes a washout, sometimes a falling knife — check the news before touching it.");
  else if (rsi != null && rsi <= 32) add("watch", `RSI ${rsi.toFixed(0)} — oversold zone`, "Weak momentum. If fundamentals are intact this is where dip-buyers start looking.");

  if (volRatio != null && volRatio >= 3) add("alert", `Volume ${volRatio.toFixed(1)}× the 20-day average`, "Unusual activity — something moved the crowd today. Check announcements before acting.");
  else if (volRatio != null && volRatio >= 1.8) add("watch", `Volume ${volRatio.toFixed(1)}× average`, "Elevated turnover versus the last month.");

  if (Math.abs(gapPct) >= 4) add("alert", `Opened ${gapPct > 0 ? "up" : "down"} ${Math.abs(gapPct).toFixed(1)}% on a gap`, "Price jumped between sessions — usually news-driven. Gaps often get retested.");
  if (Math.abs(dayPct) >= 5) add("alert", `Moved ${dayPct > 0 ? "+" : ""}${dayPct.toFixed(1)}% today`, "An outsized single-day move for most names. Confirm the cause before reacting.");

  if (hi52 > 0 && price >= hi52 * 0.98) add("watch", "Within 2% of its 52-week high", "Breakout territory — momentum names can run, but this is also where profit-taking clusters.");
  if (lo52 > 0 && price <= lo52 * 1.02) add("watch", "Within 2% of its 52-week low", "Testing the floor. Either deep value or a business problem — the chart can't tell you which.");

  if (ma50 != null && ma200 != null) {
    if (ma50 > ma200 && price < ma50) add("info", "Uptrend, but under the 50-day average", "Longer trend still up; short-term momentum has cooled.");
    if (ma50 < ma200) add("watch", "50-day average below 200-day (death-cross regime)", "The medium-term trend is down. Rallies inside this regime fail more often.");
  }
  if (vol60 > 0 && vol10 / vol60 >= 1.8) add("watch", `Volatility ${(vol10 / vol60).toFixed(1)}× its recent norm`, "Daily swings have widened sharply — size positions accordingly.");
  if (drawdownPct <= -30) add("info", `${Math.abs(drawdownPct).toFixed(0)}% below its 52-week high`, "Deep drawdown. Recovery requires the underlying problem to be fixed, not just time.");

  if (anomalies.length === 0) add("info", "No anomalies flagged", "Price, volume, momentum and volatility all look unremarkable versus this stock's own recent history.");

  return NextResponse.json({
    symbol: used,
    name: res.meta?.shortName || res.meta?.longName || used,
    currency: res.meta?.currency || "",
    exchange: res.meta?.exchangeName || "",
    price,
    dayPct,
    open: last.o,
    high: last.h,
    low: last.l,
    prevClose: prev.c,
    gapPct,
    ret30,
    ret90,
    ret1y,
    rsi,
    ma50,
    ma200,
    ma50DistPct,
    ma200DistPct,
    hi52,
    lo52,
    pos52w,
    volRatio,
    lastVol: last.v || null,
    avgVol20,
    volXNorm,
    annVolPct,
    drawdownPct,
    spark: closes.slice(-90),
    anomalies,
    disclaimer: "Possible anomalies only — statistical flags, not financial advice. You have the final say on every decision.",
  });
}
