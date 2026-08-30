---
phase: 04-quote-pricing-engine
plan: 07
subsystem: crypto
tags: [hmac, canonical-json, quote-lock, vamos-qs, wrangler-bindings, webcrypto]

requires:
  - phase: 04-quote-pricing-engine
    provides: plan 04-01 vitest + fast-check + integer rounding kernel
provides:
  - Shared HMAC-SHA256 + canonical JSON + base64url primitive (hmac.ts)
  - Quote lock mint/verify with dual-secret kid rotation (lock.ts)
  - Signed vamos_qs visitor cookie mint/verify (vamos-qs.ts)
  - Full Phase 4 CloudflareEnv + wrangler binding surface (secrets optional owner-gated)
affects:
  - 04-09 rate book / lock deadline loader
  - 04-11 quote + reprice routes
  - 04-13 abuse / Turnstile / rate limit
  - 04-14 checkout intent verification ladder

tech-stack:
  added: []
  patterns:
    - one shared WebCrypto HMAC path; never a second implementation
    - secrets as function parameters (testable without env); env read at route boundary
    - oracle-free verifyLock failure object reused on every invalid branch
    - PRICING_PREVIEW staging-only; every read === "true"

key-files:
  created:
    - apps/web/lib/crypto/hmac.ts
    - apps/web/lib/crypto/hmac.test.ts
    - apps/web/lib/quote/lock.ts
    - apps/web/lib/quote/lock.test.ts
    - apps/web/lib/abuse/vamos-qs.ts
    - apps/web/lib/abuse/vamos-qs.test.ts
  modified:
    - apps/web/lib/env.d.ts
    - apps/web/wrangler.jsonc

key-decisions:
  - "LOCK_KID_CURRENT=v1 / LOCK_KID_PREVIOUS=v0; dual-verify previous only when secret bound"
  - "QuoteLockPayload types live in lock.ts until 04-02 types.ts merges (depends_on 04-01 only)"
  - "display_currency uses CurrencyCode from currency.ts so lock files stay CHF-literal-free"
  - "RateLimit ambient interface in env.d.ts — workers-types pin lacks it"
  - "QUOTE_ABUSE kv ids placeholder + TODO(04-13); no secrets in wrangler vars"

patterns-established:
  - "Pattern: MAC over base64url payload segment; never re-canonicalise attacker JSON"
  - "Pattern: verify via crypto.subtle.verify only (constant-time); manual MAC compare forbidden"
  - "Pattern: unverifiable vamos_qs → null → bare-IP 4/60 bucket, never fresh 8/60 identity"
  - "Pattern: mintLock takes exp; no wall-clock in lock.ts (Postgres authors deadline)"

requirements-completed: [QUOTE-04, QUOTE-09]

duration: 25min
completed: 2026-08-28
---

# Phase 04 Plan 07: HMAC lock + vamos_qs + Phase 4 bindings Summary

**Shared WebCrypto HMAC primitive, server-signed 30-minute quote lock with dual-secret rotation, signed visitor cookie, and the whole Phase 4 wrangler/env binding surface — unit-proven with no network, DB, or Cloudflare account**

## Performance

- **Duration:** ~25 min (resume from partial hmac)
- **Started:** 2026-08-28T12:08:00Z
- **Completed:** 2026-08-28T12:16:00Z
- **Tasks:** 3
- **Files modified:** 8

## Accomplishments

- One canonicalisation + one constant-time verify path for both signed artefacts (D-24, D-28, D-36)
- `mintLock` cannot author a deadline; six malformed tokens collapse to one deep-equal `invalid` result (oracle-free)
- Unverifiable `vamos_qs` returns `null` (missing-cookie semantics); cookie attrs constant for handlers
- Phase 4 bindings declared once: dual rate limiters, QUOTE_ABUSE KV, abuse metrics, owner-gated optional secrets, PRICING_PREVIEW staging-only

## Task Commits

Each task was committed atomically:

1. **Task 1: The shared HMAC primitive and canonical JSON** - `c19e98f` (feat)
2. **Task 2: The quote lock and the signed visitor cookie** - `ad152ab` (feat)
3. **Task 3: Declare every Phase 4 binding and secret, once** - `c6e4544` (feat)

**Plan metadata:** (this commit)

## Files Created/Modified

- `apps/web/lib/crypto/hmac.ts` — canonicalJson, base64url, signHmac, verifyHmac
- `apps/web/lib/crypto/hmac.test.ts` — table + fast-check key-order and mutation properties
- `apps/web/lib/quote/lock.ts` — mintLock / verifyLock / LOCK_KID_* / QuoteLockPayload
- `apps/web/lib/quote/lock.test.ts` — stability, expiry injection, dual-verify, oracle-free shapes
- `apps/web/lib/abuse/vamos-qs.ts` — mintVamosQs / verifyVamosQs / VAMOS_QS_COOKIE / VAMOS_QS_ATTRS
- `apps/web/lib/abuse/vamos-qs.test.ts` — bare UUID / wrong MAC / malformed → null
- `apps/web/lib/env.d.ts` — full Phase 4 CloudflareEnv members + ambient RateLimit
- `apps/web/wrangler.jsonc` — both envs: QUOTE_ABUSE, ratelimits 8/60 + 4/60, metrics, sentinel; staging PRICING_PREVIEW only

## Verification

```
pnpm typecheck                                          # exit 0
pnpm --filter web exec vitest run lib/crypto lib/quote lib/abuse
# Test Files  3 passed | Tests  34 passed | 0 skipped
```

Acceptance greps: no Date/Date.now in lock.ts; no crypto.subtle reimplementation in lock/vamos-qs; no secrets in wrangler vars; PRICING_PREVIEW never assigned under env.production; no CHF in lock sources or wrangler.

## Deviations from Plan

- **QuoteLockPayload types local to lock.ts** — plan read_first cites 04-02 `pricing/types.ts`; this worktree depends_on 04-01 only so VehicleClassSlug/QuoteMode-shaped unions are declared here until 04-02 merges. Field names match 04-CONTEXT specifics verbatim.
- **Ambient `RateLimit` interface** — pinned `@cloudflare/workers-types` has no RateLimit export; declared in env.d.ts to match platform API.

## Owner follow-ups (deferred, not blockers)

- `wrangler secret put QUOTE_LOCK_SECRET` / `VAMOS_QS_SECRET` (and optional PREVIOUS during rotation)
- `wrangler kv namespace create` for QUOTE_ABUSE real ids (plan 04-13)
- Lock-secret rotation runbook U58 (plan 04-14)

## Next

- 04-08 quote request schema (structural refusal of client price inputs)
- 04-09 loaders + mintLockDeadline from Postgres
- 04-11 routes that call mintLock / verifyLock at the boundary
