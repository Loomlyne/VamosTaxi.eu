# Phase 20 hand-over, batch C part 1

**Branch:** `fix/phase-20-batch-c`, main `f29623da` (refunds by hand live) merged at `d90b342d`, code head `d252fac6`. Not deployed, no
hosted SQL. Ships after refunds by hand (20-10) and before Phase 27. Needs the owner's Ship.
F12 (sign-in confirm screen, signed) and F16 (dashboard files off the public host) are part 2, after
Phase 27, with their own hand-over. The F12 design commits on this branch (`cd59570f`, `e1550dcc`)
are planning files only.

## Commits, one fix each

| Fix | Commit | What changes |
|---|---|---|
| F17 | `58e85403` | The Arabic font (Noto Sans Arabic 5.3.0, OFL 1.1, Arabic subset, weights 400–700) is served from our own host (`assets/fonts/noto-sans-arabic/`); `app/vamos-locale.js` no longer asks Google. The CSP is unchanged and stays closed. |
| G22 | `f633ba24` | Address search counts visitors by Cloudflare's visitor address only (`lib/geo/session.ts`). |
| G14 | `d88ce260` | Only `vamos_role` from the sign-in token reaches SQL (`packages/db/src/claims.ts`); SQL reads no other key. |
| G15 | `e5b60f00` | Support attachments are cut off at 5 MB while being read (`lib/ops/ticket-inbound-files.ts`). |
| F14 | `380f265e` | The dashboard edit-request path refuses with 503 when `QUOTE_LOCK_SECRET` is empty, before any database or Stripe call. |
| G17 | `d252fac6` | Migration `20261005150000_last_admin_guard.sql`: a trigger on `public.staff` refuses any change that leaves no active admin. |

## In plain words for the owner

- **Last admin:** the dashboard can no longer end up with nobody who is admin. Removing, demoting or
  deactivating the last admin is refused — also when two admins press at the same second, and also
  when someone tries to delete the last admin's sign-in account. To remove yourself, first make
  someone else admin.
- **Arabic:** Arabic pages now show the proper Arabic type, loaded from our own site. Before, the
  font was blocked and phones showed their own fallback type.
- The other four fixes change nothing visible.

## Checks on the merged tree `d90b342d`

| Check | Result |
|---|---|
| typecheck, lint, lint:css, i18n:check, check:legal-claims, check:numbers, check:public-env, check:db-fences, db:seed:check, build | exit 0 |
| Unit tests | 2898 pass, 2 skipped, 0 fail; emails 151 pass. A first run under machine load (load average 20) had 9 five-second timeouts in 7 files; each file passed alone and the full re-run passed. |
| pgTAP (isolated stack, from-zero replay) | 86 files, 1946 tests pass; new `last_admin_guard.test.sql` 10 (5 failed before) |
| Each fix | test failed first, passes after |
| F17 browser | headless Chromium under the exact CSP, Arabic at 1440 and 390: font loaded from our origin (200), 0 Google requests, 0 violations; pictures in `20-C-screens/` |

## Migration

`20261005150000_last_admin_guard.sql`: one trigger function (SECURITY DEFINER, `search_path=''`) and
one trigger on `public.staff`. No row changes. Safe on live. It sorts before the live
`20261007100000`, which only changes grants, so the order is safe. Apply verbatim, read back
`md5(prosrc)` of `app`/`public` trigger function and `pg_trigger` for `staff_last_admin_guard`.
`20261005140000` (refunds by hand) is live since 02:30, so this is the next migration in order.

## NOT verified

- Nothing on live; not through the real Worker.
- Two admins at the same instant: proven only one after the other under the trigger, not as a live race.
- Seeds or tooling that delete admin users: none found in the 86 test files; not audited beyond that.
- Generated database types were read, not formatted and diffed (the migration adds no table or function a client calls).

## Owner UAT after the Ship

1. On your phone open https://vamostaxi.site/ar. Expected: the Arabic headline and text are in the site's Arabic type (even, rounded letters, same on every page), not the phone's default.
2. Dashboard → Staff. If you are the only admin, try to change your own role to dispatcher. Expected: refused with the existing "last admin" message.
3. vamostaxi.site home → From box → type "Zurich". Expected: addresses are suggested as before.
4. Dashboard → a booking with an open edit request → open it. Expected: the page works as before.
