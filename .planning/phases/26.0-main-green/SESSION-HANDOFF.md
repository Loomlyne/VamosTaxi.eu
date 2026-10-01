# Phase 26.0 main green — session hand-off

Written 2026-09-30 by the first 26.0 work session. The control session asked for this hand-off on
the owner's decision of 02:55. The work is unfinished, and a new session continues it.

## Where things are

- **Folder:** `/Users/koss/Developer/vamos-wt/main-green-2`
- **Branch:** `fix/main-green-2`. It has not been pushed, and there is no PR.
- **Last work commit:** `ad44f2bc` (plan 10 spec-run rows). This file is committed on top of it.
- **Last merge of main:** `0f58ab6d` (26.4), merged at `6684541f` with `-X theirs`, so main won every conflict.
  - main was at `76b53ca8` when this was written, with the legal follow-up `e27014c1` and planning notes. That has **not** been merged.
  - Rule from the control session: before the hand-over, merge `origin/main` after 26.4 has shipped. It has shipped. Main wins a conflict. Never rebaseline a visual spec that 26.4 changes; take its version.
- **Working tree:** clean. No agent or test process is left running in the folder: every process whose command line contained `main-green-2` was killed.
- **Last run:** plan 10 spec rows on `ad44f2bc`. The stopped executor was about to run the DB vitest (`test/local`) and had not run it.

## Plans

| Plan | State | Next step if open |
|---|---|---|
| 01 reduced-transparency pin (D-06) | done | — |
| 02 local test stack mg2 | done | — |
| 03 test-only /dev switch (D-02) | done | — |
| 04 Worker client mirror + text[] round trip (D-07) | done | — |
| 05 content-loader-parity pinned (D-03) | done | — |
| 06 DB/auth specs on the shared stack, unique ports | done | — |
| 07 imprint en+de and its own notice (D-05) | done | — |
| 08 /dev gallery specs, dev-exclusion | done | — |
| 09 26.3 DB specs: env port + Worker options | done | — |
| 10 guard + full spec run + offline suite | **half** | See "Plan 10, exact next step" below. |
| 11 Linux e2e GitHub job (D-01, D-10, D-11) | not started | Run it after plan 10. |
| 12 hand-over file `26.0-HANDOVER.md` + owner UAT | not started | Run it after 11 and after the pre-hand-over merge of main. |

### Plan 10, exact next step

1. **What is done:** the guard (`b016461e`) and 53 spec rows in `.planning/phases/26.0-main-green/26.0-SPEC-RUN.md`.
   - Specs with a `**name**` block in that file have run.
   - The top table has one row per spec.
2. **Harness fixes landed after some rows were written:** quote-api Origin (`5e41e506`), auth-flows de label (`dfb0fbf7`), confirmation fake clock (`bed26630`), account-list-error (`14284648`).
   - **Not verified:** whether the quote-api, auth-flows and confirmation rows were re-run after their fix. The table still shows them failing. Re-run those three specs first and update their rows.
3. **Run the DB vitest** and add a row:
   `VAMOS_STACK_ID=vamos-taxi-mg2 VAMOS_STACK_PORTS=583 VAMOS_STACK_INSPECTOR=8193 bash scripts/local-test-stack.sh exec -- pnpm --filter @vamos/db exec vitest run test/local/`
   - It was 38/38 pass on 2026-09-29 after the VT-26-0733 fix.
4. **Run any in-scope spec that has no row yet.** Scope is the 48 CI-ignored specs, plus content-loader-parity, ops-claims-bridge, and the integration specs merged from main (`*-260929.spec.ts`).
5. **Run the offline macOS-mode suite:**
   `CI=1 pnpm --filter web exec playwright test --workers=1 --reporter=line`
   - Split it per directory if it runs long.
   - The only expected fails are the owner-ruled reds (12 runs) plus darwin drift, and each one must be listed.
6. **Add a totals section** to SPEC-RUN.md, then write and commit `26.0-10-SUMMARY.md`.

## Owner rulings (binding, see `26.0-CONTEXT.md`)

- **D-01:** a new ubuntu job runs the CI-ignored specs against its own throwaway Supabase. The macOS job keeps the darwin screenshots.
- **D-02:** `/dev` is served only when `NODE_ENV !== "production"` and `VAMOS_DEV_GALLERY=1`. The flag is never in `wrangler.jsonc`.
  - It is proven: dev-exclusion passes 4/4, including both production-build tests (`abe31e23`).
  - The live `/dev` and `/dev/home/services` answered 404 on 2026-09-29.
- **D-03:** content-loader-parity requires an explicit DB, checks loopback, port and the marker role, and fails loudly under CI or `REQUIRE_DB=1`.
- **D-04:** nothing from PR #63 lands. Main already has the refund int4 fix in newer form.
- **D-05:** imprint is `data-vt-legal="en de"`. fr and ar readers get an EN+DE notice. The owner checks the fr and ar wording at UAT.
- **D-06:** every spec imports `apps/web/tests/support/test.ts`, which pins `prefers-reduced-transparency: reduce`.
  - A guard test (`tests/unit/spec-imports.test.ts`) enforces this.
  - Specs merged from main were moved onto it in `c20a7463`.
- **D-07:** DB tests use the Worker's client options through `packages/db/test/support/worker-client.ts`.
  - That file mirrors the options. It imports `pgArrayTypes`, and its drift check also reads identifier options.
- **D-08:** a VT-26-0733-only failure is marked expected-to-fail. **None are left:** VT-26-0733 was fixed on main in `34af1552`, and the marks were removed in `170fe1e1`.
- **D-09:** any other product failure is marked `test.fail(true, "KNOWN-RED 26.0: … — owner to rule")`, scoped to that one test, and listed for the owner. Two exceptions:
  - A darwin screenshot mismatch is never marked; it is reported with its diff.
  - The owner-ruled reds are never marked.
- **D-10:** the new Linux job gates the hand-started GitHub deploy jobs.
- **D-11:** no Linux screenshots. Pictures are compared on macOS only.
- **The nine owner-ruled red screenshot tests** (RouteSummary ×8, SiteFooter ×1) stay plain red: never skipped, marked or rebaselined. In a run they show as 12 failures, because they run across the projects.
- **The migration line 191 exemption stays.**

## Tests marked test.fail (KNOWN-RED 26.0) and what removes each mark

| Spec:line | Why | Removed when |
|---|---|---|
| `auth-signout.spec.ts:125` | Stale spec. The live header is the DC mock, whose sign-out does `location.href='/sign-in'` (`app/pages/SiteHeader.dc.html:574`). | The owner rules to retarget or retire it. |
| `auth-signout.spec.ts:149` | **Product.** The signout response sets `sb-127-auth-token=; Path=/; SameSite=Lax` with no Max-Age or Expires, so the cookie is emptied but never expired. Cause not diagnosed. | Signout sets Max-Age=0 or a past Expires. |
| `content-string-edit.spec.ts` ×7 (134, 147, 158, 214, 225, 260, 290) | Stale spec. It drives the old staff sign-in and React ops content screen; on localhost `/ops/*` goes to the DC ops mock. | The owner rules to retarget or retire it. |
| `lang-switch.spec.ts` ×3 (133, 162, 184) | Stale spec. `/` is the DC mock home, which has no `data-test-field="pickup"`. | The owner rules. |
| `public-routes.spec.ts:133` | **Product.** The served public pages (DC mocks) have no hreflang links in their raw HTML. | The mocks emit hreflang. |
| `legal-cancellation-imprint.spec.ts:162` | **Product.** Same hreflang gap on /cancellation and /imprint. | The mocks emit hreflang. |
| `checkout-pay-19.spec.ts:525` | **Product, 26.4 code.** A flight-edit re-quote that answers `turnstile_required` mounts no challenge (`CheckoutForm.tsx:559`, `flightBlur` ignores `result.challenge`), and the summary stays on "Updating price". | The CheckoutForm fix lands; the mark then goes red, so remove it. |

Not marked, and still red or open for the owner:
- **Stale specs, unmarked:** home, home-widget (`[data-home]` never renders at `/`), ssr-locale (6), faq (13 plus 16 full-page shots).
  - These target React surfaces that the DC mocks replaced. The owner rules: retire them, or retarget them to the `/dev` gallery.
- **Darwin screenshot drift:** 97 gallery diff images, listed in `evidence/gallery-diffs/INDEX.md`. The imprint en/de/fr/ar shots fail at all 4 widths (`evidence/imprint/diffs/`). Nothing was rebaselined.
- **legal-cancellation-imprint "rtl and English data-tok":** the cancellation page has 0 `data-tok` pills where the spec expects 20.
  - **Not verified** whether this is a stale spec or a product change. Plan 10 did not classify it.
- **Rows still showing a fail in SPEC-RUN.md:** checkout-hosted (390 full flow), currency, lenis, and home-widget.
  - **Not verified** whether each is a product bug, a harness fault, or 26.4 drift. Classify them in plan 10.
  - For quote-api, auth-flows and confirmation, see "Plan 10, exact next step".
- **Flaky:** account-list-error was fixed as a harness issue (it now waits for the DS bundle) and passed 8 of 8 consecutive runs. No other spec was proven flaky. **Not verified** beyond single runs.

## Local database

- **Docker/Supabase project:** `vamos-taxi-mg2`, ports 583xx (DB 58322, API 58321, mail 58324, inspector 8193).
  - It was running and healthy at hand-off, and it was left running.
  - 573xx belongs to another session's `vamos-taxi-auth`. Never use 543xx, 553xx, 563xx or 573xx.
- **Script:** `scripts/local-test-stack.sh`, driven by the env vars `VAMOS_STACK_ID=vamos-taxi-mg2 VAMOS_STACK_PORTS=583 VAMOS_STACK_INSPECTOR=8193`.
  - Subcommands: `env | exec -- <cmd> | e2e <playwright args> | reset | mark | preflight`.
  - After `reset`, always run `mark`. The storage health check can time out after the migrations have applied.
  - It exports both `VAMOS_TEST_DB_PORT` and `VAMOS_LOCAL_DB_PORT`. Main's `worker-arrays.test.ts` reads the second one.
- **Dev-server ports:** specs take them through `testPort()`. Set `VAMOS_TEST_PORT_OFFSET=2000`, so ports run 6100-6499, because other sessions run servers in 4100-4499.

## Findings that went to other sessions

1. **pg arrays (VT-26-0733):**
   - The Worker's postgres.js ran with `fetch_types:false` and had no array types, so the purge and the notification sweep failed.
   - It was fixed on main in `34af1552` (`packages/db/src/pg-types.ts`).
   - After the merge, all 5 checkout DB scenarios pass on the Worker's exact options, including the no-purge safety case. The control run without types gives 2 fails.
2. **The three supersede and no-purge specs** (checkout-server-db ×2, intent-supersede-db): they gave 409 `quote_already_booked` before the fix and pass after it. Reported to the control session.
3. **checkout-pay-19 flightBlur Turnstile challenge:** see the table above. Sent to the control session on 2026-09-30.
4. **hreflang missing on the DC mocks:** marked, and mentioned to the control session.
5. **data-i18n-skip:**
   - The project CLAUDE.md says the runtime does not read `data-i18n-skip`; use `data-vt-no-i18n`.
   - 17 files under `app/`, `apps/web/app` and `apps/web/components` still carry it.
   - This session did not raise it itself: the control session listed it, and the count here is from a grep at hand-off. **Not verified** which of those subtrees actually get translated by mistake.
6. **Not sent yet, for the owner and 26.2:** `app/[locale]/(ops)/api/staff/content/[key]/route.ts` exports non-route helpers.
   - Next's route-export check would reject the file.
   - The production build never runs that check, because tsconfig excludes `.next`. The test builds now exclude `test-results` the same way (`abe31e23`).
7. **24 h reminder cron:** fails hourly on live with "permission denied for table booking_legs" as `vamos_edge`. Reported to the control session on 2026-09-29. **Not verified** whether it is fixed.

## What a newcomer would get wrong

- **Generated files:** `next dev` and `next build` rewrite `apps/web/tsconfig.json` and `apps/web/next-env.d.ts`.
  - Run `git checkout -- apps/web/tsconfig.json apps/web/next-env.d.ts` before every commit.
  - The committed tsconfig has one real 26.0 change: `"test-results"` in `exclude`. Keep it.
- **Long runs stall agents.** Run one spec file per Playwright invocation, always `--workers=1` (parallel workers get SIGKILLed on this Mac), and send output to a log file, reading only a grep or tail.
  - macOS has no `timeout`, and BSD `sed -i` differs from GNU, so use python for edits.
- **Orphaned processes:** `workerd` and `next dev` from killed runs pile up. Kill only the ppid-1 orphans whose path is in this worktree.
- **The live public pages are DC mocks, not the React pages.** Many old specs still target the React home and legal pages, and those are the stale specs above.
- **The e2e preflight** refuses to start if the shifted port range is taken.
- **Never connect to 54322 or 55322.** They are other sessions' stacks. Main's `worker-arrays.test.ts` falls back to 54322 when `VAMOS_LOCAL_DB_PORT` is unset; the script now sets it.
- **Plan text says 573xx.** Ignore it: mg2 is on 583xx.
- **Frozen for this phase:** `apps/web/app/[locale]/checkout/**`, the home `.dc.html` files, the account and manage-booking pages, `packages/db/src/**`, `apps/web/lib/checkout/**`, `app/ops/OpsNewTrip.dc.html`, and `.planning/ROADMAP.md` and `STATE.md`. If a fix needs one of them, tell the owner.
- **Owner gates:** no push, no PR, no deploy, read-only on live. Hand over to the control session `local_03cf7e47-1746-4ac2-a28b-8ee0d831f01b`.
