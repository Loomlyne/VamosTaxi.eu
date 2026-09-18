# Phase 19 — Patterns

- Fail closed on quota: existing `rate_limited` 429 family (`lib/quote/errors.ts`, `lib/abuse/rate-limit.ts`).
- Wait-room already exists from Phase 7 (voucher or error, Stripe native link). Reuse; do not invent a surge dashboard.
- Hyperdrive: wrangler bind only. Owner `wrangler hyperdrive` / dashboard. Agent does not buy.
- Worker name `vamos`. `--env staging`.
- Public CHF belt: `settings.public_chf` / Publish. Not `rate_versions`.
- Leftover 17 is a different phase’s live close; do not fold deploy/SQL into 19 execute tasks.
