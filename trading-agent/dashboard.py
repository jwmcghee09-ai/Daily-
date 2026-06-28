#!/usr/bin/env python3
"""
dashboard.py — Myrmidon local terminal dashboard.
Run: python3 dashboard.py
Open: http://localhost:5000
"""

import json
import os
from datetime import datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

import requests
from dotenv import load_dotenv
from flask import Flask, jsonify, render_template_string

BASE = Path(__file__).parent
load_dotenv(BASE / ".env")

app = Flask(__name__)
ET = ZoneInfo("America/New_York")

ALPACA_BASE  = "https://paper-api.alpaca.markets/v2"
MEMORY_FILE  = BASE / "memory.json"
TRADES_FILE  = BASE / "trades_log.json"
SCANNER_STATE = BASE / "scanner_state.json"
SCANNER_LOG  = BASE / "scanner.log"


# ── Data helpers ──────────────────────────────────────────────────────────────

def _ah():
    return {
        "APCA-API-KEY-ID":     os.environ.get("ALPACA_API_KEY", ""),
        "APCA-API-SECRET-KEY": os.environ.get("ALPACA_API_SECRET", ""),
    }

def _get(url, **kw):
    try:
        r = requests.get(url, headers=_ah(), timeout=10, **kw)
        return r.json() if r.ok else {}
    except Exception:
        return {}

def get_account():    return _get(f"{ALPACA_BASE}/account")
def get_positions():  return _get(f"{ALPACA_BASE}/positions") or []

def read_memory():
    try:
        return json.loads(MEMORY_FILE.read_text()) if MEMORY_FILE.exists() else {}
    except Exception:
        return {}

def get_recent_trades(days=14):
    if not TRADES_FILE.exists():
        return []
    try:
        trades = json.loads(TRADES_FILE.read_text())
        cutoff = datetime.utcnow() - timedelta(days=days)
        recent = [t for t in trades if datetime.fromisoformat(t["timestamp"]) > cutoff]
        return list(reversed(recent))[:20]
    except Exception:
        return []

def get_scanner_state():
    try:
        return json.loads(SCANNER_STATE.read_text()) if SCANNER_STATE.exists() else {}
    except Exception:
        return {}

def get_log_tail(n=80):
    if not SCANNER_LOG.exists():
        return []
    try:
        with open(SCANNER_LOG, encoding="utf-8") as f:
            return [l.rstrip() for l in f.readlines()[-n:]]
    except Exception:
        return []

def is_market_open():
    now = datetime.now(ET)
    if now.weekday() >= 5:
        return False
    return now.replace(hour=9, minute=30, second=0, microsecond=0) <= now <= \
           now.replace(hour=16, minute=0, second=0, microsecond=0)


# ── API route ─────────────────────────────────────────────────────────────────

@app.route("/api/data")
def api_data():
    acct = get_account()
    raw_pos = get_positions()
    if isinstance(raw_pos, dict):
        raw_pos = []

    equity = float(acct.get("equity", 0) or 0)
    cash   = float(acct.get("cash",   0) or 0)

    positions = []
    for p in raw_pos:
        try:
            mv = float(p.get("market_value", 0) or 0)
            positions.append({
                "symbol":         p.get("symbol", ""),
                "qty":            float(p.get("qty", 0) or 0),
                "avg_entry":      float(p.get("avg_entry_price", 0) or 0),
                "current_price":  float(p.get("current_price", 0) or 0),
                "market_value":   mv,
                "unrealized_pl":  float(p.get("unrealized_pl",  0) or 0),
                "unrealized_plpc":float(p.get("unrealized_plpc",0) or 0) * 100,
                "change_today":   float(p.get("change_today",   0) or 0) * 100,
                "allocation_pct": round(mv / equity * 100, 1) if equity > 0 else 0,
            })
        except Exception:
            pass
    positions.sort(key=lambda x: x["market_value"], reverse=True)

    last_equity = float(acct.get("last_equity", 0) or 0)
    total_pl    = sum(p["unrealized_pl"] for p in positions)
    day_pl      = equity - last_equity if last_equity > 0 else 0

    mem = read_memory()
    return jsonify({
        "account": {
            "equity":           equity,
            "cash":             cash,
            "buying_power":     float(acct.get("buying_power", 0) or 0),
            "total_unrealized_pl": round(total_pl, 2),
            "day_pl":           round(day_pl, 2),
            "cash_pct":         round(cash / equity * 100, 1) if equity > 0 else 0,
        },
        "positions": positions,
        "trades":    get_recent_trades(),
        "scanner":   get_scanner_state(),
        "memory": {
            "strategy": mem.get("strategy", ""),
            "lessons":  mem.get("lessons", [])[-5:],
            "updated":  mem.get("updated", ""),
        },
        "log":         get_log_tail(80),
        "market_open": is_market_open(),
    })


# ── HTML ──────────────────────────────────────────────────────────────────────

HTML = r"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>MYRMIDON TERMINAL</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
:root{
  --bg:#07070d;--bg2:#0e0e16;--bg3:#12121c;
  --border:#222233;--amber:#ffaa00;--amber2:#ff6600;--dim:#555566;
  --green:#00e676;--red:#ff3d3d;--white:#dde0e8;--blue:#40c4ff;
}
body{
  background:var(--bg);color:var(--amber);
  font-family:'JetBrains Mono','Courier New',monospace;font-size:12px;
  height:100vh;overflow:hidden;display:flex;flex-direction:column;
}

/* TOP BAR */
#bar{
  background:#08080f;border-bottom:2px solid var(--amber2);
  display:flex;align-items:center;padding:5px 14px;gap:18px;flex-shrink:0;
}
.logo{font-size:17px;font-weight:bold;letter-spacing:5px;color:var(--white)}
.logo b{color:var(--amber)}
.pill{padding:2px 9px;border-radius:2px;font-size:10px;font-weight:bold;letter-spacing:1px}
.open{background:#001a00;color:var(--green);border:1px solid var(--green)}
.closed{background:#1a0000;color:var(--red);border:1px solid var(--red)}
#upd{color:var(--dim);font-size:10px}
#clk{margin-left:auto;color:var(--white);font-size:12px;letter-spacing:2px}

/* GRID */
#grid{
  display:grid;
  grid-template-columns:250px 1fr 300px;
  grid-template-rows:1fr 1fr 130px;
  gap:1px;background:var(--border);flex:1;overflow:hidden;
}
.panel{background:var(--bg2);display:flex;flex-direction:column;overflow:hidden}
.ph{
  background:var(--bg3);border-bottom:1px solid var(--border);
  padding:4px 10px;color:var(--white);font-size:9px;letter-spacing:2px;
  text-transform:uppercase;display:flex;align-items:center;gap:7px;flex-shrink:0;
}
.dot{width:5px;height:5px;border-radius:50%;background:var(--amber);animation:bl 2s infinite}
@keyframes bl{0%,100%{opacity:1}50%{opacity:.15}}
.pb{padding:10px;overflow-y:auto;flex:1}

/* ACCOUNT */
.srow{display:flex;justify-content:space-between;align-items:baseline;
  padding:5px 0;border-bottom:1px solid #111120}
.sl{color:var(--dim);font-size:10px;letter-spacing:1px;text-transform:uppercase}
.sv{font-size:13px;color:var(--white);font-weight:bold}
.sv.big{font-size:22px;color:var(--amber)}
.g{color:var(--green)!important}.r{color:var(--red)!important}

/* POSITIONS */
.pt{width:100%;border-collapse:collapse}
.pt th{color:var(--dim);font-size:9px;letter-spacing:1px;text-transform:uppercase;
  text-align:right;padding:3px 5px;border-bottom:1px solid var(--border)}
.pt th:first-child{text-align:left}
.pt td{padding:5px 5px;text-align:right;border-bottom:1px solid #10101a;font-size:11px}
.pt td:first-child{text-align:left;color:var(--white);font-weight:bold}
.pt tr:hover td{background:#13131f}
.ab{height:3px;background:#222236;border-radius:1px;margin-top:2px}
.abf{height:100%;background:var(--amber);border-radius:1px}

/* SCANNER */
.kv{display:flex;justify-content:space-between;padding:4px 0;
  border-bottom:1px solid #10101a;font-size:11px}
.kv .k{color:var(--dim)}.kv .v{color:var(--white)}
.badge{padding:1px 7px;font-size:10px;font-weight:bold;letter-spacing:1px}
.badge.inv{color:var(--green);border:1px solid var(--green);background:#001a00}
.badge.sk{color:var(--dim);border:1px solid var(--dim)}

/* TRADES */
.tr2{padding:5px 0;border-bottom:1px solid #10101a;line-height:1.6}
.tr2 .th{display:flex;align-items:center;gap:7px}
.ts{color:var(--white);font-weight:bold;font-size:13px}
.tb{font-size:10px;padding:1px 5px;border:1px solid var(--green);color:var(--green)}
.ts2{font-size:10px;padding:1px 5px;border:1px solid var(--red);color:var(--red)}
.tp{color:var(--amber)}.tts{color:var(--dim);font-size:9px;margin-left:auto}
.trr{color:#888;font-size:10px;margin-top:2px}

/* MEMORY */
.mtext{color:#bbb;font-size:10px;line-height:1.75;white-space:pre-wrap;word-break:break-word}
.lsn{padding:5px 0;border-bottom:1px solid #10101a;color:#999;font-size:10px;line-height:1.5}
.ldt{color:var(--amber2);font-size:9px}

/* LOG */
#lp{grid-column:1/-1}
.lb{padding:5px 10px;overflow-y:auto;height:100%;display:flex;flex-direction:column-reverse}
.ll{font-size:10px;color:#555;line-height:1.5;padding:1px 0;
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ll.an{color:var(--amber)}
.ll.iv{color:var(--green)}
.ll.er{color:var(--red)}
.ll.sc{color:#333}

/* SCROLLBARS */
::-webkit-scrollbar{width:3px}
::-webkit-scrollbar-track{background:var(--bg)}
::-webkit-scrollbar-thumb{background:var(--border);border-radius:2px}

/* SPLASH */
#splash{position:fixed;inset:0;background:var(--bg);display:flex;
  align-items:center;justify-content:center;flex-direction:column;gap:14px;z-index:99}
.sl2{font-size:22px;letter-spacing:8px;color:var(--amber)}
.sl3{font-size:10px;letter-spacing:3px;color:var(--dim)}
</style>
</head>
<body>

<div id="splash">
  <div class="sl2">MYRMIDON</div>
  <div class="sl3">CONNECTING TO ALPACA...</div>
</div>

<div id="bar">
  <div class="logo">MYR<b>●</b>MIDON</div>
  <div id="mpill" class="pill closed">○ MARKET CLOSED</div>
  <div id="upd"></div>
  <div id="clk"></div>
</div>

<div id="grid">

  <div class="panel" style="grid-row:1/3">
    <div class="ph"><div class="dot"></div>ACCOUNT</div>
    <div class="pb" id="acct"></div>
  </div>

  <div class="panel" style="grid-row:1/3">
    <div class="ph"><div class="dot"></div>POSITIONS</div>
    <div class="pb" id="pos"></div>
  </div>

  <div class="panel">
    <div class="ph"><div class="dot"></div>SCANNER</div>
    <div class="pb" id="scan"></div>
  </div>

  <div class="panel">
    <div class="ph"><div class="dot"></div>RECENT TRADES</div>
    <div class="pb" id="trd"></div>
  </div>

  <div class="panel" style="grid-column:1/3">
    <div class="ph"><div class="dot"></div>STRATEGY MEMORY</div>
    <div class="pb" id="mem"></div>
  </div>

  <div class="panel">
    <div class="ph"><div class="dot"></div>LESSONS</div>
    <div class="pb" id="lsn"></div>
  </div>

  <div class="panel" id="lp">
    <div class="ph"><div class="dot"></div>LIVE LOG</div>
    <div class="lb" id="log"></div>
  </div>

</div>

<script>
const f2=(n,d=2)=>n==null?'—':Number(n).toLocaleString('en-US',{minimumFractionDigits:d,maximumFractionDigits:d});
const fusd=n=>n==null?'—':'$'+f2(Math.abs(n),2);
const sgn=n=>n>=0?'+':'';
const gc=n=>n>=0?'g':'r';
const esc=s=>s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

function renderAcct(a){
  return[
    ['PORTFOLIO VALUE',`<span class="sv big">${'$'+f2(a.equity)}</span>`],
    ['CASH',`<span class="sv ${a.cash_pct<20?'r':'g'}">${'$'+f2(a.cash)} (${f2(a.cash_pct,1)}%)</span>`],
    ['BUYING POWER',`<span class="sv">${'$'+f2(a.buying_power)}</span>`],
    ['UNREALIZED P&amp;L',`<span class="sv ${gc(a.total_unrealized_pl)}">${sgn(a.total_unrealized_pl)}${fusd(a.total_unrealized_pl)}</span>`],
    ['TODAY P&amp;L',`<span class="sv ${gc(a.day_pl)}">${sgn(a.day_pl)}${fusd(a.day_pl)}</span>`],
  ].map(([l,v])=>`<div class="srow"><span class="sl">${l}</span>${v}</div>`).join('');
}

function renderPos(ps){
  if(!ps.length) return '<div style="color:#333;padding:20px 0">No open positions</div>';
  const rows=ps.map(p=>{
    const w=Math.min(Math.abs(p.allocation_pct)*2,100);
    return`<tr>
      <td>${p.symbol}<div class="ab"><div class="abf" style="width:${w}%"></div></div></td>
      <td style="color:#888">${f2(p.qty,0)}</td>
      <td>$${f2(p.current_price)}</td>
      <td class="${gc(p.unrealized_plpc)}">${sgn(p.unrealized_plpc)}${f2(p.unrealized_plpc,1)}%</td>
      <td class="${gc(p.unrealized_pl)}">${sgn(p.unrealized_pl)}$${f2(Math.abs(p.unrealized_pl),0)}</td>
      <td style="color:#888">${p.allocation_pct}%</td>
    </tr>`;
  }).join('');
  return`<table class="pt"><thead><tr>
    <th>SYM</th><th>QTY</th><th>PRICE</th><th>P&amp;L%</th><th>P&amp;L$</th><th>ALLOC</th>
  </tr></thead><tbody>${rows}</tbody></table>`;
}

function renderScan(s){
  if(!s||!Object.keys(s).length) return '<div style="color:#333">No scanner data yet</div>';
  const cds=Object.keys(s.cooldowns||{});
  return[
    ['DATE', s.date||'—'],
    ['AGENT RUNS', `${s.opus_count||0} / 5`],
    ['EST COST', `$${(s.cost_usd||0).toFixed(2)}`],
    ['COOLDOWNS', cds.length?cds.join(', '):'none'],
  ].map(([k,v])=>`<div class="kv"><span class="k">${k}</span><span class="v">${v}</span></div>`).join('');
}

function renderTrades(ts){
  if(!ts.length) return '<div style="color:#333;padding:20px 0">No recent trades</div>';
  return ts.slice(0,12).map(t=>{
    const d=new Date(t.timestamp+'Z');
    const ts2=d.toLocaleString('en-AU',{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'});
    const sc=t.side==='buy'?'tb':'ts2';
    return`<div class="tr2">
      <div class="th">
        <span class="ts">${t.symbol}</span>
        <span class="${sc}">${t.side.toUpperCase()}</span>
        <span style="color:#888">${f2(t.qty,0)} @ </span>
        <span class="tp">$${f2(t.price)}</span>
        <span class="tts">${ts2}</span>
      </div>
      <div class="trr">${esc(t.reason||'')}</div>
    </div>`;
  }).join('');
}

function renderMem(m){
  if(!m.strategy) return '<div style="color:#333">No strategy recorded yet</div>';
  return`<pre class="mtext">${esc(m.strategy)}</pre>`;
}

function renderLsn(ls){
  if(!ls.length) return '<div style="color:#333">No lessons yet</div>';
  return[...ls].reverse().map(l=>`<div class="lsn"><div class="ldt">${l.date||''}</div>${esc(l.lesson||'')}</div>`).join('');
}

function classLog(line){
  const l=line.toLowerCase();
  if(l.includes('⚡')||l.includes('anomal')) return 'an';
  if(l.includes('trigger')||l.includes('invoke')) return 'iv';
  if(l.includes('error')||l.includes('fail')) return 'er';
  if(l.includes('scan start')||l.includes('scan end')||l.includes('market closed')) return 'sc';
  return'';
}

function renderLog(lines){
  return lines.map(l=>`<div class="ll ${classLog(l)}">${esc(l)}</div>`).join('');
}

setInterval(()=>{
  const now=new Date();
  document.getElementById('clk').textContent=
    now.toLocaleTimeString('en-AU',{hour:'2-digit',minute:'2-digit',second:'2-digit'})+' AEST';
},1000);

async function refresh(){
  try{
    const d=await(await fetch('/api/data')).json();
    document.getElementById('acct').innerHTML=renderAcct(d.account);
    document.getElementById('pos').innerHTML=renderPos(d.positions);
    document.getElementById('scan').innerHTML=renderScan(d.scanner);
    document.getElementById('trd').innerHTML=renderTrades(d.trades);
    document.getElementById('mem').innerHTML=renderMem(d.memory);
    document.getElementById('lsn').innerHTML=renderLsn(d.memory.lessons);
    document.getElementById('log').innerHTML=renderLog(d.log);
    const pill=document.getElementById('mpill');
    if(d.market_open){pill.textContent='● MARKET OPEN';pill.className='pill open';}
    else{pill.textContent='○ MARKET CLOSED';pill.className='pill closed';}
    document.getElementById('upd').textContent='UPDATED '+new Date().toLocaleTimeString();
    document.getElementById('splash').style.display='none';
  }catch(e){console.error(e);}
}

refresh();
setInterval(refresh,15000);
</script>
</body>
</html>"""


@app.route("/")
def index():
    return render_template_string(HTML)


if __name__ == "__main__":
    print("=" * 44)
    print("  MYRMIDON TERMINAL  →  http://localhost:5000")
    print("  Ctrl+C to stop")
    print("=" * 44)
    app.run(host="127.0.0.1", port=5000, debug=False)
