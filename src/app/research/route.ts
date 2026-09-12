import fs from "node:fs/promises";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";

export const runtime = "nodejs";

const TRADER_EMAIL = "jwmcghee09@gmail.com";

// Chrome the dashboard already draws around the iframe: the research page's own
// top nav would be a second, redundant header inside the embed.
const EMBED_STYLE = `<style id="spectre-embed">
  /* The dashboard already draws the nav, and its header + KPI strip already
     show the account, plan and holdings that the workspace hero repeats. */
  nav.nav { display: none !important; }
  section.workspace-hero { display: none !important; }
  body { padding-top: 0 !important; }
  .container#terminal { padding-top: 0 !important; }
  .page-header { margin-top: 0 !important; }
</style>`;

export async function GET(request: NextRequest) {
  const isDemo = request.nextUrl.searchParams.get("demo") === "1";
  const isEmbed = request.nextUrl.searchParams.get("embed") === "1";
  let isTrader = false;
  if (!isDemo) {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.redirect(buildRedirectUrl(request, "/signin"));
    }
    isTrader = user.email === TRADER_EMAIL;
    // No hard gate — free/none users see a limited preview via client-side gating
  }

  let html = await fs.readFile(path.join(process.cwd(), "public", "spectre-market-research-v1.html"), "utf8");

  if (isTrader) {
    // Keep the header identical to the dashboard for the trader:
    // Quant / AI / Research / Analytics, with Myrmidon branding.
    html = html.replace(
      '<span class="nav-tab-link nav-tab-link-active">Research</span>',
      () => '<span class="nav-tab-link nav-tab-link-active">Research</span>\n      <a href="/dashboard?tab=analytics" class="nav-tab-link">Analytics</a>',
    );
    html = html.replace("<title>SPECTRE — ASX Market Terminal</title>", "<title>Myrmidon — ASX Market Terminal</title>");
    html = html.replace('id="nav-home-logo" style="text-decoration:none;">SPECTRE</a>', 'id="nav-home-logo" style="text-decoration:none;">Myrmidon</a>');
  }

  if (isEmbed) {
    html = html.replace("</head>", () => `${EMBED_STYLE}\n</head>`);
  }

  return new NextResponse(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex, nofollow, noarchive",
    },
  });
}

function buildRedirectUrl(request: NextRequest, pathname: string): URL {
  return new URL(pathname, resolvePublicBaseUrl(request));
}

function resolvePublicBaseUrl(request: NextRequest): string {
  const configured = normalizeBaseUrl(process.env.APP_BASE_URL || "") || normalizeBaseUrl(process.env.RENDER_EXTERNAL_URL || "");
  if (configured) return configured;

  const forwardedHost = (request.headers.get("x-forwarded-host") || "").trim();
  if (forwardedHost) {
    const forwardedProto = (request.headers.get("x-forwarded-proto") || "https").trim() || "https";
    return `${forwardedProto}://${forwardedHost}`;
  }

  return new URL(request.url).origin;
}

function normalizeBaseUrl(value: string): string {
  const trimmed = value.trim().replace(/\/$/, "");
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") return parsed.origin;
  } catch {
    return "";
  }
  return "";
}
