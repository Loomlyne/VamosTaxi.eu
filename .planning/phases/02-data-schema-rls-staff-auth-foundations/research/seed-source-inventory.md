# Seed Plan Data Source Inventory (Phase 2, D22)

## Source 1: `apps/web/i18n/messages/` — Content strings

| Locale | Total leaf keys | Keys excluding $meta | ICU messages | Diff from en |
|--------|---|---|---|---|
| en.json | 1577 | ~1495* | 40 | — |
| de.json | 1573 | 1495* | 40 | 4 keys missing (nonTranslatableKeys: payment methods) |
| fr.json | 1573 | 1495* | 40 | 4 keys missing (nonTranslatableKeys: payment methods) |
| ar.json | 1573 | 1495* | 40 | 4 keys missing (nonTranslatableKeys: payment methods) |

*Approximate; $meta contains pendingValueKeys (20, all locales), nonTranslatableKeys (en:8, de/fr/ar:4), noParamKeys (54, all locales).*

**Key findings:**
- All four locales share identical key structure except for 4 footer payment method keys in `$meta.nonTranslatableKeys` (en has 8, de/fr/ar have 4).
- Per-locale ICU messages: 40 keys contain `{…}` placeholders (plurals, params) in all four locales identically.
- `$meta` keys are metadata excluded from seed per ADR-011 (§2 copy voice: "paid-for-the-job-so-a-longer-route-earns-them-nothing-extra" is marked as "internal decision code" and skipped).
- `key-map.json` (Phase 1 legacy): 1472 entries mapping English copy snippets to dotted keys — used only for backcompat, not for seed.

## Source 2: `apps/web/i18n/key-map.json` — Phase 1 key legacy map

| Metric | Count |
|--------|-------|
| Mapping entries | 1472 |
| Purpose | Maps English copy text → dotted key (Phase 1 vamos-i18n-dict.js pattern) |
| Used by seed | No (i18n messages files are the source; key-map is reference only) |

## Source 3: `app/vamos-reviews.js` — Published reviews

| Metric | Value |
|--------|-------|
| Seed reviews (array literal) | 5 |
| Fields per review | 13: id, source, name, role, text, rating, route, vehicleClass, avatar, url, verified, published, locked |
| Per-language fields | None (reviews are not translated; text is verbatim from source) |
| Currency/number amounts | None (text is placeholder copy, no CHF figures) |
| Review sources | google (2), tripadvisor (1), trustpilot (1), manual/collected (1) |

**Field detail:**
- `id` (string): rv-1, rv-2, … (user-facing ref)
- `source` (enum): google \| tripadvisor \| trustpilot \| manual
- `name` (string): "First L." (placeholder)
- `role` (string): context (e.g., "Airport transfer, Zurich")
- `text` (string): verbatim review copy, 2–3 sentences; no numbers or prices
- `rating` (number): 1–5, all seeds are 5
- `route` (string): "ZRH → Zurich city" (no currency)
- `vehicleClass` (enum): Economy \| Business \| Van
- `avatar` (string): empty string (seed has no photos)
- `url` (string): empty string (no link back to source platform)
- `verified` (bool): true for imported (google, tripadvisor, trustpilot), false for manual
- `published` (bool): true for all seeds
- `locked` (bool): derived from isImported(source); true for imported, false for manual

## Source 4: `app/vamos-ops-data.js` — Operations collections and singletons

### Collection: vehicles
| Metric | Value |
|--------|-------|
| Seed records | 6 (v1–v6) |
| Fields | id, klass, model, plate, year, seats, bags, status, note |
| Classes in seed | Economy (v1, v2), Business (v3, v4), First (v5), Van (v6) |
| CHF amounts | None |

**Record detail (v6 example — Van):**
- id: 'v6'
- klass: 'Van'
- model: 'Minivan or similar'
- plate: 'ZH 000 006' (placeholder)
- year: '0000'
- seats: 7 ❌ **Should be 8 per ADR-014 §6** 
- bags: 8 ✓
- status: 'service'
- note: '' (empty)

**Note:** VEHICLE_CLASSES constant includes 'First', which should be removed (ADR-014 decision-13, three classes only).

### Collection: chauffeurs
| Metric | Value |
|--------|-------|
| Seed records | 5 (c1–c5) |
| Fields | id, name, phone, email, vehicle, licence, languages, status, note |
| CHF amounts | None |

Example: c1 has vehicle: 'v1', languages: 'German, English', status: 'shift'.

### Collection: bookings
| Metric | Value |
|--------|-------|
| Seed records | 12 (VT-4821…VT-4830, VT-4812) |
| Fields | id, time, date, customer, pickup, dropoff, klass, pax, bags, status, chauffeur, flight, note |
| CHF amounts | None |
| Status values in seed | assigned (2), pending (2), paid (3), confirmed (2), completed (2), cancelled (1) |

Example: VT-4821 is a Business class, 2 pax, 2 bags, status: 'assigned', assigned to c2.

### Collection: customers
| Metric | Value |
|--------|-------|
| Seed records | 5 (cu1–cu5) |
| Fields | id, name, email, phone, type, company, trips, since, note |
| Types | private (3), corporate (2) |
| CHF amounts | None |

Example: cu3 is corporate, company: 'Corporate account 1', trips: 22.

### Collection: coupons
| Metric | Value |
|--------|-------|
| Seed records | 3 (cp1–cp3) |
| Fields | id, code, kind, value, uses, limit, expires, active, note |
| Value fields (CHF/percent) | All are placeholders: '00' |
| CHF amounts | None (all 'value' fields are '00' placeholders) |

Coupons: WELCOME (percent, 00), CORPORATE (percent, 00), SKI (amount, 00).

### Collection: routes
| Metric | Value |
|--------|-------|
| Seed records | 6 (FR-01…FR-06) |
| Fields | id, from, to, economy, business, van, live |
| CHF amounts | All placeholders; each class is moneySet('000' or '') per currency |
| Live routes | 2 (ZRH↔Zurich city, ZRH↔Dietikon); others false |

Example: FR-01 (ZRH→Zurich city) has economy: {CHF:'000', EUR:'000', …}, business: {…}, van: {…}, live: true.

### Collection: rates
| Metric | Value |
|--------|-------|
| Seed records | 4 (Economy, Business, First, Van — keyed by class name) |
| Fields | id, klass, baseFare, perKm, minFare, maxPax, available |
| maxPax defaults (per ADR-014) | Economy: 3 ✓, Business: 3 ✓, First: 3 (to be removed), Van: 8 ✓ |
| CHF amounts | All placeholders: baseFare='000', perKm='0.00', minFare='000' |

### Collection: surcharges
| Metric | Value |
|--------|-------|
| Seed records | 8 (S1–S8) |
| Fields | id, label, rule, kind, amounts, pct |
| CHF amounts (amounts field) | All placeholders: '00' per currency |
| Kinds in seed | amount (6: airport pickup, waiting airport, waiting city, additional stop, child seat, ski rack), percent (1: night surcharge), included (1: meet & greet) |

Example: S3 (airport waiting) label: 'Waiting, airport', rule: 'First 60 minutes included, then per 15 min' ✓ (matches ADR-014 policy), kind: 'amount'.

### Singleton: settings
| Metric | Value |
|--------|-------|
| Fields | 18 |
| Field list | company, address, uid, phone, email, defaultLang, defaultCur, minAdvance, cancelWindow, airportWait, cityWait, cash, card, twint, invoice, emailConfirm, emailReminder, smsReminder, opsAlerts |
| Policy values (vs ADR-014) | airportWait: '60' ✓, cityWait: '15' ✓, minAdvance: '' (TBC, should be 180), cancelWindow: '' (TBC, not seeded per ADR-014) |
| CHF amounts | None |

**Policy numbers from ADR-014 that *should* be in seed but currently are TBC:**
- minAdvance: empty string — should be '180' (3 hours)
- cancelWindow: empty string — should not be in settings; refund tiers (100%/72h, 75%/24h, 0%/no-show) are stored elsewhere

### Singleton: profile
| Metric | Value |
|--------|-------|
| Fields | 9: name, role, email, phone, lang, avatar, twoFactor, digest, passkey |
| Seed values | role: 'Admin role' (placeholder), lang: 'en', all others defaults |
| CHF amounts | None |

---

## Source 5: `.planning/ADR-014-owner-sitting-2026-08-22.md` — Confirmed policy numbers

| Setting | Seed value (mock) | Confirmed value | Status |
|---------|---|---|---|
| Airport waiting | '60' (SETTINGS.airportWait) | 60 minutes | ✓ Correct |
| City waiting | '15' (SETTINGS.cityWait) | 15 minutes | ✓ Correct |
| Min advance | '' (TBC) | 180 minutes (3 h) | ❌ Empty, should be 180 |
| Manage-link validity | Not in SETTINGS | 30 days after last leg | — Not in current schema |
| Round-trip discount | Not in SETTINGS | 10% of fare | — Not in current schema |
| Night window | Not in SETTINGS | 20:00–06:00 Europe/Zurich | — Not in current schema |
| Quote lock | Not in SETTINGS | 30 minutes | — Not in current schema |
| Payment/checkout window | Not in SETTINGS | 30 minutes | — Not in current schema |
| Cancellation tiers | Not in SETTINGS | 100% > 24h, 75% < 24h, 0% no-show | — Not in current schema |
| Vehicle class seats/bags | Economy 3/3 ✓, Business 3/3 ✓, Van 7/8 ❌, First 3/2 (to remove) | Economy 3/3, Business 3/3, Van 8/8, no First | Van seats wrong (7 should be 8) |
| Payment methods | cash: true | "No cash" per ADR-014 §6 | ❌ Should be false |

**ADR-014 product decision (§6):** "Classes: Economy 3/3, Business 3/3, Van 8/8. `first` does not ship. Fix the widget's Van 7."

## Source 6: `.planning/ADR-012-dictionary-duplicates-and-product-names.md` — Content rules

| Rule | Impact on seed |
|------|---|
| Product names (Economy, Business, Van, Vamos Taxi) are never translated | Seed these as Latin product names in all languages with `.vt-dir-keep` in Arabic |
| First class is removed (decision-13) | Delete rate record for First; remove VEHICLE_CLASSES entry |
| Arabic transliteration rule: use Latin product names, not `ar: 'إيكونومي'` | Update i18n dict; no seed impact (content_strings table mirrors dict) |

---

## Expected seed row counts

### content_strings table

**Derivation:** Phase 1's `app/vamos-i18n-dict.js` maps to a `content_strings` table in production. The Phase 2 seed builds this table from `apps/web/i18n/messages/`.

| Option | Row count | Shape |
|--------|---|---|
| **Option A: One row per key × locale (normalized)** | ~1495 × 4 = **5980 rows** | `(key, locale, value)` — one row per locale per key |
| **Option B: One row per key with JSONB of 4 locales (denormalized)** | ~1495 | `(key, translations: {en, de, fr, ar})` — one row, 4-language JSONB |

*~1495 assumes $meta keys and any en-only keys are excluded or merged.*

The plan chooses **Option B (denormalized JSONB)** to mirror the JSON file structure and simplify backcompat with Phase 1's dict.

### reviews table

| Metric | Count | Derivation |
|--------|---|---|
| Seed rows | 5 | From `app/vamos-reviews.js` SEED array |
| Fields per row | 13 | id, source, name, role, text, rating, route, vehicleClass, avatar, url, verified, published, locked |

### vehicle_classes table

| Metric | Count | Derivation |
|--------|---|---|
| Seed rows | **3** | Economy, Business, Van (remove First per ADR-014 decision-13) |
| Fields per row | 4 | id (klass name), seats, bags, active |

**Rows:**
- Economy: 3 seats, 3 bags
- Business: 3 seats, 3 bags
- Van: 8 seats, 8 bags (fix from mock's 7)

### settings table

| Metric | Count | Derivation |
|--------|---|---|
| Seed rows | 1 | Singleton: SETTINGS from `app/vamos-ops-data.js` |
| Fields | 18+ | company, address, uid, phone, email, defaultLang, defaultCur, minAdvance, cancelWindow, airportWait, cityWait, cash, card, twint, invoice, emailConfirm, emailReminder, smsReminder, opsAlerts |

### settings_versions table

| Metric | Count | Derivation |
|--------|---|---|
| Seed rows | 1 | Immutable record: one initial dated version (ADR-014 schema Q4) |
| Key fields | created_at (now), airportWait: 60, cityWait: 15, manageLink: 30 days, roundTrip: 10%, nightWindow: '20:00–06:00', cancellationTiers: [100%/72h, 75%/24h, 0%/no-show], etc. |

**Per ADR-014 §5:** "Seed the dated `settings_versions` row with these values."

### Summary table

| Entity | Expected rows | Notes |
|--------|---|---|
| `content_strings` (denormalized JSONB) | ~1495 | One row per key, 4-language translations in JSONB field |
| `reviews` | 5 | From vamos-reviews.js SEED; no per-language rows |
| `vehicle_classes` | 3 | Economy, Business, Van (no First) |
| `settings` | 1 | Current mutable settings singleton |
| `settings_versions` | 1 | Immutable dated version with confirmed policy numbers |

---

## Do-not-seed list

Placeholder values that must NOT be seeded as real data:

| Value | File:line | Reason | Replacement |
|-------|---|---|---|
| Van class with 7 seats | app/vamos-ops-data.js:149 | ADR-014 §6: "Fix the widget's Van 7" | Change seats: 7 to seats: 8 |
| VEHICLE_CLASSES includes 'First' | app/vamos-ops-data.js:141 | ADR-014: three classes only, no First | Remove 'First' from array |
| Rate for First class | app/vamos-ops-data.js:276 | ADR-014 decision-13 | Delete rate record keyed 'First' |
| settings.minAdvance = '' | app/vamos-ops-data.js:324 | TBC, should be '180' per ADR-014 | Update to '180' (or seed settings_versions instead) |
| settings.cancelWindow = '' | app/vamos-ops-data.js:325 | TBC; policy is in settings_versions, not settings | Leave empty (policy stored in separate table) |
| settings.cash = true | app/vamos-ops-data.js:328 | ADR-014 §6: "Cash to driver: No" | Change to false |
| All coupon value fields ('00') | app/vamos-ops-data.js:234–236 | Placeholder amounts per design system §2 | Seed as-is; real amounts fill in ops console |
| All route economy/business/van prices ('000' or '') | app/vamos-ops-data.js:256–261 | Placeholder per design system §2 | Seed as-is; real matrix fills in ops console |
| All rate baseFare/perKm/minFare ('000'/'0.00') | app/vamos-ops-data.js:276 | Placeholder per design system §2 | Seed as-is; real matrix fills in ops console |
| All surcharge amounts ('00') | app/vamos-ops-data.js:296–303 | Placeholder per design system §2 | Seed as-is; real amounts fill in ops console |
| Booking example times/dates (Fri 14 Aug, etc.) | app/vamos-ops-data.js:186–197 | Demo seed data | OK to seed; these are ops example bookings, not live |
| Review seed copy (verbatim text) | app/vamos-reviews.js:25–45 | Demo copy, not real reviews | OK to seed; placeholder reviews OK; real reviews come from platform APIs |
| Phone numbers ('+41 00 000 00 00', '+41 79 626 70 82') | app/vamos-ops-data.js (chauffeurs, settings, profile) | '+41 00 …' is placeholder per design system §2; '+41 79 …' is real owner number | '+41 00 …' OK to seed (demo); '+41 79 …' check with owner before live deploy |
| Vehicle plates ('ZH 000 001', etc.) | app/vamos-ops-data.js:144–149 | Placeholder | OK to seed (demo fleet) |
| Licence codes ('CH 000 000') | app/vamos-ops-data.js:166–170 | Placeholder | OK to seed (demo chauffeurs) |

**Cancellation tiers (not yet in current schema, needed for settings_versions §5):**

| Policy | Value | Seed in settings_versions |
|--------|---|---|
| Full refund | > 24 hours before pickup | 100% |
| Partial refund | 24 hours to pickup | 75% |
| No refund | No-show or <= 0 before pickup | 0% |

---

## Implementation notes for Phase 2 seed.sql

1. **Delete/fix before seeding:**
   - Remove VEHICLE_CLASSES entry 'First'
   - Change vehicle v6 (Van) seats from 7 to 8
   - Remove rate record keyed 'First'
   - Set settings.minAdvance to '180' (or leave TBC and seed via settings_versions)
   - Set settings.cash to false

2. **Seed order (foreign keys):**
   - `vehicle_classes` (first, no deps)
   - `content_strings` (no deps)
   - `settings` + `settings_versions` (settings_versions → settings)
   - `reviews` (no deps)

3. **currency/language invariance:**
   - i18n messages: seed one `content_strings` row per key, JSONB translations for 4 languages
   - Reviews: seed as-is, no per-language rows
   - Rates/routes/surcharges: seed currency-keyed moneySet placeholders as-is

4. **Not seeded in Phase 2 (ops collections):**
   - vehicles, chauffeurs, bookings, customers, coupons, routes (dynamic pricing matrix TBC), surcharges (amount TBC)
   - These are populated by ops console during onboarding; mock seed data from `vamos-ops-data.js` is for design testing only
