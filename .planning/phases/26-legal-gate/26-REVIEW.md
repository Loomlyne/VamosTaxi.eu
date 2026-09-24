---
phase: 26-legal-gate
reviewed: 2026-09-23T21:22:27Z
depth: standard
files_reviewed: 7
files_reviewed_list:
  - apps/web/lib/meta/legal-gate.ts
  - apps/web/lib/meta/legal-gate.test.ts
  - apps/web/components/consent/CookieBanner.tsx
  - apps/web/components/consent/CookieBanner.css
  - apps/web/app/[locale]/cookies/page.tsx
  - apps/web/app/[locale]/privacy/page.tsx
  - apps/web/components/legal/LegalPage.css
findings:
  critical: 0
  warning: 1
  info: 0
  total: 1
status: issues
---

# Phase 26: Code Review Report

**Reviewed:** 2026-09-23T21:22:27Z
**Depth:** standard
**Files Reviewed:** 7
**Status:** issues

## Summary

Reviewed the Phase 26 product diff against `origin/main` (`05154ca6`). The measurement lock holds. The only defect is a type error on the closed-gate comparison that fails `tsc --noEmit` and, with `ignoreBuildErrors` unset, `next build`.

Lock, checked in source and not treated as findings:

- `META_LEGAL_GATE_OPEN` is the literal `false as const`. The only import is the pin test. No product call site.
- Slots are empty labels only: `Meta banner line` between the banner title and body, `Meta cookie row` after the necessary table and outside the rows array, `Meta privacy line` in `#cookies` between the two paragraphs. No sentence in those wrappers.
- Pixel id `1595596972063765` appears only as the forbidden needle in `legal-gate.test.ts`. Product source has no `fbevents.js`, `fbq(`, Graph call, or token read.
- `necessary-cookies-only` remains. `policy.ts`, `bind.ts`, `PendingSlot.tsx`, `laws.css`, and i18n are untouched. `CONSENT_POLICY_VERSION` is still `2026-09-12`.
- `legal-gate.test.ts` was not edited after `199fa60e`. The seven pins were not loosened.

`vitest run lib/meta/legal-gate.test.ts lib/consent/record.test.ts lib/legal/extract-no-invent.test.ts lib/security/headers.test.ts components/consent/banner-contract.test.ts` — 5 files, 34 tests, all passed.

## Narrative Findings (AI reviewer)

### WR-01: Closed-gate comparison does not typecheck

**File:** `apps/web/lib/meta/legal-gate.ts:9`
**Issue:** `META_LEGAL_GATE_OPEN` is `false as const`, so its type is the literal `false`. `META_LEGAL_GATE_OPEN === true` is TS2367 (no overlap). Runtime is still closed (`false === true` is false), and the pin that requires that source text still passes. Project `tsconfig` is `strict: true`, `apps/web` typecheck is `tsc --noEmit`, and `next.config.ts` does not set `typescript.ignoreBuildErrors`. Confirmed with the repo TypeScript 5.9.3 under the same strict flags.
**Fix:** Keep the literal `false` and the exact comparison the pin searches for. Suppress only that line:

```typescript
export function metaMeasurementAllowed(): boolean {
  // Intentional. Literal false has no overlap with true; that is the closed gate.
  // @ts-expect-error TS2367 — do not widen the const or delete the comparison.
  return META_LEGAL_GATE_OPEN === true;
}
```

Do not change the flag to a `boolean`, read `process.env`, or edit the test to drop `META_LEGAL_GATE_OPEN === true`.

---

_Reviewed: 2026-09-23T21:22:27Z_
_Reviewer: Hermes (gsd-code-reviewer)_
_Depth: standard_
