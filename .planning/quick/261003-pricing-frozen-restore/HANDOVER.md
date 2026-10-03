# Hand-over: frozen price-book rule restored in the files (quick 261003-pricing-frozen-restore)

**For:** the controller. **Written:** 2026-10-03 20:04 +0400. **Branch:** `fix/pricing-frozen-restore`, cut from origin/main, main merged.
Database change (fresh review: SHIP-WITH-NOTES, `REVIEW.md`). One migration, `20261007250000` — **confirm the number**
(240000 is phase 28, now on main; 230000 is reserved for the fare lines). No site code, no deploy.

At ship: apply the migration verbatim on live, read back `md5(pg_get_functiondef('public.tg_pricing_row_frozen()'::regprocedure))`
= `39df856a4f7f191c1eacdfcd09b3b38a` (unchanged = no-op). Then next free migration: `20261007260000`.
Proof: `SUMMARY.md`. This is the database half of extras parts B/C; part B's screens need pictures for the owner and wait for the fare lines.
