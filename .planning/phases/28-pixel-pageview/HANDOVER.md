# Phase 28 hand-over to the control session

Branch `gsd/phase-28-pixel-pageview`, pushed, no PR. Cut from main, `origin/main` merged in twice (last at about 14:11 UTC, `befb6e54`); main wins, no conflict arose.
Built by a job session: no commit on main, no push of main, no deploy, no write to the live database.

**A fresh reviewer session, not the builder, must read this before it ships: it touches the database (a trigger on `bookings`), consent (what counts as "marketing is on") and tracking (what leaves the browser to Meta).**

## What was built (plans 28-01 to 28-07)

| Plan | What | Files |
|---|---|---|
| 28-01 | Two nullable columns `bookings.meta_fbp`, `meta_fbc` with Meta-format CHECKs; trigger refusing any new or changed value on a non-pending booking for every role (NULL always allowed); definer writer `checkout_set_meta_click_ids(uuid,text,text)`, EXECUTE `vamos_checkout` only | `packages/db/supabase/migrations/20261007240000_booking_meta_click_ids.sql`, pgTAP `booking_meta_click_ids.test.sql`, `test/local/meta-click-ids.test.ts`, types, fence allow-list |
| 28-02 | The loader `app/vamos-meta.js` (allow-list, referrer guard, autoConfig off, init with the id only, one PageView, withdraw cleanup) and its server twin `lib/meta/pixel-pages.ts`; one shared table of ~110 addresses run through both | `app/vamos-meta.js`, `apps/web/lib/meta/pixel-pages*.ts`, `vamos-meta.test.ts` |
| 28-03 | One helmet line in each CookieBanner twin; second flag `META_EVENTS_MANAGER_SWITCHES_OFF`; needle scan rewritten (Meta strings only in the loader and `headers.ts`) | `app/pages|home/CookieBanner.dc.html` (+1 line each), `legal-gate.ts/.test.ts`, `mock-mounts.test.ts` |
| 28-04 | Mock pages get a Meta-enabled CSP only on clean addresses while both flags are on; `Referrer-Policy: strict-origin` on every response | `lib/security/headers.ts`, `lib/meta/pixel-csp.ts`, `middleware.ts` (mock-serve block only) |
| 28-05 | Pay press saves `_fbp`/`_fbc` on the unpaid booking, only with the server's marketing Accept at that moment, public Origin only, Meta format only, never in Stripe, never logged, runs in `ctx.waitUntil` so the Pay answer never waits for it (review 2); a failure never changes the answer | `lib/meta/click-ids.ts` (`scheduleMetaClickIdSave`), `app/api/checkout/intent/route.ts` (the `afterBooking` closure) |
| 28-06 | Browser proof with a stand-in for Meta's script, pages served at `https://vamostaxi.site/...` | `tests/integration/meta-pixel-28.spec.ts`, `tests/support/meta-pixel.ts`, `tests/fixtures/fbevents-stub.js` |
| 28-07 | Proof with Meta's REAL script (requests caught locally); both flags opened; META-09 end to end on a local Worker; this file | `tests/integration/meta-pixel-28-real.spec.ts`, `tests/e2e-worker/meta-click-ids.e2e.mjs` + `meta-run.sh` |

Owner's answers (question form, 2026-10-03) are in `28-SIGNED.md`: plan signed; open after the local real-script proof; sign-in/sign-up from an ad (`?fbclid`) not counted, bare address only; cookies text left as is.

**The flags are TRUE on this branch** (`META_LEGAL_GATE_OPEN`, `META_EVENTS_MANAGER_SWITCHES_OFF` in `apps/web/lib/meta/legal-gate.ts`, `GATE_OPEN`/`SWITCHES_OFF` in `app/vamos-meta.js`; a test pins them equal). Shipping this branch starts measurement for everyone who has accepted marketing under policy `2026-10-01`.

## Migration

- File: `packages/db/supabase/migrations/20261007240000_booking_meta_click_ids.sql`. **Controller: confirm the number.** I used `20261007240000` after checking `git branch -r`, `git log --all --name-only` and `origin/main` on 2026-10-03: no branch or main uses it. `feat/fare-lines` holds `20261007230000`. If it must change, rename the file only (nothing refers to the number).
- Additive: two columns (no default), two CHECKs, one trigger function (EXECUTE revoked from public), one trigger, one definer function. No existing row is changed. Safe on live (real paid bookings).
- Two things the pgTAP run found and fixed while building: Postgres regex repetition is capped at 255 (so the `_fbc` click id is `[A-Za-z0-9_-]+` bounded by `length(meta_fbc) <= 600`), and the trigger function needed `revoke ... from public` (the existing `extensions.test.sql` F-13 test caught it).

### Order of shipping
1. Apply the migration verbatim through the Supabase connector, then the read-only checks below.
2. Deploy the Worker (`--env staging`, Worker `vamos`). Migration before the deploy: the Pay press calls the function; if it is missing the call fails with 42883, is logged by SQLSTATE and swallowed (Pay still works), but the ids would be lost.
3. Live checks, the 4242 payment, then the owner UAT.

### Hosted read-only checks after apply
1. `select count(*) from public.bookings` before and after: equal. `select count(*) from public.bookings where meta_fbp is not null or meta_fbc is not null` = 0.
2. `has_function_privilege('vamos_checkout','public.checkout_set_meta_click_ids(uuid,text,text)','EXECUTE')` true; `anon`, `authenticated`, `vamos_system`, `vamos_guest` and `service_role` false (check `service_role` on hosted: it may hold default EXECUTE there, see memory live-service-role-default-execute; if true, note it, it is a trusted role and the trigger still refuses a non-pending backfill); `public` false for both the writer and `tg_bookings_meta_click_ids_pending_only()`.
3. `has_column_privilege('authenticated','public.bookings','meta_fbp','SELECT')` false, same for `meta_fbc`, same for `vamos_guest`.
4. md5 of `pg_get_functiondef` for the writer and the trigger function equals local; the trigger `bookings_meta_click_ids_pending_only` exists, enabled.

## Gates and results (all on the final tree, after the last merge of main; clock is UTC, 2026-10-03)

| Gate | Result |
|---|---|
| `pnpm install --frozen-lockfile` | ok |
| `pnpm test:unit` (14:03 UTC, and again at about 14:16 after the last merge) | 405 files passed, 4621 tests passed, 31 skipped (skips are main's) |
| Own stack `vamos-taxi-280` (DB 61322), `reset` from zero (14:04 UTC) then `pgtap` | 100 files, 2700 tests, PASS (baseline before my migration was also PASS) |
| `roles`, then `test/local/meta-click-ids.test.ts` + `consent-reader.test.ts` | 5 passed |
| `pnpm typecheck` / `lint` / `lint:css` / `check:numbers` / `check:legal-claims` / `check:public-env` / `check:db-fences` / `i18n:check` / `db:seed:check` (re-run after the last merge) | all exit 0 (lint: 0 errors, 6 warnings, none from this phase) |
| Types against the own stack (not `db:types:check`, which targets 54322) | identical to `packages/db/database.types.ts` |
| `pnpm build`, `opennextjs-cloudflare build` | both exit 0 |
| Local Worker (`wrangler dev --local`, port 4377, stopped after) with `Host: vamostaxi.site` | `/about`, `/de/about`, `/?fbclid=abc`, `/sign-in`, `/privacy`: CSP carries the Meta script host; `/sign-in?returnTo=/x`, `/manage-booking`, `/checkout`, `/confirmation`, and `Host: dashboard...`: plain CSP. Every response `Referrer-Policy: strict-origin`. `/about` HTML contains no pixel id, `fbq`, `fbevents` or `facebook` (grep count 0). |
| Browser, stand-in script (`meta-pixel-28.spec.ts`, cases A-H, 1440 project) | 8 passed (re-run at 14:09 UTC after the first merge of main; the second merge brought only test-lab and check scripts) |
| Browser, REAL Meta script (`meta-pixel-28-real.spec.ts`, needs `VAMOS_META_REAL_DIR`) | 3 passed, output below |
| META-09 end to end on a local Worker + own stack (`tests/e2e-worker/meta-run.sh`) | 6 PASS, 1 N/A (case 6 "not in Stripe": the Stripe stand-in does not expose bodies; pinned by source tests instead) |
| Must-not greps on added lines | `sk_live_` 0; `vamostaxi.eu`, `graph.facebook.com`, `META_CAPI_ACCESS_TOKEN`, `noscript` only inside tests that ban them; pixel id / `fbq(` / `fbevents` only in `app/vamos-meta.js` and tests (the needle scan covers `apps/web/{app,components,lib,public}`, `middleware.ts` and the root `app/`) |
| Pay-path diff vs main | only `app/api/checkout/intent/route.ts` (+26/-1). Nothing under `lib/checkout`, `lib/quote`, `lib/pricing`, `app/checkout`, `app/confirmation`. |

### Not verified
- `consent-banner-27.spec.ts`: its `beforeAll` boots `next dev`, which did not become ready in 200 s in this worktree (no app env). The pieces of Phase 28 that touch the banner (the helmet line) are exercised by cases B and G of the new spec. Please run it where `next dev` works.
- Linux CI and the macOS visual jobs; the 1024/768/390 projects of the new specs (they skip: one viewport suffices, no UI changed).
- A real card payment (needs the live Stripe test flow); a live Accept in a real browser against Meta (UAT below).
- The auth Worker e2e (`run.sh`): not run; auth is untouched.

### The 28-07 proof output (Meta's real script, nothing reached Meta)
Meta's `fbevents.js` 2.9.414 and the setup file for pixel `1595596972063765`, downloaded with plain GETs at 13:58 UTC into a temp folder (never committed), served by the test. Every request to a Meta host was fulfilled by the test and recorded. Page carried the CSP the Worker would send.

```
a /sign-in (typed e-mail + password, Enter, 3 buttons, 5 s)
GET connect.facebook.net/en_US/fbevents.js
GET connect.facebook.net/signals/config/1595596972063765   keys=v,r,domain,hme,ex_m
GET www.facebook.com/tr/  ev=PageView dl=https://vamostaxi.site/sign-in
    keys=id,ev,dl,rl,if,ts,iw,sw,sh,v,r,ec,o,aems,fbp,ler,plt,it,coo,expv2[],rqm
b /about (scroll, 2 links, 5 s)            -> same three requests, dl=.../about
c /about, Cookie preferences -> Marketing off -> Save, then clicks, 5 s
                                            -> same three requests, then nothing more; _fbp/_fbc deleted
```
Asserted: exactly one `PageView` per page load; no other event name in any URL or body; no `ud[`, `udff[`, typed e-mail or its SHA-256 anywhere; only the two script files and `/tr` were requested; `dl` is the page, `rl` empty; `_fbp` on `.vamostaxi.site` expires 90 days (89 to 91) from now.

**Control run:** with the two `autoConfig` lines deleted from the loader (copy under `apps/web/public`, restored), the same real script sent an extra `POST /tr/` with no `ev=PageView` (its automatic button/form events). So the test does see automatic events, and the two lines are what stop them.

Setup file at 14:00:50 UTC (`v=2.9.412` and `v=2.9.414`): `optIn(..., "AutomaticMatching")` 0; `config.set(..., "automaticMatching")` 0; `InferredEvents` opt-in still served twice (kept off by `autoConfig` false, proved above). Meta's script moved from 2.9.412 (research) to 2.9.414.

## Owner UAT (Hermes in-app browser, after the controller deploys)
1. Open https://vamostaxi.site/about in a fresh profile, press nothing. Expected: no request to any facebook host in the network list; no `_fbp` cookie.
2. Press "Accept all". Expected: in Events Manager, Test events shows exactly one PageView for `/about`, and nothing else; devtools shows `_fbp` on `.vamostaxi.site` expiring about 90 days out.
3. Open https://vamostaxi.site/sign-in, type in the fields, press the buttons. Expected: Test events still shows only PageViews (one for `/sign-in`), no other event.
4. Footer "Cookie preferences", switch Marketing off, "Save choices", reload. Expected: no request to any facebook host; `_fbp` and `_fbc` gone.
5. Accept again, open https://vamostaxi.site/checkout and a confirmation page. Expected: no request to any facebook host on either. (A new Accept on the same tab after step 4 counts on that page only.)

Controller, after the UAT: one 4242 payment after Accept on `/about`, then read `booking_payments` by status, and `meta_fbp`/`meta_fbc` on that booking read-only (values present in Meta's format; do not print them in full).

## Rollback / kill switch
- Fast: set `META_LEGAL_GATE_OPEN` or `META_EVENTS_MANAGER_SWITCHES_OFF` to `false` in `legal-gate.ts` and the matching literal in `app/vamos-meta.js`, deploy. The loader then only clears Meta cookies; the CSP drops the Meta host. `/app/*` is cached `max-age=300`, so a returning browser stops within about 5 minutes after the deploy; the edge HTML cache is 300 s.
- Full: revert the merge. The migration needs no rollback to be safe (columns stay empty); to remove it later: drop the trigger, the writer and the two columns in a new migration.
- Policy rule: if the owner ever reports an Events Manager switch back on, the switch flag goes false.

## Facts for the owner and the reviewer
- Cookie text "Kept for up to 90 days": settled by the owner (question form, 2026-10-03, Q5 in `28-SIGNED.md`): the text stays as is; "up to 90 days" counts from the last visit. Safari caps script-set cookies at 7 days. No code change.
- Meta also keeps two local-storage items (`multiFbc`, `aemSource`) that the cookies page does not name. The owner decided to leave the text as is; our withdraw deletes both.
- Withdraw deletes `_fbp`, `_fbc`, `_fbleid` (host-only and `.vamostaxi.site` forms) and `multiFbc`/`aemSource` everywhere: on the mock pages in `app/vamos-meta.js` (also on pages that are not on the allow-list, whenever the server says marketing is not on), and on the React pages (checkout, confirmation, pay link) in `CookieBanner.tsx` after a save with Marketing off and on load whenever the server answers that Marketing is not on, including no choice recorded (`lib/meta/clear-browser-state.ts`, review 2); an unreachable server deletes nothing. The `HttpOnly` flag is not involved: Meta's cookies are script-written.
- The Pay press now writes on every press (NULLs when there are no cookies or no consent), so a later press without consent clears earlier values. The consent read and the write run in the background (`ctx.waitUntil`, review 2), so the Pay answer does not wait for them; the job catches its own errors and a failure logs the SQLSTATE only. Without an execution context (tests, a local run with none) it runs inline.
- Tightening beyond the plan (in both implementations): no port or credentials in the address, no `@` anywhere in it, undecodable addresses fail closed; `/sign-in` and `/sign-up` count only with no query string at all (owner's Q2).
- `Referrer-Policy` changed from `strict-origin-when-cross-origin` to `strict-origin` on every page (one existing test pin changed on purpose). No product code reads `Referer`; cross-site requests already sent the origin only.
- The loader runs on every customer mock page via the cookie banner, but acts only on the allow-list; a signed-out visitor on `/account` or `/bookings` is sent to the bare `/sign-in` by the mock and counts there.
- Shared files touched and merged against main: both CookieBanner twins (one line each, contact-button job merged cleanly), `middleware.ts` (mock-serve block), `lib/security/headers.ts`, the `intent/route.ts` closure, `scripts/db-access-fence-allowlist.json`, `database.types.ts` (regenerated from the own stack after the merge; identical).
- Phase 29 (Purchase) builds on `metaMeasurementAllowed()` and the saved columns; whether to null the columns after the Purchase send is open (research Open Question 4).

## Left running
Nothing. The stack `vamos-taxi-280` and the local Worker on 4377 were stopped; `tsconfig.json`/`next-env.d.ts` restored; no `.next-*` folder left.

## Review fixes (fresh reviewer, FIX FIRST; one commit per item group)
- CR-01 a: `CookieBanner.tsx` calls `clearMetaBrowserState()` (new `lib/meta/clear-browser-state.ts`) after a save with Marketing off and when the saved choice read on load has Marketing off. Tests: helper (both cookie domain forms, both storage keys, no value written) and source pins on the banner.
- CR-01 b: `app/vamos-meta.js` `check()` now asks the server on every page; a page off the allow-list never starts the pixel but clears when marketing is not on. Tests for denied path, denied referrer and dashboard host, and "server unreachable deletes nothing".
- WR-01: the trigger refuses only a column that ends non-NULL and changed; clearing one column on a paid booking works. pgTAP: four new cases (clear one, other keeps value, set again refused, clear last).
- WR-02: an outside referrer counts only as a bare origin. Table rows updated.
- WR-03: owner, Q5 in `28-SIGNED.md`: text stays, 90 days counts from the last visit. The handover's own claim was replaced by that answer.
- WR-04: the tree-scanning gate tests have a 30 s timeout. WR-05: comment corrected; tests pin that the account page, the language runtime and the footer anchor only move to allow-listed addresses.
- WR-06: a non-public Origin returns `skip` (saves nothing, clears nothing). WR-07: cookie-clearing wording corrected above.
- IN-01: migration sets `lock_timeout = '5s'`, adds both CHECKs `NOT VALID`, then validates. IN-02: `service_role` added to the hosted privilege checks.
- Re-run after the fixes (14:30 to 14:40 UTC, nothing new on main): pgTAP from zero 100 files / 2704 tests PASS; Worker-client tests 5; unit 406 files / 4635 tests; typecheck, lint (0 errors), lint:css, check:numbers, check:legal-claims, check:public-env, check:db-fences, i18n:check, db:seed:check all exit 0; types identical; `pnpm build` and OpenNext build exit 0; browser stand-in 8/8 and REAL Meta script 3/3 (one PageView, nothing else); META-09 local Worker run 6 PASS / 1 N/A. Stack stopped.

## Review 2 (second fresh reviewer: SHIP-WITH-NOTES; one commit per item on `fix/phase-28-review-2`, cut from `90f766fd`)
1. React banner and a state reply with no choice recorded. `CookieBanner.tsx` now calls `clearMetaUnlessMarketingOn(reply)` on every answer the server gives: Marketing on keeps everything, anything else (`chosen:false`, Marketing off, a malformed choice) runs `clearMetaBrowserState()`, as the mock loader does. A failed or unreachable check deletes nothing. Test `components/consent/banner-meta-clear.test.ts` renders the real banner, runs its effects against a stubbed state reply and reads the cookie and storage writes (four cases); the helper has its own table test.
2. Loader and a page restored from the back-forward cache. `app/vamos-meta.js` `check()` calls `withdraw()` (revoke Meta's consent when the pixel already runs, close the page to a later start, delete cookies and both storage keys) instead of only deleting. The `pageshow` re-check already existed (it calls `check()` after the cached-choice revoke). Tests in `vamos-meta.test.ts`: restore with a stale cache saying yes and the server saying no (revoke, deletes, never counts again), no choice recorded, server unreachable (nothing), Marketing still on (no second boot).
3. The click-id save no longer delays Pay. `scheduleMetaClickIdSave` (`lib/meta/click-ids.ts`) runs the consent read, the decision and the write as one job in `getCloudflareContext().ctx.waitUntil` (no other route in this repo uses it; the identity wrappers are documented as safe from it). The job catches its own errors and logs the SQLSTATE only; the public-Origin-only rule is unchanged. With no execution context (a test) it runs inline. The two statements above ("never blocks Pay", "one extra database round trip per press") were corrected earlier in this file. Test `lib/meta/click-ids-route.test.ts` calls the real route: the answer arrives while the database write is held open, the background job is still pending and then writes the ids; a failing write gives the same answer and an SQLSTATE-only log; a dashboard Origin saves and clears nothing; no context saves inline; no consent cookie writes NULLs. A deliberate break (awaiting the job) turns the first test red.
4. Double-encoded `@`. Both twins (`app/vamos-meta.js`, `lib/meta/pixel-pages.ts`) decode once strictly, then leniently round by round, checking `@` and `vt-<digit>` at every level, and refuse an address still changing after five rounds. Shared table rows: `%2540`, `%252540`, `%2540` with a stray `%25`, `vt%252D`, deep nesting (all refused); a single `%25` stays allowed.

Not changed: the flags, the allow-list semantics beyond item 4, the migration.

### Owner decisions for Phase 29 (not code)
- (a) Automatic advanced matching is off only by the code flag (`autoConfig` false). If it is switched on in Events Manager, e-mails autofilled on `/sign-in` could be hashed and sent. In that case the switch flag (`META_EVENTS_MANAGER_SWITCHES_OFF` and the loader's `SWITCHES_OFF`) must go false. Phase 29 decides whether to add a check that does not depend on the owner remembering this.
- (b) Saved `meta_fbp` / `meta_fbc` on a booking are not cleared on a later withdrawal of Marketing, or after payment. Whether they are nulled after the Purchase send (research Open Question 4) and whether a withdrawal must reach already-saved values is the owner's decision.

## Final hand-over (2026-10-03, branch `fix/phase-28-review-2`)
Tip: the commit that adds this section (see `git log -1 origin/fix/phase-28-review-2`). Base: merge of `origin/main` at `a8e78ec2` (home sections hand-over 2 `923c7fea` + board notes) into `d1ebf1aa`, merge commit `5bdfad47`; no conflict.

Verified on that tree (about 15:45 to 16:10 UTC):
- `sync-dc-mock-to-public`, `pnpm install --frozen-lockfile`, `pnpm test:unit` (web 408 files / 4666 passed, 31 skipped; db 14; emails 239; scripts ok), `typecheck`, `lint` (0 errors, 6 warnings), `lint:css`, `check:numbers`, `check:legal-claims`, `check:public-env`, `check:db-fences`, `i18n:check`, `db:seed:check`: all exit 0.
- Own native stack `vamos-lab-p28` (Supabase CLI 2.119.0, `--runtime native`, DB 45122, no Docker): every migration from zero including `20261007240000_booking_meta_click_ids`, seed ok; `supabase test db` 100 files / 2704 tests PASS. Stack stopped, scratch folder removed. `lab.sh up` on main still calls Docker (no native mode in the script yet), so the stack was started by hand in the lab's workdir.
- The three Meta texts in `app/vamos-meta-texts.js` equal `.planning/decisions/2026-09-30-meta-wording.md` cell for cell (12/12, independent script, plus `owner-texts.test.ts`).
- No Purchase event: the loader's only `track` is `PageView`; no `Purchase`, CAPI or `graph.facebook.com` in app/lib/components/middleware (Phase 29).
- Supabase connector from this session sees `yaumjzvylngfjhtuffqs` (read-only `list_migrations`): last live migration `20261002222545 booking_reference_five_digits`; `booking_meta_click_ids` not applied. Nothing applied.

Not verified here: browser specs (stand-in, real Meta script, META-09 Worker run) were not re-run after this merge (main brought only a home `.dc.html` route-tap change and board notes); Linux CI; a 4242 payment; owner UAT.
