# Phase 19 — Validation (rewritten 2026-09-29)

| Plan | Decision | Automated | Manual / owner |
|---|---|---|---|
| 19-01 | D-07 D-08 D-13 | vitest `lib/surge`, `lib/abuse`, `lib/checkout`: switches refused unless DEPLOY_ENV surge; `env.staging` still 8/60 4/60; `check:public-env` | — |
| 19-02 | D-09 D-14 | vitest intent `busy` 503 + client retry helper; `i18n:check`; `lint:css` | Screenshots en/ar at 1440/1024/768/390 |
| 19-03 | D-04 D-05 D-06 D-10 D-11 | — | **Owner: Workers Paid**; copy project; Hyperdrive ids; secrets; deploy surge on "deploy surge" |
| 19-04 | D-01 D-02 D-03 D-08 | `node --check` scripts | Runs on "start"; `verify-copy.sql` numbers in 19-SURGE-REPORT |
| 19-05 | D-12 D-13 | guard test on main | Owner deletes copy; readback table |

Unit tests live in `apps/web/**/*.test.ts`. Load proof is owner-gated, never CI, never on vamostaxi.site.
