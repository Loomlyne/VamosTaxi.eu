# Quick 261001-p6 — Place and time change on a paid trip is re-priced — Research

**Researched:** 2026-10-01
**Folder / branch read:** `/Users/koss/Developer/vamos-wt/phase-26.2-u13`, `gsd/26.2-p6-paid-trip-edit` at `58b68fc1` (cut from origin/main). P1 files read from `gsd/26.2-p1-class-change` at `28a91bba` with `git show` (not checked out).
**Rule kept:** no code changed, nothing committed, no test suite run, no database touched (local or hosted), no Docker, no secret read.
**Confidence:** HIGH for what the code does today (each row carries file:line, read in this worktree). MEDIUM for the design (it rests on P1, which is signed but not built, and on owner answers). See "Not verified".

Short names used below:

| Short | Path |
|---|---|
| `BW` | `apps/web/lib/ops/bookings-write.ts` |
| `PATCH` | `apps/web/app/[locale]/(ops)/api/staff/bookings/[id]/route.ts` |
| `ACCEPT` | `apps/web/app/[locale]/(ops)/api/staff/bookings/[id]/edit-accept/route.ts` |
| `DETAIL` | `app/ops/OpsDetail.dc.html` |
| `NEWTRIP` | `app/ops/OpsNewTrip.dc.html` |
| `PIPE` | `apps/web/lib/quote/pipeline.ts` |
| `LINES` | `apps/web/lib/pricing/lines.ts` |
| `ER` | `apps/web/lib/ops/edit-request.ts` |
| `MIG` | `packages/db/supabase/migrations/20260910175309_booking_edit_requests.sql` |
| `LEGS` | `packages/db/supabase/migrations/20260823000011_booking_legs.sql` |
| `MANAGE` | `app/pages/manage-booking.dc.html` |
| P1 | `.planning/quick/260930-p1-class-change-reprice/{PLAN,DECISIONS,RESEARCH}.md` on `gsd/26.2-p1-class-change` |

---

## Summary

Today the dashboard Edit form writes pickup text, drop-off text, date, time, passengers, bags and flight of a PAID trip in place (`BW:235-318`): no new price, no `booking_events` row, no e-mail, no check of the new time, and the saved coordinates, Mapbox ids and trip duration stay those of the old address. A changed address is silently served at the old fare and an assigned driver is never told.

A new price for new places needs things a booking does not store. The fare kernel wants distance and duration (a new Mapbox route) plus three facts that only a live Mapbox lookup gives: "pickup is an airport" (airport fee), the Mapbox city id and the canton (city or canton pair extra) (`PIPE:335-378`, `LINES:290-374, 518-541`). The booking leg keeps only text, Mapbox id and coordinates (`LEGS:20-29`); zone ids are never written for web bookings, and canton / city id / airport flag are stored nowhere. So a place change must come from the address search New trip already uses, and needs a fresh route. A date or time change alone moves no money under today's rules: no time-based charge exists or is wanted (P4 D5), there is one live price book with no validity dates, and the flight number no longer adds the airport fee (`LINES:530-541`). Passengers and bags move no money either; they only decide whether the class can take the party.

Two findings outside the brief: (1) the customer's "Change your booking" page on vamostaxi.site shows pickup, destination, class, passengers and bags, promises a new price, and then sends only the time (`MANAGE:416-505, 972-999`); (2) the edit machine's payload write is broken in a way that probably makes every customer time-change request fail outright on live, not "apply nothing" (section 4).

**Primary recommendation:** extend P1's machine, do not copy it. P6 adds one "trip facts" step for new places (address search → Mapbox route → airport / city / canton, signed as a quote lock), feeds those facts into P1's price step with the booking's own class, and sends the result through P1's staff-made request (pay link for the difference, "Refund due" when cheaper, confirmation again, driver handling). One migration (`20261007150000`) makes the apply step write the new coordinates, Mapbox ids and trip duration, which P1's apply does not. Name / e-mail / phone / note stay instant. P6 is built after P1 is on main, and P1's price step must take the trip facts as an input — tell P1's builder before P1 is built.

---

## User constraints

### Locked (owner, question form)

| Source | Decision |
|---|---|
| Owner, 2026-09-30 (P1 PLAN, "Found on the way") | Pickup, drop-off, date and time changes on a paid trip get the same treatment as the class in P1: new price, difference paid or refunded, change recorded, customer told. Own job after P1. |
| Control session, 2026-09-30 (P1 PLAN, last section) | P6 reuses P1's functions for the pay link for the difference and the "Refund due" path. No second set. Branch `gsd/26.2-p6-paid-trip-edit`, migration `20261007150000`. Order on main: … P1, then P6. |
| P1 D1-D8 (P1 DECISIONS.md) | Dearer: the booking changes only after the difference is paid (D1); pay link e-mailed in the customer's language, staff can also copy it or type the card (D2); today's price book (D3); 24 h to pay, then the request ends and the booking is untouched (D4); extras stay at the amount paid, the coupon applies as it did (D5); assigned driver unassigned and sent the "trip taken off" e-mail (D6, asked for a class change); confirmation sent again (D7); staff may change until the pickup time, the Settings deadline binds customers only (D8). |
| P1 rules without a separate question (P1 PLAN) | Unpaid booking: no change, cancel and make a new trip. A pending customer request blocks a staff change until answered. Same staff who can use Edit. A second change is allowed, measured against everything paid minus refunds. The old silent path goes. Live Stripe key refused (security session item). |
| Refunds by hand, 2026-09-30 | Cheaper means "Refund due"; the admin presses Refund; nothing goes to Stripe without his click. On main (`packages/db/supabase/migrations/20261005140000_refunds_by_hand.sql:1-25`, commit `f29623da`). |
| 2026-10-01 | No extra stop exists (P4 part D, `8b9e96a7`; `PIPE:804-805`; `apps/web/lib/quote/schema.ts:118-120`). |
| Standing | The owner is the only operator: no staff, no driver app. Classes Economy / Business / Van luxury. One-way only. CHF only. Never an invented price. |

### Out of scope

Return trips, a second currency, live GPS, a driver app, the class change itself (P1), refunds across two payments (security session, P2), the customer's own change page (a question for the owner, decision 9).

### Project rules that bind the plan (CLAUDE.md, .claude/CLAUDE.md, CLAUDE.local.md)

- A shown control must work end to end. No fake field.
- Design system only; no glow; no tinted yellow; four languages in the same pass (DETAIL keeps its own table `DETAIL:582-859`, pinned by `apps/web/lib/ops/ops-detail-i18n.test.ts:162-184`); desktop / tablet / phone and Arabic checked before done; UI-SPEC before code.
- A pattern used more than a couple of times becomes a Design Component with all its states (the address search would be its third copy: `app/home/home.dc.html`, `NEWTRIP:21-40`, `app/ops/OpsTable.dc.html:829`).
- Amounts through the money formatter; tests use synthetic rappen only.
- Hosted database: new migration files only; never `db push`; the control session applies SQL; real paid bookings live there.
- One job, one branch; only the control session commits to main and deploys. After a deploy that touches payment: one 4242 payment, then `booking_payments` by status.
- Every owner choice goes through the question form, one decision per question, one example.

---

## 1. What happens today on a PAID trip

### 1.1 `updateBooking` (`BW:235-318`)

| Field | Today | Evidence |
|---|---|---|
| Lookup | `asStaff`, by id or reference, not erased | `BW:243-250` |
| Unpaid trip | Refused `unpaid`, HTTP 409. "Paid" = any `booking_payments` row with `captured_at` | `BW:252-259`; `PATCH:134-135` |
| Name, e-mail, phone, note | `coalesce` in place on `bookings` | `BW:261-270` |
| Pickup text, drop-off text | `coalesce` in place on the first leg. TEXT ONLY: `pickup_lat/lng`, `pickup_place_id`, `dropoff_*` and `estimated_duration_minutes` keep the old address's values | `BW:272-273, 286-287`; columns `LEGS:20-29, 48` |
| Flight number | in place | `BW:274, 288` |
| Date + time | both needed; `scheduled_local` and `scheduled_at` (Zurich wall clock) in place. No check that the time is in the future | `BW:277-279, 289-293` |
| Class (`klass`) | live slug in place (the form does not send it; P1 removes it) | `BW:276, 294-300` |
| Passengers, bags | in place; no class-capacity check (the database only refuses pax outside 1-16, bags outside 0-16) | `BW:280-281, 306-315`; `LEGS:38-39` |
| Price / snapshot | untouched | whole function |
| `booking_events` | none | whole function |
| E-mail to customer or driver | none; the route answers `jsonOk({ id })` | `PATCH:120-138` |
| Assigned driver | stays assigned; a new time that overlaps another trip of the same driver or car is refused by the database (23P01) and reaches the form as a failed save; a longer route keeps the old duration, so the overlap guard measures the old trip | `LEGS:71-79, 118-128`; no catch in `PATCH:120-138` or `apps/web/lib/ops/staff-json.ts:103-105` |

### 1.2 The PATCH route (`PATCH:57-139`)

| Point | Today | Evidence |
|---|---|---|
| Who | any staff (`withStaff`) | `PATCH:57` |
| Order | `arrived` → `status=cancelled` → `completed/no_show` → `refunded` refused → field update | `PATCH:74-110` |
| E-mail check (security B1, G20, on main) | a present `email` must be a real address; absent keeps the stored one | `PATCH:112-118`; test `apps/web/lib/ops/bookings-route-email.test.ts:43-70` |
| Field update | passes customer, email, phone, note, pickup, dropoff, dateIso, time, pax, bags, flight, klass straight to `updateBooking` | `PATCH:120-133` |

### 1.3 What the Edit form sends (`DETAIL`)

| Point | Today | Evidence |
|---|---|---|
| Who sees Edit | paid and not cancelled — also a completed or no-show trip | `DETAIL:91-93`; `canEdit` at `DETAIL:1269` |
| Controls | eleven free-text design-system `Input`s: customer, e-mail, phone, class, pickup, drop-off, date, time, passengers, bags, flight. Pickup and drop-off are plain text, NOT the address search New trip uses | `DETAIL:203-217` |
| Pre-fill | `snapshotEdit`; class pre-fills with the assigned vehicle (P1 fixes) | `DETAIL:956-968` |
| Save | PATCH with `customer`, `email`, `phone` (each left out when emptied, 26.2-u08), `pickup`, `dropoff`, `dateIso`, `time`, `pax: Number(..)`, `bags: Number(..)`, `flight`. No `klass`, no `note` | `DETAIL:1340-1358` |
| Every Save rewrites the trip | pickup, drop-off, date, time, pax, bags and flight are sent even when unchanged | `DETAIL:1356-1357` |
| Emptied fields | an emptied pickup or drop-off is sent as `""`; `coalesce('', pickup_text)` writes an EMPTY address (`not null` accepts `''`). An emptied passengers field becomes `Number('') = 0`, which the database refuses, so the save fails | `DETAIL:1356-1357`; `BW:272-273, 286-287`; `LEGS:20, 24, 38` |
| After Save | board reloaded, form closed; no confirm step, no price shown | `DETAIL:1358-1365` |

Plain words: the owner can type a new street into Anna Keller's paid trip and the site keeps the old fare and the old coordinates, tells nobody, and leaves no trace in the booking history.

---

## 2. How a new price for the same class with new places or a new time can be computed server-side

### 2.1 The quote pipeline (`PIPE:55-68, 510-768`)

| Step | What it does | Needed for P6? | Evidence |
|---|---|---|---|
| zod | places, one leg with `scheduled_local` and `flight_no`, pax 1-16, bags 0-16; no stop field | yes (same shape) | `apps/web/lib/quote/schema.ts:79-161` |
| rate limit, Turnstile | public-abuse guards, injected | no for a staff route (staff are signed in) | `PIPE:522-530`; `apps/web/lib/abuse/guards.ts:147-185` |
| daily Mapbox breaker | refuses when today's unit count ≥ `MAPBOX_DAILY_UNIT_SENTINEL` | **yes** | `PIPE:531-536`; `apps/web/lib/abuse/breaker.ts:72-102` |
| resolve coordinates | `retrieve` (Search Box, `mapbox_id` + session token) or `pin` (reverse geocode) gives coordinates, text, **canton, city id, city name, is-airport**; `coords` gives coordinates and text only (no canton, no city, no airport) | **yes** — the only source of the three pricing facts | `PIPE:250-313, 537-560` |
| same place | pickup = drop-off → refused | yes | `PIPE:561-568` |
| service area | a live fixed pair of zones passes; otherwise both points must be inside Europe | yes | `PIPE:572-598`; `apps/web/lib/geo/serviceArea.ts:241-275` |
| minimum advance | refuses a pickup less than `settings.min_advance_minutes` away (null = no rule) | **no for staff** (P1 D8); a past time must still be refused | `PIPE:599-614`; `serviceArea.ts:334-364` |
| directions | one Mapbox Directions call; Mapbox down → distance 0, `road: false` → fare amount null (no invented km) | yes; a null total must be a refusal | `PIPE:615-659`; `LINES:473-485` |
| lock deadline, price and mint | today's live book (`loadAndPrice`), every class priced, a signed lock | price: via P1; lock: yes, to carry the facts (5.3) | `PIPE:660-768`; `apps/web/lib/quote/engine.ts:171-255` |

`runRepricePipeline` (`PIPE:800-881`) does not help: it starts from a customer's lock and never changes the route (`PIPE:831-835`).

### 2.2 The price kernel (`apps/web/lib/pricing/priceQuote.ts:288`, `LINES`)

Per leg: fare = start + per-km × full distance (`LINES:464-516`); airport fee added when the pickup is an airport by place (`origin_is_airport`) or by zone type — never by a flight number, never by the drop-off (`LINES:518-541`); one city pair, or failing that one canton pair, both directions, never when both ends are the same (`LINES:290-374, 398-462`); then the extras the customer ticked; coupon; VAT on top at checkout (`apps/web/lib/checkout/checkout-charge.ts:73`). The city pair prefers the Mapbox city id and falls back to a TEXT match of the place name against the pair's label (`LINES:318-339`); the canton pair needs the canton and has no text fallback (`LINES:346-374`). Priced from typed text alone, a canton pair is silently lost.

### 2.3 What the booking stores versus what the kernel needs

| Kernel input (`apps/web/lib/pricing/types.ts:240-272`, `PIPE:352-373`) | Stored on the booking? | Where |
|---|---|---|
| distance, duration | on the snapshot (`distance_km`, `duration_min`); leg has `estimated_duration_minutes` | `apps/web/lib/checkout/lock-to-rpc.ts:87, 286-287`; `packages/db/supabase/migrations/20260827000003_checkout_rpc.sql:194, 217-220` |
| pickup / drop-off coordinates, Mapbox id | yes, on the leg | `20260827000003_checkout_rpc.sql:181-187, 200-207` |
| `origin_zone_id`, `dest_zone_id` | column exists, **never written** by checkout (null on web bookings) | `LEGS:28-29`; insert list `20260827000003_checkout_rpc.sql:176-195` has no zone column |
| `origin_is_airport`, `origin_city_id`, `dest_city_id`, `origin_canton`, `dest_canton` | **no** — only inside the signed quote lock, which is not stored | no migration mentions these names (grep) |
| `scheduled_local`, `flight_no`, pax, bags, class | yes, on the leg | `LEGS:31-39` |
| extras ticked and their amounts, coupon, VAT rate | on the snapshot (`lines`, `policy.extras`, `coupon_code`) | P1 RESEARCH §4 (S2); `lock-to-rpc.ts:196-233, 274-277` |

Consequence for P1 as well: even "same trip, today's book" must re-derive airport / city / canton — by reverse-geocoding the stored coordinates (Mapbox units, `pin` kind) or by reading the airport-fee and pair lines of the booking's own snapshot. For NEW places there is no choice: the place must come from the address search (`retrieve`), which returns all three facts in one call.

### 2.4 Can a staff path call it for an existing booking?

| Path | Works for P6? | Evidence |
|---|---|---|
| New trip: `/api/geo/suggest` → `/api/geo/retrieve` → `POST /api/quote` → `POST /api/checkout/price` | The same calls work from the Edit form. But `/api/quote` is the public route: minimum-advance gate (a change close to pickup is refused), Turnstile, public rate limit; it returns a lock for a NEW quote id; its `class_totals` are nets | `NEWTRIP:95-108, 215-262, 270-303, 305-325`; `apps/web/app/api/quote/route.ts:82-139` |
| `/api/checkout/price` | lock + class + extra codes → `checkoutCharge`, with TODAY's extras list, not the booking's saved ones (P1 D5 keeps the saved ones) | `apps/web/lib/checkout/price-route.ts:1-45, 115` |
| `priceDraftPreview` | newest DRAFT book, distance from the caller; not for live money | `apps/web/lib/ops/draft-preview.ts:1-4, 26-35, 270` |
| New staff route calling `runQuotePipeline` with staff deps | Possible: every guard is injected (`PIPE:186-222`). Build with `buildQuotePipelineDeps` (`apps/web/lib/quote/deps.ts:111`), pass-through rate limit and Turnstile, keep the real breaker, `checkMinAdvance` that only refuses a past time. Needs `QUOTE_LOCK_SECRET` like `/api/quote` | `PIPE:186-222, 604-605` |
| The dashboard host | `dashboard.vamostaxi.site` is Worker `vamos-dashboard`, a gateway to Worker `vamos` (`apps/web/wrangler.dashboard.jsonc:3-20`), where `PRICING_PREVIEW` is `"true"` (`apps/web/wrangler.jsonc:70`). On the dashboard host the quote asks for the draft book, but `quote_rate_book` returns the live book whenever one exists (`packages/db/supabase/migrations/20260914190000_quote_rate_book_live_classes.sql:46-50`). Safe while a live book exists | cited |

Coupon trap: `loadAndPrice` re-evaluates a typed coupon against the coupon table (`engine.ts:201-222`). The booking's coupon has already been used, so a fresh evaluation can refuse it (limit reached, expired). P1 D5 needs the coupon rule taken from the booking's snapshot.

### 2.5 Mapbox daily limit

| Point | Evidence |
|---|---|
| Every Search Box `/suggest`, `/retrieve`, reverse geocode and Directions call counts one unit in KV `QUOTE_ABUSE`, one key per UTC day | `apps/web/lib/abuse/breaker.ts:10-13, 33-51, 107-120`; `PIPE:272, 293, 635` |
| Limit on Worker `vamos`: `MAPBOX_DAILY_UNIT_SENTINEL = "5000"`; at or above it every Mapbox path answers 503 | `apps/web/wrangler.jsonc:43-44, 74`; `breaker.ts:72-102` |
| One staff place change: a few `/suggest` calls while typing (160 ms pause), 1-2 `/retrieve`, 1 Directions. A time-only change needs none when the saved route is reused | `NEWTRIP:221-238`; `PIPE:615-636` |

---

## 3. Which fields change the price

| Field | Moves money? | Why | Evidence |
|---|---|---|---|
| Pickup address | **Yes** | distance; airport fee; city / canton pair | `LINES:464-541, 290-462` |
| Drop-off address | **Yes** | distance; pair. Never the airport fee | `LINES:530-541` |
| Date / time | **No under today's rules**, one caveat | The kernel still knows a `local_time_window` rule (`apps/web/lib/pricing/predicates.ts:155-173`), but the dashboard saves every extra with the "manual" rule (`apps/web/app/[locale]/(ops)/api/staff/rate-book/route.ts:930-935`); P4 D5 (`.planning/quick/260930-p4-extras-no-hardcoded-names/DECISIONS.md:13`): no night / weekend / holiday / waiting charge exists or is wanted; only the local seed has a night row (`packages/db/supabase/seed.sql:177`). One live book, no validity dates (`20260823000008_rate_versions.sql:24-40`). **Caveat:** under P1 D3, pricing the trip again with today's book gives a different number if the owner published a new book since the booking — for a pure time change too | cited |
| Passengers, bags | **No**, but they can make the class unusable | class not offered when `pax > min(passenger_capacity, max_pax)` or `bags > luggage_capacity` | `apps/web/lib/pricing/eligibility.ts:28-38, 122-130` |
| Flight number | **No** | "a flight number alone never adds it (26.4 D-08)" | `LINES:530-541`; `apps/web/lib/pricing/lines.test.ts:1289`; `apps/web/lib/quote/pipeline.test.ts:945`. The comments at `LINES:11-12`, `apps/web/lib/checkout/flight-no.ts:3-4` and `apps/web/lib/pricing/types.ts:251` still say the flight number triggers the fee: stale text |
| Name, e-mail, phone, note | No | not a kernel input | — |

---

## 4. The customer's own change path today

| Door | What it carries | Evidence |
|---|---|---|
| `/manage-booking` (the live page is the DC mock) → "Change this booking" | a date/time picker, **pickup and destination text boxes, a class choice, passenger and bag steppers**, a "what you are changing" list, and the promise "A new route is priced again. If it comes to more you pay the difference, if it comes to less we refund it" | `MANAGE:416-505`; route map `apps/web/middleware.ts:46` |
| What "Request these changes" sends | **only the date and time**. Pickup, destination, class, passengers and bags are listed to the customer and then dropped | `MANAGE:972-999` (`confirmModify`), `MANAGE:892-903` (`diffList`) |
| Server | `POST /api/manage/time-change` (guest) or `/api/account/bookings/time-change` → `requestCustomerTimeChange` → a `booking_edit_requests` row, NO new price (same snapshot total), no deadline check, no minimum-advance check | `apps/web/app/api/manage/time-change/route.ts:23-67`; `ER:537-555, 448-531` |
| Staff Accept | `edit-accept` with the request id → same price → `applied`; "time change confirmed" to customer, bookings@ and the assigned driver | `ACCEPT:49, 70-72`; `ER:579-622` |
| **The payload write is broken** | `${JSON.stringify(input.payload)}::jsonb` (`ER:195, 508`) makes the Worker's driver send a JSON *string* (mechanism pinned by `apps/web/lib/ops/rate-book-extra-rule.test.ts:6-11, 345-346`). The control board says the request is then stored and "would apply nothing" (`.planning/CONTROL-BOARD.md:237`). **But the table has `check (jsonb_typeof(payload) = 'object')`** (`MIG:34`, not dropped by any later migration) and the upsert inserts the parameter as is (`MIG:494`). Read together, the insert should fail with a check violation, mapped to `unknown` / HTTP 400 (`apps/web/lib/ops/edit-request-map.ts:60-88`), and the customer sees "Could not request this time change." (`MANAGE:997`). Either way no customer time change takes effect today. Which of the two happens on live is one read-only query (Not verified). P1 fixes writer and reader together | cited |
| "Late" gate on the page | `timing()` is a review prop, never computed from the Settings deadline; the change view opens at any time | `MANAGE:879, 1074, 1148` |
| Flight number | written at once, no accept, no price; flight mail to customer and driver | `ER:624-667`; `apps/web/lib/lifecycle/notify-lifecycle.ts:260` |

**Should the two doors share the machine?** Yes — they already do: one table, one set of functions, actor `customer` or `staff` (`MIG:21-45`). P6's new pieces (trip facts for new places, apply writing coordinates) are exactly what the customer door needs to keep its own promise. But the customer page is public, four languages, and its five dead fields are an owner decision (decision 9). Recommendation: build P6's functions so the customer door can call them later (actor, auth and deadline passed in, not assumed); do not wire the customer page in P6.

---

## 5. A design that reuses P1

### 5.1 Pieces

| # | Piece | Files | Whose | Migration |
|---|---|---|---|---|
| P6-1 | Edit form: pickup and drop-off become the address search (suggest → pick → Mapbox id + session token), as New trip. Its third copy → one `PlaceSearch.dc.html` Design Component with all states (typing, hits, none found, picked, error, disabled), used by New trip and Edit. Date and time stay two inputs (as New trip, `NEWTRIP:41-42`) and are checked on the server. Contact fields and trip fields are saved by two calls. P1's price box and confirm step list every changed field old → new, paid so far, new total, difference. UI-SPEC and pictures first | `DETAIL:201-217, 956-968, 1340-1366`, T table `DETAIL:582-859`; new `app/ops/PlaceSearch.dc.html`; `NEWTRIP:21-40, 215-262` | P1 builds box and confirm; P6 adds rows and place fields | no |
| P6-2 | One preview route for any paid change: `POST /api/staff/bookings/:id/change`. In: optional class (P1), optional new pickup / drop-off (`retrieve` place inputs), optional date + time, pax, bags. Out: old and new values, paid so far, new total, difference, a signed lock when places changed, or a named refusal. Read-only. P1 plans `/class-change` (P1 RESEARCH A3); agree one route with P1's builder | new route + dual mount (pattern `apps/web/app/api/staff/bookings/[id]/edit-accept/route.ts`) | shared with P1 | no |
| P6-3 | Trip facts for new places: `runQuotePipeline` with staff deps (5.3). A time-only or party-only change skips it and uses the booking's saved route | new `apps/web/lib/ops/trip-change-facts.ts`; imports `PIPE`, `apps/web/lib/quote/deps.ts:111` (no edit to `lib/quote`) | P6 | no |
| P6-4 | Price: P1's price step, called with the booking's class (or the new class if P1's field changed too) and the facts from P6-3 or from the booking; today's live book (D3), saved extras at the amount paid, coupon rule from the snapshot (D5), VAT. A class the party does not fit, or a null class total (no route, class not sold there), is a named refusal | P1's new file in `apps/web/lib/ops/` | P1's — **must take the trip facts as an input** | no |
| P6-5 | Request: P1's staff-made request through `acceptPaidEdit`, with the lock from P6-3. The lock input already exists (`ER:63-69, 155-185`); P1 changes what is read from it (W1). The payload's place fields are copied from the VERIFIED lock, never from the client body (today `ACCEPT:55-67` copies `pickup_text` / `dropoff_text` from the body). `EditPayload` (`apps/web/lib/ops/edit-request-map.ts:8-21`) gains `pickup_place_id`, `pickup_lat`, `pickup_lng`, the same three for drop-off, and `estimated_duration_minutes`; `scheduled_at` computed by the server (`zurichLocalToUtcMs`, `serviceArea.ts:310`). Written with the driver's JSON helper (P1's fix) | `ER:119-213`; `edit-request-map.ts:8-21`; `ACCEPT:43-68` | P1's function, P6's fields | no |
| P6-6 | Migration `20261007150000` (5.4) | new `packages/db/supabase/migrations/20261007150000_*.sql`; pgTAP | extends P1's `20261007140000` | **yes** |
| P6-7 | PATCH stops writing pickup, drop-off, date, time, pax and bags of a paid booking (flight per decision 7); a body that still carries them gets a named refusal. Name, e-mail, phone, note stay (decision 6). The empty-address and pax-0 holes close with it | `BW:29-42, 272-315`; `PATCH:120-133` | P6 (mirror of P1's A8) | no |
| P6-8 | After the change: P1's pay-the-difference e-mail (dearer); "Refund due" (cheaper); confirmation again (`apps/web/lib/ops/voucher.ts:24`); driver per decision 8 — "trip taken off" (`apps/web/lib/ops/assign.ts:290-330`) or the existing time-change mail (`notify-lifecycle.ts:231`); flight mail to the driver (`notify-lifecycle.ts:260`, decision 7) | as listed | P1's | no |
| P6-9 | Edit on place / time closes at the pickup time (D8). Today Edit shows on completed and no-show trips too | `DETAIL:1269` | P6 | no |
| P6-10 | Tests (section 7) | | | |

### 5.2 One change, end to end — Anna Keller, paid Zurich Oerlikon → Zurich Airport, now wants Zug → Zurich Airport

```
Edit form ── owner picks "Zug" in the address search ──► POST …/change (preview)
   │                                  resolve Zug (1 retrieve) + route (1 Directions)  [breaker counts units]
   │                                  facts: distance, duration, airport?, city id, canton → signed lock
   │                                  P1 price step: today's book, her class, her extras, her coupon, VAT
   ◄──── old → new, paid so far, new total, difference ────┘
   │ owner presses Confirm (the lock goes back; no second Mapbox call)
   ▼
acceptPaidEdit (P1) ─ staff-made request ─ booking_edit_request_accept (P1's version)
   ├─ same price ─► apply (P6: text + coordinates + ids + duration; driver per decision 8) ─► confirmation again
   ├─ dearer ────► trip unchanged; Stripe page for the difference, e-mailed (D2); 24 h (D4)
   │                 └─ paid ─► apply ─► confirmation again
   └─ cheaper ───► apply ─► "Refund due" with the difference ─► admin presses Refund
```

### 5.3 Why the facts travel in a signed quote lock

- The preview spends Mapbox units; the confirm must not spend them again.
- The lock is signed with `QUOTE_LOCK_SECRET` (`apps/web/lib/quote/lock.ts:179-198`); the browser cannot change the facts. It already carries coordinates, Mapbox ids, distance, duration, cantons, city ids and the airport flag (`PIPE:716-749`; `lock.ts:92`).
- It expires with the Settings quote lock (`PIPE:660-666`), so a preview left open does not keep a stale price.
- `acceptPaidEdit` already takes `lock` (`ER:63-69`).
- The lock's `class_totals` are nets without extras and VAT (P1 W1). Use the lock for facts only; the money always comes from P1's price step.

### 5.4 Migration `20261007150000`

| Need | Why | Evidence |
|---|---|---|
| `create or replace` P1's `booking_edit_apply_payload` so it also writes `pickup_place_id`, `pickup_lat`, `pickup_lng`, `dropoff_place_id`, `dropoff_lat`, `dropoff_lng`, `estimated_duration_minutes` | today's apply writes text, flight, time, pax, bags and class only | `MIG:127-149` |
| P1's new snapshot function carries the new `distance_km` / `duration_min` into `price_snapshots` and `price_snapshot_legs` | a copied snapshot keeps the old route's distance (P1 W5) | `packages/db/supabase/migrations/20260825000007_quote_snapshot_rpc.sql:164-179`; P1 RESEARCH W5 |
| If decision 8 = unassign: clear `assigned_chauffeur_id` / `assigned_vehicle_id` in the same transaction as the apply, mail after commit | otherwise the overlap guard can refuse the accept (23P01 → `must-fix`) and the capacity check can fire on the old car | `LEGS:118-128`; `edit-request-map.ts:72, 77`; `MIG:156-164` |
| Functions only, `security definer`, `search_path = ''`, EXECUTE to `vamos_system` only; no booking row rewritten by the file | house pattern; live has paid bookings | `MIG:192-198` |
| Order | after P4's `…110000`-`…130000` and P1's `…140000` | `.planning/CONTROL-BOARD.md:177` |

### 5.5 What P6 needs from P1 (tell P1's builder before P1 is built)

| From P1 | Why |
|---|---|
| The price step takes trip facts as an input; P1 fills them from the booking, P6 from the new places | otherwise a second price function |
| Staff-made request fixed: money not from the lock (W1), staff lookup instead of raw `select` under `asSystem` (W8, `ER:105-117`; `apps/web/lib/ops/resolve-booking-id.ts:6-22`), slug mapping (W9) | P6 uses the same call |
| JSON payload writer and reader fixed | section 4 |
| New snapshot function with full lines and the new class | P6 adds distance and duration |
| Difference against everything paid minus refunds (W2) | a place change after a class change |
| Pay-the-difference e-mail, "Refund due" branch, confirmation again, driver handling, "one pending request" rule | reused as is |
| One preview route and one confirm step for class and trip | one form, one price, one request |
| Security session: the machine refuses a live Stripe key (`ER:134-137`) | inherited; not lifted by P6 |

### 5.6 Assigned driver and confirmation again

- Today an in-place edit tells the driver nothing (`PATCH:120-138`); only an accepted customer time change mails him (`ER:596-622`), which cannot happen today (section 4).
- P1 D6 unassigns on a class change. For place or time it is open (decision 8). Unassigning is the simplest safe path: the stored duration and the overlap guard are recomputed at the next assignment (`ops_assign_leg`, `packages/db/supabase/migrations/20260910164004_ops_assign_leg.sql`).
- Confirmation again: `resendVoucher` (`apps/web/lib/ops/voucher.ts:24-106`) reads the booking fresh, so after the apply it shows the new places, time and total (once P1's snapshot keeps the lines). Sent when the change is applied: at once for same price or cheaper, after payment for dearer (D1, D7).

---

## 6. Owner decisions still open (not answered by P1 DECISIONS.md)

One question each, plain words, with an example. "(Rec.)" is the recommended answer.

| # | Question | Example | Options |
|---|---|---|---|
| 1 | A change of date or time only: keep the price she paid, or price the trip again with today's price book? | Anna Keller moves her pickup from Tuesday 08:00 to Tuesday 10:00, same addresses. Last week you raised the per-km price. | Keep the price she paid; the change is recorded and she gets her confirmation again (Rec. — no price depends on the time) · Price it again with today's book |
| 2 | A new pickup or destination that cannot be booked on the site (outside Europe, no road route, same place as the other end): refuse with a message? | Ben Meier asks to be picked up in Istanbul instead of Zurich. | Refuse with a clear message; cancel and make a new trip if needed (Rec.) · Other |
| 3 | A change that makes the trip cheaper close to pickup: does "Refund due" show the full difference, or only what the cancellation rules would give back? | Ben Meier paid Zurich → Zermatt. Six hours before pickup he changes it to Zurich → Zurich Airport; the difference is most of the fare, while a cancellation that late gives back less. | Full difference, you decide at Refund (Rec.) · Follow the cancellation rules · No money back inside the free-cancel window |
| 4 | More passengers or bags than her class takes: refuse, or ask for a larger class in the same Edit (priced as in P1)? | Anna Keller booked Economy for 3 and now travels with 6. | Refuse and offer the class change in the same Edit, one price for both (Rec.) · Refuse only |
| 5 | Passengers or bags changed within what her class takes (no price change): saved at once, recorded, confirmation again? | Ben Meier adds one suitcase; Business still fits. | Saved at once, recorded in the history, confirmation again (Rec.) · Saved at once, no e-mail |
| 6 | Name, e-mail, phone and note (no price): stay instant as today? | You fix a typo in Anna Keller's phone number. | Instant, no e-mail (Rec.) · Instant, confirmation sent again |
| 7 | Flight number (no price — the airport fee follows the pickup, not the flight): stays instant? | Anna Keller's flight changes from LX 318 to LX 320. | Instant; the assigned driver gets the existing flight-number e-mail (Rec.) · Instant, no e-mail · Through the change machine |
| 8 | A driver is already assigned and the time or place changes: unassign and tell him (as for a class), or keep him and send the updated trip? | Driver Marco has Anna Keller at 08:00; she moves to 10:00, or from Oerlikon to Zug. | Unassign and send "trip taken off", as in P1 (Rec.) · Keep him and send the updated time or place |
| 9 | The customer's "Change your booking" page shows pickup, destination, class, passengers and bags, but only the time is sent. Remove those fields now, or keep them and wire them to the same machine in a later job? | Ben Meier types a new hotel on vamostaxi.site/manage-booking, presses "Request these changes", and only his time is sent. | Remove the five fields now, keep the time (Rec.) · Keep them, wire them later (they stay dead until then) |

Already answered, not asked again: today's price book (D3); extras kept at the amount paid and coupon as it applied (D5); 24 h to pay (D4); dearer only after payment (D1); pay link e-mailed (D2); confirmation again (D7); until the pickup time, customers keep the Settings deadline (D8); cheaper = "Refund due", admin presses Refund (refunds by hand); unpaid = cancel and new trip; a pending customer request blocks a staff change.

Rules the plan can state without a question (say so if one is wrong): a new place must be picked from the address search (typed text alone cannot be priced); a new pickup at an airport needs a flight number, as on New trip (`NEWTRIP:240-256`); a new time must be in the future; class, place, time and party changed in one Edit give one price and one request.

---

## 7. Tests that pin today's behaviour

| File:line | Test | Pins | Effect of P6 |
|---|---|---|---|
| `apps/web/lib/ops/ops-dc-u08.test.ts:225-265` | "OpsDetail edit form save" › "sends the contact under the names PATCH … reads", "an emptied contact field is left out…" | the PATCH body (a draft with pickup, dropoff, dateIso, time, pax, bags, flight) holds only keys the route reads; `saveEdit` found by regex up to `markRefund:` | **Must change**: trip fields leave the PATCH body; the regex breaks if `saveEdit` is split |
| `apps/web/lib/ops/customers-board.test.ts:92-105` | "OpsDetail Cancel recaps then PATCHes cancelled; History tab is gone" | `saveEdit` uses PATCH, does not mention `edit-accept`; mock equals its public twin | **Must change** when the trip part calls the change route |
| `apps/web/lib/ops/bookings-write.test.ts:225-262` | "updateBooking class edit (D-14)" | class written in place | P1 changes it; P6 adds "PATCH refuses trip fields on a paid booking" |
| `apps/web/lib/ops/bookings-route-email.test.ts:43-70` | "PATCH /api/staff/bookings/:id e-mail (G20)" | e-mail check before `updateBooking` | Stays (decision 6) |
| `apps/web/tests/integration/ops-dc-customers.spec.ts:90-98` | "bookings item route cancels on PATCH and tombstones on DELETE" | route exports PATCH and calls `updateBooking` | Stays (26.0's folder) |
| `apps/web/lib/ops/edit-request.test.ts:83-118` | "08-07 file proofs" | text in `ER` (`asSystem`, `createRefund`, no `asStaff` import from identity), `settle.ts`, `MIG` | P1 changes (automatic refund goes); P6 must keep `asStaff` out of `ER` |
| `apps/web/lib/ops/edit-request.test.ts:154-241` | "09-10 time-change request/confirm (D-23–D-26)": T-09-90, T-09-92, refuse, "D-25 confirmed time-change mails customer + bookings@ + assigned chauffeur", "same-price time-only payload still requested; second request upserts" | customer time-change door | Stays; extend if decision 8 changes driver mail |
| `apps/web/lib/ops/edit-request-time.test.ts:41-60` | "requestCustomerTimeChange Zurich instant" | wall clock → instant | Stays; reuse for the staff time |
| `apps/web/lib/ops/staff-hosted-pay.test.ts:208-255` | "extra-fare payment on a hosted session" | the difference Stripe page | Stays |
| `apps/web/lib/pricing/lines.test.ts:1289` | "D-08 (26.4): a flight number alone does not trigger the fee" | flight number moves no money | Stays; basis of decision 7 |
| `apps/web/lib/ops/rate-book-extra-rule.test.ts:333-346` | "the route binds the rule through the JSON helper…" | the driver turns `${JSON.stringify(x)}::jsonb` into a JSON string | Pattern for P1/P6's payload test |
| `apps/web/lib/ops/ops-detail-i18n.test.ts:162-184` | "OpsDetail T table stays in parity across en, de, fr, ar" | new keys in four languages, no "ß" | New strings must pass |
| `packages/db/supabase/tests/booking_edit_requests.test.sql` (27 checks, `plan(27)` at `:10`) | upsert / accept / extra settle / grants | payloads are SQL-built objects with `note` only (`:196-302`) | Extend: apply writes coordinates, ids, duration; snapshot distance; unassign if chosen |

**Missing today (no test anywhere):** a place or time change through the edit machine; the apply of coordinates (it does not exist); `updateBooking` writing pickup / drop-off / time (no test pins the in-place place or time write — only the class); the empty-address and pax-0 holes; the customer page dropping four of its five fields.

### Validation map for the plan

| Behaviour | Type | Command (touched files only; the lead runs the full gates once) |
|---|---|---|
| Trip facts: staff deps skip Turnstile / rate limit, keep the breaker, refuse a past time, refuse outside the area, refuse no-route | unit, injected deps (pattern `apps/web/lib/quote/pipeline.test.ts`) | `pnpm --filter web exec vitest run lib/ops/trip-change-facts.test.ts` |
| Price for new facts, same class: dearer, cheaper, same; saved extras; percentage and fixed coupon from the snapshot; null total refused; party too big refused | unit (pure) on P1's price step | `pnpm --filter web exec vitest run lib/ops/<P1 price file>.test.ts` |
| Payload place fields come from the verified lock, not the body | unit with the recording `sql` tag (pattern `staff-hosted-pay.test.ts`) | `pnpm --filter web exec vitest run lib/ops/edit-request.test.ts lib/ops/staff-hosted-pay.test.ts` |
| PATCH refuses trip fields on a paid booking; contact stays | unit | `pnpm --filter web exec vitest run lib/ops/bookings-write.test.ts lib/ops/bookings-route-email.test.ts` |
| Edit form: address search, split save, Edit closed after pickup, i18n parity | unit on the mock source after `node scripts/sync-dc-mock-to-public.mjs` | `pnpm --filter web exec vitest run lib/ops/ops-dc-u08.test.ts lib/ops/customers-board.test.ts lib/ops/ops-detail-i18n.test.ts` |
| Apply writes coordinates, ids, duration; snapshot distance; unassign in the same transaction | pgTAP on the isolated local stack (own shifted ports) | `pnpm --filter @vamos/db run test:db` |
| Real money | manual after deploy | one dearer place change on a test booking, 4242 payment of the difference by the owner, then `booking_payments` by status |

---

## Pitfalls for the planner

1. **Never price from typed text.** A canton pair is lost and the airport flag is unknown (`LINES:346-374, 518-528`). Places come from the address search only.
2. **Never take the new places from the client body.** Copy them from the verified lock (`ACCEPT:55-67` copies text from the body today).
3. **The lock's class totals are nets** (P1 W1). Facts from the lock, money from P1's price step.
4. **Do not re-evaluate the coupon** (`engine.ts:201-222`); use the snapshot's rule (D5).
5. **A null class total is a refusal, never 0** (`LINES:473-485`): Mapbox down or class not sold on the new route.
6. **The minimum-advance gate is a customer rule.** Staff until pickup (D8); still refuse a past time.
7. **Update the duration, not just the text.** The overlap guard and the next assignment read `estimated_duration_minutes` (`LEGS:48, 71-79`).
8. **Unassign inside the apply transaction** if decision 8 is "unassign", or the accept can fail as `must-fix` on an overlap (`edit-request-map.ts:77`).
9. **JSON payload through the driver's JSON helper** (`sql.json`), never `${JSON.stringify(x)}::jsonb` (`ER:195, 508`; `MIG:34`).
10. **No raw table SQL under `asSystem`** (`ER:105-117`); use `resolveStaffBookingId`.
11. **Mock and public twin**: run `node scripts/sync-dc-mock-to-public.mjs` before twin tests (`apps/web/public/app/` is gitignored).
12. **Four languages and logical properties**: the New trip hit list uses `left:0;right:0` (`NEWTRIP:24, 34`); a shared `PlaceSearch` should use `inset-inline`.

## Security notes

| Area | Applies | Control to keep |
|---|---|---|
| Access control | yes | `withStaff` on the new route; SQL functions `security definer`, `search_path = ''`, EXECUTE to `vamos_system` only (`MIG:192-198`); RLS on `booking_edit_requests` (`MIG:47-60`) |
| Input validation | yes | the browser sends place inputs and a lock, never an amount or coordinates it made up; zod schema of the quote (`schema.ts:79-161`); the server computes every number |
| Payment integrity | yes | one succeeded payment per snapshot; Stripe idempotency keys; settle by webhook signature (existing, P1) |
| Audit | yes | `booking.modified` and `price.repriced` in the same transaction as the change (`MIG:166-188`) — the PATCH path writes none today |
| Abuse / cost | yes | the Mapbox breaker counts staff calls too (`breaker.ts:107-120`) |

| Threat | Mitigation |
|---|---|
| A client sends coordinates for a cheap route and text for a far one | place fields only from the signed lock |
| A place changed with no payment (today's PATCH) | trip fields leave the in-place write (P6-7) |
| Refund sent without the owner's click | cheaper ends in "Refund due" (refunds by hand) |

## Package audit and environment

No new package. Nothing to install or audit. Environment check skipped: code and one migration only; the local database stack is needed for pgTAP at build time, not for this research.

## Assumptions

| # | Assumption | Section | If wrong |
|---|---|---|---|
| A1 | P1 is built as its signed plan says, and its price step can be shaped to take trip facts | 5 | P6 needs its own price wrapper — against the control session's "no second set" rule; raise it with the control session |
| A2 | `/api/geo/retrieve` and the pipeline's `retrieve` give `isAirport`, `cityId` and `canton` for an address picked on the dashboard as for a customer (read from `PIPE:291-312`, not run) | 2.1 | The airport fee or pair could be missed on a staff change |
| A3 | The dashboard host reaches Worker `vamos` with host `dashboard.vamostaxi.site` and the same bindings (`wrangler.dashboard.jsonc:12-20`) | 2.4, 2.5 | The draft-book or breaker notes would not apply |
| A4 | The phase 08 decisions (D-66 "reprice with the same quote engine") still stand where P1 did not replace them | constraints | More questions |

## Not verified

- Nothing was run: no unit test, no pgTAP, no local database, no Worker, no Mapbox call.
- Live data was not read (no hosted SQL). Open reads for the control session, read-only:
  - which of "check violation" or "stored string" happens for `booking_edit_requests.payload` on live: `select status, jsonb_typeof(payload), count(*) from public.booking_edit_requests group by 1, 2;` (zero rows despite customer attempts would confirm the failure reading);
  - whether the live price book has any surcharge with a `local_time_window` rule (would make time move money): `select code, predicate from public.surcharges where rate_version_id = 18;`
  - `settings.min_advance_minutes` on live;
  - whether any paid booking's pickup text no longer matches its coordinates after an in-place edit (no event is written, so only a spot check is possible).
- Whether the live `/manage-booking` shows the five dead fields exactly as the mock reads (middleware map read at `apps/web/middleware.ts:46`, page not opened).
- P1's price step does not exist yet; how it will derive airport / city / canton for the saved trip is not decided in P1's plan.
- `apps/web/lib/geo/mapbox.ts` `retrieve` / `reverse` were not read; the airport and canton facts are taken from how `PIPE` uses them.
- Layout of the Edit form with the address search and the confirm step at 1440 / 1024 / 768 / 390 and in Arabic: a design task; no UI-SPEC exists.

## Sources

All primary, read in this worktree at `58b68fc1`: the files cited inline; P1's PLAN, DECISIONS and RESEARCH via `git show gsd/26.2-p1-class-change:…`; `.planning/CONTROL-BOARD.md:103, 145, 177, 237`; `.planning/quick/260930-p4-extras-no-hardcoded-names/DECISIONS.md:13`, `PART-A-RECORD.md:358`.

**Valid until:** P1 lands on main (re-check sections 5 and 7 against P1's real function names), or any ship that touches `ER`, `PATCH`, `BW`, `DETAIL` or a `booking_edit_*` function.
