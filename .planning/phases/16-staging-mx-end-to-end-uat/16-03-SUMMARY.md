---
phase: 16-staging-mx-end-to-end-uat
plan: 03
subsystem: infra
status: blocked
tags: [resend, flag, deploy]

requires:
  - phase: 16-staging-mx-end-to-end-uat
    provides: 16-02 MX applied
provides: []
---

# Phase 16 Plan 03 Summary — STOP at Verified gate

**Not done.** Did not flip `REPLIES_DOMAIN_VERIFIED`. Did not deploy `vamos`.

## Gate

Resend GET `replies.vamostaxi.site` (`430b1d62-f357-4469-ba4f-c81c6320d3cb`) is **`partially_verified`**.

| Record | Name | Status |
| --- | --- | --- |
| DKIM TXT | `resend._domainkey.replies` | verified |
| Receiving MX | `replies` → `inbound-smtp.ap-northeast-1.amazonaws.com` | verified |
| Sending SPF MX | `send.replies` → `feedback-smtp.ap-northeast-1.amazonses.com` | pending |
| Sending SPF TXT | `send.replies` `v=spf1 include:amazonses.com ~all` | pending |

Re-triggered `POST /domains/{id}/verify`. Status stayed `partially_verified`.

## DNS (copied, not guessed)

Authoritative Cloudflare NS (`magdalena.ns.cloudflare.com`) already serve the copied records. Zone Email Routing is **unconfigured / disabled**. Apex MX empty. `.eu` untouched.

SES custom MAIL FROM can stay pending up to 72h after the MX exists. 16-03 must wait for Resend status **`verified`**, then flip + deploy.

## Must not (held)

- Flag still `false` in `ticket-mail.ts`
- No Worker deploy
- No `env.production`
- No push `main`
