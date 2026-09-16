SNIPER XAUUSD — AUTH/D1 FIX

1) Replace the ENTIRE GitHub worker.js with this worker.js.
2) Commit the change and wait for Cloudflare deployment.
3) Do NOT create a new D1 database.
4) After deployment, Cloudflare Workers & Pages > aurex-ai > Bindings must have:
   D1 database | Variable name: DB | Database: aurex-ai-db
5) Test:
   https://aurex-ai.faizhklz.workers.dev/api/health
   Expected after the DB binding is attached:
   {"ok":true,"db":true,"tables":["sessions","users"]}

Important:
- This worker uses PBKDF2 with 100000 iterations (Cloudflare-compatible).
- Auth exceptions are returned as JSON instead of a Cloudflare HTML 1101 page.
- The current wrangler.jsonc is retained intentionally because the actual D1 database UUID was not available in the project file. Do NOT invent a database_id.
- If a Git deployment removes the dashboard binding, re-add/save the DB binding after deployment. The binding name MUST be DB.
