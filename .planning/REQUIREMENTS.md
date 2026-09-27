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

## Milestone v1.3 Meta measurement Requirements

**Defined:** 2026-09-23
**Core value:** quote → pay → confirmation. v1.3 measures ads only. It does not change pay.
**Sources:** `.planning/PROJECT.md`, `.planning/research/SUMMARY.md`. Owner confirmed this list.

### Legal

- [x] **META-01**: The pixel and the Purchase call stay off until the owner pastes the banner, cookies, and privacy lines in en, de, fr, and ar. Do not draft them.
  Lock shipped on the branch. The paste has not happened. This check is not a licence to load the pixel.

- [x] **META-02**: A new consent policy version. An old Accept, from when marketing was stored off, does not turn Meta on.

### Consent

- [ ] **META-03**: Accept logs Meta on. Dismiss logs Meta off. The latest `consent_log` row wins. No new switches.
- [ ] **META-04**: The banner asks on every customer page until they choose, including a pay link. Ops has no banner. The pixel still never loads on a pay link.
- [ ] **META-05**: A later Dismiss stops future PageView and future Purchase. Accepting after payment does not backfill a Purchase.

### PageView

- [ ] **META-06**: After Accept and META-01, pixel `1595596972063765` sends PageView only on public pages with no token, plus signed-in account and bookings.
- [ ] **META-07**: Never ops, never a pay link, never manage-booking, never a booking reference in the URL. A person who dismissed does not get a cached page that contains the script.
- [ ] **META-08**: No advanced matching and no noscript image. The owner confirms in Events Manager that automatic matching and automatic button clicks are off before the pixel can load.
- [ ] **META-09**: `_fbp` and `_fbc` are saved on the unpaid booking after the pixel sets them. Not in Stripe. A paid booking cannot be updated to backfill them.

### Purchase

- [ ] **META-10**: One Purchase from the settle queue after a real CHF charge. Value is the francs charged. `CHF 000` sends nothing.
- [ ] **META-11**: The payload is `_fbp` and `_fbc` only, and only if they were saved. If neither was saved, send nothing. No email, phone, name, route, flight, booking reference, IP, or user-agent.
- [ ] **META-12**: The URL sent to Meta is `https://vamostaxi.site` with no path. The event id is ours, one per booking, reused if the queue retries. It is not the booking reference.
- [ ] **META-13**: A Meta failure does not unpay the booking and does not change the webhook response. A retry does not send a second Purchase.
- [ ] **META-14**: Staging uses a test event code. The token is a wrangler secret. If Graph rejects this payload, stop and ask. Do not widen it.

### v1.3 Future (deferred)

- Middle-funnel events (quote seen, checkout started, pay step)
- Hashed email or phone
- Browser Purchase on the thank-you page
- Dropping the staging test event code so events count in ads
- Live Stripe account / `sk_live_`
- `vamostaxi.eu` DNS
- Refund or negative Purchase

### v1.3 Out of Scope

| Feature | Reason |
|---------|--------|
| Loading `fbevents.js` before Accept | An ad click is not consent |
| Meta on ops, pay-link, or manage-booking | Those URLs can carry a token |
| Invented legal copy | Owner pastes the lines |
| Zaraz, GTM, or a pixel SDK | No new package |
| Quote, pay, or confirmation changes | v1.3 measures only |

### v1.3 Traceability

Filled by the roadmapper.

| Requirement | Phase | Status |
|-------------|-------|--------|
| META-01 | Phase 26 | Complete |
| META-02 | Phase 26 | Complete |
| META-03 | Phase 27 | Pending |
| META-04 | Phase 27 | Pending |
| META-05 | Phase 27 | Pending |
| META-06 | Phase 28 | Pending |
| META-07 | Phase 28 | Pending |
| META-08 | Phase 28 | Pending |
| META-09 | Phase 28 | Pending |
| META-10 | Phase 29 | Pending |
| META-11 | Phase 29 | Pending |
| META-12 | Phase 29 | Pending |
| META-13 | Phase 29 | Pending |
| META-14 | Phase 29 | Pending |

**v1.3 coverage:** 14 requirements, mapped 14, unmapped 0 ✓

## Milestone v1.2 Payment Requirements

**Defined:** 2026-09-22
**Core value:** quote → pay → confirmation. v1.2 unfreezes **pay** only (Stripe TEST on `vamostaxi.site`).
**Sources:** `.planning/PROJECT.md`, `.planning/research/SUMMARY.md`. DC pay mock is the visual spec.

### Charge gate

- [ ] **PAY-08**: Unpriced class (`CHF 000`) refuses visibly (`pricing_not_live`) and never opens Stripe
- [ ] **PAY-09**: Expired 24h lock refuses visibly; pay-link dies with that lock (resend does not restart it)

### Pay

- [ ] **PAY-10**: Traveller pays a locked quote on `vamostaxi.site` in Stripe TEST with card (`4242…` captures)
- [ ] **PAY-11**: Apple Pay, Google Pay (`auto`), Link, and TWINT (PaymentElement collector; skip UAT with a note if TEST is not Swiss — no fake radio)
- [ ] **PAY-12**: Decline and 3DS stay unpaid until webhook; thank-you waits on webhook, not `confirm()`
- [ ] **PAY-13**: Unpaid `/bookings` row pays the same open session (same `PaymentPanel`)

### Pay link

- [ ] **PAY-14**: Email a pay link requires company name + VAT; address optional; payer email required. Self-pay does not need business details
- [ ] **PAY-15**: Recipient pays on `/checkout/pay/[token]` recap-only; cannot edit the trip; same methods
- [ ] **PAY-16**: First successful charge wins; loser sees the same confirmation; no second charge
- [ ] **PAY-17**: Traveller gets confirmation email + manage link; other payer gets a receipt only

### Cutover

- [ ] **PAY-18**: TEST→live is wrangler secrets + same-mode publishable/webhook; no `sk_live_` in this milestone; browser uses the server-provided key

### v1.2 Future (deferred)

- Calendar invite (`.ics`) on confirmation
- Quote/class rebuild and owner fare Publish
- Live Stripe account / `sk_live_` (after this milestone’s TEST UAT)
- TWINT UAT if the TEST Stripe entity is not Swiss (written skip, not a fake method)

### v1.2 Out of Scope

| Feature | Reason |
|---------|--------|
| Live `vamostaxi.eu` DNS | Phase 11 |
| PayPal / cash / Connect / invoice-on-account | Product rulings |
| Phases 16 MX, 17 chauffeur, 19 close-out, 20 security | Frozen leftovers |
| Redesign of the DC pay screen | Mocks are the spec |
| Invented CHF / class fares | Owner Publish only |

### v1.2 Traceability

Filled by the roadmapper.

| Requirement | Phase | Status |
|-------------|-------|--------|
| PAY-08 | Phase 21 | Pending |
| PAY-09 | Phase 21 | Pending |
| PAY-10 | Phase 22 | Pending |
| PAY-11 | Phase 23 | Pending |
| PAY-12 | Phase 22 | Pending |
| PAY-13 | Phase 25 | Pending |
| PAY-14 | Phase 24 | Pending |
| PAY-15 | Phase 24 | Pending |
| PAY-16 | Phase 24 | Pending |
| PAY-17 | Phase 24 | Pending |
| PAY-18 | Phase 25 | Pending |

**v1.2 coverage:** 11 requirements, mapped 11, unmapped 0 ✓

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
- [x] **DATA-08**: Every booking, price, payment and assignment change writes an append-only event that ops can read as a timeline

### Accounts (AUTH)

- [ ] **AUTH-01**: A customer can create an account with email and password, or receive a one-time code by email
- [ ] **AUTH-02**: A customer can reset a forgotten password from an emailed link
- [ ] **AUTH-03**: A session survives a browser refresh and expires safely
- [ ] **AUTH-04**: A customer can sign out from any page
- [x] **AUTH-05**: Staff sign in by invitation only and must pass a second factor
- [x] **AUTH-06**: A guest who booked without an account can claim that booking into a new account from the emailed link

### Quote and pricing (QUOTE)

- [ ] **QUOTE-01**: A customer enters pickup and destination by search or by dropping a pin on the map, and sees the route drawn
- [ ] **QUOTE-02**: A customer picks one-way or return, date, time, passengers and luggage, clamped to what each vehicle class can carry
- [x] **QUOTE-03**: The server returns a price for every eligible live-book vehicle class — a fixed-route price where one is configured, otherwise start + (all km × per-km) + bands (Phase 18)
- [x] **QUOTE-04**: A quote holds its price for 24 hours (hardcoded), and an expired unpaid quote is refused at payment time by the server, not merely hidden in the UI (Phase 18 D-13; was 30 minutes)
- [ ] **QUOTE-05**: Each booking stores the price breakdown and the rate version it was calculated from, so later pricing changes never alter a historical booking
- [ ] **QUOTE-06**: A coupon code reduces the quote before payment, and is refused when outside its window or past its usage cap
- [ ] **QUOTE-07**: A booking is refused when it is inside the minimum advance time or outside the service area, with a message saying which
- [ ] **QUOTE-08**: Entering a flight number fills in the landing time
- [ ] **QUOTE-09**: The quote endpoint is rate-limited and challenges anonymous visitors after repeated requests
- [ ] **QUOTE-10**: Until the CHF matrix is loaded and approved, the engine runs behind `pricing_live=false`, checkout is disabled in production and every amount on screen reads `CHF 000`
- [x] **QUOTE-11**: A customer can add checkout extras from the published surcharges list and one extra Mapbox stop; extra stop re-runs the distance recipe; extra wait is not in Stripe pay-now (Phase 18)

### Checkout and payment (PAY)

- [x] **PAY-01**: A customer reaches checkout carrying their locked quote and enters passenger and contact details
- [x] **PAY-02**: A customer can pay by card, Apple Pay, Google Pay or TWINT, charged in CHF
- [x] **PAY-03**: A customer can complete a booking as a guest, without creating an account
- [x] **PAY-04**: A booking is confirmed by the payment webhook, never by the browser returning from the payment page
- [x] **PAY-05**: A repeated or out-of-order webhook cannot double-charge, double-confirm or double-send an email
- [x] **PAY-06**: A paid customer receives a confirmation email in their language, with the booking voucher, a manage link and a calendar invite
- [x] **PAY-07**: The customer sees a confirmation page showing the reference, route, time, vehicle and what they paid

### Booking lifecycle (LIFE)

- [ ] **LIFE-01**: A booking moves through quote, pending, paid, confirmed, assigned, completed, cancelled and no-show, and every move is recorded (`booking_events`). Refunds are a money line (`booking_refunds` / `refund_status`), not a `refunded` status word
- [ ] **LIFE-02**: A customer can cancel and be refunded against the locked D-02 windows vs original Zurich pickup — automatic full Stripe refund more than 24h out; cancel immediately with refund pending ops (default 100%) between 24h and 6h; no automatic refund from 6h through pickup and after pickup until Completed; Completed/No-show hide customer Cancel. Ops may still refund anyone anytime
- [ ] **LIFE-03**: A refund amount is the captured Stripe charge on that booking (after coupon), never live `settings_versions` and never a 75% leftover tier
- [ ] **LIFE-04**: A customer can open and manage their booking either signed in (`/confirmation/{ref}`) or from the tokened email link (`/manage-booking?token=`)
- [ ] **LIFE-05**: A customer is reminded 24h before original pickup, and receives the driver's name, vehicle and plate once assigned
- [ ] **LIFE-06**: A customer or ops can request a new pickup time; it does not go live until ops confirms. Flight number is editable anytime. No AeroDataBox auto-shift in V1
- [ ] **LIFE-07**: Stale unpaid bookings expire on the hourly Worker. No automatic no-show sweep in V1 — ops marks Completed and No-show by hand
- [ ] **LIFE-08**: A customer is asked for a review after ops marks Completed or paid no-show; submit lands in `public.reviews`

### Public site (SITE)

- [ ] **SITE-01**: The home page renders with the booking widget prominent, and its sections read from the database
- [ ] **SITE-02**: Every public page carries the shared header and footer, never a hand-rolled one
- [x] **SITE-03**: A customer can see their profile, booking history and any single booking in detail
- [ ] **SITE-04**: About, FAQ, contact and become-a-driver pages render, and the contact and driver-application forms are challenge-protected and reach both the inbox and the database
- [ ] **SITE-05**: Terms, privacy, cookies, cancellation and imprint render, with real numbers where the owner supplied them and labelled TBC pills where not
- [ ] **SITE-06**: Every page is laid out for 1440, 1024, 768 and 390 px, and nothing scrolls sideways at 390
- [ ] **SITE-07**: Public pages are server-rendered for search engines and declare their language alternates
- [x] **SITE-08**: The cookie banner gates what it promises to gate, and the customer's choice is recorded server-side with the policy version
- [ ] **SITE-09**: A customer can reach support by phone, WhatsApp and the contact form

### Ops console (OPS)

- [x] **OPS-01**: Staff see a live board of bookings that updates when a booking is paid, without a refresh
- [x] **OPS-02**: Staff open a booking and see its full detail and event timeline
- [x] **OPS-03**: A dispatcher assigns a chauffeur and a vehicle, and the same driver cannot be double-booked for overlapping trips
- [x] **OPS-04**: A dispatcher can take a booking by phone and enter it into the system, on a screen designed and reviewed as a mock first
- [x] **OPS-05**: Staff can confirm, modify and cancel a booking, and issue a refund
- [x] **OPS-06**: Staff can manage vehicle classes, vehicles, chauffeurs, fixed routes, distance rates, surcharges and coupons
- [x] **OPS-07**: Staff can see customers and their booking history
- [x] **OPS-08**: Staff can publish, hide and order the reviews that appear on the home page
- [x] **OPS-09**: Staff can edit business settings and the content strings behind the site copy
- [x] **OPS-10**: The ops console is a role-gated area of the same application, reachable only by staff
- [ ] **OPS-11**: One Add (including a double click) creates one chauffeur row
- [ ] **OPS-12**: Clicking a chauffeur opens a full-page profile: details, photo, bookings, leave, shift days and times
- [ ] **OPS-13**: Each vehicle has at most two chauffeurs (morning and night); a third assign is refused with the exact reason
- [ ] **OPS-14**: Saved shift days and times in Europe/Zurich set On shift vs Off duty; dispatcher-marked leave overrides the clock until it ends

### Launch readiness (LAUNCH)

- [ ] **LAUNCH-01**: The site serves 10 000 concurrent browsing visitors with page p95 under one second and the database barely touched
- [x] **LAUNCH-02**: Public API routes are rate-limited, forms are challenge-protected and the payment webhook is verified by signature
- [x] **LAUNCH-03**: Errors, uptime and a health check covering database, payments and maps report to a place someone watches
- [ ] **LAUNCH-04**: Backups run and a restore has actually been performed once, before real bookings exist
- [ ] **LAUNCH-05**: `vamostaxi.eu` points at the Worker, every old CMS URL redirects to its new home, and the sitemap is submitted
- [ ] **LAUNCH-06**: `pricing_live=true` is flipped only after the real CHF matrix is loaded and approved on staging
- [x] **LAUNCH-07**: A runbook exists for refunds, resending an email, manual assignment and restoring the database

---

### Payment and pricing integrity (INT) — Phase 26.1

- [ ] **INT-01**: Only the Vamos Taxi Stripe sandbox is used; the Worker webhook secret matches the sandbox endpoint (owner sets it) (D-01, D-02)
- [ ] **INT-02**: A successful payment always ends as a confirmed booking, reviving a cancelled or expired one; every cancel or expire path expires the open Stripe session; abandoning payment still auto-cancels (D-03, D-04, D-18, D-19)
- [ ] **INT-03**: Refunds use the PaymentIntent ID; `charge.refunded` and disputes reach the DB; a DLQ consumer with an alert exists and a stuck session replays safely; the sandbox CHF 77.80 refund is recorded (D-05, D-06, D-07)
- [ ] **INT-04**: The server prices each leg by the owner formula — lines, then coupon % (floor CHF 0), then VAT 8.1 %; airport fee on airport pickup or flight number; city pair both directions for different places; fails closed; `pricing_live` read; coupon caps enforced at payment (D-08…D-09, D-11, D-12)
- [ ] **INT-05**: All 26 cantons as boundary zones with canton → different canton CHF 50 for every class; duplicate/POI zones cleaned; every amount from the dashboard; version 18 stays a labelled placeholder and the agent never publishes (D-10, D-10a, D-13)
- [ ] **INT-06**: A pay link locks the booking 24 h and auto-cancels when unpaid; the recipient's payment confirms; "already paid" when the customer paid first; a race accepts one and auto-refunds a second charge (D-20, D-21, D-22)
- [ ] **INT-07**: Customer cancel > 24 h before pickup refunds in full automatically; < 24 h needs admin approval with a percentage; after the trip the admin accepts or rejects (D-23, D-24, D-25)
- [ ] **INT-08**: Classes are Economy, Business, Van luxury; dashboard delete is hard when unreferenced, otherwise hidden with a reason; `mahaha` goes (D-14, D-15)
- [ ] **INT-09**: Only the admin signs in; passkey, TOTP and password ↔ magic link all work end to end from account settings; aal2 once a factor is enrolled; re-auth before password or email change; leaked-password protection on (D-16, D-16a, D-17)

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
- [x] **SUP-02**: Each ticket has exactly one status: New, Open, Replied, Responded, or Closed — dispatcher Open / Close / Reopen only (not an arbitrary five-way setter). Staff reply → Replied is Phase 13. Customer mail → Responded is Phase 14.
- [ ] **SUP-03**: Dispatcher opens a ticket and sees the original form (name, email, phone, message, time) plus the thread, newest last
- [ ] **SUP-04**: The ticket shows the form `booking_ref` and `locale` when they exist
- [ ] **SUP-05**: Dispatcher can filter the list by status

### Reply (RPLY)

- [ ] **RPLY-01**: Dispatcher sends a reply from the ticket; the customer receives it in Gmail on the same thread
- [ ] **RPLY-02**: `info@vamostaxi.site` receives a copy of that staff reply (BCC). Gmail is a copy; Ops is the working inbox

### Inbound (INB)

- [ ] **INB-01**: When the customer hits Reply in Gmail, that mail appends to the **same** ticket
- [x] **INB-02**: Mail that is not a reply to an existing ticket does not become a ticket. Ops ignores it. (Safety bar from PROJECT.md — inbound without this is a catch-all inbox.)

Closed stays closed until a human Reopens it (status Open). Customer reply on a Closed ticket auto-reopens to Responded (Phase 14).

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
| DATA-08 | Phase 8 | Complete |
| AUTH-01 | Phase 5 | Pending |
| AUTH-02 | Phase 5 | Pending |
| AUTH-03 | Phase 5 | Pending |
| AUTH-04 | Phase 5 | Pending |
| AUTH-05 | Phase 2 | Complete |
| AUTH-06 | Phase 8 | Complete |
| QUOTE-01 | Phase 4 | Pending |
| QUOTE-02 | Phase 4 | Pending |
| QUOTE-03 | Phase 18 | Complete |
| QUOTE-04 | Phase 18 | Complete |
| QUOTE-05 | Phase 4 | Pending |
| QUOTE-06 | Phase 4 | Pending |
| QUOTE-07 | Phase 4 | Pending |
| QUOTE-08 | Phase 4 | Pending |
| QUOTE-09 | Phase 4 | Pending |
| QUOTE-10 | Phase 4 | Pending |
| QUOTE-11 | Phase 18 | Complete |
| PAY-01 | Phase 7 | Complete |
| PAY-02 | Phase 7 | Complete |
| PAY-03 | Phase 7 | Complete |
| PAY-04 | Phase 7 | Complete |
| PAY-05 | Phase 7 | Complete |
| PAY-06 | Phase 7 | Complete |
| PAY-07 | Phase 7 | Complete |
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
| SITE-03 | Phase 8 | Complete |
| SITE-04 | Phase 5 | Pending |
| SITE-05 | Phase 5 | Pending |
| SITE-06 | Phase 5 | Pending |
| SITE-07 | Phase 5 | Pending |
| SITE-08 | Phase 10 | Complete |
| SITE-09 | Phase 5 | Pending |
| OPS-01 | Phase 8 | Complete |
| OPS-02 | Phase 8 | Complete |
| OPS-03 | Phase 8 | Complete |
| OPS-04 | Phase 8 | Complete |
| OPS-05 | Phase 8 | Complete |
| OPS-06 | Phase 6 + 18 | Complete (fare book revalidated Phase 18) |
| OPS-07 | Phase 6 | Complete |
| OPS-08 | Phase 6 | Complete |
| OPS-09 | Phase 6 | Complete |
| OPS-10 | Phase 6 | Complete |
| LAUNCH-01 | Phase 10 | Pending (no 10k load test this sitting) |
| LAUNCH-02 | Phase 10 | Complete |
| LAUNCH-03 | Phase 10 | Complete |
| LAUNCH-04 | Phase 10 | Pending (restore parked — Supabase Free) |
| LAUNCH-05 | Phase 11 | Pending |
| LAUNCH-06 | Phase 11 | Pending |
| LAUNCH-07 | Phase 10 | Complete |

**Coverage:**

- v1 requirements: 80 total
- Mapped to phases: 80
- Unmapped: 0 ✓

### v1.1 traceability

Populated during v1.1 roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| SUP-01 | Phase 15 | Pending |
| SUP-02 | Phase 12 | Complete |
| SUP-03 | Phase 15 | Pending |
| SUP-04 | Phase 15 | Pending |
| SUP-05 | Phase 15 | Pending |
| RPLY-01 | Phase 13 | Pending |
| RPLY-02 | Phase 13 | Pending |
| INB-01 | Phase 16 | Pending |
| INB-02 | Phase 14 | Complete |

**v1.1 coverage:** 9 requirements, 9 mapped, unmapped 0 ✓

### Phase 26.1 traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| INT-01 | Phase 26.1 | Pending |
| INT-02 | Phase 26.1 | Pending |
| INT-03 | Phase 26.1 | Pending |
| INT-04 | Phase 26.1 | Pending |
| INT-05 | Phase 26.1 | Pending |
| INT-06 | Phase 26.1 | Pending |
| INT-07 | Phase 26.1 | Pending |
| INT-08 | Phase 26.1 | Pending |
| INT-09 | Phase 26.1 | Pending |

**Phase 26.1 coverage:** 9 requirements, 9 mapped, unmapped 0 ✓

---
*Requirements defined: 2026-08-17*
*Last updated: 2026-09-22 — v1.2 Traceability filled (PAY-08…PAY-18 → phases 21–25). v1/v1.1 rows unchanged.*
*Updated 2026-09-27 — INT-01…INT-09 added for inserted Phase 26.1 (payment and pricing integrity).*
