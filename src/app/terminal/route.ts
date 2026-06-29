import { NextResponse } from "next/server";

export const runtime = "nodejs";

const HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>MYRMIDON TERMINAL</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
html,body{height:100%;overflow:hidden}
body{background:#000;color:#e8d5a0;font-family:'Courier New',Courier,monospace;font-size:13px;display:flex;flex-direction:column}

#topbar{background:#0f0900;border-bottom:2px solid #f90;padding:3px 10px;display:flex;align-items:center;gap:16px;font-size:11px;color:#666;flex-shrink:0}
.fkey{color:#000;background:#f90;padding:1px 5px;border-radius:2px;font-weight:bold;font-size:10px;cursor:pointer}
.fkey:hover{background:#ffb300}
.flabel{color:#888}
#topbar .right{margin-left:auto;display:flex;gap:16px;align-items:center}
#clock{color:#f90;font-size:12px;font-weight:bold;letter-spacing:.05em}
#conn{font-size:11px;color:#f90}

#titlebar{background:#f90;color:#000;padding:4px 10px;display:flex;justify-content:space-between;align-items:center;font-weight:bold;font-size:13px;letter-spacing:.06em;flex-shrink:0}

#metrics{display:grid;grid-template-columns:repeat(5,1fr);border-bottom:1px solid #1a1200;flex-shrink:0}
.mc{padding:4px 10px;border-right:1px solid #111}
.mc:last-child{border-right:none}
.ml{font-size:9px;text-transform:uppercase;color:#555;letter-spacing:.08em;margin-bottom:1px}
.mv{font-size:16px;font-weight:bold;color:#f90;line-height:1.1}
.ms{font-size:10px;color:#666;margin-top:1px}

/* strategy banner */
#strat-bar{background:#050300;border-bottom:1px solid #1a1200;padding:3px 10px;font-size:10px;color:#666;flex-shrink:0;display:flex;gap:12px;align-items:center;min-height:22px}
#strat-bar .strat-label{color:#f90;font-size:9px;text-transform:uppercase;letter-spacing:.1em;flex-shrink:0}
#strat-text{flex:1;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
#lessons-wrap{flex-shrink:0;color:#555;font-size:10px}

/* main area */
#main{display:grid;grid-template-columns:300px 1fr 320px;flex:1;min-height:0}

/* panels */
#left{border-right:1px solid #1a1200;display:flex;flex-direction:column;min-height:0;overflow:hidden}
#center{display:flex;flex-direction:column;min-height:0;border-right:1px solid #1a1200}
#chat-panel{display:flex;flex-direction:column;min-height:0}

.ph{background:#0a0600;border-bottom:1px solid #1a1200;padding:3px 8px;color:#f90;font-size:9px;letter-spacing:.12em;text-transform:uppercase;flex-shrink:0}

/* position buckets */
#core-wrap{overflow-y:auto;max-height:44%}
#alpha-wrap{flex:1;overflow-y:auto;min-height:0}

/* center: chart top, trades bottom */
#chart-area{flex:1;min-height:0;padding:6px 10px 4px;position:relative}
#chart-area svg{width:100%;height:100%;display:block}
#trades-area{flex-shrink:0;height:190px;overflow-y:auto;border-top:1px solid #1a1200}
#open-orders-area{flex-shrink:0;height:90px;overflow-y:auto;border-top:1px solid #1a1200}

/* chat */
#chat-msgs{flex:1;overflow-y:auto;min-height:0;padding:8px 8px 4px;display:flex;flex-direction:column;gap:6px}
.cmsg-u{align-self:flex-end;background:#1a0f00;border:1px solid #3a2500;border-radius:4px;padding:5px 8px;max-width:95%;font-size:11px;color:#e8d5a0;white-space:pre-wrap;word-break:break-word}
.cmsg-a{align-self:flex-start;background:#050300;border:1px solid #1a1200;border-radius:4px;padding:5px 8px;max-width:95%;font-size:11px;color:#e8d5a0;white-space:pre-wrap;word-break:break-word;line-height:1.5}
.cmsg-sys{color:#555;font-size:10px;text-align:center;padding:2px 0;font-style:italic}
#chat-input-row{display:flex;gap:4px;padding:6px;border-top:1px solid #1a1200;flex-shrink:0}
#chat-in{flex:1;background:#050300;border:1px solid #2a1e00;border-radius:3px;color:#e8d5a0;font-family:'Courier New',monospace;font-size:11px;padding:5px 7px;resize:none;min-height:34px;max-height:80px;overflow-y:auto;outline:none}
#chat-in:focus{border-color:#f90}
#chat-send{background:#1a0f00;border:1px solid #f90;border-radius:3px;color:#f90;font-family:'Courier New',monospace;font-size:9px;letter-spacing:.08em;text-transform:uppercase;padding:5px 10px;cursor:pointer;white-space:nowrap;align-self:flex-end}
#chat-send:hover{background:#2a1800}
#chat-send:disabled{opacity:.4;cursor:default}
/* tool badges */
.tbadge{display:inline-block;font-size:8px;padding:1px 5px;border-radius:2px;border:1px solid;font-family:'Courier New',monospace;white-space:nowrap;margin:0 2px 2px 0;vertical-align:middle}
.tbadge-calling{color:#f90;border-color:#3a2500;background:#0a0500;animation:tbp .9s ease-in-out infinite}
@keyframes tbp{0%,100%{opacity:1}50%{opacity:.4}}
.tbadge-done{color:#00e676;border-color:#003300;background:#010800}
/* log panel */
#log-panel{display:none;flex-direction:column;flex-shrink:0;border-top:2px solid #1a1200;height:210px}
#log-panel.lp-open{display:flex}
#log-content{flex:1;overflow-y:auto;padding:4px 8px;font-size:10px}
.log-row{border-bottom:1px solid #0a0700;padding:4px 0;cursor:pointer;line-height:1.4}
.log-row:hover{background:#050300}
.log-exp{display:none;font-size:9px;color:#666;white-space:pre-wrap;word-break:break-word;max-height:100px;overflow-y:auto;padding:4px 0;border-top:1px solid #0a0700;margin-top:3px;line-height:1.55}

/* tables */
table{width:100%;border-collapse:collapse;font-size:11px}
th{padding:3px 6px;text-align:left;font-size:9px;text-transform:uppercase;letter-spacing:.08em;color:#444;border-bottom:1px solid #111;position:sticky;top:0;background:#030200}
td{padding:3px 6px;border-bottom:1px solid #0a0700;vertical-align:middle}
tr:hover td{background:#0a0700}

#statusbar{background:#030200;border-top:1px solid #111;padding:3px 10px;display:flex;justify-content:space-between;font-size:10px;color:#444;flex-shrink:0}

/* macro ticker */
#macro-bar{background:#050300;border-bottom:1px solid #1a1200;padding:3px 10px;display:flex;gap:0;align-items:stretch;flex-shrink:0;overflow-x:auto;min-height:28px}
.mkt{display:flex;align-items:center;gap:5px;padding:0 10px;border-right:1px solid #1a1200;font-size:10px;white-space:nowrap}
.mkt:last-child{border-right:none}
.mkt-sym{color:#555;font-size:9px;letter-spacing:.08em;text-transform:uppercase}
.mkt-val{color:#e8d5a0;font-weight:bold}
.mkt-chg{font-size:9px}

/* risk signals */
#risk-bar{background:#030200;border-bottom:2px solid #1a1200;padding:3px 10px;display:flex;gap:5px;align-items:center;flex-shrink:0;flex-wrap:wrap;min-height:26px}
.risk-lbl{color:#333;font-size:9px;text-transform:uppercase;letter-spacing:.1em;flex-shrink:0}
.sig{font-size:9px;padding:1px 7px;border-radius:2px;white-space:nowrap;border:1px solid}
.sig-ok{color:#005500;border-color:#003300;background:#010800}
.sig-amb{color:#f90;border-color:#3a2500;background:#0a0500}
.sig-red{color:#ff4444;border-color:#3a0000;background:#0d0000;font-weight:bold}

.pos{color:#00e676}.neg{color:#ff4444}.amb{color:#f90}.cyn{color:#00bcd4}.dim{color:#444}
::-webkit-scrollbar{width:4px}::-webkit-scrollbar-track{background:#030200}::-webkit-scrollbar-thumb{background:#1a1200}
.placeholder{padding:12px;color:#222;font-size:11px;text-align:center}
</style>
</head>
<body>

<div id="topbar">
  <span class="fkey" onclick="doRefresh()">F2</span><span class="flabel">REFRESH</span>
  <span class="fkey" onclick="focusChat()">F8</span><span class="flabel">CHAT</span>
  <span class="fkey" onclick="toggleLog()">F9</span><span class="flabel">LOG</span>
  <div class="right">
    <span id="conn">CONNECTING…</span>
    <span id="clock">UTC 00:00:00</span>
  </div>
</div>

<div id="titlebar">
  <span>MYRMIDON // ALPACA PAPER TRADING TERMINAL</span>
  <span id="acct-num" style="font-size:11px;font-weight:normal;opacity:.7"></span>
</div>

<!-- MACRO TICKER -->
<div id="macro-bar">
  <div class="mkt"><span class="mkt-sym">VIX</span><span class="mkt-val" id="mk-vix">—</span><span class="mkt-chg" id="mk-vix-c"></span></div>
  <div class="mkt"><span class="mkt-sym">SPX</span><span class="mkt-val" id="mk-spx">—</span><span class="mkt-chg" id="mk-spx-c"></span></div>
  <div class="mkt"><span class="mkt-sym">NDX</span><span class="mkt-val" id="mk-ndx">—</span><span class="mkt-chg" id="mk-ndx-c"></span></div>
  <div class="mkt"><span class="mkt-sym">10Y</span><span class="mkt-val" id="mk-10y">—</span><span class="mkt-chg" id="mk-10y-c"></span></div>
  <div class="mkt"><span class="mkt-sym">Gold</span><span class="mkt-val" id="mk-gld">—</span><span class="mkt-chg" id="mk-gld-c"></span></div>
  <div class="mkt"><span class="mkt-sym">Oil</span><span class="mkt-val" id="mk-oil">—</span><span class="mkt-chg" id="mk-oil-c"></span></div>
  <div class="mkt"><span class="mkt-sym">BTC</span><span class="mkt-val" id="mk-btc">—</span><span class="mkt-chg" id="mk-btc-c"></span></div>
  <div class="mkt"><span class="mkt-sym">AUD/USD</span><span class="mkt-val" id="mk-aud">—</span><span class="mkt-chg" id="mk-aud-c"></span></div>
  <div class="mkt" style="margin-left:auto;border-right:none"><span id="mkt-status" style="font-size:9px;letter-spacing:.08em;color:#555">—</span></div>
</div>

<!-- RISK SIGNALS -->
<div id="risk-bar">
  <span class="risk-lbl">Risk</span>
  <span id="risk-sigs"><span class="sig sig-amb">SCANNING…</span></span>
</div>

<div id="metrics">
  <div class="mc"><div class="ml">Portfolio Equity</div><div class="mv" id="m-eq">—</div><div class="ms" id="m-eq2">—</div></div>
  <div class="mc"><div class="ml">30-Day Return</div><div class="mv" id="m-ret">—</div><div class="ms" id="m-ret2">—</div></div>
  <div class="mc"><div class="ml">Cash Available</div><div class="mv cyn" id="m-cash">—</div><div class="ms" id="m-cash2">—</div></div>
  <div class="mc"><div class="ml">Buying Power</div><div class="mv" id="m-bp">—</div><div class="ms" id="m-bp2">—</div></div>
  <div class="mc"><div class="ml">AUD/USD · Positions</div><div class="mv cyn" id="m-fx">—</div><div class="ms" id="m-pos-ct">—</div></div>
</div>

<div id="strat-bar" onclick="toggleStrat()" style="cursor:pointer">
  <span class="strat-label">▶ Strategy</span>
  <span id="strat-text">Click to expand…</span>
  <span id="lessons-wrap"></span>
</div>
<div id="strat-detail" style="display:none;background:#030200;border-bottom:1px solid #1a1200;padding:8px 10px;flex-shrink:0;font-size:11px;line-height:1.7;color:#888">
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:0 24px">
    <div>
      <div style="color:#f90;font-size:9px;text-transform:uppercase;letter-spacing:.1em;margin-bottom:4px">Portfolio Rules</div>
      <div>Core sleeve <span style="color:#e8d5a0">(70%)</span>: SPY 40% · QQQ 20% · VEA 15%</div>
      <div>Rebalance if <span style="color:#e8d5a0">&gt;5% off target</span></div>
      <div>Satellite sleeve <span style="color:#e8d5a0">(30%)</span>: active trades, max <span style="color:#e8d5a0">10% per position</span></div>
      <div>Always maintain <span style="color:#00e676">≥20% cash floor</span></div>
      <div>Stop-loss: cut at <span style="color:#ff4444">−15% unrealised P&amp;L</span></div>
      <div>Never chase a position up <span style="color:#ff4444">&gt;30% in 2 weeks</span></div>
    </div>
    <div>
      <div style="color:#f90;font-size:9px;text-transform:uppercase;letter-spacing:.1em;margin-bottom:4px">Active Strategy Memory</div>
      <div id="strat-memory-text" style="white-space:pre-wrap;color:#aaa">No strategy memory saved yet. Ask Myrmidon to "save strategy" after a session.</div>
      <div id="strat-lessons" style="margin-top:6px;color:#666"></div>
    </div>
  </div>
  <div style="margin-top:6px;color:#2a2000;font-size:9px;border-top:1px solid #0d0900;padding-top:4px">
    DATA SOURCES: Alpaca Paper Trading API (positions, orders, history) · Yahoo Finance (AUD/USD rate) · Groq LLaMA-3.3-70B (AI chat) · All prices USD
  </div>
</div>

<div id="main">
  <!-- LEFT: positions split into two buckets -->
  <div id="left">
    <div class="ph">■ CORE · INDEX SLEEVE <span style="float:right;color:#333;font-size:8px" id="core-pct"></span></div>
    <div id="core-wrap" style="border-bottom:1px solid #1a1200"><div class="placeholder">LOADING…</div></div>
    <div class="ph" style="background:#030a04;border-color:#003300;color:#00e676">■ ALPHA · SATELLITE SLEEVE <span style="float:right;color:#003300;font-size:8px" id="alpha-pct"></span></div>
    <div id="alpha-wrap" style="flex:1;overflow-y:auto;min-height:0"><div class="placeholder">LOADING…</div></div>
  </div>

  <!-- CENTER: chart + trades + open orders -->
  <div id="center">
    <div class="ph">■ 30-DAY EQUITY CURVE <span style="float:right;color:#333;font-size:8px" id="curve-range"></span></div>
    <div id="chart-area">
      <svg id="chart" preserveAspectRatio="none"><text x="50%" y="50%" text-anchor="middle" fill="#1a1200" font-size="12" font-family="monospace">LOADING…</text></svg>
    </div>
    <div id="trades-area">
      <div class="ph">■ RECENT FILLED TRADES</div>
      <table><thead><tr><th>Symbol</th><th>Side</th><th style="text-align:right">Qty</th><th style="text-align:right">Fill $</th><th style="text-align:right">Total USD</th><th style="text-align:right">≈ AUD</th><th style="text-align:right">Date</th></tr></thead>
      <tbody id="trades-tb"><tr><td colspan="7" class="placeholder">LOADING…</td></tr></tbody></table>
    </div>
    <div id="open-orders-area">
      <div class="ph">■ OPEN ORDERS</div>
      <table><thead><tr><th>Symbol</th><th>Side</th><th style="text-align:right">Qty</th><th>Type</th><th>Status</th><th style="text-align:right">Submitted</th></tr></thead>
      <tbody id="orders-tb"><tr><td colspan="6" class="placeholder">—</td></tr></tbody></table>
    </div>
  </div>

  <!-- RIGHT: Myrmidon chat -->
  <div id="chat-panel">
    <div class="ph">■ MYRMIDON · <span id="chat-model-lbl">LLAMA-3.1-8B</span> <span id="chat-model" style="float:right;color:#333;font-size:8px"></span></div>
    <div id="chat-msgs">
      <div class="cmsg-sys">Ask Myrmidon about positions, trades, market analysis…</div>
    </div>
    <div id="chat-input-row">
      <textarea id="chat-in" rows="1" placeholder="Ask Myrmidon…" onkeydown="chatKey(event)"></textarea>
      <button id="chat-send" onclick="chatSend()">Send</button>
    </div>
    <div id="log-panel">
      <div class="ph" style="font-size:8px">■ DECISION LOG <button onclick="loadLog(true)" style="float:right;background:none;border:none;cursor:pointer;color:#555;font-family:'Courier New',monospace;font-size:8px;text-transform:uppercase;letter-spacing:.05em">↺ REFRESH</button></div>
      <div id="log-content"><span style="color:#333;font-style:italic;font-size:10px">Loading…</span></div>
    </div>
  </div>
</div>

<div id="statusbar">
  <span id="st-msg">INITIALISING…</span>
  <span id="st-ts">—</span>
</div>

<script>
(function(){
  function $(id){return document.getElementById(id)}

  // clock
  function tick(){var n=new Date(),p=function(x){return String(x).padStart(2,'0')};$('clock').textContent='UTC '+p(n.getUTCHours())+':'+p(n.getUTCMinutes())+':'+p(n.getUTCSeconds());}
  tick();setInterval(tick,1000);

  // helpers
  function usd(n,dec){if(n==null||isNaN(parseFloat(n)))return'—';return'$'+(dec?parseFloat(n).toFixed(dec):Math.round(n).toLocaleString('en-US'));}
  function pct(n){if(n==null)return'—';return(n>=0?'+':'')+parseFloat(n).toFixed(2)+'%';}
  function aud(n,rate){return rate&&n!=null?'~$'+Math.round(n/rate).toLocaleString('en-AU')+' AUD':'—';}
  function esc(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}
  function conn(msg,ok){$('conn').textContent=msg;$('conn').style.color=ok===true?'#00e676':ok===false?'#ff4444':'#f90';}
  function status(msg){$('st-msg').textContent=msg;}
  function ts(){$('st-ts').textContent='Updated: '+new Date().toLocaleTimeString('en-AU')+' · Auto-refresh 30s';}

  // metrics
  function renderMetrics(acct,hist,rate,positions){
    var eq=parseFloat(acct.equity)||0,cash=parseFloat(acct.cash)||0,bp=parseFloat(acct.buying_power)||0;
    $('m-eq').textContent=usd(eq);$('m-eq2').textContent=aud(eq,rate);
    $('acct-num').textContent='ACCT #'+acct.account_number;
    var retUsd=0,retPct=0;
    if(hist&&hist.equity&&hist.equity.length>1){var vals=hist.equity.filter(function(v){return v!=null&&v>0;});if(vals.length>1){var s0=vals[0];retUsd=eq-s0;retPct=s0>0?(retUsd/s0)*100:0;}}
    var rc=retUsd>=0?'pos':'neg';
    $('m-ret').textContent=pct(retPct);$('m-ret').className='mv '+rc;
    $('m-ret2').textContent=(retUsd>=0?'+':'-')+usd(Math.abs(retUsd))+' USD';
    $('m-cash').textContent=usd(cash);
    $('m-cash2').textContent=eq>0?(cash/eq*100).toFixed(1)+'% of portfolio':'—';
    $('m-bp').textContent=usd(bp);$('m-bp2').textContent=aud(bp,rate);
    $('m-fx').textContent=rate?rate.toFixed(4):'unavailable';
    $('m-pos-ct').textContent=(positions&&positions.length||0)+' open position(s)';
  }

  // strategy
  var stratOpen=false;
  window.toggleStrat=function(){
    stratOpen=!stratOpen;
    $('strat-detail').style.display=stratOpen?'block':'none';
    $('strat-bar').querySelector('.strat-label').textContent=(stratOpen?'▼':'▶')+' Strategy';
  };
  function renderStrategy(memory){
    if(!memory||!memory.strategy){
      $('strat-text').textContent='Portfolio rules: SPY 40% · QQQ 20% · VEA 15% core · ≥20% cash · −15% stop-loss · Click to expand';
      return;
    }
    $('strat-text').textContent=memory.strategy.slice(0,200)+(memory.strategy.length>200?'…':'')+' — Click to expand';
    $('strat-memory-text').textContent=memory.strategy;
    if(memory.lessons&&memory.lessons.length){
      $('lessons-wrap').textContent='['+memory.lessons.length+' lesson'+(memory.lessons.length!==1?'s':'')+']';
      $('strat-lessons').innerHTML='<div style="color:#f90;font-size:9px;text-transform:uppercase;letter-spacing:.1em;margin-bottom:3px">Recent Lessons</div>'+
        memory.lessons.slice(-4).map(function(l,i){return'<div>'+(i+1)+'. '+esc(typeof l==='string'?l:(l.lesson||''))+'</div>';}).join('');
    }
  }

  // ── MACRO TICKER ──
  function renderMacro(macro){
    if(!macro)return;
    function mktSet(valId,chgId,q,fmt,unit){
      if(!q){document.getElementById(valId).textContent='—';return;}
      document.getElementById(valId).textContent=(fmt?q.price.toFixed(fmt):Math.round(q.price).toLocaleString())+(unit||'');
      var ce=document.getElementById(chgId);
      if(!ce)return;
      var up=q.changePct>=0;
      ce.textContent=(up?'▲':' ▼')+(Math.abs(q.changePct)).toFixed(2)+'%';
      ce.className='mkt-chg '+(up?'pos':'neg');
    }
    mktSet('mk-vix','mk-vix-c',macro.vix,2,'');
    mktSet('mk-spx','mk-spx-c',macro.spx,0,'');
    mktSet('mk-ndx','mk-ndx-c',macro.nasdaq,0,'');
    mktSet('mk-10y','mk-10y-c',macro.treasury10y,2,'%');
    mktSet('mk-gld','mk-gld-c',macro.gold,0,'');
    mktSet('mk-oil','mk-oil-c',macro.oil,2,'');
    mktSet('mk-btc','mk-btc-c',macro.btc,0,'');
    mktSet('mk-aud','mk-aud-c',macro.audUsd,4,'');
    // VIX color coding
    var vixEl=$('mk-vix');
    if(macro.vix){var v=macro.vix.price;vixEl.style.color=v>30?'#ff4444':v>20?'#f90':v>15?'#e8d5a0':'#00e676';}
    // 10Y color coding
    var t10El=$('mk-10y');
    if(macro.treasury10y){var t=macro.treasury10y.price;t10El.style.color=t>5.0?'#ff4444':t>4.5?'#f90':'#e8d5a0';}
    // Market status
    var now=new Date(),utcH=now.getUTCHours(),utcM=now.getUTCMinutes(),utcMin=utcH*60+utcM;
    var day=now.getUTCDay(); // 0=Sun, 6=Sat
    var mktEl=$('mkt-status');
    if(day===0||day===6){mktEl.textContent='MARKET CLOSED (WEEKEND)';mktEl.style.color='#555';}
    else if(utcMin>=13*60+30&&utcMin<20*60){mktEl.textContent='● MARKET OPEN (EST)';mktEl.style.color='#00e676';}
    else if(utcMin>=12*60&&utcMin<13*60+30){mktEl.textContent='PRE-MARKET';mktEl.style.color='#f90';}
    else if(utcMin>=20*60&&utcMin<20*60+30){mktEl.textContent='AFTER-HOURS';mktEl.style.color='#555';}
    else{mktEl.textContent='MARKET CLOSED';mktEl.style.color='#555';}
  }

  // ── RISK SIGNALS ──
  function renderRisk(acct,positions,macro){
    var eq=parseFloat(acct.equity)||0,cash=parseFloat(acct.cash)||0,bp=parseFloat(acct.buying_power)||0;
    var sigs=[];

    // 1. Cash floor
    var cashPct=eq>0?cash/eq:0;
    if(cashPct<0.20)sigs.push({c:'red',m:'CASH '+(cashPct*100).toFixed(1)+'% — BELOW 20% FLOOR'});
    else if(cashPct<0.25)sigs.push({c:'amb',m:'Cash '+(cashPct*100).toFixed(1)+'% — near floor'});
    else sigs.push({c:'ok',m:'Cash OK ('+(cashPct*100).toFixed(1)+'%)'});

    // 2. Stop-loss proximity
    var stopHit=false;
    (positions||[]).forEach(function(p){
      var plpc=parseFloat(p.unrealized_plpc)||0;
      if(plpc<-0.15){sigs.push({c:'red',m:p.symbol+' '+(plpc*100).toFixed(1)+'% — STOP-LOSS'});stopHit=true;}
      else if(plpc<-0.12)sigs.push({c:'amb',m:p.symbol+' '+(plpc*100).toFixed(1)+'% — near stop'});
    });

    // 3. Concentration >10%
    (positions||[]).forEach(function(p){
      var posPct=eq>0?(parseFloat(p.market_value)||0)/eq:0;
      if(posPct>0.10)sigs.push({c:'red',m:p.symbol+' '+(posPct*100).toFixed(1)+'% — exceeds 10% limit'});
    });

    // 4. Core target deviation
    var bySymbol={};
    (positions||[]).forEach(function(p){bySymbol[p.symbol]=parseFloat(p.market_value)||0;});
    var TARGETS={SPY:0.40,QQQ:0.20,VEA:0.15};
    Object.keys(TARGETS).forEach(function(sym){
      var target=TARGETS[sym],actual=eq>0?(bySymbol[sym]||0)/eq:0,diff=Math.abs(actual-target);
      if(diff>0.08)sigs.push({c:'amb',m:sym+' '+(actual*100).toFixed(0)+'% vs '+(target*100)+'% target'});
    });

    // 5. SPY+QQQ overlap (both core = US large-cap concentration)
    var spyPct=eq>0?(bySymbol.SPY||0)/eq:0;
    var qqqPct=eq>0?(bySymbol.QQQ||0)/eq:0;
    if(spyPct+qqqPct>0.65)sigs.push({c:'amb',m:'SPY+QQQ '+(( spyPct+qqqPct)*100).toFixed(0)+'% — US large-cap heavy'});

    // 6. Intraday portfolio P&L
    var dayPl=(positions||[]).reduce(function(s,p){return s+(parseFloat(p.unrealized_intraday_pl)||0);},0);
    var dayPct=eq>0?(dayPl/eq)*100:0;
    if(dayPct<-3)sigs.push({c:'red',m:'TODAY '+(dayPct).toFixed(2)+'% ('+( dayPl>=0?'+':'')+Math.round(dayPl).toLocaleString()+')'});
    else if(dayPct<-1)sigs.push({c:'amb',m:'TODAY '+(dayPct).toFixed(2)+'% ('+Math.round(dayPl).toLocaleString()+')'});
    else if(dayPct>0.5)sigs.push({c:'ok',m:'TODAY +'+(dayPct).toFixed(2)+'% (+'+Math.round(dayPl).toLocaleString()+')'});

    // 7. Buying power utilisation
    var invested=(positions||[]).reduce(function(s,p){return s+(parseFloat(p.market_value)||0);},0);
    var bpUtil=eq>0?invested/eq:0;
    if(bpUtil>0.90)sigs.push({c:'amb',m:'Invested '+(bpUtil*100).toFixed(0)+'% — very little room'});

    // 8. VIX regime (from macro)
    if(macro&&macro.vix){
      var v=macro.vix.price;
      if(v>30)sigs.push({c:'red',m:'VIX '+v.toFixed(1)+' — HIGH FEAR'});
      else if(v>20)sigs.push({c:'amb',m:'VIX '+v.toFixed(1)+' — elevated vol'});
      else sigs.push({c:'ok',m:'VIX '+v.toFixed(1)+' — calm'});
    }

    // 9. SPX direction today
    if(macro&&macro.spx){
      var spxChg=macro.spx.changePct;
      if(spxChg<-2)sigs.push({c:'red',m:'SPX '+(spxChg).toFixed(2)+'% TODAY — sell-off'});
      else if(spxChg<-1)sigs.push({c:'amb',m:'SPX '+(spxChg).toFixed(2)+'% today'});
    }

    // 10. 10Y yield
    if(macro&&macro.treasury10y){
      var t=macro.treasury10y.price;
      if(t>5.0)sigs.push({c:'red',m:'10Y '+t.toFixed(2)+'% — HIGH RATES'});
      else if(t>4.5)sigs.push({c:'amb',m:'10Y '+t.toFixed(2)+'% — elevated rates'});
    }

    if(!sigs.length)sigs.push({c:'ok',m:'All signals clear'});
    $('risk-sigs').innerHTML=sigs.map(function(s){
      return'<span class="sig sig-'+s.c+'">'+s.m+'</span>';
    }).join('');
  }

  // Core ETFs — anything else is alpha
  var CORE_ETFS={SPY:0.40,QQQ:0.20,VEA:0.15};
  var BROAD_ETFS={'IWM':1,'VTI':1,'IVV':1,'DIA':1,'GLD':1,'TLT':1,'BND':1,'AGG':1,
    'XLE':1,'XLF':1,'XLV':1,'XLI':1,'XLY':1,'XLP':1,'XLU':1,'XLB':1,'XLRE':1,'XLK':1,
    'VNQ':1,'EFA':1,'EEM':1,'VWO':1,'VO':1,'VB':1,'SCHD':1,'JEPI':1,'JEPQ':1};

  function posRow(p,colorClass){
    var unrl=parseFloat(p.unrealized_pl)||0,plpc=parseFloat(p.unrealized_plpc)||0;
    var mv=parseFloat(p.market_value)||0,qty=parseFloat(p.qty)||0,price=parseFloat(p.current_price)||0;
    var dayChg=parseFloat(p.change_today)||0; // fraction e.g. 0.0123 = 1.23%
    var dayPl=parseFloat(p.unrealized_intraday_pl)||0;
    var c=unrl>=0?'pos':'neg';
    var dc=dayChg>=0?'pos':'neg';
    var sym='<td class="'+(colorClass||'amb')+'" style="font-weight:bold">'+p.symbol+'</td>';
    return'<tr>'+sym+
      '<td style="text-align:right;color:#777;font-size:10px">'+qty.toFixed(qty%1?4:0)+'</td>'+
      '<td class="cyn" style="text-align:right">'+usd(price,2)+'</td>'+
      '<td style="text-align:right">'+usd(mv)+'</td>'+
      '<td class="'+dc+'" style="text-align:right;font-size:10px">'+(dayChg>=0?'+':'')+(dayChg*100).toFixed(2)+'%</td>'+
      '<td class="'+c+'" style="text-align:right;font-size:10px">'+(dayPl>=0?'+':'')+usd(dayPl)+'</td>'+
      '<td class="'+c+'" style="text-align:right;font-size:10px">'+pct(plpc*100)+'</td></tr>';
  }
  var POS_HEAD='<table><thead><tr><th>Sym</th><th style="text-align:right">Qty</th><th style="text-align:right">Price</th><th style="text-align:right">Mkt Val</th><th style="text-align:right">Day%</th><th style="text-align:right">Day P&L</th><th style="text-align:right">Total%</th></tr></thead><tbody>';

  function renderPositions(positions,equity){
    if(!positions){
      $('core-wrap').innerHTML='<div class="placeholder">—</div>';
      $('alpha-wrap').innerHTML='<div class="placeholder">—</div>';
      return;
    }
    var core=[],alpha=[];
    positions.forEach(function(p){
      if(CORE_ETFS[p.symbol]||BROAD_ETFS[p.symbol])core.push(p);else alpha.push(p);
    });
    var totalMv=positions.reduce(function(s,p){return s+(parseFloat(p.market_value)||0);},0);

    // Core bucket with target % indicators
    if(!core.length){
      $('core-wrap').innerHTML='<div class="placeholder dim">No core positions yet · SPY/QQQ/VEA targets unmet</div>';
    }else{
      var crows=core.map(function(p){
        var mv=parseFloat(p.market_value)||0;
        var actual=equity>0?(mv/equity*100):0;
        var target=CORE_ETFS[p.symbol]?CORE_ETFS[p.symbol]*100:null;
        var tgtStr=target?'<span style="color:#444;font-size:9px"> ('+actual.toFixed(0)+'%↔'+target+'%)</span>':'';
        return posRow(p,'amb')+tgtStr;
      }).join('');
      var coreMv=core.reduce(function(s,p){return s+(parseFloat(p.market_value)||0);},0);
      $('core-wrap').innerHTML=POS_HEAD+crows+'</tbody></table>';
      $('core-pct').textContent=equity>0?(coreMv/equity*100).toFixed(1)+'% of equity · target 70%':'';
    }

    // Alpha bucket
    if(!alpha.length){
      $('alpha-wrap').innerHTML='<div class="placeholder" style="color:#003300">No alpha positions · capital available for high-conviction picks</div>';
      $('alpha-pct').textContent='0% · target 30%';
    }else{
      var alphaMv=alpha.reduce(function(s,p){return s+(parseFloat(p.market_value)||0);},0);
      $('alpha-wrap').innerHTML=POS_HEAD+alpha.map(function(p){return posRow(p,'pos');}).join('')+'</tbody></table>';
      $('alpha-pct').textContent=equity>0?(alphaMv/equity*100).toFixed(1)+'% of equity · target 30%':'';
    }
  }

  // chart
  function renderChart(hist){
    var svg=$('chart');
    if(!hist||!hist.equity){svg.innerHTML='<text x="50%" y="50%" text-anchor="middle" fill="#1a1200" font-size="11" font-family="monospace">NO HISTORY DATA</text>';return;}
    var raw=hist.equity||[],ts=hist.timestamp||[],vals=[],tss=[];
    for(var i=0;i<raw.length;i++){if(raw[i]!=null&&raw[i]>0){vals.push(raw[i]);tss.push(ts[i]||0);}}
    if(vals.length<2){svg.innerHTML='<text x="50%" y="50%" text-anchor="middle" fill="#1a1200" font-size="11" font-family="monospace">INSUFFICIENT DATA</text>';return;}
    var W=900,H=200,PX=10,PY=22;
    var lo=Math.min.apply(null,vals)*0.999,hi=Math.max.apply(null,vals)*1.001,rng=hi-lo;
    var tx=function(i){return PX+(i/(vals.length-1))*(W-PX*2);};
    var ty=function(v){return H-PY-((v-lo)/rng)*(H-PY*2);};
    var start=vals[0],end=vals[vals.length-1],up=end>=start,lc=up?'#00e676':'#ff4444';
    var grid='';
    for(var g=0;g<=3;g++){var gv=lo+(rng*g/3),gy=ty(gv);grid+='<line x1="'+PX+'" y1="'+gy+'" x2="'+(W-PX)+'" y2="'+gy+'" stroke="#0d0900" stroke-width="1"/><text x="'+(W-PX+2)+'" y="'+(gy+3)+'" font-size="7" fill="#2a2000" font-family="monospace">$'+Math.round(gv/1000)+'K</text>';}
    var pts=vals.map(function(v,i){return tx(i)+','+ty(v);}).join(' L ');
    var path='M '+pts,fill=path+' L '+tx(vals.length-1)+','+(H-PY)+' L '+PX+','+(H-PY)+' Z';
    var fmtd=function(u){if(!u)return'';var d=new Date(u*1000);return(d.getMonth()+1)+'/'+(d.getDate());};
    $('curve-range').textContent=fmtd(tss[0])+' → '+fmtd(tss[tss.length-1]);
    svg.setAttribute('viewBox','0 0 '+W+' '+H);
    svg.innerHTML=grid+'<defs><linearGradient id="gr" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="'+lc+'" stop-opacity="0.1"/><stop offset="100%" stop-color="'+lc+'" stop-opacity="0.01"/></linearGradient></defs>'+
      '<line x1="'+PX+'" y1="'+ty(start)+'" x2="'+(W-PX)+'" y2="'+ty(start)+'" stroke="#1a1200" stroke-width="1" stroke-dasharray="3,4"/>'+
      '<path d="'+fill+'" fill="url(#gr)"/><path d="'+path+'" fill="none" stroke="'+lc+'" stroke-width="1.5" stroke-linejoin="round"/>'+
      '<circle cx="'+tx(vals.length-1)+'" cy="'+ty(end)+'" r="3" fill="'+lc+'"/>'+
      '<text x="'+PX+'" y="'+(H-4)+'" font-size="8" fill="#2a2000" font-family="monospace">'+fmtd(tss[0])+'</text>'+
      '<text x="'+(W-PX)+'" y="'+(H-4)+'" font-size="8" fill="#2a2000" font-family="monospace" text-anchor="end">'+fmtd(tss[tss.length-1])+'</text>'+
      '<text x="'+(tx(vals.length-1)-6)+'" y="'+(ty(end)-6)+'" font-size="10" fill="'+lc+'" font-family="monospace" text-anchor="end">$'+Math.round(end).toLocaleString()+'</text>';
  }

  // trades
  function renderTrades(orders,rate){
    var tb=$('trades-tb');
    var filled=(orders||[]).filter(function(o){return o.status==='filled'&&o.filled_avg_price;});
    if(!filled.length){tb.innerHTML='<tr><td colspan="7" class="placeholder">NO FILLED TRADES</td></tr>';return;}
    tb.innerHTML=filled.slice(0,80).map(function(o){
      var buy=o.side==='buy',sc=buy?'pos':'neg';
      var price=parseFloat(o.filled_avg_price)||0,qty=parseFloat(o.filled_qty)||parseFloat(o.qty)||0,total=price*qty;
      var dt=o.filled_at?new Date(o.filled_at).toLocaleString('en-AU',{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'}):'—';
      return'<tr><td class="amb" style="font-weight:bold">'+o.symbol+'</td><td class="'+sc+'" style="font-weight:bold;font-size:10px">'+(buy?'▲ BUY':'▼ SELL')+'</td>'+
        '<td style="text-align:right;color:#aaa">'+qty+'</td><td class="cyn" style="text-align:right">'+usd(price,2)+'</td>'+
        '<td style="text-align:right">'+usd(total)+'</td><td style="text-align:right;color:#555">'+aud(total,rate)+'</td>'+
        '<td style="text-align:right;color:#333;font-size:10px">'+dt+'</td></tr>';
    }).join('');
  }

  // open orders
  function renderOpenOrders(orders){
    var tb=$('orders-tb');
    if(!orders||!orders.length){tb.innerHTML='<tr><td colspan="6" class="placeholder">No open orders</td></tr>';return;}
    tb.innerHTML=orders.map(function(o){
      var buy=o.side==='buy',sc=buy?'pos':'neg';
      var dt=o.submitted_at?new Date(o.submitted_at).toLocaleString('en-AU',{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'}):'—';
      return'<tr><td class="amb" style="font-weight:bold">'+o.symbol+'</td><td class="'+sc+'" style="font-size:10px">'+(buy?'▲ BUY':'▼ SELL')+'</td>'+
        '<td style="text-align:right;color:#aaa">'+o.qty+'</td><td style="color:#555;font-size:10px">'+o.type+'</td>'+
        '<td style="color:#666;font-size:10px">'+o.status+'</td><td style="text-align:right;color:#333;font-size:10px">'+dt+'</td></tr>';
    }).join('');
  }

  // load data
  var loading=false;
  async function load(){
    if(loading)return;loading=true;
    conn('FETCHING…',null);status('REQUESTING DATA FROM ALPACA…');
    try{
      var r=await fetch('/api/terminal',{headers:{'x-terminal-key':''},cache:'no-store'});
      var d=await r.json();
      if(!r.ok){conn('ERROR',false);status('ERROR: '+(d.error||r.status));loading=false;return;}
      if(!d.account){conn('ERROR',false);status('ERROR: NO ACCOUNT DATA');loading=false;return;}
      var eq=parseFloat(d.account.equity)||0;
      renderMetrics(d.account,d.history,d.rate,d.positions);
      renderMacro(d.macro);
      renderRisk(d.account,d.positions||[],d.macro);
      renderStrategy(d.memory);
      renderPositions(d.positions,eq);
      renderChart(d.history);
      renderTrades(d.orders,d.rate);
      renderOpenOrders(d.openOrders);
      conn('CONNECTED',true);ts();
      var dayPl=(d.positions||[]).reduce(function(s,p){return s+(parseFloat(p.unrealized_intraday_pl)||0);},0);
      var dayStr=dayPl>=0?'+$'+Math.round(dayPl).toLocaleString():'-$'+Math.round(Math.abs(dayPl)).toLocaleString();
      status('$'+Math.round(eq).toLocaleString()+' USD equity · '+(d.positions&&d.positions.length||0)+' positions · TODAY '+dayStr+' · '+(d.openOrders&&d.openOrders.length||0)+' open orders');
    }catch(e){conn('ERROR',false);status('ERROR: '+e.message);}
    loading=false;
  }
  window.doRefresh=function(){loading=false;load();};

  // ── CHAT (SSE streaming) ─────────────────────────────────────────────────
  var chatMsgs=[],chatBusy=false;

  function chatSend(){
    var inp=$('chat-in'),btn=$('chat-send');
    if(!inp)return;
    var text=inp.value.trim();if(!text||chatBusy)return;
    inp.value='';chatBusy=true;btn.disabled=true;btn.textContent='…';
    chatMsgs.push({role:'user',content:text});

    var box=$('chat-msgs');
    var uDiv=document.createElement('div');uDiv.className='cmsg-u';uDiv.textContent=text;
    box.appendChild(uDiv);box.scrollTop=box.scrollHeight;

    var aWrap=document.createElement('div');aWrap.className='cmsg-a';
    var toolsDiv=document.createElement('div');toolsDiv.style.cssText='display:flex;flex-wrap:wrap;margin-bottom:3px';
    var textDiv=document.createElement('div');
    aWrap.appendChild(toolsDiv);aWrap.appendChild(textDiv);
    box.appendChild(aWrap);box.scrollTop=box.scrollHeight;

    var activeBadges={},streamedText='',done=false;

    function finalize(){
      if(done)return;done=true;
      chatBusy=false;btn.disabled=false;btn.textContent='Send';
      if(streamedText)chatMsgs.push({role:'assistant',content:streamedText});
    }

    fetch('/api/terminal/chat',{method:'POST',
      headers:{'Content-Type':'application/json','x-terminal-key':''},
      body:JSON.stringify({messages:chatMsgs})
    }).then(function(res){
      if(!res.body){textDiv.textContent='Error: no stream';finalize();return;}
      var reader=res.body.getReader(),dec=new TextDecoder(),buf='';
      function read(){
        reader.read().then(function(chunk){
          if(chunk.done){finalize();return;}
          buf+=dec.decode(chunk.value,{stream:true});
          var parts=buf.split('\n\n');buf=parts.pop()||'';
          parts.forEach(function(part){
            var line=part.trim();
            if(line.slice(0,5)!=='data:')return;
            var ev;try{ev=JSON.parse(line.slice(5).trim());}catch(e2){return;}
            if(ev.type==='tool_call'){
              var b=document.createElement('span');
              b.className='tbadge tbadge-calling';
              b.textContent=String(ev.name||'').replace(/_/g,' ');
              toolsDiv.appendChild(b);activeBadges[ev.name]=b;
            }else if(ev.type==='tool_result'){
              var ab=activeBadges[ev.name];
              if(ab){ab.className='tbadge tbadge-done';ab.title=String(ev.preview||'');}
            }else if(ev.type==='text_delta'){
              streamedText+=String(ev.delta||'');
              textDiv.textContent=streamedText;
              box.scrollTop=box.scrollHeight;
            }else if(ev.type==='status'){
              if(!streamedText)textDiv.innerHTML='<span style="color:#f90;font-size:10px;font-style:italic">'+esc(String(ev.message||''))+'</span>';
            }else if(ev.type==='done'){
              var mdl=String(ev.model||'').replace('llama-','').replace('-instant','').replace('-versatile','');
              $('chat-model').textContent=mdl;
              finalize();return;
            }else if(ev.type==='error'){
              textDiv.textContent='Error: '+String(ev.message||'unknown');
              finalize();return;
            }
          });
          read();
        }).catch(function(e3){textDiv.textContent='Stream error: '+String(e3&&e3.message||e3);finalize();});
      }
      read();
    }).catch(function(e4){
      var errDiv=document.createElement('div');errDiv.className='cmsg-a';
      errDiv.textContent='Network error: '+String(e4&&e4.message||e4);
      box.appendChild(errDiv);finalize();
    });
  }
  window.chatSend=chatSend;
  window.chatKey=function(e){if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();chatSend();}};
  window.focusChat=function(){var el=$('chat-in');if(el)el.focus();};

  // ── DECISION LOG ─────────────────────────────────────────────────────────
  var logLoaded=false,logData=[],logOpen=false;

  window.toggleLog=function(){
    logOpen=!logOpen;
    var panel=$('log-panel');
    if(logOpen){panel.classList.add('lp-open');if(!logLoaded)loadLog(false);}
    else panel.classList.remove('lp-open');
  };

  function loadLog(force){
    var content=$('log-content');if(!content)return;
    if(logLoaded&&!force)return;
    content.innerHTML='<span style="color:#333;font-style:italic;font-size:10px">Loading…</span>';
    fetch('/api/trading/decisions?limit=50')
      .then(function(r){return r.json();})
      .then(function(data){
        logLoaded=true;logData=data.decisions||[];
        if(!logData.length){
          content.innerHTML='<span style="color:#333;font-style:italic;font-size:10px">No decisions logged yet — chat with Myrmidon</span>';
          return;
        }
        content.innerHTML=logData.map(function(d,i){
          var tools=[];try{tools=JSON.parse(d.tool_calls||'[]');}catch(e5){}
          var toolNames=tools.map(function(t){return String(t.name||'').replace(/_/g,' ');}).join(', ')||'—';
          var dt=new Date(d.created_at).toLocaleString('en-AU',{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'});
          var eq=d.equity_usd?'$'+Math.round(parseFloat(d.equity_usd)).toLocaleString():'';
          var shortQ=String(d.user_message||'').slice(0,75)+(String(d.user_message||'').length>75?'…':'');
          return'<div class="log-row" onclick="toggleLogEntry(this,'+i+')" tabindex="0">'+
            '<span style="color:#444">'+esc(dt)+'</span> '+
            '<span style="color:#888">'+esc(shortQ)+'</span>'+
            (eq?'  <span style="color:#00e676">'+esc(eq)+'</span>':'')+
            '<div style="color:#333;font-size:9px">tools: '+esc(toolNames)+'</div>'+
            '<div class="log-exp"></div>'+
            '</div>';
        }).join('');
      })
      .catch(function(){content.innerHTML='<span style="color:#ff4444;font-size:10px">Failed to load — check session</span>';});
  }

  window.toggleLogEntry=function(row,i){
    var expEl=row.querySelector('.log-exp');if(!expEl)return;
    if(expEl.style.display==='block'){expEl.style.display='none';}
    else{var d=logData[i];expEl.style.display='block';expEl.textContent=d?d.ai_response||'(no response)':'?';}
  };
  window.loadLog=loadLog;

  // ── KEYBOARD ─────────────────────────────────────────────────────────────
  document.addEventListener('keydown',function(e){
    if(e.key==='F2'||(e.key==='r'&&e.ctrlKey)){e.preventDefault();window.doRefresh();}
    if(e.key==='F8'){e.preventDefault();window.focusChat();}
    if(e.key==='F9'){e.preventDefault();window.toggleLog();}
  });

  load();
  setInterval(function(){loading=false;load();},30000);
})();
</script>
</body>
</html>`;

export async function GET() {
  return new NextResponse(HTML, {
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
  });
}
