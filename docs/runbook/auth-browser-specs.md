# Auth browser specs (auth-flows, auth-confirm-email)

Since Phase 27 a sign-up writes the account agreement record (26.5 table, surface `sign-up`) through
the Worker database binding before Supabase is called. `next dev` gets that binding only through the
opt-in dev switch `VAMOS_DEV_WRANGLER_ENV=staging` (set by the specs themselves) plus a local
connection string built from `VAMOS_TEST_DB_PORT`.

- `VAMOS_TEST_DB_PORT` is required. Without it the specs stop at once with a message. (Without the
  guard, the staging `localConnectionString` in `apps/web/wrangler.jsonc` carries a placeholder
  password and every sign-up would answer 503.)
- Default local stack: `VAMOS_TEST_DB_PORT=54322 VAMOS_TEST_MAIL_PORT=54324`.
- A port-shifted stack: its own ports, plus `VAMOS_TEST_SUPABASE_WORKDIR=<its workdir>` so
  `supabase status` reads the right stack. Auth mail must land in Mailpit (hook off).
- Run the two files one after the other, not in parallel: both start `next dev` in `apps/web/.next`.
- A `next dev` run rewrites `apps/web/tsconfig.json` and `apps/web/next-env.d.ts`; restore them.

Example (default stack, from `apps/web`):

    VAMOS_TEST_DB_PORT=54322 VAMOS_TEST_MAIL_PORT=54324 pnpm exec playwright test tests/integration/auth-flows.spec.ts --workers=1

The product proof of the sign-up record stays the Worker auth e2e (`docs/runbook/auth-worker-e2e.md`).
