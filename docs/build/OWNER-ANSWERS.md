# Owner answers — content & photography review

Recorded 13 Aug 2026, transcribed 17 Aug 2026. This is the owner's own answer sheet against
`docs/build/Content & Photography Checklist.dc.html` and `Owner Content Review.dc.html`.
Answers here are authoritative; `docs/build/OPEN-QUESTIONS.md` carries the engineering
consequence of each one, cross-referenced by question number.

Anything marked **(blank)** was left unanswered and stays blocked. Nothing on this page is
guessed, and no CHF figure, policy number or capacity is invented to unblock work — a blank
keeps its `data-tok` TBC pill on the live page.

---

## Decisions

| # | Question | Answer | Consequence |
|---|---|---|---|
| 1 | Carrier or booking intermediary? | **Carrier** — Vamos is directly liable for the ride | Terms 01/05/13 rewritten; archive liability disclaimer must not be carried over. See Q23 |
| 2 | Cancellation refund policy | **Tiered** — 100 % refund more than 24 h before pickup, 75 % inside 24 h, nothing for a no-show | Refund logic + cancellation page. See Q13 |
| 3 | Company address | "Zürich, Switzerland" — **street and postcode still blank** | Imprint stays on `data-tok` until the full address lands |
| 4 | Official support address | `contact@vamostaxi.eu` | Contact page, email templates, Resend sender |
| 5 | Payment methods accepted | Visa, Mastercard, Apple Pay, TWINT, PayPal | PayPal dropped from V1 on 2026-08-17 (Stripe has no CH PayPal support). Google Pay added free with Apple Pay. Cash-to-driver **not listed** → treated as out, needs confirmation. See Q16 |
| 6 | Analytics tool | **(blank)** | Nothing wired. Cloudflare Web Analytics (cookieless) vs PostHog (consent-gated) still to choose. See Q22 |
| 7 | Court of venue | **Zürich** | Terms, imprint |
| 8 | Cancellation channels | Chat, WhatsApp or email | Additive to the self-serve button, not a replacement. See Q14 |
| 9 | Is a cookie choice logged server-side? | "Not sure — ask engineering" | **Engineering answer: yes.** A browser-only cookie cannot prove consent to a Swiss nFADP or GDPR regulator. Adds a `consent_log` table. See Q22 |
| 10 | Is crash reporting strictly necessary? | **Strictly necessary — always on** | Built as decided, with the caveat that Sentry transmits IP and URL data and is commonly treated as consent-requiring. Toggle lives in `settings`. See Q22 |
| 11 | Live chat in V1? | **Yes** | Scoped 2026-08-17 to a **WhatsApp deep link**, not a third-party widget or an in-house build — no chat exists in any mock, and a vendor widget conflicts with the design system and the cookie banner |
| 12 | "Become a driver" page | **Build it for launch** | `app/pages/become-a-partner.dc.html` ports; needs the four blanks below |
| 13 | Vehicle lineup | **Economy 3/3, Business, Van 8/8 — three classes** | `first` does not ship. Van is 8/8, not 7/8. Business capacity still blank. See Q5–Q7 |
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
