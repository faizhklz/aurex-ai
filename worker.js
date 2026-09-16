const TD_BASE = "https://api.twelvedata.com";
const DEFAULT_SYMBOL = "XAU/USD";

function json(data, status = 200, extra = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...extra,
    },
  });
}

function ema(values, period) {
  if (values.length < period) return null;
  const k = 2 / (period + 1);
  let e = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < values.length; i++) e = values[i] * k + e * (1 - k);
  return e;
}

function rsi(values, period = 14) {
  if (values.length <= period) return null;
  let gain = 0, loss = 0;
  for (let i = 1; i <= period; i++) {
    const d = values[i] - values[i - 1];
    if (d >= 0) gain += d; else loss -= d;
  }
  gain /= period; loss /= period;
  for (let i = period + 1; i < values.length; i++) {
    const d = values[i] - values[i - 1];
    gain = (gain * (period - 1) + Math.max(d, 0)) / period;
    loss = (loss * (period - 1) + Math.max(-d, 0)) / period;
  }
  if (loss === 0) return 100;
  return 100 - 100 / (1 + gain / loss);
}

function atr(candles, period = 14) {
  if (candles.length < period + 1) return null;
  const tr = [];
  for (let i = 1; i < candles.length; i++) {
    tr.push(Math.max(
      candles[i].high - candles[i].low,
      Math.abs(candles[i].high - candles[i - 1].close),
      Math.abs(candles[i].low - candles[i - 1].close)
    ));
  }
  return tr.slice(-period).reduce((a, b) => a + b, 0) / period;
}

function macd(values) {
  const e12 = ema(values, 12), e26 = ema(values, 26);
  return e12 == null || e26 == null ? null : e12 - e26;
}

function buildSignal(candles, timeframe) {
  const basis = candles.length > 1 ? candles.slice(0, -1) : candles;
  const basisCandle = basis.at(-1);
  const updated = new Date().toISOString();
  const candleTime = basisCandle?.time || null;
  const base = { timeframe, setup: "STRICT FILTER", rr: "1 : 2", updated, candleTime };
  if (basis.length < 60) return { ...base, id: `${timeframe}-${candleTime || "none"}-WAITING`, status: "WAITING", title: "Waiting for Live Confirmation", note: `Not enough ${timeframe} completed candles for the strict filter.`, confidence: 0, entry: null, sl: null, tp1: null, tp2: null };

  const closes = basis.map(c => c.close);
  const last = closes.at(-1);
  const e20 = ema(closes, 20), e50 = ema(closes, 50), r = rsi(closes), a = atr(basis), m = macd(closes);
  const bullish = e20 > e50 && last > e20 && r != null && r >= 52 && r <= 72 && m > 0;
  const bearish = e20 < e50 && last < e20 && r != null && r >= 28 && r <= 48 && m < 0;
  if (!bullish && !bearish) return { ...base, id: `${timeframe}-${candleTime || "none"}-WAITING`, status: "WAITING", title: "No Confirmed Setup", note: `The completed ${timeframe} candle does not meet every confirmation filter. AUREX stays out instead of forcing a trade.`, confidence: 0, entry: null, sl: null, tp1: null, tp2: null };

  const risk = Math.max((a || 1) * 1.25, 0.8);
  const entry = last;
  const sl = bullish ? entry - risk : entry + risk;
  const tp1 = bullish ? entry + risk * 1.5 : entry - risk * 1.5;
  const tp2 = bullish ? entry + risk * 2 : entry - risk * 2;
  const confidence = Math.min(95, 72 + Math.round(Math.abs(r - 50)));
  const status = bullish ? "BUY" : "SELL";
  return {
    ...base,
    id: `${timeframe}-${candleTime}-${status}`,
    status,
    title: bullish ? "Bullish Confirmation" : "Bearish Confirmation",
    note: `${timeframe} completed-candle trend, momentum and volatility filters aligned. Informational signal — not a guarantee.`,
    confidence,
    entry, sl, tp1, tp2,
  };
}

function empty(reason = "Connect the live XAUUSD provider to activate market detection.") {
  return {
    configured: false, source: "Twelve Data", instrument: "XAUUSD", symbol: DEFAULT_SYMBOL,
    price: null, bid: null, ask: null, time: null, candles: [], livePrice: null,
    signal: { id: "offline", status: "WAITING", title: "Waiting for Live Confirmation", note: reason, confidence: 0, entry: null, sl: null, tp1: null, tp2: null, rr: "1 : 2", timeframe: "M15", setup: "STRICT FILTER", updated: new Date().toISOString(), candleTime: null },
    indicators: {},
  };
}

async function tdFetch(env, endpoint, params) {
  const apiKey = env.TWELVE_DATA_API_KEY;
  const q = new URLSearchParams({ ...params, apikey: apiKey });
  const response = await fetch(`${TD_BASE}${endpoint}?${q.toString()}`, { headers: { accept: "application/json" } });
  const body = await response.json();
  if (!response.ok || body.status === "error") throw new Error(body.message || `Twelve Data ${response.status}`);
  return body;
}

async function getTimeSeries(env, interval, outputsize) {
  return tdFetch(env, "/time_series", {
    symbol: env.TWELVE_DATA_SYMBOL || DEFAULT_SYMBOL,
    interval,
    outputsize: String(outputsize),
    timezone: "Asia/Kuala_Lumpur",
  });
}

async function getPrice(env) {
  return tdFetch(env, "/price", { symbol: env.TWELVE_DATA_SYMBOL || DEFAULT_SYMBOL });
}

async function marketResponse(env, granularity, count) {
  if (!env.TWELVE_DATA_API_KEY) return empty("Twelve Data API key is not configured in Cloudflare.");
  const intervalMap = { M1: "1min", M5: "5min", M15: "15min", M30: "30min", H1: "1h" };
  const interval = intervalMap[granularity] || "15min";
  const [body, priceBody] = await Promise.all([getTimeSeries(env, interval, count), getPrice(env)]);
  const candles = (body.values || []).slice().reverse().map(c => ({
    time: c.datetime, open: Number(c.open), high: Number(c.high), low: Number(c.low), close: Number(c.close),
  })).filter(c => Number.isFinite(c.close));
  const livePrice = Number(priceBody.price);
  const price = Number.isFinite(livePrice) ? livePrice : candles.at(-1)?.close ?? null;
  const closes = candles.map(c => c.close);
  return {
    configured: true,
    source: "Twelve Data",
    instrument: "XAUUSD",
    symbol: body.meta?.symbol || env.TWELVE_DATA_SYMBOL || DEFAULT_SYMBOL,
    price,
    livePrice: Number.isFinite(livePrice) ? livePrice : null,
    bid: null,
    ask: null,
    time: new Date().toISOString(),
    candles,
    signal: buildSignal(candles, granularity),
    indicators: { ema20: ema(closes, 20), ema50: ema(closes, 50), rsi: rsi(closes), atr: atr(candles), macd: macd(closes) },
  };
}

async function newsResponse(env) {
  // Xoomar exposes a public US macro calendar sourced from official US agencies.
  const url = "https://xoomar.com/api/markets/calendar?importance=high";
  const response = await fetch(url, { headers: { accept: "application/json" } });
  if (!response.ok) throw new Error(`Calendar provider ${response.status}`);
  const body = await response.json();
  const rows = Array.isArray(body.data) ? body.data : [];
  const events = rows.map((e, i) => ({
    id: e.id || `${e.date || e.datetime || i}-${e.name || e.title || "event"}`,
    title: e.name || e.title || e.event || "US macro event",
    date: e.date || e.datetime || e.release_date || null,
    time: e.time || e.datetime || null,
    country: e.country || "US",
    impact: String(e.importance || e.impact || "high").toUpperCase(),
    actual: e.actual ?? null,
    previous: e.previous ?? null,
    forecast: e.forecast ?? e.consensus ?? null,
    source: e.source || body.source || "Xoomar / official US agency schedules",
  }));
  return { configured: true, source: "US macro calendar", updatedAt: body.updatedAt || new Date().toISOString(), events };
}

async function handleApi(request, env) {
  const url = new URL(request.url);
  if (request.method !== "GET") return json({ error: "Method not allowed" }, 405);

  if (url.pathname === "/api/market/xauusd") {
    if (!env.TWELVE_DATA_API_KEY) return json(empty("Twelve Data API key is not configured in Cloudflare."));
    const granularity = (url.searchParams.get("granularity") || "M15").toUpperCase();
    const count = Math.min(Math.max(Number(url.searchParams.get("count") || 180), 60), 5000);
    const cache = caches.default;
    const cacheKey = new Request(`${url.origin}/__aurex_cache/xauusd?granularity=${granularity}&count=${count}`);
    const cached = await cache.match(cacheKey);
    if (cached) return cached;
    try {
      const data = await marketResponse(env, granularity, count);
      const response = json(data, 200, { "cache-control": "public, max-age=20" });
      await cache.put(cacheKey, response.clone());
      return response;
    } catch (error) {
      return json({ ...empty(`Twelve Data error: ${error.message}`), configured: false }, 502);
    }
  }

  if (url.pathname === "/api/news/calendar") {
    const cache = caches.default;
    const cacheKey = new Request(`${url.origin}/__aurex_cache/news/high`);
    const cached = await cache.match(cacheKey);
    if (cached) return cached;
    try {
      const data = await newsResponse(env);
      const response = json(data, 200, { "cache-control": "public, max-age=300" });
      await cache.put(cacheKey, response.clone());
      return response;
    } catch (error) {
      return json({ configured: false, source: "US macro calendar", updatedAt: new Date().toISOString(), events: [], error: error.message }, 502);
    }
  }
  return null;
}


const SESSION_COOKIE = "aurex_session";
const SESSION_DAYS = 30;
const enc = new TextEncoder();
function uuid(){return crypto.randomUUID()}
function cookie(name,value,maxAge){return `${name}=${value}; Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Lax`}
async function hashPassword(password,salt){const key=await crypto.subtle.importKey("raw",enc.encode(password),"PBKDF2",false,["deriveBits"]);const bits=await crypto.subtle.deriveBits({name:"PBKDF2",salt:enc.encode(salt),iterations:100000,hash:"SHA-256"},key,256);return `${salt}.${[...new Uint8Array(bits)].map(x=>x.toString(16).padStart(2,"0")).join("")}`}
async function makePasswordHash(password){return hashPassword(password,uuid())}
async function verifyPassword(password,stored){const [salt,digest]=String(stored||"").split(".");if(!salt||!digest)return false;const h=await hashPassword(password,salt);return h===stored}
function getCookie(req,name){const raw=req.headers.get("cookie")||"";return raw.split(";").map(x=>x.trim()).find(x=>x.startsWith(name+"="))?.slice(name.length+1)||null}
async function currentUser(req,env){if(!env.DB)return null;const sid=getCookie(req,SESSION_COOKIE);if(!sid)return null;const row=await env.DB.prepare("SELECT u.id,u.name,u.email,u.role,u.subscription_status,u.subscription_plan,u.subscription_expires_at FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.id=? AND s.expires_at>? LIMIT 1").bind(sid,new Date().toISOString()).first();if(!row)return null;const active=String(row.subscription_status||"").toLowerCase()==="active"&&(!row.subscription_expires_at||row.subscription_expires_at>new Date().toISOString());return {...row,subscriptionActive:row.role==="admin"?true:active}}
async function authRoute(req,env,path){
 if(!env.DB)return json({error:"AUREX database is not connected yet. Create/bind the D1 database first."},503);
 if(path==="/api/auth/me"){const user=await currentUser(req,env);return user?json({user}):json({user:null},401)}
 if(path==="/api/auth/logout"){const sid=getCookie(req,SESSION_COOKIE);if(sid)await env.DB.prepare("DELETE FROM sessions WHERE id=?").bind(sid).run();return json({ok:true},200,{"set-cookie":cookie(SESSION_COOKIE,"",0)})}
 if(req.method!=="POST")return json({error:"Method not allowed"},405);
 const body=await req.json().catch(()=>({})); const email=String(body.email||"").trim().toLowerCase(); const password=String(body.password||"");
 if(!email||!password)return json({error:"Email and password are required."},400);
 if(path==="/api/auth/register"){
   if(password.length<8)return json({error:"Password must be at least 8 characters."},400);
   const exists=await env.DB.prepare("SELECT id FROM users WHERE email=?").bind(email).first();if(exists)return json({error:"An account with this email already exists."},409);
   const now=new Date().toISOString(), name=String(body.name||email.split("@")[0]).trim()||"Member", ph=await makePasswordHash(password);
   const inserted=await env.DB.prepare("INSERT INTO users(name,email,password_hash,role,subscription_status,subscription_plan,subscription_expires_at,created_at) VALUES(?,?,?,?,?,?,?,?)").bind(name,email,ph,"member","inactive","",null,now).run();
   const id=inserted.meta?.last_row_id;
   return loginUser(env,{id,name,email,role:"member",subscription_status:"inactive",subscription_plan:"",subscription_expires_at:null});
 }
 if(path==="/api/auth/login"){
   const row=await env.DB.prepare("SELECT id,name,email,password_hash,role,subscription_status,subscription_plan,subscription_expires_at FROM users WHERE email=?").bind(email).first();if(!row||!(await verifyPassword(password,row.password_hash)))return json({error:"Invalid email or password."},401);return loginUser(env,row);
 }
 return json({error:"Not found"},404);
}
async function loginUser(env,row){const sid=uuid(), expires=new Date(Date.now()+SESSION_DAYS*86400000).toISOString();await env.DB.prepare("INSERT INTO sessions(id,user_id,expires_at,created_at) VALUES(?,?,?,?)").bind(sid,row.id,expires,new Date().toISOString()).run();const active=String(row.subscription_status||"").toLowerCase()==="active"&&(!row.subscription_expires_at||row.subscription_expires_at>new Date().toISOString());const user={id:row.id,name:row.name,email:row.email,role:row.role,subscriptionStatus:row.subscription_status,subscriptionPlan:row.subscription_plan,subscriptionActive:row.role==="admin"?true:active,subscriptionExpiresAt:row.subscription_expires_at};return json({user},200,{"set-cookie":cookie(SESSION_COOKIE,sid,SESSION_DAYS*86400)})}

async function adminRoute(req, env, path) {
  if (!env.DB) return json({error:"Database not connected."},503);
  const admin = await currentUser(req, env);
  if (!admin || admin.role !== "admin") return json({error:"Admin access required."},403);
  if (req.method === "GET" && path === "/api/admin/users") {
    const rows = await env.DB.prepare("SELECT id,name,email,role,subscription_status,subscription_plan,subscription_expires_at,created_at FROM users ORDER BY created_at DESC LIMIT 500").all();
    return json({users: rows.results || []});
  }
  if (req.method === "POST" && path === "/api/admin/subscription") {
    const body = await req.json().catch(()=>({}));
    const userId = String(body.userId || "");
    const status = String(body.status || "inactive").toLowerCase() === "active" ? "active" : "inactive";
    const plan = String(body.plan || "").trim().slice(0,60);
    const expires = body.expiresAt ? new Date(body.expiresAt).toISOString() : null;
    if (!userId) return json({error:"userId is required."},400);
    await env.DB.prepare("UPDATE users SET subscription_status=?, subscription_plan=?, subscription_expires_at=? WHERE id=?").bind(status,plan,expires,userId).run();
    return json({ok:true});
  }
  if (req.method === "POST" && path === "/api/admin/role") {
    const body = await req.json().catch(()=>({}));
    const userId = String(body.userId || "");
    const role = String(body.role || "member") === "admin" ? "admin" : "member";
    if (!userId) return json({error:"userId is required."},400);
    if (userId === String(admin.id) && role !== "admin") return json({error:"You cannot remove your own admin role here."},400);
    await env.DB.prepare("UPDATE users SET role=? WHERE id=?").bind(role,userId).run();
    return json({ok:true});
  }
  return json({error:"Not found"},404);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/auth/")) return authRoute(request, env, url.pathname);
    if (url.pathname.startsWith("/api/admin/")) return adminRoute(request, env, url.pathname);
    if (url.pathname === "/api/auth/me") return authRoute(request, env, url.pathname);
    const api = await handleApi(request, env);
    if (api) return api;
    return env.ASSETS.fetch(request);
  },
};
