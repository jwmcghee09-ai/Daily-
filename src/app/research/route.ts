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
<link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet"/>
<style>
*{box-sizing:border-box;margin:0;padding:0}
html,body{min-height:100%}
body{
  font-family:'Space Grotesk',system-ui,sans-serif;
  background:
    radial-gradient(ellipse 70% 50% at 50% -10%, rgba(124,77,255,.10) 0%, transparent 65%),
    radial-gradient(ellipse 40% 60% at 100% 80%, rgba(255,122,48,.06) 0%, transparent 60%),
    #f3f1fb;
  min-height:100vh;
  display:flex;
  flex-direction:column;
  align-items:center;
  justify-content:center;
  padding:2rem 1.5rem;
  position:relative;
  overflow-x:hidden;
}
body::before{
  content:'';
  position:fixed;
  inset:0;
  background-image:radial-gradient(rgba(100,80,200,.09) 1px,transparent 1px);
  background-size:28px 28px;
  opacity:.7;
  pointer-events:none;
  z-index:0;
}
.shell{
  position:relative;
  z-index:1;
  width:min(580px,calc(100% - 24px));
  padding:32px;
  border:1px solid rgba(160,100,255,.22);
  border-radius:24px;
  background:rgba(22,16,42,.97);
  overflow:hidden;
  box-shadow:0 40px 100px rgba(100,80,200,.16),0 8px 32px rgba(0,0,0,.28);
}
.shell::before{
  content:'';
  position:absolute;
  right:-80px;top:-80px;
  width:320px;height:320px;
  border-radius:999px;
  background:radial-gradient(circle,rgba(255,122,48,.09) 0%,transparent 70%);
  pointer-events:none;
}
.shell::after{
  content:'';
  position:absolute;
  left:-60px;bottom:-60px;
  width:260px;height:260px;
  border-radius:999px;
  background:radial-gradient(circle,rgba(124,77,255,.10) 0%,transparent 70%);
  pointer-events:none;
}
.topbar{
  position:relative;z-index:1;
  display:flex;align-items:center;justify-content:space-between;
  margin-bottom:28px;
}
.brand{
  display:flex;align-items:center;gap:9px;
  text-decoration:none;
}
.brand-mark{width:28px;height:28px;flex-shrink:0}
.brand-name{
  font-family:'DM Mono',monospace;font-size:.78rem;font-weight:500;letter-spacing:.2em;text-transform:uppercase;
  background:linear-gradient(90deg,#a855f7 0%,#d946ef 35%,#ff7a30 72%,#ffb347 100%);
  background-size:200% auto;
  -webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;
  animation:brandSlide 4s linear infinite;
}
@keyframes brandSlide{0%{background-position:0% center}100%{background-position:200% center}}
.nav-back{
  font-size:.72rem;color:#9b8fbb;text-decoration:none;
  border:1px solid rgba(160,100,255,.18);border-radius:7px;
  padding:.32rem .8rem;transition:color .15s,border-color .15s;
}
.nav-back:hover{color:#e8deff;border-color:rgba(160,100,255,.38)}
.gate{position:relative;z-index:1;text-align:center}
.pill{
  display:inline-flex;align-items:center;gap:7px;
  padding:.32rem 1rem;border-radius:999px;
  border:1px solid transparent;
  background:linear-gradient(rgba(13,10,20,1),rgba(13,10,20,1)) padding-box,
             linear-gradient(90deg,#a855f7,#ff7a30) border-box;
  font-family:'DM Mono',monospace;font-size:.6rem;letter-spacing:.14em;
  text-transform:uppercase;color:#c4b0f0;
  margin-bottom:1.4rem;
}
.pill::before{content:'';width:5px;height:5px;border-radius:50%;background:linear-gradient(135deg,#a855f7,#ff7a30);flex-shrink:0}
.gate-title{
  font-size:clamp(2rem,6vw,2.8rem);font-weight:700;line-height:1.08;
  letter-spacing:-.035em;margin-bottom:.75rem;color:#f4f0ff;
}
.gate-title span{
  background:linear-gradient(90deg,#a855f7 0%,#d946ef 40%,#ff7a30 80%,#ffb347 100%);
  -webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;
}
.gate-sub{
  color:#9b8fbb;font-size:.88rem;line-height:1.72;
  margin-bottom:2rem;max-width:420px;margin-left:auto;margin-right:auto;
}
.plans{
  display:grid;grid-template-columns:1fr 1fr;gap:.65rem;
  margin-bottom:1.6rem;text-align:left;
}
.plan{
  position:relative;overflow:hidden;
  background:linear-gradient(180deg,rgba(30,21,56,.96),rgba(18,13,36,.97));
  border:1px solid rgba(160,100,255,.14);
  border-radius:16px;padding:1.25rem;
  transition:border-color .2s,transform .15s;
}
.plan:hover{border-color:rgba(160,100,255,.32);transform:translateY(-2px)}
.plan::before{
  content:'';position:absolute;inset:0 0 auto;height:2px;
  background:linear-gradient(90deg,#a855f7,#ff7a30,transparent 80%);
}
.plan-tier{
  font-family:'DM Mono',monospace;font-size:.58rem;letter-spacing:.18em;
  text-transform:uppercase;color:#a855f7;margin-bottom:.5rem;
}
.plan-price{font-size:1.55rem;font-weight:700;color:#f4f0ff;line-height:1;margin-bottom:.12rem}
.plan-price-sub{font-size:.7rem;color:#5a5072;margin-bottom:.9rem}
.plan-features{list-style:none;display:flex;flex-direction:column;gap:.45rem}
.plan-features li{
  font-size:.76rem;color:#b3a7d3;
  display:flex;align-items:flex-start;gap:.55rem;line-height:1.4;
}
.plan-features li::before{
  content:'';width:13px;height:13px;margin-top:1px;flex-shrink:0;
  background-image:url("data:image/svg+xml,%3Csvg viewBox='0 0 13 13' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Ccircle cx='6.5' cy='6.5' r='6' stroke='%23a855f7' stroke-opacity='.55'/%3E%3Cpath d='M3.5 6.5l2 2 4-4' stroke='%23a855f7' stroke-width='1.4' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");
  background-size:contain;background-repeat:no-repeat;
}
.divider{height:1px;background:linear-gradient(90deg,transparent,rgba(160,100,255,.18),transparent);margin-bottom:1.5rem}
.actions{display:flex;flex-direction:column;gap:.55rem}
.btn-primary{
  display:block;text-decoration:none;text-align:center;
  background:linear-gradient(135deg,#a855f7 0%,#d946ef 50%,#ff7a30 100%);
  color:#fff;border:none;border-radius:12px;
  padding:.88rem 1.5rem;font-size:.88rem;font-weight:700;letter-spacing:.01em;
  cursor:pointer;transition:opacity .15s,transform .12s,box-shadow .15s;
  box-shadow:0 4px 24px rgba(168,85,247,.28);
}
.btn-primary:hover{opacity:.92;transform:translateY(-1px);box-shadow:0 6px 32px rgba(168,85,247,.38)}
.btn-secondary{
  display:block;text-decoration:none;text-align:center;
  background:rgba(255,255,255,.04);color:#c4b0f0;
  border:1px solid rgba(160,100,255,.2);border-radius:12px;
  padding:.88rem 1.5rem;font-size:.88rem;font-weight:600;
  cursor:pointer;transition:border-color .15s,background .15s,color .15s;
}
.btn-secondary:hover{background:rgba(160,100,255,.1);border-color:rgba(160,100,255,.36);color:#e8deff}
.btn-ghost{color:#5a5072;font-size:.76rem;text-decoration:none;display:block;padding:.45rem;transition:color .15s}
.btn-ghost:hover{color:#9b8fbb}
@media(max-width:480px){
  .shell{padding:20px}
  .plans{grid-template-columns:1fr}
  .gate-title{font-size:1.9rem}
}
</style>
</head>
<body>
<div class="shell">
  <div class="topbar">
    <a href="/" class="brand">
      <svg class="brand-mark" viewBox="0 0 56 56" fill="none" xmlns="http://www.w3.org/2000/svg">
        <defs><linearGradient id="g" x1="6" y1="6" x2="50" y2="50" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#a855f7"/><stop offset="1" stop-color="#7c3aed"/></linearGradient></defs>
        <rect x="4" y="4" width="48" height="48" rx="14" fill="url(#g)"/>
        <path d="M17 18.5H38.5L31.8 25.2H23.6V31.6H35.5L28.8 38.3H17V18.5Z" fill="#fff" fill-opacity=".95"/>
        <path d="M17 35.8L23.2 29.7H32.8L26.6 35.8H17Z" fill="#e9d5ff" fill-opacity=".7"/>
      </svg>
      <span class="brand-name">Spectre</span>
    </a>
    <a href="/dashboard" class="nav-back">← Dashboard</a>
  </div>

  <div class="gate">
    <div class="pill">Plus &amp; Pro Feature</div>
    <h1 class="gate-title"><span>Research</span> Terminal</h1>
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
