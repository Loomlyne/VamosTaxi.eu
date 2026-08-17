# Content & legal — client checklist

**Built:** 4 Aug 2026 · **Pages:** terms · privacy · cookies · cancellation · imprint · faq ·
contact · about · plus the shared `CookieBanner`
**Total open items:** 90 tokens · 18 legal-text slots · 5 content/image slots · 15 blocking
decisions · 18 documented conflicts (1 reopened)

One list across both slices. Slice 1 was the legal core; slice 2 added FAQ, Contact and About.

Every value below is either missing, or present but contradicted somewhere else. Nothing in the
design asserts any of them. Figures quoted as *archive* come from Wayback captures of
vamostaxi.eu dated 2024-07-14 to 2024-09-13 — a site that is currently offline — and are
recorded as evidence of what the old site said, **not** as the answer.

---

## A. Decisions that block everything else

| # | Decision | Where it lands | Why it blocks |
|---|---|---|---|
| A1 | **Carrier or intermediary?** | terms 01, 05, 13 · about | The archive disclaims liability for the ride while marketing sells “our drivers”. Liability, subcontracting and the About page all follow from this one answer |
| A2 | **The three refund shares** | cancellation 01 | FAQ promised a full refund ≤24h; terms grant 75% and keep 25%. Both are live consumer promises |
| A3 | **Controller address** | privacy 01 | Archive gives Badenerstrasse 582, 8048 Zürich; imprint and terms give Bleicherstrasse 16, Dietikon |
| A4 | **One contact address** | all five pages | `info@vamostaxi.eu` vs `contact@vamostaxi.eu` vs a personal gmail in the terms |
| A5 | **One payment-method list** | terms 11 · footer | Terms: Amex, Visa, Mastercard, cash, bank transfer. FAQ: Visa, Mastercard, Apple Pay, TWINT, PayPal |
| A6 | **Which analytics tool** | cookies 05 · privacy 04 | Vercel Analytics vs PostHog vs retiring Google Analytics |
| A7 | **Court of venue** | terms 16 | The archived clause puts venue at a third party's registered office |
| A8 | **Cancellation channels** | cancellation 02 | Terms say account only; FAQ says chat / WhatsApp / email |
| A9 | **Is consent logged server-side?** | cookies · privacy 06 | Changes the consent-log retention row and the engineering work |
| A10 | **Is Sentry strictly-necessary or consent-gated?** | cookies 03 vs 05 · privacy 04 | Error monitoring is arguably necessary for service integrity and arguably analytics. It currently sits in **Analytics**, so declining analytics turns off crash reporting. Nobody has made this call |
| A11 | **Does live chat exist in V1?** | contact · FAQ ×3 · footer | The legacy site ran a chat widget and promises "Customer Service 24/7 · Start a Chat". Chat is not in the scope of work. If it is dropped, three FAQ answers and the footer change |
| A12 | **Build `become-a-partner`, or unlink it?** | footer Company column · About CTA | It was orphaned, so the footer now links it — but the page is not in V1 scope and it is a real funnel (application, background check, vehicle inspection, consent checkbox bound to Terms + Privacy). A footer link to a page that does not exist is worse than neither. **A light draft now exists** (`become-a-partner.dc.html`, 5 Aug 2026 — structure, fields and copy only, no photography). Still unanswered: if the call is *unlink*, delete that file and remove the footer link plus the About CTA |

## B. Legal text slots — 17

Each is a dashed block on the page with a caption saying what it must cover.

| Page | Slots |
|---|---|
| Terms | contracting party · subcontracting · refusal of carriage & soiling · refused & unaccompanied items · escalation & dispute body · liability · force majeure · venue |
| Privacy | statutory references per lawful basis · transfer mechanism per destination |
| Cancellation | consequential costs when no driver arrives · disruption outcome · voucher terms |
| Imprint | UID · supervisory authority & licence · dispute body · disclaimer |
| Cookies | none — its content is tables and mechanism, not clauses |

Two archived clauses must **not** be reused: Privacy Shield as the US transfer basis, and the
e-commerce paragraph about passing addresses to a delivery company for goods.

## C. Tokens by page — 73

### Every page — 10
Effective date and version, once per document. Archive stamps for reference: terms *Zurich,
04.03.2024*; privacy *Zurich, 13 March 2024*.

### Operating rules — 6 (terms + cancellation share these)
| Token | Archive says | Note |
|---|---|---|
| `{AIRPORT_WAITING}` | 60 min | marketing claim, never confirmed |
| `{STANDARD_WAITING}` | 30 min | |
| `{EXTRA_WAITING_RATE}` | — | never published |
| `{NOSHOW_CALL_ATTEMPTS}` | 2 calls | |
| `{COMPLAINT_RESOLUTION_DAYS}` | 30 days | |
| `{REFUND_PAYOUT_DAYS}` | 30 days | |

### Terms — 9 more
`{REGISTERED_FIRM_NAME}` (register says *Vamos Taxi*, no GmbH) · `{EXTRA_STOP_FEE}` ·
`{CITY_STAY_MINUTES}` (archive 15) · `{CITY_STAY_FEE}` (**archive €15 — must become CHF**) ·
`{OVERSIZE_ITEM_FEE}` · `{CASE_DIMENSIONS}` (archive 56×45×25 cm + 1 hand luggage per seat) ·
`{DRIVER_DETAILS_LEAD_TIME}` (archive 6 h) · `{PAYMENT_METHODS}` (see A5) ·
`{COMPLAINT_WINDOW_DAYS}` (archive 10).

### Cancellation — 10 more
`{FREE_CANCEL_WINDOW}` (archive 24 h, ≤15 seats) · `{FULL_REFUND_SHARE}` (archive 75%) ·
`{PARTIAL_REFUND_SHARE}` (archive: 25% retained) · `{NOSHOW_REFUND_SHARE}` (archive: none) ·
`{LARGE_VEHICLE_SEATS}` (archive 15) · `{LARGE_VEHICLE_WINDOW}` (archive 5 days) ·
`{MODIFICATION_DEADLINE}` · `{DRIVER_NOSHOW_SHARE}` (archive 80%) · `{REFUND_DECISION_DAYS}` ·
`{VOUCHER_VALIDITY}` (archive: “valid next year”).

### Privacy — 12
`{DPO_OR_NOT_REQUIRED}` · `{EU_REPRESENTATIVE}` · `{SUPABASE_REGION}` · `{VERCEL_REGION}` ·
`{RESEND_REGION}` · `{SENTRY_REGION}` · `{ANALYTICS_REGION}` · `{ARCHIVING_YEARS}` (archive: 10,
Swiss Archiving Act — lead passenger name, passenger count, email, start and destination) ·
`{FINANCE_RETENTION}` · `{LOG_RETENTION}` · `{CONSENT_LOG_RETENTION}` · `{DSR_RESPONSE_DAYS}`.

### Cookies + banner — 22
`{SESSION_COOKIE}` `{SESSION_DURATION}` `{CONSENT_COOKIE}` `{CONSENT_DURATION}`
`{STRIPE_COOKIE_DURATION}` `{HOSTING_COOKIE}` `{HOSTING_COOKIE_DURATION}` `{LANG_COOKIE}`
`{LANG_COOKIE_DURATION}` `{RECENT_ADDRESS_COOKIE}` `{RECENT_ADDRESS_DURATION}`
`{ANALYTICS_COOKIE}` `{ANALYTICS_PROVIDER}` `{ANALYTICS_DURATION}` `{ERROR_COOKIE}`
`{ERROR_COOKIE_DURATION}` `{MARKETING_COOKIE}` `{MARKETING_PROVIDERS}` `{MARKETING_DURATION}`
`{NECESSARY_DURATION}` `{FUNCTIONAL_DURATION}` `{STORE_CONSENT_MONTHS}`.

Only real cookie names are printed on the page: `__stripe_mid`, `__stripe_sid`. The rest arrive
with instrumentation.

### Imprint — 4
`{UID_NUMBER}` (published nowhere) · `{PHOTOGRAPHY_CREDIT}` · `{BRAND_AGENCY_CREDIT}` ·
`{BUILD_AGENCY_CREDIT}`.

## D. Conflicts register — the 18, and where each is answered

| # | Conflict | Severity | Handled |
|---|---|---|---|
| 1 | Full refund vs 75/25 | critical | cancellation 01 flag · A2 |
| 2 | Third-party name in venue and data clauses | critical | terms 16 slot, 15 flag · A7 |
| 3 | Two controller addresses | critical | privacy 01 flag · A3 |
| 4 | Three contact emails incl. gmail | high | privacy 09 flag · A4 |
| 5 | Intermediary vs “our drivers” | critical | terms 01 flag · A1 |
| 6 | Payment lists disagree | high | terms 11 flag · A5 |
| 7 | €15 on a CHF operation | high | terms 04 flag |
| 8 | Unreplaced template token in the archive | high | not carried over |
| 9 | Privacy Shield | high | privacy 05 slot note |
| 10 | GDPR only, no revFADP | high | privacy stamp reads revFADP · GDPR |
| 11 | E-commerce “delivering the goods” | medium | not carried over |
| 12 | No cookie consent at all | high | cookies 08 flag + `CookieBanner` |
| 13 | Van capacity 7 vs 8 | medium | **reopened** — §H below; the booking-flow review of 4 Aug 2026 defaults Van to 7/8, contradicting this file's own "confirmed 8/8" note in §G. Not re-resolved here — see A13 |
| 14 | Account-only cancellation vs chat/WhatsApp | medium | cancellation 02 flag · A8 |
| 15 | SMS “on request” vs standard at 6 h | medium | terms 03, token `{DRIVER_DETAILS_LEAD_TIME}` |
| 16 | Imprint German, site English | medium | imprint is bilingual, DE leading |
| 17 | “Anywhere in the world” | medium | scope stated as pre-booked transfers, Zurich first (terms 02) |
| 18 | DPA inside the T&Cs | medium | lifted to privacy; terms 15 is a pointer, flagged |

## E. Not designed in this slice

About, Contact and the FAQ page — next slice. `manage-booking` is linked from the footer and from
cancellation 02 but does not exist yet. `become-a-partner` now has a light draft — see
`SPEC-become-a-partner.md` — held at wireframe fidelity until A12 lands.


---

## F. Token → i18n key map

**Decided 4 Aug 2026.** Single braces are what the Design Component engine needs, but the port
target is Next.js, where `{FREE_CANCEL_WINDOW}` is JSX interpolation of a bare identifier — an
undefined-variable build failure at best, a silently wrong render at worst. EN + DE is required
anyway, so each token maps **straight to an i18n key**, skipping the intermediate. The port is then
a mechanical find-replace, not 73 judgment calls.

### Convention

```
legal.<page>.<camelKey>      the five legal documents + the consent banner
site.<page>.<camelKey>       faq · contact · about
common.<camelKey>            any value that appears on more than one page
```

`legal.<page>` ∈ `terms · privacy · cookies · cancellation · imprint · banner`.

**The shared namespace is `common.*`, not `legal.common.*`.** Slice 2 broke the original name:
the driver-details lead time is now stated in the terms, twice on the FAQ and once on About, and
support languages appear on Contact and About. Facts cross the legal/content line, so the shared
namespace sits above both. Renamed here before anything is built on it.

Three rules that matter more than the shape:

1. **A shared fact gets exactly one key.** Ten tokens appear on two or more pages. Giving each page
   its own key is how the archive ended up with a 24-hour full refund in the FAQ and 75% in the
   terms. `legal.common.*` is the structural fix; see §D conflict 1.
2. **Values are whole translated strings, not numbers with a unit glued on.** `"60 minutes"` /
   `"60 Minuten"`, `"CHF 000"` / `"CHF 000"`. German does not always put the unit where English
   does, and a bare `60` forces the layout to guess.
3. **Keys stay stable when a value changes.** `freeCancelWindow` does not become `cancelWindow24h`
   when the client picks 24 hours.

### Shared — `common.*` (12)

| Token | Key | Appears on |
|---|---|---|
| `{AIRPORT_WAITING}` | `common.airportWaiting` | terms 08, cancellation 06 |
| `{STANDARD_WAITING}` | `common.standardWaiting` | terms 08, cancellation 06 |
| `{EXTRA_WAITING_RATE}` | `common.extraWaitingRate` | terms 04 + 08, cancellation 06 |
| `{NOSHOW_CALL_ATTEMPTS}` | `common.noShowCallAttempts` | terms 09, cancellation 06 |
| `{COMPLAINT_RESOLUTION_DAYS}` | `common.complaintResolutionDays` | terms 12, cancellation 08 |
| `{REFUND_PAYOUT_DAYS}` | `common.refundPayoutDays` | terms 12, cancellation 08 |
| `{ANALYTICS_PROVIDER}` | `common.analyticsProvider` | privacy 04, cookies 05, banner |
| `{ANALYTICS_DURATION}` | `common.analyticsDuration` | cookies 05, banner |
| `{MARKETING_PROVIDERS}` | `common.marketingProviders` | cookies 06, banner |
| `{MARKETING_DURATION}` | `common.marketingDuration` | cookies 06, banner |
| `{DRIVER_DETAILS_LEAD_TIME}` | `common.driverDetailsLeadTime` | terms 03, faq ×2, about |
| `{SUPPORT_LANGUAGES}` | `common.supportLanguages` | contact, about |

The last two **moved** in slice 2 — the lead time out of `legal.terms.*`, support languages out of
what would have been `site.contact.*` — the moment a second page stated them. That migration is
the rule working, and it is the check to run whenever a new page reuses a fact.

### `legal.terms.*` (10)

| Token | Key |
|---|---|
| `{TERMS_EFFECTIVE_DATE}` | `legal.terms.effectiveDate` |
| `{TERMS_VERSION}` | `legal.terms.version` |
| `{REGISTERED_FIRM_NAME}` | `legal.terms.registeredFirmName` |
| `{EXTRA_STOP_FEE}` | `legal.terms.extraStopFee` |
| `{CITY_STAY_MINUTES}` | `legal.terms.cityStayMinutes` |
| `{CITY_STAY_FEE}` | `legal.terms.cityStayFee` |
| `{OVERSIZE_ITEM_FEE}` | `legal.terms.oversizeItemFee` |
| `{CASE_DIMENSIONS}` | `legal.terms.caseDimensions` |
| `{PAYMENT_METHODS}` | `legal.terms.paymentMethods` |
| `{COMPLAINT_WINDOW_DAYS}` | `legal.terms.complaintWindowDays` |

### `legal.cancellation.*` (12)

| Token | Key |
|---|---|
| `{CANCELLATION_EFFECTIVE_DATE}` | `legal.cancellation.effectiveDate` |
| `{CANCELLATION_VERSION}` | `legal.cancellation.version` |
| `{FREE_CANCEL_WINDOW}` | `legal.cancellation.freeCancelWindow` |
| `{FULL_REFUND_SHARE}` | `legal.cancellation.fullRefundShare` |
| `{PARTIAL_REFUND_SHARE}` | `legal.cancellation.partialRefundShare` |
| `{NOSHOW_REFUND_SHARE}` | `legal.cancellation.noShowRefundShare` |
| `{LARGE_VEHICLE_SEATS}` | `legal.cancellation.largeVehicleSeats` |
| `{LARGE_VEHICLE_WINDOW}` | `legal.cancellation.largeVehicleWindow` |
| `{MODIFICATION_DEADLINE}` | `legal.cancellation.modificationDeadline` |
| `{DRIVER_NOSHOW_SHARE}` | `legal.cancellation.driverNoShowShare` |
| `{REFUND_DECISION_DAYS}` | `legal.cancellation.refundDecisionDays` |
| `{VOUCHER_VALIDITY}` | `legal.cancellation.voucherValidity` |

### `legal.privacy.*` (14)

| Token | Key |
|---|---|
| `{PRIVACY_EFFECTIVE_DATE}` | `legal.privacy.effectiveDate` |
| `{PRIVACY_VERSION}` | `legal.privacy.version` |
| `{DPO_OR_NOT_REQUIRED}` | `legal.privacy.dpo` |
| `{EU_REPRESENTATIVE}` | `legal.privacy.euRepresentative` |
| `{SUPABASE_REGION}` | `legal.privacy.supabaseRegion` |
| `{VERCEL_REGION}` | `legal.privacy.vercelRegion` |
| `{RESEND_REGION}` | `legal.privacy.resendRegion` |
| `{SENTRY_REGION}` | `legal.privacy.sentryRegion` |
| `{ANALYTICS_REGION}` | `legal.privacy.analyticsRegion` |
| `{ARCHIVING_YEARS}` | `legal.privacy.archivingYears` |
| `{FINANCE_RETENTION}` | `legal.privacy.financeRetention` |
| `{LOG_RETENTION}` | `legal.privacy.logRetention` |
| `{CONSENT_LOG_RETENTION}` | `legal.privacy.consentLogRetention` |
| `{DSR_RESPONSE_DAYS}` | `legal.privacy.dsrResponseDays` |

`archivingYears` is referenced twice inside the privacy page itself — retention row 06 and the
“we have to keep” card in 07. One key, two call sites: that pairing is the whole point of §2 in
`SPEC-privacy.md`, and it must not be allowed to split.

### `legal.cookies.*` (17)

| Token | Key |
|---|---|
| `{COOKIES_EFFECTIVE_DATE}` | `legal.cookies.effectiveDate` |
| `{COOKIES_VERSION}` | `legal.cookies.version` |
| `{SESSION_COOKIE}` | `legal.cookies.sessionCookie` |
| `{SESSION_DURATION}` | `legal.cookies.sessionDuration` |
| `{CONSENT_COOKIE}` | `legal.cookies.consentCookie` |
| `{CONSENT_DURATION}` | `legal.cookies.consentDuration` |
| `{STRIPE_COOKIE_DURATION}` | `legal.cookies.stripeDuration` |
| `{HOSTING_COOKIE}` | `legal.cookies.hostingCookie` |
| `{HOSTING_COOKIE_DURATION}` | `legal.cookies.hostingDuration` |
| `{LANG_COOKIE}` | `legal.cookies.langCookie` |
| `{LANG_COOKIE_DURATION}` | `legal.cookies.langDuration` |
| `{RECENT_ADDRESS_COOKIE}` | `legal.cookies.recentAddressCookie` |
| `{RECENT_ADDRESS_DURATION}` | `legal.cookies.recentAddressDuration` |
| `{ANALYTICS_COOKIE}` | `legal.cookies.analyticsCookie` |
| `{ERROR_COOKIE}` | `legal.cookies.errorCookie` |
| `{ERROR_COOKIE_DURATION}` | `legal.cookies.errorDuration` |
| `{MARKETING_COOKIE}` | `legal.cookies.marketingCookie` |

Cookie **names** are identifiers, not prose — they are the same string in both languages. They
still live in the i18n file rather than in a constant, so a translator never has to guess whether
a cell was left untranslated by mistake.

### `legal.banner.*` (3)

| Token | Key |
|---|---|
| `{NECESSARY_DURATION}` | `legal.banner.necessaryDuration` |
| `{FUNCTIONAL_DURATION}` | `legal.banner.functionalDuration` |
| `{STORE_CONSENT_MONTHS}` | `legal.banner.storeConsentMonths` |

### `legal.imprint.*` (6)

| Token | Key |
|---|---|
| `{IMPRINT_EFFECTIVE_DATE}` | `legal.imprint.effectiveDate` |
| `{IMPRINT_VERSION}` | `legal.imprint.version` |
| `{UID_NUMBER}` | `legal.imprint.uid` |
| `{PHOTOGRAPHY_CREDIT}` | `legal.imprint.photographyCredit` |
| `{BRAND_AGENCY_CREDIT}` | `legal.imprint.brandAgencyCredit` |
| `{BUILD_AGENCY_CREDIT}` | `legal.imprint.buildAgencyCredit` |

### `site.faq.*` (1)

| Token | Key |
|---|---|
| `{MEET_GREET_AIRPORTS}` | `site.faq.meetGreetAirports` |

### `site.contact.*` (4)

| Token | Key |
|---|---|
| `{SUPPORT_EMAIL}` | `site.contact.supportEmail` |
| `{RESPONSE_TIME}` | `site.contact.responseTime` |
| `{SUPPORT_HOURS}` | `site.contact.supportHours` |
| `{CHAT_HOURS}` | `site.contact.chatHours` |

Four more Contact values are **props, not tokens**, because they are URLs rather than copy:
`facebookUrl` `instagramUrl` `youtubeUrl` `trustpilotUrl`. They default to `#` and the link drops
out cleanly when an account does not exist.

### `site.about.*` (3)

| Token | Key |
|---|---|
| `{BUSINESS_PAX}` | `site.about.businessPax` |
| `{BUSINESS_BAGS}` | `site.about.businessBags` |
| `{DRIVER_LANGUAGES}` | `site.about.driverLanguages` |

**82 tokens · 82 keys · 12 of them shared.** Every key appears exactly once in this table, so the
find-replace is safe to run unattended.

---

## H. Slice 3 — booking flow (vehicle classes, flight tracking, hourly mode)

Added 4 Aug 2026 from a motion-and-correctness review of `home.dc.html` / `checkout.dc.html` /
`confirmation.dc.html`. Three new blocking decisions, one token family, one reopened conflict.

### New blocking decisions — A13–A15

| # | Decision | Where it lands | Why it blocks |
|---|---|---|---|
| A13 | **Vehicle class count & capacities** | home, checkout, confirmation | This review's spec states Economy 3/3 and Van 7/8 as an *unsupplied* default to tokenize. §G of this file says the client already confirmed Van at 8/8. Both can't be the settled answer — reopens conflict 13. Code now runs on the reviewer's 3/3 · 7/8 fixture, tokenized, pending whichever number is actually final |
| A14 | **Is automated flight-status tracking in V1 scope?** | home, flight field | `DECISIONS.md` says postpone it, `PROJECT-BRIEF.md` lists it out of V1, `INPUTS-NEEDED.md` carries it unticked — yet the field does live polling, ETA/gate/belt diffing and is one API key from AeroDataBox. Built and switchable (`flightTrackingEnabled` prop, default on); needs a yes/no before it ships live |
| A15 | **Is "by the hour" in V1 scope?** | home, mode tabs | `DECISIONS.md`: "if approved for launch." Tab stays; `hourlyEnabled` prop (default on) drops it cleanly — tabs, pill and field logic all degrade to two modes with no relayout |

### New tokens — 8, `common.*`

`{VEHICLE_CLASS_1_NAME}` `{VEHICLE_CLASS_1_MAX_PAX}` `{VEHICLE_CLASS_1_MAX_BAGS}` `{VEHICLE_CLASS_1_EXAMPLE}` ·
`{VEHICLE_CLASS_2_NAME}` `{VEHICLE_CLASS_2_MAX_PAX}` `{VEHICLE_CLASS_2_MAX_BAGS}` `{VEHICLE_CLASS_2_EXAMPLE}`.

A third–fifth class (the grid and capacity logic hold 2–5 with no relayout) follows the same
four-token pattern: `{VEHICLE_CLASS_3_NAME}` etc. Fixture default in code today: Economy 3
passengers / 3 bags, Van 7 passengers / 8 bags — placeholders per A13, not an answer.

| Token | Key | Appears on |
|---|---|---|
| `{VEHICLE_CLASS_n_NAME}` | `common.vehicleClass{n}Name` | home (fleet strip), checkout (price line, back-link), confirmation (voucher) |
| `{VEHICLE_CLASS_n_MAX_PAX}` | `common.vehicleClass{n}MaxPax` | home (capacity check, "Up to N passengers") |
| `{VEHICLE_CLASS_n_MAX_BAGS}` | `common.vehicleClass{n}MaxBags` | home (capacity check, "Up to N bags") |
| `{VEHICLE_CLASS_n_EXAMPLE}` | `common.vehicleClass{n}Example` | home (fleet card subtitle) |

### Fixed this pass, not tokens

- `quote.dc.html` deleted (was orphaned, carried its own 3-class taxonomy and a 4-step
  indicator that contradicted checkout's 3-step one — conflict, not a content gap).
- Home and checkout now write/read the same vehicle-id vocabulary (`economy` / `van`); no
  more silent fallback-to-"Business" at checkout.

## G. Slice 2 — FAQ, Contact, About

### New tokens — 9

`{MEET_GREET_AIRPORTS}` · `{SUPPORT_EMAIL}` · `{RESPONSE_TIME}` · `{SUPPORT_HOURS}` ·
`{SUPPORT_LANGUAGES}` · `{CHAT_HOURS}` · `{BUSINESS_PAX}` · `{BUSINESS_BAGS}` ·
`{DRIVER_LANGUAGES}`

Archive references, for context only: support languages were "EN primary; DE, AR, FR where
feasible"; the driver-details lead time was 6 h, expedited on 24 h notice.

### New content slots — 5

| Slot | Page | What it must be |
|---|---|---|
| Coverage list | about | Cities, resorts and cross-border destinations, and which are seasonal. Fills About **and** the booking flow's destination list — one answer, two places |
| Founder portrait | about | Ben Othman Houssein, cool daylight, no studio. A founder-led story with a stock face is worse than one with none |
| Economy vehicle | about | Clean, dark, cool daylight, no people |
| Business vehicle | about | Same register. Until both exist, these classes fall back to an icon tile in the booking flow |
| Social & review URLs | contact | Facebook · Instagram · YouTube · Trustpilot. A profile exists for the domain but no URL was ever linked |

### Facts stated as fact, not tokens

Economy 3 passengers / 3 medium cases and Van 8 / 8 — the client confirmed these, so they are
written plainly. **Business capacity was never given**, which is why it is the one class carrying
tokens. Van appears as 7/8 on the archived booking page and 8/8 in the terms example (conflict 13);
the confirmed 8/8 is used.

### What slice 2 does *not* contain

No refund share, cancellation window, waiting allowance, baggage dimension or fee appears on the
FAQ, Contact or About page. Every one of them defers to the page that owns it. That is the
structural answer to conflict 1, and it is the rule to enforce on every page added after this.
