import crypto from "node:crypto";
import { getAuthenticatedUser } from "@/lib/auth";

const TRADER_EMAIL = "jwmcghee09@gmail.com";

function timingSafeEquals(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

/**
 * A terminal API request is authorized if EITHER:
 *  - the signed-in session belongs to the trader account, OR
 *  - a matching TRADING_SECRET is presented via x-terminal-key (programmatic use).
 * If TRADING_SECRET is unset, only the session path grants access.
 */
export async function isTerminalRequestAuthorized(req: Request): Promise<boolean> {
  const secret = (process.env.TRADING_SECRET ?? "").trim();
  const presented = (req.headers.get("x-terminal-key") ?? "").trim();
  if (secret && presented && timingSafeEquals(presented, secret)) return true;

  try {
    const user = await getAuthenticatedUser();
    return !!user && user.email === TRADER_EMAIL;
  } catch {
    return false;
  }
}

/** Page-level check: is the signed-in user the trader? */
export async function isTraderSession(): Promise<boolean> {
  try {
    const user = await getAuthenticatedUser();
    return !!user && user.email === TRADER_EMAIL;
  } catch {
    return false;
  }
}
