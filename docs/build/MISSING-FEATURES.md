# MISSING FEATURES — every page, every section

Gap audit of the design mocks in `app/` vs a production Vamos Taxi platform.
"Mock today" = what the file does now (all persistence is localStorage, nothing talks to a
server). "Missing" = what has to exist before launch. Build order lives in `GSD-LAUNCH.md`.

Legend: 🔴 blocks launch · 🟡 launch-window · ⚪ post-launch nice-to-have

---

## Cross-cutting (applies to every surface)

- 🔴 No backend at all: every store (`vamosAuth`, `vamosOpsAuth`, `VamosOps.*`,
  `vamosCookieConsent`, reviews, locale) is localStorage — needs Supabase per GSD Phase 2/3.
- 🔴 No real prices anywhere (`CHF 000` by design) — pricing engine + client matrix.
- 🔴 No emails/SMS of any kind (confirmation, reminder, driver assignment, reset links).
- 🔴 Legal pages are English-only (`data-vt-legal`); ~600 strings in `docs/i18n-todo.txt`
  await DE/FR/AR translation.
- 🔴 Every `data-tok` "TBC" pill: cancel window, waiting fees, no-show fee, link expiry,
  min advance booking.
- 🟡 No SEO layer (the mocks are client-rendered): titles, meta, OG images, sitemap,
  hreflang ×4 languages, structured data (LocalBusiness, FAQ).
- 🟡 No analytics/error reporting, and cookie consent doesn't actually gate any script yet.
- 🟡 Assets pending from owner: vehicle + destination photography (one V-Class photo
  repeats everywhere), payment marks, social marks, Qurova license.
- ⚪ PWA/offline voucher, printed voucher PDF.

---

## HOME — `app/home/home.dc.html`

**Header (SiteHeader)**
- 🔴 Sign-in state is fake (`vamosAuth` blob): needs real session, real name/initials,
  sign-out revocation.
- 🔴 Notification bell items are hard-coded (attached-booking, verify-email) — needs real
  events feed.
- 🟡 Language/currency persist only locally — must sync to account + cookie for SSR.
- ⚪ Phone pill: click-to-call tracking.

**Hero + booking widget (`#book`, WhenPicker/StepCounter/BrandSelect)**
- 🔴 Address fields are free text with a static suggestion list — needs Mapbox geocoding
  autocomplete (airports, stations, addresses), service-area validation.
- 🔴 Quote is fake: class cards show `CHF 000` — needs `/api/quote` (distance, fixed
  routes, surcharges, coupons) with a 30-min price lock.
- 🔴 "Book" hands off via localStorage trip blob → must hand off a server `quote_id`.
- 🔴 Flight-number autofill (SPEC-home-flight-autofill): lookup, delay tracking promise,
  graceful fallback.
- 🔴 Date/time picker: no min-advance-booking rule, no blocked dates, no timezone safety
  (Europe/Zurich) — all `settings`-driven.
- 🟡 Pax/luggage counters clamp to hard-coded capacities — read `vehicle_classes`.
- 🟡 Return-trip / hourly mode decisions (showHourly flag is a tweak, not a product call).
- ⚪ Recent routes / saved places for signed-in users.

**Services** — 🟡 four cards are static copy; corporate card should link a real corporate
intake (today it just prefills the widget). ⚪ per-service landing pages for SEO.

**How it works** — 🟡 static; fine. Needs real photography when it lands.

**Why Vamos** — 🟡 claims (waiting time, fixed price) must match `settings` numbers once
policy inputs land — single source of truth, not copy.

**Reviews** — 🔴 seeded from `vamos-reviews.js` localStorage; must read published rows from
DB (same rows ops Reviews manages). 🟡 review source/import decision (Google reviews?),
schema.org Review markup. ⚪ language-filtered display.

**FAQ (home section)** — 🟡 static strings; move to `content_strings` so ops Content can
edit; deep-link `#faq` already works.

**Footer (SiteFooter)** — 🔴 payment marks are typed placeholders (need brand assets);
🟡 social links go nowhere (need real profiles); newsletter signup absent (decide);
cookie-prefs button works only where the banner exists.

**Cookie banner** — 🔴 consent stored but gates nothing: wire analytics/marketing script
loading to the stored consent, add consent versioning + re-prompt on policy change.

---

## PUBLIC PAGES — `app/pages/`

**sign-in.dc.html (+ AuthForm/AuthStates/PhoneVerify)**
- 🔴 Entirely mocked (hard-coded "registered" emails, fake OTP `000000`, fake social
  buttons): Supabase email+password, email OTP, verification links, session cookies for SSR,
  rate limiting + Turnstile, real error states.
- 🟡 Phone verification flow (mock exists) — decide Twilio Verify now or defer.
- 🟡 OAuth (Google/Apple) — mock buttons exist; ship or remove.

**reset-password.dc.html (+ ResetForm)** — 🔴 mock: real token links w/ expiry
(`data-tok` says TBC), password policy, session invalidation on change.

**account.dc.html**
- 🔴 Profile edits don't persist beyond localStorage: name, phone (re-verify), email
  change (re-verify), password change, default language/currency.
- 🔴 "Verify your email" banner → real verification state.
- 🟡 Attached-booking flow (`?attached=2`) → server-side booking→account claim.
- 🟡 Delete account (GDPR/nFADP) + data export.
- ⚪ Saved travellers, saved addresses, corporate/invoice profile.

**bookings.dc.html (+ BookingRow)** — 🔴 list is seed data: real query (upcoming/past),
pagination, per-row actions (view, manage, receipt download, rebook). ⚪ ICS export.

**booking-detail.dc.html** — 🔴 all fake: real fetch by ref w/ RLS, live status from
lifecycle, driver card once assigned, receipt/invoice PDF, change/cancel entry points,
`booking_events` timeline.

**manage-booking.dc.html** — 🔴 ref+email lookup is fake: server lookup, tokened deep link
from emails, edit pickup time (repricing rules), cancel with policy math (free window TBC),
refund initiation, resend confirmation. 🟡 change-request path when self-serve isn't allowed.

**checkout.dc.html** — 🔴 the whole payment layer: locked-quote read, passenger form
validation, Stripe Payment Element (cards/TWINT/wallets), 3DS, coupon field w/ server
validation, T&C acceptance record, guest vs signed-in flows, price-lock expiry handling,
duplicate-submit protection. 🟡 corporate "pay by invoice" decision.

**confirmation.dc.html** — 🔴 static: real booking fetch, reference display, email-sent
state, add-to-calendar (ICS), manage link, create-account-from-guest upsell.

**contact.dc.html** — 🔴 form doesn't send: Resend delivery + DB row + auto-ack email,
Turnstile, file attachment policy. 🟡 WhatsApp/live-chat links are placeholders.

**become-a-partner.dc.html** — 🔴 form doesn't submit: applications table + document
upload (license, insurance) to storage, status emails. 🟡 ops-side review queue (no ops
screen exists for it — add to OpsSoon list or build).

**faq.dc.html** — 🟡 static: move content to DB, search works only client-side (fine),
schema.org FAQPage, link-to-answer anchors already fine.

**Legal: terms / privacy / cookies / cancellation / imprint**
- 🔴 EN-only translations (see cross-cutting), `data-tok` policy numbers, versioning +
  "last updated" from DB, consent-log linkage (which T&C version a booking accepted).
- 🟡 cancellation page's fee table is placeholder math until policy lands.

**coming-soon.dc.html** — 🟡 email-me field doesn't store: waitlist table + double-opt-in.

**about.dc.html** — ⚪ real company photos; otherwise content-complete.

---

## OPS CONSOLE — `app/ops/`

**ops-login.dc.html** — 🔴 gate is `localStorage.vamosOpsAuth='1'`: real staff auth
(invite-only), `dispatcher|admin` roles, TOTP MFA, session expiry, audit log of sign-ins,
lockout. 🔴 remove the mock password from the mock note.

**Shell (ops.dc.html + OpsSidebar)** — 🔴 role-based nav (admin-only screens hidden from
dispatchers); 🟡 global search (ref, name, phone) — mock searches seed only; live badge
counts on nav (new bookings, pending reviews).

**Dashboard (OpsDash)** — 🔴 KPIs are seed math: real aggregates (today's pickups, unassigned,
revenue once prices exist, cancellations), live refresh via Realtime, date-range compare.
🟡 "needs attention" queue (unassigned within X h, flight delays). ⚪ revenue charts.

**Bookings board (OpsBoard + OpsTable + BookingRow)**
- 🔴 Real data w/ server pagination + filters (status, date, class, channel), live inserts/
  updates (Realtime), bulk actions.
- 🔴 Assignment action writes nothing real: chauffeur+vehicle picker w/ conflict check
  (double-booking, capacity), triggers driver + customer notifications.
- 🟡 Manual booking creation (phone bookings!) — no mock screen for "new booking" at all.
- 🟡 Export CSV. ⚪ column preferences per user.

**Booking detail (OpsDetail)** — 🔴 timeline is fake: `booking_events` feed, status
transitions with guards, price override w/ audit + reason, Stripe refund button (partial/
full), resend emails, edit route/time w/ reprice, internal notes, customer contact links.
🟡 no-show flow w/ fee. ⚪ driver ETA/GPS (explicitly out of V1 scope — no driver app).

**Calendar (OpsCalendar)** — 🔴 seed data: real day/week pickup views, chauffeur lanes,
conflict surfacing, click-through to detail. 🟡 drag to reassign time. ⚪ iCal feed per
chauffeur.

**Fleet (OpsFleet)** — 🔴 CRUD persists only locally: vehicles + chauffeurs to DB, photo
upload to storage, license/insurance expiry dates with dashboard alerts, active/inactive.
🟡 chauffeur working-hours/absence (feeds assignment conflicts). ⚪ per-chauffeur stats.

**Pricing (OpsPricing)** — 🔴 the whole screen edits localStorage: fixed-route matrix,
per-km class rates, surcharges, minimum fares — all to DB with **versioned publish**
(draft → publish, who/when), because this is the money table. 🔴 blocked on client matrix.
🟡 coupon-independent promo pricing rules. ⚪ historical price audit view.

**Coupons (OpsCoupons)** — 🔴 real CRUD + redemption counts, validity windows, usage caps
(global + per customer), status auto-derived; server-side validation shared with checkout.
🟡 redemption report per code.

**Customers (OpsCustomers)** — 🔴 seed list: real profiles + guest contacts, booking count/
LTV once prices exist, GDPR tools (export, anonymize/delete), notes. 🟡 merge guest→account.
⚪ corporate accounts with invoicing (a documented V1 target — currently no mock!).

**Reviews (OpsReviews)** — 🔴 publish toggle/drag/delete only hit localStorage: real rows
(same table home reads), moderation states, photo upload. 🟡 import path for existing
Google/TrustPilot reviews (source field exists in mock). ⚪ reply-to-review.

**Content (OpsContent)** — 🔴 it's a link directory, not an editor: actual string editing
(`content_strings` en/de/fr/ar) with preview + publish, FAQ manager, legal-doc version
upload. 🟡 photography/asset manager once real photos land.

**Settings (OpsSettings)** — 🔴 saves locally: company contacts, booking rules (min advance,
waiting minutes, cancel window — the `data-tok` sources), service area, email sender
identities, holiday/ski-season toggles. 🔴 these values must FEED the site copy + quote
engine (one source of truth). 🟡 staff management UI (invite, role, deactivate, reset MFA).

**Profile (OpsProfile)** — 🔴 local only: real staff profile, password + MFA management,
sign-out-everywhere. ⚪ per-user notification prefs.

**Missing ops screens (no mock exists yet)**
- 🔴 **New booking (manual/phone)** — dispatchers take phone bookings today.
- 🟡 Partner applications review (pairs with become-a-partner form).
- 🟡 Refund/finance report (payouts, refunds, fees) even if read-only from Stripe.
- ⚪ Email template preview/test-send.

---

## Working-together seams (home ↔ ops) — state after this cleanup

Fixed in the mocks now: all cross-folder links resolve (`home/ ↔ pages/ ↔ ops/`), checkout
handoff path corrected, cookie banner now on home, ops "Open site"/"View on site" links land
on the real home file. Still mock-level by nature: reviews, content, pricing and settings
sync between ops and home only via localStorage in the same browser — the production seam is
the shared database (GSD Phases 2–6).
