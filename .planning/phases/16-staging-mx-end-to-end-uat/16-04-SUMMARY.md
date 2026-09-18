---
phase: 16-staging-mx-end-to-end-uat
plan: 04
subsystem: testing
status: complete
tags: [uat, resend, inbound, mx]

requires:
  - phase: 16-staging-mx-end-to-end-uat
    provides: 16-03 verified domain + Worker
provides:
  - 16-UAT.md complete 10/10
  - INB-01 live same ticket
key-files:
  modified:
    - .planning/phases/16-staging-mx-end-to-end-uat/16-UAT.md
requirements-completed: [INB-01, D-07, D-09, D-10, D-11, D-12, D-13, D-14, D-15, D-16]
completed: 2026-09-18
---

# Phase 16 Plan 04 Summary

Live UAT on `vamostaxi.site` + `dashboard.vamostaxi.site`. Ticket **TKT-8EC98A6D** (`8ec98a6d-d411-4ecb-b1eb-6e650290fe87`). Customer From `TKT-8EC98A6D@replies.vamostaxi.site`.

## Results

1. DNS replies MX Resend; apex empty; `.eu` unchanged — pass
2. Unsigned webhook 400 — pass
3. `/contact` this sitting — pass
4. Staff Send TKT- From — pass
5. info@ copy bar — pass (owner: inbox not created, mark pass)
6. Gmail Reply same ticket + jpeg/PDF — pass
7. Overlay XSS escaped + PDF pages-only — pass
8. Closed → Reply → Responded — pass (`Ok open`, status responded)
9. `drop@replies.vamostaxi.site` logged in `support_inbound_events` (`35abd856-…`); no new ticket; TKT messages stayed 6 — pass
10. info@ inbound not forwarded — pass (same as 5)

Do not merge #42 until owner says **merge #42**. Never push `main`.
