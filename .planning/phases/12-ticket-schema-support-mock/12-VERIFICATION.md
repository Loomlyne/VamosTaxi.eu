---
status: human_needed
phase: 12
---

# Phase 12 verification

status: human_needed

Plans 12-01, 12-02, 12-03 executed. Hosted five-status CHECK + FORCE RLS already applied (`20260910152917`). Staff PATCH guards committed. `#support` DC committed.

## Automated

- vitest `lib/ops/tickets-map.test.ts` — 6 passed
- Hosted CHECK includes `responded`; `relforcerowsecurity` true; no `support_tickets`
- DC greps: five STATUSES, no drag, no `data-quote`, persist open/closed only

## human_verification

1. Open `https://dashboard.vamostaxi.site` `#support` after a **deploy** of Worker `vamos` (not done this sitting).
2. Five columns. Real `/contact` rows only. New badge is a real New count (0 if none).
3. Open a New ticket → becomes Open. Close → Closed. Reopen → Open. Send does not change status.

Do not treat paper SUMMARYs as live until that deploy + click.
