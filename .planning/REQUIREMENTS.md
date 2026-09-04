# Requirements: Vamos Taxi V1

**Defined:** 2026-08-17
**Core Value:** A customer can book a fixed-price transfer in under a minute and trust that
the driver will be there. If nothing else works, the booking funnel — quote, pay,
confirmation — must.

Sources: `docs/build/GSD-LAUNCH.md` (the build plan), `docs/build/MISSING-FEATURES.md` (gap
audit), the 23 `docs/build/SPEC-*.md` screen specs, `docs/build/OWNER-ANSWERS.md` (owner
decisions of 13 Aug 2026), `.planning/research/` and `CLAUDE.md` (product rules).

Every requirement below is testable against a finished mock. The mocks are the visual spec
and are final — "matches the mock" is a real acceptance criterion, not a hand-wave.

---

## v1 Requirements

### Platform (PLAT)

- [ ] **PLAT-01**: The app serves server-rendered pages from a single Cloudflare Worker built with `@opennextjs/cloudflare`, on a real custom domain from the first deploy
- [x] **PLAT-02**: The Worker exports `fetch`, `scheduled` and `queue` handlers from one custom entry file, so cron sweeps and queue consumers live in the same deployment
- [x] **PLAT-03**: A pull request runs typecheck, build and a preview upload; `main` deploys staging; a tag deploys production
- [x] **PLAT-04**: Design-system tokens, fonts, icons and logos are served from the app, and its components are React with the same class names so the CSS carries over unchanged
- [x] **PLAT-05**: Lenis smooth scroll runs as a single instance per page, honouring `prefers-reduced-motion` and stopping while a sheet locks the body
- [x] **PLAT-06**: Every secret reaches the Worker through `wrangler secret`, and none is readable from the browser or committed to the repo

### Localisation (I18N)

- [x] **I18N-01**: Every visible string renders in English, German, French and Arabic — including placeholders, `aria-label`, `title` and `alt`
- [ ] **I18N-02**: Changing language relabels the page in place without a reload, and the choice survives navigation and a return visit
- [x] **I18N-03**: The chosen language is correct in the server-rendered HTML — no English flash and no direction flip on hydration
- [x] **I18N-04**: Arabic renders right-to-left with correct layout, because every surface uses logical properties rather than left/right
- [x] **I18N-05**: Changing currency swaps the mark and never the number, and the charge is always CHF
- [x] **I18N-06**: Strings the code builds from parts are translated too, never left English because they contain a number
- [ ] **I18N-07**: Editable content strings live in the database and are editable from the ops Content screen
- [ ] **I18N-08**: A legal page that exists in fewer languages than four says so, rather than pretending to be translated

### Data and access (DATA)

- [x] **DATA-01**: The schema mirrors the `VamosOps` contract: bookings, booking events, customers, chauffeurs, vehicles, vehicle classes, coupons, fixed routes, distance rates, surcharges, reviews, content strings and settings
- [x] **DATA-02**: Row-level security is on for every customer and operational table, and a customer can read only their own bookings
- [x] **DATA-03**: A guest can open their booking with a valid manage token and nothing else
- [x] **DATA-04**: Staff reach ops data through a role claim; customers never can
- [ ] **DATA-05**: Application queries reach Postgres through Hyperdrive on the direct connection string, with p50 round-trip under 30 ms from the staging Worker
- [ ] **DATA-06**: Request-scoped auth context cannot leak between requests sharing a pooled connection
- [x] **DATA-07**: Seed data loads vehicle classes, settings, content strings and the existing reviews into a fresh environment
- [ ] **DATA-08**: Every booking, price, payment and assignment change writes an append-only event that ops can read as a timeline

### Accounts (AUTH)

- [ ] **AUTH-01**: A customer can create an account with email and password, or receive a one-time code by email
- [ ] **AUTH-02**: A customer can reset a forgotten password from an emailed link
- [ ] **AUTH-03**: A session survives a browser refresh and expires safely
- [ ] **AUTH-04**: A customer can sign out from any page
- [x] **AUTH-05**: Staff sign in by invitation only and must pass a second factor
- [ ] **AUTH-06**: A guest who booked without an account can claim that booking into a new account from the emailed link

### Quote and pricing (QUOTE)

- [ ] **QUOTE-01**: A customer enters pickup and destination by search or by dropping a pin on the map, and sees the route drawn
- [ ] **QUOTE-02**: A customer picks one-way or return, date, time, passengers and luggage, clamped to what each vehicle class can carry
- [ ] **QUOTE-03**: The server returns a price for every eligible vehicle class — a fixed-route price where one is configured, otherwise distance rate plus surcharges
- [ ] **QUOTE-04**: A quote holds its price for 30 minutes, and an expired quote is refused at payment time by the server, not merely hidden in the UI
- [ ] **QUOTE-05**: Each booking stores the price breakdown and the rate version it was calculated from, so later pricing changes never alter a historical booking
- [ ] **QUOTE-06**: A coupon code reduces the quote before payment, and is refused when outside its window or past its usage cap
- [ ] **QUOTE-07**: A booking is refused when it is inside the minimum advance time or outside the service area, with a message saying which
- [ ] **QUOTE-08**: Entering a flight number fills in the landing time
- [ ] **QUOTE-09**: The quote endpoint is rate-limited and challenges anonymous visitors after repeated requests
- [ ] **QUOTE-10**: Until the CHF matrix is loaded and approved, the engine runs behind `pricing_live=false`, checkout is disabled in production and every amount on screen reads `CHF 000`
- [ ] **QUOTE-11**: A customer can add a child seat, an additional stop, or declare oversized luggage, and each shows as its own priced line

### Checkout and payment (PAY)

- [ ] **PAY-01**: A customer reaches checkout carrying their locked quote and enters passenger and contact details
- [ ] **PAY-02**: A customer can pay by card, Apple Pay, Google Pay or TWINT, charged in CHF
- [ ] **PAY-03**: A customer can complete a booking as a guest, without creating an account
- [ ] **PAY-04**: A booking is confirmed by the payment webhook, never by the browser returning from the payment page
- [ ] **PAY-05**: A repeated or out-of-order webhook cannot double-charge, double-confirm or double-send an email
- [ ] **PAY-06**: A paid customer receives a confirmation email in their language, with the booking voucher, a manage link and a calendar invite
- [ ] **PAY-07**: The customer sees a confirmation page showing the reference, route, time, vehicle and what they paid

### Booking lifecycle (LIFE)

- [ ] **LIFE-01**: A booking moves through quote, pending, paid, confirmed, assigned, completed, cancelled, refunded and no-show, and every move is recorded
- [ ] **LIFE-02**: A customer can cancel and be refunded automatically against the policy tiers — full outside 24 hours, 75 % inside 24 hours, nothing for a no-show
- [ ] **LIFE-03**: A refund is calculated from the policy stored on the booking, not from whatever the policy says today
- [ ] **LIFE-04**: A customer can open and manage their booking either signed in or from the tokened email link
- [ ] **LIFE-05**: A customer is reminded before pickup, and receives the driver's name, vehicle and plate once assigned
- [ ] **LIFE-06**: A delayed flight shifts the pickup time and notifies both the customer and ops
- [ ] **LIFE-07**: Stale quotes expire and no-shows are swept automatically on a schedule
- [ ] **LIFE-08**: A customer is asked for a review after the ride has completed

### Public site (SITE)

- [ ] **SITE-01**: The home page renders with the booking widget prominent, and its sections read from the database
- [ ] **SITE-02**: Every public page carries the shared header and footer, never a hand-rolled one
- [ ] **SITE-03**: A customer can see their profile, booking history and any single booking in detail
- [ ] **SITE-04**: About, FAQ, contact and become-a-driver pages render, and the contact and driver-application forms are challenge-protected and reach both the inbox and the database
- [ ] **SITE-05**: Terms, privacy, cookies, cancellation and imprint render, with real numbers where the owner supplied them and labelled TBC pills where not
- [ ] **SITE-06**: Every page is laid out for 1440, 1024, 768 and 390 px, and nothing scrolls sideways at 390
- [ ] **SITE-07**: Public pages are server-rendered for search engines and declare their language alternates
- [ ] **SITE-08**: The cookie banner gates what it promises to gate, and the customer's choice is recorded server-side with the policy version
- [ ] **SITE-09**: A customer can reach support by phone, WhatsApp and the contact form

### Ops console (OPS)

- [ ] **OPS-01**: Staff see a live board of bookings that updates when a booking is paid, without a refresh
- [ ] **OPS-02**: Staff open a booking and see its full detail and event timeline
- [ ] **OPS-03**: A dispatcher assigns a chauffeur and a vehicle, and the same driver cannot be double-booked for overlapping trips
- [ ] **OPS-04**: A dispatcher can take a booking by phone and enter it into the system, on a screen designed and reviewed as a mock first
- [ ] **OPS-05**: Staff can confirm, modify and cancel a booking, and issue a refund
- [x] **OPS-06**: Staff can manage vehicle classes, vehicles, chauffeurs, fixed routes, distance rates, surcharges and coupons
- [x] **OPS-07**: Staff can see customers and their booking history
- [x] **OPS-08**: Staff can publish, hide and order the reviews that appear on the home page
- [x] **OPS-09**: Staff can edit business settings and the content strings behind the site copy
- [x] **OPS-10**: The ops console is a role-gated area of the same application, reachable only by staff

### Launch readiness (LAUNCH)

- [ ] **LAUNCH-01**: The site serves 10 000 concurrent browsing visitors with page p95 under one second and the database barely touched
- [ ] **LAUNCH-02**: Public API routes are rate-limited, forms are challenge-protected and the payment webhook is verified by signature
- [ ] **LAUNCH-03**: Errors, uptime and a health check covering database, payments and maps report to a place someone watches
- [ ] **LAUNCH-04**: Backups run and a restore has actually been performed once, before real bookings exist
- [ ] **LAUNCH-05**: `vamostaxi.eu` points at the Worker, every old CMS URL redirects to its new home, and the sitemap is submitted
- [ ] **LAUNCH-06**: `pricing_live=true` is flipped only after the real CHF matrix is loaded and approved on staging
- [ ] **LAUNCH-07**: A runbook exists for refunds, resending an email, manual assignment and restoring the database

---

## v2 Requirements

Acknowledged, deliberately deferred, and kept in planning so the schema does not paint them
out.

### Corporate (CORP)

- **CORP-01**: A company can hold an account with several bookers under it
- **CORP-02**: A company can be billed by invoice on credit terms rather than paying per ride
- **CORP-03**: Ops can run an invoice cycle and reconcile payments against it

The owner's call was to keep corporate out of V1 and hidden, but keep it in the planning
because it may come later. So V1 ships nothing corporate and shows nothing corporate — and
the booking and customer schema stays shaped so an organisation can own bookings later
without a migration that rewrites history.

### Deferred elsewhere (LATER)

- **LATER-01**: Live flight tracking on the ops board, beyond autofill and delay-aware pickup
- **LATER-02**: Importing existing reviews from Google, Tripadvisor or Trustpilot
- **LATER-03**: Phone-number verification, and Google or Apple sign-in
- **LATER-04**: PayPal as a second payment processor
- **LATER-05**: Partner-application review queue and the refund/finance report in ops
- **LATER-06**: SMS to drivers on assignment
- **LATER-07**: Reusable destination and fixed-route SEO landing pages

---

## Milestone v1.1 Requirements — Ops Support

**Defined:** 2026-09-04
**Core Value:** Dispatcher answers contact mail from Ops. Customer replies land in the same ticket.
**Funnel:** Quote → pay → board (v1 Phases 7–11) stays frozen. Do not map v1.1 work onto those phases.

Tickets **are** `contact_submissions` rows plus a message thread. There is no parallel ticket table. Customer never sees a ticket UI.

### Inbox (SUP)

- [ ] **SUP-01**: Dispatcher opens Ops `#support` and sees every contact submission as a ticket
- [ ] **SUP-02**: Each ticket has exactly one status: New, Open, Replied, or Closed — dispatcher can set any of the four
- [ ] **SUP-03**: Dispatcher opens a ticket and sees the original form (name, email, phone, message, time) plus the thread, newest last
- [ ] **SUP-04**: The ticket shows the form `booking_ref` and `locale` when they exist
- [ ] **SUP-05**: Dispatcher can filter the list by status

### Reply (RPLY)

- [ ] **RPLY-01**: Dispatcher sends a reply from the ticket; the customer receives it in Gmail on the same thread
- [ ] **RPLY-02**: `info@vamostaxi.site` receives a copy of that staff reply (BCC). Gmail is a copy; Ops is the working inbox

### Inbound (INB)

- [ ] **INB-01**: When the customer hits Reply in Gmail, that mail appends to the **same** ticket
- [ ] **INB-02**: Mail that is not a reply to an existing ticket does not become a ticket. Ops ignores it. (Safety bar from PROJECT.md — inbound without this is a catch-all inbox.)

Closed stays closed until a human reopens it. Customer reply on a Closed ticket does **not** auto-reopen (owner did not select reopen-on-reply).

### v1.1 Future

- **SUP-F01**: Reopen Closed automatically when the customer replies
- **SUP-F02**: Attachments on inbound or outbound
- **SUP-F03**: Search, assignment, SLA, saved replies, macros, CSAT
- **SUP-F04**: Deep-link from `booking_ref` into Ops booking detail (column is shown in v1.1; the jump is later)

---

## Out of Scope

| Feature | Reason |
|---------|--------|
| Native apps, customer or driver | Responsive web only for V1 — the audience books from a browser |
| Driver app or driver dashboard | Drivers are admin records; assignment is manual in ops, which is sufficient at this size |
| Live GPS tracking, nearest-driver dispatch | The product is scheduled, not on-demand — the UI must never imply "arriving in 3 minutes" |
| Surge pricing | Fixed price up front is the promise; surge contradicts it |
| Stripe Connect, driver wallets, automated payouts | One merchant, not a marketplace |
| Global multi-country supply, affiliate and hotel portals | Swiss single operator, Zurich first |
| Book by the hour | Owner decision 15 — the widget tab is removed for V1 |
| "First" vehicle class | Owner decision 13 settles the lineup at three classes |
| A third-party chat widget, or an in-house chat build | Chat ships as a WhatsApp deep link — a vendor widget injects its own styling and cookies, an in-house build is 3–5 days against a 2–3 week deadline |
| Vercel, for hosting or previews | Fixed by `HANDOFF-CLAUDE-CODE.md` §3 |
| shadcn/ui or any second component library | The bound design system is the only source of visual truth |
| Medusa or a commerce framework | Its product/cart/order model adds infrastructure and still needs custom booking, pricing and dispatch |
| Live chat / Intercom / in-house chat widget | v1.1 is email tickets; WhatsApp stays the live channel (SITE-09) |
| Gmail IMAP / Gmail API scrape | Second source of tickets, OAuth, duplicates against the form copy. Direct-to-Gmail mail stays in Gmail |
| Phone-typed tickets | No second create path; tickets originate from `/contact` |
| Auto-tags / AI classify / AI auto-reply | Statuses only; a wrong answer on a paid transfer is worse than slow |
| Staff tab | Deleted. Do not restore. Support is `#support` |
| Catch-all inbound on `info@` | Unauthenticated spam/bounces. Tickets originate from `contact_submissions` |
| Answering in Gmail *and* Ops as two working inboxes | Splits threads. Ops is canonical; Gmail is the archive |
| Vendor help desk (Zendesk / Help Scout / Front) | Second login, second design, PII leaves this Supabase project |
| Resend receiving MX on apex `vamostaxi.site` or live `vamostaxi.eu` | Steals Gmail `info@`, or is Phase 11 live DNS. Receive only on `replies.vamostaxi.site` |
| Pushing `main` / `env.production` as part of v1.1 | Branch → PR → Koss says merge |

---

## Traceability

Populated during roadmap creation. Full phase goals and success criteria: `.planning/ROADMAP.md`.

| Requirement | Phase | Status |
|-------------|-------|--------|
| PLAT-01 | Phase 1 | Pending (Worker/build verified locally; real custom-domain deploy deferred — see 01-01-SUMMARY.md) |
| PLAT-02 | Phase 1 | Complete |
| PLAT-03 | Phase 1 | Complete |
| PLAT-04 | Phase 1 | Complete |
| PLAT-05 | Phase 1 | Complete |
| PLAT-06 | Phase 1 | Complete |
| I18N-01 | Phase 1 | Complete |
| I18N-02 | Phase 1 | Pending |
| I18N-03 | Phase 1 | Complete |
| I18N-04 | Phase 1 | Complete |
| I18N-05 | Phase 1 | Complete |
| I18N-06 | Phase 1 | Complete |
| I18N-07 | Phase 6 | Pending |
| I18N-08 | Phase 5 | Pending |
| DATA-01 | Phase 2 | Complete |
| DATA-02 | Phase 2 | Complete |
| DATA-03 | Phase 2 | Complete |
| DATA-04 | Phase 2 | Complete |
| DATA-05 | Phase 3 | Pending |
| DATA-06 | Phase 3 | Pending |
| DATA-07 | Phase 2 | Complete |
| DATA-08 | Phase 8 | Pending |
| AUTH-01 | Phase 5 | Pending |
| AUTH-02 | Phase 5 | Pending |
| AUTH-03 | Phase 5 | Pending |
| AUTH-04 | Phase 5 | Pending |
| AUTH-05 | Phase 2 | Complete |
| AUTH-06 | Phase 8 | Pending |
| QUOTE-01 | Phase 4 | Pending |
| QUOTE-02 | Phase 4 | Pending |
| QUOTE-03 | Phase 4 | Pending |
| QUOTE-04 | Phase 4 | Pending |
| QUOTE-05 | Phase 4 | Pending |
| QUOTE-06 | Phase 4 | Pending |
| QUOTE-07 | Phase 4 | Pending |
| QUOTE-08 | Phase 4 | Pending |
| QUOTE-09 | Phase 4 | Pending |
| QUOTE-10 | Phase 4 | Pending |
| QUOTE-11 | Phase 4 | Pending |
| PAY-01 | Phase 7 | Pending |
| PAY-02 | Phase 7 | Pending |
| PAY-03 | Phase 7 | Pending |
| PAY-04 | Phase 7 | Pending |
| PAY-05 | Phase 7 | Pending |
| PAY-06 | Phase 7 | Pending |
| PAY-07 | Phase 7 | Pending |
| LIFE-01 | Phase 9 | Pending |
| LIFE-02 | Phase 9 | Pending |
| LIFE-03 | Phase 9 | Pending |
| LIFE-04 | Phase 9 | Pending |
| LIFE-05 | Phase 9 | Pending |
| LIFE-06 | Phase 9 | Pending |
| LIFE-07 | Phase 9 | Pending |
| LIFE-08 | Phase 9 | Pending |
| SITE-01 | Phase 5 | Pending |
| SITE-02 | Phase 5 | Pending |
| SITE-03 | Phase 8 | Pending |
| SITE-04 | Phase 5 | Pending |
| SITE-05 | Phase 5 | Pending |
| SITE-06 | Phase 5 | Pending |
| SITE-07 | Phase 5 | Pending |
| SITE-08 | Phase 10 | Pending |
| SITE-09 | Phase 5 | Pending |
| OPS-01 | Phase 8 | Pending |
| OPS-02 | Phase 8 | Pending |
| OPS-03 | Phase 8 | Pending |
| OPS-04 | Phase 8 | Pending |
| OPS-05 | Phase 8 | Pending |
| OPS-06 | Phase 6 | Complete |
| OPS-07 | Phase 6 | Complete |
| OPS-08 | Phase 6 | Complete |
| OPS-09 | Phase 6 | Complete |
| OPS-10 | Phase 6 | Complete |
| LAUNCH-01 | Phase 10 | Pending |
| LAUNCH-02 | Phase 10 | Pending |
| LAUNCH-03 | Phase 10 | Pending |
| LAUNCH-04 | Phase 10 | Pending |
| LAUNCH-05 | Phase 11 | Pending |
| LAUNCH-06 | Phase 11 | Pending |
| LAUNCH-07 | Phase 10 | Pending |

**Coverage:**

- v1 requirements: 80 total
- Mapped to phases: 80
- Unmapped: 0 ✓

### v1.1 traceability

Populated during v1.1 roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| SUP-01 | — | Pending |
| SUP-02 | — | Pending |
| SUP-03 | — | Pending |
| SUP-04 | — | Pending |
| SUP-05 | — | Pending |
| RPLY-01 | — | Pending |
| RPLY-02 | — | Pending |
| INB-01 | — | Pending |
| INB-02 | — | Pending |

**v1.1 coverage:** 9 requirements, unmapped until roadmap.

---
*Requirements defined: 2026-08-17*
*Last updated: 2026-09-04 after /gsd-new-milestone v1.1 Ops Support*
