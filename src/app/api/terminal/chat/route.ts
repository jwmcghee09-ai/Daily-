import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

const ALPACA_BASE = "https://paper-api.alpaca.markets/v2";
const ALPACA_DATA = "https://data.alpaca.markets/v2";
const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_MODEL = "llama-3.3-70b-versatile";
const MAX_TURNS = 8;

function alpacaHeaders() {
  return {
    "APCA-API-KEY-ID": process.env.ALPACA_API_KEY ?? "",
    "APCA-API-SECRET-KEY": process.env.ALPACA_API_SECRET ?? "",
    "Content-Type": "application/json",
  };
}

async function executeTool(name: string, args: Record<string, unknown>): Promise<string> {
  try {
    if (name === "get_account") return JSON.stringify(await (await fetch(`${ALPACA_BASE}/account`, { headers: alpacaHeaders(), cache: "no-store" })).json());
    if (name === "get_positions") return JSON.stringify(await (await fetch(`${ALPACA_BASE}/positions`, { headers: alpacaHeaders(), cache: "no-store" })).json());
    if (name === "get_quote") {
      const sym = String(args.symbol ?? "").toUpperCase().replace(/[^A-Z]/g, "");
      if (!sym) return JSON.stringify({ error: "symbol required" });
      return JSON.stringify(await (await fetch(`${ALPACA_BASE}/stocks/${sym}/snapshot`, { headers: alpacaHeaders(), cache: "no-store" })).json());
    }
    if (name === "get_bars") {
      const sym = String(args.symbol ?? "").toUpperCase().replace(/[^A-Z]/g, "");
      const d = Math.min(Number(args.days ?? 5), 30);
      const end = new Date(); const start = new Date(end.getTime() - (d + 5) * 864e5);
      const p = new URLSearchParams({ symbols: sym, timeframe: "1Day", start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10), limit: String(d), feed: "iex" });
      return JSON.stringify(await (await fetch(`${ALPACA_DATA}/stocks/bars?${p}`, { headers: alpacaHeaders(), cache: "no-store" })).json());
    }
    if (name === "place_order") {
      const sym = String(args.symbol ?? "").toUpperCase().replace(/[^A-Z]/g, "");
      const qty = Number(args.qty); const side = String(args.side ?? "").toLowerCase();
      if (!sym || !qty || !["buy", "sell"].includes(side)) return JSON.stringify({ error: "symbol, qty, side required" });
      const res = await fetch(`${ALPACA_BASE}/orders`, { method: "POST", headers: alpacaHeaders(), body: JSON.stringify({ symbol: sym, qty: String(qty), side, type: "market", time_in_force: "day" }) });
      return JSON.stringify(await res.json());
    }
    if (name === "get_orders") {
      const status = String(args.status ?? "open");
      return JSON.stringify(await (await fetch(`${ALPACA_BASE}/orders?status=${status}&limit=20`, { headers: alpacaHeaders(), cache: "no-store" })).json());
    }
    return JSON.stringify({ error: `Unknown tool: ${name}` });
  } catch (e) { return JSON.stringify({ error: e instanceof Error ? e.message : String(e) }); }
}

const TOOLS = [
  { type: "function", function: { name: "get_account", description: "Get Alpaca paper account equity, cash, buying power.", parameters: { type: "object", properties: {}, required: [] } } },
  { type: "function", function: { name: "get_positions", description: "Get all open positions with P&L.", parameters: { type: "object", properties: {}, required: [] } } },
  { type: "function", function: { name: "get_quote", description: "Get live price snapshot for a US stock.", parameters: { type: "object", properties: { symbol: { type: "string" } }, required: ["symbol"] } } },
  { type: "function", function: { name: "get_bars", description: "Get daily OHLCV bars (max 30 days).", parameters: { type: "object", properties: { symbol: { type: "string" }, days: { type: "number" } }, required: ["symbol"] } } },
  { type: "function", function: { name: "place_order", description: "Place a market order. Keep ≥20% cash, max 10% per position.", parameters: { type: "object", properties: { symbol: { type: "string" }, qty: { type: "number" }, side: { type: "string", enum: ["buy", "sell"] } }, required: ["symbol", "qty", "side"] } } },
  { type: "function", function: { name: "get_orders", description: "Get recent orders.", parameters: { type: "object", properties: { status: { type: "string", enum: ["open", "closed", "all"] } }, required: [] } } },
];

const SYSTEM = `You are Myrmidon — SPECTRE's autonomous trading agent managing a US equities paper account on Alpaca.

PORTFOLIO RULES: Core sleeve (70%): SPY 40%, QQQ 20%, VEA 15%. Satellite sleeve (30%): active trades max 10% each. Always ≥20% cash. Stop-loss at -15% unrealised. Never chase >30% in 2 weeks.

Always check account and positions before recommending trades. Be decisive, explain reasoning clearly.`;

export async function POST(req: NextRequest) {
  if (process.env.NODE_ENV !== "development") {
    const key = req.headers.get("x-terminal-key");
    const secret = process.env.TRADING_SECRET;
    if (!secret || key !== secret) return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  const groqKey = process.env.GROQ_API_KEY;
  if (!groqKey) return NextResponse.json({ error: "GROQ_API_KEY not set in .env.local" }, { status: 503 });

  let body: { messages?: unknown };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  if (!Array.isArray(body.messages) || !body.messages.length) return NextResponse.json({ error: "messages required" }, { status: 400 });

  interface OAIMessage { role: "user" | "assistant" | "tool"; content: string | null; tool_calls?: { id: string; type: "function"; function: { name: string; arguments: string } }[]; tool_call_id?: string; }
  const messages: OAIMessage[] = (body.messages as OAIMessage[]).map(m => ({ role: m.role, content: String(m.content ?? "") }));

  let reply = "";
  for (let turn = 0; turn < MAX_TURNS; turn++) {
    let res = await fetch(GROQ_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${groqKey}` },
      body: JSON.stringify({ model: GROQ_MODEL, messages: [{ role: "system", content: SYSTEM }, ...messages], tools: TOOLS, tool_choice: "auto", max_tokens: 900 }),
    });
    if (res.status === 429) {
      await new Promise(r => setTimeout(r, 25000));
      res = await fetch(GROQ_URL, { method: "POST", headers: { "Content-Type": "application/json", "Authorization": `Bearer ${groqKey}` }, body: JSON.stringify({ model: GROQ_MODEL, messages: [{ role: "system", content: SYSTEM }, ...messages], tools: TOOLS, tool_choice: "auto", max_tokens: 900 }) });
    }
    if (!res.ok) { const err = await res.text(); throw new Error(`Groq: ${err.slice(0, 300)}`); }

    const data = await res.json() as { choices: [{ message: { content: string | null; tool_calls?: { id: string; type: "function"; function: { name: string; arguments: string } }[] }; finish_reason: string }] };
    const msg = data.choices[0].message;
    const finish = data.choices[0].finish_reason;
    if (msg.content) reply = msg.content;
    if (finish !== "tool_calls" || !msg.tool_calls?.length) break;
    messages.push({ role: "assistant", content: msg.content ?? "", tool_calls: msg.tool_calls });
    for (const tc of msg.tool_calls) {
      let args: Record<string, unknown> = {};
      try { args = JSON.parse(tc.function.arguments); } catch { /* ok */ }
      const result = await executeTool(tc.function.name, args);
      messages.push({ role: "tool", tool_call_id: tc.id, content: result.slice(0, 1200) });
    }
  }

  return NextResponse.json({ reply: reply || "No response." });
}
