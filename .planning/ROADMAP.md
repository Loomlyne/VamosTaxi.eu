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

## Phases

**Phase Numbering:**

- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Platform Foundation, Design System Port & i18n Runtime** - Worker deploys to a real staging domain with the ported design system and an SSR-safe i18n runtime
- [x] **Phase 2: Data Schema, RLS & Staff Auth Foundations** - Postgres mirrors the VamosOps contract with RLS everywhere and invited, MFA-gated staff auth
- [x] **Phase 3: Hyperdrive Data Access Wiring** - The Worker reaches Postgres through Hyperdrive, fast and safely isolated per request
- [ ] **Phase 4: Quote & Pricing Engine** - The booking widget returns a real, locked, server-priced quote for any eligible route
- [ ] **Phase 5: Public Surfaces & Customer Accounts** - Every public mock is a live route on real data, and customers can create and access accounts
- [ ] **Phase 6: Ops Reference Data & Content Console** - Staff manage the reference data and content that power the public site
- [ ] **Phase 7: Checkout & Payment** - A customer pays for a locked quote and receives a webhook-confirmed booking
- [ ] **Phase 8: Ops Dispatch — Live Board, Assignment & Account Surfaces** - Staff run the live board, assign real bookings, and customers see their own history
- [ ] **Phase 9: Booking Lifecycle & Customer Self-Service** - A booking lives its full lifecycle — reminders, delay handling, cancellation, review
- [ ] **Phase 10: Hardening — Performance, Security & Compliance** - The site survives a launch surge and never captures data ahead of consent
- [ ] **Phase 11: Launch Cutover** - Vamos Taxi goes live on its real domain with real pricing

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

- [ ] 04-11-PLAN.md — The two public endpoints the whole phase has been building toward, and the ordered list of

**Wave 7** *(blocked on Wave 6 completion)*

- [ ] 04-13-PLAN.md — The layer that decides how much a stranger is allowed to cost us, and the one place a signature
- [ ] 04-16-PLAN.md — Settle the Phase 4 / Phase 5 seam, and prove the engine's answers can be rendered before anyone

**Wave 8** *(blocked on Wave 7 completion)*

- [ ] 04-14-PLAN.md — The rules Phase 7's handler must obey, and the ledger that keeps this phase's open questions
**UI hint**: yes

### Phase 5: Public Surfaces & Customer Accounts

**Goal**: Every public mock that doesn't depend on live booking state is a live route on
real data, pixel-faithful at all four widths in all four languages, and a customer can
create, access and sign out of an account.
**Depends on**: Phase 3 (the home page's booking widget also requires Phase 4 for live pricing, but the rest of this phase does not)
**Parallel with**: Phase 4, Phase 6
**Requirements**: SITE-01, SITE-02, SITE-04, SITE-05, SITE-06, SITE-07, SITE-09, AUTH-01, AUTH-02, AUTH-03, AUTH-04, I18N-08
**Success Criteria** (what must be TRUE):

  1. The home page renders with the booking widget prominent and its sections (reviews, FAQ) read from the database; every public page carries the shared header and footer, never a hand-rolled one.
  2. About, FAQ, contact and become-a-driver pages render, their forms are challenge-protected and reach both the inbox and the database, and a customer can reach support by phone, WhatsApp and the contact form.
  3. Terms, privacy, cookies, cancellation and imprint render with real numbers where the owner supplied them and labelled TBC pills where not, and a legal page that exists in fewer than four languages says so rather than pretending to be translated.
  4. Every page holds its layout at 1440, 1024, 768 and 390 px with nothing scrolling sideways, and public pages are server-rendered with correct language alternates for search engines.
  5. A customer can create an account with email/password or an emailed one-time code, reset a forgotten password from an emailed link, stay signed in across a browser refresh, and sign out from any page.

**Plans**: TBD
**UI hint**: yes

### Phase 6: Ops Reference Data & Content Console

**Goal**: Staff run the operational reference data and site content that power the public
site, from a role-gated ops console — the non-money-touching half of the ops build that
does not need to wait for checkout.
**Depends on**: Phase 3
**Parallel with**: Phase 4, Phase 5
**Requirements**: OPS-06, OPS-07, OPS-08, OPS-09, OPS-10, I18N-07
**Success Criteria** (what must be TRUE):

  1. The ops console is reachable only by staff, in its own role-gated route group of the same application.
  2. Staff can manage vehicle classes, vehicles, chauffeurs, fixed routes, distance rates, surcharges and coupons.
  3. Staff can see customers and their booking history, and can publish, hide and reorder the reviews shown on the home page.
  4. Staff can edit business settings and the content strings behind the site copy, and every string it manages is stored in the database rather than the static dictionary file — the ~600-string legal-page dictionary migrates here as professional translations arrive, tracked as ongoing work within this phase rather than a separate late i18n phase.

**Plans**: TBD
**UI hint**: yes

### Phase 7: Checkout & Payment

**Goal**: A customer can pay for a locked quote and receive a webhook-confirmed booking —
the convergence point every subsequent money-touching surface (ops board, ops assignment,
account bookings, lifecycle features) is downstream of. This is not a parallel track; it
gates Phases 8 and 9.
**Depends on**: Phase 4
**Requirements**: PAY-01, PAY-02, PAY-03, PAY-04, PAY-05, PAY-06, PAY-07
**Success Criteria** (what must be TRUE):

  1. A customer reaches checkout carrying their locked quote, enters passenger and contact details, and can complete the booking as a guest without creating an account.
  2. A customer pays by card, Apple Pay, Google Pay or TWINT, charged in CHF, and the booking is confirmed only by the verified payment webhook, never by the browser's return from the payment page.
  3. A repeated or out-of-order webhook delivery cannot double-charge, double-confirm or double-send the confirmation email.
  4. A paid customer receives a confirmation email in their language with the booking voucher, a manage link and a calendar invite, and sees a confirmation page showing the reference, route, time, vehicle and amount paid.

**Plans**: TBD
**UI hint**: yes

### Phase 8: Ops Dispatch — Live Board, Assignment & Account Surfaces

**Goal**: Staff run the day from a live board and dispatch real, paid bookings, and a
signed-in or newly-claiming customer can see their own booking history. Gated on Phase 7
because every screen here reads live payment/booking state.
**Depends on**: Phase 5, Phase 6, Phase 7
**Requirements**: OPS-01, OPS-02, OPS-03, OPS-04, OPS-05, SITE-03, AUTH-06, DATA-08
**Success Criteria** (what must be TRUE):

  1. Staff see a live board of bookings that updates when a booking is paid, without a page refresh.
  2. Staff open a booking and see its full detail and an append-only event timeline covering every booking, price, payment and assignment change.
  3. A dispatcher assigns a chauffeur and a vehicle, and the same driver cannot be double-booked for overlapping trips — enforced at the database level, not just the UI.
  4. A dispatcher can take a booking by phone, price it through the same pricing engine as the public quote, and enter it into the system; staff can confirm, modify and cancel a booking and issue a refund.
  5. A customer can see their profile, booking history and any single booking in detail, and a guest who booked without an account can claim that booking into a new account from the emailed link.

**Plans**: TBD
**UI hint**: yes

### Phase 9: Booking Lifecycle & Customer Self-Service

**Goal**: A booking lives its full lifecycle — reminders, flight-delay handling,
self-serve cancellation, and a post-ride review request — without staff intervention for
the common cases.
**Depends on**: Phase 7, Phase 8
**Requirements**: LIFE-01, LIFE-02, LIFE-03, LIFE-04, LIFE-05, LIFE-06, LIFE-07, LIFE-08
**Success Criteria** (what must be TRUE):

  1. A booking moves through quote, pending, paid, confirmed, assigned, completed, cancelled, refunded and no-show, and every move is recorded.
  2. A customer can cancel and be refunded automatically against the cancellation-tier policy that applied when they booked, not whatever the policy says today.
  3. A customer can open and manage their booking either signed in or from the tokened email link, is reminded before pickup, and receives the driver's name, vehicle and plate once assigned.
  4. A delayed flight shifts the pickup time and notifies both the customer and ops; stale quotes expire and no-shows are swept automatically on a schedule.
  5. A customer is asked for a review after their ride completes.

**Plans**: TBD
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

**Plans**: TBD

### Phase 11: Launch Cutover

**Goal**: Vamos Taxi goes live on its real domain with real pricing — the final, largely
irreversible gate.
**Depends on**: Phase 10
**Requirements**: LAUNCH-05, LAUNCH-06
**Success Criteria** (what must be TRUE):

  1. `vamostaxi.eu` points at the Worker, every old Freshpage CMS URL redirects to its new home, and the sitemap is submitted.
  2. `pricing_live` is flipped to true only after the real CHF matrix is loaded and owner-approved on staging.

**Plans**: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4/5/6 (parallel) → 7 → 8 → 9 → 10 → 11

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Platform Foundation, Design System Port & i18n Runtime | 14/14 | Complete | 2026-08-22 |
| 2. Data Schema, RLS & Staff Auth Foundations | 10/10 | Complete | 2026-08-27 |
| 3. Hyperdrive Data Access Wiring | 7/7 | Complete | 2026-08-28 |
| 4. Quote & Pricing Engine | 12/16 | In Progress|  |
| 5. Public Surfaces & Customer Accounts | 19/24 | In Progress|  |
| 6. Ops Reference Data & Content Console | 15/17 | In Progress|  |
| 7. Checkout & Payment | 0/TBD | Not started | - |
| 8. Ops Dispatch — Live Board, Assignment & Account Surfaces | 0/TBD | Not started | - |
| 9. Booking Lifecycle & Customer Self-Service | 0/TBD | Not started | - |
| 10. Hardening — Performance, Security & Compliance | 0/TBD | Not started | - |
| 11. Launch Cutover | 0/TBD | Not started | - |

---
*Roadmap created: 2026-08-17*
*Granularity: fine (11 phases)*
*Coverage: 80/80 v1 requirements mapped*
