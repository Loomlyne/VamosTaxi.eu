---
phase: 06-ops-reference-data-content-console
plan: 05
subsystem: ops
tags: [invite, totp, staff-auth, mfa-enrol]
requires:
  - phase: 06-ops-reference-data-content-console
    provides: "06-04 staff sign-in / MFA challenge / ops-fixtures"
provides:
  - "POST /api/staff/invite — aal2-admin gated, service-role after proof, writes public.staff"
  - "/ops/accept-invite — set password then mandatory TOTP enrol (option-a)"
  - "opsInviteRedirectUrl — pinned redirect, never from request Host"
affects: [06-17]
tech-stack:
  added: []
  patterns:
    - "requireAdminClaims before constructing the service-role client"
    - "TOTP enrol via Server Actions (no browser Supabase client)"
key-files:
  created:
    - apps/web/app/[locale]/(ops)/api/staff/invite/route.ts
    - apps/web/app/api/staff/invite/route.ts
    - apps/web/app/[locale]/(ops)/ops/accept-invite/page.tsx
    - apps/web/components/ops/OpsAcceptInvite.tsx
    - apps/web/components/ops/OpsTotpEnrol.tsx
    - apps/web/lib/ops/invite.ts
    - apps/web/tests/integration/ops-invite-accept.spec.ts
  modified:
    - apps/web/components/ops/index.ts
    - apps/web/i18n/messages/en.json
    - apps/web/i18n/messages/de.json
    - apps/web/i18n/messages/fr.json
    - apps/web/i18n/messages/ar.json
key-decisions:
  - "Task 1: option-a (one route, three steps, StepIndicator). Full name not collected at accept — left for 06-17 profile."
  - "Task 4: deferred. Local Inbucket is the mailer. Real non-@example invites stay blocked until SMTP/Send Email hook is configured."
  - "No browser Supabase client. mfa.enroll / unenroll / challenge / verify run as Server Actions on accept-invite/page.tsx."
patterns-established:
  - "opsInviteRedirectUrl() chooses origin from DEPLOY_ENV only; never request.host"
  - "inviteUserByEmail data.invited_role is cosmetic; public.staff insert is authoritative"
  - "Insert failure deletes the just-created auth user"
requirements-completed: [OPS-09, AUTH-05]
completed: 2026-09-01
---

# Plan 06-05 Summary — Staff invite + accept-invite + mandatory TOTP enrol

**Task 1 decision:** option-a. Full name is not collected at step 1; 06-17 owns the profile screen.

## Task 2 — invite route

- `POST /api/staff/invite`: `requireAdminClaims()` first; service-role client constructed after, inside the handler.
- `opsInviteRedirectUrl()` → `{origin}/ops/accept-invite`. Staging/production origin `https://dashboard.vamostaxi.site`. Local `http://127.0.0.1:3000`.
- Body: only `email` + `role`. `assertInviteRole` narrows to dispatcher|admin.
- Writes `public.staff` itself (`invited_by` = caller sub). Insert failure → `deleteUser`.
- Response `{ ok: true }` — no user id, no token.

**Error-code map (06-17 must reuse):**

| code | HTTP | when |
|---|---|---|
| (none, `{ ok: false }`) | 403 | caller is not aal2 admin |
| `invalid_input` | 400 | body shape / email / role |
| `invite_delivery_unconfigured` | 429 | Supabase 429 / `over_email_send_rate_limit` |
| `already_invited` | 409 | `email_exists` / `user_already_exists` / 422 |
| `invite_failed` | 500 | other invite errors |
| `staff_row_failed` | 500 | staff insert failed (auth user deleted) |

**Deviation:** extra `apps/web/app/api/staff/invite/route.ts` re-exports `POST` so the unprefixed `/api/staff/invite` URL exists (locale tree would otherwise be `/{locale}/api/staff/invite`).

## Task 3 — accept-invite + TOTP

- One URL `/ops/accept-invite` (already middleware-exempt). OpsAuthCard, no OpsShell.
- Step 1: password + confirm via `auth.updateUser`. No full name.
- Step 2+3: one screen — QR (`totp.qr_code` as `<img>`), secret as selectable `.vt-dir-keep` text, 6-digit confirm.
- Abandoned factor: `listFactors` → `mfa.unenroll` unverified totp → `mfa.enroll`.
- After verify, `asStaff` + `staff_claim_invite()`. Claim failure is a non-blocking Alert; navigation still goes to `/ops`.
- Spec `ops-invite-accept.spec.ts` `@ops-invite` component-1440. Throws `run pnpm db:start && pnpm db:reset from packages/db` when local Auth/keys are missing (does not `skip(`).

## Task 4 — Resend SMTP (OPEN / deferred)

Mechanism is built against local Inbucket. D-24: Resend as custom SMTP (or Send Email hook) is the owner gate for the first real non-`@example` staging invite. Not configured. Resume signal still `"smtp configured"` + mechanism, or `"deferred"`.

Staff-invite email copy remains an ADR-014 owner item — not invented. In-app 429 copy is `ops.auth.invite-delivery-unconfigured`.

## Self-check

- `pnpm i18n:check` passed (1701 keys)
- `pnpm check:public-env` passed (source scan; no `.open-next/assets` in worktree)
- Grep gates: `requireAdminClaims` before `SERVICE_ROLE`; invite.ts host/url grep 0; `invited_role` only in `data:`; no QR library; `mfa.unenroll` + `vt-dir-keep` in OpsTotpEnrol; yellow-pill grep 0
- `pnpm typecheck` / `pnpm build` / Playwright: worktree has no `node_modules` (do not `pnpm install`). Executor did not spawn `next dev`. Integration proof remains: run `pnpm db:start && pnpm db:reset from packages/db` then the Playwright command from a tree that has `apps/web/node_modules`.
