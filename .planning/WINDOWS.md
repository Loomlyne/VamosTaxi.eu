---
schema_version: 1
open_count: 2
waived_count: 0
fixed_count: 0
total_count: 2
last_updated: 2026-08-21T00:24:46.926Z
---

# Broken Windows Ledger

> Cross-phase defect register. With `workflow.windows_enforce` enabled, `/gsd-ship` blocks while `open_count > 0`.
> Waive with `gsd-tools windows waive <id> "<reason>"` (reason required).
> Mark fixed with `gsd-tools windows fixed <id>`.

| id | phase | kind | file | line | description | status | reason | recorded_at | resolved_at |
|----|-------|------|------|------|-------------|--------|--------|-------------|-------------|
| 1 | 01 | unrun-verify | apps/web/components/core/Avatar.tsx |  | Avatar's onError/mount-effect broken-image fallback (Rule 2 addition) has no committed automated regression test — mountPort's static, non-hydrated render can't exercise client-only fallback logic; verified manually against a real next build + opennextjs-cloudflare preview server instead. | open |  | 2026-08-20T19:25:35.463Z |  |
| 2 | 01 | unrun-verify | apps/web/components/forms/DatePicker.tsx |  | DatePicker's internal open calendar-panel state has no automated screenshot coverage — React-state-only (no controlled prop), so neither the static gallery nor the static mountPort harness can exercise it. Verified live against opennextjs-cloudflare preview (chevron mirroring, panel contents) but not covered by a committed repeatable test. | open |  | 2026-08-21T00:24:46.926Z |  |

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
  }
]
````
