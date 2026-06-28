import fs from "node:fs/promises";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";

export const runtime = "nodejs";

const TRADER_EMAIL = "jwmcghee09@gmail.com";

const MYRMIDON_AI_TERMINAL = `<!-- MYRMIDON AI terminal -->
<div id="myrm-ai" style="padding:0 2.5rem 2rem;max-width:960px;margin-left:auto;margin-right:auto;box-sizing:border-box">
  <div style="margin-bottom:.6rem"><span style="font-family:monospace;font-size:.58rem;letter-spacing:.14em;text-transform:uppercase;color:#a78bfa">Myrmidon — Autonomous Trading Agent</span></div>
  <div style="background:#0a0a12;border:1px solid rgba(167,139,250,.2);border-radius:10px;overflow:hidden">
    <div style="display:flex;align-items:center;justify-content:space-between;gap:.6rem;padding:.7rem 1.2rem;background:rgba(167,139,250,.06);border-bottom:1px solid rgba(167,139,250,.15)">
      <div style="display:flex;align-items:center;gap:.6rem">
        <div style="width:8px;height:8px;border-radius:50%;background:#a78bfa"></div>
        <span style="font-family:monospace;font-size:.62rem;letter-spacing:.12em;text-transform:uppercase;color:#a78bfa">myrmidon · live alpaca tools</span>
      </div>
      <div id="myrm-header-actions" style="display:flex;align-items:center;gap:.4rem"></div>
    </div>
    <div id="myrm-msgs" style="height:390px;overflow-y:auto;padding:1.2rem;display:flex;flex-direction:column;gap:1rem;scroll-behavior:smooth"></div>
    <div style="display:flex;gap:.6rem;padding:.8rem 1.2rem;border-top:1px solid rgba(167,139,250,.1);background:rgba(0,0,0,.2)">
      <textarea id="myrm-input" onkeydown="myrmKey(event)" rows="1" placeholder="Talk to Myrmidon…" style="flex:1;background:rgba(255,255,255,.05);border:1px solid rgba(167,139,250,.2);border-radius:6px;color:#fff;font-size:.82rem;padding:.5rem .8rem;font-family:inherit;resize:none;min-height:38px;max-height:100px;overflow-y:auto;outline:none"></textarea>
      <button id="myrm-btn" onclick="myrmSend()" style="background:rgba(167,139,250,.15);border:1px solid rgba(167,139,250,.3);border-radius:6px;color:#a78bfa;font-family:monospace;font-size:.6rem;letter-spacing:.1em;text-transform:uppercase;padding:.5rem .95rem;cursor:pointer;white-space:nowrap;align-self:flex-end">Send</button>
    </div>
  </div>
</div>`;

const MYRMIDON_SCRIPT = `<script>
(function(){
  var msgs=[];
  var busy=false;
  function esc(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}
  function el(id){return document.getElementById(id);}

  function renderMsgs(){
    var box=el('myrm-msgs');if(!box)return;
    if(msgs.length===0){box.innerHTML='<div style="color:rgba(167,139,250,.4);font-family:monospace;font-size:.7rem">Myrmidon ready.</div>';return;}
    box.innerHTML=msgs.map(function(m){var isU=m.role==='user';
      return '<div style="display:flex;flex-direction:column;gap:.25rem;max-width:85%;align-self:'+(isU?'flex-end':'flex-start')+'">'+
        '<div style="font-family:monospace;font-size:.5rem;text-transform:uppercase;color:#666;'+(isU?'text-align:right':'')+'">'+( isU?'You':'Myrmidon')+'</div>'+
        '<div style="padding:.62rem .88rem;border-radius:8px;font-size:.82rem;line-height:1.6;white-space:pre-wrap;word-break:break-word;'+(isU?'background:rgba(167,139,250,.15);border:1px solid rgba(167,139,250,.2);color:#e2d9ff':'background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);color:#fff')+'">'+esc(m.content)+'</div>'+
      '</div>';
    }).join('');
    box.scrollTop=box.scrollHeight;
  }
  async function send(){
    var inp=el('myrm-input'),btn=el('myrm-btn');
    if(!inp)return;var text=inp.value.trim();if(!text||busy)return;
    inp.value='';msgs.push({role:'user',content:text});busy=true;renderMsgs();
    var box=el('myrm-msgs');
    if(box){var t=document.createElement('div');t.style.cssText='color:rgba(167,139,250,.6);font-family:monospace;font-size:.62rem;align-self:flex-start';t.textContent='Analysing…';box.appendChild(t);}
    if(btn){btn.textContent='…';btn.disabled=true;}
    try{
      var res=await fetch('/api/trading/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({messages:msgs})});
      var data=await res.json();
      msgs.push({role:'assistant',content:data.reply||('Error: '+(data.error||'Unknown'))});
    }catch(e){msgs.push({role:'assistant',content:'Error: network failure'});}
    finally{busy=false;if(btn){btn.textContent='Send';btn.disabled=false;}renderMsgs();}
  }
  async function syncAlpaca(){
    var syncBtn=el('myrm-sync-btn'),status=el('myrm-sync-status');
    if(syncBtn){syncBtn.disabled=true;syncBtn.textContent='Syncing…';}
    if(status)status.textContent='';
    try{
      var res=await fetch('/api/trading/sync',{method:'POST',cache:'no-store'});
      var data=await res.json();
      if(res.ok&&data.ok){if(status)status.textContent='✓ Synced '+data.synced;window.location.reload();}
      else{if(status)status.textContent=data.error||'Sync failed';if(syncBtn){syncBtn.disabled=false;syncBtn.textContent='Sync Alpaca';}}
    }catch(e){if(status)status.textContent='Network error';if(syncBtn){syncBtn.disabled=false;syncBtn.textContent='Sync Alpaca';}}
  }
  function init(){
    renderMsgs();
    // Inject Sync Alpaca button into the Myrmidon terminal header area
    var header=el('myrm-header-actions');
    if(header&&!el('myrm-sync-btn')){
      var sb=document.createElement('button');
      sb.id='myrm-sync-btn';sb.type='button';sb.onclick=syncAlpaca;
      sb.style.cssText='font-family:monospace;font-size:.56rem;letter-spacing:.1em;text-transform:uppercase;color:#a78bfa;background:rgba(167,139,250,.12);border:1px solid rgba(167,139,250,.3);border-radius:6px;padding:.35rem .8rem;cursor:pointer;white-space:nowrap';
      sb.textContent='Sync Alpaca';
      var ss=document.createElement('span');
      ss.id='myrm-sync-status';
      ss.style.cssText='font-family:monospace;font-size:.56rem;color:#a78bfa;margin-left:.5rem;opacity:.8';
      header.appendChild(sb);
      header.appendChild(ss);
    }
  }
  if(document.readyState==='loading'){document.addEventListener('DOMContentLoaded',init);}else{init();}
  window.myrmSend=send;
  window.myrmKey=function(e){if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();send();}};
  window.myrmSyncAlpaca=syncAlpaca;
})();
</script>`;

export async function GET(request: NextRequest) {
  const isDemo = request.nextUrl.searchParams.get("demo") === "1";
  let isTrader = false;

  if (!isDemo) {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.redirect(buildRedirectUrl(request, "/signin"));
    }
    isTrader = user.email === TRADER_EMAIL;
  }

  let html = await fs.readFile(path.join(process.cwd(), "public", "spectre-dashboard-v3.html"), "utf8");

  if (isTrader) {
    html = html.replace("<head>", "<head><!-- MYRM_DEBUG:trader=true -->");
    // Inject Myrmidon terminal inside #dashboard-top (which has data-page="ai"),
    // and hide the original Ask AI widget. switchTab('ai') shows #dashboard-top
    // and everything inside it, so the terminal appears with no extra JS needed.
    html = html.replace(
      '  <div class="ai-page-layout">',
      MYRMIDON_AI_TERMINAL + '\n  <div class="ai-page-layout" style="display:none">',
    );
    // Rebrand all visible SPECTRE text to Myrmidon for the trader account.
    html = html.replace("<title>SPECTRE — Dashboard</title>", "<title>Myrmidon — Trading Terminal</title>");
    html = html.replace('<span class="boot-label">SPECTRE</span>', '<span class="boot-label">Myrmidon</span>');
    html = html.replace('id="nav-dashboard-logo">SPECTRE</a>', 'id="nav-dashboard-logo">Myrmidon</a>');
    html = html.replace('<div class="hero-brand">SPECTRE</div>', '<div class="hero-brand">Myrmidon</div>');
    html = html.replace('<span class="foot-logo">SPECTRE</span>', '<span class="foot-logo">Myrmidon</span>');
    html = html.replace("</body>", MYRMIDON_SCRIPT + "\n</body>");
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
