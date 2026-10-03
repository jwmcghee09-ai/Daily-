/**
 * Whose portfolio a request is about.
 *
 * The demo is a guest session: no account, a cookie, a thirty-minute workspace
 * and a two-file import cap. Routes opted into it one at a time, each with its
 * own copy of the same four lines — and the look-through routes never did. So
 * /api/portfolio answered the demo and /api/portfolio/metrics returned 401,
 * which meant "Inside Your Funds", the look-through panel and the per-holding
 * risk table were all invisible in the demo. Not disabled, not explained:
 * absent, because the page's fetch failed and it has nothing to draw.
 *
 * One resolver, so a route either supports the demo deliberately or does not,
 * and nothing is left out by omission.
 */
import { NextResponse } from "next/server";
import { getAuthenticatedUser, getClientAddress } from "@/lib/auth";
import { getDemoGuestContext } from "@/lib/demo-guest";
import { consumeRateLimit } from "@/lib/rate-limit";

export interface PortfolioActor {
  /** Scopes every read and write. A guest's id is their cookie's. */
  userId: string;
  /** True for a guest session, which is anonymous and so costs are capped. */
  isDemoGuest: boolean;
}

/**
 * The account or guest this request acts for, or null for neither.
 *
 * A guest is only recognised when the caller asked for the demo with `demo=1`,
 * matching every other route: a stale demo cookie must not silently change
 * whose portfolio a normal request reads.
 */
export async function resolvePortfolioActor(request: Request): Promise<PortfolioActor | null> {
  const user = await getAuthenticatedUser();
  if (user) return { userId: user.id, isDemoGuest: false };

  if (new URL(request.url).searchParams.get("demo") !== "1") return null;

  const guest = await getDemoGuestContext();
  return guest ? { userId: guest.userId, isDemoGuest: true } : null;
}

/**
 * A per-IP budget for work an anonymous visitor can ask for.
 *
 * Signed-in accounts pass straight through; they are rate-limited where it
 * matters and they are identifiable. A guest is neither, so anything that
 * spends real resources — EDGAR requests, a browser render — is counted.
 *
 * Returns a 429 to send back, or null to carry on.
 */
export function guardDemoGuest(
  request: Request,
  actor: PortfolioActor,
  bucket: string,
  limit: number,
  windowMs: number,
): NextResponse | null {
  if (!actor.isDemoGuest) return null;

  const result = consumeRateLimit(`${bucket}:demo:${getClientAddress(request)}`, limit, windowMs);
  if (result.allowed) return null;

  return NextResponse.json(
    { error: "The demo is busy. Please wait a moment, or sign in for an account of your own." },
    { status: 429, headers: { "Retry-After": String(result.retryAfterSec) } },
  );
}
