---
phase: 27-consent-record
plan: 04
subsystem: web
tags: [consent, cookie-banner, turnstile, middleware]
requires: [27-01]
requirements: [META-04]
key-files:
  created:
    - apps/web/lib/consent/mock-mounts.test.ts
  modified:
    - apps/web/middleware.ts
    - app/pages/sign-in.dc.html
    - app/pages/account.dc.html
    - app/pages/bookings.dc.html
    - app/pages/reset-password.dc.html
    - app/pages/coming-soon.dc.html
completed: 2026-09-30
---

# Phase 27 Plan 04: Banner mounts and site key Summary

The cookie banner is mounted on every customer mock page and on no ops page, and every DC page now carries the public Turnstile site key meta, with a source pin that `serveDcHtml` reads nothing per visitor.

## Commits
- efabc48e feat(27-04): mount the cookie banner on sign-in, account, bookings, reset-password, coming-soon
- 61ebba57 feat(27-04): inject the public Turnstile site key into every DC page

## What was built
- One line `<dc-import name="CookieBanner" hint-size="0,0"></dc-import>` after `SiteFooter` in sign-in (also serves /sign-up), account, bookings, reset-password; before `</x-dc>` in coming-soon. Insertions only (1/0 per file).
- `middleware.ts` `serveDcHtml`: removed the `mock === DC_PAGES["/contact"]` condition; the two existing lines run for every mock. Diff: 2 insertions, 4 deletions. Function not reshaped, so the follow-up session can add its import and call.
- `mock-mounts.test.ts` (22 tests): page list derived from `DC_PAGES` plus home; exactly one mount each; none in app/ops; `serveDcHtml` body contains the site key meta, no `cookie`, `consent_subject`, `readConsentSubject`, `x-consent`, `asAnon`; `s-maxage=300` line unchanged.

## Commands and results
- RED: 6 failures (five mounts, site key pin).
- After task 1: only the site key pin red. After task 2: 22/22 pass.
- `grep -c` mounts: 1 for each of the five files. `grep -rl name="CookieBanner" app/ops`: nothing. `grep -c vt-turnstile-site-key apps/web/middleware.ts`: 1. `mock === DC_PAGES` grep: nothing.
- No other DC_PAGES mock lacked the mount.

## Deviations
None to the plan. No `middleware*.test.ts` file exists, so that acceptance command has nothing to run. A broader run of test files mentioning middleware showed failures in `lib/consent/owner-texts.test.ts` (Next messages for meta-banner/meta-row, other plans' pending work) and `lib/contact-source.test.ts` (legal mailboxes); neither touches files I changed. Not investigated further.

## Not verified
- Live rendering of the banner or Turnstile on these pages (no browser, no deploy).
- Banner behaviour itself changes in 27-06.

## Known Stubs
None.

## Self-Check: PASSED
