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
<link href="https://fonts.googleapis.com/css2?family=Sora:wght@700;800&family=DM+Sans:wght@400;500;600;700&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet"/>
<style>
*{box-sizing:border-box;margin:0;padding:0}
html,body{height:100%}
body{
  background:#05050a;
  color:#e2e8f0;
  font-family:'DM Sans',system-ui,sans-serif;
  min-height:100vh;
  display:flex;
  flex-direction:column;
  align-items:center;
  justify-content:center;
  padding:5rem 1.5rem 2rem;
  position:relative;
  overflow-x:hidden;
}
body::before{
  content:'';
  position:fixed;
  inset:0;
  background:
    radial-gradient(ellipse 55% 40% at 82% 8%, rgba(255,75,51,.22) 0%, transparent 65%),
    radial-gradient(ellipse 45% 35% at 12% 92%, rgba(255,75,51,.14) 0%, transparent 60%),
    radial-gradient(ellipse 30% 30% at 50% 50%, rgba(255,75,51,.04) 0%, transparent 70%);
  pointer-events:none;
  z-index:0;
}
nav{position:fixed;top:0;left:0;right:0;display:flex;align-items:center;justify-content:space-between;padding:.9rem 2rem;border-bottom:1px solid rgba(255,255,255,.06);background:rgba(5,5,10,.9);backdrop-filter:blur(16px);z-index:10}
.nav-logo{display:flex;align-items:center;gap:10px;text-decoration:none}
.nav-logo-mark{width:28px;height:28px}
.nav-wordmark{font-family:'DM Mono',monospace;font-size:.8rem;font-weight:500;letter-spacing:.22em;text-transform:uppercase;background:linear-gradient(90deg,#ff6240,#ff4b33,#ff8c70,#ff4b33,#ff6240);background-size:300% 100%;-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;animation:shimmer 3s ease-in-out infinite}
.nav-back{font-size:.78rem;color:#6b7280;text-decoration:none;border:1px solid rgba(255,255,255,.1);border-radius:7px;padding:.35rem .85rem;transition:color .15s,border-color .15s}
.nav-back:hover{color:#e2e8f0;border-color:rgba(255,255,255,.25)}
.gate{position:relative;z-index:1;max-width:500px;width:100%;text-align:center}
.gate-eyebrow{display:inline-flex;align-items:center;gap:7px;background:rgba(255,75,51,.07);border:1px solid rgba(255,75,51,.2);border-radius:999px;padding:.3rem 1rem;font-family:'DM Mono',monospace;font-size:.62rem;letter-spacing:.14em;color:#ff7a68;text-transform:uppercase;margin-bottom:1.5rem}
.gate-eyebrow::before{content:'';width:5px;height:5px;border-radius:50%;background:#ff4b33;box-shadow:0 0 6px #ff4b33;flex-shrink:0}
.gate-title{font-family:'Sora',sans-serif;font-size:2.6rem;font-weight:800;line-height:1.1;letter-spacing:-.03em;margin-bottom:.85rem}
.gate-title-grad{background:linear-gradient(135deg,#ff4b33 0%,#ff7a5a 45%,#ffb09a 100%);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text}
.gate-sub{color:#6b7280;font-size:.88rem;line-height:1.7;margin-bottom:2.5rem;max-width:380px;margin-left:auto;margin-right:auto}
.plans{display:grid;grid-template-columns:1fr 1fr;gap:.7rem;margin-bottom:1.75rem;text-align:left}
.plan{background:linear-gradient(155deg,rgba(255,75,51,.06) 0%,rgba(10,7,14,.95) 50%,rgba(8,5,12,.98) 100%);border:1px solid rgba(255,75,51,.18);border-radius:16px;padding:1.4rem;position:relative;overflow:hidden;transition:border-color .2s,transform .15s}
.plan:hover{border-color:rgba(255,75,51,.4);transform:translateY(-2px)}
.plan::after{content:'';position:absolute;top:0;left:0;right:0;height:1px;background:linear-gradient(90deg,transparent,rgba(255,75,51,.3),transparent)}
.plan-tier{font-family:'DM Mono',monospace;font-size:.6rem;letter-spacing:.18em;text-transform:uppercase;color:#ff7a68;margin-bottom:.55rem}
.plan-price{font-family:'Sora',sans-serif;font-size:1.65rem;font-weight:800;color:#f8f8fb;margin-bottom:.15rem;line-height:1}
.plan-price-sub{font-family:'DM Sans',sans-serif;font-size:.72rem;color:#4b5563;margin-bottom:1rem}
.plan-features{list-style:none;display:flex;flex-direction:column;gap:.5rem}
.plan-features li{font-size:.77rem;color:#9ca3af;display:flex;align-items:flex-start;gap:.6rem;line-height:1.4}
.plan-features li::before{content:'';width:13px;height:13px;margin-top:1px;flex-shrink:0;background-image:url("data:image/svg+xml,%3Csvg viewBox='0 0 13 13' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Ccircle cx='6.5' cy='6.5' r='6' stroke='%23ff4b33' stroke-opacity='.5'/%3E%3Cpath d='M3.5 6.5l2 2 4-4' stroke='%23ff4b33' stroke-width='1.4' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");background-size:contain;background-repeat:no-repeat}
.divider{height:1px;background:linear-gradient(90deg,transparent,rgba(255,75,51,.12),transparent);margin-bottom:1.75rem}
.actions{display:flex;flex-direction:column;gap:.6rem}
.btn-primary{background:linear-gradient(135deg,#ff4b33 0%,#ff2f14 100%);color:#fff;border:none;border-radius:11px;padding:.9rem 1.5rem;font-family:'DM Sans',sans-serif;font-size:.88rem;font-weight:700;cursor:pointer;text-decoration:none;display:block;letter-spacing:.01em;transition:opacity .15s,transform .12s,box-shadow .15s;box-shadow:0 4px 24px rgba(255,75,51,.28)}
.btn-primary:hover{opacity:.93;transform:translateY(-1px);box-shadow:0 6px 32px rgba(255,75,51,.38)}
.btn-secondary{background:rgba(255,255,255,.04);color:#c4c9d4;border:1px solid rgba(255,255,255,.1);border-radius:11px;padding:.9rem 1.5rem;font-family:'DM Sans',sans-serif;font-size:.88rem;font-weight:600;cursor:pointer;text-decoration:none;display:block;transition:border-color .15s,background .15s,color .15s}
.btn-secondary:hover{background:rgba(255,255,255,.07);border-color:rgba(255,255,255,.2);color:#e2e8f0}
.btn-ghost{color:#4b5563;font-size:.78rem;text-decoration:none;display:block;padding:.5rem;transition:color .15s}
.btn-ghost:hover{color:#9ca3af}
@keyframes shimmer{0%{background-position:100% 50%}50%{background-position:0% 50%}100%{background-position:100% 50%}}
@media(max-width:480px){.plans{grid-template-columns:1fr}.gate-title{font-size:2rem}}
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
    <span class="nav-wordmark">Spectre</span>
  </a>
  <a href="/dashboard" class="nav-back">← Dashboard</a>
</nav>

<div class="gate">
  <div class="gate-eyebrow">Plus &amp; Pro Feature</div>
  <h1 class="gate-title"><span class="gate-title-grad">Research</span> Terminal</h1>
  <p class="gate-sub">Live share data, macro signals, earnings calendars, crypto, commodities, FRED indicators, and central-bank rates — all in one place.</p>

  <div class="plans">
    <div class="plan">
      <div class="plan-tier">Plus</div>
      <div class="plan-price">$2.99</div>
      <div class="plan-price-sub">per month</div>
      <ul class="plan-features">
        <li>Research terminal</li>
        <li>20 AI queries/month</li>
        <li>Price dip alerts</li>
        <li>Full risk analytics</li>
      </ul>
    </div>
    <div class="plan">
      <div class="plan-tier">Pro</div>
      <div class="plan-price">$9.99</div>
      <div class="plan-price-sub">per month</div>
      <ul class="plan-features">
        <li>Research terminal</li>
        <li>Unlimited AI queries</li>
        <li>Advanced quant console</li>
        <li>Priority support</li>
      </ul>
    </div>
  </div>

  <div class="divider"></div>

  <div class="actions">
    <a href="/signin?mode=login&plan=plus" class="btn-primary">Get Plus — $2.99/mo</a>
    <a href="/signin?mode=login&plan=pro" class="btn-secondary">Get Pro — $9.99/mo</a>
    <a href="/dashboard" class="btn-ghost">← Back to Dashboard</a>
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
