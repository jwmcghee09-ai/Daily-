import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { readTradingMemory } from "@/lib/db";

const TRADER_EMAIL = "jwmcghee09@gmail.com";
const ALPACA_BASE = "https://paper-api.alpaca.markets/v2";
const CLAUDE_API = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-opus-4-7";
const MAX_TOOL_TURNS = 8;

export const runtime = "nodejs";
export const maxDuration = 120;

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface ChatBody {
  messages?: unknown;
}

function alpacaHeaders() {
  return {
    "APCA-API-KEY-ID": process.env.ALPACA_API_KEY ?? "",
    "APCA-API-SECRET-KEY": process.env.ALPACA_API_SECRET ?? "",
  };
}

async function alpacaFetch(path: string, method = "GET", body?: unknown): Promise<unknown> {
  const res = await fetch(`${ALPACA_BASE}${path}`, {
    method,
    headers: { ...alpacaHeaders(), "Content-Type": "application/json" },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });
  const text = await res.text();
  try { return JSON.parse(text); } catch { return { raw: text }; }
}

async function vpsFileFetch(endpoint: string, options?: RequestInit): Promise<unknown> {
  const vpsUrl = (process.env.VPS_MYRMIDON_URL ?? "").replace(/\/$/, "");
  const vpsSecret = process.env.VPS_MYRMIDON_SECRET ?? "";
  const res = await fetch(`${vpsUrl}${endpoint}`, {
    ...options,
    headers: { ...(options?.headers ?? {}), "x-trading-secret": vpsSecret, "Content-Type": "application/json" },
  });
  const text = await res.text();
  try { return JSON.parse(text); } catch { return { raw: text }; }
}

async function executeTool(name: string, input: Record<string, unknown>): Promise<string> {
  try {
    if (name === "get_account") return JSON.stringify(await alpacaFetch("/account"), null, 2);
    if (name === "get_positions") return JSON.stringify(await alpacaFetch("/positions"), null, 2);
    if (name === "get_quote") {
      const symbol = String(input.symbol ?? "").toUpperCase();
      if (!symbol) return JSON.stringify({ error: "symbol required" });
      const snap = await alpacaFetch(`/stocks/${symbol}/snapshots`);
      return JSON.stringify(snap, null, 2);
    }
    if (name === "get_bars") {
      const symbol = String(input.symbol ?? "").toUpperCase();
      const days = Math.min(Number(input.days ?? 5), 30);
      const end = new Date();
      const start = new Date(end);
      start.setDate(start.getDate() - days);
      const params = new URLSearchParams({ symbols: symbol, timeframe: "1Day", start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10), feed: "iex" });
      return JSON.stringify(await alpacaFetch(`/stocks/bars?${params}`), null, 2);
    }
    if (name === "place_order") {
      const symbol = String(input.symbol ?? "").toUpperCase();
      const qty = Number(input.qty);
      const side = String(input.side ?? "").toLowerCase();
      if (!symbol || !qty || !side) return JSON.stringify({ error: "symbol, qty, and side required" });
      return JSON.stringify(await alpacaFetch("/orders", "POST", { symbol, qty: String(qty), side, type: String(input.type ?? "market"), time_in_force: String(input.time_in_force ?? "day") }), null, 2);
    }
    if (name === "get_orders") return JSON.stringify(await alpacaFetch(`/orders?status=${String(input.status ?? "open")}&limit=20`), null, 2);
    if (name === "cancel_order") {
      const order_id = String(input.order_id ?? "");
      if (!order_id) return JSON.stringify({ error: "order_id required" });
      return JSON.stringify(await alpacaFetch(`/orders/${order_id}`, "DELETE") ?? { cancelled: true }, null, 2);
    }
    if (name === "read_vps_file") {
      const path = String(input.path ?? "");
      if (!path) return JSON.stringify({ error: "path required" });
      return JSON.stringify(await vpsFileFetch(`/api/files?path=${encodeURIComponent(path)}`), null, 2);
    }
    if (name === "write_vps_file") {
      const path = String(input.path ?? "");
      const content = String(input.content ?? "");
      if (!path) return JSON.stringify({ error: "path required" });
      return JSON.stringify(await vpsFileFetch("/api/files", { method: "POST", body: JSON.stringify({ path, content }) }), null, 2);
    }
    if (name === "list_vps_files") {
      const path = String(input.path ?? ".");
      return JSON.stringify(await vpsFileFetch(`/api/files/list?path=${encodeURIComponent(path)}`), null, 2);
    }
    if (name === "restart_vps_server") {
      return JSON.stringify(await vpsFileFetch("/api/restart", { method: "POST" }), null, 2);
    }
    return JSON.stringify({ error: `Unknown tool: ${name}` });
  } catch (error) {
    return JSON.stringify({ error: error instanceof Error ? error.message : String(error) });
  }
}

const TOOLS = [
  { name: "get_account", description: "Get current Alpaca paper trading account — equity, cash, buying power, portfolio value.", input_schema: { type: "object", properties: {}, required: [] } },
  { name: "get_positions", description: "Get all open positions — symbol, qty, market value, unrealized P&L.", input_schema: { type: "object", properties: {}, required: [] } },
  { name: "get_quote", description: "Get latest snapshot for a US stock symbol.", input_schema: { type: "object", properties: { symbol: { type: "string" } }, required: ["symbol"] } },
  { name: "get_bars", description: "Get daily OHLCV bars for a symbol (max 30 days).", input_schema: { type: "object", properties: { symbol: { type: "string" }, days: { type: "number" } }, required: ["symbol"] } },
  { name: "place_order", description: "Place a market or limit order. Max 10% of portfolio per position. Keep ≥20% cash.", input_schema: { type: "object", properties: { symbol: { type: "string" }, qty: { type: "number" }, side: { type: "string", enum: ["buy","sell"] }, type: { type: "string", enum: ["market","limit"] }, time_in_force: { type: "string", enum: ["day","gtc","ioc","fok"] } }, required: ["symbol","qty","side"] } },
  { name: "get_orders", description: "Get recent orders by status: open, closed, or all.", input_schema: { type: "object", properties: { status: { type: "string", enum: ["open","closed","all"] } }, required: [] } },
  { name: "cancel_order", description: "Cancel an open order by order ID.", input_schema: { type: "object", properties: { order_id: { type: "string" } }, required: ["order_id"] } },
  { name: "read_vps_file", description: "Read any file in the VPS project directory. Path is relative to the project root (e.g. 'agent.py', 'config/memory.json').", input_schema: { type: "object", properties: { path: { type: "string" } }, required: ["path"] } },
  { name: "write_vps_file", description: "Write or overwrite a file in the VPS project directory. Python changes take effect after restart_vps_server.", input_schema: { type: "object", properties: { path: { type: "string" }, content: { type: "string" } }, required: ["path", "content"] } },
  { name: "list_vps_files", description: "List files and directories in the VPS project. Defaults to project root.", input_schema: { type: "object", properties: { path: { type: "string" } }, required: [] } },
  { name: "restart_vps_server", description: "Restart the VPS FastAPI server so Python code changes take effect. Connection drops for ~2 seconds.", input_schema: { type: "object", properties: {}, required: [] } },
];

async function fetchAudUsdRate(): Promise<number | null> {
  try {
    const url = "https://query2.finance.yahoo.com/v8/finance/chart/AUDUSD%3DX?interval=1d&range=5d";
    const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" }, cache: "no-store" });
    if (!res.ok) return null;
    const data = (await res.json()) as { chart?: { result?: Array<{ meta?: { regularMarketPrice?: number } }> } };
    const rate = data?.chart?.result?.[0]?.meta?.regularMarketPrice;
    return typeof rate === "number" && rate > 0 ? rate : null;
  } catch {
    return null;
  }
}

const BASE_SYSTEM_PROMPT = `You are Myrmidon — SPECTRE's autonomous trading agent managing an Alpaca paper trading account.

RULES:
- Max 10% of portfolio value per single position
- Always maintain ≥20% cash floor
- Cut losses at -15% unrealised P&L per position
- Never chase a position up >30% in 2 weeks
- Only trade US equities available on Alpaca

CURRENCY:
- All Alpaca values (portfolio_value, equity, cash, market_value, etc.) are in USD.
- The user's dashboard displays AUD values. Always report both USD and AUD when mentioning dollar amounts.
- AUD/USD rate is provided in context below. To convert: AUD = USD / rate.

APPROACH:
- Always check the account and positions first before making decisions
- Explain your reasoning clearly — entry logic, risk sizing, expected catalysts
- When placing orders, confirm the math stays within the 10% rule
- Be direct and decisive. This is paper trading — learn fast, act with discipline.`;

async function proxyToVps(messages: ChatMessage[]): Promise<NextResponse | null> {
  const vpsUrl = (process.env.VPS_MYRMIDON_URL ?? "").replace(/\/$/, "");
  const vpsSecret = process.env.VPS_MYRMIDON_SECRET ?? "";

  let res: Response;
  try {
    res = await fetch(`${vpsUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-trading-secret": vpsSecret },
      body: JSON.stringify({ messages }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      signal: AbortSignal.timeout(115_000) as any,
    });
  } catch {
    // VPS unreachable — return null so caller falls back to direct Claude.
    return null;
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    return NextResponse.json({ error: `VPS error ${res.status}: ${text}` }, { status: 502 });
  }

  const data = await res.json().catch(() => ({})) as Record<string, unknown>;
  return NextResponse.json({ reply: data.reply ?? data.error ?? "No reply from VPS" });
}

export async function POST(request: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user || user.email !== TRADER_EMAIL) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  let body: ChatBody;
  try { body = (await request.json()) as ChatBody; }
  catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }

  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    return NextResponse.json({ error: "messages array required" }, { status: 400 });
  }

  const messages = (body.messages as ChatMessage[]).map((m) => ({ role: m.role, content: String(m.content) }));

  // If VPS is configured, try it first — falls back to direct Claude if unreachable.
  if (process.env.VPS_MYRMIDON_URL) {
    const vpsResult = await proxyToVps(messages);
    if (vpsResult) return vpsResult;
  }

  // Fallback: call Claude directly from SPECTRE.
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (!anthropicKey) return NextResponse.json({ error: "AI not configured — add ANTHROPIC_API_KEY or VPS_MYRMIDON_URL to Render environment" }, { status: 503 });
  if (!process.env.ALPACA_API_KEY || !process.env.ALPACA_API_SECRET) {
    return NextResponse.json({ error: "Trading credentials not configured — add ALPACA_API_KEY and ALPACA_API_SECRET to Render environment" }, { status: 503 });
  }

  const [memory, audUsdRate] = await Promise.all([
    Promise.resolve(readTradingMemory()),
    fetchAudUsdRate(),
  ]);
  const rateSection = audUsdRate
    ? `\n\nCURRENT AUD/USD RATE: ${audUsdRate.toFixed(4)} (1 AUD = ${audUsdRate.toFixed(4)} USD → 1 USD = ${(1 / audUsdRate).toFixed(4)} AUD)`
    : "\n\nAUD/USD RATE: unavailable — omit AUD conversion if unsure.";
  const memorySection = memory?.strategy
    ? `\n\nCURRENT STRATEGY MEMORY (from autonomous VPS agent):\n${memory.strategy}${memory.lessons.length > 0 ? `\n\nRECENT LESSONS:\n${memory.lessons.map((l, i) => `${i + 1}. ${l}`).join("\n")}` : ""}`
    : "\n\nNo strategy memory yet — this is the first session.";
  const SYSTEM_PROMPT = BASE_SYSTEM_PROMPT + rateSection + memorySection;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const claudeMessages: any[] = [...messages];
  let assistantText = "";

  for (let turn = 0; turn < MAX_TOOL_TURNS; turn++) {
    const claudeRes = await fetch(CLAUDE_API, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": anthropicKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: MODEL, max_tokens: 4096, system: SYSTEM_PROMPT, tools: TOOLS, messages: claudeMessages, thinking: { type: "adaptive" } }),
    });

    if (!claudeRes.ok) {
      const errText = await claudeRes.text();
      return NextResponse.json({ error: `Claude API error: ${errText}` }, { status: 502 });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const claudeData: any = await claudeRes.json();
    const stopReason: string = claudeData.stop_reason ?? "end_turn";
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const content: any[] = claudeData.content ?? [];

    for (const block of content) {
      if (block.type === "text") assistantText += (assistantText ? "\n\n" : "") + block.text;
    }

    if (stopReason !== "tool_use") break;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const toolResults: any[] = [];
    for (const block of content) {
      if (block.type === "tool_use") {
        const result = await executeTool(block.name as string, (block.input ?? {}) as Record<string, unknown>);
        toolResults.push({ type: "tool_result", tool_use_id: block.id, content: result });
      }
    }

    claudeMessages.push({ role: "assistant", content });
    claudeMessages.push({ role: "user", content: toolResults });
  }

  return NextResponse.json({ reply: assistantText });
}
