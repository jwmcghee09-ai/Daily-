import fs from "node:fs/promises";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";

export const runtime = "nodejs";
export const maxDuration = 60;

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
.myrm-section-label{font-family:monospace;font-size:.55rem;letter-spacing:.14em;text-transform:uppercase;color:rgba(167,139,250,.5);margin-bottom:.9rem;display:flex;align-items:center;gap:.5rem}
.myrm-section-label::before{content:'';display:block;width:14px;height:1px;background:linear-gradient(90deg,#ff7a30,#a78bfa);flex-shrink:0}
.myrm-table{width:100%;border-collapse:collapse;font-size:.78rem}
.myrm-table th{text-align:left;padding:.45rem .6rem;font-family:monospace;font-size:.52rem;letter-spacing:.1em;color:rgba(167,139,250,.45);font-weight:600;text-transform:uppercase;border-bottom:1px solid rgba(167,139,250,.12)}
.myrm-table td{padding:.5rem .6rem;border-bottom:1px solid rgba(167,139,250,.06);vertical-align:middle}
.myrm-table tr:last-child td{border-bottom:none}
.myrm-table tr:hover td{background:rgba(167,139,250,.04)}
.myrm-pos{color:#4ade80}.myrm-neg{color:#f87171}.myrm-amb{color:#a78bfa}.myrm-ora{color:#ff7a30}.myrm-cyn{color:#38bdf8}
/* macro ticker */
.myrm-macro-bar{display:flex;flex-wrap:wrap;gap:0;border:1px solid rgba(167,139,250,.15);border-radius:10px;overflow:hidden;margin-bottom:1rem;background:rgba(10,10,18,.8)}
.myrm-mkt{display:flex;align-items:center;gap:.5rem;padding:.6rem 1rem;border-right:1px solid rgba(167,139,250,.1);flex:1;min-width:90px}
.myrm-mkt:last-child{border-right:none}
.myrm-mkt-sym{font-family:monospace;font-size:.52rem;letter-spacing:.1em;text-transform:uppercase;color:rgba(167,139,250,.45)}
.myrm-mkt-val{font-family:monospace;font-size:.82rem;font-weight:600;color:#fff}
.myrm-mkt-chg{font-family:monospace;font-size:.6rem}
/* risk signals */
.myrm-risk-bar{display:flex;flex-wrap:wrap;gap:.4rem;padding:.75rem 1rem;border:1px solid rgba(167,139,250,.15);border-radius:10px;margin-bottom:1rem;background:rgba(10,10,18,.8);align-items:center}
.myrm-risk-lbl{font-family:monospace;font-size:.52rem;letter-spacing:.1em;text-transform:uppercase;color:rgba(167,139,250,.35);flex-shrink:0;margin-right:.2rem}
.myrm-sig{font-family:monospace;font-size:.6rem;padding:.2rem .7rem;border-radius:3px;border:1px solid;white-space:nowrap}
.myrm-sig-ok{color:#166534;border-color:rgba(74,222,128,.25);background:rgba(74,222,128,.06)}
.myrm-sig-amb{color:#ff7a30;border-color:rgba(255,122,48,.3);background:rgba(255,122,48,.06)}
.myrm-sig-red{color:#f87171;border-color:rgba(248,113,113,.3);background:rgba(248,113,113,.06);font-weight:700}
</style>
<div class="wrap" data-page="analytics">
  <section class="sec">
    <div style="padding:.5rem 0 1.5rem;display:flex;align-items:flex-end;justify-content:space-between;flex-wrap:wrap;gap:.8rem">
      <div>
        <div style="font-family:monospace;font-size:.58rem;letter-spacing:.14em;text-transform:uppercase;color:#a78bfa;margin-bottom:.4rem">Myrmidon · Alpaca Paper Trading</div>
        <h2 style="font-family:var(--disp);font-size:clamp(1.6rem,3vw,2.6rem);margin:0;background:linear-gradient(120deg,#a855f7 0%,#d946ef 35%,#ff7a30 72%,#ffb347 100%);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text">Analytics</h2>
        <div id="myrm-api-status" style="font-family:monospace;font-size:.58rem;color:#ff7a30;margin-top:.4rem;min-height:1em">⚙ Initialising…</div>
      </div>
      <div style="display:flex;align-items:center;gap:.6rem">
        <span id="myrm-mkt-status" style="font-family:monospace;font-size:.58rem;letter-spacing:.08em;color:rgba(167,139,250,.4)">—</span>
        <button onclick="window.myrmRefreshAnalytics&&window.myrmRefreshAnalytics()" style="font-family:monospace;font-size:.55rem;letter-spacing:.1em;text-transform:uppercase;color:#a78bfa;background:rgba(167,139,250,.1);border:1px solid rgba(167,139,250,.25);border-radius:6px;padding:.3rem .8rem;cursor:pointer">↺ Refresh</button>
      </div>
    </div>

    <!-- Macro ticker -->
    <div class="myrm-macro-bar" id="myrm-macro-bar">
      <div class="myrm-mkt"><span class="myrm-mkt-sym">VIX</span><span class="myrm-mkt-val" id="ma-vix">—</span><span class="myrm-mkt-chg" id="ma-vix-c"></span></div>
      <div class="myrm-mkt"><span class="myrm-mkt-sym">S&amp;P 500</span><span class="myrm-mkt-val" id="ma-spx">—</span><span class="myrm-mkt-chg" id="ma-spx-c"></span></div>
      <div class="myrm-mkt"><span class="myrm-mkt-sym">Nasdaq</span><span class="myrm-mkt-val" id="ma-ndx">—</span><span class="myrm-mkt-chg" id="ma-ndx-c"></span></div>
      <div class="myrm-mkt"><span class="myrm-mkt-sym">10Y</span><span class="myrm-mkt-val" id="ma-10y">—</span><span class="myrm-mkt-chg" id="ma-10y-c"></span></div>
      <div class="myrm-mkt"><span class="myrm-mkt-sym">Gold</span><span class="myrm-mkt-val" id="ma-gld">—</span><span class="myrm-mkt-chg" id="ma-gld-c"></span></div>
      <div class="myrm-mkt"><span class="myrm-mkt-sym">Oil WTI</span><span class="myrm-mkt-val" id="ma-oil">—</span><span class="myrm-mkt-chg" id="ma-oil-c"></span></div>
      <div class="myrm-mkt"><span class="myrm-mkt-sym">BTC</span><span class="myrm-mkt-val" id="ma-btc">—</span><span class="myrm-mkt-chg" id="ma-btc-c"></span></div>
      <div class="myrm-mkt"><span class="myrm-mkt-sym">AUD/USD</span><span class="myrm-mkt-val" id="ma-aud">—</span><span class="myrm-mkt-chg" id="ma-aud-c"></span></div>
    </div>

    <!-- Risk signals -->
    <div class="myrm-risk-bar">
      <span class="myrm-risk-lbl">Risk</span>
      <div id="myrm-risk-sigs"><span class="myrm-sig myrm-sig-amb">Scanning…</span></div>
    </div>

    <!-- Metrics grid -->
    <div id="myrm-metrics-grid" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(145px,1fr));gap:.8rem;margin-bottom:1.2rem">
      <div class="myrm-stat-card"><div class="myrm-stat-label">Portfolio Equity</div><div class="myrm-stat-value" style="color:rgba(167,139,250,.4)">Loading…</div></div>
    </div>

    <!-- Equity curve -->
    <div class="myrm-dark-card">
      <div class="myrm-section-label">30-Day Equity Curve</div>
      <svg id="myrm-equity-chart" style="width:100%;height:180px;display:block" preserveAspectRatio="none">
        <text x="50%" y="50%" text-anchor="middle" fill="rgba(167,139,250,.35)" font-size="11" font-family="monospace">Loading…</text>
      </svg>
    </div>

    <!-- Positions: Core -->
    <div class="myrm-dark-card">
      <div class="myrm-section-label">Core · Index Sleeve <span id="myrm-core-pct" style="color:rgba(167,139,250,.4);font-weight:normal;margin-left:.5rem"></span></div>
      <div style="overflow-x:auto">
        <table class="myrm-table">
          <thead><tr>
            <th>Symbol</th><th style="text-align:right">Qty</th><th style="text-align:right">Price</th>
            <th style="text-align:right">Mkt Value</th><th style="text-align:right">Day %</th>
            <th style="text-align:right">Day P&amp;L</th><th style="text-align:right">Total P&amp;L</th>
          </tr></thead>
          <tbody id="myrm-core-tbody"><tr><td colspan="7" style="text-align:center;color:rgba(167,139,250,.35);padding:1rem;font-family:monospace;font-size:.7rem">Loading…</td></tr></tbody>
        </table>
      </div>
    </div>

    <!-- Positions: Alpha -->
    <div class="myrm-dark-card">
      <div class="myrm-section-label" style="color:#4ade80">Alpha · Satellite Sleeve <span id="myrm-alpha-pct" style="color:rgba(74,222,128,.4);font-weight:normal;margin-left:.5rem"></span></div>
      <div style="overflow-x:auto">
        <table class="myrm-table">
          <thead><tr>
            <th>Symbol</th><th style="text-align:right">Qty</th><th style="text-align:right">Price</th>
            <th style="text-align:right">Mkt Value</th><th style="text-align:right">Day %</th>
            <th style="text-align:right">Day P&amp;L</th><th style="text-align:right">Total P&amp;L</th>
          </tr></thead>
          <tbody id="myrm-alpha-tbody"><tr><td colspan="7" style="text-align:center;color:rgba(167,139,250,.35);padding:1rem;font-family:monospace;font-size:.7rem">Loading…</td></tr></tbody>
        </table>
      </div>
    </div>

    <!-- Open orders -->
    <div class="myrm-dark-card">
      <div class="myrm-section-label">Open Orders</div>
      <div style="overflow-x:auto">
        <table class="myrm-table">
          <thead><tr>
            <th>Symbol</th><th>Side</th><th style="text-align:right">Qty</th>
            <th>Type</th><th>Status</th><th style="text-align:right">Submitted</th>
          </tr></thead>
          <tbody id="myrm-orders-tbody"><tr><td colspan="6" style="text-align:center;color:rgba(167,139,250,.35);padding:1rem;font-family:monospace;font-size:.7rem">Loading…</td></tr></tbody>
        </table>
      </div>
    </div>

    <!-- Trade history -->
    <div class="myrm-dark-card">
      <div class="myrm-section-label">Recent Filled Trades</div>
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
  var CORE_ETFS={SPY:0.40,QQQ:0.20,VEA:0.15};
  var apiStatusEl=document.getElementById('myrm-api-status');
  function setStatus(msg,col){if(apiStatusEl){apiStatusEl.textContent=msg;apiStatusEl.style.color=col||'#ff7a30';}}
  var BROAD_ETFS={'IWM':1,'VTI':1,'IVV':1,'DIA':1,'GLD':1,'TLT':1,'BND':1,'AGG':1,
    'XLE':1,'XLF':1,'XLV':1,'XLI':1,'XLY':1,'XLP':1,'XLU':1,'XLB':1,'XLRE':1,'XLK':1,
    'VNQ':1,'EFA':1,'EEM':1,'VWO':1,'VO':1,'VB':1,'SCHD':1,'JEPI':1,'JEPQ':1};

  function fmtUsd(n){return n==null?'—':'$'+Math.round(n).toLocaleString();}
  function fmtAud(n,rate){return(!rate||n==null)?'—':'~A$'+Math.round(n/rate).toLocaleString();}
  function fmtPct(n){if(n==null)return'—';var s=n>=0?'+':'';return s+n.toFixed(2)+'%';}

  function setAll(msg){
    var g=document.getElementById('myrm-metrics-grid');
    var svg=document.getElementById('myrm-equity-chart');
    var tb=document.getElementById('myrm-trades-tbody');
    var core=document.getElementById('myrm-core-tbody');
    var alpha=document.getElementById('myrm-alpha-tbody');
    var orders=document.getElementById('myrm-orders-tbody');
    var risk=document.getElementById('myrm-risk-sigs');
    if(g)g.innerHTML='<div style="color:#ff7a30;font-family:monospace;font-size:.72rem;padding:.5rem 0">'+msg+'</div>';
    if(svg)svg.innerHTML='<text x="50%" y="50%" text-anchor="middle" fill="rgba(167,139,250,.35)" font-size="11" font-family="monospace">'+msg+'</text>';
    if(tb)tb.innerHTML='<tr><td colspan="7" style="text-align:center;color:rgba(167,139,250,.35);padding:1.5rem;font-family:monospace;font-size:.7rem">'+msg+'</td></tr>';
    if(core)core.innerHTML='<tr><td colspan="7" style="text-align:center;color:rgba(167,139,250,.35);padding:1rem;font-family:monospace;font-size:.7rem">'+msg+'</td></tr>';
    if(alpha)alpha.innerHTML='<tr><td colspan="7" style="text-align:center;color:rgba(167,139,250,.35);padding:1rem;font-family:monospace;font-size:.7rem">'+msg+'</td></tr>';
    if(orders)orders.innerHTML='<tr><td colspan="6" style="text-align:center;color:rgba(167,139,250,.35);padding:1rem;font-family:monospace;font-size:.7rem">'+msg+'</td></tr>';
    if(risk)risk.innerHTML='<span class="myrm-sig myrm-sig-amb">'+msg+'</span>';
  }

  async function loadAnalytics(){
    if(loading)return;
    loading=true;
    setStatus('⟳ Fetching analytics from Alpaca…');
    setAll('Loading…');
    try{
      var ctrl=new AbortController();
      var timer=setTimeout(function(){ctrl.abort();},12000);
      var res;
      try{res=await fetch('/api/trading/analytics?t='+Date.now(),{signal:ctrl.signal});}
      finally{clearTimeout(timer);}
      var text=await res.text();
      var d;
      try{d=JSON.parse(text);}catch(je){
        var em2='Server returned non-JSON (status '+res.status+') — check Render logs';
        setStatus('✗ '+em2,'#f87171');setAll('Error: '+em2);loading=false;return;
      }
      if(!res.ok){
        var em=d.error||('HTTP '+res.status);
        if(res.status===503)em='Alpaca keys missing — add ALPACA_API_KEY + ALPACA_API_SECRET in Render → Environment';
        if(res.status===403)em='Auth failed — sign out and back in';
        setStatus('✗ '+em,'#f87171');setAll('Error: '+em);loading=false;return;
      }
      if(!d.account){
        var em3='No Alpaca account data — verify keys are correct in Render dashboard';
        setStatus('✗ '+em3,'#f87171');setAll(em3);loading=false;return;
      }
      var equity=parseFloat(d.account.equity)||0;
      renderMetrics(d.account,d.history,d.audUsdRate);
      renderChart(d.history);
      renderTrades(d.orders,d.audUsdRate);
      renderMacro(d.macro);
      renderRisk(d.account,d.positions,d.macro);
      renderPositions(d.positions,equity,d.audUsdRate);
      renderOpenOrders(d.openOrders);
      setStatus('✓ Loaded','#4ade80');
    }catch(e){
      var msg=e.name==='AbortError'?'Timed out after 30s — Alpaca unreachable from Render (are keys set in Render dashboard?)':('Fetch error: '+e.message);
      setStatus('✗ '+msg,'#f87171');setAll(msg);
    }
    loading=false;
  }

  function card(label,val,sub,col){
    return '<div class="myrm-stat-card">'+
      '<div class="myrm-stat-label">'+label+'</div>'+
      '<div class="myrm-stat-value" style="color:'+col+'">'+val+'</div>'+
      '<div class="myrm-stat-sub">'+sub+'</div>'+
    '</div>';
  }

  function renderMetrics(acct,hist,rate){
    var g=document.getElementById('myrm-metrics-grid');if(!g)return;
    var equity=parseFloat(acct.equity)||0;
    var cash=parseFloat(acct.cash)||0;
    var bp=parseFloat(acct.buying_power)||0;
    var startEq=equity,retUsd=0,retPct=0,maxDd=0;
    if(hist&&hist.equity&&hist.equity.length>1){
      var vals=hist.equity.filter(function(v){return v!=null&&v>0;});
      if(vals.length>1){
        startEq=vals[0];retUsd=equity-startEq;retPct=startEq>0?(retUsd/startEq)*100:0;
        var peak=vals[0];
        for(var i=1;i<vals.length;i++){
          if(vals[i]>peak)peak=vals[i];
          var dd=peak>0?(peak-vals[i])/peak*100:0;
          if(dd>maxDd)maxDd=dd;
        }
      }
    }
    var pos=retUsd>=0;var col=pos?'#4ade80':'#f87171';
    var cashPct=equity>0?cash/equity*100:0;
    var cashCol=cashPct<3?'#f87171':cashPct<8?'#ff7a30':'#fff';
    g.innerHTML=[
      card('Portfolio Equity',fmtUsd(equity),fmtAud(equity,rate),'#fff'),
      card('30-Day Return',fmtPct(retPct),(pos?'+':'')+fmtUsd(Math.abs(retUsd)),col),
      card('Max Drawdown (30d)',maxDd>0?'-'+maxDd.toFixed(2)+'%':'0%','vs period start',maxDd>5?'#f87171':maxDd>2?'#ff7a30':'#4ade80'),
      card('Uninvested Cash',fmtUsd(cash),cashPct.toFixed(1)+'% of equity',cashCol),
      card('Buying Power',fmtUsd(bp),fmtAud(bp,rate),'#fff'),
    ].join('');
  }

  function renderMacro(macro){
    if(!macro)return;
    function fill(id,q,fmt){
      var vel=document.getElementById(id);var vc=document.getElementById(id+'-c');
      if(!vel)return;
      if(!q){vel.textContent='—';if(vc)vc.textContent='';return;}
      vel.textContent=fmt?fmt(q.price):q.price.toFixed(2);
      if(vc){
        var sign=q.changePct>=0?'+':'';
        vc.textContent=sign+q.changePct.toFixed(2)+'%';
        vc.style.color=q.changePct>=0?'#4ade80':'#f87171';
      }
    }
    fill('ma-vix',macro.vix,null);
    fill('ma-spx',macro.spx,function(p){return '$'+Math.round(p).toLocaleString();});
    fill('ma-ndx',macro.nasdaq,function(p){return '$'+Math.round(p).toLocaleString();});
    fill('ma-10y',macro.treasury10y,function(p){return p.toFixed(2)+'%';});
    fill('ma-gld',macro.gold,function(p){return '$'+Math.round(p).toLocaleString();});
    fill('ma-oil',macro.oil,function(p){return '$'+p.toFixed(2);});
    fill('ma-btc',macro.btc,function(p){return '$'+Math.round(p).toLocaleString();});
    fill('ma-aud',macro.audUsd,function(p){return p.toFixed(4);});
    var ms=document.getElementById('myrm-mkt-status');
    if(ms){
      var now=new Date();
      var et=new Date(now.toLocaleString('en-US',{timeZone:'America/New_York'}));
      var mins=et.getHours()*60+et.getMinutes(),day=et.getDay();
      var isOpen=day>=1&&day<=5&&mins>=570&&mins<960;
      ms.textContent=isOpen?'● Market Open':'○ Market Closed';
      ms.style.color=isOpen?'#4ade80':'rgba(167,139,250,.4)';
    }
  }

  function renderRisk(acct,positions,macro){
    var el=document.getElementById('myrm-risk-sigs');if(!el)return;
    var sigs=[];
    var equity=parseFloat((acct&&acct.equity)||0);
    var cash=parseFloat((acct&&acct.cash)||0);
    var bp=parseFloat((acct&&acct.buying_power)||0);
    var pos=positions||[];

    // 1. Cash floor
    var cashPct=equity>0?cash/equity*100:0;
    if(cashPct<3)sigs.push({cls:'myrm-sig-red',txt:'LOW CASH '+cashPct.toFixed(1)+'%'});
    else if(cashPct<8)sigs.push({cls:'myrm-sig-amb',txt:'CASH '+cashPct.toFixed(1)+'%'});
    else sigs.push({cls:'myrm-sig-ok',txt:'CASH '+cashPct.toFixed(1)+'%'});

    // 2. Worst position drawdown
    var bigLoss=0,bigLossSym='';
    pos.forEach(function(p){var plpc=parseFloat(p.unrealized_plpc)||0;if(plpc<bigLoss){bigLoss=plpc;bigLossSym=p.symbol;}});
    if(bigLoss<-0.12)sigs.push({cls:'myrm-sig-red',txt:'LOSS '+bigLossSym+' '+(bigLoss*100).toFixed(1)+'%'});
    else if(bigLoss<-0.07)sigs.push({cls:'myrm-sig-amb',txt:'DWN '+bigLossSym+' '+(bigLoss*100).toFixed(1)+'%'});
    else sigs.push({cls:'myrm-sig-ok',txt:'POS OK'});

    // 3. Concentration
    var bigPosPct=0,bigPosSym='';
    pos.forEach(function(p){var pct=equity>0?parseFloat(p.market_value)/equity*100:0;if(pct>bigPosPct){bigPosPct=pct;bigPosSym=p.symbol;}});
    if(bigPosPct>30)sigs.push({cls:'myrm-sig-red',txt:'CONC '+bigPosSym+' '+bigPosPct.toFixed(0)+'%'});
    else if(bigPosPct>20)sigs.push({cls:'myrm-sig-amb',txt:'SIZE '+bigPosSym+' '+bigPosPct.toFixed(0)+'%'});
    else sigs.push({cls:'myrm-sig-ok',txt:'SIZING OK'});

    // 4. Core target deviation (SPY/QQQ/VEA)
    var coreDevs=[];
    ['SPY','QQQ','VEA'].forEach(function(sym){
      var target=CORE_ETFS[sym]*100;
      var p=pos.filter(function(x){return x.symbol===sym;})[0];
      var actual=p&&equity>0?parseFloat(p.market_value)/equity*100:0;
      if(Math.abs(actual-target)>8)coreDevs.push(sym+' '+actual.toFixed(0)+'%→'+target+'%');
    });
    if(coreDevs.length)sigs.push({cls:'myrm-sig-amb',txt:'CORE: '+coreDevs.join(' ')});
    else sigs.push({cls:'myrm-sig-ok',txt:'CORE ALT OK'});

    // 5. SPY+QQQ overlap
    var spyQqqMv=0;
    pos.forEach(function(p){if(p.symbol==='SPY'||p.symbol==='QQQ')spyQqqMv+=parseFloat(p.market_value)||0;});
    var overlapPct=equity>0?spyQqqMv/equity*100:0;
    if(overlapPct>65)sigs.push({cls:'myrm-sig-red',txt:'OVERLAP '+overlapPct.toFixed(0)+'%'});
    else sigs.push({cls:'myrm-sig-ok',txt:'OVERLAP OK'});

    // 6. Intraday P&L
    var dayPl=0;
    pos.forEach(function(p){dayPl+=parseFloat(p.unrealized_intraday_pl)||0;});
    var dayPlPct=equity>0?dayPl/equity*100:0;
    if(dayPlPct<-3)sigs.push({cls:'myrm-sig-red',txt:'DAY '+dayPlPct.toFixed(1)+'%'});
    else if(dayPlPct<-1.5)sigs.push({cls:'myrm-sig-amb',txt:'DAY '+dayPlPct.toFixed(1)+'%'});
    else sigs.push({cls:'myrm-sig-ok',txt:'DAY '+(dayPlPct>=0?'+':'')+dayPlPct.toFixed(1)+'%'});

    // 7. VIX regime
    var vix=macro&&macro.vix?macro.vix.price:null;
    if(vix!=null){
      if(vix>35)sigs.push({cls:'myrm-sig-red',txt:'VIX '+vix.toFixed(1)+' EXTREME'});
      else if(vix>25)sigs.push({cls:'myrm-sig-amb',txt:'VIX '+vix.toFixed(1)+' ELEV'});
      else sigs.push({cls:'myrm-sig-ok',txt:'VIX '+vix.toFixed(1)});
    }

    // 8. SPX trend
    var spxChg=macro&&macro.spx?macro.spx.changePct:null;
    if(spxChg!=null){
      if(spxChg<-3)sigs.push({cls:'myrm-sig-red',txt:'SPX '+spxChg.toFixed(1)+'%'});
      else if(spxChg<-1.5)sigs.push({cls:'myrm-sig-amb',txt:'SPX '+spxChg.toFixed(1)+'%'});
      else sigs.push({cls:'myrm-sig-ok',txt:'SPX '+(spxChg>=0?'+':'')+spxChg.toFixed(1)+'%'});
    }

    // 9. 10Y yield
    var y10=macro&&macro.treasury10y?macro.treasury10y.price:null;
    if(y10!=null){
      if(y10>5)sigs.push({cls:'myrm-sig-amb',txt:'10Y '+y10.toFixed(2)+'%'});
      else sigs.push({cls:'myrm-sig-ok',txt:'10Y '+y10.toFixed(2)+'%'});
    }

    // 10. Buying power headroom
    var bpPct=equity>0?bp/equity*100:100;
    if(bpPct<5)sigs.push({cls:'myrm-sig-amb',txt:'BP LOW '+bpPct.toFixed(0)+'%'});
    else sigs.push({cls:'myrm-sig-ok',txt:'BP '+bpPct.toFixed(0)+'%'});

    el.innerHTML=sigs.map(function(s){return'<span class="myrm-sig '+s.cls+'">'+s.txt+'</span>';}).join('');
  }

  function renderPositions(positions,equity,rate){
    var core=[],alpha=[];
    (positions||[]).forEach(function(p){
      if(CORE_ETFS[p.symbol]||BROAD_ETFS[p.symbol])core.push(p);else alpha.push(p);
    });
    function posRow(p){
      var mv=parseFloat(p.market_value)||0,qty=parseFloat(p.qty)||0,price=parseFloat(p.current_price)||0;
      var unrl=parseFloat(p.unrealized_pl)||0,dayChg=parseFloat(p.change_today)||0,dayPl=parseFloat(p.unrealized_intraday_pl)||0;
      var dc=dayChg>=0?'#4ade80':'#f87171',pc=unrl>=0?'#4ade80':'#f87171';
      return'<tr>'+
        '<td style="font-weight:600;color:#fff">'+p.symbol+'</td>'+
        '<td style="text-align:right;font-family:monospace;color:rgba(167,139,250,.6)">'+qty.toFixed(qty%1?4:0)+'</td>'+
        '<td style="text-align:right;font-family:monospace;color:#38bdf8">$'+price.toFixed(2)+'</td>'+
        '<td style="text-align:right;font-family:monospace">$'+Math.round(mv).toLocaleString()+'</td>'+
        '<td style="text-align:right;font-family:monospace;font-size:.7rem;color:'+dc+'">'+(dayChg>=0?'+':'')+(dayChg*100).toFixed(2)+'%</td>'+
        '<td style="text-align:right;font-family:monospace;font-size:.7rem;color:'+dc+'">'+(dayPl>=0?'+':'')+'$'+Math.round(dayPl).toLocaleString()+'</td>'+
        '<td style="text-align:right;font-family:monospace;font-size:.7rem;color:'+pc+'">'+(unrl>=0?'+':'')+'$'+Math.round(unrl).toLocaleString()+'</td>'+
      '</tr>';
    }
    var empty='<tr><td colspan="7" style="text-align:center;color:rgba(167,139,250,.35);padding:1rem;font-family:monospace;font-size:.7rem">';
    var coreTb=document.getElementById('myrm-core-tbody'),coreEl=document.getElementById('myrm-core-pct');
    if(coreTb){
      if(!core.length){coreTb.innerHTML=empty+'No core positions</td></tr>';}
      else{
        coreTb.innerHTML=core.map(posRow).join('');
        var coreMv=core.reduce(function(s,p){return s+(parseFloat(p.market_value)||0);},0);
        if(coreEl)coreEl.textContent=equity>0?(coreMv/equity*100).toFixed(1)+'% of equity · target 70%':'';
      }
    }
    var alphaTb=document.getElementById('myrm-alpha-tbody'),alphaEl=document.getElementById('myrm-alpha-pct');
    if(alphaTb){
      if(!alpha.length){alphaTb.innerHTML=empty+'No alpha positions</td></tr>';}
      else{
        alphaTb.innerHTML=alpha.map(posRow).join('');
        var alphaMv=alpha.reduce(function(s,p){return s+(parseFloat(p.market_value)||0);},0);
        if(alphaEl)alphaEl.textContent=equity>0?(alphaMv/equity*100).toFixed(1)+'% of equity · target 30%':'';
      }
    }
  }

  function renderOpenOrders(openOrders){
    var tb=document.getElementById('myrm-orders-tbody');if(!tb)return;
    if(!openOrders||!openOrders.length){
      tb.innerHTML='<tr><td colspan="6" style="text-align:center;color:rgba(167,139,250,.35);padding:1rem;font-family:monospace;font-size:.7rem">No open orders</td></tr>';return;
    }
    tb.innerHTML=openOrders.map(function(o){
      var isBuy=o.side==='buy';var sc=isBuy?'#4ade80':'#f87171';
      var qty=parseFloat(o.qty||o.notional||0);
      var dt=o.submitted_at?new Date(o.submitted_at).toLocaleString('en-AU',{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'}):'—';
      return'<tr>'+
        '<td style="font-weight:600;color:#fff">'+o.symbol+'</td>'+
        '<td style="color:'+sc+';font-family:monospace;font-size:.65rem;font-weight:700">'+(isBuy?'↑ BUY':'↓ SELL')+'</td>'+
        '<td style="text-align:right;font-family:monospace">'+qty.toLocaleString()+'</td>'+
        '<td style="font-family:monospace;font-size:.68rem;color:rgba(167,139,250,.7)">'+o.type+'</td>'+
        '<td style="font-family:monospace;font-size:.65rem;color:#ff7a30">'+o.status+'</td>'+
        '<td style="text-align:right;color:rgba(167,139,250,.5);font-size:.68rem">'+dt+'</td>'+
      '</tr>';
    }).join('');
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
    var col=isPos?'#4ade80':'#f87171';
    var pts=vals.map(function(v,i){return tx(i)+','+ty(v);});
    var path='M '+pts.join(' L ');
    var fill=path+' L '+tx(vals.length-1)+','+(H-PY)+' L '+tx(0)+','+(H-PY)+' Z';
    var startY=ty(start);
    var fmtD=function(t){if(!t)return'';var d=new Date(t*1000);return(d.getMonth()+1)+'/'+(d.getDate());};
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
      var audVal=rate?'~A$'+Math.round(total/rate).toLocaleString():'—';
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

  function renderAll(d){
    if(!d||!d.account)return false;
    var eq=parseFloat(d.account.equity)||0;
    renderMetrics(d.account,d.history,d.audUsdRate);
    renderChart(d.history);
    renderTrades(d.orders,d.audUsdRate);
    renderMacro(d.macro);
    renderRisk(d.account,d.positions,d.macro);
    renderPositions(d.positions,eq,d.audUsdRate);
    renderOpenOrders(d.openOrders);
    return true;
  }

  // Render immediately from server-injected preload (no fetch, no delay).
  if(window.__MYRM_PRELOAD){
    try{
      var ok=renderAll(window.__MYRM_PRELOAD);
      window.__MYRM_PRELOAD=null;
      setStatus(ok?'✓ Loaded':'✗ Preload had no account data',ok?'#4ade80':'#f87171');
    }catch(pe){setStatus('✗ '+pe.message,'#f87171');setAll('Render error: '+pe.message);}
  } else {
    // No server preload — load from API immediately (no delay).
    setStatus('Fetching from Alpaca API…');
    loadAnalytics();
  }

  // Intercept window._currentTab (set by switchTab in the dashboard) to reload when Analytics opens.
  var _ctVal=window._currentTab;
  try{
    Object.defineProperty(window,'_currentTab',{configurable:true,
      get:function(){return _ctVal;},
      set:function(v){
        _ctVal=v;
        if(v==='analytics'&&!loading){setTimeout(loadAnalytics,20);}
      }
    });
  }catch(e){
    // Fallback: click listener
    document.addEventListener('click',function(ev){
      var t=ev.target;
      while(t&&t!==document){
        if(t.getAttribute&&t.getAttribute('data-tab')==='analytics'){if(!loading)setTimeout(loadAnalytics,30);break;}
        t=t.parentElement;
      }
    },true);
  }

  // Refresh button + programmatic access
  window.myrmLoadAnalytics = loadAnalytics;
  window.myrmRefreshAnalytics = function(){ loading=false; loadAnalytics(); };
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
      var lbl=isU?'You':('Myrmidon'+(m.model?' · <span style="color:rgba(167,139,250,.45)">'+esc(m.model)+'</span>':''));
      return '<div style="display:flex;flex-direction:column;gap:.25rem;max-width:85%;align-self:'+(isU?'flex-end':'flex-start')+'">'+
        '<div style="font-family:monospace;font-size:.5rem;text-transform:uppercase;color:#666;'+(isU?'text-align:right':'')+'">'+lbl+'</div>'+
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
      msgs.push({role:'assistant',content:data.reply||('Error: '+(data.error||'Unknown')),model:data.model||''});
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

interface MqData { price: number; prev: number; change: number; changePct: number; }

async function dashYahooQuote(symbol: string): Promise<MqData | null> {
  try {
    const res = await fetch(
      `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=2d`,
      { headers: { "User-Agent": "Mozilla/5.0" }, cache: "no-store", signal: AbortSignal.timeout(5000) }
    );
    if (!res.ok) return null;
    const data = await res.json() as { chart?: { result?: Array<{ meta?: { regularMarketPrice?: number; previousClose?: number; chartPreviousClose?: number } }> } };
    const meta = data?.chart?.result?.[0]?.meta;
    if (!meta?.regularMarketPrice) return null;
    const price = meta.regularMarketPrice;
    const prev = meta.previousClose ?? meta.chartPreviousClose ?? price;
    return { price, prev, change: price - prev, changePct: prev > 0 ? ((price - prev) / prev) * 100 : 0 };
  } catch { return null; }
}

async function fetchTraderAnalytics(): Promise<Record<string, unknown> | null> {
  const apiKey = process.env.ALPACA_API_KEY;
  const apiSecret = process.env.ALPACA_API_SECRET;
  if (!apiKey || !apiSecret) return null;
  try {
    const h = { "APCA-API-KEY-ID": apiKey, "APCA-API-SECRET-KEY": apiSecret };
    const BASE = "https://paper-api.alpaca.markets/v2";
    const af = (url: string) => fetch(url, { headers: h, cache: "no-store", signal: AbortSignal.timeout(20000) });
    const [histRes, ordersRes, acctRes, posRes, openOrdRes] = await Promise.all([
      af(`${BASE}/account/portfolio/history?period=1M&timeframe=1D`),
      af(`${BASE}/orders?status=closed&limit=200&direction=desc`),
      af(`${BASE}/account`),
      af(`${BASE}/positions`),
      af(`${BASE}/orders?status=open&limit=20`),
    ]);
    if (!acctRes.ok) return null;
    const [history, orders, account, positions, openOrders] = await Promise.all([
      histRes.ok ? histRes.json() : null,
      ordersRes.ok ? ordersRes.json() : [],
      acctRes.json(),
      posRes.ok ? posRes.json() : [],
      openOrdRes.ok ? openOrdRes.json() : [],
    ]);
    const macro = await Promise.all(["AUDUSD=X", "^VIX", "^GSPC", "^IXIC", "^TNX", "GC=F", "CL=F", "BTC-USD"].map(dashYahooQuote));
    const [audUsd, vix, spx, nasdaq, treasury10y, gold, oil, btc] = macro;
    return { history, orders, account, positions, openOrders, audUsdRate: audUsd?.price ?? null, macro: { audUsd, vix, spx, nasdaq, treasury10y, gold, oil, btc } };
  } catch { return null; }
}

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
    // Server-side preload: fetch analytics data now so the page renders instantly.
    const hasKey = !!process.env.ALPACA_API_KEY;
    const hasSec = !!process.env.ALPACA_API_SECRET;
    const preload = await fetchTraderAnalytics();
    const preloadScript = preload
      ? `<script>window.__MYRM_PRELOAD=${JSON.stringify(preload)};</script>`
      : "";
    // Inject server-side status immediately (no JS async needed — text set synchronously).
    let srvStatus: string;
    if (!hasKey || !hasSec) {
      srvStatus = `SERVER: ALPACA_API_KEY ${hasKey ? "OK" : "MISSING"} | ALPACA_API_SECRET ${hasSec ? "OK" : "MISSING"} — add in Render → Environment`;
    } else if (preload) {
      srvStatus = `SERVER: keys OK, preloaded ${preload.account ? "account data" : "but account null — check key validity"}`;
    } else {
      srvStatus = `SERVER: keys set but Alpaca timed out — API unreachable from Render`;
    }
    const srvStatusScript = `<script>(function(){var e=document.getElementById('myrm-api-status');if(e)e.textContent=${JSON.stringify(srvStatus)};})();</script>`;
    html = html.replace("</body>", MYRMIDON_SCRIPT + "\n" + preloadScript + "\n" + srvStatusScript + "\n" + MYRMIDON_ANALYTICS_SCRIPT + "\n</body>");
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
