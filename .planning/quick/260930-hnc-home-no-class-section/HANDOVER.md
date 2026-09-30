# Home without the "Choose your class" section (quick 260930-hnc)

Branch `fix/home-no-class-section`, cut from origin/main 598edb5d. Owner order 2026-09-30 23:28: SEE PRICES already goes to the next page, so the class choice on the laptop home is a second copy.

Commits (oldest first):
- 4d8f8230 test: `home-no-class-section.spec.ts`, committed RED (failed: `[data-cc]` count 1, expected 0)
- a4375e94 feat: section removed, test green
- 5106533f docs: screens (1440/1180/1024/390 x en/de/ar)
- this file (final commit, see `git log -1`)

## Removed (app/home/home.dc.html)
- The whole `[data-cc]` block: heading, subline, three class cards (photo, name, price, seats, bags, SELECT), skeletons, warning line, message line.
- All `data-cc*` CSS, `vt-cc-pulse` keyframes, the 1081+ and 1081-1240 media rules.
- State `cc`, `ccCat`, `ccWarn`, `ccImgBad` (both initial state and the reset state).
- Methods `ccBody`, `ccLoadCatalog`, `ccSync`, `ccReset`, `ccFire`, `ccFail`, `ccReveal`, `ccWarnMissing`, `ccImgFail`, `ccCards`, `pickClass`; the `ccSync()` call and the aria-disabled loop in `componentDidUpdate`.
- renderVals keys `ccShow`, `ccWarnShow`, `ccMissing`, `ccState`, `ccBusy`, `ccMsg`, `ccCards`, and the unused `n34`.
- Helpers `ccPhotoUrl`, `ccCatalogEntry`, `classFromQuote`, `publicQuoteClass` (only the section used them).
- `goCheckout(cls)` is now `goCheckout()`: the class parameter and `class=` URL param were only set by the card click. SEE PRICES sends exactly what it sent before.
- Kept: home bar, SEE PRICES, the small class-photo route on the server (checkout uses it), /checkout class cards (untouched).

The home page now makes no POST to `/api/quote`. `HowItWorks.dc.html` still does one GET of `/api/quote` (its own, unchanged).

## Tests
- Deleted `apps/web/tests/visual/home-class-cards.spec.ts`.
- `home-laptop-bar.spec.ts`, `home-desktop-fixes.spec.ts`, `home-laptop-bar-2641.test.ts`: no case asserted the cards, nothing edited.
- `apps/web/lib/pricing/home-fleet-from-quote.test.ts`: the two guard tests that pinned ccSync/ccFire/class param now assert their absence.
- New `apps/web/tests/visual/home-no-class-section.spec.ts` (1440).

## Strings
- Deleted from `app/vamos-i18n-dict.js` (nothing else in app/, apps/web, packages/ uses them): "Choose your class", "Fixed price, all inclusive. Pick a class to continue.", "Price at checkout", "No class fits this trip. Change the passengers or the bags.", "Prices are busy for a moment. Pick a class and you see the price at checkout.", "We could not load prices just now. Pick a class and you see the price at checkout.", "Fill in the trip to see prices", "Add the missing details to see prices:", "Loading prices"; patterns "Seats up to N", "Bags up to N", "N seats", and a duplicate of "Up to N passengers/bags".
- Kept: "Select" (BrandSelect default label), "Up to N passengers/bags" (earlier pattern block, used by manage-booking), "seats".
- `apps/web/i18n/messages/*.json`: untouched (those keys belong to /checkout). Seed not regenerated, no drift, no pgTAP pin change.

## Checks on the final code commit (a4375e94; later commits are screens and this file)
- typecheck: pass
- lint: 0 errors, 5 warnings (unused eslint-disable in files I did not touch)
- lint:css: pass
- i18n:check: pass (2664 keys)
- db:seed:check: no drift
- check:numbers, check:legal-claims (3/3), check:public-env, check:db-fences (8/8): pass
- apps/web vitest, full: 286 files passed, 1 skipped; 2816 tests passed, 1 skipped (lib/ops/bookings-write.test.ts did not flake)
- New spec at 1440: red before, green after.
- Screens looked at: 1440 en, 1180 ar, 390 de. All 12 combinations: no horizontal overflow, `[data-cc]` count 0. Bar and SEE PRICES unchanged; the trust line sits directly under the bar, no gap.
- Home visual specs (`tests/visual/home-*`, all 4 component projects): 202 passed, 31 failed, rest not run because Playwright stopped after the failure cap. The failures are screenshot-baseline cases ("screenshot en ...", 6 specs x 4 projects), one "chosen date written in de" case, and 3 booking-sheet "one page goes to /checkout" cases (date helper lands in Nov instead of Oct on 30 Sep). I put the pre-change home.dc.html and dict back in my folder and ran 8 of the affected files at 1440: the same 7 failed there (all screenshot cases and the laptop-bar de date case). Not caused by this change.

## Not verified
- The 31 visual failures above at 1024/768/390 on the base (base run was 1440 only).
- The rest of the home visual specs after the failure cap (536 cases did not run in the full pass; the 1440 base comparison covered 75 more).
- Twin tests on apps/web/public beyond the ones above; no live deploy; nothing checked on https://vamostaxi.site.
- Dead pre-existing items left alone: `readyTitle` / `readySub` / `selectCta` strings in the home `T` dictionary and `[data-fleet-*]` CSS are unused by markup (not from this section; say if you want them gone).

## Owner UAT
1. Open the home page on a laptop (1440 wide), English. Expected: hero, the booking bar with SEE PRICES, the trust line under it. No "Choose your class" section at any point, including after filling From, To and When.
2. Type a pickup, a drop-off, pick a date and time, press SEE PRICES. Expected: you land on the checkout with the trip filled in and the class cards (Economy, Business, Van luxury) shown there.
3. Switch to Deutsch, then Arabic. Expected: same, no section, no sideways scroll.
4. Open the home page on a phone (390 wide). Expected: unchanged: the "Wohin?" bar, which opens the booking sheet.
