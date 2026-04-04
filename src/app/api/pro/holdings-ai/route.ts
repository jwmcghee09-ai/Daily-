import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { readPortfolioState, readUserEntitlements, getAiUsageThisMonth, incrementAiUsage, PlanTier } from "@/lib/db";
import { computeMetrics } from "@/lib/portfolio";

const AI_MONTHLY_LIMITS: Record<PlanTier, number> = {
  none: 3,
  free: 3,
  plus: 20,
  pro: -1, // unlimited
};

export const runtime = "nodejs";

// Per-plan OpenAI model tier
const OPENAI_MODELS: Record<PlanTier, string> = {
  none: "gpt-4o-mini",
  free: "gpt-4o-mini",
  plus: "gpt-4.1-mini",
  pro: "gpt-4.1",
};
const HOLDINGS_AI_TIMEOUT_MS = clampInteger(process.env.PRO_HOLDINGS_AI_TIMEOUT_MS, 90000, 10000, 180000);
const DEFAULT_QUESTION = "What is most likely influencing the value of my current holdings right now?";

interface AskHoldingsBody {
  question?: unknown;
}

interface HoldingPromptSummary {
  ticker: string;
  name: string;
  source: string;
  sector: string;
  units: number;
  marketValue: number;
  costBase: number;
  unrealizedPnl: number;
  unrealizedPnlPct: number;
  dayChangeAmount: number;
  dayChangePct: number;
  avgCost: number;
  lastPrice: number;
  prevClose: number;
  weightPct: number;
  _prevBase: number;
}

interface AiHoldingBreakdown {
  ticker: string;
  summary: string;
  influences: string[];
  riskFlags: string[];
  confidence: number;
}

interface HoldingsAiAnalysis {
  answer: string;
  portfolioDrivers: string[];
  holdingBreakdown: AiHoldingBreakdown[];
  riskChecks: string[];
  nextActions: string[];
}

function clampInteger(raw: string | undefined, fallback: number, min: number, max: number): number {
  const parsed = Number.parseInt(String(raw || "").trim(), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function toRounded(value: number, digits = 2): number {
  if (!Number.isFinite(value)) return 0;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function resolveHoldingUnits(units: number, value: number, price: number): number {
  if (Number.isFinite(units) && units > 0) return units;
  if (Number.isFinite(value) && value > 0 && Number.isFinite(price) && price > 0) return value / price;
  return 0;
}

function stripCodeFence(raw: string): string {
  return String(raw || "")
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```$/, "")
    .trim();
}

function coerceShortLines(value: unknown, maxItems: number, maxLength = 220): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => String(item || "").trim())
    .filter(Boolean)
    .slice(0, maxItems)
    .map((item) => item.slice(0, maxLength));
}

function parseAiAnalysis(content: string): HoldingsAiAnalysis | null {
  const cleaned = stripCodeFence(content);
  if (!cleaned) return null;

  try {
    const parsed = JSON.parse(cleaned) as {
      answer?: unknown;
      portfolioDrivers?: unknown;
      holdingBreakdown?: unknown;
      riskChecks?: unknown;
      nextActions?: unknown;
    };

    const answer = String(parsed.answer || "").trim().slice(0, 2500);
    if (!answer) return null;

    const portfolioDrivers = coerceShortLines(parsed.portfolioDrivers, 10);
    const riskChecks = coerceShortLines(parsed.riskChecks, 10);
    const nextActions = coerceShortLines(parsed.nextActions, 10);

    const holdingBreakdown = Array.isArray(parsed.holdingBreakdown)
      ? parsed.holdingBreakdown
          .slice(0, 20)
          .map((entry) => {
            const row = entry as {
              ticker?: unknown;
              summary?: unknown;
              influences?: unknown;
              riskFlags?: unknown;
              confidence?: unknown;
            };
            const ticker = String(row.ticker || "").trim().toUpperCase().slice(0, 16);
            const summary = String(row.summary || "").trim().slice(0, 400);
            const influences = coerceShortLines(row.influences, 6, 200);
            const riskFlags = coerceShortLines(row.riskFlags, 5, 180);
            const confidenceRaw = Number(row.confidence);
            const confidence = Number.isFinite(confidenceRaw)
              ? Math.max(0, Math.min(100, Math.round(confidenceRaw)))
              : 0;
            if (!ticker || !summary) return null;
            return { ticker, summary, influences, riskFlags, confidence } satisfies AiHoldingBreakdown;
          })
          .filter((row): row is AiHoldingBreakdown => Boolean(row))
      : [];

    return { answer, portfolioDrivers, holdingBreakdown, riskChecks, nextActions };
  } catch {
    return null;
  }
}

// ── Market snapshot ────────────────────────────────────────────────────────────

async function fetchYahooQuote(symbol: string): Promise<{ price: number | null; prevClose: number | null }> {
  for (const host of ["query2.finance.yahoo.com", "query1.finance.yahoo.com"]) {
    try {
      const url = `https://${host}/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=5d`;
      const controller = new AbortController();
      const t = setTimeout(() => controller.abort(), 5000);
      const res = await fetch(url, {
        cache: "no-store",
        signal: controller.signal,
        headers: { "User-Agent": "Mozilla/5.0", Accept: "application/json" },
      });
      clearTimeout(t);
      if (!res.ok) continue;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data = (await res.json()) as any;
      const meta = data?.chart?.result?.[0]?.meta ?? {};
      const price = typeof meta.regularMarketPrice === "number" ? meta.regularMarketPrice : null;
      if (price === null) continue;
      const prevClose =
        typeof meta.previousClose === "number" ? meta.previousClose
        : typeof meta.chartPreviousClose === "number" ? meta.chartPreviousClose
        : null;
      return { price, prevClose };
    } catch {
      continue;
    }
  }
  return { price: null, prevClose: null };
}

async function fetchMarketSnapshot() {
  const [yahooResults, cgRes, fxRes] = await Promise.allSettled([
    Promise.all(["^AXJO", "^VIX", "XAUUSD=X", "AUDUSD=X"].map(fetchYahooQuote)),
    fetch(
      "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum&vs_currencies=usd&include_24hr_change=true",
      { cache: "no-store", signal: AbortSignal.timeout(6000) },
    )
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null),
    fetch("https://api.frankfurter.app/latest?from=USD&to=AUD", {
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    })
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null),
  ]);

  const yahoo = yahooResults.status === "fulfilled" ? yahooResults.value : [null, null, null, null];
  const [asx200q, vixq, goldUsdq, audUsdYahooq] = yahoo as Array<{ price: number | null; prevClose: number | null } | null>;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cg: any = cgRes.status === "fulfilled" ? cgRes.value : null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fx: any = fxRes.status === "fulfilled" ? fxRes.value : null;

  const audUsd =
    typeof fx?.rates?.AUD === "number" && fx.rates.AUD > 0
      ? Math.round((1 / fx.rates.AUD) * 10000) / 10000
      : audUsdYahooq?.price ?? null;

  const goldAud =
    goldUsdq?.price && audUsd && audUsd > 0
      ? Math.round(goldUsdq.price / audUsd)
      : null;

  const asx200ChangePct =
    asx200q?.price && asx200q.prevClose && asx200q.prevClose > 0
      ? toRounded(((asx200q.price - asx200q.prevClose) / asx200q.prevClose) * 100)
      : null;

  return {
    fetchedAt: new Date().toISOString(),
    asx200: asx200q?.price
      ? {
          level: Math.round(asx200q.price),
          changePct: asx200ChangePct,
          direction: asx200ChangePct !== null ? (asx200ChangePct >= 0 ? "up" : "down") : null,
        }
      : null,
    audUsd,
    vix: vixq?.price !== null && vixq?.price !== undefined ? toRounded(vixq.price) : null,
    btc:
      typeof cg?.bitcoin?.usd === "number"
        ? {
            priceUsd: Math.round(cg.bitcoin.usd),
            changePct24h:
              typeof cg.bitcoin.usd_24h_change === "number" ? toRounded(cg.bitcoin.usd_24h_change) : null,
          }
        : null,
    eth:
      typeof cg?.ethereum?.usd === "number"
        ? {
            priceUsd: Math.round(cg.ethereum.usd),
            changePct24h:
              typeof cg.ethereum.usd_24h_change === "number" ? toRounded(cg.ethereum.usd_24h_change) : null,
          }
        : null,
    goldAud,
  };
}

// ── Holdings summary ───────────────────────────────────────────────────────────

function buildHoldingsSummary(userId: string) {
  const state = readPortfolioState(userId);
  const metrics = computeMetrics(state.holdings, state.snapshots, "3M");

  const grouped = new Map<string, HoldingPromptSummary>();

  for (const holding of state.holdings) {
    const ticker = holding.ticker.trim().toUpperCase();
    if (!ticker) continue;

    const units = resolveHoldingUnits(holding.units, holding.value, holding.price);
    const prevClose = Number.isFinite(holding.prevClose) && holding.prevClose > 0 ? holding.prevClose : 0;
    const dayChangeAmount = units > 0 && prevClose > 0 ? units * (holding.price - prevClose) : 0;
    const baseForDayPct = units > 0 && prevClose > 0 ? units * prevClose : 0;
    const dayChangePct = baseForDayPct > 0 ? (dayChangeAmount / baseForDayPct) * 100 : 0;
    const pnl = holding.value - holding.costBase;
    const pnlPct = holding.costBase > 0 ? (pnl / holding.costBase) * 100 : 0;
    const avgCost = units > 0 ? holding.costBase / units : 0;

    const existing = grouped.get(ticker);
    if (!existing) {
      grouped.set(ticker, {
        ticker,
        name: holding.name || ticker,
        source: holding.source,
        sector: holding.sector || "Uncategorized",
        units,
        marketValue: holding.value,
        costBase: holding.costBase,
        unrealizedPnl: pnl,
        unrealizedPnlPct: pnlPct,
        dayChangeAmount,
        dayChangePct,
        avgCost,
        lastPrice: holding.price,
        prevClose,
        weightPct: 0,
        _prevBase: baseForDayPct,
      });
      continue;
    }

    const nextUnits = existing.units + units;
    const nextMarketValue = existing.marketValue + holding.value;
    const nextCostBase = existing.costBase + holding.costBase;
    const nextDayChangeAmount = existing.dayChangeAmount + dayChangeAmount;
    const nextPrevBase = existing._prevBase + baseForDayPct;

    existing.units = nextUnits;
    existing.marketValue = nextMarketValue;
    existing.costBase = nextCostBase;
    existing.unrealizedPnl = nextMarketValue - nextCostBase;
    existing.unrealizedPnlPct = nextCostBase > 0 ? ((nextMarketValue - nextCostBase) / nextCostBase) * 100 : 0;
    existing.dayChangeAmount = nextDayChangeAmount;
    existing.dayChangePct = nextPrevBase > 0 ? (nextDayChangeAmount / nextPrevBase) * 100 : existing.dayChangePct;
    existing._prevBase = nextPrevBase;
    existing.avgCost = nextUnits > 0 ? nextCostBase / nextUnits : 0;
    existing.lastPrice = holding.price;
    existing.prevClose = prevClose > 0 ? prevClose : existing.prevClose;
    if (existing.source !== holding.source) existing.source = "mixed";
    if (existing.sector === "Uncategorized" && holding.sector) existing.sector = holding.sector;
  }

  const holdings = Array.from(grouped.values())
    .map((h) => ({
      ...h,
      weightPct: metrics.totalValue > 0 ? (h.marketValue / metrics.totalValue) * 100 : 0,
    }))
    .sort((a, b) => b.marketValue - a.marketValue);

  // Send all holdings (no slice cap)
  const allHoldings = holdings.map((h) => ({
    ticker: h.ticker,
    name: h.name,
    source: h.source,
    sector: h.sector,
    units: toRounded(h.units, 4),
    marketValue: toRounded(h.marketValue),
    costBase: toRounded(h.costBase),
    unrealizedPnl: toRounded(h.unrealizedPnl),
    unrealizedPnlPct: toRounded(h.unrealizedPnlPct),
    dayChangeAmount: toRounded(h.dayChangeAmount),
    dayChangePct: toRounded(h.dayChangePct),
    avgCost: toRounded(h.avgCost, 4),
    lastPrice: toRounded(h.lastPrice, 4),
    prevClose: toRounded(h.prevClose, 4),
    weightPct: toRounded(h.weightPct),
  }));

  const topGainers = [...holdings]
    .sort((a, b) => b.dayChangePct - a.dayChangePct)
    .slice(0, 5)
    .map((h) => ({ ticker: h.ticker, dayChangePct: toRounded(h.dayChangePct), dayChangeAmount: toRounded(h.dayChangeAmount) }));

  const topLosers = [...holdings]
    .sort((a, b) => a.dayChangePct - b.dayChangePct)
    .slice(0, 5)
    .map((h) => ({ ticker: h.ticker, dayChangePct: toRounded(h.dayChangePct), dayChangeAmount: toRounded(h.dayChangeAmount) }));

  return { state, metrics, allHoldings, topGainers, topLosers };
}

// ── Prompt ─────────────────────────────────────────────────────────────────────

function buildSystemPrompt(): string {
  return (
    "You are SPECTRE Pro's portfolio analyst for Australian investors. " +
    "Output valid JSON only — no markdown, no prose outside the JSON object. " +
    'Use this exact schema: {"answer":"string","portfolioDrivers":["string"],"holdingBreakdown":[{"ticker":"string","summary":"string","influences":["string"],"riskFlags":["string"],"confidence":0}],"riskChecks":["string"],"nextActions":["string"]}. ' +
    "\n\nA live market snapshot is included in the context. Use it to ground your analysis in current conditions:\n" +
    "- Reference ASX200 level and direction when discussing equity holdings\n" +
    "- Reference AUD/USD when discussing import-sensitive stocks, global earners, and gold\n" +
    "- Reference VIX as the current volatility regime indicator\n" +
    "- Reference BTC/ETH prices and 24h change for crypto holdings\n" +
    "- Reference gold AUD price for bullion holdings\n" +
    "\nRules:\n" +
    "- Do NOT invent company announcements, earnings dates, or specific events not present in the provided data\n" +
    "- DO reference current market levels from the snapshot where relevant\n" +
    "- holdingBreakdown must cover all tickers in holdings, sorted by weightPct descending\n" +
    "- riskFlags use standard labels: Concentration, FX Risk, Sector Overlap, High Volatility, Correlation Risk, Drawdown Risk, Liquidity Risk\n" +
    "- confidence: 85-100 when market price + cost base both available; 50-75 when estimated or stale\n" +
    "- answer field: minimum 150 words, address the user's specific question directly\n" +
    "- nextActions: specific and actionable, not generic advice\n" +
    "- Keep sentences short and operator-focused"
  );
}

function buildPromptContext(
  userEmail: string,
  question: string,
  userId: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  marketSnapshot: any,
) {
  const { state, metrics, allHoldings, topGainers, topLosers } = buildHoldingsSummary(userId);

  return {
    generatedAt: new Date().toISOString(),
    timezone: "Australia/Sydney",
    user: userEmail,
    question,
    marketSnapshot,
    portfolio: {
      holdingsCount: state.holdings.length,
      uniqueTickers: allHoldings.length,
      snapshotsCount: state.snapshots.length,
      totalValue: toRounded(metrics.totalValue),
      totalCost: toRounded(metrics.totalCost),
      unrealizedPnl: toRounded(metrics.pnl),
      unrealizedPnlPct: toRounded(metrics.pnlPct),
      top3ConcentrationPct: toRounded(metrics.top3ConcentrationPct),
      largestAccountPct: toRounded(metrics.largestAccountPct),
      hhi: toRounded(metrics.hhi),
      dailyReturnsCount: metrics.dailyReturns.length,
      volatilityAnnualPct: metrics.volatilityAnnualPct == null ? null : toRounded(metrics.volatilityAnnualPct),
      maxDrawdownPct: metrics.maxDrawdownPct == null ? null : toRounded(metrics.maxDrawdownPct),
      var95Pct: metrics.var95Pct == null ? null : toRounded(metrics.var95Pct),
      cvar95Pct: metrics.cvar95Pct == null ? null : toRounded(metrics.cvar95Pct),
      riskWindow: metrics.riskWindow,
      riskPointsUsed: metrics.riskPointsUsed,
      riskStartDate: metrics.riskStartDate,
      riskEndDate: metrics.riskEndDate,
      updatedAt: state.updatedAt || null,
      lastPriceRefreshAt: state.lastPriceRefreshAt || null,
    },
    topGainers,
    topLosers,
    holdings: allHoldings,
    sectorAllocation: metrics.sectorAllocation.slice(0, 10).map((item) => ({
      sector: item.name,
      value: toRounded(item.value),
      pct: toRounded(item.pct),
    })),
    accountAllocation: metrics.accountAllocation.slice(0, 10).map((item) => ({
      account: item.name,
      value: toRounded(item.value),
      pct: toRounded(item.pct),
    })),
    // 30 history points instead of 10 for better trend analysis
    recentHistory: metrics.history.slice(-30).map((point) => ({
      date: point.date,
      value: toRounded(point.value),
    })),
  };
}

// ── Route handler ──────────────────────────────────────────────────────────────

export async function POST(request: Request) {
  const sessionUser = await getAuthenticatedUser();
  if (!sessionUser) {
    return NextResponse.json({ error: "Please sign in first." }, { status: 401 });
  }

  const entitlements = readUserEntitlements(sessionUser.id);
  const monthlyLimit = AI_MONTHLY_LIMITS[entitlements.planTier] ?? 3;
  const usedThisMonth = getAiUsageThisMonth(sessionUser.id);

  if (monthlyLimit !== -1 && usedThisMonth >= monthlyLimit) {
    const upgradeHint =
      entitlements.planTier === "none"
        ? " Upgrade to Plus for 20/month, or Pro for unlimited."
        : entitlements.planTier === "plus"
          ? " Upgrade to Pro for unlimited Ask AI."
          : "";
    return NextResponse.json(
      {
        error: `You've used all ${monthlyLimit} Ask AI sessions for this month.${upgradeHint}`,
        aiUsed: usedThisMonth,
        aiLimit: monthlyLimit,
      },
      { status: 429 },
    );
  }

  const state = readPortfolioState(sessionUser.id);
  if (state.holdings.length === 0) {
    return NextResponse.json({ error: "Import holdings first to run Ask AI analysis." }, { status: 400 });
  }

  let body: AskHoldingsBody = {};
  try {
    body = (await request.json()) as AskHoldingsBody;
  } catch {
    body = {};
  }

  const question =
    typeof body.question === "string" && body.question.trim().length > 0
      ? body.question.trim().slice(0, 700)
      : DEFAULT_QUESTION;

  const apiKey = String(process.env.OPENAI_API_KEY || "").trim();
  if (!apiKey) {
    return NextResponse.json({ error: "OPENAI_API_KEY is not configured." }, { status: 503 });
  }

  const openAiModel = OPENAI_MODELS[entitlements.planTier] ?? "gpt-4o-mini";

  // Fetch live market data in parallel with no extra latency
  const marketSnapshot = await fetchMarketSnapshot();
  const context = buildPromptContext(sessionUser.email, question, sessionUser.id, marketSnapshot);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), HOLDINGS_AI_TIMEOUT_MS);

  let openAiRes: Response;
  try {
    openAiRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: openAiModel,
        max_tokens: 4096,
        stream: true,
        temperature: 0.1,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: buildSystemPrompt() },
          { role: "user", content: JSON.stringify(context) },
        ],
      }),
    });
  } catch (error) {
    clearTimeout(timeoutId);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to reach OpenAI." },
      { status: 502 },
    );
  }

  if (!openAiRes.ok) {
    clearTimeout(timeoutId);
    let detail = "";
    try {
      const payload = (await openAiRes.json()) as { error?: { message?: string } };
      detail = String(payload.error?.message || "").trim();
    } catch {}
    const suffix = detail ? `: ${detail}` : "";
    return NextResponse.json(
      { error: `OpenAI request failed (${openAiRes.status})${suffix}` },
      { status: 502 },
    );
  }

  // Transform OpenAI SSE → our SSE format:
  //   data: {"t":"chunk text"}\n\n  — incremental content
  //   data: {"done":true,"analysis":{...},"aiUsed":N,"aiLimit":N}\n\n  — final parsed analysis
  let accumulated = "";
  const enc = new TextEncoder();

  const transform = new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      const text = new TextDecoder().decode(chunk);
      for (const rawLine of text.split("\n")) {
        const line = rawLine.trim();
        if (!line.startsWith("data: ")) continue;
        const data = line.slice(6);
        if (data === "[DONE]") continue;
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const evt = JSON.parse(data) as any;
          // OpenAI streams choices[0].delta.content
          const delta: string = evt.choices?.[0]?.delta?.content ?? "";
          if (delta) {
            accumulated += delta;
            controller.enqueue(enc.encode(`data: ${JSON.stringify({ t: delta })}\n\n`));
          }
        } catch {
          /* skip malformed SSE lines */
        }
      }
    },
    flush(controller) {
      clearTimeout(timeoutId);
      const analysis = parseAiAnalysis(accumulated);
      if (analysis) {
        incrementAiUsage(sessionUser.id);
        const newUsed = usedThisMonth + 1;
        controller.enqueue(
          enc.encode(
            `data: ${JSON.stringify({ done: true, analysis, aiUsed: newUsed, aiLimit: monthlyLimit })}\n\n`,
          ),
        );
      } else {
        controller.enqueue(
          enc.encode(`data: ${JSON.stringify({ done: true, error: "AI response could not be parsed." })}\n\n`),
        );
      }
    },
  });

  return new Response(openAiRes.body!.pipeThrough(transform), {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "X-Accel-Buffering": "no",
    },
  });
}
