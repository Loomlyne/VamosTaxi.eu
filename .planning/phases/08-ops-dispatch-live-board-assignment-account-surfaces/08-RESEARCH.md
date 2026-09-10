# Phase 8: Ops Dispatch — Live Board, Assignment & Account Surfaces - Research

**Researched:** 2026-09-10
**Domain:** DC ops console on `dashboard.vamostaxi.site` (Worker `vamos`) + staff Hyperdrive SQL + Phase 7 Stripe checkout RPCs + customer `/bookings`
**Confidence:** HIGH

Phases 3/5/6/7 **are executed and live** on Worker `vamos` / `vamostaxi.site` / `dashboard.vamostaxi.site`. Do not re-plan them. Do not treat the 2026-08-24 `08-RESEARCH.md` as current. Phase 7 UAT tests 2–9 continue in another session — do not rewrite `07-UAT.md`.

<user_constraints>
## User Constraints (from CONTEXT.md)

**CRITICAL:** If CONTEXT.md exists from /gsd:discuss-phase, copy locked decisions here verbatim. These MUST be honored by the planner.

### Locked Decisions

#### Carrying forward (do not reopen)

- **D-01:** DC ops is the product. Wire `app/ops` + `app/vamos-ops-data.js` to staff APIs. Do not resurrect React `/ops/bookings` from the 2026-08-25 context.
- **D-02:** Manual assign only. No auto-dispatch. No driver app. No Stripe Connect. No marketplace.
- **D-03:** Pay → booking confirmed automatically. Dispatcher still assigns by hand.
- **D-04:** Admin only: `koussayzayeni@gmail.com`. Staff tab stays gone. Support is `/support`, not Staff.
- **D-05:** Account Upcoming / See All = paid trips whose `contact_email` matches the signed-in JWT email. Guest checkout may leave `customer_id` null. Empty list is correct when emails differ. No claim-guest confirm dialog.
- **D-06:** Isolation-probe leftovers (`VT-48xx`, Isolation Customer*) are not product. Empty lists are empty. `emptyBookings` / fixture boards fail this phase.
- **D-07:** Public phone / WhatsApp `+41 79 626 70 82`. Charge always CHF. Public header FX is mark-only. Ops money is always CHF — no FX switcher.
- **D-08:** Return / hourly / cash-to-driver / PayPal / corporate invoice-on-account are out of V1.
- **D-09:** `CHF 000` until a real zero or a captured amount. Never invent fares. TBC pills stay TBC. Legal blanks stay TBC.

#### URLs

- **D-10:** **No `#` in any URL.** Ops hashes (`#dashboard`, `#bookings`, `#calendar`, `#customers`, `#fleet`, `#support`, `#pricing`) become real paths on `dashboard.vamostaxi.site` (e.g. `/dashboard`, `/bookings`, `/bookings/new`, `/bookings/{ref}`, `/calendar`, `/customers`, `/customers/{email}`, `/fleet`, `/fleet/chauffeurs/{id}`, `/support`, `/pricing`, `/login`). Public site stays path-based (`/bookings`, `/account`, `/manage/...`, `/checkout/...`). Planner picks exact path strings; do not leave hash-routed ops.

#### Phone booking pay

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

#### Phone booking screen

- **D-23:** **New trip** lives on `/bookings` (new-trip path). Same quote fields as the site, then Send pay-link or take card.
- **D-24:** After Save, land on **that trip’s detail**. Send pay-link or take card there.
- **D-25:** Take card on detail = **same card fields** as the public payment page.
- **D-26:** Quote first (no booking row until Continue/Save), same as the site.

#### Dashboard tiles

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

#### Board refresh

- **D-39:** Open ops pages **update in place** — no full reload. Silent (numbers and rows change). No sound.
- **D-40:** Two laptops with ops open: both update. Trip detail updates in place too (do not kick back to the list).
- **D-41:** Live updates also on signed-in customer `/bookings` and trip detail. Confirmation wait room already waits on the webhook. **Home/marketing does not live-update. No live GPS / driver map.**
- **D-42:** Implementation (Realtime vs poll vs visibility refetch) is Claude’s discretion as long as D-39–D-41 hold.

#### Assign

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

#### Ops refund / cancel

- **D-56:** Ops **Refund** = **full Stripe refund** when you click it. Trip stays paid until Stripe succeeds. If Stripe fails: **stay paid, show the error, try Refund again**. Never mark refunded without Stripe.
- **D-57:** **Cancel** and **Refund** are two actions. Cancel on a **paid** trip does not refund by itself.
- **D-58:** Customer Cancel (also this product, customer side may land with Phase 9 screens but the rule is locked now): **more than 24h before pickup** → auto full refund. **Inside 24h** → customer is told we emailed ops; dispatcher issues Refund by hand.
- **D-59:** Unpaid trip, Cancel in ops: **drop it**, no Stripe refund.
- **D-60:** Refund email to **contact email, plus company payer if different**.

#### #customers → `/customers`

- **D-61:** List **every booking email** — guest or account — with live trips under that email.
- **D-62:** Click a customer → **their trips (same board data) + contact**.
- **D-63:** No booking emails yet → **empty list**, not Isolation Customer*.
- **D-64:** Same email, two names → **one row per email**, latest name, all those trips.
- **D-65:** On the customer page you **can edit name / phone / email**; it **writes through** to those trips’ contact.

#### Edit after pay (ops + customer this phase)

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

### Deferred Ideas (OUT OF SCOPE)

- **Cost sheet / expense categories** (chauffeur pay, vehicles, fuel, …) — owner asked to “make the cost sheet exist”; that is its own phase. Expenses tile stays live `CHF 000` until then.
- Driver app / chauffeur push / WhatsApp-to-chauffeur as a product channel (email only this phase).
- Live GPS / nearest-driver.
- Auto-dispatch.
- Public marketing live sockets.
- Phase 7 UAT tests 2–9 — other session; not this phase’s close bar.
- Phase 9 leftover: only if something above was meant as later; **customer paid-edit request is in this phase (D-72)**. Remaining Phase 9 items (self-serve cancel UI if not already on manage-booking, etc.) stay on the roadmap unless already covered by D-58/D-71.
- React `/ops` resurrection.
- Inventing CHF or legal copy.
- Phase 11 live DNS / Stripe live keys.
</user_constraints>

<architectural_responsibility_map>
## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Path-based ops chrome (kill hashes) | Browser/Client (`app/ops/*.dc.html`) | Frontend Server (`apps/web/middleware.ts` `serveOpsDc`) | DC SPA is the product. Middleware currently collapses every dashboard path to `/` and injects hash routing. Paths must be served as the same HTML without a reload. |
| Live board / calendar / dash tiles | Browser/Client (`vamos-ops-data.js` + DC) | API/Backend (`GET /api/staff/bookings`) | Store already hydrates staff JSON. In-place updates are client subscribe + refetch. Money math must move to captured_at, not pickup date. |
| Phone booking (quote → unpaid row) | API/Backend (`POST /api/quote` + `POST /api/checkout/intent`) | Database (`checkout_create_booking`) | Same quote engine and SECURITY DEFINER writer as the public site. No staff INSERT into `bookings` / `booking_payments`. |
| Take card in ops / pay-link | API/Backend (existing Checkout Session + `/api/checkout/pay-link`) | Browser (Payment Element on ops detail; public `/checkout/pay/{token}`) | Stripe test mode, CHF. Webhook confirms. Never mark paid in the browser. |
| Assign / unassign | Database (`booking_legs` GiST EXCLUDE) | API/Backend (new staff RPC, not free-text PATCH) | Exclusion already exists. Current PATCH writes chauffeur by name and skips vehicle. Postgres must set chauffeur+vehicle together and refuse 23P01. |
| Fleet chauffeur ↔ vehicle persist | API/Backend (`PATCH /api/staff/chauffeurs/:id`) | Browser (`OpsFleet` + `restCollection`) | Column is `chauffeurs.default_vehicle_id`. Save must round-trip; D-43 is a lie until it does. |
| Full Stripe refund | API/Backend (`stripe.refunds.create` then RPC) | Database (`booking_refunds` + `booking_events`) | `createRefund` exists unused. Today’s PATCH `status=refunded` is a ledger lie. |
| Extra fare / paid edit | Database (new snapshot + extra `booking_payments` row) | API/Backend (Checkout session for difference; webhook settle that does **not** rewind pending→paid) | `tg_payment_matches_snapshot` requires `charged_rappen = snapshot.total_rappen`. Difference cannot reuse the original snapshot. |
| `/customers` | API/Backend (`loadCustomers` union) | Browser (`OpsCustomers`) | Already unions booking emails. Paths + empty-not-Isolation + write-through already partially exist. |
| Customer `/bookings` | Database (RLS `bookings_select_own` on `contact_email`) | API/Backend (`GET /api/account/bookings`) | Policy shipped 2026-09-10. Route still drops chauffeur/vehicle and excludes quote/pending (correct for D-05 paid list). |
| Timeline (DATA-08) | Database (`booking_events`) | API/Backend (SECURITY DEFINER inserts inside the same tx as the state change) | Checkout settle already writes events. Staff cancel/assign/refund currently do not. |
| Emails | API/Backend (`@vamos/emails` + Resend) | — | Pay-link / confirmation / refund exist. Chauffeur assign/unassign and ops must-fix do not. Gmail is a copy. |
</architectural_responsibility_map>

<research_summary>
## Summary

Phase 8 is a **wiring and honesty** phase, not a greenfield ops app. The DC console on `dashboard.vamostaxi.site` already hydrates `GET /api/staff/bookings` (no `emptyBookings`). Fleet, customers, checkout, webhook confirm, and `bookings_select_by_contact_email` already ship. What fails the close bar is: **hash URLs**, **assign-by-typed-name with no vehicle and no Postgres overlap message**, **Refund that flips status without Stripe**, **dashboard money filtered by pickup date with mock expense rows**, **15s poll that is “live enough” only if visibility refetch is added and Realtime is not invented**, **phone booking with no staff create path**, **account list missing chauffeur/vehicle**, and **Fleet Save that does not prove `default_vehicle_id`**.

The standard approach in this repo is already the right one: DC mocks as UI; staff JSON via `withStaff` + `asStaff` on Hyperdrive **direct**; money and assignment writes via **SECURITY DEFINER RPCs** (same family as `checkout_create_booking` / `checkout_payment_settle`); Stripe **test** Checkout Sessions `ui_mode: "elements"` charged in CHF; Resend for mail. Do not add React `/ops`, Vercel, Stripe Connect, or a driver app.

**Primary recommendation:** Keep `app/ops` + `vamos-ops-data.js`. Teach middleware to serve `ops.dc.html` on real paths. Replace chauffeur string PATCH with `ops_assign_leg` that writes chauffeur **and** `default_vehicle_id` under the existing GiST exclusion. Reuse Phase 7 quote/intent/pay-link/webhook for phone booking and extra fares (extra fare = **new snapshot for the difference**, not a second charge against the original snapshot). Call `createRefund` **before** any `refunded` status. Poll + visibility refetch for live boards (Realtime is explicitly off ops tables).
</research_summary>

<standard_stack>
## Standard Stack

The established libraries/tools for this domain **are already in the repo**. Do not add a second stack.

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| DC ops mocks | `app/ops/*.dc.html` + `app/vamos-ops-data.js` | Product UI | D-01. Pixel-faithful `--vt-*`. Lucide via `Icon`. |
| Next.js + OpenNext | next `15.5.25`, `@opennextjs/cloudflare` `1.20.2` | Worker adapter | Live on Worker **`vamos`** only. |
| wrangler | `4.124.0` | Deploy | `env.staging.name = "vamos"`. Routes: `vamostaxi.site`, `www.vamostaxi.site`, `dashboard.vamostaxi.site`. Do not recreate `vamos-web-staging`. |
| postgres.js | `3.4.9` | Hyperdrive SQL | `asStaff` / `asCheckout` / `asCustomer` in `apps/web/lib/db/identity.ts`. Direct URL, never `:6543`. |
| Stripe | `stripe` `22.6.1`, API `2026-08-26.dahlia` | Checkout Sessions, refunds | `apps/web/lib/checkout/stripe.ts`. `ui_mode: "elements"` (not legacy `custom`). Test keys only. Charge CHF. |
| `@stripe/stripe-js` / react-stripe-js | `9.15.0` / `6.9.0` | Payment Element | Public payment page. Ops take-card reuses the same fields/session. |
| `@supabase/ssr` + `@supabase/supabase-js` | `0.12.5` / `2.112.4` | Staff/customer JWT | Dashboard gate + RLS. Not for ledger writes. |
| Resend | `6.24.0` + `@vamos/emails` | Pay-link, confirmation, refund | `sendPayLink`, `sendConfirmation`, `sendRefund` exist. Chauffeur assign mail is new. |
| zod | `4.4.3` | Intent bodies | `checkoutIntentSchema`. |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Mapbox (existing `/api/geo/*`) | bound secret | Places on phone booking | D-19. Same as public quote. Do not invent a second geocoder. |
| `btree_gist` | PG extension (Phase 2) | `EXCLUDE USING gist` | Already on `booking_legs`. Do not re-implement overlap in JS. |
| Cloudflare Queue `vamos-stripe-events-staging` | wrangler queues | Webhook consumer | Extra captures and refunds.charge.refunded go through the same verify→record→enqueue path. |
| Vitest `4.1.11` | — | File-proof tests | Follow `ops-live-data.test.ts` style: assert no `emptyBookings`, no Isolation names, no hash hrefs after the cut. |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Path-based DC SPA | Next.js React ops routes | Forbidden (D-01). 2026-08-25 context is dead. |
| Supabase Realtime on `bookings` | Poll + visibility refetch | `20260823000023_rls_staff.sql` states **no ops table joins `supabase_realtime`**. Enabling Realtime is a schema policy change, not a free client option. |
| PaymentIntent-only extra charge | New Checkout Session `ui_mode: elements` | Session path already has idempotency, expire, webhook settle, pay-link. PI-only skips pay-link email and Elements chrome. Prefer a **new Checkout Session** whose `unit_amount` is the difference, with a **new snapshot**. |
| Browser `asStaff INSERT` into `booking_payments` | SECURITY DEFINER RPC | RLS + append-only revoke writes. Staff JWT cannot legally insert payments. |
| `markRefunded` status PATCH | `stripe.refunds.create` then RPC | D-56. Status-first is a ledger lie. |
| Driver WhatsApp | Resend email | Out of scope. |

**Installation:** none. Do not `npm install` a new framework. Add only a chauffeur-assign email template under `packages/emails` if missing (it is missing today).
</standard_stack>

<architecture_patterns>
## Architecture Patterns

### System Architecture Diagram

```
Staff browser (dashboard.vamostaxi.site)
  │  GET /dashboard|/bookings|/bookings/{ref}|/calendar|/customers|/fleet|...
  │  middleware serveOpsDc → app/ops/ops.dc.html  (NO hash, NO redirect-to-/)
  ▼
VamosOps (vamos-ops-data.js)
  │  GET /api/staff/bookings|vehicles|chauffeurs|customers
  │  poll + visibility refetch (silent in-place)
  ▼
withStaff → asStaff(Hyperdrive DIRECT) → Postgres
  │
  ├─ Phone Save ──► POST /api/quote ──► POST /api/checkout/intent
  │                      │                    │
  │                      ▼                    ▼
  │                 quote engine      asCheckout → checkout_create_booking
  │                                   Stripe Checkout Session (CHF, elements)
  │                                   unpaid row visible on board (D-13)
  │
  ├─ Pay-link ──► POST /api/checkout/pay-link  (same session unless amount changed)
  │                 Resend PayLinkEmail → public /checkout/pay/{token}
  │
  ├─ Take card ──► Payment Element on OpsDetail using existing client_secret
  │
  ├─ Stripe webhook ──► stripe_event_record → Queue → checkout_payment_settle
  │                         pending → paid → confirmed + booking_events
  │
  ├─ Assign ──► POST /api/staff/bookings/{id}/assign
  │                 ops_assign_leg(chauffeur_id)  [NOT free-text name]
  │                 set assigned_chauffeur_id + assigned_vehicle_id
  │                 EXCLUDE gist → 23P01 → return other ref+time
  │                 booking_events assignment.* + Resend chauffeur mail
  │
  ├─ Refund ──► Stripe refunds.create(full)  THEN  ops_refund_record
  │                 fail → stay paid, surface error
  │
  └─ Extra fare ──► new chargeable snapshot (difference only)
                    new Checkout Session / pay-link
                    trip columns unchanged until extra captured
                    extra settle does NOT run pending→paid machine

Customer browser (vamostaxi.site)
  GET /bookings → /api/account/bookings
  asCustomer + RLS bookings_select_own (customer_id OR lower(contact_email)=jwt email)
  paid trips only; chauffeur+vehicle from fleet row or empty
```

### Recommended Project Structure

```
app/ops/                          # product UI (extend, do not fork)
  ops.dc.html                     # path router (replace readHash)
  OpsSidebar.dc.html              # href=/dashboard etc.
  OpsDash.dc.html                 # captured_at money; live zeros
  OpsBoard.dc.html / OpsCalendarBoard.dc.html / OpsDetail.dc.html
  OpsFleet.dc.html                # persist default_vehicle_id; chauffeur page
  OpsCustomers.dc.html            # /customers/{email}

app/vamos-ops-data.js             # restCollection: object afterWrite, bookings poll+visibility
app/pages/bookings.dc.html        # already fetches /api/account/bookings; kill VT-48xx fallback

apps/web/middleware.ts            # serveOpsDc on D-10 paths; stop 307 everything to /
apps/web/lib/ops/bookings-write.ts
apps/web/lib/ops/assign.ts        # NEW: wrap ops_assign_leg, map 23P01
apps/web/lib/ops/refund.ts        # NEW: Stripe then RPC
apps/web/lib/checkout/stripe.ts   # reuse createCheckoutSession / createRefund
apps/web/app/api/staff/bookings/  # GET stays; add assign/unassign/pay-link/refund actions
packages/db/supabase/migrations/20260910*ops_assign*.sql   # NEW RPCs + edit-request table
packages/emails/src/              # chauffeur assign/unassign + ops must-fix
```

### Pattern 1: Path-based DC console (kill hashes)

**What:** Same `ops.dc.html` document, `history.pushState` + `popstate`, middleware serves that HTML for every ops path.
**When to use:** All dashboard navigation (D-10).
**Evidence:** `dashboardHostMiddleware` today: if staff and `path !== "/"` → **307 to `/`**, then `serveOpsDc(..., "ops.dc.html")`. `ops.dc.html` `readHash()` + `location.replace('#dashboard')`. Matcher already excludes `/api/*`.

**Do:**
1. Allowlist paths on the named dashboard host; serve `ops.dc.html` for each (keep `/login` → `ops-login.dc.html`).
2. Replace `readHash` with `readPath(location.pathname)` (strip locale prefix the same way middleware does).
3. Intercept sidebar clicks: `history.pushState` + setState — no full reload (D-39).
4. One-shot migrate: if `location.hash` is present, `replaceState` to the path and clear the hash. Do not keep hash as a product URL.
5. Keep injected `<base href="/app/ops/">` for DC asset URLs; navigation hrefs must be **root-absolute** (`/bookings`, not `bookings`).

Recommended path map (planner may rename; do not leave hashes):

| Today | Path |
|-------|------|
| `#dashboard` | `/dashboard` (optional 308 `/` → `/dashboard`) |
| `#bookings` | `/bookings` |
| new trip | `/bookings/new` |
| `#detail/{ref}` | `/bookings/{ref}` |
| `#calendar` | `/calendar` |
| `#customers` | `/customers` |
| customer editor | `/customers/{email}` |
| `#vehicles` / `#chauffeurs` | `/fleet` / `/fleet/chauffeurs` |
| chauffeur page | `/fleet/chauffeurs/{id}` |
| `#support` | `/support` |
| `#pricing` | `/pricing` |
| `#login` | `/login` |
| `#profile` / `#settings` / `#coupons` / `#reviews` | `/profile` `/settings` `/coupons` `/reviews` |

ROADMAP success criteria still say `#dashboard`. Interpret those as these paths.

### Pattern 2: Staff JSON + SECURITY DEFINER for money/assignment

**What:** `withStaff` + `jsonOk({ ok, data })` for reads. Ledger writes go through SECURITY DEFINER RPCs granted to `vamos_system` / a staff-definer role — never browser service-role, never `asStaff INSERT` on `booking_payments`.
**When to use:** assign, refund, extra payment, cancel-with-events, paid-edit accept.
**Example (existing checkout writer — copy this shape, do not INSERT):**

```typescript
// Source: apps/web/lib/checkout/create-booking.ts
await sql`
  select * from public.checkout_create_booking(
    ${args.quoteId}::uuid,
    ${args.idempotencyKey},
    ...
  )
`;
```

### Pattern 3: Assign in one statement (chauffeur implies vehicle)

**What:** Dispatcher sends `chauffeurId` only. RPC loads `chauffeurs.email` and `default_vehicle_id`, refuses nulls, sets both FKs on the **leg**, snapshots turnaround via existing `tg_leg_snapshot_buffer`, writes `booking_events`.
**When to use:** Every assign / swap / unassign.
**Postgres already owns overlap:**

```sql
-- Source: packages/db/supabase/migrations/20260823000011_booking_legs.sql
exclude using gist (assigned_chauffeur_id with =, scheduled_range with &&)
  where (assigned_chauffeur_id is not null and status not in ('cancelled','no_show'))
  deferrable initially immediate;
```

Swap uses `SET CONSTRAINTS booking_legs_chauffeur_no_overlap DEFERRED` inside one transaction (comment in that migration). Unassign sets both FKs null.

### Pattern 4: Extra fare = new snapshot + new session

**What:** `tg_payment_matches_snapshot` rejects `charged_rappen <> snapshot.total_rappen`. A CHF 50 top-up cannot attach to a CHF 200 snapshot.
**When to use:** D-67 / D-73.
**Do:** Insert a chargeable price_snapshot whose `total_rappen` is the difference (and `booking_id` is the trip). Create a Checkout Session for that amount. Metadata `{ booking_id, kind: "extra", extra_id }`. Webhook consumer settles the extra **payment row only**; do not run the pending→paid→confirmed block on an already-confirmed booking. Apply pending trip edits in that same extra-settle transaction.

### Anti-Patterns to Avoid

- **React `/ops` resurrection:** 2026-08-25 context. Forbidden.
- **Hash URLs as “fine for now”:** D-10. Middleware 307-to-`/` is the bug, not a feature.
- **Assign by `full_name` string:** `bookings-write.ts` `updateBooking` does `id::text = chauffeur or full_name = chauffeur` and does **not** set `assigned_vehicle_id`. Overlap can pass; D-43 fails.
- **Local `assigned: { [booking.id]: name }` in OpsDetail:** assign dialog never PATCHes. In-memory only.
- **PATCH `status=refunded` then email:** current `[id]/route.ts`. Violates D-56.
- **Cancel paid → refund-pending email:** current `cancelBooking` + `refundMail(..., "pending")`. Violates D-57.
- **Dashboard `EXPENSES = ['Chauffeur pay', ...]`:** D-37. Real zero, no placeholder rows.
- **Income filtered by `dateIso` (pickup):** D-29 requires captured_at for money.
- **`emptyBookings` / `VT-48xx` / Isolation Customer* fallbacks:** fail the phase even if “only for preview”.
- **Enabling `supabase_realtime` on ops tables** to dodge poll work: schema forbids it.
- **Guessing Stripe fee CHF:** D-31. Missing fee → no line.
- **Staff POST that INSERTs `booking_payments`:** use checkout RPC.
- **Worker `vamos-web-staging`:** do not recreate. Staging name is `vamos`.
</architecture_patterns>

<dont_hand_roll>
## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Overlap detection | JS interval math / “check the board” | `booking_legs_chauffeur_no_overlap` / `_vehicle_no_overlap` | Empty `tstzrange` is a silent no-op; duration floor and assignable CHECK already exist. |
| Quote / extras / Mapbox | A second ops pricer | `POST /api/quote`, `/api/geo/suggest`, extras catalog, `/api/flight/[no]` | D-19/D-17/D-21. Invented CHF is a product fail. |
| Unpaid booking row | `asStaff INSERT INTO bookings` | `checkout_create_booking` via `POST /api/checkout/intent` | Only writer of checkout bookings. Idempotency, snapshot, payment attempt, manage token, events. |
| Pay-link | Custom token email | `POST /api/checkout/pay-link` + `PayLinkEmail` | D-14/D-22. Same unpaid session. |
| Card fields | A new ops card form | Stripe Payment Element (`ui_mode: elements`) | Same chrome as public payment. PCI. |
| Refund | Status flag | `createRefund` in `lib/checkout/stripe.ts` then `booking_refunds` | Unique `stripe_refund_id`. Append-only. |
| Timeline | Client-side `evQuote` labels | `booking_events` rows | DATA-08 / OPS-02. Checkout settle already inserts. |
| Customer list identity | Isolation fixtures | `loadCustomers` union on `lower(contact_email)` | Already shipped. |
| Account claim dialog | “Is this your booking?” modal | RLS `bookings_select_own` on JWT email | D-05 / AUTH-06 without a dialog: same email sees the trip. |
| Live sockets | Custom WS on the Worker | `restCollection` poll + `visibilitychange` + `focus` | Realtime publication is off. Confirmation wait room already polls 1s. |
| FX in ops | Currency switcher | CHF only | D-07. |

**Key insight:** Phase 7 already solved “create unpaid row, take CHF, confirm on webhook”. Phase 2 already solved “driver cannot overlap”. Phase 8’s job is to **call those**, not re-derive them in the DC script.
</dont_hand_roll>

<common_pitfalls>
## Common Pitfalls

### Pitfall 1: Middleware 307-to-`/` makes path routing impossible
**What goes wrong:** `/bookings` never renders; staff always land on `/#dashboard`.
**Why it happens:** `dashboardHostMiddleware` redirects any in-console path other than `/` to `/`. Hash router is the only navigation that survives.
**How to avoid:** Serve `ops.dc.html` for the D-10 allowlist. Do not redirect `/bookings` → `/`. `/api/*` stays out of the matcher.
**Warning signs:** Playwright still sees `location.hash`. `href="#bookings"` in sidebar.

### Pitfall 2: Assign writes a name, not a vehicle
**What goes wrong:** Board shows a driver; `assigned_vehicle_id` is null; overlap on the car is unenforced; customer sees a name with no car; chauffeur without email still assigns.
**Why it happens:** `updateBooking` matches `full_name`; OpsDetail `chauffeurNames()` feeds the select; dialog only `setState`s local `assigned`.
**How to avoid:** Picker options = chauffeur **uuid** + label. RPC requires email + `default_vehicle_id`. One UPDATE sets both FKs. Catch `23P01` (not in `sqlstate.ts` today — add it) and SELECT the other leg’s `reference` + `scheduled_local`.
**Warning signs:** `pickDriver` is a display string. Network tab has no assign POST.

### Pitfall 3: Fleet Save looks saved until reload
**What goes wrong:** D-43 “vehicle follows” is a lie.
**Why it happens:** `restCollection.save()` is emit-only. `afterWrite` uses `pickRows` which only accepts **arrays**; PATCH returns `{ ok, data: object }`, so the client keeps a generated `c-…` / `v-…` id and the next PATCH 400s `isUuid`. `parseChauffeurBody` *does* map `vehicle` → `defaultVehicleId` — the HTTP door is fine if the client sends a uuid.
**How to avoid:** After POST/PATCH, replace the row with `json.data` (object). Never PATCH a non-uuid. Prove with: Save chauffeur+vehicle → reload → `default_vehicle_id` still set. OpsFleet `onSave` must `upsert` and wait for `ok`.
**Warning signs:** Ids like `c-m5x…`. Reload empties the vehicle column.

### Pitfall 4: `booking_legs_assignable` / empty range
**What goes wrong:** Assign “works” and two trips overlap, or assign 23514s with no UI.
**Why it happens:** Generated `scheduled_range` uses `greatest(duration, 30)`. Assignable CHECK requires `estimated_duration_minutes > 0` and buffer once a resource is set. Checkout `lock-to-rpc.ts` already sends `estimated_duration_minutes: round(duration_s/60)`. Phone booking must use the same quote legs or assign refuses.
**How to avoid:** Phone Save goes through quote lock, not a text-only staff insert. Surface CHECK/23P01 as honest copy, not a toast “saved”.
**Warning signs:** Legs with `estimated_duration_minutes` null on the board.

### Pitfall 5: Extra charge hits `tg_payment_matches_snapshot`
**What goes wrong:** Difference PaymentIntent inserts fail `restrict_violation` because 5000 rappen ≠ original 20000.
**Why it happens:** Trigger on `booking_payments` requires charge = that snapshot’s total.
**How to avoid:** New snapshot for the difference. New session. Extra settle path that does not flip `pending`→`confirmed` again.
**Warning signs:** Stripe charged the customer, booking_payments insert 500s, trip still “as-is” forever.

### Pitfall 6: Refund status without Stripe
**What goes wrong:** Ops clicks Refund, trip says refunded, card not credited.
**Why it happens:** `markRefunded` is an UPDATE status gated on `cancelled|refunded`. `createRefund` is unused.
**How to avoid:** Stripe first. Persist `booking_refunds.stripe_refund_id`. On Stripe error, keep paid and return `{ ok:false, code }`. Cancel unpaid = drop (D-59) with no Stripe call. Cancel paid = status cancelled only (D-57).
**Warning signs:** Refund email “issued” with null `stripe_refund_id`.

### Pitfall 7: Dashboard money uses pickup date + mock expenses
**What goes wrong:** Today’s income includes tomorrow’s prepaid trip; Expenses shows “Chauffeur pay”.
**Why it happens:** `OpsDash` `inPeriod(b.dateIso)` and `EXPENSES = ['Chauffeur pay', ...]`. `totalRappen` is latest payment charged, not captured-in-period. Unassigned count includes unpaid (mixes D-30 buckets).
**How to avoid:** Board mapper must expose `capturedAt` (Zurich day). Income/avg/class breakdown = captured in period. Operation tiles = pickup day. Expenses = `CHF 000` and **no child rows**. Money-out = refund rows + Stripe fee lines only.
**Warning signs:** Copy “Chauffeur pay, vehicles, fees”. Hardcoded refunds count `'0'`.

### Pitfall 8: Treating Realtime as the default
**What goes wrong:** Plan adds `supabase.channel('bookings')` that never fires.
**Why it happens:** Staff RLS migration comment: no ops table in `supabase_realtime`.
**How to avoid:** Discretion D-42: shorten bookings poll when `document.visibilityState==='visible'` (3s is enough; confirmation already uses 1s), pause when hidden, refetch on `focus`/`visibilitychange`. `OpsDash`/`OpsBoard`/`OpsDetail`/`OpsCalendarBoard` already `onChange` → `forceUpdate`. Two laptops = two pollers. Customer `/bookings` gets the same visibility refetch on `/api/account/bookings`.
**Warning signs:** New supabase publication migration “for live board”.

### Pitfall 9: Account list ≠ D-05 / D-50
**What goes wrong:** Signed-in guest-email user sees empty; or sees unpaid quotes; or a fake driver name.
**Why it happens:** Policy matches `contact_email` (good). Route filters `status not in ('quote','pending')` (good for paid). Mapper `vehicle` is **class slug**, not fleet model/plate; no chauffeur columns; `href` is `/confirmation/{ref}`.
**How to avoid:** Join assigned chauffeur + vehicle; empty string until assigned. Do not use Isolation names. Do not add a claim dialog (D-05). AUTH-06 = same email + RLS, not a modal.
**Warning signs:** `VT-4821` in `bookings.dc.html` preview leaking into runtime `rows` when fetch fails — catch already sets `[]`; keep it that way.

### Pitfall 10: Hyperdrive pooler / Worker name
**What goes wrong:** Session/RLS bleed or a second Worker.
**Why it happens:** Historical `:6543` and `vamos-web-staging`.
**How to avoid:** Direct Postgres URL only. Worker name `vamos`. Stripe test. Admin `koussayzayeni@gmail.com`.
**Warning signs:** wrangler env other than `vamos` on staging domains.

### Pitfall 11: Unpaid edit in ops
**What goes wrong:** Dispatcher edits an unpaid phone row and desyncs the open Checkout Session amount.
**Why it happens:** D-70: unpaid in ops = cancel + new trip. Current `updateBooking` allows field PATCH on any status.
**How to avoid:** Refuse unpaid PATCH except cancel / send-pay-link / take-card. Amount change → new session (D-22).
**Warning signs:** `sessionIsPayable` amount mismatch; Elements won’t confirm.
</common_pitfalls>

<code_examples>
## Code Examples

Verified from this repo (2026-09-10), not from August research.

### Staff board read (keep; extend columns)

```typescript
// Source: apps/web/lib/ops/bookings.ts
left join public.chauffeurs ch on ch.id = l.assigned_chauffeur_id
left join lateral (
  select * from public.booking_payments pay
  where pay.booking_id = b.id
  order by pay.created_at desc
  limit 1
) p on true
```

Planner must also select `l.assigned_chauffeur_id`, `l.assigned_vehicle_id`, vehicle plate/model, `ch.email`, `p.captured_at`, and **sum of captured payments / refunds** for D-29/D-31 — latest payment only is not enough once extras exist.

### Account RLS (already the D-05 rule)

```sql
-- Source: packages/db/supabase/migrations/20260910000001_bookings_select_by_contact_email.sql
create policy bookings_select_own on public.bookings
  for select to authenticated
  using (
    (select app.uid()) is not null
    and (
      customer_id in (select c.id from public.customers c where c.user_id = (select app.uid()))
      or (
        contact_email is not null
        and lower(contact_email::text) = lower(nullif((select app.jwt() ->> 'email'), ''))
      )
    )
  );
```

### Stripe refund helper (call this; do not rewrite)

```typescript
// Source: apps/web/lib/checkout/stripe.ts
export async function createRefund(stripe, input: {
  paymentIntentId: string;
  amountRappen: number;
  idempotencyKey: string;
}): Promise<Stripe.Refund> {
  return stripe.refunds.create(
    { payment_intent: input.paymentIntentId, amount: input.amountRappen, reason: "requested_by_customer" },
    { idempotencyKey: input.idempotencyKey },
  );
}
```

Full refund: `amountRappen = captured charged_rappen` (sum captured extras if any — product says **full**). Idempotency key `refund:{bookingId}:{paymentId}`.

### Checkout session (phone booking + extra)

```typescript
// Source: apps/web/lib/checkout/stripe.ts
ui_mode: "elements",           // Stripe 2026-03-25.dahlia renamed custom → elements
currency: CHARGE_CURRENCY,     // CHF
adaptive_pricing: { enabled: true },
metadata: { booking_id, booking_reference },
```

Extra session: `unit_amount = differenceRappen`, metadata `kind: "extra"`. Reuse `sessionIsPayable` amount check.

### 15s poll today (extend, don’t throw away)

```javascript
// Source: app/vamos-ops-data.js restCollection
if (name === "bookings") {
  clearTimeout(pollTimer);
  pollTimer = setTimeout(function () { loaded = false; hydrate(); }, 15000);
}
```

Change: visible interval ~3s, hidden pause, `document.addEventListener("visibilitychange")` sets `loaded=false; hydrate()`. Same pattern on `GET /api/account/bookings` for D-41.

### Exclusion violation code to add

```typescript
// Source: apps/web/lib/ops/sqlstate.ts — 23P01 is missing
// exclusion_violation = 23P01 (booking_legs_chauffeur_no_overlap)
```

On 23P01, query the conflicting leg (`assigned_chauffeur_id`, `scheduled_range &&`, other `booking_id`) and return `{ code: "overlap", otherRef, otherLocal }` for D-47 copy.

### Customer write-through (already)

```typescript
// Source: apps/web/lib/ops/customers.ts upsertCustomer
update public.bookings set
  contact_name = ${input.fullName},
  contact_email = ${input.email},
  contact_phone = ${input.phone}
where ... lower(contact_email) = previous OR new email
```

Keep this for D-65. Path `/customers/{email}` should PATCH by the list id (customer uuid **or** booking-sourced uuid from `array_agg`).
</code_examples>

<sota_updates>
## State of the Art (2024-2026)

| Old Approach (Aug 24 08-RESEARCH / Aug 25 context) | Current (2026-09-10 live) | When Changed | Impact |
|----------------------------------------------------|---------------------------|--------------|--------|
| Phases 3/5/6/7 not executed | Live on Worker `vamos`, `vamostaxi.site`, `dashboard.vamostaxi.site` | Phases 5–7 | Do not re-scaffold checkout, fleet, or public pages |
| React `/ops/bookings` | DC `app/ops` + `vamos-ops-data.js` | Phase 6 replan | D-01 |
| Checkout `ui_mode: custom` | `ui_mode: "elements"` | Stripe 2026-03-25.dahlia / stripe@22.6.1 | Do not pass the legacy string |
| `publicSql` insert `stripe_events` | `stripe_event_record` SECURITY DEFINER | Phase 7 | Same rule for refunds/extras |
| Claim-guest dialog | RLS on `contact_email` | 20260910000001 | D-05 / AUTH-06 |
| Hash ops console | Still hashes; this phase kills them | now | middleware + `ops.dc.html` |
| Realtime for OPS-01 | Explicitly not on ops tables | Phase 2 RLS | Poll + visibility |

**New tools/patterns to consider:**
- Stripe Checkout Session extra line for difference (not a second product SKU).
- `balance_transaction.fee` on the Charge for D-31 Stripe fee — **only if Stripe returns it**; otherwise omit the line.
- `BroadcastChannel('vamos-ops')` as a same-browser multi-tab hint on top of poll (optional; two laptops still need HTTP refetch).

**Deprecated/outdated:**
- August 24 `08-RESEARCH.md` (Phases 3/5/6/7 “not executed”).
- August 25 Phase 8 context (React ops, OpsDash out of scope, claim-guest).
- `emptyBookings()` / Isolation Customer* / `VT-48xx` as board data.
- `mark paid outside Stripe`.
- Worker name `vamos-web-staging`.
- Hash URLs as the ops IA.
</sota_updates>

<open_questions>
## Open Questions

1. **Exact D-10 path strings**
   - What we know: owner examples listed in D-10. Current hashes also include `#vehicles`, `#chauffeurs`, `#coupons`, `#reviews`, `#profile`, `#settings`, `#detail/{id}`.
   - What's unclear: whether `/` 308s to `/dashboard`, and whether fleet is `/fleet` vs `/vehicles`.
   - Recommendation: planner picks one table, puts it in PLAN.md, updates sidebar + middleware allowlist together. Collapse `#vehicles`/`#chauffeurs` under `/fleet` as CONTEXT shows.

2. **Stripe processing fee availability**
   - What we know: no `stripe_fee` column today. D-31 forbids guessing CHF.
   - What's unclear: whether the webhook payload’s Charge `balance_transaction` is expanded in `stripe_events.payload`.
   - Recommendation: on settle, if fee minor units present, store them on the payment row (new nullable column) and show the Money-out line. If absent, no line. Do not call a second Stripe retrieve just to invent a fee if the object has none.

3. **Chauffeur email language**
   - What we know: `chauffeurs.languages text[]` (ISO codes). D-51 = language from the fleet row. Email locales in `@vamos/emails` are `en|de|fr|ar`.
   - What's unclear: if the array is `['it','en']` or empty.
   - Recommendation: first of `de,fr,ar,en` present in the array, else `en`. Do not invent copy.

4. **Paid-edit request storage**
   - What we know: no table yet. D-72/D-73/D-74 need pending payload, exact diff, merge into one extra payment.
   - What's unclear: whether to jsonb on `bookings` or `booking_edit_requests`.
   - Recommendation: new append-friendly `booking_edit_requests` (id, booking_id, actor, payload, quote snapshot id, status requested/accepted/superseded, extra_payment_id). Merge by superseding the previous requested row and summing extra rappen into one session (expire old extra session if amount changed — unlike D-22 unpaid original).

5. **Customer cancel UI vs Phase 9**
   - What we know: D-58 locked now; Phase 9 still owns lifecycle screens. CONTEXT says do not steal remaining Phase 9 items except paid-edit request.
   - What's unclear: how much cancel UI already exists on manage-booking.
   - Recommendation: implement the **rule** (API: >24h auto full refund; inside 24h notify ops) if a manage-booking cancel control already exists; do not build a new Phase 9 detail shell. Do not rewrite `07-UAT.md`.

6. **`ops_assign_leg` grant role**
   - What we know: checkout RPCs are `vamos_checkout` / `vamos_system`. Staff reads are `asStaff`.
   - What's unclear: whether to grant execute to `vamos_staff` or wrap with `vamos_system` and call from asStaff via `set role` / definer.
   - Recommendation: follow settlement style — SECURITY DEFINER, `search_path = ''`, EXECUTE not granted to `anon`/`authenticated`/Data API. Worker calls it through the same Hyperdrive role that already executes checkout RPCs **or** a new `asSystem` helper. Never from the browser JWT.

These are planning choices, not research blockers.
</open_questions>

<sources>
## Sources

### Primary (HIGH confidence)

- `.planning/phases/08-ops-dispatch-live-board-assignment-account-surfaces/08-CONTEXT.md` (2026-09-10) — locked decisions
- `.planning/ROADMAP.md` Phase 8 — interpret `#…` as D-10 paths
- `.planning/REQUIREMENTS.md` — OPS-01, OPS-02, OPS-03, SITE-03, AUTH-06, DATA-08 (OPS-04/OPS-05 also in this phase per CONTEXT)
- `CLAUDE.md` — DC tokens, CHF 000, four languages, no glow
- `apps/web/app/[locale]/(ops)/api/staff/bookings/route.ts` — GET `loadBookings` only
- `apps/web/app/[locale]/(ops)/api/staff/bookings/[id]/route.ts` — PATCH cancel/refund/update (chauffeur string)
- `apps/web/lib/ops/bookings-write.ts`, `bookings.ts`, `bookings-map.ts`
- `app/vamos-ops-data.js` — `restCollection('bookings')`, 15s poll, `save()` no-op
- `app/ops/ops.dc.html`, `OpsSidebar.dc.html`, `OpsDash.dc.html`, `OpsBoard.dc.html`, `OpsDetail.dc.html`, `OpsFleet.dc.html`, `OpsCustomers.dc.html`, `OpsCalendarBoard.dc.html`
- `apps/web/middleware.ts` — `serveOpsDc`, 307-to-`/`, matcher excludes `/api/*`
- `apps/web/wrangler.jsonc` — `env.staging.name = "vamos"`, dashboard custom domain
- `packages/db/supabase/migrations/20260823000011_booking_legs.sql` — GiST EXCLUDE, assignable CHECK
- `packages/db/supabase/migrations/20260823000005_fleet.sql` — `default_vehicle_id`
- `packages/db/supabase/migrations/20260823000014_payments_refunds.sql` — `tg_payment_matches_snapshot`, `booking_refunds`
- `packages/db/supabase/migrations/20260823000016_booking_events.sql` — DATA-08 kinds including `assignment.*` / `refund.*`
- `packages/db/supabase/migrations/20260827000003_checkout_rpc.sql` — `checkout_create_booking`
- `packages/db/supabase/migrations/20260827000004_settlement_rpcs.sql` — `checkout_payment_settle` + events
- `packages/db/supabase/migrations/20260910000001_bookings_select_by_contact_email.sql`
- `packages/db/supabase/migrations/20260823000023_rls_staff.sql` — no ops Realtime
- `apps/web/lib/checkout/stripe.ts`, `webhook.ts`, `pay-link.ts`, `create-booking.ts`
- `apps/web/app/api/account/bookings/route.ts`, `apps/web/lib/account/bookings.ts`
- `apps/web/app/[locale]/confirmation/[ref]/ConfirmationClient.tsx` — 1s poll
- `app/pages/bookings.dc.html` — fetch `/api/account/bookings`
- `apps/web/package.json` — versions above
- `apps/web/lib/ops/ops-live-data.test.ts` — close-bar file proofs to extend

### Secondary (MEDIUM confidence)

- Stripe fee on Charge `balance_transaction` — confirm against live webhook payload during implement; omit line if missing (D-31).
- Fleet Save failure mode (client id / `pickRows`) — inferred from `vamos-ops-data.js` + `isUuid` on chauffeur PATCH; must be proven with a reload test.

### Tertiary (LOW confidence - needs validation)

- None that the planner must treat as fact. Extra-snapshot shape is a design choice constrained by `tg_payment_matches_snapshot`.
</sources>

<metadata>
## Metadata

**Research scope:**
- Core technology: DC ops on Cloudflare Worker `vamos`, Hyperdrive Postgres, Stripe Checkout, Resend
- Ecosystem: existing staff APIs, checkout RPCs, fleet tables, account RLS
- Patterns: path SPA, SECURITY DEFINER writes, GiST assign, extra snapshot, poll+visibility
- Pitfalls: hash middleware, assign-by-name, refund-without-Stripe, snapshot charge trigger, mock expenses, Realtime policy

**Confidence breakdown:**
- Standard stack: HIGH — versions and files read on 2026-09-10
- Architecture: HIGH — live middleware/RPC/exclusion/checkout paths
- Pitfalls: HIGH — each maps to a concrete function or SQL constraint
- Code examples: HIGH — copied from current sources
- Extra-fare snapshot + Stripe fee column: MEDIUM — constraint is HIGH; exact migration shape is planner discretion

**Research date:** 2026-09-10
**Valid until:** 2026-10-10 (30 days; restack only if Stripe API version or Worker name changes)

**Planner must extend (exact):**
- UI: `app/ops/ops.dc.html`, `OpsSidebar`, `OpsDash`, `OpsBoard`, `OpsDetail`, `OpsFleet`, `OpsCustomers`, `OpsCalendarBoard`, `app/vamos-ops-data.js`, `app/pages/bookings.dc.html`
- HTTP: `apps/web/middleware.ts`; `apps/web/app/[locale]/(ops)/api/staff/bookings/**`; dual mounts under `apps/web/app/api/staff/bookings/**`; `apps/web/app/api/account/bookings/route.ts`
- Lib: `bookings-write.ts`, `bookings.ts`, `bookings-map.ts`, `fleet-http.ts`, `chauffeurs-write.ts`, `sqlstate.ts`, `customers.ts`, `lib/account/bookings.ts`, `lib/checkout/stripe.ts` (reuse)
- SQL: new `ops_assign_leg` / `ops_unassign_leg` / `ops_refund_record` / extra-settle / `booking_edit_requests`; do **not** drop existing GiST constraints
- Email: new chauffeur assign/unassign + ops must-fix; reuse `sendPayLink` / `sendRefund` / confirmation
- Tests: extend `ops-live-data.test.ts` — no hashes, no `emptyBookings`, no Isolation names, no expense placeholders, assign UUID not name

**Out of scope:** cost sheet, driver app, live GPS, auto-dispatch, React `/ops`, Phase 7 UAT rewrite, Phase 11 live Stripe/DNS.
</metadata>

---

*Phase: 08-ops-dispatch-live-board-assignment-account-surfaces*
*Research completed: 2026-09-10*
*Ready for planning: yes*

## RESEARCH COMPLETE
