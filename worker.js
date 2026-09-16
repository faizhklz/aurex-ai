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

function roundPrice(value) {
  return Number.isFinite(value) ? Math.round(value * 100) / 100 : null;
}

function buildSignal(candles, timeframe) {
  // Only completed candles are used for signal decisions. The newest candle from
  // the provider is treated as potentially still forming and is excluded.
  const basis = candles.length > 1 ? candles.slice(0, -1) : candles;
  const lastCandle = basis.at(-1);
  const previous = basis.at(-2);
  const updated = new Date().toISOString();
  const candleTime = lastCandle?.time || null;
  const base = {
    timeframe,
    setup: "MULTI-CONFIRMATION",
    rr: "1 : 2",
    updated,
    candleTime,
  };

  if (basis.length < 60) {
    return {
      ...base,
      id: `${timeframe}-${candleTime || "none"}-WAITING`,
      status: "WAITING",
      title: "Waiting for Live Confirmation",
      note: `Not enough ${timeframe} completed candles for the multi-confirmation engine.`,
      confidence: 0,
      entry: null, sl: null, tp1: null, tp2: null, risk: null,
      reasons: [],
    };
  }

  const closes = basis.map(c => c.close);
  const e20 = ema(closes, 20);
  const e50 = ema(closes, 50);
  const r = rsi(closes);
  const a = atr(basis);
  const m = macd(closes);
  const last = lastCandle.close;
  const body = lastCandle.close - lastCandle.open;
  const range = Math.max(lastCandle.high - lastCandle.low, 0.01);
  const bodyRatio = Math.abs(body) / range;
  const recent = basis.slice(-8, -1);
  const recentHigh = Math.max(...recent.map(c => c.high));
  const recentLow = Math.min(...recent.map(c => c.low));

  if (![e20, e50, r, a, m].every(Number.isFinite)) {
    return {
      ...base,
      id: `${timeframe}-${candleTime || "none"}-WAITING`,
      status: "WAITING",
      title: "Waiting for Live Confirmation",
      note: "Indicator calculation is not ready yet.",
      confidence: 0,
      entry: null, sl: null, tp1: null, tp2: null, risk: null,
      reasons: [],
    };
  }

  let bull = 0;
  let bear = 0;
  const bullReasons = [];
  const bearReasons = [];

  // Trend structure.
  if (e20 > e50) { bull += 2; bullReasons.push("EMA20 above EMA50"); }
  if (e20 < e50) { bear += 2; bearReasons.push("EMA20 below EMA50"); }

  // Price location relative to the trend.
  if (last > e20) { bull += 1; bullReasons.push("price above EMA20"); }
  if (last < e20) { bear += 1; bearReasons.push("price below EMA20"); }

  // Momentum confirmation.
  if (r >= 52 && r <= 70) { bull += 1; bullReasons.push(`RSI ${r.toFixed(1)} bullish zone`); }
  if (r <= 48 && r >= 30) { bear += 1; bearReasons.push(`RSI ${r.toFixed(1)} bearish zone`); }
  if (m > 0) { bull += 1; bullReasons.push("MACD positive"); }
  if (m < 0) { bear += 1; bearReasons.push("MACD negative"); }

  // Completed candle confirmation. A very small body is deliberately not
  // treated as directional confirmation.
  if (body > 0 && bodyRatio >= 0.35) { bull += 1; bullReasons.push("bullish completed candle"); }
  if (body < 0 && bodyRatio >= 0.35) { bear += 1; bearReasons.push("bearish completed candle"); }

  // Recent-range confirmation adds one point only when the completed candle
  // closes beyond the recent 7-candle range.
  if (last > recentHigh) { bull += 1; bullReasons.push("break above recent range"); }
  if (last < recentLow) { bear += 1; bearReasons.push("break below recent range"); }

  const gap = Math.abs(e20 - e50);
  const enoughTrendSeparation = gap >= Math.max(a * 0.08, 0.05);
  const minScore = 6;
  const direction = bull >= minScore && bull > bear + 1 ? "BUY"
    : bear >= minScore && bear > bull + 1 ? "SELL"
    : null;

  if (!direction || !enoughTrendSeparation) {
    const reason = !enoughTrendSeparation
      ? "EMA structure is too compressed for a confirmed setup."
      : "Not enough independent confirmations are aligned on the completed candle.";
    return {
      ...base,
      id: `${timeframe}-${candleTime || "none"}-WAITING`,
      status: "WAITING",
      title: "No Confirmed Setup",
      note: `${reason} SNIPER stays out instead of forcing a trade.`,
      confidence: 0,
      entry: null, sl: null, tp1: null, tp2: null, risk: null,
      reasons: direction === "BUY" ? bullReasons : direction === "SELL" ? bearReasons : [],
    };
  }

  const entry = last;
  const atrRisk = Math.max(a * 1.15, 0.8);
  let sl;
  if (direction === "BUY") {
    const structureSL = Math.min(...basis.slice(-7).map(c => c.low)) - a * 0.20;
    sl = Math.min(entry - atrRisk, structureSL);
  } else {
    const structureSL = Math.max(...basis.slice(-7).map(c => c.high)) + a * 0.20;
    sl = Math.max(entry + atrRisk, structureSL);
  }

  const risk = Math.abs(entry - sl);
  if (!Number.isFinite(risk) || risk <= 0) {
    return {
      ...base,
      id: `${timeframe}-${candleTime || "none"}-WAITING`,
      status: "WAITING",
      title: "Waiting for Risk Model",
      note: "The engine could not create a valid risk distance from the completed candle.",
      confidence: 0,
      entry: null, sl: null, tp1: null, tp2: null, risk: null,
      reasons: [],
    };
  }

  const tp1 = direction === "BUY" ? entry + risk : entry - risk;
  const tp2 = direction === "BUY" ? entry + risk * 2 : entry - risk * 2;
  const score = direction === "BUY" ? bull : bear;
  const opposing = direction === "BUY" ? bear : bull;
  const confidence = Math.min(95, Math.max(65, 62 + score * 4 + Math.min(8, Math.max(0, score - opposing) * 2)));
  const reasons = direction === "BUY" ? bullReasons : bearReasons;
  const title = direction === "BUY" ? "Bullish Multi-Confirmation" : "Bearish Multi-Confirmation";

  return {
    ...base,
    id: `${timeframe}-${candleTime}-${direction}`,
    status: direction,
    title,
    note: `${score} confirmations aligned on the completed ${timeframe} candle. Informational setup — not a guarantee of profit.`,
    confidence,
    entry: roundPrice(entry),
    sl: roundPrice(sl),
    tp1: roundPrice(tp1),
    tp2: roundPrice(tp2),
    risk: roundPrice(risk),
    reasons,
    confirmationScore: score,
    opposingScore: opposing,
    previousClose: previous?.close ?? null,
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
const PBKDF2_ITERATIONS = 100000;
const enc = new TextEncoder();

function uuid(){ return crypto.randomUUID(); }
function cookie(name,value,maxAge){
  return `${name}=${value}; Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Lax`;
}

async function hashPassword(password,salt){
  const key = await crypto.subtle.importKey(
    "raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]
  );
  const bits = await crypto.subtle.deriveBits({
    name:"PBKDF2",
    salt:enc.encode(salt),
    iterations:PBKDF2_ITERATIONS,
    hash:"SHA-256"
  }, key, 256);
  const digest = [...new Uint8Array(bits)]
    .map(x=>x.toString(16).padStart(2,"0"))
    .join("");
  return `${salt}.${digest}`;
}

async function makePasswordHash(password){
  return hashPassword(password, uuid());
}

async function verifyPassword(password,stored){
  const value = String(stored || "");
  const dot = value.indexOf(".");
  if(dot <= 0) return false;
  const salt = value.slice(0,dot);
  const expected = value.slice(dot+1);
  const actual = (await hashPassword(password,salt)).slice(salt.length+1);
  return actual === expected;
}

function getCookie(req,name){
  const raw = req.headers.get("cookie") || "";
  return raw.split(";")
    .map(x=>x.trim())
    .find(x=>x.startsWith(name+"="))
    ?.slice(name.length+1) || null;
}

async function currentUser(req,env){
  if(!env.DB) return null;
  const sid = getCookie(req,SESSION_COOKIE);
  if(!sid) return null;
  const row = await env.DB.prepare(
    "SELECT u.id,u.name,u.email,u.role,u.subscription_status,u.subscription_plan,u.subscription_expires_at FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.id=? AND s.expires_at>? LIMIT 1"
  ).bind(sid,new Date().toISOString()).first();
  if(!row) return null;
  const active = String(row.subscription_status||"").toLowerCase()==="active" &&
    (!row.subscription_expires_at || row.subscription_expires_at>new Date().toISOString());
  return {...row,subscriptionActive:row.role==="admin"?true:active};
}

async function authRoute(req,env,path){
  try {
    if(!env.DB){
      return json({error:"SNIPER XAUUSD database is not connected. Check the D1 binding named DB."},503);
    }

    if(path==="/api/auth/me"){
      const user=await currentUser(req,env);
      return user ? json({user}) : json({user:null},401);
    }

    if(path==="/api/auth/logout"){
      const sid=getCookie(req,SESSION_COOKIE);
      if(sid) await env.DB.prepare("DELETE FROM sessions WHERE id=?").bind(sid).run();
      return json({ok:true},200,{"set-cookie":cookie(SESSION_COOKIE,"",0)});
    }

    if(req.method!=="POST") return json({error:"Method not allowed"},405);

    const body=await req.json().catch(()=>({}));
    const email=String(body.email||"").trim().toLowerCase();
    const password=String(body.password||"");
    if(!email||!password) return json({error:"Email and password are required."},400);

    if(path==="/api/auth/register"){
      if(password.length<8) return json({error:"Password must be at least 8 characters."},400);
      const exists=await env.DB.prepare("SELECT id FROM users WHERE email=?").bind(email).first();
      if(exists) return json({error:"An account with this email already exists."},409);

      const now=new Date().toISOString();
      const name=String(body.name||email.split("@")[0]).trim()||"Member";
      const ph=await makePasswordHash(password);
      const inserted=await env.DB.prepare(
        "INSERT INTO users(name,email,password_hash,role,subscription_status,subscription_plan,subscription_expires_at,created_at) VALUES(?,?,?,?,?,?,?,?)"
      ).bind(name,email,ph,"member","inactive","",null,now).run();

      const id=inserted.meta?.last_row_id;
      if(id==null) return json({error:"Account was created but its ID could not be read."},500);
      return loginUser(env,{id,name,email,role:"member",subscription_status:"inactive",subscription_plan:"",subscription_expires_at:null});
    }

    if(path==="/api/auth/login"){
      const row=await env.DB.prepare(
        "SELECT id,name,email,password_hash,role,subscription_status,subscription_plan,subscription_expires_at FROM users WHERE email=?"
      ).bind(email).first();
      if(!row || !(await verifyPassword(password,row.password_hash))){
        return json({error:"Invalid email or password."},401);
      }
      return loginUser(env,row);
    }

    return json({error:"Not found"},404);
  } catch(error) {
    console.error("AUTH_ERROR", error);
    return json({
      error:"Authentication server error.",
      detail:String(error?.message || error)
    },500);
  }
}

async function loginUser(env,row){
  const sid=uuid();
  const expires=new Date(Date.now()+SESSION_DAYS*86400000).toISOString();
  await env.DB.prepare(
    "INSERT INTO sessions(id,user_id,expires_at,created_at) VALUES(?,?,?,?)"
  ).bind(sid,row.id,expires,new Date().toISOString()).run();

  const active=String(row.subscription_status||"").toLowerCase()==="active" &&
    (!row.subscription_expires_at || row.subscription_expires_at>new Date().toISOString());

  const user={
    id:row.id,
    name:row.name,
    email:row.email,
    role:row.role,
    subscriptionStatus:row.subscription_status,
    subscriptionPlan:row.subscription_plan,
    subscriptionActive:row.role==="admin"?true:active,
    subscriptionExpiresAt:row.subscription_expires_at
  };
  return json({user},200,{"set-cookie":cookie(SESSION_COOKIE,sid,SESSION_DAYS*86400)});
}

async function adminRoute(req, env, path) {
  try {
    if (!env.DB) return json({error:"SNIPER XAUUSD database is not connected. Check the D1 binding named DB."},503);
    const admin = await currentUser(req, env);
    if (!admin || admin.role !== "admin") return json({error:"Admin access required."},403);

    if (req.method === "GET" && path === "/api/admin/users") {
      const rows = await env.DB.prepare(
        "SELECT id,name,email,role,subscription_status,subscription_plan,subscription_expires_at,created_at FROM users ORDER BY created_at DESC LIMIT 500"
      ).all();
      return json({users: rows.results || []});
    }

    if (req.method === "POST" && path === "/api/admin/subscription") {
      const body = await req.json().catch(()=>({}));
      const userId = String(body.userId || "");
      const status = String(body.status || "inactive").toLowerCase() === "active" ? "active" : "inactive";
      const plan = String(body.plan || "").trim().slice(0,60);
      let expires = null;
      if(body.expiresAt){
        const d = new Date(body.expiresAt);
        if(Number.isNaN(d.getTime())) return json({error:"Invalid expiry date."},400);
        expires = d.toISOString();
      }
      if (!userId) return json({error:"userId is required."},400);
      await env.DB.prepare(
        "UPDATE users SET subscription_status=?, subscription_plan=?, subscription_expires_at=? WHERE id=?"
      ).bind(status,plan,expires,userId).run();
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
  } catch(error) {
    console.error("ADMIN_ERROR", error);
    return json({error:"Admin server error.",detail:String(error?.message || error)},500);
  }
}

async function healthRoute(env){
  try {
    if(!env.DB) return json({ok:false,db:false,error:"D1 binding DB is missing."},503);
    const row=await env.DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('users','sessions') ORDER BY name").all();
    const tables=(row.results||[]).map(x=>x.name);
    return json({ok:tables.includes("users")&&tables.includes("sessions"),db:true,tables});
  } catch(error) {
    console.error("HEALTH_ERROR",error);
    return json({ok:false,db:true,error:String(error?.message||error)},500);
  }
}

export default {
  async fetch(request, env) {
    try {
      const url = new URL(request.url);
      if (url.pathname === "/api/health") return healthRoute(env);
      if (url.pathname.startsWith("/api/auth/")) return authRoute(request, env, url.pathname);
      if (url.pathname.startsWith("/api/admin/")) return adminRoute(request, env, url.pathname);
      const api = await handleApi(request, env);
      if (api) return api;
      return env.ASSETS.fetch(request);
    } catch (error) {
      console.error("WORKER_ERROR", error);
      return json({error:"Worker error.",detail:String(error?.message || error)},500);
    }
  },
};
