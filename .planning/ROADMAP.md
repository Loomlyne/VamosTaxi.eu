# Roadmap: Vamos Taxi V1

## Overview

Vamos Taxi ports 30+ finished `.dc.html` mocks into a production Next.js app on one
Cloudflare Worker, backed by Supabase Postgres through Hyperdrive, with Stripe as the only
payment path. The journey is a strict spine — scaffold, then schema, then verified data
access — because nothing downstream can be built on unproven ground. From there it forks
into three genuinely parallel tracks (pricing engine, public surfaces + accounts, ops
reference data), all converging at checkout/payment, the one phase every money-touching
surface depends on. Ops dispatch and the full booking lifecycle build on that convergence,
then hardening and cutover close it out. The i18n runtime's SSR-safe architecture and the
price/policy snapshot pattern are decided in Phase 1 and Phase 2 respectively — both are
structurally expensive to retrofit and cheap to get right from the first draft.

This roadmap covers the full public-site-plus-ops-console build described in
`docs/build/GSD-LAUNCH.md`, restructured around three research findings that file predates:
Hyperdrive is a hard gate with its own load-tested verification (split out as its own phase
rather than folded into schema work), checkout is a convergence point that ops dispatch and
lifecycle features sit downstream of (rather than one large "payments + lifecycle" phase),
and the i18n runtime's SSR incompatibility is a Phase 1 architecture decision, not Phase 7
cleanup. Deviations from `GSD-LAUNCH.md`'s phase numbering are noted per phase below.

## v1.1 Ops Support

v1.1 freezes the booking funnel (Phases 7–11) and ships a two-way Support inbox in Ops.
Tickets **are** `contact_submissions` rows plus a message thread — no parallel
`support_tickets` table, no customer ticket UI. Dispatcher answers from `#support`;
customer Reply-in-Gmail lands on the same ticket via Resend inbound on
`replies.vamostaxi.site`. Gmail `info@vamostaxi.site` stays a copy. Spine: schema + mock
→ outbound RFC ids → inbound webhook → UI wire-up → staging MX last. Closed stays closed
until a human reopens it (no auto-reopen).

**v1.1 must-nots (every phase):** no `POST /api/quote`, no Staff tab, no live
`vamostaxi.eu` DNS, no `env.production`, no push to `main`, funnel Phases 7–11 frozen.

## v1.2 Payment

v1.2 unfreezes **pay** on the existing Phase 7 Custom Checkout (`ui_mode: "elements"`).
Stripe TEST on `vamostaxi.site`. Dummy card must capture. Webhook confirms. Thank-you
waits on the webhook, not `confirm()`. Later live Stripe is wrangler secrets only — not
a checkout rewrite. Frozen leftovers 16 MX, 17 chauffeur, 19 close-out, 20 security stay
parked. Quote/class rebuild and fare Publish are not this milestone. Live book UAT pays
priced class **mahaha** only; other classes stay `CHF 000`.

**v1.2 must-nots (every phase):** keep Custom Checkout (no hosted Checkout, no
PaymentIntent-only rewrite); no `sk_live_`; no `.eu`; no invented CHF (unpriced class
stays `CHF 000`); SQL apply and `wrangler secret put` are owner-gated; do not execute
or complete Phases 16/17/19/20; no `.ics`; charge always CHF; four languages same pass.

## v1.3 Meta measurement

**Current milestone:** v1.3 Meta measurement. Ads only. It does not change quote, pay,
or confirmation. After Accept, and only after the owner pastes banner, cookies, and
privacy lines in en/de/fr/ar, allowed customer pages load pixel `1595596972063765`
and send PageView. A paid booking sends one Purchase from the settle queue, in the
CHF Stripe charged. v1.2 Payment (Phases 21–25) stays planned, not current — those
phase contracts are unchanged. Frozen leftovers 16/17/19/20 stay on disk.

**v1.3 must-nots (every phase):** no `sk_live_`; no `vamostaxi.eu`; no invented legal
copy; no invented CHF; no hashed email or phone; no browser Purchase; no middle
events (quote seen, checkout started, pay step). Do not change quote, pay, or
confirmation. Do not execute or complete Phases 16/17/19/20 or 21–25.

**State update, 2026-10-01 (bookkeeping B10; the owner's decisions are in `.planning/PHASE-CLOSURE-2026-09-29.md`):**
16 is complete. 17 is closed (feature removed). 21 to 25 are replaced by 26.1 and 26.3 and are never built.
20 was re-opened by the owner as the 2026-10 security check and is open now. 19 is deferred with an open
status question. The phases 26.0 to 27.1 inserted since then are listed below with their real state.

## Phases

**Phase Numbering:**

- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

**Checkbox meaning (bookkeeping B10, 2026-10-01):** `[x]` means no agent work is open in that phase:
shipped, closed, replaced, deferred or owner-held. Each line says which. `[ ]` means open work.
The owner's phase decisions are in `.planning/PHASE-CLOSURE-2026-09-29.md`; what is live and in work is on
`.planning/CONTROL-BOARD.md`. In the lines below, a phase number after the bold name is written without
the word "Phase", so GSD reads each line as one phase.

- [x] **Phase 1: Platform Foundation, Design System Port & i18n Runtime** - Worker deploys to a real staging domain with the ported design system and an SSR-safe i18n runtime
- [x] **Phase 2: Data Schema, RLS & Staff Auth Foundations** - Postgres mirrors the VamosOps contract with RLS everywhere and invited, MFA-gated staff auth
- [x] **Phase 3: Hyperdrive Data Access Wiring** - The Worker reaches Postgres through Hyperdrive, fast and safely isolated per request
- [x] **Phase 4: Quote & Pricing Engine** - The booking widget returns a real, locked, server-priced quote for any eligible route (completed 2026-09-06)
- [x] **Phase 4.3: Blended distance bands + OPS rate book (INSERTED)** - REPLACED (owner, 2026-09-29) by the 26.1 owner formula: start + per km × km, airport fee, ticked surcharges, route amount, VAT, coupon; no bands. Never build. Its band tables go with G8/G9 after P6
- [x] **Phase 5: Public Surfaces & Customer Accounts** - Every public mock is a live route on real data, and customers can create and access accounts (completed 2026-09-06; 05-19 dropped, 05-24 folded into 27.1, 05-28 shipped 2026-10-01 as B8)
- [x] **Phase 5.1: CSS and CI clean-up (INSERTED)** - WhenPicker harness parse and range visual lock (completed 2026-09-02; only plan 02 is on file)
- [x] **Phase 5.2: One-way only (INSERTED)** - Return tab removed; quote always one way (completed 2026-09-03, UAT 3/3)
- [x] **Phase 6: Ops Reference Data & Content Console** - Staff manage the reference data and content that power the public site (replanned 2026-09-01 — DC mock is the product) (completed 2026-09-01)
- [x] **Phase 6.1: Dashboard instant sidebar navigation (INSERTED)** - Dashboard hash switch without the fade (executed 2026-09-04)
- [x] **Phase 7: Checkout & Payment** - A customer pays for a locked quote and receives a webhook-confirmed booking (completed 2026-09-11)
- [x] **Phase 8: Ops Dispatch — Live Board, Assignment & Account Surfaces** - Staff run the live board, assign real bookings, and customers see their own history (completed 2026-09-11)
- [x] **Phase 9: Booking Lifecycle & Customer Self-Service** - A booking lives its full lifecycle — reminders, delay handling, cancellation, review
- [x] **Phase 10: Hardening — Performance, Security & Compliance** - The site survives a launch surge and never captures data ahead of consent (completed 2026-09-12)
- [x] **Phase 11: Launch Cutover** - Vamos Taxi goes live on its real domain with real pricing (agent plans done 2026-09-13; plan 11-12, Publish of price book row 18, is the OWNER'S STEP, never an agent's; the .eu cutover and the live Stripe key are his word too)
- [x] **Phase 12: Ticket schema + #support mock** - Contact rows become tickets (New/Open/Replied/Responded/Closed); OpsSupportTicket + sidebar `#support`; Staff tab stays gone (completed 2026-09-11)
- [x] **Phase 13: Staff APIs + outbound Resend replies** - Dispatcher sends a reply from the ticket; customer Gmail threads; info@ BCC; RFC Message-ID persisted (completed 2026-09-18)
- [x] **Phase 14: Inbound webhook** - Signed Resend webhook appends matched replies; unmatched mail does not create a ticket (completed 2026-09-18)
- [x] **Phase 15: Wire Ops #support to APIs** - Live `#support` list, thread, booking_ref+locale, status filters; EN/DE/FR/AR; escaped text (completed 2026-09-18)
- [x] **Phase 16: Staging MX + end-to-end UAT** - Customer Reply-in-Gmail appends to the same ticket; MX only on replies.vamostaxi.site (complete: 16-UAT 10 of 10 passed; closure file 2026-09-29)
- [x] **Phase 17: Ops chauffeur profile, shift roster, two-driver vehicles** - CLOSED (owner, 2026-09-29): feature removed, "we deleted that part"; never build. A fresh phase if it is wanted again
- [x] **Phase 18: OPS Pricing source of truth** - `/pricing` is the only fare book; public offers follow Publish (completed 2026-09-15)
- [x] **Phase 19: 10,000-booking surge proof on the 26.3 checkout** - CLOSED by the owner (2026-09-30, confirmed 2026-10-01 23:59): no surge test, not a launch item (`decisions/2026-10-01-phase19-and-26.2-units-closed.md`)
- [x] **Phase 20: Security check of the changed app (2026-10)** - Check, serious fixes, owner decisions and refunds by hand are live (20-06, 07, 08, 10, 12); every fix re-probed on live and hosted functions/grants compared with the migration files in 20-09; owner's 4242 payment VT-26-0750 passed (completed 2026-10-02)
- [x] **Phase 21: Charge gate + visible refusal + payable intent** - REPLACED (owner, 2026-09-29) by 26.1 (live); its client code was rebuilt by 26.3. Never build
- [x] **Phase 22: Card confirm + thank-you webhook wait** - REPLACED (owner, 2026-09-29) by 26.3: payment is Stripe's hosted page, no card form on the site. Never build
- [x] **Phase 23: Wallets + Dashboard methods** - REPLACED (owner, 2026-09-29) by 26.3: Stripe's page shows card, Apple Pay, Google Pay and TWINT. Never build
- [x] **Phase 24: Dual-payer, pay-link, mail split** - REPLACED (owner, 2026-09-29) by 26.1 for the server; 26.3 removed the pay-link option from checkout. Never build
- [x] **Phase 25: /bookings unpaid + TEST UAT + secret-swap design** - REPLACED (owner, 2026-09-29) by 26.1 and 26.3. Never build
- [x] **Phase 26: Legal gate** - Pixel and Purchase stay off until owner banner, cookies, and privacy lines exist in en/de/fr/ar; new policy version; flag stays off (completed 2026-09-23)
- [x] **Phase 26.0: Main green (INSERTED)** - Honest test and gate set, Linux e2e job, /dev test-only, imprint en+de notice (shipped 2026-10-01, 6ec73c52, Worker c2127d38; the remaining reds are lane B on the board)
- [x] **Phase 26.1: Payment and pricing integrity (INSERTED)** - A paid session always confirms; refunds, disputes and DLQ reach the DB; the owner fare formula with 26 cantons; pay-link lock and race; refund rules; three classes; admin sign-in options (shipped 2026-09-28, cff97a0e; 26.1-28 superseded)
- [ ] **Phase 26.2: Codebase audit, bug fix and simplify** - OPEN for its found rows only. Hand-overs 1 and 2, P1 class change, P4 extras A and D, chauffeurs by class are live; P6 in work (lane A); the units that never ran (01, 02, 04-08 rest, 11, close-out 12) are closed by the owner 2026-10-01 23:59
- [x] **Phase 26.3: Booking flow rebuild (INSERTED)** - Home box to paid in two screens on Stripe's hosted page (shipped 2026-09-29, af93fc8e; test-booking delete D-37 is the owner's word)
- [x] **Phase 26.4: One form + phone booking sheet (INSERTED)** - One booking form; phone and tablet bar plus sheet (shipped 2026-09-30, 0f58ab6d)
- [x] **Phase 26.4.1: Laptop booking bar (INSERTED)** - Wide bar at the bottom of the laptop hero (shipped 2026-09-30, 0f58ab6d)
- [x] **Phase 26.4.2: Owner booking feedback (INSERTED)** - One-page phone booking, flight before From, class cards with photos (shipped 2026-09-30, 37ba5b62, plus repairs)
- [x] **Phase 26.5: Checkout guest, sign in or create account (INSERTED)** - Account choice before Stripe; unpaid bookings hidden; paid-only reminder; pay-press limit (shipped 2026-09-30, 9a5263cd, Worker 2d5906ce)
- [x] **Phase 27: Consent record** - Accept logs Meta on; Dismiss logs Meta off; existing banner until a choice, including a pay link (shipped 2026-10-01, ce55cd75, Worker c45d2782; Meta still off)
- [x] **Phase 27.1: Finish your account (INSERTED)** - A sign-in-link account finishes (names, optional mobile, the account tick) before it can pay or open a booking (shipped 2026-10-01, 96a17ab7, Worker 6eb1d700)
- [ ] **Phase 28: Pixel PageView** - WAITING for the owner's Meta check: both Events Manager switches saved off on pixel `1595596972063765`. Discuss signed, research on branch gsd/phase-28-pixel-pageview; nothing built
- [ ] **Phase 29: Webhook Purchase** - WAITING: after 28. One Purchase from the settle queue in the CHF charged; quote, pay, and confirmation unchanged

## Phase Details

### Phase 1: Platform Foundation, Design System Port & i18n Runtime

**Goal**: The production Next.js app deploys to Cloudflare Workers on a real staging domain,
carries the ported Vamos design system verbatim, and can render any string correctly in all
four languages including RTL — the foundation every later phase builds on. This is also
where the `VamosLocale` DOM-walking runtime is replaced with an SSR-safe mechanism (render-time
`t()`/`useT()` lookup over the same dictionary), decided here rather than drifting page by page.
**Depends on**: Nothing (first phase)
**Requirements**: PLAT-01, PLAT-02, PLAT-03, PLAT-04, PLAT-05, PLAT-06, I18N-01, I18N-02, I18N-03, I18N-04, I18N-05, I18N-06
**Success Criteria** (what must be TRUE):

  1. A pull request triggers typecheck + build + preview deploy, `main` deploys to a real staging domain (not `*.workers.dev`), and a tag deploys production — all via one custom Worker entry exporting `fetch`, `scheduled` and `queue`.
  2. A ported design-system component (Button, Card, Input) renders pixel-identical to its `.dc.html` source using the same class names, with Lenis scrolling smoothly and honouring `prefers-reduced-motion`.
  3. No secret is readable from the browser or present in the repo — every credential reaches the Worker via `wrangler secret`.
  4. Switching language on a rendered page relabels every string (including placeholders, `aria-label`, `title`, `alt`) in place without a reload, is correct in the server-rendered HTML with no English flash, and Arabic renders right-to-left with logical-property layout.
  5. Switching currency changes only the mark, never the number, and strings the code builds from parts translate too.

**Plans**: 14/14 plans executed

Plans:

- [x] 01-01-PLAN.md — Tracer: pnpm monorepo, Next 15 + OpenNext Worker (fetch/scheduled/queue), `[locale]` routing, first ported component, deployed to staging.vamostaxi.eu
- [x] 01-02-PLAN.md — CI pipeline (PR/main/tag) and the two blocking secret gates
- [x] 01-03-PLAN.md — Quality gate toolchain: stylelint law + logical-property rules, i18n key coverage, offline screenshot-diff harness
- [x] 01-04-PLAN.md — Cloudflare bindings provisioned, scheduled/queue proven in staging, Access + noindex, structured logging to Logpush
- [x] 01-05-PLAN.md — Brand layer vendored into the app, self-hosted Arabic face replacing the CDN hotlink, image delivery verified
- [x] 01-06-PLAN.md — Design-system port batch 1: nine core primitives, dev gallery, first German and Arabic passes
- [x] 01-07-PLAN.md — Dictionary migration to per-locale JSON with dotted keys and ICU messages, plus the runtime fallback
- [x] 01-08-PLAN.md — Lenis smooth scroll as a single provider, with navigation resync and automated proof
- [x] 01-09-PLAN.md — Design-system port batch 2: eight form controls
- [x] 01-10-PLAN.md — Design-system port batch 3: three navigation and five feedback components, plus focus and scroll behaviour specs
- [x] 01-11-PLAN.md — Design-system port batch 4: four data and four transfer composites
- [x] 01-12-PLAN.md — i18n runtime: locale shim, currency store, booking draft persistence and the ADR-001 acceptance test, alternates and sitemap
- [x] 01-13-PLAN.md — Shared header and footer ported and composed around every page
- [x] 01-14-PLAN.md — Localised 404 and error pages, gallery production exclusion, baseline review and the phase-wide language passes

**UI hint**: yes

### Phase 2: Data Schema, RLS & Staff Auth Foundations

**Goal**: Postgres holds the full `VamosOps`-mirrored schema with row-level security enforced
on every table, and staff can only reach it through an invited, MFA-verified session. The
versioned price/policy snapshot shape (needed by Phase 4/9) and the driver double-booking
exclusion constraint (needed by Phase 8) are designed into the schema here, not retrofitted.
**Depends on**: Phase 1
**Requirements**: DATA-01, DATA-02, DATA-03, DATA-04, DATA-07, AUTH-05
**Success Criteria** (what must be TRUE):

  1. Every table in the `VamosOps` contract (bookings, booking_events, customers, chauffeurs, vehicles, vehicle classes, coupons, fixed routes, distance rates, surcharges, reviews, content_strings, settings) exists as a versioned migration with RLS on, and a customer's query returns only their own bookings.
  2. A guest can open a booking using a valid manage token and nothing else.
  3. A staff query is authorized by a role claim in the JWT; a customer session cannot reach ops data.
  4. Seeding a fresh environment loads vehicle classes, settings, content strings and the existing reviews.
  5. A staff account can only be created by invitation and must complete a second factor before reaching ops data.

**Plans**: 10 plans

Plans:
**Wave 1**

- [x] 02-01-PLAN.md — Wave 0: move supabase/ into packages/db, pin the CLI (legitimacy checkpoint), package scripts, D-37 docs

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 02-02-PLAN.md — Foundation migrations: extensions, four roles, app.* identity helpers, enums + rappen domain

**Wave 3** *(blocked on Wave 2 completion)*

- [x] 02-03-PLAN.md — Reference data + staff auth: settings split (D-35 columns), fleet, customers/staff, token hook, content/reviews

**Wave 4** *(blocked on Wave 3 completion)*

- [x] 02-04-PLAN.md — Pricing: rate_versions one-live gate, zones/rates/routes/surcharges, coupons, price i18n keys

**Wave 5** *(blocked on Wave 4 completion)*

- [x] 02-05-PLAN.md — Booking core: VT-YY-#### generator, bookings, legs + dispatch exclusions, manage-token surface

**Wave 6** *(blocked on Wave 5 completion)*

- [x] 02-06-PLAN.md — Money: price snapshots, payments + charge gate, refunds/stripe_events/notifications, coupon_redemptions

**Wave 7** *(blocked on Wave 6 completion)*

- [x] 02-07-PLAN.md — Evidence: booking_events, audit_log triggers, consent_log + record_consent, four-layer append-only

**Wave 8** *(blocked on Wave 7 completion)*

- [x] 02-08-PLAN.md — RLS hard gate: enable everywhere, revoke-all baseline, per-actor policies, seven RLS proofs

**Wave 9** *(blocked on Wave 8 completion)*

- [x] 02-09-PLAN.md — Seed generator + seed.sql, database.types.ts, CI gate, [BLOCKING] apply-from-zero proof

**Wave 10** *(blocked on Wave 9 completion)*

- [x] 02-10-PLAN.md — Hosted probes (U1/U3/U15) + first remote push — owner-gated, autonomous: false

### Phase 3: Hyperdrive Data Access Wiring

**Goal**: The Worker reaches Postgres exclusively through Hyperdrive on Supabase's direct
connection string (never the pooled Supavisor string), fast and safely isolated per request.
This is a hard gate — no other phase's real query work can be trusted until this is verified
under concurrency, not just smoke-tested.
**Depends on**: Phase 2
**Requirements**: DATA-05, DATA-06
**Success Criteria** (what must be TRUE):

  1. A representative query from the staging Worker completes with p50 round-trip under 30 ms.
  2. Two concurrent requests as two different customers, run against the pooled connection, never see each other's row — proven by a concurrent two-customer isolation integration test, not a single manual query.

**Plans**: 7 plans

Plans:
**Wave 1**

- [x] 03-01-PLAN.md — Wave 0 + hard gate: `@vamos/db` as a real module, `withIdentity` at the frozen signature, database-free contract test

**Wave 2** *(blocked on Wave 1 completion; 03-02 owns the local Docker stack, 03-03 and 03-04 are database-free)*

- [x] 03-02-PLAN.md — Local isolation proof: pgTAP fail-closed/cross-claim/quote-identity, connection-reuse simulator, mutants + mutation gate
- [x] 03-03-PLAN.md — apps/web wiring: two Hyperdrive bindings, Placement Hints at `aws:eu-central-2`, five named wrappers + WAE, region corrections
- [x] 03-04-PLAN.md — Isolation probe Worker + token verify + schema-legal fixtures (source only), three production gates

**Wave 3** *(blocked on Wave 2 completion)*

- [x] 03-05-PLAN.md — Deployed harness: concurrency driver, adjacency set, config preconditions, negative controls, DATA-06 isolation gate

**Wave 4** *(blocked on Wave 3 completion)*

- [x] 03-06-PLAN.md — The local gate: ESLint + CI fences, `pr.yml` wiring, full local suite, OpenNext preview smoke — `autonomous: false` (package legitimacy checkpoint)

**Wave 5** *(blocked on Wave 4 completion; owner-gated — deferred if unprovisioned)*

- [x] 03-07-PLAN.md — Staging Hyperdrive configs, deploy, deployed DATA-06 proof and DATA-05 p50 measurement — `autonomous: false` (owner-held credentials)

### Phase 4: Quote & Pricing Engine

**Goal**: The booking widget returns a real, locked, server-priced quote for any eligible
route and vehicle class. The price snapshot is written once onto the booking row at quote
time and never recomputed downstream — this is the engine's contract, designed in from the
start rather than added once checkout exists.
**Depends on**: Phase 3
**Parallel with**: Phase 5, Phase 6 (once Phase 3 lands, the pricing engine, public-surface porting and ops reference-data screens touch disjoint code and can build concurrently)
**Requirements**: QUOTE-01, QUOTE-02, QUOTE-03, QUOTE-04, QUOTE-05, QUOTE-06, QUOTE-07, QUOTE-08, QUOTE-09, QUOTE-10, QUOTE-11
**Success Criteria** (what must be TRUE):

  1. A customer enters pickup/destination by search or map pin, sees the route drawn, and receives a price for every eligible vehicle class — a fixed-route price where configured, otherwise per-km rate plus surcharges.
  2. That quote holds for 30 minutes, and an expired quote is rejected server-side at payment time even if the UI countdown is bypassed.
  3. The stored booking row carries the price breakdown and the rate version it was computed from, so a later rate change never alters an existing booking's price.
  4. A coupon reduces the price when valid and is refused outside its window or usage cap; a booking inside the minimum advance time or outside the service area is refused with a message saying which; a flight number fills in the landing time; a customer can add a child seat, an extra stop or oversized luggage as its own priced line.
  5. The quote endpoint is rate-limited and challenges repeated anonymous requests, and every amount reads `CHF 000` behind `pricing_live=false` until the real matrix is loaded and approved.

**Plans**: 16 plans

Plans:
**Wave 1**

- [x] 04-01-PLAN.md — Wave 0 for the whole phase: install the two test tools this repository does not have, wire them
- [x] 04-04-PLAN.md — Make surcharge applicability **data**. Today "22:00–06:00" and "pickup is an airport zone" woul

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 04-02-PLAN.md — The two pure decision modules the pipeline sits on: which classes a party can travel in, and
- [x] 04-05-PLAN.md — The database half of QUOTE-04 and QUOTE-05: a second clock the trigger can see, a board the dis

**Wave 3** *(blocked on Wave 2 completion)*

- [x] 04-03-PLAN.md — The pipeline itself: turn a frozen rate book plus a pinned journey into the exact `lines[]` arr
- [x] 04-06-PLAN.md — Open the anonymous quote identity's READ door, and finish the coupon ledger.
- [x] 04-07-PLAN.md — Two signed artefacts and one primitive.

**Wave 4** *(blocked on Wave 3 completion)*

- [x] 04-08-PLAN.md — The boundary and the vocabulary.
- [x] 04-15-PLAN.md — Open the write door Phase 3 reserved and could not build.

**Wave 5** *(blocked on Wave 4 completion)*

- [x] 04-09-PLAN.md — Connect the pure kernel to the frozen book — through the one door that exists, on the one bindi
- [x] 04-10-PLAN.md — Everything between an address the customer typed and a pair of metres the kernel can price —
- [x] 04-12-PLAN.md — One lookup, three honest failures, and two columns so Phase 9 has something to shift.

**Wave 6** *(blocked on Wave 5 completion)*

- [x] 04-11-PLAN.md — The two public endpoints the whole phase has been building toward, and the ordered list of

**Wave 7** *(blocked on Wave 6 completion)*

- [x] 04-13-PLAN.md — The layer that decides how much a stranger is allowed to cost us, and the one place a signature
- [x] 04-16-PLAN.md — Settle the Phase 4 / Phase 5 seam, and prove the engine's answers can be rendered before anyone

**Wave 8** *(blocked on Wave 7 completion)*

- [x] 04-14-PLAN.md — The rules Phase 7's handler must obey, and the ledger that keeps this phase's open questions

**UI hint**: yes

### Phase 4.3: Blended distance bands + OPS rate book (SUPERSEDED by 26.1, owner 2026-09-29)

**State**: Replaced, never build. The owner formula of 26.1 is start price + price per km × km, then airport
fee, ticked surcharges, route amount, VAT, coupon. No bands. The folder was removed on 2026-09-29; the last
commit that has it is `37e55d26` (`git checkout 37e55d26 -- .planning/phases/04.3-blended-distance-bands`).
The old band tables (`distance_bands`, `region_premiums`, `rate_version_rules`) are dropped by G8/G9 after P6
(owner chose "Drop them", 2026-10-01). The full former text of this section is in git history before this commit.
**Source**: `.planning/PHASE-CLOSURE-2026-09-29.md`, section "Replaced, do not build".

### Phase 5: Public Surfaces & Customer Accounts

**Goal**: Every public surface that does not depend on a paid booking is a live route on
staging (`vamostaxi.site`) talking to the real Worker + Supabase. No fixture lists, no
localStorage-only auth, no fake success toasts, no invented legal/CHF/photos. Pixel-faithful
DC at all four widths in en/de/fr/ar. Become-a-driver is out of V1. Close bar is the
per-URL connection table below — a page with any mock leftover is not done.
**Depends on**: Phase 3 (the home page's booking widget also requires Phase 4 for live pricing, but the rest of this phase does not)
**Parallel with**: Phase 4, Phase 6
**Requirements**: SITE-01, SITE-02, SITE-04, SITE-05, SITE-06, SITE-07, SITE-09, AUTH-01, AUTH-02, AUTH-03, AUTH-04, I18N-08
**Success Criteria** (what must be TRUE):

  1. `/` — SiteHeader/SiteFooter. Booking widget calls `/api/geo/suggest` + `/api/geo/reverse` (Mapbox, no photon.komoot) and `POST /api/quote` (engine completeness is Phase 4; this phase proves the widget is wired, not a fixture price). Reviews hydrate from `public.reviews` published rows only — **hide the whole `#reviews` block if none**, never hardcoded cards or an empty carousel shell. Class/hero photos from R2 `/photos/site/*`. Hourly off. No become-a-partner. Amounts `CHF 000` until `pricing_live`. Flight: `GET /api/flight`; on `provider_unavailable` empty field + honest copy — **no local `FLIGHTS` samples**, no fake time/status.
  2. `/about` `/faq` — live DC routes, header/footer, four languages. Copy from the i18n dict (Phase 6 `CONTENT_SOURCE=json` stays). TBC pills only where the owner has not supplied text. No fake CMS, no lorem.
  3. `/contact` — Turnstile + `POST /api/contact`. Success only after a row in `contact_submissions` and the delivery outbox. Inbox to the real support address. Phone + WhatsApp `+41 79 626 70 82` / `wa.me/41796267082`. 05-27 staging UAT (fresh token, replay reject, genuine inbox) is the first gate. Do not submit the live form without owner permission.
  4. `/cookies` `/privacy` `/terms` `/imprint` `/cancellation` — live routes. Owner-supplied numbers in; everything else a labelled TBC pill. Never invent legal text. No Language row. A page that exists in fewer than four languages carries `data-vt-legal` and says so. Cookie **banner UI** ships here; writing `consent_log` is Phase 10 — do not fake a consent API in this phase.
  5. `/sign-in` `/account` `/reset-password` — `POST /api/auth` + `GET /api/auth/session`. Email/password, magic link, passkey only. No Google, Apple, LinkedIn, phone-verify. Account Save writes GoTrue (`update-profile`); session hydrates name/email/phone. Sign-out from header works. Password fields have a right-side eye. Branded auth mail via the Send Email hook, not a raw URL dump.
  6. `/coming-soon` is the real static product page (200). Public `/login` is 404 (ops login is dashboard only). `/partner` `/become-a-partner` `/fleet` stay 404.
  7. Every page holds 1440 / 1024 / 768 / 390 px with nothing scrolling sideways. Four languages same pass, Arabic RTL.
  8. **Close bar — staging connection table** (Chrome-UA curl + one signed-in account pass on `https://vamostaxi.site`). Every in-scope URL: HTTP 200 (or the 404s in #6), named `/api/*` fingerprint in the served HTML where an API is required, that API not 404. Mock localStorage, fixture arrays, and fake VT-refs on these pages are a fail. Out of this phase (must 200 as DC shells today, but live data is later): `/checkout` `/confirmation` (Phase 7), `/bookings` `/manage-booking` `/booking-detail` (Phases 8–9). Do not POST `/api/quote` to “check the wire.”

**Plans**: 05-01…26 executed. 05-19 dropped (partner page out; `05-19-SUMMARY.md`). 05-24 folded into 27.1 (sign-up mails) and the /contact job; what is left is the owner's checks (`05-24-SUMMARY.md`). 05-27 executed. 05-28 closed 2026-10-01: three comments were already live, the rest shipped as 05-28-B8, main `c5157913`, Worker `fae3e473` (`05-28-SUMMARY.md`, `05-28-B8-SUMMARY.md`).

**Wave 12** *(executed 2026-09-04)*

- [x] 05-29-PLAN.md — Public GET `/api/reviews` + hide `#reviews` when empty
- [x] 05-30-PLAN.md — Delete home `FLIGHTS` fixtures
- [x] 05-31-PLAN.md — Drop `partner_applications` + leftover copy
- [x] 05-32-PLAN.md — Update `05-OWNER-CHECKS.md` (no dashboard re-clicks)

**Wave 13** *(executed 2026-09-04)*

- [x] 05-33-PLAN.md — Staging per-URL connection table (no quote POST, no contact submit). Table: `05-CONNECTION-TABLE.md`. Worker `vamos` `093a4976`.

**UI hint**: yes

### Phase 5.1: CSS and CI clean-up (INSERTED)

**State**: Complete 2026-09-02. Only `05.1-02-SUMMARY.md` is on file (WhenPicker harness parse and range
visual lock, branch `gsd/05.1-02-whenpicker-harness`); no plan file was committed. Added to this roadmap by
the bookkeeping job on 2026-10-01 so GSD stops offering it as the next phase.

### Phase 5.2: One-way only (INSERTED)

**State**: Complete 2026-09-03. The home mock has no Return tab; the quote is always one way, one leg.
`05.2-01-SUMMARY.md`, `05.2-UAT.md` (3 of 3). V1 is one-way only (owner rule).

### Phase 6: Ops Reference Data & Content Console

**Goal**: Staff run the operational reference data and site content that power the public
site, from a role-gated ops console — the non-money-touching half of the ops build that
does not need to wait for checkout.
**Depends on**: Phase 3
**Parallel with**: Phase 4, Phase 5
**Requirements**: OPS-06, OPS-07, OPS-08, OPS-09, OPS-10, I18N-07
**Success Criteria** (what must be TRUE):

  1. The ops console is reachable only by staff on `dashboard.vamostaxi.site` (`/login` → `/`), serving the DC ops mock wired to real staff APIs — not a React twin.
  2. Staff can manage vehicle classes, vehicles, chauffeurs, fixed routes, distance rates, surcharges and coupons.
  3. Staff can see customers and their booking history, and can publish, hide and reorder the reviews shown on the home page.
  4. Staff can edit business settings and the content strings behind the site copy, and every string it manages is stored in the database rather than the static dictionary file — the ~600-string legal-page dictionary migrates here as professional translations arrive, tracked as ongoing work within this phase rather than a separate late i18n phase.

**Plans**:

**Wave 1**

- [x] 06-01-PLAN.md — Delete the React ops twin; keep staff APIs
- [x] 06-02-PLAN.md — Staff JSON door + empty VamosOps remote store (rate-book path map)

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 06-03-PLAN.md — Dashboard host `/login` DC, invite → `/login`, password eye, MFA paused

**Wave 3** *(blocked on Wave 2 completion)*

- [x] 06-04-PLAN.md — Fleet / chauffeurs JSON + R2 photos
- [x] 06-05-PLAN.md — Pricing draft→publish (`PUT /api/staff/rate-book`)
- [x] 06-06-PLAN.md — Coupons
- [x] 06-07-PLAN.md — Customers read-only
- [x] 06-08-PLAN.md — Reviews publish/hide/reorder + photo upload
- [x] 06-09-PLAN.md — Settings / roster / profile + D-12 nav hide
- [x] 06-10-PLAN.md — `content_strings` editor in OpsContent.dc.html

**Wave 4** *(blocked on Wave 3 completion)*

- [x] 06-11-PLAN.md — I18N-07 loader last; `CONTENT_SOURCE` default json

**Wave 5** *(blocked on Wave 4 completion)*

- [x] 06-12-PLAN.md — Dashboard comment pack: `#staff`, passkeys, Zurich digest, four classes

**Wave 6** *(blocked on Wave 5 completion)*

- [x] 06-13-PLAN.md — UAT regressions: in-place hash fade, Fleet hierarchy, avatar, branded digest

**UI hint**: yes

### Phase 6.1: Dashboard instant sidebar navigation (INSERTED)

**State**: Executed 2026-09-04 (`06.1-01-SUMMARY.md`, status "executed-pending-uat"): the dashboard-only hash
animation is gone from `app/vamos-page-transition.js`; the owner rule "no `vt-ops-hash-switch`" stands. Added
to this roadmap by the bookkeeping job on 2026-10-01.

### Phase 7: Checkout & Payment

**Goal**: A customer pays for a locked quote on staging and gets a webhook-confirmed
booking in Postgres — not a localStorage theatre. `/checkout` and `/confirmation` are
production-grade on Stripe **test** mode. This gates Phases 8 and 9. Live Stripe keys and
real charges wait for Phase 11.
**Depends on**: Phase 4
**Requirements**: PAY-01, PAY-02, PAY-03, PAY-04, PAY-05, PAY-06, PAY-07
**Success Criteria** (what must be TRUE):

  1. `/checkout` carries the locked quote from Phase 4 (quote id + signature). Passenger + contact fields validate server-side. Guest checkout works with email + manage link (account optional). No PayPal. No cash-to-driver. No hourly. No invoice-on-account. Company billing (name, address, VAT) + Stripe **pay-link** (whoever pays first) is in the remainder. PayPal and cash radios are **deleted** from the DC, not hidden. Checkout URLs: `/checkout/trip`, `/checkout/details`, `/checkout/payment`. Price held 24 hours.
  2. Pay is Stripe test Checkout/PaymentIntent (card, Apple Pay, Google Pay, TWINT) in CHF. `pay()` must not invent `VT-5xxx`, must not only `saveTrip` to localStorage, must not `location.href = 'confirmation.dc.html'`. The browser return does not confirm the booking.
  3. Booking is confirmed only by the verified Stripe webhook. Rows exist: `bookings` + `booking_legs` + `price_snapshots` + `booking_payments`. Reference is `next_booking_reference()`. Isolation-probe leftovers are not these rows. Pay-link mints `VT-` when the email is sent (unpaid until webhook).

  4. Replay / out-of-order webhooks cannot double-charge, double-confirm, or double-send mail (`stripe_events.processed_at`).
  5. `/confirmation` reads the paid booking from the Worker (auth cookie or manage token), never a mock file. Shows real reference, route, time, vehicle, amount. Confirmation email in the booking locale: voucher, manage link, calendar invite. Branded, not a raw URL dump.
  6. Coupons apply only through the quote/checkout APIs (window + caps). Checkout still refuses when `pricing_live=false` except the already-approved `PRICING_PREVIEW` display path — do not flip live.
  7. **Close bar — staging connection table**: `/checkout` and `/confirmation` HTML fingerprints `/api/` payment/booking routes (not `saveTrip` / fake `VT-`). Dummy card path on Stripe test only, owner-gated. `GET /confirmation` without a real booking does not paint a fake VT-ref.

**Plans**: 16/16 — UAT complete 2026-09-11 (07-UAT.md). Owner ticked closed 2026-09-12.

Plans:

- [x] 07-01 … 07-10 — paper (SUMMARYs exist; live pay path still mock)
- [x] 07-11-PLAN.md — 24h lock (hosted `checkout-lock-24h` 1440)
- [x] 07-12-PLAN.md — three URLs + Home Continue
- [x] 07-13-PLAN.md — company billing + pay-link + whoever-first
- [x] 07-14-PLAN.md — guest no-password + Finish payment + manage status
- [x] 07-15-PLAN.md — unmock confirmation + Worker `vamos` 8076eebc
- [x] 07-16-PLAN.md — display FX, charge CHF (`/api/fx` live; Worker deploy this sitting)

**UI hint**: yes

### Phase 8: Ops Dispatch — Live Board, Assignment & Account Surfaces

**Goal**: Staff run the day from real paid bookings on `dashboard.vamostaxi.site`.
`VamosOps.bookings` is a staff API, not `emptyBookings()`. Customer `/bookings` is Postgres,
not localStorage. No fixture `VT-48xx`. No auto-dispatch. No driver app. Admin-only
(`koussayzayeni@gmail.com`). Isolation-probe leftover bookings are not product data.
**Depends on**: Phase 5, Phase 6, Phase 7
**Requirements**: OPS-01, OPS-02, OPS-03, OPS-04, OPS-05, SITE-03, AUTH-06, DATA-08
**Success Criteria** (what must be TRUE):

  1. Delete `emptyBookings`. `VamosOps.bookings` hydrates from `/api/staff/bookings` (and detail by id). 404/network → empty list, never fixtures. A Phase 7 paid booking appears on `#dashboard` / `#bookings` / `#calendar` without a full reload.
  2. `#` detail (`OpsDetail`) is the paid row: contact, route, legs, snapshot, payment, append-only `booking_events`. No mock timeline.
  3. Dispatcher assigns chauffeur + vehicle by hand. Double-booking is refused by the database exclusion, not only the UI. Unassign works. Fleet tables stay the Phase 6 APIs (empty fleet is a real empty state, not seeded fake cars).
  4. Phone booking in ops uses the same quote engine as `/api/quote`, then the same payment/confirm path as Phase 7 (or an explicit “paid outside Stripe” staff action that still writes snapshot + payment row — no silent fake confirm). Confirm / modify / cancel / refund are staff APIs, not local `save()`.
  5. `/bookings` (public, signed-in) lists that customer’s rows from Postgres. Opening a row uses a live detail route (shell may exist; **data** here, URL 404 for `/booking-detail` is closed in Phase 9 if still missing). Guest claim-into-account from the manage link works (AUTH-06).
  6. `#customers` booking history is `GET /api/staff/customers/:id`, not a fixture. Zero real customers → empty, not Isolation Customer*.
  7. **Close bar — staging connection table** (dashboard + public, signed-in admin + one test customer): `#dashboard` `#bookings` `#calendar` detail `#customers` `/bookings` each fingerprint a `/api/staff/*` or customer bookings API. `vamos-ops-data.js` still containing `emptyBookings` / `all: function () { return []; }` is a fail.

**Plans**: TBD
**UI hint**: yes

### Phase 9: Booking Lifecycle & Customer Self-Service

**Goal**: A real booking (Phase 7 row) lives its full lifecycle on staging — manage link,
detail route, reminders, time-change (ops confirm), self-serve cancel/refund, review request — with
no mock lookup and no 404 shells. Cancel windows are D-02 (owner 2026-09-12). Do not invent CHF amounts.
**Depends on**: Phase 7, Phase 8
**Requirements**: LIFE-01, LIFE-02, LIFE-03, LIFE-04, LIFE-05, LIFE-06, LIFE-07, LIFE-08
**Success Criteria** (what must be TRUE):

  1. Status moves quote → pending → paid → confirmed → assigned → completed / cancelled / no-show. Refunds are a money line, not status `refunded`. Every move writes `booking_events`. No client-only status.
  2. Self-serve cancel uses D-02 vs original Zurich pickup: >24h automatic full Stripe refund of captured amount; 24h–6h cancel immediately, refund pending ops (default 100%); ≤6h and after pickup (not Completed) cancel with 0 automatic refund. Completed/No-show hide customer Cancel. Ops may still refund.
  3. `/manage-booking` looks up by the hashed guest token (`booking_access_tokens`), not a mock reference field. Guest stays `manage-booking.dc.html` as-is (wired live). Signed-in `/confirmation/{ref}` extends `BookingVoucher`. Same fields/copy/refund line, not one React component. `/booking-detail` is a live 200 route (today 404 is a fail). Assigned chauffeur name, vehicle, plate come from fleet rows once assigned — empty until then, never fake names.
  4. Pre-pickup 24h reminder is a real `booking_notifications` + Resend row. Stale unpaid bookings expire on the hourly Worker. **No auto no-show sweep** (ops marks Completed/No-show). Time change is customer request + ops confirm; no AeroDataBox; no fixture LX1234.
  5. After ops marks Completed or paid no-show, the customer gets a review request; submitted review lands in `public.reviews` and can be published from ops (Phase 6 APIs). Home then shows it (Phase 5 reviews-from-DB).
  6. **Close bar — staging connection table**: `/manage-booking` `/booking-detail` `/bookings` `/confirmation` fingerprint token/booking APIs. A manage-token miss is an error state, not a demo booking. `/booking-detail` 404 is a fail. Dummy-card paid cancel writes `booking_events` + `booking_refunds` (or honest Failed) + Resend.

**Plans:** 12 plans

**Wave 1** — Wave 0 tests

- [x] 09-01-PLAN.md — Wave 0 pgTAP + Vitest (D-02/refund/review/booking-detail; LIFE-07 no-sweep green now)

**Wave 2** *(blocked on Wave 1)*

- [x] 09-02-PLAN.md — Status roll-up + D-02 cancel/refund SQL (local only)

**Wave 3** *(blocked on Wave 2)*

- [x] 09-03-PLAN.md — reviews.booking_id + submit_review SQL (local only)

**Wave 4** *(blocked on Wave 3)* **[BLOCKING hosted SQL]**

- [x] 09-04-PLAN.md — [BLOCKING] Apply Phase 9 SQL on Zurich + regenerate database.types.ts

**Wave 5** *(blocked on Wave 4)*

- [x] 09-05-PLAN.md — Guest + signed-in paid-cancel → Stripe test refund; Ops remaining refund + ops cancel money (D-13)
- [x] 09-06-PLAN.md — Lifecycle Resend templates + claim-then-send (bookings@)

**Wave 6** *(blocked on Wave 5)*

- [x] 09-07-PLAN.md — Hourly 24h reminder + assignment-customer + cancel mails; no no-show sweep
- [x] 09-08-PLAN.md — DC manage-booking + live /booking-detail 200 wired to APIs

**Wave 7** *(blocked on Wave 6)*

- [x] 09-09-PLAN.md — Signed-in BookingVoucher paid Cancel; unpaid list hard-delete only

**Wave 8** *(blocked on Wave 5 mail + Wave 4 SQL)*

- [x] 09-10-PLAN.md — Time-change request/confirm + flight-number edit (no AeroDataBox)
- [x] 09-12-PLAN.md — Customer /review submit + photo R2 + /cancellation copy matching D-02

**Wave 9** *(blocked on Wave 4 + complete RPCs)*

- [x] 09-11-PLAN.md — Ops complete/no-show + review-request chips + OpsDash Income/Expenses/Net

**Cross-cutting constraints:** hashed guest token (never sample TRIP); Stripe test mode only (`sk_live_` refused); Hyperdrive direct never Supavisor :6543; Resend `bookings@vamostaxi.site`; no invented CHF; D-31 no auto no-show sweep.

**UI hint**: yes

### Phase 10: Hardening — Performance, Security & Compliance

**Goal**: The site survives a launch-day surge, keeps secrets and payments safe, and never
captures personal data ahead of a provable, server-side consent record. The consent log
must exist and be gating before any IP-capturing monitoring tool (Sentry) is enabled — this
sequencing is deliberate, not incidental.
**Depends on**: Phase 9
**Requirements**: LAUNCH-01, LAUNCH-02, LAUNCH-03, LAUNCH-04, LAUNCH-07, SITE-08
**Success Criteria** (what must be TRUE):

  1. The site holds 10,000 concurrent browsing visitors with page p95 under one second and the database barely touched.
  2. Every public API route is rate-limited, every public form is challenge-protected, and the payment webhook is verified by signature.
  3. The cookie banner gates exactly what it promises to gate, and the customer's choice is recorded server-side with the policy version — live and verified before any IP-capturing monitoring tool is switched on.
  4. Errors, uptime and a health check covering database, payments and maps report to a place someone actually watches.
  5. Backups run on a schedule and a restore has actually been performed once; a runbook exists for refunds, resending an email, manual assignment and restoring the database.

**Plans**: 10-01 … 10-10. Restore Task 3 parked (Supabase Free). WAF skip live on vamostaxi.site.

### Phase 11: Launch Cutover

**Goal**: Vamos Taxi goes live on its real domain with real pricing — the final, largely
irreversible gate.
**Note:** CONTEXT D-01…D-35: this phase host is `vamostaxi.site`. Forget `.eu` as live host. Stripe stays test. No Search Console submit. No JSON-LD.
**Depends on**: Phase 10
**Requirements**: LAUNCH-05, LAUNCH-06
**Success Criteria** (what must be TRUE):

  1. `vamostaxi.eu` points at the Worker, every old Freshpage CMS URL redirects to its new home, and the sitemap is submitted.
  2. `pricing_live` is flipped to true only after the real CHF matrix is loaded and owner-approved on staging.

**Plans:** 11/12 plans executed by agents. 11-12 is the owner's own step (price book row 18 Publish); `11-12-SUMMARY.md` records it as owner-held, not as done.

**Wave 1**

- [x] 11-01-PLAN.md — Wave 0 tests (VALIDATION 11-01-*)

**Wave 2** *(blocked on Wave 1)*

- [x] 11-02-PLAN.md — Git migration public_chf + vat_rate_bps (hosted apply is 11-11)
- [x] 11-10-PLAN.md — Extract .eu copy into existing pages (VALIDATION 11-10-01)

**Wave 3** *(blocked on Wave 2)*

- [x] 11-03-PLAN.md — Public pricing_live AND public_chf (VALIDATION 11-03-*)
- [x] 11-04-PLAN.md — Publish-as-flip SQL on the DC POST path (VALIDATION 11-04-01)

**Wave 4** *(blocked on Wave 3)* — CHF 000 belt

- [x] 11-06-PLAN.md — BookingBoard CHF 000 until pricing_live (VALIDATION 11-06-01)
- [x] 11-07-PLAN.md — Injected VAT bps, fallback 81; intent JSON vat_rate_bps (VALIDATION 11-07-*)

**Wave 5** *(blocked on Wave 4)* — drop noindex only after 000 belt

- [x] 11-05-PLAN.md — Host-split noindex + SITEMAP_ROUTES after 11-06 (VALIDATION 11-05-*)
- [x] 11-08-PLAN.md — Staff PATCH vat_rate_bps; CheckoutClient reads extras/intent vat_rate_bps (VALIDATION 11-08-01)

**Wave 6** *(blocked on Wave 5)*

- [x] 11-09-PLAN.md — VAT % on OpsPricing rail, dual copy (VALIDATION 11-09-01)

**Wave 7** *(blocked on Wave 6)* **[BLOCKING hosted SQL]**

- [x] 11-11-PLAN.md — Owner apply SQL on yaumjzvylngfjhtuffqs (VALIDATION 11-11-01)

**Wave 8** *(blocked on Wave 7)*

- [ ] 11-12-PLAN.md — OWNER'S STEP, never an agent's: he approves the numbers on dashboard /pricing and clicks Publish on price book row 18. Agents do not raise it. Public amounts stay `CHF 000` until then

### Phase 12: Ticket schema + #support mock

**Goal**: `contact_submissions` is the ticket header with New/Open/Replied/Responded/Closed;
`OpsSupportTicket.dc.html` + sidebar `#support` exist as a mock; Staff tab stays gone. No
parallel `support_tickets` table.
**Depends on**: Phase 6 (ops console + `contact_submissions`)
**Requirements**: SUP-02
**Success Criteria** (what must be TRUE):

  1. Board shows five statuses: New, Open, Replied, Responded, Closed — dispatcher Open / Close / Reopen only.
  2. Ops sidebar has `#support`; there is no `#staff` rail item.
  3. No parallel `support_tickets` table exists — tickets are `contact_submissions` plus `support_messages` / `support_inbound_events`.
  4. Migration adds `ticket_status`, `reply_token`, `last_activity_at`, `closed_at` on `contact_submissions`; FORCE RLS; no anon grants; `submit_contact_message` mints the token and seeds `inbound_form`.
  5. Mock is four languages / four widths. Funnel Phases 7–11 untouched. Must-nots: no `POST /api/quote`, no live DNS, no `env.production`, no push `main`.

**Plans**: TBD
**UI hint**: yes

### Phase 13: Staff APIs + outbound Resend replies

**Goal**: Dispatcher sends a reply from the ticket via Resend; the customer Gmail thread
continues; `info@` gets a BCC copy; RFC `Message-ID` is persisted. Contact ack stays
Cloudflare `EMAIL`.
**Depends on**: Phase 12
**Requirements**: RPLY-01, RPLY-02
**Success Criteria** (what must be TRUE):

  1. Dispatcher sends a reply from the ticket; the customer receives it in Gmail on the same thread.
  2. `info@vamostaxi.site` receives a BCC copy of that staff reply (Resend BCC, not a second `env.EMAIL` send). Gmail is a copy; Ops is the working inbox.
  3. RFC `Message-ID` is persisted (GET-after-send — not Resend UUID, not 12-char outbox suffix). From and Reply-To on replies are `replies.vamostaxi.site`.
  4. Contact ack stays Cloudflare `EMAIL`. Ticket replies are Resend only.
  5. Must-nots: no `POST /api/quote`, no Staff tab, no live DNS, no `env.production`, no push `main`, funnel Phases 7–11 frozen.

**Plans:** 10/10 plans executed

Plans:
**Wave 1**

- [x] 13-01-PLAN.md — Wave 0 web tests (write path, GET identity, overlay sendError)
- [x] 13-02-PLAN.md — Wave 0 emails tests (staff fields, wordmark, skip-send)

**Wave 2** *(blocked on Wave 1)*

- [x] 13-03-PLAN.md — GET-after-send helper, staffSender, unminted threadHeaders
- [x] 13-04-PLAN.md — chrome.ts + layout + Confirmation wordmark

**Wave 3** *(blocked on Wave 2)*

- [x] 13-05-PLAN.md — Staff reply fields + claim-path skip-send
- [x] 13-06-PLAN.md — Contact-ack GET RFC persist; EMAIL fallback stays
- [x] 13-08-PLAN.md — PayLink / OpsMustFix / ChauffeurAssign import chrome

**Wave 4** *(blocked on Wave 3)*

- [x] 13-07-PLAN.md — patchTicket send → GET persist → Replied; BCC info@

**Wave 5** *(blocked on Wave 4)*

- [x] 13-09-PLAN.md — Overlay sendError four languages + dual-DC; invert rejectStaffReply

**Wave 6** *(blocked on Wave 5)*

- [x] 13-10-PLAN.md — Must-not greps + live Gmail/BCC human-check

### Phase 14: Inbound webhook

**Goal**: Signed Resend inbound webhook appends matched customer replies to the existing
ticket. Unmatched mail does not become a ticket. Closed stays closed.
**Depends on**: Phase 13
**Requirements**: INB-02
**Success Criteria** (what must be TRUE):

  1. Mail that is not a reply to an existing ticket does not become a ticket. Ops ignores it.
  2. Webhook is signed (Svix `svix-*` headers, raw body). Unsigned POST is 4xx on **deployed** staging.
  3. Match order: plus-token in `to` / `received_for`, then RFC `In-Reply-To` / `References` against stored ids. Never match on `From`.
  4. Closed stays closed — a customer reply on a Closed ticket does **not** auto-reopen (owner decision).
  5. Must-nots: no `POST /api/quote`, no Staff tab, no live DNS, no `env.production`, no push `main`, funnel Phases 7–11 frozen.

**Plans:** 7/7 plans complete

Plans:
**Wave 1**

- [x] 14-01-PLAN.md — Wave 0 tests (match order, drop, strip, file caps)

**Wave 2**

- [x] 14-02-PLAN.md — quote-strip + received_for / RFC parse
- [x] 14-04-PLAN.md — support_message_files SQL in git (not applied)

**Wave 3**

- [x] 14-03-PLAN.md — ingest plus-token then RFC; Closed→Responded

**Wave 4**

- [x] 14-05-PLAN.md — R2 SUPPORT_FILES + MIME/size caps

**Wave 5**

- [x] 14-06-PLAN.md — receiving GET + staff file GET

**Wave 6**

- [x] 14-07-PLAN.md — owner apply SQL + staging R2 bind (no MX)

### Phase 15: Wire Ops #support to APIs

**Goal**: Live `#support` talks to staff APIs — list, thread, `booking_ref`+`locale`,
status filters — in EN/DE/FR/AR. Staff tab stays gone. Render escaped text, not raw HTML.
**Depends on**: Phase 12 (mock), Phase 13 (APIs). Does not need live MX.
**Requirements**: SUP-01, SUP-03, SUP-04, SUP-05
**Success Criteria** (what must be TRUE):

  1. Dispatcher opens Ops `#support` and sees every contact submission as a live ticket list.
  2. Opening a ticket shows the original form (name, email, phone, message, time) plus the thread, newest last; `booking_ref` and `locale` when they exist.
  3. Dispatcher can filter the list by status.
  4. EN/DE/FR/AR same pass; Staff tab gone; stored text is escaped, never raw inbound HTML.
  5. Must-nots: no `POST /api/quote`, no live DNS, no `env.production`, no push `main`, funnel Phases 7–11 frozen. Keep the DC hash console — no Next.js `/ops/support` page.

**Plans:** 3/3 plans complete

Plans:
**Wave 1**

- [x] 15-01-PLAN.md — Save PATCH phone+ref+note; refuse unknown booking_ref
- [x] 15-02-PLAN.md — GET map files optional; escaped text bodies

**Wave 2**

- [x] 15-03-PLAN.md — DC Save, New+Responded badge, focus hydrate, files in bubble, dual-DC

**UI hint**: yes

### Phase 16: Staging MX + end-to-end UAT (COMPLETE)

**State**: Complete. Built, `16-UAT.md` complete, 10 of 10 passed. The old "not started" was stale
(`.planning/PHASE-CLOSURE-2026-09-29.md`, section "Closed").

**Goal**: Staging receiving MX on `replies.vamostaxi.site` only. Customer Reply-in-Gmail
appends to the same ticket. Apex Gmail `info@` unchanged. No live `vamostaxi.eu` DNS.
**Depends on**: Phase 14, Phase 15
**Requirements**: INB-01
**Success Criteria** (what must be TRUE):

  1. Customer hits Reply in Gmail and that mail appends to the **same** ticket.
  2. MX is only on `replies.vamostaxi.site`. Apex `dig MX vamostaxi.site` still delivers `info@` to Gmail.
  3. No live `vamostaxi.eu` DNS (`dig MX vamostaxi.eu` untouched). No push to `main`. No `env.production`.
  4. UAT also proves: intake + reply copies at `info@`; unsigned webhook 4xx on deployed staging; spoofed `From` does not append; `<script>` fixture is escaped in `#support`.
  5. Funnel Phases 7–11 still frozen. Must-nots: no `POST /api/quote`, no Staff tab.

**Plans**: 4 plans

- [x] 16-01-PLAN.md — Wave 0: staffSender false-path tests (flag stays false)
- [x] 16-02-PLAN.md — Resend + Cloudflare receiving MX on replies. only
- [x] 16-03-PLAN.md — Verified readback → flag true → deploy Worker vamos
- [x] 16-04-PLAN.md — Live Gmail UAT (INB-01) — autonomous: false (UAT 10 of 10 passed)

**UI hint**: observation-only — 16-UI-SPEC.md (no new chrome)

### Phase 17: Ops chauffeur profile, shift roster, two-driver vehicles (CLOSED, feature removed, owner 2026-09-29)

**State**: Closed, never build. Owner: "we deleted that part". If it is wanted later it gets a fresh phase.
The fleet model that is live instead is "chauffeurs by class" (main `b0ee0421`, 2026-10-01; no cars page, owner
decision `.planning/decisions/2026-10-01-no-cars-page.md`). The folder was removed on 2026-09-29; the last
commit that has it is `37e55d26`. `17-UAT.md` stays as history in that commit. The full former text of this
section is in git history before this commit.
**Source**: `.planning/PHASE-CLOSURE-2026-09-29.md`, sections "Closed" and "Folders removed on 2026-09-29".

### Phase 18: OPS Pricing source of truth

**Goal**: `https://dashboard.vamostaxi.site/pricing` is the only fare book. Every add/edit/delete/Publish on that page drives quote, checkout recap, confirmation, ops amounts, Stripe, and new booking mail. New layout, same Vamos tokens. Desktop, tablet, mobile.
**Depends on**: Phase 11 code merged. Does **not** block owner Publish on the live page. Public stays `CHF 000` until that click. Stripe stays test until the owner says live keys. No `vamostaxi.eu`.
**Requirements**: See `.planning/phases/18-ops-pricing-source/18-CONTEXT.md`
**Success Criteria** (what must be TRUE):

  1. Save writes draft only. Publish is the only flip — instant, all-or-nothing, exact errors. After Publish, `/pricing` shows the live book.
  2. Distance recipe is start + (all km × per-km) + bands on top (example: 100 + 14.6×12 = CHF 275.20). Charge always CHF. No region %.
  3. Checkout extras list is built from this page after Publish. Surcharges tab is one list. No History. No Preview.
  4. After Publish, home / checkout / quote offer **only** live-book classes. Delete = gone. No hardcoded Economy / Business / First / Van ladder. Live UAT on `vamostaxi.site`.
  5. Must-nots: no invented CHF, no live Stripe keys, no `.eu`, no driver app, no auto-dispatch. Agent does not Publish. Agent does not `db push`.

**Plans:** 7/7 plans executed

Plans:
**Wave 1**

- [x] 18-01-PLAN.md — Public quote board = live book (delete omitted, hide listed)
- [x] 18-02-PLAN.md — Kill four-class ladder on home/checkout; git quote_rate_book SQL

**Wave 2** *(blocked on Wave 1)*

- [x] 18-03-PLAN.md — Draft/Publish UX: live after Publish, no History, no Preview

**Wave 3** *(blocked on Wave 2)*

- [x] 18-04-PLAN.md — Money: start + km × per-km + bands; no region %; overlap blocks Publish
- [x] 18-05-PLAN.md — Fixed routes place then canton; extra stop max 1; Mapbox unfenced

**Wave 4** *(blocked on Wave 3)*

- [x] 18-06-PLAN.md — Any class + R2 photo; one surcharges list; extras from that list

**Wave 5** *(blocked on Wave 4)*

- [x] 18-07-PLAN.md — Same math everywhere; extra wait not in pay-now; owner apply SQL + owner Publish UAT

History of 2026-09-13: `.planning/phases/18-ops-pricing-source/archive-2026-09-13/`

**UI hint**: yes — `18-UI-SPEC.md` 2026-09-14 approved (four tabs, VAT-only rail, `--vt-*` only)

### Phase 19: 10,000-booking surge proof on the 26.3 checkout (CLOSED)

**State**: closed by the owner on 2026-09-30 and confirmed on 2026-10-01 23:59 (+04) in the controller
session: no surge test, not a launch item (`.planning/decisions/2026-10-01-phase19-and-26.2-units-closed.md`).
The plans 19-01 to 19-05 stay as history without a SUMMARY. The `sk_live_` refund refusal moved to B3.

**Goal**: The quote, checkout and booking save are proven with 10,000 bookings at once, on a copy of the database behind a hidden test Worker with a fake Stripe, then about 200 real sandbox payments through Stripe's page.
**Depends on**: 26.0, 26.2, 20. The owner's paid steps: Cloudflare Workers Paid and a copy of the database.
**Requirements**: Parked until discuss. Do not invent LAUNCH IDs.
**Success Criteria** (what must be TRUE): the pass bar of `19-CONTEXT.md` D-03 and its must-nots. Before real launch the guard that refuses automatic refunds with an `sk_live_` key (`lib/lifecycle/paid-cancel.ts`) is settled with the owner.

**Plans:** 5 (19-01 test switches · 19-02 busy-and-retry on PAY · 19-03 owner paid setup · 19-04 burst + real sample · 19-05 tear-down). Signed 2026-09-29.
**UI hint**: PAY on `/checkout` shows "Busy — trying again" and retries by itself, four languages.

### Phase 20: Security check of the changed app (2026-10)

**Goal**: A new security check of the whole app, starting with what 26.1, 26.3, 26.4 and 26.5 changed. Serious findings are fixed in the phase; every other finding is one question to the owner.
**Depends on**: 26.2
**Requirements**: SEC-01 … SEC-12 (done), SEC-13 … SEC-16
**Success Criteria** (what must be TRUE): see `20-CONTEXT.md`. Leads passed in by the control session are listed in `.planning/CONTROL-BOARD.md`, "Passed to Phase 20".

**Plans:** 20-01…03 done · 20-04, 20-05 superseded · 20-06 check, done 2026-09-30 · 20-07 serious fixes (F1, F2, F3), live · 20-08 owner decisions, fixes live in batches A, B1, C1, C2 and the e-mail change fix; F15 on main with B7 (`ea1141e7`, 23:55) · 20-10 refunds by hand, live 2026-10-01 (`f29623da`) · 20-12 erased-booking pay link, live 2026-09-30 (`a81e194e`) · **20-09 live proof: done 2026-10-02** (`20-09-LIVE.md`, `20-09-SUMMARY.md`: every fix re-probed on Worker `ae61d012` and again after P6 on `c6a4ecac`, every Phase 20 function md5-identical to its file, the owner's 4242 payment VT-26-0750 passed)

**Complete, 2026-10-02 03:15 (+04).** Drift D1–D8 between live and the migration files (none from Phase 20; D1:
`20260911000002_live_passenger_extras.sql` was never applied on live) is passed to the control session as findings.
Owner steps left outside the phase: refund by hand (20-10, board step 6), then B3 live-key refusals.

**Before the close, 2026-10-01 23:53 (+04):** leftovers G7, G10, G11, G12, G28 are on main as `3e2bba66` (23:49, squash of
`claude/project-thread-cwny3q` `84cb34cb`; fresh review "safe to ship"); migration `20261007180000` applied on
live and read back (commit message). The Worker deploy that carries G28 was not yet on the control board when
read. Left: 20-09, the live proof (the owner's 4242 payment and refund by hand, then a re-probe of A to C2 and
the leftovers). Also tracked outside this phase: B3 live-key refusals, G23 after B7, G8/G9 after P6.
**UI hint**: no new screens.

### Phase 21: Charge gate + visible refusal + payable intent (SUPERSEDED by 26.1 and 26.3, owner 2026-09-29)

**State**: Replaced, never build. 26.1 is live; this phase was built on `gsd/phase-21-charge-gate` but never
fully tested, and its client code was rebuilt by 26.3. The folder was removed on 2026-09-29; the last commit
that has it is `37e55d26`. Requirements PAY-08, PAY-09.

### Phase 22: Card confirm + thank-you webhook wait (SUPERSEDED by 26.3, owner 2026-09-29)

**State**: Replaced, never build. Payment is Stripe's hosted page; there is no card form on vamostaxi.site.
Never had a folder. Requirements PAY-10, PAY-12.

### Phase 23: Wallets + Dashboard methods (SUPERSEDED by 26.3, owner 2026-09-29)

**State**: Replaced, never build. Stripe's page shows card, Apple Pay, Google Pay and TWINT. Never had a
folder. Requirement PAY-11.

### Phase 24: Dual-payer, pay-link, mail split (SUPERSEDED by 26.1 and 26.3, owner 2026-09-29)

**State**: Replaced, never build. 26.1 built the server side; 26.3 removed the pay-link option from checkout.
Never had a folder. Requirements PAY-14 to PAY-17.

### Phase 25: /bookings unpaid + TEST UAT + secret-swap design (SUPERSEDED by 26.1 and 26.3, owner 2026-09-29)

**State**: Replaced, never build. Never had a folder. Requirements PAY-13, PAY-18. The live Stripe key stays
the owner's word (launch item).

**Source for 21 to 25**: `.planning/PHASE-CLOSURE-2026-09-29.md`, section "Replaced, do not build". The full
former text of these five sections is in git history before this commit.

### Phase 26: Legal gate

**Goal**: The pixel and the Purchase call stay off until the owner pastes the banner,
cookies, and privacy lines in en, de, fr, and ar. A new consent policy version means
an old Accept does not turn Meta on. No drafted sentences. The flag stays off.
**Depends on**: none in v1.3. Does not start Phases 16/17/19/20 or 21–25.
**Requirements**: META-01, META-02
**Success Criteria** (what must be TRUE):

  1. While any of banner, cookies, or privacy lines is missing in en, de, fr, or ar, the legal flag is off and neither the pixel nor the Purchase call can run.
  2. A new consent policy version is required. An Accept stored under the old version, when marketing was stored off, does not turn Meta on.
  3. This phase writes no banner, cookies, or privacy sentences. The flag stays off.
  4. Must-nots: no `sk_live_`, no `vamostaxi.eu`, no invented legal copy, no invented CHF, no hashed email or phone, no browser Purchase, no middle events (quote seen, checkout started, pay step). Do not load `fbevents.js`. Do not change quote, pay, or confirmation.

**Plans:** 2/2 plans complete

Plans:

**Wave 0**

- [x] 26-01-PLAN.md — Wave 0 fail-closed flag and the seven source pins

**Wave 1** *(blocked on Wave 0 completion)*

- [x] 26-02-PLAN.md — Empty Meta TBC slots on the banner, cookies page, and privacy page

**Cross-cutting constraints:**

- The measurement flag stays false and is not derived from copy, env, or a pill scan.
- No legal sentence is placed in a slot, a dictionary, or a test assertion message.
- CONSENT_POLICY_VERSION stays 2026-09-12.

**UI hint**: no

### Phase 26.0: Main green (INSERTED) (SHIPPED 2026-10-01)

**Goal**: The test and gate set is honest again: a throwaway-stack guard, `/dev` off in production, database
tests through the Worker client, the reduced-transparency pin, a Linux e2e job, and the stale specs from 26.4
to 27 retargeted. No product change except `data-i18n-skip` to `data-vt-no-i18n` and the imprint en+de notice.
**Depends on**: 26.3. Discuss signed by the owner 2026-09-29 (`26.0-CONTEXT.md`, D-01 to D-07).
**State**: Shipped. Main `6ec73c52` (2026-10-01 11:17 +04), live 11:19, Worker `c2127d38`. No migration.
Owner rulings and open items: `26.0-OPEN-ITEMS.md`. Hand-over: `26.0-HANDOVER.md`.
**Left (board lane B, "26.0 finish", B4)**: Linux `confirmation.spec.ts:130`, the mutation-gate patch, the
schema job, the home reds (`home-red-36.txt`) and the 48 SiteHeader picture diffs (the owner decides per
page). Branches `ci/e2e-linux-3`, `fix/e2e-linux-2`. Tests and CI files only, no deploy.

**Plans:** 12/12 (summaries `26.0-01` to `26.0-12`)

### Phase 26.1: Payment and pricing integrity (INSERTED)

**Goal**: Money and security come first. A payment always ends as a confirmed booking,
every refund and dispute reaches the database, and every price is computed server-side
from the owner's formula and the dashboard's own numbers. Absorbs the matching parts of
Phase 22 (webhook wait, paid session always confirms) and Phase 25 (Stripe secret
alignment). Source: `docs/audit/2026-vamos-audit.md` Phase A; decisions D-01…D-25 in
`26.1-CONTEXT.md` (signed 2026-09-27).
**Depends on**: Phase 26. Before 26.2 and 27. Does not start Phases 16/17/19/20 or 21–25. Does not load the pixel.
**Requirements**: INT-01, INT-02, INT-03, INT-04, INT-05, INT-06, INT-07, INT-08, INT-09
**Success Criteria** (what must be TRUE):

  1. A successful Stripe payment always ends as a confirmed booking, including a booking that was cancelled or expired while the customer paid; the customer gets the confirmation. Every cancel or expire path also expires the open Stripe session.
  2. Refunds use the PaymentIntent ID, never `cs_`. `charge.refunded` and `charge.dispute.*` reach the database. A dead-letter consumer with an alert exists, and a stuck `checkout.session.completed` replays safely. The sandbox charge `cs_test_a1lyA5…` has its refund recorded in `booking_refunds`.
  3. Every leg is priced per D-08: start fare + per-km × km + airport fee (airport pickup or flight number) + matching city/canton pair + enabled surcharges; then coupon %, never below CHF 0; then VAT 8.1 % on top. No minimum fare, no bands. Checkout fails closed when the price book cannot load; `pricing_live` is read, never hard-coded; coupon caps are enforced at payment.
  4. All 26 cantons exist as Mapbox boundary zones; every canton → different canton pair (both directions) carries CHF 50 for all three classes. Duplicate and point-of-interest zones are cleaned up. Rate book version 18 stays labelled "placeholder, not owner-approved"; the agent never clicks Publish.
  5. A pay link locks the booking 24 h; the recipient's payment confirms it; unpaid after 24 h it auto-cancels. If the customer pays first, the link shows "already paid". Two simultaneous payers: one is accepted; a second successful charge is refunded automatically.
  6. Refunds: cancelled > 24 h before pickup → automatic full refund; < 24 h → admin approves and sets the percentage; after the trip → admin accepts or rejects.
  7. The classes are Economy, Business, Van luxury (Saden → Economy, V-Class → Business, First dropped). Dashboard delete is a hard delete when nothing references the row, otherwise hidden with a reason; `mahaha` goes.
  8. Only the admin signs in. In account settings the admin can add a passkey, add TOTP, or switch password ↔ magic link, each working end to end; once a factor is enrolled, aal2 is required. Changing password or email requires signing in again. Leaked-password protection is on (owner toggle).
  9. Must-nots: Stripe sandbox `acct_1UIZmqHcNp9GZYjz` only, no `sk_live_`, no `vamostaxi.eu`, no invented CHF or legal copy, no pixel. The agent never writes to live Supabase `yaumjzvylngfjhtuffqs` (migrations are handed to the owner as SQL) and never makes Stripe dashboard changes or `wrangler secret put`. Four languages and the design laws hold on every touched surface.

**Plans**: 32 plans, 18 waves

Plans:

- [x] 26.1-01-PLAN.md — Merge PR #60 baseline; pin sandbox-only Stripe (INT-01)
- [x] 26.1-02-PLAN.md — Settle SQL: revive every cancel (D-03a), requote refund, pi_ write-back, duplicate flag
- [x] 26.1-03-PLAN.md — DLQ consumer and stuck-payment alert
- [x] 26.1-04-PLAN.md — Pricing kernel: owner formula, airport fee, pairs both ways (D-09a)
- [x] 26.1-05-PLAN.md — Consumer revive/auto-refund, expire other sessions; refunds by PaymentIntent
- [x] 26.1-06-PLAN.md — Account, cron and staff cancel expire Stripe sessions; coupon release
- [x] 26.1-07-PLAN.md — Checkout fail-closed, pricing_live read, coupon caps at payment
- [x] 26.1-08-PLAN.md — charge.refunded and disputes reach the DB (both arrival orders)
- [x] 26.1-09-PLAN.md — Mapbox city/canton/airport facts and flight number into the kernel
- [x] 26.1-10-PLAN.md — 26 canton zones, draft pair filler, boundary zones in ops
- [x] 26.1-11-PLAN.md — Checkout rows: airport fee and route pair
- [x] 26.1-12-PLAN.md — Owner SQL handoff: money wave (interim window documented)
- [x] 26.1-13-PLAN.md — Owner: webhook secret, old webhook, event subscriptions
- [x] 26.1-14-PLAN.md — Owner SQL handoff: pricing wave and canton pair fill
- [x] 26.1-15-PLAN.md — Pay link 24 h hold from send; pay-link state
- [x] 26.1-16-PLAN.md — Pay-link recipient states: already paid, refunded, expired
- [x] 26.1-17-PLAN.md — Refund tiers SQL and admin refund API
- [x] 26.1-18-PLAN.md — Ops refund review panel, disputes, customer refund words
- [x] 26.1-19-PLAN.md — Class delete or hide with reason; public filtering; owner names file
- [x] 26.1-20-PLAN.md — aal2 only when a factor is enrolled; admin-only console
- [x] 26.1-21-PLAN.md — Owner SQL handoff: pay-link, refunds, classes
- [x] 26.1-22-PLAN.md — TOTP, step-up, magic-link switch, re-auth (server)
- [x] 26.1-23-PLAN.md — Ops settings and sign-in step-up UI
- [x] 26.1-24-PLAN.md — Owner: aal2 SQL; Pro + leaked-password on (D-17a); passkey setting (D-16c)
- [x] 26.1-25-PLAN.md — Passkey end to end (skipped per D-16c if unavailable)
- [x] 26.1-26-PLAN.md — Owner Ship gate: DLQ queue, re-auth secret, Ship (shipped `cff97a0e`, 2026-09-28)
- [x] 26.1-27-PLAN.md — Class line-up in every ops/home mock; OpsNewTrip sends live slugs
- [x] 26.1-28-PLAN.md — Post-Ship live reconciliation (owner resend + read-only SQL) — SUPERSEDED 2026-09-29: the owner deletes the test bookings (26.3 D-37, his word); dashboard tests moved to the 26.3 UAT
- [x] 26.1-29-PLAN.md — Traveller intent and requote honour the pay-link hold
- [x] 26.1-30-PLAN.md — Flight number typed at checkout re-prices; intent refuses mismatch
- [x] 26.1-31-PLAN.md — Checkout shows DB class name; tests and project rules use the line-up
- [x] 26.1-32-PLAN.md — Coupon cap at payment: lock's coupon re-evaluated, mismatch refused, client recovers (gap 1, INT-04)

**UI hint**: yes — pay-link "already paid" page, ops refund approval, admin account-settings sign-in methods, class names.

### Phase 26.2: Codebase audit, bug fix and simplify (INSERTED)

**Goal**: Folder by folder: review, fix confirmed bugs, then simplify. Booking-path bugs only with the owner's
OK, one question per bug. No visible change and no pay change unless the owner signs it.
**Depends on**: 26.0. Fresh plan 26.2-01 to 26.2-12 signed by the owner 2026-09-29
(`PLANNING-REWRITE-HANDOVER-2026-09-29.md`); decisions in `26.2-CONTEXT.md`. Requirements AUD-01 to AUD-06.
**State, 2026-10-01: open, partly live.** No unit has a close-out; plans with a SUMMARY are finished units.

Live from this phase and its signed follow-up jobs (board "Shipped" table):
- Hand-over 1 (`3142a6e8`, 2026-09-30, Worker `d43e467b`): 17 bug fixes in dashboard, mails and helpers.
- Hand-over 2 (`99df74b3`, 2026-09-30, live in the 16:39 ship, Worker `f3f7d929`): 16 booking-path bugs, each approved by the owner.
- Staff price preview, migration `20261007100000` (live).
- P4 extras part A (`9acfdb51`, Worker `24945bab`, migration `20261007110000`) and part D (`8b9e96a7`, `0edf87d9`, Worker `e2c53324`).
- P1 class change on a paid trip (`8b65e01b`, Worker `60e61d96`, migration `20261007140000`).
- Chauffeurs by class (`b0ee0421`, Worker `8889f3c3`, migration `20261007160000`).

In work or waiting (board "What is left"):
- P6, change place or time of a paid trip: lane A, branch `gsd/26.2-p6-build` `6af6b74c` (saved WIP), migration `20261007150000`; fresh review (money path), then ship.
- After P6, one at a time: P4 extras part B and C (migrations `20261007120000`, `130000`), drop the price-band tables (G8/G9), B5 follow-ups, B3 live-key refusals, airport fee line, JSON double encoding, `data-i18n-skip` leftovers.
- Last: unit 13 gate scripts on `gsd/phase-26.2-u13` (parked).

**Plans:** 3 of 12 finished (03, 09, 10)

- [x] 26.2-01-PLAN.md — Baseline: written 2026-09-30 before 26.0 landed (`26.2-BASELINE.md`); no re-baseline after 26.0 — **closed by the owner 2026-10-01** (not run)
- [x] 26.2-02-PLAN.md — Leaf lib: geo, health, abuse, security reviewed (`REVIEW-02`); flight, fx, content, crypto, forms, db, supabase, account, auth, lifecycle not reviewed — **closed by the owner 2026-10-01** (not run)
- [x] 26.2-03-PLAN.md — Ops lib: reviewed in full; fixes in hand-overs 1 and 2 (`26.2-03-SUMMARY.md`)
- [x] 26.2-04-PLAN.md — Prices (`lib/quote`, `lib/pricing`): not started — **closed by the owner 2026-10-01** (not run)
- [x] 26.2-05-PLAN.md — API routes outside checkout: not started as a unit (staff routes reviewed under 07) — **closed by the owner 2026-10-01** (not run)
- [x] 26.2-06-PLAN.md — Components: not started — **closed by the owner 2026-10-01** (not run)
- [x] 26.2-07-PLAN.md — Next pages outside checkout: dashboard routes reviewed (`REVIEW-07`); public pages, `middleware.ts`, `i18n` not reviewed — **closed by the owner 2026-10-01** (not run)
- [x] 26.2-08-PLAN.md — Live DC surfaces: `app/ops` reviewed (`REVIEW-08`); `app/home`, `app/pages`, `app/vamos-*.js` not reviewed — **closed by the owner 2026-10-01** (not run)
- [x] 26.2-09-PLAN.md — E-mails: reviewed in full (`26.2-09-SUMMARY.md`)
- [x] 26.2-10-PLAN.md — Database, report only: done; findings partly fixed (`26.2-10-SUMMARY.md`)
- [x] 26.2-11-PLAN.md — Booking path: only rows from other units fixed (hand-over 2); its own scope (`lib/checkout`, `api/checkout`, `api/stripe`, `api/quote`, checkout and confirmation pages, `worker.ts`) not reviewed; P6 in work — **closed by the owner 2026-10-01** (not run)
- [x] 26.2-12-PLAN.md — Close-out hand-over: not written (hand-overs 1 and 2 were interim) — **closed by the owner 2026-10-01** (not run)

**UI hint**: no new screens from the audit itself; P1, P4 and P6 carry their own signed pictures.

### Phase 26.3: Booking flow rebuild (INSERTED)

**Goal**: A customer goes from the home box to paid in two screens and the booking is right
everywhere afterwards. Home box asks From (flight number under it for an airport, required),
To, When, Travellers; SEE PRICES opens ONE checkout page (1 class with prices, 2 who is
travelling, 3 payment) with one Pay button that sends the customer to Stripe's hosted page
(card, Apple Pay, Google Pay, TWINT). Stripe returns to `/api/checkout/return` → loading
screen → confirmation "Booked". Design source: sketch 001 Variant A; decisions signed
2026-09-29 in `.planning/phases/26.3-booking-flow-simplification/26.3-CONTEXT.md` (D-01…D-46).
**Depends on**: 26.1 (shipped as cff97a0e + 3 fixes). Starts before 26.2 by owner decision (D-03).
**Requirements**: from 26.3-CONTEXT.md
**Success Criteria** (signed in discuss):

  1. Owner's failed 26.1 UAT step 1 passes on the shipped build: test card 4242 → loading screen → confirmation "Booked" → booking on his profile → on the ops board → confirmation e-mail with the full breakdown equal to the Stripe charge → no leftover card, no pay-link e-mail.
  2. Home box: no trip tabs, airport detected from From, required flight under From only for an airport, one Travellers control, no prices; trip handed to `/checkout` in the URL (no `vamosTrip` storage).
  3. One checkout page: classes with prices (too-small greyed "Seats up to N"), one contact with sign-in link, extras from the live price book listed unticked and charged and saved when ticked, folded company receipt and driver note, "Have a voucher?" link, no pay link, Pay always visible and jumping to the first missing field.
  4. Stripe hosted page with exactly card / Apple Pay / Google Pay / TWINT, site language (en/de/fr/ar), adaptive pricing on; Back returns to a filled checkout and reuses the booking; unpaid bookings without a pay link are deleted after 30 minutes; old `/checkout/trip|details|payment` forward to `/checkout`.
  5. New bookings store the correct pickup instant (Europe/Zurich → UTC); bookings link to the profile when signed in or by the same e-mail; account never shows a local draft; "Add to calendar" removed.
  6. Server price calc, signed lock, settle, refunds, disputes unchanged except generic extras and pickup instant; a fixed coupon stays off before VAT.
  7. Every string in en, de, fr, ar; checked at 1440, 1024, 768, 390 with no sideways scroll; no glow, no tinted yellow, `CHF 000` in design only.
  8. Owner-run copy-then-delete script for the 33 test bookings is delivered; the agent never runs it.

**Plans:** 23 plans in 8 waves, plus gap plans G1 to G9; all 32 have a SUMMARY. Shipped 2026-09-29, main `af93fc8e`. `26.3-UAT.md` was never written; the owner checks are on the control board

Plans:
- [x] 26.3-01-PLAN.md — Root cause: confirmation e-mail read via definer RPC, claim-first never-throw delivery, hourly sweep, local 5532x stack
- [x] 26.3-02-PLAN.md — Root cause: paid return always reaches confirmation, e-mail isolated from settle, signed-in customer_id, no pay-link button in checkout
- [x] 26.3-03-PLAN.md — Pure core (TDD): Zurich→UTC pickup instant, generic extras by exact code, one checkoutCharge, URL trip contract
- [x] 26.3-04-PLAN.md — Home booking box: From/Flight-if-airport/To/When/Travellers, no prices, URL hand-off
- [x] 26.3-05-PLAN.md — Local harness: fake Stripe hosted page, checkout fixtures, runbook
- [x] 26.3-06-PLAN.md — Stripe hosted session layer: methods, TWINT flag, locale, 31 min, presentment currency, one purge-safety rule
- [x] 26.3-07-PLAN.md — DB: unpaid purge + audit line, guest-booking claim, company/note/trip query, session list, per-language extra names
- [x] 26.3-08-PLAN.md — Confirmation e-mail full breakdown, Booked, generic extras; pay-link e-mail extras
- [x] 26.3-09-PLAN.md — Generic receipt rows for the confirmation page; one checkout catalog + extras route
- [x] 26.3-10-PLAN.md — Intent on the hosted page: server charge, details, same booking on Back, supersede by booking id with purge safety
- [x] 26.3-11-PLAN.md — Price, resume (with booking id and trip) and signed-in prefill routes
- [x] 26.3-12-PLAN.md — Purge wiring: expired webhook + hourly sweep, both checking every Stripe session; refund when a paid session has no booking
- [x] 26.3-13-PLAN.md — Ops: extra names auto-translated (Workers AI) and editable; board Awaiting payment filter
- [x] 26.3-14-PLAN.md — Loading screen + confirmation "Booked"; Add to calendar removed
- [x] 26.3-15-PLAN.md — Checkout part 1: trip strip + inline editor, Section 1 classes, old routes forward, all strings
- [x] 26.3-16-PLAN.md — Account: Booked, guest bookings linked, no local draft; sign-in returns to checkout
- [x] 26.3-17-PLAN.md — D-37 copy-then-delete script (owner runs), proven locally
- [x] 26.3-18-PLAN.md — Pay-link page on Stripe's hosted page
- [x] 26.3-19-PLAN.md — Checkout part 2: contact, extras, company/note, voucher, one PAY, Back/expired
- [x] 26.3-20-PLAN.md — Ops half of generic extras (map, detail, draft preview) and Zurich time change
- [x] 26.3-21-PLAN.md — Old client, dead routes and Elements removed; checkout sections spec
- [x] 26.3-22-PLAN.md — Full-funnel e2e, server-integration spec on 5532x, four-laws test, every gate
- [x] 26.3-23-PLAN.md — Ship gate: Stripe owner steps, live migrations + deploy in one control-session step, owner UAT (D-39 first, D-43 last, D-37)

**UI hint**: yes

### Phase 26.4: One form + phone booking sheet (INSERTED)

**Goal**: Owner comments 4–6 after the 26.3 ship. On phone and tablet the home hero shows one bar; a tap opens a full-screen booking sheet in 4 steps (From + flight · To · When · Travellers → SEE PRICES → /checkout). One booking form everywhere: the customer types pickup and destination and the server applies the fare parts automatically (start + per km, airport pickup fee when the pickup is an airport, one city/canton pair, ticked extras) — no calculation change. Service links stay as entry points into the same flow.
**Depends on**: 26.3 (shipped af93fc8e), the account fix (quick 260929-acl), and the New trip Save hotfix (quick 260929-nts) — rebase before execution.
**Requirements**: from 26.4-CONTEXT.md (D-01…D-16)
**Plans:** 10 plans, all with a SUMMARY. Shipped 2026-09-30 00:19, main `0f58ab6d`

Plans:
- [x] 26.4-01-PLAN.md — TDD: owner fare cases on fixture rows; D-08 airport fee from the pickup only; fare_kind no longer read; dead city-price function removed
- [x] 26.4-02-PLAN.md — Dashboard pricing copy (D-16, four languages); dead city-price save path removed
- [x] 26.4-03-PLAN.md — Service links (header, footer, Services, HowItWorks) open /#book; no ?service=; dest-pick without mode
- [x] 26.4-04-PLAN.md — BookingBar Design Component + states gallery
- [x] 26.4-05-PLAN.md — BookingSheet Design Component (4 steps, warnings, history, focus, lock) + states gallery
- [x] 26.4-06-PLAN.md — Home: mode leftovers and service kicker removed; laptop box optional flight (D-09)
- [x] 26.4-07-PLAN.md — Checkout Edit trip/section 2 optional flight (D-09); Stripe name "Vamos Taxi transfer" in four languages
- [x] 26.4-08-PLAN.md — Dashboard New trip: flight rule D-09 (Save body, live extras, re-lock done in quick 260929-nts)
- [x] 26.4-09-PLAN.md — Home ≤1080: bar + sheet wired to one trip state, docking, /#book entries, no resume; e2e at 4 widths × en/de/ar
- [x] 26.4-10-PLAN.md — Full local gate list on a 583xx stack, laws test, VALIDATION, HANDOVER + owner UAT (phone first)

**UI hint**: yes

### Phase 26.4.1: Laptop booking bar (INSERTED)

**Goal**: At ≥1081 px the home hero shows the owner's picture 3: the pre-26.3 wide bar at the bottom of the hero without trip-type tabs, in the signed order From · flight · To · When · Travellers · SEE PRICES, trust line under it. One row from 1272 px, two rows 1081–1271 px. Phone and tablet keep the 26.4 bar + sheet.
**Depends on**: 26.4 (branch cut from gsd/phase-26.4-one-form c069737e; ships right after it)
**Requirements**: from 26.4.1-CONTEXT.md (D-01…D-04)
**Plans:** 2 plans, both with a SUMMARY. Shipped with 26.4, main `0f58ab6d`

Plans:
- [x] 26.4.1-01-PLAN.md — Re-layout the home box at ≥1081 (one row ≥1272, two rows 1081–1271, compact travellers, trust line) + unit pins + Playwright at 1440/1280/1181/1081 × en/de/fr/ar and ≤1080 regression
- [x] 26.4.1-02-PLAN.md — Local gate list, VALIDATION, HANDOVER in the 26.4 shape + owner UAT at 1440 and 1181

**UI hint**: yes

### Phase 26.4.2: Owner booking feedback (INSERTED) (SHIPPED 2026-09-30)

**State**: Shipped. Main `37ba5b62` (2026-09-30 12:19 +04), Worker `59c18372`: one-page phone booking, flight
before From, class cards with photos, flight-edit fix. Repairs `ec1beed5` and `3d74d6a0` (page scroll lock),
then class cards layout E (`f7a3528b`) and the laptop home without the class section (`f37cc0b4`). No phase
folder; the record is the control board "Shipped" table.

### Phase 26.5: Checkout guest, sign in or create account (INSERTED) (SHIPPED 2026-09-30)

**Goal**: Before Stripe's page, `/checkout` asks who the customer is: continue as a guest, sign in, or create
an account. A guest gets an account from the e-mail and signs in later with a link.
**Depends on**: 26.4 and 26.4.1. Discuss, UI-SPEC and plan signed by the owner 2026-09-30 (`26.5-CONTEXT.md`).
**State**: Shipped. Main `9a5263cd` (2026-09-30 14:55 +04), live 14:57, Worker `2d5906ce`. Migrations
`20261001100000` (agreement record), `110000` (unpaid hidden), `120000` (paid-only reminder), `130000`
(pay-press cap), applied and read back. `guest_accounts_live` true since 2026-10-01 14:58 (owner's answer).
Rollback tag `backup/main-before-26.5-e09f90cb`.
**Left (owner)**: the 11 UAT steps in `HANDOVER.md`; a 4242 payment as a guest and with "Create an account"
(no account agreement record existed when last read).

**Plans:** 11/11, all with a SUMMARY

### Phase 27: Consent record

**Goal**: Accept logs Meta on. Dismiss logs Meta off. The latest `consent_log` row
wins. The existing Accept/Dismiss banner shows on customer pages until a choice,
including a pay link. Ops has no banner. A later Dismiss stops future events.
**Depends on**: Phase 26
**Requirements**: META-03, META-04, META-05
**Success Criteria** (what must be TRUE):

  1. Accept writes a `consent_log` row with Meta on. Dismiss writes Meta off. The latest row wins. No new switches.
  2. The existing Accept/Dismiss banner shows on every customer page until they choose, including a pay link. Ops has no banner. No new layout.
  3. A later Dismiss stops future PageView and future Purchase. Accepting after payment does not backfill a Purchase.
  4. The pixel still never loads on a pay link.
  5. Must-nots: no `sk_live_`, no `vamostaxi.eu`, no invented legal copy, no invented CHF, no hashed email or phone, no browser Purchase, no middle events (quote seen, checkout started, pay step). Do not change quote, pay, or confirmation.

**State**: Shipped 2026-10-01 03:02 (+04). Main `ce55cd75`, Worker `c45d2782`. Migrations `20261002100000` and
`110000` applied and read back before the deploy. Cookie choice saved on the server, banner on every customer
page, sign-up tick box. The Meta gate stays closed (pixel off). Rollback tag `backup/main-before-27-a8948162`.
**Left (owner)**: banner in a private window; one sign-up with the tick.

**Plans**: 18/18, all with a SUMMARY
**UI hint**: yes — existing Accept/Dismiss banner shows on customer pages until a choice, including a pay link. No new switches. No new layout. Ops has no banner. Pixel still never loads on a pay link.

### Phase 27.1: Finish your account (INSERTED) (SHIPPED 2026-10-01)

**Goal**: A sign-in-link account finishes (first and last name, optional mobile, the 26.5 account tick) before
it can pay or open a booking; nobody ticks twice. Carries 27 D-37 and the sign-up mail checks of plan 05-24.
**Depends on**: 27 and 26.5. Discuss answers, design sheet and plan signed by the owner 2026-10-01
(`27.1-CONTEXT.md`, `screens/design-sheet.png`).
**State**: Shipped. Main `96a17ab7` (2026-10-01 17:43 +04), live 17:44, Worker `6eb1d700`. Migration
`20261007170000` applied first and read back. Rollback tag `backup/main-before-27.1-cbbd4d13`, Worker `8f6720d6`.
**Left (owner)**: UAT steps 0 to 9 in `27.1-HANDOVER.md`. Follow-ups (board, B5): the mobile number does not
reach the dashboard customer list; /checkout and /booking-detail are not gated.

**Plans:** 1/1 (`27.1-01-SUMMARY.md`)

### Phase 28: Pixel PageView

**Goal**: After Accept and the legal flag, pixel `1595596972063765` sends PageView
only on public pages with no token, plus signed-in account and bookings. Click ids
are saved on the unpaid booking. No new screen.
**Depends on**: Phase 27
**Requirements**: META-06, META-07, META-08, META-09
**Success Criteria** (what must be TRUE):

  1. After Accept and META-01, pixel `1595596972063765` sends PageView only on public pages with no token, plus signed-in account and bookings.
  2. Ops, a pay link, manage-booking, and any URL with a booking reference never contain the script. A person who dismissed does not get a cached page that contains it.
  3. No advanced matching and no noscript image. The pixel does not load until the owner confirms in Events Manager that automatic matching and automatic button clicks are off.
  4. `_fbp` and `_fbc` are saved on the unpaid booking after the pixel sets them. Not in Stripe. A paid booking cannot be updated to backfill them.
  5. Must-nots: no `sk_live_`, no `vamostaxi.eu`, no invented legal copy, no invented CHF, no hashed email or phone, no browser Purchase, no middle events (quote seen, checkout started, pay step). PageView only. Flag stays off until the owner lines are in. Do not change quote, pay, or confirmation.

**State, 2026-10-01: waiting for the owner's Meta check.** Nothing built. Discuss signed, research committed
(`99b2285d`, branch `gsd/phase-28-pixel-pageview`; the phase folder is on that branch, not on main). Migration
`20261003100000` reserved, not written. The owner said both switches are off, but Meta's own setup file for the
pixel, read 2026-10-01 09:15 UTC, still listed automatic matching and inferred events as on. The owner checks
that the change was saved on pixel `1595596972063765`; then the Meta job builds
(`.planning/decisions/2026-10-01-meta-events-manager-switches.md`). Meta legal lines: the three texts in
`.planning/decisions/2026-09-30-meta-wording.md`, verbatim.

**State, 2026-10-03: plans written, waiting for the owner's signature.** The owner turned both Meta
switches off; Meta's setup file no longer opts in to automatic matching (re-read 12:03:53 UTC), it still
serves inferred events, which the code switches off and plan 28-07 proves with Meta's real script.
Migration number comes from the controller.

**Plans**: 7 plans

Plans:
- [ ] 28-01-PLAN.md — database: two Meta id columns, pending-only writer and trigger (migration number from controller)
- [ ] 28-02-PLAN.md — the browser loader app/vamos-meta.js and its server twin allow-list (flags off)
- [ ] 28-03-PLAN.md — mount through the cookie banner, switch flag, Meta-string scan rewrite
- [ ] 28-04-PLAN.md — path-scoped Meta security policy, Referrer-Policy strict-origin
- [ ] 28-05-PLAN.md — save _fbp/_fbc on the unpaid booking at Pay (consent, public site only)
- [ ] 28-06-PLAN.md — browser proof at the public addresses, Meta hosts intercepted
- [ ] 28-07-PLAN.md — real-script proof, open the flags, full gate, hand-over

**UI hint**: no new screen. Pixel `1595596972063765`. PageView only.

### Phase 29: Webhook Purchase

**Goal**: One Purchase from the settle queue after a real CHF charge, in the francs
Stripe charged, with saved `_fbp` and `_fbc` only. Quote, pay, and confirmation
do not change.
**Depends on**: Phase 28
**Requirements**: META-10, META-11, META-12, META-13, META-14
**Success Criteria** (what must be TRUE):

  1. One Purchase leaves the settle queue after a real CHF charge. Value is the francs charged. `CHF 000` sends nothing.
  2. The payload is `_fbp` and `_fbc` only, and only if they were saved. If neither was saved, send nothing. No email, phone, name, route, flight, booking reference, IP, or user-agent.
  3. The URL sent to Meta is `https://vamostaxi.site` with no path. The event id is ours, one per booking, reused if the queue retries. It is not the booking reference.
  4. A Meta failure does not unpay the booking and does not change the webhook response. A retry does not send a second Purchase. Staging uses a test event code. The token is a wrangler secret. If Graph rejects this payload, stop and ask. Do not widen it.
  5. Must-nots: no `sk_live_`, no `vamostaxi.eu`, no invented legal copy, no invented CHF, no hashed email or phone, no browser Purchase, no middle events (quote seen, checkout started, pay step). Do not change quote, pay, or confirmation. Do not call Graph from the thank-you page or as a second Purchase.

**State, 2026-10-01: waiting.** Starts after 28. No Purchase event until the legal gate is open (owner rule).
Migration `20261007260000` reserved by the controller (2026-10-03 20:05); the earlier `20261004100000`-`190000` block is withdrawn.

**Plans**: 6 plans
Plans:
- [ ] 29-01-PLAN.md — merge origin/main; migration 20261007260000 (claim, once-only table, consent subject) + pgTAP + types
- [ ] 29-02-PLAN.md — capi.ts: locked Purchase payload and one POST; needle scan allow map; Meta bindings typed
- [ ] 29-03-PLAN.md — Pay press saves the consent subject with the Meta ids (D-01)
- [ ] 29-04-PLAN.md — purchase.ts orchestrator (gate, token, Stripe mode, claim, one POST, finish) + Worker-client DB proof
- [ ] 29-05-PLAN.md — settle queue hook after the money steps; queue opts in; return route pinned out
- [ ] 29-06-PLAN.md — owner's test event code, full gates, HANDOVER for the controller
**UI hint**: no. One Purchase from the settle queue. Do not change quote, pay, or confirmation.

## Progress

**Execution Order:**
v1.0: 1 → 2 → 3 → 4/5/6 (parallel) → 7 → 8 → 9 → 10 → 11 → 18 → 19
v1.1 (funnel Phases 7–11 frozen): 12 → 13 → 14 → 15 → 16 → 17
Close-out one-by-one: 17 deploy → 17 SQL apply → 17 UAT → 16 ROADMAP tick → discuss 19 surge → 11-12 owner Publish (never agent)
v1.2 Payment (leftovers 16/17/19/20 frozen): 21 → 22 → 23 → 24 → 25
v1.3 Meta measurement (Phases 21–25 stay planned, not current): 26 → 26.1 → 27 → 28 → 29
Order of 2026-09-30 (owner): 26.4.2 → 26.5 → 27 → 28 → 29 → 26.0 → 26.2 → 20 → 19. Source: .planning/decisions/2026-09-30-priorities-and-ship-mode.md
Where it stands, 2026-10-01 (bookkeeping B10, from .planning/CONTROL-BOARD.md "What is left"): shipped 26.1, 26.3, 26.4, 26.4.1, 26.4.2, 26.5, 26.0, 27, 27.1. Open now, in parallel lanes: 26.2 P6 (A), 26.0 finish B4 (B), this bookkeeping (D), Van luxury up to 12 travellers (V, no phase); the 20 leftovers (R) reached main at 23:49 (3e2bba66), 20-09 live proof left. Then, one at a time after P6, the rest of 26.2. B7 content and legal reached main at 23:55 (ea1141e7) after the owner switched Cloudflare's automatic Web Analytics off; next in that line G23, then the Arabic and design-canvas fixes. Waiting for the owner: 28 then 29 (Meta check). 19 deferred, status question open. The control board is the live source; this line is a snapshot.
Plan-level states (owner, 2026-09-29; source record .planning/PHASE-CLOSURE-2026-09-29.md on main, commit 37e55d26), updated 2026-10-01: plan 04.3 replaced by 26.1/26.3, never build · plan 05-19 dropped · plan 05-24 folded into 27.1 and /contact, owner checks left · plan 05-28 shipped 2026-10-01 as B8 · plan 11-12 owner-held, never raise · plan 26.1-28 superseded

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Platform Foundation, Design System Port & i18n Runtime | 14/14 | Complete | 2026-08-22 |
| 2. Data Schema, RLS & Staff Auth Foundations | 10/10 | Complete | 2026-08-27 |
| 3. Hyperdrive Data Access Wiring | 7/7 | Complete | 2026-08-28 |
| 4. Quote & Pricing Engine | 16/16 | Complete    | 2026-09-06 |
| 5. Public Surfaces & Customer Accounts | 34/34 (05-19 dropped, 05-24 folded, 05-28 shipped as B8) | Complete | 2026-09-06 |
| 5.1. CSS and CI clean-up (INSERTED) | 1 summary, no plan file | Complete | 2026-09-02 |
| 5.2. One-way only (INSERTED) | 1/1 | Complete | 2026-09-03 |
| 6. Ops Reference Data & Content Console | 13/13 | Complete   | 2026-09-01 |
| 6.1. Dashboard instant sidebar navigation (INSERTED) | 1/1 | Executed | 2026-09-04 |
| 7. Checkout & Payment | 16/16 | Complete    | 2026-09-11 |
| 8. Ops Dispatch — Live Board, Assignment & Account Surfaces | 10/10 | Complete    | 2026-09-11 |
| 9. Booking Lifecycle & Customer Self-Service | 12/12 | Complete    | 2026-09-12 |
| 10. Hardening — Performance, Security & Compliance | 10/10 | Complete    | 2026-09-12 |
| 11. Launch Cutover | 11/12 by agents; 11-12 is the owner's Publish (summary records it as owner-held) | Complete for agents | 2026-09-13 |
| 12. Ticket schema + #support mock | 3/3 | Complete    | 2026-09-11 |
| 13. Staff APIs + outbound Resend replies | 10/10 | Complete    | 2026-09-18 |
| 14. Inbound webhook | 7/7 | Complete    | 2026-09-18 |
| 15. Wire Ops #support to APIs | 3/3 | Complete    | 2026-09-18 |
| 16. Staging MX + end-to-end UAT | UAT 10/10 passed | Complete | - |
| 17. Ops chauffeur profile, shift roster, two-driver vehicles | - | Closed, feature removed | - |
| 18. OPS Pricing source of truth | 7/7 | Complete    | 2026-09-15 |
| 19. 10,000-booking surge proof | 0/5 | Closed by the owner (2026-09-30, confirmed 2026-10-01). No surge test | - |
| 20. Security check of the changed app | 11/11 (20-04, 20-05 superseded) | Complete. A, B1, 20-12, 20-10, C1, C2, the e-mail change fix, the leftovers G7/G10/G11/G12/G28 and G23 live; 20-09 live proof and the owner's 4242 payment passed | 2026-10-02 |
| 21. Charge gate + visible refusal + payable intent | - | Replaced by 26.1/26.3, never build | - |
| 22. Card confirm + thank-you webhook wait | 0/TBD | Replaced by 26.1/26.3, never build | - |
| 23. Wallets + Dashboard methods | 0/TBD | Replaced by 26.1/26.3, never build | - |
| 24. Dual-payer, pay-link, mail split | 0/TBD | Replaced by 26.1/26.3, never build | - |
| 25. /bookings unpaid + TEST UAT + secret-swap design | 0/TBD | Replaced by 26.1/26.3, never build | - |
| 26. Legal gate | 2/2 | Complete    | 2026-09-23 |
| 26.0. Main green (INSERTED) | 12/12 | Shipped 6ec73c52, Worker c2127d38; the remaining reds are lane B (B4) | 2026-10-01 |
| 26.1. Payment and pricing integrity (INSERTED) | 32/32 (26.1-28 superseded) | Shipped cff97a0e; 26.1-28 moot (owner deletes test bookings) | 2026-09-28 |
| 26.2. Codebase audit, bug fix and simplify (INSERTED) | 3/12 units finished (03, 09, 10) | Open. Live: hand-overs 1 and 2, staff price preview, extras A and D, P1 class change, chauffeurs by class. Left: P6 (lane A), extras B and C, price-band drop, B3, units 01, 02, 04 to 08, 11 not finished, close-out 12, gate scripts (last) | - |
| 26.3. Booking flow rebuild (INSERTED) | 23/23 + G1–G9 | Shipped af93fc8e, Worker 839d73fc; D-37 test-booking delete is the owner's word | 2026-09-29 |
| 26.4. One form + phone booking sheet (INSERTED) | 10/10 | Shipped 0f58ab6d, Worker 2b04648a | 2026-09-30 |
| 26.4.1. Laptop booking bar (INSERTED) | 2/2 | Shipped 0f58ab6d, Worker 2b04648a | 2026-09-30 |
| 26.4.2. Owner booking feedback (INSERTED) | done | Shipped 37ba5b62 plus repairs; class cards layout E, phone home, home without class section | 2026-09-30 |
| 26.5. Checkout guest / sign in / create account (INSERTED) | 11/11 | Shipped 9a5263cd, Worker 2d5906ce; guest accounts on | 2026-09-30 |
| 27. Consent record | 18/18 | Shipped ce55cd75, Worker c45d2782; Meta gate still closed | 2026-10-01 |
| 27.1. Finish your account (INSERTED) | 1/1 | Shipped 96a17ab7, Worker 6eb1d700 | 2026-10-01 |
| 28. Pixel PageView | 0/TBD | Waiting for the owner's Meta check (Meta's setup file still showed both switches on at 2026-10-01 09:15 UTC). Discuss signed, research on gsd/phase-28-pixel-pageview, nothing built | - |
| 29. Webhook Purchase | 0/TBD | Waiting, after 28 | - |

---
*Roadmap created: 2026-08-17*
*Granularity: fine (11 phases v1 + 6 phases v1.1 + 5 phases v1.2 + 4 phases v1.3)*
*Coverage: 80/80 v1 + 9/9 v1.1 + 4/4 chauffeur desk (OPS-11–14) + 11/11 v1.2 (PAY-08…PAY-18) + 14/14 v1.3 (META-01…META-14)*
*v1.1 Ops Support added: 2026-09-04*
*Phase 17 chauffeur desk added: 2026-09-11*
*v1.2 Payment added: 2026-09-22 (phases 21–25; leftovers 16/17/19/20 unchanged)*
*v1.3 Meta measurement added: 2026-09-23 (phases 26–29; v1.2 phases 21–25 unchanged)*
*Phase 26.1 inserted: 2026-09-27 (payment and pricing integrity; INT-01…INT-09; discuss signed the same day)*
*GSD bookkeeping B10: 2026-10-01 (missing summaries, closed and replaced phases marked, rows for 5.1, 5.2, 6.1, 26.0, 26.2, 26.4.2, 26.5, 27.1)*
