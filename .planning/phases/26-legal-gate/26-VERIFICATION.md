---
phase: 26-legal-gate
verified: 2026-09-23T21:27:25Z
status: passed
score: 9/9 must-haves verified
---

# Phase 26: Legal gate Verification Report

**Phase Goal:** Hard-false measurement flag and empty Meta TBC slots on the banner, cookies page, and privacy page. The gate staying closed is the goal. A missing owner sentence is not a gap.
**Verified:** 2026-09-23T21:27:25Z
**Status:** passed

Re-checked on `gsd/phase-26-legal-gate` in `.worktrees/phase-26`. Did not trust the earlier 01:24 run. Did not edit product code. Did not write a legal sentence. Did not update STATE.md or ROADMAP.md.

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | The measurement flag stays false and is not derived from copy, env, or a pill scan. | ✓ VERIFIED | `legal-gate.ts:6` is `export const META_LEGAL_GATE_OPEN = false as const`. No `process.env`, `fetch(`, or pill scan. One assignment under `apps/web`. |
| 2 | `metaMeasurementAllowed()` is true only for `META_LEGAL_GATE_OPEN === true`. | ✓ VERIFIED | Comparison still on line 11. `a0b3400b` added only the `@ts-expect-error TS2367` comment. Standalone `tsc --strict` exits 0. The same file without that comment is TS2367. The const was not widened. |
| 3 | No legal sentence is placed in a slot, a dictionary, or a test assertion message. | ✓ VERIFIED | Wrappers are one `PendingSlot` each. Labels are `Meta banner line`, `Meta cookie row`, `Meta privacy line`. No `.!?`. i18n not in the phase diff. |
| 4 | `CONSENT_POLICY_VERSION` stays `2026-09-12`. | ✓ VERIFIED | `policy.ts:5` exact assignment. `policy.ts` is not in `origin/main...HEAD`. |
| 5 | The seven named pins exist and pass. | ✓ VERIFIED | `legal-gate.test.ts` last commit is `199fa60e` (not loosened after the slots landed). Titles: necessary-cookies-only remains, policy version unchanged, no fbevents.js, flag off, marketing stays false, slots exist, no sentence. |
| 6 | An Accept stored under `2026-09-12` still records marketing false. | ✓ VERIFIED | `bind.ts:23` `marketing: false`. `bind.ts:45` defaults `policyVersion` to `CONSENT_POLICY_VERSION`. `bind.ts` is not in the phase diff. No `UPDATE` of `consent_log`. |
| 7 | Banner keeps Necessary cookies only and one empty Meta banner line slot. | ✓ VERIFIED | `CookieBanner.tsx:178-181`. Slot sits between the `h2` and `p.vt-ck-body`. Not a control. Unmounts with `hidden`. |
| 8 | Cookies page has one Meta cookie row; three duration pills stay. Privacy page has one Meta privacy line; date pills stay blank. | ✓ VERIFIED | Cookies slot after the table, outside the 3-row array (`cookies/page.tsx:120-122`). Privacy slot between the two `#cookies` paragraphs (`privacy/page.tsx:358-362`). Duration, UID, photo, Analytics provider, and Analytics region pills unchanged. |
| 9 | Neither the pixel nor a Purchase call can run. | ✓ VERIFIED | No product call site for `metaMeasurementAllowed`. No `fbevents.js`, `fbq(`, `connect.facebook.net`, `facebook.com/tr`, `graph.facebook.com`, pixel id, or `META_CAPI_ACCESS_TOKEN` outside the test needle. No `pixel.tsx`, `capi.ts`, `purchase.ts`, or `app/api/meta/`. |

**Score:** 9/9 truths verified

Roadmap success criteria 1–4 hold for this phase: the flag is off while the owner lines are missing, an old Accept does not turn Meta on, this phase wrote no sentences, and the must-nots (no `fbevents.js`, no Purchase, no quote/pay/confirmation edit, no invented legal copy) hold. Bumping `CONSENT_POLICY_VERSION` is not this phase. D-12 keeps `2026-09-12` until his four-language lines are live. That missing paste is the closed gate, not a gap.

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `apps/web/lib/meta/legal-gate.ts` | Hard-false gate | ✓ EXISTS + SUBSTANTIVE | Exports `META_LEGAL_GATE_OPEN` and `metaMeasurementAllowed`. Literal false. Comparison kept. |
| `apps/web/lib/meta/legal-gate.test.ts` | Seven pins for META-01 and META-02 | ✓ EXISTS + SUBSTANTIVE | All seven `it()` titles. Not edited after `199fa60e`. |
| `apps/web/components/consent/CookieBanner.tsx` | Empty Meta banner slot | ✓ EXISTS + SUBSTANTIVE | `data-meta-slot="banner"`, label `Meta banner line`. Named `PendingSlot` import. No flag import. No `next/script`. |
| `apps/web/app/[locale]/cookies/page.tsx` | One Meta row pill | ✓ EXISTS + SUBSTANTIVE | `vt-legal-blank--row` only. `data-meta-slot="cookies"`. One `Meta cookie row`. |
| `apps/web/app/[locale]/privacy/page.tsx` | Empty Meta privacy slot | ✓ EXISTS + SUBSTANTIVE | `vt-legal-blank` only. `data-meta-slot="privacy"`. Inside `#cookies`. |
| `apps/web/components/consent/CookieBanner.css` | `.vt-ck-meta` | ✓ EXISTS + SUBSTANTIVE | Logical margin only. No transition. No physical margin. |
| `apps/web/components/legal/LegalPage.css` | Blank wrappers | ✓ EXISTS + SUBSTANTIVE | `.vt-legal-blank--row` and `.vt-legal-blank`. `.vt-legal-meta` not reused. |

**Artifacts:** 7/7 verified

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `legal-gate.test.ts` | `legal-gate.ts` | import of the flag and `metaMeasurementAllowed` | ✓ WIRED | Line 9. `flag off` asserts both false and the `=== true` source text. |
| `legal-gate.test.ts` | `policy.ts` | `readFileSync` pin | ✓ WIRED | Exact `2026-09-12` assignment. This phase does not edit `policy.ts`. |
| `legal-gate.test.ts` | `bind.ts` | `readFileSync` pin of `marketing: false` | ✓ WIRED | This phase does not edit `bind.ts`. |
| `CookieBanner.tsx` | `PendingSlot` | named import from `@/components/legal` | ✓ WIRED | Line 14. Label is text, not a sentence. |
| `cookies/page.tsx` | `LegalPage.css` | `vt-legal-blank--row` | ✓ WIRED | Class present. No new CSS import on the page. |
| `legal-gate.test.ts` | banner / cookies / privacy | `slots exist` and `no sentence` | ✓ WIRED | Pins the three hooks. Wrappers are div plus one `PendingSlot`. |

**Wiring:** 6/6 connections verified

## Requirements Coverage

| Requirement | Source | Status | Blocking Issue |
|-------------|--------|--------|----------------|
| META-01 | 26-01 and 26-02 | ✓ SATISFIED | Pixel and Purchase stay off. Empty slots on the three surfaces. No drafted sentences. Flag is the literal false. |
| META-02 | 26-01 and 26-02 | ✓ SATISFIED | Version stays `2026-09-12`. Accept still records `marketing: false`. An old Accept does not turn Meta on. The Zurich bump waits on his live lines (D-12). Not a gap. |

META-03 through META-14 belong to phases 27–29. They are not gaps in this phase.

**Coverage:** 2/2 phase-owned requirements satisfied

## Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `apps/web/lib/meta/legal-gate.ts` | 10 | `@ts-expect-error TS2367` | ℹ️ Info | Closed-gate comparison. `a0b3400b` did not widen the flag. `tsc --strict` passes with the directive and fails TS2367 without it. |

`26-REVIEW.md` still says `status: issues` for WR-01. That review predates `a0b3400b`. The defect it named is fixed. Not a remaining gap.

**Anti-patterns:** 1 info, 0 blockers

## Human Verification Required

None. This phase is a source lock, not a live pixel. D-17 forbids deploy. A missing owner sentence keeps the gate closed. It is not a human checkpoint and not a gap.

## Gaps Summary

**No gaps found.** Phase goal achieved. The gate stays closed.

## Verification Metadata

**Verification approach:** Goal-backward from the v1.3 roadmap Phase 26 success criteria and both plans' must-haves
**Must-haves source:** `26-01-PLAN.md` and `26-02-PLAN.md` frontmatter, plus ROADMAP Phase 26 on dirty main (not this branch's old ROADMAP)
**Automated checks:** vitest 5 files, 34 passed, 0 failed, re-run 2026-09-23T21:26:47Z from this worktree via the main `apps/web` vitest binary. Files: `lib/meta/legal-gate.test.ts`, `lib/consent/record.test.ts`, `lib/legal/extract-no-invent.test.ts`, `lib/security/headers.test.ts`, `components/consent/banner-contract.test.ts`.
**Typecheck:** standalone `tsc --strict` on `legal-gate.ts` exits 0. Scratch copy without `@ts-expect-error` is TS2367.
**Human checks required:** 0
**Phase diff vs `origin/main`:** the two `lib/meta` files, the five slot files, and phase paper. No `policy.ts`, `bind.ts`, i18n, quote, pay, or confirmation path.

---
*Verified: 2026-09-23T21:27:25Z*
*Verifier: Hermes (subagent)*
