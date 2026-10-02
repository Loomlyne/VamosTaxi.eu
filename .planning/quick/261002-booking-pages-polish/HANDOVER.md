# Hand-over — 261002 Booking pages polish (2026-10-03 +04)

Job session in `.claude/worktrees/booking-pages-polish`, branch **`fix/booking-pages-polish`**, cut from `origin/main`
3978fda9; `origin/main` merged in three times, all clean, main touched no file of this job: 7d82a17f (settle safety
997661d4) at 918a96af, f0285a16 (Actions trim 33c9b994, Dependabot lockfile, board notes) at d5b64b81, then e77b5ede
(policy values draft and Publish, migration 20261007210000) at 2c6c8937. Tip: the docs commit that adds this file (`git log -1 fix/booking-pages-polish`). Folder clean after it.

Owner signature (question form, 2026-10-02 about 15:30 +04): design (four sheets) and plan —
`.planning/decisions/2026-10-02-booking-pages-polish.md`. Plan: `PLAN.md`. Sheets: `screens/sheet-1..4`.
No migration. No setting. No seed change. No live read or write.

## What is in it

| Commit | What a customer sees |
|---|---|
| `2f8a4801` | Signed in, a paid booking on /booking-detail reads its real status ("Confirmed", "Driver assigned", …) instead of "Awaiting payment", and shows the Cancel tile the e-mail page shows. The cancel screen offers the window the server would apply (more than 24 h: automatic full refund; later: our review). `/api/account/bookings/details` now also answers `status`, `canCancel`, `cancelWindow`, `reviewSubmitted`: ownership read as the customer (reference AND signed-in e-mail), then `compute_cancellation_refund` through `asSystem` (the same definer function the cancel uses), outside the customer transaction; a failed window read means no Cancel. One rule for both pages (`customerCanCancel`): no Cancel once completed, no-show, cancelled, partially cancelled, refunded or reviewed (refunded is new on the e-mail page; signed). |
| `000c5b7d` | Arabic bag counts: 2 حقيبتان, 3–10 N حقائب, 11–99 N حقيبةً (voucher, booking pages, ops, home travellers summary). "Switzerland" in the dictionary as a fallback. |
| `21e1ffaf` | Time picker: hour : minute reads left to right in Arabic (home and the booking pages' change view; 18:30, not 30 : 18). The booking pages' picker labels days in the reader's language (Latin digits in Arabic), opens on the booked month, and its footer wraps on a phone instead of cutting the summary. |
| `47284675` | Dates on manage-booking and booking-detail in the reader's language and relabelled live on a language switch: Di. 6. Okt. / mar. 6 oct. / الثلاثاء، 6 أكتوبر; the time in a left-to-right span. Booked-for / new-pickup, change-requested row, voucher date, cancel sentence and the toast all follow. The refund line names the card's country in the reader's language (Schweiz / Suisse / سويسرا) and the payout day the same way. The header badge always gets a key the design-system badge knows ("paid" no longer falls back to "Awaiting payment"). |
| `3f073873` | Test only: the details route through the real Worker client on a local database. |
| `cdf86f26` | Review fixes: a failed cancel-window read is logged (`account_booking_cancel_window_failed`, no e-mail or reference); the pickers' day and month names are marked untranslated (pages copy; home month title); a corrected comment. |

React `apps/web/components/forms/TimePicker.tsx` (Next pages) is the separate job `fix/arabic-time-spinner`; no file shared.

## Checks on the merged tip 2c6c8937 (= the code of the tip; later commits add only `.planning`)

| Check | Result |
|---|---|
| unit tests (`pnpm test:unit`), after `pnpm install --frozen-lockfile` on the merged lockfile | web 387 files / 4186 passed, 31 skipped; emails 239; db 14 — exit 0 |
| real-database test `apps/web/lib/checkout/account-details-window.local.test.ts` (own stack `vamos-taxi-bpp`, ports 649xx, after `db reset` on the merged migrations incl. 20261007200000 and 20261007210000) | 4/4 on 2c6c8937: >24 h → auto_full + Cancel; <24 h → pending_ops + Cancel; cancelled → no Cancel; another customer's e-mail → 404 |
| pgTAP from empty (own stack, `db reset` then `test db`, on 2c6c8937) | 98 files, 2648 tests, PASS |
| typecheck | exit 0 |
| lint | exit 0 (warnings only, none in a file of this job) |
| lint:css | exit 0 |
| i18n:check, check:legal-claims, check:numbers, check:db-fences, db:seed:check, check:public-env | exit 0 each |
| build (`pnpm build`) | exit 0 |
| Chromium click-through on the local Worker build of 918a96af (what came after changes only a log line, two untranslated-span attributes, a comment and CI files) (`wrangler dev --local`, port 4777, `/api/**` answered in the browser; `tools/worker-proof.mjs`) | 190 pass, 6 "fail" = the coverage line below. Signed-in page en/ar: real badge, both tiles, cancel POSTs `/api/account/bookings/paid-cancel` with the booking, refunded line names the country in the language. Both pages at 1440/1024/768/390 × en/de/fr/ar: date pill in the language, no sideways scroll on the booking view and the change view, change-view picker hour left of minute, booked-for/new-pickup labelled, time change POSTs `2026-10-06T09:15` on the right route, toast and change-requested row labelled; de → fr live switch relabels. Arabic voucher 0/1/2/5/10/11/12/16 bags; refund line en/de/fr/ar; home picker ar/en 1440/390. (`evidence/worker-a`, `evidence/worker-b` (worker-proof.json)) |
| `VamosLocale.coverage` (de/fr/ar) on both pages, booking and change views | main: `Tue 6 Oct · 08:15`, `Zurich Airport`, `Zermatt`, `Tue 6 Oct`. Branch: `Zurich Airport`, `Zermatt` (the customer's own addresses, data) and `Tue 6 Oct` (the date inside the design-system RouteSummary meta row; it cannot carry `data-vt-no-i18n`, and the page now writes it in each language itself — German render reads Di. 6. Okt.). Nothing new. (`evidence/coverage-compare.json`) |
| Fresh Opus review (`REVIEW.md`) | **SAFE WITH WARNINGS**, no blocker. W3 fixed in `cdf86f26` (a failed window read is logged; picker day/month names marked untranslated; comment corrected). W1, W2 are older than this job — list below. |
| Live, read-only (Supabase MCP, 2026-10-03) | `has_function_privilege('vamos_system','public.compute_cancellation_refund(uuid)','execute')` = true; `authenticated` reads `bookings.id` and `bookings.status` = true. The new read works on live grants as they are. |

Logs: `evidence/gates/`. Pictures: `tools/shoot.mjs` + `tools/compose.mjs` (before = git-archive of 3978fda9 synced; after = this tree).

## NOT verified

- Nothing on live: no deploy, no live read. The details route's `asSystem` call was proven on a local stack only;
  on live, `compute_cancellation_refund` EXECUTE for `vamos_system` comes from the same migrations.
- The click-through ran with `/api/**` answered in the browser (no database behind the Worker); the route itself was
  proven by the local real-database test, not by a browser against a database.
- A real signed-in customer cancelling a real paid booking (Stripe sandbox refund) after this change.
- French at 1440 for the change view pictures (checked by the click-through, no picture on a sheet); iPhone Safari.
- GitHub Actions (blocked by billing per the board).

## Found, not fixed here (for the controller's list)

1. Arabic "Up to N bags" (class cards) reads حقائب for 2 and for 11+; "2 passengers" is not the dual (راكبان).
2. The signed-in booking page does not show the driver or the payment method; the details answer already carries both (manage-booking shows them).
3. The account list's own date stub (`/bookings`, `apps/web/lib/account/bookings.ts` en-GB) is not part of this job.
4. The "Call dispatch / Cancel instead" card is still unreachable (`bookingTiming` 'late' never set) — on the board already.
5. (Review W1, money copy, older than this job on the e-mail page) The cancel screen's "full refund" promise uses the
   window read when the page loaded; a customer who waits past the 24 h line before pressing Confirm gets the owner's
   review, not the promised full refund. Fix: re-read the window when the cancel screen opens, or send the window
   shown and have the server refuse (409) when it changed.
6. (Review W2, older than this job) The e-mail page's window counts elapsed hours (`manage/booking/route.ts`
   `hoursBefore`), the cancel counts Zurich wall-clock hours; they differ by one hour around the clock change
   (e.g. pickup Sun 25 Oct 2026 10:00, link opened Sat 10:30). Fix: read the window from
   `compute_cancellation_refund` there too, as the signed-in page now does.
7. (Review note) The signed-in refund line always names Switzerland: the account path has no payout country.

## Owner UAT (numbered; on vamostaxi.site after the ship)

1. Sign in on vamostaxi.site with an account that has a paid booking, open My bookings → the booking. Expected: the
   badge reads Confirmed (or Driver assigned), not "Awaiting payment"; two tiles: Change this booking and Cancel this transfer.
2. Press Cancel booking. Expected: the cancel screen; more than 24 h before pickup it says you get a full refund. Press
   Keep my booking (do not cancel a real trip).
3. Switch the language to Deutsch on the same page. Expected: the date pill reads like "Di. 6. Okt. · 08:15" and changes
   without a reload; Français: "mar. 6 oct."; العربية: "الثلاثاء، 6 أكتوبر" with 08:15 on the left.
4. In العربية, press Make a change → open the date and time picker. Expected: the time reads hour : minute left to right
   (e.g. 09 : 30); the footer summary is not cut on a phone.
5. On the home page in العربية, open the time picker. Expected: hour : minute left to right.
6. Open a booking with 2 bags in العربية → View voucher. Expected: Bags حقيبتان. With 12 bags: 12 حقيبةً.
7. Open a refunded booking's link in Deutsch. Expected: "Erstattet auf Ihre Karte in Schweiz." (not "Switzerland").
