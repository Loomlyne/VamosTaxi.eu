---
phase: quick-260928-lux
plan: 01
subsystem: home booking widget
tags: [home, phone, booking-funnel, quote]
requires: [/api/quote lock + quote_id, goTripOpen()]
provides: [phone SHOW FIXED PRICES -> /checkout/trip]
affects: [app/home/home.dc.html, apps/web/public/app/home/home.html (synced, gitignored)]
tech-stack:
  added: []
  patterns: [one-shot navigation flag consumed in applyLive, quote-input signature pinned at request time]
key-files:
  created: [apps/web/tests/visual/home-phone-show-prices.spec.ts]
  modified: [app/home/home.dc.html]
decisions:
  - "Phone (tier 0) SHOW FIXED PRICES reuses goTripOpen(); tablet/desktop unchanged"
  - "quoteSig() pinned at fireQuote time; applyLive only navigates when it still matches the current inputs"
metrics:
  completed: 2026-09-28
  tasks: 2
  files: 2
---

# Quick 260928-lux: Phone "Show fixed prices" continues to /checkout/trip

Under 700px the class strip is hidden, so a phone user got a live quote and no visible change. On tier 0, SHOW FIXED PRICES now saves the trip (`vehicle: ''`, priced classes, lock, quote_id) and goes to `/checkout/trip` through the existing `goTripOpen()`. It does this only after `/api/quote` returns a lock and a quote_id. Tablet and desktop still only quote.

## What changed

- **`app/home/home.dc.html`** (logic only; no markup, CSS or strings changed):
  - Added `quoteSig()`, built from mode, pickup, dropoff, date, time, pax, bags, flight, currency and hours.
  - Added `phoneToTrip()`. If a locked quote is already live for the same inputs, it calls `goTripOpen()` straight away with no new POST. Otherwise it sets `_goTripFree`, announces `getting`, and calls `q()`.
  - `goQuote` and `applySheet` call `phoneToTrip()` when `tier === 0`. Otherwise they call `q()` as before.
  - In `applyLive`, `_goTripFree` is used up after the existing `_goTripKey` branch, which still takes precedence. With lock + quote_id it calls `goTripOpen()` and returns, so the `savedGo` announcement is not overwritten. Without them it announces `needTrip`.
  - `_goTripFree` and `_liveSig` are cleared on every failure path: `!r.ok`, `failAll` (hourly, missing place, fetch catch), the `flightMissing` early return, and `ok:false`.
- **Synced** with `node scripts/sync-dc-mock-to-public.mjs`. `apps/web/public/app/home/home.html` contains 8 `_goTripFree` hits (gitignored, so not committed).

## Tests run

**RED, before the fix**, with the new spec at component-390, 1024 and 1440:
- FAIL: `[390] phone: a locked quote continues to /checkout/trip` (TimeoutError: page.waitForURL 8000ms)
- FAIL: `[390] phone: a second tap on a live locked quote navigates without a new quote` (TimeoutError: page.waitForURL 8000ms)
- PASS: `[390]` refused quote (ok:false) and aborted quote do not navigate. `[1024]` tablet and `[1440]` desktop stay on the page.
- Result: 2 failed, 4 passed, 12 skipped.

**GREEN, after the fix**, with new spec + home-fleet-availability + home-one-way at 390, 1024 and 1440:
- All 6 new-spec tests pass.
- home-one-way passes at 1024 and 1440.
- Result: 8 passed, 4 failed, 12 skipped. All 4 failures are in the older specs and were already failing before this change (see Deferred Issues).

**Stability:** new spec with `--repeat-each=3` at 390 and 768: 12 passed, 0 failed.

**Unit:** `npx vitest run tests/unit/home-flight-fixtures.test.ts`: 3/3 passed.

**Law checks on the diff:** 0 hits for `box-shadow`, `--vt-yellow-`, hex colours or `CHF`. The only quoted literal added is the status `'live'`. No new UI copy; announcements reuse `getting`, `savedGo` and `needTrip`, which already exist in en/de/fr/ar. The React-port grep (`goQuote|tShowPrices` in apps/web/app and apps/web/components) found nothing.

## Deviations from Plan

1. **[Rule 1 - Bug] Stale in-flight quote could navigate with a lock for older inputs.** `phoneToTrip` calls the debounced `q()`. Until the new request runs, an older request is still current by `reqSeq`. The fix pins `sig = quoteSig()` when `fireQuote` starts. `applyLive` only records `_liveSig` and uses up `_goTripFree` when that `sig` still equals the current inputs. Otherwise the flag waits for the pending quote.
2. **[Rule 3 - Blocking] The spec harness does not match the current home.** On phone the booking card is now inline (`data-book-compact`), not a sheet. Tapped on phone, the SHOW FIXED PRICES button is `goQuote` (line 438); `applySheet` also gets the fix. `openBookingIfNarrow` was dropped from the new spec. Day "5" is in the past today, so the spec uses Next month → 5. Picking ZRH switches to Airport pickup, which needs a flight, so the spec fills `LX 54`.
3. **The 1440 "tap does not navigate" check moved to 1024.** At 1440 there is no SHOW FIXED PRICES button (`data-upto-wide` hides it at 1080px and above), and desktop quotes automatically. The tablet test at component-1024 now covers "tap quotes into the strip and does not navigate". The 1440 test checks that the live quote fills the strip and the page never navigates.
4. **One commit, not RED/GREEN commits.** The plan specifies a single local commit, and the orchestrator said not to commit docs. The plan and summary are not in the commit.

## Deferred Issues (pre-existing, out of scope)

- `tests/visual/home-fleet-availability.spec.ts` fails at 390, 1024 and 1440. It clicks day "5" in the current month, which is in the past on 2026-09-28. At 390 it also relies on the old sheet.
- `tests/visual/home-one-way.spec.ts` fails at 390. `openBookingIfNarrow` matches the date button (`aria-haspopup="dialog"`), not a sheet trigger, so `[data-shell][data-open="1"]` never appears.
- Both specs failed the same way in a baseline run before any code change.

## Status

- Commit `1ef815c3` is on local `main`, which is now 1 ahead of `origin/main`. Not pushed.
- Not deployed. Deploying Worker `vamos` waits for Koss.

## Self-Check: PASSED

- FOUND: app/home/home.dc.html (`_goTripFree` x8)
- FOUND: apps/web/tests/visual/home-phone-show-prices.spec.ts
- FOUND: commit 1ef815c3
