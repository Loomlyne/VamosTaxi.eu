Now I'll compile the comprehensive constraint extraction.

## PHASE 2 BINDING CONSTRAINTS — Data Schema, RLS & Staff Auth Foundations

### SCHEMA STRUCTURE & TABLES

**Source:** REQUIREMENTS.md:41; ROADMAP.md:95
**Verbatim:** "The schema mirrors the `VamosOps` contract: bookings, booking events, customers, chauffeurs, vehicles, vehicle classes, coupons, fixed routes, distance rates, surcharges, reviews, content strings and settings"
**Schema impact:** Eleven tables minimum, each with the shape defined in the design-phase mock's `VamosOps` data store.

**Source:** GSD-LAUNCH.md §Phase 2:62–77
**Verbatim:** "`vehicle_classes` (economy 3/3, business, van 8/8 — capacities per audit); `vehicles`, `chauffeurs` (+ document expiry dates, photo path); `bookings` — ref `VT-####`, route (from/to text + lat/lng + place ids), pickup_at (timestamptz, Europe/Zurich), flight_no, pax/bags, class, price_chf numeric **nullable until matrix lands**, status enum `quote|pending|paid|confirmed|assigned|completed|cancelled|refunded|no_show`, customer_id nullable (guest), manage_token uuid, assigned_chauffeur_id, assigned_vehicle_id, locale, notes"
**Schema impact:** `vehicle_classes` table must include capacity fields (3 for economy, 8 for van); `bookings` table must have `price_chf` nullable, `manage_token` UUID for guest access, and a status enum with exactly those nine values; timezone must be Europe/Zurich for all pickup timestamps.

**Source:** GSD-LAUNCH.md §Phase 2:70
**Verbatim:** "`booking_events` (append-only timeline: who/what/when — powers ops Detail + audit)"
**Schema impact:** A dedicated immutable `booking_events` table with an append-only design (no updates/deletes); every booking state change and price/payment/assignment change writes an event here (DATA-08, Phase 8).

**Source:** GSD-LAUNCH.md §Phase 2:71–72
**Verbatim:** "`coupons` + `coupon_redemptions` (code, type, value, window, per-user + global caps); `fixed_routes`, `distance_rates` (per class per km), `surcharges` (night/ski/child-seat…)"
**Schema impact:** Separate `coupon_redemptions` table to track usage and enforce per-user caps; `distance_rates` keyed by vehicle class and distance unit (km); `surcharges` as a flexible lookup table, not hardcoded.

**Source:** GSD-LAUNCH.md §Phase 2:74–76
**Verbatim:** "`reviews` (author, rating, text, source, published bool, sort) — feeds home Reviews; `content_strings` (key, en/de/fr/ar) — replaces `vamos-i18n-dict.js` at runtime; `settings` singleton (waiting-time minutes, min advance booking, contact details)"
**Schema impact:** `reviews` table has a `source` field (for future Google/Tripadvisor/Trustpilot imports, ADR-008); `content_strings` table is four-language (de, fr, ar required alongside en); `settings` is a singleton accessed by id=1, holding business settings as row columns.

---

### BOOKING REFERENCE FORMAT

**Source:** ADR-003:1–3, Decision
**Verbatim:** "`VT-YY-####`" — a two-digit year prefix, then four digits, e.g. `VT-26-4821`… The year prefix resets the numeric space annually, so the ceiling becomes 9999 bookings per calendar year rather than 9999 bookings ever."
**Schema impact:** `bookings.reference` is a 9-character string (or computed column), not a random 4-digit suffix; generator logic must extract the current year and increment a counter per year, not draw random digits.

---

### PRICE COLUMNS & NULLABILITY

**Source:** ADR-004, Decision
**Verbatim:** "One CHF amount per rate, per route and per surcharge — no per-currency columns anywhere in the pricing tables."
**Schema impact:** `distance_rates`, `fixed_routes`, and `surcharges` have a single `amount_chf` column (or `price_chf`), never separate EUR/USD/AED columns; `bookings.price_chf` is the only price column on a booking row.

**Source:** GSD-LAUNCH.md §Phase 2:66
**Verbatim:** "`price_chf` numeric **nullable until matrix lands**"
**Schema impact:** `bookings.price_chf` remains nullable (DEFAULT NULL) until Phase 4's pricing engine is built and the real CHF matrix lands; rows with NULL price_chf are un-priced quotes or pending bookings waiting for confirmation.

**Source:** QUOTE-05, ROADMAP.md Phase 4:131
**Verbatim:** "Each booking stores the price breakdown and the rate version it was calculated from, so later pricing changes never alter a historical booking."
**Schema impact:** `bookings` table must have a `price_breakdown` column (JSON or text) recording the per-class quote details at quote time, and a `rate_version_id` foreign key pointing to a versioned rates table (or a `rate_version_number` for time-based versioning).

---

### RETURN TRIPS & BOOKING LEGS

**Source:** ADR-006, Decision
**Verbatim:** "One booking, two legs… A `bookings` row stays the commercial record: customer, payment, price, reference, refund. A new `booking_legs` table carries one row for a one-way trip or two rows for a return, each leg independently holding its own direction, pickup, dropoff, `scheduled_at`, flight, vehicle class, chauffeur and status."
**Schema impact:** New `booking_legs` table with a foreign key to `bookings`; one-way trips create one leg, return trips create two; every ops screen and email template reads through legs, not directly from the booking row; refunds/cancellations/assignment operate at the leg level for return trips.

---

### SETTINGS-DRIVEN FIELDS

**Source:** ADR-002, Decision; ADR-005, Decision
**Verbatim:** "Seed NULL. Do not seed 60 and 15… a seeded 60/15 makes the `data-tok` TBC pill on the ops settings screen disappear… NULL renders the pill, which is Law 04 working exactly as designed… a labelled gap the owner can see and close, rather than a number nobody chose that quietly starts being read as chosen."
**Schema impact:** `settings.airport_waiting_minutes` and `settings.city_waiting_minutes` remain NULL in the seed (never 60 and 15); Phase 9 converts the hardcoded prose strings in `app/pages/checkout.dc.html:172` and other surfaces to a `settings.free_cancellation_hours` setting (ADR-005 consequence).

---

### ROW-LEVEL SECURITY (RLS)

**Source:** DATA-02, REQUIREMENTS.md:42; ROADMAP.md:95
**Verbatim:** "Row-level security is on for every customer and operational table, and a customer can read only their own bookings."
**Schema impact:** Every table has RLS enabled; customer tables (bookings, customers, profiles) have a policy `auth.uid() = user_id` (or equivalent); ops tables (dispatch, assignments, vehicle management) have a policy restricting to `auth.jwt() ->> 'role' = 'dispatcher' OR 'admin'`.

**Source:** DATA-03, REQUIREMENTS.md:43; ROADMAP.md:96
**Verbatim:** "A guest can open a booking using a valid manage token and nothing else."
**Schema impact:** An RLS bypass rule allows a SELECT on `bookings` WHERE `manage_token = ? AND manage_token IS NOT NULL` without requiring `auth.uid()`; the manage token is a UUID, generated once per booking at quote time, and never used after the customer signs up to claim the booking (AUTH-06, Phase 8).

**Source:** DATA-04, REQUIREMENTS.md:44; ROADMAP.md:97
**Verbatim:** "A staff query is authorized by a role claim in the JWT; a customer session cannot reach ops data."
**Schema impact:** RLS on ops tables (chauffeurs, vehicles, assignments, surge rules) checks `auth.jwt() ->> 'role' IN ('dispatcher', 'admin')`; customer profiles can never satisfy this policy, so a logged-in customer cannot SELECT from ops tables even if they guess the SQL.

---

### STAFF AUTHENTICATION & INVITATION

**Source:** AUTH-05, REQUIREMENTS.md:56; ROADMAP.md:99–100
**Verbatim:** "Staff sign in by invitation only and must pass a second factor before reaching ops data."
**Schema impact:** `profiles.role` starts NULL or 'customer'; staff accounts are created by an admin invitation (likely via `auth.admin.inviteUserByEmail()` with a custom claim hook setting `role`); TOTP MFA is enforced via Supabase's built-in MFA API before JWT claims are issued for staff.

**Source:** GSD-LAUNCH.md §Phase 2:82
**Verbatim:** "ops staff = invited users with `role=dispatcher|admin` claim (set via auth hook), TOTP MFA **required** for staff"
**Schema impact:** A database trigger or edge function sets the JWT custom claim `role` to 'dispatcher' or 'admin' when an invite is redeemed; Supabase Auth configuration enforces MFA for the role claim (checked in middleware at route entry, not just in RLS).

---

### CORPORATE CUSTOMER TYPE (FORWARD-DESIGNED, FEATURE OUT)

**Source:** ADR-008, Decision
**Verbatim:** "The `corporate` customer type stays in the schema, because it is a customer attribute — who the customer is — not a payment feature; removing it would also remove the ability to record which customers are corporate accounts for non-payment reasons."
**Schema impact:** `customers` or `profiles` table has a `customer_type` enum ('personal', 'corporate'), defaulting to 'personal'; the feature that uses this type (pay-by-invoice) does not ship in V1, so the column exists but the ops UI does not expose the control.

---

### REVIEW SOURCE FIELD

**Source:** ADR-008, Decision
**Verbatim:** "The `source` field on a review record stays in the schema — it costs nothing to keep and the manual review-entry path already writes it — but no platform import is built for launch."
**Schema impact:** `reviews.source` is a string enum ('manual', 'google', 'tripadvisor', 'trustpilot'), seeded with 'manual' for existing reviews; Phase 6's review admin screen writes 'manual'; Phase 6.x (post-launch) will add import logic for the other sources.

---

### STRIPE WEBHOOK DEDUPLICATION

**Source:** GSD-LAUNCH.md §Phase 5:139
**Verbatim:** "`stripe_events` (`ON CONFLICT DO NOTHING`), ACK 200 fast"
**Schema impact:** `stripe_events` table has `stripe_event_id` as PRIMARY KEY (a unique Stripe event identifier); every webhook INSERT tries to insert the Stripe event ID; duplicate webhooks (Stripe's own retry mechanism) hit the unique constraint and are discarded silently, preventing double-confirms or double-refunds.

---

### CUSTOMER VS. GUEST DISTINCTION

**Source:** PAY-03, REQUIREMENTS.md:77
**Verbatim:** "A customer can complete a booking as a guest, without creating an account."
**Schema impact:** `bookings.customer_id` is nullable; a guest booking has `customer_id = NULL` and a `manage_token` instead; a later claim (AUTH-06, Phase 8) sets the customer_id and removes the manage_token requirement.

---

### MANAGE TOKEN FOR GUEST BOOKINGS

**Source:** GSD-LAUNCH.md §Phase 2:68
**Verbatim:** "`manage_token uuid`"
**Schema impact:** Every booking row has a `manage_token` column of type UUID; it is generated at quote time (Phase 4) and is used in guest-manage links like `/manage-booking?ref=VT-26-4821&token=<uuid>`; after signup it becomes read-only.

---

### COUPON RULES & WINDOWS

**Source:** QUOTE-06, REQUIREMENTS.md:66
**Verbatim:** "A coupon code reduces the quote before payment, and is refused when outside its window or past its usage cap."
**Schema impact:** `coupons` table has `valid_from` and `valid_until` (timestamptz); `coupon_redemptions` tracks per-user (and global) usage; Phase 4's quote engine checks both before applying a discount.

---

### FLIGHT NUMBER & TIMEZONE

**Source:** GSD-LAUNCH.md §Phase 2:65
**Verbatim:** "`pickup_at (timestamptz, Europe/Zurich), flight_no`"
**Schema impact:** `bookings.pickup_at` must be stored as timestamptz and interpreted in Europe/Zurich timezone; `bookings.flight_no` is a nullable string (e.g., "LX1234"); Phase 4's flight autofill API populates this.

---

### PASSENGER & LUGGAGE CAPACITY

**Source:** QUOTE-02, REQUIREMENTS.md:62; GSD-LAUNCH.md §Phase 2:63
**Verbatim:** "A customer picks one-way or return, date, time, passengers and luggage, clamped to what each vehicle class can carry… `vehicle_classes` (economy 3/3, business, van 8/8 — capacities per audit)"
**Schema impact:** `vehicle_classes` table has `passenger_capacity` and `luggage_capacity` columns; `bookings.pax` and `bookings.bags` are stored, and Phase 4's quote engine rejects requests that exceed a class's capacity.

---

### DOUBLE-BOOKING EXCLUSION

**Source:** OPS-03, REQUIREMENTS.md:250; ROADMAP.md:204
**Verbatim:** "A dispatcher assigns a chauffeur and a vehicle, and the same driver cannot be double-booked for overlapping trips — enforced at the database level, not just the UI."
**Schema impact:** A unique constraint or check constraint prevents two rows in an assignment table (or `booking_legs`) from having the same `chauffeur_id` and overlapping `scheduled_at` windows; Phase 8's assignment screen will rely on this constraint to prevent accidental double-bookings.

---

### LOCALE & CURRENCY STORAGE

**Source:** GSD-LAUNCH.md §Phase 2:69
**Verbatim:** "`locale`"
**Schema impact:** `bookings.locale` stores the language the customer selected at quote time ('en', 'de', 'fr', 'ar'), so confirmation emails are sent in the correct language even if the customer later changes their settings.

---

### SEED DATA

**Source:** DATA-07, REQUIREMENTS.md:47; ROADMAP.md:98; GSD-LAUNCH.md §Phase 2:85
**Verbatim:** "Seed data loads vehicle classes, settings, content strings and the existing reviews into a fresh environment… Seed script: vehicle classes, settings, FAQ/content strings, the current mock reviews."
**Schema impact:** A migration or seed script populates `vehicle_classes` (economy, business, van with their capacities), `settings` (contact phone, minimum advance time, default waiting allowances as NULL), `content_strings` (en/de/fr/ar translations of FAQ, legal boilerplate), and `reviews` (published reviews from `app/vamos-reviews.js`, seeded as source='manual').

---

### CONTENT STRINGS TABLE

**Source:** GSD-LAUNCH.md §Phase 2:75; I18N-07, REQUIREMENTS.md:36
**Verbatim:** "`content_strings` (key, en/de/fr/ar) — replaces `vamos-i18n-dict.js` at runtime"
**Schema impact:** `content_strings` table has columns `key` (text, primary), `en`, `de`, `fr`, `ar` (all text); Phase 6 (ops console) builds an admin UI to edit these; Phase 7 migrates the ~600-string `vamos-i18n-dict.js` into this table.

---

### STORAGE & PHOTO PATHS

**Source:** GSD-LAUNCH.md §Phase 2:86–88
**Verbatim:** "Storage buckets: `chauffeur-photos`, `vehicle-photos`, `review-photos` (staff write, public read via transformed URLs) — or Cloudflare R2 + Images if preferred; pick ONE (R2 recommended: same bill, image resizing at edge)."
**Schema impact:** `chauffeurs.photo_path` and `vehicles.photo_path` store relative paths or R2 object keys; RLS allows staff to write (via Resend or R2 API), and public to read via signed URLs; no photo data in Postgres itself, only metadata paths.

---

### DATA RESIDENCY

**Source:** ADR-007, proposed (pending counsel)
**Verbatim:** "Supabase pinned to eu-central (Frankfurt), closest to Zurich. Workers execute at the edge — whether booking routes need pinning near Frankfurt is still open with counsel."
**Schema impact:** Not a schema constraint but a deployment constraint: Supabase projects must be created in eu-central region (set at project creation, not changeable later); all customer data resides there; Cloudflare Workers' data-touching routes will be pinned near Frankfurt pending ADR-007 counsel resolution (Phase 8–10 blocker).

---

### PRICE VERSIONING

**Source:** ROADMAP.md Phase 4:131
**Verbatim:** "The stored booking row carries the price breakdown and the rate version it was computed from, so a later rate change never alters an existing booking's price."
**Schema impact:** A `rates` or `pricing_versions` table tracks the CHF matrix version; `bookings` has a `pricing_version_id` foreign key; Phase 4's quote engine uses this to prevent price disputes when rates change mid-booking.

---

## OPEN / UNANSWERED

### CHF Price Matrix
**Status:** Blocking Phase 4 (Quote & Pricing Engine) and Phase 9 (Launch)
**Impact:** Until the owner supplies the CHF matrix (distance rates per class, fixed-route overrides, surcharge amounts), Phase 4 cannot build real pricing. The schema supports nullable `price_chf` and holds a staging matrix behind `pricing_live=false` (ADR-004, GSD-LAUNCH.md Phase 4:124), but no production booking can be charged until this matrix lands and is owner-approved on staging.

### Policy Numbers & Tiers
**Status:** Open (per OWNER-ANSWERS.md decision 2: 24 h cancellation window confirmed; refund tiers 100%/75%/0% confirmed)
**Impact:** The cancellation-policy tiers are decided (decision 2 settles the 24 h boundary), but the `settings.cancellation_hours` field stays NULL in the Phase 2 seed until the owner confirms 24 h is the final number. ADR-005 converts all prose promises to settings-driven strings once this is confirmed, ensuring no surface disagrees. Waiting allowances (`airport_waiting_minutes`, `city_waiting_minutes`) remain NULL per ADR-002, and no-show penalties/refund caps are not yet named.

### Vehicle & Destination Photography
**Status:** Open (listed as owner blocker #3 in PROJECT.md:108)
**Impact:** `vehicles.photo_path` and booking screens' destination photos are placeholder paths until the owner supplies real images. Does not block Phase 2 schema (columns are nullable or string fields), but blocks Phase 5 (Public Surfaces) rendering without placeholder fallbacks.

### Qurova Webfont Licence
**Status:** Proposed (ADR-009, pending owner purchase decision)
**Impact:** Phase 1 gates the font-copy step (`design-system/assets/fonts/Qurova-*.ttf` → `apps/web/public/brand/`) until this licence is bought or a fallback typeface is chosen. Does not block Phase 2 schema; noted for completeness.

### Data Residency / Worker Pinning Decision
**Status:** Open (ADR-007, pending counsel answer)
**Impact:** ADR-007 proposes pinning data-touching Worker routes near Frankfurt (Smart Placement) but leaves the legal question of transient processing unanswered. Schema is unaffected; this gates Phase 10 (Hardening) release and Sentry launch (both blocked by `.planning/STATE.md` pending this resolution).

### Subprocessor List Legal Review
**Status:** Open (ADR-010, legal wording reserved for owner review)
**Impact:** ADR-010 fixes Vercel → Cloudflare and adds AeroDataBox to the privacy page's processor table, but "final legal wording still needs the owner's legal review before the page goes live." Does not block Phase 2 schema; affects Phase 5 legal pages.

---

**Prepared:** 2026-08-21 | **Phase:** 2 (Data Schema, RLS & Staff Auth Foundations) | **Binding Constraint Extract**