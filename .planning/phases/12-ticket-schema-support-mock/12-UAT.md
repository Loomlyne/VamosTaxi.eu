---
status: complete
phase: 12-ticket-schema-support-mock
source: [12-01-SUMMARY.md, 12-02-SUMMARY.md, 12-03-SUMMARY.md]
started: 2026-09-11T20:15:00Z
updated: 2026-09-11T20:26:00Z
---

## Current Test

number: 5
name: Close bar — live staff tickets API
expected: |
  Logged-out GET /api/staff/tickets is 401 no-session, not 404. Support HTML has five STATUSES, no drag. Leftover OpsSupport.dc is 404.
awaiting: complete

## Tests

### 1. Support board — five columns, real /contact rows
expected: Open https://dashboard.vamostaxi.site/?nocache=644a71b5 then click Support in the sidebar (do not type #support). Address bar is /support. Five columns: New, Open, Replied, Responded, Closed. Cards are real /contact rows (name, email, time; booking_ref/locale chips only when they exist). No message preview on the card. No Staff tab. No Isolation fixtures. Empty column still shows the column, not fake cards. Sidebar New badge is the real New count (0 if none).
result: pass

### 2. Open a New ticket — becomes Open
expected: Click a New card. Overlay opens (thread left, details right). That ticket moves to Open. Opening an already-Open / Replied / Responded / Closed ticket does not change status.
result: skipped
reason: New was 0. Open overlay on TKT-8D6AC839 did not change status (Open stayed Open). Open-from-New not exercised.

### 3. Close and Reopen
expected: In the overlay, Close moves the ticket to Closed. Reopen on Closed moves it to Open. Send does not change status and does not send mail this phase.
result: pass
reported: "yes that happened" on Reopen; "yes it works" on Send.

### 4. Filter one status is a table
expected: Filter All stays kanban. Filter one status (e.g. Open) is a table of only those tickets, with phone + status columns. Search filters the loaded list by name, email, message.
result: pass
reported: "Yes when I filter it goes to the table directly."

### 5. Close bar — live staff tickets API
expected: Logged-out GET /api/staff/tickets is 401 no-session, not 404. Support HTML has five STATUSES, no drag. Leftover OpsSupport.dc is 404.
result: pass
reason: Agent curl 2026-09-12 — tickets 401 {"ok":false,"code":"no-session"}; live OpsSupportTicket.dc.html five STATUSES, no draggable; leftover OpsSupport.dc 404.

## Summary

total: 5
passed: 4
issues: 0
pending: 0
skipped: 1
blocked: 0

## Gaps

[none]
