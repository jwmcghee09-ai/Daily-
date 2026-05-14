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
    radial-gradient(ellipse 70% 50% at 50% -10%, rgba(124,77,255,.08) 0%, transparent 100%),
    radial-gradient(ellipse 40% 60% at 100% 80%, rgba(255,122,48,.05) 0%, transparent 60%),
    #f3f1fb;
  min-height:100vh;
  color:#0f0d1e;
}

/* ── Nav ── */
nav{
  position:sticky;top:0;z-index:20;
  height:56px;
  background:rgba(243,241,251,.94);
  backdrop-filter:blur(28px) saturate(1.4);
  -webkit-backdrop-filter:blur(28px) saturate(1.4);
  border-bottom:1px solid rgba(100,80,200,.13);
}
.nav-inner{
  max-width:1200px;margin:0 auto;padding:0 2rem;
  height:100%;display:flex;align-items:center;justify-content:space-between;gap:1rem;
}
.brand{
  font-family:'DM Mono',monospace;font-size:.85rem;font-weight:500;letter-spacing:.2em;text-transform:uppercase;
  text-decoration:none;
  background:linear-gradient(90deg,#a855f7 0%,#d946ef 35%,#ff7a30 72%,#ffb347 100%);
  background-size:200% auto;
  -webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;
  animation:brandSlide 4s linear infinite;
}
@keyframes brandSlide{0%{background-position:0% center}100%{background-position:200% center}}
.nav-back{
  display:inline-flex;align-items:center;gap:.35rem;
  font-size:.78rem;font-weight:600;color:#0f0d1e;text-decoration:none;
  border:1px solid rgba(100,80,200,.22);border-radius:999px;
  padding:.32rem .9rem;cursor:pointer;background:transparent;
  transition:border-color .15s,background .15s;font-family:inherit;
}
.nav-back:hover{border-color:rgba(100,80,200,.42);background:rgba(100,80,200,.05)}

/* ── Page body ── */
.page{
  max-width:700px;margin:0 auto;
  padding:56px 1.5rem 80px;
  display:flex;flex-direction:column;align-items:center;
  text-align:center;
}

/* ── Badge ── */
.badge{
  display:inline-flex;align-items:center;gap:7px;
  padding:.3rem 1rem;border-radius:999px;
  border:1px solid transparent;
  background:linear-gradient(#f3f1fb,#f3f1fb) padding-box,
             linear-gradient(90deg,#a855f7,#ff7a30) border-box;
  font-family:'DM Mono',monospace;font-size:.6rem;letter-spacing:.14em;
  text-transform:uppercase;color:#5e5a78;
  margin-bottom:1.6rem;
}
.badge::before{content:'';width:5px;height:5px;border-radius:50%;background:linear-gradient(135deg,#a855f7,#ff7a30);flex-shrink:0}

/* ── Heading ── */
.gate-title{
  font-size:clamp(2.2rem,6vw,3.4rem);font-weight:700;line-height:1.06;
  letter-spacing:-.035em;margin-bottom:.8rem;color:#0f0d1e;
}
.gate-title span{
  background:linear-gradient(90deg,#a855f7 0%,#d946ef 40%,#ff7a30 80%,#ffb347 100%);
  -webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;
}
.gate-sub{
  color:#5e5a78;font-size:1rem;line-height:1.7;
  margin-bottom:3rem;max-width:520px;
}

/* ── Plan cards ── */
.plans{
  display:grid;grid-template-columns:1fr 1fr;gap:1rem;
  width:100%;margin-bottom:2rem;text-align:left;
}
.plan{
  position:relative;overflow:hidden;
  background:#fff;
  border:1px solid rgba(100,80,200,.16);
  border-radius:18px;padding:1.5rem;
  transition:border-color .2s,box-shadow .2s,transform .15s;
  box-shadow:0 2px 12px rgba(100,80,200,.06);
}
.plan:hover{border-color:rgba(124,77,255,.35);box-shadow:0 8px 32px rgba(100,80,200,.12);transform:translateY(-2px)}
.plan::before{
  content:'';position:absolute;inset:0 0 auto;height:2px;
  background:linear-gradient(90deg,#a855f7,#d946ef 50%,#ff7a30,transparent 85%);
}
.plan-tier{
  font-family:'DM Mono',monospace;font-size:.58rem;letter-spacing:.18em;
  text-transform:uppercase;color:#7c4dff;margin-bottom:.6rem;font-weight:500;
}
.plan-price{font-size:2rem;font-weight:700;color:#0f0d1e;line-height:1;margin-bottom:.15rem}
.plan-price-sub{font-size:.72rem;color:#9b8fbb;margin-bottom:1.1rem;font-family:'DM Mono',monospace}
.plan-features{list-style:none;display:flex;flex-direction:column;gap:.5rem}
.plan-features li{
  font-size:.82rem;color:#5e5a78;
  display:flex;align-items:flex-start;gap:.55rem;line-height:1.45;
}
.plan-features li::before{
  content:'';width:14px;height:14px;margin-top:1px;flex-shrink:0;
  background-image:url("data:image/svg+xml,%3Csvg viewBox='0 0 14 14' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Ccircle cx='7' cy='7' r='6.5' fill='%237c4dff' fill-opacity='.1' stroke='%237c4dff' stroke-opacity='.4'/%3E%3Cpath d='M4 7l2 2 4-4' stroke='%237c4dff' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");
  background-size:contain;background-repeat:no-repeat;
}

/* ── Divider ── */
.divider{
  width:100%;height:1px;
  background:linear-gradient(90deg,transparent,rgba(100,80,200,.16),transparent);
  margin-bottom:2rem;
}

/* ── Actions ── */
.actions{display:flex;flex-direction:column;gap:.65rem;width:100%}
.btn-primary{
  display:block;text-decoration:none;text-align:center;
  background:linear-gradient(135deg,#a855f7 0%,#d946ef 45%,#ff7a30 100%);
  color:#fff;border:none;border-radius:14px;
  padding:.95rem 1.5rem;font-size:.92rem;font-weight:700;letter-spacing:.01em;
  cursor:pointer;font-family:inherit;
  transition:filter .15s,transform .12s,box-shadow .15s;
  box-shadow:0 4px 24px rgba(217,70,239,.32),0 1px 0 rgba(255,255,255,.12) inset;
}
.btn-primary:hover{filter:brightness(1.07);transform:translateY(-1px);box-shadow:0 6px 32px rgba(217,70,239,.45),0 1px 0 rgba(255,255,255,.15) inset}
.btn-secondary{
  display:block;text-decoration:none;text-align:center;
  background:#fff;color:#0f0d1e;
  border:1px solid rgba(100,80,200,.22);border-radius:14px;
  padding:.95rem 1.5rem;font-size:.92rem;font-weight:600;font-family:inherit;
  cursor:pointer;transition:border-color .15s,background .15s;
}
.btn-secondary:hover{background:#faf9ff;border-color:rgba(124,77,255,.42)}
.btn-ghost{
  color:#9b8fbb;font-size:.78rem;font-family:inherit;
  background:transparent;border:none;cursor:pointer;
  padding:.45rem;transition:color .15s;
  text-decoration:none;display:block;
}
.btn-ghost:hover{color:#5e5a78}

@media(max-width:540px){
  .plans{grid-template-columns:1fr}
  .gate-title{font-size:2rem}
  .page{padding:40px 1.25rem 64px}
}
</style>
<script>
async function startCheckout(plan, btn) {
  const origText = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Redirecting to Stripe…';
  try {
    const res = await fetch('/api/billing/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ plan }),
    });
    const data = await res.json();
    if (data.url) {
      window.location.assign(data.url);
    } else {
      throw new Error(data.error || 'Unable to start checkout.');
    }
  } catch (err) {
    btn.disabled = false;
    btn.textContent = origText;
    const errEl = document.getElementById('checkout-error');
    if (errEl) { errEl.textContent = err.message || 'Unable to start checkout. Please try again.'; errEl.style.display = 'block'; }
  }
}
</script>
</head>
<body>
<nav>
  <div class="nav-inner">
    <a href="/" class="brand">Spectre</a>
    <button class="nav-back" onclick="history.length > 1 ? history.back() : (window.location.href='/dashboard')">← Back</button>
  </div>
</nav>

<div class="page">
  <div class="badge">Plus &amp; Pro Feature</div>
  <h1 class="gate-title"><span>Research</span> Terminal</h1>
  <p class="gate-sub">Live share data, macro signals, earnings calendars, crypto, commodities, FRED indicators, and central-bank rates — all in one place.</p>

  <div class="plans">
    <div class="plan">
      <div class="plan-tier">Plus</div>
      <div class="plan-price">$2.99</div>
      <div class="plan-price-sub">per month</div>
      <ul class="plan-features">
        <li>Research terminal</li>
        <li>20 AI queries / month</li>
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
    <button class="btn-primary" onclick="startCheckout('plus', this)">Get Plus — $2.99/mo</button>
    <button class="btn-secondary" onclick="startCheckout('pro', this)">Get Pro — $9.99/mo</button>
    <p id="checkout-error" style="display:none;color:#dc2626;font-size:.78rem;margin:.25rem 0 0"></p>
    <button class="btn-ghost" onclick="history.length > 1 ? history.back() : (window.location.href='/dashboard')">← Back to Dashboard</button>
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
