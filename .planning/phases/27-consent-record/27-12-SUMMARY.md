# 27-12 SUMMARY — browser proof of the banner

**Status:** complete. 9 of 9 cases pass at 390x844 in a real browser, no skips.

Commits: `30f6d6ed` (consent-state stub in 12 existing specs), `d34c45b7` (spec), `48c5ebcf`
(screenshots), `03271669` (defect fix, see below).

| Case | What it proves | Result |
|---|---|---|
| A en/de | /checkout: PAY stays above the banner, no sideways scroll | pass |
| B en/de | pay link shows the banner, PAY above it, no pixel in the page | pass |
| C | choice already made: no card; footer link opens the sheet and writes nothing | pass |
| D | mock /about: Necessary only posts once without Turnstile, hides, reload keeps hidden | pass |
| G | /de/about (prefixed address) shows the banner | pass |
| E | cookies page `?ck-gallery=1` shows the six states | pass |
| F | /ops without a session: no banner | pass |

Command: `cd apps/web && pnpm exec playwright test tests/integration/consent-banner-27.spec.ts --project=component-390 --workers=1`

## Defect found and fixed
First run: D and G failed. On mock pages the banner never showed for a first-time visitor:
`vamos-consent.js` comes from the component's own helmet and lands after mount, so the state was
never requested. Fix `03271669`: both mock banners and the cookies panel wait for the script
(50 ms steps, up to 5 s); if it never arrives the banner asks (D-33). Unit tests did not catch
this; only the browser did.

## Not from this phase
`locale-follow-26-3.spec.ts:164` "DC pages still 308 away from a locale prefix" fails at 1440
after the main merge: main's SEO ship made /de/about a real address. Reported to the control
session. The other 14 tests in the two re-run stubbed specs pass.

## Not verified
1024 and 768 widths, Arabic in a browser, a real Turnstile challenge, a POST against a live stack.
The Next server start rewrites `apps/web/tsconfig.json` and `next-env.d.ts`; restored each time,
never committed.

Screenshots: `.planning/phases/27-consent-record/screens/`.
