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
  if (!bullish && !bearish) return { ...base, id: `${timeframe}-${candleTime || "none"}-WAITING`, status: "WAITING", title: "No Confirmed Setup", note: `The completed ${timeframe} candle does not meet every confirmation filter. SNIPER XAUUSD stays out instead of forcing a trade.`, confidence: 0, entry: null, sl: null, tp1: null, tp2: null };

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
    if (!env.TWELVE_DATA_API_KEY) return json(empty("Twelve Data API key missing. Add TWELVE_DATA_API_KEY in Cloudflare Worker Variables."));
    const granularity = (url.searchParams.get("granularity") || "M15").toUpperCase();
    const count = Math.min(Math.max(Number(url.searchParams.get("count") || 180), 60), 5000);
    const cache = caches.default;
    const cacheKey = new Request(`${url.origin}/__sniper-xauusd_cache/xauusd?granularity=${granularity}&count=${count}`);
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
    const cacheKey = new Request(`${url.origin}/__sniper-xauusd_cache/news/high`);
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

export default {
  async fetch(request, env) {
    const api = await handleApi(request, env);
    if (api) return api;
    return env.ASSETS.fetch(request);
  },
};
