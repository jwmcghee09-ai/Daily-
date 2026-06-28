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
#left{border-right:1px solid #1a1200;display:flex;flex-direction:column;min-height:0}
#center{display:flex;flex-direction:column;min-height:0;border-right:1px solid #1a1200}
#chat-panel{display:flex;flex-direction:column;min-height:0}

.ph{background:#0a0600;border-bottom:1px solid #1a1200;padding:3px 8px;color:#f90;font-size:9px;letter-spacing:.12em;text-transform:uppercase;flex-shrink:0}

/* positions */
#pos-wrap{flex:1;overflow-y:auto;min-height:0}

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
#chat-thinking{color:#f90;font-size:10px;padding:4px 8px;font-style:italic;display:none}

/* tables */
table{width:100%;border-collapse:collapse;font-size:11px}
th{padding:3px 6px;text-align:left;font-size:9px;text-transform:uppercase;letter-spacing:.08em;color:#444;border-bottom:1px solid #111;position:sticky;top:0;background:#030200}
td{padding:3px 6px;border-bottom:1px solid #0a0700;vertical-align:middle}
tr:hover td{background:#0a0700}

#statusbar{background:#030200;border-top:1px solid #111;padding:3px 10px;display:flex;justify-content:space-between;font-size:10px;color:#444;flex-shrink:0}

.pos{color:#00e676}.neg{color:#ff4444}.amb{color:#f90}.cyn{color:#00bcd4}.dim{color:#444}
::-webkit-scrollbar{width:4px}::-webkit-scrollbar-track{background:#030200}::-webkit-scrollbar-thumb{background:#1a1200}
.placeholder{padding:12px;color:#222;font-size:11px;text-align:center}
</style>
</head>
<body>

<div id="topbar">
  <span class="fkey" onclick="doRefresh()">F2</span><span class="flabel">REFRESH</span>
  <span class="fkey" onclick="focusChat()">F8</span><span class="flabel">CHAT</span>
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
  <div class="mc"><div class="ml">Portfolio Equity</div><div class="mv" id="m-eq">—</div><div class="ms" id="m-eq2">—</div></div>
  <div class="mc"><div class="ml">30-Day Return</div><div class="mv" id="m-ret">—</div><div class="ms" id="m-ret2">—</div></div>
  <div class="mc"><div class="ml">Cash Available</div><div class="mv cyn" id="m-cash">—</div><div class="ms" id="m-cash2">—</div></div>
  <div class="mc"><div class="ml">Buying Power</div><div class="mv" id="m-bp">—</div><div class="ms" id="m-bp2">—</div></div>
  <div class="mc"><div class="ml">AUD/USD · Positions</div><div class="mv cyn" id="m-fx">—</div><div class="ms" id="m-pos-ct">—</div></div>
</div>

<div id="strat-bar">
  <span class="strat-label">Strategy</span>
  <span id="strat-text">Loading strategy memory…</span>
  <span id="lessons-wrap"></span>
</div>

<div id="main">
  <!-- LEFT: positions -->
  <div id="left">
    <div class="ph">■ OPEN POSITIONS</div>
    <div id="pos-wrap"><div class="placeholder">LOADING…</div></div>
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
    <div class="ph">■ MYRMIDON · GROQ/LLAMA-3.3-70B <span id="chat-model" style="float:right;color:#333;font-size:8px"></span></div>
    <div id="chat-msgs">
      <div class="cmsg-sys">Ask Myrmidon about positions, trades, market analysis…</div>
    </div>
    <div id="chat-thinking">Analysing…</div>
    <div id="chat-input-row">
      <textarea id="chat-in" rows="1" placeholder="Ask Myrmidon…" onkeydown="chatKey(event)"></textarea>
      <button id="chat-send" onclick="chatSend()">Send</button>
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
  function renderStrategy(memory){
    if(!memory||!memory.strategy){$('strat-text').textContent='No strategy memory recorded yet.';return;}
    $('strat-text').textContent=memory.strategy.slice(0,300)+(memory.strategy.length>300?'…':'');
    if(memory.lessons&&memory.lessons.length){
      $('lessons-wrap').textContent='['+memory.lessons.length+' lesson'+(memory.lessons.length!==1?'s':'')+' recorded]';
    }
  }

  // positions
  function renderPositions(positions){
    var wrap=$('pos-wrap');
    if(!positions||!positions.length){wrap.innerHTML='<div class="placeholder">NO OPEN POSITIONS</div>';return;}
    var rows=positions.map(function(p){
      var unrl=parseFloat(p.unrealized_pl)||0,plpc=parseFloat(p.unrealized_plpc)||0;
      var mv=parseFloat(p.market_value)||0,qty=parseFloat(p.qty)||0,price=parseFloat(p.current_price)||0;
      var c=unrl>=0?'pos':'neg';
      return'<tr><td class="amb" style="font-weight:bold">'+p.symbol+'</td>'+
        '<td style="text-align:right;color:#aaa;font-size:10px">'+qty.toFixed(qty%1?4:0)+'</td>'+
        '<td class="cyn" style="text-align:right">'+usd(price,2)+'</td>'+
        '<td style="text-align:right">'+usd(mv)+'</td>'+
        '<td class="'+c+'" style="text-align:right">'+(unrl>=0?'+':'')+usd(Math.abs(unrl))+'</td>'+
        '<td class="'+c+'" style="text-align:right;font-size:10px">'+pct(plpc*100)+'</td></tr>';
    }).join('');
    wrap.innerHTML='<table><thead><tr><th>Sym</th><th style="text-align:right">Qty</th><th style="text-align:right">Price</th><th style="text-align:right">Mkt Val</th><th style="text-align:right">P&L</th><th style="text-align:right">%</th></tr></thead><tbody>'+rows+'</tbody></table>';
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
      renderMetrics(d.account,d.history,d.rate,d.positions);
      renderStrategy(d.memory);
      renderPositions(d.positions);
      renderChart(d.history);
      renderTrades(d.orders,d.rate);
      renderOpenOrders(d.openOrders);
      conn('CONNECTED',true);ts();
      status('$'+Math.round(parseFloat(d.account.equity)||0).toLocaleString()+' USD · '+(d.positions&&d.positions.length||0)+' positions · '+(d.openOrders&&d.openOrders.length||0)+' open orders');
    }catch(e){conn('ERROR',false);status('ERROR: '+e.message);}
    loading=false;
  }
  window.doRefresh=function(){loading=false;load();};

  // chat
  var chatMsgs=[],chatBusy=false;
  function renderChat(){
    var box=$('chat-msgs');
    if(!chatMsgs.length){box.innerHTML='<div class="cmsg-sys">Ask Myrmidon about positions, trades, market analysis…</div>';return;}
    box.innerHTML=chatMsgs.map(function(m){
      return m.role==='user'?'<div class="cmsg-u">'+esc(m.content)+'</div>':'<div class="cmsg-a">'+esc(m.content)+'</div>';
    }).join('');
    box.scrollTop=box.scrollHeight;
  }
  async function chatSend(){
    var inp=$('chat-in'),btn=$('chat-send'),think=$('chat-thinking');
    if(!inp)return;var text=inp.value.trim();if(!text||chatBusy)return;
    inp.value='';chatMsgs.push({role:'user',content:text});chatBusy=true;renderChat();
    think.style.display='block';btn.disabled=true;btn.textContent='…';
    try{
      var r=await fetch('/api/terminal/chat',{method:'POST',headers:{'Content-Type':'application/json','x-terminal-key':''},body:JSON.stringify({messages:chatMsgs})});
      var data=await r.json();
      chatMsgs.push({role:'assistant',content:data.reply||(data.error?'Error: '+data.error:'No response.')});
    }catch(e){chatMsgs.push({role:'assistant',content:'Network error: '+e.message});}
    finally{chatBusy=false;think.style.display='none';btn.disabled=false;btn.textContent='Send';renderChat();}
  }
  window.chatSend=chatSend;
  window.chatKey=function(e){if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();chatSend();}};
  window.focusChat=function(){var el=$('chat-in');if(el)el.focus();};

  // keyboard
  document.addEventListener('keydown',function(e){
    if(e.key==='F2'||(e.key==='r'&&e.ctrlKey)){e.preventDefault();window.doRefresh();}
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
