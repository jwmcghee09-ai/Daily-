import { NextResponse } from "next/server";
export const runtime = "nodejs";

const HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>SPECTRE Terminal</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
html,body{height:100%;overflow:hidden}
:root{
  --bg:#07070f;--bg2:#0d0d1a;--bg3:#111122;
  --vio:#a78bfa;--pink:#d946ef;--ora:#ff7a30;--amb:#ffb347;
  --grn:#4ade80;--red:#f87171;--cyn:#38bdf8;
  --bdr:rgba(167,139,250,.12);--bdr2:rgba(167,139,250,.2);
  --txt:#e2d9ff;--dim:rgba(167,139,250,.45);--dim2:rgba(167,139,250,.25);
}
body{background:var(--bg);color:var(--txt);font-family:'Courier New',monospace;font-size:12px;display:flex;flex-direction:column}

/* ── HEADER ── */
#hdr{background:linear-gradient(90deg,rgba(167,139,250,.12) 0%,rgba(217,70,239,.06) 100%);
  border-bottom:1px solid var(--bdr2);padding:5px 12px;
  display:flex;align-items:center;justify-content:space-between;flex-shrink:0}
#hdr-left{display:flex;align-items:center;gap:14px}
.logo{font-size:14px;font-weight:bold;letter-spacing:.18em;
  background:linear-gradient(90deg,#a78bfa,#d946ef,#ff7a30);
  -webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text}
.hbtn{color:var(--dim);font-size:10px;cursor:pointer;padding:2px 7px;
  border:1px solid var(--bdr);border-radius:3px;letter-spacing:.06em}
.hbtn:hover{border-color:var(--vio);color:var(--vio)}
#hdr-right{display:flex;align-items:center;gap:14px;font-size:11px}
#conn{color:var(--dim);font-size:10px;padding:2px 8px;border-radius:3px;border:1px solid var(--bdr)}
#clock{color:var(--vio);font-weight:bold;letter-spacing:.05em}
#acct-tag{color:var(--dim);font-size:10px}

/* ── METRICS ── */
#metrics{display:grid;grid-template-columns:repeat(5,1fr);border-bottom:1px solid var(--bdr);flex-shrink:0}
.mc{padding:6px 12px;border-right:1px solid var(--bdr)}
.mc:last-child{border-right:none}
.ml{font-size:9px;text-transform:uppercase;letter-spacing:.1em;color:var(--dim);margin-bottom:2px}
.mv{font-size:18px;font-weight:bold;color:var(--vio);line-height:1.1}
.ms{font-size:10px;color:var(--dim2);margin-top:1px}

/* ── RISK STRIP ── */
#risk-strip{display:flex;align-items:center;gap:6px;padding:4px 12px;
  border-bottom:1px solid var(--bdr);flex-shrink:0;flex-wrap:wrap;min-height:26px}
.risk-label{font-size:9px;text-transform:uppercase;letter-spacing:.1em;color:var(--dim);flex-shrink:0}
.sig{font-size:10px;padding:1px 8px;border-radius:3px;border:1px solid;white-space:nowrap}
.sig-red{color:#f87171;border-color:rgba(248,113,113,.3);background:rgba(248,113,113,.08)}
.sig-amb{color:#fbbf24;border-color:rgba(251,191,36,.3);background:rgba(251,191,36,.08)}
.sig-grn{color:#4ade80;border-color:rgba(74,222,128,.3);background:rgba(74,222,128,.08)}
#risk-src{margin-left:auto;font-size:9px;color:var(--dim2);text-align:right}

/* ── MAIN 3-COLUMN ── */
#main{display:grid;grid-template-columns:280px 1fr 310px;flex:1;min-height:0}

/* ── LEFT PANEL ── */
#panel-l{border-right:1px solid var(--bdr);display:flex;flex-direction:column;min-height:0;overflow:hidden}

/* ── CENTER PANEL ── */
#panel-c{display:flex;flex-direction:column;min-height:0;border-right:1px solid var(--bdr);overflow:hidden}

/* ── RIGHT PANEL (chat) ── */
#panel-r{display:flex;flex-direction:column;min-height:0}

/* ── SECTION HEADERS ── */
.sh{background:var(--bg2);border-bottom:1px solid var(--bdr);padding:3px 10px;
  font-size:9px;letter-spacing:.12em;text-transform:uppercase;color:var(--vio);
  flex-shrink:0;display:flex;justify-content:space-between;align-items:center}
.sh-grn{color:var(--grn)!important}
.sh-dim{color:var(--dim)!important}
.sh-note{color:var(--dim2);font-size:8px;font-weight:normal;letter-spacing:0;text-transform:none}

/* ── ALLOC BARS ── */
#alloc-area{padding:8px 10px;flex-shrink:0;border-bottom:1px solid var(--bdr)}
.abar-row{display:flex;align-items:center;gap:6px;margin-bottom:5px}
.abar-sym{width:36px;color:var(--txt);font-size:10px}
.abar-track{flex:1;height:7px;background:rgba(167,139,250,.1);border-radius:2px;overflow:hidden;position:relative}
.abar-fill{height:100%;border-radius:2px;transition:width .5s}
.abar-actual{position:absolute;top:0;left:0;height:100%;background:var(--vio);border-radius:2px}
.abar-target{position:absolute;top:0;height:100%;background:rgba(167,139,250,.2);border-radius:2px}
.abar-pct{width:90px;font-size:9px;color:var(--dim);white-space:nowrap}

/* ── POSITIONS ── */
#core-wrap{overflow-y:auto;flex-shrink:0;max-height:38%}
#alpha-wrap{flex:1;overflow-y:auto;min-height:0}

/* ── CHART ── */
#chart-area{flex:1;min-height:0;padding:6px 10px 4px;position:relative}
#chart-area svg{width:100%;height:100%;display:block}

/* ── ANALYTICS GRID ── */
#analytics{display:grid;grid-template-columns:repeat(3,1fr);gap:1px;background:var(--bdr);
  border-top:1px solid var(--bdr);border-bottom:1px solid var(--bdr);flex-shrink:0}
.acard{background:var(--bg2);padding:5px 10px}
.acard-l{font-size:9px;color:var(--dim);text-transform:uppercase;letter-spacing:.08em}
.acard-v{font-size:13px;font-weight:bold;color:var(--vio);margin-top:1px}

/* ── TRADES ── */
#trades-area{flex-shrink:0;height:170px;overflow-y:auto;border-top:1px solid var(--bdr)}

/* ── CHAT ── */
#chat-msgs{flex:1;overflow-y:auto;min-height:0;padding:8px;display:flex;flex-direction:column;gap:5px}
.cmsg-u,.cmsg-a{max-width:96%;padding:6px 9px;border-radius:6px;font-size:11px;white-space:pre-wrap;word-break:break-word;line-height:1.5}
.cmsg-u{align-self:flex-end;background:rgba(167,139,250,.1);border:1px solid var(--bdr2);color:var(--txt)}
.cmsg-a{align-self:flex-start;background:var(--bg2);border:1px solid var(--bdr);color:var(--txt)}
.cmsg-sys{color:var(--dim2);font-size:10px;text-align:center;padding:2px 0;font-style:italic}
#chat-think{color:var(--vio);font-size:10px;padding:3px 8px;font-style:italic;display:none;animation:pulse 1.2s ease-in-out infinite}
@keyframes pulse{0%,100%{opacity:.4}50%{opacity:1}}
#chat-row{display:flex;gap:4px;padding:6px;border-top:1px solid var(--bdr);flex-shrink:0}
#chat-in{flex:1;background:var(--bg2);border:1px solid var(--bdr);border-radius:4px;
  color:var(--txt);font-family:'Courier New',monospace;font-size:11px;
  padding:5px 8px;resize:none;min-height:34px;max-height:80px;outline:none}
#chat-in:focus{border-color:var(--vio)}
#chat-send{background:rgba(167,139,250,.12);border:1px solid var(--bdr2);border-radius:4px;
  color:var(--vio);font-family:'Courier New',monospace;font-size:9px;letter-spacing:.08em;
  text-transform:uppercase;padding:5px 10px;cursor:pointer;align-self:flex-end}
#chat-send:hover{background:rgba(167,139,250,.2);border-color:var(--vio)}
#chat-send:disabled{opacity:.35;cursor:default}

/* ── STRATEGY PANEL ── */
#strat-panel{background:var(--bg2);border-bottom:1px solid var(--bdr);padding:8px 10px;flex-shrink:0}
.sp-title{font-size:9px;text-transform:uppercase;letter-spacing:.1em;color:var(--vio);margin-bottom:5px}
.sp-rule{font-size:10px;color:var(--dim);line-height:1.6;padding:1px 0}
.sp-rule span{color:var(--txt)}
#strat-memory{margin-top:6px;padding-top:6px;border-top:1px solid var(--bdr);
  font-size:10px;color:var(--dim);line-height:1.6;font-style:italic}

/* ── FOOTER ── */
#footer{background:var(--bg);border-top:1px solid var(--bdr);padding:3px 12px;
  display:flex;justify-content:space-between;font-size:9px;color:var(--dim2);flex-shrink:0}
.src{display:flex;gap:10px}
.src-item::before{content:'● ';color:var(--dim2)}

/* ── TABLES ── */
table{width:100%;border-collapse:collapse;font-size:11px}
th{padding:3px 7px;text-align:left;font-size:8px;text-transform:uppercase;letter-spacing:.08em;
   color:var(--dim2);border-bottom:1px solid var(--bdr);position:sticky;top:0;background:var(--bg)}
td{padding:3px 7px;border-bottom:1px solid rgba(167,139,250,.05);vertical-align:middle}
tr:hover td{background:rgba(167,139,250,.04)}

/* ── SCROLLBAR ── */
::-webkit-scrollbar{width:4px}
::-webkit-scrollbar-track{background:var(--bg)}
::-webkit-scrollbar-thumb{background:var(--bdr2);border-radius:2px}

.ph{padding:12px;color:var(--dim2);font-size:10px;text-align:center;font-style:italic}
.pos{color:var(--grn)}.neg{color:var(--red)}.vio{color:var(--vio)}.cyn{color:var(--cyn)}.ora{color:var(--ora)}
</style>
</head>
<body>

<!-- HEADER -->
<div id="hdr">
  <div id="hdr-left">
    <span class="logo">◈ SPECTRE</span>
    <span style="color:var(--dim);font-size:10px">MYRMIDON TRADING TERMINAL</span>
    <span class="hbtn" onclick="doRefresh()">↺ Refresh [F2]</span>
    <span class="hbtn" onclick="toggleStrat()">☰ Strategy [F3]</span>
    <span class="hbtn" onclick="focusChat()">⌨ Chat [F8]</span>
  </div>
  <div id="hdr-right">
    <span id="acct-tag">—</span>
    <span id="conn" style="color:var(--dim)">CONNECTING</span>
    <span id="clock">UTC 00:00:00</span>
  </div>
</div>

<!-- METRICS -->
<div id="metrics">
  <div class="mc"><div class="ml">Portfolio Equity</div><div class="mv" id="m-eq">—</div><div class="ms" id="m-eq2">—</div></div>
  <div class="mc"><div class="ml">30-Day Return</div><div class="mv" id="m-ret">—</div><div class="ms" id="m-ret2">—</div></div>
  <div class="mc"><div class="ml">Cash (≥20% floor)</div><div class="mv" id="m-cash" style="color:var(--cyn)">—</div><div class="ms" id="m-cash2">—</div></div>
  <div class="mc"><div class="ml">Buying Power</div><div class="mv" id="m-bp">—</div><div class="ms" id="m-bp2">—</div></div>
  <div class="mc"><div class="ml">AUD/USD · Positions</div><div class="mv" id="m-fx" style="color:var(--cyn)">—</div><div class="ms" id="m-pos-ct">—</div></div>
</div>

<!-- RISK SIGNALS -->
<div id="risk-strip">
  <span class="risk-label">Risk Signals</span>
  <div id="risk-sigs"><span class="sig sig-grn">Scanning…</span></div>
  <span id="risk-src">Data: Alpaca Paper API · Yahoo Finance · Groq LLaMA-3.3</span>
</div>

<!-- MAIN 3-COL -->
<div id="main">

  <!-- LEFT: Strategy + Allocation + Positions -->
  <div id="panel-l">
    <div class="sh">◈ Portfolio Strategy <span class="sh-note" id="strat-toggle-hint">click ☰ Strategy to expand</span></div>
    <div id="strat-panel" style="display:none">
      <div class="sp-title">SPECTRE · Myrmidon Rules</div>
      <div class="sp-rule">Core sleeve <span>(70%)</span>: SPY <span>40%</span> · QQQ <span>20%</span> · VEA <span>15%</span></div>
      <div class="sp-rule">Rebalance if <span>&gt;5% off target</span></div>
      <div class="sp-rule">Satellite sleeve <span>(30%)</span>: max <span>10%</span> per position</div>
      <div class="sp-rule">Cash floor <span>≥20%</span> always maintained</div>
      <div class="sp-rule">Stop-loss: cut at <span style="color:var(--red)">−15% unrealised P&L</span></div>
      <div class="sp-rule">Never chase up <span style="color:var(--red)">&gt;30% in 2 weeks</span></div>
      <div id="strat-memory"><em id="strat-mem-txt">No strategy memory saved yet.</em></div>
    </div>

    <div class="sh">◈ Target vs Actual Allocation</div>
    <div id="alloc-area">
      <div class="abar-row"><span class="abar-sym">SPY</span><div class="abar-track"><div class="abar-target" id="at-spy-t"></div><div class="abar-actual" id="at-spy-a"></div></div><span class="abar-pct" id="at-spy-l">—</span></div>
      <div class="abar-row"><span class="abar-sym">QQQ</span><div class="abar-track"><div class="abar-target" id="at-qqq-t"></div><div class="abar-actual" id="at-qqq-a"></div></div><span class="abar-pct" id="at-qqq-l">—</span></div>
      <div class="abar-row"><span class="abar-sym">VEA</span><div class="abar-track"><div class="abar-target" id="at-vea-t"></div><div class="abar-actual" id="at-vea-a"></div></div><span class="abar-pct" id="at-vea-l">—</span></div>
      <div class="abar-row"><span class="abar-sym" style="color:var(--cyn)">Cash</span><div class="abar-track"><div class="abar-actual" id="at-cash-a" style="background:var(--cyn)"></div></div><span class="abar-pct" id="at-cash-l">—</span></div>
      <div class="abar-row"><span class="abar-sym" style="color:var(--grn)">Alpha</span><div class="abar-track"><div class="abar-actual" id="at-alpha-a" style="background:var(--grn)"></div></div><span class="abar-pct" id="at-alpha-l">—</span></div>
    </div>

    <div class="sh">◈ Core · Index Sleeve <span class="sh-note" id="core-pct-note"></span></div>
    <div id="core-wrap"><div class="ph">Loading…</div></div>
    <div class="sh sh-grn">◈ Alpha · Satellite Sleeve <span class="sh-note" id="alpha-pct-note"></span></div>
    <div id="alpha-wrap"><div class="ph">Loading…</div></div>
  </div>

  <!-- CENTER: Chart + Analytics + Trades -->
  <div id="panel-c">
    <div class="sh">◈ 30-Day Equity Curve <span class="sh-note" id="curve-range"></span></div>
    <div id="chart-area">
      <svg id="chart" preserveAspectRatio="none">
        <text x="50%" y="50%" text-anchor="middle" fill="rgba(167,139,250,.15)" font-size="11" font-family="monospace">Loading…</text>
      </svg>
    </div>
    <div id="analytics">
      <div class="acard"><div class="acard-l">Max Drawdown</div><div class="acard-v" id="an-dd">—</div></div>
      <div class="acard"><div class="acard-l">Win Rate</div><div class="acard-v" id="an-wr">—</div></div>
      <div class="acard"><div class="acard-l">Avg Trade $</div><div class="acard-v" id="an-avt">—</div></div>
      <div class="acard"><div class="acard-l">Largest Position</div><div class="acard-v" id="an-top">—</div></div>
      <div class="acard"><div class="acard-l">Total Invested</div><div class="acard-v" id="an-inv">—</div></div>
      <div class="acard"><div class="acard-l">Open Orders</div><div class="acard-v" id="an-ord" style="color:var(--ora)">—</div></div>
    </div>
    <div id="trades-area">
      <div class="sh">◈ Recent Filled Trades</div>
      <table><thead><tr>
        <th>Symbol</th><th>Side</th><th style="text-align:right">Qty</th>
        <th style="text-align:right">Fill $</th><th style="text-align:right">Total USD</th>
        <th style="text-align:right">≈AUD</th><th style="text-align:right">Date</th>
      </tr></thead>
      <tbody id="trades-tb"><tr><td colspan="7" class="ph">Loading…</td></tr></tbody>
      </table>
    </div>
  </div>

  <!-- RIGHT: Myrmidon Chat -->
  <div id="panel-r">
    <div class="sh">◈ Myrmidon · Groq LLaMA-3.3-70B
      <span class="sh-note">Full Alpaca tool access</span>
    </div>
    <div id="chat-msgs">
      <div class="cmsg-sys">Ask Myrmidon anything — it can check live positions, quotes, place orders, analyse the portfolio…</div>
    </div>
    <div id="chat-think">Myrmidon is thinking…</div>
    <div id="chat-row">
      <textarea id="chat-in" rows="1" placeholder="Ask Myrmidon…" onkeydown="chatKey(event)"></textarea>
      <button id="chat-send" onclick="chatSend()">Send</button>
    </div>
  </div>
</div>

<!-- FOOTER -->
<div id="footer">
  <div class="src">
    <span class="src-item">Alpaca Paper API (positions · orders · history)</span>
    <span class="src-item">Yahoo Finance (AUD/USD rate)</span>
    <span class="src-item">Groq Cloud · LLaMA-3.3-70B (AI chat)</span>
  </div>
  <div id="st-ts">—</div>
</div>

<script>
(function(){
  function $(id){return document.getElementById(id)}

  // clock
  (function tick(){
    var n=new Date(),p=function(x){return String(x).padStart(2,'0')};
    $('clock').textContent='UTC '+p(n.getUTCHours())+':'+p(n.getUTCMinutes())+':'+p(n.getUTCSeconds());
    setTimeout(tick,1000);
  })();

  // helpers
  function usd(n,dec){if(n==null||isNaN(parseFloat(n)))return'—';var v=Math.round(n);return'$'+(dec?parseFloat(n).toFixed(dec):v.toLocaleString());}
  function pct(n,sign){if(n==null)return'—';return(n>=0&&sign?'+':'')+parseFloat(n).toFixed(2)+'%';}
  function aud(n,r){return r&&n!=null?'~$'+Math.round(n/r).toLocaleString()+' AUD':'—';}
  function esc(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}

  function setConn(msg,ok){
    var el=$('conn');el.textContent=msg;
    el.style.color=ok===true?'#4ade80':ok===false?'#f87171':'rgba(167,139,250,.45)';
    el.style.borderColor=ok===true?'rgba(74,222,128,.3)':ok===false?'rgba(248,113,113,.3)':'rgba(167,139,250,.12)';
  }

  // classification
  var CORE={SPY:.40,QQQ:.20,VEA:.15};
  var ETFS={XLE:1,XLF:1,XLV:1,XLI:1,XLY:1,XLP:1,XLU:1,XLB:1,XLRE:1,XLK:1,IWM:1,VTI:1,IVV:1,GLD:1,TLT:1,BND:1,AGG:1,VNQ:1,EFA:1,EEM:1,VWO:1,VO:1,VB:1,SCHD:1,JEPI:1,JEPQ:1,DIA:1};
  function isCore(sym){return !!(CORE[sym]||ETFS[sym]);}

  // ── METRICS ──
  function renderMetrics(acct,hist,rate,positions){
    var eq=parseFloat(acct.equity)||0,cash=parseFloat(acct.cash)||0,bp=parseFloat(acct.buying_power)||0;
    $('m-eq').textContent=usd(eq);$('m-eq2').textContent=aud(eq,rate);
    $('acct-tag').textContent='ACCT #'+acct.account_number+' · PAPER';
    var retUsd=0,retPct=0;
    if(hist&&hist.equity){var v=hist.equity.filter(function(x){return x!=null&&x>0;});if(v.length>1){var s0=v[0];retUsd=eq-s0;retPct=s0>0?(retUsd/s0)*100:0;}}
    $('m-ret').textContent=pct(retPct,true);$('m-ret').className='mv '+(retPct>=0?'pos':'neg');
    $('m-ret2').textContent=(retUsd>=0?'+':'-')+usd(Math.abs(retUsd))+' USD';
    var cashPct=eq>0?cash/eq*100:0;
    $('m-cash').textContent=usd(cash);
    $('m-cash').style.color=cashPct<20?'#f87171':cashPct<25?'#fbbf24':'var(--cyn)';
    $('m-cash2').textContent=cashPct.toFixed(1)+'% of equity';
    $('m-bp').textContent=usd(bp);$('m-bp2').textContent=aud(bp,rate);
    $('m-fx').textContent=rate?rate.toFixed(4):'—';
    $('m-pos-ct').textContent=(positions&&positions.length||0)+' positions open';
  }

  // ── RISK SIGNALS ──
  function renderRisk(acct,positions){
    var eq=parseFloat(acct.equity)||0,cash=parseFloat(acct.cash)||0;
    var sigs=[];
    var cashPct=eq>0?cash/eq:0;
    if(cashPct<0.20)sigs.push({l:'red',m:'CASH '+( cashPct*100).toFixed(1)+'% — below 20% floor'});
    else if(cashPct<0.25)sigs.push({l:'amb',m:'Cash '+( cashPct*100).toFixed(1)+'% — near floor'});
    else sigs.push({l:'grn',m:'Cash OK ('+( cashPct*100).toFixed(1)+'%)'});
    (positions||[]).forEach(function(p){
      var mv=parseFloat(p.market_value)||0,plpc=parseFloat(p.unrealized_plpc)||0;
      var posPct=eq>0?mv/eq:0;
      if(posPct>0.10)sigs.push({l:'red',m:p.symbol+' '+(posPct*100).toFixed(1)+'% — exceeds 10% limit'});
      if(plpc<-0.15)sigs.push({l:'red',m:p.symbol+' '+pct(plpc*100,true)+' — stop-loss triggered'});
      else if(plpc<-0.12)sigs.push({l:'amb',m:p.symbol+' '+pct(plpc*100,true)+' — near stop-loss'});
    });
    // Check core targets
    var posBySymbol={};
    (positions||[]).forEach(function(p){posBySymbol[p.symbol]=parseFloat(p.market_value)||0;});
    ['SPY','QQQ','VEA'].forEach(function(sym){
      var target=CORE[sym];var actual=eq>0?(posBySymbol[sym]||0)/eq:0;
      var diff=Math.abs(actual-target);
      if(diff>0.08)sigs.push({l:'amb',m:sym+' '+( actual*100).toFixed(0)+'% vs '+( target*100)+'% target — rebalance needed'});
    });
    if(!sigs.length)sigs.push({l:'grn',m:'All signals clear'});
    $('risk-sigs').innerHTML=sigs.map(function(s){
      return'<span class="sig sig-'+s.l+'">'+s.m+'</span>';
    }).join('');
  }

  // ── ALLOCATION BARS ──
  function renderAlloc(positions,equity){
    var bySymbol={};
    (positions||[]).forEach(function(p){bySymbol[p.symbol]=parseFloat(p.market_value)||0;});
    var alphaMv=(positions||[]).filter(function(p){return!isCore(p.symbol);}).reduce(function(s,p){return s+(parseFloat(p.market_value)||0);},0);
    function setBar(sym,actual,target,labelEl,fillEl,tgtEl){
      var a=Math.min(actual*100,100),t=Math.min(target*100,100);
      if(fillEl){fillEl.style.width=a+'%';}
      if(tgtEl){tgtEl.style.width=t+'%';}
      var over=actual>target+0.05,under=actual<target-0.05;
      if(labelEl){
        labelEl.textContent=(actual*100).toFixed(1)+'% / '+(target*100).toFixed(0)+'% tgt';
        labelEl.style.color=over?'#fbbf24':under?'rgba(167,139,250,.4)':'#4ade80';
      }
    }
    var eq=equity||1;
    setBar('SPY',(bySymbol.SPY||0)/eq,0.40,$('at-spy-l'),$('at-spy-a'),$('at-spy-t'));
    setBar('QQQ',(bySymbol.QQQ||0)/eq,0.20,$('at-qqq-l'),$('at-qqq-a'),$('at-qqq-t'));
    setBar('VEA',(bySymbol.VEA||0)/eq,0.15,$('at-vea-l'),$('at-vea-a'),$('at-vea-t'));
    // Cash bar (target 20%)
    var cashPct=parseFloat(document.getElementById('m-cash2').textContent)||0;
    var cashActual=cashPct/100;
    $('at-cash-a').style.width=Math.min(cashPct,100)+'%';
    $('at-cash-l').textContent=cashPct.toFixed(1)+'% / 20% min';
    $('at-cash-l').style.color=cashActual<0.20?'#f87171':cashActual<0.25?'#fbbf24':'#38bdf8';
    // Alpha bar (target 30%)
    var alphaPct=eq>0?(alphaMv/eq)*100:0;
    $('at-alpha-a').style.width=Math.min(alphaPct,100)+'%';
    $('at-alpha-l').textContent=alphaPct.toFixed(1)+'% / 30% tgt';
    $('at-alpha-l').style.color=alphaPct>30?'#fbbf24':'#4ade80';
  }

  // ── POSITIONS ──
  function posRow(p,isAlpha){
    var unrl=parseFloat(p.unrealized_pl)||0,plpc=parseFloat(p.unrealized_plpc)||0;
    var mv=parseFloat(p.market_value)||0,qty=parseFloat(p.qty)||0,price=parseFloat(p.current_price)||0;
    var c=unrl>=0?'pos':'neg';
    return'<tr><td style="font-weight:bold;color:'+(isAlpha?'var(--grn)':'var(--vio)')+'">'+p.symbol+'</td>'+
      '<td style="text-align:right;color:rgba(167,139,250,.4);font-size:10px">'+qty.toFixed(qty%1?4:0)+'</td>'+
      '<td style="text-align:right;color:var(--cyn)">'+usd(price,2)+'</td>'+
      '<td style="text-align:right">'+usd(mv)+'</td>'+
      '<td class="'+c+'" style="text-align:right">'+(unrl>=0?'+':'-')+usd(Math.abs(unrl))+'</td>'+
      '<td class="'+c+'" style="text-align:right;font-size:10px">'+pct(plpc*100,true)+'</td></tr>';
  }
  var PHEAD='<table><thead><tr><th>Sym</th><th style="text-align:right">Qty</th><th style="text-align:right">Price</th><th style="text-align:right">Mkt Val</th><th style="text-align:right">P&L</th><th style="text-align:right">%</th></tr></thead><tbody>';

  function renderPositions(positions,equity){
    var core=[],alpha=[];
    (positions||[]).forEach(function(p){(isCore(p.symbol)?core:alpha).push(p);});
    var coreMv=core.reduce(function(s,p){return s+(parseFloat(p.market_value)||0);},0);
    var alphaMv=alpha.reduce(function(s,p){return s+(parseFloat(p.market_value)||0);},0);
    $('core-pct-note').textContent=equity>0?(coreMv/equity*100).toFixed(1)+'% of equity · target 70%':'';
    $('alpha-pct-note').textContent=equity>0?(alphaMv/equity*100).toFixed(1)+'% of equity · target 30%':'';
    $('core-wrap').innerHTML=core.length?PHEAD+core.map(function(p){return posRow(p,false);}).join('')+'</tbody></table>':'<div class="ph">No core ETF positions yet</div>';
    $('alpha-wrap').innerHTML=alpha.length?PHEAD+alpha.map(function(p){return posRow(p,true);}).join('')+'</tbody></table>':'<div class="ph" style="color:rgba(74,222,128,.3)">No alpha picks yet · satellite sleeve available</div>';
  }

  // ── EQUITY CHART ──
  function renderChart(hist){
    var svg=$('chart');
    if(!hist||!hist.equity){svg.innerHTML='<text x="50%" y="50%" text-anchor="middle" fill="rgba(167,139,250,.15)" font-size="11" font-family="monospace">No history data</text>';return;}
    var raw=hist.equity,ts=hist.timestamp||[],vals=[],tss=[];
    for(var i=0;i<raw.length;i++){if(raw[i]!=null&&raw[i]>0){vals.push(raw[i]);tss.push(ts[i]||0);}}
    if(vals.length<2){svg.innerHTML='<text x="50%" y="50%" text-anchor="middle" fill="rgba(167,139,250,.15)" font-size="11" font-family="monospace">Insufficient data</text>';return;}
    var W=900,H=200,PX=10,PY=22;
    var lo=Math.min.apply(null,vals)*.999,hi=Math.max.apply(null,vals)*1.001,rng=hi-lo;
    var tx=function(i){return PX+(i/(vals.length-1))*(W-PX*2);};
    var ty=function(v){return H-PY-((v-lo)/rng)*(H-PY*2);};
    var start=vals[0],end=vals[vals.length-1],up=end>=start;
    var lc=up?'#4ade80':'#f87171';
    var grid='';
    for(var g=0;g<=3;g++){var gv=lo+(rng*g/3),gy=ty(gv);
      grid+='<line x1="'+PX+'" y1="'+gy+'" x2="'+(W-PX)+'" y2="'+gy+'" stroke="rgba(167,139,250,.06)" stroke-width="1"/>';
      grid+='<text x="'+(W-PX+3)+'" y="'+(gy+3)+'" font-size="7" fill="rgba(167,139,250,.2)" font-family="monospace">$'+Math.round(gv/1000)+'K</text>';}
    var pts=vals.map(function(v,i){return tx(i)+','+ty(v);}).join(' L ');
    var path='M '+pts,fill=path+' L '+tx(vals.length-1)+','+(H-PY)+' L '+PX+','+(H-PY)+' Z';
    var fmtd=function(u){if(!u)return'';var d=new Date(u*1000);return(d.getMonth()+1)+'/'+(d.getDate());};
    $('curve-range').textContent=fmtd(tss[0])+' → '+fmtd(tss[tss.length-1]);
    svg.setAttribute('viewBox','0 0 '+W+' '+H);
    svg.innerHTML=grid+
      '<defs><linearGradient id="gr" x1="0" y1="0" x2="0" y2="1">'+
      '<stop offset="0%" stop-color="'+lc+'" stop-opacity="0.15"/>'+
      '<stop offset="100%" stop-color="'+lc+'" stop-opacity="0.01"/></linearGradient></defs>'+
      '<line x1="'+PX+'" y1="'+ty(start)+'" x2="'+(W-PX)+'" y2="'+ty(start)+'" stroke="rgba(167,139,250,.1)" stroke-width="1" stroke-dasharray="3,5"/>'+
      '<path d="'+fill+'" fill="url(#gr)"/>'+
      '<path d="'+path+'" fill="none" stroke="'+lc+'" stroke-width="1.5" stroke-linejoin="round"/>'+
      '<circle cx="'+tx(vals.length-1)+'" cy="'+ty(end)+'" r="3" fill="'+lc+'"/>'+
      '<text x="'+PX+'" y="'+(H-4)+'" font-size="8" fill="rgba(167,139,250,.25)" font-family="monospace">'+fmtd(tss[0])+'</text>'+
      '<text x="'+(W-PX)+'" y="'+(H-4)+'" font-size="8" fill="rgba(167,139,250,.25)" font-family="monospace" text-anchor="end">'+fmtd(tss[tss.length-1])+'</text>'+
      '<text x="'+(tx(vals.length-1)-6)+'" y="'+(ty(end)-7)+'" font-size="10" fill="'+lc+'" font-family="monospace" text-anchor="end">$'+Math.round(end).toLocaleString()+'</text>';
  }

  // ── ANALYTICS ──
  function renderAnalytics(hist,orders,positions,equity,openOrders){
    // Max drawdown
    var dd=0;if(hist&&hist.equity){var peak=0;hist.equity.forEach(function(v){if(v>peak)peak=v;if(peak>0)dd=Math.max(dd,(peak-v)/peak);});}
    $('an-dd').textContent=dd>0?'-'+(dd*100).toFixed(1)+'%':'—';
    $('an-dd').className='acard-v '+(dd>0.15?'neg':dd>0.10?'ora':'');
    // Win rate
    var filled=(orders||[]).filter(function(o){return o.status==='filled'&&o.filled_avg_price;});
    // Simple: buys that made money (need to match with sells - approximate by checking unrealised on current)
    $('an-wr').textContent=filled.length?filled.length+' trades':'—';
    // Avg trade size
    if(filled.length){var avg=filled.reduce(function(s,o){return s+(parseFloat(o.filled_avg_price)||0)*(parseFloat(o.filled_qty)||0);},0)/filled.length;$('an-avt').textContent=usd(avg);}
    // Largest position
    if(positions&&positions.length){
      var top=positions.reduce(function(a,b){return (parseFloat(a.market_value)||0)>(parseFloat(b.market_value)||0)?a:b;});
      var topPct=equity>0?(parseFloat(top.market_value)||0)/equity*100:0;
      $('an-top').textContent=top.symbol+' '+topPct.toFixed(1)+'%';
      $('an-top').className='acard-v '+(topPct>10?'neg':topPct>8?'ora':'vio');
    }
    // Total invested
    var invested=(positions||[]).reduce(function(s,p){return s+(parseFloat(p.market_value)||0);},0);
    $('an-inv').textContent=usd(invested);
    // Open orders
    $('an-ord').textContent=(openOrders&&openOrders.length?openOrders.length+' pending':'None');
  }

  // ── TRADES ──
  function renderTrades(orders,rate){
    var tb=$('trades-tb');
    var filled=(orders||[]).filter(function(o){return o.status==='filled'&&o.filled_avg_price;});
    if(!filled.length){tb.innerHTML='<tr><td colspan="7" class="ph">No filled trades yet</td></tr>';return;}
    tb.innerHTML=filled.slice(0,60).map(function(o){
      var buy=o.side==='buy',c=buy?'pos':'neg';
      var price=parseFloat(o.filled_avg_price)||0,qty=parseFloat(o.filled_qty)||parseFloat(o.qty)||0,total=price*qty;
      var dt=o.filled_at?new Date(o.filled_at).toLocaleString('en-AU',{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'}):'—';
      return'<tr><td style="font-weight:bold;color:var(--vio)">'+o.symbol+'</td>'+
        '<td class="'+c+'" style="font-weight:bold;font-size:10px">'+(buy?'▲ BUY':'▼ SELL')+'</td>'+
        '<td style="text-align:right;color:rgba(167,139,250,.5)">'+qty+'</td>'+
        '<td style="text-align:right;color:var(--cyn)">'+usd(price,2)+'</td>'+
        '<td style="text-align:right">'+usd(total)+'</td>'+
        '<td style="text-align:right;color:rgba(167,139,250,.35)">'+aud(total,rate)+'</td>'+
        '<td style="text-align:right;color:rgba(167,139,250,.25);font-size:10px">'+dt+'</td></tr>';
    }).join('');
  }

  // ── STRATEGY ──
  var stratOpen=false;
  window.toggleStrat=function(){
    stratOpen=!stratOpen;$('strat-panel').style.display=stratOpen?'block':'none';
  };
  function renderStrategy(memory){
    if(memory&&memory.strategy){
      $('strat-mem-txt').textContent=memory.strategy;
      if(memory.lessons&&memory.lessons.length){
        $('strat-mem-txt').textContent+='\n\nLessons:\n'+memory.lessons.slice(-4).map(function(l,i){return(i+1)+'. '+(typeof l==='string'?l:(l.lesson||''));}).join('\n');
      }
    }
  }

  // ── LOAD ──
  var loading=false;
  async function load(){
    if(loading)return;loading=true;
    setConn('Fetching…',null);
    try{
      var r=await fetch('/api/terminal',{headers:{'x-terminal-key':''},cache:'no-store'});
      var d=await r.json();
      if(!r.ok||!d.account){setConn('ERROR',false);loading=false;return;}
      var eq=parseFloat(d.account.equity)||0;
      renderMetrics(d.account,d.history,d.rate,d.positions);
      renderRisk(d.account,d.positions);
      renderAlloc(d.positions,eq);
      renderPositions(d.positions,eq);
      renderChart(d.history);
      renderAnalytics(d.history,d.orders,d.positions,eq,d.openOrders);
      renderTrades(d.orders,d.rate);
      renderStrategy(d.memory);
      setConn('CONNECTED',true);
      $('st-ts').textContent='Updated '+new Date().toLocaleTimeString('en-AU')+' · Auto-refresh 30s';
    }catch(e){setConn('ERROR',false);$('st-ts').textContent='Error: '+e.message;}
    loading=false;
  }
  window.doRefresh=function(){loading=false;load();};

  // ── CHAT ──
  var chatMsgs=[],chatBusy=false;
  function renderChat(){
    var box=$('chat-msgs');
    if(!chatMsgs.length){box.innerHTML='<div class="cmsg-sys">Ask Myrmidon anything…</div>';return;}
    box.innerHTML=chatMsgs.map(function(m){
      return m.role==='user'?'<div class="cmsg-u">'+esc(m.content)+'</div>':'<div class="cmsg-a">'+esc(m.content)+'</div>';
    }).join('');
    box.scrollTop=box.scrollHeight;
  }
  async function chatSend(){
    var inp=$('chat-in'),btn=$('chat-send'),think=$('chat-think');
    var text=inp.value.trim();if(!text||chatBusy)return;
    inp.value='';chatMsgs.push({role:'user',content:text});chatBusy=true;renderChat();
    think.style.display='block';btn.disabled=true;btn.textContent='…';
    try{
      var r=await fetch('/api/terminal/chat',{method:'POST',headers:{'Content-Type':'application/json','x-terminal-key':''},body:JSON.stringify({messages:chatMsgs})});
      var raw=await r.text();var data;
      try{data=JSON.parse(raw);}catch(e){data={reply:'Server error — check GROQ_API_KEY in .env.local'};}
      chatMsgs.push({role:'assistant',content:data.reply||(data.error?'Error: '+data.error:'No response.')});
    }catch(e){chatMsgs.push({role:'assistant',content:'Request failed: '+e.message});}
    finally{chatBusy=false;think.style.display='none';btn.disabled=false;btn.textContent='Send';renderChat();}
  }
  window.chatSend=chatSend;
  window.chatKey=function(e){if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();chatSend();}};
  window.focusChat=function(){var el=$('chat-in');if(el)el.focus();};

  // keyboard shortcuts
  document.addEventListener('keydown',function(e){
    if(e.key==='F2'){e.preventDefault();window.doRefresh();}
    if(e.key==='F3'){e.preventDefault();window.toggleStrat();}
    if(e.key==='F8'){e.preventDefault();window.focusChat();}
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
