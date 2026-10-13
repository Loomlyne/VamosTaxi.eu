# Phase 31: Refunds in Stripe — context

Discuss signed by Koss in the question form on 2026-10-12 (~18:00 +04). Source of truth:
`.planning/decisions/2026-10-12-refunds-in-stripe.md`. This file restates it, maps the code, answers the
technical points with a recommendation each, and lists the few owner choices left. Controller add-on the same
evening (owner: "run that"): a nightly read-only refund check (D-09).

## Decisions (signed, do not re-ask)

- **D-01** Dashboard booking detail keeps REFUND. It opens that booking's payment in the Stripe Dashboard in a
  new tab. The site never sends a refund from the dashboard again. The refund-decision box goes.
- **D-02** The site keeps recording what Stripe did (existing webhook), so the booking, the dashboard money
  totals and the customer's account show refunded amounts.
- **D-03** Duplicate charge stays automatic: the second charge on one booking is refunded at once and he gets
  the mail. `settle.ts` duplicate branch unchanged.
- **D-04** Customer cancel of a paid trip: one policy line, no amount, never the word Stripe. en/de/fr/ar
  drafted in `31-UI-SPEC.md` for his signature.
- **D-05** Single-leg refund work is parked (`archive/fix-single-leg-refund-a46ac2ca`), not in this phase.
  Migration number not taken here: Phase 30 owns 20261012200000 onward; the controller asks the owner (2026-10-13).

## Recommendations on the open technical points

- **D-06 Which Stripe page.** The PaymentIntent page: `https://dashboard.stripe.com/{acct}/payments/{pi_…}`
  live, `https://dashboard.stripe.com/{acct}/test/payments/{pi_…}` test. It shows the charge, earlier refunds
  and Stripe's own Refund button, so it is the page he acts on (Charge is the same view one level down;
  Customer is a list, one click further).
  - Mode comes from the Worker's secret key via `stripeSecretKeyMode` (`apps/web/lib/checkout/stripe-mode.ts:25`),
    never from the browser. Built on the server only.
  - `{acct}` comes from a new plain (non-secret) wrangler var `STRIPE_ACCOUNT_ID` per env (staging: the test
    account `acct_1UIZmqHcNp9GZYjz`). Unset: the path omits it and Stripe opens the account he is signed into.
    The dashboard is staff-only, so the id never reaches a public page.
  - New admin-only `GET /api/staff/bookings/[id]/stripe-payments` returns every succeeded `booking_payments`
    row with a `pi_` id: kind (trip / extras), charged CHF, captured time, URL. Both mounts (`app/api` and
    `app/[locale]/(ops)/api`) like the other staff routes.
  - One payment: REFUND opens it straight away. Several (extras, class change): REFUND shows a short "Which
    payment?" list, one OPEN IN STRIPE per payment, newest first. Live today (read 2026-10-12): 2 bookings with
    payment rows, one payment each.
  - Popup blockers: the links are fetched when the detail opens (admin only), so the click opens the tab
    synchronously (`window.open(url, '_blank', 'noopener')` or a real `<a target="_blank" rel="noopener">`).
  - Test bookings made under the test key would open the live path after the live-key flip; they are deleted by
    his script before go-live (D-37), so no per-payment mode column is added.
- **D-07 `refund_owed_rappen` and the refund queue.** Keep the column and the SQL as they are; no migration in
  this phase. It still carries the cheaper class or trip change difference that the owner-approved customer
  lines show (`app/vamos-manage-ticket.js:280,284`, decisions 2026-10-01). For a cancel it is no longer shown
  to the customer. `refund_status` keeps flipping to `refunded` from the webhook. The "Refund due" red alert
  becomes a neutral "Refund to check" note (see Q2). The site-side refund functions (`ops_refund_plan`,
  `ops_refund_decide`, `ops_refund_intent_sent/failed`, `ops_refund_record`) lose their only callers; a drop
  migration is a later clean-up after a week live, not this phase (avoids a live money migration and keeps
  `database.types.ts` out of Phase 30's way). Live today: 1 booking `pending_ops`, 1 `refunded`.
- **D-08 Customer emails.** `CancellationEmail` refund line becomes the policy line (all four languages,
  `packages/emails/src/messages/*.json:91-94`). The "Refund issued" mail (`packages/emails/src/refund.ts`, sent
  only from the staff refund POST) loses its sender; whether a customer mail follows a Stripe refund is Q1.
  Ops mails: `RefundFailedEmail` keeps its job (webhook `refund.failed`), copy points to Stripe;
  `OpsMustFixEmail` "send the refund again" becomes "refund it in Stripe". The paid-after-cancel /
  duplicate alert stays.
- **D-09 Nightly refund check (planned, built with the rest at /gsd-plan-phase; not on the signing sheets).**
  - Schedule: the existing `0 3 * * *` cron branch in `apps/web/worker.ts:123` (03:00 UTC), own try/catch,
    logs counts only, no PII.
  - Reads Stripe `GET /v1/refunds` created in the last 48 h (paged, capped at 500) with the Worker key. Never a
    POST, never a write to money tables. Refunds younger than 30 minutes are skipped (webhook may be in flight).
  - Compares each Stripe refund with the site: `booking_refunds.stripe_refund_id` (and the duplicate-refund
    record), matched through `payment_intent` → `booking_payments` → booking. Findings: (a) missing on the
    booking, (b) amount differs, (c) Stripe status differs (failed or cancelled in Stripe, refunded on the
    site), (d) the payment belongs to no booking. Also: the booking's `refunded_rappen` differs from its
    refund rows.
  - Reads the database through one read-only path (a `SECURITY DEFINER` reader or an `asSystem` SELECT; the
    planner picks the existing pattern). No writes.
  - Mail through the ops alert path (`apps/web/lib/ops/must-fix-mail.ts`, new `deliverRefundCheckAlert`) to
    info@, English only (internal), only when something is found. If Stripe does not answer, one short
    "could not run" mail. A finding repeats each night while it is inside the 48 h window.
  - Email text (English, internal):

    > Subject: Refund check: {n} Stripe refund(s) do not match a booking
    >
    > Tonight's check compared the refunds Stripe made in the last 48 hours with the bookings on vamostaxi.site.
    > Nothing was changed.
    >
    > Missing on the booking (Stripe refunded, the booking shows nothing):
    > - {VT-26-0000} · CHF {0.00} · refund {re_…} · {12 Oct 2026 14:05}
    >
    > Amounts differ:
    > - {VT-26-0000} · Stripe CHF {0.00} · booking CHF {0.00} · refund {re_…}
    >
    > Status differs:
    > - {VT-26-0000} · Stripe {failed} · booking {refunded} · refund {re_…}
    >
    > Not linked to any booking:
    > - refund {re_…} · CHF {0.00} · payment {pi_…}
    >
    > Open the payment in Stripe and the booking on your dashboard to see what happened. A refund missing on a
    > booking usually means a webhook delivery failed: in Stripe, Developers › Webhooks shows failed deliveries
    > and can resend them.

    Could-not-run mail: "Subject: Refund check did not run" / "Stripe did not answer tonight's refund check, so
    nothing was compared. It runs again tomorrow at the same time."
  - Jev: none fits (exact money match, no probability). This check is the phase's automation agent.

## Code map (Explore, 2026-10-12; paths from the repo root)

KEEP = unchanged · REMOVE = goes · CHANGE = edited.

**Site-sent refunds**
- `apps/web/lib/ops/refund.ts:354` `refundBooking` (Stripe `createRefund` l.439, `ops_refund_intent_sent` l.480) — REMOVE
- `apps/web/lib/ops/refund.ts:552` `decideRefund` — REMOVE
- `apps/web/lib/ops/refund.ts:210` `loadRefundPicker` — CHANGE into the payment list for D-06 (no amounts left/owed)
- `apps/web/lib/ops/refund.ts:111` `readRefundState` — CHANGE: refunded totals only
- `apps/web/lib/ops/refund-map.ts:122-235` refund/decision parsers — REMOVE (`stripeFeeRappen` l.111 KEEP if used elsewhere)
- `app/[locale]/(ops)/api/staff/bookings/[id]/refund/route.ts` (POST l.54 sends + "Refund issued" mail l.66-81; GET l.102) — REMOVE; re-export `apps/web/app/api/staff/bookings/[id]/refund/route.ts` — REMOVE
- `.../refund-decision/route.ts` both mounts — REMOVE
- NEW `.../bookings/[id]/stripe-payments/route.ts` both mounts + URL builder next to `stripe-mode.ts` — ADD

**SQL** (`packages/db/supabase/migrations/`) — no migration this phase (D-07)
- `ops_refund_plan` (`20261012160000_refund_ledger_mirroring.sql:205`), `ops_refund_decide` (`20260928150000_refund_review_tiers.sql:457`), `ops_refund_intent_sent` (`20261007280000_refund_lock_order.sql:343`), `ops_refund_intent_failed` (`20261005140000_refunds_by_hand.sql:1001`), `ops_refund_record` — KEEP in DB, no caller; drop later
- `booking_refunds`, `booking_refund_reversals`, `booking_refund_intents` (history) — KEEP
- `bookings.refund_owed_rappen`, `refund_status`, `refunded_rappen` — KEEP (D-07)
- `compute_cancellation_refund` (`20261012190000_duplicate_out_of_cancel_basis.sql:18`), `manage_booking_cancel` (`20261012160000…:1088`) — KEEP; the amount stops at the API (below)
- `stripe_charge_refunded_record` (`…ledger_mirroring.sql:698`), `stripe_refund_failed_record` (`:523`), `checkout_duplicate_refund_record` (`20260928100000…:698`) — KEEP

**Duplicate charge (D-03)** — `apps/web/lib/checkout/settle.ts:593-665, 910-921` — KEEP. Note: `PAID_AFTER_CANCEL_REASONS` (l.294) also refunds a payment that lands after a cancel; that is the same automatic path and stays.

**Webhook (D-02)** — `apps/web/lib/checkout/money-events.ts:136-143, 208, 316`; `settle.ts:946` `recordChargeRefund` — KEEP

**Customer cancel (D-04)**
- `apps/web/lib/lifecycle/paid-cancel.ts:187-196` returns `refundLine` + `refundRappen` — CHANGE: policy line, no amount
- `apps/web/app/api/account/bookings/paid-cancel/route.ts:58`, `apps/web/app/api/manage/cancel/route.ts:62` — CHANGE: drop amount fields
- `apps/web/app/api/manage/booking/route.ts:172-201`, `apps/web/app/api/account/bookings/details/route.ts:59-82` — CHANGE: no owed amount for a cancel; refunded amount KEEP
- `app/pages/booking-detail.dc.html:489,492,542,548-549` and `app/pages/manage-booking.dc.html:499,502,552,558-559` — CHANGE (two lines each become one policy line)
- `app/vamos-manage-ticket.js:269` "Full refund · sent by our team" / "Refund under review" — CHANGE (one policy line); `:280,284` class/trip difference lines — KEEP (owner-approved 2026-10-01, not a cancel)
- `apps/web/i18n/messages/*.json:573-575` (cancelSheetFull, cancelSheetOps, refundPendingOps) — CHANGE; `refundedToCard` KEEP
- `app/pages/cancellation.dc.html` and the policy tiers (`en.json:1304,1643`) — KEEP: they are the signed policy the new line points to
- `packages/emails/src/CancellationEmail.tsx:24-54` + `messages/*.json:91-94` — CHANGE (D-08)

**Dashboard (`app/ops/OpsDetail.dc.html`)**
- l.440-505 refund form (picker, percent/CHF input, confirm, decline), l.570-590 decline/reject modals, l.1467 GET refund, l.1701-1788 `refundBody`/`postRefund`/`postDecision`, l.1725 `errByCode` — REMOVE
- l.488-495 post-trip request (accept/reject) — REMOVE; REFUND covers it
- l.1832 REFUND menu item, l.2332 `markRefund`, l.2357-2360 `goRefund` — CHANGE: "Refund in Stripe", shown to admin on any booking with a succeeded payment
- l.428 `showRefundDue` red Alert, copy l.838 — CHANGE to "Refund to check" (Q2)
- l.496-503 refund failed Alert + TRY AGAIN — CHANGE: OPEN IN STRIPE
- l.431 Refunded success Alert, l.656/742-765 refund events, l.434 dispute Alert — KEEP
- copy l.901-967 class/trip change "Press Confirm refund to send it" — CHANGE to "Refund it in Stripe"
- `app/ops/OpsDash.dc.html:274-322` money totals from recorded refunds — KEEP

**Emails** — `packages/emails/src/refund.ts`, `lib/send.ts:365-422 sendRefund` — REMOVE unless Q1 = A (then reused from the webhook); `RefundFailedEmail` / `OpsMustFixEmail.tsx:78-100` — CHANGE copy

**Tests to change** — unit: `lib/ops/refund.test.ts`, `refund-by-hand*.test.ts`, `ops-refund-review-dc.test.ts`, `payment-changed.test.ts`, `lib/lifecycle/paid-cancel.test.ts`, `staff-cancel-by-hand.test.ts`, `tests/unit/account-booking-details-refund.test.ts`, `manage-ticket-account-refund.test.ts`, `packages/emails/src/refund.test.ts`, `OpsMustFixEmail.test.tsx`; settle duplicate tests KEEP. pgTAP: none change (no migration). e2e: `tests/e2e-worker/p6-browser.e2e.mjs:274-281,482-505`, `tests/integration/manage-booking-money-driver-260929.spec.ts:49-57`.

Not checked by the map (planner reads): webhook route body, `manage_money_for` body, `record_booking_refund` callers, `docs/runbook/refunds.md`.

## Owner signatures (question form, 2026-10-12 ~19:05 +04, via the controller)

- **S-01** Sheets 1, 2 and 3 (`screens/`) signed as drawn.
- **S-02** Customer wording signed as written, en/de/fr/ar: cancel sheet line, Refund row, cancellation email line (`31-UI-SPEC.md` Copywriting Contract).
- **S-03** Q1 = A. When he refunds in Stripe, the customer gets a Vamos email in their language with the amount Stripe sent back. New customer copy (subject + body, en/de/fr/ar, Swiss German "ss") is drafted in the plan for his signature; not signed yet. The amount comes from the Stripe refund event; never computed or invented.
- **S-04** Q2 = A. "Refund to check" shows until Stripe records a refund or the pickup time has passed. No NO REFUND button.
- **S-05** No next-step line for "This booking has no Stripe payment to open." (ui-checker suggestion left out).

## Open questions as asked (answered above)

- **Q1 — When you refund in Stripe, does the customer get an email from Vamos?**
  - A (recommended) Yes: when Stripe reports the refund, the site emails the customer in their language with
    the amount Stripe sent back. Example: you refund CHF 40 on VT-26-0753; Nadia gets "CHF 40.00 is on its way
    back to the card you paid with" in German, from info@vamostaxi.site.
  - B Stripe's own refund receipt (switched on in Stripe settings; Stripe's look, its languages).
  - C No email; the customer sees it on their booking page and bank statement.
- **Q2 — After a paid trip is cancelled, how long does the booking show "Refund to check" on your dashboard?**
  - A (recommended) Until Stripe records a refund, or until the pickup time has passed. Example: a late cancel
    you decide not to refund stops showing the note after its pickup time; no button to press.
  - B Until Stripe records a refund, plus a NO REFUND button to clear it by hand.
  - C No note; you work from Stripe alone.

## Phase 30 overlap

Phase 30 (`phase-30-vehicle-class-lifecycle`, `origin` at `3245594c`) plans `app/vamos-i18n-dict.js`
(30-02), migrations `20261012200000/210000` + `database.types.ts` (30-01), and its prototype touches `OpsDash`,
`OpsFleet`, `OpsPricing`, `OpsSidebar`, `OpsSoon`, `OpsTable`, `ops.dc.html`, `vamos-ops-data.js`.
Phase 31 shares only `app/vamos-i18n-dict.js` (new keys, different places) and the planning files
(`ROADMAP.md`, `STATE.md`). No code dependency: Phase 31 depends on nothing in Phase 30; whichever lands second
merges `origin/main` and resolves the dictionary by keeping both sets of keys.

## Planning inputs (2026-10-12 evening, after 31-RESEARCH.md; controller-relayed signatures above)

**Corrections to the sections above**
- **C-01 (D-06)** The live site (Worker `vamos`, wrangler `env.staging`) runs the **live** Stripe key: `pk_live_51UIZmAQbJiSLxJfu…` (`apps/web/wrangler.jsonc:75`). `env.staging.vars.STRIPE_ACCOUNT_ID` is therefore the live account, `acct_1UIZmAQbJiSLxJfu` (read from the live publishable key; the controller confirms it in the Stripe Dashboard before ship). The sandbox account `acct_1UIZmqHcNp9GZYjz` goes only in `.dev.vars.example` for the lab. `env.production` stays unset. Unset or malformed → link without the account segment (regex-checked), never passed through.
- **C-02 (D-07)** The nightly check needs one migration after all: the cron role `vamos_system` has no SELECT on `bookings`, `booking_payments`, `booking_refunds`, and no existing definer reads a refund by Stripe id (31-RESEARCH "Migrations wanted"). Number not reserved: the controller asks the owner. No migration file is written until then.
- **C-03 (Phase 30 overlap)** Phase 30 (`origin/phase-30-vehicle-class-lifecycle` at `63fbc003`) also edits `app/ops/OpsDetail.dc.html` (assign area and its T-table keys, +46 lines) and shared DC tests (`ops-dc-p4.test.ts`, `ops-dc-editor-foot.test.ts`), plus `database.types.ts` in 30-01. Phase 31 touches the refund area of the same file: different regions, conflicts are in the T-table key lines only. Whichever lands second merges `origin/main` and keeps both.
- **C-04** Live `booking_notifications_kind_check` (read 2026-10-12): `confirmation, reminder_24h, assignment, cancellation, refund, review_request, manage_link_resend`, same as the files. `refund` is allowed. Outside this phase: `apps/web/lib/lifecycle/notify-lifecycle.ts:42-50` claims `refund_failed`, `assignment_customer`, `time_change`, `flight_no`, which that check refuses (23514). Reported to the controller, not fixed here.

**Defaults taken (code choices, recorded so the planner does not re-ask)**
- **D-10 Customer refund mail, exactly once (S-03):** mail only when `stripe_charge_refunded_record` returns `'recorded'` (never for app-made refunds: duplicate charge, paid after cancel), claimed through a new definer `notification_claim_refund(booking, stripe_refund_id, …)` writing `booking_notifications` kind `'refund'` with dedupe `booking:refund:<re_id>`, sent and retried by the existing notification send/settle/sweep path. Rides in the same migration file as the reader (one apply). Resend idempotency key `refund-mail:<re_id>` as a second guard. A send failure never changes the webhook answer.
- **D-11 Amount** in the customer mail = that Stripe refund's `amount` from the event (rappen, CHF only), never computed and never the booking total.
- **D-12 Nightly mail** (internal, English, to info@) lists references, CHF amounts and Stripe ids; never names or e-mails; logs carry counts only. Excludes in-flight refunds (pending/requires_action), `booking_missing` app refunds, refunds on `duplicate` payment rows from the booking-total test, reversed refunds; "truncated" when the 500 cap is hit.
- **D-13** No `is_test` filter on the customer mail (the pre-ship real payment should show it).
- **D-14** Staff route `GET /api/staff/bookings/[id]/stripe-payments`: `withAdmin`, both mounts, `asStaff` reads, payments `status='succeeded'` with a `pi_` id, newest first, `leftRappen` = charged − non-reversed refunds; list hides fully refunded payments, and when all are fully refunded REFUND opens the newest (UI-SPEC).

**Customer refund mail, DRAFT for the owner's signature (not signed; S-03).** Placeholders: `{name}` contact name, `{amount}` e.g. `CHF 40.00` (from the Stripe refund event, isolated LTR in Arabic), `{reference}` e.g. `VT-26-0753` (isolated LTR in Arabic).

| | Subject | Body |
|---|---|---|
| en | Your refund for {reference} | Hello {name}, / We have sent {amount} back to the payment method you used for {reference}. Your bank may take a few days to show it. / Questions? Write to us at info@vamostaxi.site. |
| de | Ihre Rückerstattung für {reference} | Guten Tag {name} / Wir haben {amount} an das Zahlungsmittel zurückerstattet, mit dem Sie {reference} bezahlt haben. Ihre Bank braucht vielleicht ein paar Tage, bis die Rückerstattung sichtbar ist. / Fragen? Schreiben Sie uns an info@vamostaxi.site. |
| fr | Votre remboursement pour {reference} | Bonjour {name}, / Nous avons remboursé {amount} sur le moyen de paiement utilisé pour {reference}. Votre banque peut mettre quelques jours à l’afficher. / Une question ? Écrivez-nous à info@vamostaxi.site. |
| ar | استرداد مبلغ حجزك {reference} | مرحبًا {name}، / أعدنا {amount} إلى وسيلة الدفع التي استخدمتها في الحجز {reference}. قد يحتاج مصرفك بضعة أيام لإظهاره. / لديك سؤال؟ راسلنا على info@vamostaxi.site. |

**Owner question still open (O-1), recommended first.** Two customer lines under "Cancel this transfer" still talk about a refund amount: "See the refund you are due before anything is confirmed." and "See what comes back at this notice before you decide." (`booking-detail.dc.html:1158-1160`, `manage-booking.dc.html:1187-1189`).
- A (recommended): one line for both: "Read the cancellation policy before anything is confirmed." / de "Lesen Sie die Stornierungsbedingungen, bevor etwas bestätigt wird." / fr "Consultez la politique d’annulation avant toute confirmation." / ar "اطّلع على سياسة الإلغاء قبل تأكيد أي شيء."
- B: keep both lines as they are.
Until he answers, the plan keeps the lines unchanged and carries A as a gated task.
