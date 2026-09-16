# AUREX AI — Standalone

Standalone Cloudflare Worker + React/Vite dashboard for XAUUSD market data.

## Data provider

This build uses **Twelve Data** for XAU/USD Gold Spot. The API key is kept server-side as a Cloudflare Worker secret:

- `TWELVE_DATA_API_KEY`
- optional `TWELVE_DATA_SYMBOL` (default: `XAU/USD`)

Never put the API key in frontend code.

## Cloudflare deployment

Build command:

```bash
npm run build
```

Deploy command:

```bash
npx wrangler deploy
```

The Worker serves the Vite `dist/` assets and `/api/market/xauusd`.

The API uses Twelve Data `/time_series` with M15 candles and a short edge cache to reduce API-credit usage. The signal engine is a deterministic technical prototype; it does not guarantee profitable trades.
