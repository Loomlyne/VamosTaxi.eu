---
quick_id: 261003-lxr
status: complete
branch: feat/test-lab
date: 2026-10-03
---

# Summary: test lab and Sonnet tester

Planned by Opus (lead), built by a Sonnet 5.5 executor (5 commits, ~240k tokens, ~31 min), checked by the lead.

## What exists now

- `scripts/test-lab/lab.sh` — `up | status | env | reseed | down | destroy | gates`. One command gives a local copy of the site from the current worktree: own Supabase stack `vamos-lab-<name>` on slot ports (45n2x, Workers 47n0/47n1, fakes 47n7), live-like stand-in price book, built Worker with the P6 fetch rewrite to `tests/e2e-worker/fakes.mjs`, public and dashboard Workers, dashboard admin. Stops only its own PIDs; refuses busy ports; `destroy` refuses a stack whose symlinks point elsewhere.
- `scripts/test-lab/seed-live-like.sql` — Economy / Business / Van luxury, one live rate version priced 1-3 rappen (labelled stand-in), airport start and city price set, vouchers `LABFIX` / `LABPCT`, policy `lab-policy`, `public_chf`. Idempotent.
- `scripts/test-lab/lab-browser.mjs` — `open`, `bookFromHome` (desktop and sheet), `chooseClass`, `fillTraveller`, `applyVoucher`, `pressPay`, `dashboardSignIn`, `pickLang`, `step`, read-only `db`, `fakes`, `coverage`.
- `scripts/test-lab/example-booking.mjs` — self-test S1-S7.
- `.claude/agents/vamos-tester.md` (model sonnet), `.planning/templates/TEST-BRIEF.md`, `docs/runbook/test-lab.md`.

## Verified (lead, 2026-10-03 16:0x-16:3x +04)

- `example-booking.mjs` on the executor's lab: 7/7 PASS (desktop, 390, German, fixed voucher; fake Stripe amount = PAY label each time).
- Sample brief run by a Sonnet agent with the `vamos-tester` instructions verbatim: T1-T6 PASS first time (768 sheet, `LABPCT`, Stripe amount, Arabic rtl + coverage + no side scroll at 390, dashboard sign-in, DB read). 71,788 tokens, 5 tool calls, 68 s. `evidence/sample/RESULT.md`; screenshots opened by the lead.
- `destroy lxr`: its container and state dir gone, the 4 other containers unchanged, `.dev.vars` / `wrangler.e2e.jsonc` removed.
- `lab.sh gates` on this branch: typecheck, eslint, i18n, numbers, db fences, legal claims PASS. `bash -n`, `node --check` pass.

## Not verified

- `subagent_type: "vamos-tester"` by name: project agents load at session start from the checkout, so it works only once the file is on main (the run above used the same text through a general agent).
- The vitest step of `lab.sh gates` on a real source change (no source changed here; the executor ran its command by hand: 798 tests pass).
- `--no-dash`, `LAB_SLOT`, the refusal of a foreign stack; 1024 px.

## Deviations (executor, accepted by the lead)

Seed sets airport start and city price (an airport quote is a 500 otherwise), adds policy `lab-policy`, ties coupons to the lab rate version, keeps luggage 3/3/8; `lab.sh` appends `VAMOS_QS_SECRET` to `.dev.vars` (else every quote hits the 4-a-minute bucket); `up` refuses a second live lab in the same tree (shared `.dev.vars`); `/checkout` has no `VamosLocale`, so German is checked by text and coverage runs on home `#book`. Lead change: subagents may not write report files, so the tester replies and the lead saves `RESULT.md`.
