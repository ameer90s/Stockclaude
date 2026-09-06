
const DEFAULT_WATCHLIST = ['OKLO','ROKU','AFRM','HOOD','ENPH'];
const ARABIC_WEEKDAY = {Sun:'الأحد',Mon:'الإثنين',Tue:'الثلاثاء',Wed:'الأربعاء',Thu:'الخميس',Fri:'الجمعة',Sat:'السبت'};
const STATUS_LABEL = {
  pre:{text:'قبل الافتتاح', color:'var(--dim)'},
  opening:{text:'أول 15 دقيقة — بانتظار المرجع', color:'var(--gold)'},
  active:{text:'التداول مفتوح', color:'var(--bull)'},
  closed_day:{text:'السوق مغلق', color:'var(--dimmer)'},
  closed_weekend:{text:'عطلة نهاية الأسبوع', color:'var(--dimmer)'},
};

let state = {
  apiKey: localStorage.getItem('ta_apikey') || '',
  watchlist: JSON.parse(localStorage.getItem('ta_watchlist') || 'null') || DEFAULT_WATCHLIST.slice(),
  quotes: {},
  candles: {},
  htf: {},
  adaptive: {},
  spy: null,
  candlesSupported: null,
  baseline: null,
  history: JSON.parse(localStorage.getItem('ta_history') || '[]'),
  selectedSymbol: localStorage.getItem('ta_selected') || null,
  maxRiskPct: parseFloat(localStorage.getItem('ta_maxriskpct')) || 0.02,
  riskMode: localStorage.getItem('ta_riskmode') || 'auto',
  loading: false,
  error: '',
};

function switchTab(name){
  ['rank','rec','perf'].forEach(t=>{
    document.getElementById('tab-'+t).hidden = (t!==name);
    document.getElementById('tabbtn-'+t).classList.toggle('active', t===name);
  });
}

function nyParts(date){
  const fmt = new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York', weekday:'short', year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit', second:'2-digit', hour12:false});
  const parts = {};
  fmt.formatToParts(date).forEach(p=>parts[p.type]=p.value);
  return parts;
}
function dubaiClockStr(date){
  return new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Dubai', hour:'2-digit', minute:'2-digit', hour12:false}).format(date);
}
function marketStatus(p){
  if(p.weekday==='Sat'||p.weekday==='Sun') return 'closed_weekend';
  const mins = parseInt(p.hour)*60+parseInt(p.minute);
  if(mins<570) return 'pre';
  if(mins<585) return 'opening';
  if(mins<960) return 'active';
  return 'closed_day';
}
function todayKey(p){ return `${p.year}-${p.month}-${p.day}`; }
function fmt2(n){ return (Math.round(n*100)/100).toFixed(2); }

function toggleSettings(){
  const el = document.getElementById('settingsPanel');
  el.style.display = el.style.display==='none' ? 'block' : 'none';
  document.getElementById('apiKeyInput').value = state.apiKey;
  document.getElementById('riskPctInput').value = (state.maxRiskPct*100).toFixed(1);
  renderWatchlistChips();
  renderRiskModeUI();
}
function setRiskMode(mode){
  state.riskMode = mode;
  localStorage.setItem('ta_riskmode', mode);
  renderRiskModeUI();
}
function renderRiskModeUI(){
  const autoBtn = document.getElementById('riskModeAutoBtn');
  const manualBtn = document.getElementById('riskModeManualBtn');
  const explain = document.getElementById('riskModeExplain');
  const label = document.getElementById('riskPctLabel');
  if(!autoBtn) return;
  const isAuto = state.riskMode==='auto';
  autoBtn.style.background = isAuto ? 'var(--bull)' : 'var(--panelAlt)';
  autoBtn.style.color = isAuto ? '#000' : 'var(--text)';
  autoBtn.style.border = `1px solid ${isAuto?'var(--bull)':'var(--border)'}`;
  manualBtn.style.background = !isAuto ? 'var(--bull)' : 'var(--panelAlt)';
  manualBtn.style.color = !isAuto ? '#000' : 'var(--text)';
  manualBtn.style.border = `1px solid ${!isAuto?'var(--bull)':'var(--border)'}`;
  explain.textContent = isAuto
    ? 'كل التوصيات مبنية كصفقات سكالب يومي: الوقف والأهداف تُحسب من أقرب منطقة طلب/عرض فعلية (شموع رفض قريبة) لكل سهم، بحد سكالبي (0.3% إلى 2% مخاطرة). لو ما توفرت منطقة كافية لسهم معيّن، يُستخدم احتياطيًا رقم % الثابت تحت.'
    : 'يُستخدم نفس رقم % الثابت تحت لكل الأسهم دائمًا، بغض النظر عن الدعم والمقاومة.';
  label.textContent = isAuto ? 'نسبة احتياطية (لو ما توفر دعم/مقاومة) %' : 'أقصى نسبة مخاطرة للصفقة (%)';
}
function saveRiskPct(){
  const v = parseFloat(document.getElementById('riskPctInput').value);
  if(!isNaN(v) && v>0){
    state.maxRiskPct = v/100;
    localStorage.setItem('ta_maxriskpct', state.maxRiskPct);
  }
}
function saveApiKey(){
  state.apiKey = document.getElementById('apiKeyInput').value.trim();
  localStorage.setItem('ta_apikey', state.apiKey);
}
function renderWatchlistChips(){
  const box = document.getElementById('watchlistChips');
  box.innerHTML = state.watchlist.map(s=>`<span class="chip mono">${s}<button onclick="removeSymbol('${s}')">✕</button></span>`).join('');
}
function addSymbol(){
  const input = document.getElementById('newSymbolInput');
  const s = input.value.trim().toUpperCase();
  if(!s || state.watchlist.includes(s)) return;
  state.watchlist.push(s);
  localStorage.setItem('ta_watchlist', JSON.stringify(state.watchlist));
  input.value='';
  renderWatchlistChips();
  renderRanking();
}
function removeSymbol(s){
  state.watchlist = state.watchlist.filter(w=>w!==s);
  localStorage.setItem('ta_watchlist', JSON.stringify(state.watchlist));
  renderWatchlistChips();
  renderRanking();
}
function addPresetSymbols(){
  const preset = ['COIN','PLTR','SOFI','RIVN','MARA','SMCI','MSTR'];
  preset.forEach(s=>{ if(!state.watchlist.includes(s)) state.watchlist.push(s); });
  localStorage.setItem('ta_watchlist', JSON.stringify(state.watchlist));
  renderWatchlistChips();
  renderRanking();
}

async function fetchCandles(sym){
  const to = Math.floor(Date.now()/1000);
  const from = to - 40*86400;
  const res = await fetch(`https://finnhub.io/api/v1/stock/candle?symbol=${encodeURIComponent(sym)}&resolution=D&from=${from}&to=${to}&token=${state.apiKey}`);
  if(!res.ok) throw new Error('candle_http_'+sym);
  const data = await res.json();
  if(data.s!=='ok' || !data.c || data.c.length<5) throw new Error('candle_nodata_'+sym);
  return data;
}
async function fetchHTF(sym){
  // Higher-timeframe (hourly) trend check — catches cases where a scalp signal
  // fires against the bigger picture (e.g. lower highs on the 4h while 5m looks bullish).
  const to = Math.floor(Date.now()/1000);
  const from = to - 3*86400;
  const res = await fetch(`https://finnhub.io/api/v1/stock/candle?symbol=${encodeURIComponent(sym)}&resolution=60&from=${from}&to=${to}&token=${state.apiKey}`);
  if(!res.ok) throw new Error('htf_http_'+sym);
  const data = await res.json();
  if(data.s!=='ok' || !data.c || data.c.length<5) throw new Error('htf_nodata_'+sym);
  const n = data.c.length;
  const lookback = Math.min(4, n-1);
  const recent = data.c[n-1];
  const past = data.c[n-1-lookback];
  const changePct = past>0 ? (recent-past)/past : 0;
  return {trend: changePct>=0 ? 'up':'down', changePct};
}
function computeSR(data){
  const n = data.c.length;
  const idxToday = n-1;
  // Scalping needs NEAR-TERM structure, not a 15-day swing window — last ~5 sessions
  const lookbackStart = Math.max(0, idxToday-5);
  const priorHighs = data.h.slice(lookbackStart, idxToday);
  const priorLows = data.l.slice(lookbackStart, idxToday);
  const priorOpens = data.o.slice(lookbackStart, idxToday);
  const priorCloses = data.c.slice(lookbackStart, idxToday);
  const priorVolumes = data.v.slice(lookbackStart, idxToday);
  const resistance = priorHighs.length ? Math.max(...priorHighs) : null;
  const support = priorLows.length ? Math.min(...priorLows) : null;
  const avgVolume = priorVolumes.length ? priorVolumes.reduce((a,b)=>a+b,0)/priorVolumes.length : null;
  const todayVolume = data.v[idxToday];
  const relVolume = (avgVolume && avgVolume>0) ? todayVolume/avgVolume : null;
  const dailyRanges = priorHighs.map((h,i)=> priorOpens[i]>0 ? (h - priorLows[i])/priorOpens[i] : null).filter(v=>v!==null);
  const avgRangePct = dailyRanges.length ? dailyRanges.reduce((a,b)=>a+b,0)/dailyRanges.length : null;

  // Supply/demand zones: candles with a long rejection wick mark where buyers (demand)
  // or sellers (supply) actually stepped in — more relevant to a scalp than the raw window extreme.
  const demandLevels = [], supplyLevels = [];
  for(let i=0;i<priorHighs.length;i++){
    const h=priorHighs[i], l=priorLows[i], o=priorOpens[i], c=priorCloses[i];
    const range = (h-l) || 0.0001;
    const lowerWick = Math.min(o,c) - l;
    const upperWick = h - Math.max(o,c);
    if(lowerWick/range > 0.3) demandLevels.push(l);
    if(upperWick/range > 0.3) supplyLevels.push(h);
  }
  return {support, resistance, avgVolume, todayVolume, relVolume, avgRangePct, demandLevels, supplyLevels};
}

function nearestZone(specificLevels, fallbackLevel, entry, wantBelow){
  const pool = [...specificLevels, fallbackLevel].filter(v=>v!=null && (wantBelow ? v<entry : v>entry));
  if(!pool.length) return {level:null, fromZone:false};
  const level = wantBelow ? Math.max(...pool) : Math.min(...pool);
  const fromZone = specificLevels.includes(level);
  return {level, fromZone};
}

async function fetchQuotes(){
  if(!state.apiKey){
    showError('أدخل مفتاح Finnhub API من الإعدادات ⚙️ أولاً');
    return;
  }
  state.loading = true;
  document.getElementById('refreshIcon').classList.add('spin');
  document.getElementById('refreshText').textContent = 'جاري التحديث...';
  hideError();
  try{
    const results = await Promise.all(state.watchlist.map(async sym=>{
      const res = await fetch(`https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(sym)}&token=${state.apiKey}`);
      if(!res.ok) throw new Error('bad_response_'+sym);
      const data = await res.json();
      if(data.c===undefined) throw new Error('bad_symbol_'+sym);
      return [sym, data];
    }));
    state.quotes = {};
    results.forEach(([sym,data])=>{ state.quotes[sym]=data; });

    const p = nyParts(new Date());
    const status = marketStatus(p);
    const tk = todayKey(p);

    results.forEach(([sym,data])=>{
      if(data && data.o){
        savePriceHistoryEntry(sym, {date:tk, o:data.o, h:data.h, l:data.l, c:data.c});
      }
    });

    if((status==='active' || status==='closed_day') && !state.baseline){
      state.baseline = {date:tk, data:state.quotes};
      localStorage.setItem('ta_baseline_'+tk, JSON.stringify(state.baseline));
    }

    // Support/resistance + relative volume (best-effort — needs candle access on the Finnhub plan)
    const candleResults = await Promise.allSettled(state.watchlist.map(async sym=>{
      const data = await fetchCandles(sym);
      return [sym, computeSR(data)];
    }));
    let anyCandleSuccess = false;
    state.candles = {};
    candleResults.forEach(r=>{
      if(r.status==='fulfilled'){
        const [sym, sr] = r.value;
        state.candles[sym] = sr;
        anyCandleSuccess = true;
      }
    });
    state.candlesSupported = anyCandleSuccess;

    // Higher-timeframe (hourly) trend — best-effort, same plan constraints as daily candles
    const htfResults = await Promise.allSettled(state.watchlist.map(async sym=>{
      const d = await fetchHTF(sym);
      return [sym, d];
    }));
    state.htf = {};
    htfResults.forEach(r=>{
      if(r.status==='fulfilled'){
        const [sym, d] = r.value;
        state.htf[sym] = d;
      }
    });

    // SPY as a simple market-direction filter
    try{
      const spyRes = await fetch(`https://finnhub.io/api/v1/quote?symbol=SPY&token=${state.apiKey}`);
      const spyData = await spyRes.json();
      if(spyData && spyData.o){
        const chg = (spyData.c - spyData.o)/spyData.o;
        state.spy = {o:spyData.o, c:spyData.c, changePct:chg, trend: chg>=0 ? 'up':'down'};
      }
    }catch(e){ /* non-critical, ignore */ }

    state.adaptive = computeAdaptiveAdjustments();

  }catch(e){
    showError('تعذّر جلب الأسعار — تأكد من صحة المفتاح ورموز الأسهم، ومن أنك فتحت الملف كموقع حقيقي (http/https) وليس مباشرة كملف محلي');
  }finally{
    state.loading = false;
    document.getElementById('refreshIcon').classList.remove('spin');
    document.getElementById('refreshText').textContent = 'تحديث الأسعار الآن';
    renderMarketBadge();
    renderRanking();
    renderAllRecommendations();
  }
}
function renderMarketBadge(){
  const card = document.getElementById('marketBadgeCard');
  const val = document.getElementById('marketBadgeVal');
  if(!state.spy){ card.style.display='none'; return; }
  card.style.display='block';
  const up = state.spy.trend==='up';
  val.style.color = up ? 'var(--bull)' : 'var(--bear)';
  val.textContent = `${up?'▲ صاعد':'▼ هابط'} ${(state.spy.changePct*100).toFixed(2)}%`;
}

function showError(msg){
  const box = document.getElementById('errorBox');
  box.style.display='block';
  box.innerHTML = `⚠️ ${msg}`;
}
function hideError(){
  document.getElementById('errorBox').style.display='none';
}

function getPriceHistory(sym){
  const all = JSON.parse(localStorage.getItem('ta_pricehist') || '{}');
  return all[sym] || [];
}
function savePriceHistoryEntry(sym, entry){
  const all = JSON.parse(localStorage.getItem('ta_pricehist') || '{}');
  const arr = all[sym] || [];
  const idx = arr.findIndex(e=>e.date===entry.date);
  if(idx>=0) arr[idx] = entry; else arr.push(entry);
  all[sym] = arr.slice(-30);
  localStorage.setItem('ta_pricehist', JSON.stringify(all));
}

function computeAdaptiveAdjustments(){
  const MIN_SAMPLE = 5;
  const WEAK_WINRATE = 0.4;
  const graded = state.history.filter(h=>isRealTrade(h.outcome));
  const adj = {};

  const spyOpposed = graded.filter(h=>h.aligned===false);
  if(spyOpposed.length>=MIN_SAMPLE){
    const wins = spyOpposed.filter(h=>getR(h)>0).length;
    const winRate = wins/spyOpposed.length;
    adj.spy = {sample:spyOpposed.length, winRate, penalized: winRate<WEAK_WINRATE};
    if(winRate<WEAK_WINRATE) adj.spyOpposedPenalty = 0.6;
  }

  const htfOpposed = graded.filter(h=>h.htfAligned===false);
  if(htfOpposed.length>=MIN_SAMPLE){
    const wins = htfOpposed.filter(h=>getR(h)>0).length;
    const winRate = wins/htfOpposed.length;
    adj.htf = {sample:htfOpposed.length, winRate, penalized: winRate<WEAK_WINRATE};
    if(winRate<WEAK_WINRATE) adj.htfOpposedPenalty = 0.6;
  }

  return adj;
}

function computeRanked(){
  const p = nyParts(new Date());
  const tk = todayKey(p);
  return state.watchlist.map(sym=>{
    const q = state.quotes[sym];
    if(!q || !q.o) return {sym, score:-1, valid:false};
    const range = (q.h - q.l) || 0.01;
    const changeFromOpen = (q.c - q.o)/q.o;
    const rangePos = (q.c - q.l)/range;
    const volatilityPct = range/q.o;
    const momentumPct = Math.abs(changeFromOpen)*100;
    const rangeStrength = Math.abs(rangePos-0.5)*2*100;
    const baseScore = momentumPct*0.45 + volatilityPct*100*0.25 + rangeStrength*0.3;

    // Normalize against the stock's own recent average so one chronically
    // volatile symbol doesn't always win — we compare TODAY vs ITS OWN norm.
    const hist = getPriceHistory(sym).filter(e=>e.date!==tk);
    let compositeScore = baseScore;
    let relMultiplier = null;
    if(hist.length>=3){
      const avgVolatility = hist.reduce((s,e)=>s+((e.h-e.l)/e.o),0)/hist.length;
      const avgMomentum = hist.reduce((s,e)=>s+Math.abs((e.c-e.o)/e.o),0)/hist.length;
      const volRatio = avgVolatility>0.0005 ? volatilityPct/avgVolatility : 1;
      const momRatio = avgMomentum>0.0005 ? Math.abs(changeFromOpen)/avgMomentum : 1;
      relMultiplier = Math.min(3, Math.max(0.3, volRatio*0.5 + momRatio*0.5));
      compositeScore = baseScore * relMultiplier;
    }
    const direction = changeFromOpen>=0 ? 'bull':'bear';

    // Volume confirmation: above-average volume strengthens the signal, below-average weakens it
    const sr = state.candles[sym] || null;
    let volumeFactor = 1;
    if(sr && sr.relVolume!==null){
      volumeFactor = Math.min(2, Math.max(0.5, sr.relVolume));
    }

    // Market-direction filter: trading with SPY's trend is favored, against it is penalized
    let alignmentFactor = 1, spyAligned = null;
    if(state.spy){
      spyAligned = (direction==='bull' && state.spy.trend==='up') || (direction==='bear' && state.spy.trend==='down');
      alignmentFactor = spyAligned ? 1.15 : 0.85;
      if(!spyAligned && state.adaptive.spyOpposedPenalty) alignmentFactor *= state.adaptive.spyOpposedPenalty;
    }

    // Higher-timeframe (hourly) filter: catches a scalp signal that fights the bigger trend
    const htf = state.htf[sym] || null;
    let htfFactor = 1, htfAligned = null;
    if(htf){
      htfAligned = (direction==='bull' && htf.trend==='up') || (direction==='bear' && htf.trend==='down');
      htfFactor = htfAligned ? 1.15 : 0.85;
      if(!htfAligned && state.adaptive.htfOpposedPenalty) htfFactor *= state.adaptive.htfOpposedPenalty;
    }

    compositeScore = compositeScore * volumeFactor * alignmentFactor * htfFactor;

    return {sym, q, score:compositeScore, direction, changeFromOpen, relMultiplier, volumeFactor, alignmentFactor, spyAligned, htf, htfFactor, htfAligned, sr, valid:true};
  }).sort((a,b)=>b.score-a.score);
}

function selectSymbol(sym){
  switchTab('rec');
}

function renderHero(top){
  const card = document.getElementById('heroCard');
  if(!top || !top.valid){ card.style.display='none'; return; }
  card.style.display='flex';
  const dirColor = top.direction==='bull' ? 'var(--bull)' : 'var(--bear)';
  const arrow = top.direction==='bull' ? '▲' : '▼';
  const dirText = top.direction==='bull' ? 'صاعد' : 'هابط';
  const pct = Math.max(5, Math.min(100, Math.round(top.score)));
  card.innerHTML = `
    <div class="hero-left">
      <div class="hero-eyebrow">أفضل سهم اليوم</div>
      <div class="hero-symbol">${top.sym}</div>
      <div class="hero-sub" style="color:${dirColor};">${arrow} ${dirText} · $${fmt2(top.q.c)} (${(top.changeFromOpen*100).toFixed(2)}%)</div>
    </div>
    <div class="hero-ring" style="--pct:${pct};">
      <div class="hero-ring-val">${pct}</div>
    </div>
  `;
}

function renderRanking(){
  const ranked = computeRanked();
  const top = ranked.find(r=>r.valid);
  const list = document.getElementById('rankingList');
  list.innerHTML = ranked.map(r=>{
    const isTop = top && r.sym===top.sym;
    const style = isTop ? 'background:var(--panelAlt); border:1px solid var(--gold);' : 'border:1px solid transparent;';
    const tag = isTop ? `<div style="font-size:9px; color:var(--gold); font-weight:700;">الأفضل</div>` : '';
    const clickAttr = r.valid ? ` onclick="selectSymbol('${r.sym}')" style="${style} cursor:pointer;"` : ` style="${style}"`;
    if(!r.valid){
      return `<div class="rank-row"${clickAttr}>
        <div class="mono val" style="width:64px;">${r.sym}</div>
        <div style="color:var(--dimmer); font-size:12px;">بلا بيانات — اضغط تحديث</div>
      </div>`;
    }
    const dirColor = r.direction==='bull' ? 'var(--bull)' : 'var(--bear)';
    const arrow = r.direction==='bull' ? '▲' : '▼';
    const relBadge = r.relMultiplier!==null ? `<div class="mono" style="font-size:10px; color:var(--dim);">${r.relMultiplier.toFixed(1)}×</div>` : `<div style="font-size:10px; color:var(--dimmer);">جديد</div>`;
    const volBadge = (r.sr && r.sr.relVolume!==null) ? `<div class="mono" style="font-size:9px; color:${r.sr.relVolume>=1?'var(--bull)':'var(--dim)'};">حجم ${r.sr.relVolume.toFixed(1)}×</div>` : '';
    return `<div class="rank-row"${clickAttr}>
      <div>
        <div class="mono val" style="width:64px;">${r.sym}</div>
        ${tag}
      </div>
      <div class="mono">$${fmt2(r.q.c)}</div>
      <div class="mono" style="color:${dirColor}; font-size:12px; font-weight:700;">${arrow} ${(r.changeFromOpen*100).toFixed(2)}%</div>
      <div style="text-align:center;">
        <div class="bar-bg"><div class="bar-fill" style="width:${Math.min(100,r.score)}%;"></div></div>
        ${relBadge}
        ${volBadge}
      </div>
    </div>`;
  }).join('');
  window._top = top;
  renderHero(top);
}

function buildRecommendation(r){
  const q = r.q;
  const sr = r.sr;
  const entry = q.c;
  const manualPct = state.maxRiskPct || 0.02;
  const AUTO_MIN_PCT = 0.003, AUTO_MAX_PCT = 0.02; // scalp-sized risk band

  // Nearest supply/demand zone (or plain structural level as fallback) below/above entry —
  // a scalp cares about the closest real level, not the extreme of a wide window.
  const nearSupport = sr ? nearestZone(sr.demandLevels, sr.support, entry, true) : {level:null, fromZone:false};
  const nearResistance = sr ? nearestZone(sr.supplyLevels, sr.resistance, entry, false) : {level:null, fromZone:false};

  let riskPerShare, stopSource, autoRawPct = null;

  if(state.riskMode==='auto'){
    if(r.direction==='bull' && nearSupport.level!=null){
      autoRawPct = (entry - nearSupport.level)/entry;
    }else if(r.direction==='bear' && nearResistance.level!=null){
      autoRawPct = (nearResistance.level - entry)/entry;
    }
  }

  if(autoRawPct!==null){
    // Never set a stop tighter than typical daily noise for this specific stock —
    // otherwise ordinary intraday wiggle stops it out before the real move happens.
    const noiseFloorPct = (sr.avgRangePct ? sr.avgRangePct*0.4 : 0);
    const effectiveMinPct = Math.max(AUTO_MIN_PCT, noiseFloorPct);
    const clampedPct = Math.min(AUTO_MAX_PCT, Math.max(effectiveMinPct, autoRawPct));
    riskPerShare = entry * clampedPct;
    const wasClamped = Math.abs(clampedPct - autoRawPct) > 1e-9;
    const clampedByNoise = wasClamped && clampedPct===effectiveMinPct && noiseFloorPct>AUTO_MIN_PCT;
    const usedZone = r.direction==='bull' ? nearSupport.fromZone : nearResistance.fromZone;
    stopSource = r.direction==='bull'
      ? (clampedByNoise ? 'demand_noise_floor' : (wasClamped ? 'demand_clamped' : (usedZone?'demand':'support')))
      : (clampedByNoise ? 'supply_noise_floor' : (wasClamped ? 'supply_clamped' : (usedZone?'supply':'resistance')));
  }else{
    // Fallback: manual %, never wider than today's actual range
    const rawStop = r.direction==='bull' ? Math.min(q.l,q.o)*0.997 : Math.max(q.h,q.o)*1.003;
    const rawRiskPerShare = r.direction==='bull' ? (entry-rawStop) : (rawStop-entry);
    riskPerShare = Math.min(rawRiskPerShare, entry*manualPct);
    stopSource = (state.riskMode==='auto') ? 'manual_fallback' : 'manual';
  }

  const stop = r.direction==='bull' ? entry - riskPerShare : entry + riskPerShare;
  let targets = [1,2,3].map(m => r.direction==='bull' ? entry + riskPerShare*m : entry - riskPerShare*m);
  const cappedTargets = [];
  if(r.direction==='bull' && nearResistance.level!=null){
    targets = targets.map((t,i)=>{ if(t > nearResistance.level){ cappedTargets.push(i+1); return nearResistance.level; } return t; });
  }else if(r.direction==='bear' && nearSupport.level!=null){
    targets = targets.map((t,i)=>{ if(t < nearSupport.level){ cappedTargets.push(i+1); return nearSupport.level; } return t; });
  }

  const probability = Math.min(85, Math.max(50, Math.round(50 + r.score*0.55)));
  const effectivePct = riskPerShare/entry;

  let srNote = '';
  if(stopSource==='demand') srNote = `الوقف محسوب من أقرب منطقة طلب (شمعة رفض شرائي) عند $${fmt2(nearSupport.level)} = مخاطرة ${(effectivePct*100).toFixed(1)}%.`;
  else if(stopSource==='supply') srNote = `الوقف محسوب من أقرب منطقة عرض (شمعة رفض بيعي) عند $${fmt2(nearResistance.level)} = مخاطرة ${(effectivePct*100).toFixed(1)}%.`;
  else if(stopSource==='support') srNote = `الوقف محسوب من أقرب دعم هيكلي عند $${fmt2(nearSupport.level)} = مخاطرة ${(effectivePct*100).toFixed(1)}%.`;
  else if(stopSource==='resistance') srNote = `الوقف محسوب من أقرب مقاومة هيكلية عند $${fmt2(nearResistance.level)} = مخاطرة ${(effectivePct*100).toFixed(1)}%.`;
  else if(stopSource==='demand_clamped' || stopSource==='support_clamped') srNote = `أقرب منطقة طلب/دعم قريبة/بعيدة جدًا لسكالب، فتم ضبط المخاطرة تلقائيًا لحد سكالبي معقول (${(effectivePct*100).toFixed(1)}%).`;
  else if(stopSource==='supply_clamped' || stopSource==='resistance_clamped') srNote = `أقرب منطقة عرض/مقاومة قريبة/بعيدة جدًا لسكالب، فتم ضبط المخاطرة تلقائيًا لحد سكالبي معقول (${(effectivePct*100).toFixed(1)}%).`;
  else if(stopSource==='demand_noise_floor' || stopSource==='support_noise_floor') srNote = `منطقة الطلب/الدعم كانت أقرب من التذبذب اليومي المعتاد، فتم توسيع الوقف تلقائيًا لـ${(effectivePct*100).toFixed(1)}% عشان ما ينضرب بحركة عادية.`;
  else if(stopSource==='supply_noise_floor' || stopSource==='resistance_noise_floor') srNote = `منطقة العرض/المقاومة كانت أقرب من التذبذب اليومي المعتاد، فتم توسيع الوقف تلقائيًا لـ${(effectivePct*100).toFixed(1)}% عشان ما ينضرب بحركة عادية.`;
  else if(stopSource==='manual_fallback') srNote = `ما فيه مناطق طلب/عرض أو دعم/مقاومة كافية لهذا السهم، فاستُخدمت النسبة الاحتياطية اليدوية (${(manualPct*100).toFixed(1)}%).`;
  if(cappedTargets.length) srNote += (srNote?' ':'') + `تم تحديد الهدف ${cappedTargets.join(' و')} عند أقرب منطقة ${r.direction==='bull'?'عرض':'طلب'} بدل حساب رياضي بحت.`;
  if(r.htfAligned===false) srNote += (srNote?' ':'') + `⚠️ الفريم الأكبر (الساعة) يعطي اتجاه عكسي لهذي الإشارة — احتمال الفشل أعلى من المعتاد، فكّر بصفقة أسرع/أصغر أو تجاهلها.`;

  return {
    symbol:r.sym, direction:r.direction, entry, stop, targets, riskPerShare, probability,
    stopSource, riskMode: state.riskMode, effectivePct, manualPct,
    support: nearSupport.level,
    resistance: nearResistance.level,
    relVolume: sr ? sr.relVolume : null,
    marketTrend: state.spy ? state.spy.trend : null,
    aligned: r.spyAligned,
    htfTrend: r.htf ? r.htf.trend : null,
    htfAligned: r.htfAligned,
    srNote,
  };
}

const OUTCOME_R = {target1:1, target2:2, target3:3, stop:-1};
function isRealTrade(outcome){ return (outcome in OUTCOME_R) || outcome==='eod'; }
function getR(record){ return record.outcome==='eod' ? record.customR : OUTCOME_R[record.outcome]; }

function getTodayRecord(tk){
  return state.history.find(h=>h.date===tk);
}

function commitRecommendation(sym){
  const ranked = computeRanked();
  const r = ranked.find(x=>x.sym===sym && x.valid);
  if(!r) return;
  const p = nyParts(new Date());
  const tk = todayKey(p);
  const rec = buildRecommendation(r);
  const record = {date:tk, ...rec, outcome:null, createdAt:new Date().toISOString()};
  state.history = [record, ...state.history.filter(h=>h.date!==tk)].slice(0,90);
  localStorage.setItem('ta_history', JSON.stringify(state.history));
  renderAllRecommendations();
  state.adaptive = computeAdaptiveAdjustments();
  renderChart();
  renderAdaptivePanel();
}
function gradeToday(outcome){
  const p = nyParts(new Date());
  const tk = todayKey(p);
  state.history = state.history.map(h=>{
    if(h.date!==tk) return h;
    if(outcome==='eod'){
      const q = state.quotes[h.symbol];
      const closePrice = q ? q.c : h.entry;
      const customR = Math.round((((closePrice - h.entry)/h.riskPerShare) * (h.direction==='bull'?1:-1))*100)/100;
      return {...h, outcome:'eod', customR};
    }
    return {...h, outcome, customR: undefined};
  });
  localStorage.setItem('ta_history', JSON.stringify(state.history));
  renderAllRecommendations();
  state.adaptive = computeAdaptiveAdjustments();
  renderChart();
  renderAdaptivePanel();
}

const OUTCOME_LABELS = {target1:'هدف 1 (+1R)', target2:'هدف 2 (+2R)', target3:'هدف 3 (+3R)', stop:'وقف (-1R)', none:'لم يُنفَّذ', eod:'إغلاق نهاية اليوم'};

function renderHistoryLog(){
  const box = document.getElementById('historyLog');
  if(!box) return;
  const graded = [...state.history].filter(h=>h.outcome!==null).sort((a,b)=>b.date.localeCompare(a.date)).slice(0,10);
  if(!graded.length){ box.innerHTML=''; return; }
  const editing = window._editingDate;
  box.innerHTML = `<div class="label" style="margin-bottom:6px;">سجل الأيام (اضغط ✏️ لتصحيح تقييم خاطئ)</div>` + graded.map(h=>{
    const r = isRealTrade(h.outcome) ? getR(h) : null;
    const rTxt = r!==null && r!==undefined ? ` (${r>=0?'+':''}${r}R)` : '';
    const isEditing = editing===h.date;
    let row = `<div class="row mono" style="padding:6px 0; border-bottom:1px solid var(--border); font-size:12px;">
      <span>${h.date.slice(5)} · ${h.symbol}</span>
      <span style="display:flex; align-items:center; gap:6px;">
        <span style="color:${r>0?'var(--bull)':r<0?'var(--bear)':'var(--dim)'};">${OUTCOME_LABELS[h.outcome]||h.outcome}${rTxt}</span>
        <button onclick="toggleEditRow('${h.date}')" style="background:none; border:none; cursor:pointer; font-size:13px;">✏️</button>
      </span>
    </div>`;
    if(isEditing){
      row += `<div class="flexgap" style="flex-wrap:wrap; gap:4px; margin-bottom:8px;">
        ${['target1','target2','target3','stop','eod','none'].map(o=>`<button class="btn" style="width:auto; padding:6px 8px; font-size:10px; background:var(--panelAlt); border:1px solid var(--border); color:var(--text);" onclick="correctRecord('${h.date}','${o}')">${OUTCOME_LABELS[o]}</button>`).join('')}
      </div>`;
    }
    return row;
  }).join('');
}

function toggleEditRow(date){
  window._editingDate = (window._editingDate===date) ? null : date;
  renderHistoryLog();
}

function correctRecord(date, outcome){
  state.history = state.history.map(h=>{
    if(h.date!==date) return h;
    if(outcome==='eod'){
      const hist = getPriceHistory(h.symbol);
      const entryForDate = hist.find(e=>e.date===date);
      const closePrice = entryForDate ? entryForDate.c : h.entry;
      const customR = Math.round((((closePrice - h.entry)/h.riskPerShare) * (h.direction==='bull'?1:-1))*100)/100;
      return {...h, outcome:'eod', customR};
    }
    return {...h, outcome, customR: undefined};
  });
  localStorage.setItem('ta_history', JSON.stringify(state.history));
  window._editingDate = null;
  state.adaptive = computeAdaptiveAdjustments();
  renderChart();
  renderAdaptivePanel();
  renderAllRecommendations();
}

function renderLadder(rec, currentPrice){
  const raw = [
    {value:rec.stop, label:'وقف', tag:'stop', color:'var(--bear)'},
    {value:rec.entry, label:'دخول', tag:'entry', color:'var(--gold)'},
    {value:rec.targets[0], label:'هدف١', tag:'t1', color:'var(--bull)'},
    {value:rec.targets[1], label:'هدف٢', tag:'t2', color:'var(--bull)'},
    {value:rec.targets[2], label:'هدف٣', tag:'t3', color:'var(--bull)'},
  ];
  const allValues = raw.map(m=>m.value).concat(currentPrice!=null ? [currentPrice] : []);
  let min = Math.min(...allValues), max = Math.max(...allValues);
  const pad = (max-min)*0.12 || Math.max(max*0.01, 0.02);
  min -= pad; max += pad;
  const range = (max-min) || 1;
  const pct = v => (((v-min)/range)*100).toFixed(2);

  const rowOf = {};
  [...raw].sort((a,b)=>a.value-b.value).forEach((m,i)=>{ rowOf[m.tag] = i%2; });

  const gradient = rec.direction==='bull'
    ? 'linear-gradient(90deg, var(--bear) 0%, var(--dimmer) 50%, var(--bull) 100%)'
    : 'linear-gradient(90deg, var(--bull) 0%, var(--dimmer) 50%, var(--bear) 100%)';

  const markersHtml = raw.map(m=>{
    const rowClass = rowOf[m.tag]===0 ? 'row-above' : 'row-below';
    return `<div class="ladder-marker ${rowClass}" style="left:${pct(m.value)}%;">
      <div class="ladder-line" style="background:${m.color};"></div>
      <div class="ladder-tag" style="color:${m.color};">${m.label}<span class="ladder-tagval">$${fmt2(m.value)}</span></div>
    </div>`;
  }).join('');

  const currentHtml = currentPrice!=null
    ? `<div class="ladder-current" style="left:${pct(currentPrice)}%;" title="السعر الحالي: $${fmt2(currentPrice)}"></div>`
    : '';

  return `<div class="ladder" dir="ltr">
    <div class="ladder-track" style="background:${gradient};"></div>
    ${markersHtml}
    ${currentHtml}
  </div>`;
}

function renderCompactCard(r, rec, isCommitted, canCommit){
  const dirColor = rec.direction==='bull' ? 'var(--bull)' : 'var(--bear)';
  const dirLabel = rec.direction==='bull' ? 'شراء ▲' : 'بيع ▼';
  const cardStyle = isCommitted
    ? `border:1px solid var(--gold); background:var(--panelAlt); border-right:4px solid ${dirColor};`
    : `border-right:4px solid ${dirColor};`;
  const actionHtml = isCommitted
    ? `<div class="label" style="color:var(--gold); margin-top:8px; font-weight:700;">✓ الصفقة المعتمدة اليوم</div>`
    : `<button class="btn btn-gold" style="font-size:11px; margin-top:8px;" ${canCommit?'':'disabled'} onclick="commitRecommendation('${r.sym}')">${canCommit ? 'اعتماد هذه الصفقة' : 'مقفول — عندك صفقة معتمدة اليوم'}</button>`;
  return `<div class="reccompact" style="${cardStyle}">
    <div class="row" style="margin-bottom:8px;">
      <span class="mono val">${r.sym}</span>
      <span class="pill" style="color:${dirColor}; border-color:${dirColor};">${dirLabel}</span>
      <span class="pill gold">${rec.probability}%</span>
    </div>
    <div class="reccompact-grid mono">
      <div><span class="label">دخول</span><b>$${fmt2(rec.entry)}</b></div>
      <div><span class="label" style="color:var(--bear);">وقف</span><b style="color:var(--bear);">$${fmt2(rec.stop)}</b></div>
      <div><span class="label" style="color:var(--bull);">هدف١</span><b style="color:var(--bull);">$${fmt2(rec.targets[0])}</b></div>
      <div><span class="label" style="color:var(--bull);">هدف٢</span><b style="color:var(--bull);">$${fmt2(rec.targets[1])}</b></div>
      <div><span class="label" style="color:var(--bull);">هدف٣</span><b style="color:var(--bull);">$${fmt2(rec.targets[2])}</b></div>
    </div>
    ${actionHtml}
  </div>`;
}

function renderCommittedBlock(todayRecord, ranked, isLocked, canCommit){
  const r = ranked.find(x=>x.sym===todayRecord.symbol);
  const currentPrice = r && r.q ? r.q.c : null;
  const dirColor = todayRecord.direction==='bull' ? 'var(--bull)' : 'var(--bear)';
  const dirText = todayRecord.direction==='bull' ? 'شراء (اتجاه صاعد)' : 'بيع (اتجاه هابط)';

  let html = `<div class="row" style="margin-bottom:4px;">
    <div class="val">الصفقة المعتمدة اليوم</div>
    <div class="mono val">${todayRecord.symbol}</div>
  </div>`;
  html += `<div style="color:${dirColor}; font-weight:700; font-size:12px; margin-bottom:4px;">${dirText}</div>`;
  html += renderLadder(todayRecord, currentPrice);
  if(currentPrice!==null){
    html += `<div class="mono" style="text-align:center; font-size:11px; color:var(--gold); margin-bottom:8px;">● السعر الآن: $${fmt2(currentPrice)}</div>`;
    const driftPct = Math.abs(currentPrice - todayRecord.entry) / todayRecord.entry * 100;
    if(driftPct > 3 && !isLocked){
      html += `<div class="disclaimer" style="margin-bottom:8px; color:var(--gold);">⚠️ السعر تحرّك ${driftPct.toFixed(1)}% عن سعر الدخول الأصلي منذ الاعتماد. الأهداف والوقف محسوبة وقت الاعتماد ولا تتحدّث تلقائيًا.</div>`;
    }
  }

  html += `<div class="grid2 mono" style="margin-bottom:8px;">
    <div class="box"><div class="label">الدخول (وقت الاعتماد)</div><div class="val">$${fmt2(todayRecord.entry)}</div></div>
    <div class="box"><div class="label">وقف الخسارة</div><div class="val" style="color:var(--bear);">$${fmt2(todayRecord.stop)}</div></div>
    ${todayRecord.targets.map((t,i)=>`<div class="box"><div class="label">الهدف ${i+1} (1:${i+1})</div><div class="val" style="color:var(--bull);">$${fmt2(t)}</div></div>`).join('')}
    <div class="box"><div class="label">نسبة النجاح المتوقعة</div><div class="val" style="color:var(--gold);">${todayRecord.probability}%</div></div>
  </div>`;

  if(todayRecord.support || todayRecord.resistance || todayRecord.relVolume!==null || todayRecord.marketTrend){
    html += `<div class="grid2 mono" style="margin-bottom:8px;">
      ${todayRecord.support ? `<div class="box"><div class="label">منطقة الطلب/الدعم الأقرب</div><div class="val">$${fmt2(todayRecord.support)}</div></div>` : ''}
      ${todayRecord.resistance ? `<div class="box"><div class="label">منطقة العرض/المقاومة الأقرب</div><div class="val">$${fmt2(todayRecord.resistance)}</div></div>` : ''}
      ${todayRecord.relVolume!==null ? `<div class="box"><div class="label">حجم التداول اليوم</div><div class="val" style="color:${todayRecord.relVolume>=1?'var(--bull)':'var(--dim)'};">${todayRecord.relVolume.toFixed(1)}× المعدل</div></div>` : ''}
      ${todayRecord.marketTrend ? `<div class="box"><div class="label">توافق مع اتجاه السوق</div><div class="val" style="color:${todayRecord.aligned?'var(--bull)':'var(--gold)'};">${todayRecord.aligned?'✓ متوافق':'✗ معاكس'}</div></div>` : ''}
      ${todayRecord.htfTrend ? `<div class="box"><div class="label">توافق مع الفريم الأكبر (ساعة)</div><div class="val" style="color:${todayRecord.htfAligned?'var(--bull)':'var(--gold)'};">${todayRecord.htfAligned?'✓ متوافق':'✗ معاكس'}</div></div>` : ''}
    </div>`;
  }
  if(todayRecord.srNote){
    html += `<div class="disclaimer" style="margin-bottom:8px; color:var(--gold);">${todayRecord.srNote}</div>`;
  }
  if(state.candlesSupported===false){
    html += `<div class="disclaimer" style="margin-bottom:8px;">بيانات الدعم/المقاومة والحجم غير متوفرة حاليًا — على الأغلب لأن حسابك المجاني بـ Finnhub ما يشمل endpoint الشموع التاريخية (stock/candle).</div>`;
  }

  if(todayRecord.outcome===null){
    html += `<div class="flexgap" style="margin-bottom:6px;">
      <button class="btn btn-green flex1" onclick="gradeToday('target1')" style="font-size:11px;">✓ الهدف 1</button>
      <button class="btn btn-green flex1" onclick="gradeToday('target2')" style="font-size:11px;">✓ الهدف 2</button>
      <button class="btn btn-green flex1" onclick="gradeToday('target3')" style="font-size:11px;">✓ الهدف 3</button>
    </div>`;
    html += `<div class="flexgap" style="margin-bottom:6px;">
      <button class="btn btn-red flex1" onclick="gradeToday('stop')" style="font-size:12px;">✕ لمس وقف الخسارة</button>
      <button class="btn btn-gray flex1" onclick="gradeToday('none')" style="font-size:12px;">⊘ لم يُنفَّذ</button>
    </div>`;
    html += `<button class="btn btn-gold" style="font-size:12px; margin-bottom:8px;" onclick="gradeToday('eod')">⏱ انتهى اليوم بدون هدف أو وقف (إغلاق بالسعر الحالي)</button>`;
    if(canCommit){
      html += `<button class="btn btn-gold" style="font-size:12px;" onclick="commitRecommendation('${todayRecord.symbol}')">↻ تحديث الصفقة بالسعر الحالي</button>`;
    }
  }else if(todayRecord.outcome==='none'){
    html += `<div class="label" style="margin-bottom:8px;">نتيجة اليوم: ⚪ لم يُنفَّذ الدخول</div>`;
  }else{
    const outLabels = {target1:'✅ تحقق الهدف 1 (1R)', target2:'✅ تحقق الهدف 2 (2R)', target3:'✅ تحقق الهدف 3 (3R)', stop:'❌ لمس وقف الخسارة (1R-)'};
    if(todayRecord.outcome==='eod'){
      const r2 = todayRecord.customR;
      html += `<div class="label">نتيجة اليوم: ⏱ إغلاق نهاية اليوم (${r2>=0?'+':''}${r2}R)</div>`;
    }else{
      html += `<div class="label">نتيجة اليوم: ${outLabels[todayRecord.outcome]}</div>`;
    }
  }
  return html;
}

function renderAllRecommendations(){
  const card = document.getElementById('recCard');
  const ranked = computeRanked();
  const validRanked = ranked.filter(r=>r.valid);
  if(!validRanked.length){ card.style.display='none'; return; }
  card.style.display='block';

  const p = nyParts(new Date());
  const status = marketStatus(p);
  const tk = todayKey(p);
  const todayRecord = getTodayRecord(tk);
  const isLocked = todayRecord && isRealTrade(todayRecord.outcome);
  const canCommit = (status==='active' || status==='closed_day') && !isLocked;

  let html = '';
  if(todayRecord){
    html += renderCommittedBlock(todayRecord, ranked, isLocked, canCommit);
    html += `<div style="border-top:1px solid var(--border); margin:16px 0 12px;"></div>`;
  }else{
    html += `<div class="disclaimer" style="margin-bottom:12px;">ما اعتمدت أي صفقة لهذا اليوم بعد. تصفح توصيات كل الأسهم تحت واضغط “اعتماد هذه الصفقة” على اللي تبيها.</div>`;
  }

  html += `<div class="val" style="margin-bottom:10px;">توصيات كل الأسهم</div>`;
  html += validRanked.map(r=>{
    const rec = buildRecommendation(r);
    const isThisCommitted = !!(todayRecord && todayRecord.symbol===r.sym);
    return renderCompactCard(r, rec, isThisCommitted, canCommit);
  }).join('');

  card.innerHTML = html;
}

function renderAdaptivePanel(){
  const card = document.getElementById('adaptiveCard');
  if(!card) return;
  const adj = state.adaptive || {};
  const MIN_SAMPLE = 5;
  let html = `<div class="val" style="margin-bottom:8px;">التعلّم التلقائي من سجلّك</div>`;
  const rows = [];

  if(adj.spy){
    const pct = Math.round(adj.spy.winRate*100);
    rows.push(`<div class="disclaimer" style="margin-bottom:6px; ${adj.spy.penalized?'color:var(--gold);':''}">
      ${adj.spy.penalized?'⚠️':'ℹ️'} صفقاتك المعاكسة لاتجاه SPY: ${pct}% نجاح من أصل ${adj.spy.sample} صفقة${adj.spy.penalized?' — تم تقليل وزنها تلقائيًا بالتوصيات الجديدة.':' (نسبة مقبولة، ما فيه تعديل).'}
    </div>`);
  }else{
    rows.push(`<div class="disclaimer" style="margin-bottom:6px;">صفقاتك المعاكسة لاتجاه SPY: تحتاج ${MIN_SAMPLE} صفقات مقيَّمة على الأقل من هذا النوع لتفعيل التعلّم (عندك أقل من كذا حاليًا).</div>`);
  }

  if(adj.htf){
    const pct = Math.round(adj.htf.winRate*100);
    rows.push(`<div class="disclaimer" style="${adj.htf.penalized?'color:var(--gold);':''}">
      ${adj.htf.penalized?'⚠️':'ℹ️'} صفقاتك المعاكسة للفريم الأكبر (ساعة): ${pct}% نجاح من أصل ${adj.htf.sample} صفقة${adj.htf.penalized?' — تم تقليل وزنها تلقائيًا بالتوصيات الجديدة.':' (نسبة مقبولة، ما فيه تعديل).'}
    </div>`);
  }else{
    rows.push(`<div class="disclaimer">صفقاتك المعاكسة للفريم الأكبر: تحتاج ${MIN_SAMPLE} صفقات مقيَّمة على الأقل من هذا النوع لتفعيل التعلّم.</div>`);
  }

  card.innerHTML = html + rows.join('');
}

function renderChart(){
  const sorted = [...state.history].sort((a,b)=>a.date.localeCompare(b.date)).slice(-14);
  const chartArea = document.getElementById('chartArea');
  if(sorted.length===0){
    chartArea.innerHTML = `<div style="color:var(--dimmer); font-size:12px;">لا توجد توصيات مقيَّمة بعد.</div>`;
    document.getElementById('weekRate').textContent='';
    renderHistoryLog();
    return;
  }
  chartArea.innerHTML = `<div class="chart">` + sorted.map(h=>{
    const r = isRealTrade(h.outcome) ? getR(h) : undefined;
    const val = r!==undefined ? r : 0;
    const color = val>0 ? 'var(--bull)' : val<0 ? 'var(--bear)' : 'var(--dimmer)';
    const height = val===0 ? 8 : Math.round(Math.min(3,Math.abs(val))/3*100);
    const rLabel = r!==undefined ? (r>0?'+':'') + r + 'R' : '';
    return `<div class="chartcol">
      <div class="chartbar" style="height:${Math.max(8,height)}%; background:${color};" title="${rLabel}"></div>
      <div class="chartlabel">${h.date.slice(5)}</div>
    </div>`;
  }).join('') + `</div>`;

  const now = new Date();
  const graded = state.history.filter(h=>isRealTrade(h.outcome));
  const last7 = graded.filter(h=>{
    const d = new Date(h.date);
    return (now-d)/86400000 <= 7;
  });
  if(last7.length){
    const wins = last7.filter(h=>getR(h)>0).length;
    const rate = Math.round(100*wins/last7.length);
    const avgR = last7.reduce((s,h)=>s+getR(h),0)/last7.length;
    document.getElementById('weekRate').textContent = `هذا الأسبوع: ${rate}% نجاح · متوسط ${avgR>=0?'+':''}${avgR.toFixed(2)}R`;
  }else{
    document.getElementById('weekRate').textContent = '';
  }
  renderHistoryLog();
}

function updateClock(){
  const now = new Date();
  const p = nyParts(now);
  const status = marketStatus(p);
  document.getElementById('nyClock').textContent = `${p.hour}:${p.minute}:${p.second}`;
  document.getElementById('dubaiClock').textContent = dubaiClockStr(now);
  document.getElementById('statusLabel').textContent = STATUS_LABEL[status].text;
  document.getElementById('statusLabel').style.color = STATUS_LABEL[status].color;
  document.getElementById('dayLabel').textContent = `${ARABIC_WEEKDAY[p.weekday]||p.weekday} — ${p.day}/${p.month}/${p.year}`;
  document.getElementById('openingBox').style.display = status==='opening' ? 'block' : 'none';

  const tk = todayKey(p);
  if(!state.baseline || state.baseline.date!==tk){
    const stored = localStorage.getItem('ta_baseline_'+tk);
    state.baseline = stored ? JSON.parse(stored) : null;
  }
}

function init(){
  renderWatchlistChips();
  updateClock();
  renderRanking();
  renderAllRecommendations();
  state.adaptive = computeAdaptiveAdjustments();
  renderChart();
  renderAdaptivePanel();
  setInterval(updateClock, 1000);
  setInterval(()=>{
    const p = nyParts(new Date());
    const status = marketStatus(p);
    if(state.apiKey && (status==='active' || status==='opening')) fetchQuotes();
  }, 60000);
}
init();
