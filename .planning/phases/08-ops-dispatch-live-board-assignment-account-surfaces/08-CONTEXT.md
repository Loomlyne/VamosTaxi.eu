# Phase 8: Ops Dispatch — Live Board, Assignment & Account Surfaces - Context

**Gathered:** 2026-09-10
**Status:** Ready for planning

## Phase Boundary

Staff run the day from **real paid (and unpaid-pending) bookings** on `dashboard.vamostaxi.site`. Customer `/bookings` is Postgres. Dispatcher assigns chauffeur **by hand**. Pay already auto-confirms (Phase 7). No auto-dispatch. No driver app.

Owner authorized this discuss while Phase 7 UAT tests 2–9 continue in another session. Do not rewrite `07-UAT.md` here. Do not treat Phase 7 as GSD-closed.

**In this phase:** live ops dashboard / board / calendar / detail / customers / fleet chauffeur detail; phone booking (quote → unpaid → pay-link or take card); fleet assign (chauffeur implies vehicle); chauffeur assign/unassign email; ops refund (full Stripe); paid reprice (difference pay-link or difference refund); customer paid-edit **request** (ops accept); live in-place updates; public signed-in `/bookings`; delete leftover empty lists / Isolation names. **No `#` in any URL.**

**Not this phase:** cost sheet / expense categories; driver app; live GPS; auto-dispatch; React `/ops` resurrection; inventing CHF or legal copy; Phase 11 live DNS/Stripe live keys.

## Implementation Decisions

### Carrying forward (do not reopen)

- **D-01:** DC ops is the product. Wire `app/ops` + `app/vamos-ops-data.js` to staff APIs. Do not resurrect React `/ops/bookings` from the 2026-08-25 context.
- **D-02:** Manual assign only. No auto-dispatch. No driver app. No Stripe Connect. No marketplace.
- **D-03:** Pay → booking confirmed automatically. Dispatcher still assigns by hand.
- **D-04:** Admin only: `koussayzayeni@gmail.com`. Staff tab stays gone. Support is `/support`, not Staff.
- **D-05:** Account Upcoming / See All = paid trips whose `contact_email` matches the signed-in JWT email. Guest checkout may leave `customer_id` null. Empty list is correct when emails differ. No claim-guest confirm dialog.
- **D-06:** Isolation-probe leftovers (`VT-48xx`, Isolation Customer*) are not product. Empty lists are empty. `emptyBookings` / fixture boards fail this phase.
- **D-07:** Public phone / WhatsApp `+41 79 626 70 82`. Charge always CHF. Public header FX is mark-only. Ops money is always CHF — no FX switcher.
- **D-08:** Return / hourly / cash-to-driver / PayPal / corporate invoice-on-account are out of V1.
- **D-09:** `CHF 000` until a real zero or a captured amount. Never invent fares. TBC pills stay TBC. Legal blanks stay TBC.

### URLs

- **D-10:** **No `#` in any URL.** Ops hashes (`#dashboard`, `#bookings`, `#calendar`, `#customers`, `#fleet`, `#support`, `#pricing`) become real paths on `dashboard.vamostaxi.site` (e.g. `/dashboard`, `/bookings`, `/bookings/new`, `/bookings/{ref}`, `/calendar`, `/customers`, `/customers/{email}`, `/fleet`, `/fleet/chauffeurs/{id}`, `/support`, `/pricing`, `/login`). Public site stays path-based (`/bookings`, `/account`, `/manage/...`, `/checkout/...`). Planner picks exact path strings; do not leave hash-routed ops.

### Phone booking pay

- **D-11:** Same Stripe path as the site. Quote → unpaid booking → customer card **or** email pay-link. Webhook confirms. **No** “mark paid outside Stripe”. Cash is still out.
- **D-12:** **Both** payment methods: dispatcher emails/copies pay-link (customer pays on the same public payment page) **and** dispatcher can take the card in ops (same card fields as public payment, Stripe still charges CHF).
- **D-13:** Unpaid phone bookings **show on the board** as unpaid/pending, same as public checkout that has not paid.
- **D-14:** Pay-link email goes out when the dispatcher clicks **Send / Email a pay link** (same as the site). Not auto-on-save.
- **D-15:** Customer identity = typed name / email / phone like guest checkout. If that email has an account, the trip shows there too (`contact_email`).
- **D-16:** Card in ops fails or they hang up → leave unpaid. Send pay-link still works.
- **D-17:** Extras = same as checkout (child seat, extra stop, oversize, ski request).
- **D-18:** Pay-link and confirmation email language = dispatcher picks EN/DE/FR/AR on the booking.
- **D-19:** Pickup/dropoff = Mapbox places, **same quote engine** as the site.
- **D-20:** Company billing = same as checkout (optional company name / address / VAT; whoever pays first).
- **D-21:** Airport flight number = same as the site (optional; same lookup when it works).
- **D-22:** Dispatcher can send the pay-link more than once; **same unpaid Stripe session**, new email (not a new session unless the amount changed).

### Phone booking screen

- **D-23:** **New trip** lives on `/bookings` (new-trip path). Same quote fields as the site, then Send pay-link or take card.
- **D-24:** After Save, land on **that trip’s detail**. Send pay-link or take card there.
- **D-25:** Take card on detail = **same card fields** as the public payment page.
- **D-26:** Quote first (no booking row until Continue/Save), same as the site.

### Dashboard tiles

- **D-27:** **Nothing stays mock.** Every tile is live data. No fixtures.
- **D-28:** Income and average fare = **captured fares only** (webhook paid). Unpaid pending is not income.
- **D-29:** One header period control: Today / 7 days / 30 days, Zurich. **Money + “where the money goes”** filter by **payment captured date**. **Operation / Needs attention / Fleet** filter by **pickup date**.
- **D-30:** Needs attention = **unassigned paid trips + unpaid/pending** (phone or public). Not `#support` tickets.
- **D-31:** Income tile stays the **gross capture**. A refund is a **Money-out line labelled Refund**, never Expenses. Stripe processing fee is a **Money-out line labelled Stripe fee** (Stripe’s fee on the charge; if Stripe returns no fee, no line — do not guess CHF). **Net = Income − Stripe fees − Refunds.** Do not subtract the fee from Income (that double-counts).
- **D-32:** Fleet today = on-shift chauffeurs + in-service vehicles from Phase 6 fleet tables. Empty fleet = real zeros.
- **D-33:** Average fare divides by the same captured set as Income.
- **D-34:** No captured fares in the period → Money tiles show **CHF 000 / 0**, not TBC, not sample `VT-48xx`.
- **D-35:** Money-in breakdown = **vehicle class** (Economy / Business / Van) from captured fares.
- **D-36:** Clicking an Operation tile goes to `/bookings` or `/calendar` **already filtered**.
- **D-37:** Expenses tile is a **real zero** until a cost sheet exists. **No placeholder chauffeur-pay / vehicles / fees rows.** Cost sheet is **not** this phase.
- **D-38:** Money-out lists **real action kinds only** (V1: Refund, Stripe fee). Each action is labelled as that action.

### Board refresh

- **D-39:** Open ops pages **update in place** — no full reload. Silent (numbers and rows change). No sound.
- **D-40:** Two laptops with ops open: both update. Trip detail updates in place too (do not kick back to the list).
- **D-41:** Live updates also on signed-in customer `/bookings` and trip detail. Confirmation wait room already waits on the webhook. **Home/marketing does not live-update. No live GPS / driver map.**
- **D-42:** Implementation (Realtime vs poll vs visibility refetch) is Claude’s discretion as long as D-39–D-41 hold.

### Assign

- **D-43:** Pick **chauffeur only**. Their **linked vehicle comes with them**. No typed names. Database refuses that chauffeur overlapping another trip. If they have no vehicle, assignment fails honestly.
- **D-44:** Assign **paid/confirmed only**. Unpaid stays on the board with no chauffeur.
- **D-45:** Unassign yes — chauffeur comes off, trip goes back to unassigned.
- **D-46:** Picker lists people whose **vehicle can take this trip’s passengers and bags**. Not on-shift-only.
- **D-47:** Double-book click: **name the other trip (ref + time) and refuse**. No force-assign.
- **D-48:** Already assigned, want someone else: **pick the new chauffeur in one step** — old one comes off.
- **D-49:** After completed / cancelled / refunded: assignment **frozen** — no assign / unassign / swap.
- **D-50:** After assign, customer `/bookings` and trip detail show **chauffeur name + vehicle from the fleet row**. Never a fake name. Empty until assigned.
- **D-51:** On assign **and** unassign, **email the chauffeur** the trip. Language = **chauffeur’s language from the fleet row**. No driver app.
- **D-52:** Chauffeur with **no email cannot be assigned**. Must save an email on the fleet row first.
- **D-53:** **Fleet Save must actually persist** the chauffeur ↔ vehicle link. Today’s no-op Save is a bug this phase must fix — otherwise D-43 is a lie.
- **D-54:** Chauffeur detail **this phase**: click chauffeur in `/fleet` **or** from an assigned trip. Page = profile + their live trips (same board data). Trips there are **read-only**; assign/unassign still happens on the trip detail.
- **D-55:** Taking a vehicle **off the road is allowed**. Upcoming assigned trips become **must-fix** on Needs attention. **Ops gets an email.** Dispatcher assigns a new chauffeur (vehicle follows) **or** pairs this chauffeur with a working vehicle. Trip is **not** auto-cancelled.

### Ops refund / cancel

- **D-56:** Ops **Refund** = **full Stripe refund** when you click it. Trip stays paid until Stripe succeeds. If Stripe fails: **stay paid, show the error, try Refund again**. Never mark refunded without Stripe.
- **D-57:** **Cancel** and **Refund** are two actions. Cancel on a **paid** trip does not refund by itself.
- **D-58:** Customer Cancel (also this product, customer side may land with Phase 9 screens but the rule is locked now): **more than 24h before pickup** → auto full refund. **Inside 24h** → customer is told we emailed ops; dispatcher issues Refund by hand.
- **D-59:** Unpaid trip, Cancel in ops: **drop it**, no Stripe refund.
- **D-60:** Refund email to **contact email, plus company payer if different**.

### #customers → `/customers`

- **D-61:** List **every booking email** — guest or account — with live trips under that email.
- **D-62:** Click a customer → **their trips (same board data) + contact**.
- **D-63:** No booking emails yet → **empty list**, not Isolation Customer*.
- **D-64:** Same email, two names → **one row per email**, latest name, all those trips.
- **D-65:** On the customer page you **can edit name / phone / email**; it **writes through** to those trips’ contact.

### Edit after pay (ops + customer this phase)

- **D-66:** Ops can change **anything** on a **paid** trip. Reprice with the **same quote engine**.
- **D-67:** New fare **higher**: extra pay-link / card for the **difference only**. **Trip stays as-is until that extra is captured.** Then the extra amount is added to what they paid.
- **D-68:** New fare **lower**: difference refund. **>24h before pickup** → refund immediately on Continue/accept. **Inside 24h** → ops must click Refund.
- **D-69:** Dashboard Income stays the **original capture**. Extra capture and difference refund are **their own money lines** (same rules as D-31).
- **D-70:** **Unpaid in ops:** no edit. **Cancel and create a new trip.**
- **D-71:** **Customer unpaid** on manage-booking: they **can edit** (applies immediately, reprice, then they pay), **Finish payment**, and **Cancel**.
- **D-72:** **Customer paid edit** = a **request**. **Ops must accept.** Then D-67/D-68/D-74. Ops email + dashboard shows the pending edit and the exact diff.
- **D-73:** Extra pay-link open: customer **can start a second edit**. Adds merge into **one** extra payment.
- **D-74:** Second/same-price edit (fare equals what they already paid): **no extra pay**. Still **wait for ops accept**. Then apply. Ops email + dashboard shows the trip was updated and the exact edits.
- **D-75:** Paid edit that breaks the assigned chauffeur (time overlap / capacity): **must-fix**. Dispatcher reassigns this trip or the other overlapping trip. Not auto-cancelled.

### Claude's Discretion

- How live-update is implemented (D-42) as long as the board/detail/customer lists update in place with no full reload.
- Exact path strings under D-10.
- Phone new-trip and chauffeur-detail layout: existing `--vt-*` / ops tokens, pixel-faithful to neighbouring DC screens. No new marketing look.
- Stripe extra-session shape for difference charges (one PaymentIntent vs new Checkout session) as long as amount = difference only, CHF, webhook confirms, trip unchanged until captured.
- Staff API shapes (`ops_assign_leg` vs patch) as long as D-43 exclusion is enforced in Postgres, not in the browser.

## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Product / GSD
- `.planning/ROADMAP.md` — Phase 8 success criteria (interpret hashes as D-10 paths)
- `.planning/REQUIREMENTS.md` — OPS-01, OPS-02, OPS-03, SITE-03, AUTH-06, DATA-08
- `.planning/PROJECT.md` — pre-booked transfer, no Uber
- `CLAUDE.md` — design laws, CHF 000, four languages, no glow

### Ops UI (the product)
- `app/ops/OpsDash.dc.html` — Money + Operation counts; expenses copy until cost sheet
- `app/ops/OpsBoard.dc.html`
- `app/ops/OpsCalendarBoard.dc.html`
- `app/ops/OpsDetail.dc.html`
- `app/ops/OpsCustomers.dc.html` (and customer history if present)
- `app/ops/OpsFleet.dc.html` — chauffeur attached to one vehicle
- `app/vamos-ops-data.js` — must serve staff API data, not fixtures
- `app/pages/bookings.dc.html` — customer trip list
- `app/pages/account.dc.html`

### Already-shipped APIs / SQL (extend, don’t fork)
- `apps/web/app/[locale]/(ops)/api/staff/bookings/route.ts` — GET list
- `apps/web/app/[locale]/(ops)/api/staff/bookings/[id]/route.ts` — PATCH cancel/refund/update (chauffeur is still a string — replace with D-43)
- `apps/web/lib/ops/bookings-write.ts`
- `packages/db/supabase/migrations/20260910000001_bookings_select_by_contact_email.sql`
- Phase 7 checkout / Stripe webhook / confirmation wait room (same pay path for phone booking)

### Do not follow
- `.planning/phases/08-ops-dispatch-live-board-assignment-account-surfaces/08-CONTEXT.md` decisions from **2026-08-25** (React ops routes, OpsDash out of scope, claim-guest dialog). This file supersedes them.

## Existing Code Insights

### Reusable Assets
- Staff GET `/api/staff/bookings` and PATCH cancel/refund/update — keep; assignment must stop being a free-text `chauffeur` field.
- `bookings_select_by_contact_email` — already the account list rule (D-05).
- Phase 7 quote engine, extras catalog, Stripe checkout/Payment Element, pay-link voucher mail, confirmation mail, webhook confirm.
- Phase 6 fleet tables + ops chrome (empty, not fixtures).
- Ops comments persistence (already shipping) — keep.

### Established Patterns
- Pixel-faithful DC port. Tokens only (`--vt-*`). Lucide via `Icon`.
- Hyperdrive to Supabase **direct** (not `:6543`). Ledger writes via SECURITY DEFINER / staff APIs, never browser service-role.
- Public wait room: voucher or error on the page, never silent. Phone booking unpaid uses the same idea on ops detail.

### Integration Points
- `dashboard.vamostaxi.site` Worker `vamos` (do not recreate `vamos-web-staging`).
- Stripe **test mode** only until Phase 11.
- Resend for pay-link, confirmation, refund, ops must-fix, chauffeur assign/unassign. Gmail is a copy. Tickets stay Postgres (`/support`).
- Mapbox for phone-booking places.

## Specific Ideas

- Owner: “nothing stays mock. Always live data.”
- Owner: “I don’t want a `#` in any URL.”
- Paid 200 → destination now 250 → pay-link for **50 only**; after capture the trip shows 250. Paid 200 → now 150 → refund **50** (auto if >24h, else ops Refund).
- Extra pay-links merge into one extra payment if they edit again before paying.
- Vehicle off-road while assigned = must-fix + ops email, not silent unassign.
- Chauffeur page is in this phase because assign is a lie without a real fleet row + email + vehicle.

## Deferred Ideas

- **Cost sheet / expense categories** (chauffeur pay, vehicles, fuel, …) — owner asked to “make the cost sheet exist”; that is its own phase. Expenses tile stays live `CHF 000` until then.
- Driver app / chauffeur push / WhatsApp-to-chauffeur as a product channel (email only this phase).
- Live GPS / nearest-driver.
- Auto-dispatch.
- Public marketing live sockets.
- Phase 7 UAT tests 2–9 — other session; not this phase’s close bar.
- Phase 9 leftover: only if something above was meant as later; **customer paid-edit request is in this phase (D-72)**. Remaining Phase 9 items (self-serve cancel UI if not already on manage-booking, etc.) stay on the roadmap unless already covered by D-58/D-71.

---

*Phase: 8-Ops Dispatch — Live Board, Assignment & Account Surfaces*
*Context gathered: 2026-09-10*
