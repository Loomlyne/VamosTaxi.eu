# Hand-over: the dashboard says what `payment-changed` means

Job session, 2026-10-04 18:23 +04. Owner, 17:56 +04 in the controller's chat: "do the payment-changed message job too in parallel". Wording signed by the owner in the question form, 2026-10-04 18:08 +04 (`.planning/decisions/2026-10-04-payment-changed-message.md`, option "With reason").

- Branch: `fix/payment-changed-message`, cut from `origin/main` `7893df7a`, then fast-forwarded to `f9295639` (the decision file) before any commit. `origin/main` was re-read at 18:21: still `f9295639`, already in this branch, nothing to merge.
- Code commit: `34af9d3e`. Then `4e7d3310` (toast width, pictures, picture tools). This hand-over file is the commit on top.
- No SQL, no migration, no database file. `lib/checkout/settle*.ts` untouched. No `main` write, no deploy, no connector call, no Docker.

## What changed

Migration 20261007280000 (live since 17:53) makes nine functions raise `payment-changed` (SQLSTATE 40001) when a payment settled for the same booking in the same instant; nothing is written and pressing again is safe. The Worker answered the generic `unknown` (HTTP 400) and the dashboard said "Could not apply edit / refund / change ...". Now every dashboard path that calls those functions answers `{ ok:false, code:"payment-changed" }` with HTTP 409, and the dashboard shows the signed sentence.

One shared test, `isPaymentChanged(err)` in `refund-map.ts`: message `payment-changed` (same name rules as the other refusals) or SQLSTATE `40001`. In these calls 40001 comes only from this raise; a deadlock (40P01) stays `unknown`.

## Routes and statuses

Status chosen: **409**, the same as `price-changed` / `paid-changed` (the other "it moved, look again" refusals).

| Route (dual-mounted at `app/api/staff/...`) | Function it calls | Map | Answer |
|---|---|---|---|
| `POST /api/staff/bookings/:id/refund` (also the `retry` press) | `ops_refund_plan` | `mapRefundSqlError` + new `refundFailStatus` (moved out of the route so it can be tested) | 409 `payment-changed`; no intent, no Stripe call |
| `POST .../edit-accept` | `booking_edit_request_accept` | `mapEditSqlError` + `failStatus` | 409 |
| `POST .../edit-request` (`action: "accept"`) | `booking_edit_request_accept` | same | 409 |
| `POST .../change` (class change, `klass`) | `booking_staff_change` | `mapChangeSqlError` + `changeFailStatus` (already 409 for every named refusal) | 409 |
| `POST .../change` (trip change: places, time, party) | `booking_staff_trip_change` | same | 409 |

Same maps, no behaviour change in practice (the functions do not raise it): `.../change/withdraw` (`mapChangeSqlError`), `.../refund-decision` (`mapRefundSqlError`, its own `failStatus` gives 400 for a code it never gets), the customer time-change and flight routes (`mapEditSqlError`).

Nine functions, who maps them:
- `ops_refund_plan`, `booking_edit_request_accept`, `booking_staff_change`, `booking_staff_trip_change`: mapped as above.
- `ops_refund_intent_sent`: the Worker catches every error there and marks the part `unrecorded` (retry finds the refund at Stripe). Unchanged; `payment-changed` cannot happen there (an intent's payment never changes).
- `checkout_extra_payment_settle`: `settle.ts` retries 40001. Untouched.
- `ops_refund_record`, `record_booking_refund`, `booking_edit_refund_record`: no Worker caller.

## The sentence (signed English, translations made from it)

One key, `errPaymentChanged`, once in each of the four T tables of `app/ops/OpsDetail.dc.html`, next to `errClassPriceChanged`. Used in three places: the refund error box (`errByCode`), the class and trip change map (`classErrByCode`, shown as the toast), and the Accept notice (`acceptPending`, which also reloads the booking). To change a word, change the line in the table; nothing else holds the text.

- en (signed, word for word): This booking's payment was being recorded at the same time, so nothing was changed. Press the button again.
- de (Swiss, "ss"): Die Zahlung dieser Buchung wurde zur gleichen Zeit verbucht, daher wurde nichts geändert. Drücken Sie die Schaltfläche erneut.
- fr: Le paiement de cette réservation était en cours d’enregistrement au même moment, rien n’a donc été modifié. Appuyez à nouveau sur le bouton.
- ar: كانت دفعة هذا الحجز قيد التسجيل في الوقت نفسه، لذلك لم يتغيّر شيء. اضغط على الزر مرة أخرى.

Note: the signed English has a straight apostrophe (`booking's`), as in the decision file; the neighbouring English strings use `’`. I kept the signed bytes (the source line escapes it). One character to change if you want the typographic one.

## Files

| File | What |
|---|---|
| `apps/web/lib/ops/refund-map.ts` | `PAYMENT_CHANGED`, `isPaymentChanged`, mapping in `mapRefundSqlError`, `refundFailStatus` |
| `apps/web/lib/ops/edit-request-map.ts` | mapping in `mapEditSqlError`, 409 in `failStatus` |
| `apps/web/lib/ops/booking-change-map.ts` | `payment-changed` in `CHANGE_FAIL_CODES`, mapping in `mapChangeSqlError` |
| `apps/web/app/[locale]/(ops)/api/staff/bookings/[id]/refund/route.ts` | uses `refundFailStatus` (local `failStatus` removed) |
| `app/ops/OpsDetail.dc.html` | `errPaymentChanged` x4, the three places above, toast wrapper `width:max-content;max-width:calc(100vw - 32px)` |
| `apps/web/lib/ops/payment-changed.test.ts` | new, 32 tests |
| `apps/web/lib/ops/booking-change.test.ts`, `booking-trip-change.test.ts` | one case each: write raises 40001 -> `payment-changed` |
| `.planning/quick/261004-payment-changed-message/{tools,screens}` | picture script, stub answers, 8 pictures |

Toast wrapper, not asked for: the dashboard toast sits in a `position:fixed; left:50%` box, which shrinks to half the screen. With the signed sentence the 390 px toast was 9 lines. Now it uses the phone's width (4 lines). It applies to every toast on that screen, narrow widths only.

## Pictures (`screens/`, bare crops, no frames)

From the real dashboard shell (`ops.html`, base href and `vamosOpsAuth`, the way `serveOpsDc` does it), `/api/**` answered by stubs, the two POSTs answer 409 `payment-changed`. Amounts are CHF 1.00 fixtures.

| File | Shows |
|---|---|
| `refund-en-1440.png`, `refund-en-390.png`, `refund-ar-1440.png`, `refund-ar-390.png` | refund panel after Confirm refund: the red error box under the form |
| `change-en-1440.png`, `change-en-390.png`, `change-ar-1440.png`, `change-ar-390.png` | class change (Actions, Edit booking, Business, Continue, Confirm): the toast, the toast's own box only |

Run it again: `node scripts/sync-dc-mock-to-public.mjs`, then `node .planning/quick/261004-payment-changed-message/tools/shoot.mjs <out dir>`. It also runs German and French at 1440 for the text check, and prints each check.

## Checks (on `4e7d3310`; this file adds only a document)

| Check | Result |
|---|---|
| `pnpm install --frozen-lockfile` | pass |
| `node scripts/sync-dc-mock-to-public.mjs` | pass (20 pages, 19 app entries) |
| `pnpm run typecheck` | pass (emails, db, isolation-probe, web) |
| `pnpm run lint` | pass: 0 errors, 6 warnings (unused eslint-disable directives), all in files this job did not touch |
| `pnpm run lint:css` | pass |
| `pnpm run i18n:check` | pass: 2709 keys |
| `pnpm run check:numbers` | pass |
| `pnpm run check:public-env` | pass |
| `pnpm run check:db-fences` | pass: 8/8, 1190 files |
| `pnpm run db:seed:check` | pass: no drift. No message key was added (the sentence lives in the dashboard's T tables), so no seed regen and no pin change |
| vitest `lib/ops`, `lib/checkout/settle*`, `lib/lifecycle` (includes every ops DC test and `ops-detail-i18n`) | pass: 128 files, 1452 tests; 11 files and 17 tests skipped (local-database files) |
| Mutation: remove the mapping in the refund map / the edit-request map / the booking-change map | fails 2 / 2 / 3 tests; reverted |
| Mutation: remove the 409 in `failStatus` and `refundFailStatus` | fails 4 tests; reverted |
| Mutation: remove the three dashboard handlers | fails 14 tests; reverted |
| Pictures: sentence shown is the page's own `errPaymentChanged`; nothing scrolls sideways; `dir` is rtl in Arabic and not in the others; no page or console error; en, de, fr, ar at 1440, en and ar also at 390 | 48 of 48 pass |
| `VamosLocale.coverage` (English page) | the dashboard translates through its T tables, not the shared dictionary, so it lists every T-table sentence (15 on the refund screen, 12 on the edit screen), the new one among them like all neighbours. The real check is the text in de, fr, ar above |

One known 404 is excluded from the picture run, and is not this job's: `/assets/icons/route.svg` (the distance chip at `OpsDetail.dc.html` line 178) is not in `assets/icons/`, so the "240 km" chip shows no icon on the dashboard today.

## NOT verified

- No HTTP call through a real route: the statuses come from the map functions, which the routes import (source pins), not from a Worker run. No Worker build or deploy.
- No real payment settling in the same instant. `payment-changed` is simulated by a stubbed answer (pictures) and a raised 40001 (unit). The SQL side was proven in the lock-order job.
- Accept and trip change are not pictured. Both are proven by unit tests in four languages (Accept: page logic run with a stubbed window; trip change: the library). The class change toast and the refund box are pictured.
- German and French are text-checked only, not pictured.
- Full `test:unit` and the local-database test files were not run, only the directories above.
- The class change and Accept messages show in a toast whose tone is hard-coded `success` (green check), as every dashboard error does there today. Not changed here: it would change other screens' messages.

## Ship order (controller)

1. Re-read `git log -3`, `origin/main` and the live Worker version, and say what moved. Re-read the controller line in `CLAUDE.local.md`.
2. Check the branch tip in a clean clone of `main`: merge, install from the lockfile, the checks above, the touched tests.
3. Worker only: `pnpm --filter web run deploy -- --env staging` (Worker `vamos`). No migration, no database step, nothing live to read back.
4. Live check: the served dashboard screen carries the new key four times (`errPaymentChanged`). The line only shows to the owner when a refund, Accept or change meets a payment in the same second, so it cannot be provoked on purpose; the unit and picture proof stands for that.
