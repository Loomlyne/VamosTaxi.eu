# Hand-over: legal pages follow-up

Work session, 2026-09-30. For the control session. Not pushed, no PR, not deployed; the live
database was only read. **No lawyer has read any of this text.** German, French and Arabic are the
agent's, not a translator's.

| Item | Value |
|---|---|
| Folder | `/Users/koss/Developer/vamos-wt/legal-pages` |
| Branch | `docs/legal-pages-follow-up`, cut from `origin/main` `feb08776` |
| Main merged in | `61cf7377` (planning notes only, no conflict), merge `ca986d00` |
| Final commit | the commit that adds this file, on top of `bb45de2c` |
| Owner answers | `DECISIONS.md` rows 15 and 16 (new), plus 7, 9, 13, 14 from the first job |

## 1. The six items

| # | Item | Done |
|---|---|---|
| 1 | Decision 7, /cancellation within 24 hours | Gap replaced by "Our team decides the refund and tells you by email." (mock tier card, Next.js table) |
| 2 | Decision 9, /terms city stay | "Extended city stay, up to 15 minutes: shown on your quote." |
| 3 | Decision 13, adviser notes | Next.js privacy: both notes are now JSX comments (kept for the lawyer, not rendered). Mock already hid them |
| 4 | Decision 14, Last updated | **One constant: `app/vamos-legal-updated.js`, line `var LEGAL_UPDATED = '2026-09-01';`** Set it to the ship day (YYYY-MM-DD) before building. Mocks format it per language in the browser (1 September 2026 / 1. September 2026 / 1 septembre 2026 / 1 سبتمبر 2026). `apps/web/next.config.ts` reads the same line at build time (`LEGAL_UPDATED_ISO`) for the Next.js pages, so a build is needed after the change (deploy builds). The build fails if the line is not a YYYY-MM-DD date. Pages: privacy, terms, cancellation, imprint. The cookie policy keeps its own "1 September 2026" |
| 5 | manage-booking cancel copy | Done on manage-booking, and on /booking-detail and the /confirmation cancel box (owner, row 15). Details in section 2 |
| 6 | /cancellation §03 | Put to the owner. His answer grew the job: **no TBC on any live page**, and §03 without a deadline. Hygiene test now catches a repeated phrase |

## 2. manage-booking: the claim verified first

"The code never blocks a cancel on timing": **true on the server.**

- `apps/web/app/api/manage/booking/route.ts:16` hides cancel only by status: `HIDE_CANCEL = ["completed", "no_show", "cancelled", "partially_cancelled"]`; `:162` `canCancel = !HIDE_CANCEL.includes(status) && !reviewSubmitted`.
- `:161` `windowKind = customerCancelWindow(hoursBefore(...))` and `apps/web/lib/checkout/cancel-window.ts:17` `return Number.isFinite(hours) && hours > 24 ? "auto_full" : "pending_ops";` — only two values, no "too close".
- SQL `app.apply_customer_cancel` (`packages/db/supabase/migrations/20260911234758_booking_lifecycle_cancel_refund.sql:165-197`, not redefined later): the three `not_cancellable` raises are all about status (completed, no_show, cancelled, refunded; or no leg left to cancel). Comment `:348`: "guest cancel. After pickup allowed."
- Refund tier: `20260928150000_refund_review_tiers.sql:158-159` `when v_hours > 24 then 'auto_full'` / `when v_basis > 0 then 'pending_ops'`.
- The page itself showed "Too close to cancel here. Call us." only when `cancelWindow` was `'none'`, which is the blank default before the booking loads (`app/pages/manage-booking.dc.html` `blankTicket()`), never a value the API returns.

Changed on `app/pages/manage-booking.dc.html` and `app/pages/booking-detail.dc.html` (same markup), and `checkout.cancelSheetFull/Ops` in the four message files (`/confirmation/[ref]`, `ConfirmationClient.tsx:530`):

| Before | After |
|---|---|
| "This trip will be cancelled. You get a full refund. The money goes back to the card you paid with." | "This trip will be cancelled. Refunded in full, automatically." |
| "This trip will be cancelled. Refund needs a person — we will email you." | "This trip will be cancelled. Our team decides the refund and tells you by email." |
| "Too close to cancel here. Call us." and its `cancelClose` value | removed; message key `checkout.cancelSheetClose` (unused) removed |
| "Every refund is checked by our team before it is sent. … the money follows once that check is done." | removed: it contradicts "Refunded in full, automatically" in the same sheet |
| "… Coaches and groups have their own window. …" | sentence removed: no such rule (owner decision 11) |
| Box after a cancel, always shown: "Refund · waiting on review / You are eligible for [TBC] / Our team processes this within [TBC] …" | shown only while `refundStatus` is `pending_ops`: "Refund · waiting on review / Our team decides the refund and tells you by email." An automatic full refund no longer shows "waiting on review" |
| "Changes are open until [Change deadline TBC] before pickup. After that, call us." | removed (no deadline on the site, owner row 16) |
| "…and you are inside the [Change deadline TBC]. Dispatch can still move it…" | "A driver is already scheduled against this pickup. Dispatch can still move it. This page cannot." (only reachable through the review prop `bookingTiming="late"`, not live) |

## 3. Every TBC a customer could see, and what it is now

Found by loading the live pages on vamostaxi.site (home, about, faq, contact, checkout) and by reading
every served mock. Contact and checkout had none.

| Page | TBC | Now | Source |
|---|---|---|---|
| home (booking bar, twice) | Free cancellation window | "Free cancellation until 24 hours before pickup" | site: >24 h full automatic refund |
| about | Driver details lead time | "Driver name, vehicle and plate reach you by email as soon as a driver is assigned, and again in the reminder 24 hours before pickup. The driver's number is on your manage-booking page." | `notify-lifecycle.ts:211` (assignment mail), `Reminder24hEmail.tsx`, manage route (phone); no SMS (`notify-lifecycle.ts:16`) |
| about | Business pax, Business bags | 7 passengers, 6 medium cases | live `vehicle_classes`, active "Business" (slug `mercedes-benz-v-class`) |
| about | Support languages, Driver languages | card "In your language" removed; row becomes three cards | no source |
| faq | Driver details lead time (×2) | same facts as About; "by SMS" and "ask us and we will send them sooner" dropped | same |
| faq | Meet greet airports | "Available at Zurich (ZRH) and Geneva (GVA) airports." | live `service_zones` active with IATA code |
| terms | City stay fee | "shown on your quote" | decision 9 |
| terms, cancellation | Noshow call attempts | line "Calls we make before that" removed | no source |
| cancellation | Refund within 24 hours | "Our team decides the refund and tells you by email." | decision 7 |
| cancellation | Refund decision days | bullet "Approved within" removed | no source |
| cancellation §03 | (garbled 24 h / 72 h text) | "…can be changed before pickup, free of charge. …"; the "after that deadline" paragraph removed | owner row 16; settings `modification_deadline_hours` is empty and nothing reads it |
| privacy | Your account paragraph | pill removed; HTML/JSX comment marks the spot | 26.5 inserts the paragraph there |
| manage-booking, booking-detail | Change deadline (×2), share, Refund payout time | section 2 | |
| Next.js cookie banner (`/checkout`, `/confirmation`, sign-up, first visit) | Meta banner line | slot hidden by CSS while it holds a pill: `.vt-ck-meta:has([data-tok]){display:none}` | the Phase 26 tests pin the slot in source; the owner's Meta text (`2026-09-30-meta-wording.md`) replaces the pill in phase 28/29 and the slot shows again by itself |

Still TBC but **not live**: the Next.js copies of about, cookies, imprint credits, privacy (DPO,
regions, logs, Meta privacy line), terms (extra stop, oversize, payment methods), cancellation
(driver no-show share). No customer reaches those pages (middleware serves the mocks).

**26.5 position (for the control session):** privacy section 02, after the "When you book" list, before
"When you pay". Mock: the HTML comment in `app/pages/privacy.dc.html` (~line 203). Next.js: the JSX comment in
`apps/web/app/[locale]/privacy/page.tsx` (~line 112). No pill there any more.

## 4. Tests added or extended

| Test | What fails it |
|---|---|
| `apps/web/lib/legal-text-hygiene.test.ts` | Vercel; a doubled word; **new:** a phrase of two words (3+ letters each, 9+ together) repeated within 8 words in one sentence. Run against main's /cancellation it fails on "before pickup". Five deliberate repeats are named with a reason (`REVIEWED_REPEATS`: "the difference", "die Differenz", "innerhalb von", "nicht wegen", "القابلة للطي") |
| `apps/web/lib/live-no-tbc.test.ts` (new) | any rendered `data-tok` pill in `app/pages/*.dc.html` or `app/home/*.dc.html` (review galleries `*States.dc.html` skipped); the cookie-banner CSS rule missing |
| `apps/web/lib/legal-updated.test.ts` (new) | the constant not a single YYYY-MM-DD; a hard-coded date on the four pages; a page not reading the constant |

## 5. Checks (branch before the last About fix, then the affected tests again)

| Check | Result |
|---|---|
| check:legal-claims, check:numbers, i18n:check, db:seed:check | pass |
| typecheck, lint (0 errors), lint:css | pass |
| unit tests | web 2,464 passed + 1 skipped; emails 116 passed |
| build | pass; the date is compiled in (`shipDated ? "2026-09-01"`) |
| after the About fix: hygiene, no-TBC, date tests; seed check | 20 of 20 pass; no drift |
| Browser, mocks served from `apps/web/public`, **one frame at a time**: privacy, terms, cancellation, imprint, about, faq, home × en/de/fr/ar × 1440/1080/1024/768/390 = 140 views | every view in the stated language (checked), styled, Arabic RTL; no visible pill, no "TBC", no `{{`; found /about sideways in German at 1080 and 1024 (the heading "Geschäftskunden" in the new three-card row), fixed by hyphenation, re-run 20 views clean |
| Dates | privacy, terms, cancellation, imprint: "1 September 2026" / "1. September 2026" / "1 septembre 2026" / "1 سبتمبر 2026" |

**Correction to the first hand-over (`HANDOVER.md` §8):** its 80-view check loaded the five pages
in parallel frames. They share `localStorage`, so a language switch in one frame reached the
others: the layout of all four languages was covered overall, but a given row was not always the
language it names. This run was done one frame at a time and checks the language of every row.

## 6. Not verified

- manage-booking and booking-detail cancel sheets were **not viewed**: they need a real booking and
  the API. Covered by code reading, the no-TBC test and the dictionary (all new lines have de/fr/ar).
- The Next.js pages (legal, /confirmation cancel box, cookie banner) were not viewed in a browser.
- Home: 1–2 decorative elements (`data-om-label`, `aria-hidden`) extend past the viewport at every
  width without page scroll; my change there is text only. Not investigated.
- Nothing ran on vamostaxi.site.

## 7. Still wrong on live pages, not changed (owner's "leave old values", decision 5)

- /terms §03: "Driver name, vehicle and telephone number are sent by SMS and email …" — the site sends no SMS and no phone number by email; FAQ and About now say so, terms still does.
- /about fleet: Van row says "8 passengers, 8 medium cases"; the live active class is "Van luxury" 12 / 9. Business is described as "an executive saloon"; the live Business is a Mercedes V-Class.
- The section 6 list of the first hand-over.

## 8. Owner UAT after the control session sets the date and deploys

1. vamostaxi.site/cancellation, section 01, middle card. Expected: "Our team decides the refund and tells you by email." No "TBC" anywhere on the page.
2. Same page, section 03. Expected: "Time, address, passenger count and vehicle class can be changed before pickup, free of charge." No "72 hours".
3. vamostaxi.site/terms, section 04. Expected: "Extended city stay, up to 15 minutes: shown on your quote."
4. /privacy, /terms, /cancellation, /imprint top bar. Expected: "Last updated" shows the ship day; in Deutsch "1. Oktober 2026"-style.
5. vamostaxi.site/about. Expected: Business "7 passengers · 6 medium cases"; three cards under "Zurich first", no "In your language"; in Deutsch at laptop width nothing scrolls sideways.
6. vamostaxi.site/faq, open "When will I receive my booking confirmation?". Expected second paragraph: "Your driver's name, vehicle and plate arrive separately, by email, as soon as a driver is assigned, and again in the reminder 24 hours before pickup." Open "How do I get in touch with my chauffeur?". Expected: "You get their name by email as soon as a driver is assigned, and their direct number on your manage-booking page."
7. vamostaxi.site home, booking bar. Expected: "Free cancellation until 24 hours before pickup".
8. Book a test ride more than 24 hours ahead (card 4242 4242 4242 4242), open the manage link, press Cancel. Expected: "This trip will be cancelled. Refunded in full, automatically." After cancelling, no "waiting on review" box.
9. Book a test ride less than 24 hours ahead, cancel from the manage link. Expected: "This trip will be cancelled. Our team decides the refund and tells you by email." Then the box "Refund · waiting on review" with the same sentence.
10. Open /checkout in a private window. Expected: the cookie banner shows no "TBC".
