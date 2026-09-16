const OANDA_URL = "https://api-fxtrade.oanda.com/v3";

function ema(values, period){
  if(values.length < period) return null;
  const k=2/(period+1);
  let e=values.slice(0,period).reduce((a,b)=>a+b,0)/period;
  for(let i=period;i<values.length;i++) e=values[i]*k+e*(1-k);
  return e;
}
function rsi(values, period=14){
  if(values.length<=period) return null;
  let gain=0,loss=0;
  for(let i=1;i<=period;i++){const d=values[i]-values[i-1]; if(d>=0)gain+=d;else loss-=d;}
  gain/=period; loss/=period;
  for(let i=period+1;i<values.length;i++){const d=values[i]-values[i-1];gain=(gain*(period-1)+Math.max(d,0))/period;loss=(loss*(period-1)+Math.max(-d,0))/period;}
  if(loss===0)return 100; return 100-(100/(1+gain/loss));
}
function atr(candles,period=14){
  if(candles.length<period+1)return null;
  const tr=[];
  for(let i=1;i<candles.length;i++) tr.push(Math.max(candles[i].high-candles[i].low,Math.abs(candles[i].high-candles[i-1].close),Math.abs(candles[i].low-candles[i-1].close)));
  return tr.slice(-period).reduce((a,b)=>a+b,0)/period;
}
function macd(values){
  const e12=ema(values,12),e26=ema(values,26);
  return e12==null||e26==null?null:e12-e26;
}
function buildSignal(candles){
  if(candles.length<60)return {status:"WAITING",title:"Waiting for Live Confirmation",note:"Not enough live candles for the strict filter.",confidence:0,entry:null,sl:null,tp1:null,tp2:null,rr:"1 : 2",timeframe:"M15",setup:"STRICT FILTER",updated:new Date().toISOString()};
  const closes=candles.map(c=>c.close), last=closes.at(-1), e20=ema(closes,20), e50=ema(closes,50), r=rsi(closes), a=atr(candles), m=macd(closes);
  const bullish=e20>e50 && last>e20 && r!=null && r>=52 && r<=72 && m>0;
  const bearish=e20<e50 && last<e20 && r!=null && r>=28 && r<=48 && m<0;
  if(!bullish&&!bearish)return {status:"WAITING",title:"No Confirmed Setup",note:"Filters are not aligned. AUREX stays out instead of forcing a trade.",confidence:0,entry:null,sl:null,tp1:null,tp2:null,rr:"1 : 2",timeframe:"M15",setup:"STRICT FILTER",updated:new Date().toISOString()};
  const risk=Math.max((a||1)*1.25,0.8), entry=last;
  const sl=bullish?entry-risk:entry+risk, tp1=bullish?entry+risk*1.5:entry-risk*1.5, tp2=bullish?entry+risk*2:entry-risk*2;
  return {status:bullish?"BUY":"SELL",title:bullish?"Bullish Confirmation":"Bearish Confirmation",note:"M15 trend, momentum and volatility filters are aligned. Signal is informational, not a guarantee.",confidence:Math.min(95,72+Math.round(Math.abs(r-50))),entry,sl,tp1,tp2,rr:"1 : 2",timeframe:"M15",setup:"STRICT FILTER",updated:new Date().toISOString()};
}

export async function onRequestGet({request, env}){
  const url=new URL(request.url);
  const granularity=url.searchParams.get("granularity")||"M15";
  const count=Math.min(Number(url.searchParams.get("count")||120),5000);
  const token=env.OANDA_API_TOKEN;
  if(!token) return new Response(JSON.stringify({...empty(), configured:false, source:"OANDA (token not configured)"}),{headers:{"content-type":"application/json"}});
  try{
    const instrument=env.OANDA_INSTRUMENT||"XAU_USD";
    const r=await fetch(`${OANDA_URL}/instruments/${instrument}/candles?price=M&granularity=${granularity}&count=${count}`,{headers:{Authorization:`Bearer ${token}`}});
    if(!r.ok) throw new Error(`OANDA ${r.status}`);
    const j=await r.json();
    const candles=(j.candles||[]).filter(c=>c.complete!==false).map(c=>({time:c.time,open:Number(c.mid.o),high:Number(c.mid.h),low:Number(c.mid.l),close:Number(c.mid.c)}));
    const price=candles.at(-1)?.close??null;
    const closes=candles.map(c=>c.close);
    const indicators={m15Ema20:ema(closes,20),m15Ema50:ema(closes,50),rsi:rsi(closes),atr:atr(candles),macd:macd(closes)};
    return new Response(JSON.stringify({configured:true,source:"OANDA",instrument:"XAUUSD",price,bid:null,ask:null,time:candles.at(-1)?.time||null,candles,signal:buildSignal(candles),indicators}),{headers:{"content-type":"application/json","cache-control":"no-store"}});
  }catch(e){return new Response(JSON.stringify({...empty(),configured:false,source:`OANDA error: ${e.message}`} ),{status:502,headers:{"content-type":"application/json"}})}
}
function empty(){return {configured:false,source:"—",instrument:"XAUUSD",price:null,bid:null,ask:null,time:null,candles:[],signal:{status:"WAITING",title:"Waiting for Live Confirmation",note:"Connect the live XAUUSD provider.",confidence:0,entry:null,sl:null,tp1:null,tp2:null,rr:"1 : 2",timeframe:"M15",setup:"STRICT FILTER",updated:"—"},indicators:{}}}