---
phase: 26
slug: legal-gate
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-09-24
---

# Phase 26 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 4.1.11 |
| **Config file** | `apps/web/vitest.config.ts` |
| **Quick run command** | `test -f apps/web/lib/meta/legal-gate.test.ts && pnpm --dir apps/web exec vitest run lib/meta/legal-gate.test.ts` |
| **Full suite command** | `pnpm --dir apps/web test` |
| **Estimated runtime** | ~15 seconds for the quick pin; full suite longer |

The `test -f` is required. A missing vitest path exits 0 when `passWithNoTests` is true. A bare vitest command is not proof.

Do not point `<automated>` at `apps/web/tests/visual/legal-privacy-cookies.spec.ts`. That file is excluded from the vitest include list.

---

## Sampling Rate

- **After 26-01 task 1:** `test -f apps/web/lib/meta/legal-gate.test.ts && pnpm --dir apps/web exec vitest run lib/meta/legal-gate.test.ts -t "necessary-cookies-only remains|policy version unchanged|no fbevents.js|flag off|marketing stays false"`
- **After 26-01 task 2:** that five-pin command still exits 0. `slots exist` and `no sentence` must exit non-zero. Do not run the unfiltered file here. A `-t` filter that matches nothing exits 0 under `passWithNoTests`, so the plan's `!` verify fails unless those two tests ran and failed.
- **After 26-02 tasks 2 and 3:** `test -f apps/web/lib/meta/legal-gate.test.ts && pnpm --dir apps/web exec vitest run lib/meta/legal-gate.test.ts`
- **After plan 02:** `test -f apps/web/lib/meta/legal-gate.test.ts && pnpm --dir apps/web exec vitest run lib/meta/legal-gate.test.ts lib/consent/record.test.ts lib/legal/extract-no-invent.test.ts lib/security/headers.test.ts components/consent/banner-contract.test.ts`
- **Before `/gsd:verify-work`:** Full `pnpm --dir apps/web test` plus the `test -f` command. The full suite alone does not prove the new file exists. The unfiltered pin file is green only after 26-02.
- **Max feedback latency:** 30 seconds for the quick pin

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 26-01-01 | 01 | 0 | META-01 | T-26-01 | `slots exist` is present and red until the wrappers land | unit | `test -f apps/web/lib/meta/legal-gate.test.ts && pnpm --dir apps/web exec vitest run lib/meta/legal-gate.test.ts -t "flag off" && ! pnpm --dir apps/web exec vitest run lib/meta/legal-gate.test.ts -t "slots exist"` | ❌ W0 | ⬜ pending |
| 26-01-02 | 01 | 0 | META-01 | T-26-01 | `no sentence` is present and red until each wrapper is only a blank name | unit | `test -f apps/web/lib/meta/legal-gate.test.ts && pnpm --dir apps/web exec vitest run lib/meta/legal-gate.test.ts -t "flag off" && ! pnpm --dir apps/web exec vitest run lib/meta/legal-gate.test.ts -t "no sentence"` | ❌ W0 | ⬜ pending |
| 26-01-03 | 01 | 0 | META-01 | T-26-04 | Banner title stays `necessary-cookies-only` | unit | same file, `-t "necessary-cookies-only remains"` | ❌ W0 | ⬜ pending |
| 26-01-04 | 01 | 0 | META-02 | T-26-04 | `CONSENT_POLICY_VERSION` stays `2026-09-12` | unit | same file, `-t "policy version unchanged"` | ❌ W0 | ⬜ pending |
| 26-01-05 | 01 | 0 | META-01 | T-26-02 | No `fbevents.js`, no pixel host, no pixel id | unit | same file, `-t "no fbevents.js"` | ❌ W0 | ⬜ pending |
| 26-01-06 | 01 | 0 | META-01 | T-26-03 | `metaMeasurementAllowed()` is hard false | unit | same file, `-t "flag off"` | ❌ W0 | ⬜ pending |
| 26-01-07 | 01 | 0 | META-02 | T-26-04 | `bind.ts` still records `marketing: false` | unit | same file, `-t "marketing stays false"` | ❌ W0 | ⬜ pending |

Named `it()` titles the Wave 0 file must use: `slots exist`, `no sentence`, `necessary-cookies-only remains`, `policy version unchanged`, `no fbevents.js`, `flag off`, `marketing stays false`.

Plan 01 writes all seven titles. At the end of 26-01, `slots exist` and `no sentence` are RED because the wrappers are absent. That red is required. Do not skip, delete, or weaken them. Plan 02 turns those two green. The full-file command is the 26-02 gate, not the 26-01 gate.

| 26-02-01 | 02 | 1 | META-01 | T-26-01 | Banner slot only; title stays necessary-cookies-only | unit | `test -f apps/web/lib/meta/legal-gate.test.ts && pnpm --dir apps/web exec vitest run lib/meta/legal-gate.test.ts -t "necessary-cookies-only remains"` | after 26-01 | ⬜ pending |
| 26-02-02 | 02 | 1 | META-01 | T-26-01 | Cookies and privacy slots; slots exist and no sentence green | unit | `test -f apps/web/lib/meta/legal-gate.test.ts && pnpm --dir apps/web exec vitest run lib/meta/legal-gate.test.ts -t "slots exist|no sentence"` | after 26-01 | ⬜ pending |
| 26-02-03 | 02 | 1 | META-01, META-02 | T-26-02 | Full pin file plus the four existing regression files | unit | `test -f apps/web/lib/meta/legal-gate.test.ts && pnpm --dir apps/web exec vitest run lib/meta/legal-gate.test.ts lib/consent/record.test.ts lib/legal/extract-no-invent.test.ts lib/security/headers.test.ts components/consent/banner-contract.test.ts` | after 26-01 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `apps/web/lib/meta/legal-gate.test.ts` — pins for META-01 and META-02. Write the pins before claiming the phase green.
- [ ] `apps/web/lib/meta/legal-gate.ts` — hard `false` flag. The test imports it.
- [ ] No new framework. Do not edit `vitest.config.ts`. Do not add `**/*.spec.ts` to `include`.
- [ ] Keep green and do not weaken: `lib/consent/record.test.ts`, `lib/legal/extract-no-invent.test.ts`, `lib/security/headers.test.ts`, `components/consent/banner-contract.test.ts`.

---

## Manual-Only Verifications

All phase behaviors have automated verification. There is no sentence to review by eye. Do not treat a visual pass as opening the legal gate.

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
