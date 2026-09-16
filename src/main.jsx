import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { Activity, Bell, CandlestickChart, Clock3, History as HistoryIcon, LayoutDashboard, Newspaper, ShieldCheck, Sparkles, Target, TrendingUp, WalletCards } from "lucide-react";
import "./styles.css";

const TIMEFRAMES = ["M1", "M5", "M15", "M30", "H1"];
const fmt = (n, d = 2) => n == null || Number.isNaN(Number(n)) ? "—" : Number(n).toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
const empty = { configured:false, source:"—", instrument:"XAUUSD", symbol:"XAU/USD", price:null, livePrice:null, bid:null, ask:null, time:null, candles:[], signal:{status:"WAITING",title:"Waiting for Live Confirmation",note:"Connect the live XAUUSD provider to activate market detection.",confidence:0,entry:null,sl:null,tp1:null,tp2:null,rr:"1 : 2",timeframe:"M15",setup:"STRICT FILTER",updated:"—",candleTime:null,id:"offline"}, indicators:{} };

function Chart({ candles, timeframe, onTimeframe, livePrice }) {
  const raw = (candles || []).slice(-80);
  const data = raw.length && Number.isFinite(Number(livePrice)) ? raw.map((c,i,a) => i === a.length-1 ? ({...c, close:Number(livePrice), high:Math.max(c.high,Number(livePrice)), low:Math.min(c.low,Number(livePrice))}) : c) : raw;
  if (!data.length) return <div className="chart-shell"><TimeframeBar timeframe={timeframe} onTimeframe={onTimeframe}/><div className="chart-empty"><CandlestickChart size={30}/><span>Waiting for live XAUUSD candles…</span></div></div>;
  const lo = Math.min(...data.map(c => c.low)), hi = Math.max(...data.map(c => c.high)), range = Math.max(hi-lo, .01);
  const x = i => 18 + i * 964 / Math.max(data.length-1, 1);
  const y = p => 350 - (p-lo)/range*310;
  return <div className="chart-shell"><TimeframeBar timeframe={timeframe} onTimeframe={onTimeframe}/><div className="chart">
    <svg viewBox="0 0 1000 380" preserveAspectRatio="none">
      {Array.from({length:7}).map((_,i)=><line key={i} x1="0" y1={i*55} x2="1000" y2={i*55} className="gridline"/>)}
      {data.map((c,i)=>{ const up=c.close>=c.open, cx=x(i), top=y(Math.max(c.open,c.close)), bottom=y(Math.min(c.open,c.close)); return <g key={c.time+i}><line x1={cx} y1={y(c.high)} x2={cx} y2={y(c.low)} className={up?"wick up":"wick down"}/><rect x={cx-4.5} y={top} width="9" height={Math.max(2,bottom-top)} className={up?"body up":"body down"}/></g> })}
    </svg><div className="live"><i/> LIVE XAUUSD</div><div className="chart-tf">{timeframe}</div><div className="price-axis">{fmt(data.at(-1)?.close,2)}</div>
  </div></div>;
}
function TimeframeBar({ timeframe, onTimeframe }) { return <div className="timeframe-bar"><span className="tf-label">LIVE TIMEFRAME</span>{TIMEFRAMES.map(tf=><button type="button" key={tf} className={timeframe===tf?"selected":""} onClick={()=>onTimeframe(tf)}>{tf}</button>)}</div>; }
function Metric({label,value}) { return <div className="metric"><span>{label}</span><b>{value}</b></div>; }
function PanelHead({title,subtitle,icon:Icon=Activity}) { return <div className="panel-head"><div><b>{title}</b>{subtitle && <span>{subtitle}</span>}</div><Icon size={17}/></div>; }
function SignalCard({s, large=false}) { return <div className={"signal "+(s.status==="BUY"?"buy":s.status==="SELL"?"sell":"wait")+(large?" large":"")}>
  <div className="signal-top"><span className="pill">{s.status}</span><strong>{s.title}</strong></div><p>{s.note}</p>
  <div className="signal-grid"><Metric label="ENTRY" value={fmt(s.entry,2)}/><Metric label="STOP LOSS" value={fmt(s.sl,2)}/><Metric label="TP1" value={fmt(s.tp1,2)}/><Metric label="TP2" value={fmt(s.tp2,2)}/><Metric label="CONFIDENCE" value={`${s.confidence||0}%`}/><Metric label="SIGNAL TIME" value={s.candleTime ? new Date(s.candleTime).toLocaleTimeString() : "—"}/></div>
</div>; }
function LatestSignal({signal}) { return <div className="latest-signal"><div><span>LATEST CONFIRMED SIGNAL</span><b className={signal.status.toLowerCase()}>{signal.status} · {signal.timeframe}</b></div><div><small>ENTRY</small><strong>{fmt(signal.entry,2)}</strong></div><div><small>TIME</small><strong>{signal.candleTime?new Date(signal.candleTime).toLocaleTimeString():"—"}</strong></div><div><small>SL / TP1</small><strong>{fmt(signal.sl,2)} / {fmt(signal.tp1,2)}</strong></div></div>; }


function TradeMonitor({ trades }) {
  const recent = (trades || []).slice(0, 8);
  return <div className="trade-monitor">
    {recent.length ? recent.map(t => <div className="trade-row" key={t.id}>
      <div><span className={`table-pill ${t.direction.toLowerCase()}`}>{t.direction}</span><b>{t.timeframe}</b><small>{new Date(t.entryTime).toLocaleTimeString()}</small></div>
      <div><small>ENTRY</small><strong>{fmt(t.entry)}</strong></div>
      <div><small>TP1</small><strong>{fmt(t.tp1)}</strong></div>
      <div><small>TP2</small><strong>{fmt(t.tp2)}</strong></div>
      <div><small>SL / ACTIVE SL</small><strong>{fmt(t.sl)} / {fmt(t.activeSl)}</strong></div>
      <div><small>STATUS</small><strong className={`trade-status ${(t.stage||t.status).toLowerCase().replaceAll(" ","-")}`}>{t.stage||t.status}</strong></div>
    </div>) : <div className="trade-empty"><Target size={18}/><span>No monitored entries yet. AUREX will create a trade monitor when a confirmed BUY/SELL appears.</span></div>}
  </div>;
}
function EventLog({ trades }) {
  const events = (trades || []).flatMap(t => (t.events || []).map(e => ({...e, direction:t.direction, timeframe:t.timeframe, id:`${t.id}-${e.time}-${e.type}`}))).sort((a,b)=>new Date(b.time)-new Date(a.time)).slice(0, 20);
  return <div className="event-log">{events.length ? events.map(e => <div className="event-row" key={e.id}><span className={`event-pill ${e.type.toLowerCase().replaceAll(" ","-")}`}>{e.type}</span><b>{e.direction} · {e.timeframe}</b><span>{fmt(e.price)}</span><small>{new Date(e.time).toLocaleTimeString()}</small></div>) : <div className="trade-empty"><Clock3 size={18}/><span>No TP/SL/BE events yet.</span></div>}</div>;
}

function App(){
  const [data,setData]=useState(empty), [connected,setConnected]=useState(false), [tab,setTab]=useState("Dashboard"), [notif,setNotif]=useState(false), [history,setHistory]=useState([]), [trades,setTrades]=useState([]), [timeframe,setTimeframe]=useState("M15"), [news,setNews]=useState({configured:false,events:[],source:"—",updatedAt:null,error:null});
  const initialSignal=useRef(true), previousSignal=useRef("");
  const latestSignal = history.find(x => x.status === "BUY" || x.status === "SELL") || null;

  async function loadMarket(tf=timeframe){ try { const r=await fetch(`/api/market/xauusd?granularity=${tf}&count=180`,{cache:"no-store"}); const j=await r.json(); setData(prev=>({...j, price:j.livePrice ?? j.price, candles:j.candles?.length ? j.candles : prev.candles})); setConnected(Boolean(j.configured)); } catch { setConnected(false); } }
  async function loadNews(){ try { const r=await fetch("/api/news/calendar",{cache:"no-store"}); const j=await r.json(); setNews(j); } catch(e) { setNews({configured:false,events:[],source:"US macro calendar",error:e.message}); } }

  useEffect(()=>{ loadMarket(timeframe); const id=setInterval(()=>loadMarket(timeframe),15000); return()=>clearInterval(id); },[timeframe]);
  useEffect(()=>{ loadNews(); const id=setInterval(loadNews,300000); return()=>clearInterval(id); },[]);
  useEffect(()=>{ try { const saved=JSON.parse(localStorage.getItem("aurex-history")||"[]"); if(Array.isArray(saved)) setHistory(saved); const savedTrades=JSON.parse(localStorage.getItem("aurex-trades")||"[]"); if(Array.isArray(savedTrades)) setTrades(savedTrades); } catch {} if("Notification" in window) setNotif(Notification.permission==="granted"); },[]);

  useEffect(()=>{
    const sig=data.signal; if(!sig || !sig.id || sig.status==="WAITING") return;
    if(previousSignal.current !== sig.id){
      if(!initialSignal.current && notif && "Notification" in window && Notification.permission==="granted") new Notification(`AUREX ${sig.status} — ${sig.timeframe}`,{body:`ENTRY ${fmt(sig.entry)} | SL ${fmt(sig.sl)} | TP1 ${fmt(sig.tp1)} | TP2 ${fmt(sig.tp2)}`});
      previousSignal.current=sig.id; initialSignal.current=false;
      setHistory(prev=>{
        if(prev.some(x=>x.key===sig.id)) return prev;
        const next=[{key:sig.id,time:sig.candleTime||sig.updated,timeframe:sig.timeframe,status:sig.status,title:sig.title,entry:sig.entry,sl:sig.sl,tp1:sig.tp1,tp2:sig.tp2,confidence:sig.confidence},...prev].slice(0,100);
        localStorage.setItem("aurex-history",JSON.stringify(next)); return next;
      });
      setTrades(prev=>{
        if(prev.some(t=>t.id===sig.id)) return prev;
        const trade={id:sig.id,timeframe:sig.timeframe,direction:sig.status,entry:Number(sig.entry),sl:Number(sig.sl),activeSl:Number(sig.sl),tp1:Number(sig.tp1),tp2:Number(sig.tp2),entryTime:sig.candleTime||sig.updated,status:"ACTIVE",stage:"ACTIVE",tp1Hit:false,be:false,events:[{type:"ENTRY",price:Number(sig.entry),time:sig.candleTime||sig.updated}]};
        const next=[trade,...prev].slice(0,100); localStorage.setItem("aurex-trades",JSON.stringify(next)); return next;
      });
    }
  },[data.signal,notif]);

  useEffect(()=>{
    const price=Number(data.livePrice ?? data.price); if(!Number.isFinite(price) || !connected) return;
    setTrades(prev=>{
      let changed=false;
      const next=prev.map(t=>{
        if(t.status!=="ACTIVE") return t;
        const direction=t.direction;
        const hitTP1=direction==="BUY" ? price>=t.tp1 : price<=t.tp1;
        const hitTP2=direction==="BUY" ? price>=t.tp2 : price<=t.tp2;
        const activeStopHit=direction==="BUY" ? price<=t.activeSl : price>=t.activeSl;
        let status=t.status, stage=t.stage||"ACTIVE", activeSl=t.activeSl, tp1Hit=t.tp1Hit, be=t.be, events=[...(t.events||[])];
        const add=(type, p)=>events.push({type,price:p,time:new Date().toISOString()});

        if(!tp1Hit && hitTP1){
          tp1Hit=true; activeSl=t.entry; stage="TP1 HIT · SL → BE"; changed=true;
          add("TP1 HIT",price); add("SL MOVED TO BE",t.entry);
          if(notif && "Notification" in window && Notification.permission==="granted") new Notification(`AUREX TP1 HIT — ${direction} ${t.timeframe}`,{body:`Entry ${fmt(t.entry)} · TP1 ${fmt(t.tp1)} · SL moved to BE ${fmt(t.entry)}`});
        }

        if(tp1Hit && activeStopHit){
          status="BREAK EVEN"; stage="BREAK EVEN"; be=true; changed=true; add("BREAK EVEN",price);
          if(notif && "Notification" in window && Notification.permission==="granted") new Notification(`AUREX BREAK EVEN — ${direction} ${t.timeframe}`,{body:`Entry ${fmt(t.entry)} · price ${fmt(price)}`});
        } else if(hitTP2){
          status="TP2 HIT"; stage="TP2 HIT"; changed=true; add("TP2 HIT",price);
          if(notif && "Notification" in window && Notification.permission==="granted") new Notification(`AUREX TP2 HIT — ${direction} ${t.timeframe}`,{body:`Entry ${fmt(t.entry)} · TP2 ${fmt(t.tp2)}`});
        } else if(!tp1Hit && activeStopHit){
          status="SL HIT"; stage="SL HIT"; changed=true; add("SL HIT",price);
          if(notif && "Notification" in window && Notification.permission==="granted") new Notification(`AUREX SL HIT — ${direction} ${t.timeframe}`,{body:`Entry ${fmt(t.entry)} · SL ${fmt(t.sl)} · price ${fmt(price)}`});
        }

        if(status!==t.status || stage!==t.stage || activeSl!==t.activeSl || tp1Hit!==t.tp1Hit || be!==t.be || events.length!==(t.events||[]).length) return {...t,status,stage,activeSl,tp1Hit,be,events};
        return t;
      });
      if(changed) localStorage.setItem("aurex-trades",JSON.stringify(next));
      return next;
    });
  },[data.livePrice,data.price,connected,notif]);

  async function enablePush(){ if(!("Notification" in window)){alert("Browser notifications are not supported on this device/browser.");return;} const p=await Notification.requestPermission(); setNotif(p==="granted"); }
  const s=data.signal||empty.signal, ind=data.indicators||{};
  const nav=[["Dashboard",LayoutDashboard],["Signals",Target],["History",HistoryIcon],["News",Newspaper],["AI Analysis",Sparkles]];
  const bias=s.status==="BUY"?"Bullish":s.status==="SELL"?"Bearish":"Neutral";
  const analysis=useMemo(()=>{ const e20=Number(ind.ema20),e50=Number(ind.ema50),r=Number(ind.rsi),a=Number(ind.atr); return {trend:e20>e50?"Bullish structure":e20<e50?"Bearish structure":"Mixed structure",momentum:r>=52?"Positive momentum":r<=48?"Negative momentum":"Balanced momentum",volatility:a?`ATR ${fmt(a,2)} on ${timeframe}`:"Waiting for ATR",pricePosition:data.price&&e20?(data.price>e20?"Price above EMA20":"Price below EMA20"):"Waiting for price"}; },[ind,data.price,timeframe]);
  const monitoring=connected;
  const upcoming=(news.events||[]).slice(0,12);

  const page={
    Dashboard:<>
      <section className="hero hero-dashboard"><div><span className="muted">XAUUSD · SPOT GOLD</span><div className="big-price">{fmt(data.price,2)}</div><div className="quote">{monitoring?`Live quote · ${data.source}`:"Provider quote unavailable"}</div></div><div className="hero-right"><Metric label="TIMEFRAME" value={timeframe}/><Metric label="SOURCE" value={data.source||"—"}/><Metric label="UPDATED" value={data.time?new Date(data.time).toLocaleTimeString():"—"}/></div></section>
      <section className="monitor-strip"><div><span className="pulse-dot"/> <b>{monitoring?"Live Monitoring Active":"Feed Offline"}</b><small>Live {timeframe} · refresh ~15s</small></div><button className="monitor-button" onClick={()=>loadMarket(timeframe)}>Refresh now</button></section>
      <section className="dashboard-stats"><div className="stat-card"><span>LIVE PRICE</span><b>{fmt(data.price,2)}</b><small>{timeframe} · {data.source||"—"}</small></div><div className="stat-card"><span>LIVE SIGNAL</span><b className={s.status.toLowerCase()}>{s.status}</b><small>{s.title}</small></div><div className="stat-card"><span>CONFIDENCE</span><b>{s.confidence||0}%</b><small>Current setup</small></div><div className="stat-card"><span>R:R</span><b>{s.rr||"1 : 2"}</b><small>Risk / reward</small></div></section>
      {latestSignal && <LatestSignal signal={latestSignal}/>}
      <section className="panel"><PanelHead title="Trade Monitor" subtitle="TP1 / TP2 / SL / Break Even tracking" icon={Target}/><TradeMonitor trades={trades}/></section>
      <section className="panel"><PanelHead title="Trade Events" subtitle="Latest entry and exit milestones" icon={Bell}/><EventLog trades={trades}/></section> 
      <section className="grid2"><div className="panel chart-panel"><PanelHead title="Live Price Action" subtitle="Tap M1 / M5 / M15 / M30 / H1 to switch" icon={Clock3}/><Chart candles={data.candles} livePrice={data.livePrice ?? data.price} timeframe={timeframe} onTimeframe={setTimeframe}/></div><div className="panel signal-panel"><PanelHead title="Live Signal" subtitle={`${timeframe} monitoring`}/><SignalCard s={s}/><div className="indicator-row"><Metric label="EMA20" value={fmt(ind.ema20,2)}/><Metric label="EMA50" value={fmt(ind.ema50,2)}/><Metric label="RSI" value={fmt(ind.rsi,1)}/><Metric label="ATR" value={fmt(ind.atr,2)}/></div></div></section>
      <section className="lower"><div className="panel"><PanelHead title="Detection Logic" subtitle="Signal only when completed-candle filters align" icon={Sparkles}/><div className="logic"><span>{timeframe} trend</span><span>EMA structure</span><span>RSI</span><span>MACD</span><span>Volatility</span><span>Market structure</span></div></div><div className="panel"><PanelHead title="Alerts" subtitle={notif?"Browser entry alerts armed":"Turn on entry alerts"} icon={Bell}/><button className="primary" onClick={enablePush}>{notif?"Notifications Enabled":"Enable Entry Notifications"}</button></div></section>
    </>,
    Signals:<><section className="page-stack"><div className="page-intro"><div><span className="muted">SIGNAL CENTER</span><h2>Trade Signals</h2><p>Each timeframe has its own live setup and latest confirmed entry.</p></div><div className="bias-card"><span>MARKET BIAS</span><b className={s.status.toLowerCase()}>{bias}</b></div></div><div className="panel timeframe-panel"><TimeframeBar timeframe={timeframe} onTimeframe={setTimeframe}/></div><div className="signal-page-grid"><div className="panel"><PanelHead title="Current Setup" subtitle={`Live ${timeframe} XAUUSD feed`} icon={Target}/><SignalCard s={s} large/>{latestSignal&&<LatestSignal signal={latestSignal}/>}</div><div className="panel"><PanelHead title={`${timeframe} Indicators`} subtitle="Current technical readings"/><div className="stats-list"><Metric label="PRICE" value={fmt(data.price,2)}/><Metric label="EMA20" value={fmt(ind.ema20,2)}/><Metric label="EMA50" value={fmt(ind.ema50,2)}/><Metric label="RSI" value={fmt(ind.rsi,1)}/><Metric label="ATR" value={fmt(ind.atr,2)}/><Metric label="SOURCE" value={data.source||"—"}/></div></div></div></section><section className="panel"><PanelHead title="Trade Monitor" subtitle={`${timeframe} TP / SL / BE status`} icon={Target}/><TradeMonitor trades={trades.filter(t=>t.timeframe===timeframe)}/><EventLog trades={trades.filter(t=>t.timeframe===timeframe)}/></section></>,
    History:<section className="page-stack"><div className="page-intro"><div><span className="muted">TRADE MONITOR LOG</span><h2>Signal & Trade History</h2><p>Every confirmed entry is tracked through TP1, Break Even, TP2 or SL.</p></div><div className="history-count"><b>{trades.length}</b><span>trades</span></div></div><div className="panel table-panel">{trades.length?<table><thead><tr><th>ENTRY TIME</th><th>TF</th><th>SIGNAL</th><th>ENTRY</th><th>ACTIVE SL</th><th>TP1</th><th>TP2</th><th>STATUS</th></tr></thead><tbody>{trades.map(x=><tr key={x.id}><td>{new Date(x.entryTime).toLocaleTimeString()}</td><td>{x.timeframe}</td><td><span className={"table-pill "+x.direction.toLowerCase()}>{x.direction}</span></td><td>{fmt(x.entry,2)}</td><td>{fmt(x.activeSl,2)}</td><td>{fmt(x.tp1,2)}</td><td>{fmt(x.tp2,2)}</td><td><span className={`trade-status ${x.status.toLowerCase().replaceAll(" ","-")}`}>{x.status}</span></td></tr>)}</tbody></table>:<div className="empty-page"><HistoryIcon size={34}/><b>No monitored trades recorded yet</b><span>AUREX will track the next confirmed BUY/SELL entry.</span></div>}</div><div className="panel"><PanelHead title="Event Timeline" subtitle="TP1 / BE / TP2 / SL events" icon={Clock3}/><EventLog trades={trades}/></div></section>,
    News:<section className="page-stack"><div className="page-intro"><div><span className="muted">LIVE MACRO CALENDAR</span><h2>Gold Market News</h2><p>High-impact US macro releases relevant to XAUUSD.</p></div><div className={news.configured?"news-status live-news":"news-status"}><span className="dot"/> {news.configured?"LIVE CALENDAR":"CALENDAR OFFLINE"}</div></div><div className="news-grid">{upcoming.length?upcoming.map(e=><div className="panel news-event" key={e.id}><div className="event-top"><span className="tag">{e.impact}</span><small>{e.country}</small></div><h3>{e.title}</h3><div className="event-time">{e.date||"—"} · {e.time||"time TBA"}</div><div className="event-values"><span><small>PREVIOUS</small><b>{e.previous??"—"}</b></span><span><small>FORECAST</small><b>{e.forecast??"—"}</b></span><span><small>ACTUAL</small><b>{e.actual??"—"}</b></span></div></div>):<div className="panel notice-panel"><ShieldCheck size={18}/><div><b>{news.error?"Live calendar connection failed":"No high-impact events returned"}</b><span>{news.error||"The calendar provider returned no high-impact events right now."}</span></div></div>}</div><div className="panel notice-panel"><ShieldCheck size={18}/><div><b>Calendar source: {news.source||"—"}</b><span>Events are informational. Release times and values can change; always verify against the official release.</span></div></div></section>,
    "AI Analysis":<section className="page-stack"><div className="page-intro"><div><span className="muted">AUREX INTELLIGENCE</span><h2>AI Market Analysis</h2><p>Readable technical context from the selected live timeframe.</p></div><div className="analysis-badge"><Sparkles size={15}/> {timeframe}</div></div><div className="analysis-grid"><div className="panel analysis-main"><PanelHead title="Current Market Read" subtitle="Technical context — not a guarantee" icon={Sparkles}/><div className="analysis-hero"><div><span>BIAS</span><b className={s.status.toLowerCase()}>{bias}</b></div><div><span>SIGNAL</span><b>{s.status}</b></div><div><span>CONFIDENCE</span><b>{s.confidence||0}%</b></div></div><div className="analysis-points"><div><TrendingUp size={17}/><div><b>Trend</b><span>{analysis.trend}</span></div></div><div><Activity size={17}/><div><b>Momentum</b><span>{analysis.momentum}</span></div></div><div><Target size={17}/><div><b>Price position</b><span>{analysis.pricePosition}</span></div></div><div><WalletCards size={17}/><div><b>Volatility</b><span>{analysis.volatility}</span></div></div></div></div><div className="panel"><PanelHead title="What AUREX Sees" subtitle="Live indicator snapshot"/><div className="insight-list"><p><b>EMA:</b> {fmt(ind.ema20,2)} vs {fmt(ind.ema50,2)}.</p><p><b>RSI:</b> {fmt(ind.rsi,1)}.</p><p><b>ATR:</b> {fmt(ind.atr,2)}.</p><p><b>Timeframe:</b> {timeframe}.</p><p><b>Latest signal:</b> {latestSignal?`${latestSignal.status} at ${fmt(latestSignal.entry,2)}`:"none yet"}.</p></div></div></div></section>
  }[tab];

  return <div className="app"><aside><div className="brand"><div className="logo">A</div><div><strong>AUREX</strong><small>AI GOLD INTELLIGENCE</small></div></div><nav>{nav.map(([n,I])=><button type="button" className={tab===n?"active":""} onClick={()=>setTab(n)} key={n}><I size={17}/>{n}</button>)}</nav><div className="side-note"><ShieldCheck size={16}/><span>No MT5 required<br/><small>Twelve Data → AUREX engine</small></span></div></aside>
    <main><header><div><div className="eyebrow">MARKET INTELLIGENCE</div><h1>{tab}</h1></div><div className="header-actions"><div className={monitoring?"status live-status":"status"}><i/> {monitoring?"LIVE MONITORING ACTIVE":"FEED OFFLINE"}</div><button className="iconbtn" onClick={enablePush} title="Enable entry notifications"><Bell size={18}/></button></div></header>{page}<footer><span>© AUREX AI</span><span>Market data source: {data.source||"not connected"} · XAUUSD is OTC and quotes vary by provider.</span></footer></main>
    <div className="mobile-nav">{nav.map(([n,I])=><button type="button" className={tab===n?"active":""} onClick={()=>setTab(n)} key={n}><I size={18}/><span>{n.replace("AI Analysis","AI")}</span></button>)}</div>
  </div>;
}
createRoot(document.getElementById("root")).render(<App/>);
