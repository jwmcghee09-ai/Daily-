import { NextRequest, NextResponse } from "next/server";
import { isTraderSession } from "@/lib/terminal-auth";

export const runtime = "nodejs";

const HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>MYRMIDON — STRATEGY ENGINE</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{background:#05050c;color:#e6e4f2;font-family:'Courier New',Courier,monospace;font-size:14px;min-height:100vh}
a{color:inherit;text-decoration:none}

#topbar{background:#0c0c16;border-bottom:2px solid #a78bfa;padding:10px 22px;display:flex;align-items:center;gap:18px;font-size:12px;color:#666;position:sticky;top:0;z-index:10}
#topbar .right{margin-left:auto;display:flex;gap:14px;align-items:center}
.tblink{color:#a78bfa;border:1px solid #2d2a4a;border-radius:4px;padding:5px 12px;font-size:11px;letter-spacing:.06em;text-transform:uppercase}
.tblink:hover{border-color:#a78bfa}

#titlebar{background:linear-gradient(90deg,#a855f7 0%,#d946ef 35%,#ff7a30 72%,#ffb347 100%);color:#fff;padding:10px 22px;font-weight:bold;font-size:16px;letter-spacing:.06em;display:flex;justify-content:space-between;align-items:center}

.spill{font-size:10px;padding:3px 10px;border-radius:3px;border:1px solid;text-transform:uppercase;letter-spacing:.05em;font-weight:bold}
.spill-on{color:#00e676;border-color:#003300;background:#010800}
.spill-off{color:#777;border-color:#333;background:#0a0a12}
.spill-auto{color:#ff4444;border-color:#3a0000;background:#0d0000}

#wrap{max-width:1280px;margin:0 auto;padding:26px 22px 60px;display:grid;grid-template-columns:minmax(0,1.15fr) minmax(0,1fr);gap:24px;align-items:start}
@media(max-width:980px){#wrap{grid-template-columns:1fr}}

.card{background:#0d0c16;border:1px solid #2d2a4a;border-radius:10px;overflow:hidden;margin-bottom:24px}
.card-h{background:#12101f;border-bottom:1px solid #211f38;padding:12px 18px;color:#a78bfa;font-size:11px;letter-spacing:.14em;text-transform:uppercase;display:flex;align-items:center;justify-content:space-between}
.card-b{padding:18px}

.sbanner{border:1px solid;border-radius:6px;padding:12px 15px;font-size:12.5px;line-height:1.65;margin-bottom:18px}
.sbanner-off{border-color:#2d2a4a;background:#0e0d1c;color:#999}
.sbanner-on{border-color:#003300;background:#010800;color:#00e676}
.sbanner-auto{border-color:#3a0000;background:#0d0000;color:#ff4444}

.ssec{color:#a78bfa;font-size:11px;text-transform:uppercase;letter-spacing:.12em;margin:22px 0 12px;display:flex;align-items:center;gap:8px}
.ssec:first-child{margin-top:0}
.snum{display:inline-flex;width:18px;height:18px;align-items:center;justify-content:center;border-radius:50%;background:#a78bfa;color:#000;font-size:10px;font-weight:bold;flex-shrink:0}

.mode-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}
@media(max-width:560px){.mode-grid{grid-template-columns:1fr}}
.mode-card{border:1px solid #2d2a4a;border-radius:8px;padding:13px 14px;cursor:pointer;background:#0a0a12;transition:border-color .12s}
.mode-card:hover{border-color:#4a4478}
.mode-card.sel{border-color:#a78bfa;background:#14112a;box-shadow:0 0 0 1px #a78bfa inset}
.mode-name{font-size:13px;font-weight:bold;color:#e6e4f2;margin-bottom:5px;letter-spacing:.04em}
.mode-card.sel .mode-name{color:#c4b5fd}
.mode-desc{font-size:11px;line-height:1.55;color:#888}

#custom-wrap{display:none;margin-top:10px}
#custom-prompt{width:100%;background:#0a0a12;border:1px solid #2d2a4a;border-radius:6px;color:#e6e4f2;font-family:'Courier New',monospace;font-size:13px;padding:11px 13px;resize:vertical;min-height:90px;outline:none;line-height:1.6}
#custom-prompt:focus{border-color:#a78bfa}

.seg{display:flex;gap:8px;flex-wrap:wrap}
.seg-btn{border:1px solid #2d2a4a;border-radius:6px;background:#0a0a12;color:#999;font-family:'Courier New',monospace;font-size:11.5px;letter-spacing:.05em;text-transform:uppercase;padding:9px 16px;cursor:pointer}
.seg-btn.sel{border-color:#a78bfa;color:#c4b5fd;background:#14112a}
.seg-note{font-size:11px;color:#777;margin-top:8px;line-height:1.5}

.lim-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px}
.lim label{display:block;color:#777;font-size:10px;text-transform:uppercase;letter-spacing:.08em;margin-bottom:6px}
.lim input{width:100%;background:#0a0a12;border:1px solid #2d2a4a;border-radius:6px;color:#e6e4f2;font-family:'Courier New',monospace;font-size:13px;padding:9px 11px;outline:none}
.lim input:focus{border-color:#a78bfa}
.lim-note{font-size:11px;color:#666;margin-top:12px;line-height:1.6;border-top:1px solid #211f38;padding-top:10px}
.lim-note b{color:#999}

.arm-row{display:flex;gap:22px;flex-wrap:wrap;margin-bottom:16px}
.arm-toggle{display:flex;align-items:center;gap:9px;cursor:pointer;font-size:13px;letter-spacing:.04em}
.arm-toggle input{width:18px;height:18px;accent-color:#a78bfa;cursor:pointer}
.arm-warn{font-size:11px;color:#ff4444;display:none;margin:-6px 0 12px}

.btn{border-radius:6px;font-family:'Courier New',monospace;font-size:12px;letter-spacing:.08em;text-transform:uppercase;padding:11px 22px;cursor:pointer;border:1px solid}
.btn-save{background:#181530;border-color:#a78bfa;color:#c4b5fd}
.btn-save:hover{background:#232045}
.btn-run{background:#041505;border-color:#00e676;color:#00e676}
.btn-run:hover{background:#0a2510}
.btn:disabled{opacity:.4;cursor:default}
.btn-sm{font-size:10px;padding:5px 10px;border-radius:4px}
.btn-danger{background:#150404;border-color:#ff4444;color:#ff4444}
#save-msg{font-size:12px;color:#888;align-self:center}

.ptrade{border:1px solid #2d2a4a;border-radius:8px;padding:13px 15px;margin-bottom:12px;background:#0a0a12}
.ptrade-head{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:6px}
.pos{color:#00e676}.neg{color:#ff4444}.cyn{color:#38bdf8}
.ptrade-reason{color:#888;font-size:12px;line-height:1.55;margin-bottom:10px}

.srun{border-bottom:1px solid #16152a;padding:11px 0;cursor:pointer;line-height:1.55;font-size:12.5px}
.srun:last-child{border-bottom:none}
.srun:hover{background:#0e0d1c}
.srun-exp{display:none;font-size:12px;color:#999;white-space:pre-wrap;word-break:break-word;padding:9px 4px 3px;line-height:1.6}
.dim{color:#555}
.empty{color:#444;font-style:italic;font-size:12px;padding:8px 0}
::-webkit-scrollbar{width:5px}::-webkit-scrollbar-track{background:#08080f}::-webkit-scrollbar-thumb{background:#211f38}
</style>
</head>
<body>

<div id="topbar">
  <span style="color:#a78bfa;font-weight:bold;letter-spacing:.08em">MYRMIDON</span>
  <span id="status-pill" class="spill spill-off">LOADING…</span>
  <div class="right">
    <a class="tblink" href="/terminal">← Terminal</a>
    <a class="tblink" href="/dashboard?mode=account">Dashboard</a>
  </div>
</div>

<div id="titlebar">
  <span>STRATEGY ENGINE // AUTOMATED TRADING SETUP</span>
  <span style="font-size:12px;font-weight:normal;opacity:.85" id="tb-note">Groq llama-3.3-70b</span>
</div>

<div id="wrap">
  <!-- LEFT: setup -->
  <div>
    <div class="card">
      <div class="card-h">Setup</div>
      <div class="card-b">
        <div id="banner" class="sbanner sbanner-off">Loading configuration…</div>

        <div class="ssec"><span class="snum">1</span> Write your strategy — in your own words</div>
        <div style="font-size:12px;color:#999;line-height:1.6;margin-bottom:10px">Myrmidon follows exactly what you write here, every run. Be as specific as you like — entries, exits, position sizes, symbols to avoid, when to sit out. <span style="color:#c4b5fd">You author it, the AI executes it.</span></div>
        <div id="custom-wrap" style="display:block;margin-top:0">
          <textarea id="custom-prompt" placeholder="e.g. Buy quality tech stocks when they fall 4% or more from their recent high. Sell any position that gains 10%. Keep positions under 5% of the account. Never trade in the first 30 minutes after open. If VIX is above 25, do nothing."></textarea>
        </div>
        <div style="margin-top:10px">
          <div style="font-size:10px;color:#777;text-transform:uppercase;letter-spacing:.08em;margin-bottom:7px">Need a starting point? Insert a template, then edit it until it's yours:</div>
          <div class="seg" id="tpl-row"></div>
        </div>

        <div class="ssec"><span class="snum">2</span> Risk tolerance</div>
        <div class="seg" id="risk-seg"></div>
        <div class="seg-note" id="risk-note"></div>

        <div class="ssec"><span class="snum">3</span> Safety limits — enforced in code, the AI cannot override them</div>
        <div class="lim-grid">
          <div class="lim"><label>Max position (% of equity)</label><input type="number" id="f-maxpos" min="1" max="25" step="0.5"></div>
          <div class="lim"><label>Max trades per run</label><input type="number" id="f-maxtrades" min="1" max="10"></div>
          <div class="lim"><label>Daily buy cap (USD)</label><input type="number" id="f-dailycap" min="100" step="500"></div>
          <div class="lim"><label>Watchlist (empty = any symbol)</label><input type="text" id="f-watchlist" placeholder="NVDA,AMD,SPY"></div>
        </div>
        <div class="lim-note">Always on regardless of settings: <b>20% cash floor</b> · <b>whole shares only</b> · <b>can only sell what you hold</b> · <b>stale proposals expire after 24h</b> · buys re-checked against the cash floor at execution time.</div>

        <div class="ssec"><span class="snum">4</span> Arm the bot</div>
        <div class="arm-row">
          <label class="arm-toggle"><input type="checkbox" id="f-enabled"> ENABLED</label>
          <label class="arm-toggle"><input type="checkbox" id="f-autopilot"> AUTOPILOT</label>
          <label class="arm-toggle"><input type="checkbox" id="f-mkthrs"> MARKET HOURS ONLY</label>
        </div>
        <div class="arm-warn" id="auto-warn">⚠ Autopilot executes trades immediately with no confirmation window. Leave it off until you have watched a few runs.</div>
        <div style="display:flex;gap:12px;flex-wrap:wrap">
          <button class="btn btn-save" id="btn-save" onclick="saveConfig()">💾 Save</button>
          <button class="btn btn-run" id="btn-run" onclick="runNow()">▶ Run now</button>
          <span id="save-msg"></span>
        </div>
      </div>
    </div>

    <div class="card">
      <div class="card-h">How it works</div>
      <div class="card-b" style="font-size:12.5px;line-height:1.75;color:#999">
        Each run, Myrmidon pulls your live account, positions, open orders and risk signals, then asks the AI what — if anything — your strategy calls for.
        Every proposal passes through the safety limits above <span style="color:#c4b5fd">in code</span>; anything that violates them is rejected and logged with the reason.
        With AUTOPILOT off, accepted trades queue for <span style="color:#c4b5fd">5 minutes</span> so you can cancel, then fire on the next run.
        Schedule runs by pointing a cron at <span style="color:#38bdf8">/api/internal/ops/strategy-run</span> with your cron token, or press ▶ Run now anytime.<div style="margin-top:12px;border-top:1px solid #211f38;padding-top:10px;font-size:11px;color:#666;line-height:1.7">You write the strategy; Myrmidon executes your instructions within the hard safety limits. Nothing here is financial advice or a recommendation — strategy outcomes are your responsibility. This is a paper trading account.</div>
      </div>
    </div>
  </div>

  <!-- RIGHT: live state -->
  <div>
    <div class="card">
      <div class="card-h">Pending trades <button class="btn btn-sm btn-save" onclick="load(true)">↺ Refresh</button></div>
      <div class="card-b" id="pending-box"><div class="empty">Loading…</div></div>
    </div>

    <div class="card">
      <div class="card-h">Run history</div>
      <div class="card-b" id="runs-box" style="max-height:560px;overflow-y:auto"><div class="empty">Loading…</div></div>
    </div>
  </div>
</div>

<script>
(function(){
  function $(id){return document.getElementById(id);}
  function esc(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}

  var TEMPLATES=[
    {name:'Dip buyer',text:'Buy quality large-cap names when they have pulled back 3% or more from their recent high. Take profit when a position is up 8-15%. Be patient — if nothing has genuinely dipped, do nothing this run. Never buy anything that is up strongly today.'},
    {name:'Momentum',text:'Buy stocks showing strength — breaking out or trending strongly with the broad market supportive. Cut any loser quickly. Add to winners, never to losers. If VIX is above 20 or the S&P is down more than 1% today, sit out entirely.'},
    {name:'Index rebalancer',text:'Only trade SPY, QQQ, VEA and broad sector ETFs. Rebalance toward these targets: SPY 40% of equity, QQQ 20%, VEA 15%. Trim whatever is more than 5% over its target and add to whatever is under, preferring to sell strength and buy weakness. Do not trade single stocks.'},
    {name:'Cautious income',text:'Prioritise capital preservation. Only buy broad ETFs (SPY, VEA, XLV, XLP) on down days of 1.5% or more, in small sizes of 2-3% of equity. Take profit at +6%. If any position is down 8%, sell it. Hold at least 30% cash at all times.'}
  ];
  var RISKS=[
    {key:'conservative',name:'Conservative',note:'Small position sizes (1-3% of equity per trade), only high-conviction setups, prefers holding cash over marginal trades.'},
    {key:'balanced',name:'Balanced',note:'Moderate sizes (3-6% of equity per trade), acts on good setups, keeps dry powder.'},
    {key:'aggressive',name:'Aggressive',note:'Larger sizes up to the per-position cap, acts decisively — still respects every hard limit.'}
  ];

  var state={risk:'balanced',pending:[],runs:[]};
  var busy=false;

  function pill(cfg){
    var p=$('status-pill');
    if(!cfg||!cfg.enabled){p.className='spill spill-off';p.textContent='BOT OFF';}
    else if(cfg.autopilot){p.className='spill spill-auto';p.textContent='AUTOPILOT';}
    else{p.className='spill spill-on';p.textContent='ARMED · CONFIRM MODE';}
  }

  function banner(cfg){
    var b=$('banner');
    if(!cfg||!cfg.enabled){b.className='sbanner sbanner-off';b.innerHTML='⏻ <b>BOT IS OFF</b> — nothing runs. Pick a strategy, tick ENABLED, hit Save, then ▶ Run now to test it.';}
    else if(cfg.autopilot){b.className='sbanner sbanner-auto';b.innerHTML='⚠ <b>AUTOPILOT ON</b> — the AI executes trades immediately, no confirmation. Untick AUTOPILOT for a 5-minute veto window.';}
    else{b.className='sbanner sbanner-on';b.innerHTML='● <b>BOT ARMED</b> — every run the AI reviews your portfolio and queues trades for 5 minutes so you can cancel before they fire.';}
  }

  function renderTemplates(){
    $('tpl-row').innerHTML=TEMPLATES.map(function(tp,i){
      return '<button type="button" class="seg-btn" onclick="useTemplate('+i+')">'+tp.name+'</button>';
    }).join('');
  }
  window.useTemplate=function(i){
    var tp=TEMPLATES[i];if(!tp)return;
    var ta=$('custom-prompt');
    if(ta.value.trim()&&!confirm('Replace your current strategy text with the \"'+tp.name+'\" template?'))return;
    ta.value=tp.text;ta.focus();
  };

  function renderRisk(){
    $('risk-seg').innerHTML=RISKS.map(function(r){
      return '<button type="button" class="seg-btn'+(state.risk===r.key?' sel':'')+'" onclick="pickRisk(\\''+r.key+'\\')">'+r.name+'</button>';
    }).join('');
    var cur=RISKS.filter(function(r){return r.key===state.risk;})[0];
    $('risk-note').textContent=cur?cur.note:'';
  }
  window.pickRisk=function(k){state.risk=k;renderRisk();};

  function renderPending(){
    var box=$('pending-box');
    var pend=(state.pending||[]).filter(function(t){return t.status==='pending';});
    var recent=(state.pending||[]).filter(function(t){return t.status!=='pending';}).slice(0,6);
    var h='';
    if(!pend.length)h+='<div class="empty">Nothing queued — proposals appear here with a 5-minute cancel window.</div>';
    pend.forEach(function(t){
      var due=new Date(t.execute_after).getTime()-Date.now();
      var dueStr=due>0?'fires in ~'+Math.max(1,Math.round(due/60000))+' min':'due — fires on next run';
      h+='<div class="ptrade"><div class="ptrade-head">'+
        '<span class="'+(t.side==='buy'?'pos':'neg')+'" style="font-weight:bold;font-size:15px">'+(t.side==='buy'?'▲ BUY':'▼ SELL')+' '+t.qty+' '+esc(t.symbol)+'</span>'+
        (t.est_price?'<span class="cyn">@ ~$'+Number(t.est_price).toFixed(2)+' USD</span>':'')+
        '<span class="dim" style="font-size:11px">'+dueStr+'</span></div>'+
        '<div class="ptrade-reason">'+esc(t.reason||'')+'</div>'+
        '<button class="btn btn-sm btn-run" onclick="pendingAction('+t.id+',\\'execute_now\\')">EXEC NOW</button> '+
        '<button class="btn btn-sm btn-danger" onclick="pendingAction('+t.id+',\\'cancel\\')">CANCEL</button></div>';
    });
    if(recent.length){
      h+='<div class="dim" style="font-size:11px;margin-top:6px;line-height:1.8">Recent: '+recent.map(function(t){
        var col=t.status==='executed'?'#00e676':t.status==='cancelled'?'#777':'#ff4444';
        return '<span style="color:'+col+'">'+t.side+' '+t.qty+' '+esc(t.symbol)+' ('+t.status+')</span>';
      }).join(' · ')+'</div>';
    }
    box.innerHTML=h;
  }

  function renderRuns(){
    var box=$('runs-box');
    var runs=state.runs||[];
    if(!runs.length){box.innerHTML='<div class="empty">No runs yet — hit ▶ Run now.</div>';return;}
    box.innerHTML=runs.map(function(r,i){
      var dt=new Date(r.created_at).toLocaleString('en-AU',{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'});
      var col=r.status==='ok'?'#00e676':r.status==='skipped'?'#777':'#ff4444';
      return '<div class="srun" onclick="toggleRun(this,'+i+')"><span class="dim">'+esc(dt)+'</span> '+
        '<span style="color:'+col+'">['+esc(r.status)+']</span> <span style="color:#bbb">'+esc(r.summary||'')+'</span>'+
        '<div class="srun-exp"></div></div>';
    }).join('');
  }
  window.toggleRun=function(row,i){
    var el=row.querySelector('.srun-exp');if(!el)return;
    if(el.style.display==='block'){el.style.display='none';return;}
    var r=(state.runs||[])[i];
    var txt=r?(r.assessment||'(no assessment)'):'?';
    if(r&&r.actions){try{var acts=JSON.parse(r.actions);if(acts.length){txt+='\\n\\nActions:';acts.forEach(function(a){txt+='\\n- '+(a.verdict==='rejected'?'REJECTED ':'')+(a.side||a.action||'')+' '+(a.qty||'')+' '+(a.symbol||'')+(a.rejected?' — '+a.rejected:'')+(a.reason?' — '+a.reason:'');});}}catch(e){}}
    el.style.display='block';el.textContent=txt;
  };

  var MODE_MIGRATE={dip_buyer:0,momentum:1,index_rotator:2};
  function fillForm(cfg){
    state.risk=cfg.risk_tolerance||'balanced';
    var txt=cfg.custom_prompt||'';
    if(!txt&&cfg.mode&&MODE_MIGRATE[cfg.mode]!=null)txt=TEMPLATES[MODE_MIGRATE[cfg.mode]].text;
    $('custom-prompt').value=txt;
    $('f-maxpos').value=cfg.max_position_pct!=null?cfg.max_position_pct:10;
    $('f-maxtrades').value=cfg.max_trades_per_run!=null?cfg.max_trades_per_run:3;
    $('f-dailycap').value=cfg.max_daily_spend_usd!=null?cfg.max_daily_spend_usd:10000;
    $('f-watchlist').value=(cfg.watchlist||[]).join(',');
    $('f-enabled').checked=!!cfg.enabled;
    $('f-autopilot').checked=!!cfg.autopilot;
    $('f-mkthrs').checked=cfg.market_hours_only!==false;
    renderTemplates();renderRisk();banner(cfg);pill(cfg);autoWarn();
  }

  function autoWarn(){$('auto-warn').style.display=$('f-autopilot').checked?'block':'none';}
  document.addEventListener('change',function(e){if(e.target&&e.target.id==='f-autopilot')autoWarn();});

  function load(force){
    fetch('/api/trading/strategy').then(function(r){return r.json();}).then(function(d){
      if(d.error){$('banner').className='sbanner sbanner-off';$('banner').textContent='Error: '+d.error;return;}
      state.pending=d.pending||[];state.runs=d.runs||[];
      if(force!==true)fillForm(d.config||{});
      else{banner(d.config||{});pill(d.config||{});}
      renderPending();renderRuns();
    }).catch(function(e){$('banner').textContent='Failed to load: '+String(e&&e.message||e);});
  }
  window.load=load;

  window.saveConfig=function(){
    if(busy)return;busy=true;
    var msg=$('save-msg');msg.textContent='saving…';
    if($('f-enabled').checked&&!$('custom-prompt').value.trim()){
      busy=false;msg.textContent='write your strategy first — the bot has nothing to follow';return;
    }
    var body={
      mode:'custom',
      custom_prompt:$('custom-prompt').value,
      risk_tolerance:state.risk,
      max_position_pct:parseFloat($('f-maxpos').value)||10,
      max_trades_per_run:parseInt($('f-maxtrades').value)||3,
      max_daily_spend_usd:parseFloat($('f-dailycap').value)||10000,
      watchlist:$('f-watchlist').value.split(',').map(function(s){return s.trim().toUpperCase();}).filter(Boolean),
      enabled:$('f-enabled').checked,
      autopilot:$('f-autopilot').checked,
      market_hours_only:$('f-mkthrs').checked
    };
    fetch('/api/trading/strategy',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})
    .then(function(r){return r.json();}).then(function(d){
      busy=false;
      if(d.error){msg.textContent='error: '+d.error;return;}
      msg.textContent='✓ saved';banner(d.config||{});pill(d.config||{});
      setTimeout(function(){msg.textContent='';},2500);
    }).catch(function(e){busy=false;msg.textContent='failed: '+String(e&&e.message||e);});
  };

  window.runNow=function(){
    if(busy)return;busy=true;
    var btn=$('btn-run'),msg=$('save-msg');
    btn.disabled=true;btn.textContent='running…';msg.textContent='AI analysing portfolio…';
    fetch('/api/trading/strategy/run',{method:'POST'})
    .then(function(r){return r.json();}).then(function(d){
      busy=false;btn.disabled=false;btn.textContent='▶ Run now';
      msg.textContent=d.summary||d.error||'done';
      load(true);
    }).catch(function(e){busy=false;btn.disabled=false;btn.textContent='▶ Run now';msg.textContent='failed: '+String(e&&e.message||e);});
  };

  window.pendingAction=function(id,action){
    fetch('/api/trading/strategy/pending',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:id,action:action})})
    .then(function(r){return r.json();}).then(function(){load(true);}).catch(function(){load(true);});
  };

  load();
  setInterval(function(){load(true);},30000);
})();
</script>
</body>
</html>`;

export async function GET(request: NextRequest) {
  if (!(await isTraderSession())) {
    const host = (request.headers.get("x-forwarded-host") || request.headers.get("host") || "").trim();
    const proto = (request.headers.get("x-forwarded-proto") || "https").trim() || "https";
    const base = host ? `${proto}://${host}` : request.url;
    return NextResponse.redirect(new URL("/signin", base));
  }
  return new NextResponse(HTML, {
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
  });
}
