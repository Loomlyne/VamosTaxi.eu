# Code verification — quick 261003-site-polish

Single verifier, 2026-10-03 22:20 → 2026-10-04 00:12 +04. Worktree `.claude/worktrees/site-polish`, branch `design/site-polish`,
HEAD `e81f5648` (origin/main `fddfae18` merged in). Diff checked: `git diff origin/main...HEAD` without `.planning`.
Nothing committed, pushed or deployed.

## Verdict

PASS with fixes. I found and fixed 6 defects, all in tests, lint or a token copy. No product behaviour changed.
What the controller still has to do: regenerate the full-page baselines listed in item 6.

## Owner items against DECISIONS.md

| Item | Verdict | Evidence |
|---|---|---|
| R1-1 Shared section uses the home design (FAQ) | PASS | `app/pages/FaqSection.dc.html` is byte-identical to `app/home/FAQ.dc.html` (cmp). faq and contact import it. 12 questions on home, 19 on /faq (spec "full set"). The name FaqSection is needed because `app/pages/FAQ.dc.html` and `faq.dc.html` are the same file on macOS. |
| R1-2 Safari hero | PASS (done earlier, 47aa8665) | home-phone-hero spec green at all 4 widths. |
| R1-3 Contact button cycles WhatsApp us / Call us / Email us; over the footer | PASS | `ContactButton.dc.html` l.230-232 / 477-479. WhatsApp step is #25D366 with the white logo on the page AND over the footer (l.88-90). Call/Email are charcoal on the page and `--vt-accent` over the footer (l.81-83). contact-button spec green, with its baselines updated in the branch. |
| R1-4 Platform stars; reviews on other pages | PASS | Live DOM shows `[data-plat]` google / trustpilot / tripadvisor. Reviews is mounted on home, about, contact and faq (twins identical). |
| R1-5 Business travel: look A only | PASS | No look/cinematic prop is left in `BusinessTravel.dc.html`. |
| R1-6 WhatsApp logo everywhere | PASS | 5 `whatsapp.svg` imgs on home (footer, header, FAQ help, contact). React twins (SiteFooter, SiteHeader, imprint, ContactButton) match. |
| R2-1 Address list | PASS | The server sends `kind` (`lib/geo/mapbox.ts` l.92-107, 240). There is no client re-sort; the only `.sort()` left in home is the time slots. Popular picks, skeleton and empty state are in home and BookingSheet. The RTL postcode rule reaches the sheet (`BookingSheet.dc.html` l.101). booking-sheet-states and home-booking-sheet are green. |
| R2-2 Tablet card at 681-1080; phone ≤680 keeps bar + sheet | PASS | home-laptop-bar has a "tablet card" block, green at 1024/768. The boundary test was stale; I fixed it (see below). It now proves 680 = bar and 681 = card. |
| R2-3 Route rows: no hover, charcoal text, focus ring, laws.css wins on home | PASS | Live: row bg/colour before and after hover = transparent / rgb(30,31,31). Arabic arrow icon computes `matrix(-1,0,0,1,0,0)` from laws.css, so it points at the destination. On home `--vt-yellow-700` = #2B2D2C and `-100` = #F6F6F6 (3/3 runs after the page settled). The home helmet links the token files before `styles.css`. NOTE: one read taken right on load still showed #A67B05, before the `@import` of laws.css had loaded. Settled state is correct. |
| R2-4 Reviews drift | PASS | It is a CSS `@keyframes` animation only, with no scroll handler. Drift starts above 6 reviews. It pauses on hover/focus-within, stands still on phones ≤680 and under reduced motion. Clones are aria-hidden and inert. It uses an alpha mask fade. reviews-drift is 28/28 green after my spec fixes. |
| R2-5 ClosingCta removed | PASS | The file is deleted. Its two strings are gone from app/, tests and lib (grep). The hero "Land in Zurich. Your driver is waiting." stays. |

## Gate table

| Gate | Result |
|---|---|
| `node scripts/check-i18n-coverage.mjs` | PASS (2699 keys) |
| `node scripts/sync-dc-mock-to-public.mjs` | PASS (20 pages, 19 entries) |
| `tsc --noEmit -p apps/web` | 1 branch error (`reviews-drift.spec.ts:36`), fixed → **0 errors**. The worktree has no `packages/db/node_modules`, so it shows 9 `postgres` module errors. Those are environmental: with the link in place there are 0, and clean origin/main has 0. |
| eslint on the changed TS files | 3 branch errors: `eslint-disable … @next/next/no-img-element` names a rule this config does not load (CI runs `eslint .`). Fixed → **PASS** |
| stylelint on the changed CSS | PASS |
| vitest full unit suite (first run, quiet Mac) | 2 branch failures, fixed → re-run of both files 19/19 PASS. The other 413 files PASS. |
| vitest full suite (second run, 00:10) | 7 timeouts in files the branch does not touch (`lib/db/system-reads`, `lib/ops/refund-by-hand`, …). Load average was 194 from other sessions. They passed in the first run. This is not a regression. |
| Playwright, 10 named specs × 390/768/1024/1440 | 306 PASS, 394 skipped (by design per project). The only red is `faq.spec.ts` "screenshot faq en" at 4 widths, a full-page baseline (item 6). Because of serial mode the other 13 faq tests per project did not run in that pass. I ran them on their own: 40 PASS after my faq fix. |
| Coverage `VamosLocale.coverage(document.body)` de/fr/ar | faq, about, contact: **0**. Home: the same 5-6 hero/Trustpilot strings in every language. They show already translated text ("Landen Sie in Zürich…", "Ausgezeichnet"). That list is identical on clean origin/main, so it is a pre-existing false positive, not this branch. |
| Sideways scroll, 4 pages × en/ar × 390/768/1024/1440 | PASS: 32/32 have `scrollWidth == innerWidth`, and ar has `dir=rtl`. |
| Laws in the diff | PASS. No glow: every new focus style uses `--vt-ring` / `--vt-ring-inverse`. No `--vt-yellow-50..300/600/700` is used, only mentioned in comments. New hex values: #25D366 (WhatsApp), #00B67A / #DCDCE6 (Trustpilot), #FBBC04 / #DADCE0 (Google), #00AA6C (Tripadvisor), #000 in an alpha mask. Text uses logical properties; the one `left:` is the photo focal point. New SVGs are Lucide `bed`, `map`, `train-front`, vendored, plus brand marks. Scroll stays native; `scrollTo` uses -88 and reduced-motion `auto`. |
| Twins (cmp) | PASS for AirportMeet, BrandSelect, ContactButton, ContactRow, Reviews, SiteHeader, TrustFacts, VehicleClasses, WhereWeDrive, and FAQ = FaqSection. SiteFooter, CookieBanner and WhenPicker already differed on origin/main. SiteFooter differs only by the FAQs href `#faq` vs `/#faq`; the branch applied the same change to both. |

## Failures and cause (all caused by this branch, all fixed by me)

1. `lib/arabic-design-g23.test.ts`: `design-system/tokens/laws.css` got the `--vt-accent-press` line, but `apps/web/public/brand/tokens/laws.css` did not. Copied it across.
2. `tests/unit/spec-imports.test.ts`: `reviews-drift.spec.ts` called a bare `page.emulateMedia` (26.0 D-06). It now uses `emulateMedia` from `../support/test`.
3. tsc: `reviews-drift.spec.ts:36` `split("?")[0]` is `string | undefined`. Added `?? "/"`.
4. `reviews-drift.spec.ts` at component-390: the drift, clone, track and hover tests expected drift on a phone, which contradicts R2-4. Added a `driftWidth()` helper, so on the 390 project those tests run at 768. The phone test still proves 390 is static.
5. `home-laptop-bar.spec.ts` "boundary: at 1080 the box is hidden" contradicted R2-2. Rewritten as 680 = bar, 681 = card.
6. `faq.spec.ts` "toggle accessible name differs en vs de" read the toggles before the FaqSection import had mounted (0 found). It now waits for all 19.
7. eslint: removed 3 `eslint-disable-next-line @next/next/no-img-element` comments (unknown rule, so a hard error in `eslint .`).

## Item 6: full-page baselines (not regenerated, for the controller)

They differ because sections, footer and contact button changed. **All of them were already red on clean origin/main** (checked at 390 and 1440 in a `git archive` copy): stale baselines, so not a regression from this branch.

- `tests/visual/faq.spec.ts`: `faq-{en,de,fr,ar}.png` (4 widths). NOTE: page height moved between retries (3985 → 5549 px at 390) while the imports mount. Wait for `[data-faq-toggle]` ×19 before the shot when regenerating.
- `tests/visual/home.spec.ts`: "screenshot en…" (+ de/fr/ar after it in serial mode), 4 widths
- `tests/visual/about.spec.ts`: "screenshot en…", 4 widths
- `tests/visual/contact.spec.ts`: "screenshot contact en…", 4 widths
- `tests/visual/legal-cancellation-imprint.spec.ts`: "screenshot cancellation en…", 4 widths (footer WhatsApp glyph)
- `tests/visual/home-widget.spec.ts`: skipped in every project locally, not compared.

## Files I changed (uncommitted)

- `apps/web/public/brand/tokens/laws.css`
- `apps/web/tests/visual/reviews-drift.spec.ts`
- `apps/web/tests/visual/home-laptop-bar.spec.ts`
- `apps/web/tests/visual/faq.spec.ts`
- `apps/web/app/[locale]/imprint/page.tsx`
- `apps/web/components/shell/SiteFooter.tsx`
- `apps/web/components/shell/SiteHeader.tsx`
- `.planning/quick/261003-site-polish/VERIFY-CODE.md` (this file)

Removed after use: my scratch scripts, `apps/web/.next` (made by the dev-server specs), and `/tmp/sp-main`. The dev-server specs had rewritten `apps/web/tsconfig.json`; I restored it with `git checkout`.
