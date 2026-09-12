import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import {
  getIngestTrades,
  getOrCreateIngestToken,
  listIngestMessages,
  listIngestTrades,
  readPortfolioState,
  rotateIngestToken,
  saveImport,
  setIngestTradeStatus,
} from "@/lib/db";
import type { PortfolioHolding } from "@/lib/portfolio";

export const runtime = "nodejs";

const INBOUND_DOMAIN = String(process.env.INBOUND_EMAIL_DOMAIN || "").trim() || "in.spectre-assets.com";
// Postmark's default server address is a single mailbox for the whole server,
// so the per-user token rides in the "+" part. With a custom inbound domain the
// token is the whole local part and this stays unset.
const INBOUND_MAILBOX = String(process.env.INBOUND_EMAIL_MAILBOX || "").trim();

function forwardingAddress(token: string): string {
  return INBOUND_MAILBOX
    ? `${INBOUND_MAILBOX}+${token}@${INBOUND_DOMAIN}`
    : `${token}@${INBOUND_DOMAIN}`;
}

/** The user's forwarding address, their pending trades, and recent activity. */
export async function GET() {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "Please sign in first." }, { status: 401 });

  const token = getOrCreateIngestToken(user.id);
  return NextResponse.json({
    forwardingAddress: forwardingAddress(token),
    pending: listIngestTrades(user.id, "pending"),
    recent: listIngestMessages(user.id, 15).map((m) => ({
      receivedAt: m.received_at,
      subject: m.subject,
      broker: m.broker,
      status: m.status,
      reason: m.reason,
    })),
  });
}

interface ActionBody {
  action?: unknown;
  ids?: unknown;
}

/**
 * Apply or reject parsed trades, or rotate the forwarding address.
 * Applying is what finally moves a trade into holdings — deliberately explicit,
 * so a forged or misparsed email can never change a portfolio on its own.
 */
export async function POST(request: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "Please sign in first." }, { status: 401 });

  let body: ActionBody = {};
  try {
    body = (await request.json()) as ActionBody;
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const action = String(body.action ?? "");

  if (action === "rotate") {
    const token = rotateIngestToken(user.id);
    return NextResponse.json({
      forwardingAddress: forwardingAddress(token),
      note: "The old address stops working immediately.",
    });
  }

  if (action !== "apply" && action !== "reject") {
    return NextResponse.json({ error: 'action must be "apply", "reject" or "rotate".' }, { status: 400 });
  }

  const ids = Array.isArray(body.ids) ? body.ids.filter((i): i is string => typeof i === "string").slice(0, 200) : [];
  if (!ids.length) return NextResponse.json({ error: "No trade ids supplied." }, { status: 400 });

  if (action === "reject") {
    const changed = setIngestTradeStatus(user.id, ids, "rejected");
    return NextResponse.json({ rejected: changed });
  }

  // Only pending trades belonging to this user can be applied.
  const trades = getIngestTrades(user.id, ids).filter((t) => t.status === "pending");
  if (!trades.length) return NextResponse.json({ error: "No pending trades matched those ids." }, { status: 404 });

  // Fold the trades into the existing ASX/US holdings for this account.
  const state = readPortfolioState(user.id);
  const bySource = new Map<string, Map<string, PortfolioHolding>>();
  for (const holding of state.holdings) {
    if (holding.source !== "asx" && holding.source !== "us") continue;
    if (!bySource.has(holding.source)) bySource.set(holding.source, new Map());
    bySource.get(holding.source)!.set(holding.ticker.toUpperCase(), { ...holding });
  }

  const applied: string[] = [];
  const skipped: Array<{ ticker: string; reason: string }> = [];

  for (const trade of trades) {
    // A USD-denominated note is a US listing; everything else is treated as ASX.
    const source = trade.currency === "USD" ? "us" : "asx";
    if (!bySource.has(source)) bySource.set(source, new Map());
    const book = bySource.get(source)!;
    const key = trade.ticker.toUpperCase();
    const existing = book.get(key);

    if (trade.side === "buy") {
      const priorUnits = existing?.units ?? 0;
      const priorCost = existing?.costBase ?? 0;
      const units = priorUnits + trade.units;
      const costBase = priorCost + trade.units * trade.unitPrice + (trade.brokerage ?? 0);
      book.set(key, {
        id: existing?.id ?? `${source}-forwarded-${key.toLowerCase()}-${Date.now()}`,
        source: source as PortfolioHolding["source"],
        account: existing?.account ?? (trade.broker || "Brokerage"),
        ticker: key,
        name: existing?.name ?? key,
        units,
        price: existing?.price ?? trade.unitPrice,
        prevClose: existing?.prevClose ?? trade.unitPrice,
        value: units * (existing?.price ?? trade.unitPrice),
        costBase,
        sector: existing?.sector ?? "",
        reportDate: trade.tradeDate ?? existing?.reportDate ?? "",
        importedAt: new Date().toISOString(),
      });
      applied.push(trade.id);
      continue;
    }

    // Sell: reduce units and the cost base proportionally.
    if (!existing || existing.units <= 0) {
      skipped.push({ ticker: key, reason: "No existing position to sell from." });
      continue;
    }
    if (trade.units > existing.units + 1e-9) {
      skipped.push({ ticker: key, reason: `Sell of ${trade.units} exceeds the ${existing.units} held.` });
      continue;
    }
    const remaining = existing.units - trade.units;
    const costPerUnit = existing.units > 0 ? existing.costBase / existing.units : 0;
    if (remaining <= 1e-9) book.delete(key);
    else {
      book.set(key, {
        ...existing,
        units: remaining,
        costBase: costPerUnit * remaining,
        value: remaining * existing.price,
        importedAt: new Date().toISOString(),
      });
    }
    applied.push(trade.id);
  }

  for (const [source, book] of bySource.entries()) {
    saveImport(user.id, source as PortfolioHolding["source"], [...book.values()]);
  }
  const changed = setIngestTradeStatus(user.id, applied, "applied");

  return NextResponse.json({
    applied: changed,
    skipped,
    portfolio: readPortfolioState(user.id),
  });
}
