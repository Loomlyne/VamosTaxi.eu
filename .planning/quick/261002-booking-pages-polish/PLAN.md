# 261002 Booking pages polish — plan

Job session, branch `fix/booking-pages-polish` cut from `origin/main` 3978fda9, worktree
`.claude/worktrees/booking-pages-polish`. Found by the P6 follow-ups job (its HANDOVER "For the controller's list" 5–9).
Opus plans and reviews, Sonnet builds. No migration. No live write. Port 54322 never used.

Parallel safety: the settle-safety job owns `apps/web/lib/checkout/settle.ts`, `apps/web/lib/checkout/paid-cancel.ts`,
`apps/web/lib/ops/edit-request*.ts`, `booking-change.ts` and migration 20261007200000. None of them is touched here.

## Files (exact list; nothing else changes)

| File | Items |
|---|---|
| `app/vamos-manage-ticket.js` | 1, 2, 4 |
| `app/pages/booking-detail.dc.html` | 1, 2, 4 |
| `app/pages/manage-booking.dc.html` | 1 (badge only), 2, 4 |
| `app/pages/WhenPicker.dc.html` | 2, 5 |
| `app/home/WhenPicker.dc.html` | 5 |
| `app/vamos-i18n-dict.js` | 3, 4 (new entries only; inserted above the entries that shadow them, nothing reordered) |
| `apps/web/app/api/account/bookings/details/route.ts` | 1 |
| `apps/web/lib/checkout/cancel-window.ts` | 1 (one new export) |
| `apps/web/app/api/manage/booking/route.ts` | 1 (uses that export; same rule) |
| tests: `apps/web/tests/unit/account-booking-details-refund.test.ts` (mock `asSystem` too) and one new `apps/web/lib/checkout/booking-pages-polish.test.ts` | all |

## Item 1 — a signed-in customer's paid booking reads paid and can be cancelled

Cause: `/api/account/bookings` sends `status: "booked"` for paid/confirmed/assigned; `fromAccount` passes it through; the
design-system `StatusBadge` has no `booked` key and falls back to `pending` = "Awaiting payment". `fromAccount` also
hard-codes `canCancel: false`, `cancelWindow: "none"`, `reviewSubmitted: false`.

1. `cancel-window.ts`: `export function customerCanCancel(status: string, reviewSubmitted: boolean): boolean` — false for
   `completed`, `no_show`, `cancelled`, `partially_cancelled`, `refunded`, or when reviewed. `manage/booking/route.ts` uses
   it instead of its local `HIDE_CANCEL` (adds `refunded`, which the server's cancel refuses anyway).
2. `details/route.ts`: the existing ownership read (reference AND signed-in e-mail, `asCustomer`) also returns `b.id`,
   `b.status::text` and `exists (reviews of b.id) as has_review`. Then, outside that transaction (postgres.js `begin()`
   rethrows caught errors), `asSystem` → `select refund_mode from public.compute_cancellation_refund(${id}::uuid)` — the
   same definer function the cancel itself uses (EXECUTE: vamos_system). A failed window read gives
   `cancelWindow: "none"` and `canCancel: false` (no Cancel rather than a wrong promise). Answer adds
   `status`, `canCancel`, `cancelWindow` (`auto_full` | `pending_ops` | `none`), `reviewSubmitted`.
3. `vamos-manage-ticket.js` `fromAccount`: list status → page status: `booked`→`confirmed`, `new`→`confirmed`,
   `awaiting_payment`/`unpaid`→`pending`, others as they are; `reviewSubmitted: row.reviewState === "reviewed"`.
   `loadAccount` copies `status`, `canCancel`, `cancelWindow`, `reviewSubmitted` from the details answer when it is ok.
4. Both pages, the card-header `StatusBadge`: pass a key the badge knows plus the page's own label —
   `paid`→key `confirmed` label "Paid"; `partially_cancelled`→`cancelled`; `partially_completed`→`completed`;
   `no_show`→`no-show`. Every label string exists in the dictionary in de/fr/ar.

## Item 2 — dates in the reader's language, re-labelled in place

Cause: `formatLocal` (both pages) and the account list format with `en-GB`; the label is stored in state, so it never
follows a language switch; the pages' `WhenPicker` gets no `locale`.

1. `vamos-manage-ticket.js`: `LOCALES = { en: 'en-GB', de: 'de-CH', fr: 'fr-CH', ar: 'ar-u-nu-latn' }` (the same map as
   `app/home/WhenPicker.dc.html` `loc()`), `lang()` from `VamosLocale.lang()`, and `dayLabel(isoOrLocal)` →
   `Intl.DateTimeFormat(LOCALES[lang], { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short' })` of the
   day at UTC noon, commas removed (as the home picker does). Examples for Tue 6 Oct 2026: `Tue 6 Oct`, `Di. 6. Okt.`,
   `mar. 6 oct.`, `الثلاثاء، 6 أكتوبر` (Latin digits). Exported.
2. Both pages: state keeps only the day (`mIso`, `YYYY-MM-DD`) and the time (`mTime`); every label is computed in
   `renderVals()` from the booked `scheduledLocal` / `mIso`, so `VamosLocale.onChange → forceUpdate` re-labels it.
   `applyTicket` no longer stores an English `dateLabel`/`countdown`; `setDay` ignores the picker's label;
   `diffList()` compares day+time values, not strings, and returns raw values; `requested` stores raw values and is
   labelled at render. The toast's "{original}" is labelled at the moment it is shown.
3. Markup, both pages — every date + time spot becomes date text, ` · `, then the time in
   `<span class="vt-dir-keep" data-vt-no-i18n="1">`: the countdown pill, the "call dispatch" figure, the voucher Date
   row, "Booked for", "New pickup", the requested/diff rows, the cancel sentence. The RouteSummary meta row uses the
   localised day (component prop, plain string).
4. `app/pages/WhenPicker.dc.html`: `loc()` uses the same four-locale map as the home copy; the pages pass
   `locale="{{ lang }}"` and the localised `value`; its trigger date/time spans get `data-vt-no-i18n` and the time
   `vt-dir-keep` (as the home copy already has).

## Item 3 — Arabic bag counts

Cause: the ops pattern `^(\d+) bags$` (dict ~line 53, ar `$1 حقيبة`) matches first for every count, so the correct
entries further down never run. Same 1 / 2 / 3–10 / 11–99 split as the traveller entries.

Inserted directly above line 53 (de/fr unchanged wording):
`^2 bags$` → `حقيبتان`; `^([3-9]|10) bags$` → `$1 حقائب`; `^(1[1-9]|[2-9]\d) bags$` → `$1 حقيبةً`.
("1 bag" is already a string key: `حقيبة واحدة`. 0 and 100+ keep `$1 حقيبة`.)
The home travellers summary ("N passengers · M bags", bags go to 16) gets the 2 and 11–99 bag forms for each
passenger form (1, 3–10/general, 11–99), each inserted above the entry that would catch it first.

## Item 4 — refund line country in the reader's language

`refundedCopy`: country from the ISO code (`payoutCountry`, `CH` by default) through
`Intl.DisplayNames([lang], { type: 'region' })` → Switzerland / Schweiz / Suisse / سويسرا; fallback `t(label)`, then
`t('Switzerland')` (new dictionary key). "Stripe pays out on {date}" uses `dayLabel`. After a cancel, both pages keep
`payoutCountry` from the cancel answer (the routes send the code; `payoutCountryLabel` never came back).

## Item 5 — time spinner keeps hour : minute left to right

Both `WhenPicker` copies: the hour / colon / minute row gets `class="vt-dir-keep"` (laws.css: `direction:ltr;
unicode-bidi:isolate` under `[dir=rtl]`). 04:30 reads `04 : 30` in Arabic, on home and on the change view.

## Checks

- Unit: details route (status, window from `compute_cancellation_refund`, failed window → no Cancel, ownership filter
  kept); `customerCanCancel`; ticket helper in a vm (fromAccount mapping, loadAccount copies, `dayLabel` in four
  languages, `refundedCopy` country in four languages); dictionary plural lookups through the real `vamos-locale.js`
  (2, 3, 10, 11, 12, 16 bags; summary combinations).
- `VamosLocale.coverage` empty on the touched views in de/fr/ar; no sideways scroll at 390; 1440/1024/768/390.
- Chromium click-through on the local Worker build (`node scripts/sync-dc-mock-to-public.mjs` first; `/api/**`
  answered in the browser, port 4777-range, no database): signed-in booking page badge + Cancel + confirm; dates in
  de/fr/ar on both pages and after a live language switch; time change request labels; Arabic spinner; Arabic bags.
- Gates: typecheck, lint, lint:css, i18n:check, check:legal-claims, check:numbers, check:public-env, check:db-fences,
  db:seed:check, test:unit, build. seed.sql not touched.
- Fresh Opus review of the sign-in route change (details route + `asSystem` read) before hand-over.

## Not in this job (found, listed in the hand-over)

"Up to N bags" in Arabic (class cards) uses `حقائب` for 2 and 11+; "2 passengers" is not the dual; the signed-in
booking page does not show the driver or payment method the details answer already carries; the account list's own
date stub.
