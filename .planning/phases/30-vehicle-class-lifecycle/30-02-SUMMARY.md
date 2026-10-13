---
phase: 30-vehicle-class-lifecycle
plan: 02
subsystem: i18n
tags: [dictionary, about, classes, four-languages]
requires:
  - phase: 30-01
    provides: signed decisions; sheet-11 prototype strings (committed 6888c7ac)
provides:
  - Phase 30 dashboard strings in en/de/fr/ar in the shared dictionary
  - Public "Pick the class that fits." title pinned on both copies
affects: [30-07, 30-08]
key-files:
  created: [apps/web/lib/vehicle-classes-title.test.ts]
  modified: [app/vamos-i18n-dict.js, app/home/home.dc.html]
requirements-completed: [CLS-12, CLS-14]
duration: 15min
completed: 2026-10-12
---

# Phase 30 Plan 02: Dictionary and public title Summary

Twelve missing UI-SPEC strings added to the dictionary in four languages, eight dead About "fleet" entries and four dead `about*` keys in home.dc.html removed, and a 22-assertion pin test for the title, the dictionary and the removals.

## Tasks

| Task | Commit | Notes |
|------|--------|-------|
| 0 sheet 11 gate | n/a | `30-DESIGN-SIGNED.md` lines 53-54 record sheet-11a and sheet-11b signed 2026-10-12 |
| 1 dictionary | c3109009 | 12 keys added after the Phase 30 block (Draft: see what is missing, Missing, Edit class, Going live…, Retiring…, Bringing back…, three Could-not errors, Hide/Show retired classes, Back as a Draft…); 8 About entries removed |
| 2 title pin, home keys, test | 6529af11 | `aboutEyebrow/aboutH2/aboutBody` removed from the en and de blocks; new test file |

The sheet-11b strings (two word keys, five patterns) were verified present exactly once and left untouched. Both `VehicleClasses.dc.html` copies already read `Pick the class that fits.` and are byte-identical; no edit needed.

## Deviations from Plan

**1. [Existing shared entries kept] 'Live', 'Done'** - The dictionary already has `'Live'` (fr "Actif", ar "مفعّل") and `'Done'` (de "Fertig", fr "Terminé"), shared with other screens. UI-SPEC values differ (statusLive fr "En ligne", ar "مباشرة"; itemDone de "Erledigt", fr "Fait"). The dictionary is keyed by English text, so one key cannot hold both; changing it would relabel other surfaces. Kept as is. 30-07/08 page T tables carry their own per-language values for these two, so the UI is unaffected. Flag for the controller if he wants the shared entries changed.

**2. [Eight removals verified] 'Economy', 'Business', 'Van', '3 passengers', 'Drivers and fleet owners'** kept as specified. `8 passengers` had one grep hit, inside the longer string "No class seats 8 passengers" in `apps/web/tests/unit/locale-pattern-switch.test.ts`, which the plan says is not a use.

## Verification

- `node scripts/check-i18n-coverage.mjs`: passed (2699 keys).
- `vitest run lib/vehicle-classes-title.test.ts`: 22 passed (after `sync-dc-mock-to-public.mjs`).
- `node --check app/vamos-i18n-dict.js`: ok. Added lines contain no "ß". `git diff --numstat`: 12 added, 8 deleted in the dictionary; all deletions are the eight listed entries.
- Not run: full unit suite (runs once in 30-10), `pnpm` scripts (not usable in this worktree).

## Known Stubs

None.

## Self-Check: PASSED

Files and commits c3109009, 6529af11 exist.
