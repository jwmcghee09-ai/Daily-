import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";

// SECURITY: trader-only, and hard-wired to the PAPER endpoint. This route
// liquidates positions, so it must never be pointed at a live Alpaca host.
const TRADER_EMAIL = "jwmcghee09@gmail.com";
const ALPACA_BASE = "https://paper-api.alpaca.markets/v2";

export const runtime = "nodejs";

interface AlpacaPosition {
  symbol: string;
  qty: string;
  market_value: string;
}

function alpacaHeaders() {
  const key = String(process.env.ALPACA_API_KEY || "").trim();
  const secret = String(process.env.ALPACA_API_SECRET || "").trim();
  if (!key || !secret) return null;
  return { "APCA-API-KEY-ID": key, "APCA-API-SECRET-KEY": secret };
}

/**
 * Close every open paper position, taking the book to zero holdings.
 * Requires an explicit {"confirm":"FLATTEN"} body so it can never fire by
 * accident from a stray fetch or a model calling it speculatively.
 */
export async function POST(request: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user || user.email !== TRADER_EMAIL) {
    return NextResponse.json({ error: "Not authorised." }, { status: 403 });
  }

  let body: { confirm?: unknown } = {};
  try {
    body = await request.json();
  } catch {
    /* empty body handled below */
  }
  if (body.confirm !== "FLATTEN") {
    return NextResponse.json(
      { error: 'Refused: send {"confirm":"FLATTEN"} to close every open position.' },
      { status: 400 },
    );
  }

  const headers = alpacaHeaders();
  if (!headers) {
    return NextResponse.json({ error: "Alpaca keys are not configured." }, { status: 503 });
  }

  // Record what is about to be closed so the response can report it.
  let before: AlpacaPosition[] = [];
  try {
    const res = await fetch(`${ALPACA_BASE}/positions`, { headers, cache: "no-store" });
    if (res.ok) before = (await res.json()) as AlpacaPosition[];
  } catch {
    /* non-fatal — the close call below is the operation that matters */
  }

  if (before.length === 0) {
    return NextResponse.json({ ok: true, closed: 0, message: "No open positions — the book is already flat." });
  }

  let closeStatus = 0;
  try {
    // cancel_orders also clears resting orders that would re-open exposure.
    const res = await fetch(`${ALPACA_BASE}/positions?cancel_orders=true`, {
      method: "DELETE",
      headers,
      cache: "no-store",
    });
    closeStatus = res.status;
    if (!res.ok && res.status !== 207) {
      const detail = await res.text().catch(() => "");
      return NextResponse.json(
        { error: `Alpaca refused the close request (${res.status}) ${detail.slice(0, 200)}` },
        { status: 502 },
      );
    }
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to reach Alpaca." },
      { status: 502 },
    );
  }

  return NextResponse.json({
    ok: true,
    closed: before.length,
    status: closeStatus,
    positions: before.map((p) => ({ symbol: p.symbol, qty: p.qty, marketValue: p.market_value })),
    message:
      `Submitted close orders for ${before.length} position(s). Market orders fill at the next open, ` +
      `so holdings may take a moment to read zero.`,
  });
}
