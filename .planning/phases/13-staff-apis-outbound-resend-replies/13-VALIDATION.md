---
phase: 13
slug: staff-apis-outbound-resend-replies
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-09-15
---

# Phase 13 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.1.11 (`apps/web`, `packages/emails`); pgTAP via `pnpm db:test` (schema already covered — no migration this phase) |
| **Config file** | `apps/web/vitest.config.ts` (`lib/**/*.test.ts`); `packages/emails/vitest.config.ts` (`src/**/*.test.ts(x)`) |
| **Quick run command** | `pnpm --filter web exec vitest run lib/forms/notify.test.ts lib/ops/ticket-mail.test.ts lib/ops/tickets-map.test.ts lib/ops/tickets-write.test.ts` |
| **Full suite command** | `pnpm test:unit` (includes emails package tests) |
| **Estimated runtime** | ~30 seconds |

`apps/web` vitest `include` is `lib/**/*.test.ts` only — **do not** put Wave 0 tests under `apps/web/tests/unit/` unless the config is expanded.

---

## Sampling Rate

- **After every task commit:** Run `pnpm --filter web exec vitest run lib/forms/notify.test.ts lib/ops/ticket-mail.test.ts lib/ops/tickets-map.test.ts lib/ops/tickets-write.test.ts`
- **After every plan wave:** Run `pnpm --filter web test` and `pnpm --filter @vamos/emails test`
- **Before `$gsd-verify-work`:** Full suite must be green (`pnpm test:unit`)
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 13-W0-01 | 00 | 0 | RPLY-01 | T-13-01 | Empty / closed reply never calls Resend | unit | `pnpm --filter web exec vitest run lib/ops/tickets-write.test.ts` | ❌ W0 | ⬜ pending |
| 13-W0-02 | 00 | 0 | RPLY-01 | T-13-02 | Persist GET `message_id`, not UUID / minted id | unit | `pnpm --filter web exec vitest run lib/ops/tickets-write.test.ts lib/ops/ticket-mail.test.ts` | ❌ W0 | ⬜ pending |
| 13-W0-03 | 00 | 0 | RPLY-01 | T-13-03 | Fail closed on Resend error / missing GET id — no insert, not `replied` | unit | `pnpm --filter web exec vitest run lib/ops/tickets-write.test.ts lib/forms/notify.test.ts` | ⚠️ partial | ⬜ pending |
| 13-W0-04 | 00 | 0 | RPLY-02 | T-13-04 | `bcc: info@vamostaxi.site`; `to` is customer only; no EMAIL | unit | `pnpm --filter web exec vitest run lib/forms/notify.test.ts lib/ops/tickets-write.test.ts` | ⚠️ partial | ⬜ pending |
| 13-W0-05 | 00 | 0 | RPLY-01 | T-13-05 | Staff HTML includes name + booking_ref; escaped; `Re:` ack subject | unit | `pnpm --filter @vamos/emails exec vitest run src/contact.test.ts` | ⚠️ partial | ⬜ pending |
| 13-W0-06 | 00 | 0 | D-03 | — | Confirmation + layout wordmark PNG + `#FDC20B` bar; no Arial; no yellow-50 | unit | `pnpm --filter @vamos/emails test` | ❌ W0 | ⬜ pending |
| 13-W0-07 | 00 | 0 | D-07 / D-12 | T-13-06 | Overlay send error is generic; four languages; `rejectStaffReply` does not block | unit / grep | `pnpm --filter web exec vitest run lib/ops/tickets-map.test.ts` | ⚠️ invert tests | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

Planner must replace `13-W0-*` IDs with real `{plan}-{task}` IDs and keep an `<automated>` command on every implementation task. Wave 0 creates the missing test files listed below before send-path code changes.

---

## Wave 0 Requirements

- [ ] `apps/web/lib/ops/tickets-write.test.ts` — mock `asStaff` + Resend send/get; covers empty, closed, fail-closed, GET persist, BCC, Reply-To, no EMAIL (RPLY-01, RPLY-02)
- [ ] `apps/web/lib/forms/notify.test.ts` — add GET helper tests; keep fallback tests (D-06, D-08)
- [ ] `apps/web/lib/ops/tickets-map.test.ts` — invert/remove `rejectStaffReply` (D-12)
- [ ] `apps/web/lib/ops/ticket-mail.test.ts` — `threadHeaders` without minted Message-ID (RPLY-01)
- [ ] `packages/emails/src/contact.test.ts` — name / booking_ref / four locales / escape (D-04)
- [ ] `packages/emails/src/ConfirmationEmail.test.tsx` — `wordmark-email.png` (D-03)
- [ ] Overlay `sendError` four languages — grep `app/ops/OpsSupportTicket.dc.html` + `app/vamos-i18n-dict.js` (D-07)

No new test framework. No pgTAP migration unless an index is added (not required to send).

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Dispatcher Send → customer Gmail thread continues | RPLY-01 | Real Gmail threading needs Resend-assigned RFC ids; mocks cannot prove SES Message-ID | After automated suite is green: send via Resend `delivered@resend.dev` first, then one owner inbox. Confirm `Re:` subject, plus-address Reply-To, From `noreply@vamostaxi.site`. |
| `info@vamostaxi.site` receives BCC of staff reply | RPLY-02 | Inbox delivery is outside unit mocks | Same send as above; confirm BCC copy at `info@`; confirm customer `To` is only the customer. |

Live MX / inbound webhook are **out of this phase**. Do not change DNS to prove these.

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
