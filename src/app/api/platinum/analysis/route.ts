import { NextResponse } from "next/server";
import { getAuthenticatedUser, normalizeEmail } from "@/lib/auth";
import { getPlatinumPaperState } from "@/lib/platinum";

export const runtime = "nodejs";

const PLATINUM_EMAIL = "jwmcghee09@gmail.com";
const ANALYSIS_MODEL = (process.env.PLATINUM_ANALYSIS_MODEL || process.env.PLATINUM_AI_MODEL || "gpt-4.1-mini").trim();
const ANALYSIS_TIMEOUT_MS = clampInteger(process.env.PLATINUM_ANALYSIS_TIMEOUT_MS, 20000, 5000, 45000);

interface AiAnalysis {
  overview: string;
  riskSignals: string[];
  tradeSignals: string[];
  watchlist: string[];
  nextActions: string[];
}

interface AiAnalysisResponse {
  model: string;
  analysis: AiAnalysis;
}

function clampInteger(raw: string | undefined, fallback: number, min: number, max: number): number {
  const parsed = Number.parseInt(String(raw || "").trim(), 10);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, parsed));
}

function isPlatinumUser(email: string): boolean {
  return normalizeEmail(email) === PLATINUM_EMAIL;
}

function stripCodeFence(raw: string): string {
  return String(raw || "")
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```$/, "")
    .trim();
}

function coerceShortLines(value: unknown, maxItems: number): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => String(item || "").trim())
    .filter(Boolean)
    .slice(0, maxItems)
    .map((item) => item.slice(0, 220));
}

function parseAnalysis(content: string): AiAnalysis | null {
  const cleaned = stripCodeFence(content);
  if (!cleaned) {
    return null;
  }

  try {
    const parsed = JSON.parse(cleaned) as {
      overview?: unknown;
      riskSignals?: unknown;
      tradeSignals?: unknown;
      watchlist?: unknown;
      nextActions?: unknown;
    };

    const overview = String(parsed.overview || "").trim().slice(0, 700);
    const riskSignals = coerceShortLines(parsed.riskSignals, 7);
    const tradeSignals = coerceShortLines(parsed.tradeSignals, 7);
    const watchlist = coerceShortLines(parsed.watchlist, 8);
    const nextActions = coerceShortLines(parsed.nextActions, 6);

    if (!overview) {
      return null;
    }

    return {
      overview,
      riskSignals,
      tradeSignals,
      watchlist,
      nextActions,
    };
  } catch {
    return null;
  }
}

function toPromptContext(userEmail: string, state: ReturnType<typeof getPlatinumPaperState>) {
  const investedValue = state.portfolio.investedValue;
  const equity = state.portfolio.equity;

  const positions = state.positions.slice(0, 14).map((position) => ({
    ticker: position.ticker,
    marketValue: Number(position.marketValue.toFixed(2)),
    weightPct: investedValue > 0 ? Number(((position.marketValue / investedValue) * 100).toFixed(2)) : 0,
    unrealizedPnl: Number(position.unrealizedPnl.toFixed(2)),
    avgCost: Number(position.avgCost.toFixed(4)),
    lastPrice: Number(position.lastPrice.toFixed(4)),
    peakPrice: Number(position.peakPrice.toFixed(4)),
  }));

  const recommendations = state.latestRecommendations.slice(0, 24).map((recommendation) => ({
    ticker: recommendation.ticker,
    action: recommendation.action,
    finalScore: Number(recommendation.finalScore.toFixed(4)),
    expectedReturnPct: Number(recommendation.expectedReturnPct.toFixed(2)),
    confidence: Number(recommendation.confidence.toFixed(1)),
    aiAdjustment: Number(recommendation.aiAdjustment.toFixed(2)),
    aiConfidence: Number(recommendation.aiConfidence.toFixed(1)),
    aiSummary: recommendation.aiSummary.slice(0, 160),
    reason: recommendation.reason.slice(0, 200),
  }));

  const trades = state.recentTrades.slice(0, 12).map((trade) => ({
    date: trade.createdAt,
    ticker: trade.ticker,
    side: trade.side,
    units: Number(trade.units.toFixed(3)),
    notional: Number(trade.notional.toFixed(2)),
    price: Number(trade.price.toFixed(4)),
    fee: Number(trade.fee.toFixed(2)),
  }));

  const buyCount = state.latestRecommendations.filter((recommendation) => recommendation.action === "buy").length;
  const sellCount = state.latestRecommendations.filter((recommendation) => recommendation.action === "sell").length;
  const holdCount = state.latestRecommendations.filter((recommendation) => recommendation.action === "hold").length;

  return {
    generatedAt: new Date().toISOString(),
    user: userEmail,
    timezone: "Australia/Sydney",
    latestScanDate: state.latestScanDate,
    portfolio: {
      cash: Number(state.portfolio.cash.toFixed(2)),
      investedValue: Number(investedValue.toFixed(2)),
      equity: Number(equity.toFixed(2)),
      totalPnl: Number(state.portfolio.totalPnl.toFixed(2)),
      totalReturnPct: Number(state.portfolio.totalReturnPct.toFixed(2)),
      realizedPnl: Number(state.portfolio.realizedPnl.toFixed(2)),
      unrealizedPnl: Number(state.portfolio.unrealizedPnl.toFixed(2)),
      cashPct: equity > 0 ? Number(((state.portfolio.cash / equity) * 100).toFixed(2)) : 0,
      positionCount: state.positions.length,
    },
    actionMix: {
      buy: buyCount,
      sell: sellCount,
      hold: holdCount,
    },
    positions,
    topRecommendations: recommendations,
    recentTrades: trades,
    recentEquity: state.snapshots.slice(-10).map((snapshot) => ({
      scanDate: snapshot.scanDate,
      equity: Number(snapshot.equity.toFixed(2)),
      cash: Number(snapshot.cash.toFixed(2)),
      investedValue: Number(snapshot.investedValue.toFixed(2)),
    })),
  };
}

async function generateAnalysis(userEmail: string, state: ReturnType<typeof getPlatinumPaperState>): Promise<AiAnalysisResponse> {
  const apiKey = String(process.env.OPENAI_API_KEY || "").trim();
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not configured.");
  }

  const context = toPromptContext(userEmail, state);

  const systemPrompt =
    "You are SPECTRE Platinum's ASX risk analyst. Output JSON only (no markdown) with schema " +
    '{"overview":"string","riskSignals":["string"],"tradeSignals":["string"],"watchlist":["string"],"nextActions":["string"]}. ' +
    "Use direct plain English for a portfolio operator. Keep overview under 120 words. " +
    "Each list item must be a concise action-oriented sentence. Avoid financial advice disclaimers.";

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ANALYSIS_TIMEOUT_MS);

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: ANALYSIS_MODEL,
        temperature: 0.15,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: JSON.stringify(context) },
        ],
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenAI request failed (${response.status}).`);
    }

    const payload = (await response.json()) as {
      model?: string;
      choices?: Array<{ message?: { content?: string } }>;
    };

    const content = payload.choices?.[0]?.message?.content || "";
    const analysis = parseAnalysis(content);

    if (!analysis) {
      throw new Error("AI analysis response was empty or invalid.");
    }

    return {
      model: payload.model || ANALYSIS_MODEL,
      analysis,
    };
  } finally {
    clearTimeout(timeout);
  }
}

export async function POST() {
  try {
    const user = await getAuthenticatedUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!isPlatinumUser(user.email)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const state = getPlatinumPaperState(user.id);
    const ai = await generateAnalysis(user.email, state);

    return NextResponse.json({
      ok: true,
      analysis: {
        generatedAt: new Date().toISOString(),
        model: ai.model,
        ...ai.analysis,
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to generate AI portfolio analysis.",
      },
      { status: 500 },
    );
  }
}
