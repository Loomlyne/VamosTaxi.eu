---
phase: 32-auto-translate
plan: 10
subsystem: ops-support-ticket-dc
tags: [support, tickets, translation, dc-mock, mailto, gmail, i18n]
requires: [32-04, 32-07, 32-11]
provides:
  - OpsSupportTicket.dc.html surface B: translated customer messages with the original underneath, reply box, ANSWER BY E-MAIL with the signed body
  - support-reply-dc.test.ts (vm-run reply flow), support-ticket-strings.test.ts (page T tables pinned to 32-STRINGS.md section B at test time)
  - ops-support-read-only.test.ts rewritten to the new contract
affects: [32-12 (browser proof)]
tech-stack:
  added: []
  patterns: ["vm-run DC logic class with stubbed VamosOpsApi / window.open / navigator.userActivation / fake timers", "signed strings file parsed at test time"]
key-files:
  created:
    - apps/web/lib/ops/support-reply-dc.test.ts
    - apps/web/lib/ops/support-ticket-strings.test.ts
  modified:
    - app/ops/OpsSupportTicket.dc.html
    - apps/web/lib/icons/dynamic-icon-bindings.ts
    - apps/web/tests/unit/ops-support-read-only.test.ts
decisions:
  - "Reply state lives in state.replyDraft, not state.reply: phase-13-must-not.test.ts forbids the pattern `{ reply:` in the overlay"
  - "server status skipped is its own client state: his text opens as written, no divider, no failure note"
  - "editing while the Gmail tab waits closes the blank tab"
metrics:
  tasks: 2
  files: 5
  completed: 2026-10-14
---

# Phase 32 Plan 10: Support ticket reply and translation Summary

The support ticket screen now shows customer messages in his dashboard language with the original underneath, and he writes his reply in the ticket: ANSWER BY E-MAIL opens his mail app or Gmail with the customer-language text, a blank line, 20 hyphens, a blank line and his own text. The dashboard sends nothing.

## Tasks

| # | Task | Commits |
|---|---|---|
| 1 | Customer message translation display and pending poll | `5ee9475c` |
| 2 | Reply box, mail body, states, guard tests (TDD) | `e50b2d7d` (test RED), `60d38fa5` (feat GREEN) |

## What was built

- Bubble states: ready (translation, "Translated from <Language>" with the name from Intl in `data-vt-no-i18n`, original in its own `lang`/`dir`), pending (original plus Translating…), failed (original plus Translation not available), same language (unchanged). Pending re-reads at most 5 times, 2 s apart, then reads as failed until the ticket is opened again.
- Tickets are read with `?lang=<dashboard language>` and re-read when the language changes (a sequence guard drops out-of-order answers).
- Reply box (`[data-reply-text]`), hint per mode (translate / same / raw), quiet notes (failed, ready-press-again, too long), ANSWER BY E-MAIL with loader icon, `aria-busy`, disabled while translating. 800 ms debounce, POST `reply-translate` with `{ text, lang, from }`, same text never translated twice, 20 s ceiling, 1,800-character cut (original dropped with note).
- Target language: `open.reply.lang`, else latest customer `m.lang`, else ticket locale (matches the server-built subject).
- Gmail tab opened synchronously in the click and filled when the answer is ready; mail-app path with lapsed click activation shows "Translation ready. Press the button again..." and the next press opens at once.
- `mailHint` removed from all four tables; laws lines added; thread min 160 px, footer `max-block-size:56%` with contained scroll, actions 44 px at 860 and below; loader spin only under `prefers-reduced-motion:no-preference`.

## Verification (2026-10-14, local, no build, no database, no stack lock)

- `vitest run` support-reply-dc (24), support-ticket-strings (10), ops-support-read-only (7), tickets-route-readonly, icon-files-exist, phase-15-dc, ops-live-data, phase-13-must-not, ops-dc-u08: 9 files, 112 tests passed.
- `pnpm i18n:check` passed. `tsc --noEmit` (apps/web) clean. eslint clean on the new tests.
- Mutation check of the strings test: one character changed in a page `T` value fails it; one character changed in 32-STRINGS.md fails it; both reverted, 10/10 green again.
- Acceptance greps: `mailHint` 0; `MAIL_MAX = 1800` 1; `--vt-shadow-accent:none` 1; vendor/machine grep returns 1 line, the existing `x.gmail.indexOf('https://mail.google.com/')` validity check in `replyOf` (not visible copy); the strings test asserts no vendor or machine word in any visible table.
- Not verified: browser run at 1440/1024/768/390 and in Arabic (plan 32-12).

## Deviations from Plan

1. **[Rule 1 - Bug] Reply state key renamed `replyDraft`.** First version used `state.reply`; `phase-13-must-not.test.ts` (G-D01, `not.toMatch(/\{\s*reply:/)`) failed on `setState({ reply: ... })`. Renamed rather than editing that guard.
2. **[Rule 2 - Correctness] Server `skipped` handled as its own state** (prototype treated it as failed): no failure note for text like "08:15". Tested.
3. **[Rule 2 - Correctness] Closing the blank Gmail tab when he edits or closes the ticket during busy**, so no empty tab is left behind. Tested.
4. **Spin wrapper:** the spin attribute sits on a `<span>` around the `Icon` (the design-system `Icon` is not known to forward `data-*`), not on the Icon as in the prototype.
5. **Reduced-motion/mutation:** the plan's vendor grep (`google`) matches the pre-existing Gmail URL validity check; asserted on visible strings in the test instead, as the plan allows.

## Known Stubs

None.

## Threat Flags

None beyond the register. T-32-44: text is rendered by DC text bindings only; the vm test asserts no `innerHTML`-style sink. T-32-45: translation always shown with the original. T-32-46: body appended with `encodeURIComponent` as `&body=` only. T-32-47: read-only guard asserts the only calls are GET tickets, PATCH, POST reply-translate and no fetch/beacon.

## Self-Check: PASSED

- Files exist: `apps/web/lib/ops/support-reply-dc.test.ts`, `apps/web/lib/ops/support-ticket-strings.test.ts`, `app/ops/OpsSupportTicket.dc.html`.
- Commits in `git log`: `5ee9475c`, `e50b2d7d`, `60d38fa5`.
