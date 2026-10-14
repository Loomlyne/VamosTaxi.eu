---
phase: 32-auto-translate
plan: 01
subsystem: translate-engine
tags: [workers-ai, gemma-4, i18n, translation, guard, queue-contract]
requires: [phase-30 on main]
provides:
  - apps/web/lib/translate/model.ts (TRANSLATE_MODEL, PROMPT_VERSION, LANGS, Lang, isLang)
  - apps/web/lib/translate/translate.ts (AiLike, translateText, translateUnknown, TranslateFailReason, MAX_SOURCE)
  - apps/web/lib/translate/guard.ts (guardOutput)
  - apps/web/lib/translate/mask.ts (mask, unmask, icuSignature)
  - apps/web/lib/translate/post-process.ts (postProcess, westernDigits)
  - apps/web/lib/translate/hash.ts (sourceHash, normaliseSource)
  - apps/web/lib/translate/glossary.ts (PROTECTED_LITERALS, PROTECTED_PATTERNS)
  - apps/web/lib/translate/jobs-contract.ts (TranslateJob, parseTranslateJob, sendTranslateJob)
  - apps/web/lib/translate/ai-stub.ts (gemmaReply, stubAi; tests only)
  - CloudflareEnv.TRANSLATE_QUEUE?: Queue
affects: [32-02 .. 32-12 (every later plan imports this engine)]
tech-stack:
  added: ["@formatjs/icu-messageformat-parser 3.5.17 (direct pin; already transitive via next-intl)"]
  patterns: ["mask -> call -> parse -> post-process (masked) -> unmask -> guard", "ids-only queue body", "reason/lang/hash-only logs"]
key-files:
  created:
    - apps/web/lib/translate/model.ts
    - apps/web/lib/translate/glossary.ts
    - apps/web/lib/translate/hash.ts
    - apps/web/lib/translate/mask.ts
    - apps/web/lib/translate/mask.test.ts
    - apps/web/lib/translate/post-process.ts
    - apps/web/lib/translate/post-process.test.ts
    - apps/web/lib/translate/guard.ts
    - apps/web/lib/translate/guard.test.ts
    - apps/web/lib/translate/translate.ts
    - apps/web/lib/translate/translate.test.ts
    - apps/web/lib/translate/ai-stub.ts
    - apps/web/lib/translate/jobs-contract.ts
    - apps/web/lib/translate/jobs-contract.test.ts
  modified:
    - apps/web/package.json
    - pnpm-lock.yaml
    - apps/web/lib/env.d.ts
decisions:
  - "finish_reason other than stop -> ok:false 'finish'; non-null refusal -> ok:false 'refusal' (one call carries every target, so a cut or refused answer has no usable language)"
  - "ok:true means at least one accepted language; every requested language guard-rejected -> ok:false 'guard'"
  - "House rules run on the still-masked answer, then unmask: a restored protected span is never rewritten (ß inside a restored span is rejected as 'eszett')"
  - "No re-ask on guard rejects (only on unparsable JSON, per the plan); one AbortSignal deadline covers both attempts"
  - "translateUnknown asks for every target and drops the one equal to the detected language (strict schema needs fixed keys)"
  - "sendTranslateJob re-validates the job through parseTranslateJob before send; logs reason + kind only, never ids"
metrics:
  duration: 15min
  started: 2026-10-14T02:48+04:00
  completed: 2026-10-14T03:03+04:00
  tasks: 3
  files: 17
---

# Phase 32 Plan 01: Translator engine Summary

One shared Gemma 4 translator (`@cf/google/gemma-4-26b-a4b-it` through `env.AI.run`, thinking off, strict JSON schema, no AI Gateway) with code-side masking of protected spans, Swiss-German ss and Western-digit post-processing, a deterministic output guard, language detection in the same call, and an ids-only translate-queue contract.

## Setup (Task 1 Step A)

- `git fetch origin`: origin/main = `1c28a8baa4822c05561b05f4b0164444bc02fc43` (Phase 30, PR #80).
- Phase 30 on main, by file evidence: `git cat-file -e origin/main:apps/web/lib/ops/console-paths.ts` succeeded; `git show origin/main:app/vamos-ops-api.js | grep -c 'OpsChauffeurs: 1'` = 1.
- `git merge origin/main`: "Already up to date" (the controller's merge `c4e82fd8` already carries it). `git log --oneline -1 --merges` = `c4e82fd8 Merge remote-tracking branch 'origin/main' into phase-32-auto-translate`. No new merge commit was needed.
- **Merge base for later diffs (plan 32-04): `1c28a8baa4822c05561b05f4b0164444bc02fc43`** (`git merge-base origin/main HEAD`).
- `pnpm install --frozen-lockfile`: exit 0, lockfile up to date.
- Newest migration on main: `packages/db/supabase/migrations/20261012230000_notification_kinds.sql`.

### Phase 31 status: NOT on main

| Signal | Command | Output |
|---|---|---|
| 1 | `git ls-tree -r --name-only origin/main packages/db/supabase/migrations \| grep -c '_refund_check_reader\.sql$'` | `0` |
| 2 | `git show origin/main:apps/web/worker.ts \| grep -c 'refundCheck('` | `0` |

Newest Phase 31 migration (origin/phase-31-refunds-in-stripe): `20261012240000_refund_check_reader.sql`. Plan-02 timestamps must sort after it.

Phase 31 overlap files (for the later merge): `apps/web/lib/env.d.ts` (Phase 31 adds `STRIPE_ACCOUNT_ID?` near `STRIPE_PUBLISHABLE_KEY`; this plan's `TRANSLATE_QUEUE` hunk sits after `STRIPE_EVENTS`, a different hunk), `apps/web/i18n/messages/{en,de,fr,ar}.json`, `packages/emails/src/messages/{en,de,fr,ar}.json`, `packages/db/supabase/seed.sql`, `app/vamos-i18n-dict.js`, `apps/web/worker.ts` (03:00 block), `apps/web/wrangler.jsonc` (staging vars), `packages/db/database.types.ts`, `apps/web/lib/db/system-reads.ts`.

### Re-read anchors (post-Phase-30 tree, HEAD after this plan)

| File | Anchor (text) | Lines |
|---|---|---|
| `app/ops/OpsSidebar.dc.html` | `const CONTENT = [` (pages / legal / reviews rows) | 137-141 |
| `app/ops/OpsSidebar.dc.html` | `contentItems` row: `<sc-for list="{{ contentItems }}"` and the `<a … height:40px;margin-inline-start:8px…>` row | 60-61 |
| `app/ops/OpsSidebar.dc.html` | `<script type="text/x-dc" data-dc-script data-props=…>` | 119 |
| `app/ops/OpsSidebar.dc.html` | `toggleContent = this.group('content', CONTENT)` / `group('content', CONTENT)` / `contentItems: content.items` | 229 / 307 / 330 |
| `app/ops/ops.dc.html` | `<sc-if value="{{ isContent }}"…>` + `<dc-import name="OpsContent" section="{{ contentSection }}"…>` | 224-226 |
| `app/ops/ops.dc.html` | `const CONTENT = ['pages', 'legal'];` | 261 |
| `app/ops/ops.dc.html` | `const HASH_TO_PATH = {` (… `reviews: '/reviews', pages: '/pages', legal: '/legal',` on 266) | 262-268 |
| `app/ops/ops.dc.html` | `function readPath(pathname)`; `if (path === '/pages')` / `if (path === '/legal')` | 288; 317-318 |
| `app/ops/ops.dc.html` | `contentSection: r === 'legal' ? 'legal' : 'pages',` / `isContent: CONTENT.indexOf(r) !== -1,` | 441-442 |
| `app/vamos-ops-api.js` | `var SHELL_SCREENS = {` (`OpsContent: 1,` on 51; Phase 30 already reads `OpsChauffeurs: 1`) | 49-51 |
| `apps/web/lib/ops/console-paths.ts` | `export const OPS_CONSOLE_EXACT` (`"/pages"`, `"/legal"`) | 7 (20, 21) |
| `app/vamos-i18n-dict.js` | `{ re: /^No places found for “(.+)”$/,` | 19 |
| `app/vamos-i18n-dict.js` | `/* ── Reviews ──` (first; `/* ── Reviews carousel` is 790) | 344 |
| `apps/web/worker.ts` | `if (controller.cron === "0 3 * * *") {` … `sweepMetaPurchaseIds` … `return;` (no Phase 31 refundCheck yet) | 123-139 (return 138) |
| `apps/web/worker.ts` | `async queue(batch, env, _ctx) {`; DLQ branch `if (batch.queue.endsWith("-dlq")) {` | 219; 231 |
| `apps/web/app/[locale]/(ops)/api/staff/rate-book/route.ts` | `async function saveExtraLabels(` (definition); `await saveExtraLabels(env, claims, parsed.code, recBody);` (call); `const ai = (env as { AI?: AiLike }).AI;` | 664; 1002; 680 |

## Tasks

| # | Task | Commits |
|---|---|---|
| 1 | Merge check, ICU parser pin, `TRANSLATE_QUEUE` type, model constants, job contract | `9d0f18bb` (chore: dependency), `cda24f69` (feat) |
| 2 | Glossary, masking, post-processing, source hash (TDD) | `28fdbf76` (test RED), `2c0401c7` (feat GREEN) |
| 3 | Output guard, Gemma call, detection, AI stub (TDD) | `aebc4c27` (test RED), `9210eea8` (feat GREEN) |

## Acceptance criteria

Task 1
- [x] `git log --oneline -1 --merges` shows the merge of origin/main (`c4e82fd8`); `test -f apps/web/lib/ops/console-paths.ts` succeeds
- [x] `grep -c '"@formatjs/icu-messageformat-parser": "3.5.17"' apps/web/package.json` = 1
- [x] `grep -c 'TRANSLATE_QUEUE?: Queue' apps/web/lib/env.d.ts` = 1
- [x] `grep -c '@cf/google/gemma-4-26b-a4b-it' apps/web/lib/translate/model.ts` = 1
- [x] jobs-contract.test.ts: each kind round-trips; extra key (`text`, `body`) -> null; non-uuid -> null; no binding -> false; throwing `send` -> false and the logged line has no `text`/`body`/id key (and no id value)
- [x] Anchors, merge base, Phase 31 signals, newest Phase 31 migration and overlap list recorded above

Task 2
- [x] mask.test.ts + post-process.test.ts pass (25 tests), every behaviour line covered
- [x] `grep -c 'Vamos Taxi' glossary.ts` = 1, `grep -c 'Ride with class' glossary.ts` = 1
- [x] `grep -v '^\s*//' mask.ts | grep -c 'from "@/'` = 0
- [x] `pnpm check:numbers` (`node scripts/check-no-invented-numbers.mjs`) exit 0; no CHF_ALLOW entry added

Task 3
- [x] `vitest run lib/translate` exit 0
- [x] `grep -c 'enable_thinking: false' translate.ts` = 1
- [x] `grep -v '^\s*//' translate.ts | grep -ci 'gateway'` = 0
- [x] translate.test.ts asserts `chat_template_kwargs` equals `{ enable_thinking: false }` and that no `gateway` key exists anywhere in input or options (deep search), plus no `tools` key
- [x] guard.test.ts has a failing-output case per reason: tokens (lost, duplicated, unknown), digits, length (de, fr, ar), script, untranslated (de, fr), preamble (sure, here is, voici, hier ist, certainly, fence, I can't), icu, eszett, link (URL, e-mail)

## Verification run (2026-10-14, local, stubs only; no network, no build)

- `apps/web/node_modules/.bin/vitest run lib/translate lib/ops/extra-label-translate.test.ts`: 6 files, 81 tests passed
- `tsc --noEmit` (apps/web, equals `pnpm --filter web typecheck`): exit 0 (after Task 1 and after Task 3; logs in `evidence/32-01-typecheck-t1.log`, `-t3.log`)
- `eslint apps/web/lib/translate apps/web/lib/env.d.ts`: exit 0 (`evidence/32-01-lint.log`); full `pnpm lint` left to the lead's gate run
- `node scripts/check-no-invented-numbers.mjs`: ok
- Plain-Node load check for plan 32-09: with a `module.registerHooks` resolver mapping extensionless relative specifiers to `.ts` (the hook plan 09 builds), Node 26.7 type stripping loads `translate.ts`, `guard.ts`, `hash.ts` and their imports; `translateText(null, …)` returns `no_binding`. Without the hook, extensionless imports fail (`ERR_MODULE_NOT_FOUND`), as plan 09 expects.

## Deviations from Plan

### Auto-fixed / interpretation

1. **[Rule 1 - Bug] Post-process runs on the masked answer, before unmask.** The plan line says "unmask then postProcess then checks". Post-processing after unmask would rewrite a restored protected span (ß -> ss inside a URL or data-tok span, Arabic digits inside a code), which breaks the "protected spans come back unchanged" truth. The guard now post-processes the masked answer, then unmasks, then checks; a ß that comes back inside a restored span is rejected (`eszett`). Files: `guard.ts`. Commit `9210eea8`.
2. **finish/refusal are whole-call failures.** The behaviour line says "finish_reason length or a non-null refusal -> that language rejected". One call carries every target, so a cut or refused answer has no usable language; it returns `ok:false` with `finish` / `refusal` (the two reason codes the interface lists), and the caller shows the source either way (F-07). `ok:false 'guard'` when every requested language fails the guard.
3. **Extra hardening, not in the plan:** `sendTranslateJob` re-runs `parseTranslateJob` on the job before `send` (a caller cast cannot smuggle a key onto the queue; logs `invalid_job`); `unmask` also rejects a stray `⟦`/`⟧` and leading-zero tokens; the masker treats token-shaped text already in the source as a protected span; a text with no letters outside protected spans returns the source with no model call.
4. **Lockfile:** `pnpm install` after the pin changed only the `apps/web` importer entry (3 lines); nothing downloaded.

### Not done (by plan scope)
- No re-ask on guard rejects (RESEARCH C.6 suggests one; the plan asks only for the parse re-ask). Plans that store rows can retry on a `PROMPT_VERSION` bump.
- No few-shot pair in the system prompt (RESEARCH C.2 optional); `SYSTEM_V1` is exported so a later plan can add one with a `PROMPT_VERSION` bump.
- `$meta.nonTranslatableKeys` values are not added to the glossary (the 32-09 filler skips those keys entirely).

## Known Stubs

None. `ai-stub.ts` is a test helper (plain factories, imports only a type from `translate.ts`); no production file imports it.

## Threat Flags

None beyond the plan's register. T-32-01..05 mitigations are in code and tested (prompt as JSON data field + masked + no tools + schema + guard; reason/lang/hash-only logs with a test; strict ids-only job parser; no gateway key with a test; MAX_SOURCE 4000, max_completion_tokens <= 8192, 20 s deadline, thinking off). T-32-SC: exact pin 3.5.17, frozen lockfile passes.

## Notes for later plans

- `AiLike.run(model, input, options?)`: the real `Ai` type is overloaded per model; callers cast as `rate-book/route.ts` does today (`(env as { AI?: AiLike }).AI`).
- `translateText` validates `to` with `isLang` and drops the source language and duplicates; an empty target list returns `ok:true` with `out: {}`.
- Log lines: `translate_reject` / `translate_failed` with `{ reason, lang, hash }` (hash = `sourceHash(src, text)`), `translate_enqueue` with `{ reason, kind }`.

## Self-Check: PASSED

- Files: all 14 files under `apps/web/lib/translate/` listed in key-files exist; `apps/web/lib/env.d.ts` carries `TRANSLATE_QUEUE?: Queue`.
- Commits present in `git log`: `9d0f18bb`, `cda24f69`, `28fdbf76`, `2c0401c7`, `aebc4c27`, `9210eea8`.
