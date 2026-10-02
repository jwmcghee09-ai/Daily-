/**
 * Fetch one fund's holdings from its issuer's website, on request.
 *
 * Separate from the automatic resolution in /api/portfolio/metrics because it
 * costs something real: a browser launch and a full page render, ten to fifteen
 * seconds and a few hundred megabytes. That is fine when a person has asked for
 * it and is watching a spinner; it is not fine on every page load, which is why
 * this is never called from the look-through path.
 *
 * What comes back is partial by nature — issuer pages publish a top ten, not a
 * portfolio — so it is stored with the coverage it actually represents and the
 * rest of the holding stays visible as itself.
 */
import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { readPortfolioState, writeFundComposition } from "@/lib/db";
import { fetchRenderedHoldings, hasIssuerPage, issuerPageFor } from "@/lib/fund-render";
import { normaliseTicker } from "@/lib/lookthrough";

export const runtime = "nodejs";
// A render can take fifteen seconds; the platform default would cut it short.
export const maxDuration = 90;

export async function POST(request: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "Please sign in first." }, { status: 401 });

  let body: { ticker?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload." }, { status: 400 });
  }

  const ticker = normaliseTicker(String(body.ticker ?? ""));
  if (!ticker) return NextResponse.json({ error: "Which ticker?" }, { status: 400 });

  // Only for something the user actually holds: this spends real resources, and
  // an open renderer is somewhere to point at arbitrary pages.
  const state = readPortfolioState(user.id);
  const holding = (state.holdings ?? []).find((h) => normaliseTicker(h.ticker) === ticker);
  if (!holding) {
    return NextResponse.json({ error: `You do not hold ${ticker}.` }, { status: 404 });
  }

  if (!hasIssuerPage(ticker)) {
    return NextResponse.json(
      {
        error: `No issuer page is known for ${ticker}.`,
        detail: "Holdings can be read automatically for Vanguard and VanEck Australia funds. "
          + "For anything else, upload the holdings file.",
      },
      { status: 422 },
    );
  }

  let rendered;
  try {
    rendered = await fetchRenderedHoldings(ticker);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "The page could not be read." },
      { status: 502 },
    );
  }

  if (!rendered) {
    const page = issuerPageFor(ticker);
    return NextResponse.json(
      {
        error: "The page loaded but no holdings table could be read from it.",
        detail: "Issuers redesign these pages without notice. Upload the holdings file instead, "
          + "or open the page yourself to check it still lists holdings.",
        sourceUrl: page?.url ?? null,
      },
      { status: 502 },
    );
  }

  writeFundComposition({
    ticker,
    fundName: holding.name,
    route: "issuer-page",
    source: rendered.source,
    asOf: new Date().toISOString().slice(0, 10),
    constituents: rendered.constituents,
    // The decisive field. These pages list a top ten, so the weights cover part
    // of the fund; storing that keeps the engine from scaling them to the whole
    // and reporting BHP at thirty per cent of VAS instead of eleven.
    coveragePct: rendered.coveragePct,
    coverageNote: `Read from the ${rendered.source}, which publishes only its largest holdings — `
      + `about ${rendered.coveragePct.toFixed(0)}% of the fund. The rest is shown as the holding itself.`,
    userId: user.id,
  });

  return NextResponse.json({
    ok: true,
    ticker,
    constituents: rendered.constituents.length,
    coveragePct: rendered.coveragePct,
    source: rendered.source,
    sourceUrl: rendered.sourceUrl,
    note: `${rendered.constituents.length} holdings covering ${rendered.coveragePct.toFixed(1)}% of the fund. `
      + "Issuer pages publish a top ten rather than a full portfolio; upload the holdings file for all of it.",
  });
}
