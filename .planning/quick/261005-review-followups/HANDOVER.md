# Hand-over: review follow-ups (U15 other order, M18 label, S6/D-34 tests, S12 poll)

Work session (not control), 2026-10-05, finished 17:05 +04. Source: the independent review (Fable) of today's two ships, security hardening `43fba58d` and money/database hardening `5aa3ddd0`.

- Branch `fix/review-followups`, cut from `origin/main` `2ef8bc03`. `origin/main` had not moved when this was written (fetched 17:03), so the merge is a no-op.
- Commits: `10217013` A, `e50e076f` B, `3c0ba37f` C, `a2ee4f96` D, `9d85420f` fence fix for B's test, then this hand-over.
- No migration, no live write, no deploy, no Stripe/Cloudflare/GitHub settings, no wrangler change. `database.types.ts` unchanged.
- App code changed: `apps/web/lib/checkout/settle.ts` (A), the Publish route (B), `ConfirmationClient.tsx` plus new `apps/web/lib/checkout/status-poll.ts` (D). C is tests only.

## A. U15, the other arrival order (money path, no money effect)

- Cause: `apps/web/lib/checkout/return-settle.ts:94` stamps the return event `return_<cs>` with `session.created`, always older than the webhook event. Webhook first: the webhook settles and is stamped processed; `stripe_event_begin` (`20260827000004_settlement_rpcs.sql`, the `exists (... processed_at is not null and stripe_created > p_stripe_created)` branch) then answers `superseded` for the return event; `settle.ts` acked it without stamping, so its `stripe_events` row stayed unprocessed for good. The 310000 pgTAP test missed this because both its events carry the same `stripe_created`.
- Fix: `settle.ts:~338`, on `admission.reason === "superseded"` the event is stamped with `eventSettle(id, null)` before the ack. Only that reason: `already_processed` is already stamped, and a paid error never reaches that branch (it retries). If the stamp itself throws, the message is retried (begin answers `superseded` again). No migration. Note: any superseded event is stamped, including a charge/dispute event; before, those were acked and left unprocessed, the ack is unchanged and nothing in the app reads unprocessed rows (no sweep exists in app code).
- Test: `settle.test.ts` "261005 U15: a superseded event is closed" (4 cases; 2 fail on the old code). `apps/web/lib/checkout/return-settle-superseded.local.test.ts` runs both orders through the real `handleStripeMessage` (real `begin()`, real `settlePaidReturn`, real `recordStripeEvent`) on the lab: payment succeeded once, booking confirmed, event count unchanged by the second delivery, confirmation mail called once, both rows processed. Webhook-first fails on the old `settle.ts` ("expected false to be true" on the return row), passes now; return-first passes on both.
- Corrected the claim in `.planning/quick/261005-money-db-hardening/HANDOVER.md` with one added line under U15.
- Verified: unit, local lab test (before/after), full `lib/checkout` folder. Not verified: a real Stripe webhook plus return through the queue on live.

## B. M18, Publish keeps the draft's label on the live book

- Cause: the Publish route stripped " draft" only for the `settings_versions` insert (`.../rate-versions/[id]/publish/route.ts`, `publishLabel`), not for the `rate_versions` UPDATE that flips the row live (`:133`), so the live book kept "... draft".
- Fix: `publishLabel` is computed once before the flip and the same UPDATE sets `label = coalesce(nullif(${publishLabel}, ''), label)`. A label that is only "draft" is kept (the column is not null). No data migration; rows already live keep their labels.
- Test: `apps/web/lib/ops/publish-label.local.test.ts` runs the real route handler on the lab (admin check, unpaid mail, photo sweep and extras prune replaced): a draft labelled "<base> draft draft draft" publishes as "<base>" in `rate_versions` and `settings_versions`, the retired book keeps its own label; a draft labelled "draft" keeps it. The first case fails on the old route ("... draft draft draft" received). Source guard in `rate-version-label.test.ts` (runs without a database, fails on the old route). Whole `lib/ops` folder: 128 files pass.
- Verified: local lab test (before/after), unit, folder. Not verified: Publish on live.
- Seen, not touched: `apps/web/app/[locale]/(ops)/ops/pricing/actions.ts` `publishRateVersion` also flips a row live (without the settings row or the label) but nothing calls it. Dead code; delete or leave to a later job.

## C. Tests only

- (1) `packages/db/supabase/tests/quote_read_rpc.test.sql`: added (3d) (3e) (3f), `vamos_checkout` selecting `rate_versions`, `surcharges`, `settings_versions` raises 42501; plan 22 to 25. Full pgTAP suite on the lab: `Files=108, Tests=3027`, PASS (was 3024).
- (2) `apps/web/lib/quote/engine.test.ts`: a book coupon `{ id, kind, percent, active }` with no `code` still prices the voucher by its coupon id; a codeless coupon with another id never stands in for it (not_found). Both pass today; mutation check: changing `couponOnBook` to match by code only fails the first. No product code changed, so there is no failing-before run for C.

## D. S12, the confirmation poll against READ_RATE_LIMITER

- Cause: `ConfirmationClient.tsx:48` polled once a second (60 a minute) against 120 a minute per address and route; on a 429 the client read the `{visible:false}` body as "nothing new" and asked again a second later.
- Route side: already correct. `app/api/checkout/status/[ref]/route.ts:45` answers HTTP 429 with `retry-after: 60` and `cache-control: private, no-store` (body kept `{visible:false}` for an old cached client). No route change; its test now pins the header and that the client turns it into a 60 s wait.
- Fix (client only, no wrangler change): `POLL_INTERVAL_MS` 2000 (30 a minute per tab). A 429 waits for its `Retry-After` (whole seconds, clamped to 2..60 s, 15 s when absent or unreadable) plus up to 2 s spread; a hidden-then-shown tab respects that floor too. The 429 body is not parsed. Pure helpers in new `apps/web/lib/checkout/status-poll.ts`; `ConfirmationClient.tsx` re-exports `POLL_INTERVAL_MS`.
- Test: `status-poll.test.ts` (6: cadence, back-off, clamp, fallback, client source), `lib/abuse/read-rate-limit.test.ts` (route side), and a new Playwright case in `tests/integration/confirmation-poll.spec.ts`: 429 with Retry-After 30, one request inside the window, then the poll resumes and the confirmation swaps in, no error copy. It fails on the old client (2 requests, expected 1). The other six cases of that spec still pass with the 2 s cadence (7/7, 50.8 s).
- Playwright note: this Mac lacks the headless shell for Playwright 1.62.1, so the spec ran through a throwaway config using the cached full Chromium (`channel: "chromium"`); the config is deleted, nothing downloaded. A normal `pnpm test:visual` run on a machine with the browsers installed is unaffected.
- Not changed on purpose: `PAY_LINK_POLL_INTERVAL_MS = 1000` in `lib/checkout/pay-client-states.ts` (no caller, its own test pins 1000).
- Verified: unit, Playwright. Not verified: behaviour behind the real Cloudflare binding; the window is fixed (60 s) and the route is unchanged, so only the client's reaction was exercised.

## Checks (2026-10-05, tree at `9d85420f` plus this file)

| Check | Result |
|---|---|
| `lab.sh pgtap` (native, full reset) | PASS, Files=108, Tests=3027 |
| Local lab tests (`return-settle-superseded`, `publish-label`) | 4/4, run before and after the pgTAP reset |
| Playwright `confirmation-poll.spec.ts` (component-1440) | 7/7 |
| `pnpm typecheck` | pass |
| `pnpm lint` | 0 errors, 6 warnings (files not in this job) |
| `pnpm check:numbers` | ok |
| `pnpm check:db-fences` | 8/8 (first run failed on a raw `postgres` import in my new test; fixed in `9d85420f`) |
| `pnpm i18n:check` | 2709 keys, pass (no strings changed) |
| `pnpm test:unit` (full) | apps/web 441 files pass, 20 skipped, 5198 tests pass, 41 skipped; packages/db 14; packages/emails 247. No timeout flake this run |

Lab: made with the lab's own functions for the stack only (`lab.sh up` also builds and starts the Worker; these tests need only the database), driven by `lab.sh pgtap`, then `lab.sh destroy rf-a`. No Worker was built (no `.open-next`), the throwaway `.next-confirmation-poll` and `test-results` folders and the dev-server edits to `next-env.d.ts` and `tsconfig.json` were removed.

## For the controller

1. No migration, so ship order does not matter; A, B, D are Worker code (deploy needed), C is tests.
2. After deploy, the live book's label only changes at the next Publish; the current live row keeps whatever it carries.
3. Left over: nothing from the brief. Open from the earlier hand-over and not in this brief: questions 2 to 8 of `261005-money-db-hardening/HANDOVER.md`.
