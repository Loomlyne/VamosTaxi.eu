# Feature Research

**Domain:** Pre-booked, fixed-price airport-transfer booking platform (Zurich first) + dispatch/ops console
**Researched:** 2026-08-17
**Confidence:** MEDIUM-HIGH — internal scope claims are HIGH (sourced from PROJECT.md / MISSING-FEATURES.md /
OWNER-ANSWERS.md, which are authoritative for this codebase); competitor-pattern claims are MEDIUM
(cross-checked web search across Blacklane, Transfeero, Suntransfers, Welcome Pickups, GetTransfer — not
Context7-grade primary docs, but the pattern is consistent across all five, which is the strongest signal
this category gives without paying for their booking flows directly).

## How this file was built

This is **not** a green-field feature survey — 30+ screens already exist as `.dc.html` mocks and
`docs/build/MISSING-FEATURES.md` already contains a screen-by-screen gap audit. This file:

1. Confirms which parts of that existing scope match what pre-booked-transfer competitors treat as
   table stakes (so nothing gets cut by mistake in requirements/roadmap work).
2. Flags the handful of category-standard features that are **not** visible anywhere in PROJECT.md,
   MISSING-FEATURES.md, or OWNER-ANSWERS.md — see **Gaps vs Existing Scope** below. This list is
   deliberately short; anything already tracked in MISSING-FEATURES.md (even as 🔴/🟡/⚪) is treated as
   "already known," not a new gap.
3. Names the anti-features this category specifically tempts a builder into, given how much of this
   product's DNA (quote → book → assign → ride) looks like ride-hailing but explicitly isn't.

## Feature Landscape

### Table Stakes (Users Expect These)

| Feature | Why Expected | Complexity | Notes / Existing Scope |
|---------|--------------|------------|-------------------------|
| Fixed price shown before payment | The entire category's value prop over a street taxi or metered ride-hail; every competitor researched (Blacklane, Transfeero, Suntransfers) leads with "fixed price, no surprises" | MEDIUM | Already core value in PROJECT.md; pricing engine + 30-min quote lock in Active scope |
| Vehicle-class selection at quote time (capacity shown) | Traveler needs to know a van fits luggage/pax before paying | LOW | Three classes locked by owner decision 13 (Economy 3/3, Business, Van 8/8); pax/luggage counters exist in mock |
| Flight-number capture + autofill of landing time | Removes manual guesswork on pickup time for arrivals | MEDIUM | In Active scope (`SPEC-home-flight-autofill`); AeroDataBox is the named integration |
| Delay-aware pickup (flight tracked, pickup shifts, both sides notified) | The #1 reason travelers pay for this over a self-driven or metered option — a late flight doesn't strand them | MEDIUM-HIGH | Owner decision 14 scoped this to "autofill + delay-aware," explicitly **not** full live ops-board tracking — matches what Transfeero/Suntransfers actually ship (delay-adjusted pickup, not a live map) |
| Free waiting time at pickup, with a stated cutoff before it's billed or becomes a no-show | Every competitor researched publishes this number (Blacklane: 60 min airport, billed/no-show after) — travelers expect delays inside a stated window to be free | LOW (once numbers exist) | Numbers are `data-tok` TBC pills (owner left waiting-time minutes blank) — mechanism/copy exists, values pending. Not a scope gap, a content gap already tracked |
| Meet-and-greet at the airport (driver waits airside/in arrivals with a name board) | Distinguishes a booked transfer from a taxi-rank pickup; it's the physical proof of "fixed price, driver waiting" | LOW-MEDIUM (mostly ops/comms, not UI) | FAQ topic already scoped ("which airports offer meet-and-greet" is an owner blank, not a missing feature); driver name/plate/phone-arrives-before-pickup is a tracked shared `data-tok` |
| Free cancellation window with a clear, tiered refund policy | Prevents the #1 support-load driver in this category — "can I get my money back" | MEDIUM | Owner decision 2 locks tiers (100% >24h / 75% <24h / 0% no-show); refund automation is in Active scope |
| Self-serve cancel/manage without calling support | Reduces support load to a small operator that can't staff a 24/7 phone line | MEDIUM | `manage-booking.dc.html` with ref+email lookup and a tokened deep link from confirmation emails — in scope |
| Guest checkout (no forced account creation) | Airport transfers are often one-off/infrequent purchases; forcing signup is proven to cost conversions in this category | LOW-MEDIUM | Explicit in Active scope, with claim-into-account as a secondary path |
| Manage-booking-by-token (tokened link, not password) | Lets a guest who never created a password still manage or cancel from the confirmation email | MEDIUM | Explicit in MISSING-FEATURES (`manage-booking.dc.html`) — link expiry is an owner-blank `data-tok`, mechanism is scoped |
| Coupons/promo codes | Table stakes for direct-booking conversion (vs. OTA/marketplace channels); every mid-market transfer site has one | LOW-MEDIUM | `OpsCoupons` + checkout coupon field with server-side validation shared between the two — in scope |
| Card + local wallet payment (cards, Apple Pay, Google Pay, TWINT) | TWINT specifically is near-table-stakes for a Swiss consumer product; Apple/Google Pay reduce checkout friction on mobile, which is most of this traffic | MEDIUM-HIGH | Stripe Payment Element, 3DS, idempotent booking creation — in Active scope. PayPal correctly dropped (no Swiss-merchant PayPal support via Stripe) |
| Booking confirmation with receipt, reference, and calendar invite | Baseline trust/proof-of-purchase; ICS lets a traveler drop pickup time straight into their itinerary | LOW-MEDIUM | Confirmed in scope (confirmation.dc.html gaps, ICS export listed) |
| Manual/phone booking entry for dispatch | A small operator still takes phone bookings — every dispatch console in this category needs an "enter this as if the customer booked online" path | MEDIUM | Correctly flagged 🔴 in MISSING-FEATURES ("no mock exists for this at all") **and** explicitly named in PROJECT.md Active scope under Surfaces; Key Decisions notes it gets mocked before being built. Already tracked — no new gap, but it is the single highest-risk missing screen for day-one ops |
| Chauffeur/vehicle assignment with conflict/double-booking check | The core dispatcher action — matching a booking to a specific driver+car without accidentally double-booking either | MEDIUM-HIGH | `OpsBoard` assignment action — in scope |
| Live/near-live bookings board with status + filters | What a dispatcher stares at all day: today's pickups, who's unassigned, what needs attention | MEDIUM | `OpsBoard`/`OpsDash` — in scope, Realtime-backed |
| No-show handling with a fee | Mirrors the customer-side no-show tier (0% refund); ops needs the matching workflow (mark no-show, apply fee, notify) | LOW-MEDIUM | Flagged 🟡 in `OpsDetail` — in scope |
| Fleet management (vehicles + chauffeurs) with document-expiry alerts | Swiss transfer licensing means license/insurance expiry tracking isn't optional — a lapsed document is a legal exposure, not a UX nicety | MEDIUM | `OpsFleet` — in scope |
| Versioned, publishable pricing table | The money table; a dispatcher/owner needs to change fixed-route/per-km rates without a code deploy, with an audit trail of who changed what | MEDIUM-HIGH | `OpsPricing` — in scope, correctly called out as needing draft→publish versioning, not direct-edit |
| Multi-language (customer-facing) | Zurich airport traffic is majority non-German-speaking; this is closer to "the site doesn't work" than a nicety if missing | HIGH | Already the strictest constraint in this codebase — EN/DE/FR/AR, same pass, RTL for Arabic |
| Price display consistent with the merchant's actual charge currency (CHF) | A traveler must never be surprised by what they're actually charged | LOW | `VamosLocale.money()` — validated in design phase. Note: per `CLAUDE.md`, the currency switch changes display formatting/mark, not the underlying number — i.e. this is **not** live FX-converted pricing (see Differentiators note below) |

### Differentiators (Competitive Advantage for a Small Swiss Operator)

| Feature | Value Proposition | Complexity | Notes |
|---------|--------------------|------------|-------|
| Vamos is the carrier, not a broker/marketplace | GetTransfer is explicitly a reverse-auction marketplace (customer names a price, competing local operators bid); Transfeero/Suntransfers are aggregators reselling third-party operators. Being the actual carrier — one known fleet, one liable company — is a trust signal a marketplace structurally can't offer, and it's already owner decision 1 | LOW (it's a positioning/legal fact, not a build) | Rewrites Terms 01/05/13; the archive's intermediary-style liability disclaimer must not be carried forward |
| Alpine, ski-season, and cross-border routes as named coverage | Global aggregators default to airport↔city-center; a Zurich-based operator with real alpine-route knowledge (Verbier, St. Moritz, cross-border to French/German/Italian regions) is a defensible niche a global marketplace won't optimize for | LOW-MEDIUM | About page has an explicit blank for "full coverage list — cities, resorts, cross-border routes, and which are seasonal" — this is where the differentiator gets written down, and it's currently unfilled |
| WhatsApp-based human contact instead of a bot/widget | Cheap to build (a deep link, not chat infra), and for a small operator with real people answering, WhatsApp *is* the differentiator — travelers get a human, not a queue | LOW | Already decided (owner decision 11); explicitly chosen over a vendor widget or in-house chat build |
| Real driver/founder photography (name board at the curb, founder portrait) vs. stock/marketplace anonymity | A single-operator brand can credibly show "this is who picks you up," which a marketplace of contracted operators cannot | LOW (content, not code) | Currently every photography item is blank — this differentiator is unrealized until photos land |
| Simple three-class lineup (Economy/Business/Van) | Deliberately smaller than GetTransfer's sprawling vehicle-type list; less choice paralysis, faster decision, matches a small owned fleet rather than pretending to have inventory it doesn't | LOW | Already the shape of the product (owner decision 13 cut the fourth class) |
| Corporate/invoice billing done simply | If built minimally (a "bill my company" flag + manual ops invoicing, not a full B2B portal), this converts repeat business-travel accounts that competitors handle with heavier enterprise tooling — a lighter self-serve version can undercut Blacklane Business's onboarding friction | MEDIUM | Not yet in Active scope — see **Gaps** below; this is a genuine build/defer decision, not a confirmed feature |

**Currency note:** true FX-converted price display (showing a non-CHF traveler an EUR/USD *equivalent*
alongside the CHF charge, the way Blacklane/Suntransfers do for a global audience) is not what
`VamosLocale` does per `CLAUDE.md` ("the currency switch changes the mark, never the number"). For a
Zurich-first, CHF-settling operator this is an acceptable and correct scope call — the alternative (real
FX conversion) is a differentiator worth revisiting only if/when the customer base skews heavily
non-CHF-card, not a launch requirement.

### Anti-Features (This Category Specifically Tempts Builders Into)

The booking→pay→assign→ride shape of this product looks enough like ride-hailing that every one of these
gets suggested at some point. PROJECT.md has already correctly excluded most of them — listed here so the
*reasoning* survives into requirements/roadmap, not just the exclusion.

| Anti-Feature | Why It Gets Requested | Why It's Wrong Here | Correct Alternative (already scoped) |
|---------------|------------------------|----------------------|----------------------------------------|
| Live GPS driver tracking / "arriving in 3 minutes" | Every rideshare app trains users to expect it; feels like an obvious add | This product sells a *fixed, pre-arranged* pickup — a live map implies on-demand dispatch and invites the wrong customer expectation (that they can watch a car approach, that timing is negotiable). It's also expensive infra (driver app, location streaming) for a product with no driver app | Flight-tracked, delay-aware pickup + driver name/plate/phone shared ahead of time. Already correctly out of scope |
| Nearest-driver / automatic dynamic dispatch | Looks like "smarter" assignment than a human dispatcher clicking a dropdown | There's no fleet size where automatic matching beats a single dispatcher's judgment for a scheduled, low-volume operation, and it requires real-time driver location data this product deliberately doesn't collect | Manual assignment with a conflict check in `OpsBoard` — already scoped |
| Surge/dynamic pricing | "Other platforms do it to manage demand" | Fixed price *is* the product's core value proposition (Core Value in PROJECT.md); any dynamic element breaks the trust the whole funnel is built on | Versioned but *stable* published pricing table, changed deliberately by a human, not an algorithm |
| Reverse-auction / marketplace bidding (the GetTransfer model — customer names a price, operators compete) | It's a real, working model in this exact category, so it's an easy "but competitor X does this" argument | Vamos owns one fleet and is the carrier (owner decision 1) — there's no pool of competing operators to bid, and building auction infrastructure for a single-supplier business is pure waste | Transparent fixed quote from the one fleet that exists |
| Driver-facing mobile app / driver dashboard | Feels incomplete without one once assignment exists | Explicitly out of scope — drivers are admin records; a driver app is a second product with its own auth, offline handling, and app-store overhead for a V1 with a handful of drivers | Ops assigns manually; driver gets a notification (SMS/email), not an app |
| Global/multi-country supply expansion features | Transfeero/Suntransfers/GetTransfer are all global — easy to over-build for "someday" scale | Explicitly out of scope; Zurich-first with named routes is the entire differentiator (see above) — building multi-country supply tooling now is speculative infrastructure with no near-term user | Named coverage list (cities/resorts/cross-border), not a country-selector architecture |
| Third-party or in-house live chat widget | "Every SaaS site has a chat bubble" | Already evaluated and rejected — a vendor widget fights the design system and cookie-consent model; an in-house build is 3–5 days against a 2–3 week deadline for a feature no mock ever specified | WhatsApp deep link — already decided |
| Book-by-the-hour / hourly charter mode | Present in the current mock as a dead tab, and hourly charter is a real product in this category (chauffeur services often offer it) | Explicitly cut by owner decision 15 — it's a different pricing/booking model (time-based, not route-based) that would fork the entire quote engine for a feature with no current demand signal | Point-to-point transfers only for V1 |
| Loyalty/rewards points | Looks like a retention lever | Airport transfers are low-frequency purchases per customer (a few times a year at most); a points program is infrastructure cost chasing a repeat-purchase frequency this product doesn't have | Quality of service + WhatsApp support drives repeat/referral, not gamification |
| A full self-service B2B corporate portal (SSO, department budgets, API booking) | "Corporate clients" is named in PROJECT.md's Business Context, and enterprise transfer platforms (Blacklane Business) do build this | Heavy for a solo-owner-built V1 with no confirmed corporate demand yet — building the enterprise version before the simple version ships is the classic scope trap | If corporate billing ships at all for V1, it should be the minimal version noted in Differentiators — a billing flag + manual ops invoicing, not a portal |

## Feature Dependencies

```
Server-priced quote (address/route → price)
    └──requires──> Pricing engine (fixed-route override, per-km, surcharges) [OpsPricing feeds this]
    └──requires──> Vehicle-class capacity data (pax/luggage limits per class)

Checkout / payment
    └──requires──> Quote lock (30 min) surviving into checkout
    └──requires──> Guest OR signed-in identity (both must resolve to a bookable customer record)

Flight-delay-aware pickup
    └──requires──> Flight-number autofill (AeroDataBox lookup)
    └──enhances──> Meet-and-greet reliability (driver knows to wait longer without customer calling)

Self-serve cancel/refund
    └──requires──> Cancellation policy tiers (owner decision 2, numbers still partially TBC)
    └──requires──> Stripe refund capability wired to booking status

Manage-booking-by-token
    └──requires──> Confirmation email delivery (Resend) carrying the tokened link
    └──enhances──> Guest checkout (guests have no other way back into their booking)

Ops assignment (chauffeur + vehicle)
    └──requires──> Fleet data (OpsFleet: active vehicles/chauffeurs, license/insurance status)
    └──requires──> Conflict check (no double-booking same driver/vehicle)
    └──triggers──> Driver + customer notification (name/plate/phone reaches customer before pickup)

Manual/phone booking (ops)
    └──requires──> Same pricing engine as the public quote (single source of truth, not a second price path)
    └──conflicts with──> Any design that lets ops bypass server-side pricing (must not hand-type a price)

No-show handling
    └──requires──> Cancellation tier logic (0% refund tier) shared between customer-facing policy and ops action

Corporate/invoice billing (if built)
    └──requires──> A billing-type flag on checkout ("pay by invoice" decision, currently open)
    └──requires──> Ops-side invoice generation/tracking (currently no mock — see Gaps)
    └──conflicts with──> Guest checkout's "pay now" assumption — needs its own approval/terms step
```

## Gaps vs Existing Scope

Checked against `docs/build/MISSING-FEATURES.md` first — everything below is either genuinely absent
from all three source documents, or present in a form that leaves it unresolved rather than tracked.

1. **Corporate/invoice billing has no committed scope, despite being a named customer segment.**
   PROJECT.md's Business Context explicitly lists "corporate clients" alongside travellers, but Active
   scope (booking funnel, surfaces) never mentions invoicing or corporate billing, and it's absent from
   Out of Scope too — it's in limbo. MISSING-FEATURES.md itself flags this ambiguity twice: checkout's
   "corporate 'pay by invoice' decision" is marked 🟡 undecided, and OpsCustomers' "corporate accounts
   with invoicing" is marked ⚪ with the note "a documented V1 target — currently no mock!" **This is not
   a new discovery — MISSING-FEATURES already surfaces it as unresolved — but it needs an explicit
   roadmap decision (build a minimal version, or formally move it to Out of Scope) rather than staying
   an open question into execution.**

2. **No post-trip review-solicitation flow is visible anywhere.** The cross-cutting email/SMS gap list
   in MISSING-FEATURES.md names confirmation, reminder, driver-assignment, and password-reset as the
   missing transactional message types — it does not include a "how was your ride, please leave a
   review" trigger. Separately, `OpsReviews` is scoped only to *publishing/moderating* reviews (with an
   open question about importing from Google/Trustpilot), not to *soliciting* new ones from customers
   who actually completed a ride. In this category, in-house review collection is how a small operator
   builds a review base a global aggregator can't route around. Worth a deliberate decision at
   requirements time: rely entirely on imported third-party reviews, or add a lightweight post-trip
   review-request email.

3. **No visible field for airport-transfer add-ons (child seat, extra stop, oversized luggage) in the
   booking flow, despite fee policy for them existing in scope.** OWNER-ANSWERS.md's Terms & conditions
   blanks include "extra-stop fee," "free minutes for a city stop," "fee beyond that," and "oversized-item
   fee" — implying the operation intends to support these — but MISSING-FEATURES.md's home booking-widget
   gap list (address fields, flight autofill, pax/luggage counters) never mentions a UI mechanism to
   *request* an extra stop or flag oversized luggage, and checkout's gap list ("passenger form
   validation") doesn't mention a special-requests field either. This may already be covered in one of
   the 23 per-screen SPEC files this pass didn't read in full — flagged for confirmation rather than
   asserted as a confirmed gap, but worth a direct check before requirements lock, since child-seat/extra
   stop requests are a routine table-stakes ask in this category (Suntransfers lists child seats as a
   standard feature).

No other gaps found. Everything else in the question's focus list (quote/vehicle-class selection,
flight-number handling, meet-and-greet, waiting-time rules, cancellation/refund tiering, guest checkout,
manage-by-token, coupons, multi-currency display, day-to-day dispatcher needs) is already tracked in
MISSING-FEATURES.md at the correct priority, even where the underlying numbers or copy are still owner
`data-tok` blanks.

## MVP Definition

### Launch With (v1) — matches PROJECT.md's Active scope

- [x] Server-priced quote with fixed-route/per-km/surcharge/coupon logic and a 30-min lock — core value
- [x] Three-class vehicle selection with real capacity data
- [x] Flight-number autofill + delay-aware pickup shift with both-sides notification
- [x] Card/Apple Pay/Google Pay/TWINT checkout via Stripe, guest or signed-in
- [x] Self-serve cancel inside tiered policy with automatic refund
- [x] Manage-booking-by-token from the confirmation email
- [x] Ops live board, booking detail, manual assignment, manual/phone booking entry
- [x] Fleet management with document-expiry visibility
- [x] Versioned, publishable pricing table
- [x] Four-language, four-width coverage on every public surface

### Add After Validation (v1.x)

- [ ] Minimal corporate/invoice billing (billing flag + manual ops invoicing) — trigger: confirmed
      inbound demand from named corporate clients, or explicit owner decision to build it for launch
- [ ] Post-trip review-request email — trigger: once transactional email infra (Resend) is live for
      confirmation/reminder, this is a small marginal addition, not a new subsystem
- [ ] Booking add-ons (child seat, extra stop, oversized luggage) as an explicit UI field — trigger:
      once confirmed absent from the per-screen SPECs; otherwise this is already in v1

### Future Consideration (v2+)

- [ ] True FX-converted price display for non-CHF travelers — defer until customer base data shows it's
      needed; card-network FX already solves the actual charge-currency problem
- [ ] Import path for third-party reviews (Google/Trustpilot) — defer until the review volume from the
      product itself is thin enough to need supplementing
- [ ] Per-chauffeur working-hours/absence tracking feeding assignment conflicts — defer until fleet size
      makes manual coordination error-prone

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|----------------------|----------|
| Server-priced quote + lock | HIGH | HIGH | P1 |
| Flight autofill + delay-aware pickup | HIGH | MEDIUM | P1 |
| Stripe checkout (card/Apple/Google/TWINT) | HIGH | HIGH | P1 |
| Self-serve cancel + auto refund | HIGH | MEDIUM | P1 |
| Manage-booking-by-token | HIGH | MEDIUM | P1 |
| Ops manual/phone booking entry | HIGH | MEDIUM | P1 |
| Ops assignment with conflict check | HIGH | MEDIUM-HIGH | P1 |
| Versioned pricing table | HIGH (ops) | MEDIUM-HIGH | P1 |
| Coupons | MEDIUM | LOW-MEDIUM | P2 |
| Corporate/invoice billing (minimal) | MEDIUM (segment-specific) | MEDIUM | P2 |
| Post-trip review request | MEDIUM | LOW | P2 |
| Booking add-ons (child seat/extra stop) | MEDIUM | LOW-MEDIUM | P2 |
| Live GPS tracking | LOW (wrong for this product) | HIGH | P3 — do not build |
| Reverse-auction marketplace pricing | LOW (wrong for this product) | HIGH | P3 — do not build |
| True FX-converted display | LOW-MEDIUM | MEDIUM | P3 |

## Competitor Feature Analysis

| Feature | Blacklane | Transfeero / Suntransfers | Vamos Approach |
|---------|-----------|------------------------------|-----------------|
| Pricing model | Fixed price, owned + partner fleet | Fixed price, aggregator of local operators | Fixed price, **single owned fleet** — closer to Blacklane's model than the aggregators' |
| Free waiting time | 60 min at airports/stations, billed/no-show after | 60 min free wait on delayed flights (Transfeero) | Same shape, numbers still owner TBC |
| Flight tracking | Automatic, adjusts driver arrival | Automatic, adjusts for delay/cancellation | Same shape, explicitly scoped to autofill + delay-adjust, not live ops-board tracking |
| Cancellation | Free up to 60 min before pickup, then full charge | Free cancellation advertised, terms vary by operator | Free >24h / 75% <24h / 0% no-show — a stricter, clearer tiered structure than Blacklane's single cutoff |
| Supply model | Company-branded, partner-network + owned | Marketplace of independent local operators | Single carrier, owner-operated — closest to Blacklane, opposite of Transfeero/Suntransfers/GetTransfer |
| Booking channel for phone-in customers | Concierge/corporate booking desk | N/A (self-serve web only in most markets) | Ops manual/phone booking screen (small-operator equivalent of a booking desk) |

## Sources

- `.planning/PROJECT.md` — HIGH confidence, authoritative project scope
- `docs/build/MISSING-FEATURES.md` — HIGH confidence, authoritative existing gap audit
- `docs/build/OWNER-ANSWERS.md` — HIGH confidence, authoritative owner decisions and open blanks
- [Blacklane Terms and Conditions](https://www.blacklane.com/en/terms/) — MEDIUM confidence
- [Blacklane: How should I choose the pickup time at airports?](https://help.blacklane.com/en/articles/2689440-how-should-i-choose-the-pickup-time-at-airports) — MEDIUM confidence
- [Blacklane: What is the no-show policy?](https://partner-help.blacklane.com/en/articles/8420639-what-is-the-no-show-policy) — MEDIUM confidence
- [Blacklane: How can I make changes to my booking?](https://help.blacklane.com/en/articles/2690381-how-can-i-make-changes-to-my-booking) — MEDIUM confidence
- [Transfeero — Airport Transfers Worldwide](https://www.transfeero.com/en/) — MEDIUM confidence
- [Suntransfers.com](https://www.suntransfers.com/) — MEDIUM confidence
- [GetTransfer reviews (Trustpilot)](https://www.trustpilot.com/review/gettransfer.com) — MEDIUM confidence, used only to confirm the reverse-auction/marketplace model differs structurally from the fixed-fleet model

---
*Feature research for: pre-booked airport-transfer platform, Zurich-first, single-operator carrier*
*Researched: 2026-08-17*
