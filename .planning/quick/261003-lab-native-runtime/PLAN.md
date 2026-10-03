---
quick_id: 261003-lab-native-runtime
date: 2026-10-03
branch: feat/lab-native-runtime
---

# Test lab without Docker: the Supabase native stack

Owner (2026-10-03 ~18:5x, Docker Desktop had stopped): "update supabase — now you can run supabase without docker,
check that and continue". Checked: Supabase CLI 2.118 (2026-09-25) added a managed local stack that runs as plain
processes on macOS arm64 / Linux (`--runtime native`, enabled by `[experimental] stack = true`); 2.119.0 (2026-09-30)
is the newest stable. Homebrew CLI on this Mac upgraded 2.118.0 -> 2.119.0. The repo pin stays 2.115.0 (CI parity,
`db:types:check` output); the lab's native mode uses the CLI on PATH.

Files: `scripts/test-lab/lab.sh` (runtime switch, native start/status/psql/reset/destroy, new `pgtap`),
`scripts/test-lab/lab-browser.mjs` (`db()` on native), `docs/runbook/test-lab.md`, this folder.
