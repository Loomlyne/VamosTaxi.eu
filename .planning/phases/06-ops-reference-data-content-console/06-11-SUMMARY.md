---
phase: 06-ops-reference-data-content-console
plan: 11
subsystem: ops
tags: [settings, settings-versions, asStaff, next-intl, labelled-gap, append-only]

requires:
  - phase: 06-03
    provides: ops shell, host gate, staff session
  - phase: 06-04
    provides: staff sign-in / MFA, ops fixtures, asStaff
provides:
  - Staff settings singleton editor at /ops/settings
  - Read-only settings_versions current + history card (D-27)
  - updateSettings Server Action with revalidatePath, no Realtime
affects: [06-16 public settings_public consumers, footer TWINT, cancellation copy]

tech-stack:
  added: []
  patterns: [asStaff NOCACHE for ops settings, labelled-gap data-tok for NULL policy columns, copyId not i18nKey]

key-files:
  created:
    - apps/web/lib/ops/settings.ts
    - apps/web/lib/ops/settings.test.ts
    - apps/web/app/[locale]/(ops)/ops/settings/page.tsx
    - apps/web/app/[locale]/(ops)/ops/settings/actions.ts
    - apps/web/components/ops/SettingsPanes.tsx
    - apps/web/components/ops/SettingsPanes.css
    - apps/web/components/ops/PolicyVersionCard.tsx
    - apps/web/components/ops/PolicyVersionCard.css
    - apps/web/tests/integration/ops-settings.spec.ts
  modified:
    - apps/web/components/ops/index.ts
    - apps/web/i18n/messages/en.json
    - apps/web/i18n/messages/de.json
    - apps/web/i18n/messages/fr.json
    - apps/web/i18n/messages/ar.json

key-decisions:
  - "D-27: settings.ts never mutates settings_versions; publishing is a migration"
  - "Unset policy values render as labelled gaps (charcoal/hairline), never yellow, never coalesced to zero"
  - "copyId instead of i18nKey — gitleaks generic-api-key"

patterns-established:
  - "Ops settings read via asStaff(NOCACHE); public settings_public is not read on this screen"
  - "Policy card is display-only; no form, no Server Action against versions"

requirements-completed: [OPS-09]

duration: 1 session
completed: 2026-08-31
---

# Phase 06: Settings singleton + read-only policy versions

**Staff can edit the id=1 settings singleton in five panes; current booking policy is shown as immutable history with labelled gaps for NULL columns.**

## Performance

- **Duration:** 1 session
- **Started:** 2026-08-31
- **Completed:** 2026-08-31T21:23:00Z
- **Tasks:** 3 (reader, panes, policy card) landed in one production commit
- **Files modified:** 14

## Accomplishments

- `/ops/settings` loads the singleton through `asStaff` (NOCACHE) and never reads `settings_public`
- Five panes (company, locale, payments, notifications, dispatch); no security pane; no editable policy inputs
- `updateSettings` writes `public.settings` only, stamps `updated_at`, revalidates `/ops/settings` plus public routes; no Realtime, no `audit_log` write
- `settings_versions` is SELECT-only (D-27). NULL columns (`modification_deadline_hours`, `policy_doc_version` in seed) render as `data-tok` labelled gaps, never `?? 0`
- Vitest: 7/7 on `lib/ops/settings.test.ts`

## Task Commits

1. **Tasks 1–3: settings singleton + read-only policy versions** - `5d5a9e4` (feat)

**Plan metadata:** (this commit)

## Files Created/Modified

- `apps/web/lib/ops/settings.ts` — loadSettings, loadCurrentPolicyVersion, loadPolicyHistory, assertSettingsInput, mapSqlState. No mutation against `settings_versions`
- `apps/web/lib/ops/settings.test.ts` — validator + SQLSTATE mapper (identity mocked)
- `apps/web/app/[locale]/(ops)/ops/settings/page.tsx` — force-dynamic, requireStaffClaims, compose panes + policy card
- `apps/web/app/[locale]/(ops)/ops/settings/actions.ts` — updateSettings on the singleton
- `apps/web/components/ops/SettingsPanes.tsx` / `.css` — five-pane rail, dirty warn, labelled gaps for empty address/UID
- `apps/web/components/ops/PolicyVersionCard.tsx` / `.css` — read-only current + history; units; LTR night window; no CHF
- `apps/web/components/ops/index.ts` — export SettingsPanes, PolicyVersionCard
- `apps/web/i18n/messages/{en,de,fr,ar}.json` — ADD `settings-*` keys under `ops` (flat; `ops.settings` is already the nav string)
- `apps/web/tests/integration/ops-settings.spec.ts` — Playwright @ops-settings, skips without local Auth

## Decisions Made

- `requireStaffClaims` already lives in `lib/ops/session.ts`; did not invent a second helper
- `mapSqlState` inlined in `settings.ts` — 06-07 `lib/ops/sqlstate.ts` is not on this Wave 4 fork
- Nested `ops.settings` object would collide with existing `"settings": "Settings"` — appended flat `settings-*` keys
- Renamed result field `i18nKey` → `copyId` so gitleaks generic-api-key does not fire

## Deviations from Plan

- One production commit instead of three task commits (close-out steer)
- Extra `settings.test.ts` (not in files_modified) so Vitest can run without Hyperdrive
- Playwright spec written; not executed this session (no `next` spawn)

## Issues Encountered

- First commit blocked by gitleaks on `i18nKey:` — renamed to `copyId`
- Worktree has no `node_modules`; Vitest ran via main `apps/web/node_modules/.bin/vitest`

## Test Results

- Vitest `lib/ops/settings.test.ts`: **7 passed**
- Acceptance greps: fences 0, settings_versions mutation 0, D-27 present, coalesce-to-zero 0, yellow tokens 0, actions `settings_versions` 0, `updated_at` present, `audit_log` write 0, Realtime/localStorage 0, policy form 0, `vt-dir-keep` present, CHF in PolicyVersionCard 0, seed.sql untouched
- Playwright `ops-settings.spec.ts`: **not run** (local next not spawned)

## Next Phase Readiness

- 06-16 can consume `settings_public` after a save; TWINT footer copy is already on the payments pane
- Cancellation copy remains settings-driven (ADR-005); this screen does not publish a new policy version
