---
status: testing
phase: 16-staging-mx-end-to-end-uat
source:
  - 16-01-SUMMARY.md
  - 16-02-SUMMARY.md
  - 16-03-SUMMARY.md
started: 2026-09-19T13:23:30Z
updated: 2026-09-19T13:29:00Z
---

# Phase 16 UAT — staging MX + Reply-in-Gmail (INB-01)

This file is the live script. Do not invent pass. Record only what this sitting observed.

Agent surface: Hermes in-app browser only.
- Public: https://vamostaxi.site/contact
- Ops: https://dashboard.vamostaxi.site then click Support in the left rail
- Never type #support. Never Staff. Never open Gmail. Never Brave / OS browser.

Koss surface: his real Gmail. Every Gmail / info@ step is `awaiting: user`. Stop and wait.

Prior sitting 2026-09-18 is recorded in 16-04-SUMMARY.md (TKT-8EC98A6D). This script still needs a **new** /contact this sitting. Do not reuse that ticket as the INB-01 proof.

## Current Test

number: 3
name: New /contact this sitting (D-12)
expected: |
  Public page shows "Your message has been accepted for delivery. Our team will review it."
  Write down the wall-clock time (Zurich). That row must appear as a new Support ticket in test 4.

## Rules

- One numbered action + expected per step below. Do not skip to a checkpoint.
- If inbound never arrives after staff Send + Koss Reply: run **Fallback F** immediately. Do not leave a dead Resend MX. Do not touch vamostaxi.eu DNS. Do not push main.
- Do not enable receiving.forward. Do not add Support chrome.

## Tests

### 1. Public DNS (D-03 D-05 D-17)
who: agent
action: |
  1. In the repo terminal (not a browser): `dig +short MX replies.vamostaxi.site`
  2. `dig +short MX vamostaxi.site`
  3. `dig +short MX vamostaxi.eu`
expected: |
  replies MX is `10 inbound-smtp.ap-northeast-1.amazonaws.com.` (Resend receiving hostname copied in docs/ops/replies-mx.md).
  Apex `vamostaxi.site` MX is empty.
  `vamostaxi.eu` is still `10 mail.vamostaxi.eu.`
result: pass
observed: |
  2026-09-19 15:29 CEST this sitting:
  replies: `10 inbound-smtp.ap-northeast-1.amazonaws.com.`
  apex `vamostaxi.site`: empty
  `vamostaxi.eu`: `10 mail.vamostaxi.eu.`

### 2. Unsigned webhook (D-07)
who: agent
action: |
  1. `curl -sS -o /tmp/vt-16-uat-webhook.txt -w '%{http_code}' -X POST https://vamostaxi.site/api/webhooks/resend -H 'content-type: application/json' -d '{}'`
  2. Print the HTTP code and the body file.
expected: HTTP `400`. Body mentions invalid / missing signature. Not 200. Not 503.
result: pass
observed: |
  2026-09-19 15:29 CEST this sitting:
  POST https://vamostaxi.site/api/webhooks/resend unsigned `{}` → HTTP 400 body `invalid`.

### 3. New /contact this sitting (D-12)
who: agent (Hermes in-app browser). Koss may type if the agent cannot complete Turnstile.
action: |
  1. Open https://vamostaxi.site/contact in the Hermes in-app browser.
  2. Expected on screen: heading "Send us a message", fields Name / Email / Phone / Booking reference / message, button "Send message".
  3. Type Name: `INB-01 UAT`
  4. Type Email: the Gmail address Koss will Reply from this sitting. Do not invent an address. Ask Koss if unknown.
  5. Leave Phone and Booking reference empty.
  6. Type message: `INB-01 UAT 2026-09-19 — unique body, find me on Support`
  7. Click "Send message". Complete Turnstile if it appears (Koss if human/challenge).
expected: |
  Public page shows "Your message has been accepted for delivery. Our team will review it."
  Write down the wall-clock time (Zurich). That row must appear as a new Support ticket in test 4.
result: pending

### 4. Staff Send (D-01 D-10)
who: agent (Hermes in-app browser)
action: |
  1. Open https://dashboard.vamostaxi.site in the Hermes in-app browser.
  2. If Dispatch sign in: fill the staff email, then Bitwarden-fill the password. Never type a password. Never ask Koss to paste it in chat.
  3. After the console loads, click **Support** in the left rail. Do not type #support. Confirm there is no Staff tab.
  4. Find the new card from test 3 (name INB-01 UAT / the Gmail used). Click that card.
  5. Overlay opens. Confirm the first bubble is the contact body from test 3.
  6. Type in "Write a reply…": `Phase 16 INB-01 staff Send`
  7. Click **Send**. Wait until the staff bubble is in the thread. Do not click Send again.
expected: |
  Same overlay, no new chrome. Staff bubble "Phase 16 INB-01 staff Send" is visible.
  From for that mail is `TKT-{first 8 of uuid}@replies.vamostaxi.site` (board id). Write the TKT- id here when seen.
  No "Couldn't send" error. If send fails, stop — do not invent pass.
result: pending

### 5. info@ copy bar after Send (D-09 D-10)
who: Koss
awaiting: user
action: |
  1. Agent says: check info@ Gmail for this sitting. Agent does not open Gmail.
  2. Koss looks at info@ only.
expected: |
  Contact intake for the test 3 message and/or staff Send BCC only.
  No customer inbound copy. No receiving.forward.
  Koss replies in this chat with what he sees (or "info@ inbox not created").
result: pending

### 6. Gmail Reply — image + PDF + script text (D-11 D-14 D-16 INB-01)
who: Koss
awaiting: user
action: |
  1. Agent says: in Gmail, open the staff mail from test 4. From must be `TKT-________@replies.vamostaxi.site` (fill from test 4). Click Reply. Do not compose a new message to info@.
  2. Attach one image (jpeg/png) and one PDF.
  3. Body must include the exact characters `<script>alert(1)</script>` (plain text, not a Gmail HTML widget).
  4. Send. Tell the agent **sent**.
  5. Agent never opens Gmail. Agent does not click Gmail links.
expected: |
  Koss says **sent**. Same ticket will be confirmed in test 7 (INB-01). If he cannot Reply, stop — do not invent sent.
result: pending

### 7. Dashboard confirm after sent (INB-01 D-15 D-14 D-16)
who: agent, only after Koss says sent
action: |
  1. If inbound has not appeared after ~2 minutes, run Fallback F. Do not keep waiting on a dead MX.
  2. Hermes in-app browser: https://dashboard.vamostaxi.site → click Support (do not type #support).
  3. Open the **same** ticket from test 4 (same TKT- id). Do not open a different new card.
  4. Read the newest customer bubble. Confirm the script string is visible as text.
  5. Click the image filename button on that bubble. Nested overlay `vt-file-preview` shows the image. Close the preview.
  6. Click the PDF filename button. Nested overlay shows PDF pages (canvas), scrollable, no Chrome PDF toolbar/thumbs/zoom chrome.
expected: |
  INB-01: same ticket, new customer bubble. Status Responded.
  `<script>alert(1)</script>` is escaped / shown as text. No JS alert. No innerHTML execute.
  Image preview works. PDF pages-only preview works (download/filename still on the button).
  Fail if a second ticket was created for the Reply.
result: pending

### 8. Closed → Reply → Responded (D-13)
who: agent Closes; Koss Replies; agent confirms
action: |
  1. Agent, same overlay: click **Close Ticket**. Status becomes Closed. Reply box is replaced by "This ticket is closed. Reopen it to keep working."
  2. Agent stops. awaiting: user
  3. Koss: in Gmail, Reply again to the same thread (short body `Ok open`). No need for new files. Send. Tell the agent **sent**. Agent does not open Gmail.
  4. After sent: agent refreshes Support, opens the **same** TKT- overlay.
expected: |
  Closed then inbound Reply becomes Responded on the same ticket. New inbound bubble with `Ok open`.
  Fail if status stays Closed, or a new ticket appears.
result: pending
awaiting: user

### 9. No-token drop (D-14)
who: Koss (or a throwaway mailbox he controls)
awaiting: user
action: |
  1. Agent says: send a new mail To `drop@replies.vamostaxi.site` (no `ticket+{32hex}`, no `TKT-{8hex}`, no In-Reply-To of the staff mail). Any short body. Tell the agent **sent**.
  2. Agent never opens Gmail.
  3. After sent: agent on Support confirms no new card for that From/subject, and the test 4 ticket message count did not grow.
expected: |
  Board does not gain a ticket. Existing tickets do not append. Optional SQL: `support_inbound_events` may log a drop; `support_messages` for that email_id is zero.
result: pending

### 10. info@ inbound not forwarded (D-09 D-10)
who: Koss
awaiting: user
action: |
  1. Agent says: check info@ again after tests 6–9. Agent does not open Gmail.
expected: |
  Still only intake + staff BCC from this sitting. No copy of the customer Reply, the Closed Reply, or the no-token drop.
result: pending

### 11. Live-pass grep (INB-01 / Closed→Responded)
who: agent
action: |
  1. Only after tests 7 and 8 have a real `result:` from this sitting (Koss said sent + overlay matched). Do not type pass into those tests to satisfy this grep.
  2. From repo root: `grep -E 'INB-01|Closed.?Responded' .planning/phases/16-staging-mx-end-to-end-uat/16-UAT.md | grep -i pass`
expected: |
  Output includes an INB-01 pass line (test 7) and a Closed→Responded pass line (test 8).
  Empty grep = not passed. Do not invent those lines.
result: pending

## Fallback F — inbound never arrives (D-08)

Run only if test 6/8 was sent and the overlay never gets the customer bubble. Owner wait, not a product-failure card unless MX revert itself fails.

who: agent (Cloudflare zone vamostaxi.site only)
action: |
  1. Stop UAT. Do not keep Send/Reply retries.
  2. Revert `replies` MX to SES: type MX, name `replies`, priority 10, content `inbound-smtp.ap-northeast-1.amazonaws.com`.
  3. Delete leftover Resend MX on `replies` so it is not dual-MX.
  4. Do not add apex MX. Do not touch vamostaxi.eu. Do not push main.
  5. Then debug (webhook 400 still, Resend receiving, Worker vamos). Do not flip MX forward again in this file without a new debug note.
expected: |
  `dig +short MX replies.vamostaxi.site` is again `10 inbound-smtp.ap-northeast-1.amazonaws.com.`
  Apex still empty. `.eu` still `10 mail.vamostaxi.eu.`
  Record test 7/8 as blocked, not pass.
result: pending

## Summary

total: 11
passed: 2
issues: 0
pending: 9
skipped: 0
blocked: 0

## Gaps

[]
