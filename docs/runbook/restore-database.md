# Restore onto a copy / new project

English numbered clicks. No screenshots. One practice restore (D-41). Postgres only. Agent does not click restore.

Live Zurich project ref **yaumjzvylngfjhtuffqs** (region eu-central-2) is the **source identity only**. It is never the restore **target**. Real bookings already exist. There is no “before real bookings.” Never wipe live.

Support: **info@vamostaxi.site** and **+41 79 626 70 82**.

## Abort now if

1. The target project URL or ref is **yaumjzvylngfjhtuffqs** — abort. That is live Zurich.
2. The restore dialog would overwrite the current project in place — abort. Choose **new project** / **copy**.
3. Anyone asks you to `pg_dump` onto this Mac — abort. Do not dump.
4. Anyone asks you to copy or delete R2 — abort. Photos stay on live R2.

## Must nots

1. Do not restore over live Zurich **yaumjzvylngfjhtuffqs**.
2. Do not buy PITR unless the owner says so this sitting. Use whatever backup heading Supabase already shows.
3. Do not `pg_dump` onto this Mac. Do not open a dump CLI.
4. Do not copy, sync, or delete booking photos. Photos stay on live R2.
5. Do not `supabase db push`. Do not deploy. Do not bind vamostaxi.eu.
6. Do not invent CHF, chauffeur names, or sample booking refs in the copy.

## 1. Open the live project as source only

1. Open https://supabase.com/dashboard
2. Sign in to the Vamos org.
3. Open the project whose ref is **yaumjzvylngfjhtuffqs**. Expected: region **eu-central-2** (Zurich).
4. Confirm you will not restore *into* this project. If you are about to pick it as the destination, abort.

## 2. Backups → restore to a new project

Exact labels move. Use whatever heading is on screen.

1. Left sidebar: **Database**.
2. Click **Backups** (or **Backups & PITR**, or the backup heading you actually see).
3. Expected screen text includes a list of backups, restore, or point-in-time. Do not click **Enable PITR** / **Upgrade** unless the owner said to buy PITR this sitting.
4. On the backup you will practise with, open **Restore** (or the restore control on that row).
5. Choose restore to a **new project** / **copy**. Do not choose restore in place. Do not choose this same project as the destination.
6. Name the copy something that is obviously not production. Complete the new-project fields Supabase shows.
7. Before confirm: read the destination project ref / URL.
8. If that ref or URL contains **yaumjzvylngfjhtuffqs**, abort.
9. Confirm restore onto the **new** project only.

## 3. After the copy exists

1. Open the **new** project. Note its project ref (the copy — never yaumjzvylngfjhtuffqs).
2. Open live **yaumjzvylngfjhtuffqs** again. Expected: it still exists, still eu-central-2, bookings still there. Live Zurich was untouched.
3. Leave R2 alone. Photos stay on live R2. The copy is Postgres only.
4. One drill is enough. Do not run a second restore unless the owner asks.

## Done when

- A **new** Supabase project holds the restored copy.
- Live ref **yaumjzvylngfjhtuffqs** was never the target.
- No PITR purchase unless the owner said so this sitting.
- No dump on this Mac. No R2 copy or delete.
