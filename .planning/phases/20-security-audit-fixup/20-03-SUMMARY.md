# 20-03 SUMMARY

Owner applied `20260919000001` in the SQL editor (Success. No rows returned).

Live follow-up: `GET /api/quote` returned `{ok:true, classes:[], fixed_routes:[]}` because `asQuote` SET ROLE `anon` then calls `quote_rate_book`. Those four RPCs must stay granted to `anon`. `rls_auto_enable` and `create_quote_snapshot` stay revoked.

Follow-up file: `20260919000002_restore_anon_quote_rpcs.sql` — **not applied yet**.
