# Open questions — Vamos Taxi V1 build

Raised 17 Aug 2026, from the Phase 1–3 planning pass over `HANDOFF-CLAUDE-CODE.md`,
`docs/GSD-LAUNCH.md`, `docs/MISSING-FEATURES.md`, `CLAUDE.md`, the design-system readme
and the mocks in `app/`.

**How to use this file:** answer on the `**Answer:**` line under each question. Anything
left blank stays blocked — nothing here gets guessed, and no CHF figure, policy number or
capacity is invented to unblock work. Questions are grouped by the phase they block, so
the top group is the one that stops progress today.

Cross-references: `A1`–`A15` are the blocking decisions in
`docs/LEGAL-PLACEHOLDER-CHECKLIST.md`; `§` references are the design-system readme.

---

## Group 1 — blocks Phase 0–1 (accounts and scaffold)

### Q1 · Account ownership and billing
Do I create the Cloudflare, Supabase, Stripe, Resend and Mapbox accounts, or do you invite
me to existing ones? Which email owns billing?

**Answer:** *(2026-08-17)* Mixed. I create whichever accounts do not exist yet; the owner
takes billing on all of them, and invites me to the ones that already exist.

Still needed before Phase 0 can close: **the list of which accounts already exist**, so I
create rather than duplicate. Cloudflare, Supabase, Stripe, Resend, Mapbox, AeroDataBox,
Sentry.

### Q2 · DNS control and staging hostnames
Do you control `vamostaxi.eu` DNS today? Can I create `staging.vamostaxi.eu` and
`ops-staging.vamostaxi.eu` this week, with the current CMS left live until Phase 9?

**Answer:** *(2026-08-17)* Yes — the owner controls DNS, and both staging hostnames can be
created this week with the Freshpage CMS left live until the Phase 9 cutover.

### Q3 · Repository
GitHub org and name for the monorepo — `vamos-platform` under Loomlyne, under a Vamos org,
or somewhere else?

**Answer:** *(2026-08-17)* **Keep building in `Loomlyne/VamosTaxi.eu`.** No separate
`vamos-platform` repo — `apps/web` lands in this repo, next to the mocks it is ported from,
so a port and its source sit in one diff.

### Q4 · Qurova webfont licence
Blocker 5 in the handoff. The only licence on file (`design-system/assets/fonts/OFL.txt`) covers
Poppins. Until redistribution rights are confirmed I cannot serve Qurova from production.
If the licence does not clear, what is the display fallback? That is a visual change, so it
is your decision.

**Answer:** *(2026-08-19, updated following the provenance work)* The question's own premise is now
corrected: the licence file it names never existed for either family. It exists now, vendored in
this pass at `design-system/assets/fonts/OFL.txt`, and covers the Poppins body family only —
Qurova is explicitly out of its scope. Qurova's actual provenance, read out of the font files'
own name tables: a commercial retail face from Prioritype Co., all rights reserved, with **no
licence description and no licence URL entry inside the files at all**.

The engineering-decidable part is now costed and sourced. Prioritype's Web Font tier is **$69**
(`https://prioritypeco.com/product/qurova-logo-font/`), and the recommendation is to buy it. The
binding constraint is not the price — it is the licence's **100,000 monthly pageview cap on a
single website** (`https://prioritypeco.com/license/`). The cheapest tier ($39 Standard)
explicitly excludes web embedding, so an existing desktop licence bought for the design work
would not cover the site. Two questions go to the foundry in writing before money moves, because
the published price list does not answer either one: what tier (if any) covers web usage above
the cap, and whether the licence is perpetual or an annual subscription. Full reasoning, the
complete price list and both open foundry questions are in
`.planning/ADR-009-qurova-webfont-licence.md`.

**Owner must still answer.** This is a visual and brand call, not an engineering one — the
display fallback changes what the site looks like, and engineering does not pick the display
face. `docs/build/Owner Typeface Review.dc.html` is the rendered fallback this stream promised:
the real Vamos headlines, in Qurova and in three verified open-licence candidates, side by side.
What remains yours to decide: authorise the $69 purchase (and the two foundry questions above),
or pick a rendered fallback from that page instead.

Two things this work surfaced that the question never asked about, both recorded and neither
solved here: no vendored type family — not Qurova, not Poppins — contains a single Arabic glyph,
so an Arabic display face is its own open item; and the current Arabic fallback hotlinks a
third-party font CDN before consent, now registered as conflict C25 in
`docs/build/LEGAL-PLACEHOLDER-CHECKLIST.md`.

---

## Group 2 — blocks Phase 2 (the schema cannot seed without these)

### Q5 · Vehicle classes — how many, and which (A13)
Three sources disagree:

- design-system readme §7: *confirmed* — Economy 3/3, Business, Van **8/8** (three classes)
- `app/home/home.dc.html` line 744: four classes — `economy` 3/3, `business` 3/3 (badge),
  `first` 3/2, `van` **7/8**
- `app/pages/checkout.dc.html` line 156 and `confirmation.dc.html` line 112: name-map holds
  only `economy` and `van`

Which classes ship in V1?

**Answer:** *(2026-08-13, owner content review, decision 13)* Three classes — Economy 3/3,
Business, Van 8/8. The four-class list in `home.dc.html` is wrong: **`first` does not ship**.
Matches design-system readme §7.

### Q6 · Van capacity — 7/8 or 8/8 (A13, conflict 13)
The one number that has been settled and re-opened twice.

**Answer:** *(2026-08-13)* **8/8**. `home.dc.html`'s 7/8 is the stale copy.

### Q7 · Business capacity
Never supplied — it is the one class carrying `{VEHICLE_CLASS_n_MAX_PAX}` /
`{VEHICLE_CLASS_n_MAX_BAGS}` tokens. Passengers and bags?

**Answer:** *(still open — asked again 2026-08-13 under About page, left blank.)* The
`data-tok` pills stay on the Business card until this lands.

### Q8 · Waiting allowances — seed NULL or seed 60/15
`app/vamos-ops-data.js` seeds `airportWait: '60'` and `cityWait: '15'`.
`docs/LEGAL-PLACEHOLDER-CHECKLIST.md` §C calls both unconfirmed archive figures
("marketing claim, never confirmed"). The proposed `settings` table has them NULL, which is
what renders the `data-tok` TBC pill. Confirm NULL, or confirm 60 and 15 as real numbers.

**Answer:** *(2026-08-19, engineering decision)* **Seed NULL, not 60/15** — see `.planning/ADR-002-waiting-allowances-null.md`. An unconfirmed
archive figure seeded as the default silently becomes the answer, which is how the archive's
claims became live consumer promises in the first place; NULL renders the `data-tok` TBC pill,
which is Law 04 working as designed. The setting alone does not close conflict C19: plain prose
across eleven sites still asserts 60 minutes regardless of what the setting holds, and that has
to be fixed in the same pass.

### Q9 · Booking reference format
`VT-####` runs out at 9999. Keep four digits and let it grow to five, or move to
`VT-YY-####` now? Changing it after launch leaves two formats in circulation.

**Answer:** *(2026-08-19, engineering decision)* Move to `VT-YY-####` now — see `.planning/ADR-003-booking-reference-format.md`. Digits stay so
dispatchers can read a reference aloud on the phone; the year prefix resets the numeric space
annually and also replaces the mock's collision-prone random-suffix generator. Sequential
references stay enumerable, so the manage-booking link must stay a signed token, never a
lookup by reference alone.

### Q10 · Initial staff users
Names and emails for the invite-only `dispatcher` / `admin` seed. TOTP MFA is required for
all of them.

**Answer:** *(2026-08-19)* **Owner must answer.** Names and emails are personal data only the owner holds — engineering
cannot invent or guess a real staff roster. TOTP MFA is required for every seeded staff
account regardless of who they are; that is a stated requirement already carried in the
question, not a new decision made here.

---

## Group 3 — blocks Phase 4–5 (pricing engine, checkout, refunds)

### Q11 · CHF price matrix and surcharges
Blocker 1. What is the realistic date? And for the interim: may I load a **synthetic**
staging matrix behind `pricing_live=false` so the engine is exercisable end-to-end — given
nothing it produces ever reaches a screen, because the UI stays `CHF 000` — or must staging
carry no numbers at all?

**Answer:** *(2026-08-17)* The owner expects the **real matrix within days**, so the
synthetic-staging question is largely moot. Until it arrives the engine is built behind
`pricing_live=false` and every amount on screen stays `CHF 000`; the moment the real matrix
lands it is loaded on staging and the flag flip becomes the launch trigger.

### Q12 · Per-currency pricing — genuine, or display-only
`app/vamos-ops-data.js` stores a separate figure per CHF/EUR/USD/AED for fixed routes,
per-km rates and surcharges, with the comment that "dispatch can genuinely price a route
differently in EUR than in CHF". `VamosLocale.money()` does the opposite — it swaps the
mark and never the number — and Stripe charges CHF.

The proposed schema assumes CHF is the one priced currency and the others are display marks
only. If dispatch really maintains four price lists, the pricing tables change shape.

**Answer:** *(2026-08-19, engineering decision)* Display-only — see `.planning/ADR-004-currency-display-only.md`. CHF is the one priced
currency in the schema; one CHF amount per rate, route and surcharge, no per-currency columns.
`CLAUDE.md` already mandates this behaviour and Stripe settles CHF regardless of the currency
shown, so the other marks are presentational. Checkout must state the charge currency
explicitly once a non-CHF mark is shown — flagged as a requirement, not decided here.

### Q13 · Refund shares and cancellation window (A2)
Free-cancel window, full-refund share, partial-refund share, no-show share, driver-no-show
share. The archive says 24 h / 75 % / 25 % retained / none / 80 %; the FAQ promised a full
refund inside 24 h. Both are live consumer promises and they contradict each other.

**Answer:** *(2026-08-13, decision 2)* **Tiered:** 100 % refund if cancelled more than 24 h
before pickup, 75 % inside 24 h, nothing for a no-show. This resolves the contradiction in
favour of the FAQ's full-refund promise outside 24 h.

Still open: the **driver-no-show** refund share, the free-cancellation window as a distinct
number from the 24 h tier boundary, the large-vehicle window, the change-cutoff, and the
cancellation-voucher validity — all left blank on 2026-08-13. Those keep their `data-tok`
pills.

### Q14 · Self-serve cancel before the policy lands
Until Q13 is answered, does the customer-facing cancel button exist and route to ops for
manual handling, or is it hidden?

**Answer:** *(2026-08-17)* Button **ships**, enforcing the Q13 tiers and refunding
automatically. Chat, WhatsApp and email stay open as human channels for everything the
button does not cover — the owner's "cancel via chat/WhatsApp/email" answer is additive,
not a replacement.

### Q15 · Hard-coded cancellation promise in checkout
`app/pages/checkout.dc.html` line 172 renders *"Fixed price, all taxes and tolls included.
Free cancellation up to 24 h before pickup."* — an unconfirmed policy number sitting outside
a `data-tok` pill, contradicting law 04. May I convert it to a settings-driven string that
shows the TBC pill until the number lands? It is a copy change, so it needs your approval.

**Answer:** *(2026-08-19, engineering decision)* Convert it to a settings-driven string — see `.planning/ADR-005-cancellation-copy-settings-driven.md`.
The 24 h figure is already correct per owner decision 2 (13 Aug 2026), so this is not a Law 04
breach any more, but the same promise is rendered independently at six or more sites across
four languages; one settings key keeps them all in sync under any future change. Note:
`OWNER-ANSWERS.md` still lists the free-cancellation window as a separate blank number even
though decision 2 already answers it — one line of owner confirmation that they are the same
24 h figure is still wanted.

### Q16 · Payment methods (A5)
`checkout.dc.html` offers Card / Apple Pay / TWINT, **PayPal**, and **cash to the driver**.
The fixed stack says Stripe standard, cards + TWINT + Apple/Google Pay. So:

- Is PayPal in V1?
- Is cash-to-driver a real flow? Which routes are approved, who confirms it, and does it
  produce a `paid` booking with no Stripe PaymentIntent? Cash changes the lifecycle, so this
  one has to be settled before Phase 5 starts.

**Answer:** *(2026-08-13 + 2026-08-17)* Accepted methods are **Visa, Mastercard, Apple Pay,
TWINT** — plus Google Pay, which Stripe gives us for free alongside Apple Pay. **PayPal is
out of V1**: Stripe's PayPal support does not extend to Swiss merchants, so it would mean a
second processor, a second webhook and a second refund path. Revisit post-launch.

Still open: **cash to the driver**. It was absent from the owner's accepted-methods list,
which reads as "out", but it is a lifecycle-changing flow and the mock still offers it —
treated as out, needs one word of confirmation before the checkout option is removed.

### Q17 · Corporate pay-by-invoice
In or out of V1? (`MISSING-FEATURES` has it 🟡 on checkout and ⚪ for corporate accounts.)

**Answer:** *(2026-08-19, engineering decision)* Out of V1, hidden, kept in planning — see `.planning/ADR-008-recorded-scope-decisions.md`. The pay-by-invoice
flag ships `false` and the ops surface hides the option; the mock's `invoice: true` seed and
"Invoiced monthly" customer note imply a working feature the build does not ship, which the
mock fixture needs correcting. The `corporate` customer type stays in the schema as a customer
attribute, not a payment feature.

### Q18 · Flight tracking (A14)
Live in V1? `flightTrackingEnabled` defaults on in the mock and the field already does
lookup, ETA/gate/belt diffing and polling. If yes: which provider (AeroDataBox,
FlightAware), and who buys the key?

**Answer:** *(2026-08-13 decision 14, scoped 2026-08-17)* **In V1, at "autofill +
delay-aware pickup" depth**: the flight number resolves the landing time at booking, and the
booking is re-checked before pickup so a delayed arrival shifts the driver's time and
notifies both sides. Not continuous live tracking on the ops board — that is post-launch.
Provider AeroDataBox (~$25–50/mo); key still to be bought (see Q1 billing).

### Q19 · Hourly mode (A15)
Ships, or `hourlyEnabled=false`? The tab degrades cleanly to two modes with no relayout.

**Answer:** *(2026-08-13, decision 15)* **Does not ship.** `hourlyEnabled=false`; the tab
is removed for V1. Owner decision, so the mock change is authorised.

### Q20 · Return trips
The widget has a return tab. Priced as two one-ways, one discounted round trip, or one
booking carrying two legs? This is a schema question — currently modelled as a single
`bookings` row with `return_at`.

**Answer:** *(2026-08-19, engineering decision)* One booking, two legs — see `.planning/ADR-006-return-trips-booking-legs.md`. A
`bookings` row stays the commercial record; a new `booking_legs` table carries one or two rows,
each with its own driver, vehicle, pickup time, flight and status — a `return_at` column
cannot carry any of that, and two separate one-way bookings would break "one booking, one
fixed price." Whether a round trip is discounted is a pricing rule on top of this shape, not
decided here, and no discount percentage is stated — that stays open under Q11.

---

## Group 4 — blocks Phase 6–8 (surfaces, legal, hardening)

### Q21 · The privacy page names Vercel
`{VERCEL_REGION}` → `legal.privacy.vercelRegion` in the token map (§F), but there is no
Vercel anywhere in this stack. This is a subprocessor disclosure, so it is wrong rather than
merely stale. Rename the key to `legal.privacy.cloudflareRegion` and restate the
subprocessor list as Cloudflare, Supabase (eu-central Frankfurt), Stripe, Resend, Mapbox and
Sentry? Final wording belongs to your legal review.

**Answer:** *(2026-08-17)* Yes — rename to `legal.privacy.cloudflareRegion` and restate the
subprocessor list as Cloudflare, Supabase (eu-central Frankfurt), Stripe, Resend, Mapbox,
AeroDataBox and Sentry. Naming Vercel is a false subprocessor disclosure, so it is a
correctness fix rather than a copy preference. Final wording still needs the owner's legal
review before the page goes live.

### Q22 · Analytics, consent logging, error monitoring (A6, A9, A10)
Three decisions that change what gets built, not just what the cookies page says:

- A6 — which analytics tool (Vercel Analytics is on the list and is not available here)
- A9 — is consent logged server-side? Adds a `consent_log` table and a retention row
- A10 — is Sentry strictly necessary or consent-gated? Today it sits under Analytics, so
  declining analytics turns off crash reporting

**Answer:** *(2026-08-13 + 2026-08-17)*

- **A6 analytics — still open.** Left blank on 2026-08-13. Vercel Analytics is off the table
  with the stack change; the realistic choice is Cloudflare Web Analytics (cookieless, no
  consent needed) or PostHog (richer funnel data, consent-gated). Nothing is wired until
  this is answered.
- **A9 consent logging — yes, server-side.** The owner asked engineering; the engineering
  answer is that a browser-only cookie cannot prove consent to a Swiss nFADP or GDPR
  regulator. Adds a `consent_log` table (choice, timestamp, policy version, truncated IP)
  and a retention row. The cookie stays as the fast client-side read.
- **A10 error monitoring — strictly necessary, always on,** per the owner. Recorded with the
  engineering caveat that Sentry transmits IP and URL data and is commonly treated as
  consent-requiring; built as decided, with the toggle in `settings` so it can be flipped to
  consent-gated without a redeploy. Sentry moves out from under the Analytics toggle either
  way, so declining analytics no longer kills crash reporting.

### Q23 · Carrier or intermediary (A1)
Drives terms 01 / 05 / 13 and the whole About page. The archive disclaims liability for the
ride while the marketing sells "our drivers".

**Answer:** *(2026-08-13, decision 1)* **Carrier.** Vamos is directly liable for the ride.
The archive's liability disclaimer is therefore wrong and must not be carried into the new
terms; the "our drivers" marketing is correct. Court of venue: **Zürich** (decision 7).

### Q24 · Data residency of edge processing
Supabase is pinned to eu-central (Frankfurt), but Workers execute wherever the request
lands. Is edge processing of passenger data acceptable to your counsel, or do the booking
API routes need pinning near Frankfurt (Smart Placement)? This affects the Phase 8 design.

**Answer:** *(2026-08-19)* Engineering's proposal only, per `.planning/ADR-007-edge-data-residency.md` — counsel has the final word and
this does not read as settled. The proposal: pin data-touching routes (booking POST, account
reads, ops) near Frankfurt via Smart Placement, leave public marketing pages at the edge —
costed against pinning everything and pinning nothing. Whether transient edge processing with
no persistence counts as a transfer under nFADP/GDPR is a legal question this ADR does not
answer.

### Q25 · Phone verification and social sign-in
`PhoneVerify.dc.html` exists as a mock, and `sign-in.dc.html` has Google/Apple buttons.
Phone verification via Twilio Verify in V1 or deferred behind a flag? OAuth — ship or
remove the buttons?

**Answer:** *(2026-08-19)* **Owner must answer.** Removing the Google/Apple buttons or the `PhoneVerify` mock changes a
designed screen, which makes this a design decision, not an engineering one. Engineering does
not delete a designed surface without the owner choosing to.

### Q26 · Review import
`vamos-reviews.js` carries a `source` field for Google, Tripadvisor and Trustpilot. Is
importing existing reviews a V1 requirement, or post-launch? Import needs API access per
platform.

**Answer:** *(2026-08-19, engineering decision)* Post-launch, tracked as LATER-02 — see `.planning/ADR-008-recorded-scope-decisions.md`. Each
platform import needs its own API access and per-platform onboarding, which has no launch
value. The `source` field stays in the schema — it costs nothing and the manual review-entry
path already uses it.

---

## Group 5 — screens that do not exist yet

### Q27 · Ops "new booking" (manual / phone) — 🔴, no mock
Dispatchers take phone bookings today, so this probably cannot slip past launch.

Proposed route: I design it first as a `.dc.html` inside the existing mock system, you
review it there at 1440/1024/768/390 in all four languages, and only then does it get
ported to React — the same pipeline every other screen went through. That keeps design
decisions out of an implementation PR.

Confirm that route, and say whether the 🟡 partner-application review queue and the 🟡
refund/finance report get the same treatment or slip to post-launch.

**Answer:** *(2026-08-17)* **Route confirmed** — the ops new-booking screen is mocked first
as a `.dc.html`, reviewed at 1440/1024/768/390 in all four languages, and only then ported.
A design decision stays out of an implementation PR.

Still open: whether the 🟡 partner-application review queue and the 🟡 refund/finance report
get the same treatment or slip past launch. Given the 2–3 week target and ops deepening
after go-live, the working assumption is post-launch unless the owner says otherwise.

---

## Answered, do not reopen

Recorded here so they stop being re-litigated. Sources: design-system readme §7, `CLAUDE.md`.

- **CTA casing** — uppercase, settled with the client July 2026.
- **Logo and favicon** — nine SVGs supplied July 2026; `Logo` takes
  `form="wordmark|lockup|mark"`.
- **German is a launch language** — along with French and Arabic; all four ship in the same
  pass as the surface.
- **Tagline** — "Ride with class". Not translated; it is set artwork.
- **No Vercel** — hosting, previews or features.
- **Out of V1 permanently** — native apps, a driver app, GPS/ETA tracking, anything that
  reads as on-demand ride-hailing.
