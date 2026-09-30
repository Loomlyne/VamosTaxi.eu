# P4 — extras without hard-coded names: research

**Researched:** 2026-09-30 · branch `gsd/26.2-p4-extras` · worktree `/Users/koss/Developer/vamos-wt/phase-26.2`
**Scope:** research only. No code change, no commit, no hosted SQL, no full test suite.
**Confidence:** HIGH for code paths (read and run locally). MEDIUM for anything about hosted data beyond the rows the lead supplied.

All paths are relative to the worktree root. `ROUTE` = `apps/web/app/[locale]/(ops)/api/staff/rate-book/route.ts`.
The only amount used in examples is the live figure supplied by the lead: `child-seat`, `amount_rappen 1000`.

---

## Read this first — five findings that shape the plan

1. **The live `child-seat` tick box works only because of a write bug.** The dashboard writes the rule column (`predicate`) as a JSON *string* instead of a JSON object (`ROUTE:963`, `ROUTE:989`). The fare engine reads a string as "no rule" (`apps/web/lib/pricing/rateBook.ts:175`), so it never charges the row by itself, and the checkout then offers it as a tick box (`apps/web/lib/checkout/extras-catalog.ts:211-216`, `:296`). If the string were the object it was meant to be (`{"kind":"always"}`), the same row would be **added to every quote automatically and would vanish from the checkout tick boxes**. Proven by running the real modules (output in Answer 4). **Fixing the encoding alone would break extras on the live site.**
2. **Five one-word names collide with the hard-coded lists.** "Ski" and "Waiting" cannot be saved. "Night", "Weekend" and "Holiday" save, are never offered or charged, **and block Publish of the whole draft price book**. Every multi-word name is safe today because the dashboard makes codes with hyphens and the hard-coded lists use underscores.
3. **Recording is already name-free.** Once an extra is a tick box, the charge, the booking record, the e-mails, the confirmation page and the dashboard booking detail all use the row's own code and the owner's names (26.3 work). The remaining name-based code is in: the save route, the tick-box filter, three places in the fare engine, one SQL trigger, one dashboard SQL query, and legacy readers for old bookings.
4. **The tests already assume the right design.** Three test fixtures give tick-box extras the rule `{ kind: "manual" }` (`apps/web/lib/checkout/checkout-catalog.test.ts:8-9`, `apps/web/lib/checkout/extras-g6.test.ts:41`, `apps/web/tests/integration/extras-charged-recorded-db.spec.ts:131`). The real save route never writes that value. The minimal design is to make the route write it.
5. **On the live book, night / weekend / holiday / waiting are not charged at all, and the airport pickup fee is not an extra** — it is a per-class number on the distance-rate row.

---

## Answer 1 — every place where behaviour depends on the NAME/CODE of an extra

### 1a. Save path (dashboard → database)

| File:line | Names | What it does |
|---|---|---|
| `apps/web/lib/ops/surcharge-codes.ts:4-21` | 16 codes (`SURCHARGE_CODES`) | Closed list. Only importer is a re-export at `apps/web/lib/ops/rate-book.ts:20`; nothing else uses it (grep). Dead. |
| `apps/web/lib/ops/surcharge-codes.ts:25-33` | `PASSENGER_EXTRA_CODES` (7) | No importer at all. Dead. |
| `apps/web/lib/ops/surcharge-codes.ts:36-45` | `airport_pickup, night, waiting_airport, waiting_city, waiting, weekend, holiday, extra_wait` | "Automatic" list. Used only by `isAutomaticSurcharge` (`:53-56`). |
| `apps/web/lib/ops/surcharge-codes.ts:47-51` | `ski → ski_rack`, `waiting → waiting_city` | Renames the code. |
| `apps/web/lib/ops/surcharge-codes.ts:59-63` | automatic list + `return_trip` | `isPassengerExtra`: true unless the code is on the automatic list or is `return_trip`. |
| `apps/web/lib/ops/surcharge-codes.ts:79-94` | `child_seat, extra_stop, oversized_luggage` | `extraWriteFields`: these three get rule `quantity` + a quantity source; every other name gets rule `always`. |
| `ROUTE:566-574` | `meet_greet, free_wait, extra_wait` | If the request says `type` = one of these, the code is forced to that fixed name. Unreachable from today's dashboard form (it always sends `checkout_extra`, `app/ops/OpsPricing.dc.html:1539`), and all three contain an underscore, which the save check refuses (`apps/web/lib/ops/rate-book.ts:225-229`, `:278-280`). Dead. |
| `ROUTE:576-580` | any | Code = the typed name, lower-cased, non `a-z0-9` runs turned into `-`. This is the only live way a code is made. |
| `ROUTE:584` | `ski`, `waiting` | Calls the rename. Causes the "Ski"/"Waiting" refusal. |
| `apps/web/lib/ops/rate-book.ts:225-229`, `:278-280` | any code with `_` | `assertSurchargeInput` accepts only `a-z0-9` words joined by single hyphens. |
| `ROUTE:943` | automatic list, the three quantity names | Decides by name whether the row gets a rule at all (`isPassengerExtra`) and which rule (`extraWriteFields`). |
| `ROUTE:946-951` | `free_wait` | Only a row coded `free_wait` may set `rate_versions.free_wait_minutes`. Unreachable (underscore). |
| `ROUTE:367-374`, used `:346` | `meet_greet, free_wait, extra_wait, waiting, waiting_city, waiting_airport` | Gives each listed row a "type" label for the dashboard table. |
| `apps/web/lib/ops/rate-book.ts:583` | any code with `_` | When the dashboard reads a price book, rows whose code is not hyphen-style are **dropped from the list**. Old books 13/14 (`child_seat`, `meet_greet`) therefore do not show those rows. |
| `apps/web/app/[locale]/(ops)/ops/pricing/[versionId]/actions.ts:251-291` | none | A second save function (`upsertSurcharge`). It writes no rule at all. It has no caller (grep). Dead, but it is a second writer to remember. |

### 1b. Checkout tick boxes

| File:line | Names | What it does |
|---|---|---|
| `apps/web/lib/checkout/extras-catalog.ts:295` | automatic list + `return_trip` | `selectableExtras` (the live tick-box list): drops a row whose code is "automatic". |
| `apps/web/lib/checkout/extras-catalog.ts:297` | `extra_stop` | Drops a row coded `extra_stop` (and any row whose quantity source is `extra_stops`). |
| `apps/web/lib/checkout/extras-catalog.ts:29-30`, `:33-42`, `:45-47` | `child_seat, meet_greet, free_wait, extra_stop, oversized_luggage, ski, ski_rack, pet` | `EXTRA_UI`: label key + toggle flag by code. Marked deprecated. Used only by `catalogFromSurcharges` and `recapExtraFares` in the same file. |
| `apps/web/lib/checkout/extras-catalog.ts:75-83` | `child_seat, oversized_luggage, extra_stop, ski, ski_rack, meet_greet, free_wait` | `extraIsOn`: maps named toggles to codes. Deprecated. Only a test calls it. |
| `apps/web/lib/checkout/extras-catalog.ts:101-107` | `child_seat, oversized_luggage, extra_stop` | `lockHasExtra`. Deprecated. Imported by `apps/web/lib/checkout/intent.ts:18` but never called there (grep). |
| `apps/web/lib/checkout/extras-catalog.ts:114-117`, `:128`, `:191` | `waiting_airport, waiting_city, extra_wait, free_wait` | Waiting rows are never a payable extra. Inside deprecated functions only. |
| `apps/web/lib/checkout/extras-catalog.ts:136-138`, `:129`, `:163`, `:190`, `:242`, `:248` | `extra_stop` | Extra stop has no amount. Inside deprecated functions only. |
| `apps/web/lib/checkout/extras-catalog.ts:235-255` | automatic list, `EXTRA_UI`, `extra_stop` | `catalogFromSurcharges`. Deprecated. Its only caller is `apps/web/lib/checkout/reprice.ts:55`, and nothing reads the `extrasCatalog` it fills (grep: only the type at `intent.ts:132`). Dead data. |

### 1c. Fare engine (quote)

| File:line | Names | What it does |
|---|---|---|
| `apps/web/lib/pricing/lines.ts:662-664`, `:715-739` | `waiting, waiting_airport, waiting_city` | A row with one of these codes is always turned into an "included" line with payable 0, whatever its kind or amount. The name overrides the columns. |
| `apps/web/lib/pricing/lines.ts:666-683`, `:716`, `:743` | `waiting_airport, waiting_city` | Picks the included minutes from settings by code. |
| `apps/web/lib/pricing/lines.ts:879` | `extra_stop` | A quantity row coded `extra_stop` (or with source `extra_stops`) is never a fee. |
| `apps/web/lib/pricing/lines.ts:723`, `:750`, `:781`, `:811`, `:901` | every code | Label key is built from the code: `price.surcharge.<code>.label`. |
| `apps/web/lib/pricing/priceQuote.ts:168-174`, `apps/web/lib/pricing/policy.ts:160-168` | `return_trip` | The round-trip discount row is found by its code. V1 is one-way only. |
| `apps/web/lib/pricing/lines.ts:838-862` | sources `child_seats, extra_stops, oversize_bags` | Not by code: by the row's `quantity_source` column. But the three sources are a closed named list (also a DB check, 1f). |
| `apps/web/lib/quote/schema.ts:129-131`, `:256-265`; `apps/web/lib/quote/lock.ts:103-105`; `apps/web/lib/quote/pipeline.ts:239-241` | request fields `child_seats, extra_stops, oversized_luggage` | The quote request can carry three named counts (each 0 or 1). No screen sends them today (see Answer 3, extra stops). |
| `apps/web/lib/checkout/lock-to-rpc.ts:169` | every code | Legacy snapshot line label key by code. Reached only on the legacy branch (`:256-262`) and from the staff test route (`apps/web/app/[locale]/(ops)/api/staff/rate-book/test-unpaid/route.ts:74`, no extras passed). |

### 1d. Booking record, confirmation page, e-mail, dashboard

| File:line | Names | What it does |
|---|---|---|
| `apps/web/lib/checkout/pay-link.ts:75-94` | `child_seat, oversized_luggage, extra_stop` | Four-language names for codes in **old** bookings (before names were stored on the line). |
| `apps/web/lib/checkout/pay-link.ts:136-142`, `:144-148`, `:151-166` | same three | Deprecated readers of old quote locks / old policy. `payLinkExtras` is still called on the legacy branch of `lock-to-rpc.ts:258`. |
| `apps/web/lib/checkout/booking-read.ts:236-246`, `:304` | same three | Builds the legacy `extras` list for the old voucher component. |
| `apps/web/lib/checkout/confirmation-receipt.ts:6-10`, `:110-122`, `:141-146` | same three | Deprecated receipt split: only these three codes get their own row. |
| `apps/web/lib/checkout/confirmation-receipt.ts:176` | any `price.surcharge.<code>` key | Old lines keep the label key they were written with. |
| `apps/web/components/booking/BookingVoucher.tsx:154-158`, `:207`, `:231-242`, `:408` | same three; fallback label `childSeat` | The old voucher. It is shown on the confirmation page whenever the booking is **not** in the "booked" state (`apps/web/app/[locale]/confirmation/[ref]/ConfirmationClient.tsx:510`, `:688`). A new-style extra has no row of its own there; its amount sits inside the "fare ex VAT" row. Any unknown code that did reach `:207`/`:408` would be labelled "Child seat". |
| `apps/web/lib/ops/bookings.ts:111-127` | `waiting_airport, waiting, waiting_city` | Dashboard booking detail: reads the "extra wait" amount from a live row with one of these codes (display only, never charged: `apps/web/lib/ops/bookings-map.ts:190-228`). None of the three codes can be saved from the dashboard. |
| `apps/web/i18n/messages/{en,de,fr,ar}.json:2642-2680` | `airport_pickup, night, waiting_airport, waiting_city, extra_stop, child_seat, meet_greet, ski_rack, oversized_luggage, region_premium` | Message block keyed by code (`price.surcharge.<code>.label/.rule`). Needed only for lines written with those keys. |
| `packages/emails/src/lib/types.ts:24-25` | none | `PayLinkExtraCode = string`, deprecated alias. The e-mail package has **no** name-based behaviour (`packages/emails/src/lib/extras.ts:12-13`). |

Name-free already (for contrast): `apps/web/lib/checkout/checkout-charge.ts:74-88`, `:127-135`; `apps/web/lib/checkout/lock-to-rpc.ts:245-255`; `apps/web/lib/checkout/pay-link.ts:37-73`; `apps/web/lib/checkout/confirmation-receipt.ts:173-233`; `apps/web/lib/ops/bookings-map.ts:281-311`; `apps/web/app/[locale]/checkout/sections/ContactSection.tsx:152-160`.

### 1e. Mocks and shared runtime

| File:line | Names | What it does |
|---|---|---|
| `app/ops/OpsPricing.dc.html:240-252` | types `checkout_extra, meet_greet, free_wait, extra_wait`; codes `waiting, waiting_city, waiting_airport` | Type list + `surchargeTypeOf(code)`. |
| `app/ops/OpsPricing.dc.html:1492`, `:1498`, `:1504`, `:1510-1513` | same | Table "type" column and amount display by type. |
| `app/ops/OpsPricing.dc.html:1528-1552` | none | The save: always `type: 'checkout_extra'`, code = slug of the name, kind = `included` when the amount is 0, else `amount`. **This form has only: name, DE/FR/AR names, amount** (`:1517-1523`). |
| `app/ops/OpsPricing.dc.html:339`, `:342`, `:350` (+ the same keys in DE/FR/AR, e.g. `:428`, `:431`, `:439`) | copy | Text still says "Meet and greet and free wait stay on for the customer", "Free airport wait", "Extra wait", "Meet and greet stays on… cannot turn it off". No code backs these sentences today. |
| `app/vamos-ops-data.js:822-829` | `meet_greet, free_wait, extra_wait, waiting, waiting_city, waiting_airport` | Same type-from-code mapping in the ops data runtime. |
| `app/pages/checkout.dc.html:176` (and the matching entry `app/vamos-i18n-dict.js:614`) | copy `childSeat`, `additionalStops` | Mock checkout copy only. The live `/checkout` is the React form (`apps/web/app/[locale]/checkout/CheckoutForm.tsx`). |
| `app/home/home.dc.html:691-692` | copy "meet & greet in arrivals" | Airport suggestion subtitle. Copy only, no code dependency. **Owned by another session — read only.** |

### 1f. SQL (migrations) and seed

| File:line | Names | What it does |
|---|---|---|
| `packages/db/supabase/migrations/20260911000002_live_passenger_extras.sql:23-26`, `:34-37` | `child_seat, meet_greet, extra_stop, oversized_luggage, ski_rack, ski, pet` | Latest body of `tg_pricing_row_frozen`: on a price book that is no longer a draft, rows with these seven codes may still be inserted, edited and deleted; every other row is frozen. Not used by the dashboard any more: every save goes to a draft, forking the live book if needed (`ROUTE:469-488`). |
| `packages/db/supabase/migrations/20260825000001_surcharge_predicate.sql:22-23` | sources `child_seats, extra_stops, oversize_bags` | Check on `quantity_source`. |
| `packages/db/supabase/migrations/20260825000001_surcharge_predicate.sql:33-37` | none | Pairing check: rule `quantity` ⇔ a quantity source. |
| `packages/db/supabase/migrations/20260913180000_ops_pricing_source.sql:126-133` (latest `tg_rate_version_transition`) | none | Publish is refused while any active row has the empty rule `{}`. Same test in the dashboard completeness list: `apps/web/lib/ops/pricing.ts:137-141`. |
| `packages/db/supabase/migrations/20260930140000_extra_labels.sql:8-19` | none | Names table keyed by code; allows `a-z0-9_-`. |
| `packages/db/supabase/migrations/20260823000008_rate_versions.sql:185-186` | comment only | Lists the old codes in a comment. |
| `packages/db/seed/generate-seed.mjs:429-441` → `packages/db/supabase/seed.sql:165-186` | `airport_pickup, night, waiting_airport, waiting_city, extra_stop, child_seat, meet_greet, ski_rack, oversized_luggage, return_trip` | The seed puts ten named rows (no amounts) on the book with slug `seed-placeholder`. Every local database reset brings them back. |

---

## Answer 2 — what the fare engine does with a surcharge row today

### 2a. The path of a row

```
dashboard form (name + 4 names + amount)            app/ops/OpsPricing.dc.html:1528-1552
        │  PUT /api/staff/rate-book  kind=surcharge, type=checkout_extra
        ▼
parseSurchargeInput → code = slug → rename (ski, waiting)      ROUTE:557-611
assertSurchargeInput → hyphen-style code only                  rate-book.ts:277-325
name decides rule:  isPassengerExtra ? extraWriteFields : none ROUTE:943
        │  insert/update on the DRAFT book (live is forked)    ROUTE:469-488, :953-1002
        ▼
surcharges row: code, kind, amount_rappen, percent, applies_to, active, predicate, quantity_source
        │  owner presses Publish → draft becomes live (gate: no `{}` rule)
        ▼
quote_rate_book(false) returns the live book as JSON           20260914190000…sql:129-133
        ▼
mapRateBook → mapSurcharge  (the one reader for all paths)     pricing/rateBook.ts:173-188, :202-238
        ├── QUOTE  priceQuote → buildLegSurchargeLines + buildExtraLines   priceQuote.ts:238-256
        │          → class totals → signed lock
        └── CHECKOUT  loadCheckoutCatalog → selectableExtras               checkout-catalog.ts:35-47
                   → GET /api/checkout/extras (tick boxes)                 app/api/checkout/extras/route.ts
                   → checkoutCharge(lock class total + ticked codes − coupon, VAT on top)
                                                                           checkout-charge.ts:73-166
                   → snapshot lines + policy.extras → booking              lock-to-rpc.ts:245-277
```

Every reader goes through `mapRateBook` (`apps/web/lib/quote/engine.ts:187`, `apps/web/lib/checkout/checkout-catalog.ts:45`, `apps/web/lib/checkout/reprice.ts:47`, `apps/web/lib/ops/draft-preview.ts:286`, `apps/web/app/api/quote/route.ts:34`). That is the single choke point.

### 2b. Which columns decide, and where the name overrides them

**(a) Automatic charge in the quote** — `buildLegSurchargeLines`, `apps/web/lib/pricing/lines.ts:691-828`. All of these must hold:

| Column | Must be | Line |
|---|---|---|
| `active` | true | `lines.ts:699` |
| `applies_to` | `leg` | `lines.ts:700` |
| `quantity_source` | null | `lines.ts:702-704` |
| `predicate` | a rule that applies: `always`, or `pickup_zone_type` / `dest_zone_tag` / `local_time_window` matching the trip | `lines.ts:706-713`, `predicates.ts:109-173` |
| `kind` | `percent` → percent of that leg's fare line (`lines.ts:767-797`); `amount` > 0 → the amount (`:799-825`); `included` or amount 0 → shown as included, not charged (`:742-765`) | |

Name override: a row coded `waiting`, `waiting_airport` or `waiting_city` always becomes an included line with payable 0 (`lines.ts:715-739`).

**(a2) Quantity charge in the quote** — `buildExtraLines`, `lines.ts:870-924`: `active`, `quantity_source` set (`:876`), not `included` and amount not 0 (`:883`), and the request sent a count > 0 for that source (`:884-885`). Name override: code `extra_stop` is skipped (`:879`). One line per leg.

**(b) Tick box on `/checkout`** — `selectableExtras`, `apps/web/lib/checkout/extras-catalog.ts:284-314`. All of these must hold:

| Test | Line |
|---|---|
| `active` | `:291` |
| `kind` = `amount` | `:292` |
| `amount_rappen` a whole number ≥ 1 | `:293-294` |
| code not on the automatic list, not `return_trip` — **name** | `:295` |
| not "already on the quote": it is on the quote when the rule is `always` and there is no quantity source | `:296`, `:211-216` |
| code not `extra_stop` — **name**; quantity source not `extra_stops` | `:297` |
| first row per code | `:298-299` |

`applies_to` is not looked at here. A ticked extra is charged once, amount × 1 (`checkout-charge.ts:79-88`; the intent fingerprint hard-codes quantity 1, `apps/web/lib/checkout/intent.ts:377`).

**(c) Ignored** — everything else: inactive; empty or unknown rule and not tick-box material (percent, included, amount 0, an "automatic" name); `applies_to = booking` (only the row coded `return_trip` is ever read, `priceQuote.ts:168-174`).

### 2c. The rule stored as a JSON string (as on live) versus an object

| Stored `predicate` | What `mapSurcharge` hands on | Quote | Tick box |
|---|---|---|---|
| JSON **string** `"{\"kind\":\"always\"}"` (live rows 18 and 19) | `{}` — a string is not an object (`pricing/rateBook.ts:66-68`, `:175`) | "empty rule" → not applied (`predicates.ts:100-107`) | yes (`extras-catalog.ts:215` sees no `kind`) |
| JSON **object** `{"kind":"always"}` | the object | **charged automatically on every leg** (`lines.ts:799-825`) | **no** (`extras-catalog.ts:296`) |
| `{}` | `{}` | not applied | yes if the name is allowed — but `{}` blocks Publish, so it cannot reach a live book through the dashboard |

So the engine "copes" with the string only in the sense that it does not crash. The behaviour is the opposite of what the object would give.

**Is the string a bug?** Yes — it is double-encoded on write.

- `ROUTE:963` and `ROUTE:989` send `${JSON.stringify(extras.predicate)}::jsonb`.
- The driver (postgres.js 3.4.9, `apps/web/package.json:41`) learns from the server that the parameter is `jsonb` (`apps/web/node_modules/postgres/src/connection.js:626-631`), and it has a serializer for that type that calls `JSON.stringify` again (`…/postgres/src/types.js:17-19`, `:204-206`; applied at `connection.js:958-961`).
- Result: the text sent is `"{\"kind\":\"always\"}"`, which Postgres stores as a JSON string. This matches the live rows exactly. `[VERIFIED: ran the driver's own serializer locally, see Answer 4; live value supplied by the lead]`
- The copy into a new draft keeps the value as is (`apps/web/lib/ops/rate-book.ts:745-762`). That is why draft row 19 has the same string.
- Two database rules accept the string silently: the pairing check (`…surcharge_predicate.sql:33-37`: `predicate ->> 'kind'` is NULL for a string) and the Publish gate (`… = '{}'::jsonb` is false for a string).
- Correct form for this driver: pass the object through the driver's JSON helper, `tx.json({ … })` (`…/postgres/src/index.js:100`, `:318`). Nothing in the app uses it yet (grep). `[VERIFIED: helper exists in the installed driver source]`

The same `${JSON.stringify(x)}::jsonb` shape is used elsewhere: `ROUTE:915`, `:921`, `:1116`, `:1122` (the reader already tolerates strings, `ROUTE:291-301`), `apps/web/lib/checkout/return-settle.ts:101`, `apps/web/lib/ops/edit-request.ts:189`, `:498`, `apps/web/app/api/stripe/webhook/route.ts:38`, `…/rate-versions/[id]/publish/route.ts:141`. Out of scope here; listed under Not verified.

**What the code meant to do.** `extraWriteFields` gives every dashboard extra the rule `always` (`surcharge-codes.ts:93`), and `extras-catalog.ts:210-216` says an `always` row "is already in the quote, do not charge it twice at checkout". Read literally, the code's intent was: a priced dashboard extra is added to every ride. The owner's rule and the live site are: the customer ticks it. The bug is what makes the live site match the owner.

---

## Answer 3 — airport fee, night / weekend / holiday, waiting, extra stops on live data

The live book (row 18) holds one surcharge row (`child-seat`). So:

| Item | How it is charged today | Evidence |
|---|---|---|
| **Airport pickup fee** | From a **column on the per-class distance-rate row**, `distance_rates.airport_start_rappen` (dashboard field "Airport pickup fee (added to start)", `app/ops/OpsPricing.dc.html:320`). Added as its own line `airport_fee` when the pickup is an airport place or an airport zone. A drop-off or a flight number alone never adds it. Not a surcharge row, not settings. | `apps/web/lib/pricing/lines.ts:531-595`; `apps/web/lib/pricing/priceQuote.ts:212-221`; save: `ROUTE:538-541`, `rate-book.ts:251-254` |
| **Night** | **Not charged.** No row on live. The engine can apply a time-window rule (`predicates.ts:155-173`) but only a seeded or hand-written row carries one; the dashboard cannot create it. `settings_versions.night_window_*` is only copied into the policy snapshot (`apps/web/lib/pricing/rateBook.ts:269-274`). | — |
| **Weekend, holiday** | **Not charged, and not possible.** No rule type for a weekday or a date exists: the five types are `always`, `pickup_zone_type`, `local_time_window`, `dest_zone_tag`, `quantity`. | `apps/web/lib/pricing/types.ts:54-59` |
| **Waiting time** | **Never charged online.** Waiting rows are forced to payable 0 (`lines.ts:715-739`). The dashboard booking detail shows a display-only "extra wait" from `rate_versions.free_wait_minutes` plus a live row coded `waiting_airport` / `waiting` / `waiting_city` (`apps/web/lib/ops/bookings.ts:111-127`; `apps/web/lib/ops/bookings-map.ts:190-228`). No such row exists on live, so the amount is empty. `settings_versions.airport_waiting_minutes` / `city_waiting_minutes` go into the policy snapshot only (`apps/web/lib/pricing/policy.ts:91-92`). | — |
| **Extra stops** | **No fee.** By design a stop makes the route longer and the per-km part grows (`lines.ts:864-881`; `apps/web/lib/quote/pipeline.ts:247-249`). At most one stop (`apps/web/lib/quote/schema.ts:262-265`; `extras-catalog.ts:140-148`). With a stop, the city/canton pair extra is dropped (`lines.ts:424`). **No screen sends a stop today**: no file under `app/home`, `app/pages/checkout*.dc.html`, `app/*.js`, `apps/web/app` or `apps/web/components` builds `waypoints` or `extra_stops` (grep; only `lib/quote`, `lib/pricing`, `lib/geo`, `lib/ops/draft-preview.ts` mention them). | — |

**The engine against the owner's fare sentence** ("distance start + per-km × distance + one matching city-to-city or canton-to-canton extra + extras − coupon"):

| Part | Code | Note |
|---|---|---|
| distance start + per-km × full distance | `lines.ts:486-529` | `min_fare` is not a floor; no distance band is used (`lines.ts:478-480`). |
| one pair extra | `lines.ts:409-475` | City pair wins over canton pair when both match (`:433-434`). No match adds nothing. |
| extras | quote: `lines.ts:691-924`; checkout: `checkout-charge.ts:79-88` | |
| − coupon | `checkout-charge.ts:90-116` | Comes off before VAT. |
| **+ airport pickup fee** | `lines.ts:562-595` | **Not in the sentence.** Added when the pickup is an airport. |
| **+ VAT on top** | `checkout-charge.ts:98-115`, `:145-151` | **Not in the sentence.** |

---

## Answer 4 — what happens today to ten names typed on the dashboard

Code is made at `ROUTE:576-580`, renamed at `ROUTE:584`, checked at `rate-book.ts:278-280`.

| Name typed | Code | Saves? | Publish | Tick box | Charged | Recorded / e-mail / dashboard |
|---|---|---|---|---|---|---|
| **Ski** | `ski` → renamed `ski_rack` | **No.** HTTP 400, key `rateBook.error-surcharge-code` (`ROUTE:490-491`; text "That surcharge code is not recognised", `apps/web/i18n/messages/en.json:2158`) | — | — | — | — |
| **Waiting** | `waiting` → renamed `waiting_city` | **No.** Same refusal. | — | — | — | — |
| **Night** | `night` | Yes, but with the empty rule `{}`: `ROUTE:943` gives no rule, insert at `ROUTE:993-1001`, column default `…surcharge_predicate.sql:21` | **Blocked.** The draft cannot go live (`…ops_pricing_source.sql:126-133`); listed as a gap (`lib/ops/pricing.ts:137-141`) | No (`extras-catalog.ts:295`) | No (`predicates.ts:105-107`) | Never reaches a booking |
| **Weekend** | `weekend` | Same as Night | **Blocked** | No | No | — |
| **Holiday** | `holiday` | Same as Night | **Blocked** | No | No | — |
| **Pet** | `pet` | Yes; rule saved as the string | Passes | **Yes** | **Yes**, amount × 1 when ticked | **Yes** |
| **Extra stop** | `extra-stop` | Yes | Passes | Yes — a plain flat-fee tick box. Not linked to any stop address; the engine's "extra stop" is a different thing (Answer 3). | Yes | Yes |
| **Child seat** | `child-seat` (the live row) | Yes | Passes | Yes | Yes — once per booking, not per seat | Yes |
| **Meet and greet** | `meet-and-greet` | Yes | Passes | With a price ≥ 1 rappen: yes. **With CHF 0: saved as kind `included` (`surcharge-codes.ts:70-77`, `ROUTE:581-582`) and then shown nowhere** — not a tick box (`extras-catalog.ts:292`), not an "included" line (empty rule) | With a price: yes. With 0: no | With a price: yes |
| **Airport pickup** | `airport-pickup` | Yes | Passes | Yes — a tick box with that name. It has nothing to do with the real airport fee (Answer 3). | Yes | Yes |

Why only one-word names break: the slug uses hyphens and the hard-coded lists use underscores, so `extra-wait` ≠ `extra_wait`, `airport-pickup` ≠ `airport_pickup`. The collisions are exactly the one-word entries: `ski`, `waiting`, `night`, `weekend`, `holiday` (`pet` is on no blocking list).

**Recording path for a ticked extra** (name-free): the browser sends codes only (`apps/web/lib/checkout/intent-schema.ts:105`, `:160-164`) → amounts from the live catalog (`apps/web/lib/checkout/intent.ts:486-495`; screen price `apps/web/lib/checkout/price-route.ts:168-171`) → line `kind: surcharge`, the row's code, key `price.surcharge.custom`, the owner's four names (`checkout-charge.ts:127-135`) → snapshot lines and `policy.extras` (`lock-to-rpc.ts:245-277`) → e-mail names (`pay-link.ts:49-73`) → confirmation receipt (`booking-read.ts:344`, `confirmation-receipt.ts:173-233`) → dashboard booking detail (`bookings-map.ts:281-311`). One exception: the old voucher shown for non-booked states (1d).

### Proof run (no side effects)

A scratch script (outside the repo) imported the real modules — `surcharge-codes.ts`, `rate-book.ts` (`assertSurchargeInput`), `pricing/rateBook.ts`, `pricing/lines.ts`, `extras-catalog.ts`, `checkout-charge.ts` and the installed driver's `types.js` — and ran each name through the same steps as the route. No database, no network, nothing written to the repo (`git status` clean afterwards).

```
postgres.js has a serializer for jsonb oid 3802: true
wire text sent for predicate: "{\"kind\":\"always\"}"
Postgres stores jsonb of type: string

name             code            saves                               storedPredicate          publishGate                quoteAuto  tickBox  checkoutCharge
Ski              ski_rack        no (rateBook.error-surcharge-code)
Waiting          waiting_city    no (rateBook.error-surcharge-code)
Night            night           true                                {}                       BLOCKED (empty predicate)  none       false    refused:unknown_extra
Weekend          weekend         true                                {}                       BLOCKED (empty predicate)  none       false    refused:unknown_extra
Holiday          holiday         true                                {}                       BLOCKED (empty predicate)  none       false    refused:unknown_extra
Pet              pet             true                                "{\"kind\":\"always\"}"  passes                     none       true     pet:1000
Extra stop       extra-stop      true                                "{\"kind\":\"always\"}"  passes                     none       true     extra-stop:1000
Child seat       child-seat      true                                "{\"kind\":\"always\"}"  passes                     none       true     child-seat:1000
Meet and greet   meet-and-greet  true                                "{\"kind\":\"always\"}"  passes                     none       true     meet-and-greet:1000
Airport pickup   airport-pickup  true                                "{\"kind\":\"always\"}"  passes                     none       true     airport-pickup:1000

Same child-seat row, three rule shapes:
case                             mappedPredicate      quoteAuto       quoteQty        tickBox  checkoutCharge
as live (string)                 {}                   none            none            true     child-seat:1000
object {kind:always}             {"kind":"always"}    surcharge:1000  none            false    refused:unknown_extra
old book child_seat (quantity)   {"kind":"quantity"}  none            surcharge:1000  true     child_seat:1000

included row (amount 0), string rule -> quote lines: 0, tick boxes: 0
```

Notes on the run: every row was given the live amount 1000 only so the charge column shows something; "publishGate" is computed from the trigger's test (`predicate = '{}'`), not by running the trigger; the third row of the second table had the request send `child_seats: 1` and shows that an old-style quantity row would be both on the quote and a tick box (no such row is on live).

Touched tests run and green: `apps/web/lib/ops/surcharge-codes.test.ts` + `apps/web/lib/checkout/extras-catalog.test.ts` — 2 files, 21 tests passed.

---

## Answer 5 — a minimal, safe design: the row decides, never the name

### 5a. The rule

A row's nature comes from its columns only:

| `active` | `predicate` | `kind` / amount | `quantity_source` | Nature |
|---|---|---|---|---|
| false | any | any | any | Ignored everywhere |
| true | **`{ "kind": "manual" }`** | `amount`, ≥ 1 rappen | null | **Tick box on `/checkout`**, amount × 1 when ticked. Never added by the quote. |
| true | `manual` | `included` (or amount 0) | null | Owner decision D2 (show as "included" or hide). Today: hidden. |
| true | `always` / `pickup_zone_type` / `dest_zone_tag` / `local_time_window` | any | null | Automatic in the quote — engine unchanged. **Cannot be created from the dashboard form.** |
| true | `quantity` | `amount` | set | Quantity line in the quote — engine unchanged. Cannot be created from the dashboard; no screen sends a count. |
| true | `{}` | any | any | Ignored, and blocks Publish — unchanged. |
| true | a JSON **string** (legacy rows 18, 19) | | | **Read as `manual`.** Only the dashboard form ever wrote a string, and that form only ever makes customer-ticked extras. |

`manual` is the name the tests already use (finding 4). The dashboard form has exactly one kind of extra, so the save route writes `manual` for every name.

### 5b. What goes, and what replaces each call site

| Today | Where | Replace with |
|---|---|---|
| `SURCHARGE_CODES`, `SurchargeCode` | `surcharge-codes.ts:4-23`; re-export `rate-book.ts:20` | Delete both. No user. |
| `PASSENGER_EXTRA_CODES` | `surcharge-codes.ts:25-33` | Delete. No user. |
| `AUTOMATIC_SURCHARGE_CODES`, `isAutomaticSurcharge` | `surcharge-codes.ts:36-56` | Delete. |
| `normalizeSurchargeCode` | `surcharge-codes.ts:47-51`; `ROUTE:584`; `extras-catalog.ts:46`, `:115`, `:137` | Delete. `ROUTE:584` becomes `const code = raw`. The three uses in `extras-catalog.ts` sit in deprecated functions that go (below). |
| `isPassengerExtra` | `surcharge-codes.ts:59-63`; `ROUTE:943`; `extras-catalog.ts:239`, `:295` | Delete. `ROUTE:943`: no test, always write the manual rule. `extras-catalog.ts:295`–`:297`: one row test — rule is `manual`, no quantity source. |
| `extraWriteFields` | `surcharge-codes.ts:79-94`; `ROUTE:943` | Delete. Constant: rule `{ kind: "manual" }`, quantity source null. |
| `checkoutExtraKindFromRappen` | `surcharge-codes.ts:70-77`; `ROUTE:581`, `:938` | **Keep** (it is about the amount, not the name). Move it next to the route or into `rate-book.ts`; then `surcharge-codes.ts` can be deleted. |
| the two write branches "with rule / without rule" | `ROUTE:953-1002` | One update and one insert that always set `predicate` and `quantity_source`. **Write the rule with the driver's JSON helper (`tx.json(...)`), not `JSON.stringify(...)::jsonb`** — this ends the double encoding. |
| type → fixed code (`meet_greet`, `free_wait`, `extra_wait`) and the `free_wait` minutes write | `ROUTE:566-574`, `:944-952` | Delete (unreachable). Owner decision D5/D8 if a free-wait setting is wanted: it then needs its own field, not a row name. |
| `surchargeTypeFromCode` | `ROUTE:367-374`, `:346` | Delete; every row is `checkout_extra`. Mirror in `app/ops/OpsPricing.dc.html:240-252` and `app/vamos-ops-data.js:822-829`. |
| reader drops underscore codes | `rate-book.ts:583` | Keep the save check (`:278`) as is. For the reader: owner decision D9 (show or keep hiding old-style rows in retired books). |
| `mapSurcharge` | `pricing/rateBook.ts:173-188` | Add: a `predicate` that arrives as a string becomes `{ kind: "manual" }`. One place, covers quote and checkout. |
| `SurchargePredicate` + `evaluatePredicate` | `pricing/types.ts:54-59`; `predicates.ts:109-193` | Add `{ kind: "manual" }` with an explicit case: never applies in the quote. (Today it falls into "unknown kind → not applied", `predicates.ts:188-193`; explicit is safer and testable.) |
| `pricedOnQuote` | `extras-catalog.ts:210-216` | Goes with the positive test above (a `manual` row is by definition not on the quote). |
| `EXTRA_UI`, `extraUi`, `extraIsOn`, `lockHasExtra`, `isWaitingPayableCode`, `extraFaresOn`, `isExtraStopCode`, `recapExtraFares`, `recapExtras`, `extraRappenOutsideLock`, `catalogFromSurcharges`, `FREE_WAIT_CODE`, `MEET_GREET_CODE`, `ExtraToggles`, `LockExtrasPeek`, `CheckoutExtraJson` | inside `extras-catalog.ts:7-198` and `:235-255` (the kept items at `:140-148` excepted; `airportPickupFromPlace` `:66-72` is name-free and used only by a test) | Delete. Then also: the unused import at `intent.ts:18` and type at `:132`; `extrasCatalog` in `reprice.ts:13`, `:31`, `:55`; the `SnapshotExtraFare` type import at `lock-to-rpc.ts:11` moves or stays with the legacy branch. |
| waiting override | `lines.ts:662-683`, `:715-739`, `:743` | Owner decision D5. If waiting stays out of V1: delete the override; the included-minutes lookup by code goes with it. |
| `row.code === "extra_stop"` | `lines.ts:879` | Delete the code half; `quantity_source === "extra_stops"` already says it. |
| dashboard "extra wait" query by code | `lib/ops/bookings.ts:111-127` | Owner decision D5: remove the display, or give it a name-free source. |
| `tg_pricing_row_frozen` seven-code carve-out | `…20260911000002…sql:23-37` | Optional migration: drop the carve-out (every non-draft row frozen except `live/available/active`). Unused by the dashboard since saves fork to a draft. Needs `pricing_frozen.test.sql` (7–9) rewritten. |

### 5c. What must stay, and why

| Keep | Why |
|---|---|
| `tick-box list → checkoutCharge → snapshot → mail / receipt / dashboard` | Already name-free (Answer 4). |
| Quantity machinery: `quantity_source` column + check, `buildExtraLines`, `resolveQuantity`, the `child_seats` / `extra_stops` / `oversized_luggage` request fields | Column-driven, not name-driven. No screen uses it today. Removing it touches the signed lock payload (`lib/quote/lock.ts:103-105`, `:139`) — not needed for this job. **There is no quantity stepper today**: a tick is quantity 1 (`intent.ts:377`), and even the old field allowed only 0 or 1 (`schema.ts:256-259`). A stepper would be new work (D3). |
| Extra stop by distance (`waypoints`, `hasExtraStops`, cap 1) | A real engine feature, keyed by the request, not by a row name. **There is no stop field in the booking form today** (Answer 3). A field would be new work (D4). |
| Airport fee from `distance_rates.airport_start_rappen` | Not an extra, not name-based. |
| `return_trip` lookup by code (`priceQuote.ts:168-174`) | Not an owner extra; V1 is one-way; the code cannot be typed on the dashboard (underscore). Leave, or decide with D5. |
| Old-booking readers: `LEGACY_EXTRA_NAMES`, `payLinkExtras`, `extrasFromPolicy`, `legacyExtraCodes`, `EXTRA_CODES`, `receiptPriceSplit`, `BookingVoucher` label table, `price.surcharge.<code>` messages | Old bookings (books 13/14 era) carry `child_seat` / `oversized_luggage` / `extra_stop` lines without names. Deleting the readers would blank those receipts and mails. They read history; they do not decide anything for new bookings. `phase-26-3-laws.test.ts:107-111` already names them as allowed legacy readers. |
| `humaniseCode`, `selectableExtras`, `ExtraLabelsByCode`, `SurchargeLike`, `PUBLIC_MAX_EXTRA_STOPS`, `capExtraStops`, `publishedMaxExtraStops` | In use, name-free (`extras-catalog.ts:140-148`, `:200-232`, `:257-314`). |

### 5d. Data change

| Row | State | What is needed |
|---|---|---|
| Live book 18, `child-seat` | rule is a JSON string; book is frozen (any edit other than `active` is refused by `tg_pricing_row_frozen`, since `child-seat` is not on its seven-code list) | **Nothing.** The reader treats the string as `manual`. It retires at the next Publish. |
| Draft book 19, `child-seat` | same string | Optional one-line fix, allowed on a draft: set the rule to the object `{"kind":"manual"}` where `jsonb_typeof(predicate) = 'string'`. Without it the reader rule still covers it. |
| Retired books 13/14 | `child_seat` (quantity), `meet_greet` (included), `child-seat`, `somthign-else` | **Nothing.** Retired books are frozen history; bookings keep their own snapshot lines. |
| `extra_labels` | one names row per code, never deleted | Owner decision D7. |

**No schema change is needed.** The `predicate` column has no shape check (`…surcharge_predicate.sql:8-12`), the pairing check passes for `manual` with no quantity source, and the Publish gate passes for anything that is not `{}`.

**Order matters.** The reader rule (string → `manual`) and the tick-box test must ship in the same deploy as the write fix. Shipping only "parse the string into its object" would turn the live `child-seat` into an automatic charge on every booking (Answer 4, second table).

### 5e. Owner decisions (plain words)

| # | Decision | Today | Recommendation |
|---|---|---|---|
| D1 | An extra he adds on the Pricing page: is it always "the customer may tick it at checkout"? | Yes on the live site — by accident of the bug. | Yes. Make it the written rule. Nothing he types is ever added automatically. |
| D2 | An extra he prices at CHF 0: show it to the customer as "included", or hide it? | Saved, shown nowhere. | Ask him. Simplest: hide (today's behaviour), or refuse 0 with a clear message. |
| D3 | Child seat: one tick (one seat), or a number (2 seats = 2 × the price)? | One tick, charged once. | Keep one tick for this job. A stepper is new work and needs `checkout.css` (another session's file). |
| D4 | Extra stop: no stop field exists on the site today. Leave it out of V1, add a stop field priced by the longer distance, or treat "Extra stop" as a normal flat-fee tick box he names himself? | No field. A row named "Extra stop" is already a flat-fee tick box. | Leave as is: a name is just a name. |
| D5 | Night, weekend, holiday, waiting: none is charged today. Stay out of V1? | Not charged. "Night/Weekend/Holiday" typed today block Publish; "Waiting" cannot be saved. | Out of V1. After the fix each of these names is an ordinary tick-box extra. Remove the waiting override and the dashboard "extra wait" display, or keep the display — his call. |
| D6 | Airport pickup fee: his fare sentence does not list it, the engine adds it from the per-class field. Keep? | Added when the pickup is an airport. | Confirm it stays, and that an extra he names "Airport pickup" is a separate tick box. |
| D7 | When he deletes an extra, also delete its saved names in the four languages? | The names row stays (`…extra_labels.sql`; no delete anywhere, grep). Old bookings keep the name inside their own record either way. | Yes — "deleted completely". Old bookings are not affected. |
| D8 | The Pricing page still says "Meet and greet stays on", "Free airport wait", "Extra wait". Remove these words? | No code behind them. | Remove, in all four languages, same pass. |
| D9 | Old price books (13, 14) hide rows with old-style codes on the dashboard. Show them, or leave hidden? | Hidden (`rate-book.ts:583`). | Leave. They are retired. |
| D10 | The local seed still creates ten named rows on every database reset. Remove them from the seed? | Present (`generate-seed.mjs:429-441`). | Yes if "deleted completely" includes developer databases; many tests use those rows as fixtures, so it is its own small job. |

### 5f. Files another session owns right now

| Owned area | Touched by this design? |
|---|---|
| `apps/web/tests/**` | **Yes.** `apps/web/tests/integration/extras-charged-recorded-db.spec.ts` (fixture already uses `manual`, should stay green), `ops-detail-extras.spec.ts`, `ops-dc-pricing.spec.ts`. Any edit there must go through the owning session. |
| `checkout.css` | Only if D3 (stepper) or D2 ("included" row on checkout) is chosen. The minimal design does not touch it. |
| class cards (`VehicleCard`, `ClassSection`) | No. `ClassSection.tsx` has no extras code (grep). |
| `app/home/**` | No. `home.dc.html:691-692` is copy only. |
| consent / banner / `lib/meta`, `.github`, `middleware.ts`, `worker.ts`, `lib/seo`, `app/vamos-locale.js` | No. |
| Not on the owned list but shared: `app/ops/OpsPricing.dc.html`, `app/vamos-ops-data.js`, `app/vamos-i18n-dict.js` | Yes for D8 and the type mapping. Four languages in the same pass. After a mock edit run `node scripts/sync-dc-mock-to-public.mjs` before twin tests (CLAUDE.local.md). |

---

## Answer 6 — tests that pin today's name-based behaviour

**Must change with the design**

| File | Test name | What it pins |
|---|---|---|
| `apps/web/lib/ops/surcharge-codes.test.ts:11` | "maps ops aliases onto book codes" | `ski → ski_rack`, `waiting → waiting_city` |
| `apps/web/lib/ops/surcharge-codes.test.ts:17` | "treats passenger extras as the checkout catalog, not night" | automatic list by name |
| `apps/web/lib/ops/surcharge-codes.test.ts:29` | "pairs quantity extras with the quote source" | `child_seat` → quantity, `meet_greet` → always |
| `apps/web/lib/checkout/extras-catalog.test.ts:38` | "keeps ops extras and drops night" | `catalogFromSurcharges` by name |
| `apps/web/lib/checkout/extras-catalog.test.ts:94` | "omits automatic night/weekend/holiday/waiting chips" | automatic list |
| `apps/web/lib/checkout/extras-catalog.test.ts:109` | "lists a new published chip (pet, ski, unknown slug) and skips inactive" | `EXTRA_UI` |
| `apps/web/lib/checkout/extras-catalog.test.ts:132` | "extra_stop is a chip without a fixed rappen × quantity fare" | `extra_stop` by name |
| `apps/web/lib/checkout/extras-catalog.test.ts:159`, `:181`, `:201`, `:227` | recap / fare tests | deprecated named toggles (`extraIsOn`, `recapExtraFares`, `extraFaresOn`) |
| `apps/web/lib/checkout/extras-catalog.test.ts:238` | "does not invent meet & greet or free wait unless they are on the live book" | `meet_greet`, `free_wait` |
| `apps/web/lib/checkout/extras-catalog.test.ts:280` | "shows amount 0 as included and does not charge it; a price is on the quote once" | `always` = already on the quote |
| `apps/web/lib/checkout/extras-catalog.test.ts:328` | "keeps active passenger amount rows only, by exact code" | Expects `night`, `waiting`, `return_trip`, `extra_stop` dropped **by name** and rows with `predicate: null` kept. Fixture and expectation both change. |
| `apps/web/lib/pricing/lines.test.ts:932` | "included surcharge emits kind included, null amount, minutes from settings" | minutes looked up by code `waiting_airport` (only if D5 removes it) |
| `apps/web/lib/pricing/lines.test.ts:998` | "amount-kind waiting is included with payable 0 at pay (D-38)" | waiting override (only if D5 removes it) |
| `apps/web/lib/checkout/phase-26-3-laws.test.ts:107-111` | allow-list used by ":196 no child_seat / oversized_luggage / extra_stop literal…" | Names `surcharge-codes.ts` as an allowed legacy reader; remove the entry when the file goes. `:199` exempts `extras-catalog.ts` wholesale — tighten once the deprecated exports are gone. |
| `packages/db/supabase/tests/pricing_frozen.test.sql:86-105` | "surcharges: inserting / editing / deleting a passenger extra on a live version succeeds" | the seven-code trigger carve-out (only if that migration is done) |

**Stay as they are (already match the design, or not name-based)**

| File | Test name | Note |
|---|---|---|
| `apps/web/lib/ops/surcharge-codes.test.ts:40` | "treats checkout extra 0 as included and any positive price…" | Moves with `checkoutExtraKindFromRappen`. |
| `apps/web/lib/checkout/extras-catalog.test.ts:353`, `:366`, `:378` | label fallback tests | Name-free. |
| `apps/web/lib/checkout/checkout-catalog.test.ts:8-9`; `apps/web/lib/checkout/extras-g6.test.ts:41`, `:64`, `:98`, `:187` | G6 tests | Fixtures already use `{ kind: "manual" }`. |
| `apps/web/tests/integration/extras-charged-recorded-db.spec.ts:88` | "child-seat and pet-crate: labelled, priced, sent to Stripe, saved and shown in ops…" | Fixture `:131` uses `manual`. **Owned by another session.** |
| `apps/web/lib/pricing/lines.test.ts:1079`, `:1101`, `:1119`, `:1154`, `:1196` | `buildExtraLines` tests | Quantity machinery stays. `:1101` needs a look if the `extra_stop` code half at `lines.ts:879` is removed. |
| `apps/web/lib/ops/ops-pricing-tabs.test.ts:125-133` | "surcharge overlay is name and price only, always checkout extra…" | Pins `type: 'checkout_extra'` in the mock; stays true. |
| `packages/db/supabase/tests/surcharge_predicate.test.sql:105`, `:116`, `:145`, `:156` | Publish gate tests | Gate unchanged. |
| `apps/web/lib/pricing/priceQuote.test.ts`, `policy.test.ts` | round-trip tests | `return_trip` untouched. |

**Missing today — to add**

- Save route: "Ski", "Waiting", "Night", "Weekend", "Holiday" each save under their own slug with rule `manual`. No test covers the surcharge branch of the route today (`rate-book-draft.test.ts:92` is a source grep only).
- Save route: the rule reaches the driver as an object, not a string. **Must run with the Worker's client options** (project memory: database tests must use the Worker client).
- `mapSurcharge`: a string rule reads as `manual`; an `always` object still reads as `always`.
- `evaluatePredicate`: `manual` never applies in the quote.
- `selectableExtras`: `manual` + amount ≥ 1 is a tick box whatever the code (`night`, `waiting`, `ski`, `return_trip`); `always` is not.
- A source-grep law: no extra code literal outside the named legacy readers.

---

## Not verified

| # | Item | Why it matters |
|---|---|---|
| N1 | The live values of `distance_rates.airport_start_rappen` on book 18. If a class has it empty, an airport pickup gives that class no price (`lines.ts:556-560`, `:593`; `priceQuote.ts:71-101`). | Not read; no hosted SQL in this task. |
| N2 | Whether a hosted book below 13 (for example the `seed-placeholder` book) still holds the ten named seed rows. The lead checked books 13 and up. | Matters only for "deleted completely". |
| N3 | The double-encoding was confirmed for `surcharges.predicate` (live value + the driver's serializer run locally). The same code shape in `rate_version_rules.payload`, `return-settle.ts:101`, `edit-request.ts:189`/`:498`, `stripe/webhook/route.ts:38` and the publish route `:141` was **not** checked against stored data. | Possible same bug elsewhere; out of scope. |
| N4 | What the dashboard mock shows the owner when the save returns HTTP 400 `rateBook.error-surcharge-code` (the message path inside `app/vamos-ops-data.js` was not traced). | Wording of the "Ski" failure as he sees it. |
| N5 | Whether the Pricing page offers an on/off switch for an extra (the route accepts `active`, `ROUTE:608`; the form fields at `OpsPricing.dc.html:1517-1523` show none). | Whether he can unblock Publish after typing "Night" other than by deleting the row. |
| N6 | The Publish block for "Night/Weekend/Holiday" was derived from the trigger text and the completeness query, not by running a publish. | Behaviour of finding 2. |
| N7 | Integration and database tests were not run (`apps/web/tests/**`, `packages/db/supabase/tests/**`). Only the two unit files named in Answer 4 were run. | — |
| N8 | Whether any open quote lock in the wild still carries old `extras` counts (`child_seats` etc.). | Matters only if the quantity request fields were removed — the design keeps them. |
| N9 | A name with no Latin letters or digits gives an empty code and is refused (`ROUTE:576-580`, `rate-book.ts:225-229`). Read from the code, not run. The English name field is required, so this should not occur in practice. | Edge of "any name he adds". |
| N10 | Renaming an existing extra changes its code (`OpsPricing.dc.html:1532`, `:1545`); the names saved under the old code stay behind in `extra_labels`. Read from the code, not run. | Same clean-up as D7. |

---

## Project constraints that apply to the plan

- Four languages in the same pass for any dashboard copy change (D8): `app/ops/OpsPricing.dc.html` carries its own EN/DE/FR/AR tables.
- Never invent a price; tests and fixtures visible to a reviewer included.
- Never rename or match the owner's codes (standing rule) — the design removes the last two renames.
- Hosted SQL: apply each migration file verbatim, read back, never `db push`, never wipe. Book 18 has real paid bookings behind it.
- One session ships; this branch hands commits over by name. After a deploy that touches checkout: one test card payment, then read `booking_payments`.
- No new package is needed. No install, so no package audit.

## Sources

| Source | Used for |
|---|---|
| Worktree code at `c628d404` (files and lines cited above) | Everything in Answers 1–6 |
| Installed driver source `apps/web/node_modules/postgres/src/{types,connection,index}.js`, version 3.4.9 | Double-encoding mechanism and the JSON helper |
| Live rows supplied by the lead (books 13, 14, 18, 19) | Stored shape of `predicate`, the one live amount |
| Local run of the real modules (scratch script outside the repo) | Answer 4 tables |
| `vitest run lib/ops/surcharge-codes.test.ts lib/checkout/extras-catalog.test.ts` | 21 tests green |

**Valid until:** the next change to `ROUTE`, `extras-catalog.ts`, `pricing/rateBook.ts` or `pricing/lines.ts`, or the next Publish of a price book.
