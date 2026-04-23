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
<link rel="preconnect" href="https://fonts.googleapis.com"/>
<link href="https://fonts.googleapis.com/css2?family=Sora:wght@700;800&family=DM+Sans:wght@400;500;700&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet"/>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{
  background:#05050a;
  background-image:
    radial-gradient(circle at 80% 10%, rgba(255,75,51,.15) 0%, transparent 35%),
    radial-gradient(circle at 15% 90%, rgba(255,75,51,.10) 0%, transparent 30%);
  color:#e2e8f0;
  font-family:'DM Sans',system-ui,sans-serif;
  min-height:100vh;
  display:flex;
  flex-direction:column;
  align-items:center;
  justify-content:center;
  padding:2rem;
}
nav{position:fixed;top:0;left:0;right:0;display:flex;align-items:center;justify-content:space-between;padding:.9rem 2rem;border-bottom:1px solid rgba(255,255,255,.06);background:rgba(5,5,10,.85);backdrop-filter:blur(12px);z-index:10}
.nav-logo{display:flex;align-items:center;gap:10px;text-decoration:none}
.nav-logo-mark{width:28px;height:28px}
.nav-logo-text{font-family:'Sora',sans-serif;font-size:.85rem;font-weight:800;letter-spacing:.18em;color:#f8f8fb;text-transform:uppercase}
.nav-back{font-size:.78rem;color:#6b7280;text-decoration:none;border:1px solid rgba(255,255,255,.1);border-radius:7px;padding:.35rem .85rem;transition:color .15s,border-color .15s}
.nav-back:hover{color:#e2e8f0;border-color:rgba(255,255,255,.25)}
.gate{max-width:520px;width:100%;text-align:center;padding-top:4rem}
.gate-icon{width:56px;height:56px;margin:0 auto 1.5rem;background:rgba(255,75,51,.1);border:1px solid rgba(255,75,51,.2);border-radius:16px;display:flex;align-items:center;justify-content:center}
.gate-icon svg{width:26px;height:26px;fill:none;stroke:#ff4b33;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
.badge{display:inline-flex;align-items:center;gap:6px;background:rgba(255,75,51,.08);border:1px solid rgba(255,75,51,.22);border-radius:999px;padding:.28rem .9rem;font-family:'DM Mono',monospace;font-size:.65rem;font-weight:500;letter-spacing:.12em;color:#ff7a68;text-transform:uppercase;margin-bottom:1.25rem}
.badge::before{content:'';width:6px;height:6px;border-radius:50%;background:#ff4b33;flex-shrink:0}
h1{font-family:'Sora',sans-serif;font-size:2.2rem;font-weight:800;margin-bottom:.75rem;line-height:1.15;letter-spacing:-.02em}
.sub{color:#6b7280;font-size:.9rem;line-height:1.65;margin-bottom:2.25rem;max-width:400px;margin-left:auto;margin-right:auto}
.plans{display:grid;grid-template-columns:1fr 1fr;gap:.75rem;margin-bottom:1.75rem;text-align:left}
.plan{background:linear-gradient(160deg,#0e0c16,#0b0910);border:1px solid rgba(255,255,255,.08);border-radius:16px;padding:1.35rem;position:relative;overflow:hidden;transition:border-color .2s}
.plan:hover{border-color:rgba(255,75,51,.3)}
.plan::before{content:'';position:absolute;inset:0;background:linear-gradient(135deg,rgba(255,75,51,.06) 0%,transparent 60%);pointer-events:none}
.plan-name{font-family:'DM Mono',monospace;font-size:.65rem;font-weight:500;letter-spacing:.14em;text-transform:uppercase;color:#ff7a68;margin-bottom:.5rem}
.plan-price{font-family:'Sora',sans-serif;font-size:1.6rem;font-weight:800;margin-bottom:.9rem;color:#f8f8fb}
.plan-price span{font-family:'DM Sans',sans-serif;font-size:.75rem;font-weight:400;color:#4b5563}
.plan-features{list-style:none;display:flex;flex-direction:column;gap:.45rem}
.plan-features li{font-size:.78rem;color:#9ca3af;display:flex;align-items:center;gap:.55rem;line-height:1.4}
.plan-features li::before{content:'';width:14px;height:14px;flex-shrink:0;background-image:url("data:image/svg+xml,%3Csvg viewBox='0 0 14 14' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Ccircle cx='7' cy='7' r='6.5' stroke='%23ff4b33' stroke-opacity='.4'/%3E%3Cpath d='M4 7l2 2 4-4' stroke='%23ff4b33' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");background-size:contain;background-repeat:no-repeat}
.actions{display:flex;flex-direction:column;gap:.65rem}
.btn-plus{background:linear-gradient(135deg,#ff4b33,#ff2f14);color:#fff;border:none;border-radius:12px;padding:.85rem 1.5rem;font-family:'DM Sans',sans-serif;font-size:.88rem;font-weight:700;cursor:pointer;text-decoration:none;display:block;letter-spacing:.01em;transition:opacity .15s,transform .1s}
.btn-plus:hover{opacity:.9;transform:translateY(-1px)}
.btn-pro{background:rgba(255,255,255,.04);color:#e2e8f0;border:1px solid rgba(255,255,255,.12);border-radius:12px;padding:.85rem 1.5rem;font-family:'DM Sans',sans-serif;font-size:.88rem;font-weight:600;cursor:pointer;text-decoration:none;display:block;transition:border-color .15s,background .15s}
.btn-pro:hover{background:rgba(255,255,255,.07);border-color:rgba(255,255,255,.22)}
.btn-back{background:transparent;border:none;color:#4b5563;font-size:.8rem;cursor:pointer;text-decoration:none;display:block;padding:.5rem;transition:color .15s}
.btn-back:hover{color:#9ca3af}
@media(max-width:480px){.plans{grid-template-columns:1fr}h1{font-size:1.7rem}}
</style>
</head>
<body>
<nav>
  <a href="/" class="nav-logo">
    <svg class="nav-logo-mark" viewBox="0 0 56 56" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs><linearGradient id="g" x1="6" y1="6" x2="50" y2="50" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#FF624B"/><stop offset="1" stop-color="#CF2E17"/></linearGradient></defs>
      <rect x="4" y="4" width="48" height="48" rx="14" fill="url(#g)"/>
      <path d="M17 18.5H38.5L31.8 25.2H23.6V31.6H35.5L28.8 38.3H17V18.5Z" fill="#FFF6F4"/>
      <path d="M17 35.8L23.2 29.7H32.8L26.6 35.8H17Z" fill="#FFD8D1"/>
    </svg>
    <span class="nav-logo-text">Spectre</span>
  </a>
  <a href="/dashboard" class="nav-back">← Dashboard</a>
</nav>

<div class="gate">
  <div class="gate-icon">
    <svg viewBox="0 0 24 24"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
  </div>
  <div class="badge">Plus &amp; Pro Feature</div>
  <h1>Research Terminal</h1>
  <p class="sub">Live share data, macro signals, earnings calendars, crypto, commodities, FRED indicators, and central-bank rates — all in one place.</p>
  <div class="plans">
    <div class="plan">
      <div class="plan-name">Plus</div>
      <div class="plan-price">$2.99 <span>/ month</span></div>
      <ul class="plan-features">
        <li>Research terminal</li>
        <li>20 AI queries/month</li>
        <li>Price dip alerts</li>
        <li>Full risk analytics</li>
      </ul>
    </div>
    <div class="plan">
      <div class="plan-name">Pro</div>
      <div class="plan-price">$9.99 <span>/ month</span></div>
      <ul class="plan-features">
        <li>Research terminal</li>
        <li>Unlimited AI queries</li>
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
