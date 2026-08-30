# Phase 05 owner checks

Record of dashboard-gated work for plan 05-24. Names and dates only — never paste secrets (`eyJ`, `whsec_`, `re_`, `0x4AAAA`).

Become a Partner is out of V1. SITE-04 / D-24 live checks use the **contact** form only. `/api/partner-application` does not exist.

| Check | Date | Who | Observed value | Action |
| --- | --- | --- | --- | --- |
| D-28 Confirm email (local `config.toml`) | 2026-08-30 | agent | `packages/db/supabase/config.toml` L230 and L265: `enable_confirmations = false`. Agent must not edit this file. | Spec `auth-confirm-email.spec.ts` committed. Expected **red** until confirmations are on. Negative control is the current local state (Confirm email off → no Mailpit message / `signedIn: false` after signup fails the durable assertion). Hosted dashboard before/after still open (Task 2). |
| D-28 Confirm email (hosted Supabase) | — | owner | not yet read | Task 2: record BEFORE, set ON if off, record AFTER. |
| D-27 Send Email Hook | — | owner | not registered | Task 2: register against staging Worker `https://vamos-web-staging.koussayzayeni.workers.dev/api/auth/email-hook`. Record stated timeout. Secret via `wrangler secret put SEND_EMAIL_HOOK_SECRET --env staging` only. |
| D-27 hook reachability (Check A) | — | owner | not run | Task 3: one real signup, locale-correct email, round-trip vs timeout. If `*.workers.dev` unreachable from Supabase, escalate `vamostaxi.eu` DNS/zone — no app workaround. |
| D-24 Turnstile | — | owner | not provisioned | Task 2: one managed/invisible widget. Site key + secret via wrangler secret, not `vars`. |
| D-24 per-action reporting (Check B) | — | owner | not run | Task 3: contact form only (`action=contact`). Become-a-partner form deleted; do not rebuild it. If dashboard cannot distinguish actions, record that — do not add a second pair for a deleted funnel. |
| Resend account | — | owner | not created this sitting | Task 2: API key via `wrangler secret put RESEND_API_KEY --env staging`. Sender domain `vamostaxi.eu` blocked on zone (open). Record usable sender until then. |
| SITE-04 inbox half (Check C) | — | owner | not run | Task 3: contact submission reaches inbox **and** `contact_submissions` row. No submitted value in HTTP body. Partner form N/A. |
| Secrets on staging Worker | — | owner | not listed this sitting | Task 2: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SEND_EMAIL_HOOK_SECRET`, `RESEND_API_KEY`, `TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY` via `wrangler secret put --env staging`. Confirm with `wrangler secret list`. |
| Decision: coming-soon.dc.html | — | owner | still in `PUBLIC_ROUTES`, unowned, no requirement id (05-23) | Task 3: build, drop from `PUBLIC_ROUTES`, or leave listed and unbuilt? |
| Decision: AuthForm passkey | — | owner | not built (05-07 / D-19 same reasoning as PhoneVerify) | Task 3: accept V2 deferral, or add a requirement? |
| Decision: notification bell | — | owner | deferred (05-20); no notification table before Phase 7 | Task 3: accept Phase 7+ deferral, or name another data source? |
| Decision: signup email-enumeration | — | owner | Phase 5 ships non-distinguishing response; mock `registered` banner still built | Task 3: accept, or restore distinguishing banner (server-side only)? |
| Open: `vamostaxi.eu` DNS/zone | — | — | open (05-CONTEXT deferred, ADR-014 §7). Live DNS frozen until Phase 11. | Restated open. Not closed here. |
| Open: Qurova webfont licence | — | — | open | Restated open. Not closed here. |
| Open: imprint street/postcode | — | — | TBC pills stay. Do not invent. | Restated open. Not closed here. |
| Flag: 04-UI-SPEC Assumption 5 | 2026-08-30 | owner (05-22) | option-b: `quote.none_fit` / `quote.moved_to` on the same charcoal status strip. Precedence: none_fit > moved_to > saved > ready > needs-a-trip. | Owner should back-fill 04-UI-SPEC.md. Not edited from Phase 5. |
