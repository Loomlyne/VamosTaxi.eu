---
phase: 16-staging-mx-end-to-end-uat
plan: 02
subsystem: infra
tags: [resend, dns, mx, cloudflare]

requires:
  - phase: 16-staging-mx-end-to-end-uat
    provides: 16-01 false-path lock
provides:
  - replies. sending SPF + return-path MX on send.replies
  - receiving MX copied from Resend (ap-northeast-1 inbound-smtp)
  - docs/ops/replies-mx.md applied section
affects: [16-03, 16-04]

tech-stack:
  added: []
  patterns: [copy Resend DNS records; never guess MX]

key-files:
  created: []
  modified:
    - docs/ops/replies-mx.md

key-decisions:
  - "Resend receiving MX in ap-northeast-1 is inbound-smtp.ap-northeast-1.amazonaws.com — copied, not guessed. Did not invent inbound.resend.com."
  - "Enabled sending+receiving on existing replies.vamostaxi.site. Webhook URL unchanged."
  - "Did not flip REPLIES_DOMAIN_VERIFIED. Sending SPF still pending at apply; 16-03 waits for Verified."

patterns-established:
  - "D-03 copy-from-API wins over the plan wording that MX must not be inbound-smtp"

requirements-completed: [INB-01, D-03, D-05, D-06, D-07, D-08]

duration: 20min
completed: 2026-09-18
---

# Phase 16: 16-02 Summary

**Pointed `replies.vamostaxi.site` sending DNS at Resend (SPF + return-path). Receiving MX already was Resend’s ap-northeast-1 hostname. Flag still false.**

## Performance

- **Duration:** 20 min
- **Started:** 2026-09-18T09:40:00Z
- **Completed:** 2026-09-18T09:50:00Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments

- Resend domain `replies.vamostaxi.site`: sending enabled, receiving enabled. Webhook `https://vamostaxi.site/api/webhooks/resend` reused.
- Cloudflare zone `vamostaxi.site` only: added `send.replies` MX + SPF TXT. Apex MX still empty. `.eu` MX unchanged.
- Receiving MX left as Resend copied value `inbound-smtp.ap-northeast-1.amazonaws.com` (no dual MX, no guessed hostname).
- `REPLIES_DOMAIN_VERIFIED` still false. Sending SPF records pending Resend verify at end of this plan.

## Task Commits

Recorded after this file is committed.

## Files Created/Modified

- `docs/ops/replies-mx.md` — applied records + SES/Resend receiving note + rollback
