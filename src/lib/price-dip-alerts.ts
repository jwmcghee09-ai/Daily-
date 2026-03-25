import { createNotification, markPriceDipAlertTriggered, readPriceDipAlerts, readUserEntitlements, refreshAsxPrices, type AuthPublicUser } from "@/lib/db";
import { sendPriceDipAlertEmail } from "@/lib/mailer";

const ALERT_TRIGGER_COOLDOWN_MS = 12 * 60 * 60 * 1000;

export interface TriggeredPriceDipAlert {
  ticker: string;
  dropPct: number;
  thresholdPct: number;
}

export interface PriceDipAlertScanResult {
  refreshedState: Awaited<ReturnType<typeof refreshAsxPrices>>;
  triggeredAlerts: TriggeredPriceDipAlert[];
  failedAlertTickers: string[];
  checkedAlerts: number;
  skippedBecauseNoProAccess: boolean;
}

export async function refreshPricesAndTriggerDipAlertsForUser(
  user: Pick<AuthPublicUser, "id" | "email" | "displayName">,
): Promise<PriceDipAlertScanResult> {
  const refreshedState = await refreshAsxPrices(user.id);
  const entitlements = readUserEntitlements(user.id);
  const hasDipAlertAccess = entitlements.proEnabled || entitlements.planTier === "plus";
  const alerts = hasDipAlertAccess ? readPriceDipAlerts(user.id) : [];

  if (alerts.length === 0) {
    return {
      refreshedState,
      triggeredAlerts: [],
      failedAlertTickers: [],
      checkedAlerts: 0,
      skippedBecauseNoProAccess: !entitlements.proEnabled,
    };
  }

  const quoteByTicker = new Map<string, { price: number; prevClose: number }>();
  for (const holding of refreshedState.state.holdings) {
    if (holding.source === "tax" || holding.source === "savings") {
      continue;
    }

    const ticker = holding.ticker.toUpperCase();
    if (!ticker || quoteByTicker.has(ticker)) {
      continue;
    }

    if (!Number.isFinite(holding.price) || !Number.isFinite(holding.prevClose) || holding.price <= 0 || holding.prevClose <= 0) {
      continue;
    }

    quoteByTicker.set(ticker, { price: holding.price, prevClose: holding.prevClose });
  }

  const nowMs = Date.now();
  const nowIso = new Date(nowMs).toISOString();
  const triggeredAlerts: TriggeredPriceDipAlert[] = [];
  const failedAlertTickers: string[] = [];
  let checkedAlerts = 0;

  for (const alert of alerts) {
    if (!alert.enabled) {
      continue;
    }

    checkedAlerts += 1;
    const quote = quoteByTicker.get(alert.ticker.toUpperCase());
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
        toEmail: user.email,
        displayName: user.displayName,
        ticker: alert.ticker,
        currentPrice: quote.price,
        prevClose: quote.prevClose,
        dropPct,
        thresholdPct: alert.dropPctThreshold,
      });
      markPriceDipAlertTriggered(user.id, alert.ticker, nowIso);
      createNotification(
        user.id,
        "price_dip",
        `${alert.ticker} dropped ${dropPct.toFixed(1)}%`,
        `${alert.ticker} fell ${dropPct.toFixed(1)}% from the previous close (threshold: ${alert.dropPctThreshold}%).`,
      );
      triggeredAlerts.push({
        ticker: alert.ticker,
        dropPct,
        thresholdPct: alert.dropPctThreshold,
      });
    } catch {
      failedAlertTickers.push(alert.ticker);
    }
  }

  return {
    refreshedState,
    triggeredAlerts,
    failedAlertTickers,
    checkedAlerts,
    skippedBecauseNoProAccess: false,
  };
}
