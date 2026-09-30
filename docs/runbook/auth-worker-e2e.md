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

## 26.5 other-device scenarios (D-16)

`other-device.e2e.mjs` runs right after the auth scenarios in `run.sh` (same Worker on 4290, same env).
Owner rule: a paid trip opens anywhere; an unpaid trip is never continued on another device, by pasted
link or by signing in. Each cookie jar stands for one browser. Seeding is done as `postgres` through
`docker exec psql`, local only; the raw manage and pay tokens live in the script's memory and are never
printed.

To run against a second, port-shifted stack (for example `vamos-taxi-265`, API 61321, db 61322) set
`SB_API_PORT`, `SB_DB_PORT` and `SB_DB_CONTAINER` (`supabase_db_<project_id>`) before `run.sh`; `mkcfg.mjs`
and the script read them. Set the two identity-role passwords on that container yourself (the
`local-role-passwords.mjs` script is hard-wired to 54322 and must not be used). Put a `supabase` on PATH
that runs the CLI for that workdir, because `run.sh` calls `supabase status`.

| Line | Proves |
|---|---|
| A0 | control: the browser with the `vt_manage` cookie still gets the unpaid booking back (same device) |
| a1-a3 | second browser: resume answers exactly `{"state":"none"}`; a pasted `resume=<quote>&pay=1` checkout page carries none of the first browser's contact data; an intent with a forged lock and a `supersedes` is refused and the booking stays pending |
| b1-b5 | second browser signed in as the same customer: `/api/checkout/me` is profile only, resume is still `none`, the account list and details hide the pending row (also after the claim linked it), the Data API with the customer's own token does not return it (G1) |
| c1-c3 | paid booking opens from its manage link in a fresh browser and resumes as `paid`; an unpaid booking's manage token answers 404 and sets no cookie |
| d1-d2 | a staff pay link opens with no cookie; without a Stripe test key d2 is N/A at the Stripe step only |

Known: a3 is refused with `payment_window_closed` on a stack with no settings version, which is checked before
the lock; the lock-versus-quote rule itself is pinned by `apps/web/lib/checkout/other-device.test.ts`.
Scenario 7 (rate limit) depends on the limiter state kept in `.wrangler/e2e`; it can fail or pass on a
re-run without any change.
