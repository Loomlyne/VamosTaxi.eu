# Phase 5 — owner dashboard checks (facts, 2026-09-04)

Do not re-click dashboards. 05-24 is skipped. This file is the record.

## Confirm email

- Confirm email: **ON**. Do not `config push`.
- Source: live check 2026-09-04 vs 2026-08-30 record.

## Send Email Hook

- Send Email Hook: **On**.
- URI: `/api/auth/email-hook`
- GET → 405
- Unsigned POST → 401 empty
- From: `noreply@vamostaxi.site` via **Cloudflare Email** (not Resend)
- Resend: `vamostaxi.site` is verified; auth mail is not Resend.

## Turnstile

- Contact (`/contact`): **live** (05-27).
- Partner Turnstile: **dead** (page 404; widget unused).

## Partner

- `/partner` and `/become-a-partner`: **404**. No DC file. No route.
- `partner_applications` table: dropped in leftover 05-31 (hosted apply is a checkpoint).
- 05-19 was never executed. Do not run it.

## Optional (not a gate)

- Inbox proof of one branded signup. Skip unless asked.

## Still owner, not this file

- 05-27 contact UAT — do not re-submit from the agent.
- 05-28 stays gated on that UAT.
- Staff JWT → `/api/staff/me` needs the owner's Gmail sign-in.
