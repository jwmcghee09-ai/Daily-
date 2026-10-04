/**
 * The tools a connected AI can call, served from this site.
 *
 * Every one is a passthrough to an endpoint the website already has, which is
 * deliberate and is the same reasoning the local connector used: the analysis
 * lives where the data lives, so a tool cannot drift from what a person sees on
 * the page, and a measure added to the risk engine reaches every connected
 * assistant without anyone updating anything.
 *
 * Reaching those endpoints needs a session, and an OAuth token is not one. So a
 * session is minted for the single call and destroyed immediately after —
 * nothing long-lived, nothing the client ever holds, and no second way in that
 * outlives the request that needed it.
 *
 * Read-only throughout. Nothing here can import a holding, place an order or
 * change the strategy; Myrmidon's order path stays behind its own confirm
 * window, so an assistant can critique what it did and cannot do anything.
 */
import { createAndPersistSession, destroySessionToken } from "@/lib/auth";
import { SESSION_COOKIE_NAME } from "@/lib/auth";

const DISCLAIMER =
  "Possible anomalies only — statistical flags computed from public market data, "
  + "not financial advice or a recommendation. The user has the final say on every decision.";

const PAPER_NOTE =
  "Myrmidon trades a PAPER account — simulated money, not real funds. "
  + "These figures are not a real brokerage balance.";

export interface McpTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export const MCP_TOOLS: readonly McpTool[] = [
  {
    name: "get_portfolio",
    description:
      "Read the user's CURRENT portfolio straight from their SPECTRE account. This is the live "
      + "portfolio they maintain on the website — it reflects whatever they have imported or "
      + "changed, re-read fresh on every call. Use this whenever they refer to 'my portfolio' or "
      + "'my holdings'. Returns every holding: listed securities, cash balances, and anything "
      + "without a public quote such as super or unlisted funds, which carry the value the account "
      + "holds. totalValue and every weight cover all of it.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "portfolio_risk",
    description:
      "SPECTRE's own risk analysis of the account — the Quant tab, as data. Concentration, "
      + "volatility, max drawdown, VaR and CVaR, beta and tracking error, Sharpe and Sortino, the "
      + "correlation matrix, Monte Carlo projection, stress scenarios, and per-holding risk "
      + "contributions. Where the user's funds have been resolved these are measured on the "
      + "securities INSIDE those funds rather than on the funds themselves; the `basis` field says "
      + "which. Use these figures as given — they are computed server-side, do not recalculate.",
    inputSchema: {
      type: "object",
      properties: {
        window: { type: "string", enum: ["1M", "3M", "1Y"], description: "Risk window. Default 3M." },
        horizon: { type: "number", description: "Monte Carlo horizon in days, 1-365. Default 30." },
      },
    },
  },
  {
    name: "portfolio_funds",
    description:
      "What is inside the user's funds. Without a ticker, lists the funds they hold that have been "
      + "resolved into constituents, plus the holdings that could not be and why — including which "
      + "are ordinary shares with nothing inside them. With a ticker, returns that one fund's "
      + "holdings, its own sector or issuer-type mix, and the user's money in each company through "
      + "it. Use it when asked what a fund contains, or whether two funds overlap.",
    inputSchema: {
      type: "object",
      properties: {
        ticker: { type: "string", description: "A fund the user holds. Omit for the list." },
      },
    },
  },
  {
    name: "market_scan",
    description:
      "The full SPECTRE scanner on one symbol — the Research tab, as data. Price, RSI, moving "
      + "averages, 52-week position, volume against average, volatility, drawdown and any "
      + "statistical anomalies. Bare tickers resolve to the ASX first (BHP means BHP.AX); use a "
      + "suffix or a US symbol for other markets.",
    inputSchema: {
      type: "object",
      properties: { symbol: { type: "string", description: "Ticker, e.g. BHP or AAPL." } },
      required: ["symbol"],
    },
  },
  {
    name: "market_news",
    description: "Headlines SPECTRE is currently tracking, with source and timestamp.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "market_movers",
    description: "Today's gainers, losers and most active.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "macro_indicators",
    description: "Policy rates, inflation and employment, from FRED and the RBA.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "myrmidon_status",
    description:
      "What SPECTRE's autonomous paper-trading agent currently holds, and whether it is running. "
      + "Simulated money, not a real brokerage balance.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "myrmidon_decisions",
    description: "Myrmidon's recent decisions and the reasoning behind each.",
    inputSchema: {
      type: "object",
      properties: { limit: { type: "number", description: "How many, 1-100. Default 20." } },
    },
  },
  {
    name: "myrmidon_strategy",
    description:
      "The strategy and guardrails Myrmidon runs under. Read-only — this cannot change the "
      + "strategy or place a trade.",
    inputSchema: { type: "object", properties: {} },
  },
];

/**
 * Call one of this site's own endpoints as the authorised user.
 *
 * The session exists for the duration of one call. Minting and destroying a row
 * per request costs two cheap writes and means an OAuth grant never leaves a
 * second, longer-lived credential behind it.
 */
async function callSelf(origin: string, userId: string, path: string): Promise<unknown> {
  const session = createAndPersistSession(userId);
  try {
    const response = await fetch(`${origin}${path}`, {
      headers: { Cookie: `${SESSION_COOKIE_NAME}=${session.token}` },
      cache: "no-store",
      signal: AbortSignal.timeout(60_000),
    });
    const text = await response.text();
    let body: unknown;
    try {
      body = JSON.parse(text);
    } catch {
      body = { error: text.slice(0, 300) };
    }
    if (!response.ok) {
      const message = (body as { error?: string })?.error || `${path} returned ${response.status}`;
      throw new Error(message);
    }
    return body;
  } finally {
    destroySessionToken(session.token);
  }
}

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(n)));
}

function cleanSymbol(value: unknown): string {
  return String(value ?? "").toUpperCase().replace(/[^A-Z0-9.\-^]/g, "").slice(0, 12);
}

/**
 * Run a tool. Throws with a readable message, which the caller turns into a
 * tool error the model can act on rather than a protocol failure.
 */
export async function runMcpTool(
  name: string,
  args: Record<string, unknown>,
  context: { origin: string; userId: string },
): Promise<unknown> {
  const get = (path: string) => callSelf(context.origin, context.userId, path);

  switch (name) {
    case "get_portfolio": {
      const data = await get("/api/portfolio") as { holdings?: unknown[] };
      const count = Array.isArray(data?.holdings) ? data.holdings.length : 0;
      if (count === 0) {
        return {
          holdings: [],
          message: "This SPECTRE account has no holdings imported yet. Import a broker, super or "
            + "crypto export on the website, then ask again.",
          disclaimer: DISCLAIMER,
        };
      }
      return {
        source: "spectre-account",
        fetchedAt: new Date().toISOString(),
        holdingCount: count,
        ...data,
        coverageNote: "Every holding is included, cash and unquoted assets among them. Anything "
          + "without a public quote carries the value the account holds and still counts toward "
          + "totalValue and every weight — report it, do not describe it as missing.",
        disclaimer: DISCLAIMER,
      };
    }

    case "portfolio_risk": {
      const allowed = new Set(["1M", "3M", "1Y"]);
      const win = allowed.has(String(args.window)) ? String(args.window) : "3M";
      const horizon = clampNumber(args.horizon, 1, 365, 30);
      const data = await get(`/api/portfolio/metrics?window=${win}&horizon=${horizon}`);
      return { ...(data as object), disclaimer: DISCLAIMER };
    }

    case "portfolio_funds": {
      const ticker = cleanSymbol(args.ticker);
      const data = await get(ticker ? `/api/portfolio/funds?ticker=${encodeURIComponent(ticker)}` : "/api/portfolio/funds");
      return { ...(data as object), disclaimer: DISCLAIMER };
    }

    case "market_scan": {
      const symbol = cleanSymbol(args.symbol);
      if (!symbol) throw new Error("symbol is required");
      const data = await get(`/api/research/scan?symbol=${encodeURIComponent(symbol)}`);
      return { ...(data as object), disclaimer: DISCLAIMER };
    }

    case "market_news":
      return { ...(await get("/api/research/news") as object), disclaimer: DISCLAIMER };

    case "market_movers":
      return { ...(await get("/api/research/movers") as object), disclaimer: DISCLAIMER };

    case "macro_indicators":
      return { ...(await get("/api/research/fred") as object), disclaimer: DISCLAIMER };

    case "myrmidon_status": {
      // The account first: if this caller is not permitted, the whole tool
      // fails rather than returning a success with an error buried inside it.
      const account = await get("/api/trading/account");
      const [positions, strategy] = await Promise.all([
        get("/api/trading/positions").catch((e: Error) => ({ error: e.message })),
        get("/api/trading/strategy").catch(() => null),
      ]);
      const s = strategy as { enabled?: boolean; autopilot?: boolean } | null;
      return {
        account,
        positions,
        strategyRunning: s?.enabled ?? null,
        autopilot: s?.autopilot ?? null,
        accountType: "paper",
        note: PAPER_NOTE,
        disclaimer: DISCLAIMER,
      };
    }

    case "myrmidon_decisions": {
      const limit = clampNumber(args.limit, 1, 100, 20);
      const data = await get(`/api/trading/decisions?limit=${limit}`);
      return { ...(data as object), accountType: "paper", note: PAPER_NOTE, disclaimer: DISCLAIMER };
    }

    case "myrmidon_strategy": {
      const data = await get("/api/trading/strategy");
      return {
        ...(data as object),
        readOnly: true,
        note: `${PAPER_NOTE} This tool cannot modify the strategy or place trades.`,
        disclaimer: DISCLAIMER,
      };
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}
