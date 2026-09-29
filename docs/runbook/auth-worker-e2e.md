# Auth end-to-end on a local Worker

Proves sign-up, e-mail link, e-mail code, reset, unconfirmed sign-in, the
dashboard host rules, the sign-in rate limit and cookie attributes on the real
OpenNext Worker build (`wrangler dev --local`) against a real local Supabase
with the Send Email Hook switched on. `next dev` cannot prove these: cookies
set through `next/headers` attach there but not on the Worker.

Nothing here touches the live project.

1. Build a port-shifted Supabase workdir (see the `isolated-local-supabase`
   note): copy `packages/db/supabase/config.toml` with `project_id =
   "vamos-taxi-auth"` and every `543xx` port as `573xx`; symlink
   `migrations`, `tests`, `seed.sql`. Add `"http://localhost:4290/**"` to
   `additional_redirect_urls`, and append:

   ```toml
   [auth.hook.send_email]
   enabled = true
   uri = "http://host.docker.internal:4290/api/auth/email-hook"
   secrets = "<v1,whsec_ + 32 random bytes base64, kept in a local file>"
   ```

2. `supabase start --workdir <dir>`.
3. Build the tree: `pnpm --filter web exec opennextjs-cloudflare build`.
4. `apps/web/tests/e2e-worker/run.sh <tree> <supabase-workdir> <hook-secret-file> <label>`

Each line of output is `PASS | FAIL | N/A`, scenario, evidence. Mail links and
codes are parsed in-process and never printed. The script writes a JSON copy to
`apps/web/.wrangler/e2e-<label>.json`.

Result on 2026-09-29: `af93fc8e` fails 8 of 10 lines (the sign-up is rolled
back, `hook_payload_invalid_content_type`); `fix/auth-sign-in-sign-up` passes
all 9 scenarios.
