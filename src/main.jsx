import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { Activity, Bell, CandlestickChart, Clock3, History, LayoutDashboard, Newspaper, Settings, ShieldCheck, Sparkles, Target, TrendingDown, TrendingUp } from "lucide-react";
import "./styles.css";

const fmt = (n, d=2) => n == null ? "—" : Number(n).toLocaleString("en-US",{minimumFractionDigits:d,maximumFractionDigits:d});
const empty = {configured:false,source:"—",instrument:"XAUUSD",price:null,bid:null,ask:null,time:null,candles:[],signal:{status:"WAITING",title:"Waiting for Live Confirmation",note:"Connect the live XAUUSD provider to activate market detection.",confidence:0,entry:null,sl:null,tp1:null,tp2:null,rr:"1 : 2",timeframe:"M15",setup:"STRICT FILTER",updated:"—"},indicators:{}};

function Chart({candles}) {
  const data = candles.slice(-60);
  if (!data.length) return <div className="chart-empty"><CandlestickChart size={30}/><span>Waiting for real XAUUSD candles…</span></div>;
  const lo=Math.min(...data.map(c=>c.low)), hi=Math.max(...data.map(c=>c.high)), range=Math.max(hi-lo,.01);
  const x=i=>25+i*950/Math.max(data.length-1,1);
  const y=p=>350-(p-lo)/range*310;
  return <div className="chart">
    <svg viewBox="0 0 1000 380" preserveAspectRatio="none">
      {Array.from({length:7}).map((_,i)=><line key={i} x1="0" y1={i*55} x2="1000" y2={i*55} className="gridline"/>)}
      {data.map((c,i)=>{
        const up=c.close>=c.open, cx=x(i), top=y(Math.max(c.open,c.close)), bottom=y(Math.min(c.open,c.close));
        return <g key={c.time+i}>
          <line x1={cx} y1={y(c.high)} x2={cx} y2={y(c.low)} className={up?"wick up":"wick down"}/>
          <rect x={cx-5} y={top} width="10" height={Math.max(2,bottom-top)} className={up?"body up":"body down"}/>
        </g>
      })}
    </svg>
    <div className="live"><i/> LIVE XAUUSD</div><div className="tf">M15</div>
    <div className="price-axis">{fmt(data.at(-1)?.close,2)}</div>
  </div>
}

function Metric({label,value}){ return <div className="metric"><span>{label}</span><b>{value}</b></div> }

function App(){
  const [data,setData]=useState(empty), [connected,setConnected]=useState(false), [tab,setTab]=useState("Dashboard"), [notif,setNotif]=useState(false);
  async function load(){
    try{
      const r=await fetch("/api/market/xauusd?granularity=M15&count=120",{cache:"no-store"});
      const j=await r.json();
      setData(j); setConnected(Boolean(j.configured));
    }catch(e){ setConnected(false); }
  }
  useEffect(()=>{load(); const id=setInterval(load,5000); return()=>clearInterval(id)},[]);
  async function enablePush(){
    if(!("Notification" in window)){alert("Browser notifications are not supported.");return}
    const p=await Notification.requestPermission();
    setNotif(p==="granted");
  }
  const s=data.signal||empty.signal;
  const nav=[["Dashboard",LayoutDashboard],["Signals",Target],["History",History],["News",Newspaper],["AI Analysis",Sparkles]];
  return <div className="app">
    <aside><div className="brand"><div className="logo">A</div><div><strong>AUREX</strong><small>AI GOLD INTELLIGENCE</small></div></div>
      <nav>{nav.map(([n,I])=><button className={tab===n?"active":""} onClick={()=>setTab(n)} key={n}><I size={17}/>{n}</button>)}</nav>
      <div className="side-note"><ShieldCheck size={16}/><span>No MT5 required<br/><small>Provider feed → AUREX engine</small></span></div>
    </aside>
    <main>
      <header><div><div className="eyebrow">MARKET INTELLIGENCE</div><h1>{tab}</h1></div>
        <div className="header-actions"><div className={connected?"status live-status":"status"}><i/> {connected?"LIVE FEED":"FEED OFFLINE"}</div><button className="iconbtn" onClick={enablePush} title="Enable notifications"><Bell size={18}/></button></div>
      </header>
      <section className="hero">
        <div><span className="muted">XAUUSD · SPOT GOLD</span><div className="big-price">{fmt(data.price,2)}</div><div className="quote">{data.bid!=null?`Bid ${fmt(data.bid,2)} · Ask ${fmt(data.ask,2)}`:"Provider quote unavailable"}</div></div>
        <div className="hero-right"><Metric label="TIMEFRAME" value="M15"/><Metric label="SOURCE" value={data.source||"—"}/><Metric label="UPDATED" value={data.time?new Date(data.time).toLocaleTimeString():"—"}/></div>
      </section>
      <section className="grid2">
        <div className="panel chart-panel"><div className="panel-head"><div><b>Live Price Action</b><span>Real provider candles — not demo data</span></div><Clock3 size={17}/></div><Chart candles={data.candles||[]}/></div>
        <div className="panel signal-panel"><div className="panel-head"><div><b>Signal Engine</b><span>Strict M15 confirmation</span></div><Activity size={17}/></div>
          <div className={"signal "+(s.status==="BUY"?"buy":s.status==="SELL"?"sell":"wait")}>
            <div className="signal-top"><span className="pill">{s.status}</span><strong>{s.title}</strong></div>
            <p>{s.note}</p>
            <div className="signal-grid"><Metric label="ENTRY" value={fmt(s.entry,2)}/><Metric label="STOP LOSS" value={fmt(s.sl,2)}/><Metric label="TP1" value={fmt(s.tp1,2)}/><Metric label="TP2" value={fmt(s.tp2,2)}/><Metric label="CONFIDENCE" value={`${s.confidence||0}%`}/><Metric label="R:R" value={s.rr||"—"}/></div>
          </div>
          <div className="indicator-row"><Metric label="M15 EMA20" value={fmt(data.indicators?.m15Ema20,2)}/><Metric label="M15 EMA50" value={fmt(data.indicators?.m15Ema50,2)}/><Metric label="RSI" value={fmt(data.indicators?.rsi,1)}/><Metric label="ATR" value={fmt(data.indicators?.atr,2)}/></div>
        </div>
      </section>
      <section className="lower">
        <div className="panel"><div className="panel-head"><div><b>Detection Logic</b><span>Signal only when filters align</span></div><Sparkles size={17}/></div>
          <div className="logic"><span>M15 trend</span><span>EMA structure</span><span>RSI</span><span>MACD</span><span>Volatility</span><span>Market structure</span></div>
        </div>
        <div className="panel"><div className="panel-head"><div><b>Alerts</b><span>{notif?"Browser notifications enabled":"Enable when you want phone/desktop alerts"}</span></div><Bell size={17}/></div><button className="primary" onClick={enablePush}>{notif?"Notifications Enabled":"Enable Notifications"}</button></div>
      </section>
      <footer><span>© AUREX AI</span><span>Market data source: {data.source||"not connected"} · XAUUSD is OTC and quotes vary by provider.</span></footer>
    </main>
  </div>
}
createRoot(document.getElementById("root")).render(<App/>);