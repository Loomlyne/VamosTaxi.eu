---
phase: 27-consent-record
plan: 06
subsystem: mock-consent-banner
tags: [consent, mock, banner, turnstile]
requires: [27-02, 27-03, 27-04, 27-05]
provides:
  - "app/vamos-consent.js: window.VamosConsent { state, save, onChange, cached, turnstile }"
  - "Mock cookie banners (pages and home) that read and write the server record"
key-files:
  created:
    - app/vamos-consent.js
    - apps/web/lib/consent/vamos-consent.test.ts
    - apps/web/lib/consent/mock-banner.test.ts
  modified:
    - app/pages/CookieBanner.dc.html
    - app/home/CookieBanner.dc.html
requirements: [META-03, META-04]
completed: 2026-09-30
---

# Phase 27 Plan 06: Mock banner talks to the server Summary

Both mock banners now learn "already chosen" from GET /api/consent/state, write every choice through POST /api/consent, carry the owner's section 1 and 2 texts, and show busy, save failed, check failed and Turnstile states.

## Commits
- 737bd548 feat(27-06): VamosConsent mock runtime (state, save, cache, Turnstile)
- c07af790 feat(27-06): pages cookie banner reads and writes the server record
- 4675b9ca feat(27-06): home banner in step with pages, source pins for both

## What was built
- `app/vamos-consent.js`: plain ES5-style IIFE. `state()` never rejects (`{ok:false}` on any failure); `save()` posts method, locale, three booleans, optional turnstileToken and idempotencyKey, writes the display cache stamped with the last known policy version, fires `vamos:consent`; error codes rate_limited, challenge_failed (from the route's `code` field), invalid_input, unavailable, network, forbidden. `cached()` ignores a cache whose `v` differs. `turnstile()` loads the API script lazily and once, renders action `consent`, `interaction-only`, `execution: execute`; calls `onError('no-site-key')` when the meta is missing.
- Pages banner: starts in mode `unknown` (paints nothing), server answer decides `hidden` or `banner`, failed check opens the banner (D-33). Accept all always uses Turnstile; Save choices only when Marketing is on; Necessary only never. One request at a time, controls `disabled` and `aria-busy` while busy, Escape and veil inert. Banner closes only after ok. Footer event opens the sheet only. Sheet rows now render from one list; Marketing row is section 2 (bold and code segments, `data-vt-no-i18n`), meta line removed. Banner body is section 1 plus a separate "Cookie policy" link line.
- Law and layout fixes: logical banner insets, `margin-inline-start:auto`, charcoal replacing both `--vt-yellow-700` uses, `--vt-ck-reserve` on the root (measured through ResizeObserver, resize and re-render) with `body{padding-block-end:var(--vt-ck-reserve,0px)}`, `data-lenis-prevent` on the category list.
- States gallery: `startState` options auto, banner, busy, turnstile, error-save, error-check, prefs, prefs-saved, hidden; `?ck-gallery=1` renders a review-only English section with six labelled static states. Forced states never call the server.
- Home banner is the pages file with only the cookie policy link path changed.

## Commands and results
- `vitest run lib/consent/vamos-consent.test.ts`: 5/5.
- `vitest run lib/consent lib/live-no-tbc.test.ts` after `node scripts/sync-dc-mock-to-public.mjs`: 10 files, 106 tests pass (includes mock-banner.test.ts pins a-j, the TBC pill test, owner-texts, mock-mounts).
- Greps on app/pages/CookieBanner.dc.html: `VamosConsent.save` 3, `VamosConsent.state` 1, `VamosMetaTexts.segments` 2, `data-vt-no-i18n` 6, `data-lenis-prevent` 1, `--vt-shadow-accent:none` 1, forbidden-pattern grep empty, old copy strings 0. vamos-consent.js: `/api/consent/state` 1, `async |=>` 0, Meta 0.
- `playwright test tests/visual/button.spec.ts --project=component-1440 -g "CookieBanner mock"`: passes (the mock banner renders with no server and its Accept all matches the port).
- No snapshot files changed.

## Deviations from Plan
- `button.spec.ts` and `shell.spec.ts` needed no edit; neither is in the commits.
- The plan asks for two states on the gallery cell "Turnstile waiting": the live component shows a labelled placeholder box (English, `data-vt-no-i18n`) in forced `turnstile` state only.

## Not verified
- `shell.spec.ts` is red at 1440: "SiteFooter default" (mock footer 938px high vs port 733px). It renders `app/pages/SiteFooter.dc.html`, which this plan does not touch and which does not mount the banner. A full run of both specs (184 tests, all four projects) was killed by the tool timeout after showing further SiteHeader signed-in failures at 390 (same category, no banner involved). I did not prove these red at the base commit (no stash allowed). Owner UAT / plan 27-12 should compare against base.
- Full 184-test visual run not completed.
- Not run in a real browser: a Turnstile challenge, the states gallery layout, 1440/1024/768/390 in en/de/ar, the sheet Marketing row rendering in Arabic. Left for plan 27-12 and owner UAT.
- `VamosLocale.coverage(document)` empty on /about in de and ar: still owed, for owner UAT in 27-HANDOVER.
- End-to-end POST against a live stack.

## Known Stubs
None.

## Self-Check: PASSED
