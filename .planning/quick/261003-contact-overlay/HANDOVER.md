# Hand-over: contact button (direction B), quick 261003-contact-overlay

Branch `worktree-agent-acd57fa904c0db29b`, worktree `.claude/worktrees/agent-acd57fa904c0db29b`. Plan: `PLAN.md` (signed 2026-10-03). Nothing on `main`, nothing pushed, nothing deployed, no live database touched. Ready for the controller to check in a clean clone.

## Commits (oldest first, on top of origin/main b869237b)

| Commit | What |
|---|---|
| 4c85c313 | the plan |
| 463722ac | task 1: strings (3 dict keys, `contactButton` messages in en/de/fr/ar, seed regenerated, counts re-pinned) |
| 866b32a7 | task 2+3: `ContactButton` + `ContactRow` design components (twins in `app/home` and `app/pages`), mounted on the 18 public DC pages, cookie / booking-sheet / travellers flags |
| dabc2f3a | merge origin/main (legal lines 3cac1fc5) |
| adf792f0 | task 4: React twin on the Next pages, docked in the `/checkout` PAY bar, `ContactFab` removed |
| d3d1e59a | states-gallery visual baselines (4 languages x 4 widths); page baselines hide the float |
| 29629084 | merge origin/main again (cd047a59, one planning doc: `CONTROL-BOARD.md`, no code, no conflict) |
| dc816483 | task 5: Chromium proof script and its evidence |
| 358498d6 | hand-over (first version) |
| 4bdb8f51 | **fix: phone PAY bar Total on one line** (see "Total fix" below) |
| c8c9a6a3 | merge origin/main (e165b18f: dashboard New trip origin fix, unrelated files, no conflict) |
| this file | hand-over |

Main moved only by `cd047a59` (board note) since the last merge, so `app/vamos-i18n-dict.js` and the messages were not touched by the second merge; `db:seed:check` reports no drift, no re-pin needed.

## Gates (run on the merged tree, 2026-10-03)

| Gate | Result |
|---|---|
| Touched unit tests (`contact-button.test.ts`, `components/consent`, `lib/checkout/checkout-comments.test.ts`, `components/checkout`) | 9 files, 132 tests passed |
| `i18n:check` | passed: 2697 keys, 1041 literal call sites resolved (40 non-literal skipped, including the `ContactButton.tsx` label keys; the unit test `every contactButton message exists in the four languages` covers those) |
| `db:seed:check` | no drift |
| `typecheck` (`tsc --noEmit`) | clean |
| `lint` (eslint) | 0 errors, 6 warnings, all "unused eslint-disable" in 5 files this job did not touch |
| `lint:css` (stylelint) | clean |
| Full unit suite, once (`pnpm run test:unit`) | apps/web: 396 files passed, 16 skipped; 4289 tests passed, 31 skipped, 0 failed. packages/emails: 15 files, 239 tests. packages/db: 2 files, 14 tests. |

Every item of PLAN §5 "Tests" exists: new `apps/web/lib/contact-button.test.ts` (pages mount it, no ops file, twins identical, four hrefs, laws, hide-rule selectors, ARIA, `contact-button.ts` logic, vm-run DC logic: open, Esc, outside click, focus, keyboard flag); `reserve-and-footer.test.ts`, `banner-hosts.test.ts`, `checkout-comments.test.ts` updated to `ContactButton`.

## Browser run (Chromium, `apps/web/tests/e2e-worker/contact-button-browser.e2e.mjs`)

Local Worker build (`opennextjs-cloudflare build` on the merged tree, `wrangler dev --local` on port 4783, a throw-away config with no real binding and an unreachable database) plus the synced mocks (`sync-dc-mock-to-public.mjs`) on a small static server on 4784. `/api/**` is answered inside the browser (consent state, a two-class quote with no amounts: `total_rappen: null`, so every figure stays `CHF 000`). Servers started and stopped by me, by pid/port; the config file and the temp wrangler state are removed.

| Run | Result | Files |
|---|---|---|
| Worker, all sections | **1826 pass, 0 fail** | `evidence/worker/results-worker.json`, 115 screenshots |
| Static mocks | **1303 pass, 0 fail** | `evidence/static/results-static.json` |

What the checks cover, per page x width (1440 / 1024 / 768 / 390) x language (en / de / fr / ar), 19 DC routes + `/review`, `/confirmation`, a 404 on the Worker; 16 DC pages on the static run:
- button present exactly once, pill above 680 px / 54 px disc at 680 and below, on the inline-end side (right; left in Arabic), `scrollWidth <= innerWidth`;
- menu opens (card non-modal, phone sheet `aria-modal`), four rows with the exact hrefs (`wa.me/41796267082`, `tel:+41796267082`, `mailto:info@vamostaxi.site`, `/contact` with `/de|/fr|/ar` prefix);
- Esc closes and focus returns to the button; a click outside closes;
- `VamosLocale.coverage()` empty on the button, rows and sheet (DC pages);
- cookie card open: float steps aside at 390 (en, ar), stays at 768 / 1440 (`/about`, `/`, `/review`);
- home on a phone: disc lifted just above the "Where to?" card, back in the corner after scroll, lifts again at the top, hidden while the booking sheet is open and back when it closes (en, ar);
- text field focused at 390: float hidden; left: back; at 1440 it stays; hidden in print.
- `/checkout` (Worker only), 1024 / 768 / 390 in en and ar, each with and without the cookie card open: bar order Total · contact · PAY (PAY · contact · Total in Arabic), contact 54 x 54, no overlap, **`elementFromPoint` at PAY's centre is PAY in every case, cookie card open or not**, the float is not shown at 1080 and below, the docked button opens the same menu (sheet on a phone) and Esc returns focus to it, nothing scrolls sideways. Above 1080 (1440x900, 1280x720, 1181x700): float shown, rail PAY on top, float does not touch PAY (the short-laptop risk in PLAN §6 did not occur).

Screenshots I looked at: desktop `/about` open (charcoal CLOSE pill with yellow x bottom-right, white 344 px card, four rows, number and address left to right); phone `/about` sheet (grab bar, 44 px close, rows, scrim, nothing sideways); phone `/checkout` bar (Total, round outline button, disabled PAY, nothing floating over the form); `/checkout` 390 with the cookie card (bar lifted above the card, button visible, yellow focus ring after Esc); `/checkout` 768 menu (card anchored above the docked button, right edge aligned); `/ar/checkout` 390 (PAY left, button, Total right); `/ar/about` desktop (pill and card bottom-left, text right to left, phone number left to right); phone `/ar/confirmation` sheet; home phone (dark disc just above "Where to?"); `/checkout` 1280x720 (CONTACT pill below the rail, clear of PAY). No glow, no tinted yellow seen.

## Total fix (4bdb8f51, controller's request before ship)

**Problem.** At 390 the bar's Total wrapped ("CHF" over "000"). On origin/main (e165b18f, no docked button) a real total such as CHF 0.66 fits, but CHF 9'999.00 already wrapped there (Total box 99 px, PAY 235 px). The docked button took 66 px more, so every figure wrapped.

**Measured at 390 (before the fix, Chromium, local Worker):** bar content 350 px. PAY with the figure inside it: 201.5 px (CHF 0.66), 235.4 px (CHF 9'999.00), 242 px (CHF 12'450.00). Contact button 54 px, gaps 12 px. The Total got 70.5 px (CHF 0.66) and 37 px (CHF 9'999.00). The figure itself needs 132.5 px at 20 px for `CHF 9'999.00` / `AED 9'999.00`, 109 px for `€ 9'999.00`, 100 px for `$9'999.00` (`CHF 12'450.00`: 137 px). Neither 44 px for the button, nor an 8 px gap, nor a smaller font could make that fit while PAY repeats the figure (best case with 44 px button, 8 px gaps and a 16 px font: 55 px free, 106 px needed). So the three options you listed were not enough on their own.

**What changed (`apps/web/components/checkout/checkout-parts.css`, `PayBar.tsx`).**
1. `.vt-copay__amount { white-space: nowrap }` everywhere.
2. At 520 px and below, in the bar only: row gap 12 -> 8 px; the Total is an inline-size container and its figure is `clamp(16px, 14.5cqi, 20px)` (20 px when there is room, steps down to the 16 px floor with the room it is given, so German with the long "BEZAHLEN" label gets 16.1 px at 390 and everyone else keeps 20 px); PAY's own copy of the figure is visually hidden (clip, not `display:none`, so the accessible name still reads "PAY CHF ...") because the Total stands right next to PAY and shows the same figure. PAY keeps its label, lock, 54 px height and yellow.
3. At 380 px and below: PAY inline padding 32 -> 20 px (needed for German at 360 px).
4. The contact button stays 54 px (target well above 44 px); no new colour, no glow, logical properties only.
The PAY label on a phone therefore reads "PAY" with no figure next to it (the figure is in the Total beside it); above 520 px nothing changed. This is the one visible change; if you want the figure back inside PAY on phones, the Total cannot hold a four-digit figure at 390.

**Measured after (fix built into the Worker, `evidence/total-fix/measure/after-<width>-<lang>.json`):** for widths 360, 390, 430, 768, 1024 x en, de, fr, ar, with the figure set to `CHF 9'999.00`, `AED 9'999.00`, `€ 9'999.00`, `$9'999.00`, `CHF 12'450.00` and the real figure: all 20 combinations x 6 figures pass: one line (Range rects), `scrollWidth <= clientWidth` on `.vt-copay__amount`, the figure ends before the contact button (mirrored in Arabic), "Total" label above it, PAY inside the screen and >= 54 px high, `elementFromPoint` at PAY's centre is PAY, contact button >= 44 px (it is 54), no sideways scroll. At 390: `CHF 9'999.00` is 132.5 px in 159 px (en), 132.5 in 157 (fr), 124 in 165 (ar), 106.8 in 111 at 16.1 px (de). At 360: 20 px en/ar, 19.4 px fr, 16 px de, all fit. Below 360 in German the widest figures would not fit (340 px: 126 px figure, about 120 px free); not a requested width.
The German label in the bar reads "Total" (the message is `Total`, not "Gesamt"); the Arabic label is "المجموع" and the bar mirrors (PAY left, Total right).

**Proof with a real local quote.** Own local Supabase stack (project `vamos-taxi-cb`, ports 645xx, since stopped and removed) with the repo's local seed. The seed price book is a draft with empty rates, so a quote on it is "No class fits this trip". To get a quote with a figure, I made the seed placeholder book live on that scratch database only with the repo's own e2e fixture rates (base 1, per km 2, minimum 3 rappen, as `tests/e2e-worker/checkout-common.mjs` does) and public prices on. The Worker (build of this branch and of origin/main, `wrangler dev --local`, Mapbox/Stripe/Turnstile stand-ins) answered `/api/quote` itself; the class cards read CHF 0.61 and the Total CHF 0.66. No price was typed into any picture. The long figures were set as text inside the test after the picture was taken; those states are not saved.
- Before (origin/main e165b18f): `evidence/total-fix/before-390-en.png`, `before-390-ar.png` (the old round V button sits on PAY), `before-768-de.png`.
- After: `evidence/total-fix/after-390-en.png`, `after-390-ar.png`, `after-768-de.png`.
- Browser run, `/checkout` part, REAL_QUOTE mode (`REAL_QUOTE=1 node tests/e2e-worker/contact-button-browser.e2e.mjs http://localhost:<port> worker <out> only=checkout`): **177 pass, 0 fail**, results and 22 pictures in `evidence/total-fix/run/`. New checks per language and width (1024, 768, 390; en, de, fr, ar): as-rendered Total on one line and clear of the button, and each of `CHF 9'999.00`, `AED 9'999.00`, `€ 9'999.00`, `$9'999.00` on one line with `scrollWidth <= clientWidth`, PAY whole, >= 54 px, on top, no sideways scroll. The earlier "longest figure" check had set text on a node that did not exist until a class is chosen, so it proved nothing; it is replaced and the class is now chosen first.
- Pin test: `apps/web/components/checkout/pay-bar-amount.test.tsx` (5 tests: nowrap, 16 px floor / 20 px cap, container, figure in PAY hidden by clip not `display:none`, no glow or tint, PayBar marks the figure).
- Tools: `evidence/total-fix/tools/` (`measure-bar.mjs`, `shot-bar.mjs`, `show2.py`).

**Gates after the fix (merged tree c8c9a6a3):** `i18n:check` passed (2697 keys), `db:seed:check` no drift, typecheck clean, eslint 0 errors / 6 warnings (same 6, files not touched), stylelint clean, full web unit suite 399 files passed, 16 skipped; 4312 tests passed, 31 skipped, 0 failed.
**Checkout visual specs** (`checkout-page`, `checkout-states`, `checkout-sections`, `checkout-pay-19`, project component-1440, `VAMOS_TEST_PORT_OFFSET=3500`, one worker): 56 passed. Two findings:
- `checkout-states.spec.ts` (en and ar) had been failing since adf792f0: the gallery renders `PayBar`, which now docks the contact button, and the harness had no next-intl provider. Fixed in this commit (the spec passes the en / ar messages).
- `checkout-pay-19.spec.ts` "Have an account? Sign in carries class and extras in returnTo; voucher, company and note ..." fails the same way on a clean copy of origin/main (e165b18f): `[data-co-voucher-applied]` is never found. Not from this job, not fixed, excluded from the 56 with `--grep-invert "Have an account"`.

**Not proven.** The fix is measured in Chromium at the listed widths; not on a real phone. CHF 12'450.00 (beyond your 9'999 limit) also fits at every measured width. No test on the live host. After deploy the owner should look at the PAY bar with a real total on a phone (PAY now reads "PAY" there, the figure is in the Total).

## Not done / not proven

- **Real card payment.** The controller must make one 4242 test payment after deploy (the PAY bar changed), then read `booking_payments` by status (rule 8). The bar was proven in a browser without a database; PAY itself was disabled there (pricing closed, `CHF 000`), so `elementFromPoint` proves nothing covers it, not that a click pays.
- **`/checkout/pay/[token]`** needs a database token; not opened. It uses the same `SiteShell` float as the other Next pages (which were proven: `/review`, `/confirmation`, 404).
- **Long amounts in the phone bar:** fixed in 4bdb8f51, see "Total fix".
- **Next pages, `coverage()`:** `VamosLocale.coverage()` exists only in the DC runtime, so the Next copies (`/review`, `/confirmation`, 404, `/checkout`) are covered by the unit test on the `contactButton` messages in four languages, and by the run showing the right label per language, not by `coverage()`.
- **Software keyboard on a real phone** is not testable here: the run proves the `focusin` / `focusout` rule with a focused text field at 390, not the visual-viewport behaviour of iOS or Android.
- **Visual (Playwright) specs** were not re-run after the last merge (the merge brought one planning file). Baselines are from d3d1e59a.
- **Static run skips `/contact` and `/account`:** both leave the static path for the Worker routes (`/contact`, `/sign-in`); the Worker run covers them (`/contact` full set; `/account` passed the same checks on the Worker, where a signed-out visit may end on the sign-in page, which carries the same button, so that run does not show `/account` itself).
- In the local pictures the arrivals photo is a broken image (the Worker build has no photography served); not part of this job.
- Fixture only: the quote stub has two eligible classes and `total_rappen: null`. Real quote and class data were not used.
- The 4 hrefs, languages and hide rules are proven on the local build. Nothing was checked on https://vamostaxi.site: PLAN §7 owner UAT is still to do after the controller deploys.

## For the controller

1. Check in a clean clone of `main` with this branch merged: install from the lockfile, `i18n:check`, `db:seed:check`, typecheck, lint, full unit suite, `opennextjs-cloudflare build`.
2. Deploy needs `--env staging`; live strings are the JSON messages (`CONTENT_SOURCE` default `json`), so no database step. `seed.sql` changed (local seed only) and its pinned counts are updated.
3. After deploy: one 4242 test payment, read `booking_payments`, then the PLAN §7 owner UAT list.
4. The fare-lines build edits `SummaryRail.tsx`, the dict and the messages JSON; it should start from the commit this lands as.
5. `apps/web/.next` and `apps/web/.open-next` in this worktree are ignored build output; remove with the worktree.
