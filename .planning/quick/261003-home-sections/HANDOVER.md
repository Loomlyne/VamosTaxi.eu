# Hand-over — home sections (quick 261003-home-sections)

For the control session. Branch `design/home-sections`, cut from `origin/main` `cd047a59`.
Owner signed: design (`DECISIONS.md`, question form 2026-10-03) and plan (`PLAN.md`, question form 2026-10-03).
No database change, no migration, no API change, no money / sign-in code. Not deployed. Nothing pushed.

## What changed (customer-facing: the live home is the DC mock)
- New: `app/home/VehicleClasses.dc.html`, `WhereWeDrive.dc.html`, `AirportMeet.dc.html`, `TrustFacts.dc.html`,
  `BusinessTravel.dc.html`, `ClosingCta.dc.html`.
- Rebuilt: `app/home/Services.dc.html` + `ServiceCard.dc.html`, `Reviews.dc.html`, `FAQ.dc.html`.
- `app/home/HowItWorks.dc.html`: destinations block removed (moved to WhereWeDrive); card 02 name board no longer covers the arrivals rows.
- `app/home/home.dc.html`: new section order; `vamos:dest-pick` now also fills **From** (airport) — with both mapbox ids on fixed routes
  (Davos, St. Moritz) and the Zurich Airport id on every ZRH row; GVA/BSL rows set From as typed text, like To always was.
- `app/vamos-i18n-dict.js`: one block of 88 strings + 2 patterns (de/fr/ar), merged from `i18n/J*.js`; six keys already present kept their existing translations.
- Resting yellow uses `--vt-accent` (#FDC20B); `--vt-yellow-500` (#EDB306) only as hover.
- Test: `apps/web/tests/unit/service-links-264.test.ts` follows the dest-pick move (WhereWeDrive; still no `mode`, still `handled`, now `from`).
- Visual baselines regenerated for `home.spec`, `home-how-it-works.spec`, `home-services.spec`, `home-reviews.spec` (intended changes), see results below.

Hidden until the owner gives the text (not rendered, no TBC): airport meeting points, "Licensed and insured", "Receipt by email".
`WhyVamos` untouched (still commented out). Hero untouched (owner: no change; he connects the review platforms himself).

## Checked (lead, 2026-10-03, static `apps/web/public` after `node scripts/sync-dc-mock-to-public.mjs`, all `/api` stubbed)
- `/app/home/home.dc.html` at 1440/1024/768/390 × en/de/fr/ar: no sideways scroll, no page errors in any of the 16;
  `VamosLocale.coverage` lists no string from the new/rebuilt sections (it lists five hero strings in every language — the hero
  translates them through its own table; pre-existing, hero not touched).
- Clicks: ZRH → Davos fills "Zurich Airport" / "Davos"; GVA → Lausanne fills "Geneva Airport" / "Lausanne"; FAQ topic switch opens
  its first item; "Price this class" lands `#book` at 88 px; RTL arrows mirrored (computed `matrix(-1,0,0,1,0,0)`).
- Reviews: 0 and 2 published rows → section absent; 3 and 8 → chips per platform + wall (J5 run).
- `node scripts/check-i18n-coverage.mjs` passed. Unit: 8 home-related files, 103 tests passed after the service-links update.
- Playwright home specs at component-1440 before baseline update: 139 passed, 6 failed — 4 intended (home, how-it-works, services,
  reviews) and 2 not caused here: `home-hero` "en empty" (baseline shows an older hero) and `home-why-vamos` "support-on-driven"
  (one progress bar mid-animation); neither file is touched by this branch.
- Pictures: `screens/built-sec-*-en-1440.png`, `screens/built-sec-*-ar-390.png`, `screens/built-home-{en-1440,de-768,ar-390,en-390}.png`.

## Not checked
- The local Worker build (`wrangler dev`) and live; the class photos and fixed routes come from live `/api/quote` (shape confirmed read-only).
- The React twin (`apps/web/components/home/*`) — reaches no customer, out of scope.
- Native read of the French copy written in this job.

## For the owner after deploy (UAT, numbered)
1. Open https://vamostaxi.site on a phone. Expected order under the booking card: How it works, Our classes, Where we drive, At the airport, Services, (Reviews only with 3+ real reviews), Why book with us, Business travel, FAQ, the charcoal "Your driver is waiting." band, footer.
2. In Where we drive tap "Zurich Airport → Davos". Expected: the booking card opens with From "Zurich Airport" and To "Davos" both filled.
3. Tap "Price this class" on Business. Expected: the page scrolls to the booking card.
4. In FAQ tap "At the airport". Expected: "Where do I meet my driver?" opens as a white card with no line between question and answer.
5. Switch to العربية. Expected: every section reads right-to-left in Arabic, arrows point left.
