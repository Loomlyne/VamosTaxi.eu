# P1 build record — a class change on a paid trip is re-priced and works

Branch `gsd/26.2-p1-class-change`, folder `/Users/koss/Developer/vamos-wt/phase-26.2-p1`.
Plan signed by the owner (question form, 2026-09-30). Decisions D0–D8 in `DECISIONS.md`,
e-mail text in `.planning/decisions/2026-10-01-class-change-pay-mail.md`, refunds by hand in
`.planning/decisions/2026-09-30-refunds-by-hand.md`.

Started 2026-10-01. Nothing pushed, no PR, no deploy, no hosted SQL.

## Commits

| # | Commit | What |
|---|---|---|
| 1 | `5a389707` | Database: migration `20261007140000_class_change_reprice.sql`, pgTAP `class_change_reprice.test.sql` (69), Worker-client local test `packages/db/test/local/class-change-reprice.test.ts` (3), regenerated `database.types.ts` (only the new functions and columns differ) |
| 2 | `e0029d3d` | Price step `apps/web/lib/ops/booking-change-price.ts` + 14 unit tests |
| 3 | (next) | Writer fix (`sql.json`), accept takes a stored request only (no field from the browser, lead note 3), cheaper accept = Refund due with no Stripe call, PATCH no longer writes the class (A8), rules and body parser `booking-change-map.ts` (+10 tests), by-version price book read in `rate-book.ts`, `deliverBookingConfirmation` split out of `voucher.ts`, migration: shown class totals kept only for the same book |

## Design choices made inside the signed plan (say if one is wrong)

| # | Choice | Why |
|---|---|---|
| C1 | The "current class" check reproduces what was charged with the booking's OWN price book (the rate version on its price record); the new class is priced with TODAY's live book (D3). | Checking with today's book would refuse every booking made before the owner changes a price. With the booking's own book the check proves the trip facts are right; D3 still decides the new price. |
| C2 | A cheaper change uses the live "Refund due" state of refunds by hand: `refund_status pending_ops`, `refund_owed_rappen` = refunded + difference. The refund plan gets a third tier, "credit": exactly the amount due, no percentage, reason `modification_credit`. When it is paid out, a trip that still happens reads `none` again (not "Refunded"). | One refund path (the admin's Refund click, intents, Stripe, retry), as the owner decided. "Full refund only" (cancel more than 24 h ahead) stays for cancelled bookings only. |
| C3 | A second change while a credit is still due is measured against money held (paid minus refunds): the credit is recomputed, never added twice. A change is refused while a refund is being sent (`processing` / `failed`). | Plan rule "against everything paid so far, minus refunds"; money in flight must not move under the admin. |
| C4 | The automatic Stripe refund of the old machine (more than 24 h before pickup) and the typed 24 h line are removed from the accept step; every cheaper outcome is "Refund due". | Live rule since 2026-10-01: nothing goes to Stripe without the admin's click. |
| C5 | A customer change request may not carry a class (refused in the database). | Plan: "Who may do it: the same staff who can use Edit". The old customer door priced a class through the quote lock's net (W1), which is wrong. No screen sent it. |
| C6 | A difference payment that arrives after its request ended (replaced or expired) is recorded and NOT applied; the overpayment shows as Refund due. | Money that arrived must be recorded; the trip must not change from a stale link. |

## Tests written first (failing line before the change)

| Test | Before (RED) | After |
|---|---|---|
| pgTAP `class_change_reprice.test.sql` | `function public.booking_staff_change(...) does not exist` (plan 62, ran 0) | 69/69 pass |
| local `class-change-reprice.test.ts` (Worker client options) | 1: `new row for relation "booking_edit_requests" violates check constraint "booking_edit_requests_payload_object"`; 2–3: `function public.booking_staff_change(...) does not exist` | 3/3 pass |
| `booking-change-price.test.ts` (14) | Written with the module, not before it. Checked instead by mutation: difference against the booked total instead of paid-net → "the paid figure…" fails; shown-totals filter off → 6 fail; "same price for every kept metre" off → "refused, not guessed" fails. | 14/14 |
| `edit-request-time.test.ts` | `AssertionError: expected 1 to be +0` (the payload went as a `JSON.stringify` string param) | pass |
| `staff-hosted-pay.test.ts` (+2) | `expected { ok: false, code: 'not-found' } to deeply equal { ok: false, code: 'invalid-body' }`; `expected { ok: false, code: 'unknown' } to match object { ok: true … refund_due }` | pass |
| `bookings-write.test.ts` (class tests replaced) | `expected true to be false` (PATCH wrote vehicle_class_id); `not to match /klass/` | pass |
| `edit-request.test.ts` 08-07 proof | changed from `toMatch(/createRefund/)` to `not.toMatch(/createRefund/)` (the automatic refund is gone, refunds by hand) | pass |

## Real-Postgres proof (isolated stack, Worker client options)

Stack: project `vamos-taxi-262`, port 62322, workdir symlinks re-pointed to this folder.

- **The payload writer finding, settled (lead note 2):** through the Worker client options
  (`fetch_types:false`, prepared), `${JSON.stringify(payload)}::jsonb` is sent as a JSON STRING and
  the insert FAILS outright: `23514 booking_edit_requests_payload_object`. It is not stored as a
  string. So every customer time-change request on live has failed since the Worker switched to
  this client ("Could not request this time change."). `tx.json(payload)` stores an object.
  Probe: `scratchpad/sb262/p1-writer-probe.mjs`.
- After the migration, both writer forms store an object (the upsert unwraps a string), and the
  apply step reads a string payload too (pgTAP G).
- Regression pgTAP on the same stack: `booking_edit_requests`, `refunds_by_hand`, `ops_refund`,
  `refund_review`, `ops_assign_leg`, `settle_revive` — 313 tests, pass.

## Checks (run once at the end)

Not run yet.

## Not verified

- Nothing applied to the hosted database (control session's job).

## Stopped on / questions for the owner

None so far.

## Process note

- One read-only `git stash list` ran by mistake inside a command chain (no stash was created,
  applied or dropped).
