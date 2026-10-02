# 261002 Task 4 (item 5): one mirror, everywhere: results

Run 2026-10-02 12:20–12:41 +04, worktree `.claude/worktrees/p6-followups`, branch `fix/p6-followups`, nothing committed.

## What changed

The law in `design-system/tokens/laws.css` (03) is now the only thing that mirrors a direction-bearing glyph
(arrow-right, chevron-right, chevron-left, log-in, log-out). Its `:not(...)` list keeps `.vt-dir-keep *` and
`[dir="ltr"] *` only. The 12 wrapper exclusions are gone, and so are the local flips that needed them.
`apps/web/public/brand/tokens/laws.css` is byte-identical (`cmp` clean).

| File | Removed | Kept / replaced |
|---|---|---|
| `design-system/tokens/laws.css` + brand copy | 12 wrapper entries in `:not(...)` | comment rewritten: mirrored here once for the whole site, no component mirrors its own arrow; hover nudges go negative under rtl |
| `app/home/BookingBar.dc.html` | `[dir="rtl"] [data-bb-mirror]{scaleX(-1)}` | the `data-bb-mirror` attribute stays on the markup (a spec and a picture tool locate it) |
| `app/home/BookingSheet.dc.html` | `[data-bs-mirror]` (dead) **and** `[data-bs-next] .vt-btn>span:last-child{scaleX(-1)}` (not in the plan; it hit the same icon span the law hits, so it changed nothing, and step 7 requires no local flip) | – |
| `app/home/Services.dc.html` | `[data-svc-cta-arrow]{scaleX(-1)}` | hover rtl → `translateX(calc(-1 * var(--vt-space-1)))`; reduced-motion rtl → `none`. `[data-svc-cta-route] svg{scaleX(-1)}` stays: it is the drawn route line, not a glyph |
| `app/home/home.dc.html` | `[data-route-join]` (dead), `[data-bar-trust] [data-bt-go]` | – |
| `app/pages/BookingRow.dc.html` | `[data-bk-go]` | – |
| `app/pages/account.dc.html` | `[data-ac-more-go]` | – |
| `apps/web/app/[locale]/checkout/checkout.css` | `.vt-co__strip-back`, `.vt-co__strip-arrow` | – |
| `apps/web/components/data/ListRow.css` + `ListRow.tsx` comment | `.vt-row__chevron` rule | wrapper `<span class="vt-row__chevron">` **kept**: nothing styles it now, but removing it changes the row's flex item (see `data.spec.ts` note) and its pictures |
| `apps/web/components/forms/DatePicker.css` | `.vt-dp__nav{scaleX(-1)}` + its long comment | 3-line comment: buttons swap by themselves, glyph mirrored by the law |
| `apps/web/components/home/ServiceCard.css` | `[data-svc-circ]{scaleX(-1)}` | hover rtl → `translateX(-3px)`; reduced-motion rtl → `none` |

Tests that pinned the old rules (blocking breaks caused by this task, so I updated them; these files are not in the plan's list):

| File | Change |
|---|---|
| `apps/web/lib/arabic-design-g23.test.ts` | rule must end `:not(.vt-dir-keep *,[dir="ltr"] *){transform:scaleX(-1)}`; new test: none of the 10 component files above contains `scaleX(-1)` (route-line svg excepted) |
| `apps/web/tests/visual/booking-bar-states.spec.ts` | asserts the bar icon's x-scale product (icon + ancestors) is −1 in ar, +1 otherwise, instead of the wrapper's own transform |
| `apps/web/tests/visual/checkout-page.spec.ts` | same product check on the back chevron and the route arrow (−1 in ar) instead of the wrappers' matrix |
| `apps/web/tests/visual/data.spec.ts` | comment at ~224 only |

## Expectation correction (from the lead's note and the measurement)

The plan expected the date-picker month chevrons to be +1 in Arabic before the change (the bug). They are not.
Home and manage-booking use the **WhenPicker** design component (`[data-wp-cal]`), not the bundle's `DatePicker`
(`.vt-dp__nav`). No page renders that `DatePicker`. WhenPicker's chevrons were never excluded, so they were −1
before and stay −1 after. The `.vt-dp__nav *` exclusion only affected the unused bundle DatePicker. The Next port
(`apps/web/components/forms/DatePicker`) had its own local flip, and it now relies on the law.

## Before / after (x-scale product of each icon and all its ancestors)

Tool: `tools/mirror-check.mjs` (+ `mirror-spots.mjs`, `mirror-stubs.mjs`, `mirror-serve.mjs`), compare with
`tools/mirror-compare.mjs`. Before = `git archive HEAD` (app, design-system, assets, scripts) synced into a scratch
tree with the same `scripts/sync-dc-mock-to-public.mjs`. After = this worktree after
`node scripts/sync-dc-mock-to-public.mjs`. `/api/**` stubbed (no amounts; the reviews stub has two fixture ratings,
only so the home trust row renders). Expected: −1 in ar, +1 in en, +1 inside `.vt-dir-keep`/`[dir="ltr"]`.
"–" = that icon does not render at that width.

**Before: 148 icon readings, 0 not as expected. After: 148 icon readings, 0 not as expected.** Both runs exit 0.

| spot | icon place | icon | ar 1440 before → after | ar 390 before → after | en 1440 before → after | en 390 before → after |
|---|---|---|---|---|---|---|
| home | `div[data-bx] > button.vt-btn > span` | arrow-right | −1 → −1 | – → – | +1 → +1 | – → – |
| home | `span[data-svc-cta-btn] > span[data-svc-cta-arrow] > span` | arrow-right | −1 → −1 | −1 → −1 | +1 → +1 | +1 → +1 |
| home | `div[data-ft-band-actions] > a.vt-btn > span` | arrow-right | −1 → −1 | −1 → −1 | +1 → +1 | +1 → +1 |
| home | `button[data-bb] > span[data-bb-icon] > span` | chevron-right | – → – | −1 → −1 | – → – | +1 → +1 |
| home | `a[data-bar-trust] > span[data-bt-go] > span` | chevron-right | – → – | −1 → −1 | – → – | +1 → +1 |
| home-sheet | `div[data-bs-next] > button.vt-btn > span` | arrow-right | – → – | −1 → −1 | – → – | +1 → +1 |
| home-bar-trip | `span#vtbb1-1 > span[data-bb-icon] > span` | arrow-right | – → – | −1 → −1 | – → – | +1 → +1 |
| home-picker | `div[data-wp-row] > div[data-wp-cal] > span` | chevron-left | −1 → −1 | −1 → −1 | +1 → +1 | +1 → +1 |
| home-picker | `div[data-wp-cal] > button > span` | chevron-right | −1 → −1 | −1 → −1 | +1 → +1 | +1 → +1 |
| account | `div[data-hd-wide] > a > span` | arrow-right | −1 → −1 | – → – | +1 → +1 | – → – |
| account | `a.vt-btn > span` | arrow-right | −1 → −1 | −1 → −1 | +1 → +1 | +1 → +1 |
| account | `nav[data-ac-nav] > button[data-ac-signout] > span` | log-out | −1 → −1 | – → – | +1 → +1 | – → – |
| account | `div.vt-card > a.vt-btn > span` | arrow-right | −1 → −1 | −1 → −1 | +1 → +1 | +1 → +1 |
| account | `span[data-bk-actions] > span[data-bk-go] > span` | chevron-right | −1 → −1 | −1 → −1 | +1 → +1 | +1 → +1 |
| account | `a[data-ac-more] > span[data-ac-more-go] > span` | arrow-right | −1 → −1 | −1 → −1 | +1 → +1 | +1 → +1 |
| account | `span[data-ac-act] > button.vt-btn > span` | log-out | −1 → −1 | −1 → −1 | +1 → +1 | +1 → +1 |
| bookings | `div[data-hd-wide] > a > span` | arrow-right | −1 → −1 | – → – | +1 → +1 | – → – |
| bookings | `span[data-bk-actions] > span[data-bk-go] > span` | chevron-right | −1 → −1 | −1 → −1 | +1 → +1 | +1 → +1 |
| manage-picker | `div[data-noprint] > button[data-back] > span` | chevron-left | −1 → −1 | −1 → −1 | +1 → +1 | +1 → +1 |
| manage-picker | `div[data-mb-grid] > div[data-noprint] > span` | arrow-right | −1 → −1 | −1 → −1 | +1 → +1 | +1 → +1 |
| manage-picker | `div[data-wp-row] > div[data-wp-cal] > span` | chevron-left | −1 → −1 | −1 → −1 | +1 → +1 | +1 → +1 |
| manage-picker | `div[data-wp-cal] > button > span` | chevron-right | −1 → −1 | −1 → −1 | +1 → +1 | +1 → +1 |
| manage-picker | `div[data-noprint] > button.vt-btn > span` | arrow-right | −1 → −1 | −1 → −1 | +1 → +1 | +1 → +1 |
| ops-calendar | `aside[data-lenis-prevent] > button[data-rail-toggle] > span` | chevron-left | −1 → −1 | – → – | +1 → +1 | – → – |
| ops-calendar | `main[data-vt-cal] > button.vt-iconbtn > span` | chevron-left | −1 → −1 | −1 → −1 | +1 → +1 | +1 → +1 |
| ops-calendar | `main[data-vt-cal] > button.vt-iconbtn > span` | chevron-right | −1 → −1 | −1 → −1 | +1 → +1 | +1 → +1 |
| ops-bookings | `div.vt-card > button.vt-btn > span` | chevron-left | −1 → −1 | −1 → −1 | +1 → +1 | +1 → +1 |
| ops-bookings | `div.vt-card > button.vt-btn > span` | chevron-right | −1 → −1 | −1 → −1 | +1 → +1 | +1 → +1 |

Full table (every spot, incl. the footer/services repeats on each home spot): `compare.md`. Raw rows:
`before.json`, `after.json`; console: `before.log`, `after.log`.

Which element carries the flip in Arabic. These are the only places where it changed: the wrapper's flip moved to the icon (the law):

| icon place (Arabic) | icon | flipped by, before | flipped by, after |
|---|---|---|---|
| `span[data-svc-cta-btn] > span[data-svc-cta-arrow] > span` | arrow-right | span[data-svc-cta-arrow] | self |
| `button[data-bb] > span[data-bb-icon] > span` | chevron-right | span[data-bb-icon] | self |
| `a[data-bar-trust] > span[data-bt-go] > span` | chevron-right | span[data-bt-go] | self |
| `span#vtbb1-1 > span[data-bb-icon] > span` | arrow-right | span[data-bb-icon] | self |
| `span[data-bk-actions] > span[data-bk-go] > span` | chevron-right | span[data-bk-go] | self |
| `a[data-ac-more] > span[data-ac-more-go] > span` | arrow-right | span[data-ac-more-go] | self |

Services CTA hover (`tools/mirror-hover-spots.mjs`, 1440, `hover.log`): `[data-svc-cta-arrow]` translateX on hover:

| | ar | en |
|---|---|---|
| before, motion | −4px (`scaleX(-1) translateX(4px)`) | +4px |
| after, motion | −4px (`translateX(calc(-1 * 4px))`) | +4px |
| before, reduced motion | 0px | 0px |
| after, reduced motion | 0px | 0px |

The arrow stays −1 in ar and +1 in en while hovered, in all four runs.

## Commands

```
node scripts/sync-dc-mock-to-public.mjs
git archive -o <scratch>/before.tar HEAD app design-system assets scripts hero-arrivals.jpg rectangle-msch23iq-dqll.png rectangle-msch2rwv-7g2c.png rectangle-msch3rzt-lwc6.png
tar -xf <scratch>/before.tar -C <scratch>/before-repo && node <scratch>/before-repo/scripts/sync-dc-mock-to-public.mjs
cd .planning/quick/261002-p6-followups/tools
node mirror-check.mjs --root <scratch>/before-repo/apps/web/public --json ../mirror/before.json
node mirror-check.mjs --root ../../../../apps/web/public --json ../mirror/after.json
node mirror-compare.mjs ../mirror/before.json ../mirror/after.json > ../mirror/compare.md
node mirror-check.mjs --root <tree> --spots mirror-hover-spots.mjs [--reduced-motion]
# later, against a local Worker (Next pages: checkout strip) and a dev gallery (VAMOS_DEV_GALLERY=1):
node mirror-check.mjs --base http://127.0.0.1:<port> [--ops-base http://127.0.0.1:<ops port>] --only checkout-strip
node mirror-check.mjs --base http://127.0.0.1:<dev port> --dev-gallery --only dev-forms,dev-data,dev-services
```

## Gates run

| Check | Result |
|---|---|
| `cmp design-system/tokens/laws.css apps/web/public/brand/tokens/laws.css` | identical |
| `grep -rn 'scaleX(-1)' app apps/web/app apps/web/components design-system` (archive/ excluded) | 4 lines: the law; Services route-line `svg` (not a glyph); `app/ops/OpsDetail.dc.html:60`; `apps/web/components/navigation/SectionHeader.css:38` (both below, outside Task 4) |
| `pnpm lint:css` | exit 0 |
| `pnpm exec tsc --noEmit` (apps/web, includes the specs) | exit 0 |
| `vitest run lib/arabic-design-g23.test.ts` | 17 passed |
| `playwright test booking-bar-states.spec.ts -g "trailing icons" --project=component-1440 --project=component-390` | 8 passed (en/de/fr/ar) |

## Not verified

- `checkout-page.spec.ts` (needs Next + database; changed assertion typechecks only) and the checkout trip strip on a
  local Worker: the `checkout-strip` spot exists but was skipped (no wrangler in this job).
- Next components that only a dev gallery shows: ListRow chevron, Next DatePicker month arrows, ServiceCard arrow
  and its hover (`dev-*` spots skipped; no dev server started). Their CSS change mirrors the DC ones measured above.
- 1024 and 768 widths; de/fr (same direction as en, not run).
- Pictures before/after: the measured products above replace them; no new screenshots taken by this task.

## Found, outside Task 4's files (not changed)

1. **Bug: `app/ops/OpsDetail.dc.html:60`** `[dir="rtl"] [data-ops-chg-arrow]{transform:scaleX(-1)}` wraps an
   `arrow-right` Icon (lines 288, 521: the dashboard booking's "old → new" change rows). The wrapper was never in the
   law's exclusion list, so in Arabic that arrow is flipped twice (product +1) **today, before and after this task**.
   Fix is one line: delete line 60. Not measured in a browser (the static ops shell has no booking with changes).
2. `apps/web/components/navigation/SectionHeader.css:38` `[dir="rtl"] .vt-sh__link-icon{transform:scaleX(-1)}`.
   The class lands on the Icon span itself (the law's own target), so it is redundant but correct (single flip).
   It can be deleted with no effect.
