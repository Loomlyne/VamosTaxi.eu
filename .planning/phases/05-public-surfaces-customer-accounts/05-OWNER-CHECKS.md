# Phase 05 owner checks

Record of dashboard-gated work for plan 05-24. Names and dates only — never paste secrets (`eyJ`, `whsec_`, `re_`, `0x4AAAA`).

Become a Partner is out of V1. SITE-04 / D-24 live checks use the **contact** form only. `/api/partner-application` does not exist.

| Check | Date | Who | Observed value | Action |
| --- | --- | --- | --- | --- |
| D-28 Confirm email (local `config.toml`) | 2026-08-30 | agent | `packages/db/supabase/config.toml` L230 and L265: `enable_confirmations = false`. Agent must not edit this file. | Spec `auth-confirm-email.spec.ts` committed. Expected **red** until confirmations are on. Negative control is the current local state (Confirm email off → no Mailpit message / `signedIn: false` after signup fails the durable assertion). Hosted dashboard before/after still open (Task 2). |
| D-28 Confirm email (hosted Supabase) | 2026-08-30 | owner | Confirm email **ON** (screenshot). | Recorded. Local `config.toml` still `enable_confirmations = false` (agent must not edit). |
| D-27 Send Email Hook | 2026-08-30 | owner | not registered | **Deferred until domain is purchased.** Do not register against `*.workers.dev` as a workaround. JWT claims hook already enabled — leave it. |
| D-27 hook reachability (Check A) | 2026-08-30 | owner | not run | Deferred with the domain. |
| D-24 Turnstile | 2026-08-30 | owner | not provisioned | **Deferred until domain is purchased.** |
| D-24 per-action reporting (Check B) | 2026-08-30 | owner | not run | Deferred with Turnstile. Contact form only when it runs. |
| Resend account | 2026-08-30 | owner | API key put on staging Worker | Sender domain deferred until the zone exists. |
| SITE-04 inbox half (Check C) | 2026-08-30 | owner | not run | Needs live Turnstile + hook/domain. Deferred. |
| Secrets on staging Worker | 2026-08-30 | owner | `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `RESEND_API_KEY` set | Hook + Turnstile secrets wait for domain. |
| Decision: coming-soon.dc.html | — | owner | still in `PUBLIC_ROUTES`, unowned, no requirement id (05-23) | Task 3: build, drop from `PUBLIC_ROUTES`, or leave listed and unbuilt? |
| Decision: AuthForm passkey | — | owner | not built (05-07 / D-19 same reasoning as PhoneVerify) | Task 3: accept V2 deferral, or add a requirement? |
| Decision: notification bell | — | owner | deferred (05-20); no notification table before Phase 7 | Task 3: accept Phase 7+ deferral, or name another data source? |
| Decision: signup email-enumeration | — | owner | Phase 5 ships non-distinguishing response; mock `registered` banner still built | Task 3: accept, or restore distinguishing banner (server-side only)? |
| Open: `vamostaxi.eu` DNS/zone | — | — | open (05-CONTEXT deferred, ADR-014 §7). Live DNS frozen until Phase 11. | Restated open. Not closed here. |
| Open: Qurova webfont licence | — | — | open | Restated open. Not closed here. |
| Open: imprint street/postcode | — | — | TBC pills stay. Do not invent. | Restated open. Not closed here. |
| Flag: 04-UI-SPEC Assumption 5 | 2026-08-30 | owner (05-22) | option-b: `quote.none_fit` / `quote.moved_to` on the same charcoal status strip. Precedence: none_fit > moved_to > saved > ready > needs-a-trip. | Owner should back-fill 04-UI-SPEC.md. Not edited from Phase 5. |
