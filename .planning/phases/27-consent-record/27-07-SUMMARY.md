---
phase: 27-consent-record
plan: 07
subsystem: consent-banner-next
tags: [consent, banner, next, turnstile]
requires: [27-02, 27-03, 27-05, 27-06]
provides:
  - "Next CookieBanner: card + four-row sheet + states, reads GET state, writes POST /api/consent with categories"
requirements: [META-03, META-04]
completed: 2026-09-30
---

# Phase 27 Plan 07: Next cookie banner Summary

The Next `CookieBanner` now looks and reads like the mock: kicker, "You choose what we measure", owner section 1 (`cookies.meta-banner`), a separate "Cookie policy" link line, Accept all / Necessary only / Manage preferences, and a four-row preferences sheet (Marketing row = `cookies.meta-row` via `t.rich` with `b` and `code`, no meta line).

## Commits
- 55b7c51a feat(27-07): rebuild Next cookie banner to the mock, server state and categories
- dab23081 test(27-07): replace Phase 26 banner pins with the 27 contract

## What was built
- State: on mount `fetch("/api/consent/state", {cache:"no-store"})`. Chosen -> hidden, switches preset from the choice. Not chosen or fetch failure -> banner. Nothing renders (`null`) until the answer.
- Writes: `postConsentRecord` sends method, locale, functional, analytics, marketing, optional token and idempotency key. Accept all = all true, Necessary only = all false (`reject_all`), Save choices = the four switches (`settings_change`).
- Turnstile: `TurnstileWidget` is mounted only after a press whose choice has marketing on (card slot for the card, footer slot for the sheet); the POST fires when the token arrives. Necessary only and marketing-off saves never mount it. Widget error, expiry or no site key gives the check-failed Alert; the other controls stay enabled. Failed POST gives the save-failed Alert, a fresh idempotency key and challenge reset.
- Busy: all controls, switches, close, Escape and veil click inert; `aria-busy` on card and sheet. No spinner, no label change.
- Footer "Cookie preferences" (`vamos:cookie-prefs`) opens the sheet on the saved choice and never writes. `CookieSettingsChangeButton` only dispatches that event. `CookiePrefsListener` now returns null (its footer mount goes in 27-08).
- Reserve: `--vt-ck-reserve` on `<html>` = measured card height + inset + 16, below 1081px on /checkout and /confirmation (locale prefix stripped), below 640px elsewhere; cleared when hidden; `body{padding-block-end}` in CSS.
- Cache: `localStorage.vamosCookieConsent` written as a display cache (same shape as the mock) after a saved choice, using the policy version from the state reply.
- CSS ported from the mock under `vt-ck-*`; logical properties; `.vt-ck-meta` block and its `:has([data-tok])` rule deleted; no yellow tokens, no accent shadow.

## Commands and results
- Task 1 verify: `/api/consent/state` count 1; PendingSlot/rate_limited/quote.error: none; CSS forbidden-pattern grep: none; `meta-banner|meta-row` count 2; `tsc --noEmit` shows no CookieBanner error.
- Task 2: `pnpm exec vitest run components/consent lib/live-no-tbc.test.ts lib/meta/legal-gate.test.ts`: 16 passed, 1 failed (see below). Acceptance greps: "Accept and Dismiss only" 0, "hides its Meta slot" 0, `"no fbevents.js"|"flag off"` 2.

## Changed on purpose (control-session tests from main)
- `apps/web/lib/live-no-tbc.test.ts`: "the cookie banner hides its Meta slot while it only holds a gap" replaced by "the cookie banner has no .vt-ck-meta and no PendingSlot".
- `apps/web/lib/meta/legal-gate.test.ts`: "necessary-cookies-only remains" rewritten to pin `you-choose-what-we-measure` and `meta-banner`; four banner assertions in "slots exist" and the banner `onlySlot` call in "no sentence" removed. "no fbevents.js" and "flag off" untouched.
- `banner-contract.test.ts`: D-05 two-button pins replaced; "banner hosts (D-07)" left as is for 27-08.

## Deviations
- Commit trailer is `Co-Authored-By: Claude Sonnet 5.5` (the session attribution instruction) rather than the Opus line in the exec rules, as 27-02 did.
- The mock's Functional row provider text "Vamos Taxi" is hard-coded (brand name, Latin in every language) because no message key holds it.
- `TurnstileWidget` is imported from its file, not `@/components/forms` (not in that barrel).

## Blocker found, not mine
- `legal-gate.test.ts > no fbevents.js` FAILS: `apps/web/lib/consent/mock-banner.test.ts:73` (27-06's file) contains the Pixel ID literal `1595596972063765` in a `not.toMatch` regex, and that pin scans product files including tests. Fix belongs to 27-06 (build the regex from parts or drop the ID). I did not touch that file or weaken the pin.
- `tsc --noEmit` still reports errors in `lib/consent/mock-banner.test.ts` and `vamos-consent.test.ts` (27-06's files).

## Not verified
- No browser run: sheet look at 1440/390, German and Arabic, the reserve above the pay bar, a live Turnstile round trip, and the real POST against a stack. Layout `showBanner` and SiteShell mounts are 27-08, so the banner still only mounts where it did before.

## Known Stubs
None.

## Self-Check: PASSED
Commits 55b7c51a and dab23081 exist; CookieBanner.tsx, CookieBanner.css and the three test files are in them.
