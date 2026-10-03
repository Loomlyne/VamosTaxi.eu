---
quick_id: 261003-pricing-frozen-restore
status: complete
date: 2026-10-03
---

# Summary: a from-zero replay now runs live's "published price book is frozen" rule

Owner decision `decisions/2026-10-02-live-extras-draft-then-publish.md` (Phase 20 finding D1), the database half of
extras part B/C; owner asked to go ahead 2026-10-03. Part B's screens wait for their pictures and for the fare lines.

- New migration `20261007250000_pricing_row_frozen_restore.sql` (**number to be confirmed by the controller**:
  230000 fare lines, 240000 phase 28): `tg_pricing_row_frozen()` set to live's body, copied verbatim. On live a
  no-op. The never-applied `20260911000002_live_passenger_extras.sql` (seven extras editable by name on a
  published book) is not edited in place.
- `pricing_frozen.test.sql` tests 7-9: adding, editing or deleting an extra on a live version is refused
  (`23001`), whatever its name; the fixture extra is priced while the version is a draft. Still 15 assertions.

## Verified (2026-10-03 20:0x-20:2x +04, native stack, no Docker)

- Live read-only (Supabase connector): body md5 `39df856a4f7f191c1eacdfcd09b3b38a`; triggers `surcharges_frozen`
  (update/delete) and `surcharges_frozen_ins` (insert) both call it.
- Replay from zero (133 migrations): local `md5(pg_get_functiondef(...))` = `39df856a4f7f191c1eacdfcd09b3b38a`, same as live.
- Full pgTAP 99 files / 2653 tests PASS.
- Database-backed tests that write extras: apps/web `refund-by-hand`, `booking-change`, `assign` (.local) pass;
  packages/db `class-change-reprice` 3/3, `worker-arrays` 8/8, `checkout-account` 5/5.

## For the controller at ship

Apply the migration verbatim on live, then read back: the md5 must stay `39df856a4f7f191c1eacdfcd09b3b38a` (a no-op).
No type change (`database.types.ts` unaffected). No site code, no deploy.
