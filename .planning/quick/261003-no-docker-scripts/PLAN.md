---
quick_id: 261003-no-docker-scripts
date: 2026-10-03
branch: feat/no-docker-scripts
planner: Opus 5.5 (lead)
executor: Sonnet 5.5
---

# The local test scripts run without Docker (Supabase native stack), CI keeps Docker

Owner 2026-10-03: "continue without docker" (Vamos Docker containers/images deleted, Docker Desktop stopped).
Supabase CLI >= 2.118 runs the local stack natively (`[experimental] stack = true` in config.toml, then
`supabase start --runtime native --eager`); proven 2026-10-03 with the Homebrew CLI 2.119.0: migrations, seed,
`db reset`, `test db --local` (99 files, 2653 tests). The repo pin (`node_modules/.bin/supabase`, 2.115.0) has no
native stack, so native mode uses the CLI on PATH. GitHub Actions (Linux, Docker) must keep working unchanged.

## Native-stack facts the code relies on (checked)

- Native `status`: `supabase status --env --workdir <dir>` prints ONE JSON object (keys API_URL, DB_URL, ANON_KEY,
  SERVICE_ROLE_KEY, ...); `status -o env` prints nothing on a native stack.
- psql: no system psql on this Mac; the stack ships one at
  `~/.supabase/cache/stack/slim-services/postgres/<version>/<platform>/bin/psql` (take the newest by `sort -V`).
  Connect with a URL `postgresql://postgres:postgres@127.0.0.1:<db port>/postgres`.
- A saved native stack keeps its first ports; config ports are honoured on the first start.
- `stop` keeps data; there is no delete flag (not needed here).

## Files (exact)

1. `scripts/local-test-stack.sh`
   - New env `VAMOS_STACK_RUNTIME=auto|docker|native`. auto: `docker` when `CI` is set; otherwise `native` when the
     machine can (Darwin-arm64 or Linux, and `${SUPABASE_NATIVE_CLI:-supabase} --version` >= 2.118.0), else `docker`.
     Print the choice to stderr once (`runtime: native`), never into `env` output.
   - prepare(): in native mode also put `stack = true` directly under the `[experimental]` line of the scratch config.
   - sb(): native -> the PATH CLI (`$SUPABASE_NATIVE_CLI`), docker -> `$ROOT/node_modules/.bin/supabase` (as now).
   - start: native -> `sb start --runtime native --eager`; pgtap: native -> `sb test db --local`.
   - env_lines(): native -> read ANON_KEY / SERVICE_ROLE_KEY from the JSON of `sb status --env` (parse with node,
     no jq). Output lines unchanged.
   - roles: native -> the stack's psql with OWNER_URL (refuse if it cannot connect on $DB_PORT); docker path unchanged.
   - Header comment: document the runtime switch in 4 lines.
2. `apps/web/tests/e2e-worker/checkout-common.mjs`, `auth-worker.e2e.mjs`, `other-device.e2e.mjs`: the `sql`/`sqlFile`
   helpers use the native psql when `SB_DB_URL` is set (`SB_PSQL` = psql path, else find it as above), else the
   existing `docker exec $DB psql ...` call. Same output (`-At -v ON_ERROR_STOP=1`). One small shared function in
   checkout-common.mjs; the other two may import it or carry a 6-line copy (keep them standalone-runnable).
3. `apps/web/tests/e2e-worker/run.sh`, `p6-run.sh`: after `supabase status -o env ... > .e2e-sb.env`, if the file
   has no SERVICE_ROLE_KEY, try `supabase status --env --workdir` JSON and write KEY="value" lines instead; when the
   stack is native (that fallback was used, or `SB_RUNTIME=native`), export `SB_DB_URL` (from SB_DB_PORT) and
   `SB_PSQL`. Docker path unchanged.
4. This folder: SUMMARY.md written by the lead after verification (executor: do not write report files).

## Rules

- Do not touch `.github/`, `packages/db/` scripts, `scripts/test-lab/`, or anything under `.planning/` except nothing.
- Never start, stop or reset a Supabase stack, never start Docker. The lead verifies on a native stack.
- `bash -n` every shell file, `node --check` every .mjs file; commit per file group with
  `feat(quick-261003-no-docker-scripts): ...` and `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
- Reply: commits, and anything in the plan you could not do as written.
