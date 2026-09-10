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

## Phases

**Phase Numbering:**

- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Platform Foundation, Design System Port & i18n Runtime** - Worker deploys to a real staging domain with the ported design system and an SSR-safe i18n runtime
- [x] **Phase 2: Data Schema, RLS & Staff Auth Foundations** - Postgres mirrors the VamosOps contract with RLS everywhere and invited, MFA-gated staff auth
- [x] **Phase 3: Hyperdrive Data Access Wiring** - The Worker reaches Postgres through Hyperdrive, fast and safely isolated per request
- [x] **Phase 4: Quote & Pricing Engine** - The booking widget returns a real, locked, server-priced quote for any eligible route (completed 2026-09-06)
- [x] **Phase 4.3: Blended distance bands + OPS rate book (INSERTED)** - Sheet-2 km bands, class floors, region %; OPS Pricing is the editor; live only after Publish (completed 2026-09-06)
- [x] **Phase 5: Public Surfaces & Customer Accounts** - Every public mock is a live route on real data, and customers can create and access accounts (completed 2026-09-06)
- [x] **Phase 6: Ops Reference Data & Content Console** - Staff manage the reference data and content that power the public site (replanned 2026-09-01 — DC mock is the product) (completed 2026-09-01)
- [ ] **Phase 7: Checkout & Payment** - A customer pays for a locked quote and receives a webhook-confirmed booking
- [ ] **Phase 8: Ops Dispatch — Live Board, Assignment & Account Surfaces** - Staff run the live board, assign real bookings, and customers see their own history
- [ ] **Phase 9: Booking Lifecycle & Customer Self-Service** - A booking lives its full lifecycle — reminders, delay handling, cancellation, review
- [ ] **Phase 10: Hardening — Performance, Security & Compliance** - The site survives a launch surge and never captures data ahead of consent
- [ ] **Phase 11: Launch Cutover** - Vamos Taxi goes live on its real domain with real pricing
- [ ] **Phase 12: Ticket schema + #support mock** - Contact rows become tickets (New/Open/Replied/Responded/Closed); OpsSupportTicket + sidebar `#support`; Staff tab stays gone
- [ ] **Phase 13: Staff APIs + outbound Resend replies** - Dispatcher sends a reply from the ticket; customer Gmail threads; info@ BCC; RFC Message-ID persisted
- [ ] **Phase 14: Inbound webhook** - Signed Resend webhook appends matched replies; unmatched mail does not create a ticket
- [ ] **Phase 15: Wire Ops #support to APIs** - Live `#support` list, thread, booking_ref+locale, status filters; EN/DE/FR/AR; escaped text
- [ ] **Phase 16: Staging MX + end-to-end UAT** - Customer Reply-in-Gmail appends to the same ticket; MX only on replies.vamostaxi.site

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

### Phase 4.3: Blended distance bands + OPS rate book (INSERTED)

**Goal**: The owner Switzerland matrix (blended km bands, three class floors, region %) is editable on OPS Pricing & Routes and becomes the live quote only after Publish. Stripe charges the quote snapshot. No invented fare. No live row from a migration.
**Depends on**: Phase 4 kernel + Phase 6 OpsPricing
**Closed**: 2026-09-06 owner close of Phases 1–6. Kernel on `phase-7`. OPS editor + draft seed follow Phase 7 live charge. Do not `state.begin-phase` back onto 4.3.
**Success Criteria** (what must be TRUE):

  1. Economy 15/40/70/120 km with no region % quotes 80 / 156 / 262 / 428 (rappen-equivalent) from the kernel.
  2. A matching pickup or dropoff zone adds the one highest region %. Night/extra-stop/child-seat are not charged until the owner adds them in OPS.
  3. Staff edit floors, bands, and region % on OpsPricing; Save writes draft; Publish is still `draft → live`.
  4. No `rate_versions` row is inserted `live` by a migration. Public UI stays `CHF 000` until the owner publishes.

**Plans**: 1 plan

- [x] 04.3-01-PLAN.md — schema + kernel + OPS editor + draft-only seed

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

**Plans**: 05-01…26 executed. 05-19 not executed (partner out). 05-24 skipped (facts in 05-32). 05-27 executed, staging UAT open. 05-28 gated on that UAT.

**Wave 12** *(executed 2026-09-04)*
- [x] 05-29-PLAN.md — Public GET `/api/reviews` + hide `#reviews` when empty
- [x] 05-30-PLAN.md — Delete home `FLIGHTS` fixtures
- [x] 05-31-PLAN.md — Drop `partner_applications` + leftover copy
- [x] 05-32-PLAN.md — Update `05-OWNER-CHECKS.md` (no dashboard re-clicks)

**Wave 13** *(executed 2026-09-04)*
- [x] 05-33-PLAN.md — Staging per-URL connection table (no quote POST, no contact submit). Table: `05-CONNECTION-TABLE.md`. Worker `vamos` `093a4976`.

**UI hint**: yes

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

**Plans**: 07-01…07-10 paper SUMMARYs (not closed). Remainder 07-11…07-15 pending owner plan review.

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
detail route, reminders, delay handling, self-serve cancel/refund, review request — with
no mock lookup and no 404 shells. Policy numbers the owner has not supplied stay TBC;
do not invent cancel windows.
**Depends on**: Phase 7, Phase 8
**Requirements**: LIFE-01, LIFE-02, LIFE-03, LIFE-04, LIFE-05, LIFE-06, LIFE-07, LIFE-08
**Success Criteria** (what must be TRUE):

  1. Status moves quote → pending → paid → confirmed → assigned → completed / cancelled / refunded / no-show. Every move writes `booking_events`. No client-only status.
  2. Self-serve cancel/refund uses the snapshot’s cancellation tier (TBC pills until the owner numbers land — the path must still hit the API and refuse honestly, not pretend a window).
  3. `/manage-booking` looks up by the hashed guest token (`booking_access_tokens`), not a mock reference field. Signed-in customers use `/bookings` + detail. `/booking-detail` is a live 200 route (today 404 is a fail). Assigned chauffeur name, vehicle, plate come from fleet rows once Phase 8 assigned them — empty until then, never fake names.
  4. Pre-pickup reminder email/queue is a real `booking_notifications` row. Stale quotes expire server-side. No-show sweep is scheduled on the Worker. Flight delay: AeroDataBox when the owner binds it; until then the same honest `provider_unavailable` → enter time as Phase 5 — no fixture LX1234.
  5. After completed, the customer gets a review request; submitted review lands in `public.reviews` and can be published from ops (Phase 6 APIs). Home then shows it (Phase 5 reviews-from-DB).
  6. **Close bar — staging connection table**: `/manage-booking` `/booking-detail` `/bookings` `/confirmation` fingerprint token/booking APIs. A manage-token miss is an error state, not a demo booking. `/booking-detail` 404 is a fail.

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

**Plans**: TBD

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

**Plans**: TBD

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

**Plans**: TBD
**UI hint**: yes

### Phase 16: Staging MX + end-to-end UAT

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

**Plans**: TBD

## Progress

**Execution Order:**
v1.0: 1 → 2 → 3 → 4/5/6 (parallel) → 7 → 8 → 9 → 10 → 11
v1.1 (funnel Phases 7–11 frozen): 12 → 13 → 14 → 15 → 16

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Platform Foundation, Design System Port & i18n Runtime | 14/14 | Complete | 2026-08-22 |
| 2. Data Schema, RLS & Staff Auth Foundations | 10/10 | Complete | 2026-08-27 |
| 3. Hyperdrive Data Access Wiring | 7/7 | Complete | 2026-08-28 |
| 4. Quote & Pricing Engine | 16/16 | Complete    | 2026-09-06 |
| 5. Public Surfaces & Customer Accounts | 33/33 | Complete    | 2026-09-06 |
| 6. Ops Reference Data & Content Console | 13/13 | Complete   | 2026-09-01 |
| 7. Checkout & Payment | 0/TBD | Not started | - |
| 8. Ops Dispatch — Live Board, Assignment & Account Surfaces | 0/TBD | Not started | - |
| 9. Booking Lifecycle & Customer Self-Service | 0/TBD | Not started | - |
| 10. Hardening — Performance, Security & Compliance | 0/TBD | Not started | - |
| 11. Launch Cutover | 0/TBD | Not started | - |
| 12. Ticket schema + #support mock | 0/TBD | Not started | - |
| 13. Staff APIs + outbound Resend replies | 0/TBD | Not started | - |
| 14. Inbound webhook | 0/TBD | Not started | - |
| 15. Wire Ops #support to APIs | 0/TBD | Not started | - |
| 16. Staging MX + end-to-end UAT | 0/TBD | Not started | - |

---
*Roadmap created: 2026-08-17*
*Granularity: fine (11 phases v1 + 5 phases v1.1)*
*Coverage: 80/80 v1 + 9/9 v1.1*
*v1.1 Ops Support added: 2026-09-04*
