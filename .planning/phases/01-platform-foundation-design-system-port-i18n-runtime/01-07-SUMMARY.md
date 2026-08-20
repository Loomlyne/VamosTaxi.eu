---
phase: 01-platform-foundation-design-system-port-i18n-runtime
plan: 07
subsystem: i18n
tags: [next-intl, icu-messages, dotted-keys, i18n, dictionary-migration, d13, d17, d18, adr-011, adr-012]

# Dependency graph
requires:
  - phase: 01-01
    provides: "apps/web/i18n/{routing.ts,request.ts,messages/{en,de,fr,ar}.json} loader seam and the 3-key HomePage tracer namespace"
  - phase: 01-03
    provides: "scripts/check-i18n-coverage.mjs, the build-time coverage/usage/parameterisation gate this migration's output must pass"
provides:
  - "scripts/migrate-dictionary.mjs — the re-runnable transform from app/vamos-i18n-dict.js to the four locale JSON files + key-map.json"
  - "apps/web/i18n/messages/{en,de,fr,ar}.json — 1,527 dotted keys each (1,428 migrated source strings + 39 pattern-derived ICU messages + 4 product-name keys + the 3 HomePage tracer keys + $meta), key sets identical across all four locales"
  - "apps/web/i18n/key-map.json — every one of the 1,428 English source strings + all 44 pattern regex sources, mapped to its dotted key, for Phase 5 to port each mock page's copy by lookup rather than re-derivation"
  - "apps/web/i18n/request.ts extended with onError/getMessageFallback — a missing key resolves against English, and renders empty (never a raw dotted key path) if missing everywhere"
affects: ["01-05", "01-06", "01-08", "01-09", "01-10", "01-11", "01-12", "01-13", "01-14"]

actuals:
  tokens: 176000
  tasks: 3
  commits: 3

tech-stack:
  added: []
  patterns:
    - "Dictionary migration as a re-runnable script (scripts/migrate-dictionary.mjs), not a hand-edit — namespace derived by grepping the mock tree for each source string's owning surface, leaf slugified with numeric-suffix disambiguation on collision"
    - "$meta.pendingValueKeys / $meta.nonTranslatableKeys / $meta.noParamKeys as the authority file's own opt-out registry, read by both the migration script and check-i18n-coverage.mjs so the two lists cannot drift apart"
    - "Concatenated-string patterns become named-placeholder ICU messages, with full Arabic zero/one/two/few/many/other plural categories on the primary countable ones"
    - "request.ts merges the requested locale's messages over an English default before next-intl ever sees a gap, then getMessageFallback renders empty and logs structured JSON naming the key+locale for anything still missing"

key-files:
  created:
    - "scripts/migrate-dictionary.mjs"
    - "apps/web/i18n/key-map.json"
  modified:
    - "apps/web/i18n/messages/en.json"
    - "apps/web/i18n/messages/de.json"
    - "apps/web/i18n/messages/fr.json"
    - "apps/web/i18n/messages/ar.json"
    - "apps/web/i18n/request.ts"

key-decisions:
  - "Product names (Vamos Taxi, Economy, Business, Van) are routed to fixed common.* keys before the generic per-string loop, marked $meta.nonTranslatableKeys, and rendered with the identical Latin value in all four locale files — this directly fixes ADR-012's finding that the source dictionary's Arabic values for Economy/Business were two disagreeing transliterations, and Van's untranslated-but-undifferentiated value."
  - "ADR-012's 13 duplicate dictionary keys required no explicit collapse code: JavaScript's own object-literal semantics already discard the earlier entry the moment app/vamos-i18n-dict.js is loaded, so the object this script reads has exactly one occurrence of each. Documented inline in the script rather than left implicit."
  - "20 data-tok pending-value pill keys (ADR-011) are detected by cross-referencing every dictionary key against text found inside a data-tok=\"1\" span across the whole mock tree, then checking whether each candidate also appears outside such a span (dual use). This reproduced ADR-011's own count exactly (21 pill-associated keys, 1 dual-use) via an independent, re-runnable method rather than a hardcoded list."
  - "Pending-value pill keys render the English string in de.json/fr.json/ar.json too (not omitted) — see Deviations for why omitting them, the initially simpler design, was rejected."
  - "apps/web/lib/logger.ts (Plan 04) had not been executed when this task ran and 01-04 was not among the plans running concurrently with this one — the dev/production warning in request.ts is a self-contained structured console call rather than an import of a module that does not yet exist. See Deviations."
  - "The 'First' vehicle-class entry (app/vamos-i18n-dict.js:1135) migrated as an ordinary string rather than being deleted — ADR-012 explicitly routes its removal to LEGAL-PLACEHOLDER-CHECKLIST.md §I's decision-13 work order, not to this migration."

patterns-established:
  - "Any future dictionary-shape change re-runs `node scripts/migrate-dictionary.mjs` and diffs the result; `--check` mode fails the build if regenerating would produce different output than what's committed, making dictionary drift detectable in CI without a dedicated new gate."

requirements-completed: [I18N-01, I18N-06]

coverage:
  - id: D1
    description: "The 1,428-string mock dictionary is migrated to dotted-key JSON in en.json, with a namespace derived by grepping the mock tree for each string's owning surface"
    requirement: "I18N-01"
    verification:
      - kind: integration
        ref: "node scripts/migrate-dictionary.mjs --check exits 0; en.json carries 1,527 dotted keys (>= 1,300 required)"
        status: pass
    human_judgment: false
  - id: D2
    description: "de.json, fr.json and ar.json carry the identical key set as en.json, each with a real per-locale translation (or the deliberate English-only pending-value/product-name value)"
    requirement: "I18N-01"
    verification:
      - kind: integration
        ref: "pnpm i18n:check (1,467 keys checked); flattened key-count parity check across all four locale files"
        status: pass
    human_judgment: false
  - id: D3
    description: "All 44 concatenation regex patterns become parameterised ICU messages, with genuine plurals (15) correct at zero/one/two in Arabic for the primary countable ones"
    requirement: "I18N-06"
    verification:
      - kind: integration
        ref: "grep 'plural,' count in en.json >= 10 (15 present); manual inspection of common.bagsCount / checkout.passengersCount / faq.questionsCount / account.allBookingsCount Arabic zero/one/two/few/many/other branches"
        status: pass
    human_judgment: false
  - id: D4
    description: "A key missing from the active locale resolves to English; a key missing everywhere renders empty, never a raw dotted key path, and logs a structured warning naming the key and locale"
    requirement: "I18N-01"
    verification:
      - kind: integration
        ref: "opennextjs-cloudflare preview of /de shows no raw namespace.leaf path and correct German text; isolated createTranslator test confirms English-fallback (checkout.paidBy with de deleted) and empty-render (a nonexistent key) directly"
        status: pass
    human_judgment: false

duration: ~50min
completed: 2026-08-20
status: complete
---

# Phase 1 Plan 7: Dictionary Migration to Dotted-Key ICU JSON Summary

**A re-runnable script migrated 1,428 English-keyed mock dictionary strings and 44 concatenation
regex patterns into 1,527-key dotted JSON across en/de/fr/ar, collapsing ADR-012's duplicate keys
and Arabic transliteration defects, converting every parameterised pattern (15 of them genuine
ICU plurals with full Arabic categories), and wiring request.ts to fall back to English and never
leak a raw key path.**

## Performance

- **Duration:** ~50min
- **Completed:** 2026-08-20
- **Tasks:** 3/3 completed
- **Files modified/created:** 7 (1 script, 1 key-map, 4 locale JSON files, 1 request.ts)

## Accomplishments

- `scripts/migrate-dictionary.mjs` transforms `app/vamos-i18n-dict.js` (read-only) into
  `apps/web/i18n/messages/{en,de,fr,ar}.json` + `key-map.json`, re-runnable with a `--check`
  drift detector.
- Namespace for each of the 1,428 source strings is derived by grepping every `.dc.html` file
  under `app/` for the literal string and reading the owning file's namespace off a
  `FILE_NAMESPACE_MAP` — not guessed. 159 strings fell back to `common` (3+ surfaces), 148
  resolved from exactly 2 surfaces (kept the first, logged), 121 matched no file (routed to
  `common`), and 10 leaf collisions were disambiguated with a numeric suffix. All logged by the
  script on every run.
- The four product names (`Vamos Taxi`, `Economy`, `Business`, `Van`) are marked
  `$meta.nonTranslatableKeys` and render identically in all four locales — fixing ADR-012's two
  disagreeing Arabic transliterations for Economy/Business and Van's untranslated inconsistency.
- ADR-012's 13 duplicate dictionary keys required no explicit collapse: JavaScript's own
  object-literal semantics already discard the earlier entry when `app/vamos-i18n-dict.js` loads.
- 20 `data-tok` pending-value pill keys (ADR-011) are detected programmatically (cross-referencing
  every dict key against `data-tok="1"` span text across the mock tree, then checking dual use)
  and render the English string in every locale — reproducing ADR-011's own count (21
  pill-associated, 1 dual-use: `Registered firm name`) via an independent, re-runnable method.
- 54 English values carrying a fixed digit with no ICU placeholder (an address, a phone number, a
  policy duration written as prose) are recorded in `$meta.noParamKeys` with a specific,
  categorised reason each — not silently passed through the parameterisation gate.
- All 44 `patterns` regex entries (including 3 literal duplicates of `(\d+) bags$` and 2
  singular/plural pairs) are converted to 39 parameterised ICU messages, 15 of them genuine
  plurals — several correcting a latent gap in the source dictionary, which always used the
  plural German/French noun form even at n=1 (e.g. "1 Gepäckstücke" → "1 Gepäckstück"). Reference
  codes and clock times are wrapped in an `<ltr>` rich-text tag for Phase 5's caller.
- `request.ts`'s loader seam deep-merges the requested locale over English before next-intl sees
  a gap, and `onError`/`getMessageFallback` log a structured single-line JSON warning naming the
  exact key and locale while always rendering empty — never a raw `namespace.leaf` path.

## Task Commits

1. **Task 1: The migration transform and the key scheme** - `69d6bb7` (feat)
2. **Task 2: The three translated locales and the parameterised messages** - `35c2f62` (feat)
3. **Task 3: Runtime fallback and the development warning** - `8fccdc5` (feat)

## Files Created/Modified

- `scripts/migrate-dictionary.mjs` - the re-runnable D-13 transform; also the record of the key
  scheme, the namespace map, and all 39 hand-authored pattern-derived ICU messages
- `apps/web/i18n/messages/en.json` - the key authority: 1,527 dotted keys nested by namespace,
  `$meta.{pendingValueKeys,nonTranslatableKeys,noParamKeys}`
- `apps/web/i18n/messages/{de,fr,ar}.json` - identical key set to en.json, real per-locale
  translations except the 20 pending-value/4 product-name keys (deliberately English-only)
- `apps/web/i18n/key-map.json` - 1,428 source-string entries + 44 `pattern:` entries, all
  resolving to a key that exists in en.json
- `apps/web/i18n/request.ts` - `onError`, `getMessageFallback`, `mergeWithEnglishFallback`,
  `stripMeta`

## Decisions Made

See `key-decisions` in frontmatter. The two decisions worth restating in prose:

1. **Pending-value pill keys are present with the English value in every locale file, not
   omitted.** The initial design omitted them from de/fr/ar entirely, relying on the Task 3
   fallback to resolve them to English at runtime. That is semantically correct per ADR-011 but
   fails Task 2's own literal verify command #2 (`flat(en).length !== flat(de).length` — a naive
   flattener that, unlike `check-i18n-coverage.mjs`'s own `flatten()`, does not skip `$meta` or
   tolerate a key-count mismatch). Writing the English value into all four files satisfies both
   the literal parity check and ADR-011's "stays English in every language, with no exception."
2. **`$meta` is mirrored (shape-identical, not content-identical) into de/fr/ar.** For the same
   reason: the naive flatten in Task 2's verify command recurses into `$meta.noParamKeys` (a
   plain object) and would otherwise count 56 more leaves in en.json than in the other three
   files. The mirrored copy in de/fr/ar carries the same key set but replaces each
   `noParamKeys` reason string with `true`, so the naive "long string byte-identical across
   locales" check (also literal in Task 2's verify) does not mistake 54 English-only opt-out
   reasons for untranslated content. The real gate (`check-i18n-coverage.mjs`) ignores `$meta` in
   every locale file uniformly, so this mirroring is inert there.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking issue] `apps/web/lib/logger.ts` (Plan 04) does not exist yet**

- **Found during:** Task 3, reading the task's own instruction to "emit the warning through the
  structured logger from Plan 04."
- **Issue:** 01-07's frontmatter declares `depends_on: ["01-01", "01-03"]` only; 01-04 was not
  executed and was not among the plans running concurrently with this one (`apps/web/lib/` did
  not exist at the start of Task 3 — confirmed by `ls apps/web/lib/`, which returned nothing
  until a sibling plan, 01-08, later created `lenis-provider.tsx` there). Importing a module that
  does not exist would break `pnpm typecheck`/`pnpm build`.
- **Fix:** `request.ts`'s `onError`/`getMessageFallback` emit a self-contained, single-line
  structured `console.warn`/`console.error` call with the field shape (`scope`, `event`, `level`,
  `key`, `locale`) Plan 04's logger is documented to use, rather than importing it. The comment in
  `request.ts` names this explicitly so a future editor reconciling Plan 04's logger with this
  call site has the context.
- **Files modified:** `apps/web/i18n/request.ts` (no new file created; scope stayed within the
  plan's declared `files_modified`).
- **Verification:** `pnpm typecheck`, `pnpm build` both pass; `apps/web/lib/logger.ts` still does
  not exist in this repo as of this commit.
- **Committed in:** `8fccdc5`

**2. [Rule 3 - Blocking issue] Task 2's own literal verify commands required $meta parity, which
the initial pending-value-key design (omission) did not satisfy**

- **Found during:** Task 2, running the plan's exact verify command #2 (flattened key-count
  parity across en/de/fr/ar).
- **Issue:** See "Decisions Made" above — omitting pending-value keys from de/fr/ar (favoring the
  Task 3 runtime fallback) is semantically correct per ADR-011 but produces a key-count mismatch
  under the plan's own naive flattener.
- **Fix:** Write the English value into de/fr/ar for those 20 keys instead of omitting them;
  mirror a shape-identical `$meta` into all four files. Both changes are additive and do not
  alter what a visitor sees (ADR-011's outcome — English pill copy in every locale — is
  unchanged), only how it is achieved.
- **Files modified:** `scripts/migrate-dictionary.mjs`
- **Verification:** All of Task 1's and Task 2's automated verify commands re-run and pass; see
  the transcript in this plan's execution.
- **Committed in:** `35c2f62`

---

**Total deviations:** 2 auto-fixed (2 Rule 3 — both blocking issues resolved within the plan's
declared file scope, no scope creep).
**Impact on plan:** Neither deviation changes what ships to a visitor or what Phase 5 will find
in `key-map.json`; both are implementation-detail responses to constraints (a not-yet-existing
sibling module; a naive literal verify command) discovered while executing.

## Issues Encountered

- `opennextjs-cloudflare build`/`preview` failed twice with unrelated errors (`ENOENT` on a stale
  `.open-next/.build/open-next.config.edge.mjs`; later `Could not resolve "./.open-next/worker.js"`
  and a `SQLITE_BUSY` workerd crash) — both traced to concurrent sibling-plan activity in this
  shared (non-worktree) working directory rebuilding `.open-next`/`.wrangler` state at the same
  time, not to this plan's changes. Resolved by a clean `rm -rf .open-next` rebuild run in
  isolation between sibling-plan bursts of activity; the resulting preview served `/de` with
  correct German text and no raw key path, satisfying Task 3's verify command. Corroborated with
  an isolated `createTranslator` test (no Wrangler/workerd dependency) that directly exercises
  the English-fallback and empty-render-on-missing-everywhere paths — see the transcript.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- `apps/web/i18n/key-map.json` is ready for Phase 5 to port each mock page's copy by looking up
  its English source string rather than re-deriving a dotted key.
- Every real page-porting call site in Phase 5 that reaches for `account.bookingSummaryLine` or
  `account.pickupTime` needs to pass a `ltr` render function to `t.rich()` for the `<ltr>` tag
  those two messages carry (booking reference, clock time) — flagged here so it is not
  rediscovered from scratch.
- `apps/web/lib/logger.ts`, once Plan 04 lands, should reconcile with the two structured
  `console.warn`/`console.error` call sites in `apps/web/i18n/request.ts` (see Deviation 1) —
  swapping them to the real logger is a small, contained follow-up, not a redesign.
- No blockers for 01-08/01-09/01-10 or later plans that read from the locale message files; the
  dictionary migration this plan exists to produce is complete and gate-passing.

## Self-Check: PASSED

All 7 created/modified files confirmed present on disk; all 3 task commits confirmed in
`git log --oneline --all`.
