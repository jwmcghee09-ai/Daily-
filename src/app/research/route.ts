import fs from "node:fs/promises";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { readUserEntitlements } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const isDemo = request.nextUrl.searchParams.get("demo") === "1";
  if (!isDemo) {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.redirect(buildRedirectUrl(request, "/signin"));
    }

    const entitlements = readUserEntitlements(user.id);
    if ((entitlements.planTier === "none" || entitlements.planTier === "free") && !entitlements.proEnabled) {
      return new NextResponse(buildUpgradeGate(), {
        headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
      });
    }
  }

  const html = await fs.readFile(path.join(process.cwd(), "public", "spectre-market-research-v1.html"), "utf8");
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
  if (configured) {
    return configured;
  }

  const forwardedHost = (request.headers.get("x-forwarded-host") || "").trim();
  if (forwardedHost) {
    const forwardedProto = (request.headers.get("x-forwarded-proto") || "https").trim() || "https";
    return `${forwardedProto}://${forwardedHost}`;
  }

  return new URL(request.url).origin;
}

function buildUpgradeGate(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Research Terminal — SPECTRE</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{background:#05050a;color:#e2e8f0;font-family:'DM Sans',system-ui,sans-serif;min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:2rem}
  .gate{max-width:480px;width:100%;text-align:center}
  .lock{font-size:3rem;margin-bottom:1.5rem}
  .badge{display:inline-flex;align-items:center;gap:6px;background:rgba(168,85,247,.12);border:1px solid rgba(168,85,247,.3);border-radius:999px;padding:.3rem .9rem;font-size:.7rem;font-weight:700;letter-spacing:.1em;color:#c084fc;text-transform:uppercase;margin-bottom:1.25rem}
  h1{font-size:1.75rem;font-weight:800;margin-bottom:.75rem;line-height:1.2}
  p{color:#94a3b8;font-size:.9rem;line-height:1.6;margin-bottom:2rem}
  .plans{display:grid;grid-template-columns:1fr 1fr;gap:.75rem;margin-bottom:1.75rem}
  .plan{background:#0d0b14;border:1px solid rgba(255,255,255,.08);border-radius:14px;padding:1.25rem;text-align:left}
  .plan-name{font-size:.8rem;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#a78bfa;margin-bottom:.3rem}
  .plan-price{font-size:1.3rem;font-weight:800;margin-bottom:.75rem}
  .plan-price span{font-size:.75rem;font-weight:400;color:#64748b}
  .plan-features{list-style:none;display:flex;flex-direction:column;gap:.4rem}
  .plan-features li{font-size:.78rem;color:#94a3b8;display:flex;align-items:center;gap:.5rem}
  .plan-features li::before{content:'✓';color:#a78bfa;font-weight:700;flex-shrink:0}
  .actions{display:flex;flex-direction:column;gap:.75rem}
  .btn-plus{background:linear-gradient(135deg,#7c3aed,#a855f7);color:#fff;border:none;border-radius:10px;padding:.8rem 1.5rem;font-size:.9rem;font-weight:700;cursor:pointer;text-decoration:none;display:block}
  .btn-pro{background:linear-gradient(135deg,#c2410c,#f97316);color:#fff;border:none;border-radius:10px;padding:.8rem 1.5rem;font-size:.9rem;font-weight:700;cursor:pointer;text-decoration:none;display:block}
  .btn-back{background:transparent;border:1px solid rgba(255,255,255,.1);color:#64748b;border-radius:10px;padding:.7rem 1.5rem;font-size:.85rem;font-weight:500;cursor:pointer;text-decoration:none;display:block}
</style>
</head>
<body>
<div class="gate">
  <div class="lock">🔒</div>
  <div class="badge">Plus &amp; Pro Feature</div>
  <h1>Research Terminal</h1>
  <p>Live ASX data, macro signals, earnings calendars, crypto, commodities, FRED indicators, and central-bank rates — all in one place. Available on Plus and Pro plans.</p>
  <div class="plans">
    <div class="plan">
      <div class="plan-name">Plus</div>
      <div class="plan-price">$2.99 <span>/ month</span></div>
      <ul class="plan-features">
        <li>Research terminal</li>
        <li>20 AI queries/month</li>
        <li>Dip alerts</li>
        <li>Full risk analytics</li>
      </ul>
    </div>
    <div class="plan">
      <div class="plan-name">Pro</div>
      <div class="plan-price">$9.99 <span>/ month</span></div>
      <ul class="plan-features">
        <li>Research terminal</li>
        <li>Unlimited AI</li>
        <li>Advanced quant console</li>
        <li>Priority support</li>
      </ul>
    </div>
  </div>
  <div class="actions">
    <a href="/signin?mode=login&plan=plus" class="btn-plus">Upgrade to Plus — $2.99/mo</a>
    <a href="/signin?mode=login&plan=pro" class="btn-pro">Upgrade to Pro — $9.99/mo</a>
    <a href="/dashboard" class="btn-back">← Back to Dashboard</a>
  </div>
</div>
</body>
</html>`;
}

function normalizeBaseUrl(value: string): string {
  const trimmed = value.trim().replace(/\/$/, "");

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") {
      return parsed.origin;
    }
  } catch {
    return "";
  }

  return "";
}
