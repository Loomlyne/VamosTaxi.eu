---
phase: 28-pixel-pageview
plan: 06
requirements: [META-06, META-07, META-08]
---
# Phase 28 Plan 06: browser proof with a stand-in for Meta's script

Files: `apps/web/tests/fixtures/fbevents-stub.js`, `apps/web/tests/support/meta-pixel.ts`, `apps/web/tests/integration/meta-pixel-28.spec.ts`.
Pages are fulfilled at `https://vamostaxi.site/...` from `apps/web/public` (the DC_PAGES table is read from
`middleware.ts`), Meta's two hosts are fulfilled locally and recorded, every other outside request is aborted.
The loader is served with its two flags rewritten, so the open behaviour is proven before 28-07 flips the repo flags.

Result (component-1440 project, `--workers=1`): 8 passed.
A before Accept: no script, no beacon, no `_fbp`. B Accept on /about: exactly one `PageView`, `dl` = /about, referrer empty or bare origin, `_fbp` written.
C one page view on /, /de/about, /account/details, /bookings, /sign-in, /?fbclid&utm. D nine denied addresses (incl. dashboard host): no script, no beacon.
E referrer from a confirmation, checkout or pay address: nothing; from the bare origin: one. F language switch and in-place address changes: no second page view (stub counts them unless `disablePushState` is true).
G Cookie preferences -> Marketing off -> Save: revoke recorded, no later beacon, `_fbp`/`_fbc` and `multiFbc` gone, next page starts no script. H flags off: nothing even after Accept.

Notes
- /de/about is moved to /about by the mock's own locale runtime for an English visitor, and a signed-out visitor on /account/... or /bookings is sent to the bare /sign-in by the mock; the beacon address is asserted to be an allowed one.
- Not verified: `consent-banner-27.spec.ts` was started together but its `beforeAll` boots `next dev`, which did not become ready in 200 s in this worktree (no `.env`; Next dev needs the app env). It does not touch anything Phase 28 changed except the CookieBanner helmet line, which cases B and G exercise. Cleaned up its `.next-consent-27-*` folder and restored `tsconfig.json` / `next-env.d.ts`.
- The spec is not in `tests/e2e-specs.ts` (it needs no Next and no database).
