# Content & legal — client checklist

**Built:** 4 Aug 2026 · **Pages:** terms · privacy · cookies · cancellation · imprint · faq ·
contact · about · plus the shared `CookieBanner`
**Reconciled:** 18 Aug 2026, walked against `docs/build/OWNER-ANSWERS.md` — the 13 Aug 2026
owner answers plus the 17 Aug 2026 engineering scoping notes carried in the same file.
**Total open items:** 90 tokens catalogued (§C 73 + §G 9 + §H 8) — measured live in `app/`:
121 `data-tok` pills, 90 unique pill labels (89 distinct facts + 1 dynamic binding,
`{{ shareLabel }}` at `app/pages/manage-booking.dc.html:557`, which resolves to three shares
already counted). The `173` figure that circulates elsewhere is a grep artifact, not a content
count — it is 121 pills plus 41 `[data-tok]` CSS selector lines plus 8 `data-tok-fig="1"` plus
3 `[data-tok-fig]` selectors. The catalogue's 90 and the live 90 are **not proven to be the
same 90**: §F carries 82 keys and 8 live pill labels have no key at all (closed in task 3
below), so the two sets have not been matched item by item and this pass does not claim they
have. 17 legal-text slots (Terms 8 + Privacy 2 + Cancellation 3 + Imprint 4 + Cookies 0 —
corrected from a stale `18`; §B's own heading and table already say 17) · 5 content/image
slots · 15 blocking decisions — 10 resolved, 4 resolved with a named residual, 1 open ·
25 documented conflicts (the original 18 plus C19–C25 registered below; `(1 reopened)` is
dropped because conflict 13 is closed by decision 13) · 10 photography slots (per
`OWNER-ANSWERS.md`), every one blank — 1 of them ("First" class) is moot after decision 13,
so 9 are live.

Legend: **RESOLVED** closed by a dated owner answer · **RESOLVED (residual)** answered, but a named gap survives · **RESOLVED (mocks stale)** the decision is made, the mocks still say the old thing · **CLOSED BY DESIGN** settled before 13 Aug 2026 by the design work itself, not an owner answer · **OPEN** not closed, including "structure settled, value still TBC".

One list across both slices. Slice 1 was the legal core; slice 2 added FAQ, Contact and About.

Every value below is either missing, or present but contradicted somewhere else. Nothing in the
design asserts any of them. Figures quoted as *archive* come from Wayback captures of
vamostaxi.eu dated 2024-07-14 to 2024-09-13 — a site that is currently offline — and are
recorded as evidence of what the old site said, **not** as the answer.

---

## A. Decisions that block everything else

| # | Decision | Where it lands | Why it blocks |
|---|---|---|---|
| A1 | **Carrier or intermediary?** | terms 01, 05, 13 · about | The archive disclaims liability for the ride while marketing sells “our drivers”. Liability, subcontracting and the About page all follow from this one answer. **RESOLVED** — decision 1, 13 Aug 2026: Carrier, directly liable. Archive liability disclaimer must not be carried over |
| A2 | **The three refund shares** | cancellation 01 | FAQ promised a full refund ≤24h; terms grant 75% and keep 25%. Both are live consumer promises. **RESOLVED (residual)** — decision 2, 13 Aug 2026: 100% more than 24 h before pickup, 75% inside 24 h, nothing for a no-show. Residual: the refund share when *our* driver fails to show (`{DRIVER_NOSHOW_SHARE}`) is still blank on the owner sheet |
| A3 | **Controller address** | privacy 01 | Archive gives Badenerstrasse 582, 8048 Zürich; imprint and terms give Bleicherstrasse 16, Dietikon. **RESOLVED (residual)** — decision 3, 13 Aug 2026: "Zürich, Switzerland". The two-address conflict is dead — neither archive address is authoritative. Residual: street and postcode |
| A4 | **One contact address** | all five pages | `info@vamostaxi.eu` vs `contact@vamostaxi.eu` vs a personal gmail in the terms. **RESOLVED** — decision 4, 13 Aug 2026: `contact@vamostaxi.eu`. Six mock sites still ship `info@vamostaxi.eu`; listed in §I |
| A5 | **One payment-method list** | terms 11 · footer | Terms: Amex, Visa, Mastercard, cash, bank transfer. FAQ: Visa, Mastercard, Apple Pay, TWINT, PayPal. **RESOLVED (residual)** — decision 5, 13 Aug 2026 + 17 Aug 2026: Visa, Mastercard, Apple Pay, Google Pay, TWINT. PayPal out of V1 (Stripe has no CH PayPal support). Residual: cash-to-driver is absent from the accepted list, so it reads as out, and needs one word of owner confirmation before the mock option is removed |
| A6 | **Which analytics tool** | cookies 05 · privacy 04 | Vercel Analytics vs PostHog vs retiring Google Analytics. **OPEN** — decision 6 left blank 13 Aug 2026. Vercel Analytics is off the table with the stack change; the live choice is Cloudflare Web Analytics (cookieless) vs PostHog (consent-gated). Blocks `{ANALYTICS_COOKIE}` `{ANALYTICS_PROVIDER}` `{ANALYTICS_DURATION}` `{ANALYTICS_REGION}`, cookies 05 and the banner |
| A7 | **Court of venue** | terms 16 | The archived clause puts venue at a third party's registered office. **RESOLVED** — decision 7, 13 Aug 2026: Zürich |
| A8 | **Cancellation channels** | cancellation 02 | Terms say account only; FAQ says chat / WhatsApp / email. **RESOLVED** — decision 8, 13 Aug 2026 + Q14: chat, WhatsApp or email, additive to the self-serve button, not a replacement |
| A9 | **Is consent logged server-side?** | cookies · privacy 06 | Changes the consent-log retention row and the engineering work. **RESOLVED** — decision 9, 13 Aug 2026: owner deferred to engineering; engineering answer is yes, consent is logged server-side, adding a `consent_log` table. A browser-only cookie cannot prove consent to a Swiss nFADP or GDPR regulator |
| A10 | **Is Sentry strictly-necessary or consent-gated?** | cookies 03 vs 05 · privacy 04 | Error monitoring is arguably necessary for service integrity and arguably analytics. It currently sits in **Analytics**, so declining analytics turns off crash reporting. Nobody has made this call. **RESOLVED** — decision 10, 13 Aug 2026: crash reporting is strictly necessary and always on, moved out from under the Analytics toggle, with the recorded caveat that Sentry transmits IP and URL data. Toggle lives in `settings` |
| A11 | **Does live chat exist in V1?** | contact · FAQ ×3 · footer | The legacy site ran a chat widget and promises "Customer Service 24/7 · Start a Chat". Chat is not in the scope of work. If it is dropped, three FAQ answers and the footer change. **RESOLVED** — decision 11, 13 Aug 2026, scoped 17 Aug 2026: live chat is a WhatsApp deep link, not a third-party widget and not an in-house build |
| A12 | **Build `become-a-partner`, or unlink it?** | footer Company column · About CTA | It was orphaned, so the footer now links it — but the page is not in V1 scope and it is a real funnel (application, background check, vehicle inspection, consent checkbox bound to Terms + Privacy). A footer link to a page that does not exist is worse than neither. **A light draft now exists** (`become-a-partner.dc.html`, 5 Aug 2026 — structure, fields and copy only, no photography). Still unanswered: if the call is *unlink*, delete that file and remove the footer link plus the About CTA. **RESOLVED** — decision 12, 13 Aug 2026: build `become-a-partner` for launch. The unlink branch is dead; the four blanks on that page stay open (see §C/§F work in task 3) |

### What actually survives — five residuals

`.planning/BLOCKER-SOLVE-PLAN.md` predicted three residuals (A3, A6, and the driver-no-show
share inside A2). The true count is **five residuals**, because A5 and A13 also survive the
13 Aug 2026 answers. Each row below names an owner and what it blocks — no guessed value
anywhere.

| residual | inside | owner | blocks |
|---|---|---|---|
| driver-no-show refund share | A2 | owner | `{DRIVER_NOSHOW_SHARE}`, cancellation 01, refund logic |
| street and postcode | A3 | owner | imprint, privacy 01, `{UID_NUMBER}` neighbourhood |
| cash-to-driver: in or out | A5 | owner (one word) | checkout payment options, `{PAYMENT_METHODS}` |
| which analytics tool | A6 | owner, engineering can recommend | four analytics tokens, cookies 05, banner |
| Business passenger and bag capacity | A13 | owner | `{BUSINESS_PAX}` `{BUSINESS_BAGS}`, About, booking flow |

This register is not the same list as the page-by-page blanks in `OWNER-ANSWERS.md` — those are
data gaps that were never decisions. These five are the residue of decisions that *were*
answered, which is exactly what Stream 3 needs to see separated.

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

## C. Tokens by page — 73 in slice 1 (subtotal; 82 with §G's 9, 90 with §H's 8 — see the header's live-pill figures)

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
`{DRIVER_DETAILS_LEAD_TIME}` (archive 6 h — **OPEN**, §D conflict 15, ties to C21) ·
`{PAYMENT_METHODS}` (**RESOLVED (residual)** — decision 5, 13 Aug 2026 + 17 Aug 2026: Visa, Mastercard, Apple Pay, Google Pay, TWINT; PayPal out of V1; cash-to-driver unconfirmed, the A5 residual) ·
`{COMPLAINT_WINDOW_DAYS}` (archive 10).

### Cancellation — 10 more
`{FREE_CANCEL_WINDOW}` (archive 24 h, ≤15 seats — decision 2, 13 Aug 2026 states "more than 24 h
before pickup" verbatim, so 24 h is stated, not inferred; **but** the page-by-page blanks in
`OWNER-ANSWERS.md` still list the free-cancellation window as unanswered. That is an internal
inconsistency inside the owner sheet, resolved here in favour of the explicit decision, and
flagged for a one-line owner confirmation — neither side is dropped silently) ·
`{FULL_REFUND_SHARE}` / `{PARTIAL_REFUND_SHARE}` (**RESOLVED** — decision 2, 13 Aug 2026: 100%
more than 24 h before pickup carries `{FULL_REFUND_SHARE}`, 75% inside 24 h carries
`{PARTIAL_REFUND_SHARE}` — the archive's 75/25 framing this table quoted is superseded, not
confirmed) · `{NOSHOW_REFUND_SHARE}` (**RESOLVED** — decision 2, 13 Aug 2026: nothing for a
no-show) ·
`{LARGE_VEHICLE_SEATS}` (archive 15 — **OPEN**, §D conflict C20) ·
`{LARGE_VEHICLE_WINDOW}` (archive 5 days — **OPEN**, §D conflict C20) ·
`{MODIFICATION_DEADLINE}` · `{DRIVER_NOSHOW_SHARE}` (archive 80% — **OPEN**, the A2 residual; a
different fact from `{NOSHOW_REFUND_SHARE}` above and one careless read apart from it) ·
`{REFUND_DECISION_DAYS}` ·
`{VOUCHER_VALIDITY}` (archive: “valid next year”).

### Privacy — 12
`{DPO_OR_NOT_REQUIRED}` · `{EU_REPRESENTATIVE}` · `{SUPABASE_REGION}` · `{VERCEL_REGION}`
(**flagged** — the platform is Cloudflare Workers, not Vercel, per Q21, 17 Aug 2026 and
`.planning/PROJECT.md`; naming Vercel on the privacy page is a false subprocessor disclosure.
The token and its key `legal.privacy.vercelRegion` need renaming, landing with the mock edit
pass in §I so the doc and the code move together — the key cell in §F is not rewritten now. The
region *value* stays open: data residency is still with counsel per `.planning/STATE.md`) ·
`{RESEND_REGION}` · `{SENTRY_REGION}` (values still open, no longer under the Analytics toggle —
decision 10, 13 Aug 2026: error monitoring is strictly necessary and always on) ·
`{ANALYTICS_REGION}` (blocked on A6, **OPEN**) · `{ARCHIVING_YEARS}` (archive: 10,
Swiss Archiving Act — lead passenger name, passenger count, email, start and destination) ·
`{FINANCE_RETENTION}` · `{LOG_RETENTION}` · `{CONSENT_LOG_RETENTION}` · `{DSR_RESPONSE_DAYS}`.

### Cookies + banner — 22
`{SESSION_COOKIE}` `{SESSION_DURATION}` `{CONSENT_COOKIE}` `{CONSENT_DURATION}`
`{STRIPE_COOKIE_DURATION}` `{HOSTING_COOKIE}` `{HOSTING_COOKIE_DURATION}` `{LANG_COOKIE}`
`{LANG_COOKIE_DURATION}` `{RECENT_ADDRESS_COOKIE}` `{RECENT_ADDRESS_DURATION}`
`{ANALYTICS_COOKIE}` `{ANALYTICS_PROVIDER}` `{ANALYTICS_DURATION}` `{ERROR_COOKIE}`
(**RESOLVED** — decision 10, 13 Aug 2026: strictly necessary, always on, value still open)
`{ERROR_COOKIE_DURATION}` (**RESOLVED** — decision 10, 13 Aug 2026: strictly necessary, always
on, value still open) `{MARKETING_COOKIE}` `{MARKETING_PROVIDERS}` `{MARKETING_DURATION}`
`{NECESSARY_DURATION}` `{FUNCTIONAL_DURATION}` `{STORE_CONSENT_MONTHS}`.

The four analytics tokens (`{ANALYTICS_COOKIE}` `{ANALYTICS_PROVIDER}` `{ANALYTICS_DURATION}`
`{ANALYTICS_REGION}`) are blocked on A6, which is **OPEN**. The two candidates — Cloudflare Web
Analytics (cookieless) and PostHog (consent-gated) — are named here as the choice, not as an
answer.

Only real cookie names are printed on the page: `__stripe_mid`, `__stripe_sid`. The rest arrive
with instrumentation.

### Imprint — 4
`{UID_NUMBER}` (published nowhere) · `{PHOTOGRAPHY_CREDIT}` · `{BRAND_AGENCY_CREDIT}` ·
`{BUILD_AGENCY_CREDIT}`.

## D. Conflicts register — 25, and where each is answered

| # | Conflict | Severity | Handled |
|---|---|---|---|
| 1 | Full refund vs 75/25 | critical | cancellation 01 flag · A2. **RESOLVED** — decision 2, 13 Aug 2026: tiered, 100% more than 24 h before pickup, 75% inside 24 h, nothing for a no-show |
| 2 | Third-party name in venue and data clauses | critical | terms 16 slot, 15 flag · A7. **RESOLVED** — decision 7, 13 Aug 2026: Zürich |
| 3 | Two controller addresses | critical | privacy 01 flag · A3. **RESOLVED** — decision 3, 13 Aug 2026: "Zürich, Switzerland" — neither archive address is authoritative. Street and postcode remain the A3 residual |
| 4 | Three contact emails incl. gmail | high | privacy 09 flag · A4. **RESOLVED (mocks stale)** — decision 4, 13 Aug 2026 chose `contact@vamostaxi.eu`, yet `info@vamostaxi.eu` still ships in six places. See §I |
| 5 | Intermediary vs “our drivers” | critical | terms 01 flag · A1. **RESOLVED** — decision 1, 13 Aug 2026: carrier |
| 6 | Payment lists disagree | high | terms 11 flag · A5. **RESOLVED** — decision 5, 13 Aug 2026 + 17 Aug 2026: Visa, Mastercard, Apple Pay, Google Pay, TWINT. Cash-to-driver is the A5 residual |
| 7 | €15 on a CHF operation | high | terms 04 flag. **OPEN** — the archive €15 is deliberately not carried over; the shape is fixed (a CHF figure belongs here), only the number is missing |
| 8 | Unreplaced template token in the archive | high | not carried over. **CLOSED BY DESIGN** — was never waiting on the owner |
| 9 | Privacy Shield | high | privacy 05 slot note. **CLOSED BY DESIGN** — was never waiting on the owner |
| 10 | GDPR only, no revFADP | high | privacy stamp reads revFADP · GDPR. **CLOSED BY DESIGN** — was never waiting on the owner |
| 11 | E-commerce “delivering the goods” | medium | not carried over. **CLOSED BY DESIGN** — was never waiting on the owner |
| 12 | No cookie consent at all | high | cookies 08 flag + `CookieBanner`. **CLOSED BY DESIGN** — was never waiting on the owner |
| 13 | Van capacity 7 vs 8 | medium | **RESOLVED** — decision 13, 13 Aug 2026: Van 8/8. Retires the `**reopened**` note previously in this cell and the `(1 reopened)` note in the header — see A13 |
| 14 | Account-only cancellation vs chat/WhatsApp | medium | cancellation 02 flag · A8. **RESOLVED** — decision 8, 13 Aug 2026 + Q14: additive channels, chat/WhatsApp/email alongside the self-serve button |
| 15 | SMS “on request” vs standard at 6 h | medium | terms 03, token `{DRIVER_DETAILS_LEAD_TIME}`. **OPEN** — the shape is fixed (a lead-time figure belongs here), archive 6 h is evidence, not the answer; only the number is missing |
| 16 | Imprint German, site English | medium | The bilingual answer is not available under Law 03 (four languages, same pass, in `CLAUDE.md`): the imprint must ship in en/de/fr/ar like every other surface, or carry `data-vt-legal` naming the languages the text actually exists in. **OPEN** |
| 17 | “Anywhere in the world” | medium | scope stated as pre-booked transfers, Zurich first (terms 02). **CLOSED BY DESIGN** — was never waiting on the owner |
| 18 | DPA inside the T&Cs | medium | lifted to privacy; terms 15 is a pointer, flagged. **CLOSED BY DESIGN** — was never waiting on the owner |
| C19 | Airport-waiting allowance promised as fact while its token is TBC | critical | `{AIRPORT_WAITING}` is an open `data-tok` pill on terms and cancellation, and `OWNER-ANSWERS.md` leaves free airport waiting time blank — yet plain copy asserts 60 minutes at `app/home/home.dc.html:759` and `:791` (en), `:817` and `:849` (de), `:875` (fr); `app/home/HowItWorks.dc.html:205`; `app/pages/account.dc.html:255`; `app/vamos-i18n-dict.js:180`, `:314`, `:316`, `:1321`; `app/vamos-ops-data.js:298`. Same failure mode as conflict 1: a live consumer promise contradicting the page that owns the fact. **OPEN** |
| C20 | Invented figures on a legal page | critical | `app/pages/cancellation.dc.html:208` states that vehicles over 8 seats work to a longer window of 72 hours, as plain fact inside `data-tok-fig` wrappers — which are typographic only and render no TBC suffix. `{LARGE_VEHICLE_SEATS}` and `{LARGE_VEHICLE_WINDOW}` are both open, and §C records archive values of 15 seats / 5 days, which those two figures match neither. Direct Law 04 breach on a consumer legal page. **OPEN** |
| C21 | Invented driver-assignment lead time | high | `app/home/HowItWorks.dc.html:196` states a named driver is assigned at −24 h as fact; `{DRIVER_DETAILS_LEAD_TIME}` is open (archive 6 h). Ties to conflict 15. **OPEN** |
| C22 | `data-vt-legal` asserts language coverage that does not exist | high | All five legal pages carry `data-vt-legal="en de fr ar"` (`app/pages/terms.dc.html:109`, `privacy.dc.html:117`, `cookies.dc.html:130`, `cancellation.dc.html:120`, `imprint.dc.html:124`) and `terms.dc.html:123` prints the four language names — while `docs/build/i18n-todo.txt` lists 438 untranslated legal strings (terms 102, privacy 107, imprint 98, cookies 49, cancellation 82). The attribute exists precisely to stop this pretence. Feeds Stream 5 and interacts with #16. **OPEN** |
| C23 | Doc contradicts code | low | §H asserts `flightTrackingEnabled` has "default on"; `app/home/home.dc.html:505` declares `"default":false`. The §H note is what Phase 2 would read. Corrected in §H by task 1; registered here so the correction is traceable. **OPEN** |
| C24 | Real-looking company identity hard-coded in a seed while its tokens are open | critical | `app/vamos-ops-data.js:317` seeds `company: 'Vamos Taxi GmbH'`, `:318` seeds `address: 'Bleicherstrasse 16, 8953 Dietikon ZH'`, `:319` seeds `uid: 'CH-020.4.077.792-7'`, `:320` seeds `phone: '+41 79 626 70 82'` and `:321` seeds `email: 'info@vamostaxi.eu'` — while every other value in the same SETTINGS fixture is a visible placeholder (`ZH 000 001`, `+41 00 000 00 00`, `year:'0000'`, `CHF 000`), which makes these five stand out as deliberate real data rather than scaffolding. Each contradicts an open item: `{REGISTERED_FIRM_NAME}` is open and §C records the register says *Vamos Taxi*, no GmbH; A3 was answered "Zürich, Switzerland" and the Dietikon street address is one of the two disputed archive addresses that answer explicitly rejected; `{UID_NUMBER}` is recorded in §C as published nowhere; A4 chose `contact@vamostaxi.eu`. A company registration number sitting in a fixture is the specific case `CLAUDE.md`'s never-invent rule names — not even in a test, a seed, a fixture or an example. The owner must confirm whether these five are the real registered values or were filled in to make the ops screens look populated; until then they must not be relied on and must not reach a rendered surface. The email at `:321` is already listed in §I under the A4 fix — this row registers the other four and the pattern, not re-registering that line. **OPEN** |
| C25 | Arabic fallback hotlinks a third-party font CDN before consent | high | `app/vamos-locale.js:296–301` injects a `<link id="vt-ar-font">` to `https://fonts.googleapis.com/css2?family=Noto+Sans+Arabic:wght@400;500;600;700&display=swap` whenever Arabic is selected, and `:288–289` set `--vt-font-body`/`--vt-font-display` to lead with `'Noto Sans Arabic'`. Every Arabic page load discloses the visitor's IP address and user-agent to Google, and the link fires before any consent interaction. Google is absent from the privacy page's subprocessor list (Cloudflare, Supabase, Stripe, Resend, Mapbox, AeroDataBox and Sentry, per Q21/A6 in `OPEN-QUESTIONS.md`). This is a **data-protection** finding, not a licensing one — Noto Sans Arabic is itself OFL and free to vendor; the hotlink is the problem. It also contradicts this repository's own practice, where the Lucide icons, both type families and the Lenis scroll runtime are all vendored locally rather than hotlinked. Remedy — vendor an open-licence Arabic face into `design-system/assets/fonts/` and drop the CDN `<link>` — is a code change belonging with the other mock edits in §I and is **not performed in this pass**. See `.planning/ADR-009-qurova-webfont-licence.md` for the full write-up alongside the related Qurova licence question. **OPEN** |

25 conflicts — 7 resolved by the 13 Aug answers (#1, #2, #3, #5, #6, #13, #14), 7 closed by
design before them (#8, #9, #10, #11, #12, #17, #18), 1 resolved with stale mocks (#4), 10 open
(#7, #15, #16, C19–C25).

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

**Four namespaces close the eight-label gap found in the 18 Aug 2026 reconciliation pass**
(task 3 of the Stream 1 quick task). `site.signIn.*`, `site.resetPassword.*` and
`site.account.*` extend the existing `site.<page>.*` pattern to three pages that carried live
`data-tok` pills but no §F entry; `site.becomeAPartner.*` does the same for the page decision 12
brought into V1 scope. A fifth namespace is new in kind, not just in name: **`ops.<page>.<camelKey>`**
for the one fact that lives only on the staff sign-in screen (`app/ops/AuthForm.dc.html`) —
`site.*` was defined for customer-facing content (faq · contact · about) and the ops console is
a separate signed-in surface (`CLAUDE.md`: "the ops console is the one exception"), so it gets
its own top-level namespace rather than being folded into `site.*`.

### Shared — `common.*` (12)

| Token | Key | Appears on |
|---|---|---|
| `{AIRPORT_WAITING}` | `common.airportWaiting` | terms 08, cancellation 06 |
| `{STANDARD_WAITING}` | `common.standardWaiting` | terms 08, cancellation 06 |
| `{EXTRA_WAITING_RATE}` | `common.extraWaitingRate` | terms 04 + 08, cancellation 06 |
| `{NOSHOW_CALL_ATTEMPTS}` | `common.noShowCallAttempts` | terms 09, cancellation 06 |
| `{COMPLAINT_RESOLUTION_DAYS}` | `common.complaintResolutionDays` | terms 12, cancellation 08 |
| `{REFUND_PAYOUT_DAYS}` | `common.refundPayoutDays` | terms 12, cancellation 08 · also `booking-detail.dc.html:312` and `manage-booking.dc.html:558`, labelled "Refund payout time" — one fact, two wordings, collapsed here per rule 1; normalise the wording in the mock pass (§I) |
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

`{MODIFICATION_DEADLINE}` / `legal.cancellation.modificationDeadline` is also labelled "Change
deadline" at `manage-booking.dc.html:459` and `:481` (two call sites, one fact — same pairing
rule as `archivingYears` above). One fact, two wordings, collapsed here per rule 1; normalise
the wording in the mock pass (§I).

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

### `site.signIn.*` (1) — new, closes a key gap

| Token | Key | Appears on |
|---|---|---|
| `{SIGNIN_LINK_EXPIRY}` | `site.signIn.linkExpiry` | sign-in — `app/pages/AuthForm.dc.html:193` ("Link expiry") |

### `ops.signIn.*` (1) — new namespace, closes a key gap

| Token | Key | Appears on |
|---|---|---|
| `{OPS_SIGNIN_LINK_EXPIRY}` | `ops.signIn.linkExpiry` | ops sign-in — `app/ops/AuthForm.dc.html:193` ("Link expiry") |

### `site.resetPassword.*` (2) — new, closes a key gap

| Token | Key | Appears on |
|---|---|---|
| `{RESET_LINK_EXPIRY}` | `site.resetPassword.linkExpiry` | reset-password — `app/pages/ResetForm.dc.html:152` ("Link expiry") |
| `{PASSWORD_POLICY}` | `site.resetPassword.passwordPolicy` | reset-password — `app/pages/ResetForm.dc.html:110` ("Password policy") |

### `site.account.*` (3) — new, closes a key gap

| Token | Key | Appears on |
|---|---|---|
| `{CODE_EXPIRY}` | `site.account.codeExpiry` | account (phone verification) — `app/pages/PhoneVerify.dc.html:110` ("Code expiry"), hosted by `app/pages/account.dc.html:346` |
| `{CODE_ATTEMPTS}` | `site.account.codeAttempts` | account (phone verification) — `app/pages/PhoneVerify.dc.html:110` ("Code attempts"), hosted by `app/pages/account.dc.html:346` |
| `{RECORD_RETENTION}` | `site.account.recordRetention` | account — `app/pages/account.dc.html:424` ("Record retention") |

### `site.becomeAPartner.*` (3) — new, closes a key gap, in scope per decision 12

| Token | Key | Appears on |
|---|---|---|
| `{REQUIRED_PERMITS}` | `site.becomeAPartner.requiredPermits` | become-a-partner — `app/pages/become-a-partner.dc.html:222` ("Required permits") |
| `{PARTNER_VEHICLE_CLASSES}` | `site.becomeAPartner.partnerVehicleClasses` | become-a-partner — `app/pages/become-a-partner.dc.html:213` ("Partner vehicle classes") |
| `{PARTNER_REPLY_TIME}` | `site.becomeAPartner.partnerReplyTime` | become-a-partner — `app/pages/become-a-partner.dc.html:133`, `:273` ("Partner reply time") |

**Open question on the three link-expiry keys — not resolved here.** Whether
`{SIGNIN_LINK_EXPIRY}`, `{OPS_SIGNIN_LINK_EXPIRY}` and `{RESET_LINK_EXPIRY}` are the same
underlying value (one magic-link/reset-link TTL) or three genuinely different settings is not
established by any evidence in `OWNER-ANSWERS.md` or the mocks. Nor is it established whether
any of the three matches the guest manage-booking link expiry that `OWNER-ANSWERS.md`'s
page-by-page blanks list separately (no live `data-tok` pill for that one was found in `app/`).
Per §F rule 1, a shared fact gets exactly one key — but rule 1 does not license a guess: each
surface keeps its own key, registered separately above, until the owner or engineering confirms
sameness.

**92 keys registered in this table** — the 82 recorded 4 Aug 2026, plus the ten added in this
18 Aug 2026 pass to close the eight-label gap (three of the ten for the Link expiry family
alone, kept separate rather than merged, per the open question above). That is a distinct
figure from §H's 8 vehicle-class keys, which sit outside this table, and from the 90 live
unique pill labels measured in `app/` (89 distinct facts + 1 dynamic binding). The three counts
— 92, 8, 90 — are **not proven to match item for item**; closing that gap is an open
reconciliation item, not a number to round into a tidy match nobody performed. Every key that is
here appears exactly once in this table, so the find-replace over the recorded set is safe to
run unattended.

---

## H. Slice 3 — booking flow (vehicle classes, flight tracking, hourly mode)

Added 4 Aug 2026 from a motion-and-correctness review of `home.dc.html` / `checkout.dc.html` /
`confirmation.dc.html`. Three new blocking decisions, one token family, one reopened conflict.

### New blocking decisions — A13–A15

| # | Decision | Where it lands | Why it blocks |
|---|---|---|---|
| A13 | **Vehicle class count & capacities** | home, checkout, confirmation | This review's spec states Economy 3/3 and Van 7/8 as an *unsupplied* default to tokenize. §G of this file says the client already confirmed Van at 8/8. Both can't be the settled answer — reopens conflict 13. Code now runs on the reviewer's 3/3 · 7/8 fixture, tokenized, pending whichever number is actually final. **RESOLVED (residual)** — decision 13, 13 Aug 2026 + Q5/Q6: three classes, Economy 3/3, Van 8/8, `first` does not ship. This closes §D conflict 13's reopening: §G's confirmed 8/8 stands and §H's 7/8 fixture is superseded. Residual: Business passenger and bag capacity |
| A14 | **Is automated flight-status tracking in V1 scope?** | home, flight field | `DECISIONS.md` says postpone it, `PROJECT-BRIEF.md` lists it out of V1, `INPUTS-NEEDED.md` carries it unticked — yet the field does live polling, ETA/gate/belt diffing and is one API key from AeroDataBox. Built and switchable (`flightTrackingEnabled` prop, default on); needs a yes/no before it ships live. **RESOLVED** — decision 14, 13 Aug 2026, scoped 17 Aug 2026 to autofill plus delay-aware pickup, not live ops-board tracking. This row's parenthetical claim of "default on" is corrected here: `app/home/home.dc.html:505` declares `"default":false`. Marked as conflict C23 (registered in task 2) — the doc was wrong, not the code |
| A15 | **Is "by the hour" in V1 scope?** | home, mode tabs | `DECISIONS.md`: "if approved for launch." Tab stays; `hourlyEnabled` prop (default on) drops it cleanly — tabs, pill and field logic all degrade to two modes with no relayout. **RESOLVED** — decision 15, 13 Aug 2026: no hourly mode, remove the tab, `hourlyEnabled=false`. The mock change is authorised by the owner but is out of scope for this docs pass; it is listed in §I |

### New tokens — 8, `common.*`

`{VEHICLE_CLASS_1_NAME}` `{VEHICLE_CLASS_1_MAX_PAX}` `{VEHICLE_CLASS_1_MAX_BAGS}` `{VEHICLE_CLASS_1_EXAMPLE}` ·
`{VEHICLE_CLASS_2_NAME}` `{VEHICLE_CLASS_2_MAX_PAX}` `{VEHICLE_CLASS_2_MAX_BAGS}` `{VEHICLE_CLASS_2_EXAMPLE}`.

A third–fifth class (the grid and capacity logic hold 2–5 with no relayout) follows the same
four-token pattern: `{VEHICLE_CLASS_3_NAME}` etc — though decision 13 (13 Aug 2026) settles the
lineup at three classes, not four or five, since `first` does not ship. Fixture default in code
today: Economy 3 passengers / 3 bags, Van 7 passengers / 8 bags — **superseded**: decision 13
settles Economy 3/3 and Van 8/8, so the Van 7/8 fixture is stale. See §D conflict 13, closed by
that decision, and §G's confirmed 8/8, which stands.

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
tokens — this is the A13 residual, linked to `{BUSINESS_PAX}` / `{BUSINESS_BAGS}`, owner-owed.
Van appears as 7/8 on the archived booking page and 8/8 in the terms example (conflict 13); the
confirmed 8/8 is used, and decision 13 (13 Aug 2026) now confirms it directly, superseding §H's
7/8 fixture.

### What slice 2 does *not* contain

No refund share, cancellation window, waiting allowance, baggage dimension or fee appears on the
FAQ, Contact or About page. Every one of them defers to the page that owns it. That is the
structural answer to conflict 1, and it is the rule to enforce on every page added after this.

## I. Mocks the answers contradict — list only, not edited in this pass

This is a work order for a separate, reviewable pass. Nothing under `app/` was modified in this
reconciliation pass; every line below is a citation, not a diff.

**Decision 13, vehicle lineup**
- `app/home/home.dc.html:747` — the `first` class entry must go.
- `app/home/home.dc.html:748` — `van` cap 7 → 8.
- `app/home/home.dc.html:772` — `first` label map entry.
- `app/home/home.dc.html:831` — `first` label map entry, plus the fr and ar label maps
  (`first:'First'` / `exFirst:…` entries).

**Decisions 14 and 15, feature flags**
- `app/home/home.dc.html:505` — `hourlyEnabled` default `true` → `false`; `flightTrackingEnabled`
  default `false` → `true`.

**Decision 15, hourly copy**
- `app/home/home.dc.html:753` and the de/fr/ar equivalents.
- `app/home/home.dc.html:763` and the de/fr/ar equivalents.
- `app/home/home.dc.html:781` and the de/fr/ar equivalents.

**Decision 5, payment options — PayPal radio and its strings**
- `app/pages/checkout.dc.html:105`
- `app/pages/checkout.dc.html:168`
- `app/pages/checkout.dc.html:191`
- `app/pages/checkout.dc.html:274`
- `app/pages/checkout.dc.html:276`
- `app/pages/checkout.dc.html:277`

**Decision 5, payment options — cash-to-driver, conditional on the A5 residual**
Blocked on one word from the owner; must not be removed on inference.
- `app/pages/checkout.dc.html:106`
- `app/pages/checkout.dc.html:169`
- `app/pages/checkout.dc.html:192`
- `app/pages/checkout.dc.html:275`
- `app/pages/checkout.dc.html:287`
- `app/pages/confirmation.dc.html:122`
- `app/pages/confirmation.dc.html:132`
- `app/pages/confirmation.dc.html:154`

**Decision 2, cancellation promise — hard-coded 24 h free-cancellation string**
The 24 h number is now confirmed by decision 2, so this is a maintainability change (make it
settings-driven), no longer a Law 04 breach.
- `app/pages/checkout.dc.html:172`
- `app/home/home.dc.html:769`
- `app/home/home.dc.html:886`
- `app/home/home.dc.html:920`
- `app/pages/confirmation.dc.html:120`
- `app/pages/confirmation.dc.html:130`

**Q21, subprocessor naming**
- `app/pages/privacy.dc.html` — the Vercel region pill becomes Cloudflare.

**Decision 4, contact address — `info@vamostaxi.eu` → `contact@vamostaxi.eu`**
- `app/home/SiteFooter.dc.html:136`
- `app/pages/SiteFooter.dc.html:136`
- `app/pages/contact.dc.html:233`
- `app/pages/privacy.dc.html:182`
- `app/pages/privacy.dc.html:302`
- `app/pages/imprint.dc.html:200`
- `app/vamos-ops-data.js:321`

**Law 04 breaches from §D — C20, invented figures on a legal page**
The 8 seats / 72 hours figures must become `data-tok` pills, not `data-tok-fig` wrappers.
- `app/pages/cancellation.dc.html:208`

**Law 04 breaches from §D — C21, invented driver-assignment lead time**
- `app/home/HowItWorks.dc.html:196`

**Law 04 breaches from §D — C19, the full site list, airport-waiting allowance**
- `app/home/HowItWorks.dc.html:205`
- `app/home/home.dc.html:759` (en)
- `app/home/home.dc.html:791` (en)
- `app/home/home.dc.html:817` (de)
- `app/home/home.dc.html:849` (de)
- `app/home/home.dc.html:875` (fr)
- `app/pages/account.dc.html:255`
- `app/vamos-i18n-dict.js:180`
- `app/vamos-i18n-dict.js:314`
- `app/vamos-i18n-dict.js:316`
- `app/vamos-i18n-dict.js:1321`
- `app/vamos-ops-data.js:298`

**§F label normalisation**
"Refund payout time" normalises to the wording carried by `{REFUND_PAYOUT_DAYS}` /
`common.refundPayoutDays`:
- `app/pages/booking-detail.dc.html:312`
- `app/pages/manage-booking.dc.html:558`

"Change deadline" normalises to the wording carried by `{MODIFICATION_DEADLINE}` /
`legal.cancellation.modificationDeadline`:
- `app/pages/manage-booking.dc.html:459`
- `app/pages/manage-booking.dc.html:481`

Every item here is a copy or fixture change; none of it is in this pass's diff. The
A5-conditional group (cash-to-driver) is blocked on the owner and must not be actioned without
that one word of confirmation.
