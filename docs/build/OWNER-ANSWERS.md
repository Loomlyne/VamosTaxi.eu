# Owner answers — content & photography review

Recorded 13 Aug 2026, transcribed 17 Aug 2026. This is the owner's own answer sheet against
`docs/build/Content & Photography Checklist.dc.html` and `Owner Content Review.dc.html`.
Answers here are authoritative; `docs/build/OPEN-QUESTIONS.md` carries the engineering
consequence of each one, cross-referenced by question number.

Anything marked **(blank)** was left unanswered and stays blocked. Nothing on this page is
guessed, and no CHF figure, policy number or capacity is invented to unblock work — a blank
keeps its `data-tok` TBC pill on the live page.

## Sitting 2026-08-22

Authoritative. Full write-up: `.planning/ADR-014-owner-sitting-2026-08-22.md`.

| # | Answer |
|---|---|
| Charge currency | CHF in the engine. Display CHF/EUR/USD/AED via **Stripe FX**. Hero switch converts immediately. Checkout shows the converted amount. **Card is charged in the chosen currency**; customer can change it again on Stripe Checkout. Copy in en/de/fr/ar. |
| Schema Q1–Q4 | All **A**: snapshots, hashed manage tokens, assignment on legs, settings + settings_versions. |
| Guest | Booking stored on email as a new user. Details email + manage link. Later signup (password or magic link); after verify, all bookings for that email. |
| Mapbox | Email sales before signup (draft in ADR-014). |
| Accounts | Cloudflare exists (Free until live). Owner creates Supabase, Stripe, Resend, Mapbox when asked. AeroDataBox later. Sentry is **not** inside Supabase — ask when crash reporting is wired. |
| Waiting | Airport **60**, city **15**. |
| Min advance | **180** min. |
| Manage link | **30** days after last leg. |
| Round-trip | **10 %**. |
| Night | **20:00–06:00** Zurich (not 22:00). |
| Quote / checkout lock | **30** min, same clock. |
| Business | **3/3**. Van **8/8** (fix widget 7). |
| Return extras | Both legs. Child seat max **1**. Extra stop **flat fee**, 0–3. |
| Hourly | Out of V1. |
| Coupon | Paid booking consumes it, not an abandoned quote. |
| Cash | No. |
| Service area | Fail-closed, named routes only. |
| Qurova | Buy ~$69 webfont. **Keep open until purchased** — no fallback, no production serve as licensed. |
| Analytics | Cloudflare Web Analytics (cookieless). |
| Imprint street | TBC. |
| Sentry | Owner creates **when asked**. Not inside Supabase. |
| AeroDataBox | **Later.** Manual flight time until then. |

---

## Decisions

| # | Question | Answer | Consequence |
|---|---|---|---|
| 1 | Carrier or booking intermediary? | **Carrier** — Vamos is directly liable for the ride | Terms 01/05/13 rewritten; archive liability disclaimer must not be carried over. See Q23 |
| 2 | Cancellation refund policy | **Tiered** — 100 % refund more than 24 h before pickup, 75 % inside 24 h, nothing for a no-show | Refund logic + cancellation page. See Q13 |
| 3 | Company address | "Zürich, Switzerland" — **street and postcode still blank** | Imprint stays on `data-tok` until the full address lands |
| 4 | Official support address | `contact@vamostaxi.eu` | Contact page, email templates, Resend sender |
| 5 | Payment methods accepted | Visa, Mastercard, Apple Pay, TWINT, PayPal | PayPal dropped from V1 on 2026-08-17 (Stripe has no CH PayPal support). Google Pay added free with Apple Pay. Cash-to-driver **not listed** → treated as out, needs confirmation. See Q16 |
| 6 | Analytics tool | **Cloudflare Web Analytics** (cookieless) — sitting 2026-08-22 | Wire in Phase 10 / launch; no PostHog at launch. See Q22 |
| 7 | Court of venue | **Zürich** | Terms, imprint |
| 8 | Cancellation channels | Chat, WhatsApp or email | Additive to the self-serve button, not a replacement. See Q14 |
| 9 | Is a cookie choice logged server-side? | "Not sure — ask engineering" | **Engineering answer: yes.** A browser-only cookie cannot prove consent to a Swiss nFADP or GDPR regulator. Adds a `consent_log` table. See Q22 |
| 10 | Is crash reporting strictly necessary? | **Strictly necessary — always on** | Built as decided, with the caveat that Sentry transmits IP and URL data and is commonly treated as consent-requiring. Toggle lives in `settings`. See Q22 |
| 11 | Live chat in V1? | **Yes** | Scoped 2026-08-17 to a **WhatsApp deep link**, not a third-party widget or an in-house build — no chat exists in any mock, and a vendor widget conflicts with the design system and the cookie banner |
| 12 | "Become a driver" page | **Build it for launch** | `app/pages/become-a-partner.dc.html` ports; needs the four blanks below |
| 13 | Vehicle lineup | **Economy 3/3, Business 3/3, Van 8/8 — three classes** | `first` does not ship. Van is 8/8, not 7/8. Business **3/3** confirmed 2026-08-22. Fix widget Van 7. See Q5–Q7 |
| 14 | Automated flight-status tracking in V1? | **Yes** | Scoped 2026-08-17 to autofill + delay-aware pickup, not live ops-board tracking. See Q18 |
| 15 | "Book by the hour" in V1? | **No — remove the tab** | `hourlyEnabled=false`. Owner decision, so the mock change is authorised. See Q19 |

## Photography

Every item **(blank)**. Blocker 3 stands in full — the one supplied V-Class photograph still
repeats, and Economy/Business fall back to an icon tile.

Home & About hero · Economy vehicle · Business vehicle · "First" class (moot — the class was
cut in decision 13) · founder portrait · driver at the curb with a name board · vehicle on an
alpine or ski route · chauffeur opening the rear door · destination/lifestyle library ·
sign-in and reset-password side panel.

## Page-by-page blanks

Everything below was left unanswered on 13 Aug 2026. Each one is a live `data-tok` pill.

**Shared, used on more than one page**
Free airport waiting time · free non-airport waiting time · rate beyond that · call attempts
before a no-show · complaint response days · refund payout days · how long before pickup the
driver's name, plate and number arrive · which languages support and drivers speak.

**Terms & conditions**
Registered legal company name · extra-stop fee · free minutes for a city stop · fee beyond
that · oversized-item fee · case size and hand-luggage allowance · days to file a complaint.

**Cancellation & refunds**
Free-cancellation window as a distinct number · seat count that makes a vehicle "large" ·
cancellation window for large vehicles · how close to pickup a booking can still be changed ·
refund share when *our* driver doesn't show · cancellation-voucher validity.

**Privacy policy**
Named data protection officer · EU representative · retention periods for booking records,
finance records, server logs and consent records · days to respond to a data request.

**Cookies & banner**
Real cookie names and durations (session, consent, language, recent address, analytics, error
monitoring, marketing) · months a consent choice is remembered.

**Imprint**
UID / company registration number · supervisory authority and licence · dispute-resolution
body · liability disclaimer wording · photography, brand-agency and build-agency credits.

**Contact page**
Response-time commitment · support hours · chat hours · Facebook, Instagram, YouTube and
Trustpilot URLs.

**FAQ**
Which airports offer meet-and-greet.

**About page**
Full coverage list — cities, resorts, cross-border routes, and which are seasonal · Business
class passenger capacity · Business class bag capacity.

**Account & booking management**
Verification-code validity · how many times a code can be re-requested · when a guest's
manage-booking link expires.

**Become a driver** (in scope per decision 12)
Reply-time commitment · vehicle classes drivers can apply with · licences and permits
required · whether phone, email or both are mandatory on the form.

**Site-wide**
Effective date to print on the legal pages · Qurova webfont licence (blocker 5).

---

## Phase 4 quote engine — recorded 2026-08-28

Policy numbers live on **rows**, never in TypeScript. Cite ADR-014 §5.

### Answered

| Decision | Value | Row |
|---|---|---|
| D-40 round-trip discount (U16) | 10 % | `settings_versions.round_trip_discount_percent` |
| D-41 `min_advance_minutes` | 180 | `settings_versions.min_advance_minutes` |
| D-44 manage-link validity (U5) | 30 days after last leg | `settings_versions.manage_link_validity_days` |
| D-42 waiting | 60 airport / 15 city | `settings_versions.airport_waiting_minutes` / `city_waiting_minutes` |
| D-43 quote lock / payment window | 30 / 30 minutes | `settings_versions.quote_lock_minutes` / `checkout_window_minutes` |
| D-39 night window | 20:00–06:00 Europe/Zurich | `settings_versions.night_window_start` / `night_window_end` / `night_window_tz` |

### Still open

| Item | Blocks |
|---|---|
| D-46 CHF matrix | launch flip (`draft → live`) |
| U38 five surcharge predicates | `draft → live` publish gate |
| U33 Mapbox Order | named legal risk accepted meanwhile; no response cache |
| U37 Mapbox budget | D-54 unit sentinel stands in until a real ceiling |
| U36 Cloudflare zone plan | Layer 1 WAF rule slot (Free vs Pro) |
| U42 `checkout_abandon_release_minutes` (D-55) | release sweep must not run rather than invent a wait |
| U41 extra-stop detour rate | matrix question |
| U50 hourly-hire model | out of V1 |
| U48 retention of unbound `ops_phone` snapshots | Phase 8/ops |

U20 (`idempotency_key` lifetime) — **Phase 7, 2026-09-05.** The same opaque client key is stored on `bookings.idempotency_key` and forwarded verbatim as Stripe's `Idempotency-Key`. Lifetime is the checkout window (`settings_versions.checkout_window_minutes`, 30). After that window the exclusion constraint (`23P01`) refuses a new payable session (`payment_window_closed`); a same-key retry of an open session is a silent replay. Dispatch exclusion duration is **Phase 8**.

---

## Phase 7 checkout — D-27 recorded 2026-09-06

A real Stripe **test-mode** charge needs a live `rate_versions` row. Law 04 forbids inventing a CHF fare. Offline PAY-05 (duplicate event, out-of-order pair, two PaymentIntents, second confirmation) is already green without a live matrix.

| Decision | Chosen | Rejected |
|---|---|---|
| D-27 live test-mode charge | **B — owner's real matrix in test mode.** No invented number. Live E2E waits until the matrix exists and is published per `docs/runbooks/quote-publish.md`. | **A** (staging-only synthetic rate via script, never a migration) — would unblock E2E now but park a fake fare on staging until deleted. **C** (defer live E2E to Phase 11) — first real charge would wait for launch. |

Observed this sitting (not assumed):

- Stripe **test** account exists (`acct_1U65pWAJS2YBf21S`). Publishable key is in wrangler vars (front / staging / ops-changes). Secret is on the staging Worker. Production still uses the publishable placeholder. Live keys are out until Phase 11.
- Adaptive Pricing dashboard toggle: **not confirmed** this sitting.
- TWINT: **not available** on this account (UAE entity). Cards / Apple Pay / Google Pay / Link are on. Charge currency stays **CHF**.
- Resend sandbox / `RESEND_API_KEY` on staging: **not confirmed** this sitting.
- `rate_versions`: **no live row.** `pricing_live` stays false. D-46 CHF matrix remains open. No `rate_versions` INSERT from this plan until the owner supplies the matrix.

Consequence: Task 3 (`scripts/stripe-e2e.mjs`) must not write a `rate_versions` row. It follows `quote-publish.md` and refuses to guess amounts. The first real test charge runs only after the owner matrix is in a draft and published.

---

## D-46 CHF matrix — sheet sitting 2026-09-06 (draft, not published)

Owner sent two tables. **Engine = sheet 2** (“Vamos Switzerland Transfer Pricing”). Sheet 1 (airport → anywhere) is understood and **not charged**.

Recorded mapping (not live, no `rate_versions` row):

| Item | Answer |
|---|---|
| Classes | Economy = Business Sedan floor **80**. Business = Premium Sedan / E-Class floor **100**. Van = Vito floor **150**. **V-Class out** (no fourth class). |
| Per-km | **One band table for every class.** Floors only change short trips. |
| Bands (sheet 2) | 0–20 floor · 21–50 **3.80**/km · 51–100 **3.40** · 101–150 **3.20** · 151–200 **3.00** · 200+ **2.80** |
| Region % | Interlaken / Jungfrau **+10%** · Ticino / Lugano **+15%** · St. Moritz / Engadin **+20%** · Geneva / Lake Geneva long route **+20%** · Remote Alpine **+20–30% (range, not picked)** |

Not yet answered: whether total km picks **one** band (70 × 3.40) or **blended** bands; Remote Alpine exact %; night / extra-stop / child-seat / meet-greet / ski amounts; when “Geneva long route” applies.

The live quote engine today is **one per-km per class**, not distance bands. This sheet cannot be published as `rate_versions` until that is decided (engine change vs flatten). Public UI stays `CHF 000`.
