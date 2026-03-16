import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { readPortfolioState, readUserEntitlements } from "@/lib/db";
import { computeMetrics } from "@/lib/portfolio";

export const runtime = "nodejs";

const HOLDINGS_AI_MODEL = (
  process.env.PRO_HOLDINGS_AI_MODEL ||
  "gpt-4.1-mini"
).trim();
const HOLDINGS_AI_TIMEOUT_MS = clampInteger(process.env.PRO_HOLDINGS_AI_TIMEOUT_MS, 22000, 5000, 45000);
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

interface HoldingsAiResponse {
  model: string;
  analysis: HoldingsAiAnalysis;
}

function clampInteger(raw: string | undefined, fallback: number, min: number, max: number): number {
  const parsed = Number.parseInt(String(raw || "").trim(), 10);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, parsed));
}

function toRounded(value: number, digits = 2): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function resolveHoldingUnits(units: number, value: number, price: number): number {
  if (Number.isFinite(units) && units > 0) {
    return units;
  }

  if (Number.isFinite(value) && value > 0 && Number.isFinite(price) && price > 0) {
    return value / price;
  }

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
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => String(item || "").trim())
    .filter(Boolean)
    .slice(0, maxItems)
    .map((item) => item.slice(0, maxLength));
}

function parseAiAnalysis(content: string): HoldingsAiAnalysis | null {
  const cleaned = stripCodeFence(content);
  if (!cleaned) {
    return null;
  }

  try {
    const parsed = JSON.parse(cleaned) as {
      answer?: unknown;
      portfolioDrivers?: unknown;
      holdingBreakdown?: unknown;
      riskChecks?: unknown;
      nextActions?: unknown;
    };

    const answer = String(parsed.answer || "").trim().slice(0, 900);
    if (!answer) {
      return null;
    }

    const portfolioDrivers = coerceShortLines(parsed.portfolioDrivers, 8);
    const riskChecks = coerceShortLines(parsed.riskChecks, 8);
    const nextActions = coerceShortLines(parsed.nextActions, 8);

    const holdingBreakdown = Array.isArray(parsed.holdingBreakdown)
      ? parsed.holdingBreakdown
        .slice(0, 10)
        .map((entry) => {
          const row = entry as {
            ticker?: unknown;
            summary?: unknown;
            influences?: unknown;
            riskFlags?: unknown;
            confidence?: unknown;
          };

          const ticker = String(row.ticker || "").trim().toUpperCase().slice(0, 16);
          const summary = String(row.summary || "").trim().slice(0, 320);
          const influences = coerceShortLines(row.influences, 6, 200);
          const riskFlags = coerceShortLines(row.riskFlags, 5, 180);
          const confidenceRaw = Number(row.confidence);
          const confidence = Number.isFinite(confidenceRaw)
            ? Math.max(0, Math.min(100, Math.round(confidenceRaw)))
            : 0;

          if (!ticker || !summary) {
            return null;
          }

          return {
            ticker,
            summary,
            influences,
            riskFlags,
            confidence,
          } satisfies AiHoldingBreakdown;
        })
        .filter((row): row is AiHoldingBreakdown => Boolean(row))
      : [];

    return {
      answer,
      portfolioDrivers,
      holdingBreakdown,
      riskChecks,
      nextActions,
    };
  } catch {
    return null;
  }
}

function buildHoldingsSummary(userId: string) {
  const state = readPortfolioState(userId);
  const metrics = computeMetrics(state.holdings, state.snapshots, "3M");

  const grouped = new Map<string, HoldingPromptSummary>();

  for (const holding of state.holdings) {
    const ticker = holding.ticker.trim().toUpperCase();
    if (!ticker) {
      continue;
    }

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
      });
      continue;
    }

    const nextUnits = existing.units + units;
    const nextMarketValue = existing.marketValue + holding.value;
    const nextCostBase = existing.costBase + holding.costBase;
    const nextDayChangeAmount = existing.dayChangeAmount + dayChangeAmount;
    const nextPrevBase = nextUnits > 0 && prevClose > 0 ? nextUnits * prevClose : 0;

    existing.units = nextUnits;
    existing.marketValue = nextMarketValue;
    existing.costBase = nextCostBase;
    existing.unrealizedPnl = nextMarketValue - nextCostBase;
    existing.unrealizedPnlPct = nextCostBase > 0 ? ((nextMarketValue - nextCostBase) / nextCostBase) * 100 : 0;
    existing.dayChangeAmount = nextDayChangeAmount;
    existing.dayChangePct = nextPrevBase > 0 ? (nextDayChangeAmount / nextPrevBase) * 100 : existing.dayChangePct;
    existing.avgCost = nextUnits > 0 ? nextCostBase / nextUnits : 0;
    existing.lastPrice = holding.price;
    existing.prevClose = prevClose || existing.prevClose;
    if (existing.source !== holding.source) {
      existing.source = "mixed";
    }
    if (existing.sector === "Uncategorized" && holding.sector) {
      existing.sector = holding.sector;
    }
  }

  const holdings = Array.from(grouped.values())
    .map((holding) => ({
      ...holding,
      weightPct: metrics.totalValue > 0 ? (holding.marketValue / metrics.totalValue) * 100 : 0,
    }))
    .sort((a, b) => b.marketValue - a.marketValue);

  const topHoldings = holdings.slice(0, 14).map((holding) => ({
    ticker: holding.ticker,
    name: holding.name,
    source: holding.source,
    sector: holding.sector,
    units: toRounded(holding.units, 4),
    marketValue: toRounded(holding.marketValue),
    costBase: toRounded(holding.costBase),
    unrealizedPnl: toRounded(holding.unrealizedPnl),
    unrealizedPnlPct: toRounded(holding.unrealizedPnlPct),
    dayChangeAmount: toRounded(holding.dayChangeAmount),
    dayChangePct: toRounded(holding.dayChangePct),
    avgCost: toRounded(holding.avgCost, 4),
    lastPrice: toRounded(holding.lastPrice, 4),
    prevClose: toRounded(holding.prevClose, 4),
    weightPct: toRounded(holding.weightPct),
  }));

  const topGainers = [...holdings]
    .sort((a, b) => b.dayChangePct - a.dayChangePct)
    .slice(0, 4)
    .map((holding) => ({
      ticker: holding.ticker,
      dayChangePct: toRounded(holding.dayChangePct),
      dayChangeAmount: toRounded(holding.dayChangeAmount),
    }));

  const topLosers = [...holdings]
    .sort((a, b) => a.dayChangePct - b.dayChangePct)
    .slice(0, 4)
    .map((holding) => ({
      ticker: holding.ticker,
      dayChangePct: toRounded(holding.dayChangePct),
      dayChangeAmount: toRounded(holding.dayChangeAmount),
    }));

  return {
    state,
    metrics,
    topHoldings,
    topGainers,
    topLosers,
  };
}

function buildPromptContext(userEmail: string, question: string, userId: string) {
  const { state, metrics, topHoldings, topGainers, topLosers } = buildHoldingsSummary(userId);

  return {
    generatedAt: new Date().toISOString(),
    timezone: "Australia/Sydney",
    user: userEmail,
    question,
    portfolio: {
      holdingsCount: state.holdings.length,
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
    topHoldings,
    sectorAllocation: metrics.sectorAllocation.slice(0, 8).map((item) => ({
      sector: item.name,
      value: toRounded(item.value),
      pct: toRounded(item.pct),
    })),
    accountAllocation: metrics.accountAllocation.slice(0, 8).map((item) => ({
      account: item.name,
      value: toRounded(item.value),
      pct: toRounded(item.pct),
    })),
    recentHistory: metrics.history.slice(-10).map((point) => ({
      date: point.date,
      value: toRounded(point.value),
    })),
  };
}

async function generateHoldingsAnalysis(userEmail: string, userId: string, question: string): Promise<HoldingsAiResponse> {
  const apiKey = String(process.env.OPENAI_API_KEY || "").trim();
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not configured.");
  }

  const context = buildPromptContext(userEmail, question, userId);

  const systemPrompt =
    "You are SPECTRE Pro's portfolio analyst. Output JSON only (no markdown). " +
    "Use this exact schema: " +
    '{"answer":"string","portfolioDrivers":["string"],"holdingBreakdown":[{"ticker":"string","summary":"string","influences":["string"],"riskFlags":["string"],"confidence":0}],"riskChecks":["string"],"nextActions":["string"]}. ' +
    "Focus on what may be influencing holdings value (momentum, trend, sector drivers, rates/FX/commodities, concentration, and risk). " +
    "Do not invent specific company announcements or dates not provided in context. " +
    "If data is missing, state that clearly. Keep sentences short and operator-focused.";

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), HOLDINGS_AI_TIMEOUT_MS);

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: HOLDINGS_AI_MODEL,
        temperature: 0.1,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: JSON.stringify(context) },
        ],
      }),
    });

    if (!response.ok) {
      let detail = "";

      try {
        const payload = (await response.json()) as { error?: { message?: string } };
        detail = String(payload.error?.message || "").trim();
      } catch {
        detail = "";
      }

      const suffix = detail ? `: ${detail}` : "";
      throw new Error(`OpenAI request failed (${response.status})${suffix}`);
    }

    const payload = (await response.json()) as {
      model?: string;
      choices?: Array<{ message?: { content?: string } }>;
    };

    const content = payload.choices?.[0]?.message?.content || "";
    const analysis = parseAiAnalysis(content);

    if (!analysis) {
      throw new Error("AI holdings response was empty or invalid.");
    }

    return {
      model: payload.model || HOLDINGS_AI_MODEL,
      analysis,
    };
  } finally {
    clearTimeout(timeout);
  }
}

export async function POST(request: Request) {
  try {
    const sessionUser = await getAuthenticatedUser();
    if (!sessionUser) {
      return NextResponse.json({ error: "Please sign in first." }, { status: 401 });
    }

    const entitlements = readUserEntitlements(sessionUser.id);
    if (!entitlements.proEnabled) {
      return NextResponse.json({ error: "Pro plan required for Ask AI holdings analysis." }, { status: 403 });
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

    const question = typeof body.question === "string" && body.question.trim().length > 0
      ? body.question.trim().slice(0, 700)
      : DEFAULT_QUESTION;

    const ai = await generateHoldingsAnalysis(sessionUser.email, sessionUser.id, question);

    return NextResponse.json({
      ok: true,
      analysis: {
        generatedAt: new Date().toISOString(),
        model: ai.model,
        question,
        ...ai.analysis,
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to run Ask AI holdings analysis.",
      },
      { status: 500 },
    );
  }
}
