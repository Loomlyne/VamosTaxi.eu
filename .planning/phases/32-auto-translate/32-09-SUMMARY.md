---
phase: 32-auto-translate
plan: 09
subsystem: i18n
tags: [i18n, translator, catalog, workers-ai, tooling]
requires: [32-01]
provides:
  - pnpm i18n:fill [--check|--write --yes-billed] [--only dict|messages|emails]
  - pnpm i18n:smoke (five-string manual check of the real model)
  - apps/web/lib/translate/catalog.ts (findGaps, isDenied, acceptFill, applyMessages, applyEmails, applyDict)
  - scripts/i18n-machine-denylist.json (never-translate keys, prefixes, texts)
key-files:
  created:
    - apps/web/lib/translate/catalog.ts
    - apps/web/lib/translate/catalog.test.ts
    - scripts/i18n-fill.mjs
    - scripts/i18n-ts-hook.mjs
    - scripts/i18n-fill.test.mjs
    - scripts/i18n-smoke.mjs
    - scripts/i18n-machine-denylist.json
  modified:
    - package.json
metrics:
  tasks: 2
  completed: 2026-10-14
---

# Phase 32 Plan 09: Catalog filler and smoke check Summary

`pnpm i18n:fill` lists every de/fr/ar gap in the dictionary, Next messages and e-mail messages and, with `--write --yes-billed`, fills only those gaps through the shared translator; `pnpm i18n:smoke` runs five fixed strings through the real model for a human to read.

## Commits
- f74c7743: catalog logic (pure, tested) and the denylist file.
- 1bcd203d: runner, resolve hook, smoke script, node tests, root package scripts.

## What was built
- **Gap rule:** a language is present when its value is a non-empty string, even one equal to English; an empty string is a gap. Appliers only add missing leaves (or fill an empty string), keep key order, the 2-space format and the trailing newline. `applyDict` appends `S["<en>"] = Object.assign({}, S["<en>"], { lang: "text" });` lines under one `/* ── Filled automatically (i18n:fill) */` header inside the last `var S = DICT.strings` block (a second run adds lines without a second header). The writers refuse empty text and, for German, any text containing `ß`.
- **Never sent to the model:** `$meta` pendingValueKeys, nonTranslatableKeys and noParamKeys whose reason cites a decision (their English wording is also denied wherever it is repeated); prefixes `legal.`, `cookies.`, `consent.`; denylist keys and exact texts (the three Meta lines, the 24-hour cancellation lines, cancellation-policy keys); at run time the runner also adds the text of every `data-vt-legal` page, `CookieBanner.dc.html`, every `data-tok` span and the English rows (`| en | ... |`) of `.planning/decisions/*.md`; dictionary strings matching a dictionary pattern. Keys and prefixes apply to the message catalogs; texts apply to all three.
- **Runner:** `--check` is the default and read-only. `--write` exits 2 unless `--yes-billed` is also given (also with `--ai-stub`). Batches of 25 strings; each string is one guarded `translateText` call (one source text, all its missing languages), at most 2 in flight; no batch entry point exists (`translateBatch` appears nowhere). Files are written after every batch. A rejected or failed result leaves the gap and is listed as `left as gap: ...`. Output carries keys and counts only, never string contents. AI comes from wrangler `getPlatformProxy` (environment `staging`, remote bindings).
- **Hook:** `scripts/i18n-ts-hook.mjs` uses `module.registerHooks` to resolve extensionless relative imports to `.ts`, and silences Node's typeless-package reparse warning for the engine files.
- **Smoke:** five strings with `Vamos Taxi`, `CHF 000`, `VT-26-0753`, `ZRH`, `LX 318` and a ß-prone word (street); prints de/fr/ar and the guard verdict for each; needs `--yes-billed`.

## Tests
- `apps/web/node_modules/.bin/vitest run lib/translate/catalog.test.ts`: 10 passed (a case per behaviour line, plus ß refusal, empty-string fill, second-run header reuse).
- `node --test scripts/i18n-fill.test.mjs`: 5 passed (fixture tree, stubbed AI, no network): gaps filled and existing values untouched, every denied source untouched, stub rejection leaves the gap, `--write` without `--yes-billed` exits non-zero, each call carries exactly one text, max in flight 2, no `translateBatch`, smoke needs `--yes-billed`.
- `pnpm test:scripts`: 45 passed. `eslint` on the new files: clean. `tsc --noEmit` shows no error in `catalog.ts`.

## `pnpm i18n:fill --check` on the real tree (read-only)
```
total: 0 strings, 0 language gaps (dict 0, messages 0, emails 0)
```
Cross-check with the denylist switched off: also 0 (2026 dictionary entries, all complete in de/fr/ar; messages and e-mail catalogs complete). So there is nothing for `--write` to fill today; it is ready for the gaps that Phase 31 refund strings or later plans introduce.

## Controller hand-over (not run here, billed)
1. `pnpm i18n:fill --check` (expect the gap list for the day).
2. `pnpm i18n:fill --write --yes-billed` (only if step 1 lists gaps); then `pnpm db:seed:gen`, `pnpm i18n:check`, review `git diff`.
3. `pnpm i18n:smoke --yes-billed`: read the 15 outputs; expect all accepted, no `ß`.

## Deviations from Plan
- **[Rule 2 - safety]** `--yes-billed` is required for `--write` even with `--ai-stub`, so no flag combination is a silent bill; the tests pass both flags.
- **[Rule 1 - bug found in own code]** Dictionary patterns loaded in `vm` fail `instanceof RegExp` (other realm); the runner checks `Object.prototype.toString` instead. Found by the node test, fixed in the same commit.
- The denylist file's `texts` hold the Meta lines and the cancellation lines; the remaining approved wording is found by the run-time scan rather than copied, so the list cannot go stale.

## Known Stubs
None.

## Self-Check: PASSED
Files and commits verified (f74c7743, 1bcd203d).
