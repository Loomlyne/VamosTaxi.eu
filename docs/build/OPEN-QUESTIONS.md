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

**Answer:**

### Q2 · DNS control and staging hostnames
Do you control `vamostaxi.eu` DNS today? Can I create `staging.vamostaxi.eu` and
`ops-staging.vamostaxi.eu` this week, with the current CMS left live until Phase 9?

**Answer:**

### Q3 · Repository
GitHub org and name for the monorepo — `vamos-platform` under Loomlyne, under a Vamos org,
or somewhere else?

**Answer:**

### Q4 · Qurova webfont licence
Blocker 5 in the handoff. The only licence on file (`design-system/assets/fonts/OFL.txt`) covers
Poppins. Until redistribution rights are confirmed I cannot serve Qurova from production.
If the licence does not clear, what is the display fallback? That is a visual change, so it
is your decision.

**Answer:**

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

**Answer:**

### Q9 · Booking reference format
`VT-####` runs out at 9999. Keep four digits and let it grow to five, or move to
`VT-YY-####` now? Changing it after launch leaves two formats in circulation.

**Answer:**

### Q10 · Initial staff users
Names and emails for the invite-only `dispatcher` / `admin` seed. TOTP MFA is required for
all of them.

**Answer:**

---

## Group 3 — blocks Phase 4–5 (pricing engine, checkout, refunds)

### Q11 · CHF price matrix and surcharges
Blocker 1. What is the realistic date? And for the interim: may I load a **synthetic**
staging matrix behind `pricing_live=false` so the engine is exercisable end-to-end — given
nothing it produces ever reaches a screen, because the UI stays `CHF 000` — or must staging
carry no numbers at all?

**Answer:**

### Q12 · Per-currency pricing — genuine, or display-only
`app/vamos-ops-data.js` stores a separate figure per CHF/EUR/USD/AED for fixed routes,
per-km rates and surcharges, with the comment that "dispatch can genuinely price a route
differently in EUR than in CHF". `VamosLocale.money()` does the opposite — it swaps the
mark and never the number — and Stripe charges CHF.

The proposed schema assumes CHF is the one priced currency and the others are display marks
only. If dispatch really maintains four price lists, the pricing tables change shape.

**Answer:**

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

**Answer:**

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

**Answer:**

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

**Answer:**

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

**Answer:**

### Q25 · Phone verification and social sign-in
`PhoneVerify.dc.html` exists as a mock, and `sign-in.dc.html` has Google/Apple buttons.
Phone verification via Twilio Verify in V1 or deferred behind a flag? OAuth — ship or
remove the buttons?

**Answer:**

### Q26 · Review import
`vamos-reviews.js` carries a `source` field for Google, Tripadvisor and Trustpilot. Is
importing existing reviews a V1 requirement, or post-launch? Import needs API access per
platform.

**Answer:**

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

**Answer:**

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
