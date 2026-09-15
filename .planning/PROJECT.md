# Vamos Taxi V1

## What This Is

A Swiss pre-booked airport-transfer platform, Zurich first — customers book a ride ahead of
time, get a fixed price, pay online, and a driver is waiting at the agreed pickup. It
replaces the current Freshpage CMS site with a Next.js application on Cloudflare Workers,
plus a signed-in ops console where dispatchers run the day. It is explicitly **not**
on-demand ride-hailing: no live GPS, no nearest-driver matching, no "arriving in 3 minutes".

The design phase is finished. Every screen already exists as a working `.dc.html` mock, the
brand system is vendored, and the build plan is written. This project is the production
build of that package — not a redesign of it.

## Current Milestone: v1.1 Ops Support

**Goal:** Dispatcher answers contact mail from Ops. Customer replies land in the same ticket.

**Target features:**
- Ops `#support` tab (Staff tab stays gone)
- Tickets from `/contact` rows; statuses New / Open / Replied / Closed
- Reply from the ticket via Resend
- Inbound customer replies via Resend webhook, same ticket
- Gmail `info@vamostaxi.site` still gets a copy
- Staging DNS only (`vamostaxi.site`)

**Frozen (v1.0):** quote → pay → booking → ops board (Phases 7–11). Not deleted.

## Core Value

A customer can book a fixed-price transfer in under a minute and trust that the driver will
be there. If nothing else works, the booking funnel — quote, pay, confirmation — must.
v1.1 is a freeze of that funnel to ship the Support inbox.

## Business Context

- **Customer**: travellers and corporate clients transferring to and from Zurich airport, plus alpine and cross-border routes
- **Revenue model**: direct fares, single merchant, Stripe standard (no marketplace, no Connect)
- **Success metric**: paid bookings completed through the site rather than by phone
- **Strategy notes**: `docs/brief/PROJECT-BRIEF.md`, `docs/brief/SCOPE-OF-WORK.md`

## Requirements

### Validated

Shipped in the design phase and relied on by everything downstream.

- ✓ Bound Vamos design system — tokens, fonts, icons, components, the four platform laws — design phase
- ✓ 30+ screens as working `.dc.html` mocks, reviewed at 1440/1024/768/390 in four languages — design phase
- ✓ `VamosLocale` — one language + currency store, in-place relabelling, RTL, `money()` — design phase
- ✓ `vamos-i18n-dict.js` — the en/de/fr/ar string dictionary plus regex patterns — design phase
- ✓ `VamosOps` — the ops data contract the database must mirror — design phase
- ✓ Vendored Lenis scroll with house settings, one instance per page — design phase
- ✓ Build plan (`docs/build/GSD-LAUNCH.md`), gap audit (`MISSING-FEATURES.md`), 23 per-screen specs — design phase
- ✓ Codebase map in `.planning/codebase/` — 2026-08-17
- ✓ `/pricing` is the only fare book — Save = draft, Publish = public, live-book classes only — Phase 18
- ✓ Distance fare is start + (all km × per-km) + bands; no region %; quote lock 24h; extra wait not in Stripe pay-now — Phase 18

### Active

Everything here is a hypothesis until it ships and takes a real booking.

**Foundation**
- [ ] Next.js 15 App Router on Cloudflare Workers via `@opennextjs/cloudflare`, CI green, staging domain serving SSR
- [ ] Design system ported to React components keeping the same class names, so the CSS carries over verbatim
- [ ] Supabase schema mirroring the `VamosOps` shapes, RLS on every table, staff MFA
- [ ] Hyperdrive data access from the Worker, p50 query under 30 ms

**Booking funnel — the core value**
- [ ] Customer gets a real server-priced quote from the home widget (fixed-route override, per-km, surcharges, coupons)
- ✓ Quote locks for **24 hours** (Phase 18 D-13; was 30 minutes) and survives into checkout
- [ ] Customer pays by card, Apple Pay, Google Pay or TWINT and receives a confirmation with a manage link and calendar invite
- [ ] Flight number autofills the landing time, and a delayed arrival shifts the pickup and notifies both sides
- [ ] Customer cancels self-serve inside the policy tiers and is refunded automatically
- [ ] Guest checkout works, and the booking can be claimed into an account later

**Surfaces**
- [ ] Every public mock is a route, pixel-faithful, on real data, in all four languages at all four widths
- [ ] Ops console runs the day: live board, booking detail, assignment, manual phone booking
- [ ] Legal pages ship with real numbers where the owner has supplied them and labelled TBC pills where not

**v1.1 Ops Support (active now)**
- [ ] Dispatcher opens `#support` and sees contact tickets from `contact_submissions`
- [ ] Dispatcher sets status New / Open / Replied / Closed
- [ ] Dispatcher replies from the ticket; Resend delivers to the customer
- [ ] Customer Reply-in-Gmail is captured inbound and appended to the same ticket
- [ ] Support Gmail still receives a copy; Ops is the working inbox

**Launch**
- [ ] Site holds 10k concurrent browsers with the database barely touched
- [ ] DNS cut over from the Freshpage CMS with a 301 map, `pricing_live=true`, old site parked

### Out of Scope

- Native apps, customer or driver — responsive web only for V1
- Driver app or driver dashboard — drivers are admin records; assignment is manual in ops
- Live GPS tracking and automatic nearest-driver dispatch — the product is scheduled, not on-demand
- Stripe Connect, driver wallets, automated payouts — one merchant, not a marketplace
- Surge pricing, affiliate and hotel partner portals, global multi-country supply
- **PayPal** — Stripe has no Swiss-merchant PayPal support, so it would mean a second processor, webhook and refund path for one method. Revisit post-launch
- **Book by the hour** — owner decision 15; the widget tab is removed for V1
- **Hardcoded Economy / Business / First / Van public ladder** — Phase 18; public offers follow the live book. Admin may add any class name.
- **A third-party chat widget or an in-house chat build** — live chat ships as a WhatsApp deep link; a vendor widget injects its own styling and cookies. v1.1 is email tickets, not live chat
- **Gmail IMAP ingest** — tickets are contact-form rows + Resend inbound webhooks, not a mailbox scrape
- **Phone-typed tickets / auto-tags** — out of v1.1; statuses only
- **Live `vamostaxi.eu` DNS** — still Phase 11; inbound MX is staging `vamostaxi.site` only
- **Live flight tracking on the ops board** — flight data ships at autofill + delay-aware depth only
- Vercel, anywhere, for anything — hosting or preview deploys
- Medusa or any commerce framework — its product/cart/order model adds infrastructure and still needs custom booking, pricing and dispatch

## Context

**The mocks are the spec and they are final.** They were reviewed screen by screen at four
widths in four languages. Layout, spacing, colour and copy do not change while porting; a
visual change requires a design decision, not a developer preference. `CLAUDE.md` holds the
product rules and wins any conflict with implementation instinct.

**The repo already holds everything except the app.** `app/` has the mocks, `design-system/`
the bound brand system, `assets/` what the pages load, `docs/build/` the plan and 23 specs,
`docs/brief/` the planning material. There is no `package.json` and no `apps/web` yet — that
is correct for this point. `archive/` holds two frozen pre-reorganisation snapshots and is
never read, edited or ported from.

**Two source documents are stale and superseded.** `docs/brief/PROJECT-BRIEF.md` and
`DECISIONS.md` #14 name Vercel, shadcn/ui and EN+DE-first. All three are overridden by
`docs/build/GSD-LAUNCH.md` (Cloudflare, no Vercel), the bound design system (not shadcn) and
`CLAUDE.md` (four languages, no exceptions, same pass).

**The owner answered the content review on 13 Aug 2026** — see `docs/build/OWNER-ANSWERS.md`.
It settled carrier status, the cancellation tiers, the vehicle lineup, flight tracking and
hourly mode. It left every photography item and nearly every legal number blank; those keep
their `data-tok` TBC pills, of which there are 173 in the mocks.

**Five owner blockers remain**, and the build works around them rather than waiting: the CHF
price matrix (owner expects it within days), the remaining policy numbers, vehicle and
destination photography, payment and social brand marks, and the Qurova webfont licence.
Until the matrix lands the pricing engine runs on a staging matrix behind `pricing_live=false`
and every amount on screen reads `CHF 000`.

**Known trouble** is catalogued in `.planning/codebase/CONCERNS.md` with file paths.

## Constraints

- **Tech stack**: Next.js 15 App Router + TypeScript on Cloudflare Workers via `@opennextjs/cloudflare`; Supabase (Postgres, Auth, Storage, Realtime) behind Hyperdrive; Stripe standard; Resend; Mapbox; AeroDataBox; Cloudflare Queues, KV, R2, Turnstile, WAF — fixed by `HANDOFF-CLAUDE-CODE.md` §3, no Vercel anywhere
- **Design**: the bound Vamos design system is the only source of visual truth — never invent a colour, font, radius or shadow; compose from its components rather than restyling raw HTML
- **Four platform laws**: no glow, no tinted yellow or brownish surfaces, `CHF 000` until the matrix lands with `data-tok` gaps as labelled TBC pills, four languages in the same pass — a change that breaks one of these is wrong even if it looks fine
- **Localisation**: English, German, French and Arabic ship together, always. Arabic is first-class RTL — lay out with logical properties. Swiss German, "ss" not "ß"
- **Responsive**: every surface built desktop → tablet → mobile in the same pass, checked at 1440/1024/768/390. Nothing scrolls sideways at 390 px. Touch targets ≥ 44 px, 54 px for booking fields and primary CTAs
- **Timeline**: public site live in 2–3 weeks, ops console deepening after go-live. `GSD-LAUNCH.md` sizes the full Phases 0–9 at ~4 weeks, so the roadmap front-loads the booking funnel and ships ops at "enough to run the day"
- **Team**: solo, owner-built with AI assistance
- **Data residency**: Supabase pinned to eu-central (Frankfurt), closest to Zurich. Workers execute at the edge — whether booking routes need pinning near Frankfurt is still open with counsel — amended 2026-08-23 (D-37): the hosted project `yaumjzvylngfjhtuffqs` was created in Central Europe (Zurich), not Frankfurt.
- **Security**: RLS on every customer or operational table, server-authoritative quotes, Stripe webhook signature verification, idempotent payment and booking creation, TOTP MFA for staff, no secrets in the repo, audit trail on booking/price/payment/assignment changes
- **Legal**: Swiss nFADP and GDPR — consent logged server-side, not cookie-only, because a browser cookie cannot prove consent to a regulator

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Cloudflare Workers via OpenNext, no Vercel | Fixed in `HANDOFF-CLAUDE-CODE.md` §3; supersedes `DECISIONS.md` #14 | — Pending |
| Bound design system, not shadcn/ui | The mocks are the spec and are built on it; shadcn would mean restyling to match | — Pending |
| Four languages in the same pass, not EN+DE first | `CLAUDE.md` product rule; retrofitting Arabic RTL later is more expensive than building it in | — Pending |
| Ops console is a route group in the same app | One deploy, role-gated, shared session — not a second application | — Pending |
| Vamos is the carrier, not an intermediary | Owner decision 1; rewrites terms 01/05/13 and voids the archive's liability disclaimer | — Pending |
| Cancellation tiers 100 % / 75 % / 0 % | Owner decision 2, resolving a live contradiction between the FAQ and the archive policy | — Pending |
| Three vehicle classes, van 8/8 | Owner decision 13; `first` cut, and the mock's 7/8 was stale | ⚠ Superseded Phase 18 — any class name from the live book |
| Live book is `/pricing` Publish | Restart 2026-09-14 D-01…D-35; no hardcoded public ladder | ✓ Phase 18 |
| Quote lock 24h hardcoded | D-13; unpaid expire then requote; paid keep snapshot | ✓ Phase 18 |
| Extra wait not in Stripe pay-now | D-23; ops marks arrival; no silent debit | ✓ Phase 18 |
| Distance = start + all-km × per-km + bands | D-15; no region %; overlap blocks Publish | ✓ Phase 18 |
| PayPal out of V1 | Stripe has no Swiss-merchant PayPal support; a second processor for one method is not worth 2–3 days against the deadline | — Pending |
|| Live chat is a WhatsApp deep link | Owner wants chat, but no chat exists in any mock; a vendor widget fights the design system and the cookie banner, an in-house build costs 3–5 days | — Pending |
|| v1.1 two-way Support tickets via Resend | Owner 2026-09-04: Ops `#support`, reply from ticket, inbound replies; Gmail stays a copy. Funnel frozen. | — Pending |
| Self-serve cancel stays, human channels are additive | The button honours the tiers and refunds automatically, which keeps refunds off the owner's response time | — Pending |
| Flight data at autofill + delay-aware depth | Owner put tracking in V1; full live tracking is the expensive tail with the least launch value | — Pending |
| Consent logged server-side | A browser-only cookie cannot prove consent under nFADP/GDPR; adds a `consent_log` table | — Pending |
| Error monitoring always-on, toggle in `settings` | Owner decision 10, recorded with the caveat that Sentry sends IP and URL data and is commonly treated as consent-requiring | ⚠️ Revisit |
| Synthetic staging price matrix behind `pricing_live=false` | Lets the engine, checkout and refunds be tested end-to-end before real numbers exist; the UI stays `CHF 000` so nothing leaks | — Pending |
| Ops manual-booking screen gets mocked first | Same pipeline as every other screen — keeps a design decision out of an implementation PR | — Pending |
| Language is a route segment, currency is client state | The `VamosLocale` DOM-walking runtime cannot render correct language server-side; see `.planning/ADR-001-i18n-ssr.md`. The mandated contract survives behind a shim | — Pending |
| No account is created speculatively | Phase 1 creates each external service when it first needs it; a duplicate is caught by the sign-up flow itself rather than by inspection | — Pending |
| `apps/web` lands in `Loomlyne/VamosTaxi.eu` | Rather than a separate `vamos-platform` repo; the app sits next to the mocks it is ported from | — Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-09-15 after Phase 18 (OPS Pricing source of truth)*
