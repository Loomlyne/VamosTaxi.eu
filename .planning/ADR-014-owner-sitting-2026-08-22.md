# ADR-014 — Owner sitting 2026-08-22 (schema, currency, policy, product)

**Status:** Accepted, 2026-08-22
**Phase:** binds Phase 2 migrations and Phase 4 planning. Recorded from the owner's
answers in session, not inferred.

This sitting ratifies the four GSD-LAUNCH vs Phase 2 schema conflicts, replaces
ADR-004's display/charge rule, replaces ADR-002's NULL waiting seed, and fills
the policy numbers that were TBC. The CHF **price matrix** (base fares, per-km,
fixed routes) is still not in this document — those amounts stay `CHF 000` /
`pricing_live=false` until the matrix lands.

---

## 1. Currency — Stripe conversion, not a mark swap

**Supersedes the display and charge halves of ADR-004.** The schema half of
ADR-004 **stands**: one CHF amount per rate, route and surcharge. No
per-currency price lists.

| Rule | Decision |
|---|---|
| Priced currency | **CHF** (Swiss franc). Engine, snapshots, refunds, ops board all store rappen. |
| Display currencies | **CHF, EUR, USD, AED**. Hero currency switch converts the shown amount **immediately** via Stripe FX. Checkout shows the converted amount. |
| Charge currency | The currency the customer **chose**. Stripe Checkout (or equivalent) charges in that currency. The customer may **change currency again on the Stripe Checkout page**. |
| Copy | Four languages (en/de/fr/ar). Checkout must still make the conversion obvious — estimated converted total, sourced from Stripe, not a second Vamos price list. |

**Quote lock.** The locked number is the **CHF rappen total**. FX is re-read from
Stripe when the checkout session is created so the charged amount matches current
rates. A 30-minute quote does not lock yesterday's euro rate.

**Not decided here (Phase 7):** exact Stripe Checkout vs PaymentElement wiring,
how a mid-Checkout currency change maps onto the locked CHF total, and the four
language strings. The product contract above is binding on that work.

---

## 2. Schema — GSD-LAUNCH conflicts, all A

GSD-LAUNCH's Phase 2 table list is **superseded** on these four rows. Migrations
follow the Phase 2 design.

| # | GSD-LAUNCH said | Owner chose |
|---|---|---|
| Q1 | `bookings.price_chf numeric` | **`price_snapshot_id` → insert-only `price_snapshots`** |
| Q2 | `bookings.manage_token uuid` | **`booking_access_tokens`**, SHA-256 hashed, rotatable, reusable |
| Q3 | `bookings.assigned_chauffeur_id` | **Assignment on `booking_legs`** (ADR-006) |
| Q4 | `settings` singleton | **`settings` + immutable `settings_versions`** |

### Guest booking → account (extends Q2)

A guest booking is stored against the **email**. That email becomes a customer
record (a new user, no password yet).

1. Guest completes checkout with email.
2. They receive a **booking-details email** with a manage-booking link (the
   hashed token from Q2).
3. Later they **sign up**: set a password, **or** use a magic/verify link.
4. After **email verification**, `/account/bookings` shows every booking for
   that email — including the ones made as a guest.

Do not require a password at quote time. Do not lose the guest booking if they
sign up later with the same email.

---

## 3. Mapbox (Q5)

**Email sales before signup.** Draft to send from the Mapbox account (owner
creates the account when asked; see §6):

> We store route distance, duration and pickup/dropoff coordinates permanently
> on a paid airport-transfer booking record. We need that covered by contract.

Until an Order exists: live Mapbox on every quote, no KV cache of Mapbox
responses, `GEO_CACHE` only for our polygon and hand-curated fixed-route
geometry. Web checkout still requires `estimated_duration_minutes > 0` from the
lock (Phase 8 exclusion). Production store of Directions results is the Order.

---

## 4. Accounts (Q6, Q7)

| Service | Status |
|---|---|
| Cloudflare | **Exists**, Free plan until go-live, then paid. |
| Supabase | Owner creates when asked. |
| Stripe | Owner creates when asked. |
| Resend | Owner creates when asked. |
| Mapbox | Owner creates when asked (after the sales email). |
| AeroDataBox | **Later.** Flight autofill degrades to manual time until then. |
| Sentry | **Not inside Supabase.** Separate crash-reporter. Owner previously said crash reporting is strictly necessary (OWNER-ANSWERS #10). Create Sentry when asked; do not invent a substitute. |

Do not create duplicate accounts. Ask the owner for access when a phase actually
needs the dashboard.

---

## 5. Policy numbers — now seeded, not TBC

These **close ADR-002** for waiting times. Seed the dated `settings_versions`
row with these values. Do not invent CHF fares.

| Setting | Value | Was |
|---|---|---|
| Airport waiting included | **60 minutes** | NULL / TBC |
| City waiting included | **15 minutes** | NULL / TBC |
| Minimum advance | **180 minutes** (3 h) | NULL |
| Manage-link validity | **30 days** after last leg | NULL |
| Round-trip discount | **10 %** of the fare | U16 open |
| Night window | **20:00–06:00** Europe/Zurich | mock 22:00–06:00 |
| Quote lock | **30 minutes** | already designed |
| Payment / checkout window | **30 minutes** (same clock) | U49 open |

Cancellation tiers already owned: 100 % > 24 h, 75 % inside 24 h, 0 % no-show.

The **CHF matrix** (Economy/Business/Van base, per-km, named routes, surcharge
amounts) is still missing. Engine stays behind no live `rate_versions` row.

---

## 6. Product

| Item | Decision |
|---|---|
| Classes | Economy **3/3**, Business **3/3**, Van **8/8**. `first` does not ship. Fix the widget's Van 7. |
| Child seat / oversize on a return | **Both legs** (one checkbox, two lines). |
| Child seats | **Max 1** in V1. |
| Extra stop | **Flat fee only**, count 0–3. No stop addresses, no detour km in V1. |
| Hourly | **Out of V1.** Tab off. |
| Abandoned coupon | **Does not burn.** Consume at payment. |
| Cash to driver | **No.** Visa, Mastercard, Apple Pay, Google Pay, TWINT. |
| Service area | **Fail-closed.** Named live `fixed_routes` only until a polygon exists. |

---

## 7. Brand / analytics

| Item | Decision |
|---|---|
| Qurova | **Buy** the Prioritype Web Font licence (~$69). Authorises ADR-009. |
| Analytics | **Cloudflare Web Analytics** (cookieless). Not PostHog at launch. |
| Imprint street / postcode | **Stays TBC.** |

---

## Consequences for later phases

- **Phase 2 seed** writes 60 / 15 / 180 / 30 days / 10 % / 20:00–06:00 / Business 3/3 / Van 8/8. Waiting TBC pills come off those settings.
- **Phase 4** night predicate is `20:00–06:00`, not 22:00. Round-trip line may carry `percent: 10`. Extra-stop stays quantity-only (D67).
- **Phase 5/7** guest email → user → verify → bookings list; Stripe Checkout in chosen currency; FX from Stripe, not a Vamos rate card.
- **Phase 1 display rule** in CLAUDE.md (“currency switch changes the mark, never the number”) is **product-wrong as of this sitting**. The engine still has one CHF number; the **surface** converts it. Update that sentence when the i18n/currency port is next touched — do not keep shipping mark-swap as if it were still the law.

## Still open (not this sitting)

CHF price matrix · imprint street · vehicle/destination photography · staff invite emails · driver-no-show refund share · Qurova purchase actually completed · Cloudflare/Supabase/Stripe/Resend/Mapbox dashboards existing as live projects · Mapbox Order in writing · AeroDataBox · Sentry account.
