# Phase 19 — Validation

Nyquist sampling. `<automated>` is `apps/web` `lib/**/*.test.ts` only.

| Task | Requirement | Automated | Manual |
|------|-------------|-----------|--------|
| 19-01 T1 | D-07 D-08 D-09 | vitest: 429 has next step; quote limiter bindings still 8/60 and 4/60; no `CHF` invented in fail-closed path | — |
| 19-01 T2 | D-13 D-14 | source-read: no new public screen route for load-test; home wipe still present | — |
| 19-02 T1 | D-04 D-05 D-06 | — | Owner: paid Hyperdrive bound to Worker `vamos`; paste Stripe test + Mapbox quota |
| 19-03 T1 | D-01 D-02 D-03 | — | After 17-C + D-04: 10k concurrent test-Stripe checkouts on `vamostaxi.site`. No public load URL |
| 19-03 T2 | D-10 D-11 D-12 | — | Confirm no Publish, no `.eu`, no `sk_live_`, no `db push` |

## Validation Architecture

- Unit tests live under `apps/web/lib/**/*.test.ts`.
- Do not use `tests/integration/*.spec.ts`.
- Load proof is owner-gated, not CI.
