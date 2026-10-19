---
phase: 28-pixel-pageview
plan: 02
requirements: [META-06, META-07, META-08]
key-files:
  created:
    - app/vamos-meta.js
    - apps/web/lib/meta/pixel-pages.ts
    - apps/web/lib/meta/pixel-pages.cases.ts
    - apps/web/lib/meta/pixel-pages.test.ts
    - apps/web/lib/meta/vamos-meta.test.ts
---
# Phase 28 Plan 02: the loader and its server twin

`app/vamos-meta.js` (ES5, `window.VamosMeta = {allowed, loaded, revoked}`) starts Meta's script only after
both baked flags, the allow-list, a clean referrer and the server's marketing answer. The flags are
`false` in this plan. Server twin `pixelPageAllowed(url)` holds the same rules; one shared table of
~110 addresses (`pixel-pages.cases.ts`) is run through both.

Owner answer applied: sign-in and sign-up count only with no query string at all (even `?fbclid` is refused).

Verified: `vitest run lib/meta` 267 passed (parity table, vm harness: bootstrap order, withdraw, bfcache,
storage event, fail-closed cases, source pins, no mock `pushState/replaceState` builds a query key).

## Deviations
- The loader and its test were committed together (the RED commit step was folded into one commit).
- Extra rules in both implementations, tighter than the plan: no port or credentials in the address, no `@` anywhere in the decoded address, no `%`-undecodable address.
- A withdraw sets `revoked()` only when the pixel had actually started on the page; a visitor who refused and then accepts on the same page (pixel never started) still gets the page view (D-06).
