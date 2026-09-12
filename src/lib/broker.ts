/**
 * Broker connection for Myrmidon.
 *
 * Myrmidon is currently DISCONNECTED from any broker. Nothing in the app may
 * read the Alpaca credentials directly — every call site goes through here, so
 * there is exactly one place that decides whether a broker connection exists
 * and no route can quietly keep talking to Alpaca.
 *
 * The trading engine, guardrails and decision log are all intact; they simply
 * have nothing to trade against. To reconnect the Alpaca paper account, set
 * BROKER_ENABLED=alpaca-paper in the environment. A future real broker (the
 * only realistic Australian option with an order API is Interactive Brokers)
 * slots in here rather than being scattered across a dozen routes again.
 */

export const BROKER_NONE = "none" as const;
export const BROKER_ALPACA_PAPER = "alpaca-paper" as const;

export const BROKER_DISCONNECTED_MESSAGE =
  "No broker is connected to Myrmidon. The strategy engine and decision log are intact, " +
  "but there is no account to read positions from or place orders against.";

/** Which broker, if any, Myrmidon is wired to right now. */
export function activeBroker(): typeof BROKER_NONE | typeof BROKER_ALPACA_PAPER {
  const configured = String(process.env.BROKER_ENABLED || "").trim().toLowerCase();
  return configured === BROKER_ALPACA_PAPER ? BROKER_ALPACA_PAPER : BROKER_NONE;
}

export function isBrokerConnected(): boolean {
  return activeBroker() !== BROKER_NONE && brokerCredentials() !== null;
}

/**
 * Credentials for the connected broker, or null when disconnected.
 * Returning null makes every existing "credentials not configured" path fire,
 * which is the behaviour those routes were already written and tested for.
 */
export function brokerCredentials(): { key: string; secret: string } | null {
  if (activeBroker() === BROKER_NONE) return null;
  const key = String(process.env.ALPACA_API_KEY || "").trim();
  const secret = String(process.env.ALPACA_API_SECRET || "").trim();
  if (!key || !secret) return null;
  return { key, secret };
}

/** Auth headers for the connected broker, or null when disconnected. */
export function brokerHeaders(): Record<string, string> | null {
  const credentials = brokerCredentials();
  if (!credentials) return null;
  return {
    "APCA-API-KEY-ID": credentials.key,
    "APCA-API-SECRET-KEY": credentials.secret,
    "Content-Type": "application/json",
  };
}
