# Local funnel harness — phase 26.3

How an agent runs the hosted-Stripe booking funnel on this Mac with no network and no live data. Test code only: nothing here ships in the Worker.

## Must nots

1. Never add a `/dev` route or a middleware bypass. `/dev` stays 404 on https://vamostaxi.site. `apps/web/lib/dc-mock-urls.ts` stays unchanged.
2. Never put a Stripe key in a file, a spec, a fixture or chat. Never use a live key.
3. Never point local runs at the live Supabase project or at the 5432x stack. This harness uses the port-shifted stack on 5532x only.
4. States galleries render from Playwright specs only, never from a Worker route.

## 1. Install

1. `CI=true pnpm install --frozen-lockfile`

## 2. Database (port-shifted stack, 5532x)

1. `bash scripts/local-stack-263.sh start`
2. Fresh schema: `bash scripts/local-stack-263.sh reset` (only the plan that owns the reset runs it).
3. Apply one migration file: `bash scripts/local-stack-263.sh migrate`
4. pgTAP: `bash scripts/local-stack-263.sh test`
5. Connection string: `OPS_FIXTURE_DB_URL=$(bash scripts/local-stack-263.sh url)` (postgres on 127.0.0.1:55322).

## 3. Sync the mocks, then run Playwright

1. `node scripts/sync-dc-mock-to-public.mjs`
2. `cd apps/web && pnpm exec playwright test <spec> --project=component-1440`
3. Specs that need the app boot `next dev` themselves through `tests/support/server-harness.ts`. Running `pnpm dev` from Bash hits EPERM in the sandbox. To watch a page, use the preview pane with a temporary, gitignored `launch.json`.

## 4. Fake Stripe

1. `installFakeStripe(page, { outcome: "paid" | "cancel" | "unpaid" })` from `apps/web/tests/support/fake-stripe.ts`.
2. It answers `/api/checkout/intent` with a `url` on `https://checkout.stripe.com/c/pay/cs_test_fake_<n>`, and serves a page with PAY and BACK buttons that go to the success or cancel URL.
3. `returnRoute: true` mocks `/api/checkout/return`; `status: [...]` mocks `/api/checkout/status/*` (pending, then confirmed, or never confirmed).
4. Read endpoints (quote, extras, price, resume, me) come from `tests/support/checkout-fixtures.ts`.

## 5. Optional: one real sandbox run

The owner does these in his own terminal. The agent never sees the key.

1. Put your Stripe test key in `apps/web/.dev.vars` (file is gitignored).
2. `stripe login`, and pick the test account `acct_1UIZmqHcNp9GZYjz`.
3. `stripe listen --forward-to http://127.0.0.1:<port>/api/stripe/webhook`
4. Leave `RESEND_API_KEY` empty locally so no mail is sent.
5. Pay once with a Stripe test card in a browser and check the booking reads paid.
