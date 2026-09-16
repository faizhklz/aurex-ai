# SNIPER XAUUSD — Step 2: TP/SL Monitor

This build adds persistent D1 trade records and a live quote monitor. Confirmed BUY/SELL signals are stored per user. A new trade starts as PENDING until the live quote reaches its entry, then becomes ACTIVE. It can progress to TP1 HIT, TP2 HIT, or SL HIT.

## Important
The current monitor is driven by dashboard polling (~15s) using the Twelve Data quote. If the dashboard is closed, it will not check the market continuously yet. Background monitoring + push notifications will be added in a later step with scheduled processing and Web Push.

The worker creates the `trades` table automatically on first authenticated trade request, so no manual D1 migration is required for this step.
