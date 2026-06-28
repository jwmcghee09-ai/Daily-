import { NextRequest, NextResponse } from "next/server";
import { readTradingMemory, writeTradingMemory } from "@/lib/db";

export const runtime = "nodejs";
export const maxDuration = 120;

const ALPACA_BASE = "https://paper-api.alpaca.markets/v2";
const ALPACA_DATA = "https://data.alpaca.markets/v2";
const ALPACA_NEWS = "https://data.alpaca.markets/v1beta1/news";
const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_MODEL = "llama-3.3-70b-versatile";
const MAX_TURNS = 10;

function alpacaHeaders() {
  return {
    "APCA-API-KEY-ID": process.env.ALPACA_API_KEY ?? "",
    "APCA-API-SECRET-KEY": process.env.ALPACA_API_SECRET ?? "",
    "Content-Type": "application/json",
  };
}

async function fetchAudUsd(): Promise<number | null> {
  try {
    const r = await fetch(
      "https://query2.finance.yahoo.com/v8/finance/chart/AUDUSD%3DX?interval=1d&range=5d",
      { headers: { "User-Agent": "Mozilla/5.0" }, cache: "no-store" }
    );
    if (!r.ok) return null;
    const d = await r.json() as { chart?: { result?: Array<{ meta?: { regularMarketPrice?: number } }> } };
    const rate = d?.chart?.result?.[0]?.meta?.regularMarketPrice;
    return typeof rate === "number" && rate > 0 ? rate : null;
  } catch { return null; }
}

async function fetchYahooQuote(symbol: string): Promise<{ price: number; change: number; changePct: number } | null> {
  try {
    const enc = encodeURIComponent(symbol);
    const r = await fetch(
      `https://query2.finance.yahoo.com/v8/finance/chart/${enc}?interval=1d&range=2d`,
      { headers: { "User-Agent": "Mozilla/5.0" }, cache: "no-store" }
    );
    if (!r.ok) return null;
    const d = await r.json() as { chart?: { result?: Array<{ meta?: { regularMarketPrice?: number; previousClose?: number; regularMarketChangePercent?: number } }> } };
    const meta = d?.chart?.result?.[0]?.meta;
    if (!meta?.regularMarketPrice) return null;
    const price = meta.regularMarketPrice;
    const prev = meta.previousClose ?? price;
    const change = price - prev;
    const changePct = prev > 0 ? (change / prev) * 100 : 0;
    return { price, change, changePct };
  } catch { return null; }
}

async function executeTool(name: string, args: Record<string, unknown>): Promise<string> {
  try {
    // ── Alpaca tools ──
    if (name === "get_account") {
      return JSON.stringify(await (await fetch(`${ALPACA_BASE}/account`, { headers: alpacaHeaders(), cache: "no-store" })).json());
    }

    if (name === "get_positions") {
      return JSON.stringify(await (await fetch(`${ALPACA_BASE}/positions`, { headers: alpacaHeaders(), cache: "no-store" })).json());
    }

    if (name === "get_quote") {
      const sym = String(args.symbol ?? "").toUpperCase().replace(/[^A-Z]/g, "");
      if (!sym) return JSON.stringify({ error: "symbol required" });
      return JSON.stringify(await (await fetch(`${ALPACA_BASE}/stocks/${sym}/snapshot`, { headers: alpacaHeaders(), cache: "no-store" })).json());
    }

    if (name === "get_bars") {
      const sym = String(args.symbol ?? "").toUpperCase().replace(/[^A-Z]/g, "");
      const d = Math.min(Number(args.days ?? 5), 30);
      const end = new Date();
      const start = new Date(end.getTime() - (d + 5) * 864e5);
      const p = new URLSearchParams({ symbols: sym, timeframe: "1Day", start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10), limit: String(d), feed: "iex" });
      return JSON.stringify(await (await fetch(`${ALPACA_DATA}/stocks/bars?${p}`, { headers: alpacaHeaders(), cache: "no-store" })).json());
    }

    if (name === "place_order") {
      const sym = String(args.symbol ?? "").toUpperCase().replace(/[^A-Z]/g, "");
      const qty = Number(args.qty);
      const side = String(args.side ?? "").toLowerCase();
      if (!sym || !qty || !["buy", "sell"].includes(side)) return JSON.stringify({ error: "symbol, qty, side required" });
      const res = await fetch(`${ALPACA_BASE}/orders`, {
        method: "POST",
        headers: alpacaHeaders(),
        body: JSON.stringify({ symbol: sym, qty: String(qty), side, type: "market", time_in_force: "day" }),
      });
      return JSON.stringify(await res.json());
    }

    if (name === "get_orders") {
      const status = String(args.status ?? "open");
      return JSON.stringify(await (await fetch(`${ALPACA_BASE}/orders?status=${status}&limit=20`, { headers: alpacaHeaders(), cache: "no-store" })).json());
    }

    // ── News ──
    if (name === "get_news") {
      const sym = String(args.symbol ?? "").toUpperCase().replace(/[^A-Z,]/g, "");
      const limit = Math.min(Number(args.limit ?? 8), 20);
      const params = new URLSearchParams({ limit: String(limit), sort: "desc", include_content: "false" });
      if (sym) params.set("symbols", sym);
      const headers = { ...alpacaHeaders() };
      delete (headers as Record<string, string>)["Content-Type"];
      const r = await fetch(`${ALPACA_NEWS}?${params}`, { headers, cache: "no-store" });
      if (!r.ok) return JSON.stringify({ error: `Alpaca news ${r.status}` });
      const data = await r.json() as { news?: Array<{ headline: string; summary: string; source: string; created_at: string; symbols: string[] }> };
      const articles = (data.news ?? []).map(a => ({
        headline: a.headline,
        summary: a.summary?.slice(0, 200),
        source: a.source,
        date: a.created_at,
        symbols: a.symbols,
      }));
      return JSON.stringify({ articles });
    }

    // ── Macro data ──
    if (name === "get_macro") {
      const MACRO_SYMBOLS: Record<string, string> = {
        "VIX": "^VIX",
        "SP500": "^GSPC",
        "NASDAQ": "^IXIC",
        "TREASURY_10Y": "^TNX",
        "GOLD": "GC=F",
        "OIL_WTI": "CL=F",
        "BTC": "BTC-USD",
        "AUD_USD": "AUDUSD=X",
        "DXY": "DX-Y.NYB",
      };
      const results: Record<string, unknown> = {};
      await Promise.all(
        Object.entries(MACRO_SYMBOLS).map(async ([key, ySymbol]) => {
          const q = await fetchYahooQuote(ySymbol);
          results[key] = q ?? "unavailable";
        })
      );
      return JSON.stringify(results);
    }

    // ── Memory ──
    if (name === "save_memory") {
      const strategy = String(args.strategy ?? "").trim();
      const lesson = String(args.lesson ?? "").trim();
      if (!strategy && !lesson) return JSON.stringify({ error: "strategy or lesson required" });
      let existing = null;
      try { existing = readTradingMemory(); } catch { /* db not configured */ }
      const existingStrategy = strategy || (existing?.strategy ?? "");
      const existingLessons = existing?.lessons ?? [];
      const newLessons = lesson ? [...existingLessons, lesson] : existingLessons;
      try {
        writeTradingMemory(existingStrategy, newLessons);
        return JSON.stringify({ saved: true, strategy: existingStrategy, lessonCount: newLessons.length });
      } catch (e) {
        return JSON.stringify({ error: "DB not available: " + (e instanceof Error ? e.message : String(e)) });
      }
    }

    if (name === "get_memory") {
      try {
        const mem = readTradingMemory();
        return JSON.stringify(mem ?? { strategy: null, lessons: [], note: "No memory saved yet" });
      } catch (e) {
        return JSON.stringify({ error: "DB not available: " + (e instanceof Error ? e.message : String(e)) });
      }
    }

    return JSON.stringify({ error: `Unknown tool: ${name}` });
  } catch (e) {
    return JSON.stringify({ error: e instanceof Error ? e.message : String(e) });
  }
}

const TOOLS = [
  { type: "function", function: { name: "get_account", description: "Get Alpaca paper account equity, cash, buying power.", parameters: { type: "object", properties: {}, required: [] } } },
  { type: "function", function: { name: "get_positions", description: "Get all open positions with P&L.", parameters: { type: "object", properties: {}, required: [] } } },
  { type: "function", function: { name: "get_quote", description: "Get live price snapshot for a US stock.", parameters: { type: "object", properties: { symbol: { type: "string", description: "Ticker symbol e.g. AAPL" } }, required: ["symbol"] } } },
  { type: "function", function: { name: "get_bars", description: "Get daily OHLCV bars (max 30 days) for a US stock.", parameters: { type: "object", properties: { symbol: { type: "string" }, days: { type: "number", description: "Number of trading days, max 30" } }, required: ["symbol"] } } },
  { type: "function", function: { name: "place_order", description: "Place a market order. Keep ≥20% cash, max 10% per position.", parameters: { type: "object", properties: { symbol: { type: "string" }, qty: { type: "number" }, side: { type: "string", enum: ["buy", "sell"] } }, required: ["symbol", "qty", "side"] } } },
  { type: "function", function: { name: "get_orders", description: "Get recent orders.", parameters: { type: "object", properties: { status: { type: "string", enum: ["open", "closed", "all"] } }, required: [] } } },
  { type: "function", function: { name: "get_news", description: "Get latest market news. Pass a symbol for stock-specific news, or omit for broad market news.", parameters: { type: "object", properties: { symbol: { type: "string", description: "Ticker or comma-separated tickers e.g. AAPL,MSFT — omit for market-wide news" }, limit: { type: "number", description: "Number of articles, max 20" } }, required: [] } } },
  { type: "function", function: { name: "get_macro", description: "Get live macro indicators: VIX, S&P 500, NASDAQ, 10Y Treasury yield, Gold, Oil (WTI), Bitcoin, AUD/USD, DXY dollar index.", parameters: { type: "object", properties: {}, required: [] } } },
  { type: "function", function: { name: "save_memory", description: "Persist a strategy update or lesson learned to long-term memory. Use this to remember decisions, rules, and observations across sessions.", parameters: { type: "object", properties: { strategy: { type: "string", description: "Updated portfolio strategy description (replaces existing)" }, lesson: { type: "string", description: "A specific lesson or observation to append to the lessons list" } }, required: [] } } },
  { type: "function", function: { name: "get_memory", description: "Read the current saved strategy and lessons from long-term memory.", parameters: { type: "object", properties: {}, required: [] } } },
];

export async function POST(req: NextRequest) {
  const secret = process.env.TRADING_SECRET;
  if (secret) {
    const key = req.headers.get("x-terminal-key");
    if (key !== secret) return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  const groqKey = process.env.GROQ_API_KEY;
  if (!groqKey) return NextResponse.json({ error: "GROQ_API_KEY not set" }, { status: 503 });

  let body: { messages?: unknown };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  if (!Array.isArray(body.messages) || !body.messages.length) return NextResponse.json({ error: "messages required" }, { status: 400 });

  // Fetch context to inject into system prompt
  const [audUsd, memory] = await Promise.all([
    fetchAudUsd(),
    (async () => { try { return readTradingMemory(); } catch { return null; } })(),
  ]);

  const contextLines: string[] = [];
  if (audUsd) contextLines.push(`Current AUD/USD rate: ${audUsd.toFixed(4)} (use this to convert USD values to AUD when helpful)`);
  if (memory?.strategy) contextLines.push(`\nSaved strategy memory:\n${memory.strategy}`);
  if (memory?.lessons?.length) contextLines.push(`\nLessons learned:\n${memory.lessons.slice(-5).map((l, i) => `${i + 1}. ${l}`).join("\n")}`);

  const SYSTEM = `You are Myrmidon — SPECTRE's autonomous trading agent managing a US equities paper account on Alpaca.

PORTFOLIO RULES: Core sleeve (70%): SPY 40%, QQQ 20%, VEA 15%. Satellite sleeve (30%): active trades max 10% each. Always ≥20% cash. Stop-loss at -15% unrealised. Never chase >30% in 2 weeks.

Always check account and positions before recommending trades. Use get_macro for market context. Use get_news for stock-specific or market news. Use save_memory to persist important decisions and lessons. Be decisive and explain your reasoning clearly.${contextLines.length ? "\n\n" + contextLines.join("\n") : ""}`;

  interface OAIMessage {
    role: "user" | "assistant" | "tool";
    content: string | null;
    tool_calls?: { id: string; type: "function"; function: { name: string; arguments: string } }[];
    tool_call_id?: string;
  }

  const messages: OAIMessage[] = (body.messages as OAIMessage[]).map(m => ({
    role: m.role,
    content: String(m.content ?? ""),
  }));

  let reply = "";
  for (let turn = 0; turn < MAX_TURNS; turn++) {
    const res = await fetch(GROQ_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${groqKey}` },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages: [{ role: "system", content: SYSTEM }, ...messages],
        tools: TOOLS,
        tool_choice: "auto",
        max_tokens: 1200,
      }),
    });

    if (res.status === 429) {
      return NextResponse.json({ reply: "Groq rate limit hit — wait 30 seconds and try again (free tier: 12k tokens/min)." });
    }
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Groq ${res.status}: ${err.slice(0, 200)}`);
    }

    const data = await res.json() as {
      choices: [{
        message: {
          content: string | null;
          tool_calls?: { id: string; type: "function"; function: { name: string; arguments: string } }[];
        };
        finish_reason: string;
      }];
    };
    const msg = data.choices[0].message;
    const finish = data.choices[0].finish_reason;
    if (msg.content) reply = msg.content;
    if (finish !== "tool_calls" || !msg.tool_calls?.length) break;

    messages.push({ role: "assistant", content: msg.content ?? "", tool_calls: msg.tool_calls });
    for (const tc of msg.tool_calls) {
      let args: Record<string, unknown> = {};
      try { args = JSON.parse(tc.function.arguments); } catch { /* ok */ }
      const result = await executeTool(tc.function.name, args);
      messages.push({ role: "tool", tool_call_id: tc.id, content: result.slice(0, 2000) });
    }
  }

  // Auto-save memory after every response
  if (reply) {
    autoSaveMemory(messages, reply, groqKey, memory).catch(() => { /* silent */ });
  }

  return NextResponse.json({ reply: reply || "No response." });
}

async function autoSaveMemory(
  messages: Array<{ role: string; content: string | null }>,
  reply: string,
  groqKey: string,
  existing: { strategy: string; lessons: string[]; updatedAt: string } | null
) {
  // Build a compact conversation transcript (user + assistant turns only)
  const transcript = messages
    .filter(m => m.role === "user" || m.role === "assistant")
    .map(m => `${m.role === "user" ? "USER" : "MYRMIDON"}: ${(m.content ?? "").slice(0, 400)}`)
    .join("\n")
    .slice(0, 3000);

  const existingStrategy = existing?.strategy ?? "";
  const existingLessons = existing?.lessons ?? [];

  const prompt = `You are a memory extractor for an AI trading agent called Myrmidon.

Current saved strategy: ${existingStrategy || "(none)"}
Current lessons (${existingLessons.length}): ${existingLessons.slice(-5).join(" | ") || "(none)"}

Latest conversation:
${transcript}

MYRMIDON final reply: ${reply.slice(0, 800)}

Extract what should be saved to persistent memory. Output valid JSON only, no markdown:
{
  "strategy": "updated overall portfolio strategy if it changed or was discussed — keep existing text if no change, null to skip",
  "lesson": "one specific actionable lesson, trade decision, market observation, or rule update from THIS conversation — null if nothing new"
}`;

  try {
    const res = await fetch(GROQ_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${groqKey}` },
      body: JSON.stringify({
        model: "llama-3.1-8b-instant",
        messages: [{ role: "user", content: prompt }],
        max_tokens: 400,
        temperature: 0.1,
      }),
    });
    if (!res.ok) return;
    const data = await res.json() as { choices: [{ message: { content: string } }] };
    const text = data.choices[0].message.content ?? "";
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return;
    const parsed = JSON.parse(match[0]) as { strategy?: string | null; lesson?: string | null };
    const newStrategy = parsed.strategy ?? existingStrategy;
    const newLesson = parsed.lesson && parsed.lesson !== "null" ? parsed.lesson.trim() : null;
    const newLessons = newLesson ? [...existingLessons, newLesson] : existingLessons;
    if (newStrategy || newLessons.length) {
      writeTradingMemory(newStrategy, newLessons);
    }
  } catch { /* silent */ }
}
