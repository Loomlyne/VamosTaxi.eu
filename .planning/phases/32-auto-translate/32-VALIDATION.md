---
phase: 32
slug: auto-translate
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-10-13
---

# Phase 32 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution. Source: `32-RESEARCH.md` § Validation Architecture, adjusted to the owner's answers of 2026-10-13 (no dashboard marks, no Translations page; Content › Pages/Legal removed; review translate on tap).

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.1.11 (`apps/web/vitest.config.ts`); pgTAP via `scripts/test-lab/lab.sh pgtap <name>` (native Supabase stack, no Docker) |
| **Config file** | `apps/web/vitest.config.ts` |
| **Quick run command** | `apps/web/node_modules/.bin/vitest run <touched test files>` (in a worktree `pnpm exec` aborts; memory ops-signing-pictures-real-shell) |
| **Full suite command** | `pnpm gate:local` (lead only, once per wave; memory parallel-agents-gate-load) |
| **Estimated runtime** | quick ~20 s; full gate ~15 min |

---

## Sampling Rate

- **After every task commit:** run the touched test files only.
- **After every plan wave:** the lead runs `pnpm gate:local` once, detached (`nohup … ; echo exit=$?`), log outside `/tmp`.
- **Before `/gsd-verify-work`:** full gate green + pgTAP green + the browser runs below.
- **Max feedback latency:** 60 s for task-level checks.

---

## Behaviours that must be proven

| Behaviour | Type | Command / file | Exists |
|---|---|---|---|
| Mask/unmask round-trip: ICU `{x}`, `$1`, HTML tags, `data-tok`, refs `VT-…`, flight numbers, CHF/amounts, ZRH, class names, "Vamos Taxi", "Ride with class" | unit (property) | `apps/web/lib/i18n/machine/mask.test.ts` | ❌ W0 |
| Guard rejects lost placeholder, digit change, preamble/refusal, `ß` (→ `ss` post-step), wrong script, length ratio, truncated output; rejection keeps the source | unit | `apps/web/lib/i18n/machine/guard.test.ts` | ❌ W0 |
| Call input: model `@cf/google/gemma-4-26b-a4b-it`, `chat_template_kwargs.enable_thinking=false`, `response_format` json_schema, `max_completion_tokens`, timeout; called on `env.AI` only (no AI Gateway option present) | unit with `AiLike` stub | `apps/web/lib/i18n/machine/translate.test.ts` | ❌ W0 |
| Machine write never overwrites a human row; overlay read returns public contexts only; support/note translations readable by staff only | pgTAP | `packages/db/supabase/tests/translations_*.test.sql` | ❌ W0 |
| `worker.ts` `queue()` routes `vamos-translate-*` batches to the translator before the Stripe loop; translate DLQ acks and logs, never mails | unit | `apps/web/worker-translate-queue.test.ts` | ❌ W0 |
| Queue message bodies carry ids only, never customer text | unit (asserts the enqueued payload shape) | same file + producer tests | ❌ W0 |
| Extras on Gemma keep "his typed value wins" | unit | `apps/web/lib/ops/extra-label-translate.test.ts` (update) | ✅ |
| Legal pages, `data-vt-legal`, `non_translatable`, decision-cited `$meta` keys and `[data-tok]` are skipped by the fill | unit | `scripts/i18n-fill.test.mjs` (plan 32-09: denied keys, legal-page texts and `data-tok` copy stay untouched); the overlay half is not built by decision (D-05/D-06): there is no overlay route, so nothing to skip there | ❌ W0 (fill) / n/a (overlay) |
| Overlay merge precedence (human > machine > source), fetch failure leaves the source, never blank | — | Not built by decision (D-05/D-06): no Translations page, no dashboard-typed public text after Pages/Legal removal, so no overlay route and no `overlay-merge.test.ts`. Public text reads the catalog/`content_strings`; extras read `extra_labels_read()`; "his typed value wins" is proven by `extra_labels_system_fill.test.sql` (plan 32-02) and `extra-label-translate.test.ts` (plan 32-06) | n/a (by decision) |
| Reply mail body = translation, blank line, 20 hyphens, blank line, original; failed → original only + note; non-en/de/fr/ar target → untranslated; over 1,800 chars → original dropped + note | unit | `apps/web/lib/ops/tickets-map.test.ts` (extend) or new `reply-mail.test.ts` | ❌ W0 |
| Review translate route: cache-first, model only on a miss, rate-limited, unknown review 404, legal/other contexts refused, no vendor name in the response | unit + route test | `apps/web/app/api/reviews/[id]/translate/route.test.ts` | ❌ W0 |
| Removed: `/pages` and `/legal` no longer in `OPS_CONSOLE_EXACT`; `/api/staff/content*` answer 404; `OpsContent` absent from `SHELL_SCREENS`; the public content loader still reads `content_strings` | unit / integration | `apps/web/tests/integration/ops-dc-content-loader.spec.ts` (kept parts), new removal assertions | partial |
| New strings resolve in de/fr/ar; no `ß`; no vendor/model name or "machine" in any new visible string | gate | `scripts/check-i18n-coverage.mjs` + `VamosLocale.coverage` on new elements | ✅ |

---

## Wave 0 Requirements

- [ ] Test files marked ❌ W0 above exist (failing first where TDD applies).
- [ ] An `AiLike` stub shared by translator tests (no network, no binding).
- No framework install.

---

## Manual-Only Verifications

| Behaviour | Why manual | Steps |
|---|---|---|
| Real model on 5 fixed strings (de/fr/ar, Swiss ss, Latin "Vamos Taxi", untouched CHF/VT-ref) | billed call, needs the binding | `pnpm i18n:smoke` on the local Worker with remote AI (owner-run or controller-run; cents) |
| Support ticket at 1440/1024/768/390 × en/de/fr/ar: translated message + original, reply opens Gmail/mail app with the agreed body | browser on the local Worker | memory browser-run-dc-forms-on-worker; one lane at a time |
| Home review card: Translate → Translating… → translated → Show original; failed → Try again; 390 no sideways scroll; Arabic RTL | public browser run on the local Worker | same lab, stubs off for the route |
| Dashboard rail without Pages/Legal; `/pages` and `/legal` addresses no longer open a screen | browser | same lab |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60 s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
