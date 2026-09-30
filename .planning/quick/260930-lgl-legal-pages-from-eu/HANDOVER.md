# Hand-over: legal pages filled from vamostaxi.eu

Work session, 2026-09-30. For the control session. Not pushed, no PR, not deployed; the live
database was only read.

**No lawyer has read any of this text.** Every sentence on these pages is the old company text,
the site's own behaviour, or an owner answer given in this session.

| Item | Value |
|---|---|
| Folder | `/Users/koss/Developer/vamos-wt/legal-pages` |
| Branch | `docs/legal-pages-from-eu`, cut from `origin/main` `2132d117` |
| Main merged in | `origin/main` `e8f1e2fd` (26.4 + 26.4.1 ship), merge commit `6528e228`. The only conflict was the generated seed, regenerated, not hand-edited |
| Final commit | the commit that adds this file, on top of `6528e228` |
| Owner decisions | `DECISIONS.md` next to this file (14 answers) |

## 1. The brief had one wrong fact

The brief named `apps/web/app/[locale]/{…}/page.tsx` as the legal pages. On vamostaxi.site, `/privacy`,
`/terms`, `/cancellation`, `/imprint` and `/cookies` are served from the mocks
`app/pages/*.dc.html` (`apps/web/middleware.ts:37-41`), translated by `app/vamos-i18n-dict.js`.
The Next.js pages never reach a customer. The owner chose **both** (decision 1): every change is in the
mock and in the Next.js page.

Files touched outside the brief's list: `app/pages/{privacy,terms,cancellation,imprint}.dc.html`,
`app/vamos-i18n-dict.js` (one block after the `'Trip records for'` entry), and two older tests
that pinned the UID gap (`apps/web/lib/legal/extract-no-invent.test.ts`,
`apps/web/lib/meta/legal-gate.test.ts`). Messages: 32 new `legal.*` keys in four languages
(appended to the end of the `legal` namespace) plus 18 `$meta.noParamKeys` entries. No legal key was deleted.

## 2. What changed, both surfaces, four languages

| Page | Change | Source |
|---|---|---|
| privacy | "Vercel" as host → "Cloudflare" | owner, 2026-09-30 |
| privacy | "10 years years" → "10 years" (retention row and "We have to keep" card) | owner, 2026-09-30 |
| privacy | "We answer within 30 days days." → "We answer within 30 days; in complex cases we may take up to 60 days more." | terms §24 (list A) |
| privacy | "Legal basis under the GDPR: Art. 6 (1) (b)." after "To perform the contract" | data protection §5 (list A) |
| privacy | "You can close your account at any time by writing to us." under account retention | data protection §5 (list A) |
| privacy (Next.js only) | payment records: "Kept for the statutory trade and tax retention periods." | data protection §10 (list A) |
| privacy | gap "Your account paragraph" for Phase 26.5 | brief step 5 |
| terms | extra waiting "charged per commenced hour" (no amount) | terms §8 |
| terms | extended city stay "up to 15 minutes" (fee stays a gap) | terms, extended city stays |
| terms | one medium case (56 × 45 × 25 cm) plus one hand luggage per seat | terms §7 |
| terms, cancellation | waiting 60 minutes airport, **30 minutes** elsewhere | terms §8; owner chose 30 over the site's 15 (decision 2) |
| terms, cancellation | no-show when not reached within 30 minutes of pickup time, 60 at an airport; call count stays a gap | terms §13 |
| terms | complaints within 10 days; resolved within 30 days; agreed refund paid within 30 days of written acceptance | terms, complaints |
| cancellation | tier rows rewritten to match the site (section 4); 6-hour line removed; 8-seat / 72-hour line removed | site code |
| cancellation | voucher option, voucher bullet and section 09 "Vouchers" removed, TOC too | owner (decision 3) |
| cancellation | "If you and the driver were both at the meeting point at the same time, the transfer did not happen, and this can be proven, we may refund 80 % of the price and keep 20 % to cover costs." | terms §14 |
| cancellation | extra waiting "charged per commenced hour"; team-decided refund "paid within 30 days of your written acceptance"; complaints "resolved within 30 days" | terms §8, complaints |
| imprint | UID `CHE-296.035.710` on the Next.js page; the "Client input · UID" note removed from both | owner, checked (decisions 4 and 6) |
| cancellation mock | layout: a gap pill may wrap inside a tier card (`[data-tier] [data-tok]{white-space:normal}`) | German at 1080 px clipped "TBC" |

## 3. Every labelled gap, before and after (Next.js pages)

Live mocks had no gaps before this job: on 2026-09-01 (`ae9165bf`) every pill was replaced
with text, some of it garbled ("we have called your number we call the number on the booking
times"). Where this job replaced that text, the "mock after" column says so.

| Page | Gap before | After | Mock after |
|---|---|---|---|
| imprint | Uid number | **Filled** CHE-296.035.710 (owner, checked) | unchanged number, now `.vt-dir-keep` |
| imprint | Photography credit, Brand agency credit, Build agency credit | open, list C | "Loomlyne" (old value, see section 6) |
| privacy | Dpo or not required, Eu representative | open, list C | "no DPO appointed", "none appointed" (old values) |
| privacy | Supabase / Cloudflare / AeroDataBox / Resend / Sentry region | open, list C (processor regions) | old values |
| privacy | Analytics provider, Analytics region | open, list C | "Cloudflare Web Analytics (cookieless)" (old value) |
| privacy | Archiving years (×2) | **Filled** 10 years (owner correction) | "10 years years" → "10 years" |
| privacy | Finance retention | **Filled** statutory trade and tax retention periods (data protection §10) | "10 years (Swiss books)" kept (old value) |
| privacy | Log retention, Consent log retention | open, list C | old values |
| privacy | Meta privacy line | open (Meta legal gate, blocks 28/29) | not on mock |
| privacy | — | **new** Your account paragraph (26.5) | new pill |
| terms | Extra stop fee, Oversize item fee | open, list C | "shown on your quote" (old values) |
| terms | Extra waiting rate (×2) | **Filled** per commenced hour (terms §8) | replaced |
| terms | City stay minutes | **Filled** 15 minutes (terms) | replaced |
| terms | City stay fee | open; owner answered "shown on your quote" (decision 9), not built | pill (was "shown on your quote") |
| terms | Case dimensions | **Filled** 56 × 45 × 25 cm (terms §7) | replaced |
| terms | Airport waiting, Standard waiting | **Filled** 60 / 30 minutes | 15 → 30 |
| terms | Noshow call attempts | open, list C; sentence now carries the 30/60-minute rule | pill (was garbled) |
| terms | Payment methods | open; owner answered decision 8, not built | "Visa, Mastercard, Apple Pay, Google Pay and TWINT" kept |
| terms | Complaint window days, Complaint resolution days, Refund payout days | **Filled** 10 / 30 / 30 days (terms, complaints) | replaced (were garbled) |
| cancellation | 8, 72 hours | **Removed**: no such rule on the site | removed |
| cancellation | — | **new** Refund within 24 hours (open, decision 7 answered, not built) | new pill |
| cancellation | Modification deadline | open, list C | "24 hours … (72 hours for 8+ seats) before pickup" kept (old value) |
| cancellation | Driver noshow share | open: it sits in "no vehicle came", which the old site does not cover. The old 80/20 rule is added as its own sentence | "full refund" kept (old value) |
| cancellation | Noshow call attempts | open, list C | pill (was garbled) |
| cancellation | Airport waiting, Standard waiting, Extra waiting rate | **Filled** 60 / 30 minutes, per commenced hour | 15 → 30, rate replaced |
| cancellation | Refund decision days | open, list C | pill (was garbled) |
| cancellation | Refund payout days | **Filled** within 30 days of written acceptance | replaced |
| cancellation | Complaint resolution days | **Filled** 30 days | replaced |
| cancellation | Voucher validity | **Removed** with the voucher section (decision 3) | removed |
| cookies | Language cookie duration, Session duration, Consent duration | open, list C | old values |
| cookies | Meta cookie row | open (Meta legal gate) | not on mock |

Effective-date and version gaps (`LegalPage` on every Next.js page) stay open; the owner chose
"ship day" for the date (decision 14).

## 4. Refund rule: what the site does, and what the pages said

Read in `apps/web/lib/lifecycle/paid-cancel.ts`, `packages/db/supabase/migrations/20260928150000_refund_review_tiers.sql`,
`apps/web/lib/ops/refund*.ts`, the manage-link and account cancel routes. No payment code was changed.

- **More than 24 hours before pickup:** 100 % of what was captured, sent to Stripe during the
  cancel request (`refund_review_tiers.sql:157-168`, `paid-cancel.ts:323-334`). 24 is written in SQL,
  not read from `settings_versions.free_cancel_hours`.
- **Within 24 hours:** the customer can still cancel (manage link or account); booking goes
  to `pending_ops`; no money moves until an admin refunds 0–100 % or declines.
- **No 6-hour line** (removed by `20260928150000`). The 75 % tier in the live settings row
  (`settings_versions` id 15) is never read by the code.
- **Completed or no-show:** cannot be cancelled by the customer.
- **Caution:** automatic refunds refuse a live Stripe key (`paid-cancel.ts:115-117`, `sk_live_`). Today
  the Worker takes 4242 test cards, so the page is true. The day live keys go on, "refunded
  automatically" becomes false until that guard is lifted.

Sentences that said something else, all now removed or rewritten on both surfaces:

| Where | Sentence | Why wrong |
|---|---|---|
| cancellation tier 1 | "Or take the full value as a voucher instead — see section 09." | no voucher flow on the site |
| cancellation tier 2 | "24 hours to 6 hours before pickup · Refund pending operations (default 100% of captured)" | no 6-hour line; no default percentage |
| cancellation tier 3 | "From 6 hours before pickup … No automatic refund. Operations can still refund." | no 6-hour line |
| cancellation | "Vehicles over 8 seats work to a longer window of 72 hours" | no such rule in code or fleet |
| cancellation §08 | "Bookings paid with a voucher are refunded as a voucher." | no voucher payment |
| cancellation §09 | whole Vouchers section, "It is worth more than the refunded share" | no voucher flow; no refunded share |
| Next.js cancellation | "from-6-hours-before-pickup-a-driver-may", "refunded-to-the-card-you-paid-with-or-take-the-f" | same |

Still on the pages, not about refunds, owner's call later: cancellation §03 "changed up to 24 hours
before pickup (72 hours for 8+ seats) before pickup" (modification deadline is list C; settings
`modification_deadline_hours` is null; the phrase repeats "before pickup").

Outside the legal pages, found and not touched: `app/pages/manage-booking.dc.html` says "Too
close to cancel here. Call us." (~line 558), but the code never blocks a cancel on timing, and "Every refund is checked by
our team" (~565), but refunds more than 24 hours out are automatic.

## 5. Vercel and doubled words

| Where | Found | Now |
|---|---|---|
| `app/pages/privacy.dc.html:233` | processor row named "Vercel" | "Cloudflare" |
| privacy mock | "10 years years" (×2) | "10 years" |
| privacy mock | "30 days days" | list A sentence |
| Next.js pages, all four languages | no Vercel, no doubled word | — |

Garbled but not doubled (all replaced): "within as soon as you can after the trip days",
"We answer within we answer in writing days", "paid within once the refund is agreed days",
"Approved within we answer in writing of your", "we have called your number we call the number on the booking times".

Test: `apps/web/lib/legal-text-hygiene.test.ts`, 11 tests. It fails if a legal page (mock text plus its de/fr/ar
dictionary lines, or the Next.js page's messages in four languages) names Vercel or repeats a word.
Run against `origin/main`'s privacy mock it fails with exactly the four defects above. It is case-sensitive
("Sie sie" is German grammar) and allows "nous nous" / "vous vous".

## 6. Live values nobody approved (decision 5: left live, listed here)

From `ae9165bf` (2026-09-01). English only in de/fr/ar today (no dictionary entry):
privacy: "no DPO appointed", "none appointed", "Booking database and sign-in · Zurich",
"used when transactional mail is on", "Error diagnostics · not in use", "Cloudflare Web Analytics (cookieless)",
"10 years (Swiss books) for accounting and tax.", "as long as needed to run the service",
"as long as needed to show consent". terms: "Registered as Vamos Taxi GmbH, company number …" sentence,
"Driver name … sent by SMS and email shown on your confirmation …" (garbled), "Additional stops: shown on your quote per stop.",
"Oversized or unusual items declared at booking: shown on your quote.", "Accepted methods: Visa, Mastercard, Apple Pay,
Google Pay and TWINT." cancellation: modification sentence above; "you receive full refund back".
imprint: "Vamos Taxi / Loomlyne", "Loomlyne". cookies: every duration cell, "vamosLang … English or German"
(the site has four languages). terms §02 still offers "chauffeur bookings by the hour" (hourly is off).

## 7. Other facts for the control session

- **Settings vs page:** the live settings row (`settings_versions` id 15) says `city_waiting_minutes = 15`; the pages now say 30 (owner, decision 2). The owner changes it on the dashboard if he wants them to agree.
- **Phase 26.5 position:** privacy section 02 "What we collect", directly after the "When you book" list and before "When you pay". Mock: `app/pages/privacy.dc.html` line ~203, a `data-tok` pill "Your account paragraph" under an HTML comment. Next.js: `apps/web/app/[locale]/privacy/page.tsx` ~line 112–115, `<PendingSlot label="Your account paragraph" />` under a JSX comment. 26.5 replaces the pill with the approved paragraph in four languages.
- `app/vamos-i18n-dict.js` and the four message files are shared with 26.5 and 26.0. This branch only appends: one dictionary block (between the markers "Legal pages from vamostaxi.eu" and "end legal pages from vamostaxi.eu") and keys at the end of `legal`.

## 8. Checks, on the merged tree (`6528e228`)

| Check | Result |
|---|---|
| `check:legal-claims` | pass, 3 of 3 |
| `check:numbers` | pass |
| `i18n:check` | pass, 2,619 keys, four languages |
| `db:seed:check` | pass, no drift (seed regenerated) |
| `typecheck` | pass |
| `lint` | pass, 0 errors (5 warnings already on main) |
| `lint:css` | pass |
| unit tests | pass: web 2,455 passed + 1 skipped; emails 116 passed |
| `build` | pass |
| Mock pages in the browser, served from `apps/web/public` with the design system loaded | 5 pages × en/de/fr/ar × 1440/1024/768/390 = 80 views, plus German at 1080: no sideways scroll, no element outside the viewport, no gap pill outside its card, Arabic `dir=rtl` in every view |
| `VamosLocale.coverage` on the mocks, de/fr/ar | every line this job wrote translates; what stays English is brand names and the old values in section 6 |
| Arabic case size at 390 px | figures read 56, 45, 25 left to right (measured) |

## 9. Not verified

- The Next.js legal pages were **not viewed** in a browser: they are not served on any URL (middleware sends the mocks), and `pnpm dev` does not run in this sandbox. Covered only by typecheck, build, i18n and the hygiene test.
- Nothing ran on vamostaxi.site: not deployed.
- No legal review. Swiss German, French and Arabic were written by the agent, not a translator.
- The mock pages were checked on a static server of `apps/web/public`, not on a Worker build.
- A first 80-view run was made without the design system loaded; it was thrown away and redone.

## 10. Owner UAT after the control session deploys

1. Open vamostaxi.site/privacy, section 04. Expected: the row reads "Cloudflare", no "Vercel".
2. Same page, section 06. Expected: "… start and destination — 10 years, because Swiss archiving law requires it." Section 07 black card: "Trip records for 10 years".
3. Same page, section 09. Expected: "We answer within 30 days; in complex cases we may take up to 60 days more."
4. Same page, section 02, after the "When you book" list. Expected: a grey "Your account paragraph TBC" pill (until 26.5 ships).
5. Switch the language to Deutsch on /privacy. Expected: "10 Jahre, weil das Schweizer Archivierungsrecht es verlangt."
6. Open vamostaxi.site/cancellation, section 01. Expected three cards: "More than 24 hours before pickup · 100% refunded"; "Less than 24 hours before pickup · Refund within 24 hours TBC"; "After the ride · Completed ride or no-show · Cannot be cancelled". No "6 hours" anywhere, no "Vouchers" in the side list.
7. Same page, section 06. Expected: "All other pickups: 30 minutes from the booked time."
8. Same page, switch to العربية at phone width. Expected: text right to left, no sideways scroll.
9. Open vamostaxi.site/terms, section 07. Expected: "Every booked seat carries one medium case (56 × 45 × 25 cm) and one piece of hand luggage."
10. Same page, section 12. Expected: "Tell us within 10 days of the journey …", "We resolve your complaint within 30 days.", "Any refund we agree is paid within 30 days of your written acceptance of our decision."
11. Open vamostaxi.site/imprint, section 04. Expected: "CHE-296.035.710".
12. Book a test ride more than 24 hours ahead with card 4242 4242 4242 4242, cancel it from the e-mail link. Expected: the booking shows refunded in full, matching the /cancellation page.

## 11. Open owner decisions

Answered, waiting for a build job: decisions 7, 8, 9, 13, 14 in `DECISIONS.md`.
Not answered, stay labelled gaps (list C): extra stop fee, oversize item fee, modification deadline,
refund decision days, no-show call count, cookie durations, DPO, EU representative, processor regions,
photography and agency credits, the "no vehicle came" refund share. The section 6 values wait for his confirmation.
