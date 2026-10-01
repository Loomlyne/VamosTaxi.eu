# Hand-over: Van luxury takes up to 12 travellers (quick 261001), round 2

Job session, 2026-10-02 (+04). Branch `feat/van-luxury-12`, folder `.claude/worktrees/van-luxury-12`.
Plan signed by the owner in this session 2026-10-01 23:59 +04 (`PLAN.md`). Owner decision: "Raise to 12" (2026-10-01 16:03).

- **Round 2:** the controller's fresh review (2026-10-02) asked for items 1, 4 and 7. All three are done below.
- **Tested tree:** `a56597de`. It includes the merge of `origin/main` `dace2b1f` (merge commit `c606adb9`).
- **Hand-over commit:** the commit that adds this file. It contains only `.planning` docs.
- **Folder:** clean.
- **Local database stack:** stopped (`vamos-taxi-vl12`, ports 644xx).
- **Migrations, settings, prices:** none, so none is new. Live data was read with selects only.

## What changed

The traveller limit comes from the class rows (`effective_max_pax` = lower of `vehicle_classes.passenger_capacity`
and `distance_rates.max_pax`). It is no longer a hard-coded 8. The number 16 appears only as the database limit on a leg.

| File | Change |
|---|---|
| `app/home/home.dc.html` | One `GET /api/quote` (`idleBoard()`, shared with How it works). + stops at the most seats among bookable classes (12 today). The value is clamped when the list arrives; the hand-off URL and the sheet get the same limit. Falls back to 16. |
| `app/home/BookingSheet.dc.html` | New prop `paxMax` (in `data-props`); the phone and tablet + stops there. |
| `app/home/HowItWorks.dc.html` | Same single `GET /api/quote` answer. |
| `apps/web/lib/checkout/trip-url.ts` | `PAX_MAX` 8 → 16 (database limit, same as `POST /api/quote`). |
| `apps/web/lib/checkout/party-cap.ts` (new), `CheckoutPage.tsx`, `TripEditor.tsx` | The /checkout Edit trip counter stops at the most seats among the quoted classes. |
| `app/ops/OpsNewTrip.dc.html` | No silent 8. **Review 4:** Passengers keeps digits only and never goes above 16 (20 typed reads 16, so "Quote failed" is gone). When the quote has no class for the party, Vehicle class shows "No class seats 14 passengers". The line keys on the count that was quoted, because such a quote returns no `quote_id`. |
| `app/vamos-i18n-dict.js` | Own new entries only. Arabic 11–99 travellers: "12 راكبًا" and "12 مسافرًا". The new dashboard line in four languages, with Arabic forms for 1, 2, 3–10 and 11–99. |
| `app/vamos-locale.js` | **Review 1 (blocker):** `fromPattern` now rebuilds the English from the captures, in the template's own group order, and skips a pattern whose regex does not match it. Before, every group widened to `(.+)`, so after a German or French page switched to Arabic, "Bis zu 7 Passagiere" became "حتى 7 راكبًا". A template that leaves a group out (e.g. "Das ist die einzige Buchung.") is kept as before. |
| `apps/web/lib/checkout/reprice.ts`, `apps/web/app/api/checkout/intent/route.ts` | **Review 7:** the route's reading of a signed lock moves, unchanged, into `repriceFromLock`, so a test runs the real code. |
| Tests | <ul><li>`trip-url.test.ts`, `party-cap.test.ts`, `lib/pricing/party-van-luxury-12.test.ts`</li><li>`tests/unit/van-luxury-12-mocks.test.ts`: dashboard clamp, line wiring, every quote reset clears the count</li><li>**new** `tests/unit/locale-pattern-switch.test.ts`: the real dictionary and the real `vamos-locale.js`; de→ar and fr→ar for 3, 7, 10 and 12; en→ar; ar→en/de; the dashboard line. It fails on main's runtime.</li><li>**new** `lib/checkout/party-intent-van-luxury-12.test.ts`: the real engine prices 10 travellers, the lock is minted as `/api/quote` mints it, and `checkIntentAgainstLock` + `repriceFromLock` refuse Economy and Business and accept Van luxury (and Economy for 3).</li></ul> |

**Money path, checked.**
- The payment step reads the signed lock. A class the quote did not price is refused.
- A `trip.pax` that differs from the lock is refused (`lib/checkout/intent.ts:429`).
- `POST /api/quote` still refuses more than 16.

## Checks on `a56597de` (one run, 2026-10-02 +04)

| Gate | Result |
|---|---|
| typecheck | pass |
| lint | pass |
| lint:css | pass |
| i18n:check | pass |
| check:legal-claims | pass |
| check:numbers | pass |
| check:public-env | pass |
| check:db-fences | pass |
| db:seed:check | pass |
| test:unit | pass: web 3573 passed / 5 skipped, emails 165, db 14 |
| build | pass |

## Chromium against the local Worker build (`a56597de` code; evidence in `evidence/`, pictures in `screens/`)

Setup:
- **Data:** own local Supabase stack, with class rows like live (Economy 3/3, Business 7/6, Van luxury 12/9) and stand-in amounts of 1–3 rappen.
- **Stand-ins:** Mapbox, Stripe and Turnstile, reached through a fetch rewrite in the built `worker.js` only.

| Check | Result |
|---|---|
| Full flow at 1440, en (`full-flow-en-1440.txt`) | **11/11 PASS.** + stops at 12; `pax=10` reaches /checkout; only Van luxury fits (Economy and Business greyed "Seats up to 3 / up to 7"); Edit trip stops at 12; PAY → intent 200 (VT-26-0002); local row `pending \| 10 \| van-luxury`. |
| Language switch through the header menu (`language-switch.txt`) | **6/6 PASS.** de→ar and fr→ar, `dir=rtl`: 7 → "7 ركاب · 0 حقائب", 12 → "12 راكبًا · 0 حقائب", then back to "12 passengers · 0 bags". |
| Same switch with main's old runtime served (`runtime-compare.txt`) | FAIL, as expected: "7 Passagiere · 0 حقيبة". This shows the fault the fix removes. |
| Runtime comparison, old vs fixed (`runtime-compare.txt`) | 2,529 cross-language lookups; 185 change; 0 lose their translation. The changes are corrections, for example "Bis zu 7 Gepäckstücke" → "Up to 7 bags" where it was "Bis zu 7 bags". |
| Matrix (`matrix.txt`) | **76/76 PASS** at 1440/1024/768/390 × en/de/fr/ar. 12 max, no sideways scroll, coverage 0, no page errors. |
| Dashboard New trip (`ops-new-trip.txt`) | **6/6 PASS.** 10 → only Van luxury; 14 → "No class seats 14 passengers"; 20 typed reads 16 and quotes 16 (no "Quote failed"); the line switched to de, then ar: "Keine Klasse hat Platz für 16 Passagiere" → "لا توجد فئة تتسع لـ 16 راكبًا". |

Two notes on the local runs:
- **Quote rate limit:** the dashboard has no verified quote cookie, so it uses the smaller quote bucket: 4 a minute per address. The local test spaces its quotes a minute apart. On live, an operator who re-quotes more than 4 times in a minute would likely get "Quote failed" the same way. I saw this locally only, not on live, and it is pre-existing.
- **`/api/fx` in the dashboard test:** the dashboard test answers `/api/fx` itself, because that call goes to the internet and crashed wrangler's local proxy twice. It is not part of this change.

## Not verified

1. **A real Stripe payment and real Mapbox.** Locally both were stand-ins. Owner UAT 1 covers the payment.
2. **`db:types:check`.** Its script reads the default local port 54322, which job sessions must not use. There is no schema change.
3. **pgTAP and the from-zero replay.** There is no migration. The controller already ran pgTAP on round 1.
4. **Playwright visual and integration specs.**
5. **The French old-runtime browser run.** The local Worker dropped during it. The German one shows the fault; the node comparison covers French.

## Left for later, as the controller asked (not changed here)

3. **Home falls back to 16 when the quote API fails.** The server still refuses at /checkout.
5. **Dashboard booking edit.** It writes pax with no seat check (pre-existing).
6. **`app/pages/manage-booking.dc.html:693` and `app/pages/booking-detail.dc.html:675`.** They hard-code Business 3 / Van luxury 7 seats, and their counters stop at 8. These are P6 files, queued after P6.

Also pre-existing:
- Arabic dual "2 ركاب" in the older entries.
- Bag counts 11–16 in Arabic.
- A `pax=14` link: on /checkout the minus jumps 14 → 12.
- The /checkout Edit trip limit follows the route already quoted.

## Owner UAT (after the ship)

1. **4242 payment for 10 in Van luxury.** On vamostaxi.site, book Zurich Airport → Zurich city for 10 travellers. Choose Van luxury and pay with 4242 4242 4242 4242.
   Expected:
   - Economy and Business are greyed ("Seats up to 3", "Seats up to 7").
   - The payment goes through, and the confirmation shows 10 passengers, Van luxury.
   - The controller then reads `booking_payments` by status.
2. **Home limit.** On the home page, open Travellers and press + until it stops. Expected: it stops at 12.
3. **German → Arabic.** On the home page in Deutsch, set Travellers to 7, then switch the language to العربية. Expected: the travellers button reads "7 ركاب · 0 حقائب"; at 12 it reads "12 راكبًا".
4. **Dashboard, 10 travellers.** Open New trip and type 10 passengers with a pickup, a drop-off, a date and a time. Expected: only Van luxury is in the class list.
5. **Dashboard, 14 travellers.** In the same form, type 14. Expected: under Vehicle class, "No class seats 14 passengers". Typing 20 shows 16.
