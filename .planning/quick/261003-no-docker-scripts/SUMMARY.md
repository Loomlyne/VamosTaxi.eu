---
quick_id: 261003-no-docker-scripts
status: complete
date: 2026-10-03
---

# Summary: the local test scripts run without Docker

Built by a Sonnet executor from the lead's plan (3 commits); verified by the lead on a native stack, Docker stopped.

- `scripts/local-test-stack.sh`: `VAMOS_STACK_RUNTIME=auto|docker|native` (auto: Docker when `CI` is set, else native
  when the PATH CLI is >= 2.118 on macOS arm64/Linux). Native start/pgtap/env/roles; Docker path unchanged.
- `apps/web/tests/e2e-worker/{checkout-common,auth-worker.e2e,other-device.e2e}.mjs`: SQL through the stack's own
  psql when `SB_DB_URL` is set, else `docker exec` as before.
- `run.sh`, `p6-run.sh`: native `status --env` JSON read when `status -o env` gives no keys; export `SB_DB_URL`/`SB_PSQL`.

## Verified (2026-10-03 19:4x-19:5x +04, stack vamos-taxi-nd, ports 461xx)

- `start` (runtime native), `env` (keys and URLs set), `pgtap` 99 files / 2653 tests PASS, `roles`, `reset`, `mark`, `stop`.
- `exec -- vitest` with `REQUIRE_DB=1`: `account-phone.local.test.ts` + `customer-paths.local.test.ts`, 7/7 pass.
- e2e helper `sql()` / `sqlFile()` answer from the native database.
- Stack and scratch folder removed afterwards.

## Not verified

- `run.sh` and `p6-run.sh` end to end (they need a hook-configured stack and a Worker build).
- GitHub Actions: `CI` keeps the Docker path; Actions is stopped by billing, so not run there.
