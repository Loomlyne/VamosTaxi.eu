# Verify lenses — expected set (do not treat an empty array as a pass)

Written 2026-08-22. The previous Phase 2 run reported `{"findings": 0}` when all
three lenses had died. Compare **returned** against this list before any
"survived unchanged" sentence is allowed.

| Phase | Lens | Agent | Must write |
|---|---|---|---|
| 3 | isolation-soundness | 01a0267d-c4e5-7db2-842b-8b2b0c868448 | `03-*/verify/isolation-soundness.md` |
| 3 | forward-compat | 01a0267d-c4e5-7db2-842b-8b3747f8755b | `03-*/verify/forward-compat.md` |
| 3 | fidelity-against-phase-2 | 01a0267d-c4e5-7db2-842b-8b413e15d227 | `03-*/verify/fidelity-against-phase-2.md` |
| 4 | abuse-money | 01a0267d-c4e5-7db2-842b-8b529ef6213c | `04-*/verify/abuse-money.md` |
| 4 | forward-compat | 01a0267d-c4e5-7db2-842b-8b6caacc925f | `04-*/verify/forward-compat.md` |
| 4 | fidelity | 01a0267d-c4e5-7db2-842b-8b78c29f4037 | `04-*/verify/fidelity.md` |
| 4 | i18n-rtl | 01a0267d-c4e5-7db2-842b-8b8be69b4d37 | `04-*/verify/i18n-rtl.md` |
| 4 | ops-reality | 01a0267d-c4e6-72c3-9ee4-d08de53c7f85 | `04-*/verify/ops-reality.md` |

**Rule:** `lenses-returned` must equal 8, every file must contain `STATUS: returned`
and a `FINDINGS:` integer. If the counts differ, the verdict is
`ZERO FINDINGS IS NOT A CLEAN VERDICT — treat as unreviewed`. Harden does not run
until the set is complete.

**Returned 2026-08-22:** 8/8 `STATUS: returned`. Findings 12+11+4 (Phase 3) and
4+11+8+10+4 (Phase 4) = 64. Not a silent empty pass. Ledgers:
`03-HARDEN.md` (25 apply / 0 reject / 2 defer / 0 dropped),
`04-HARDEN.md` (28 apply / 0 reject / 9 defer / 0 dropped).

Harden then: every finding applied, rejected with a written rebuttal, or deferred
with an owning phase named. Never silently dropped.
