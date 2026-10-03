VERDICT: SAFE WITH WARNINGS

# 261002 Booking pages polish — fresh review

Reviewer: fresh Opus session (did not build this). Read-only: no code edit, no commit, no database, port 54322 untouched.
Scope: `git diff 3978fda9 3f073873` (five job commits). The merge 918a96af touches no file of this job
(`git diff --stat 3f073873 918a96af` on the job's paths shows only `app/ops/OpsDetail.dc.html`).
Ran: `vitest run lib/checkout/booking-pages-polish.test.ts tests/unit/account-booking-details-refund.test.ts` → 183/183 pass (no DB).

No blocker. Three warnings: two are about the Cancel sheet's refund promise going stale or being computed differently
from the cancel, and one is a silent failure that would hide Cancel on live with nothing in the logs.

## Findings

### 1. WARNING: the "full refund" promise is read once at page load and can be stale when Cancel is confirmed
- Where: `apps/web/app/api/account/bookings/details/route.ts:92-107` (window read at load), `app/pages/booking-detail.dc.html:489`
  and `app/pages/manage-booking.dc.html:499` ("This trip will be cancelled. You get a full refund; our team sends it."),
  `cancelFull` at `booking-detail.dc.html:1124` / `manage-booking.dc.html:1170`.
- Failure: a signed-in customer opens a booking 24 h 10 min before pickup, so the window is `auto_full`. They leave the tab
  open, come back 20 minutes later and press Cancel. The sheet still says "You get a full refund". `customer_paid_cancel`
  recomputes `compute_cancellation_refund` at that moment and gets `pending_ops`, so the owner reviews the refund instead.
  The state after the cancel is honest, because it is built from `refundStatus`/`refundRappen` in the answer. The broken
  promise is the sentence the customer agreed to. The e-mail page already had this problem. This job brings it to the
  signed-in page, which had no Cancel before.
- Fix (either one):
  - Re-read the window when the cancel view opens: in `startCancel`, refetch `/api/account/bookings/details` or `/api/manage/booking` and use the fresh `cancelWindow`.
  - Better: send the window shown (`expect: "auto_full"`) with the cancel POST, and have the server answer 409 `window-changed` when `compute_cancellation_refund` now says otherwise. Nothing is written. The page shows the sheet again with the new copy.

### 2. WARNING (already there, in a file this job touched): the e-mail page measures 24 hours differently from the cancel
- Where: `apps/web/app/api/manage/booking/route.ts:160` (`customerCancelWindow(hoursBefore(row.original_scheduled_at, new Date()))`,
  real elapsed hours) against `compute_cancellation_refund` (`20260928150000_refund_review_tiers.sql`, Zurich wall-clock
  difference `(v_original at time zone 'Europe/Zurich') - (now() at time zone 'Europe/Zurich')`).
- Failure: the clocks go back on Sunday 25 Oct 2026. Pickup is Sun 25 Oct 10:00 Zurich (CET); the guest opens the link on
  Sat 24 Oct at 10:30 (CEST). Real elapsed time is 24.5 h, so the route answers `auto_full` and the sheet promises a full
  refund. The SQL wall-clock difference is 23.5 h, so the cancel gives `pending_ops` and the owner reviews it. This was
  checked in Node: 24.5 h real against 23.5 h wall clock. It happens for one hour a year per affected trip. The signed-in
  path is now correct because it uses the SQL function. The e-mail path is not.
- Fix: in the manage route, read the window the way the details route now does:
  `asSystem → select refund_mode from public.compute_cancellation_refund(${row.booking_id}::uuid)`, outside the guest
  transaction. If that read fails, show `pending_ops`, which is never a promise of a full refund. Then
  `customerCancelWindow` can go.

### 3. WARNING: a failed window read is swallowed without a log, so Cancel can vanish on live and nobody sees it
- Where: `apps/web/app/api/account/bookings/details/route.ts:104-106` (`catch { cancelWindow = "none"; }`).
- Failure: this route is the first Worker code that calls `compute_cancellation_refund` directly as `vamos_system`. Every
  earlier caller is a definer function such as `customer_paid_cancel` or `ops_cancel_booking`, so the cancel still
  working on live proves nothing about this grant. The grant is in migrations 20260911234758 and 20260928150000. If live
  has drifted (live drift has happened before: `is_test`, 20260911000002), every signed-in booking loses Cancel with no
  error and no log line. Failing closed is the right behaviour; failing silently is not.
- Fix:
  - In the catch, log like the list route does: `console.error("account_details_window_failed", err instanceof Error ? err.message : String(err))`.
  - Before shipping, run one read-only query on live: `select has_function_privilege('vamos_system', 'public.compute_cancellation_refund(uuid)', 'execute');`. It should return `true`.

### 4. NOTE: the pages picker's weekday headings and month title are now in the reader's language but not opted out of translation
- Where: `app/pages/WhenPicker.dc.html:93` (`{{ monthTitle }}`) and `:100` (`{{ w }}`). The home copy has `data-vt-no-i18n` on the weekday heading.
- Failure: nothing visible was found. The dictionary's `'Mon' → de 'Mo' / fr 'lun'` entries do not match Intl's `Mo.` /
  `lun.`, and the Arabic ones map back to themselves. The runtime still runs a lookup on these Intl strings at every
  language switch, and a future dictionary entry could collide with one of them.
- Fix: add `data-vt-no-i18n` to both spans, as the home copy does.

### 5. NOTE: a lone " · " shows when the booking has no day and time
- Where: every `{{ bookedDay }} · {{ bookedTime }}` spot in both pages (the date pill, Date row, Booked for, the "call
  dispatch" figure, the cancel sentence) and `{{ newDay }} · {{ newTime }}`.
- Failure: if `scheduledLocal` is empty, the separator is shown on its own; before this job the spot was empty. This is
  practically unreachable: legs carry `scheduled_local`, and the account list builds `dateIso + "T" + time`.
- Fix: put the pair inside an `sc-if` on `bookedDay` (and on `newDay` for the new pickup).

### 6. NOTE: a wrong comment, and "new" is mapped to "Confirmed"
- Where: `app/vamos-manage-ticket.js:102-106`.
- Failure: the comment says the list folds "a paid booking not yet assigned into new". In fact `rowStatus`
  (`apps/web/lib/account/bookings.ts:134-140`) returns `new` only for `partially_cancelled`. When the details read fails,
  a partially cancelled booking therefore reads "Confirmed". This cannot happen in V1, which is one-way only, and the
  details answer overrides it when it lands.
- Fix: correct the comment. Optionally map `new` to `cancelled` (or leave the status empty) instead of `confirmed`.

### 7. NOTE: the refund line on the signed-in page always names Switzerland
- Where: `app/vamos-manage-ticket.js:308-316` (`countryName`) and the details route, which returns no payout country.
- Failure: a signed-in customer refunded to a German card reads "Refunded to your Switzerland card" (now in the reader's
  language). This was already so before the job (`t('Switzerland')`). Also, the `payoutCountryLabel` fallback is
  unreachable wherever `Intl.DisplayNames` exists, because the code defaults to `CH` first.
- Fix (later job): return the payout country from the details route through a definer read, and only default to `CH`
  after the label has been tried.

### 8. NOTE: harmless leftovers
- `BADGE_KEY.paid → 'confirmed'` (both pages, about line 1037/1044): the design-system `StatusBadge` MAP already has a
  `paid` key with the same tone and icon, and the label "Paid" is passed anyway. The plan's claim that the badge had no
  `paid` key is wrong, but the result is the same.
- `UNPAID` in the details route, line 13/94: this check never runs. `customer_booking_extras` already returns null for
  `quote`/`pending`, so the route answers 404 before reaching it. It does no harm.
- On the signed-in page, a paid booking whose captured sum is 0 has no Cancel inside 24 h (mode `none`), while the e-mail
  page shows Cancel for it. This is the cautious direction: no wrong promise.

## Checked and found sound

- **Ownership:**
  - Both reads filter on the reference AND the signed-in e-mail: `customer_booking_extras` uses `auth.jwt()` e-mail, and the second read adds `lower(contact_email) = lower(${email})` on top of RLS.
  - A booking that is not the customer's and a reference that does not exist give the same 404 `{ok:false}`.
  - The `asSystem` call only runs with the id of a row the customer owns.
  - The booking id is never sent to the browser.
  - The real-DB test proves the stranger's 404.
- **Grants as `authenticated`:**
  - `bookings.id` and `bookings.status` come from 20260823000021.
  - `reviews.booking_id` comes from 20261005120000, under the `reviews_customer_own_booking` policy.
  - The live account list already runs the same reads, so these grants are proven on live.
- **postgres.js `begin()`:** the `asSystem` read is outside the `asCustomer` transaction, and its try/catch wraps the call. Nothing is caught inside a transaction.
- **Status rule against the server:**
  - `NOT_CANCELLABLE` includes every status that `app.apply_customer_cancel` refuses (completed, no_show, cancelled, refunded); this was checked against the settle-safety version.
  - `partially_cancelled` is hidden even though the server would allow it. That is the cautious direction.
  - Adding `refunded` on the e-mail page is right: the server refuses it anyway.
- **Unpaid bookings:** the extras read returns null, the route answers 404, and the page keeps no Cancel. `loadAccount` sets `canCancel` only on `=== true` and whitelists the window value.
- **Account cancel key:** `paidCancelCustomer` accepts `VT-\d{2}-\d{4,5}`, which matches `next_booking_reference()`.
- **Pages:**
  - A script check confirmed that every `{{ }}` binding in both pages has a `renderVals` key.
  - No removed key is still referenced anywhere in the app: `mDate`, `mDay`, `dateLabel`, `timeLabel`, `countdown`, `bookedWhen`, `newWhen`. The only matches are `BookingSheet`'s own unrelated props.
  - The time change still POSTs `requestedLocal(s.mIso, s.mTime, ticket.scheduledLocal)`.
  - `applyTicket` and the drafts seed `mIso`/`mTime` from the booked wall clock.
  - The cancel keeps `payoutCountry` from the answer.
  - The flight-number, resend and voucher flows are unchanged.
  - Both badges get a key the design-system MAP knows, and their labels are in the dictionary.
  - In manage-booking, `lang` is declared before `pickerLocale` uses it.
- **Picker:** the picker sits inside `sc-if isModify`, so it mounts after `goTo('modify')` has set `mIso`, and `baseMonth` is the booked month when its state starts.
- **Dictionary:**
  - Each new pattern sits above the entry that would catch it first.
  - Each has de, fr and ar; there is no "ß"; there are no duplicate keys.
  - Arabic: 2 = حقيبتان, 3–10 = N حقائب, 11–99 = N حقيبةً; 100 and above keep the general form.
  - Reverse lookup works: `fromPattern`'s `agrees` re-test rejects a wide match (for example "3 Gepäckstücke" against the 11–99 entry). Patterns with no group rebuild their English text exactly.
- **dayLabel** (checked in Node): Tue 6 Oct / Di. 6. Okt. / mar. 6 oct. / الثلاثاء، 6 أكتوبر. The day is taken at UTC noon, so the reader's time zone cannot shift it. Region names: Switzerland / Schweiz / Suisse / سويسرا.
- **Time row:** `vt-dir-keep` on the hour : minute row is `[dir=rtl] .vt-dir-keep{direction:ltr;unicode-bidi:isolate}` (laws.css:62).
