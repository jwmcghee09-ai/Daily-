// Global error catcher
window.addEventListener('error',function(ev){
  var e=document.getElementById('myrm-api-status');
  if(e)e.textContent='JS ERROR: '+(ev.message||ev)+(ev.filename?' @ '+ev.filename+':'+ev.lineno:'');
});
(function(){
  var loading=false;
  var CORE_ETFS={SPY:0.40,QQQ:0.20,VEA:0.15};
  function setStatus(msg,col){
    var e=document.getElementById('myrm-api-status');
    if(e){e.textContent=msg;e.style.color=col||'#ff7a30';}
  }
  var BROAD_ETFS={'IWM':1,'VTI':1,'IVV':1,'DIA':1,'GLD':1,'TLT':1,'BND':1,'AGG':1,
    'XLE':1,'XLF':1,'XLV':1,'XLI':1,'XLY':1,'XLP':1,'XLU':1,'XLB':1,'XLRE':1,'XLK':1,
    'VNQ':1,'EFA':1,'EEM':1,'VWO':1,'VO':1,'VB':1,'SCHD':1,'JEPI':1,'JEPQ':1};

  // Two feeds render through this page: a broker account (USD figures, needs
  // AUD conversion, has sleeve targets) and the user's imported portfolio
  // (already AUD, no targets, sleeves decided server-side). `isPortfolio` is
  // set from the payload before anything renders.
  var isPortfolio=false;
  var sleeves=null;

  function fmtUsd(n){return n==null?'—':'$'+Math.round(n).toLocaleString();}
  // Money already in AUD needs no conversion; USD money divides by the rate.
  function fmtAudP(n,rate){
    if(n==null)return'—';
    if(isPortfolio)return'A$'+Math.round(n).toLocaleString();
    return !rate?fmtUsd(n):'A$'+Math.round(n/rate).toLocaleString();
  }
  function fmtNat(n,dec){
    var v=parseFloat(n);
    if(n==null||isNaN(v))return'—';
    return(isPortfolio?'A$':'$')+(dec!=null?v.toFixed(dec):Math.round(v).toLocaleString());
  }
  function fmtPct(n){if(n==null)return'—';var s=n>=0?'+':'';return s+n.toFixed(2)+'%';}
  // The sign belongs in front of the currency symbol, not in front of the digits.
  function fmtSigned(n,fx){
    var v=parseFloat(n);
    if(n==null||isNaN(v))return'—';
    return(v>=0?'+A$':'-A$')+Math.round(Math.abs(v)/(fx||1)).toLocaleString();
  }

  function setText(id,txt){var e=document.getElementById(id);if(e)e.textContent=txt;}

  /** Relabel the parts of the static markup that name a currency or a broker. */
  function applyFeedLabels(d){
    isPortfolio=(d&&d.source)==='portfolio';
    sleeves=(d&&d.sleeves)||null;
    // The eyebrow names the feed; the detail lives in the status line below it.
    setText('myrm-feed-label',isPortfolio?'Myrmidon · Your Imported Portfolio':'Myrmidon · Alpaca Paper Trading');
    setText('myrm-curve-label',isPortfolio?'Portfolio Value — one point per import':'30-Day Equity Curve');
    if(sleeves){
      if(sleeves.core&&sleeves.core.label)setText('myrm-core-label',sleeves.core.label);
      if(sleeves.alpha&&sleeves.alpha.label)setText('myrm-alpha-label',sleeves.alpha.label);
    }
    var priceLabel=isPortfolio?'Price A$':'Price $';
    var els=document.querySelectorAll('.myrm-th-price');
    for(var i=0;i<els.length;i++)els[i].textContent=priceLabel;
    setText('myrm-orders-label',isPortfolio?'Forwarded Trades Awaiting Review':'Open Orders');
    setText('myrm-trades-label',isPortfolio?'Trades From Forwarded Contract Notes':'Recent Filled Trades');
    setText('myrm-trades-th-price',isPortfolio?'Fill Price A$':'Fill Price $');
    setText('myrm-trades-th-alt',isPortfolio?'Broker':'Total (USD)');
  }

  function setAll(msg){
    var g=document.getElementById('myrm-metrics-grid');
    var svg=document.getElementById('myrm-equity-chart');
    var tb=document.getElementById('myrm-trades-tbody');
    var core=document.getElementById('myrm-core-tbody');
    var alpha=document.getElementById('myrm-alpha-tbody');
    var orders=document.getElementById('myrm-orders-tbody');
    var risk=document.getElementById('myrm-risk-sigs');
    if(g)g.innerHTML='<div style="color:#ff7a30;font-family:monospace;font-size:.72rem;padding:.5rem 0">'+msg+'</div>';
    if(svg)svg.innerHTML='<text x="50%" y="50%" text-anchor="middle" fill="rgba(255,106,82,.35)" font-size="11" font-family="monospace">'+msg+'</text>';
    if(tb)tb.innerHTML='<tr><td colspan="7" style="text-align:center;color:rgba(255,106,82,.35);padding:1.5rem;font-family:monospace;font-size:.7rem">'+msg+'</td></tr>';
    if(core)core.innerHTML='<tr><td colspan="7" style="text-align:center;color:rgba(255,106,82,.35);padding:1rem;font-family:monospace;font-size:.7rem">'+msg+'</td></tr>';
    if(alpha)alpha.innerHTML='<tr><td colspan="7" style="text-align:center;color:rgba(255,106,82,.35);padding:1rem;font-family:monospace;font-size:.7rem">'+msg+'</td></tr>';
    if(orders)orders.innerHTML='<tr><td colspan="6" style="text-align:center;color:rgba(255,106,82,.35);padding:1rem;font-family:monospace;font-size:.7rem">'+msg+'</td></tr>';
    if(risk)risk.innerHTML='<span class="myrm-sig myrm-sig-amb">'+msg+'</span>';
  }

  async function loadAnalytics(){
    if(loading)return;
    loading=true;
    setStatus('⟳ Loading portfolio analytics…');
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
        if(res.status===403)em='Auth failed — sign out and back in';
        setStatus('✗ '+em,'#f87171');setAll(em);loading=false;return;
      }
      if(!d.account){
        var em3='No account or portfolio data returned';
        setStatus('✗ '+em3,'#f87171');setAll(em3);loading=false;return;
      }
      renderAll(d);
      setStatus('✓ '+(d.sourceLabel||'Loaded'),'#4ade80');
    }catch(e){
      var msg=e.name==='AbortError'?'Timed out (12s) — the data source is slow or unreachable':('Fetch error: '+(e.message||e));
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

  function renderMetrics(acct,hist,rate,positions){
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
    var nativeSub=function(v){return isPortfolio?'AUD':fmtUsd(v)+' USD';};
    var cards=[
      card('Portfolio '+(isPortfolio?'Value':'Equity'),fmtAudP(equity,rate),nativeSub(equity),'#fff'),
      card(isPortfolio?'Return Since First Snapshot':'30-Day Return',fmtPct(retPct),(pos?'+':'')+fmtAudP(Math.abs(retUsd),rate),col),
      card('Max Drawdown'+(isPortfolio?'':' (30d)'),maxDd>0?'-'+maxDd.toFixed(2)+'%':'0%','vs period start',maxDd>5?'#f87171':maxDd>2?'#ff7a30':'#4ade80'),
      card(isPortfolio?'Cash & Savings':'Uninvested Cash',fmtAudP(cash,rate),cashPct.toFixed(1)+'% of '+(isPortfolio?'portfolio':'equity'),cashCol),
    ];
    if(isPortfolio){
      // Buying power is a broker concept. For an imported portfolio the useful
      // fifth figure is what the holdings are actually up or down overall.
      var totalPl=0,totalCost=0;
      (positions||[]).forEach(function(p){
        totalPl+=parseFloat(p.unrealized_pl)||0;
        totalCost+=parseFloat(p.cost_basis)||0;
      });
      var plPct=totalCost>0?totalPl/totalCost*100:0;
      cards.push(card('Total Gain / Loss',(totalPl>=0?'+':'-')+fmtAudP(Math.abs(totalPl),rate),
        totalCost>0?fmtPct(plPct)+' on cost base':'no cost base recorded',
        totalPl>=0?'#4ade80':'#f87171'));
    }else{
      cards.push(card('Buying Power',fmtAudP(bp,rate),nativeSub(bp),'#fff'));
    }
    g.innerHTML=cards.join('');
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
      ms.style.color=isOpen?'#4ade80':'rgba(255,106,82,.4)';
    }
  }

  function renderRisk(acct,positions,macro){
    var el=document.getElementById('myrm-risk-sigs');if(!el)return;
    var sigs=[];
    var equity=parseFloat((acct&&acct.equity)||0);
    var cash=parseFloat((acct&&acct.cash)||0);
    var bp=parseFloat((acct&&acct.buying_power)||0);
    var pos=positions||[];

    // 1. Cash floor. A trading account must hold a buffer; an imported
    // portfolio holding no cash just means no savings file was uploaded, so
    // there the figure is reported without a warning.
    var cashPct=equity>0?cash/equity*100:0;
    if(isPortfolio)sigs.push({cls:'myrm-sig-ok',txt:'CASH '+cashPct.toFixed(1)+'%'});
    else if(cashPct<3)sigs.push({cls:'myrm-sig-red',txt:'LOW CASH '+cashPct.toFixed(1)+'%'});
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

    if(isPortfolio){
      // 4p. Top-3 concentration — the standard read on an imported portfolio,
      // where SPY/QQQ sleeve targets mean nothing.
      var mvs=pos.map(function(p){return parseFloat(p.market_value)||0;}).sort(function(a,b){return b-a;});
      var top3=mvs.slice(0,3).reduce(function(s,v){return s+v;},0);
      var top3Pct=equity>0?top3/equity*100:0;
      if(top3Pct>70)sigs.push({cls:'myrm-sig-red',txt:'TOP3 '+top3Pct.toFixed(0)+'%'});
      else if(top3Pct>50)sigs.push({cls:'myrm-sig-amb',txt:'TOP3 '+top3Pct.toFixed(0)+'%'});
      else sigs.push({cls:'myrm-sig-ok',txt:'TOP3 '+top3Pct.toFixed(0)+'%'});

      // 5p. Largest sector weight among directly held positions. Index funds
      // and super are spread by construction, so counting them would flag
      // "Diversified 60% — sector heavy", which is the opposite of the truth.
      var bySector={},directMv=0;
      pos.forEach(function(p){
        if(p.sleeve==='core')return;
        var s=p.sector||'—';
        var mv=parseFloat(p.market_value)||0;
        bySector[s]=(bySector[s]||0)+mv;
        directMv+=mv;
      });
      var topSector='',topSectorMv=0;
      Object.keys(bySector).forEach(function(s){if(bySector[s]>topSectorMv){topSectorMv=bySector[s];topSector=s;}});
      var sectorPct=directMv>0?topSectorMv/directMv*100:0;
      if(topSector&&topSector!=='—'){
        var sTxt=topSector.slice(0,14).toUpperCase()+' '+sectorPct.toFixed(0)+'% OF DIRECT';
        if(sectorPct>45)sigs.push({cls:'myrm-sig-red',txt:sTxt});
        else if(sectorPct>30)sigs.push({cls:'myrm-sig-amb',txt:sTxt});
        else sigs.push({cls:'myrm-sig-ok',txt:sTxt});
      }
    }else{
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
    }

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

    // 10. Buying power headroom (broker accounts only)
    if(!isPortfolio){
      var bpPct=equity>0?bp/equity*100:100;
      if(bpPct<5)sigs.push({cls:'myrm-sig-amb',txt:'BP LOW '+bpPct.toFixed(0)+'%'});
      else sigs.push({cls:'myrm-sig-ok',txt:'BP '+bpPct.toFixed(0)+'%'});
    }

    el.innerHTML=sigs.map(function(s){return'<span class="myrm-sig '+s.cls+'">'+s.txt+'</span>';}).join('');
  }

  function renderPositions(positions,equity,rate){
    var fxP=isPortfolio?1:(rate||1);
    var core=[],alpha=[];
    (positions||[]).forEach(function(p){
      // The portfolio feed decides the sleeve server-side (index/fund/super vs
      // direct holdings); the broker feed falls back to the ETF lists.
      var isCore=p.sleeve?p.sleeve==='core':!!(CORE_ETFS[p.symbol]||BROAD_ETFS[p.symbol]);
      if(isCore)core.push(p);else alpha.push(p);
    });
    function posRow(p){
      var mv=parseFloat(p.market_value)||0,qty=parseFloat(p.qty)||0,price=parseFloat(p.current_price)||0;
      var unrl=parseFloat(p.unrealized_pl)||0,dayChg=parseFloat(p.change_today)||0,dayPl=parseFloat(p.unrealized_intraday_pl)||0;
      var dc=dayChg>=0?'#4ade80':'#f87171',pc=unrl>=0?'#4ade80':'#f87171';
      var label=p.name&&p.name!==p.symbol?' title="'+String(p.name).replace(/"/g,'&quot;')+'"':'';
      return'<tr>'+
        '<td style="font-weight:600;color:#fff"'+label+'>'+p.symbol+'</td>'+
        '<td style="text-align:right;font-family:monospace;color:rgba(255,106,82,.6)">'+qty.toFixed(qty%1?4:0)+'</td>'+
        '<td style="text-align:right;font-family:monospace;color:#5fb8ff">'+fmtNat(price,2)+'</td>'+
        '<td style="text-align:right;font-family:monospace">A$'+Math.round(mv/fxP).toLocaleString()+'</td>'+
        '<td style="text-align:right;font-family:monospace;font-size:.7rem;color:'+dc+'">'+(dayChg>=0?'+':'')+(dayChg*100).toFixed(2)+'%</td>'+
        '<td style="text-align:right;font-family:monospace;font-size:.7rem;color:'+dc+'">'+fmtSigned(dayPl,fxP)+'</td>'+
        '<td style="text-align:right;font-family:monospace;font-size:.7rem;color:'+pc+'">'+fmtSigned(unrl,fxP)+'</td>'+
      '</tr>';
    }
    var empty='<tr><td colspan="7" style="text-align:center;color:rgba(255,106,82,.35);padding:1rem;font-family:monospace;font-size:.7rem">';
    var base=isPortfolio?'portfolio':'equity';
    function weight(rows,target){
      if(!(equity>0))return'';
      var mv=rows.reduce(function(s,p){return s+(parseFloat(p.market_value)||0);},0);
      return(mv/equity*100).toFixed(1)+'% of '+base+(target!=null?' · target '+target+'%':'');
    }
    var coreTarget=sleeves&&sleeves.core?sleeves.core.targetPct:70;
    var alphaTarget=sleeves&&sleeves.alpha?sleeves.alpha.targetPct:30;
    var coreTb=document.getElementById('myrm-core-tbody'),coreEl=document.getElementById('myrm-core-pct');
    if(coreTb){
      if(!core.length){coreTb.innerHTML=empty+(isPortfolio?'No index, fund or super holdings':'No core positions')+'</td></tr>';
        if(coreEl)coreEl.textContent='';}
      else{
        coreTb.innerHTML=core.map(posRow).join('');
        if(coreEl)coreEl.textContent=weight(core,coreTarget);
      }
    }
    var alphaTb=document.getElementById('myrm-alpha-tbody'),alphaEl=document.getElementById('myrm-alpha-pct');
    if(alphaTb){
      if(!alpha.length){alphaTb.innerHTML=empty+(isPortfolio?'No direct holdings':'No alpha positions')+'</td></tr>';
        if(alphaEl)alphaEl.textContent='';}
      else{
        alphaTb.innerHTML=alpha.map(posRow).join('');
        if(alphaEl)alphaEl.textContent=weight(alpha,alphaTarget);
      }
    }
  }

  function renderOpenOrders(openOrders){
    var tb=document.getElementById('myrm-orders-tbody');if(!tb)return;
    if(!openOrders||!openOrders.length){
      tb.innerHTML='<tr><td colspan="6" style="text-align:center;color:rgba(255,106,82,.35);padding:1rem;font-family:monospace;font-size:.7rem">'+
        (isPortfolio?'Nothing awaiting review — forward a broker confirmation email to add trades':'No open orders')+'</td></tr>';return;
    }
    tb.innerHTML=openOrders.map(function(o){
      var isBuy=o.side==='buy';var sc=isBuy?'#4ade80':'#f87171';
      var qty=parseFloat(o.qty||o.notional||0);
      var dt=o.submitted_at?new Date(o.submitted_at).toLocaleString('en-AU',{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'}):'—';
      return'<tr>'+
        '<td style="font-weight:600;color:#fff">'+o.symbol+'</td>'+
        '<td style="color:'+sc+';font-family:monospace;font-size:.65rem;font-weight:700">'+(isBuy?'↑ BUY':'↓ SELL')+'</td>'+
        '<td style="text-align:right;font-family:monospace">'+qty.toLocaleString()+'</td>'+
        '<td style="font-family:monospace;font-size:.68rem;color:rgba(255,106,82,.7)">'+o.type+'</td>'+
        '<td style="font-family:monospace;font-size:.65rem;color:#ff7a30">'+o.status+'</td>'+
        '<td style="text-align:right;color:rgba(255,106,82,.5);font-size:.68rem">'+dt+'</td>'+
      '</tr>';
    }).join('');
  }

  function renderChart(hist,rate){
    var svg=document.getElementById('myrm-equity-chart');
    if(!svg)return;
    if(!hist||!hist.equity){svg.innerHTML='<text x="50%" y="50%" text-anchor="middle" fill="rgba(255,106,82,.35)" font-size="11" font-family="monospace">'+
      (isPortfolio?'Not enough history yet — a point is recorded each time you import':'No history data')+'</text>';return;}
    var fx=isPortfolio?1:(rate||1);
    var vals=hist.equity.filter(function(v){return v!=null&&v>0;}).map(function(v){return v/fx;});
    var ts=hist.timestamp||[];
    if(vals.length<2){svg.innerHTML='<text x="50%" y="50%" text-anchor="middle" fill="rgba(255,106,82,.35)" font-size="11" font-family="monospace">Not enough data</text>';return;}
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
    '<text x="'+PX+'" y="'+(H-3)+'" font-family="monospace" font-size="8" fill="rgba(255,106,82,.45)">'+fmtD(ts[0])+'</text>'+
    '<text x="'+(W-PX)+'" y="'+(H-3)+'" font-family="monospace" font-size="8" fill="rgba(255,106,82,.45)" text-anchor="end">'+fmtD(ts[ts.length-1])+'</text>'+
    '<text x="'+(tx(vals.length-1)-6)+'" y="'+(ty(end)-7)+'" font-family="monospace" font-size="10" fill="'+col+'" text-anchor="end">'+((isPortfolio||rate)?'A$':'$')+Math.round(end).toLocaleString()+'</text>';
  }

  function renderTrades(orders,rate){
    var tb=document.getElementById('myrm-trades-tbody');if(!tb)return;
    var filled=(orders||[]).filter(function(o){return o.status==='filled'&&o.filled_avg_price;});
    if(!filled.length){tb.innerHTML='<tr><td colspan="7" style="text-align:center;color:rgba(255,106,82,.35);padding:1.5rem;font-family:monospace;font-size:.7rem">'+
      (isPortfolio?'No trades yet — forward a CommSec, Selfwealth or Stake confirmation to your SPECTRE address':'No filled trades yet')+'</td></tr>';return;}
    tb.innerHTML=filled.slice(0,100).map(function(o){
      var isBuy=o.side==='buy';var sc=isBuy?'#4ade80':'#ff7a30';
      var price=parseFloat(o.filled_avg_price)||0;
      var qty=parseFloat(o.filled_qty)||parseFloat(o.qty)||0;
      var total=price*qty;
      var dt=o.filled_at?new Date(o.filled_at).toLocaleDateString('en-AU',{month:'short',day:'numeric',year:'2-digit',hour:'2-digit',minute:'2-digit'}):'—';
      var audVal=isPortfolio?'A$'+Math.round(total).toLocaleString():(rate?'A$'+Math.round(total/rate).toLocaleString():'$'+Math.round(total).toLocaleString());
      // Last column: the source broker for ingested trades, the USD total for
      // a broker account whose figures are USD in the first place.
      var alt=isPortfolio?String(o.broker||o.type||'—'):'$'+Math.round(total).toLocaleString();
      return'<tr>'+
        '<td style="font-weight:600;color:#fff">'+o.symbol+'</td>'+
        '<td style="color:'+sc+';font-family:monospace;font-size:.65rem;font-weight:700">'+(isBuy?'↑ BUY':'↓ SELL')+'</td>'+
        '<td style="text-align:right;font-family:monospace">'+qty.toLocaleString()+'</td>'+
        '<td style="text-align:right;font-family:monospace">'+fmtNat(price,2)+'</td>'+
        '<td style="text-align:right;font-family:monospace">'+audVal+'</td>'+
        '<td style="text-align:right;font-family:monospace;color:rgba(255,106,82,.7)">'+alt+'</td>'+
        '<td style="text-align:right;color:rgba(255,106,82,.5);font-size:.68rem">'+dt+'</td>'+
      '</tr>';
    }).join('');
  }

  var dataLoadedAt = 0; // timestamp of last successful render

  function renderAll(d){
    if(!d||!d.account)return false;
    applyFeedLabels(d);
    var eq=parseFloat(d.account.equity)||0;
    renderMetrics(d.account,d.history,d.audUsdRate,d.positions);
    renderChart(d.history,d.audUsdRate);
    renderTrades(d.orders,d.audUsdRate);
    renderMacro(d.macro);
    renderRisk(d.account,d.positions,d.macro);
    renderPositions(d.positions,eq,d.audUsdRate);
    renderOpenOrders(d.openOrders);
    dataLoadedAt = Date.now();
    return true;
  }

  // Render immediately from server-injected preload (no fetch, no delay).
  if(window.__MYRM_PRELOAD){
    try{
      var label=window.__MYRM_PRELOAD.sourceLabel||'Loaded';
      var ok=renderAll(window.__MYRM_PRELOAD);
      window.__MYRM_PRELOAD=null;
      setStatus(ok?'✓ '+label:'✗ Preload had no account data',ok?'#4ade80':'#f87171');
    }catch(pe){setStatus('✗ Render error: '+(pe&&pe.message||pe),'#f87171');setAll('Render error: '+(pe&&pe.message||pe));}
  } else {
    // No server preload — load from the API immediately (no delay).
    loadAnalytics();
  }

  // Intercept window._currentTab (set by switchTab in the dashboard).
  // Only trigger a fresh load if no data loaded yet, or data is > 5 min old.
  var _ctVal=window._currentTab;
  try{
    Object.defineProperty(window,'_currentTab',{configurable:true,
      get:function(){return _ctVal;},
      set:function(v){
        _ctVal=v;
        if(v==='analytics'&&!loading&&(Date.now()-dataLoadedAt>300000)){
          setTimeout(loadAnalytics,20);
        }
      }
    });
  }catch(e){
    // Fallback: click listener (only if data is stale)
    document.addEventListener('click',function(ev){
      var t=ev.target;
      while(t&&t!==document){
        if(t.getAttribute&&t.getAttribute('data-tab')==='analytics'){
          if(!loading&&(Date.now()-dataLoadedAt>300000))setTimeout(loadAnalytics,30);
          break;
        }
        t=t.parentElement;
      }
    },true);
  }

  // Refresh button + programmatic access
  window.myrmLoadAnalytics = loadAnalytics;
  window.myrmRefreshAnalytics = function(){ loading=false; dataLoadedAt=0; loadAnalytics(); };

  // ── Ticker search ──
  var tickerBusy=false;
  window.myrmTickerSearch=function(ev){
    if(ev&&ev.preventDefault)ev.preventDefault();
    if(tickerBusy)return;
    var inp=document.getElementById('myrm-ticker-input');
    var out=document.getElementById('myrm-ticker-result');
    var btn=document.getElementById('myrm-ticker-btn');
    if(!inp||!out)return;
    var sym=String(inp.value||'').trim().toUpperCase().replace(/[^A-Z0-9.]/g,'');
    if(!sym){out.innerHTML='<span style="font-family:monospace;font-size:.62rem;color:#f87171">Enter a ticker symbol</span>';return;}
    tickerBusy=true;if(btn){btn.disabled=true;btn.textContent='…';}
    out.innerHTML='<span style="font-family:monospace;font-size:.62rem;color:rgba(255,106,82,.5)">Loading '+sym+'…</span>';
    fetch('/api/trading/chart?symbol='+encodeURIComponent(sym)+'&days=90')
      .then(function(r){return r.json();})
      .then(function(d){
        tickerBusy=false;if(btn){btn.disabled=false;btn.textContent='Search';}
        var bars=(d&&d.bars)||[];
        if(bars.length<5){out.innerHTML='<span style="font-family:monospace;font-size:.62rem;color:#f87171">No data for '+sym+' — check the symbol. ASX codes need a .AX suffix (BHP.AX).</span>';return;}
        var last=bars[bars.length-1],first=bars[0];
        var chg=first.close>0?(last.close-first.close)/first.close*100:0;
        var dayChg=bars.length>1&&bars[bars.length-2].close>0?(last.close-bars[bars.length-2].close)/bars[bars.length-2].close*100:0;
        var hi=Math.max.apply(null,bars.map(function(b){return b.high;}));
        var lo=Math.min.apply(null,bars.map(function(b){return b.low;}));
        var rsi=last.rsi,rsiCol=rsi==null?'#666':rsi>70?'#f87171':rsi<30?'#4ade80':'#ff6a52';
        var trendUp=last.ema50!=null&&last.ema200!=null?last.ema50>last.ema200:null;
        var cCol=chg>=0?'#4ade80':'#f87171';
        function stat(l,v,c){return '<div style="min-width:100px"><div style="font-family:monospace;font-size:.5rem;letter-spacing:.1em;text-transform:uppercase;color:rgba(255,106,82,.45);margin-bottom:.15rem">'+l+'</div><div style="font-family:monospace;font-size:.95rem;font-weight:600;color:'+(c||'#fff')+'">'+v+'</div></div>';}
        var html='<div style="display:flex;flex-wrap:wrap;gap:1.2rem;align-items:flex-end;margin:.4rem 0 .8rem">'+
          '<div><div style="font-family:monospace;font-size:1.5rem;font-weight:700;color:#fff">'+sym+' <span style="font-size:1.1rem">$'+last.close.toFixed(2)+'</span></div>'+
          '<div style="font-family:monospace;font-size:.62rem;color:'+(dayChg>=0?'#4ade80':'#f87171')+'">'+(dayChg>=0?'+':'')+dayChg.toFixed(2)+'% today</div></div>'+
          stat('90d change',(chg>=0?'+':'')+chg.toFixed(1)+'%',cCol)+
          stat('90d range','$'+lo.toFixed(2)+' – $'+hi.toFixed(2))+
          stat('RSI 14',rsi!=null?rsi.toFixed(1)+(rsi>70?' overbought':rsi<30?' oversold':''):'—',rsiCol)+
          stat('Trend',trendUp==null?'—':trendUp?'EMA50 > EMA200 · uptrend':'EMA50 < EMA200 · downtrend',trendUp==null?'#666':trendUp?'#4ade80':'#f87171')+
          '</div>';
        // 90-day close sparkline
        var W=800,H=140,PX=6,PY=10;
        var vals=bars.map(function(b){return b.close;});
        var vlo=Math.min.apply(null,vals)*0.998,vhi=Math.max.apply(null,vals)*1.002,rng=vhi-vlo||1;
        var tx=function(i){return PX+(i/(vals.length-1))*(W-PX*2);};
        var ty=function(v){return H-PY-((v-vlo)/rng)*(H-PY*2);};
        var pts=vals.map(function(v,i){return tx(i)+','+ty(v);}).join(' L ');
        var lc=chg>=0?'#4ade80':'#f87171';
        html+='<svg viewBox="0 0 '+W+' '+H+'" style="width:100%;height:140px;display:block" preserveAspectRatio="none">'+
          '<defs><linearGradient id="tsg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="'+lc+'" stop-opacity="0.16"/><stop offset="100%" stop-color="'+lc+'" stop-opacity="0.01"/></linearGradient></defs>'+
          '<path d="M '+pts+' L '+tx(vals.length-1)+','+(H-PY)+' L '+tx(0)+','+(H-PY)+' Z" fill="url(#tsg)"/>'+
          '<path d="M '+pts+'" fill="none" stroke="'+lc+'" stroke-width="2" stroke-linejoin="round"/>'+
          '<circle cx="'+tx(vals.length-1)+'" cy="'+ty(vals[vals.length-1])+'" r="3.5" fill="'+lc+'"/>'+
          '<text x="'+PX+'" y="'+(H-2)+'" font-family="monospace" font-size="8" fill="rgba(255,106,82,.45)">'+String(first.date||'').slice(5)+'</text>'+
          '<text x="'+(W-PX)+'" y="'+(H-2)+'" font-family="monospace" font-size="8" fill="rgba(255,106,82,.45)" text-anchor="end">'+String(last.date||'').slice(5)+'</text></svg>';
        out.innerHTML=html;
      })
      .catch(function(e){
        tickerBusy=false;if(btn){btn.disabled=false;btn.textContent='Search';}
        out.innerHTML='<span style="font-family:monospace;font-size:.62rem;color:#f87171">Failed: '+String(e&&e.message||e)+'</span>';
      });
  };
})();
