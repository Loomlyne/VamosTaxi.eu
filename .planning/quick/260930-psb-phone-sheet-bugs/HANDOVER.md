# Hand-over: quick 260930-psb (two repairs of the 26.4.2 phone booking sheet)

Written 2026-09-30. Branch `fix/phone-sheet-bugs`, folder `/Users/koss/Developer/vamos-wt/phone-sheet-bugs`, cut from origin/main.
Final commit: the one carrying this file. Folder clean. Not pushed, no PR, not deployed.
Files changed: `app/home/BookingSheet.dc.html`, `apps/web/tests/visual/home-booking-sheet.spec.ts`. Nothing else.

## What the owner reported (iPhone, vamostaxi.site, 2026-09-30 14:19 to 14:22)
1. Open the booking page, close it: the home page does not scroll until a reload.
2. Typing with the keyboard open: the sheet is too short, the home page and its bar show under SEE PRICES.

## Cause and repair
1. `assets/lenis-boot.js` lines 19 to 33: `syncLock()` stops Lenis while `<html>` or `<body>` computes to `overflow: hidden/clip`. A stopped Lenis puts `lenis-stopped` on `<html>`, and `assets/lenis.css` line 7 gives that class `overflow: clip`. So after the lock is lifted `locked(<html>)` is still true and Lenis is never started again. Every sheet or menu that locks the body hits this, not only the booking sheet.
   Repair here (the boot file is another session's): `BookingSheet._unlock()` starts Lenis itself once its own lock is gone and nothing else locks the page. The boot file is unchanged; its owner is told.
2. The sheet was sized to `visualViewport.height`. On the iPhone that is shorter than what is really visible above the keyboard, so the page showed in the gap. Now the sheet's surface always covers the whole layout viewport (`100lvh`); only its content is fitted to the visual viewport through padding (`--bs-h`, `--bs-top`). The field being typed in is scrolled into the visible part when the viewport changes.

## Checks (on this commit's tree)
| Check | Result |
|---|---|
| New: after closing by Escape, by the X and by Back, Lenis runs and the wheel scrolls the page (390, 768) | pass; red with the old file |
| New: SEE PRICES, then browser Back: home scrolls, nothing inert (390, 768) | pass |
| New: visual viewport shrunk to 45 % and panned 60 px: sheet surface covers the screen, nothing of the home page under SEE PRICES, SEE PRICES and the focused field inside the visible part (390, 768) | pass; red with the old file |
| visual home-booking-sheet | 73 passed |
| visual booking-sheet-states | 39 passed |
| visual home-booking-box | 14 passed |
| visual home-laptop-bar | 81 passed |
| Playwright WebKit, iPhone 14 profile, 390, Lenis loaded (scratch `zz-webkit.spec.ts.txt`): close by X, by Back, keyboard-sized viewport | pass |
| typecheck, lint, lint:css, check:numbers, check:legal-claims, check:public-env, check:db-fences, i18n:check, seed:check, unit tests, build | pass |
| pgTAP, replay, types:check | not run; nothing under `packages/db` changed |

## Not verified
- No real iPhone and no real keyboard. The keyboard is imitated by shrinking `visualViewport` in the test. His UAT covers it.
- Not seen on live or on a Worker build.
- The other screens that lock the body (phone menu, dialogs) still leave Lenis stopped; only the booking sheet is repaired here.

## Found, not fixed
- WebKit only: a Back pressed within 0.8 s after closing the sheet with the X is taken for the sheet's own history step and does nothing. After 0.8 s Back works.

## Migrations, settings
None.

## Owner UAT on vamostaxi.site, iPhone
1. Home, tap "Where to?", then the X. Scroll the home page. Expected: it scrolls.
2. Tap "Where to?" again, swipe back (or the browser's Back). Scroll. Expected: it scrolls.
3. Tap "Where to?", tap From and type "Zurich". Expected: the white page reaches down to the keyboard; nothing of the home page shows; the field you type in and the list stay visible.
4. Tap To and type. Expected: same; SEE PRICES sits just above the keyboard.
5. Close the keyboard. Expected: the page is full height again, SEE PRICES at the bottom.
6. Fill the trip, SEE PRICES, then Back from /checkout. Expected: the home page scrolls.
No payment step: checkout is not touched.
