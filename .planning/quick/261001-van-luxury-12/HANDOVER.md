# Hand-over: Van luxury takes up to 12 travellers (quick 261001)

Job session, 2026-10-02 01:15 +04. Branch `feat/van-luxury-12`, folder `.claude/worktrees/van-luxury-12`.
Plan signed by the owner in this session 2026-10-01 23:59 +04 (`PLAN.md`). Owner decision: "Raise to 12" (2026-10-01 16:03).

- **Tested tree:** `4566847e`, the merge of `origin/main` `b9e0690c` into the branch. The merge was clean.
- **Hand-over commit:** the commit that adds this file. It contains only `.planning` docs.
- **Folder:** clean.
- **Local database stack:** stopped (`vamos-taxi-vl12`, ports 644xx, scratch workdir).
- **Migrations, settings, prices:** none, so none is new. Live data was read with selects only.

## What changed

The traveller limit now comes from the class rows (`effective_max_pax` = lower of `vehicle_classes.passenger_capacity`
and `distance_rates.max_pax`). It is no longer a hard-coded 8. The number 16 appears only as the database limit on a leg,
and only as a fallback.

| File | Change |
|---|---|
| `app/home/home.dc.html` | Reads the class list once from `GET /api/quote` (`idleBoard()`, shared with How it works). The + button stops at the most seats among bookable classes (12 today). The value is clamped when the list arrives, and the hand-off URL and the sheet get the same limit. Falls back to 16 if the list never comes. |
| `app/home/BookingSheet.dc.html` | New prop `paxMax` (declared in `data-props`); the phone and tablet + stops there. |
| `app/home/HowItWorks.dc.html` | Uses the same single `GET /api/quote` answer, so home still makes one request. |
| `apps/web/lib/checkout/trip-url.ts` | `PAX_MAX` 8 → 16 (database limit, same as `POST /api/quote`). Unblocks `/checkout?pax=10` and `POST /api/checkout/intent`. |
| `apps/web/lib/checkout/party-cap.ts` (new) | Most seats among the quoted classes that are bookable apart from party size. |
| `apps/web/app/[locale]/checkout/CheckoutPage.tsx`, `sections/TripEditor.tsx` | The Edit trip Passengers counter stops at `partyCap` of the quote on screen. |
| `app/ops/OpsNewTrip.dc.html` | Dashboard New trip no longer turns 10 into 8. The class list shows only the classes that fit. |
| `app/vamos-i18n-dict.js` | Own new pattern entries only. Arabic counts 11–99 with the singular accusative: "12 راكبًا" and "12 مسافرًا", where it used to read "12 ركاب". The entries sit above the general `(\d+)` ones because the first match wins. |
| Tests | `trip-url.test.ts` (10, 12 and 16 accepted; 17 refused), `party-cap.test.ts`, `lib/pricing/party-van-luxury-12.test.ts` (10 → only Van luxury; 13 → none; rate `max_pax` 8 blocks 10), `tests/unit/van-luxury-12-mocks.test.ts` (no 8 left; `boardPartyCap` run for real; the Arabic, German and French patterns run against the real dictionary). |

**Money path, checked.** The payment step re-prices from the signed quote. A class that does not fit has no price and is
refused (`lib/quote/intent.ts:215/231`). A `trip.pax` that differs from the lock is refused (`lib/checkout/intent.ts:429`).
The booking row takes the traveller count from the lock. `POST /api/quote` still refuses more than 16.

## Checks on `4566847e` (one run, 2026-10-02 01:08 +04)

| Gate | Result |
|---|---|
| typecheck | pass |
| lint | pass |
| lint:css | pass |
| i18n:check | pass (2684 keys) |
| check:legal-claims | pass |
| check:numbers | pass |
| check:public-env | pass |
| check:db-fences | pass |
| db:seed:check | pass (no drift) |
| test:unit | pass: web 3548 passed / 5 skipped, emails 165, db 14 |
| build | pass |

The same 11 gates also passed on the pre-merge tip `2d4a6960`.

**Chromium against the local Worker build.** Setup:
- Build: `opennextjs-cloudflare build` after `sync-dc-mock-to-public`.
- Data: own local Supabase stack, with class rows shaped like live: Economy 3/3, Business 7/6, Van luxury 12/9, and a local live price book with stand-in amounts of 1–3 rappen.
- Stand-ins: Mapbox, Stripe and Turnstile reached through a fetch rewrite in the built `worker.js` only.

Scripts and results are in `evidence/`; pictures are in `screens/`.

- **Full flow at 1440, en (11/11 PASS, `evidence/full-flow-en-1440.txt`):**
  - Home asks for the class list once.
  - + stops at 12; minus goes back to 10.
  - "See prices" hands `pax=10` to /checkout.
  - The quote for 10 offers only Van luxury; Economy and Business are greyed "Seats up to 3 / up to 7".
  - Edit trip stops at 12.
  - PAY → `/api/checkout/intent` 200 → Stripe stand-in. The local booking row is `pending | 10 | van-luxury`.
- **Stepper at 1440 / 1024 / 768 / 390 × en, de, fr, ar (76/76 PASS, `evidence/matrix.txt`):**
  - Stops at 12 everywhere.
  - "12" fits its slot, and nothing scrolls sideways.
  - Phone and tablet sheet order is Where → When → Who, the same as desktop.
  - `VamosLocale.coverage` of the open panel or sheet is 0 in de, fr and ar.
  - Arabic is `dir=rtl`.
  - No page errors.
- **Arabic label (`evidence/arabic-label.txt`):** the travellers button reads "12 راكبًا · 0 حقائب".
- **Dashboard New trip on the dashboard host, local admin (3/3 PASS, `evidence/ops-new-trip.txt`):** 10 travellers reach the quote unchanged, and the class list holds only Van luxury.

## Not verified

1. **A real Stripe payment.** Locally, Stripe was a stand-in. The 4242 payment on vamostaxi.site is owner UAT 1.
2. **Real Mapbox routes and prices.** Locally, there was a fixed 30 km route and stand-in amounts.
3. **`db:types:check`.** Its script reads the default local port 54322, which job sessions must not use. There is no schema change in this job.
4. **pgTAP and the from-zero replay.** There is no migration.
5. **Playwright visual and integration specs.** Not run; a grep found no spec that asserts a traveller 8.
6. **A fresh-session review.**
   - What was done: an Opus subagent of this session read the diff, read-only. It found no blocker on the money path.
   - Why it matters: this job changes the checkout traveller check (`PAX_MAX`), so the rule asks for a fresh reviewer session before ship.
7. **The plan's UAT wording.** The plan said Economy and Business read "Not available for 10 passengers". The live wording is the greyed card with "Seats up to 3 / Seats up to 7". The UAT below uses the real wording.

## For the controller (not changed here)

1. **P6 files.** `app/pages/manage-booking.dc.html:693-697` and `app/pages/booking-detail.dc.html:675-679`:
   - **The fault:** they hard-code class seats (Business 3, Van luxury 7, bags 8), and their travellers counters stop at 8 (`bump('pax', …, 1, 8)`).
   - **What a customer sees:** on a paid 10-traveller Van luxury booking these pages show "Up to 7 passengers", and minus jumps from 10 to 8. The counter saves nothing.
   - **Fix:** after P6, from the class rows.
2. **Arabic, already wrong before this job.** "2 ركاب" should be the dual, and bag counts 11–16 use the 3–10 plural.
3. **Reviewer nits, all minor:**
   - A `pax=14` link with limit 12: the minus jumps 14 → 12.
   - If `GET /api/quote` fails, home allows up to 16 for that visit, and /checkout then shows no class that fits.
   - Dashboard New trip: 13–16 shows an empty class list with no message; 17 or more shows "Quote failed".
   - On /checkout, the Edit trip limit follows the route already quoted.
4. **About page.** B7 (`ea1141e7`) already says Van luxury 12. Nothing is left there.

## Owner UAT (after the ship)

1. **4242 payment for 10 in Van luxury.** On vamostaxi.site, book Zurich Airport → Zurich city for 10 travellers. Choose Van luxury and pay with 4242 4242 4242 4242.
   Expected:
   - Economy and Business are greyed ("Seats up to 3", "Seats up to 7").
   - The payment goes through, and the confirmation page shows 10 passengers, Van luxury.
   - The controller then reads `booking_payments` by status.
2. **Home limit.** On vamostaxi.site home, open Travellers and press + until it stops. Expected: it stops at 12.
3. **Dashboard New trip.** In the dashboard, open New trip and type 10 passengers with a pickup, a drop-off, a date and a time. Expected: only Van luxury is in the class list.
4. **Phone in German and Arabic.** Open home on a phone, switch to Deutsch, then العربية, and press + to 12. Expected: 12 at most, nothing overflows; in Arabic the travellers label reads "12 راكبًا".
