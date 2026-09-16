# AUREX AI V7 — D1 setup

Your current D1 database already contains the users/sessions tables and is bound to the Worker as `DB`.

**Do not run the schema again unless the tables are missing.** V7 is designed to match the existing columns:
`users(id INTEGER AUTOINCREMENT, name, email, password_hash, role, subscription_status, subscription_plan, subscription_expires_at, created_at)` and `sessions(id, user_id INTEGER, expires_at, created_at)`.

After V7 is deployed:
1. Open the AUREX public website.
2. Register your owner account.
3. In D1 Console run the owner promotion SQL from README.md, replacing the email.
4. Log out/in. The `Admin` tab appears.
5. Use Admin Panel to activate member subscriptions.
