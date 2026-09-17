---
phase: 14
slug: inbound-webhook
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-09-17
---

# Phase 14 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.1.11 (`apps/web`). pgTAP only after owner-apply (schema plan). |
| **Config file** | `apps/web/vitest.config.ts` (`lib/**/*.test.ts`) |
| **Quick run command** | `pnpm --filter web exec vitest run lib/ops/ticket-mail.test.ts lib/ops/ticket-inbound.test.ts lib/ops/ticket-inbound-files.test.ts` |
| **Full suite command** | `pnpm test:unit` |
| **Estimated runtime** | ~25 seconds |

`apps/web` vitest **excludes** `tests/integration/**` and `**/*.spec.ts` and sets `passWithNoTests: true`. Do **not** put `<automated>` on those paths.

Do **not** import `app/api/webhooks/resend/route.ts` in vitest (alias / db-fences). Source-read the file.

---

## Sampling Rate

- **After every task commit:** Run the quick command above (skip files.test.ts until that file exists).
- **After every plan wave:** `pnpm --filter web test`
- **Before `/gsd:verify-work`:** `pnpm test:unit` green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

Planner must keep an `<automated>` on every implementation task. Remap this table if plan IDs change.

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 14-01-01 | 01 | 1 | INB-02 D-01 D-02 D-06 D-07 D-12 | T-14-02 T-14-03 | Wave 0 tests name match-order / drop / strip / idempotency | unit | `pnpm --filter web exec vitest run lib/ops/ticket-mail.test.ts lib/ops/ticket-inbound.test.ts` | ❌ W0 | ⬜ pending |
| 14-02-01 | 02 | 2 | D-01 D-06 | T-14-05 | `stripQuotedHistory` + `received_for` token + RFC header parse | unit | `pnpm --filter web exec vitest run lib/ops/ticket-mail.test.ts` | ❌ | ⬜ pending |
| 14-03-01 | 03 | 2 | INB-02 D-01 D-02 D-04 D-05 D-07 D-12 | T-14-02 T-14-03 | ingest: plus then RFC, never From, closed→responded, unmatched no message | unit | `pnpm --filter web exec vitest run lib/ops/ticket-inbound.test.ts` | ❌ | ⬜ pending |
| 14-04-01 | 04 | 2 | D-08 | T-14-04 | SQL `support_message_files` in repo; no `db push` | source | `test -f packages/db/supabase/migrations/*support_message_files.sql` | ❌ | ⬜ pending |
| 14-05-01 | 05 | 3 | D-08 D-09 D-10 | T-14-04 T-14-06 | MIME/size/count; R2 put keys; not-kept line | unit | `pnpm --filter web exec vitest run lib/ops/ticket-inbound-files.test.ts` | ❌ | ⬜ pending |
| 14-06-01 | 06 | 4 | D-03 INB-02 | T-14-01 | Route still Svix; always GET receiving; source-read | grep + unit | `pnpm --filter web exec vitest run lib/ops/ticket-inbound.test.ts` | ⚠️ route exists | ⬜ pending |
| 14-06-02 | 06 | 4 | D-08 D-09 | T-14-04 | Staff GET file `withStaff`; no public route | source-read | grep `withStaff` on files route | ❌ | ⬜ pending |
| 14-07-01 | 07 | 5 | D-08 | — | Owner MCP apply + R2 bucket bind | human | — | ❌ | ⬜ pending |

---

## Wave 0 Requirements

- [ ] `apps/web/lib/ops/ticket-inbound.test.ts` — ingest mocks: plus-token, `received_for`, RFC, From spoof drop, unmatched no insert, idempotent `email_id`, closed→responded, empty body generic line
- [ ] `apps/web/lib/ops/ticket-mail.test.ts` — `stripQuotedHistory`, html `<script>` → no tag, `received_for` token
- [ ] `apps/web/lib/ops/ticket-inbound-files.test.ts` — allow jpeg, reject zip, 5MiB, max 3 (may land with plan 05; Wave 0 can stub the cases)

No new test framework. No Hyperdrive in unit tests.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Customer Reply-in-Gmail appends | INB-02 | Needs receiving MX | **Phase 16.** This phase uses signed JSON fixtures only. |
| Unsigned POST 4xx on **deployed** staging | D-03 | Needs live Worker | Phase 16 UAT. Unit proves verify helper + source-read. |
| Staff opens image in `#support` | D-09 | Overlay chrome | **Phase 15.** This phase proves staff GET + R2 bytes. |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 / human-apply
- [x] Sampling continuity: no 3 consecutive tasks without automated verify (14-07 is owner-apply)
- [x] Wave 0 covers missing ingest/strip tests
- [x] No watch-mode flags
- [x] Feedback latency < 30s
- [x] `nyquist_compliant: true`

**Approval:** pending plan review
