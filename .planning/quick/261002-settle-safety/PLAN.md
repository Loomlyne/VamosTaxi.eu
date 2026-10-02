# Plan — 261002 settle safety (difference payments)

Job session, branch `fix/settle-safety` (cut from `origin/main` 3978fda9), worktree
`.claude/worktrees/settle-safety`. Migration number `20261007200000` (reserved by the controller).
Opus plans and reviews; Sonnet executors build. Nothing is built before the owner signs this plan.
Written 2026-10-02 14:40 +04.

## What goes wrong today, in plain words

A customer pays the difference for a change (a dearer class, a new destination) on Stripe's page.
Stripe tells the site; the site then records the payment and applies the change.

1. **A captured difference can be lost (P-1).** Two parts of the site take the same two locks
   (the booking, then its change request) in opposite orders. When they collide, the database
   stops one of them ("deadlock"). If it stops the payment recording, the site treats that as final
   and never tries again: Stripe has the money, the booking shows nothing. The same happens on a
   dropped database connection, and on any other error while the change is applied (for example the
   class was hidden in the meantime): money taken, nothing recorded, no mail.
2. **A difference paid after a cancel can change a cancelled trip (P-2).** Cancelling a booking does
   not end a change that waits for its difference, and does not close its Stripe page. If Anna
   cancels VT-26-0801 and then pays the open link, the site applies the new class to the cancelled
   trip.
3. **Two smaller money gaps from the last review (R4):**
   - Accept pressed a second time on a customer request after the amount moved: the new link charges
     the new amount, the booking records the old one.
   - The owner makes a new change while the customer has just paid the waiting one: the first
     payment becomes Refund due and a second link goes out.

## What the site does after this job

1. **Never loses a captured payment.**
   - Every part that touches a booking's change request locks the booking first (one order), so the
     collision cannot happen.
   - A database hiccup (deadlock, lost connection, timeout) is tried again, never accepted as final.
     After 8 tries over about 8 minutes the existing "A Stripe payment event is stuck" mail goes to
     info@vamostaxi.site, now with the booking reference for a difference payment too.
   - If the change cannot be applied (class hidden, too many travellers for the class, the trip was
     cancelled or replaced), the payment is still recorded, the change is not applied, and the
     amount shows as **Refund due** on the booking in the dashboard. A new mail tells info@ at once
     (text below, for your approval). If you make the same change again, the money already paid
     covers it, so nothing is charged twice.
2. **A cancel ends a waiting change.** Cancelling (customer link, signed-in customer, or dashboard)
   ends any change that waits for its difference and closes its Stripe page. If the money still
   lands (paid in the same second), it is recorded as **Refund due** on the cancelled booking, never
   applied: added to the full refund when the cancel already owed one, otherwise shown for you to
   decide, as for any cancelled paid booking today.
3. **Second Accept with a moved amount** is refused, nothing is written, the first link stays valid
   (its amount matches the booking's record). Dashboard message below, for your approval.
4. **New change while the waiting one was just paid:** the site checks the waiting link first. Paid:
   the new change is refused with the existing message "The customer has already paid the
   difference. The change is applied when the payment is recorded." Not paid: the link is closed,
   then the new change goes ahead as today.

No price, rate or customer text changes. Refunds still go out only when you press Refund.

## Texts for approval (owner decides; no new customer text)

**T1 — internal alert mail to info@ (same layout as the other "Needs attention" mails)**
- en headline: Difference paid, change not applied
- en body: The customer paid the difference for this booking, but the change was not applied: the
  trip was cancelled, a newer change replaced it, or it no longer fits. The payment is recorded and
  shows as Refund due. Send it back from the dashboard, or make the change again.
- de headline: Differenz bezahlt, Änderung nicht übernommen
- de body: Der Kunde hat die Differenz für diese Buchung bezahlt, aber die Änderung wurde nicht
  übernommen: Die Fahrt wurde storniert, eine neuere Änderung hat sie ersetzt, oder sie passt nicht
  mehr. Die Zahlung ist verbucht und erscheint als fällige Rückerstattung. Senden Sie sie im
  Dashboard zurück oder nehmen Sie die Änderung erneut vor.
- fr headline: Différence payée, modification non appliquée
- fr body: Le client a payé la différence pour cette réservation, mais la modification n’a pas été
  appliquée : le trajet a été annulé, une modification plus récente l’a remplacée, ou elle ne
  convient plus. Le paiement est enregistré et apparaît comme remboursement dû. Renvoyez-le depuis
  le tableau de bord ou refaites la modification.
- ar headline: دُفع الفرق ولم يُطبَّق التغيير
- ar body: دفع العميل الفرق لهذا الحجز، لكن التغيير لم يُطبَّق: أُلغيت الرحلة، أو حلّ محله تغيير أحدث، أو لم يعد مناسبًا. الدفعة مسجّلة وتظهر كاسترداد مستحق. أعِدها من لوحة التحكم، أو أجرِ التغيير مرة أخرى.

**T2 — dashboard message on a second Accept when the amount moved**
- en: The amount to pay changed since you first accepted, so no new link was made. Refuse this
  request; the customer can ask again.
- de: Der zu zahlende Betrag hat sich seit Ihrer ersten Annahme geändert, daher wurde kein neuer
  Link erstellt. Lehnen Sie diese Anfrage ab; der Kunde kann erneut fragen.
- fr: Le montant à payer a changé depuis votre première acceptation, aucun nouveau lien n’a donc été
  créé. Refusez cette demande ; le client peut redemander.
- ar: تغيّر المبلغ المطلوب منذ قبولك الأول، لذلك لم يُنشأ رابط جديد. ارفض هذا الطلب؛ ويمكن للعميل أن يطلب مرة أخرى.

## Technical plan (for the reviewer)

### Lock rule
Every function that writes a booking's change requests, payments or legs takes the booking row lock
(`select … from public.bookings … for update`) before any request lock. Today
`booking_edit_request_upsert`, `booking_change_withdraw`, `booking_staff_change`,
`booking_staff_trip_change`, `ops_cancel_booking`, `manage_booking_cancel`, `customer_paid_cancel`
already do; `checkout_extra_payment_settle` and `booking_edit_request_accept` lock the request first
(`20261007140000:509-528`, `:1057-1071`). Single-statement writers that hold only the request row
(`edit_request_refuse`, `booking_edit_request_set_extra_session`) wait for nothing else and cannot
close a cycle; they stay as they are.

### Migration `packages/db/supabase/migrations/20261007200000_settle_safety.sql`
Every body is the live body (md5s below) with the listed changes only. Same signatures, same return
columns (no drop: an old Worker's prepared `select *` keeps its result type), SECURITY DEFINER,
`search_path ''`, grants re-stated. No row inserted, updated or deleted by the file; no backfill.

| Function | Live md5 (read 2026-10-02 14:33 +04, = files) | Change |
|---|---|---|
| `public.checkout_extra_payment_settle` | `62df6b4c8440ecfbc3473dfd32895f7f` | (a) find the booking id by page id without a lock, lock the booking, then lock the request: `order by (r.status = 'requested') desc, r.created_at desc limit 1 for update` (deterministic pick). (b) booking `cancelled`/`partially_cancelled`/`refunded`: never applied; payment recorded; a waiting request ends (`superseded`); Refund due on the cancelled booking: `pending_ops` with owed = owed + paid difference when the cancel already owed a full refund (owed > 0; also kept when a refund is in flight), else `pending_ops` with owed null (owner decides); event `refund.requested` `{via: difference_after_cancel, due_rappen}`. (c) the apply runs in a `begin … exception` block: a deadlock, serialization, lock, connection, shutdown, resource or timeout error is re-raised (the Worker retries); any other error rolls back the apply only, the payment is recorded, the request ends (`superseded`), `booking_change_settle_credit` shows the paid amount as Refund due, event `refund.requested` `{via: difference_not_applied, sqlstate, reason}`. |
| `public.booking_edit_request_accept` | `586a5e1a37fd194b25ae0aad87576e16` | Lock the booking (by the request's booking id) before the request; refusal order unchanged (not-found, not-requested, then an erased booking is not-found). New refusal `price-changed` (P0001, nothing written) when the request already has a difference record whose total differs from the current difference. |
| `app.apply_customer_cancel` | `e24fbf45ba0e962bf90ebfb46b5c9b18` | Lock the booking first (callers already do; defensive). After the cancel: every `requested` change request of the booking ends (`superseded`). |
| `public.ops_cancel_booking` | `78a1ad2e8168bd9e5686c7896d4ef39a` | After the cancel: every `requested` change request ends (`superseded`). |
| `public.checkout_reference_for_session` | `9d33c74565621b405771b606d40de87e` | Also finds the booking of a difference page (`booking_edit_requests.extra_session_id`), so the stuck-payment mail names it. |
| new `public.booking_cancel_change_pages(uuid)` | — | For a cancelled booking only: the Stripe pages of its ended, unpaid change requests whose difference record has not expired. EXECUTE `vamos_system` only. |

### Worker (TypeScript)
| File | Change |
|---|---|
| `apps/web/lib/checkout/settle-errors.ts` (new) + test | `settleErrorKind(err)`: `transient` (SQLSTATE class 08, 40001, 40P01, 55P03, 57014, 57P01-57P03, 53xxx, 58xxx, and any error with no SQLSTATE, e.g. a dropped socket) or `permanent`; retry delays 5 s (deadlock, serialization, lock), 60 s (other transient), 300 s (permanent with money captured). |
| `apps/web/lib/checkout/settle.ts` + `settle.test.ts` | `begin` errors are retried, never acknowledged. Settle errors: P0002 as today, except an unpaid difference page that belongs to no request (expired page already replaced) is acknowledged (nothing to record, no false stuck mail); transient: retry with delay; permanent with money captured: retry with delay until the dead-letter queue sends the stuck mail; permanent without money (failed or expired page): acknowledged as today. After a difference settled but not applied: the T1 mail (best effort, never a retry). |
| `apps/web/lib/ops/must-fix-mail.ts`, `packages/emails/src/OpsMustFixEmail.tsx`, `packages/emails/src/messages/{en,de,fr,ar}.json` + tests | New kind `difference-not-applied` (T1). |
| `apps/web/lib/lifecycle/paid-cancel.ts`, `apps/web/lib/db/system-reads.ts` + tests | `finishPaidCancel` (all three cancel doors: link, signed-in, dashboard) reads `booking_cancel_change_pages` and closes each page, best effort, after the cancel committed. |
| `apps/web/lib/ops/edit-request-map.ts` + test | `price-changed` mapped, 409. |
| `apps/web/lib/ops/booking-change.ts`, `apps/web/lib/ops/booking-trip-change.ts` + tests | One helper `closeWaitingStaffPage` (Withdraw's own check: close, re-read, `complete` = already-paid, not closed = stripe-failed), called by Withdraw and, before the SQL, by the class and trip change confirms. |
| `app/ops/OpsDetail.dc.html` | Accept: `price-changed` shows T2 (four languages, its own tables). Class/trip change: `already-paid` shows the existing `acceptPaid` text. |
| `packages/db/database.types.ts` | Regenerated with the pinned CLI (new function). |

### Tests, written first (each must fail on main's code before the fix)
- pgTAP `packages/db/supabase/tests/settle_safety.test.sql`, from an empty database: deterministic
  pick (two requests on one page: the waiting one is settled); cancel ends a waiting change (customer
  door and dashboard door) and lists its page; paid after cancel → not applied, class unchanged,
  payment recorded, Refund due (full-refund cancel: owed grows by the difference; inside 24 h: owed
  null); apply failure (class hidden after accept) → payment recorded, request ended, Refund due on
  the live booking; second Accept with a moved amount → `price-changed`, nothing written; refusal order
  of accept unchanged; reference lookup finds a difference page; grants.
- Worker-client test `apps/web/lib/checkout/settle-safety.local.test.ts` on my stack
  (`vamos-taxi-ss`, ports 655xx), with the Worker's client options: two real connections hold the
  booking and the request in the order the customer request takes them while the settle runs; on
  main's bodies this deadlocks (40P01, recorded as the negative control), after the migration the
  settle waits and then records the payment. Same for Accept against a customer request. Paid after
  cancel through the real cancel and settle functions.
- Unit tests: every error class in `settle-errors`, the settle's retry / acknowledge / alert
  decisions, the cancel page close, the confirm's paid-page check.

### Ship order (for the controller)
Migration first, then the Worker, same ship. Both halves are safe alone (to be proven on my stack):
the new SQL keeps every signature and result column, so the live Worker keeps working (it only
lacks the T1 mail, the page close on cancel and the T2 message); the new Worker with the old SQL
loses only the page close (the function is missing; it is best effort) and never sees
`price-changed`.

### Not in this job
- A dashboard list of Stripe events that ended in the dead-letter queue (today: the stuck mail only;
  resend the event from Stripe to record it). A screen needs its own design.
- A difference paid after the trip has run is still applied as today.
- `booking_edit_request_set_extra_session` differs from its file on live by line breaks only
  (local `86ffd2c2…`, live `e8168fb4…`, same logic); noted for the controller, not changed.
