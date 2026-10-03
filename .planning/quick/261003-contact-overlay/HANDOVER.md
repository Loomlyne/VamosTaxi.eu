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

## Not done / not proven

- **Real card payment.** The controller must make one 4242 test payment after deploy (the PAY bar changed), then read `booking_payments` by status (rule 8). The bar was proven in a browser without a database; PAY itself was disabled there (pricing closed, `CHF 000`), so `elementFromPoint` proves nothing covers it, not that a click pays.
- **`/checkout/pay/[token]`** needs a database token; not opened. It uses the same `SiteShell` float as the other Next pages (which were proven: `/review`, `/confirmation`, 404).
- **Long amounts in the phone bar.** Checked as text only on `/checkout` at 390 (not saved in any picture, so no invented price is on file): with `CHF 185.00` the Total wraps to two lines and sits close to the contact button; with `CHF 12'450.00` the Total box shrinks to about 30 px (PAY stays on top and inside the screen, but the Total text no longer fits its box). Today's `CHF 000` wraps to two lines at 390 as well ("CHF" over "000"). Not changed (design call, not in the plan); for the owner to see on real figures after the price book is live.
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
