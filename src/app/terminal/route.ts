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
body{
  background:#000;color:#e8d5a0;
  font-family:'Courier New',Courier,monospace;
  font-size:13px;display:flex;flex-direction:column;
}
/* ── TOP BAR ── */
#topbar{
  background:#0f0900;border-bottom:2px solid #f90;
  padding:3px 10px;display:flex;align-items:center;
  gap:18px;font-size:11px;color:#666;flex-shrink:0
}
#topbar .fkey{color:#000;background:#f90;padding:0 4px;border-radius:2px;font-weight:bold;font-size:10px}
#topbar .flabel{color:#888}
#topbar .right{margin-left:auto;display:flex;gap:18px;align-items:center}
#clock{color:#f90;font-size:12px;font-weight:bold;letter-spacing:.05em}
#conn{color:#f90;font-size:11px}

/* ── TITLE BAR ── */
#titlebar{
  background:#f90;color:#000;
  padding:4px 10px;display:flex;justify-content:space-between;align-items:center;
  font-weight:bold;font-size:13px;letter-spacing:.06em;flex-shrink:0
}

/* ── METRICS STRIP ── */
#metrics{
  display:grid;grid-template-columns:repeat(5,1fr);
  border-bottom:1px solid #2a1e00;flex-shrink:0
}
.mc{padding:5px 10px;border-right:1px solid #1a1200}
.mc:last-child{border-right:none}
.ml{font-size:9px;text-transform:uppercase;color:#666;letter-spacing:.08em;margin-bottom:1px}
.mv{font-size:17px;font-weight:bold;color:#f90;line-height:1.1}
.ms{font-size:10px;color:#777;margin-top:1px}

/* ── MAIN GRID ── */
#main{display:grid;grid-template-columns:310px 1fr;flex:1;min-height:0}

/* ── LEFT ── */
#left{border-right:1px solid #1a1200;display:flex;flex-direction:column;min-height:0}
#pos-wrap{flex:1;overflow-y:auto;min-height:0}

/* ── RIGHT ── */
#right{display:flex;flex-direction:column;min-height:0}
#chart-area{flex:1;min-height:0;padding:8px 10px 4px}
#chart-area svg{width:100%;height:100%;display:block}
#trades-area{flex-shrink:0;height:195px;overflow-y:auto;border-top:1px solid #1a1200}

/* ── PANEL HEADER ── */
.ph{
  background:#0f0900;border-bottom:1px solid #2a1e00;
  padding:3px 8px;color:#f90;font-size:10px;
  letter-spacing:.12em;text-transform:uppercase;flex-shrink:0
}

/* ── TABLES ── */
table{width:100%;border-collapse:collapse;font-size:12px}
th{
  padding:3px 7px;text-align:left;
  font-size:9px;text-transform:uppercase;letter-spacing:.08em;color:#555;
  border-bottom:1px solid #1a1200;position:sticky;top:0;background:#050300
}
td{padding:3px 7px;border-bottom:1px solid #0d0900;vertical-align:middle}
tr:hover td{background:#0d0900}

/* ── STATUS BAR ── */
#statusbar{
  background:#050300;border-top:1px solid #1a1200;
  padding:3px 10px;display:flex;justify-content:space-between;
  font-size:10px;color:#555;flex-shrink:0
}

/* ── COLORS ── */
.pos{color:#00e676}
.neg{color:#ff4444}
.amb{color:#f90}
.cyn{color:#00bcd4}
.dim{color:#555}
.wht{color:#e8d5a0}

/* ── SCROLLBAR ── */
::-webkit-scrollbar{width:5px}
::-webkit-scrollbar-track{background:#050300}
::-webkit-scrollbar-thumb{background:#2a1e00}

.placeholder{padding:16px;color:#333;font-size:11px;text-align:center}
</style>
</head>
<body>

<div id="topbar">
  <span class="fkey">F2</span><span class="flabel" onclick="load()" style="cursor:pointer">REFRESH</span>
  <span class="fkey">F5</span><span class="flabel">POSITIONS</span>
  <span class="fkey">F6</span><span class="flabel">TRADES</span>
  <span class="fkey">F9</span><span class="flabel">ORDERS</span>
  <div class="right">
    <span id="conn">CONNECTING…</span>
    <span id="clock">UTC 00:00:00</span>
  </div>
</div>

<div id="titlebar">
  <span>MYRMIDON // ALPACA PAPER TRADING TERMINAL</span>
  <span id="acct-num" style="font-size:11px;font-weight:normal;opacity:.7"></span>
</div>

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
    <div class="ml">Cash Available</div>
    <div class="mv cyn" id="m-cash">—</div>
    <div class="ms" id="m-cash2">—</div>
  </div>
  <div class="mc">
    <div class="ml">Buying Power</div>
    <div class="mv" id="m-bp">—</div>
    <div class="ms" id="m-bp2">—</div>
  </div>
  <div class="mc">
    <div class="ml">AUD/USD · Open Positions</div>
    <div class="mv cyn" id="m-fx">—</div>
    <div class="ms" id="m-pos-ct">—</div>
  </div>
</div>

<div id="main">
  <div id="left">
    <div class="ph">■ OPEN POSITIONS</div>
    <div id="pos-wrap"><div class="placeholder">LOADING…</div></div>
  </div>
  <div id="right">
    <div class="ph">■ 30-DAY EQUITY CURVE  <span style="float:right;color:#555;font-size:9px" id="curve-range"></span></div>
    <div id="chart-area">
      <svg id="chart" preserveAspectRatio="none">
        <text x="50%" y="50%" text-anchor="middle" fill="#222" font-size="12" font-family="monospace">LOADING…</text>
      </svg>
    </div>
    <div id="trades-area">
      <div class="ph">■ RECENT FILLED TRADES</div>
      <table>
        <thead><tr>
          <th>Symbol</th><th>Side</th>
          <th style="text-align:right">Qty</th>
          <th style="text-align:right">Fill $</th>
          <th style="text-align:right">Total USD</th>
          <th style="text-align:right">≈ AUD</th>
          <th style="text-align:right">Time</th>
        </tr></thead>
        <tbody id="trades-tb"><tr><td colspan="7" class="placeholder">LOADING…</td></tr></tbody>
      </table>
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

  // ── CLOCK ──
  function tick(){
    var n=new Date();
    var p=function(x){return String(x).padStart(2,'0')};
    $('clock').textContent='UTC '+p(n.getUTCHours())+':'+p(n.getUTCMinutes())+':'+p(n.getUTCSeconds());
  }
  tick();setInterval(tick,1000);

  // ── HELPERS ──
  function usd(n,dec){
    if(n==null||isNaN(n))return'—';
    var v=dec?parseFloat(n).toFixed(dec):Math.round(n).toLocaleString('en-US');
    return '$'+(dec?parseFloat(n).toFixed(dec):Math.round(n).toLocaleString('en-US'));
  }
  function pct(n){if(n==null)return'—';return(n>=0?'+':'')+parseFloat(n).toFixed(2)+'%';}
  function aud(n,rate){return rate&&n!=null?'~$'+Math.round(n/rate).toLocaleString('en-AU')+' AUD':'—';}
  function cls(n){return parseFloat(n)>=0?'pos':'neg';}
  function conn(msg,ok){
    $('conn').textContent=msg;
    $('conn').style.color=ok===true?'#00e676':ok===false?'#ff4444':'#f90';
  }
  function status(msg){$('st-msg').textContent=msg;}
  function ts(){$('st-ts').textContent='Updated: '+new Date().toLocaleTimeString('en-AU')+' · Auto-refresh 30s';}

  // ── METRICS ──
  function renderMetrics(acct,hist,rate,positions){
    var eq=parseFloat(acct.equity)||0;
    var cash=parseFloat(acct.cash)||0;
    var bp=parseFloat(acct.buying_power)||0;
    $('m-eq').textContent=usd(eq);
    $('m-eq2').textContent=aud(eq,rate);
    $('acct-num').textContent='ACCT #'+acct.account_number;

    var retUsd=0,retPct=0;
    if(hist&&hist.equity&&hist.equity.length>1){
      var vals=hist.equity.filter(function(v){return v!=null&&v>0;});
      if(vals.length>1){var s0=vals[0];retUsd=eq-s0;retPct=s0>0?(retUsd/s0)*100:0;}
    }
    var rc=retUsd>=0?'pos':'neg';
    $('m-ret').textContent=pct(retPct);$('m-ret').className='mv '+rc;
    $('m-ret2').textContent=(retUsd>=0?'+':'-')+usd(Math.abs(retUsd))+' USD';

    $('m-cash').textContent=usd(cash);
    $('m-cash2').textContent=equity>0?(cash/eq*100).toFixed(1)+'% of portfolio':'—';

    $('m-bp').textContent=usd(bp);
    $('m-bp2').textContent=aud(bp,rate);

    $('m-fx').textContent=rate?rate.toFixed(4):'—';
    $('m-pos-ct').textContent=(positions&&positions.length||0)+' open position(s)';
  }

  // ── POSITIONS ──
  function renderPositions(positions){
    var wrap=$('pos-wrap');
    if(!positions||!positions.length){
      wrap.innerHTML='<div class="placeholder">NO OPEN POSITIONS</div>';return;
    }
    var rows=positions.map(function(p){
      var unrl=parseFloat(p.unrealized_pl)||0;
      var plpc=parseFloat(p.unrealized_plpc)||0;
      var mv=parseFloat(p.market_value)||0;
      var qty=parseFloat(p.qty)||0;
      var price=parseFloat(p.current_price)||0;
      var c=unrl>=0?'pos':'neg';
      var side=parseFloat(p.qty)>0?'<span class="pos">LONG</span>':'<span class="neg">SHORT</span>';
      return'<tr>'+
        '<td class="amb" style="font-weight:bold">'+p.symbol+'</td>'+
        '<td class="dim">'+side+'</td>'+
        '<td style="text-align:right;color:#aaa">'+qty.toFixed(qty%1?4:0)+'</td>'+
        '<td class="cyn" style="text-align:right">'+usd(price,2)+'</td>'+
        '<td style="text-align:right">'+usd(mv)+'</td>'+
        '<td class="'+c+'" style="text-align:right">'+(unrl>=0?'+':'')+usd(Math.abs(unrl))+'</td>'+
        '<td class="'+c+'" style="text-align:right;font-size:11px">'+pct(plpc*100)+'</td>'+
      '</tr>';
    }).join('');
    wrap.innerHTML='<table><thead><tr>'+
      '<th>Sym</th><th></th><th style="text-align:right">Qty</th>'+
      '<th style="text-align:right">Price</th><th style="text-align:right">Mkt Val</th>'+
      '<th style="text-align:right">P&amp;L</th><th style="text-align:right">%</th>'+
      '</tr></thead><tbody>'+rows+'</tbody></table>';
  }

  // ── CHART ──
  function renderChart(hist){
    var svg=$('chart');
    if(!hist||!hist.equity){
      svg.innerHTML='<text x="50%" y="50%" text-anchor="middle" fill="#222" font-size="12" font-family="monospace">NO HISTORY DATA</text>';return;
    }
    var raw=hist.equity||[];var ts=hist.timestamp||[];
    var vals=[],tss=[];
    for(var i=0;i<raw.length;i++){if(raw[i]!=null&&raw[i]>0){vals.push(raw[i]);tss.push(ts[i]||0);}}
    if(vals.length<2){svg.innerHTML='<text x="50%" y="50%" text-anchor="middle" fill="#222" font-size="12" font-family="monospace">INSUFFICIENT DATA</text>';return;}

    var W=1000,H=220,PX=12,PY=24;
    var lo=Math.min.apply(null,vals)*0.999,hi=Math.max.apply(null,vals)*1.001,rng=hi-lo;
    var tx=function(i){return PX+(i/(vals.length-1))*(W-PX*2);};
    var ty=function(v){return H-PY-((v-lo)/rng)*(H-PY*2);};
    var start=vals[0],end=vals[vals.length-1];
    var up=end>=start;var lc=up?'#00e676':'#ff4444';

    // Grid
    var grid='';
    for(var g=0;g<=4;g++){
      var gv=lo+(rng*g/4);var gy=ty(gv);
      grid+='<line x1="'+PX+'" y1="'+gy+'" x2="'+(W-PX)+'" y2="'+gy+'" stroke="#111" stroke-width="1"/>';
      grid+='<text x="'+(W-PX+3)+'" y="'+(gy+4)+'" font-size="8" fill="#333" font-family="monospace">$'+Math.round(gv/1000)+'K</text>';
    }

    var pts=vals.map(function(v,i){return tx(i)+','+ty(v);}).join(' L ');
    var path='M '+pts;
    var fill=path+' L '+tx(vals.length-1)+','+(H-PY)+' L '+PX+','+(H-PY)+' Z';
    var sy=ty(start);

    var fmtd=function(u){if(!u)return'';var d=new Date(u*1000);return(d.getMonth()+1)+'/'+(d.getDate());};
    $('curve-range').textContent=fmtd(tss[0])+' → '+fmtd(tss[tss.length-1]);

    svg.setAttribute('viewBox','0 0 '+W+' '+H);
    svg.innerHTML=grid+
      '<defs><linearGradient id="gr" x1="0" y1="0" x2="0" y2="1">'+
        '<stop offset="0%" stop-color="'+lc+'" stop-opacity="0.12"/>'+
        '<stop offset="100%" stop-color="'+lc+'" stop-opacity="0.01"/>'+
      '</linearGradient></defs>'+
      '<line x1="'+PX+'" y1="'+sy+'" x2="'+(W-PX)+'" y2="'+sy+'" stroke="#1a1200" stroke-width="1" stroke-dasharray="4,5"/>'+
      '<path d="'+fill+'" fill="url(#gr)"/>'+
      '<path d="'+path+'" fill="none" stroke="'+lc+'" stroke-width="2" stroke-linejoin="round"/>'+
      '<circle cx="'+tx(0)+'" cy="'+ty(start)+'" r="3" fill="'+lc+'" opacity="0.5"/>'+
      '<circle cx="'+tx(vals.length-1)+'" cy="'+ty(end)+'" r="4" fill="'+lc+'"/>'+
      '<text x="'+PX+'" y="'+(H-5)+'" font-family="monospace" font-size="9" fill="#444">'+fmtd(tss[0])+'</text>'+
      '<text x="'+(W-PX)+'" y="'+(H-5)+'" font-family="monospace" font-size="9" fill="#444" text-anchor="end">'+fmtd(tss[tss.length-1])+'</text>'+
      '<text x="'+(tx(vals.length-1)-8)+'" y="'+(ty(end)-8)+'" font-family="monospace" font-size="11" fill="'+lc+'" text-anchor="end">$'+Math.round(end).toLocaleString()+'</text>'+
      '<text x="'+PX+'" y="'+(ty(start)-6)+'" font-family="monospace" font-size="9" fill="#555">$'+Math.round(start).toLocaleString()+'</text>';
  }

  // ── TRADES ──
  function renderTrades(orders,rate){
    var tb=$('trades-tb');
    var filled=(orders||[]).filter(function(o){return o.status==='filled'&&o.filled_avg_price;});
    if(!filled.length){tb.innerHTML='<tr><td colspan="7" class="placeholder">NO FILLED TRADES</td></tr>';return;}
    tb.innerHTML=filled.slice(0,80).map(function(o){
      var buy=o.side==='buy';var sc=buy?'pos':'neg';
      var price=parseFloat(o.filled_avg_price)||0;
      var qty=parseFloat(o.filled_qty)||parseFloat(o.qty)||0;
      var total=price*qty;
      var dt=o.filled_at?new Date(o.filled_at).toLocaleString('en-AU',{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'}):'—';
      return'<tr>'+
        '<td class="amb" style="font-weight:bold">'+o.symbol+'</td>'+
        '<td class="'+sc+'" style="font-weight:bold;font-size:11px">'+(buy?'▲ BUY':'▼ SELL')+'</td>'+
        '<td style="text-align:right;color:#aaa">'+qty+'</td>'+
        '<td class="cyn" style="text-align:right">'+usd(price,2)+'</td>'+
        '<td style="text-align:right">'+usd(total)+'</td>'+
        '<td style="text-align:right;color:#777">'+aud(total,rate)+'</td>'+
        '<td style="text-align:right;color:#444;font-size:10px">'+dt+'</td>'+
      '</tr>';
    }).join('');
  }

  // ── LOAD ──
  var loading=false;
  async function load(){
    if(loading)return;loading=true;
    conn('FETCHING…',null);status('REQUESTING DATA FROM ALPACA…');
    try{
      var r=await fetch('/api/terminal',{headers:{'x-terminal-key':''},cache:'no-store'});
      var d=await r.json();
      if(!r.ok){conn('ERROR',false);status('ERROR: '+(d.error||r.status));loading=false;return;}
      if(!d.account){conn('ERROR',false);status('ERROR: NO ACCOUNT DATA RETURNED');loading=false;return;}
      renderMetrics(d.account,d.history,d.rate,d.positions);
      renderPositions(d.positions);
      renderChart(d.history);
      renderTrades(d.orders,d.rate);
      conn('CONNECTED',true);ts();
      status('ACCOUNT: $'+Math.round(parseFloat(d.account.equity)||0).toLocaleString()+' USD · '+
             (d.positions&&d.positions.length||0)+' POSITIONS · NEXT REFRESH IN 30s');
    }catch(e){conn('ERROR',false);status('NETWORK ERROR: '+e.message);}
    loading=false;
  }
  window.load=load;

  // ── KEYBOARD ──
  document.addEventListener('keydown',function(e){
    if(e.key==='F2'||(e.key==='r'&&e.ctrlKey)){e.preventDefault();loading=false;load();}
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
