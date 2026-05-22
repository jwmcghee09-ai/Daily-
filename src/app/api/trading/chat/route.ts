import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";

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
    headers: {
      ...alpacaHeaders(),
      "Content-Type": "application/json",
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

async function executeTool(name: string, input: Record<string, unknown>): Promise<string> {
  try {
    if (name === "get_account") {
      const data = await alpacaFetch("/account");
      return JSON.stringify(data, null, 2);
    }

    if (name === "get_positions") {
      const data = await alpacaFetch("/positions");
      return JSON.stringify(data, null, 2);
    }

    if (name === "get_quote") {
      const symbol = String(input.symbol ?? "").toUpperCase();
      if (!symbol) return JSON.stringify({ error: "symbol required" });
      const data = await alpacaFetch(`/stocks/${symbol}/quotes/latest`);
      const snapshot = await alpacaFetch(`/stocks/${symbol}/snapshots`);
      return JSON.stringify({ quote: data, snapshot }, null, 2);
    }

    if (name === "get_bars") {
      const symbol = String(input.symbol ?? "").toUpperCase();
      const days = Math.min(Number(input.days ?? 5), 30);
      const end = new Date();
      const start = new Date(end);
      start.setDate(start.getDate() - days);
      const params = new URLSearchParams({
        symbols: symbol,
        timeframe: "1Day",
        start: start.toISOString().slice(0, 10),
        end: end.toISOString().slice(0, 10),
        feed: "iex",
      });
      const data = await alpacaFetch(`/stocks/bars?${params.toString()}`);
      return JSON.stringify(data, null, 2);
    }

    if (name === "place_order") {
      const symbol = String(input.symbol ?? "").toUpperCase();
      const qty = Number(input.qty);
      const side = String(input.side ?? "").toLowerCase();
      const type = String(input.type ?? "market").toLowerCase();
      const time_in_force = String(input.time_in_force ?? "day").toLowerCase();
      if (!symbol || !qty || !side) return JSON.stringify({ error: "symbol, qty, and side are required" });
      const data = await alpacaFetch("/orders", "POST", {
        symbol,
        qty: String(qty),
        side,
        type,
        time_in_force,
      });
      return JSON.stringify(data, null, 2);
    }

    if (name === "get_orders") {
      const status = String(input.status ?? "open");
      const data = await alpacaFetch(`/orders?status=${status}&limit=20`);
      return JSON.stringify(data, null, 2);
    }

    if (name === "cancel_order") {
      const order_id = String(input.order_id ?? "");
      if (!order_id) return JSON.stringify({ error: "order_id required" });
      const data = await alpacaFetch(`/orders/${order_id}`, "DELETE");
      return JSON.stringify(data ?? { cancelled: true }, null, 2);
    }

    return JSON.stringify({ error: `Unknown tool: ${name}` });
  } catch (error) {
    return JSON.stringify({ error: error instanceof Error ? error.message : String(error) });
  }
}

const TOOLS = [
  {
    name: "get_account",
    description: "Get current Alpaca paper trading account info including equity, cash, buying power, and portfolio value.",
    input_schema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "get_positions",
    description: "Get all current open positions — symbol, qty, market value, unrealized P&L.",
    input_schema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "get_quote",
    description: "Get the latest quote and snapshot (price, bid/ask, VWAP, previous close) for a US stock symbol.",
    input_schema: {
      type: "object",
      properties: {
        symbol: { type: "string", description: "Stock ticker symbol, e.g. AAPL" },
      },
      required: ["symbol"],
    },
  },
  {
    name: "get_bars",
    description: "Get daily OHLCV bar data for a symbol over recent trading days (max 30).",
    input_schema: {
      type: "object",
      properties: {
        symbol: { type: "string", description: "Stock ticker symbol" },
        days: { type: "number", description: "Number of calendar days back to fetch (default 5, max 30)" },
      },
      required: ["symbol"],
    },
  },
  {
    name: "place_order",
    description: "Place a market or limit order to buy or sell US stocks via Alpaca paper trading. Max 10% of portfolio per position. Never let cash drop below 20%. Cut losses at -15%.",
    input_schema: {
      type: "object",
      properties: {
        symbol: { type: "string", description: "Stock ticker symbol" },
        qty: { type: "number", description: "Number of shares" },
        side: { type: "string", enum: ["buy", "sell"], description: "buy or sell" },
        type: { type: "string", enum: ["market", "limit"], description: "Order type (default: market)" },
        time_in_force: { type: "string", enum: ["day", "gtc", "ioc", "fok"], description: "Time in force (default: day)" },
      },
      required: ["symbol", "qty", "side"],
    },
  },
  {
    name: "get_orders",
    description: "Get recent orders. Status can be 'open', 'closed', or 'all'.",
    input_schema: {
      type: "object",
      properties: {
        status: { type: "string", enum: ["open", "closed", "all"], description: "Filter by order status (default: open)" },
      },
      required: [],
    },
  },
  {
    name: "cancel_order",
    description: "Cancel an open order by its order ID.",
    input_schema: {
      type: "object",
      properties: {
        order_id: { type: "string", description: "The Alpaca order ID to cancel" },
      },
      required: ["order_id"],
    },
  },
];

const SYSTEM_PROMPT = `You are SPECTRE's autonomous trading agent — a disciplined quant running an Alpaca paper trading account.

RULES:
- Max 10% of portfolio value per single position
- Always maintain ≥20% cash floor
- Cut losses at -15% unrealised P&L per position
- Never chase a position up >30% in 2 weeks
- Only trade US equities available on Alpaca

APPROACH:
- When asked to analyse or trade, always check the account and positions first
- Explain your reasoning clearly — entry logic, risk sizing, expected catalysts
- When placing orders, confirm the math: size it to stay within the 10% rule
- Be honest about uncertainty — paper trading means no real money, but treat it with full discipline

You have access to live Alpaca paper trading tools. Use them to check balances, quote prices, view positions, and place orders. Think step by step.`;

export async function POST(request: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user || user.email !== TRADER_EMAIL) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (!anthropicKey) {
    return NextResponse.json({ error: "AI not configured" }, { status: 503 });
  }
  if (!process.env.ALPACA_API_KEY || !process.env.ALPACA_API_SECRET) {
    return NextResponse.json({ error: "Trading credentials not configured" }, { status: 503 });
  }

  let body: ChatBody;
  try {
    body = (await request.json()) as ChatBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    return NextResponse.json({ error: "messages array required" }, { status: 400 });
  }

  const inputMessages = (body.messages as ChatMessage[]).map((m) => ({
    role: m.role,
    content: String(m.content),
  }));

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const claudeMessages: any[] = [...inputMessages];
  let assistantText = "";

  for (let turn = 0; turn < MAX_TOOL_TURNS; turn++) {
    const claudeRes = await fetch(CLAUDE_API, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": anthropicKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 4096,
        system: SYSTEM_PROMPT,
        tools: TOOLS,
        messages: claudeMessages,
        thinking: { type: "adaptive" },
      }),
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

    // Collect text from this turn
    for (const block of content) {
      if (block.type === "text") {
        assistantText += (assistantText ? "\n\n" : "") + block.text;
      }
    }

    if (stopReason !== "tool_use") {
      break;
    }

    // Execute all tool calls
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const toolResults: any[] = [];
    for (const block of content) {
      if (block.type === "tool_use") {
        const result = await executeTool(block.name as string, (block.input ?? {}) as Record<string, unknown>);
        toolResults.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: result,
        });
      }
    }

    // Append assistant turn + tool results back into conversation
    claudeMessages.push({ role: "assistant", content });
    claudeMessages.push({ role: "user", content: toolResults });
  }

  return NextResponse.json({ reply: assistantText });
}
