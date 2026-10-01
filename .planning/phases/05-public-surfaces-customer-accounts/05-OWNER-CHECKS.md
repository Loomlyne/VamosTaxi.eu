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

## 05-24 sign-up mail checks (closed by phase 27.1's hand-over)

The last part of 05-24 left after the 2026-09-04 record: one real mail per sign-up path reaches the
inbox in the page's language and its link works. The contact-form half belongs to the /contact job.
The owner runs these after the 27.1 deploy (steps in `.planning/phases/27.1-finish-your-account/27.1-HANDOVER.md`).

| Check | Language | Result | Date |
|---|---|---|---|
| Password sign-up on /de/sign-up: "Confirm your email" mail arrives in German, link signs in | de | waiting for the owner | |
| Sign up with a link on /fr/sign-up: mail in French, link signs in, account has the names | fr | waiting for the owner | |
| Sign-in link on /ar/sign-in for a new address: mail in Arabic, link opens "Finish your account" | ar | waiting for the owner | |
| Sign-in link on /sign-in for an existing account: mail in English, link signs in, no finish step | en | waiting for the owner | |

His "done" on these four closes 05-24.
