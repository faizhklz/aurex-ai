import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { Activity, Bell, CandlestickChart, Clock3, History as HistoryIcon, LayoutDashboard, Newspaper, ShieldCheck, Sparkles, Target, TrendingUp, WalletCards, Users, Crown } from "lucide-react";
import "./styles.css";

const TIMEFRAMES = ["M1", "M5", "M15", "M30", "H1"];
const fmt = (n, d = 2) => n == null || Number.isNaN(Number(n)) ? "—" : Number(n).toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
const empty = { configured:false, source:"—", instrument:"XAUUSD", symbol:"XAU/USD", price:null, livePrice:null, bid:null, ask:null, time:null, candles:[], signal:{status:"WAITING",title:"Waiting for Live Confirmation",note:"Connect the live XAUUSD provider to activate market detection.",confidence:0,entry:null,sl:null,tp1:null,tp2:null,rr:"1 : 2",timeframe:"M15",setup:"STRICT FILTER",updated:"—",candleTime:null,id:"offline"}, indicators:{} };

function Chart({ candles, timeframe, onTimeframe }) {
  const data = (candles || []).slice(-80);
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

function DashboardApp({ user, onLogout }){
  const [data,setData]=useState(empty), [connected,setConnected]=useState(false), [tab,setTab]=useState("Dashboard"), [notif,setNotif]=useState(()=>"Notification" in window && Notification.permission==="granted"), [history,setHistory]=useState([]), [timeframe,setTimeframe]=useState("M15"), [news,setNews]=useState({configured:false,events:[],source:"—",updatedAt:null,error:null});
  const initialSignal=useRef(true), previousSignal=useRef("");
  const latestSignal = history.find(x => x.status === "BUY" || x.status === "SELL") || null;

  async function loadMarket(tf=timeframe){ try { const r=await fetch(`/api/market/xauusd?granularity=${tf}&count=180`,{cache:"no-store"}); const j=await r.json(); setData(prev=>({...j, price:j.livePrice ?? j.price, candles:j.candles?.length ? j.candles : prev.candles})); setConnected(Boolean(j.configured)); } catch { setConnected(false); } }
  async function loadNews(){ try { const r=await fetch("/api/news/calendar",{cache:"no-store"}); const j=await r.json(); setNews(j); } catch(e) { setNews({configured:false,events:[],source:"US macro calendar",error:e.message}); } }

  useEffect(()=>{ loadMarket(timeframe); const id=setInterval(()=>loadMarket(timeframe),15000); return()=>clearInterval(id); },[timeframe]);
  useEffect(()=>{ loadNews(); const id=setInterval(loadNews,300000); return()=>clearInterval(id); },[]);
  useEffect(()=>{ try { const saved=JSON.parse(localStorage.getItem("sniper-history")||"[]"); if(Array.isArray(saved)) setHistory(saved); } catch {} },[]);

  useEffect(()=>{
    const sig=data.signal; if(!sig || !sig.id || sig.status==="WAITING") return;
    if(previousSignal.current !== sig.id){
      if(!initialSignal.current && notif && "Notification" in window && Notification.permission==="granted") new Notification(`SNIPER XAUUSD ${sig.status} — ${sig.timeframe}`,{body:`ENTRY ${fmt(sig.entry)} | SL ${fmt(sig.sl)} | TP1 ${fmt(sig.tp1)} | ${sig.candleTime?new Date(sig.candleTime).toLocaleTimeString():""}`});
      previousSignal.current=sig.id; initialSignal.current=false;
      setHistory(prev=>{
        if(prev.some(x=>x.key===sig.id)) return prev;
        const next=[{key:sig.id,time:sig.candleTime||sig.updated,timeframe:sig.timeframe,status:sig.status,title:sig.title,entry:sig.entry,sl:sig.sl,tp1:sig.tp1,tp2:sig.tp2,confidence:sig.confidence},...prev].slice(0,100);
        localStorage.setItem("sniper-history",JSON.stringify(next)); return next;
      });
    }
  },[data.signal,notif]);

  async function enablePush(){ if(!("Notification" in window)){alert("Browser notifications are not supported on this device/browser.");return;} const p=await Notification.requestPermission(); setNotif(p==="granted"); }
  const s=data.signal||empty.signal, ind=data.indicators||{};
  const nav=[["Dashboard",LayoutDashboard],["Signals",Target],["History",HistoryIcon],["News",Newspaper],["AI Analysis",Sparkles],...(user?.role==="admin"?[["Admin",Crown]]:[])];
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
      <section className="grid2"><div className="panel chart-panel"><PanelHead title="Live Price Action" subtitle="Tap M1 / M5 / M15 / M30 / H1 to switch" icon={Clock3}/><Chart candles={data.candles} timeframe={timeframe} onTimeframe={setTimeframe}/></div><div className="panel signal-panel"><PanelHead title="Live Signal" subtitle={`${timeframe} monitoring`}/><SignalCard s={s}/><div className="indicator-row"><Metric label="EMA20" value={fmt(ind.ema20,2)}/><Metric label="EMA50" value={fmt(ind.ema50,2)}/><Metric label="RSI" value={fmt(ind.rsi,1)}/><Metric label="ATR" value={fmt(ind.atr,2)}/></div></div></section>
      <section className="lower"><div className="panel"><PanelHead title="Detection Logic" subtitle="Signal only when completed-candle filters align" icon={Sparkles}/><div className="logic"><span>{timeframe} trend</span><span>EMA structure</span><span>RSI</span><span>MACD</span><span>Volatility</span><span>Market structure</span></div></div><div className="panel"><PanelHead title="Alerts" subtitle={notif?"Browser entry alerts armed":"Turn on entry alerts"} icon={Bell}/><button className="primary" onClick={enablePush}>{notif?"Notifications Enabled":"Enable Entry Notifications"}</button></div></section>
    </>,
    Signals:<section className="page-stack"><div className="page-intro"><div><span className="muted">SIGNAL CENTER</span><h2>Trade Signals</h2><p>Each timeframe has its own live setup and latest confirmed entry.</p></div><div className="bias-card"><span>MARKET BIAS</span><b className={s.status.toLowerCase()}>{bias}</b></div></div><div className="panel timeframe-panel"><TimeframeBar timeframe={timeframe} onTimeframe={setTimeframe}/></div><div className="signal-page-grid"><div className="panel"><PanelHead title="Current Setup" subtitle={`Live ${timeframe} XAUUSD feed`} icon={Target}/><SignalCard s={s} large/>{latestSignal&&<LatestSignal signal={latestSignal}/>}</div><div className="panel"><PanelHead title={`${timeframe} Indicators`} subtitle="Current technical readings"/><div className="stats-list"><Metric label="PRICE" value={fmt(data.price,2)}/><Metric label="EMA20" value={fmt(ind.ema20,2)}/><Metric label="EMA50" value={fmt(ind.ema50,2)}/><Metric label="RSI" value={fmt(ind.rsi,1)}/><Metric label="ATR" value={fmt(ind.atr,2)}/><Metric label="SOURCE" value={data.source||"—"}/></div></div></div></section>,
    History:<section className="page-stack"><div className="page-intro"><div><span className="muted">SIGNAL LOG</span><h2>Signal History</h2><p>Only confirmed BUY/SELL entries are recorded.</p></div><div className="history-count"><b>{history.length}</b><span>records</span></div></div><div className="panel table-panel">{history.length?<table><thead><tr><th>TIME</th><th>TF</th><th>STATUS</th><th>ENTRY</th><th>SL</th><th>TP1</th><th>TP2</th></tr></thead><tbody>{history.map(x=><tr key={x.key}><td>{new Date(x.time).toLocaleTimeString()}</td><td>{x.timeframe}</td><td><span className={"table-pill "+x.status.toLowerCase()}>{x.status}</span></td><td>{fmt(x.entry,2)}</td><td>{fmt(x.sl,2)}</td><td>{fmt(x.tp1,2)}</td><td>{fmt(x.tp2,2)}</td></tr>)}</tbody></table>:<div className="empty-page"><HistoryIcon size={34}/><b>No confirmed signals recorded yet</b><span>SNIPER XAUUSD will record a new entry when a timeframe confirms a setup.</span></div>}</div></section>,
    News:<section className="page-stack"><div className="page-intro"><div><span className="muted">LIVE MACRO CALENDAR</span><h2>Gold Market News</h2><p>High-impact US macro releases relevant to XAUUSD.</p></div><div className={news.configured?"news-status live-news":"news-status"}><span className="dot"/> {news.configured?"LIVE CALENDAR":"CALENDAR OFFLINE"}</div></div><div className="news-grid">{upcoming.length?upcoming.map(e=><div className="panel news-event" key={e.id}><div className="event-top"><span className="tag">{e.impact}</span><small>{e.country}</small></div><h3>{e.title}</h3><div className="event-time">{e.date||"—"} · {e.time||"time TBA"}</div><div className="event-values"><span><small>PREVIOUS</small><b>{e.previous??"—"}</b></span><span><small>FORECAST</small><b>{e.forecast??"—"}</b></span><span><small>ACTUAL</small><b>{e.actual??"—"}</b></span></div></div>):<div className="panel notice-panel"><ShieldCheck size={18}/><div><b>{news.error?"Live calendar connection failed":"No high-impact events returned"}</b><span>{news.error||"The calendar provider returned no high-impact events right now."}</span></div></div>}</div><div className="panel notice-panel"><ShieldCheck size={18}/><div><b>Calendar source: {news.source||"—"}</b><span>Events are informational. Release times and values can change; always verify against the official release.</span></div></div></section>,
    "AI Analysis":<section className="page-stack"><div className="page-intro"><div><span className="muted">SNIPER XAUUSD INTELLIGENCE</span><h2>AI Market Analysis</h2><p>Readable technical context from the selected live timeframe.</p></div><div className="analysis-badge"><Sparkles size={15}/> {timeframe}</div></div><div className="analysis-grid"><div className="panel analysis-main"><PanelHead title="Current Market Read" subtitle="Technical context — not a guarantee" icon={Sparkles}/><div className="analysis-hero"><div><span>BIAS</span><b className={s.status.toLowerCase()}>{bias}</b></div><div><span>SIGNAL</span><b>{s.status}</b></div><div><span>CONFIDENCE</span><b>{s.confidence||0}%</b></div></div><div className="analysis-points"><div><TrendingUp size={17}/><div><b>Trend</b><span>{analysis.trend}</span></div></div><div><Activity size={17}/><div><b>Momentum</b><span>{analysis.momentum}</span></div></div><div><Target size={17}/><div><b>Price position</b><span>{analysis.pricePosition}</span></div></div><div><WalletCards size={17}/><div><b>Volatility</b><span>{analysis.volatility}</span></div></div></div></div><div className="panel"><PanelHead title="What SNIPER XAUUSD Sees" subtitle="Live indicator snapshot"/><div className="insight-list"><p><b>EMA:</b> {fmt(ind.ema20,2)} vs {fmt(ind.ema50,2)}.</p><p><b>RSI:</b> {fmt(ind.rsi,1)}.</p><p><b>ATR:</b> {fmt(ind.atr,2)}.</p><p><b>Timeframe:</b> {timeframe}.</p><p><b>Latest signal:</b> {latestSignal?`${latestSignal.status} at ${fmt(latestSignal.entry,2)}`:"none yet"}.</p></div></div></div></section>
    ,Admin:<AdminPanel user={user}/>
  }[tab];

  return <div className="app"><aside><div className="brand"><div className="logo">A</div><div><strong>SNIPER XAUUSD</strong><small>AI GOLD INTELLIGENCE</small></div></div><nav>{nav.map(([n,I])=><button type="button" className={tab===n?"active":""} onClick={()=>setTab(n)} key={n}><I size={17}/>{n}</button>)}</nav><div className="side-note"><ShieldCheck size={16}/><span>No MT5 required<br/><small>Twelve Data → SNIPER XAUUSD engine</small></span></div></aside>
    <main><header><div><div className="eyebrow">MARKET INTELLIGENCE</div><h1>{tab}</h1></div><div className="header-actions"><div className={monitoring?"status live-status":"status"}><i/> {monitoring?"LIVE MONITORING ACTIVE":"FEED OFFLINE"}</div><span className="user-chip">{user?.email || "Member"}</span><button className="iconbtn" onClick={enablePush} title="Enable entry notifications"><Bell size={18}/></button><button className="logout-btn" onClick={onLogout}>Logout</button></div></header>{page}<footer><span>© SNIPER XAUUSD</span><span>Market data source: {data.source||"not connected"} · XAUUSD is OTC and quotes vary by provider.</span></footer></main>
    <div className="mobile-nav">{nav.map(([n,I])=><button type="button" className={tab===n?"active":""} onClick={()=>setTab(n)} key={n}><I size={18}/><span>{n.replace("AI Analysis","AI")}</span></button>)}</div>
  </div>;
}

function AuthScreen({ mode, setMode, onAuthed }) {
  const [email,setEmail]=useState(""); const [name,setName]=useState(""); const [password,setPassword]=useState(""); const [confirm,setConfirm]=useState(""); const [busy,setBusy]=useState(false); const [error,setError]=useState("");
  async function submit(e){ e.preventDefault(); setError(""); if(mode==="register" && password!==confirm){setError("Password confirmation does not match.");return;} setBusy(true); try{ const r=await fetch(`/api/auth/${mode}`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({email,name,password})}); const j=await r.json(); if(!r.ok) throw new Error(j.error||"Request failed"); onAuthed(j.user); }catch(err){setError(err.message)}finally{setBusy(false)} }
  return <div className="auth-wrap"><div className="auth-card"><div className="brand auth-brand"><div className="logo">A</div><div><strong>SNIPER XAUUSD</strong><small>AI GOLD INTELLIGENCE</small></div></div><div className="auth-kicker">GOLD INTELLIGENCE PLATFORM</div><h1>{mode==="register"?"Create your SNIPER XAUUSD account":"Welcome back"}</h1><p className="auth-sub">{mode==="register"?"Register first to access the SNIPER XAUUSD dashboard.":"Login to continue to SNIPER XAUUSD."}</p><form onSubmit={submit}>{mode==="register"&&<label>Name<input value={name} onChange={e=>setName(e.target.value)} placeholder="Your name" required/></label>}<label>Email<input type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@example.com" required/></label><label>Password<input type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="••••••••" minLength="8" required/></label>{mode==="register"&&<label>Confirm Password<input type="password" value={confirm} onChange={e=>setConfirm(e.target.value)} placeholder="••••••••" minLength="8" required/></label>}{error&&<div className="auth-error">{error}</div>}<button className="primary auth-submit" disabled={busy}>{busy?"Please wait…":mode==="register"?"CREATE ACCOUNT":"LOGIN"}</button></form><div className="auth-switch">{mode==="register"?<>Already registered? <button onClick={()=>setMode("login")}>Login</button></>:<>New to SNIPER XAUUSD? <button onClick={()=>setMode("register")}>Create account</button></>}</div><small className="auth-note">Dashboard access requires an authenticated SNIPER XAUUSD account. Subscription access is checked after login.</small></div></div>;
}
function Landing({ onStart }) { 
return <div className="landing">
<div className="landing-top">
<div className="brand">
<div className="logo">A</div>
<div><strong>SNIPER XAUUSD</strong><small>AI GOLD INTELLIGENCE</small></div>
</div>
<button className="ghost" onClick={()=>onStart("login")}>LOGIN</button>
</div>

<div className="landing-hero">
<span className="muted">XAUUSD · AI POWERED PRECISION TRADING</span>

<h1>
TRADE GOLD LIKE A<br/>
<em>SNIPER.</em>
</h1>

<p>
Real-time XAUUSD data, sniper AI signals, TP/SL monitoring,
macro news and multi-timeframe analysis — all in one elite trading platform.
</p>

<div className="landing-actions">
<button className="primary" onClick={()=>onStart("register")}>
CREATE ACCOUNT
</button>

<button className="ghost" onClick={()=>onStart("login")}>
LOGIN
</button>
</div>
</div>

<div className="landing-features">
<span>LIVE XAUUSD</span>
<span>M1 · M5 · M15 · M30 · H1</span>
<span>TP1 · TP2 · SL · BE MONITOR</span>
<span>HIGH-IMPACT NEWS</span>
</div>

</div>
}
function SubscriptionGate({ user, onLogout }) { return <div className="gate"><div className="gate-card"><div className="brand auth-brand"><div className="logo">A</div><div><strong>SNIPER XAUUSD</strong><small>AI GOLD INTELLIGENCE</small></div></div><span className="muted">ACCOUNT ACCESS</span><h1>Subscription required</h1><p>Your account is registered, but an active subscription is required to open the trading dashboard.</p><div className="gate-info"><span>Account</span><b>{user?.email}</b></div><button className="primary">VIEW PLANS</button><button className="ghost wide" onClick={onLogout}>LOG OUT</button><small>Payment and automatic subscription activation will be connected after the membership system is configured.</small></div></div> }
function AdminPanel({user}) {
  const [users,setUsers]=useState([]), [busy,setBusy]=useState(false), [error,setError]=useState("");
  async function load(){ try{const r=await fetch("/api/admin/users",{credentials:"include",cache:"no-store"}); const j=await r.json(); if(!r.ok) throw new Error(j.error||"Failed to load users"); setUsers(j.users||[]);}catch(e){setError(e.message)} }
  useEffect(()=>{load()},[]);
  async function updateSubscription(u){
    const active=u.subscription_status!=="active";
    const plan=window.prompt("Plan name (example: PRO)",u.subscription_plan||"PRO");
    if(plan===null)return;
    const expiresText=window.prompt("Expiry date (YYYY-MM-DD) or leave blank for no expiry",u.subscription_expires_at?u.subscription_expires_at.slice(0,10):"");
    if(expiresText===null)return;
    setBusy(true);setError("");
    try{const r=await fetch("/api/admin/subscription",{method:"POST",credentials:"include",headers:{"content-type":"application/json"},body:JSON.stringify({userId:u.id,status:active?"active":"inactive",plan,expiresAt:expiresText?`${expiresText}T23:59:59Z`:null})});const j=await r.json();if(!r.ok)throw new Error(j.error||"Update failed");await load()}catch(e){setError(e.message)}finally{setBusy(false)}
  }
  async function toggleRole(u){
    const role=u.role==="admin"?"member":"admin";
    if(!window.confirm(`Change ${u.email} role to ${role}?`))return;
    setBusy(true);setError("");
    try{const r=await fetch("/api/admin/role",{method:"POST",credentials:"include",headers:{"content-type":"application/json"},body:JSON.stringify({userId:u.id,role})});const j=await r.json();if(!r.ok)throw new Error(j.error||"Role update failed");await load()}catch(e){setError(e.message)}finally{setBusy(false)}
  }
  return <section className="page-stack"><div className="page-intro"><div><span className="muted">OWNER CONTROL</span><h2>Admin Panel</h2><p>Manage SNIPER XAUUSD members, roles and subscription access.</p></div><div className="analysis-badge"><Crown size={15}/> ADMIN</div></div>{error&&<div className="auth-error">{error}</div>}<div className="panel admin-summary"><Users size={18}/><div><b>{users.length} accounts</b><span>Subscription access is controlled here. Admin accounts bypass subscription gating.</span></div></div><div className="panel admin-table-wrap"><div className="panel-head"><div><b>Members</b><span>Activate/deactivate access and manage roles.</span></div><button className="ghost" onClick={load} disabled={busy}>Refresh</button></div><div className="table-scroll"><table className="admin-table"><thead><tr><th>USER</th><th>ROLE</th><th>PLAN</th><th>STATUS</th><th>EXPIRES</th><th>ACTION</th></tr></thead><tbody>{users.map(u=><tr key={u.id}><td><b>{u.name}</b><small>{u.email}</small></td><td><span className="table-pill">{u.role}</span></td><td>{u.subscription_plan||"—"}</td><td><span className={"table-pill "+(u.subscription_status==="active"?"buy":"sell")}>{u.subscription_status||"inactive"}</span></td><td>{u.subscription_expires_at?new Date(u.subscription_expires_at).toLocaleDateString():"No expiry"}</td><td><div className="admin-actions"><button className="small-btn" onClick={()=>updateSubscription(u)} disabled={busy}>{u.subscription_status==="active"?"DEACTIVATE":"ACTIVATE"}</button><button className="small-btn" onClick={()=>toggleRole(u)} disabled={busy}>{u.role==="admin"?"MAKE MEMBER":"MAKE ADMIN"}</button></div></td></tr>)}</tbody></table></div></div></section>;
}

function AppShell(){
  const [auth,setAuth]=useState("loading"); const [mode,setMode]=useState("landing"); const [user,setUser]=useState(null);
  async function me(){try{const r=await fetch("/api/auth/me",{credentials:"include"}); const j=await r.json(); if(r.ok&&j.user){setUser(j.user); setAuth("ok");} else setAuth("guest");}catch{setAuth("guest")}}
  useEffect(()=>{me()},[]);
  async function logout(){await fetch("/api/auth/logout",{method:"POST",credentials:"include"});setUser(null);setAuth("guest");setMode("landing")}
  if(auth==="loading") return <div className="auth-loading">Loading SNIPER XAUUSD…</div>;
  if(auth==="guest") return mode==="landing"?<Landing onStart={setMode}/>:<AuthScreen mode={mode} setMode={setMode} onAuthed={u=>{setUser(u);setAuth("ok")}}/>;
  if(user?.role!=="admin" && !user?.subscriptionActive) return <SubscriptionGate user={user} onLogout={logout}/>;
  return <DashboardApp user={user} onLogout={logout}/>;
}
createRoot(document.getElementById("root")).render(<AppShell/>);
