---
phase: 16
slug: staging-mx-end-to-end-uat
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-09-18
---

# Phase 16 — Validation Strategy

> Per-phase validation contract. DNS and Gmail have no unit doubles.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest (`apps/web`) |
| **Config file** | `apps/web/vitest.config.ts` (`lib/**/*.test.ts`) |
| **Quick run command** | `pnpm --filter web exec vitest run lib/ops/ticket-mail.test.ts lib/ops/tickets-write.test.ts lib/ops/phase-13-must-not.test.ts` |
| **Full suite command** | `pnpm test:unit` |
| **Estimated runtime** | ~25 seconds (JS); DNS `dig` seconds; UAT human |

`apps/web` vitest **excludes** `tests/integration/**` and `**/*.spec.ts` and sets `passWithNoTests: true`. Do **not** point `<automated>` at those paths.

Do **not** import `app/api/webhooks/resend/route.ts` in vitest.

---

## Sampling Rate

- **After every JS task commit:** Quick command above
- **After DNS tasks:** `dig MX replies.vamostaxi.site` and `dig MX vamostaxi.site` and `dig MX vamostaxi.eu`
- **After every plan wave that touched JS:** `pnpm --filter web test`
- **Before `/gsd:verify-work`:** `pnpm test:unit` green + 16-UAT
- **Max feedback latency:** 30 seconds for unit

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 16-01-01 | 01 | 1 | D-01 D-04 | T-16-03 | `staffSender` false = noreply From + plus Reply-To; true branch string present; flag still false | unit | `pnpm --filter web exec vitest run lib/ops/ticket-mail.test.ts lib/ops/phase-13-must-not.test.ts` | ⚠️ extend | ⬜ pending |
| 16-02-01 | 02 | 2 | D-03 D-05 D-06 | T-16-01 T-16-02 | `replies.` MX is Resend hostname from API; apex MX unchanged; `.eu` MX unchanged | dig + MCP | `dig MX replies.vamostaxi.site; dig MX vamostaxi.site; dig MX vamostaxi.eu` | n/a | ⬜ pending |
| 16-03-01 | 03 | 3 | D-01 D-04 | T-16-03 | Flag true only after Verified readback; tests expect plus From | unit | quick command | ⚠️ edit | ⬜ pending |
| 16-03-02 | 03 | 3 | D-02 D-17 | — | Contact still EMAIL; no `env.production`; Worker name `vamos` | source-read | `phase-13-must-not` D-08 + wrangler grep | ✅ | ⬜ pending |
| 16-04-01 | 04 | 4 | INB-01 D-11–D-16 | T-16-05 T-16-06 | Live Gmail Reply appends; Closed→Responded; no-token drop; script escaped; image+PDF | manual | — | 16-UAT | ⬜ pending |

---

## Wave 0 Requirements

- [ ] `apps/web/lib/ops/ticket-mail.test.ts` — `staffSender` false path; source-read true-branch From template
- [ ] `apps/web/lib/ops/phase-13-must-not.test.ts` — still `REPLIES_DOMAIN_VERIFIED = false` until plan 03

Existing ingest/escape/unsigned tests stay. Do not re-implement Phase 14 Wave 0.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Customer Reply-in-Gmail appends | INB-01 D-12 | Needs receiving MX + real Gmail | 16-UAT: new `/contact` → staff Send → Koss Reply |
| Apex MX unchanged | D-05 | Public DNS | `dig MX vamostaxi.site` empty (or unchanged vs pre-cut) |
| `.eu` untouched | D-17 | Public DNS | `dig MX vamostaxi.eu` still `mail.vamostaxi.eu` |
| Unsigned 4xx | D-07 | Live Worker | `curl POST` unsigned → 400 |
| Closed → Responded | D-13 | Live ticket | Close, then Reply |
| No-token drop | D-14 | Live mail | Mail to `replies.` without token/RFC |
| `<script>` escaped | D-14 | Live + overlay | Reply body contains `<script>`; bubble text |
| Image + PDF | D-16 | Live attachments | Preview + filename download |
| `info@` copy bar | D-10 | Gmail | Koss checks intake + staff BCC |
| Rollback | D-08 | Only if inbound fails | Restore SES MX on `replies.` |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 / human UAT
- [x] Sampling continuity: no 3 consecutive JS tasks without automated verify (16-02 is dig; 16-04 is UAT)
- [x] Wave 0 covers staffSender before flag flip
- [x] No watch-mode flags
- [x] Feedback latency < 30s for unit
- [x] `nyquist_compliant: true`

**Approval:** pending plan review
