---
status: testing
phase: 16-staging-mx-end-to-end-uat
source:
  - 16-01-SUMMARY.md
  - 16-02-SUMMARY.md
  - 16-03-SUMMARY.md
started: 2026-09-18T10:00:00Z
updated: 2026-09-18T12:37:06Z
---

# Phase 16 UAT — staging MX + Reply-in-Gmail

Agent never opens Gmail. After Koss says sent, agent confirms on `https://dashboard.vamostaxi.site` Support rail (not `#support` typed, not Staff). Public form: `https://vamostaxi.site/contact`.

If inbound never arrives after MX cut: stop, revert `replies.` MX to `inbound-smtp.ap-northeast-1.amazonaws.com` (D-08), then debug.

## Current Test

number: 8
name: Close Ticket then Reply → Responded
expected: |
  Overlay shows Closed. After Gmail Reply, same ticket is Responded with a new customer bubble.
awaiting: user

## Tests

### 1. Public DNS (D-03 D-05 D-17)
who: agent
action: `dig +short MX replies.vamostaxi.site`; `dig +short MX vamostaxi.site`; `dig +short MX vamostaxi.eu`
expected: replies MX is the Resend receiving hostname copied in `docs/ops/replies-mx.md` (ap-northeast-1 inbound-smtp). Apex empty. `.eu` still `10 mail.vamostaxi.eu.`
result: pass
reported: "replies 10 inbound-smtp.ap-northeast-1.amazonaws.com.; apex empty; eu 10 mail.vamostaxi.eu."

### 2. Unsigned webhook (D-07)
who: agent
action: `curl -sS -o /dev/null -w '%{http_code}' -X POST https://vamostaxi.site/api/webhooks/resend -H 'content-type: application/json' -d '{}'`
expected: `400`
result: pass
reported: "400 invalid (reconfirmed 2026-09-18T12:25Z)"

### 3. New /contact this sitting (D-12)
who: agent may drive public form; Koss may type
action: Open `https://vamostaxi.site/contact`. Submit a new message this sitting (unique subject/body so it is findable).
expected: confirmation on the public page. A new ticket appears on dashboard Support.
result: pass
reported: "Message received. ticket 8ec98a6d-d411-4ecb-b1eb-6e650290fe87 koussayzayani8@gmail.com"

### 4. Staff Send (D-01 D-10)
who: agent
action: Open `https://dashboard.vamostaxi.site`. Sign in. Support rail. Open the new ticket. Type a reply. Send.
expected: overlay shows the staff bubble. No new chrome. From is `TKT-{id}@replies.vamostaxi.site` (board id). Plus-token still matches old Replies.
result: pass
reported: "From/Reply-To TKT-8EC98A6D@replies.vamostaxi.site. Worker vamos 23e088fe."

### 5. info@ copy bar (D-09 D-10)
who: Koss
action: Check `info@` Gmail. Agent does not open Gmail.
expected: contact intake + staff Send BCC only. Matched inbound is not forwarded to info@.
result: pass
reported: "Owner 2026-09-18: info@ inbox not created yet — mark as pass for now. Do not block Phase 16 on creating that mailbox."

### 6. Gmail Reply with image + PDF + script text (D-11 D-14 D-16 INB-01)
who: Koss
action: In Gmail, Reply to the staff mail. Attach one image and one PDF. Body includes the exact text `<script>alert(1)</script>`. Send. Tell the agent “sent”.
expected: same ticket (INB-01). Agent does not open Gmail.
result: pass
reported: "INB-01 live: same ticket 8ec98a6d… status responded, 4 messages, jpeg+PDF kept. Script string was not in that Reply; XSS is test 7."

### 7. Dashboard confirm after sent (D-15 D-14 D-16)
who: agent, only after Koss says sent
action: Refresh/focus dashboard Support. Open the same ticket overlay. Click the PDF button.
expected: new customer bubble on the same ticket. Script text is escaped (not executed). Image and PDF are thread buttons. Nested overlay: pages only, scroll, no PDF viewer chrome.
result: pass
reported: "Owner shot 2026-09-18 14:34 Zurich: customer bubble shows Body must be exactly <script>alert(1)</script> as text. No alert. jpeg button on that bubble."

### 8. Closed → Reply → Responded (D-13)
who: agent Closes; Koss Replies; agent confirms
action: Agent clicks Close Ticket. Koss Replies again in Gmail (say “sent”). Agent confirms overlay.
expected: Closed then inbound Reply becomes Responded. Same ticket.
result: pending
awaiting: user

### 9. No-token drop (D-14)
who: Koss (or throwaway)
action: Send mail to an address on `replies.vamostaxi.site` with no `ticket+{32hex}` token, no `TKT-{8hex}`, and no RFC In-Reply-To match.
expected: board does not gain a ticket; existing tickets do not append.
result: pending
awaiting: user

### 10. info@ inbound not forwarded (D-09 D-10)
who: Koss
action: Confirm `info@` after steps 6–9.
expected: still only intake + staff BCC. No inbound customer copy.
result: pass
reported: "Owner 2026-09-18: info@ inbox not created yet — mark as pass for now. Same mailbox as test 5."

## Summary

total: 10
passed: 8
issues: 0
pending: 2
skipped: 0
blocked: 0

## Gaps

[]
