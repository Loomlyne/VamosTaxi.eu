# Delete the pre-26.3 test bookings (D-37)

You run this yourself. An agent never runs it, and never touches the live database for it.

The script copies every test booking, and everything attached to it, into a backup schema
`backup_d37_20261001`, then deletes them in one transaction. If anything looks wrong it stops and
changes nothing.

Files: `docs/runbook/d37-delete-test-bookings.sql`. It was proven on a local copy of the schema
with `scripts/d37-local-proof.sh`.

## Steps

0. Start only after the new booking flow is live and your own new test booking worked (D-39).
   Real paid bookings are never wiped. This script only touches bookings created before the cutoff
   in the script (2026-09-29 00:00 UTC).
1. Open the Supabase SQL editor for the Vamos project and start a new query.
2. Run the preview. Copy the block under "STEP 0 - PREVIEW" from the script, remove the `/*` and
   `*/` lines, and run it. Check:
   - every row is a test booking, and none is newer than the cutoff;
   - the number of rows. It is 33 today. After 26.3 is deployed the hourly unpaid purge may already
     have deleted some unpaid test bookings. If every previewed row is older than the cutoff, use
     the preview count as `expected`.
3. Paste the whole script from `begin;` to `commit;` into a new query. On the line
   `select timestamptz '2026-09-29 00:00:00+00' as cutoff, 33::int as expected;` set `expected` to
   the preview count. Run it once.
4. Expected messages (NOTICE lines):
   - `D-37: N bookings selected (matches expected)`
   - `D-37: foreign-key list is complete`
   - `D-37 done: N bookings, L legs, P payments backed up in backup_d37_20261001 and deleted; 0 rows left; triggers re-enabled`

   If you see `D-37 abort: ...` nothing was changed. Send me the message.
5. The copies stay in schema `backup_d37_20261001`, one table per source table, plus
   `audit_log_ref` and `stripe_events_ref` for reference. The originals in `audit_log` and
   `stripe_events` are kept. Consent log rows are kept with the booking link removed. Drop the
   backup schema only when you say so.
6. From now on: real paid bookings, never wipe. Restore only onto a copy
   (`docs/runbook/restore-database.md`).

## Why it is safe

- The count guard: if the number of bookings before the cutoff differs from `expected`, it aborts.
- The foreign-key check: if a table that points at bookings is not in the script's list, it aborts.
- One transaction: any failed check rolls everything back, including the backup schema.
- The append-only triggers are switched off only for the six tables it deletes from, and switched
  back on inside the same transaction. The script checks they are on again before it commits.
