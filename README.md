# AUREX AI — Standalone Website

This project is intentionally independent of AppDeploy and MT5.

## Architecture

Browser → `/api/market/xauusd` → Cloudflare Pages Function → OANDA → AUREX signal engine → browser.

The OANDA token is kept server-side as a Cloudflare secret.

## Deploy to Cloudflare Pages

1. Create a Cloudflare account.
2. Create a Pages project from this folder/repository.
3. Build command: `npm run build`
4. Build output directory: `dist`
5. Add the secret `OANDA_API_TOKEN` in the Pages/Functions environment.
6. Optional variable: `OANDA_INSTRUMENT=XAU_USD`.
7. Deploy.

The site will receive a `pages.dev` URL. A custom domain can be connected later.

## Important

- Do not paste the OANDA token into the frontend code.
- This starter uses OANDA candle data and calculates the signal server-side.
- XAUUSD is an OTC/spot instrument; the exact quote depends on the selected provider.
- The signal engine is a strict technical prototype, not a promise of profitability.
- Browser notification permission must be granted by the user. For reliable mobile push after the browser is closed, a Web Push service worker/backend should be added in the next step.
