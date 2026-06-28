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

const MYRMIDON_ANALYTICS_HTML = `<!-- MYRMIDON ANALYTICS PAGE -->
<style>
.myrm-stat-card{background:rgba(10,10,18,.8);border:1px solid rgba(167,139,250,.15);border-radius:10px;padding:1.2rem}
.myrm-stat-label{font-family:monospace;font-size:.55rem;letter-spacing:.1em;text-transform:uppercase;color:rgba(167,139,250,.5);margin-bottom:.4rem}
.myrm-stat-value{font-family:monospace;font-size:1.3rem;font-weight:600;color:#fff;margin-bottom:.2rem;line-height:1.2}
.myrm-stat-sub{font-family:monospace;font-size:.62rem;color:rgba(167,139,250,.5)}
.myrm-dark-card{background:rgba(10,10,18,.8);border:1px solid rgba(167,139,250,.15);border-radius:10px;padding:1.2rem;margin-bottom:1.2rem}
.myrm-section-label{font-family:monospace;font-size:.55rem;letter-spacing:.14em;text-transform:uppercase;color:rgba(167,139,250,.5);margin-bottom:.9rem}
.myrm-table{width:100%;border-collapse:collapse;font-size:.78rem}
.myrm-table th{text-align:left;padding:.45rem .6rem;font-family:monospace;font-size:.52rem;letter-spacing:.1em;color:rgba(167,139,250,.45);font-weight:600;text-transform:uppercase;border-bottom:1px solid rgba(167,139,250,.12)}
.myrm-table td{padding:.5rem .6rem;border-bottom:1px solid rgba(167,139,250,.06);vertical-align:middle}
.myrm-table tr:last-child td{border-bottom:none}
.myrm-table tr:hover td{background:rgba(167,139,250,.04)}
</style>
<div class="wrap" data-page="analytics">
  <section class="sec">
    <div style="padding:.5rem 0 1.5rem">
      <div style="font-family:monospace;font-size:.58rem;letter-spacing:.14em;text-transform:uppercase;color:#a78bfa;margin-bottom:.4rem">Myrmidon · Alpaca Paper Trading</div>
      <h2 style="font-family:var(--disp);font-size:clamp(1.6rem,3vw,2.6rem);margin:0 0 .6rem;background:linear-gradient(120deg,#a855f7 0%,#d946ef 35%,#ff7a30 72%,#ffb347 100%);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text">Analytics</h2>
      <button onclick="window.myrmRefreshAnalytics&&window.myrmRefreshAnalytics()" style="font-family:monospace;font-size:.55rem;letter-spacing:.1em;text-transform:uppercase;color:#a78bfa;background:rgba(167,139,250,.1);border:1px solid rgba(167,139,250,.25);border-radius:6px;padding:.3rem .8rem;cursor:pointer">↺ Refresh</button>
    </div>
    <!-- Metrics strip -->
    <div id="myrm-metrics-grid" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(155px,1fr));gap:1rem;margin-bottom:1.2rem">
      <div class="myrm-stat-card"><div class="myrm-stat-label">Portfolio Equity</div><div class="myrm-stat-value" style="font-size:.9rem;color:rgba(167,139,250,.4)">Loading…</div></div>
    </div>
    <!-- Equity curve -->
    <div class="myrm-dark-card">
      <div class="myrm-section-label">30-Day Equity Curve</div>
      <svg id="myrm-equity-chart" style="width:100%;height:180px;display:block" preserveAspectRatio="none">
        <text x="50%" y="50%" text-anchor="middle" fill="rgba(167,139,250,.35)" font-size="11" font-family="monospace">Loading…</text>
      </svg>
    </div>
    <!-- Trade history -->
    <div class="myrm-dark-card">
      <div class="myrm-section-label">Recent Trades</div>
      <div style="overflow-x:auto">
        <table class="myrm-table">
          <thead><tr>
            <th>Symbol</th><th>Side</th><th style="text-align:right">Qty</th>
            <th style="text-align:right">Fill Price</th><th style="text-align:right">Total (USD)</th>
            <th style="text-align:right">Total (AUD)</th><th style="text-align:right">Date</th>
          </tr></thead>
          <tbody id="myrm-trades-tbody">
            <tr><td colspan="7" style="text-align:center;color:rgba(167,139,250,.35);padding:1.5rem;font-family:monospace;font-size:.7rem">Loading…</td></tr>
          </tbody>
        </table>
      </div>
    </div>
  </section>
</div>`;

const MYRMIDON_ANALYTICS_SCRIPT = `<script>
(function(){
  var loading=false;
  function fmtUsd(n){return n==null?'—':'$'+Math.round(n).toLocaleString();}
  function fmtAud(n,rate){return(!rate||n==null)?'—':'~$'+Math.round(n/rate).toLocaleString();}
  function fmtPct(n){if(n==null)return'—';var s=n>=0?'+':'';return s+n.toFixed(2)+'%';}

  function setAll(msg){
    var g=document.getElementById('myrm-metrics-grid');
    var svg=document.getElementById('myrm-equity-chart');
    var tb=document.getElementById('myrm-trades-tbody');
    if(g)g.innerHTML='<div style="color:#ff7a30;font-family:monospace;font-size:.72rem;padding:.5rem 0">'+msg+'</div>';
    if(svg)svg.innerHTML='<text x="50%" y="50%" text-anchor="middle" fill="rgba(167,139,250,.35)" font-size="11" font-family="monospace">'+msg+'</text>';
    if(tb)tb.innerHTML='<tr><td colspan="7" style="text-align:center;color:rgba(167,139,250,.35);padding:1.5rem;font-family:monospace;font-size:.7rem">'+msg+'</td></tr>';
  }

  async function loadAnalytics(){
    if(loading)return;
    loading=true;
    setAll('Loading…');
    try{
      var res=await fetch('/api/trading/analytics?t='+Date.now());
      var d=await res.json();
      if(!res.ok){setAll('Error: '+(d.error||res.status));loading=false;return;}
      if(!d.account){setAll('No account data from Alpaca — check credentials');loading=false;return;}
      renderMetrics(d.account,d.history,d.audUsdRate);
      renderChart(d.history);
      renderTrades(d.orders,d.audUsdRate);
    }catch(e){setAll('Network error: '+e.message);}
    loading=false;
  }

  function renderMetrics(acct,hist,rate){
    var g=document.getElementById('myrm-metrics-grid');if(!g)return;
    var equity=parseFloat(acct.equity)||0;
    var cash=parseFloat(acct.cash)||0;
    var bp=parseFloat(acct.buying_power)||0;
    var startEq=equity,retUsd=0,retPct=0;
    if(hist&&hist.equity&&hist.equity.length>1){
      var vals=hist.equity.filter(function(v){return v!=null&&v>0;});
      if(vals.length>1){startEq=vals[0];retUsd=equity-startEq;retPct=startEq>0?(retUsd/startEq)*100:0;}
    }
    var pos=retUsd>=0;var col=pos?'#4ade80':'#ff7a30';
    g.innerHTML=[
      card('Portfolio Equity',fmtUsd(equity),fmtAud(equity,rate),'#fff'),
      card('30-Day Return',fmtPct(retPct),(pos?'+':'')+fmtUsd(Math.abs(retUsd))+' USD',col),
      card('Uninvested Cash',fmtUsd(cash),(cash&&equity?(cash/equity*100).toFixed(1)+'% of portfolio':''),'#fff'),
      card('Buying Power',fmtUsd(bp),fmtAud(bp,rate),'#fff'),
    ].join('');
  }

  function card(label,val,sub,col){
    return '<div class="myrm-stat-card">'+
      '<div class="myrm-stat-label">'+label+'</div>'+
      '<div class="myrm-stat-value" style="color:'+col+'">'+val+'</div>'+
      '<div class="myrm-stat-sub">'+sub+'</div>'+
    '</div>';
  }

  function renderChart(hist){
    var svg=document.getElementById('myrm-equity-chart');
    if(!svg)return;
    if(!hist||!hist.equity){svg.innerHTML='<text x="50%" y="50%" text-anchor="middle" fill="rgba(167,139,250,.35)" font-size="11" font-family="monospace">No history data from Alpaca</text>';return;}
    var vals=hist.equity.filter(function(v){return v!=null&&v>0;});
    var ts=hist.timestamp||[];
    if(vals.length<2){svg.innerHTML='<text x="50%" y="50%" text-anchor="middle" fill="rgba(167,139,250,.35)" font-size="11" font-family="monospace">Not enough data</text>';return;}
    var W=800,H=160,PX=8,PY=14;
    var lo=Math.min.apply(null,vals)*0.999,hi=Math.max.apply(null,vals)*1.001,rng=hi-lo;
    var tx=function(i){return PX+(i/(vals.length-1))*(W-PX*2);};
    var ty=function(v){return H-PY-((v-lo)/rng)*(H-PY*2);};
    var start=vals[0],end=vals[vals.length-1],isPos=end>=start;
    var col=isPos?'#4ade80':'#ff7a30';
    var pts=vals.map(function(v,i){return tx(i)+','+ty(v);});
    var path='M '+pts.join(' L ');
    var fill=path+' L '+tx(vals.length-1)+','+(H-PY)+' L '+tx(0)+','+(H-PY)+' Z';
    var startY=ty(start);
    var fmtD=function(ts){if(!ts)return'';var d=new Date(ts*1000);return(d.getMonth()+1)+'/'+(d.getDate());};
    svg.setAttribute('viewBox','0 0 '+W+' '+H);
    svg.innerHTML='<defs><linearGradient id="eg" x1="0" y1="0" x2="0" y2="1">'+
      '<stop offset="0%" stop-color="'+col+'" stop-opacity="0.18"/>'+
      '<stop offset="100%" stop-color="'+col+'" stop-opacity="0.01"/>'+
    '</linearGradient></defs>'+
    '<line x1="'+PX+'" y1="'+startY+'" x2="'+(W-PX)+'" y2="'+startY+'" stroke="rgba(255,255,255,.08)" stroke-width="1" stroke-dasharray="3,4"/>'+
    '<path d="'+fill+'" fill="url(#eg)"/>'+
    '<path d="'+path+'" fill="none" stroke="'+col+'" stroke-width="2" stroke-linejoin="round"/>'+
    '<circle cx="'+tx(0)+'" cy="'+ty(start)+'" r="3" fill="'+col+'" opacity="0.5"/>'+
    '<circle cx="'+tx(vals.length-1)+'" cy="'+ty(end)+'" r="4" fill="'+col+'"/>'+
    '<text x="'+PX+'" y="'+(H-3)+'" font-family="monospace" font-size="8" fill="rgba(167,139,250,.45)">'+fmtD(ts[0])+'</text>'+
    '<text x="'+(W-PX)+'" y="'+(H-3)+'" font-family="monospace" font-size="8" fill="rgba(167,139,250,.45)" text-anchor="end">'+fmtD(ts[ts.length-1])+'</text>'+
    '<text x="'+(tx(vals.length-1)-6)+'" y="'+(ty(end)-7)+'" font-family="monospace" font-size="10" fill="'+col+'" text-anchor="end">$'+Math.round(end).toLocaleString()+'</text>';
  }

  function renderTrades(orders,rate){
    var tb=document.getElementById('myrm-trades-tbody');if(!tb)return;
    var filled=(orders||[]).filter(function(o){return o.status==='filled'&&o.filled_avg_price;});
    if(!filled.length){tb.innerHTML='<tr><td colspan="7" style="text-align:center;color:rgba(167,139,250,.35);padding:1.5rem;font-family:monospace;font-size:.7rem">No filled trades yet</td></tr>';return;}
    tb.innerHTML=filled.slice(0,100).map(function(o){
      var isBuy=o.side==='buy';var sc=isBuy?'#4ade80':'#ff7a30';
      var price=parseFloat(o.filled_avg_price)||0;
      var qty=parseFloat(o.filled_qty)||parseFloat(o.qty)||0;
      var total=price*qty;
      var dt=o.filled_at?new Date(o.filled_at).toLocaleDateString('en-AU',{month:'short',day:'numeric',year:'2-digit',hour:'2-digit',minute:'2-digit'}):'—';
      var audVal=rate?'~$'+Math.round(total/rate).toLocaleString():'—';
      return'<tr>'+
        '<td style="font-weight:600;color:#fff">'+o.symbol+'</td>'+
        '<td style="color:'+sc+';font-family:monospace;font-size:.65rem;font-weight:700">'+(isBuy?'↑ BUY':'↓ SELL')+'</td>'+
        '<td style="text-align:right;font-family:monospace">'+qty.toLocaleString()+'</td>'+
        '<td style="text-align:right;font-family:monospace">$'+price.toFixed(2)+'</td>'+
        '<td style="text-align:right;font-family:monospace">$'+Math.round(total).toLocaleString()+'</td>'+
        '<td style="text-align:right;font-family:monospace;color:rgba(167,139,250,.7)">'+audVal+'</td>'+
        '<td style="text-align:right;color:rgba(167,139,250,.5);font-size:.68rem">'+dt+'</td>'+
      '</tr>';
    }).join('');
  }

  // The dashboard's switchTab is scoped inside an IIFE (not on window).
  // Attach our own click listener to the analytics nav button instead.
  function attachAnalyticsHook(){
    document.querySelectorAll('.nav-tab[data-tab="analytics"]').forEach(function(btn){
      btn.addEventListener('click',function(){loading=false;loadAnalytics();});
    });
    // Also load immediately if analytics is the initial tab from the URL.
    if(new URLSearchParams(window.location.search).get('tab')==='analytics'){loadAnalytics();}
  }
  if(document.readyState==='loading'){document.addEventListener('DOMContentLoaded',attachAnalyticsHook);}
  else{attachAnalyticsHook();}
  window.myrmLoadAnalytics=loadAnalytics;
  window.myrmRefreshAnalytics=function(){loading=false;loadAnalytics();};
})();
</script>`;

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
    // Add Analytics nav tab.
    html = html.replace(
      '<button type="button" class="nav-tab" data-tab="research">Research</button>',
      '<button type="button" class="nav-tab" data-tab="research">Research</button>\n      <button type="button" class="nav-tab" data-tab="analytics">Analytics</button>',
    );
    // Inject analytics page content after the research section.
    html = html.replace("<!-- UPLOADS (moved to quant tab) -->", MYRMIDON_ANALYTICS_HTML + "\n<!-- UPLOADS (moved to quant tab) -->");
    html = html.replace("</body>", MYRMIDON_SCRIPT + "\n" + MYRMIDON_ANALYTICS_SCRIPT + "\n</body>");
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
