import { NextResponse } from "next/server";
export const runtime = "nodejs";

const HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>SPECTRE · Myrmidon Terminal</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=DM+Mono:wght@300;400;500&family=DM+Sans:opsz,wght@9..40,300;9..40,400;9..40,500;9..40,600&display=swap" rel="stylesheet">
<style>
*{box-sizing:border-box;margin:0;padding:0}
html,body{height:100%;overflow:hidden}
:root{
  /* SPECTRE brand palette */
  --purple:#7c4dff;
  --purple-hi:#9b6bff;
  --purple-lo:rgba(124,77,255,.12);
  --orange:#ff7a30;
  --orange-dk:#f97316;
  --amber:#ffb347;
  --green:#4ade80;
  --red:#f87171;
  --cyan:#38bdf8;
  /* surfaces */
  --bg:#06050f;
  --bg2:#0d0b1a;
  --bg3:#120f22;
  --bg4:#1a1630;
  /* borders */
  --bdr:rgba(124,77,255,.14);
  --bdr2:rgba(124,77,255,.24);
  /* text */
  --txt:#e8e4ff;
  --dim:rgba(232,228,255,.4);
  --dim2:rgba(232,228,255,.22);
  /* fonts */
  --mono:'DM Mono',monospace;
  --disp:'Space Grotesk',sans-serif;
  --sans:'DM Sans',sans-serif;
  --r:6px;
  --shadow:0 2px 12px rgba(124,77,255,.18);
}
body{
  background:var(--bg);color:var(--txt);
  font-family:var(--mono);font-size:12px;
  display:flex;flex-direction:column;
}
body::before{
  content:'';position:fixed;inset:0;pointer-events:none;z-index:0;
  background:
    radial-gradient(ellipse 60% 40% at 20% 0%,rgba(124,77,255,.22) 0%,transparent 70%),
    radial-gradient(ellipse 40% 30% at 80% 100%,rgba(217,70,239,.10) 0%,transparent 60%);
}

/* ── HEADER ── */
#hdr{
  position:relative;z-index:10;
  background:rgba(13,11,26,.94);
  backdrop-filter:blur(20px);
  border-bottom:1px solid var(--bdr2);
  padding:0 14px;
  display:flex;align-items:center;justify-content:space-between;
  height:44px;flex-shrink:0;
}
.logo{
  font-family:var(--disp);font-size:15px;font-weight:700;letter-spacing:.16em;
  background:linear-gradient(90deg,#a855f7 0%,#d946ef 38%,#ff7a30 72%,#ffb347 100%);
  background-size:200% auto;
  -webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;
  animation:brandSlide 4s linear infinite;
}
@keyframes brandSlide{0%{background-position:0 center}100%{background-position:200% center}}
.hdr-sep{color:var(--bdr2);margin:0 10px;font-size:14px}
.hdr-sub{font-family:var(--mono);font-size:9px;letter-spacing:.18em;text-transform:uppercase;color:var(--dim)}
.hbtn{
  font-family:var(--mono);font-size:9px;letter-spacing:.08em;text-transform:uppercase;
  color:var(--dim);cursor:pointer;padding:3px 9px;
  border:1px solid var(--bdr);border-radius:3px;
  transition:all .15s;user-select:none;
}
.hbtn:hover{border-color:var(--purple-hi);color:var(--purple-hi);background:rgba(124,77,255,.08)}
#hdr-left{display:flex;align-items:center;gap:8px}
#hdr-right{display:flex;align-items:center;gap:10px;font-size:10px}
#conn{
  font-size:9px;padding:2px 9px;border-radius:3px;
  border:1px solid var(--bdr);color:var(--dim);
  letter-spacing:.06em;transition:all .2s;
}
#clock{color:var(--purple-hi);font-weight:500;letter-spacing:.05em}
#acct-tag{color:var(--dim);font-size:9px;letter-spacing:.06em}

/* ── METRICS BAR ── */
#metrics{
  display:grid;grid-template-columns:repeat(5,1fr);
  border-bottom:1px solid var(--bdr);
  background:var(--bg2);flex-shrink:0;position:relative;z-index:2;
}
.mc{padding:7px 12px;border-right:1px solid var(--bdr)}
.mc:last-child{border-right:none}
.ml{
  font-size:8px;text-transform:uppercase;letter-spacing:.12em;
  color:var(--dim2);margin-bottom:3px;font-family:var(--mono);
}
.mv{
  font-size:19px;font-weight:600;font-family:var(--disp);
  color:var(--purple-hi);line-height:1;
}
.ms{font-size:9px;color:var(--dim);margin-top:2px;font-family:var(--mono)}

/* ── RISK STRIP ── */
#risk-strip{
  display:flex;align-items:center;gap:6px;
  padding:5px 14px;border-bottom:1px solid var(--bdr);
  background:var(--bg);flex-shrink:0;flex-wrap:wrap;min-height:28px;
  position:relative;z-index:2;
}
.risk-lbl{
  font-size:8px;text-transform:uppercase;letter-spacing:.14em;
  color:var(--dim2);flex-shrink:0;font-family:var(--mono);
}
.sig{
  font-family:var(--mono);font-size:9px;padding:2px 9px;
  border-radius:3px;border:1px solid;white-space:nowrap;letter-spacing:.04em;
}
.sig-red{color:#f87171;border-color:rgba(248,113,113,.3);background:rgba(248,113,113,.08)}
.sig-amb{color:#fbbf24;border-color:rgba(251,191,36,.28);background:rgba(251,191,36,.07)}
.sig-grn{color:#4ade80;border-color:rgba(74,222,128,.28);background:rgba(74,222,128,.07)}
#risk-src{margin-left:auto;font-size:8px;color:var(--dim2);letter-spacing:.04em}

/* ── MAIN 3-COLUMN ── */
#main{
  display:grid;grid-template-columns:268px 1fr 300px;
  flex:1;min-height:0;position:relative;z-index:2;
}

/* ── LEFT PANEL ── */
#panel-l{
  border-right:1px solid var(--bdr);
  display:flex;flex-direction:column;min-height:0;overflow:hidden;
  background:var(--bg2);
}

/* ── CENTER PANEL ── */
#panel-c{
  display:flex;flex-direction:column;min-height:0;
  border-right:1px solid var(--bdr);background:var(--bg);
}

/* ── RIGHT PANEL ── */
#panel-r{
  display:flex;flex-direction:column;min-height:0;background:var(--bg2);
}

/* ── SECTION HEADER ── */
.sh{
  background:var(--bg3);border-bottom:1px solid var(--bdr);
  padding:4px 10px;font-size:8px;letter-spacing:.14em;
  text-transform:uppercase;color:var(--purple-hi);
  flex-shrink:0;display:flex;justify-content:space-between;align-items:center;
  font-family:var(--mono);
}
.sh::before{
  content:'';width:12px;height:1px;margin-right:6px;flex-shrink:0;
  background:linear-gradient(90deg,var(--orange),var(--purple-hi));
}
.sh-note{
  color:var(--dim2);font-size:7.5px;font-weight:400;
  letter-spacing:.02em;text-transform:none;margin-left:auto;
}
.sh-grn{color:var(--green)!important}
.sh-grn::before{background:linear-gradient(90deg,var(--purple-hi),var(--green))!important}

/* ── STRATEGY PANEL ── */
#strat-panel{
  background:var(--bg3);border-bottom:1px solid var(--bdr);
  padding:10px 12px;flex-shrink:0;
}
.sp-title{
  font-size:7px;text-transform:uppercase;letter-spacing:.18em;
  color:var(--orange);margin-bottom:7px;font-family:var(--mono);
  display:flex;align-items:center;gap:6px;
}
.sp-title::before{
  content:'';width:16px;height:1px;
  background:linear-gradient(90deg,var(--orange),var(--purple-hi));
}
.sp-rule{font-size:10px;color:var(--dim);line-height:1.75;padding:0}
.sp-rule b{color:var(--txt);font-weight:500}
.sp-rule .warn{color:var(--red)}
#strat-memory{
  margin-top:8px;padding-top:8px;border-top:1px solid var(--bdr);
  font-size:9px;color:var(--dim);line-height:1.65;font-style:italic;
}

/* ── ALLOCATION BARS ── */
#alloc-area{padding:8px 10px;flex-shrink:0;border-bottom:1px solid var(--bdr)}
.abar-row{display:flex;align-items:center;gap:6px;margin-bottom:5px}
.abar-row:last-child{margin-bottom:0}
.abar-sym{
  width:34px;font-size:10px;color:var(--txt);font-family:var(--mono);
  font-weight:500;flex-shrink:0;
}
.abar-track{
  flex:1;height:5px;background:rgba(124,77,255,.08);
  border-radius:2px;overflow:visible;position:relative;
}
.abar-tgt{
  position:absolute;top:0;height:100%;
  background:rgba(124,77,255,.18);border-radius:2px;
}
.abar-fill{
  position:absolute;top:0;left:0;height:100%;
  background:linear-gradient(90deg,var(--purple),var(--purple-hi));
  border-radius:2px;transition:width .5s;
}
.abar-pct{
  width:94px;font-size:9px;color:var(--dim);
  white-space:nowrap;text-align:right;font-family:var(--mono);flex-shrink:0;
}

/* ── POSITIONS ── */
#core-wrap{overflow-y:auto;flex-shrink:0;max-height:36%}
#alpha-wrap{flex:1;overflow-y:auto;min-height:0}

/* ── CHART ── */
#chart-area{flex:1;min-height:0;padding:6px 8px 4px;position:relative}
#chart-area svg{width:100%;height:100%;display:block}

/* ── ANALYTICS GRID ── */
#analytics{
  display:grid;grid-template-columns:repeat(3,1fr);
  border-top:1px solid var(--bdr);border-bottom:1px solid var(--bdr);
  flex-shrink:0;background:var(--bg2);
}
.acard{padding:6px 10px;border-right:1px solid var(--bdr)}
.acard:last-child,.acard:nth-child(3){border-right:none}
.acard:nth-child(4),.acard:nth-child(5),.acard:nth-child(6){border-top:1px solid var(--bdr)}
.acard-l{font-size:7.5px;text-transform:uppercase;letter-spacing:.1em;color:var(--dim2);font-family:var(--mono)}
.acard-v{
  font-size:14px;font-weight:600;font-family:var(--disp);
  color:var(--purple-hi);margin-top:2px;line-height:1;
}

/* ── TRADES ── */
#trades-area{flex-shrink:0;height:160px;overflow-y:auto;border-top:1px solid var(--bdr)}

/* ── CHAT ── */
#chat-msgs{flex:1;overflow-y:auto;min-height:0;padding:8px;display:flex;flex-direction:column;gap:5px}
.cmsg-u,.cmsg-a{
  max-width:97%;padding:7px 10px;border-radius:var(--r);
  font-size:11px;white-space:pre-wrap;word-break:break-word;
  line-height:1.55;font-family:var(--sans);
}
.cmsg-u{
  align-self:flex-end;
  background:rgba(124,77,255,.12);border:1px solid var(--bdr2);color:var(--txt);
}
.cmsg-a{
  align-self:flex-start;
  background:var(--bg3);border:1px solid var(--bdr);color:var(--txt);
}
.cmsg-sys{
  color:var(--dim2);font-size:9px;text-align:center;
  padding:4px 0;font-family:var(--mono);letter-spacing:.04em;
}
#chat-think{
  color:var(--purple-hi);font-size:9px;padding:3px 10px;
  font-style:italic;display:none;animation:pulse 1.2s ease-in-out infinite;
  font-family:var(--mono);
}
@keyframes pulse{0%,100%{opacity:.35}50%{opacity:1}}
#chat-row{
  display:flex;gap:5px;padding:7px;
  border-top:1px solid var(--bdr);flex-shrink:0;
}
#chat-in{
  flex:1;background:var(--bg3);border:1px solid var(--bdr);border-radius:var(--r);
  color:var(--txt);font-family:var(--mono);font-size:11px;
  padding:6px 9px;resize:none;min-height:34px;max-height:80px;outline:none;
}
#chat-in:focus{border-color:var(--purple)}
#chat-send{
  background:linear-gradient(135deg,var(--purple),#6d3df5);
  border:none;border-radius:var(--r);
  color:#fff;font-family:var(--mono);font-size:9px;
  letter-spacing:.1em;text-transform:uppercase;
  padding:6px 12px;cursor:pointer;align-self:flex-end;
  box-shadow:0 4px 16px rgba(124,77,255,.3);transition:filter .15s;
}
#chat-send:hover{filter:brightness(1.1)}
#chat-send:disabled{opacity:.3;cursor:default;filter:none}

/* ── TABLES ── */
table{width:100%;border-collapse:collapse;font-size:10.5px}
th{
  padding:3px 7px;text-align:left;font-size:7.5px;text-transform:uppercase;
  letter-spacing:.1em;color:var(--dim2);border-bottom:1px solid var(--bdr);
  position:sticky;top:0;background:var(--bg3);font-family:var(--mono);
}
td{padding:4px 7px;border-bottom:1px solid rgba(124,77,255,.05);vertical-align:middle}
tr:hover td{background:rgba(124,77,255,.04)}

/* ── FOOTER ── */
#footer{
  background:var(--bg2);border-top:1px solid var(--bdr);
  padding:4px 14px;display:flex;justify-content:space-between;
  font-size:8px;color:var(--dim2);flex-shrink:0;
  font-family:var(--mono);letter-spacing:.04em;position:relative;z-index:2;
}
.src{display:flex;gap:12px}
.src-item::before{content:'◆ ';color:rgba(124,77,255,.4);font-size:7px}

/* ── SCROLLBAR ── */
::-webkit-scrollbar{width:3px}
::-webkit-scrollbar-track{background:var(--bg)}
::-webkit-scrollbar-thumb{background:rgba(124,77,255,.25);border-radius:2px}

/* ── UTILITY ── */
.ph{padding:12px;color:var(--dim2);font-size:9.5px;text-align:center;font-style:italic;font-family:var(--mono)}
.pos{color:var(--green)}.neg{color:var(--red)}.vio{color:var(--purple-hi)}.cyn{color:var(--cyan)}.ora{color:var(--orange)}
</style>
</head>
<body>

<!-- HEADER -->
<div id="hdr">
  <div id="hdr-left">
    <span class="logo">SPECTRE</span>
    <span class="hdr-sep">|</span>
    <span class="hdr-sub">Myrmidon Terminal</span>
    <span style="display:inline-block;width:16px"></span>
    <span class="hbtn" onclick="doRefresh()">↺ Refresh [F2]</span>
    <span class="hbtn" onclick="toggleStrat()">☰ Strategy [F3]</span>
    <span class="hbtn" onclick="focusChat()">⌨ Chat [F8]</span>
  </div>
  <div id="hdr-right">
    <span id="acct-tag">PAPER ACCOUNT</span>
    <span id="conn">CONNECTING</span>
    <span id="clock">UTC 00:00:00</span>
  </div>
</div>

<!-- METRICS BAR -->
<div id="metrics">
  <div class="mc">
    <div class="ml">Portfolio Equity</div>
    <div class="mv" id="m-eq">—</div>
    <div class="ms" id="m-eq2">—</div>
  </div>
  <div class="mc">
    <div class="ml">30-Day Return</div>
    <div class="mv" id="m-ret">—</div>
    <div class="ms" id="m-ret2">—</div>
  </div>
  <div class="mc">
    <div class="ml">Cash · ≥20% floor</div>
    <div class="mv" id="m-cash">—</div>
    <div class="ms" id="m-cash2">—</div>
  </div>
  <div class="mc">
    <div class="ml">Buying Power</div>
    <div class="mv" id="m-bp">—</div>
    <div class="ms" id="m-bp2">—</div>
  </div>
  <div class="mc">
    <div class="ml">AUD/USD · Open Positions</div>
    <div class="mv" id="m-fx" style="color:var(--cyan)">—</div>
    <div class="ms" id="m-pos-ct">—</div>
  </div>
</div>

<!-- RISK SIGNALS -->
<div id="risk-strip">
  <span class="risk-lbl">Risk Signals</span>
  <div id="risk-sigs"><span class="sig sig-grn">Scanning…</span></div>
  <span id="risk-src">Alpaca Paper API · Yahoo Finance · Groq LLaMA-3.3</span>
</div>

<!-- MAIN 3-COL -->
<div id="main">

  <!-- LEFT: Strategy + Allocation + Positions -->
  <div id="panel-l">
    <div class="sh">Strategy<span class="sh-note" id="strat-toggle-hint">click ☰ to expand</span></div>
    <div id="strat-panel" style="display:none">
      <div class="sp-title">Myrmidon · Portfolio Rules</div>
      <div class="sp-rule">Core sleeve <b>70%</b> — SPY <b>40%</b> · QQQ <b>20%</b> · VEA <b>15%</b></div>
      <div class="sp-rule">Satellite sleeve <b>30%</b> — max <b>10%</b> per position</div>
      <div class="sp-rule">Cash floor <b>≥20%</b> always maintained</div>
      <div class="sp-rule">Stop-loss — cut at <b class="warn">−15% unrealised</b></div>
      <div class="sp-rule">Rebalance if <b>&gt;5% off target</b></div>
      <div class="sp-rule">Never chase up <b class="warn">&gt;30% in 2 weeks</b></div>
      <div id="strat-memory"><em id="strat-mem-txt">No strategy memory saved — ask Myrmidon to "save strategy"</em></div>
    </div>

    <div class="sh">Target vs Actual Allocation</div>
    <div id="alloc-area">
      <div class="abar-row">
        <span class="abar-sym">SPY</span>
        <div class="abar-track"><div class="abar-tgt" id="at-spy-t"></div><div class="abar-fill" id="at-spy-a"></div></div>
        <span class="abar-pct" id="at-spy-l">—</span>
      </div>
      <div class="abar-row">
        <span class="abar-sym">QQQ</span>
        <div class="abar-track"><div class="abar-tgt" id="at-qqq-t"></div><div class="abar-fill" id="at-qqq-a"></div></div>
        <span class="abar-pct" id="at-qqq-l">—</span>
      </div>
      <div class="abar-row">
        <span class="abar-sym">VEA</span>
        <div class="abar-track"><div class="abar-tgt" id="at-vea-t"></div><div class="abar-fill" id="at-vea-a"></div></div>
        <span class="abar-pct" id="at-vea-l">—</span>
      </div>
      <div class="abar-row">
        <span class="abar-sym" style="color:var(--cyan)">Cash</span>
        <div class="abar-track">
          <div class="abar-tgt" id="at-cash-t" style="background:rgba(56,189,248,.18)"></div>
          <div class="abar-fill" id="at-cash-a" style="background:linear-gradient(90deg,var(--cyan),#0ea5e9)"></div>
        </div>
        <span class="abar-pct" id="at-cash-l">—</span>
      </div>
      <div class="abar-row">
        <span class="abar-sym" style="color:var(--green)">Alpha</span>
        <div class="abar-track">
          <div class="abar-tgt" id="at-alpha-t" style="background:rgba(74,222,128,.14)"></div>
          <div class="abar-fill" id="at-alpha-a" style="background:linear-gradient(90deg,var(--green),#22c55e)"></div>
        </div>
        <span class="abar-pct" id="at-alpha-l">—</span>
      </div>
    </div>

    <div class="sh">Core · Index Sleeve<span class="sh-note" id="core-pct-note"></span></div>
    <div id="core-wrap"><div class="ph">Loading…</div></div>
    <div class="sh sh-grn">Alpha · Satellite Sleeve<span class="sh-note" id="alpha-pct-note"></span></div>
    <div id="alpha-wrap"><div class="ph">Loading…</div></div>
  </div>

  <!-- CENTER: Chart + Analytics + Trades -->
  <div id="panel-c">
    <div class="sh">30-Day Equity Curve<span class="sh-note" id="curve-range"></span></div>
    <div id="chart-area">
      <svg id="chart" preserveAspectRatio="none">
        <text x="50%" y="50%" text-anchor="middle" fill="rgba(124,77,255,.15)" font-size="11">Loading…</text>
      </svg>
    </div>
    <div id="analytics">
      <div class="acard"><div class="acard-l">Max Drawdown</div><div class="acard-v" id="an-dd">—</div></div>
      <div class="acard"><div class="acard-l">Trades (filled)</div><div class="acard-v" id="an-wr">—</div></div>
      <div class="acard"><div class="acard-l">Avg Trade Value</div><div class="acard-v" id="an-avt">—</div></div>
      <div class="acard"><div class="acard-l">Largest Position</div><div class="acard-v" id="an-top">—</div></div>
      <div class="acard"><div class="acard-l">Total Invested</div><div class="acard-v" id="an-inv">—</div></div>
      <div class="acard"><div class="acard-l">Open Orders</div><div class="acard-v" id="an-ord" style="color:var(--orange)">—</div></div>
    </div>
    <div id="trades-area">
      <div class="sh">Recent Filled Trades</div>
      <table>
        <thead><tr>
          <th>Symbol</th><th>Side</th>
          <th style="text-align:right">Qty</th>
          <th style="text-align:right">Fill $</th>
          <th style="text-align:right">Total USD</th>
          <th style="text-align:right">≈AUD</th>
          <th style="text-align:right">Date</th>
        </tr></thead>
        <tbody id="trades-tb"><tr><td colspan="7" class="ph">Loading…</td></tr></tbody>
      </table>
    </div>
  </div>

  <!-- RIGHT: Myrmidon Chat -->
  <div id="panel-r">
    <div class="sh">Myrmidon · AI Trading Agent<span class="sh-note">Groq LLaMA-3.3-70B</span></div>
    <div id="chat-msgs">
      <div class="cmsg-sys">Ask Myrmidon anything — live positions, quotes, place orders, portfolio analysis…</div>
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
    <span class="src-item">Alpaca Paper API — positions · orders · history</span>
    <span class="src-item">Yahoo Finance — AUD/USD rate</span>
    <span class="src-item">Groq Cloud — LLaMA-3.3-70B (AI)</span>
  </div>
  <span id="st-ts">—</span>
</div>

<script>
(function(){
  var $ = function(id){return document.getElementById(id);};

  /* ── CLOCK ── */
  (function tick(){
    var n=new Date(),p=function(x){return String(x).padStart(2,'0');};
    $('clock').textContent='UTC '+p(n.getUTCHours())+':'+p(n.getUTCMinutes())+':'+p(n.getUTCSeconds());
    setTimeout(tick,1000);
  })();

  /* ── HELPERS ── */
  function usd(n,dec){
    if(n==null||isNaN(parseFloat(n)))return'—';
    var v=parseFloat(n);
    return dec?'$'+v.toFixed(dec):'$'+Math.round(v).toLocaleString();
  }
  function pct(n,sign){
    if(n==null||isNaN(parseFloat(n)))return'—';
    var v=parseFloat(n);
    return(v>=0&&sign?'+':'')+v.toFixed(2)+'%';
  }
  function aud(n,r){
    if(!r||n==null)return'—';
    return'~$'+Math.round(parseFloat(n)/r).toLocaleString()+' AUD';
  }
  function esc(s){
    return String(s)
      .replace(/&/g,'&amp;')
      .replace(/</g,'&lt;')
      .replace(/>/g,'&gt;');
  }

  function setConn(msg,ok){
    var el=$('conn');
    el.textContent=msg;
    if(ok===true){
      el.style.color='#4ade80';el.style.borderColor='rgba(74,222,128,.3)';el.style.background='rgba(74,222,128,.06)';
    } else if(ok===false){
      el.style.color='#f87171';el.style.borderColor='rgba(248,113,113,.3)';el.style.background='rgba(248,113,113,.06)';
    } else {
      el.style.color='rgba(232,228,255,.4)';el.style.borderColor='rgba(124,77,255,.14)';el.style.background='';
    }
  }

  /* ── CLASSIFICATION ── */
  var CORE_TARGETS={SPY:0.40,QQQ:0.20,VEA:0.15};
  var BROAD_ETFS={XLE:1,XLF:1,XLV:1,XLI:1,XLY:1,XLP:1,XLU:1,XLB:1,XLRE:1,XLK:1,
    IWM:1,VTI:1,IVV:1,GLD:1,TLT:1,BND:1,AGG:1,VNQ:1,EFA:1,EEM:1,VWO:1,
    VO:1,VB:1,SCHD:1,JEPI:1,JEPQ:1,DIA:1};
  function isCore(sym){return !!(CORE_TARGETS[sym]||BROAD_ETFS[sym]);}

  /* ── METRICS ── */
  var _eq=0,_cash=0,_rate=null;
  function renderMetrics(acct,hist,rate,positions){
    _eq=parseFloat(acct.equity)||0;
    _cash=parseFloat(acct.cash)||0;
    _rate=rate||null;
    var bp=parseFloat(acct.buying_power)||0;

    $('m-eq').textContent=usd(_eq);
    $('m-eq2').textContent=_rate?aud(_eq,_rate):'—';
    if(acct.account_number)$('acct-tag').textContent='#'+acct.account_number+' · PAPER';

    var retPct=0,retUsd=0;
    if(hist&&Array.isArray(hist.equity)){
      var v=hist.equity.filter(function(x){return x!=null&&x>0;});
      if(v.length>1){var s0=v[0];retUsd=_eq-s0;retPct=s0>0?(retUsd/s0)*100:0;}
    }
    $('m-ret').textContent=pct(retPct,true);
    $('m-ret').className='mv '+(retPct>=0?'pos':'neg');
    $('m-ret2').textContent=(retUsd>=0?'+':'')+usd(retUsd)+' USD';

    var cashPct=_eq>0?(_cash/_eq)*100:0;
    $('m-cash').textContent=usd(_cash);
    $('m-cash').style.color=cashPct<20?'#f87171':cashPct<25?'#fbbf24':'var(--cyan)';
    $('m-cash2').textContent=cashPct.toFixed(1)+'% of equity';

    $('m-bp').textContent=usd(bp);
    $('m-bp2').textContent=_rate?aud(bp,_rate):'—';
    $('m-fx').textContent=rate?parseFloat(rate).toFixed(4):'—';
    $('m-pos-ct').textContent=(positions&&positions.length||0)+' positions open';

    return cashPct;
  }

  /* ── RISK SIGNALS ── */
  function renderRisk(acct,positions){
    var eq=parseFloat(acct.equity)||0,cash=parseFloat(acct.cash)||0;
    var sigs=[];
    var cashPct=eq>0?cash/eq:0;
    if(cashPct<0.20)sigs.push({c:'red',m:'CASH '+(cashPct*100).toFixed(1)+'% — BELOW 20% FLOOR'});
    else if(cashPct<0.25)sigs.push({c:'amb',m:'Cash '+(cashPct*100).toFixed(1)+'% — near floor'});
    else sigs.push({c:'grn',m:'Cash OK ('+(cashPct*100).toFixed(1)+'%)'});

    (positions||[]).forEach(function(p){
      var mv=parseFloat(p.market_value)||0;
      var plpc=parseFloat(p.unrealized_plpc)||0;
      var posPct=eq>0?mv/eq:0;
      if(posPct>0.10)sigs.push({c:'red',m:p.symbol+' '+(posPct*100).toFixed(1)+'% — exceeds 10% limit'});
      if(plpc<-0.15)sigs.push({c:'red',m:p.symbol+' '+(plpc*100).toFixed(1)+'% — STOP-LOSS'});
      else if(plpc<-0.12)sigs.push({c:'amb',m:p.symbol+' '+(plpc*100).toFixed(1)+'% — near stop-loss'});
    });

    var bySymbol={};
    (positions||[]).forEach(function(p){bySymbol[p.symbol]=parseFloat(p.market_value)||0;});
    Object.keys(CORE_TARGETS).forEach(function(sym){
      var target=CORE_TARGETS[sym];
      var actual=eq>0?(bySymbol[sym]||0)/eq:0;
      if(Math.abs(actual-target)>0.08)
        sigs.push({c:'amb',m:sym+' '+(actual*100).toFixed(0)+'% vs '+(target*100)+'% target'});
    });

    if(sigs.length===1&&sigs[0].c==='grn')sigs=[{c:'grn',m:'All systems clear'}];
    $('risk-sigs').innerHTML=sigs.map(function(s){
      return'<span class="sig sig-'+s.c+'">'+esc(s.m)+'</span>';
    }).join('');
  }

  /* ── ALLOCATION BARS ── */
  function renderAlloc(positions,cashPct){
    var eq=_eq||1;
    var bySymbol={};
    (positions||[]).forEach(function(p){bySymbol[p.symbol]=parseFloat(p.market_value)||0;});
    var alphaMv=(positions||[]).filter(function(p){return!isCore(p.symbol);})
      .reduce(function(s,p){return s+(parseFloat(p.market_value)||0);},0);

    function bar(sym,actual,target,fillId,tgtId,lblId,offTarget){
      var a=Math.min(actual*100,100),t=Math.min(target*100,100);
      var fill=document.getElementById(fillId);
      var tgt=document.getElementById(tgtId);
      var lbl=document.getElementById(lblId);
      if(fill)fill.style.width=a+'%';
      if(tgt)tgt.style.width=t+'%';
      if(lbl){
        lbl.textContent=(actual*100).toFixed(1)+'% / '+(target*100).toFixed(0)+'% tgt';
        lbl.style.color=offTarget?'#fbbf24':'rgba(232,228,255,.4)';
      }
    }

    var spyAct=(bySymbol.SPY||0)/eq;
    var qqqAct=(bySymbol.QQQ||0)/eq;
    var veaAct=(bySymbol.VEA||0)/eq;
    var cashAct=(cashPct||0)/100;
    var alphaAct=eq>0?alphaMv/eq:0;

    bar('SPY',spyAct,0.40,'at-spy-a','at-spy-t','at-spy-l',Math.abs(spyAct-0.40)>0.08);
    bar('QQQ',qqqAct,0.20,'at-qqq-a','at-qqq-t','at-qqq-l',Math.abs(qqqAct-0.20)>0.08);
    bar('VEA',veaAct,0.15,'at-vea-a','at-vea-t','at-vea-l',Math.abs(veaAct-0.15)>0.08);

    var cashFill=$('at-cash-a'),cashTgt=$('at-cash-t'),cashLbl=$('at-cash-l');
    if(cashFill)cashFill.style.width=Math.min(cashPct||0,100)+'%';
    if(cashTgt)cashTgt.style.width='20%';
    if(cashLbl){
      cashLbl.textContent=(cashPct||0).toFixed(1)+'% / 20% min';
      cashLbl.style.color=(cashPct||0)<20?'#f87171':(cashPct||0)<25?'#fbbf24':'rgba(56,189,248,.7)';
    }

    var alphaFill=$('at-alpha-a'),alphaTgt=$('at-alpha-t'),alphaLbl=$('at-alpha-l');
    if(alphaFill)alphaFill.style.width=Math.min(alphaAct*100,100)+'%';
    if(alphaTgt)alphaTgt.style.width='30%';
    if(alphaLbl){
      alphaLbl.textContent=(alphaAct*100).toFixed(1)+'% / 30% tgt';
      alphaLbl.style.color=alphaAct>0.30?'#fbbf24':'rgba(74,222,128,.5)';
    }
  }

  /* ── POSITIONS ── */
  function posRow(p,alpha){
    var unrl=parseFloat(p.unrealized_pl)||0;
    var plpc=parseFloat(p.unrealized_plpc)||0;
    var mv=parseFloat(p.market_value)||0;
    var qty=parseFloat(p.qty)||0;
    var price=parseFloat(p.current_price)||0;
    var c=unrl>=0?'pos':'neg';
    var symColor=alpha?'var(--green)':'var(--purple-hi)';
    return'<tr>'+
      '<td style="font-weight:600;color:'+symColor+'">'+esc(p.symbol)+'</td>'+
      '<td style="text-align:right;color:var(--dim);font-size:9.5px">'+qty.toFixed(qty%1?4:0)+'</td>'+
      '<td style="text-align:right;color:var(--cyan)">'+usd(price,2)+'</td>'+
      '<td style="text-align:right">'+usd(mv)+'</td>'+
      '<td class="'+c+'" style="text-align:right">'+(unrl>=0?'+':'')+usd(unrl)+'</td>'+
      '<td class="'+c+'" style="text-align:right;font-size:9.5px">'+pct(plpc*100,true)+'</td>'+
      '</tr>';
  }
  var PHEAD='<table><thead><tr>'+
    '<th>Sym</th>'+
    '<th style="text-align:right">Qty</th>'+
    '<th style="text-align:right">Price</th>'+
    '<th style="text-align:right">Mkt Val</th>'+
    '<th style="text-align:right">P&L $</th>'+
    '<th style="text-align:right">%</th>'+
    '</tr></thead><tbody>';

  function renderPositions(positions,eq){
    var core=[],alpha=[];
    (positions||[]).forEach(function(p){
      (isCore(p.symbol)?core:alpha).push(p);
    });
    var coreMv=core.reduce(function(s,p){return s+(parseFloat(p.market_value)||0);},0);
    var alphaMv=alpha.reduce(function(s,p){return s+(parseFloat(p.market_value)||0);},0);
    $('core-pct-note').textContent=eq>0?(coreMv/eq*100).toFixed(1)+'% of equity · target 70%':'';
    $('alpha-pct-note').textContent=eq>0?(alphaMv/eq*100).toFixed(1)+'% of equity · target 30%':'';
    $('core-wrap').innerHTML=core.length
      ?PHEAD+core.map(function(p){return posRow(p,false);}).join('')+'</tbody></table>'
      :'<div class="ph">No core ETF positions</div>';
    $('alpha-wrap').innerHTML=alpha.length
      ?PHEAD+alpha.map(function(p){return posRow(p,true);}).join('')+'</tbody></table>'
      :'<div class="ph" style="color:rgba(74,222,128,.3)">No alpha picks yet</div>';
  }

  /* ── EQUITY CHART ── */
  function renderChart(hist){
    var svg=$('chart');
    if(!hist||!Array.isArray(hist.equity)){
      svg.innerHTML='<text x="50%" y="50%" text-anchor="middle" fill="rgba(124,77,255,.15)" font-size="11">No history data</text>';
      return;
    }
    var raw=hist.equity,ts=hist.timestamp||[];
    var vals=[],tss=[];
    for(var i=0;i<raw.length;i++){
      if(raw[i]!=null&&raw[i]>0){vals.push(raw[i]);tss.push(ts[i]||0);}
    }
    if(vals.length<2){
      svg.innerHTML='<text x="50%" y="50%" text-anchor="middle" fill="rgba(124,77,255,.15)" font-size="11">Insufficient data</text>';
      return;
    }
    var W=1000,H=180,PX=8,PY=18;
    var lo=Math.min.apply(null,vals)*0.9995;
    var hi=Math.max.apply(null,vals)*1.0005;
    var rng=hi-lo||1;
    var tx=function(i){return PX+(i/(vals.length-1))*(W-PX*2);};
    var ty=function(v){return H-PY-((v-lo)/rng)*(H-PY*2);};
    var start=vals[0],end=vals[vals.length-1],up=end>=start;
    var lc=up?'#4ade80':'#f87171';
    var grid='';
    for(var g=0;g<=3;g++){
      var gv=lo+(rng*g/3),gy=ty(gv);
      grid+='<line x1="'+PX+'" y1="'+gy+'" x2="'+(W-PX)+'" y2="'+gy+
        '" stroke="rgba(124,77,255,.07)" stroke-width="1"/>';
      grid+='<text x="'+(W-PX+4)+'" y="'+(gy+3)+
        '" font-size="8" fill="rgba(124,77,255,.25)" font-family="DM Mono,monospace">$'+
        Math.round(gv/1000)+'K</text>';
    }
    var pts=vals.map(function(v,i){return tx(i)+','+ty(v);}).join(' L ');
    var path='M '+pts;
    var fill=path+' L '+tx(vals.length-1)+','+(H-PY)+' L '+PX+','+(H-PY)+' Z';
    var fmtd=function(u){
      if(!u)return'';
      var d=new Date(u*1000);
      return(d.getMonth()+1)+'/'+(d.getDate());
    };
    $('curve-range').textContent=(tss[0]?fmtd(tss[0]):'')+' → '+(tss[tss.length-1]?fmtd(tss[tss.length-1]):'');
    svg.setAttribute('viewBox','0 0 '+W+' '+H);
    svg.innerHTML=
      '<defs><linearGradient id="cg" x1="0" y1="0" x2="0" y2="1">'+
      '<stop offset="0%" stop-color="'+lc+'" stop-opacity="0.18"/>'+
      '<stop offset="100%" stop-color="'+lc+'" stop-opacity="0.01"/>'+
      '</linearGradient></defs>'+
      grid+
      '<line x1="'+PX+'" y1="'+ty(start)+'" x2="'+(W-PX)+'" y2="'+ty(start)+
        '" stroke="rgba(124,77,255,.12)" stroke-width="1" stroke-dasharray="4,5"/>'+
      '<path d="'+fill+'" fill="url(#cg)"/>'+
      '<path d="'+path+'" fill="none" stroke="'+lc+'" stroke-width="1.5" stroke-linejoin="round"/>'+
      '<circle cx="'+tx(vals.length-1)+'" cy="'+ty(end)+'" r="3.5" fill="'+lc+'"/>'+
      '<text x="'+(tx(vals.length-1)-8)+'" y="'+(ty(end)-8)+
        '" font-size="10" fill="'+lc+'" font-family="Space Grotesk,sans-serif" text-anchor="end" font-weight="600">'+
        '$'+Math.round(end).toLocaleString()+'</text>'+
      '<text x="'+(PX+2)+'" y="'+(H-3)+
        '" font-size="8" fill="rgba(124,77,255,.25)" font-family="DM Mono,monospace">'+
        (tss[0]?fmtd(tss[0]):'')+'</text>'+
      '<text x="'+(W-PX-2)+'" y="'+(H-3)+
        '" font-size="8" fill="rgba(124,77,255,.25)" font-family="DM Mono,monospace" text-anchor="end">'+
        (tss[tss.length-1]?fmtd(tss[tss.length-1]):'')+'</text>';
  }

  /* ── ANALYTICS ── */
  function renderAnalytics(hist,orders,positions,eq,openOrders){
    var dd=0;
    if(hist&&Array.isArray(hist.equity)){
      var peak=0;
      hist.equity.forEach(function(v){
        if(v&&v>peak)peak=v;
        if(peak>0&&v)dd=Math.max(dd,(peak-v)/peak);
      });
    }
    var ddEl=$('an-dd');
    ddEl.textContent=dd>0?'-'+(dd*100).toFixed(1)+'%':'—';
    ddEl.className='acard-v '+(dd>0.15?'neg':dd>0.10?'ora':'');

    var filled=(orders||[]).filter(function(o){return o.status==='filled'&&o.filled_avg_price;});
    $('an-wr').textContent=filled.length?filled.length+' trades':'—';

    if(filled.length){
      var avg=filled.reduce(function(s,o){
        return s+(parseFloat(o.filled_avg_price)||0)*(parseFloat(o.filled_qty)||0);
      },0)/filled.length;
      $('an-avt').textContent=usd(avg);
    }

    if(positions&&positions.length){
      var top=positions.reduce(function(a,b){
        return(parseFloat(a.market_value)||0)>=(parseFloat(b.market_value)||0)?a:b;
      });
      var topPct=eq>0?(parseFloat(top.market_value)||0)/eq*100:0;
      $('an-top').textContent=top.symbol+' '+topPct.toFixed(1)+'%';
      $('an-top').className='acard-v '+(topPct>10?'neg':topPct>8?'ora':'vio');
    }

    var invested=(positions||[]).reduce(function(s,p){return s+(parseFloat(p.market_value)||0);},0);
    $('an-inv').textContent=usd(invested);
    $('an-ord').textContent=openOrders&&openOrders.length?openOrders.length+' pending':'None';
  }

  /* ── TRADES ── */
  function renderTrades(orders,rate){
    var tb=$('trades-tb');
    var filled=(orders||[]).filter(function(o){return o.status==='filled'&&o.filled_avg_price;});
    if(!filled.length){
      tb.innerHTML='<tr><td colspan="7" class="ph">No filled trades yet</td></tr>';
      return;
    }
    tb.innerHTML=filled.slice(0,60).map(function(o){
      var buy=o.side==='buy',c=buy?'pos':'neg';
      var price=parseFloat(o.filled_avg_price)||0;
      var qty=parseFloat(o.filled_qty)||parseFloat(o.qty)||0;
      var total=price*qty;
      var dt=o.filled_at
        ?new Date(o.filled_at).toLocaleString('en-AU',{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'})
        :'—';
      return'<tr>'+
        '<td style="font-weight:600;color:var(--purple-hi)">'+esc(o.symbol)+'</td>'+
        '<td class="'+c+'" style="font-weight:600;font-size:9.5px">'+(buy?'▲ BUY':'▼ SELL')+'</td>'+
        '<td style="text-align:right;color:var(--dim)">'+qty+'</td>'+
        '<td style="text-align:right;color:var(--cyan)">'+usd(price,2)+'</td>'+
        '<td style="text-align:right">'+usd(total)+'</td>'+
        '<td style="text-align:right;color:var(--dim2)">'+aud(total,rate)+'</td>'+
        '<td style="text-align:right;color:var(--dim2);font-size:9px">'+dt+'</td>'+
        '</tr>';
    }).join('');
  }

  /* ── STRATEGY PANEL ── */
  var stratOpen=false;
  window.toggleStrat=function(){
    stratOpen=!stratOpen;
    $('strat-panel').style.display=stratOpen?'block':'none';
  };
  function renderStrategy(memory){
    if(!memory)return;
    var txt='';
    if(memory.strategy)txt+=memory.strategy;
    if(memory.lessons&&memory.lessons.length){
      txt+='\n\nLessons:\n'+memory.lessons.slice(-4).map(function(l,i){
        return(i+1)+'. '+(typeof l==='string'?l:(l.lesson||''));
      }).join('\n');
    }
    if(txt)$('strat-mem-txt').textContent=txt;
  }

  /* ── LOAD ── */
  var loading=false;
  async function load(){
    if(loading)return;
    loading=true;
    setConn('Fetching…',null);
    try{
      var r=await fetch('/api/terminal',{headers:{'x-terminal-key':''},cache:'no-store'});
      var d=await r.json();
      if(!r.ok||!d.account){
        setConn('API ERROR',false);
        if(d&&d.error)$('st-ts').textContent='Error: '+d.error;
        loading=false;return;
      }
      var cashPct=renderMetrics(d.account,d.history,d.rate,d.positions);
      renderRisk(d.account,d.positions||[]);
      renderAlloc(d.positions||[],cashPct);
      renderPositions(d.positions||[],_eq);
      renderChart(d.history);
      renderAnalytics(d.history,d.orders||[],d.positions||[],_eq,d.openOrders||[]);
      renderTrades(d.orders||[],d.rate);
      renderStrategy(d.memory);
      setConn('LIVE',true);
      $('st-ts').textContent='Updated '+new Date().toLocaleTimeString('en-AU')+' · auto-refresh 30s';
    }catch(e){
      setConn('ERROR',false);
      $('st-ts').textContent='Network error: '+e.message;
    }
    loading=false;
  }

  window.doRefresh=function(){loading=false;load();};

  /* ── CHAT ── */
  var chatMsgs=[],chatBusy=false;
  function renderChat(){
    var box=$('chat-msgs');
    if(!chatMsgs.length){
      box.innerHTML='<div class="cmsg-sys">Ask Myrmidon anything…</div>';
      return;
    }
    box.innerHTML=chatMsgs.map(function(m){
      return m.role==='user'
        ?'<div class="cmsg-u">'+esc(m.content)+'</div>'
        :'<div class="cmsg-a">'+esc(m.content)+'</div>';
    }).join('');
    box.scrollTop=box.scrollHeight;
  }

  async function chatSend(){
    var inp=$('chat-in'),btn=$('chat-send'),think=$('chat-think');
    var text=inp.value.trim();
    if(!text||chatBusy)return;
    inp.value='';
    chatMsgs.push({role:'user',content:text});
    chatBusy=true;
    renderChat();
    think.style.display='block';
    btn.disabled=true;btn.textContent='…';
    try{
      var r=await fetch('/api/terminal/chat',{
        method:'POST',
        headers:{'Content-Type':'application/json','x-terminal-key':''},
        body:JSON.stringify({messages:chatMsgs})
      });
      var raw=await r.text();
      var data;
      try{data=JSON.parse(raw);}
      catch(e){data={reply:'Parse error — check server logs'};}
      chatMsgs.push({role:'assistant',content:data.reply||(data.error?'Error: '+data.error:'No response.')});
    }catch(e){
      chatMsgs.push({role:'assistant',content:'Request failed: '+e.message});
    }finally{
      chatBusy=false;
      think.style.display='none';
      btn.disabled=false;btn.textContent='Send';
      renderChat();
    }
  }

  window.chatSend=chatSend;
  window.chatKey=function(e){if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();chatSend();}};
  window.focusChat=function(){var el=$('chat-in');if(el)el.focus();};

  /* ── KEYBOARD SHORTCUTS ── */
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
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
