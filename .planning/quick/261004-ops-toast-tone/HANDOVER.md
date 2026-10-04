# Hand-over: the dashboard toast says error with a red warning sign; the distance chip has its icon

Job session, 2026-10-04 (started 18:39 +04). Owner, 18:35 +04 in the controller's chat: "do the toast icon job too in parallel". Decision file: `.planning/decisions/2026-10-04-ops-toast-tone-and-route-icon.md` (on `origin/main` since `6c240d4b`).

- Branch: `fix/ops-toast-tone`, cut from `origin/main` `5c9b6fcc`. `origin/main` was re-read at the end: `6c240d4b` (a planning note only), merged in (`868efd5d`).
- Commits: `2d29ffed` (the icon, separate as asked), `5c12b9b5` (the toast), `868efd5d` (merge of `origin/main`), then the commit that adds this folder (pictures, picture tools, this file). The tip is the commit on top of `868efd5d`.
- No SQL, no migration, no database file, no `worker.ts`, no `lib/dc-mock-urls*`. No `main` write, no deploy, no connector call, no Docker. Nothing downloaded: the icon came from the controller's file.

## What changed

### 1. The toast has two tones (`app/ops/OpsDetail.dc.html`)

The booking page's toast was `tone="success"` for every notice: a green check next to "Could not apply edit", "Could not cancel", the class-change price-changed refusal and so on. Now:

- `notify(msg)` = success (as before). `notifyError(msg)` = error. State `toastTone` (the name the customer pages already use).
- The Toast element reads `tone="{{ toastTone }}"` and `role="{{ toastRole }}"`.
- Success looks exactly as today (green `circle-check`, `role="status"`).
- Error: the same charcoal toast, `triangle-alert` in `--vt-danger`, `role="alert"`.

**Component used: the design system's own `Toast`.** It already has `tone="danger"` (glyph `triangle-alert`, colour `var(--vt-danger)`, background `var(--vt-charcoal-900)`), the same sign and colour as the refund error box. Nothing hand-built, no new colour, no tinted background, no glow. The component sets `role="status"` before spreading the page's props, so the page passes `role="alert"` for errors and the component keeps its own default for success.

Contrast of the icon on the charcoal toast (measured in the page, sRGB pixel of the computed colour):

| Tone | Icon colour | On | Ratio |
|---|---|---|---|
| Error | `--vt-danger` oklch(0.56 0.19 27) = rgb(204,52,48) | rgb(30,31,31) | **3.23:1** |
| Success | `--vt-success` oklch(0.60 0.13 152) = rgb(53,150,88) | rgb(30,31,31) | **4.45:1** |

3:1 is the WCAG line for a graphic. The red clears it only just. It is the design-system token on the design-system toast, so I did not change it; the message text (white on charcoal) carries the meaning, the icon is aria-hidden.

Arabic: nothing to do. The icon sits on the reading-start side (the right) as before; checked: icon x greater than text x in `ar`, less in the other languages. Logical properties only (the component's own flex row).

No new label: the messages are the existing T-table sentences, so no new string in any language.

### 2. Call sites (65 in `OpsDetail.dc.html`: 53 `notifyError`, 11 `notify`, 1 that carries its own tone)

Rule: **error** = the action you pressed did not happen (refused, failed, no connection), or a step of it failed (an e-mail did not go out). **Success** = it happened.

| Where (function, answer) | Message | Tone |
|---|---|---|
| Class or trip change, `ok` + applied + confirmation sent | classDoneApplied / tripDoneApplied (+ driver note) | success |
| Class or trip change, `refund_due` | classDoneRefund / tripDoneRefund | success |
| Class or trip change, `extra_required` + link e-mailed | classDoneWaiting / tripDoneWaiting | success |
| Class or trip change, `extra_required`, e-mail did not go out | classDoneNoMail | **error (mixed: the change went through)** |
| Class or trip change, applied, confirmation e-mail did not go out | classDoneNoConfirm / tripDoneNoConfirm | **error (mixed: the change went through)** |
| Class or trip change, any refusal (price-changed, payment-changed, already-paid, book changed...) and the generic failure | classErrByCode / errClassFailed / errTripFailed | error |
| Class or trip change, no connection or the request failed | errClassFailed / errTripFailed | error |
| Confirm step blocked (too late, pick from the list, date, passengers, no class...) | `tripBlock` | error |
| Accept, `extra_required` | extraWaiting | success |
| Accept, `refund_due` | refundClick | success |
| Accept, must-fix / capacity, unpaid, already-paid, price-changed, payment-changed, any other | mustFix, unpaidNoEditBody, acceptPaid, acceptPriceChanged, errPaymentChanged, editFailed | error |
| Refuse request failed | refuseFailed | error |
| Withdraw a waiting change: done | withdrawDone | success |
| Withdraw: already-paid, nothing-waiting, test-only, Stripe failure, request failed | withdrawPaid, withdrawNothing, errTestOnly, withdrawStripe | error |
| Refund / refund decision, no connection (the answers with a code go to the red box under the form, not the toast) | refundFailed | error |
| Save edit (contact, note, flight): saved | savedFlight / savedInstant | success |
| Save edit: refused or no connection | editFailed | error |
| Assign a driver: done / assignment cleared | driverAssigned, unassignedOk | success |
| Unassign: frozen, failed | frozen, assignFailed | error |
| Voucher resend (menu and button): sent | voucherResent | success |
| Voucher resend: refused or no connection | voucherFailed | error |
| Pay link: sent | payLinkSent | success |
| Pay link: refused or no connection | payLinkFailed | error |
| Take card / extra payment page (Stripe tab): no link, no connection | cardFailed | error |
| Copy extra-payment link: copied | payLinkCopied | success |
| Copy extra-payment link: no link, clipboard refused | cardFailed | error |
| Cancel / remove: done | bookingCancelled / bookingRemoved | success |
| Cancel: frozen, refused | frozen, cancelFailed | error |
| Mark arrival, complete, no-show (menu and buttons): frozen, refused, no connection (success shows nothing) | frozen, arrivalFailed, editFailed | error |

Three calls are judgement calls the owner may want the other way, each one line to flip:
1. The three "change went through but the e-mail did not" messages (classDoneNoMail, classDoneNoConfirm, tripDoneNoConfirm) are errors: they tell the owner to do something by hand, and a green check on "did not go out" says the opposite.
2. `acceptPaid` and `withdrawPaid` ("the customer has already paid the difference...") are errors: the press did not do what was asked, as the refund box treats the same kind of code.
3. `tripBlock` (the confirm step is refused with a reason) is an error.

Other screens: `OpsPricing.dc.html` has the same Toast but only for success (publish done, route live); its errors show inline, so nothing changes there. The customer pages (`manage-booking`, `booking-detail`) already pass a `toastTone`.

## The distance chip (`assets/icons/route.svg`, commit `2d29ffed`)

The chip is `OpsDetail.dc.html` line ~178 (`Icon name="route"`). It showed no icon because `assets/icons/route.svg` did not exist (404). Now vendored: the controller's file, copied byte for byte (343 bytes, same Lucide geometry, format of the other icons). The owner's choice, question form, "Download Lucide route".

Where icons are registered: nowhere. There is no icon manifest, no `ext-resource-dependency` line in `OpsDetail.dc.html` (only `home.dc.html` has them), `assets/vendor/LICENSES.md` lists the three runtime libraries only (no icon is listed there, so I added nothing), and `assets/icons/_streamline-map.json` is an old Streamline hash map (66 entries; `route` and five other files were never in it). `scripts/sync-dc-mock-to-public.mjs` copies `assets/` whole, so `apps/web/public/assets/icons/route.svg` follows on sync (gitignored output, checked byte-equal). The Next app's own icons (`apps/web/public/brand/icons/`) are for React pages; the chip is on the dashboard, a DC page, so nothing is needed there.

New guard: `apps/web/tests/unit/dc-icons-vendored.test.ts` checks that every literal `Icon name="..."` in `app/**/*.dc.html` has a file in `assets/icons/`. Today: none missing. It fails with `app/ops/OpsDetail.dc.html: route` when the file is removed (mutation run).

## Files

| File | What |
|---|---|
| `app/ops/OpsDetail.dc.html` | `notify(msg, tone)`, `notifyError`, `toastTone` / `toastRole`, Toast bindings, 53 error call sites, class-change tone |
| `assets/icons/route.svg` | new, Lucide route |
| `apps/web/lib/ops/ops-toast-tone-dc.test.ts` | new, 49 tests |
| `apps/web/tests/unit/dc-icons-vendored.test.ts` | new, 2 tests |
| `apps/web/lib/ops/ops-accept-paid-dc.test.ts` (2 lines), `ops-p6-edit-dc.test.ts` (1), `payment-changed.test.ts` (1) | source pins now read `notifyError(` where the call is an error |
| `.planning/quick/261004-ops-toast-tone/{tools,screens}` | picture script, stub answers, 12 pictures |

## Pictures (`screens/`, bare crops, no frames)

From the real dashboard shell (`ops.html` with its base href and `vamosOpsAuth`, as `serveOpsDc` does), `/api/**` answered by stubs, a static server on a free port that the script closes. Amounts are CHF 1.00 fixtures.

| File | Shows |
|---|---|
| `toast-error-en-1440.png`, `toast-error-en-390.png`, `toast-error-ar-1440.png`, `toast-error-ar-390.png` | class change (Actions, Edit booking, Business, Continue, Confirm), the price moved (409 `price-changed`): the toast with the red warning sign |
| `toast-success-en-1440.png`, `toast-success-en-390.png`, `toast-success-ar-1440.png`, `toast-success-ar-390.png` | the same flow, applied: the toast with the green check |
| `chip-en-1440.png`, `chip-en-390.png`, `chip-ar-1440.png`, `chip-ar-390.png` | the two chips under the route (duration, distance): the distance chip now has the route icon |

Each toast picture is the toast's own box. The chip crop is the two chips with 6 px around them.

Run again: `node scripts/sync-dc-mock-to-public.mjs`, then `node .planning/quick/261004-ops-toast-tone/tools/shoot.mjs <out dir>`. It also runs German and French at 1440 for the text check, and one control run.

Picture-run checks (167 pass, 0 fail, last run on the merged tip): the toast shows the page's own T-table sentence for its language (so no untranslated string); role `alert` / `status`; icon `triangle-alert` / `circle-check` and its file answers 200; charcoal background without gradient; icon on the reading-start side; `dir` rtl in Arabic only; nothing scrolls sideways at 390; no page error, no console error, no failed request; the route icon file answers 200 (no 404 in the network log) and the icon paints pixels. Control run: with `route.svg` answering 404 the paint check reads 0 pixels, so the check can fail.

## Tests

- `ops-toast-tone-dc.test.ts`: source pins (Toast has bindings, the design-system Toast has `danger` and lets `role` through, no failure key through plain `notify`, no success key through `notifyError`, the three Stripe-tab calls, the tone in the change result) and the page logic run with a stubbed window (the technique of `ops-accept-paid-dc.test.ts`): class change (price-changed and payment-changed in four languages, generic failure, network failure, applied, refund due, extra payment with and without the mail, confirmation not sent, trip change, a later success replaces an earlier error), Accept (seven refusal codes, payment-changed in four languages, `extra_required`, `refund_due`), refund (no connection), ten one-press actions.
- Mutations, each run on `OpsDetail.dc.html` and reverted (file compared byte for byte afterwards): notify ignores the tone (34 fail), acceptPaid back to plain notify (3), Toast markup hard-coded success (1), mail-not-sent no longer error (2), role always status (32), refund failure back to plain notify (3), class-change refusal back to plain notify (13), confirmation-not-sent no longer error (2), a success turned error (1). Every one is caught.

## Checks (on the merged tip; this file and the pictures add only documents)

| Check | Result |
|---|---|
| `pnpm install --frozen-lockfile --offline` | pass (lockfile up to date, packages from the local store) |
| `node scripts/sync-dc-mock-to-public.mjs` | pass (20 pages, 19 app entries) |
| `pnpm run typecheck` | pass (db, emails, isolation-probe, web) |
| `pnpm run lint` | pass: 0 errors, 6 warnings (unused eslint-disable directives), none in a file this job touched |
| `pnpm run lint:css` | pass |
| `pnpm run i18n:check` | pass: 2709 keys (no key added) |
| `pnpm run check:numbers` | pass |
| `pnpm run check:public-env` | pass |
| `pnpm run check:db-fences` | pass: 8/8, 1192 files |
| vitest `lib/ops` (every ops DC test, `ops-detail-i18n`, `customers-board`) + `tests/unit/dc-icons-vendored.test.ts` | pass: 121 files, 1343 tests; 11 files and 17 tests skipped (local-database files) |
| vitest the other tests that read the dashboard pages or the icons (`ops-dashboard-host`, `ops-support-read-only`, `vendor-runtime-no-unpkg`, `no-photo-remove-link`, `public-no-internal-ids`, `dc-mock-urls`, `ops-assets*`, `phase-26-3/4-laws`, `dashboard-new-trip-origin`, `mock-mounts`, `contact-button`) | pass; in one combined run two ops files (`edit-request-customer`, `staff-cancel-by-hand`) timed out at 5 s under load, and pass in 2.7 s on their own (11 tests) |
| Mutations on the toast code | 9 of 9 caught (above); icon test: file removed -> 2 of 2 fail, restored |

`customers-board.test.ts` compares `apps/web/public/app/ops/OpsDetail.dc.html` with the source: it fails until the sync has run. Run the sync first, as always.

## NOT verified

- No Worker build, no deploy, no real HTTP call. The tones come from the page logic run with a stubbed window and a stubbed browser; the statuses are the ones the routes already return.
- No real screen reader. `role="alert"` is set on the toast, which is inserted when shown. Announcement of a freshly inserted `alert` is the usual behaviour but was not heard.
- Accept and refund are proved by unit tests, not pictured. The pictured error is the class change; the pictured success is the class change. German and French are text-checked only, not pictured.
- The toast closes by itself after 3.6 s for both tones, as before. An error that is long to read gets the same time; not changed.
- The close button's accessible name is the design system's hard-coded English "Dismiss" (it sits inside the `data-vt-no-i18n` box, so it is English in every language). Pre-existing, in the design-system `Toast`, not touched here.
- The Arabic distance chip reads "km 240" (the unit before the number): the string is `240 km` and the chip is not wrapped in `vt-dir-keep`. Pre-existing, visible in `chip-ar-*.png`, not touched here (the memory note on Arabic numbers applies).
- Full `test:unit` was not run, only the files above.
- The 3.23:1 contrast of the red icon is the design-system token on the design-system toast (see above).

## Ship order (controller)

1. Re-read `git log -3`, `origin/main` and the live Worker version, and say what moved. Re-read the controller line in `CLAUDE.local.md`.
2. Check the branch tip in a clean clone of `main`: merge, install from the lockfile, the checks above, the touched tests (run the sync before `customers-board`).
3. Worker only: `pnpm --filter web run deploy -- --env staging` (Worker `vamos`). No migration, no database step, nothing live to read back. Another job (the dashboard asset gate) edits `apps/web/worker.ts` and `lib/dc-mock-urls*`; this branch touches neither.
4. Live check: the served dashboard screen (`/app/ops/OpsDetail.dc.html`, behind the dashboard host's sign-in) carries `notifyError` and `toastRole`; `/assets/icons/route.svg` answers 200 on the dashboard host and on the public host (the dashboard asset gate covers `/app/ops/*` only, not `/assets/icons/*`, as read in `ops-assets.test.ts`). Then one real look at a booking with a distance: the chip shows the icon. An error toast cannot be provoked on purpose without a refusal; the unit and picture proof stands for it.
