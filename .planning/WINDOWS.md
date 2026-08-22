---
schema_version: 1
open_count: 7
waived_count: 0
fixed_count: 0
total_count: 7
last_updated: 2026-08-22T12:32:53.625Z
---

# Broken Windows Ledger

> Cross-phase defect register. With `workflow.windows_enforce` enabled, `/gsd-ship` blocks while `open_count > 0`.
> Waive with `gsd-tools windows waive <id> "<reason>"` (reason required).
> Mark fixed with `gsd-tools windows fixed <id>`.

| id | phase | kind | file | line | description | status | reason | recorded_at | resolved_at |
|----|-------|------|------|------|-------------|--------|--------|-------------|-------------|
| 1 | 01 | unrun-verify | apps/web/components/core/Avatar.tsx |  | Avatar's onError/mount-effect broken-image fallback (Rule 2 addition) has no committed automated regression test — mountPort's static, non-hydrated render can't exercise client-only fallback logic; verified manually against a real next build + opennextjs-cloudflare preview server instead. | open |  | 2026-08-20T19:25:35.463Z |  |
| 2 | 01 | unrun-verify | apps/web/components/forms/DatePicker.tsx |  | DatePicker's internal open calendar-panel state has no automated screenshot coverage — React-state-only (no controlled prop), so neither the static gallery nor the static mountPort harness can exercise it. Verified live against opennextjs-cloudflare preview (chevron mirroring, panel contents) but not covered by a committed repeatable test. | open |  | 2026-08-21T00:24:46.926Z |  |
| 3 | 1 | deviation | apps/web/middleware.ts |  | Cloudflare Access on staging (D-37) deferred by explicit owner decision — no identity provider chosen yet; only the noindex header half was implemented. See docs/build/CLOUDFLARE-RESOURCES.md. | open |  | 2026-08-21T18:19:33.458Z |  |
| 4 | 1 | deviation | docs/build/CLOUDFLARE-RESOURCES.md |  | Logpush enablement (D-38) deferred by explicit owner decision — no destination chosen yet. lib/logger.ts already emits the structured stream Logpush would read from; no code change needed when a destination lands. | open |  | 2026-08-21T18:19:37.275Z |  |
| 5 | 01 | unrun-verify | apps/web/components/feedback/Tooltip.tsx |  | Tooltip's 'shown' state (React state toggled by a live onMouseEnter/onFocus handler, not a controllable prop) has no automated screenshot coverage on the port side — mountPort serves fully static, non-hydrated markup with no attached event handlers, so a real hover/focus has nothing to react to. Only the bundle side (real client-hydrated React) is screenshot-tested; the port side's rendering fidelity for this state is verified manually instead, via the dev gallery's AutoShowTooltip fixture (focus-triggered on mount), during the German/Arabic passes. | open |  | 2026-08-21T18:57:19.261Z |  |
| 6 | 01 | unrun-verify | apps/web/tests/integration/feedback-behaviour.spec.ts |  | Full-suite (or isolated 2-worker) pnpm test:visual run intermittently fails this spec's dev-server-startup wait (fetch failed within 60s on a freshly spawned next dev -p 3600+workerIndex); reproducibly passes clean when run alone (single worker). Pre-existing from Plan 01-10, unrelated to Plan 01-14 Task 3's own files — not fixed here per SCOPE BOUNDARY. | open |  | 2026-08-22T12:32:53.560Z |  |
| 7 | 01 | unrun-verify | apps/web/tests/integration/lenis.spec.ts |  | The 'reduced motion' test (browser.newContext({reducedMotion:'reduce'})) fails consistently, even run alone: a Lenis instance still boots (instances=1) where the assertion expects 0. Reproduced in isolation, not a full-suite resource-contention flake. Pre-existing from Plan 01-08, unrelated to Plan 01-14 Task 3's own files — not fixed here per SCOPE BOUNDARY; needs its own investigation (Playwright/Chromium prefers-reduced-motion behaviour vs LenisProvider's read of it). | open |  | 2026-08-22T12:32:53.625Z |  |

````json
[
  {
    "id": 1,
    "kind": "unrun-verify",
    "phase": "01",
    "file": "apps/web/components/core/Avatar.tsx",
    "line": null,
    "description": "Avatar's onError/mount-effect broken-image fallback (Rule 2 addition) has no committed automated regression test — mountPort's static, non-hydrated render can't exercise client-only fallback logic; verified manually against a real next build + opennextjs-cloudflare preview server instead.",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-08-20T19:25:35.463Z",
    "resolved_at": null
  },
  {
    "id": 2,
    "kind": "unrun-verify",
    "phase": "01",
    "file": "apps/web/components/forms/DatePicker.tsx",
    "line": null,
    "description": "DatePicker's internal open calendar-panel state has no automated screenshot coverage — React-state-only (no controlled prop), so neither the static gallery nor the static mountPort harness can exercise it. Verified live against opennextjs-cloudflare preview (chevron mirroring, panel contents) but not covered by a committed repeatable test.",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-08-21T00:24:46.926Z",
    "resolved_at": null
  },
  {
    "id": 3,
    "kind": "deviation",
    "phase": "1",
    "file": "apps/web/middleware.ts",
    "line": null,
    "description": "Cloudflare Access on staging (D-37) deferred by explicit owner decision — no identity provider chosen yet; only the noindex header half was implemented. See docs/build/CLOUDFLARE-RESOURCES.md.",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-08-21T18:19:33.458Z",
    "resolved_at": null
  },
  {
    "id": 4,
    "kind": "deviation",
    "phase": "1",
    "file": "docs/build/CLOUDFLARE-RESOURCES.md",
    "line": null,
    "description": "Logpush enablement (D-38) deferred by explicit owner decision — no destination chosen yet. lib/logger.ts already emits the structured stream Logpush would read from; no code change needed when a destination lands.",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-08-21T18:19:37.275Z",
    "resolved_at": null
  },
  {
    "id": 5,
    "kind": "unrun-verify",
    "phase": "01",
    "file": "apps/web/components/feedback/Tooltip.tsx",
    "line": null,
    "description": "Tooltip's 'shown' state (React state toggled by a live onMouseEnter/onFocus handler, not a controllable prop) has no automated screenshot coverage on the port side — mountPort serves fully static, non-hydrated markup with no attached event handlers, so a real hover/focus has nothing to react to. Only the bundle side (real client-hydrated React) is screenshot-tested; the port side's rendering fidelity for this state is verified manually instead, via the dev gallery's AutoShowTooltip fixture (focus-triggered on mount), during the German/Arabic passes.",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-08-21T18:57:19.261Z",
    "resolved_at": null
  },
  {
    "id": 6,
    "kind": "unrun-verify",
    "phase": "01",
    "file": "apps/web/tests/integration/feedback-behaviour.spec.ts",
    "line": null,
    "description": "Full-suite (or isolated 2-worker) pnpm test:visual run intermittently fails this spec's dev-server-startup wait (fetch failed within 60s on a freshly spawned next dev -p 3600+workerIndex); reproducibly passes clean when run alone (single worker). Pre-existing from Plan 01-10, unrelated to Plan 01-14 Task 3's own files — not fixed here per SCOPE BOUNDARY.",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-08-22T12:32:53.560Z",
    "resolved_at": null
  },
  {
    "id": 7,
    "kind": "unrun-verify",
    "phase": "01",
    "file": "apps/web/tests/integration/lenis.spec.ts",
    "line": null,
    "description": "The 'reduced motion' test (browser.newContext({reducedMotion:'reduce'})) fails consistently, even run alone: a Lenis instance still boots (instances=1) where the assertion expects 0. Reproduced in isolation, not a full-suite resource-contention flake. Pre-existing from Plan 01-08, unrelated to Plan 01-14 Task 3's own files — not fixed here per SCOPE BOUNDARY; needs its own investigation (Playwright/Chromium prefers-reduced-motion behaviour vs LenisProvider's read of it).",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-08-22T12:32:53.625Z",
    "resolved_at": null
  }
]
````
