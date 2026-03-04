import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { markPriceDipAlertTriggered, readPriceDipAlerts, refreshAsxPrices } from "@/lib/db";
import { sendPriceDipAlertEmail } from "@/lib/mailer";

export const runtime = "nodejs";

const ALERT_TRIGGER_COOLDOWN_MS = 12 * 60 * 60 * 1000;

interface TriggeredPriceDipAlert {
  ticker: string;
  dropPct: number;
  thresholdPct: number;
}

export async function POST() {
  try {
    const sessionUser = await getAuthenticatedUser();
    if (!sessionUser) {
      return NextResponse.json({ error: "Please sign in first." }, { status: 401 });
    }

    const result = await refreshAsxPrices(sessionUser.id);

    const alerts = readPriceDipAlerts(sessionUser.id);
    if (alerts.length === 0) {
      return NextResponse.json({
        ...result,
        triggeredAlerts: [] as TriggeredPriceDipAlert[],
        failedAlertTickers: [] as string[],
      });
    }

    const asxQuoteByTicker = new Map<string, { price: number; prevClose: number }>();
    for (const holding of result.state.holdings) {
      if (holding.source !== "asx" && holding.source !== "crypto" && holding.source !== "gold") {
        continue;
      }

      const ticker = holding.ticker.toUpperCase();
      if (!ticker || asxQuoteByTicker.has(ticker)) {
        continue;
      }

      if (!Number.isFinite(holding.price) || !Number.isFinite(holding.prevClose) || holding.price <= 0 || holding.prevClose <= 0) {
        continue;
      }

      asxQuoteByTicker.set(ticker, { price: holding.price, prevClose: holding.prevClose });
    }

    const nowMs = Date.now();
    const nowIso = new Date(nowMs).toISOString();
    const triggeredAlerts: TriggeredPriceDipAlert[] = [];
    const failedAlertTickers: string[] = [];

    for (const alert of alerts) {
      if (!alert.enabled) {
        continue;
      }

      const quote = asxQuoteByTicker.get(alert.ticker.toUpperCase());
      if (!quote || quote.prevClose <= 0) {
        continue;
      }

      const dropPct = ((quote.prevClose - quote.price) / quote.prevClose) * 100;
      if (!Number.isFinite(dropPct) || dropPct < alert.dropPctThreshold) {
        continue;
      }

      const lastTriggeredMs = alert.lastTriggeredAt ? new Date(alert.lastTriggeredAt).getTime() : Number.NaN;
      const inCooldown = Number.isFinite(lastTriggeredMs) && nowMs - lastTriggeredMs < ALERT_TRIGGER_COOLDOWN_MS;

      if (inCooldown) {
        continue;
      }

      try {
        await sendPriceDipAlertEmail({
          toEmail: sessionUser.email,
          displayName: sessionUser.displayName,
          ticker: alert.ticker,
          currentPrice: quote.price,
          prevClose: quote.prevClose,
          dropPct,
          thresholdPct: alert.dropPctThreshold,
        });
        markPriceDipAlertTriggered(sessionUser.id, alert.ticker, nowIso);
        triggeredAlerts.push({
          ticker: alert.ticker,
          dropPct,
          thresholdPct: alert.dropPctThreshold,
        });
      } catch {
        failedAlertTickers.push(alert.ticker);
      }
    }

    return NextResponse.json({
      ...result,
      triggeredAlerts,
      failedAlertTickers,
    });
  } catch {
    return NextResponse.json({ error: "Failed to refresh live market prices." }, { status: 500 });
  }
}
