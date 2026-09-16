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

function buildSignal(candles) {
  const updated = new Date().toISOString();
  if (candles.length < 60) {
    return { status: "WAITING", title: "Waiting for Live Confirmation", note: "Not enough live candles for the strict filter.", confidence: 0, entry: null, sl: null, tp1: null, tp2: null, rr: "1 : 2", timeframe: "M15", setup: "STRICT FILTER", updated };
  }
  const closes = candles.map(c => c.close);
  const last = closes.at(-1);
  const e20 = ema(closes, 20), e50 = ema(closes, 50), r = rsi(closes), a = atr(candles), m = macd(closes);
  const bullish = e20 > e50 && last > e20 && r != null && r >= 52 && r <= 72 && m > 0;
  const bearish = e20 < e50 && last < e20 && r != null && r >= 28 && r <= 48 && m < 0;
  if (!bullish && !bearish) {
    return { status: "WAITING", title: "No Confirmed Setup", note: "Filters are not aligned. AUREX stays out instead of forcing a trade.", confidence: 0, entry: null, sl: null, tp1: null, tp2: null, rr: "1 : 2", timeframe: "M15", setup: "STRICT FILTER", updated };
  }
  const risk = Math.max((a || 1) * 1.25, 0.8);
  const entry = last;
  const sl = bullish ? entry - risk : entry + risk;
  const tp1 = bullish ? entry + risk * 1.5 : entry - risk * 1.5;
  const tp2 = bullish ? entry + risk * 2 : entry - risk * 2;
  return { status: bullish ? "BUY" : "SELL", title: bullish ? "Bullish Confirmation" : "Bearish Confirmation", note: "M15 trend, momentum and volatility filters are aligned. Signal is informational, not a guarantee.", confidence: Math.min(95, 72 + Math.round(Math.abs(r - 50))), entry, sl, tp1, tp2, rr: "1 : 2", timeframe: "M15", setup: "STRICT FILTER", updated };
}

function empty(reason = "Connect the live XAUUSD provider to activate market detection.") {
  return {
    configured: false,
    source: "Twelve Data",
    instrument: "XAUUSD",
    price: null,
    bid: null,
    ask: null,
    time: null,
    candles: [],
    signal: { status: "WAITING", title: "Waiting for Live Confirmation", note: reason, confidence: 0, entry: null, sl: null, tp1: null, tp2: null, rr: "1 : 2", timeframe: "M15", setup: "STRICT FILTER", updated: new Date().toISOString() },
    indicators: {},
  };
}

async function getTimeSeries(env, interval, outputsize) {
  const apiKey = env.TWELVE_DATA_API_KEY;
  const symbol = env.TWELVE_DATA_SYMBOL || DEFAULT_SYMBOL;
  const params = new URLSearchParams({
    symbol,
    interval,
    outputsize: String(outputsize),
    timezone: "Asia/Kuala_Lumpur",
    apikey: apiKey,
  });
  const response = await fetch(`${TD_BASE}/time_series?${params.toString()}`, {
    headers: { accept: "application/json" },
  });
  const body = await response.json();
  if (!response.ok || body.status === "error") {
    throw new Error(body.message || `Twelve Data ${response.status}`);
  }
  return body;
}

async function marketResponse(env, granularity, count) {
  if (!env.TWELVE_DATA_API_KEY) return empty("Twelve Data API key is not configured in Cloudflare.");
  const intervalMap = { M1: "1min", M5: "5min", M15: "15min", M30: "30min", H1: "1h" };
  const interval = intervalMap[granularity] || "15min";
  const body = await getTimeSeries(env, interval, count);
  const candles = (body.values || []).slice().reverse().map(c => ({
    time: c.datetime,
    open: Number(c.open),
    high: Number(c.high),
    low: Number(c.low),
    close: Number(c.close),
  })).filter(c => Number.isFinite(c.close));
  const price = candles.at(-1)?.close ?? null;
  const closes = candles.map(c => c.close);
  return {
    configured: true,
    source: "Twelve Data",
    instrument: "XAUUSD",
    symbol: body.meta?.symbol || env.TWELVE_DATA_SYMBOL || DEFAULT_SYMBOL,
    price,
    bid: null,
    ask: null,
    time: candles.at(-1)?.time || null,
    candles,
    signal: buildSignal(candles),
    indicators: {
      m15Ema20: granularity === "M15" ? ema(closes, 20) : null,
      m15Ema50: granularity === "M15" ? ema(closes, 50) : null,
      rsi: granularity === "M15" ? rsi(closes) : null,
      atr: granularity === "M15" ? atr(candles) : null,
      macd: granularity === "M15" ? macd(closes) : null,
    },
  };
}

async function handleApi(request, env) {
  const url = new URL(request.url);
  if (url.pathname !== "/api/market/xauusd") return null;
  if (request.method !== "GET") return json({ error: "Method not allowed" }, 405);

  const granularity = (url.searchParams.get("granularity") || "M15").toUpperCase();
  const count = Math.min(Math.max(Number(url.searchParams.get("count") || 120), 60), 5000);

  // Edge cache reduces Twelve Data credit usage while keeping the dashboard fresh.
  const cache = caches.default;
  const cacheKey = new Request(`${url.origin}/__aurex_cache/xauusd?granularity=${granularity}&count=${count}`);
  const cached = await cache.match(cacheKey);
  if (cached) return cached;

  try {
    const data = await marketResponse(env, granularity, count);
    const response = json(data, 200, { "cache-control": "public, max-age=10" });
    await cache.put(cacheKey, response.clone());
    return response;
  } catch (error) {
    return json({ ...empty(`Twelve Data error: ${error.message}`), configured: false, source: "Twelve Data" }, 502);
  }
}

export default {
  async fetch(request, env) {
    const api = await handleApi(request, env);
    if (api) return api;
    return env.ASSETS.fetch(request);
  },
};
