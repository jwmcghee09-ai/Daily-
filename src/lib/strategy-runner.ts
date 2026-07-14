import {
  readTradingStrategy, TradingStrategyConfig,
  insertStrategyRun, insertTradingDecision,
  insertPendingTrade, listDuePendingTrades, resolvePendingTrade,
  getPendingTrade, sumExecutedBuyNotionalToday,
  readTradingMemory, PendingTrade,
} from "@/lib/db";

const ALPACA_BASE = "https://paper-api.alpaca.markets/v2";
const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_MODEL = "llama-3.3-70b-versatile";
const GROQ_FALLBACK = "llama-3.1-8b-instant";
const CASH_FLOOR_PCT = 0.20;
const CONFIRM_WINDOW_MIN = 5;

function alpacaHeaders() {
  return {
    "APCA-API-KEY-ID": process.env.ALPACA_API_KEY ?? "",
    "APCA-API-SECRET-KEY": process.env.ALPACA_API_SECRET ?? "",
    "Content-Type": "application/json",
  };
}

// ── Market data ───────────────────────────────────────────────────────────────

interface AlpacaAccount { equity: string; cash: string; buying_power: string; }
interface AlpacaPosition {
  symbol: string; qty: string; market_value: string; current_price: string;
  unrealized_pl: string; unrealized_plpc: string; change_today: string;
  unrealized_intraday_pl: string; avg_entry_price: string;
}

async function fetchAlpaca<T>(path: string): Promise<T> {
  const r = await fetch(`${ALPACA_BASE}${path}`, { headers: alpacaHeaders(), cache: "no-store" });
  if (!r.ok) throw new Error(`Alpaca ${path} → ${r.status}`);
  return r.json() as Promise<T>;
}

async function fetchQuotePrice(symbol: string): Promise<number | null> {
  try {
    const r = await fetch(`${ALPACA_BASE}/stocks/${symbol}/snapshot`, { headers: alpacaHeaders(), cache: "no-store" });
    if (!r.ok) return null;
    const d = await r.json() as { latestTrade?: { p?: number }; minuteBar?: { c?: number }; dailyBar?: { c?: number } };
    return d.latestTrade?.p ?? d.minuteBar?.c ?? d.dailyBar?.c ?? null;
  } catch { return null; }
}

async function fetchYahooQuote(symbol: string): Promise<{ price: number; changePct: number } | null> {
  try {
    const r = await fetch(
      `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=2d`,
      { headers: { "User-Agent": "Mozilla/5.0" }, cache: "no-store" }
    );
    if (!r.ok) return null;
    const d = await r.json() as { chart?: { result?: Array<{ meta?: { regularMarketPrice?: number; previousClose?: number } }> } };
    const meta = d?.chart?.result?.[0]?.meta;
    if (!meta?.regularMarketPrice) return null;
    const prev = meta.previousClose ?? meta.regularMarketPrice;
    return { price: meta.regularMarketPrice, changePct: prev > 0 ? ((meta.regularMarketPrice - prev) / prev) * 100 : 0 };
  } catch { return null; }
}

export function isUsMarketOpen(now = new Date()): boolean {
  const day = now.getUTCDay();
  if (day === 0 || day === 6) return false;
  const mins = now.getUTCHours() * 60 + now.getUTCMinutes();
  return mins >= 13 * 60 + 30 && mins < 20 * 60;
}

// ── Risk signals (server-side mirror of the terminal's risk bar) ─────────────

function computeRiskSignals(acct: AlpacaAccount, positions: AlpacaPosition[], vix: number | null, spxChg: number | null): string[] {
  const eq = parseFloat(acct.equity) || 0;
  const cash = parseFloat(acct.cash) || 0;
  const sigs: string[] = [];

  const cashPct = eq > 0 ? cash / eq : 0;
  if (cashPct < 0.20) sigs.push(`CASH ${(cashPct * 100).toFixed(1)}% — BELOW 20% FLOOR (no new buys allowed)`);
  else if (cashPct < 0.25) sigs.push(`Cash ${(cashPct * 100).toFixed(1)}% — near floor`);
  else sigs.push(`Cash OK (${(cashPct * 100).toFixed(1)}%)`);

  for (const p of positions) {
    const plpc = parseFloat(p.unrealized_plpc) || 0;
    if (plpc < -0.15) sigs.push(`${p.symbol} ${(plpc * 100).toFixed(1)}% — STOP-LOSS BREACHED, should exit`);
    else if (plpc < -0.12) sigs.push(`${p.symbol} ${(plpc * 100).toFixed(1)}% — near stop-loss`);
    const posPct = eq > 0 ? (parseFloat(p.market_value) || 0) / eq : 0;
    if (posPct > 0.10) sigs.push(`${p.symbol} ${(posPct * 100).toFixed(1)}% of equity — exceeds 10% limit, trim candidate`);
  }

  const dayPl = positions.reduce((s, p) => s + (parseFloat(p.unrealized_intraday_pl) || 0), 0);
  const dayPct = eq > 0 ? (dayPl / eq) * 100 : 0;
  if (dayPct < -3) sigs.push(`TODAY ${dayPct.toFixed(2)}% — portfolio sell-off in progress`);
  else if (dayPct < -1) sigs.push(`TODAY ${dayPct.toFixed(2)}%`);

  if (vix != null) {
    if (vix > 30) sigs.push(`VIX ${vix.toFixed(1)} — HIGH FEAR regime`);
    else if (vix > 20) sigs.push(`VIX ${vix.toFixed(1)} — elevated volatility`);
    else sigs.push(`VIX ${vix.toFixed(1)} — calm`);
  }
  if (spxChg != null && spxChg < -1.5) sigs.push(`SPX ${spxChg.toFixed(2)}% today — broad market weakness`);

  return sigs;
}

// ── Strategy personas ─────────────────────────────────────────────────────────

const MODE_PROMPTS: Record<string, string> = {
  dip_buyer: `STRATEGY MODE: DIP BUYER.
You buy quality names on meaningful pullbacks (down 3%+ from recent highs, or oversold vs their trend) and you are patient — no entry unless there is a real dip. You take profit into strength when a position has recovered/run 8-15%. You never buy something that is up strongly today.`,
  momentum: `STRATEGY MODE: MOMENTUM RIDER.
You buy strength — names breaking out or trending strongly with broad-market support — and you cut losers fast. You add to winners, never to losers. In a weak or fearful tape (VIX elevated, SPX down) you stand aside and propose nothing.`,
  index_rotator: `STRATEGY MODE: INDEX ROTATOR.
You only trade the core index sleeve (SPY, QQQ, VEA and broad sector ETFs). Your job is rebalancing toward targets — SPY 40%, QQQ 20%, VEA 15% — trimming what is over target and adding what is under, ideally selling strength and buying weakness. You do not trade single stocks.`,
  custom: `STRATEGY MODE: TRADER-AUTHORED.
The trader has written their own strategy below. Follow it exactly and strictly — do not act on anything it does not call for, and do not substitute your own ideas. If it says to do nothing in current conditions, do nothing.`,
};

const RISK_PROMPTS: Record<string, string> = {
  conservative: "RISK TOLERANCE: conservative — small position sizes (1-3% of equity per trade), only high-conviction setups, prefer holding cash over marginal trades.",
  balanced: "RISK TOLERANCE: balanced — moderate sizes (3-6% of equity per trade), act on good setups, keep dry powder.",
  aggressive: "RISK TOLERANCE: aggressive — larger sizes (up to the per-position cap), act decisively on setups, still respect all hard limits.",
};

// ── AI call ───────────────────────────────────────────────────────────────────

interface AiAction { action: string; symbol: string; qty: number; reason: string; }
interface AiDecision { assessment: string; actions: AiAction[]; stop_alerts: Array<{ symbol: string; note: string }>; }

async function callGroqJson(prompt: string, groqKey: string): Promise<{ decision: AiDecision; model: string }> {
  let lastErr = "";
  for (const model of [GROQ_MODEL, GROQ_FALLBACK]) {
    for (let attempt = 0; attempt < 2; attempt++) {
      const res = await fetch(GROQ_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${groqKey}` },
        body: JSON.stringify({
          model,
          messages: [{ role: "user", content: prompt }],
          max_tokens: 1500,
          temperature: 0.2,
          response_format: { type: "json_object" },
        }),
      });
      if (res.status === 429) {
        const retryAfter = parseInt(res.headers.get("retry-after") ?? "20");
        await new Promise(r => setTimeout(r, Math.min(retryAfter, 30) * 1000));
        continue;
      }
      if (!res.ok) { lastErr = `Groq ${res.status}: ${(await res.text()).slice(0, 200)}`; break; }
      const data = await res.json() as { choices: [{ message: { content: string } }] };
      const text = data.choices[0].message.content ?? "";
      try {
        const parsed = JSON.parse(text) as Partial<AiDecision>;
        return {
          model,
          decision: {
            assessment: String(parsed.assessment ?? ""),
            actions: Array.isArray(parsed.actions) ? parsed.actions.filter(a => a && typeof a === "object") as AiAction[] : [],
            stop_alerts: Array.isArray(parsed.stop_alerts) ? parsed.stop_alerts : [],
          },
        };
      } catch {
        lastErr = "Model returned invalid JSON";
        break;
      }
    }
  }
  throw new Error(lastErr || "AI call failed");
}

// ── Guardrails (code-enforced — the AI cannot override these) ────────────────

interface ValidatedAction {
  side: "buy" | "sell";
  symbol: string;
  qty: number;
  est_price: number | null;
  reason: string;
}
interface RejectedAction { symbol: string; side: string; qty: number; rejected: string; }

async function validateActions(
  actions: AiAction[],
  cfg: TradingStrategyConfig,
  acct: AlpacaAccount,
  positions: AlpacaPosition[],
): Promise<{ accepted: ValidatedAction[]; rejected: RejectedAction[] }> {
  const eq = parseFloat(acct.equity) || 0;
  let cash = parseFloat(acct.cash) || 0;
  const held = new Map(positions.map(p => [p.symbol, p]));
  const accepted: ValidatedAction[] = [];
  const rejected: RejectedAction[] = [];
  let dailySpent = 0;
  try { dailySpent = sumExecutedBuyNotionalToday(); } catch { /* fresh db */ }

  for (const a of actions) {
    const side = String(a.action ?? "").toLowerCase();
    const symbol = String(a.symbol ?? "").toUpperCase().replace(/[^A-Z.]/g, "");
    const qty = Math.floor(Number(a.qty) || 0);
    const reason = String(a.reason ?? "").slice(0, 400);
    const reject = (why: string) => rejected.push({ symbol, side, qty, rejected: why });

    if (side === "hold" || !side) continue;
    if (side !== "buy" && side !== "sell") { reject(`unknown action "${side}"`); continue; }
    if (accepted.length >= cfg.max_trades_per_run) { reject(`max ${cfg.max_trades_per_run} trades per run reached`); continue; }
    if (!/^[A-Z]{1,5}$/.test(symbol)) { reject("invalid symbol"); continue; }
    if (qty <= 0 || qty > 10000) { reject("invalid qty"); continue; }

    if (side === "sell") {
      const pos = held.get(symbol);
      if (!pos) { reject("not held — cannot sell"); continue; }
      const heldQty = Math.floor(parseFloat(pos.qty) || 0);
      if (qty > heldQty) { reject(`only ${heldQty} held`); continue; }
      accepted.push({ side, symbol, qty, est_price: parseFloat(pos.current_price) || null, reason });
      continue;
    }

    // BUY checks
    if (cfg.watchlist.length > 0 && !cfg.watchlist.includes(symbol) && !held.has(symbol)) {
      reject("not in watchlist"); continue;
    }
    const price = held.get(symbol) ? (parseFloat(held.get(symbol)!.current_price) || null) : await fetchQuotePrice(symbol);
    if (!price || price <= 0) { reject("no live price available"); continue; }
    const cost = qty * price;
    if (dailySpent + cost > cfg.max_daily_spend_usd) { reject(`would exceed daily spend cap $${cfg.max_daily_spend_usd.toLocaleString()}`); continue; }
    if (eq > 0 && (cash - cost) / eq < CASH_FLOOR_PCT) { reject("would breach 20% cash floor"); continue; }
    const curVal = held.get(symbol) ? (parseFloat(held.get(symbol)!.market_value) || 0) : 0;
    if (eq > 0 && (curVal + cost) / eq > cfg.max_position_pct / 100) {
      reject(`would exceed ${cfg.max_position_pct}% position cap`); continue;
    }
    cash -= cost;
    dailySpent += cost;
    accepted.push({ side, symbol, qty, est_price: price, reason });
  }

  return { accepted, rejected };
}

// ── Execution ─────────────────────────────────────────────────────────────────

async function placeOrder(symbol: string, qty: number, side: "buy" | "sell"): Promise<{ ok: boolean; orderId: string | null; note: string }> {
  try {
    const res = await fetch(`${ALPACA_BASE}/orders`, {
      method: "POST",
      headers: alpacaHeaders(),
      body: JSON.stringify({ symbol, qty: String(qty), side, type: "market", time_in_force: "day" }),
    });
    const data = await res.json() as { id?: string; message?: string };
    if (!res.ok || !data.id) return { ok: false, orderId: null, note: data.message ?? `Alpaca ${res.status}` };
    return { ok: true, orderId: data.id, note: "order placed" };
  } catch (e) {
    return { ok: false, orderId: null, note: e instanceof Error ? e.message : String(e) };
  }
}

/** Execute pending trades whose confirm window has passed. Re-validates cash floor at execution time. */
export async function processDuePendingTrades(): Promise<{ executed: number; failed: number; details: string[] }> {
  const due = listDuePendingTrades();
  const details: string[] = [];
  let executed = 0, failed = 0;
  if (!due.length) return { executed, failed, details };

  let acct: AlpacaAccount | null = null;
  let positions: AlpacaPosition[] = [];
  try {
    [acct, positions] = await Promise.all([
      fetchAlpaca<AlpacaAccount>("/account"),
      fetchAlpaca<AlpacaPosition[]>("/positions"),
    ]);
  } catch (e) {
    return { executed, failed, details: [`Alpaca unreachable: ${e instanceof Error ? e.message : e}`] };
  }

  const eq = parseFloat(acct.equity) || 0;
  let cash = parseFloat(acct.cash) || 0;
  const held = new Map(positions.map(p => [p.symbol, p]));

  for (const t of due) {
    // Expire stale proposals (>24h old) rather than firing into a very different market.
    if (Date.now() - new Date(t.created_at).getTime() > 24 * 3600 * 1000) {
      resolvePendingTrade(t.id, "expired", "proposal older than 24h");
      details.push(`#${t.id} ${t.side} ${t.qty} ${t.symbol} — expired`);
      continue;
    }
    if (t.side === "buy") {
      const cost = t.qty * (t.est_price ?? 0);
      if (eq > 0 && cost > 0 && (cash - cost) / eq < CASH_FLOOR_PCT) {
        resolvePendingTrade(t.id, "failed", "cash floor would be breached at execution time");
        failed++; details.push(`#${t.id} buy ${t.qty} ${t.symbol} — blocked (cash floor)`);
        continue;
      }
      cash -= cost;
    } else {
      const pos = held.get(t.symbol);
      if (!pos || Math.floor(parseFloat(pos.qty) || 0) < t.qty) {
        resolvePendingTrade(t.id, "failed", "position no longer sufficient");
        failed++; details.push(`#${t.id} sell ${t.qty} ${t.symbol} — blocked (not held)`);
        continue;
      }
    }
    const r = await placeOrder(t.symbol, t.qty, t.side as "buy" | "sell");
    resolvePendingTrade(t.id, r.ok ? "executed" : "failed", r.note, r.orderId);
    if (r.ok) { executed++; details.push(`#${t.id} ${t.side} ${t.qty} ${t.symbol} — executed`); }
    else { failed++; details.push(`#${t.id} ${t.side} ${t.qty} ${t.symbol} — ${r.note}`); }
  }
  return { executed, failed, details };
}

/** Execute a specific pending trade immediately (user clicked EXEC NOW). */
export async function executePendingTradeNow(id: number): Promise<{ ok: boolean; note: string }> {
  const t = getPendingTrade(id);
  if (!t || t.status !== "pending") return { ok: false, note: "not found or already resolved" };
  const r = await placeOrder(t.symbol, t.qty, t.side as "buy" | "sell");
  resolvePendingTrade(id, r.ok ? "executed" : "failed", r.note, r.orderId);
  return { ok: r.ok, note: r.note };
}

// ── The run ───────────────────────────────────────────────────────────────────

export interface StrategyRunResult {
  status: "ok" | "skipped" | "error";
  summary: string;
  assessment?: string;
  executed?: Array<{ side: string; symbol: string; qty: number; note: string }>;
  queued?: Array<{ id: number; side: string; symbol: string; qty: number; execute_after: string }>;
  rejected?: RejectedAction[];
  stop_alerts?: Array<{ symbol: string; note: string }>;
  pending_processed?: { executed: number; failed: number; details: string[] };
  model?: string;
}

export async function runStrategy(trigger: "cron" | "manual"): Promise<StrategyRunResult> {
  // Always process the confirm queue first, even if strategy is off.
  const pendingProcessed = await processDuePendingTrades();

  const cfg = readTradingStrategy();
  if (!cfg || !cfg.enabled) {
    return { status: "skipped", summary: "Strategy disabled", pending_processed: pendingProcessed };
  }
  if (cfg.market_hours_only && !isUsMarketOpen()) {
    return { status: "skipped", summary: "US market closed (market-hours-only is on)", pending_processed: pendingProcessed };
  }
  if (cfg.mode === "custom" && !cfg.custom_prompt.trim()) {
    return { status: "skipped", summary: "No strategy written yet — add one on /strategy", pending_processed: pendingProcessed };
  }
  const groqKey = process.env.GROQ_API_KEY;
  if (!groqKey) return { status: "error", summary: "GROQ_API_KEY not set", pending_processed: pendingProcessed };

  let acct: AlpacaAccount;
  let positions: AlpacaPosition[];
  let openOrders: Array<{ symbol: string; side: string; qty: string; status: string }>;
  try {
    [acct, positions, openOrders] = await Promise.all([
      fetchAlpaca<AlpacaAccount>("/account"),
      fetchAlpaca<AlpacaPosition[]>("/positions"),
      fetchAlpaca<Array<{ symbol: string; side: string; qty: string; status: string }>>("/orders?status=open&limit=20"),
    ]);
  } catch (e) {
    const msg = `Alpaca unreachable: ${e instanceof Error ? e.message : e}`;
    insertStrategyRun({ trigger, status: "error", summary: msg, assessment: "", actions: [], model: "" });
    return { status: "error", summary: msg, pending_processed: pendingProcessed };
  }

  const [vixQ, spxQ] = await Promise.all([fetchYahooQuote("^VIX"), fetchYahooQuote("^GSPC")]);
  const riskSignals = computeRiskSignals(acct, positions, vixQ?.price ?? null, spxQ?.changePct ?? null);
  const memory = (() => { try { return readTradingMemory(); } catch { return null; } })();

  const eq = parseFloat(acct.equity) || 0;
  const posLines = positions.map(p => {
    const pct = eq > 0 ? ((parseFloat(p.market_value) || 0) / eq * 100).toFixed(1) : "0";
    return `${p.symbol}: ${p.qty} sh @ $${parseFloat(p.current_price).toFixed(2)}, ${pct}% of equity, P&L ${(parseFloat(p.unrealized_plpc) * 100).toFixed(1)}%, today ${(parseFloat(p.change_today) * 100).toFixed(1)}%`;
  }).join("\n") || "(none)";
  const orderLines = openOrders.map(o => `${o.side} ${o.qty} ${o.symbol} (${o.status})`).join("\n") || "(none)";

  const prompt = `You are Myrmidon, an autonomous trading agent running a scheduled strategy pass on a US equities paper account.

${MODE_PROMPTS[cfg.mode]}
${cfg.mode === "custom" && cfg.custom_prompt ? `\nTRADER'S STRATEGY DESCRIPTION:\n${cfg.custom_prompt}\n` : ""}
${RISK_PROMPTS[cfg.risk_tolerance]}

HARD LIMITS (enforced in code — proposals violating them are auto-rejected):
- Max ${cfg.max_trades_per_run} trades this run, whole shares only
- Max ${cfg.max_position_pct}% of equity per position
- Cash must stay ≥ 20% of equity after buys
- Daily buy cap: $${cfg.max_daily_spend_usd.toLocaleString()}
${cfg.watchlist.length ? `- Buys restricted to watchlist: ${cfg.watchlist.join(", ")}` : ""}

ACCOUNT: equity $${eq.toFixed(0)}, cash $${(parseFloat(acct.cash) || 0).toFixed(0)} (${eq > 0 ? ((parseFloat(acct.cash) || 0) / eq * 100).toFixed(1) : 0}%)

POSITIONS:
${posLines}

OPEN ORDERS (do NOT duplicate these):
${orderLines}

RISK SIGNALS:
${riskSignals.map(s => "- " + s).join("\n")}

MACRO: VIX ${vixQ ? vixQ.price.toFixed(1) : "n/a"}, S&P500 today ${spxQ ? spxQ.changePct.toFixed(2) + "%" : "n/a"}
${memory?.strategy ? `\nSAVED STRATEGY MEMORY:\n${memory.strategy.slice(0, 600)}` : ""}

Decide what, if anything, to do THIS run. Doing nothing is often correct — only propose trades your strategy mode genuinely calls for. Address any stop-loss breaches in risk signals (propose the sell, or explain in stop_alerts why you'd hold).

Respond with ONLY this JSON:
{
  "assessment": "2-4 sentences: market read + portfolio state + what you're doing and why",
  "actions": [{"action": "buy" | "sell", "symbol": "XYZ", "qty": 10, "reason": "one sentence"}],
  "stop_alerts": [{"symbol": "XYZ", "note": "stop/risk observation worth flagging"}]
}
Empty actions array is fine.`;

  let decision: AiDecision;
  let model: string;
  try {
    const out = await callGroqJson(prompt, groqKey);
    decision = out.decision;
    model = out.model;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    insertStrategyRun({ trigger, status: "error", summary: `AI call failed: ${msg}`, assessment: "", actions: [], model: "" });
    return { status: "error", summary: `AI call failed: ${msg}`, pending_processed: pendingProcessed };
  }

  const { accepted, rejected } = await validateActions(decision.actions, cfg, acct, positions);

  const executed: Array<{ side: string; symbol: string; qty: number; note: string }> = [];
  const queued: Array<{ id: number; side: string; symbol: string; qty: number; execute_after: string }> = [];
  const runId = insertStrategyRun({
    trigger,
    status: "ok",
    summary: accepted.length
      ? `${accepted.length} action(s): ${accepted.map(a => `${a.side} ${a.qty} ${a.symbol}`).join(", ")}${cfg.autopilot ? " [autopilot]" : " [queued for confirm]"}`
      : "No action taken",
    assessment: decision.assessment,
    actions: [
      ...accepted.map(a => ({ ...a, verdict: "accepted" })),
      ...rejected.map(r => ({ ...r, verdict: "rejected" })),
    ],
    model,
    equity_usd: acct.equity,
  });

  for (const a of accepted) {
    if (cfg.autopilot) {
      const r = await placeOrder(a.symbol, a.qty, a.side);
      // Record in pending_trades as an audit row so daily-spend tracking sees it.
      const id = insertPendingTrade({
        run_id: runId, symbol: a.symbol, side: a.side, qty: a.qty,
        est_price: a.est_price, reason: a.reason, execute_after: new Date().toISOString(),
      });
      resolvePendingTrade(id, r.ok ? "executed" : "failed", r.note, r.orderId);
      executed.push({ side: a.side, symbol: a.symbol, qty: a.qty, note: r.note });
    } else {
      const executeAfter = new Date(Date.now() + CONFIRM_WINDOW_MIN * 60 * 1000).toISOString();
      const id = insertPendingTrade({
        run_id: runId, symbol: a.symbol, side: a.side, qty: a.qty,
        est_price: a.est_price, reason: a.reason, execute_after: executeAfter,
      });
      queued.push({ id, side: a.side, symbol: a.symbol, qty: a.qty, execute_after: executeAfter });
    }
  }

  // Mirror into the decision log so it shows up in the LOG tab everywhere.
  try {
    insertTradingDecision({
      user_message: `[strategy run · ${cfg.mode} · ${trigger}]`,
      tool_calls: accepted.map(a => ({ name: `${a.side}_${a.symbol}`, input: { qty: a.qty }, output_preview: cfg.autopilot ? "executed" : "queued" })),
      ai_response: decision.assessment + (decision.stop_alerts.length ? "\n\nStop alerts:\n" + decision.stop_alerts.map(s => `${s.symbol}: ${s.note}`).join("\n") : ""),
      model,
      equity_usd: acct.equity,
      cash_usd: acct.cash,
    });
  } catch { /* non-fatal */ }

  return {
    status: "ok",
    summary: accepted.length ? `${accepted.length} action(s) ${cfg.autopilot ? "executed" : "queued"}` : "No action",
    assessment: decision.assessment,
    executed, queued, rejected,
    stop_alerts: decision.stop_alerts,
    pending_processed: pendingProcessed,
    model,
  };
}
