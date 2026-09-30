# Hand-over: quick 260930-phm (phone home: Trustpilot row, full-page menu, hero behind the browser bars)

Written 2026-09-30. Branch `fix/phone-home`, folder `/Users/koss/Developer/vamos-wt/phone-home`. origin/main with 26.5 and the sheet repair is merged.
Final commit: the one carrying this file. Folder clean. Not pushed, no PR, not deployed.

## Owner's words and signatures (question form, 2026-09-30, pictures `screens/new-*.png`)
1. Trustpilot details smaller, redesigned, inside the white card under the phone booking bar. **Signed: "Row only (picture 1)"**: one row, the three check lines not shown on the phone when reviews exist.
2. The menu opens as a full page, not a side panel. **Signed.**
3. No white strips at the top and bottom of Safari, hero 100vh. **"Yes, build it"**, after being told a page cannot remove Safari's own bars, only reach behind them and make them dark, and that he judges it on his iPhone.

## What changed
- `app/home/home.dc.html` (phone and tablet rules, <=1080):
  - New row `[data-bar-trust]` inside the bar card: Trustpilot mark, five stars, score, review count, chevron; the whole row links where "Read reviews" linked. Figures come only from the published reviews store. The big `[data-trust]` block and the check lines are hidden while the row shows.
  - No published review: no row, no figure; the three check lines show in readable grey (they were white on white before).
  - Hero `min-height: 100lvh`; the content block keeps `100svh`, so the booking bar stays where it was, above the address bar. `html` and `body` ground charcoal so Safari tints its bars dark. Side effect: the empty 400 px under the footer on the phone is now dark like the footer instead of light.
- `app/pages/SiteHeader.dc.html` and its twin `app/home/SiteHeader.dc.html` (identical files), and the React twin `apps/web/components/shell/SiteHeader.css`: the phone and tablet menu sheet is full width and full height under the 60 px dark header bar; no side border, no shadow. Laptop unchanged (no menu button there).
- New spec `apps/web/tests/visual/home-phone-hero.spec.ts`.

## Checks (on the merged tip)
| Check | Result |
|---|---|
| visual home-phone-hero (new) | 22 passed (390, 768, 1024; laptop case at 1440) |
| visual home-booking-sheet | 73 passed |
| visual home-booking-box | 14 passed |
| visual home-laptop-bar | 81 passed |
| typecheck, lint, lint:css, check:numbers, check:legal-claims, check:public-env, check:db-fences, i18n:check, seed:check, unit tests, build | pass |
| visual shell, home, home-hero, error-pages | red, and red in the same way without this branch (56, 4, 4, 1 failures on feat/class-photo-small, which has none of these changes): harness "Output generation failed" and the React home not rendering. 26.0's list, not caused here. |
| pgTAP, replay, types:check | not run; nothing under `packages/db` changed |

## Not verified
- No real iPhone. Whether Safari's top and bottom bars turn dark, and how the hero looks behind the floating address bar, is only known after he looks. The pictures are Playwright WebKit with an iPhone profile and show no browser bars.
- The full-page menu on the React pages (/checkout, /confirmation, /account) was not pictured; their stylesheet got the same rule as the mock.
- Not seen on live or on a Worker build.
- The hero photo is absent in the test pictures (the harness does not serve `/photos/site/`).

## Migrations, settings
None. No new string: the row reuses the existing review-count strings.

## Files outside the home page
`app/pages/SiteHeader.dc.html`, `app/home/SiteHeader.dc.html`, `apps/web/components/shell/SiteHeader.css`: shared by every public page.

## Owner UAT on vamostaxi.site, iPhone
1. Open the home page. Expected: under "Where to?" one small row inside the white card: Trustpilot, five stars, 5.0, 5 reviews. No big Trustpilot block under the card.
2. Tap the row. Expected: the reviews open.
3. Look at the top and bottom of Safari. Expected: no white strip; the clock area and the address bar sit on dark. Tell me what you see; this is the part I could not test.
4. Scroll to the very end. Expected: the page ends dark under the footer, no light band.
5. Tap the menu button. Expected: the whole screen is the menu, dark Vamos bar on top, X to close, Sign in, language, currency, links.
6. Tap X. Expected: back on the page, and it scrolls.
7. Open a legal page (Terms), tap the menu. Expected: the same full page, with the yellow "Book a transfer" on top.
8. Switch to Deutsch and العربية on the home page. Expected: the row reads "5 Bewertungen" and the Arabic count, mirrored in Arabic.
9. iPad or a tablet width: repeat 1 and 5. Expected: the same.
No payment step: checkout is not touched.
