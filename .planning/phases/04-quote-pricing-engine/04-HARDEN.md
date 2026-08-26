# Phase 4 harden ledger

lenses-expected: 5 (of the global 8)
lenses-returned: 5 (`abuse-money`, `forward-compat`, `fidelity`, `i18n-rtl`, `ops-reality`)
findings-in: 37
applied: 28
rejected: 0
deferred: 9
dropped: 0

Harden agents died on a 402 after editing `04-RESEARCH.md` (D61–D75, U54–U58)
and before touching `04-API-CONTRACT.md`. The contract addendum in that file
is the remainder. New Phase 4 decisions **D61–D75**. Uncertainties **U54–U58**
added; U8/U16/U20 stay open. Phase 3 took D76–D83 / U59,U61 so these ids do
not overlap after the Phase 3 remap.

| finding-id | severity | action | where | reason |
|---|---|---|---|---|
| AM-01 | blocker | apply | D61, API §6 | Persist `quote_lock_expires_at`; raise inside snapshot-write tx; trigger reads the quote-lock clock |
| AM-02 | major | apply | D62 | `rate_version_is_live = status in ('live','retired')`; still refuse draft |
| AM-03 | major | apply | D71, U54, API §8 | Breaker increments on every Mapbox call; engineering sentinel trips; geo in the zone rule |
| AM-04 | blocker | apply | D63, API §8 | HMAC `vamos_qs`; unverifiable → 4/60; Turnstile 3rd keyed on IP or verified cookie |
| FC-01 | blocker | apply | D64, API §2–§3 | Pin extras+coupon; re-sign `class_totals` on reprice |
| FC-02 | blocker | apply + defer | D70 apply; U33 defer | Web path requires `estimated_duration_minutes > 0` from the lock. Production store of Directions results still needs the Mapbox Order |
| FC-03 | major | apply + defer | U20 restated | Require `idempotency_key` on intent; persist `{quote_id,stripe_pi}` before Stripe; `supersedes_quote_id`. Mint/lifetime still Phase 7 |
| FC-04 | major | apply | D65, U58 | `kid` + previous secret; rotation runbook |
| FC-05 | major | apply | §13 example, policy CHECK | Per-leg `child_seat`; `allocation` required on `leg_seq: null`; extend policy CHECK |
| FC-06 | major | apply | D73 | Thicken `shown_alternatives`; class change = one intent POST |
| FC-07 | major | apply | D69 | `coupon_redemptions.released_at`; SET not DELETE |
| FC-08 | major | defer | U22, §7 | `POST /api/ops/quote` specified for Phase 8. Web funnel does not invent duration |
| FC-09 | major | apply | D75, API §7 | One error → one i18n key; `same_place` / `place_out_of_box` / `pick_one` |
| FC-10 | major | apply | D74, API lock | `flight_no` + `landing_source` on the lock |
| FC-11 | major | apply | D70, API §6 | Intent refuses `pax < 1` and ineligible chosen class |
| F1 | blocker | apply | D66 | `service_zones.zone_type` + `tags` |
| F2 | major | apply | §13 | One-way example `leg_seq: 1`; return duplicates per D51 |
| F3 | major | apply | §6 | Store typed `coupon_code`; `upper()` for lookup only |
| F4 | major | apply + defer | U57 | Named drop of term-search / direction table; lookup-only in Phase 4 |
| F5 | major | apply | D68, API §0 | Preprocess `one-way`; `hourly` 422 before the union; `hours` rejected |
| F6 | major | apply | D67, U41 | Count 0–3 is legal; waypoints optional; detour km later |
| F7 | minor | apply | D70 | Intent `pax >= 1` |
| F8 | minor | apply | D72 | Seed `return_trip` tenth code |
| I-01 | major | apply | D75, §14 | ICU `{n, plural}` for extras; param `n` |
| I-02 | major | apply | D75, API §7 | Dedicated `same_place` / `place_out_of_box` keys |
| I-03 | major | apply | D75 | `quote.flight.candidate.*` + `pick_one` |
| I-04 | major | apply | §14 | ICU plural on `na_*`, min-advance, waiting |
| I-05 | major | apply | API §4 | Forward `language=` on Search Box `/retrieve` |
| I-06 | major | apply | §14 | de/fr/ar in the same table / same plan as the route |
| I-07 | major | apply | §14 + API client rule | `.vt-dir-keep` on places, codes, money, flights |
| I-08 | major | apply | §13 | ICU `Coupon {code}`, not a patterns regex |
| I-09 | major | apply | D75 | `quote.class.unavailable` / `no_rate` / `route_off` |
| I-10 | minor | apply | §14 | Flight example `locale={en\|de\|fr\|ar}`; no raw `→` |
| OR-F-01 | major | defer | U22 | Phone booking with no Mapbox is Phase 8 ops quote |
| OR-F-02 | major | defer | U55 | Closed-road residual named; no GeoJSON store (U33) |
| OR-F-03 | major | apply | API §0 / §5 | Bind flight `date` to pickup civil date when WhenPicker has one |
| OR-F-04 | major | defer | U56 | `locale`+`note` persist is Phase 7; OpsDetail is Phase 8 |

Deferred (9): FC-02 production Mapbox Order (U33), FC-03 key lifetime (U20 Phase 7), FC-08 ops quote (U22), F4 term-search (U57), OR-F-01, OR-F-02, OR-F-04, plus the Phase 7 half of FC-03 Stripe persist and the Phase 8 half of U56. Counted as 9 defer rows; the rest apply.

U6 and U7 settlements stay (named contradictions of Phase 2 recommendations).
Mapbox cache stays barred (D52, U33). Four GSD-LAUNCH schema conflicts stay
unresolved owner rulings. No invented CHF figure.

Phase 3 D79 refuses this document's original D60 (cached rate book). D60's
Chosen cell is corrected: `asQuote` on `HYPERDRIVE_NOCACHE`.
