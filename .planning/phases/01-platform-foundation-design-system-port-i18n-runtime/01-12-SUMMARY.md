---
phase: 01-platform-foundation-design-system-port-i18n-runtime
plan: 12
subsystem: i18n
tags: [next-intl, react, useSyncExternalStore, sessionStorage, localStorage, playwright, hreflang, sitemap]

# Dependency graph
requires:
  - phase: 01-07
    provides: the i18n dictionary migration and next-intl routing setup this shim wraps
  - phase: 01-08
    provides: the Lenis provider / client-boundary pattern LocaleShimBootstrap mounts alongside
  - phase: 01-09
    provides: the ported form controls (Input, Counter) BookingDraftFields is built from
provides:
  - The mandated VamosLocale compatibility contract (setLang/setCur/onChange/money) over next-intl's router
  - A client-only currency store (CHF/EUR/USD/AED) that never touches the server or a cache key
  - A typed, sessionStorage-backed booking draft that survives ADR-001's soft-navigation remount
  - The proven ADR-001 acceptance test: a half-filled booking draft survives a language switch, including into Arabic and back
  - One shared PUBLIC_ROUTES list driving both hreflang alternates and the sitemap, with dev routes structurally excluded
  - Raw-response-body proofs that SSR locale/direction and currency-mark-only-swap actually hold, not just in the hydrated DOM
affects: [booking-widget, checkout, phase-4-pricing, phase-5-shell-header, seo]

# Actuals (#2632)
actuals:
  tokens: 12700
  tasks: 3
  commits: 3

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "useSyncExternalStore-backed client stores (currency-store.ts, booking-draft.ts) with a hydrate-once-from-storage guard and a try/catch around every storage read/write"
    - "Module-scoped 'active router/pathname/locale' refs written by one bootstrap component (LocaleShimBootstrap), read by an imperative singleton (VamosLocale) — the same shape as lenis-provider.tsx's activeLenis"
    - "Dev-only window.__vamos* test hooks gated behind NODE_ENV !== 'production', dead-code-eliminated from the production bundle"
    - "One shared route-list module (metadata.ts's PUBLIC_ROUTES) walked by both the alternates helper and app/sitemap.ts so the two cannot drift"

key-files:
  created:
    - apps/web/lib/locale-shim.ts
    - apps/web/lib/currency-store.ts
    - apps/web/lib/booking-draft.ts
    - apps/web/lib/metadata.ts
    - apps/web/components/booking/BookingDraftFields.tsx
    - apps/web/components/booking/index.ts
    - apps/web/app/sitemap.ts
    - apps/web/tests/integration/lang-switch.spec.ts
    - apps/web/tests/integration/currency.spec.ts
    - apps/web/tests/integration/ssr-locale.spec.ts
  modified:
    - apps/web/app/[locale]/providers.tsx
    - apps/web/app/[locale]/page.tsx
    - apps/web/i18n/messages/en.json
    - apps/web/i18n/messages/de.json
    - apps/web/i18n/messages/fr.json
    - apps/web/i18n/messages/ar.json

key-decisions:
  - "Language setter always soft-navigates via next-intl's own locale-aware router.replace(pathname, {locale}) — never a reload, never a direct location assignment (T-01-02 backstop, verified: no arbitrary-target navigation is reachable since the locale is always drawn from routing.locales)"
  - "Currency stays client-only in localStorage under a single STORAGE_KEY read/written from exactly one module (currency-store.ts) — never a cookie, never a server read (D-16/ADR-004)"
  - "Booking draft persists to sessionStorage, not the URL or localStorage — pickup/destination/flightNumber never reach the address bar, history or a referrer header (D-15)"
  - "currency-store.ts reuses lib/currency.ts's CURRENCY_MARKS table and formatAmount() rather than duplicating the four-currency table a second time"
  - "PUBLIC_ROUTES in metadata.ts is the single 18-page list; app/sitemap.ts walks the same array rather than maintaining its own"

patterns-established:
  - "Pattern: client-only reactive store = module-scoped state + Set<listener> + useSyncExternalStore wrapper, with hydrate() guarded by a `hydrated` flag and every storage call wrapped in try/catch (currency-store.ts, booking-draft.ts both follow this shape; Phase 4's pricing extension to booking-draft.ts should follow it too)"
  - "Pattern: SSR-facing assertions read the raw fetch() response body, never page.goto() + DOM inspection, whenever the property under test is specifically about what the server sent before hydration (ssr-locale.spec.ts)"

requirements-completed: [I18N-02, I18N-03, I18N-05]

coverage:
  - id: D1
    description: "VamosLocale compatibility shim (setLang/setCur/onChange/money) mounted once in the client boundary, with a client-only currency store carrying the four currency marks and swapping only the mark, never the figure"
    requirement: "I18N-05"
    verification:
      - kind: unit
        ref: "node -e shim-exports-check (setLang/setCur/onChange/money present in locale-shim.ts)"
        status: pass
      - kind: e2e
        ref: "apps/web/tests/integration/currency.spec.ts#the server always renders CHF; switching currency changes only the mark, and the digit sequence is byte-identical"
        status: pass
      - kind: e2e
        ref: "apps/web/tests/integration/currency.spec.ts#switching currency touches no request and triggers no navigation"
        status: pass
      - kind: e2e
        ref: "apps/web/tests/integration/currency.spec.ts#every currency renders the same one CHF-priced figure"
        status: pass
    human_judgment: false
  - id: D2
    description: "Booking draft persisted to sessionStorage and read from the store on mount (never a useState literal); ADR-001's own acceptance test — fill partially, switch language including into Arabic, assert every field survives, plus the return-visit sessionStorage-vs-cookie distinction"
    requirement: "I18N-02"
    verification:
      - kind: e2e
        ref: "apps/web/tests/integration/lang-switch.spec.ts#fill partially, switch to Arabic (RTL) and back to English, every field survives both ways"
        status: pass
      - kind: e2e
        ref: "apps/web/tests/integration/lang-switch.spec.ts#switch to German, every field survives"
        status: pass
      - kind: e2e
        ref: "apps/web/tests/integration/lang-switch.spec.ts#return visit: the language choice persists, the draft does not"
        status: pass
    human_judgment: false
  - id: D3
    description: "Shared PUBLIC_ROUTES list drives both hreflang alternates and the sitemap; server-rendered lang/dir/translated-title proven against the raw response body for en/de/fr/ar, dev routes structurally absent from both alternates and sitemap"
    requirement: "I18N-03"
    verification:
      - kind: e2e
        ref: "apps/web/tests/integration/ssr-locale.spec.ts#{en,de,fr,ar}: the raw response carries the correct lang/dir and the translated title before any script runs"
        status: pass
      - kind: e2e
        ref: "apps/web/tests/integration/ssr-locale.spec.ts#Arabic specifically carries dir=\"rtl\" in the raw response"
        status: pass
      - kind: e2e
        ref: "apps/web/tests/integration/ssr-locale.spec.ts#home page alternates: all four languages plus the default, in the raw response"
        status: pass
      - kind: e2e
        ref: "apps/web/tests/integration/ssr-locale.spec.ts#sitemap.xml is served, is a valid urlset, and carries no dev-only gallery route"
        status: pass
      - kind: manual_procedural
        ref: "curl against a real opennextjs-cloudflare build served by `pnpm exec wrangler dev --local` (ports 8787/8788) — /de, /fr, /ar each returned their own lang attribute; /sitemap.xml served a valid urlset excluding /dev/components; home page markup carried hrefLang=\"en|de|fr|ar|x-default\" (5 alternates)"
        status: pass
    human_judgment: false

# Metrics
duration: ~10min (22:52–23:02 UTC+4, from first to last task commit)
completed: 2026-08-21
status: complete
---

# Phase 1 Plan 12: I18n runtime, currency store and booking-draft persistence Summary

**VamosLocale compatibility shim over next-intl's router, a client-only CHF/EUR/USD/AED currency store, sessionStorage-backed booking draft that survives ADR-001's language-switch remount (proven into Arabic and back), and one shared route list driving hreflang alternates + the sitemap.**

This SUMMARY was written after the fact — the executor that ran these three tasks completed and committed all of them but died before writing its own SUMMARY.md. Every claim below was independently re-verified in this session: `git show --stat` on all three commits, a full read of every declared artifact, and every one of the plan's automated `<verify>` commands actually run against the current tree (not taken on faith from the commit messages).

## Performance

- **Duration:** ~10 min (first commit `22:52:18+04:00`, last `23:02:17+04:00`)
- **Started:** 2026-08-21T18:52:18Z (22:52:18+04:00)
- **Completed:** 2026-08-21T19:02:17Z (23:02:17+04:00)
- **Tasks:** 3/3
- **Files modified:** 16 (12 created, 4 pre-existing files touched: `providers.tsx`, `page.tsx`, and the four locale message JSON files)

## Accomplishments
- The mandated `VamosLocale` contract (`setLang`, `setCur`, `onChange`, `money()`) ported onto next-intl's locale-aware router, with a soft navigation that never reloads and never assigns `location.href` directly — verified by grep and by the passing `@lang-switch`/`@ssr-locale` suites.
- A client-only currency store reusing the existing `lib/currency.ts` mark table (no duplicate table), read/written through exactly one `localStorage` key, never touching the server or a cache key.
- A typed, sessionStorage-backed booking draft (`pickup`, `destination`, `date`, `time`, `passengers`, `luggage`, `flightNumber`) that `BookingDraftFields.tsx` reads from on mount — not from a `useState` literal — and writes to on every change, never on unmount.
- **ADR-001's own acceptance test, genuinely asserted:** `lang-switch.spec.ts` fills every field with a distinct value, switches into Arabic (RTL flips, `document.documentElement.dir === "rtl"` asserted), asserts every field survived, switches back to English and re-asserts, then repeats the switch into German. A third test proves the correct asymmetry: on a fresh tab, the language choice persists (next-intl's cookie) but the draft does not (sessionStorage is tab-scoped) — the "return visit" half the plan asked for.
- `metadata.ts`'s `PUBLIC_ROUTES` (18 pages) is the one list both `buildAlternates()` and `app/sitemap.ts` walk; dev-only `/dev/components/**` routes are structurally absent from both, not filtered out after the fact.
- `ssr-locale.spec.ts` asserts against the raw `fetch()` response body (never `page.goto()` + DOM) that `/de`, `/fr`, `/ar` each carry the correct `lang`/`dir` attribute and the translated `<title>`-equivalent string before any script runs, that `/ar` carries `dir="rtl"`, that the home page's raw HTML carries all four `hreflang` alternates plus `x-default`, and that `/sitemap.xml` is a valid urlset excluding dev routes.
- `currency.spec.ts` proves the server always renders `CHF 000` by default, that switching currency changes only the mark (digit sequence byte-identical, `expect(digitsOnly(eur)).toBe(digitsOnly(chf))`), that no request or navigation fires during a switch, and that every one of CHF/EUR/USD/AED formats the identical placeholder figure (`ADR-004`: one priced currency, never four price lists).

## Task Commits

Each task was committed atomically:

1. **Task 1: The locale compatibility shim and the client-only currency store** — `e0e3cc1` (feat)
2. **Task 2: Booking draft persistence and the ADR-001 acceptance test** — `d4e1900` (feat)
3. **Task 3: Alternates, sitemap, and the server-rendered locale assertions** — `f3bb3f0` (feat)

**Plan metadata:** this commit (docs: complete plan)

## Files Created/Modified
- `apps/web/lib/locale-shim.ts` — `VamosLocale` (imperative) + `useVamosLocale` (hook); soft-navigation setter, subscription, amount formatter; dev-only `window.__vamos*` test hooks gated behind `NODE_ENV !== "production"`
- `apps/web/lib/currency-store.ts` — `CURRENCIES`, `money`, `useCurrency`; localStorage-backed, `useSyncExternalStore`-driven, reuses `lib/currency.ts`'s mark table
- `apps/web/lib/booking-draft.ts` — `BookingDraft`, `readDraft`, `writeDraft`, `useBookingDraft`; sessionStorage-backed, hydrate-once, writes on every change
- `apps/web/components/booking/BookingDraftFields.tsx` + `index.ts` — the Phase-1 field set rendered on the home page tracer, reading initial values from `useBookingDraft()`
- `apps/web/lib/metadata.ts` — `PUBLIC_ROUTES` (18 pages), `buildAlternates()`; `SITE_URL` is the eventual production domain (`https://vamostaxi.eu`, per D-33), not the current staging workers.dev host — see Deviations
- `apps/web/app/sitemap.ts` — walks `PUBLIC_ROUTES`, served at `/sitemap.xml` via Next's file convention
- `apps/web/tests/integration/lang-switch.spec.ts` (`@lang-switch`) — the ADR-001 acceptance test
- `apps/web/tests/integration/currency.spec.ts` (`@currency`) — mark-swap/byte-identity proof
- `apps/web/tests/integration/ssr-locale.spec.ts` (`@ssr-locale`) — raw-response-body proof
- `apps/web/app/[locale]/providers.tsx` — mounts `LocaleShimBootstrap`
- `apps/web/app/[locale]/page.tsx` — renders `BookingDraftFields`, wires `generateMetadata()` through `buildAlternates("/")`
- `apps/web/i18n/messages/{en,de,fr,ar}.json` — added `booking.date`/`booking.time` keys (see Deviations)

## Decisions Made
- Reused `lib/currency.ts`'s `CURRENCY_MARKS`/`formatAmount` from `currency-store.ts` instead of re-declaring the four-currency table a second time — one place the marks are defined, matching the plan's own "no duplication" framing.
- Module-scoped "active router/pathname/locale" refs, written by one bootstrap component and read by the imperative `VamosLocale` singleton — the same shape `lenis-provider.tsx`'s `activeLenis` already established, chosen because Next's router/pathname are only reachable via hooks inside a render, but the mandated `VamosLocale` contract must be callable from anywhere (a plain object method, no component required).
- Drove the language switch in tests via a dev-only `window.__vamosSetLang` hook rather than a UI control, because no language-switcher UI exists yet in Phase 1 (SiteHeader ships in Phase 5) — the hook exercises the identical `VamosLocale.setLang` → `router.replace(..., {locale})` path a real switcher will call later.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Added `booking.date`/`booking.time` translation keys to all four locale files**
- **Found during:** Task 2 (`BookingDraftFields.tsx`)
- **Issue:** The Plan 07 dictionary migration had no existing key for the date/time field labels this new component needs. CLAUDE.md's four-languages-same-pass law is binding regardless of which plan's scope a string falls under.
- **Fix:** Added `booking.date` and `booking.time` to `en.json`, `de.json`, `fr.json`, `ar.json` in the same commit as the component that needs them.
- **Files modified:** `apps/web/i18n/messages/{en,de,fr,ar}.json`
- **Verification:** `pnpm i18n:check` passes (re-run in this session: exit 0, all four locales at parity — 1560 leaf keys each, confirmed directly by counting, independent of the check script's own internal 1478-literal-call-site figure).
- **Committed in:** `d4e1900` (Task 2 commit)

**2. [Rule 1 - Bug] Plan's literal `grep -c 'hreflang'` verify command undercounts; adapted to a case-insensitive assertion**
- **Found during:** Task 3 (`ssr-locale.spec.ts`)
- **Issue:** Next's built-in metadata renderer emits the alternate-link attribute as `hrefLang` (its own JSX prop casing), not the lowercase `hreflang` the plan's literal shell verify command greps for. A case-sensitive count against a real build returns 0, not the ≥5 the plan expects — re-confirmed independently in this session against a real `opennextjs-cloudflare build` + `wrangler dev --local` preview: `grep -c 'hreflang'` → `0`; `grep -ic 'hreflang'` → `10`; raw markup shows `<link rel="alternate" hrefLang="en" .../>` etc., all five alternates (en/de/fr/ar/x-default) present.
- **Fix:** `ssr-locale.spec.ts`'s own assertion matches case-insensitively (`/hreflang=/gi`) and additionally checks each locale's `hreflang="{locale}"` string case-insensitively, rather than asserting Next's internal attribute casing. HTML attribute matching is case-insensitive in a browser, so this is the correct behavior to assert, not a workaround.
- **Files modified:** `apps/web/tests/integration/ssr-locale.spec.ts` (this was the correct implementation from the start, not a post-hoc patch — noted here because the *plan's own verify command* is what's stale, confirmed by re-running it verbatim in this session)
- **Verification:** `@ssr-locale` suite passes (7/7 non-skipped); manual `curl` against a real preview build independently confirms 5 alternates with correct per-locale `hrefLang` values.
- **Committed in:** `f3bb3f0` (Task 3 commit)

---

**Total deviations:** 2 (1 Rule 2 - missing i18n keys, 1 Rule 1 - stale verify command in the plan itself, both already handled correctly at commit time and re-confirmed independently in this session)
**Impact on plan:** Both were necessary and narrowly scoped to this plan's own files. No scope creep, no architectural change.

## Issues Encountered

- `pnpm build` (plain Next build, not the Cloudflare preview) prints two `Error: ENVIRONMENT_FALLBACK` lines during static-page generation (`.next/server/chunks/91.js` / `139.js`). This is **not** introduced by any of 01-12's files — grepped for `getCloudflareContext`/`ENVIRONMENT_FALLBACK` across `apps/web/lib` and `apps/web/app` and found no matches in first-party source; it originates from a compiled internal chunk, most likely `@opennextjs/cloudflare`'s own build-time environment probing running under plain `next build` (no Worker context available at that point). The build still exits 0 and generates all 36 pages successfully, and the Cloudflare preview build (`opennextjs-cloudflare build` + `wrangler dev --local`) — the environment that actually matters — showed no such error and served every route correctly. Left unfixed per the scope boundary (pre-existing, unrelated to this plan's declared files); noting it here so it isn't lost.
- None of ADR-001's stated failure condition occurred: the language-switch acceptance test passes cleanly in both directions and into Arabic, so no escalation to reopen the URL-segment decision is needed.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- The `VamosLocale`/`useVamosLocale` contract, the currency store, and the booking-draft store are all in place for Phase 4 (pricing) to extend `booking-draft.ts`'s shape with the computed quote, and for Phase 5 (shell/header) to wire a real language switcher through the exact `VamosLocale.setLang` path the dev-only test hook already exercises.
- `metadata.ts`'s `SITE_URL` constant (`https://vamostaxi.eu`) is the eventual production domain per D-33/D-19 — correct as written (canonical URLs describe the production site's own shape, not whichever host currently serves the request), but there is no live `vamostaxi.eu` zone yet per this session's ground truth; nothing in this plan depends on the zone existing, and no fix is needed here.
- `BookingDraftFields.tsx` is explicitly a minimal Phase-1 field set on the home-page tracer, not the real booking widget — Phase 4/5 build the production widget on top of the same `booking-draft.ts` store, per the component's own header comment.
- No blockers identified for downstream phases.

---
*Phase: 01-platform-foundation-design-system-port-i18n-runtime*
*Completed: 2026-08-21*
## Self-Check: PASSED
