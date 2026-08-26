# Lens: 04-ops-reality
STATUS: returned
CHECKED: `.planning/phases/04-quote-pricing-engine/04-RESEARCH.md`, `.planning/phases/04-quote-pricing-engine/04-API-CONTRACT.md`, `.planning/phases/02-data-schema-rls-staff-auth-foundations/02-RESEARCH.md` (U22, D9, D11), `.planning/phases/02-data-schema-rls-staff-auth-foundations/02-SCHEMA-DRAFT.md` (`tg_rate_version_transition`, `booking_legs_assignable`, `bookings.locale`/`note`, `coupons.active`), `app/pages/checkout.dc.html`, `app/ops/OpsBoard.dc.html`, `app/ops/OpsDetail.dc.html`, `app/ops/OpsCoupons.dc.html`, `app/ops/OpsPricing.dc.html`, `app/home/home.dc.html` (flight date chips)
SCENARIOS: 12 rows, HANDLED or GAP, citation
FINDINGS: 4

Does this survive a dispatcher’s day? Walked against Phase 4’s quote engine, not against a later ops phase that has not been specified. Amounts stay `CHF 000`.

---

## SCENARIOS

| # | Scenario | Verdict | Citation |
|---|---|---|---|
| 1 | Phone booking with no Mapbox route | **GAP** | `04-RESEARCH.md` §7: “Phone bookings with no Mapbox route (U22, Phase 8): the assign dialog must supply a duration; Phase 4's web funnel never writes a leg without one.” `02-RESEARCH.md` U22. `02-SCHEMA-DRAFT.md` `booking_legs_assignable` refuses assignment without `estimated_duration_minutes`. `04-API-CONTRACT.md` §0: “Text alone cannot be priced.” No ops quote route. Directions fail → `422 route_unavailable`. |
| 2 | Quote for an address Mapbox cannot geocode | **HANDLED** | `04-API-CONTRACT.md` §2 step 5 → `422 place_unresolved` / `quote.geo.no_results`. Suggest down → `200 { suggestions: [], degraded: true }` + pin/type fallback (`quote.geo.suggest_unavailable`). Reverse with nothing addressable → `{ place: null }`, keep the pin. Pin `kind: "pin"` still quotes from coords. |
| 3 | Customer changes passengers four times (debounce, eligibility, lock) | **HANDLED** | `04-RESEARCH.md` §4: 300 ms debounce; `/api/quote` writes no rows (D42); each POST mints a new lock. §2 D44: `LEAST` caps, HTTP 200 + labelled ineligible, widget auto-move (`quote.moved_to`). `04-API-CONTRACT.md` §3: `pax`/`bags` rejected on reprice (`400 untrusted_input`) — must re-POST `/api/quote`. D56: 8/60 cookie’d is above 4–6 real re-quotes. |
| 4 | Coupon the owner wants to kill mid-day | **HANDLED** | `04-RESEARCH.md` §6 D50: `evaluate_coupon` rule 2 `not active` → `quote.coupon.error.inactive`; consume at PaymentIntent with `SELECT … FOR UPDATE`; no KV. D60: coupons on `HYPERDRIVE_NOCACHE` (no ~75 s publish lag). `04-API-CONTRACT.md`: informational `applied: false` on reprice; at intent, `409 coupon_no_longer_valid`. Snapshot line embeds the code (T10). `app/ops/OpsCoupons.dc.html`: “Off keeps the code but stops it being accepted.” |
| 5 | CHF 000 as an actual person sees it (widget, checkout, ops board) | **HANDLED** | `04-RESEARCH.md` §8 five layers: no live row → `total_rappen: null` → `formatRappen(null)` → `CHF 000`; CTA labelled `quote.pricing_pending`; intent `409 pricing_not_live`; charge-gate has no off switch. “not on the web and not by phone.” `04-API-CONTRACT.md` §9. Widget paints route + class board with `CHF 000`. `app/pages/checkout.dc.html` total `CHF 000.00`. `app/ops/OpsBoard.dc.html` revenue + every row `CHF 000`. `app/ops/OpsPricing.dc.html` charcoal banner: every figure is a placeholder. |
| 6 | Return trip with a child seat (one checkbox, two legs) | **HANDLED** | `02-RESEARCH.md` D11: one booking, one snapshot, `price_snapshot_legs` per-leg subtotals. `04-RESEARCH.md` §10 D51: one checkout checkbox (`checkout.dc.html` line 94); engine writes **two** `child_seat` lines, one per `leg_seq`, never one line covering both legs. Extra stops stay outbound-only (ADR-006). Amounts `null` until priced. U40 is an owner product confirm, not a missing rule. |
| 7 | Extra stop that Mapbox routes through a closed road | **GAP** | `04-RESEARCH.md` §7: Directions v5 `mapbox/driving`, `alternatives=false`, not `driving-traffic`. Waypoints go in before the fare. Failed call → `422 route_unavailable`; a *successful* call through a closed/seasonal road is accepted. T6: `distance_m` pinned in the lock, never re-fetched. U33: geometry is request-scoped, not persisted — ops cannot inspect it later. No exclude, no `depart_at`, no dispatcher override of metres (`untrusted_input`). |
| 8 | Flight number that flies daily (codeshare / date) | **GAP** | Codeshare itself is specified (`04-RESEARCH.md` §11 D55: return the number typed, do not dedupe). Overnight: do not take `j[0]`; `action: "disambiguate"` (U45). Daily date is **not** wired to pickup: `04-API-CONTRACT.md` §0 binds the widget to “today / tomorrow”; `home.dc.html` `flightDateChoice` is those two chips; API `date=YYYY-MM-DD` is otherwise unused. A daily LX318 for next Friday can stamp today’s landing into `scheduled_local`. |
| 9 | Dispatcher publishes a half-priced matrix | **HANDLED** | `02-RESEARCH.md` review pass + D9: publish is admin-only; dispatcher `UPDATE rate_versions SET status='live'` raises. `02-SCHEMA-DRAFT.md` `tg_rate_version_transition`: available `distance_rates` must all be priced, active non-included surcharges priced, live `fixed_routes` priced; `live → draft` illegal. `04-RESEARCH.md` D46: empty `predicate {}` also blocks `draft → live`; active unpriced `return_trip` refused (U16). `rate_version_publish.test.sql` named as the proof. |
| 10 | Service-area polygon still NULL on launch week | **HANDLED** | `04-RESEARCH.md` §7 D54: NULL `service_area_geojson` fail-closed `422 service_area_undefined`, rendered as `data-tok` “Service area TBC”, not “we don’t serve you.” Named `live` `fixed_routes` pair still in-area by definition (Zermatt without a Zurich polygon). Owner blocker 5. `04-API-CONTRACT.md` error table distinguishes `out_of_service_area` vs `service_area_undefined`. Ad-hoc Winterthur is refused until the polygon lands — that is the dispatcher-safe default. |
| 11 | Customer in Arabic, driver notes in German | **GAP** | Quote chrome is four-language (`04-RESEARCH.md` §14, D8 i18n keys, `.vt-dir-keep` on places/flights/codes/`CHF 000`). `04-API-CONTRACT.md` §0: notes are **not** a quote field. `02-SCHEMA-DRAFT.md`: `bookings.locale` + `bookings.note` + `booking_legs.note` exist; `chauffeurs.languages` is unused here. `app/ops/OpsDetail.dc.html` has no customer-note row, no locale badge, and `dispatcherNote` is “visible to dispatch only.” Arabic “Notes for the driver” never reaches a German chauffeur on any Phase 4 contract. |
| 12 | Quote expires while they are on the checkout extras step | **HANDLED** | `04-RESEARCH.md` §5 D47/D48: 30-min lock is the signed token; Postgres `now()` at reprice and intent; UI countdown decorative. No extend endpoint; expired → fresh `/api/quote`. `04-API-CONTRACT.md` §3: coupon-only / child-seat reprice **keeps** original `expires_at`; waypoint change mints a new lock. §6 steps 2–3: `409 quote_expired` `action: "requote"` before Stripe or snapshot. Extras re-entered after the new quote. `curl` of an expired lock still 409s. |

---

## FINDINGS

A GAP is a finding. Four.

### F-01 — No ops path to price or assign a phone booking without Mapbox (scenario 1)

**Severity:** major (blocks OPS-04 on day one; Phase 8 is named, not specified)

A dispatcher taking a booking over the phone — OpsBoard’s own “New booking” and Phone-channel rows (`app/ops/OpsBoard.dc.html`, `OpsDetail.dc.html` VT-4823 / VT-4825) — has nowhere to send that job in Phase 4.

- `/api/quote` requires retrieved or pinned coordinates; “Text alone cannot be priced.”
- Directions failure is `422 route_unavailable` with no manual `distance_m` / `duration_s` (those fields 400 `untrusted_input`).
- Staff tokens “do not bypass rate limits on these public routes.”
- `booking_legs_assignable` refuses an assignment until `estimated_duration_minutes > 0` (`02-SCHEMA-DRAFT.md`; empty range would make OPS-03 a no-op).
- U22 (`02-RESEARCH.md`, carried in `04-RESEARCH.md` UNCERTAIN): “Where the ops assign dialog gets `estimated_duration_minutes` for a phone booking” — **Phase 8**, “decide whether ops may enter a rough figure or must trigger a route lookup.”
- D42 leaves `price_snapshots.booking_id` nullable because “ops_phone may yet want an unbound snapshot,” then says do not build `app.checkout_quote` for `/api/quote`. The reserve is a comment, not a route.

Until Phase 8 lands an assign dialog that can either run Directions or accept a duration, a Mapbox miss on a phone job cannot be priced, snapshotted, or assigned. Combined with D9 / QUOTE-10, it also cannot be charged — which is correct — but the duration hole remains after the matrix lands.

**Harden:** defer to Phase 8 with U22 as the owning item, or add a Phase 4 ops-only quote that accepts staff-entered metres/seconds and still writes `estimated_duration_minutes` before assign. Do not let the web funnel invent a duration.

### F-02 — Extra-stop Directions through a closed road is accepted and then uninspectable (scenario 7)

**Severity:** major

The extra-stop path re-runs live Directions with waypoints (`04-API-CONTRACT.md` §3) on profile `mapbox/driving`, `alternatives=false` (`04-RESEARCH.md` §7). That is the right profile for a future pickup (traffic-now is the wrong number). It is the wrong tool for a *closed* road: Mapbox will often still return a geometry (through the closure, or a long detour). A 422 only fires when Directions itself fails.

Once it returns:

- Metres are pinned in the HMAC lock (T6). Checkout must not re-fetch. The customer pays that detour (or that illegal path) as fare km, plus the `extra_stop` surcharge.
- Geometry is request-scoped and not stored (D52 / U33). OpsDetail shows a canned `km` string in the mock, not the line the customer was quoted on.
- No `exclude`, no alternative, no dispatcher override. Client-supplied `distance_m` is `untrusted_input`.

A dispatcher cannot see the closed-road route, cannot reject it, and cannot correct the fare without a Phase 9 modification. Seasonal alpine closures and construction are ordinary Zurich-desk days.

**Harden:** persist a dispatcher-visible route summary that is *not* Licensed Map Content if U33 forbids storing the GeoJSON (named via + duration band), or allow an ops override of waypoints before intent. Do not add `driving-traffic`. Name the residual: live closures on the travel day are unknowable at quote time.

### F-03 — Daily flight lookup is today/tomorrow, not the pickup civil date (scenario 8)

**Severity:** major

Codeshare is handled: D55 returns the record for the number typed (boarding-pass number), no dedupe. Overnight multi-row is handled as `action: "disambiguate"` (do not port `j[0]`; U45 still to confirm `dateLocalRole`).

The daily-service half is not. `04-API-CONTRACT.md` §0:

> Flight date (today / tomorrow) | Home | Query on `/api/flight` | Europe/Zurich civil date.

`GET /api/flight/:no?date=YYYY-MM-DD` can take any day; the widget contract does not use it. `home.dc.html` `flightDate()` is `today` or `tomorrow` only. Research §11 says “or an explicit date, once the widget has one,” then the API contract drops that clause.

This product is pre-booked, often weeks out. A customer who types `LX 318` for a Friday-week-after pickup gets today’s landing written into `scheduled_local` (or cannot look the flight up at all and enters a time by hand). The quote engine then prices a night window / min-advance against the wrong wall clock. The dispatcher later sees `flight_no` + a time that never belonged to that calendar day. LIFE-06 (Phase 9) will shift a *paid* booking from a later lookup; it will not un-do a quote that locked the wrong `scheduled_local`.

**Harden:** bind `date` to `legs[0].scheduled_local`’s Zurich civil date when the WhenPicker already has one; keep today/tomorrow only when it does not. Surface more-than-two-days as a date, not two chips. Keep codeshare-as-typed.

### F-04 — Arabic booking notes never reach a German-speaking driver (scenario 11)

**Severity:** major (ops surface), quote chrome itself is fine

Phase 4 does the money and chrome correctly: ICU keys, four languages same pass, Arabic `dir="rtl"`, `.vt-dir-keep` on place names, flight numbers, coupon codes and `CHF 000` (`04-RESEARCH.md` §14, D8, D53). Fare lines will render in the dispatcher’s UI language from keys, not from frozen English.

What a chauffeur actually needs is the free-text note (`checkout.dc.html` “Notes for the driver”: meeting point, gate code, ski equipment). That field is explicitly **not** on `/api/quote` or reprice (`04-API-CONTRACT.md` §0). It lands on `bookings.note` at Phase 7 intent. Phase 4 specifies that intent’s quote re-check and does not mention `locale` or `note`.

On the mock the dispatcher actually looks at (`app/ops/OpsDetail.dc.html`):

- No customer-note row.
- No `bookings.locale` badge (`ar`).
- `dispatcherNote` placeholder: “Add a note visible to dispatch only…” — the opposite of a driver-facing note.
- Assign dialog: “Assignment is manual in V1 — there is no driver app.” So the German chauffeur is told by phone. Arabic customer text has nowhere to stand.

`chauffeurs.languages text[]` (`02-SCHEMA-DRAFT.md`) is unused. A Zurich desk that matches an Arabic-speaking chauffeur, or that pastes a German précis, is tribal knowledge.

**Harden:** Phase 7 intent must persist `locale` + `note`. Phase 8 OpsDetail must show the customer note with `dir` from `locale`, a locale badge, and a dispatch-only field that is a *different* column. Do not auto-translate. Do not freeze Arabic prose into an i18n key.

---

## Residuals (not findings)

- Scenario 5: checkout mock still shows an enabled “Pay and confirm” at `CHF 000.00` (`checkout.dc.html` `pay()`). Production contract disables the CTA and 409s intent. Port must follow §8 layer 4, not the mock button. Ops board full of `CHF 000` “paid” rows is seed theatre; with D9 there are no chargeable bookings until a live version exists.
- Scenario 6: §13 worked example sets `child_seat` `leg_seq: null`. D51 says two per-leg lines. Implement D51; treat the example as one-way shape-only. U40 remains an owner confirm.
- Scenario 4: `coupons.id ON DELETE RESTRICT` from redemptions — owner must pause (`active=false`), not delete a used code. Ops mock still offers delete.
- Scenario 9 / T9: taking a `fixed_routes.live` or `distance_rates.available` flag off sale can lag ~75 s on cached Hyperdrive. Stated in `04-RESEARCH.md` §1; charge gate re-reads on NOCACHE. Runbook, not a hole.
- Scenario 10: launch-week ad-hoc addresses 422 until the polygon or a named pair exists. Correct. Scenario 1 is the missing override, not this fail-closed.

---

## Verdict

Eight of twelve dispatcher-day scenarios have a named rule, a status code, and a person-facing string. Four do not: phone jobs with no route (U22 parked), extra-stop geometry nobody in ops can see or correct, daily flights dated today/tomorrow, and Arabic driver notes with no ops surface. Those four fail a Zurich desk on an ordinary afternoon even when the integer kernel is right.
