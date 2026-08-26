# Phase 3 harden ledger

lenses-expected: 3 (of the global 8)
lenses-returned: 3 (`isolation-soundness`, `forward-compat`, `fidelity-against-phase-2`)
findings-in: 27
applied: 25
rejected: 0
deferred: 2
dropped: 0

Harden agents died on a 402 before this file was written. Body edits landed in
`03-RESEARCH.md`; this ledger was reconstructed from those edits plus the three
verify files. New Phase 3 decisions are **D76–D83** (Phase 4 already took D61–D75).
New uncertainties **U59, U61** (Phase 4 took U54–U58).

| finding-id | severity | action | where | reason |
|---|---|---|---|---|
| ISOL-01 | blocker | apply | D77, Lane 3 `opts.client` | Probe/simulator must call shipped `withIdentity` |
| ISOL-02 | blocker | apply | D78 | NC1 is session-SET inside BEGIN/COMMIT, not no-txn |
| ISOL-03 | blocker | apply | D38 restated | Mutants vs hazards, not one "fails if a control passes" |
| ISOL-04 | blocker | apply | D38 + NC5 construction in Lane 4 | NC5 must capture `tx`, not the fenced path |
| ISOL-05 | blocker | apply | D38 + NC4 construction | Abandon must `waitUntil` the open txn |
| ISOL-06 | major | apply | U61, ENTRY_PROBE | Guest GUC on residue probe; guest-pair in S |
| ISOL-07 | major | apply | Lane 3 throw / lint | `fn` may not return `tx`; ESLint |
| ISOL-08 | major | defer | U31 | DATA-06 for OpenNext is Phase 5 `/api/account/bookings`. Probe proves the probe. Named in the header. |
| ISOL-09 | major | apply | item 10 greps, D34 | Restore session-SET / `unsafe` / `reserve` greps; no superuser local login once roles exist |
| ISOL-10 | major | apply | Lane 4 local claims | Drop "lost BEGIN" as locally provable via pgTAP savepoint |
| ISOL-11 | major | apply | D77 + D19 teardown | Reserved-conn mutant for session SET; no DELETE against append-only |
| ISOL-12 | major | apply | U2 check cell | Four-line check on `supabase start`; closed-map fallback, not concat |
| FC-01 | blocker | apply | D76 | One frozen signature; named wrappers only |
| FC-02 | blocker | apply | D79 | `asQuote` on NOCACHE; refuse Phase 4 D60 cache of the rate book |
| FC-03 | blocker | apply | D80 | `@vamos/db` exports + postgres + transpilePackages |
| FC-04 | major | apply | U61 | Guest/staff in S; Phase 7 writer is definer inside `asAnon`/`asCustomer` |
| FC-05 | major | apply | D39 branded `publicSql` | §14d table union; CI fail grants outside `0023` |
| FC-06 | major | apply | D27 + STACK.md note | Ban `sql.end()`; Cron/Queue take handler `env` (D83) |
| FC-07 | major | apply | D80 + D23 re-export | `database.types` from `@vamos/db`; both Hyperdrive bindings required on `CloudflareEnv` |
| FC-08 | blocker | apply | U1 paragraph | Hard gate on Phase 2 P1, not a Phase 3 rewrite after `0002` |
| FC-09 | major | apply | D82 | Compile-time probe guard; real production YAML gates |
| FC-10 | blocker | apply | D83 | Queues/Cron unplaced; out of DATA-05 |
| FC-11 | major | apply | D36 grep expansion | All wrapper names + `@vamos/db` + public path, allow-list static content |
| F1 | major | apply | D81 | No `bookings.pickup_at`; `scheduled_at` / `created_at` |
| F2 | blocker | apply | D81 | Schema-legal fixtures (`quote`, `user_id`, contacts) |
| F3 | blocker | apply | D81 | Policy is `customers.user_id = app.uid()` |
| F4 | minor | apply | D40 wording | "no `rate_versions` row with `status='live'` (D9)", never a boolean |

Sum: 25 apply + 0 reject + 2 defer (ISOL-08, and FC-04's Phase 7 writer landing) = 27.

FC-04 is counted apply for the Phase 3 door and U61; the checkout INSERT itself stays Phase 7.

CHF: `CHF 000` only. DATA-05 p50 still **DEFERRED**. DATA-06 not claimed passed locally.
