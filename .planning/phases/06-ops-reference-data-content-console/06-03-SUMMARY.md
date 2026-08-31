---
phase: 06-ops-reference-data-content-console
plan: 03
subsystem: ops
tags: [middleware, i18n, sidebar, dashboard-host]
requires:
  - phase: 06-ops-reference-data-content-console
    provides: "06-02 requireStaffClaims, OpsAuthError, createSupabaseMiddlewareClient; 06-01 app.staff_self()"
provides:
  - "dashboard.vamostaxi.site /ops/* staff gate (D-01a)"
  - "OpsShell + OpsSidebar charcoal rail"
  - "buildOpsNav(role) allow-list for pricing/staff"
  - "ops.* dictionary 188 → 259 keys, four locales"
affects: [06-04, 06-05, 06-06, 06-07, 06-08, 06-09, 06-10, 06-11, 06-12, 06-13, 06-14, 06-15, 06-16, 06-17]
tech-stack:
  added: []
  patterns:
    - "Ops middleware returns NextResponse.next({ request }) or a redirect that copies those cookies"
    - "Public DC mocks use NextResponse.rewrite, never a constructed-body NextResponse"
key-files:
  created:
    - apps/web/lib/ops/nav.ts
    - apps/web/components/ops/OpsSidebar.tsx
    - apps/web/components/ops/OpsSidebar.css
    - apps/web/components/ops/OpsShell.tsx
    - apps/web/components/ops/OpsShell.css
    - apps/web/components/ops/index.ts
    - apps/web/app/[locale]/(ops)/ops/layout.tsx
    - apps/web/app/[locale]/(ops)/ops/page.tsx
  modified:
    - apps/web/middleware.ts
    - apps/web/i18n/messages/en.json
    - apps/web/i18n/messages/de.json
    - apps/web/i18n/messages/fr.json
    - apps/web/i18n/messages/ar.json
    - apps/web/i18n/key-map.json
    - apps/web/components/shell/SiteShell.tsx
key-decisions:
  - "D-01a: vamostaxi.site never serves ops; dashboard.vamostaxi.site (and local /ops) does"
  - "D-09: OpenNext #501 still applies at @opennextjs/cloudflare 1.20.2 — keep NextResponse.next({ request })"
  - "config.matcher unchanged"
requirements-completed: [OPS-10, I18N-07]
duration: 40min
completed: 2026-08-31
---

# Phase 06 Plan 03: Ops shell, middleware gate, sidebar, dictionary

**The console outer shell is up: dashboard-host staff gate, charcoal rail, four-language `ops.*` dictionary.**

## Performance

- **Duration:** ~40 min (executor touring stopped; finished inline in `.worktrees/06-03`)
- **Started:** 2026-08-31T22:50:00Z
- **Completed:** 2026-08-31T23:15:00Z
- **Tasks:** 3
- **Files modified:** production files listed above + this SUMMARY

## Accomplishments

- Middleware: `getUser()` + `vamos_role` + `aal2` on the dashboard host; three ordered redirects; exempt sign-in / mfa-challenge / accept-invite.
- Public `vamostaxi.site/ops` redirects home (D-01a). DC mocks `NextResponse.rewrite` so this file has zero `new NextResponse(`.
- `buildOpsNav(role)` allow-lists `pricing` and `staff` to `role === "admin"`. Phase 8 items (dashboard, bookings, calendar, board) render muted, not as links.
- `OpsSidebar` ported from `app/ops/OpsSidebar.dc.html` (`--vt-*`, Lucide `Icon`, `data-lenis-prevent="1"`). Collapse preference after mount (no hydration mismatch).
- Layout is `dynamic = "force-dynamic"`, re-runs `requireStaffClaims()`, reads `app.staff_self()` through `asStaff` when Hyperdrive is up.
- `ops.*` keys **188 → 259**. Identical key sets in en/de/fr/ar. `pnpm i18n:check` passed (1686 keys).

## Task Commits

1. **Tasks 1–3: gate, dictionary, shell** — (this sitting)
2. **Plan metadata:** (this commit)

## D-09 (`@opennextjs/cloudflare` #501)

Pinned **1.20.2**. Issue #501 (Set-Cookie folding when constructing a `NextResponse` with a body in middleware) is still the reason the ops path must use `NextResponse.next({ request })` and copy those cookies onto redirects. Changelog between 0.5.12 and 1.20.2 does not retire that constraint. Implementation does not depend on a fix.

## `config.matcher`

**Unchanged.** `/ops/*` and `/de/ops` already match `/((?!api|_next|_vercel|.*\\..*).*)`.

## `ops.*` inventory

| | count |
|---|---|
| before | 188 |
| added | 71 |
| after | 259 |

Renames (slugify gate): `chauffeurNumber` → `chauffeur-number`, `ofCount` → `of-count`, `paxCount` → `pax-count`. Seed SQL still has the old dotted keys until 06-16.

New keys cover rail/shell, shared verbs, MFA/invite, photos, rate-version publish, empty states, and SQLSTATE copy. No CHF amounts. Staff-invite email body was not invented.

## `OpsNavGroup` / `OpsNavItem`

```ts
type OpsNavItem = {
  key: string;
  href: string;
  icon: IconName;
  labelKey: string; // flat ops slug
  enabled: boolean;
};
type OpsNavGroup = {
  key: string;
  labelKey: string;
  icon?: IconName;
  expandable: boolean;
  items: OpsNavItem[];
};
```

## Deviations

- `apps/web/components/shell/SiteShell.tsx` skips `/ops` the same way it skips `/dev` so the public header does not wrap the rail. Not in `files_modified`; required for D-12 chrome.
- `apps/web/app/[locale]/(ops)/ops/page.tsx` added so `/ops` actually renders the shell (layout alone 404s).
- Local `localhost/ops` is treated as the dashboard host so next-dev can hit the gate without a hosts-file row. `localhost/about` still serves the public mock gallery.
- `asStaff` + `app.staff_self()` is wrapped in try/catch so missing Hyperdrive in local next-dev still paints the rail from claims email/role.
- Worktree `tsc` has no `node_modules`; typecheck runs on the phase branch after merge. Playwright locale specs same.

## Verification

- `getSession` in middleware: 0
- `new NextResponse(` in middleware: 0
- `getUser()` / `aal2`: 1 each
- `dynamic = "force-dynamic"`: 1
- yellow tints in `components/ops`: 0
- `vt-shadow-accent: none` present
- `data-lenis-prevent`: 1
- physical `left:`/`right:` in OpsSidebar.css: 0
- `role !== ` in nav.ts: 0
- `postgres` / `@vamos/db` under ops app+components: 0
- `node scripts/check-i18n-coverage.mjs`: pass
- stylelint on `components/ops/**/*.css`: pass
