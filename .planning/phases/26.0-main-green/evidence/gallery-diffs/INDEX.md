# Gallery baseline mismatches (26.0-08, D-02)

Baselines are the 2026-08-30 darwin PNGs. None was changed, none marked, no `--update-snapshots`.
Diff images copied here: **97** (all of them; total 17 MB, under the 20 MB cap).

Run method: one spec per invocation, `--workers=1`, `--retries=0`, on stack vamos-taxi-mg2. Specs run in Playwright serial mode stop at the first failure, so for the enumeration the `mode: "serial"` line was lifted in the working copy for the run and restored before the commit (committed specs keep serial).
Projects: faq, contact, legal-notice, auth-forms, how-it-works: all four viewport projects. home-services, home-hero, home-reviews, home-why-vamos: component-1440 only (slow: each failing screenshot waits out its timeout). home-services also ran once in committed serial mode on all four projects: the first test (`en light-default`) mismatches on 390, 768, 1024 and 1440 (card grew, e.g. 460x329 expected, 460x563 received); the other projects' remaining screenshots were not enumerated.
home-content.spec.ts belongs to plan 06.

| spec | screenshot mismatches (diff images) | other |
|---|---|---|
| home-services | 28 (1440) | 7 pass |
| home-hero | 20 (1440) | 3 pass; `no CHF amount` fixed (harness) |
| home-reviews | 4 (1440) | 15 pass |
| home-why-vamos | 16 (1440) | 8 pass |
| faq | 16 (4 projects) | 13 stale-spec failures |
| contact | 13 (4 projects) | 46 pass |
| home-how-it-works | 0 | 82 pass (4 projects) |
| legal-notice | 0 | 28 pass (4 projects) |
| auth-forms | 0 | 74 pass (4 projects) |
| feedback-behaviour | 0 | 5 pass |
| ssr-locale | 0 | 1 pass, 6 stale-spec failures |
| dev-exclusion | 0 | 4 pass, 2 marked KNOWN-RED (production `next build` fails on main) |

### home-services

| test | project | mismatch | diff image |
|---|---|---|---|
| screenshot en light-default @component | component-1440 | expected 460px by 329px, received 460px by 563px. 76924 pixels (ratio 0.30 of all image pixels) are different. | `home-services/component-1440/svc-en-light-default-diff.png` |
| screenshot en light-hover @component | component-1440 | expected 460px by 329px, received 460px by 563px. 78564 pixels (ratio 0.31 of all image pixels) are different. | `home-services/component-1440/svc-en-light-hover-diff.png` |
| screenshot en light-press @component | component-1440 | expected 460px by 329px, received 460px by 563px. 76734 pixels (ratio 0.30 of all image pixels) are different. | `home-services/component-1440/svc-en-light-press-diff.png` |
| screenshot en light-focus @component | component-1440 | expected 460px by 329px, received 460px by 563px. 78403 pixels (ratio 0.31 of all image pixels) are different. | `home-services/component-1440/svc-en-light-focus-diff.png` |
| screenshot en light-selected @component | component-1440 | expected 460px by 329px, received 460px by 563px. 78109 pixels (ratio 0.31 of all image pixels) are different. | `home-services/component-1440/svc-en-light-selected-diff.png` |
| screenshot en light-disabled @component | component-1440 | expected 460px by 328px, received 460px by 563px. 68151 pixels (ratio 0.27 of all image pixels) are different. | `home-services/component-1440/svc-en-light-disabled-diff.png` |
| screenshot en light-loading @component | component-1440 | expected 460px by 328px, received 460px by 563px. 54345 pixels (ratio 0.21 of all image pixels) are different. | `home-services/component-1440/svc-en-light-loading-diff.png` |
| screenshot de light-default @component | component-1440 | expected 460px by 329px, received 460px by 563px. 76541 pixels (ratio 0.30 of all image pixels) are different. | `home-services/component-1440/svc-de-light-default-diff.png` |
| screenshot de light-hover @component | component-1440 | expected 460px by 329px, received 460px by 563px. 78173 pixels (ratio 0.31 of all image pixels) are different. | `home-services/component-1440/svc-de-light-hover-diff.png` |
| screenshot de light-press @component | component-1440 | expected 460px by 329px, received 460px by 563px. 76343 pixels (ratio 0.30 of all image pixels) are different. | `home-services/component-1440/svc-de-light-press-diff.png` |
| screenshot de light-focus @component | component-1440 | expected 460px by 329px, received 460px by 563px. 77995 pixels (ratio 0.31 of all image pixels) are different. | `home-services/component-1440/svc-de-light-focus-diff.png` |
| screenshot de light-selected @component | component-1440 | expected 460px by 329px, received 460px by 563px. 77773 pixels (ratio 0.31 of all image pixels) are different. | `home-services/component-1440/svc-de-light-selected-diff.png` |
| screenshot de light-disabled @component | component-1440 | expected 460px by 328px, received 460px by 563px. 67460 pixels (ratio 0.27 of all image pixels) are different. | `home-services/component-1440/svc-de-light-disabled-diff.png` |
| screenshot de light-loading @component | component-1440 | expected 460px by 328px, received 460px by 563px. 54233 pixels (ratio 0.21 of all image pixels) are different. | `home-services/component-1440/svc-de-light-loading-diff.png` |
| screenshot fr light-default @component | component-1440 | expected 460px by 329px, received 460px by 563px. 76652 pixels (ratio 0.30 of all image pixels) are different. | `home-services/component-1440/svc-fr-light-default-diff.png` |
| screenshot fr light-hover @component | component-1440 | expected 460px by 329px, received 460px by 563px. 78303 pixels (ratio 0.31 of all image pixels) are different. | `home-services/component-1440/svc-fr-light-hover-diff.png` |
| screenshot fr light-press @component | component-1440 | expected 460px by 329px, received 460px by 563px. 76466 pixels (ratio 0.30 of all image pixels) are different. | `home-services/component-1440/svc-fr-light-press-diff.png` |
| screenshot fr light-focus @component | component-1440 | expected 460px by 329px, received 460px by 563px. 78180 pixels (ratio 0.31 of all image pixels) are different. | `home-services/component-1440/svc-fr-light-focus-diff.png` |
| screenshot fr light-selected @component | component-1440 | expected 460px by 329px, received 460px by 563px. 77920 pixels (ratio 0.31 of all image pixels) are different. | `home-services/component-1440/svc-fr-light-selected-diff.png` |
| screenshot fr light-disabled @component | component-1440 | expected 460px by 328px, received 460px by 563px. 67958 pixels (ratio 0.27 of all image pixels) are different. | `home-services/component-1440/svc-fr-light-disabled-diff.png` |
| screenshot fr light-loading @component | component-1440 | expected 460px by 328px, received 460px by 563px. 54291 pixels (ratio 0.21 of all image pixels) are different. | `home-services/component-1440/svc-fr-light-loading-diff.png` |
| screenshot ar light-default @component | component-1440 | expected 460px by 329px, received 460px by 563px. 77595 pixels (ratio 0.30 of all image pixels) are different. | `home-services/component-1440/svc-ar-light-default-diff.png` |
| screenshot ar light-hover @component | component-1440 | expected 460px by 329px, received 460px by 563px. 79264 pixels (ratio 0.31 of all image pixels) are different. | `home-services/component-1440/svc-ar-light-hover-diff.png` |
| screenshot ar light-press @component | component-1440 | expected 460px by 329px, received 460px by 563px. 77391 pixels (ratio 0.30 of all image pixels) are different. | `home-services/component-1440/svc-ar-light-press-diff.png` |
| screenshot ar light-focus @component | component-1440 | expected 460px by 329px, received 460px by 563px. 79224 pixels (ratio 0.31 of all image pixels) are different. | `home-services/component-1440/svc-ar-light-focus-diff.png` |
| screenshot ar light-selected @component | component-1440 | expected 460px by 329px, received 460px by 563px. 78294 pixels (ratio 0.31 of all image pixels) are different. | `home-services/component-1440/svc-ar-light-selected-diff.png` |
| screenshot ar light-disabled @component | component-1440 | expected 460px by 328px, received 460px by 563px. 65061 pixels (ratio 0.26 of all image pixels) are different. | `home-services/component-1440/svc-ar-light-disabled-diff.png` |
| screenshot ar light-loading @component | component-1440 | expected 460px by 328px, received 460px by 563px. 54494 pixels (ratio 0.22 of all image pixels) are different. | `home-services/component-1440/svc-ar-light-loading-diff.png` |

### home-hero

| test | project | mismatch | diff image |
|---|---|---|---|
| screenshot en empty @component | component-1440 | 220794 pixels (ratio 0.18 of all image pixels) are different | `home-hero/component-1440/hero-en-empty-diff.png` |
| screenshot en filled @component | component-1440 | 235041 pixels (ratio 0.19 of all image pixels) are different | `home-hero/component-1440/hero-en-filled-diff.png` |
| screenshot en sheet-closed @component | component-1440 | 234405 pixels (ratio 0.19 of all image pixels) are different | `home-hero/component-1440/hero-en-sheet-closed-diff.png` |
| screenshot en sheet-open @component | component-1440 | 234474 pixels (ratio 0.19 of all image pixels) are different | `home-hero/component-1440/hero-en-sheet-open-diff.png` |
| screenshot en mount @component | component-1440 | 233455 pixels (ratio 0.19 of all image pixels) are different | `home-hero/component-1440/hero-en-mount-diff.png` |
| screenshot de empty @component | component-1440 | 232817 pixels (ratio 0.18 of all image pixels) are different | `home-hero/component-1440/hero-de-empty-diff.png` |
| screenshot de filled @component | component-1440 | 243291 pixels (ratio 0.19 of all image pixels) are different | `home-hero/component-1440/hero-de-filled-diff.png` |
| screenshot de sheet-closed @component | component-1440 | 242794 pixels (ratio 0.19 of all image pixels) are different | `home-hero/component-1440/hero-de-sheet-closed-diff.png` |
| screenshot de sheet-open @component | component-1440 | 242852 pixels (ratio 0.19 of all image pixels) are different | `home-hero/component-1440/hero-de-sheet-open-diff.png` |
| screenshot de mount @component | component-1440 | 241768 pixels (ratio 0.19 of all image pixels) are different | `home-hero/component-1440/hero-de-mount-diff.png` |
| screenshot fr empty @component | component-1440 | 230807 pixels (ratio 0.18 of all image pixels) are different | `home-hero/component-1440/hero-fr-empty-diff.png` |
| screenshot fr filled @component | component-1440 | 246310 pixels (ratio 0.20 of all image pixels) are different | `home-hero/component-1440/hero-fr-filled-diff.png` |
| screenshot fr sheet-closed @component | component-1440 | 245633 pixels (ratio 0.19 of all image pixels) are different | `home-hero/component-1440/hero-fr-sheet-closed-diff.png` |
| screenshot fr sheet-open @component | component-1440 | 245740 pixels (ratio 0.19 of all image pixels) are different | `home-hero/component-1440/hero-fr-sheet-open-diff.png` |
| screenshot fr mount @component | component-1440 | 244839 pixels (ratio 0.19 of all image pixels) are different | `home-hero/component-1440/hero-fr-mount-diff.png` |
| screenshot ar empty @component | component-1440 | 221071 pixels (ratio 0.18 of all image pixels) are different | `home-hero/component-1440/hero-ar-empty-diff.png` |
| screenshot ar filled @component | component-1440 | 233758 pixels (ratio 0.19 of all image pixels) are different | `home-hero/component-1440/hero-ar-filled-diff.png` |
| screenshot ar sheet-closed @component | component-1440 | 232963 pixels (ratio 0.18 of all image pixels) are different | `home-hero/component-1440/hero-ar-sheet-closed-diff.png` |
| screenshot ar sheet-open @component | component-1440 | 233183 pixels (ratio 0.18 of all image pixels) are different | `home-hero/component-1440/hero-ar-sheet-open-diff.png` |
| screenshot ar mount @component | component-1440 | 232209 pixels (ratio 0.18 of all image pixels) are different | `home-hero/component-1440/hero-ar-mount-diff.png` |

Non-screenshot failure fixed here (harness): `no CHF amount` matched the header currency picker's bare `CHF` label; the assertion now bans only CHF followed by digits. Re-run: pass.

### home-how-it-works

No screenshot mismatch.
82 passed, 6 skipped on all four projects; all screenshots match.

### home-reviews

| test | project | mismatch | diff image |
|---|---|---|---|
| screenshot en default @component | component-1440 |  | `home-reviews/component-1440/reviews-en-default-diff.png` |
| screenshot de default @component | component-1440 |  | `home-reviews/component-1440/reviews-de-default-diff.png` |
| screenshot fr default @component | component-1440 |  | `home-reviews/component-1440/reviews-fr-default-diff.png` |
| screenshot ar default @component | component-1440 |  | `home-reviews/component-1440/reviews-ar-default-diff.png` |

### home-why-vamos

| test | project | mismatch | diff image |
|---|---|---|---|
| screenshot en support-on-driven @component | component-1440 |  | `home-why-vamos/component-1440/why-en-support-on-driven-diff.png` |
| screenshot en support-on-static @component | component-1440 | expected 1200px by 1023px, received 1200px by 882px. 174395 pixels (ratio 0.15 of all image pixels) are different. | `home-why-vamos/component-1440/why-en-support-on-static-diff.png` |
| screenshot en per-step-34 @component | component-1440 |  | `home-why-vamos/component-1440/why-en-per-step-34-diff.png` |
| screenshot en per-step-90 @component | component-1440 |  | `home-why-vamos/component-1440/why-en-per-step-90-diff.png` |
| screenshot de support-on-driven @component | component-1440 |  | `home-why-vamos/component-1440/why-de-support-on-driven-diff.png` |
| screenshot de support-on-static @component | component-1440 | expected 1200px by 1049px, received 1200px by 933px. 175568 pixels (ratio 0.14 of all image pixels) are different. | `home-why-vamos/component-1440/why-de-support-on-static-diff.png` |
| screenshot de per-step-34 @component | component-1440 | expected 1200px by 1049px, received 1200px by 933px. 27345 pixels (ratio 0.03 of all image pixels) are different. | `home-why-vamos/component-1440/why-de-per-step-34-diff.png` |
| screenshot de per-step-90 @component | component-1440 |  | `home-why-vamos/component-1440/why-de-per-step-90-diff.png` |
| screenshot fr support-on-driven @component | component-1440 |  | `home-why-vamos/component-1440/why-fr-support-on-driven-diff.png` |
| screenshot fr support-on-static @component | component-1440 | expected 1200px by 1055px, received 1200px by 908px. 175784 pixels (ratio 0.14 of all image pixels) are different. | `home-why-vamos/component-1440/why-fr-support-on-static-diff.png` |
| screenshot fr per-step-34 @component | component-1440 | expected 1200px by 1055px, received 1200px by 908px. 27169 pixels (ratio 0.03 of all image pixels) are different. | `home-why-vamos/component-1440/why-fr-per-step-34-diff.png` |
| screenshot fr per-step-90 @component | component-1440 |  | `home-why-vamos/component-1440/why-fr-per-step-90-diff.png` |
| screenshot ar support-on-driven @component | component-1440 |  | `home-why-vamos/component-1440/why-ar-support-on-driven-diff.png` |
| screenshot ar support-on-static @component | component-1440 | expected 1200px by 922px, received 1200px by 846px. 172350 pixels (ratio 0.16 of all image pixels) are different. | `home-why-vamos/component-1440/why-ar-support-on-static-diff.png` |
| screenshot ar per-step-34 @component | component-1440 |  | `home-why-vamos/component-1440/why-ar-per-step-34-diff.png` |
| screenshot ar per-step-90 @component | component-1440 |  | `home-why-vamos/component-1440/why-ar-per-step-90-diff.png` |

### legal-notice

No screenshot mismatch.
28 passed on all four projects.

### faq

| test | project | mismatch | diff image |
|---|---|---|---|
| screenshot faq en @component | component-390 | expected 390px by 4698px, received 390px by 5717px. 709111 pixels (ratio 0.32 of all image pixels) are different. | `faq/component-390/faq-en-diff.png` |
| screenshot faq de @component | component-390 | expected 390px by 4812px, received 390px by 5717px. 693551 pixels (ratio 0.32 of all image pixels) are different. | `faq/component-390/faq-de-diff.png` |
| screenshot faq fr @component | component-390 | expected 390px by 4782px, received 390px by 5717px. 710858 pixels (ratio 0.32 of all image pixels) are different. | `faq/component-390/faq-fr-diff.png` |
| screenshot faq ar @component | component-390 | expected 390px by 4531px, received 390px by 5717px. 765932 pixels (ratio 0.35 of all image pixels) are different. | `faq/component-390/faq-ar-diff.png` |
| screenshot faq en @component | component-768 | expected 768px by 3413px, received 768px by 3621px. 698663 pixels (ratio 0.26 of all image pixels) are different. | `faq/component-768/faq-en-diff.png` |
| screenshot faq de @component | component-768 | expected 768px by 3473px, received 768px by 3621px. 679209 pixels (ratio 0.25 of all image pixels) are different. | `faq/component-768/faq-de-diff.png` |
| screenshot faq fr @component | component-768 | expected 768px by 3447px, received 768px by 3621px. 697028 pixels (ratio 0.26 of all image pixels) are different. | `faq/component-768/faq-fr-diff.png` |
| screenshot faq ar @component | component-768 | expected 768px by 3324px, received 768px by 3621px. 793849 pixels (ratio 0.29 of all image pixels) are different. | `faq/component-768/faq-ar-diff.png` |
| screenshot faq en @component | component-1024 | expected 1024px by 3409px, received 1024px by 3254px. 850446 pixels (ratio 0.25 of all image pixels) are different. | `faq/component-1024/faq-en-diff.png` |
| screenshot faq de @component | component-1024 | expected 1024px by 3506px, received 1024px by 3254px. 990259 pixels (ratio 0.28 of all image pixels) are different. | `faq/component-1024/faq-de-diff.png` |
| screenshot faq fr @component | component-1024 | expected 1024px by 3449px, received 1024px by 3254px. 914055 pixels (ratio 0.26 of all image pixels) are different. | `faq/component-1024/faq-fr-diff.png` |
| screenshot faq ar @component | component-1024 | expected 1024px by 3325px, received 1024px by 3254px. 764558 pixels (ratio 0.23 of all image pixels) are different. | `faq/component-1024/faq-ar-diff.png` |
| screenshot faq en @component | component-1440 | expected 1440px by 2726px, received 1440px by 3242px. 1615708 pixels (ratio 0.35 of all image pixels) are different. | `faq/component-1440/faq-en-diff.png` |
| screenshot faq de @component | component-1440 | expected 1440px by 2792px, received 1440px by 3242px. 1533742 pixels (ratio 0.33 of all image pixels) are different. | `faq/component-1440/faq-de-diff.png` |
| screenshot faq fr @component | component-1440 | expected 1440px by 2812px, received 1440px by 3242px. 1518814 pixels (ratio 0.33 of all image pixels) are different. | `faq/component-1440/faq-fr-diff.png` |
| screenshot faq ar @component | component-1440 | expected 1440px by 2698px, received 1440px by 3242px. 1814370 pixels (ratio 0.39 of all image pixels) are different. | `faq/component-1440/faq-ar-diff.png` |

Non-screenshot failures:

- [component-390] › tests/visual/faq.spec.ts:125:7 › FAQ page and gallery @component › keyboard disclosure aria-controls and ring @component — expect(received).toBe(expected) // Object.is equality
- [component-390] › tests/visual/faq.spec.ts:186:7 › FAQ page and gallery @component › rtl circle inset-inline-end @component — expect(locator).toHaveAttribute(expected) failed
- [component-390] › tests/visual/faq.spec.ts:196:7 › FAQ page and gallery @component › toggle accessible name differs en vs de @component — expect(received).not.toBe(expected) // Object.is equality
- [component-768] › tests/visual/faq.spec.ts:125:7 › FAQ page and gallery @component › keyboard disclosure aria-controls and ring @component — expect(received).toBe(expected) // Object.is equality
- [component-768] › tests/visual/faq.spec.ts:186:7 › FAQ page and gallery @component › rtl circle inset-inline-end @component — expect(locator).toHaveAttribute(expected) failed
- [component-768] › tests/visual/faq.spec.ts:196:7 › FAQ page and gallery @component › toggle accessible name differs en vs de @component — expect(received).not.toBe(expected) // Object.is equality
- [component-1024] › tests/visual/faq.spec.ts:125:7 › FAQ page and gallery @component › keyboard disclosure aria-controls and ring @component — expect(received).toBe(expected) // Object.is equality
- [component-1024] › tests/visual/faq.spec.ts:149:7 › FAQ page and gallery @component › open circle stays full-strength yellow @component — expect(locator).toHaveCSS(expected) failed
- [component-1024] › tests/visual/faq.spec.ts:186:7 › FAQ page and gallery @component › rtl circle inset-inline-end @component — expect(locator).toHaveAttribute(expected) failed
- [component-1024] › tests/visual/faq.spec.ts:196:7 › FAQ page and gallery @component › toggle accessible name differs en vs de @component — expect(received).not.toBe(expected) // Object.is equality
- [component-1440] › tests/visual/faq.spec.ts:125:7 › FAQ page and gallery @component › keyboard disclosure aria-controls and ring @component — expect(received).toBe(expected) // Object.is equality
- [component-1440] › tests/visual/faq.spec.ts:186:7 › FAQ page and gallery @component › rtl circle inset-inline-end @component — expect(locator).toHaveAttribute(expected) failed
- [component-1440] › tests/visual/faq.spec.ts:196:7 › FAQ page and gallery @component › toggle accessible name differs en vs de @component — expect(received).not.toBe(expected) // Object.is equality

Classification of the non-screenshot failures: stale spec, owner to rule. Left unmarked and unfixed. `/faq` is now served by the DC mock (`lib/dc-mock-urls.ts` maps `/app/pages/faq` to `/faq`), not the React page the spec was written for. Observed on the mock: first item is already `aria-expanded="true"` (spec expects "false"); `/ar/faq` and `/de/faq` keep `<html lang="en" dir="ltr">` because the mock takes its language from the store, not the URL prefix (2 tests); at 1024 the hovered open circle is charcoal `rgb(30, 31, 31)`, spec expects yellow `rgb(253, 194, 11)`. The `screenshot faq <lang>` mismatches above are the same cause (mock page is taller: 5717 px vs 4698 px at 390). The `/dev/faq` gallery screenshots match their baselines.
Run: all four projects, `--retries=0`, Playwright serial mode lifted locally (not committed) so every test ran: 23 passed, 29 failed, 4 skipped. The 16 `screenshot gallery <lang>` tests pass.

### contact

| test | project | mismatch | diff image |
|---|---|---|---|
| screenshot contact en @component | component-390 | 26582 pixels (ratio 0.08 of all image pixels) are different | `contact/component-390/contact-en-diff.png` |
| screenshot contact de @component | component-390 | 31951 pixels (ratio 0.10 of all image pixels) are different | `contact/component-390/contact-de-diff.png` |
| screenshot contact fr @component | component-390 | 29532 pixels (ratio 0.09 of all image pixels) are different | `contact/component-390/contact-fr-diff.png` |
| screenshot contact ar @component | component-390 | 44214 pixels (ratio 0.13 of all image pixels) are different | `contact/component-390/contact-ar-diff.png` |
| screenshot contact en @component | component-768 | 78150 pixels (ratio 0.11 of all image pixels) are different | `contact/component-768/contact-en-diff.png` |
| screenshot contact de @component | component-768 | 82678 pixels (ratio 0.11 of all image pixels) are different | `contact/component-768/contact-de-diff.png` |
| screenshot contact fr @component | component-768 | 72324 pixels (ratio 0.10 of all image pixels) are different | `contact/component-768/contact-fr-diff.png` |
| screenshot contact ar @component | component-768 | 90750 pixels (ratio 0.12 of all image pixels) are different | `contact/component-768/contact-ar-diff.png` |
| screenshot contact en @component | component-1024 | 90797 pixels (ratio 0.10 of all image pixels) are different | `contact/component-1024/contact-en-diff.png` |
| screenshot contact de @component | component-1024 | 77624 pixels (ratio 0.09 of all image pixels) are different | `contact/component-1024/contact-de-diff.png` |
| screenshot contact fr @component | component-1024 | 83120 pixels (ratio 0.10 of all image pixels) are different | `contact/component-1024/contact-fr-diff.png` |
| screenshot contact ar @component | component-1024 | 88801 pixels (ratio 0.10 of all image pixels) are different | `contact/component-1024/contact-ar-diff.png` |
| screenshot contact ar @component | component-1440 | 71376 pixels (ratio 0.06 of all image pixels) are different | `contact/component-1440/contact-ar-diff.png` |

### auth-forms

No screenshot mismatch.
74 passed, 6 skipped on all four projects.

### ssr-locale (component-1440, `--retries=0`, serial lifted locally so all ran)

1 passed (sitemap has no dev route), 6 failed, 21 skipped (other projects). No screenshots.

Stale spec, owner to rule. Unmarked, unfixed. All six failing tests fetch the home (`/`, `/de`, `/fr`, `/ar`) and expect the React home's server-rendered `<html lang dir>`, translated title and hreflang alternates. The raw response is now the DC mock home (`<html>` with no lang or dir, `<base href="/app/home/">`), so those assertions describe a page that no longer exists.
