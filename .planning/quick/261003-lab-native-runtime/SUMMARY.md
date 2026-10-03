---
quick_id: 261003-lab-native-runtime
status: complete
date: 2026-10-03
---

# Summary: the lab runs with or without Docker

`LAB_RUNTIME=auto|docker|native lab.sh up <name>`; auto = Docker when its daemon answers, else native. New
`lab.sh pgtap <name>`: reset, full pgTAP suite, lab data back.

## Verified (2026-10-03 18:5x-19:3x +04)

- Scratch native stack, Docker Desktop down: all migrations, seed, `db reset`, pgTAP 99 files / 2653 tests pass.
- Native lab `nat` (full rebuild): up, status, env; self-test 7/7 (DB read through the stack's psql); `pgtap` 99/2653
  pass; data restored and self-test 7/7 again; `destroy` removed its stack folder and state, no process left.
- Docker lab `dk` (regression, Docker back): self-test 7/7, `pgtap` 99/2653, `destroy` clean.
- `bash -n`, `node --check` pass.

## Found and fixed on the way

- `pgtap` on a seeded lab failed (the lab's live stand-in price book collides with the suite's own): it now resets first.
- `destroy` refused to delete because its process check matched its own `grep`: now `pgrep` with a 30 s wait.

## Not verified / notes

- Native mode is Supabase's experimental stack: services differ from Docker in one way seen: they start lazily and
  stop when idle unless `--eager` (the lab passes it).
- Not tried natively: Studio, edge functions, the Send Email Hook end to end (auth mails), Linux.
- Repo pin 2.115.0 unchanged: moving it to 2.119 changes `gen types` (now generated in-process) — owner's call.
