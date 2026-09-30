# Booking polish 2 - hand-over

Branch `fix/booking-polish-2`, cut from origin/main 30c91f8d. origin/main has since moved to 1ecade7b (extras part A); this branch has NOT been merged with it (the executor rules forbid `git merge`). Merge it before shipping.

## Per item

1. German class card "Koffer" (96dcfefa, seed regenerated in its own commit). Test: `apps/web/tests/unit/checkout-class-card-words-bp2.test.ts`. French ("bagages") and Arabic ("حقائب") already matched the signed picture; pictures in `screens/koffer-{de,fr,ar}-{390,1440}.png`, looked at. Only the class-card keys changed; the trip strip keeps "Gepäckstücke".
2. Class-card controls (report only, nothing changed). On /checkout the class card IS the control: one whole-card button, 122 px high at 390 and 138 px at 1440. There is no separate SELECT button on /checkout. The primary "Pay" button is 54 px at 390 and 1440 in de, fr, ar. One primary control is 44 px: the header pill "Book now" (`vt-btn--md`, shared SiteHeader, not a booking control and outside this job). The 44 px SELECT on the home class card is gone with the home class section (removed on main).
3. Dark band under the footer on the phone home page: no fix needed, guard added. The band was already gone on untouched code after native scrolling. Guard `home-no-dark-band-bp2.spec.ts` (page ends where the footer ends; 390 and 768, en/de/ar) passes.
4. Back on the phone booking page (`app/home/BookingSheet.dc.html`). Tests first, red at 68121d60 (8 of 22 failed: Back at once after X, and close/reopen/Back), green after af7eb6b1 and 650f88a8.
   - Cause (a): closing with X walked history back at once and the sheet stopped listening; a Back pressed while that step was still settling was lost or swallowed.
   - Cause (b): a reopen before the sheet's own pop landed pushed a new entry, which the pending pop then removed.
   - Fix: closing no longer walks back at once. The sheet's entry stays as a spare; a Back that lands on it hops on to the page before (same result as after any normal close). If nobody presses Back, the spare is removed quietly after 1.5 s. A reopen reuses the spare (no new entry). If a pop is pending, the reopen waits for it before taking an entry.
   - Test: `apps/web/tests/visual/home-sheet-history-bp2.spec.ts`, Chromium and WebKit at 390, (a) Back 0/100/300/500/700 ms after X, with and without a slow-traversal emulation; (b) reopen after 0/100/300 ms, Back closes it, 10 repeats each. 22 passed, then 44 passed with `--repeat-each=2`.
   - Three existing assertions that the entry is gone right after close now wait up to 5 s for it (`booking-sheet-states.spec.ts` x2, `home-booking-sheet.spec.ts` x3 lines).

## Checks (on the last code commit, this folder)

| Check | Result |
|---|---|
| typecheck | pass (one error in my own earlier test, fixed) |
| lint | 0 errors, 5 warnings (unused disable directives, not ours) |
| lint:css | pass |
| i18n:check | pass, 2665 keys |
| db:seed:gen / db:seed:check | pass, no drift; counts unchanged (content_strings 2673, pending 16, non-translatable 8, no-param 94), seed_idempotent not re-pinned; pgTAP not run (no DB) |
| check:numbers, check:legal-claims, check:public-env, check:db-fences | all pass (public-env: no build output, bundle scan skipped) |
| apps/web unit | 2838 passed, 1 failed, 1 skipped. The failure: `privacy-account-paragraph.test.ts` "manage-booking mock is untouched relative to origin/main"; it compares with origin/main, which moved after this branch was cut. Not ours; goes away when main is merged. |
| home-sheet-history-bp2 (chromium + webkit) | 44 passed (2 repeats) |
| home-booking-sheet, booking-sheet-states | only the known red "the sheet writes the chosen date in de" (x3 widths) |
| home-no-dark-band-bp2, home-no-class-section | pass |
| checkout-page | known reds only: "trip strip and three class cards", "Edit trip: fields in home order" |

## Not verified

- Real iPhone Safari. WebKit in Playwright plus a slow-traversal emulation stand in; the owner UAT below is the real proof.
- pgTAP (no database). Full home specs beyond the ones above; the lead runs the full set.
- The Koffer pictures use the fixture (no photos).

## Migrations, settings

None.

## 4242 payment step

Not needed: checkout code did not change beyond one German word in the message file (and the regenerated seed). No checkout logic touched.

## Owner UAT

1. On the phone (or browser at 390 px), language German, open /checkout with a trip. Expect each class card to read "3 Plätze  3 Koffer", not "Gepäckstücke".
2. Open the home page on the phone, scroll to the very bottom. Expect the page to end at the footer, no empty dark band below it.
3. On the phone home page, open the booking page, tap X, press Back at once. Expect to land on the page you were on before the home page, as after a normal close.
4. Open the booking page, close with X, open it again quickly (under a second), press Back. Expect the booking page to close and you to stay on the home page. Repeat a few times.
