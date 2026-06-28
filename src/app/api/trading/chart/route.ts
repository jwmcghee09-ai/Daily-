import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";

const TRADER_EMAIL = "jwmcghee09@gmail.com";
const ALPACA_DATA = "https://data.alpaca.markets/v2";
export const runtime = "nodejs";

function ema(prices: number[], period: number): number[] {
  const k = 2 / (period + 1);
  const out: number[] = new Array(period - 1).fill(NaN);
  let e = prices.slice(0, period).reduce((a, b) => a + b, 0) / period;
  out.push(e);
  for (let i = period; i < prices.length; i++) {
    e = prices[i] * k + e * (1 - k);
    out.push(e);
  }
  return out;
}

function rsi(closes: number[], period = 14): number[] {
  const out: number[] = new Array(period).fill(NaN);
  let g = 0, l = 0;
  for (let i = 1; i <= period; i++) {
    const d = closes[i] - closes[i - 1];
    if (d > 0) g += d; else l -= d;
  }
  g /= period; l /= period;
  out.push(l === 0 ? 100 : 100 - 100 / (1 + g / l));
  for (let i = period + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    g = (g * (period - 1) + Math.max(d, 0)) / period;
    l = (l * (period - 1) + Math.max(-d, 0)) / period;
    out.push(l === 0 ? 100 : 100 - 100 / (1 + g / l));
  }
  return out;
}

function macd(closes: number[]): { line: number[]; signal: number[]; hist: number[] } {
  const fast = ema(closes, 12);
  const slow = ema(closes, 26);
  const line = closes.map((_, i) => (isNaN(fast[i]) || isNaN(slow[i])) ? NaN : fast[i] - slow[i]);
  const validLine = line.filter(v => !isNaN(v));
  const sig = ema(validLine, 9);
  let si = 0;
  const signal: number[] = line.map(v => isNaN(v) ? NaN : (sig[si++] ?? NaN));
  const hist = line.map((v, i) => (isNaN(v) || isNaN(signal[i])) ? NaN : v - signal[i]);
  return { line, signal, hist };
}

function bollinger(closes: number[], period = 20, mult = 2): { upper: number[]; mid: number[]; lower: number[] } {
  const upper: number[] = [], mid: number[] = [], lower: number[] = [];
  for (let i = 0; i < closes.length; i++) {
    if (i < period - 1) { upper.push(NaN); mid.push(NaN); lower.push(NaN); continue; }
    const w = closes.slice(i - period + 1, i + 1);
    const m = w.reduce((a, b) => a + b) / period;
    const s = Math.sqrt(w.reduce((a, b) => a + (b - m) ** 2, 0) / period);
    mid.push(m); upper.push(m + mult * s); lower.push(m - mult * s);
  }
  return { upper, mid, lower };
}

const n2 = (v: number) => isNaN(v) ? null : +v.toFixed(2);
const n4 = (v: number) => isNaN(v) ? null : +v.toFixed(4);

export async function GET(request: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user || user.email !== TRADER_EMAIL) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const symbol = (searchParams.get("symbol") ?? "SPY").toUpperCase().replace(/[^A-Z]/g, "");
  const days = Math.min(Math.max(Number(searchParams.get("days") ?? 90), 30), 365);

  const { ALPACA_API_KEY: key, ALPACA_API_SECRET: secret } = process.env;
  if (!key || !secret) return NextResponse.json({ error: "Not configured" }, { status: 503 });

  // Extra warmup bars for EMA200 calculation
  const end = new Date();
  const start = new Date(end.getTime() - (days + 280) * 864e5);

  const params = new URLSearchParams({
    timeframe: "1Day",
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
    limit: String(days + 280),
    feed: "iex",
  });

  const res = await fetch(`${ALPACA_DATA}/stocks/${symbol}/bars?${params}`, {
    headers: { "APCA-API-KEY-ID": key, "APCA-API-SECRET-KEY": secret },
    cache: "no-store",
  });

  if (!res.ok) return NextResponse.json({ error: "Alpaca fetch failed" }, { status: 502 });

  const raw = await res.json() as { bars?: Array<{ t: string; o: number; h: number; l: number; c: number; v: number }> };
  const bars = raw.bars ?? [];
  if (bars.length < 20) return NextResponse.json({ bars: [], symbol });

  const closes = bars.map(b => b.c);
  const r = rsi(closes);
  const m = macd(closes);
  const bb = bollinger(closes);
  const e50 = ema(closes, 50);
  const e200 = ema(closes, 200);

  const tail = bars.slice(-days);
  const offset = bars.length - days;

  const result = tail.map((b, j) => {
    const i = j + offset;
    return {
      date: b.t.slice(0, 10),
      open: b.o, high: b.h, low: b.l, close: b.c, volume: b.v,
      rsi: n2(r[i]),
      macd: n4(m.line[i]), signal: n4(m.signal[i]), histogram: n4(m.hist[i]),
      bb_upper: n2(bb.upper[i]), bb_mid: n2(bb.mid[i]), bb_lower: n2(bb.lower[i]),
      ema50: n2(e50[i]), ema200: n2(e200[i]),
    };
  });

  return NextResponse.json({ bars: result, symbol });
}
