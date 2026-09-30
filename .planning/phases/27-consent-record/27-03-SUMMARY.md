---
phase: 27-consent-record
plan: 03
subsystem: i18n
tags: [consent, meta, owner-text, i18n]
requires: [27-01]
provides:
  - "app/vamos-meta-texts.js: window.VamosMetaTexts { banner, cookiesRow, privacyLine, segments(key, lang) }"
  - "Next keys cookies.meta-banner, cookies.meta-row, legal.meta-privacy-line, cookies.save-failed, cookies.sheet-*"
  - "owner-texts.test.ts: byte-compare of both builds against the decision file"
key-files:
  created:
    - app/vamos-meta-texts.js
    - apps/web/lib/consent/owner-texts.test.ts
  modified:
    - apps/web/i18n/messages/en.json
    - apps/web/i18n/messages/de.json
    - apps/web/i18n/messages/fr.json
    - apps/web/i18n/messages/ar.json
    - app/vamos-i18n-dict.js
requirements: [META-03, META-04]
completed: 2026-09-30
---

# Phase 27 Plan 03: Owner Meta texts Summary

The owner's three Meta texts (banner, cookies row, privacy line) now exist in en, de, fr and ar in both builds, generated from the decision file by script and proven byte-equal by a test.

## Commits
- c2c5b946 test(27-03): owner Meta texts source for the mock and byte-compare test
- f393d511 feat(27-03): owner Meta texts and cookie sheet strings in the Next messages
- 2f7bed49 feat(27-03): banner save-failed and check-failed strings in the mock dictionary

## What was built
- `app/vamos-meta-texts.js`: IIFE, segment arrays (strings, `{b}`, `{code}`), generated from `.planning/decisions/2026-09-30-meta-wording.md` by a scratchpad script. `segments(key, lang)` falls back to en.
- `owner-texts.test.ts` (27 tests): 12 mock comparisons, 12 Next comparisons, the 3x4 parse check, the en fallback, and a no-fragment check on the mock dict keys.
- Next messages, insert-only (0 deleted lines in all four files; en +12, others +11): `cookies.meta-banner`, `cookies.meta-row`, `legal.meta-privacy-line`, `cookies.save-failed`, and seven `cookies.sheet-*` keys (necessary providers and duration, functional duration, analytics providers, none, not used, footer note). Sheet translations copied from the mock dict, none written new. `$meta.noParamKeys["cookies.meta-row"]` added in en.json (as first entry, so no existing line changed).
- Mock dict: two entries after `'Manage preferences'` (save failed, check failed), 2 insertions 0 deletions.

## Commands and results
- `pnpm --filter web exec vitest run lib/consent/owner-texts.test.ts`: after Task 1, 13 failed (all Next-side, expected) and 14 passed; after Task 2, 27 passed; after Task 3, 27 passed.
- `pnpm i18n:check`: exit 0, 2637 keys, coverage passed.
- JSON.parse of all four message files: ok.
- `grep -c "Meta Platforms Ireland Ltd" app/vamos-meta-texts.js`: 8; `grep -c 90`: 4.
- `node -e "global.window={};require('./app/vamos-i18n-dict.js')"`: exit 0.

## Deviations from Plan
- **[Rule 3] Test allow-list.** The dict already has the key `'Cookie preferences'` (the banner link label), which is a phrase inside the owner sentences. The no-fragment check allows exactly that one label, with a comment. Every other key of 12+ characters is still rejected if it occurs inside an owner text.
- The `$meta.noParamKeys` entry is the first entry rather than last, to avoid touching the previous last line (comma). The list is not sorted today.
- Commit trailer follows exec-rules.md (Claude Opus 5.5), which differs from the session attribution reminder.

## Not verified
- `pnpm db:seed:check` is expected red: the message files changed, and `seed.sql` is not hand-edited. Plan 27-11 regenerates it. Not run.
- Rendering of the texts (t.rich, mock segments) is for plans 27-06, 27-07, 27-09, 27-10.
- No lawyer has read the texts (owner decision file says so).

## Known Stubs
None.

## Self-Check: PASSED
