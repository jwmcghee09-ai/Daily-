import { NextRequest } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { readTradingMemory, insertTradingDecision } from "@/lib/db";

const TRADER_EMAIL = "jwmcghee09@gmail.com";
const ALPACA_BASE = "https://paper-api.alpaca.markets/v2";
const ALPACA_DATA = "https://data.alpaca.markets/v2";
const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const CLAUDE_URL = "https://api.anthropic.com/v1/messages";
// llama-3.1-8b-instant has ~3x the token/min rate limit vs 70b on Groq free tier
const GROQ_MODEL = "llama-3.1-8b-instant";
const CLAUDE_MODEL = "claude-opus-4-7";
const MAX_TURNS = 8;

export const runtime = "nodejs";
export const maxDuration = 120;

interface OAIMessage {
  role: "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: OAIToolCall[];
  tool_call_id?: string;
}

interface OAIToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

type AnthropicContentBlock =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> }
  | { type: "tool_result"; tool_use_id: string; content: string };

interface AnthropicMessage {
  role: "user" | "assistant";
  content: string | AnthropicContentBlock[];
}

function alpacaHeaders() {
  return {
    "APCA-API-KEY-ID": process.env.ALPACA_API_KEY ?? "",
    "APCA-API-SECRET-KEY": process.env.ALPACA_API_SECRET ?? "",
    "Content-Type": "application/json",
  };
}

async function alpacaGet(path: string): Promise<unknown> {
  const res = await fetch(`${ALPACA_BASE}${path}`, { headers: alpacaHeaders(), cache: "no-store" });
  try { return await res.json(); } catch { return { error: res.statusText }; }
}

async function alpacaDataGet(path: string): Promise<unknown> {
  const res = await fetch(`${ALPACA_DATA}${path}`, { headers: alpacaHeaders(), cache: "no-store" });
  try { return await res.json(); } catch { return { error: res.statusText }; }
}

async function fetchAudUsdRate(): Promise<number | null> {
  try {
    const res = await fetch(
      "https://query2.finance.yahoo.com/v8/finance/chart/AUDUSD%3DX?interval=1d&range=5d",
      { headers: { "User-Agent": "Mozilla/5.0" }, cache: "no-store" },
    );
    if (!res.ok) return null;
    const data = (await res.json()) as { chart?: { result?: Array<{ meta?: { regularMarketPrice?: number } }> } };
    const rate = data?.chart?.result?.[0]?.meta?.regularMarketPrice;
    return typeof rate === "number" && rate > 0 ? rate : null;
  } catch { return null; }
}

function previewResult(result: string): string {
  try {
    const obj = JSON.parse(result);
    if (Array.isArray(obj)) return `${obj.length} item${obj.length !== 1 ? "s" : ""}`;
    if (obj && typeof obj === "object") {
      const keys = Object.keys(obj).slice(0, 4).join(", ");
      return `{${keys}${Object.keys(obj).length > 4 ? "…" : ""}}`;
    }
  } catch { /* not JSON */ }
  return result.slice(0, 80);
}

async function executeTool(name: string, args: Record<string, unknown>): Promise<string> {
  try {
    if (name === "get_account") return JSON.stringify(await alpacaGet("/account"));
    if (name === "get_positions") return JSON.stringify(await alpacaGet("/positions"));
    if (name === "get_quote") {
      const sym = String(args.symbol ?? "").toUpperCase().replace(/[^A-Z]/g, "");
      if (!sym) return JSON.stringify({ error: "symbol required" });
      return JSON.stringify(await alpacaGet(`/stocks/${sym}/snapshot`));
    }
    if (name === "get_bars") {
      const sym = String(args.symbol ?? "").toUpperCase().replace(/[^A-Z]/g, "");
      const d = Math.min(Number(args.days ?? 5), 30);
      const end = new Date();
      const start = new Date(end.getTime() - (d + 5) * 864e5);
      const p = new URLSearchParams({
        symbols: sym, timeframe: "1Day",
        start: start.toISOString().slice(0, 10),
        end: end.toISOString().slice(0, 10),
        limit: String(d), feed: "iex",
      });
      return JSON.stringify(await alpacaDataGet(`/stocks/bars?${p}`));
    }
    if (name === "place_order") {
      const sym = String(args.symbol ?? "").toUpperCase().replace(/[^A-Z]/g, "");
      const qty = Number(args.qty);
      const side = String(args.side ?? "").toLowerCase();
      if (!sym || !qty || !["buy", "sell"].includes(side)) {
        return JSON.stringify({ error: "symbol, qty, and side (buy|sell) required" });
      }
      const res = await fetch(`${ALPACA_BASE}/orders`, {
        method: "POST", headers: alpacaHeaders(),
        body: JSON.stringify({ symbol: sym, qty: String(qty), side, type: "market", time_in_force: "day" }),
      });
      return JSON.stringify(await res.json());
    }
    if (name === "get_orders") {
      const status = String(args.status ?? "open");
      const limit = Math.min(Number(args.limit ?? 20), 50);
      return JSON.stringify(await alpacaGet(`/orders?status=${status}&limit=${limit}&direction=desc`));
    }
    if (name === "get_portfolio_history") {
      return JSON.stringify(await alpacaGet("/account/portfolio/history?period=1M&timeframe=1D"));
    }
    if (name === "get_pnl_summary") {
      const limit = Math.min(Number(args.limit ?? 50), 200);
      return JSON.stringify(await alpacaGet(`/orders?status=closed&limit=${limit}&direction=desc`));
    }
    return JSON.stringify({ error: `Unknown tool: ${name}` });
  } catch (e) {
    return JSON.stringify({ error: e instanceof Error ? e.message : String(e) });
  }
}

const TOOLS_GROQ = [
  { type: "function", function: { name: "get_account", description: "Get Alpaca paper account — equity, cash, buying power.", parameters: { type: "object", properties: {}, required: [] } } },
  { type: "function", function: { name: "get_positions", description: "Get all open positions with P&L.", parameters: { type: "object", properties: {}, required: [] } } },
  { type: "function", function: { name: "get_quote", description: "Get live price snapshot for a US stock symbol.", parameters: { type: "object", properties: { symbol: { type: "string" } }, required: ["symbol"] } } },
  { type: "function", function: { name: "get_bars", description: "Get daily OHLCV bars for a symbol (max 30 days).", parameters: { type: "object", properties: { symbol: { type: "string" }, days: { type: "number" } }, required: ["symbol"] } } },
  { type: "function", function: { name: "place_order", description: "Place a market order on Alpaca paper account. Keep ≥20% cash, max 10% per position.", parameters: { type: "object", properties: { symbol: { type: "string" }, qty: { type: "number" }, side: { type: "string", enum: ["buy", "sell"] } }, required: ["symbol", "qty", "side"] } } },
  { type: "function", function: { name: "get_orders", description: "Get recent orders.", parameters: { type: "object", properties: { status: { type: "string", enum: ["open", "closed", "all"] }, limit: { type: "number" } }, required: [] } } },
  { type: "function", function: { name: "get_portfolio_history", description: "Get 30-day daily equity curve. Use to analyse performance over time.", parameters: { type: "object", properties: {}, required: [] } } },
  { type: "function", function: { name: "get_pnl_summary", description: "Get closed orders with fill prices to evaluate trade outcomes.", parameters: { type: "object", properties: { limit: { type: "number" } }, required: [] } } },
];

const TOOLS_CLAUDE = [
  { name: "get_account", description: "Get Alpaca paper account — equity, cash, buying power.", input_schema: { type: "object", properties: {}, required: [] } },
  { name: "get_positions", description: "Get all open positions with P&L.", input_schema: { type: "object", properties: {}, required: [] } },
  { name: "get_quote", description: "Get live price snapshot for a US stock symbol.", input_schema: { type: "object", properties: { symbol: { type: "string" } }, required: ["symbol"] } },
  { name: "get_bars", description: "Get daily OHLCV bars (max 30 days).", input_schema: { type: "object", properties: { symbol: { type: "string" }, days: { type: "number" } }, required: ["symbol"] } },
  { name: "place_order", description: "Place a market order. Keep ≥20% cash, max 10% per position.", input_schema: { type: "object", properties: { symbol: { type: "string" }, qty: { type: "number" }, side: { type: "string", enum: ["buy", "sell"] } }, required: ["symbol", "qty", "side"] } },
  { name: "get_orders", description: "Get recent orders.", input_schema: { type: "object", properties: { status: { type: "string", enum: ["open", "closed", "all"] }, limit: { type: "number" } }, required: [] } },
  { name: "get_portfolio_history", description: "Get 30-day daily equity curve.", input_schema: { type: "object", properties: {}, required: [] } },
  { name: "get_pnl_summary", description: "Get closed orders with fill prices.", input_schema: { type: "object", properties: { limit: { type: "number" } }, required: [] } },
];

const BASE_SYSTEM = `You are Myrmidon — SPECTRE's autonomous trading agent managing a US equities paper trading account on Alpaca.

PORTFOLIO RULES:
- Core sleeve (70%): SPY 40%, QQQ 20%, VEA 15% — rebalance if >5% off target
- Satellite sleeve (30%): active trades — max 10% per position
- Always maintain ≥20% cash floor
- Stop-loss: cut at -15% unrealised P&L
- Never chase a position up >30% in 2 weeks

CURRENCY:
- All Alpaca values are in USD. Always report both USD and AUD when mentioning dollar amounts.
- AUD/USD rate is provided in context. To convert: AUD = USD / rate.

APPROACH:
- Check account and positions before any recommendation
- Use get_bars for recent price context before trading
- Explain entry logic, risk sizing, and expected catalysts clearly
- This is paper trading — be decisive, learn fast, respect the rules

PERFORMANCE ANALYSIS:
- Use get_portfolio_history to get the 30-day equity curve and evaluate overall returns
- Use get_pnl_summary to fetch closed trades and compute win rate, avg gain/loss, best/worst trades
- When asked to "test the strategy" or "evaluate predictions", pull both and give a structured analysis:
  equity growth, number of trades, win rate, largest winners/losers, and whether core sleeve targets were hit`;

export async function POST(request: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user || user.email !== TRADER_EMAIL) {
    return new Response(`data: ${JSON.stringify({ type: "error", message: "Not authorized" })}\n\n`, {
      status: 403,
      headers: { "Content-Type": "text/event-stream" },
    });
  }

  const groqKey = process.env.GROQ_API_KEY;
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (!groqKey && !anthropicKey) {
    return new Response(`data: ${JSON.stringify({ type: "error", message: "No AI API key configured" })}\n\n`, {
      status: 503,
      headers: { "Content-Type": "text/event-stream" },
    });
  }

  let body: { messages?: unknown };
  try { body = await request.json(); }
  catch { return new Response(`data: ${JSON.stringify({ type: "error", message: "Invalid JSON" })}\n\n`, { status: 400, headers: { "Content-Type": "text/event-stream" } }); }

  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    return new Response(`data: ${JSON.stringify({ type: "error", message: "messages array required" })}\n\n`, { status: 400, headers: { "Content-Type": "text/event-stream" } });
  }

  const [audUsdRate, memory] = await Promise.all([fetchAudUsdRate(), Promise.resolve(readTradingMemory())]);

  const rateSection = audUsdRate
    ? `\n\nCURRENT AUD/USD RATE: ${audUsdRate.toFixed(4)}`
    : "\n\nAUD/USD RATE: unavailable — report USD only.";

  const memSection = memory?.strategy
    ? `\n\nSTRATEGY MEMORY:\n${memory.strategy}${
        Array.isArray(memory.lessons) && memory.lessons.length
          ? `\n\nRECENT LESSONS:\n${memory.lessons.slice(-4).map((l, i) =>
              `${i + 1}. ${typeof l === "string" ? l : (l as { lesson?: string }).lesson ?? ""}`
            ).join("\n")}`
          : ""
      }`
    : "";

  const systemPrompt = BASE_SYSTEM + rateSection + memSection;
  const userMessage = String(((body.messages as OAIMessage[]).at(-1))?.content ?? "");

  const encoder = new TextEncoder();
  const toolCallsLog: Array<{ name: string; input: Record<string, unknown>; output_preview: string }> = [];
  let finalReply = "";
  let usedModel = "";

  const stream = new ReadableStream({
    async start(controller) {
      function emit(data: Record<string, unknown>) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      }

      try {
        const messages: OAIMessage[] = (body.messages as OAIMessage[]).map(m => ({
          role: m.role,
          content: String(m.content ?? ""),
        }));

        if (groqKey) {
          usedModel = `groq/${GROQ_MODEL}`;
          // Groq agentic loop
          for (let turn = 0; turn < MAX_TURNS; turn++) {
            let res = await fetch(GROQ_URL, {
              method: "POST",
              headers: { "Content-Type": "application/json", "Authorization": `Bearer ${groqKey}` },
              body: JSON.stringify({
                model: GROQ_MODEL,
                messages: [{ role: "system", content: systemPrompt }, ...messages],
                tools: TOOLS_GROQ,
                tool_choice: "auto",
                max_tokens: 1200,
              }),
            });

            if (res.status === 429) {
              const wait = Math.min(Number(res.headers.get("retry-after") ?? "10"), 30);
              emit({ type: "status", message: `Rate limit — retrying in ${wait}s…` });
              await new Promise(r => setTimeout(r, wait * 1000));
              res = await fetch(GROQ_URL, {
                method: "POST",
                headers: { "Content-Type": "application/json", "Authorization": `Bearer ${groqKey}` },
                body: JSON.stringify({
                  model: GROQ_MODEL,
                  messages: [{ role: "system", content: systemPrompt }, ...messages],
                  tools: TOOLS_GROQ,
                  tool_choice: "auto",
                  max_tokens: 1200,
                }),
              });
            }

            if (!res.ok) throw new Error(`Groq ${res.status}: ${(await res.text()).slice(0, 200)}`);

            const data = await res.json() as {
              choices: [{ message: { content: string | null; tool_calls?: OAIToolCall[] }; finish_reason: string }]
            };
            const msg = data.choices[0].message;
            const finish = data.choices[0].finish_reason;

            if (msg.content) finalReply = msg.content;
            if (finish !== "tool_calls" || !msg.tool_calls?.length) break;

            messages.push({ role: "assistant", content: msg.content ?? "", tool_calls: msg.tool_calls });

            for (const tc of msg.tool_calls) {
              let args: Record<string, unknown> = {};
              try { args = JSON.parse(tc.function.arguments); } catch { /* empty */ }
              emit({ type: "tool_call", name: tc.function.name, input: args });
              const result = await executeTool(tc.function.name, args);
              const preview = previewResult(result);
              emit({ type: "tool_result", name: tc.function.name, preview });
              toolCallsLog.push({ name: tc.function.name, input: args, output_preview: preview });
              messages.push({ role: "tool", tool_call_id: tc.id, content: result.slice(0, 1200) });
            }
          }
        } else if (anthropicKey) {
          usedModel = CLAUDE_MODEL;
          const claudeMessages: AnthropicMessage[] = messages.map(m => ({
            role: m.role === "assistant" ? "assistant" : "user",
            content: String(m.content ?? ""),
          }));

          for (let turn = 0; turn < MAX_TURNS; turn++) {
            const res = await fetch(CLAUDE_URL, {
              method: "POST",
              headers: { "x-api-key": anthropicKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
              body: JSON.stringify({ model: CLAUDE_MODEL, max_tokens: 2048, system: systemPrompt, messages: claudeMessages, tools: TOOLS_CLAUDE }),
            });
            if (!res.ok) throw new Error(`Claude ${res.status}: ${(await res.text()).slice(0, 200)}`);

            const data = await res.json() as { content: AnthropicContentBlock[]; stop_reason: string };
            const textBlock = data.content.find(b => b.type === "text") as { type: "text"; text: string } | undefined;
            if (textBlock) finalReply = textBlock.text;
            if (data.stop_reason !== "tool_use") break;

            const toolUseBlocks = data.content.filter(b => b.type === "tool_use") as { type: "tool_use"; id: string; name: string; input: Record<string, unknown> }[];
            if (!toolUseBlocks.length) break;

            claudeMessages.push({ role: "assistant", content: data.content });
            const toolResults: AnthropicContentBlock[] = [];
            for (const tu of toolUseBlocks) {
              emit({ type: "tool_call", name: tu.name, input: tu.input });
              const result = await executeTool(tu.name, tu.input);
              const preview = previewResult(result);
              emit({ type: "tool_result", name: tu.name, preview });
              toolCallsLog.push({ name: tu.name, input: tu.input, output_preview: preview });
              toolResults.push({ type: "tool_result", tool_use_id: tu.id, content: result.slice(0, 3000) });
            }
            claudeMessages.push({ role: "user", content: toolResults });
          }
        }

        if (!finalReply) finalReply = "No response generated.";

        // Stream the text response word by word for a live feel
        const words = finalReply.split(" ");
        for (let i = 0; i < words.length; i++) {
          emit({ type: "text_delta", delta: (i === 0 ? "" : " ") + words[i] });
          // small delay every ~8 words for readability
          if (i % 8 === 7) await new Promise(r => setTimeout(r, 16));
        }

        emit({ type: "done", model: usedModel, tool_count: toolCallsLog.length });

        // Save decision to SQLite
        try {
          // Try to get current equity/cash for context
          let equityUsd: string | null = null;
          let cashUsd: string | null = null;
          const acctTc = toolCallsLog.find(t => t.name === "get_account");
          if (!acctTc && process.env.ALPACA_API_KEY) {
            // Quick account fetch for snapshot
            try {
              const acct = await alpacaGet("/account") as Record<string, string>;
              equityUsd = acct.equity ?? null;
              cashUsd = acct.cash ?? null;
            } catch { /* skip */ }
          }
          insertTradingDecision({
            user_message: userMessage,
            tool_calls: toolCallsLog,
            ai_response: finalReply,
            model: usedModel,
            equity_usd: equityUsd,
            cash_usd: cashUsd,
          });
        } catch { /* don't fail the stream on DB error */ }

      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        // If Groq failed and we have Claude, try falling back
        if (anthropicKey && groqKey && msg.includes("Groq")) {
          emit({ type: "status", message: "Groq unavailable, switching to Claude…" });
          try {
            usedModel = CLAUDE_MODEL;
            const claudeMessages: AnthropicMessage[] = (body.messages as OAIMessage[]).map(m => ({
              role: m.role === "assistant" ? "assistant" : "user",
              content: String(m.content ?? ""),
            }));
            const res = await fetch(CLAUDE_URL, {
              method: "POST",
              headers: { "x-api-key": anthropicKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
              body: JSON.stringify({ model: CLAUDE_MODEL, max_tokens: 2048, system: systemPrompt, messages: claudeMessages }),
            });
            if (res.ok) {
              const data = await res.json() as { content: AnthropicContentBlock[] };
              const text = (data.content.find(b => b.type === "text") as { type: "text"; text: string } | undefined)?.text ?? "No response.";
              const words = text.split(" ");
              for (let i = 0; i < words.length; i++) {
                emit({ type: "text_delta", delta: (i === 0 ? "" : " ") + words[i] });
                if (i % 8 === 7) await new Promise(r => setTimeout(r, 16));
              }
              emit({ type: "done", model: CLAUDE_MODEL, tool_count: 0 });
              try { insertTradingDecision({ user_message: userMessage, tool_calls: [], ai_response: text, model: CLAUDE_MODEL }); } catch { /* skip */ }
              controller.close();
              return;
            }
          } catch { /* fall through to error */ }
        }
        emit({ type: "error", message: msg });
      }

      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
