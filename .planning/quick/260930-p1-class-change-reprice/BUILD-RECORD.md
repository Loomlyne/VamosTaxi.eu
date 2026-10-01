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
| 7 | (this commit) | Record: checks, not verified, questions |
| 6 | `de59ef06` | Pictures for the owner's signature (`screens/`, method of ops-signing-pictures-real-shell), Edit grid stacks on a phone (the class value was cut at 390) |
| merge | `c15c101c` | origin/main 40dc4f29 brought in (only overlap: the identical decision file) |
| 5 | `ca05fecb` | End-to-end local test through the real Worker client (`booking-change.local.test.ts`), both local test files named in `scripts/db-access-fence-allowlist.json`, module-scope `Set` removed (isolate-memoisation fence) |
| 4 | `060b65d3` | Server: `booking-change.ts` (preview / confirm / after-change mails), routes `POST …/bookings/:id/change/preview` and `POST …/bookings/:id/change` (+ dual mounts), the owner's e-mail `ClassChangePayEmail` (four languages, copied programmatically from the decision file), settle hook for a paid difference, refunds-by-hand credit tier in `refund.ts`, board read of the waiting change, dashboard (class list, price box, confirm step, waiting state, credit panel, four languages), customer account line guard |
| 3 | `bd9c7fe8` | Writer fix (`sql.json`), accept takes a stored request only (no field from the browser, lead note 3), cheaper accept = Refund due with no Stripe call, PATCH no longer writes the class (A8), rules and body parser `booking-change-map.ts` (+10 tests), by-version price book read in `rate-book.ts`, `deliverBookingConfirmation` split out of `voucher.ts`, migration: shown class totals kept only for the same book |

## Owner sign-off additions (2026-10-01, after P1 was signed)

| # | Addition | What |
|---|---|---|
| A1 | "Withdraw change" | In the booking's ACTIONS menu only while your dearer change waits for payment. Confirm dialog ("Withdraw the class change?"), then `POST /api/staff/bookings/:id/change/withdraw` (body `{}`). The Worker closes the Stripe page for the difference FIRST (expire), then `booking_change_withdraw` ends the request (status `withdrawn`). Nothing is charged; the booking is not touched. Four-language label, dialog and notices in the OpsDetail table. |
| A2 | Refund line on the customer's booking page | After a CHEAPER class change, until the refund is sent: the owner's line, word for word (decision file, second section), on manage-booking and the account booking view, next to the trip status. New class name from the booking's price record, amount = owed minus refunded through `VamosLocale.money`. Gone once the refund is sent (`refund_status` back to `none`). |

**Choice (A1, she pays in the same second):** apply. Two cases:
- The page completes before the expire: Stripe refuses the expire, the route reads the session
  (`complete`), answers `already-paid` ("The customer has just paid the difference. The class changes
  now.") and ends nothing; the webhook applies the change as usual.
- A payment reaches the settle for a request already `withdrawn` (an async payment method finishing
  later): `checkout_extra_payment_settle` applies it — she gets what she paid for — as long as nothing
  newer was asked (no other change waiting, and the booking still bound to the price record the
  change was built on) and the trip still runs. Otherwise the payment is recorded, not applied, and
  shows as Refund due for your Refund click.
- Stripe does not answer: nothing is ended (`stripe-failed`), you can press again.

| Test | Before (RED) | After |
|---|---|---|
| pgTAP `class_change_reprice` W (12 new, 81 total) | `function public.booking_change_withdraw(uuid, uuid, uuid) does not exist` (12 fail); then "newer change" by `created_at` failed inside one transaction (2 fail) → rule changed to state (waiting request / bound price record) | 81/81, with `booking_edit_requests` and `refunds_by_hand` 210/210 |
| `booking-change-withdraw.test.ts` (7) | 5 fail (`withdrawBookingChange` missing) | 7/7 |
| `ops-class-change-dc.test.ts` (+3) | 3 fail (no menu item, dialog, notices) | 12/12 |
| `class-change-customer-line.test.ts` (rewritten, 12) | `TypeError: changeCreditLine is not a function` (10 fail); the four languages are compared with the decision file | 12/12 |

The dictionary entry and the decision-file section were written from the coordinator's text; the
dictionary templates were derived from the decision file by a script (Economy → {class}, CHF 000 →
{amount}), so the rendered line equals the decision file byte for byte (test).

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
| `booking-change-map.test.ts` (10) | written with the module | 10/10 |
| `booking-change.test.ts` (13) | written with the module (fakes; begin-like asSystem stand-in that rethrows) | 13/13 |
| `booking-change-settle.test.ts` (3) | mutation: hook call removed from settle.ts → 2 fail | 3/3 |
| `ClassChangePayEmail.test.tsx` (10) | `Cannot find module './ClassChangePayEmail'`; the test reads the decision file and compares subject, heading, text and button word for word in en/de/fr/ar | 10/10 |
| `refund-by-hand.test.ts` (+2, picker shape) | `expected { ok: true … } to deeply equal { ok: false, code: 'invalid-amount' }` (a percentage was taken on a credit); `fullTier: true` on a live booking | pass |
| `ops-class-change-dc.test.ts` (9) | run against the old OpsDetail: 8 fail (Input not Select, vehicle pre-fill, no box, no confirm step, no waiting line) | 9/9 |
| `ops-refund-review-dc.test.ts` | two pins updated to the credit tier (review tier excludes it; Refund due also for a live credit) + one new pin | 21/21 |
| `class-change-customer-line.test.ts` (2) | `expected 'Full refund · sent by our team' to be ''` on a confirmed trip with a change credit | pass |

## Real-Postgres proof (isolated stack, Worker client options)

Stacks (workdirs under `scratchpad/`): first `vamos-taxi-262` (port 62322, workdir `scratchpad/sb262`, symlinks re-pointed to this
folder at 08:05). **Collision:** at 08:27 another session re-pointed sb262's symlinks to
`/Users/koss/Developer/vamos-wt/phase-26.2`, restarted that stack with its own migrations and ran its
pgTAP (logs `start-cc.log`, `pgtap-cc*.log`, `types-cc.ts` in sb262). Not knowing that, I ran
`supabase db reset --workdir sb262` at 08:45: it replayed THAT folder's migrations and wiped that
stack's data. Nothing of theirs is in git or on disk lost; their stack is up with their schema. From
08:46 I used my own stack only: project `vamos-taxi-p1`, ports 6332x, workdir `scratchpad/sb-p1`
(named `sbp1` while in use, renamed after the lead's note; symlinks to this folder; inspector 8383).
Stopped with `--no-backup` at the end. I did not stop or touch sb262 again (the other session's now).
Every DB result in this record after 08:46 comes from `sb-p1`; the earlier sb262 runs were repeated there.

- **From-zero replay** (`sbp1`, `db start`): 124 migrations applied, `20261007140000` included.
- **Full pgTAP on that replay:** 91 files, 2164 tests, PASS (run with the login roles passwordless; with
  the local passwords set, `extensions.test.sql` #12 "vamos_edge has no password" fails by design).
- **End to end through the real Worker client** (`apps/web/lib/ops/booking-change.local.test.ts`,
  asStaff / asSystem / asQuote, only Stripe, Mapbox and the mail sender replaced): a booking written the
  way checkout writes it on a live book; dearer preview → confirm (`extra_required`, request waits as a
  JSON object, booking still Economy, Stripe page for exactly the difference, owner's mail with new
  total / paid / difference) → extra settle as the system role (class Business, driver and car off,
  `unassigned_chauffeur_id` returned) → `afterExtraSettled` builds the confirmation through the definer
  reads (total = new total, class Business) and the driver mail; cheaper → `refund_due`, `pending_ops`
  owed = difference, no Stripe call → `refundBooking` with `{}` sends exactly the difference →
  `refund_status none`, `refunded_rappen` = difference. Pass.
- `apps/web/lib/ops/refund-by-hand.local.test.ts`, `assign.local.test.ts`, `lib/db/system-reads.local.test.ts`
  on the same stack: pass. Note: `system-reads.local` and `booking-change.local` both publish a live
  price book (one live at a time); run them one after the other (`--no-file-parallelism`), else the
  second hits `rate_versions_one_live`.

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

## Pictures for the owner (`.planning/quick/260930-p1-class-change-reprice/screens/`)

Real dashboard shell (`app/ops/ops.dc.html` as the Worker serves it), API answers from the real board
mapper of each version, before = origin/main `40dc4f29` (git archive), after = this branch. Every
amount shows CHF 000 (the money formatter is stubbed on the pictures: no invented price). 1440 and 390,
English and Arabic; nothing scrolls sideways (36/36 shots, `sideways 0`); no console error except the
`assets/icons/route.svg` 404 that main has too (the route-chip icon file is missing in the repo).

| Sheet | What |
|---|---|
| `sheet-dear-edit.png` | Edit, dearer class: class list (live classes, booking's class preselected, not the car) and price box |
| `sheet-cheap-edit.png` | Edit, cheaper class: price box "Refund due" |
| `sheet-dear-confirm.png` | The confirm step (new): recap, consequence, driver line |
| `sheet-wait-view.png` | Waiting for payment of the difference, Open / Copy the Stripe page (before: the generic Accept / Refuse panel) |
| `sheet-credit-view.png` | After a cheaper change: Refund due for the difference only (before: main offered the full refund) |
| `sheet-mail.png` | The new e-mail, en / de / fr / ar, 640 and 390, the decision file's example values |

Single shots: `{dear-edit,cheap-edit,dear-confirm,wait-view,credit-view}-{before,after}-{en,ar}-{1440,390}.png`,
`mail-{en,de,fr,ar}-{640,390}.png`.

## Checks (run once at the end, on the merged branch, after `node scripts/sync-dc-mock-to-public.mjs`)

| Check | Result |
|---|---|
| `pnpm typecheck` | pass |
| `pnpm lint` | pass (0 errors; 6 warnings, all in files this job did not touch) |
| `pnpm lint:css` | pass |
| `pnpm i18n:check` | pass (2676 keys) |
| `pnpm check:numbers` | pass |
| `pnpm check:db-fences` | pass (8 checks, after the module-scope `Set` fix) |
| `pnpm check:public-env` | pass |
| `pnpm check:legal-claims` | pass |
| `pnpm test:unit` | pass — web 338 files / 3334 tests (4 local-DB files skipped without a port), emails 161, db 14 |
| `pnpm db:seed:check` | no drift |
| `pnpm build` | pass; `…/bookings/[id]/change` and `…/change/preview` built in both mounts |
| pgTAP from zero (`sb-p1`) | 124 migrations replayed, 91 files / 2164 tests pass |
| Local Worker-client tests (`sb-p1`) | `class-change-reprice` 3/3, `booking-change.local` 1/1, `refund-by-hand.local`, `assign.local`, `system-reads.local` pass (the last two publishers of a live book run one after the other) |

## Files outside this job's own area (touched because the plan needs them)

| File | Why |
|---|---|
| `apps/web/lib/checkout/settle.ts` | 3 small edits: carry `applied` / `unassigned_chauffeur_id` of the extra settle, and one optional hook after a paid difference (confirmation again, driver told). Loaded on use. |
| `apps/web/lib/ops/refund.ts` + its tests, SQL `ops_refund_plan` / `app.refund_intents_settle` (create or replace) | The credit tier of refunds by hand (security session's area). Full tier unchanged for cancelled bookings; their pgTAP and unit suites pass. |
| `app/vamos-manage-ticket.js` | The account page no longer shows the cancel promise "Full refund · sent by our team" on a trip that still runs (a change credit). No new customer wording. |
| `scripts/db-access-fence-allowlist.json` | Names the two new local test files (raw postgres client, local only), as the fence asks. |

None of the brief's hands-off files were edited (tests/**, .github, middleware.ts, worker.ts, lib/seo,
app/home, class cards, checkout.css, consent, seed.sql; the shared dictionaries were not needed: the
dashboard keeps its own four-language table, the e-mail its own message files).

## Not verified

- Migration `20261007140000` is not applied on the hosted database (control session's job). It is
  additive: new functions, `create or replace` of six, one `drop + create` of `checkout_extra_payment_settle`
  (same arguments, more columns; the deployed Worker reads the old columns by name), two widened CHECKs.
  Apply it before the Worker that calls `booking_staff_change`.
- No real Stripe page, refund or Resend mail was made: all three were stood in. After the ship, owner
  rule 8: one class change on a test booking, the difference paid with 4242 4242 4242 4242, then
  `booking_payments` by status, and one cheaper change refunded by hand.
- Live bookings were not read (no hosted SQL). Only bookings whose price record has the checkout shape
  (fare + extras + coupon + VAT lines) can be re-priced; an older record answers "trip-data" with the
  message "Cancel it and make a new trip". How many live bookings are of the old shape: not known.
- The Mapbox path (saved place id → Search Box retrieve with a new session token, else reverse of the saved
  coordinates) was not run against Mapbox. It is used only when the booking's price book is not today's
  live book; with today's book (book 18 today) the saved trip is checked against every class total the
  customer was shown, without Mapbox. When the facts do not reproduce the charge, the change is refused.
- Hermes browser UAT of the dashboard: owner.
- Pictures were taken at 1440 and 390 (the brief); 1024 and 768 were not captured.
- A live Stripe key is refused by the change (plan: not lifted here).

## Known gaps left as they are (not this job)

- The customer full-edit door (`POST /api/account/bookings` with a quote lock, no screen sends it) still
  prices through the lock's class net (W1). A class in it is now refused by the database; a lock-priced
  place change waits for P6.
- `assets/icons/route.svg` is missing (404 on the booking page, on main too).

## Stopped on / questions for the owner

Nothing stopped the build. Two points that are his to decide later (not asked by the plan):

1. After a cheaper class, the customer gets the confirmation again with the new total, but her own pages
   say nothing about the money coming back until the refund is sent (no approved wording exists for it).
   Example: Anna moves from Business to Economy; her account page shows Economy and the new total, no
   "refund on the way" line. Does he want a line there (his wording, four languages)?
2. A dearer change waiting for payment cannot be withdrawn by a button; it ends after 24 hours or when
   he makes another class change. Example: Anna phones back after 10 minutes and keeps Economy — the
   link stays open for the rest of the 24 hours. Does he want a "Withdraw" button?

## Process note

- One read-only `git stash list` ran by mistake inside a command chain (no stash was created,
  applied or dropped).
