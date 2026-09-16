# SNIPER XAUUSD AI V7 — Member + Subscription + Admin

Standalone Cloudflare Worker + static assets. No MT5 and no AppDeploy.

## Current stack
- Cloudflare Worker + Assets
- Cloudflare D1 database binding: `DB`
- Twelve Data secret: `TWELVE_DATA_API_KEY`
- Register/login with PBKDF2 password hashing
- Secure HttpOnly session cookie
- Member subscription gate
- Admin panel for member list, subscription activation/deactivation, plan and expiry, and role changes
- XAUUSD market data, signals, history, news and analysis

## Important: existing D1 schema
This V7 matches the D1 schema used by the current AUREX database:
- `users.id` is INTEGER AUTOINCREMENT
- `subscription_status`
- `subscription_plan`
- `subscription_expires_at`
- `sessions.user_id` is INTEGER

Do not run `schema.sql` again if the tables already exist.

## First admin
After the first account is registered, promote that account directly in D1 Console using its exact email:

```sql
UPDATE users
SET role = 'admin',
    subscription_status = 'active',
    subscription_plan = 'OWNER',
    subscription_expires_at = NULL
WHERE email = 'YOUR-EMAIL-HERE';
```

Then log out and log back in. The Admin tab will appear.

## Member activation
Admin → Admin Panel → ACTIVATE. Enter plan name and optional expiry date.

## Security
- Never put Twelve Data API keys or passwords in GitHub.
- Admin role is not publicly selectable during registration.
- This version does not include online payment yet; subscription activation is manual from Admin Panel.
