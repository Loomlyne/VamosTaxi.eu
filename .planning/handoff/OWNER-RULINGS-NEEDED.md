# Owner rulings needed before Phase 2 migrations or Phase 4 planning

**Resolved:** 2026-08-22 sitting — see `.planning/ADR-014-owner-sitting-2026-08-22.md`.
Q1–Q4 all **A**. Q5 **A** (Mapbox sales email). Schema conflicts are closed.

**Written:** 2026-08-22. Cold-session pickup of Phases 3–4.
**Why this exists:** four places `docs/build/GSD-LAUNCH.md` contradicts the reviewed
Phase 2 schema, plus one Mapbox-terms finding that overturns the stated KV-cache
architecture. Both cannot be implemented. Nobody has ratified a side.

Do not write a Phase 2 migration, and do not plan Phase 4's geo cache, until these
are marked. A contrary ruling after the migration lands is a rewrite.

---

## How to answer

For each item, pick **A** (Phase 2 design) or **B** (GSD-LAUNCH). A one-line reason
is enough. Record the outcome as an ADR before any `packages/db` file is created.

Recommended default, already chosen by the Phase 2 research and by ADR-006 where
noted, is **A** in every case. That is a research recommendation, not a ratification.

---

## 1. Where the booked price lives

| | GSD-LAUNCH §Phase 2 | Phase 2 design |
|---|---|---|
| **B** | `bookings.price_chf numeric` (nullable until the matrix lands) | |
| **A** | | `bookings.price_snapshot_id` → insert-only `price_snapshots` (typed totals + jsonb `lines` / `policy`) |

**Why they cannot both ship.** A numeric column cannot answer "why 75 % of CHF 000?"
in month 7, cannot freeze i18n line labels (D8), and cannot survive a later rate
change (QUOTE-05). The snapshot is what Phase 4 and Phase 9 bind to.

**If you pick B:** Phase 4's snapshot write, the charge-gate trigger, and Phase 9
refunds all change. Do not pick B to "keep it simple" — it is the expensive direction.

**Recommendation: A.**

---

## 2. Guest manage link

| | GSD-LAUNCH §Phase 2 | Phase 2 design |
|---|---|---|
| **B** | `bookings.manage_token uuid` | |
| **A** | | separate `booking_access_tokens` table, SHA-256 hashed, rotatable, reusable |

**Why they cannot both ship.** A UUID column on the booking cannot rotate without
losing history, cannot survive a mail-scanner prefetch if it is single-use, and
stores the secret in recoverable form.

**Recommendation: A.**

---

## 3. Where the chauffeur assignment lives

| | GSD-LAUNCH §Phase 2 | Phase 2 design |
|---|---|---|
| **B** | `bookings.assigned_chauffeur_id` (+ `assigned_vehicle_id`) | |
| **A** | | assignment lives on `booking_legs` (ADR-006: a return is one booking, two legs, independently dispatchable) |

**Why they cannot both ship.** ADR-006 already requires per-leg assignment. A booking-level
chauffeur cannot express "outbound assigned, return still open" and cannot feed Phase 8's
exclusion constraint.

**Recommendation: A.** This one is not a taste call — ADR-006 requires it.

---

## 4. Settings: one mutable row, or a versioned policy

| | GSD-LAUNCH §Phase 2 | Phase 2 design |
|---|---|---|
| **B** | `settings` as one mutable singleton | |
| **A** | | mutable `settings` (contacts, toggles) + immutable `settings_versions` (policy fields snapshotted onto the booking) |

**Why they cannot both ship.** LIFE-03: a refund is calculated from the policy stored
on the booking, not from whatever the policy says today. A live lookup gives month-7
answers to a month-2 booking.

**Recommendation: A.**

---

## 5. Mapbox: may we cache geocode/directions, and may we store distance on a booking?

Independently verified 2026-08-22 against the **current** Mapbox Product Terms PDF,
dated **21 July 2026** (the lane cited an older 1 Oct 2025 PDF; the live product-terms
page now links the July 2026 file). The clauses still hold, and a default restriction
was added:

> **§1.9(v)** Customer shall not "export, download, cache or store Licensed Map Content
> or other results from the Service Offerings."
>
> **§2.7.2 Temporary Geocodes.** "Customer shall not export, store, or cache Temporary
> Geocodes."
>
> **§2.7.3 Permanent Geocodes.** Store is allowed only when requested with
> `permanent=true`, and "a separate API request for a Permanent Geocode shall be made
> for each End User account that accesses, uses, or relies on such Permanent Geocode."
>
> **§2.10.1 Navigation APIs.** "Customer shall not export, download, cache or store
> results from any request to a Navigation API." No permanent-mode exception.

Directions is a Navigation API. Therefore:

1. `GSD-LAUNCH.md` / `CLOUDFLARE-RESOURCES.md` "cached in Cloudflare KV by place-id
   pair, 24 h TTL" is **barred** under self-serve terms. A shared KV cache served to
   the next customer also fails §2.7.3(ii) even on the paid Permanent Geocode tier.
2. Storing `distance_km`, `duration_min`, `estimated_duration_minutes` on
   `price_snapshots` / `booking_legs` is storing a Navigation API result. That is the
   pricing engine's and the Phase 8 exclusion constraint's input. Under self-serve
   terms it is forbidden. Under an Enterprise **Order** that carves this use out, it
   is normal — every pre-booked transfer product does this.

**Until Mapbox sales writes that carve-out into an Order, the design is:** live Mapbox
on every quote, no KV cache of Mapbox responses; `GEO_CACHE` holds only the service-area
polygon and hand-curated fixed-route geometry; a paid booking stores Permanent Geocodes
(`permanent=true`) for the chosen pickup/dropoff, not the search-as-you-type traffic.

**Ask Mapbox sales, before signup, one sentence:**

> We store route distance, duration and route geometry, and pickup/dropoff coordinates,
> permanently on a paid transportation booking record. We need that covered by contract.

This changes the quote-endpoint cost model (every quote pays Mapbox, no 24 h amortisation)
and is a commercial decision, not an engineering one.

**Recommendation:** send the sentence, wait for the Order, do not plan the KV cache as
if the terms already allowed it.

---

## What is not in this list

- The CHF price matrix, waiting allowances, free-cancel window, round-trip discount
  (U16). Still open. The engine ships behind no live `rate_versions` row; every amount
  reads `CHF 000`; checkout is unreachable. Do not invent a number to unblock 3 or 4.
- U1 / U2 / U3 (Supabase grant options, `set_config('role')` equivalence, seed re-run).
  These are staging SQL-editor checks, not owner taste.
- Cloudflare account + Supabase project. Still unprovisioned. Phase 3's p50 < 30 ms
  and the live Hyperdrive isolation run stay deferred until they exist. Local
  `supabase start` is not the gate.
