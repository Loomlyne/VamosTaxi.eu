---
phase: 2
slug: data-schema-rls-staff-auth-foundations
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-08-23
---

# Phase 2 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | pgTAP, run via `supabase test db` (Supabase CLI — pinned in Wave 0 as an exact-version devDependency, `pnpm add -D -w supabase`; CI mirrors the pin with `supabase/setup-cli@v1`) |
| **Config file** | `packages/db/supabase/config.toml` — none exists yet; Wave 0 creates it with `supabase init` |
| **Quick run command** | `supabase test db <path>` — confirmed by `research/local-toolchain-probe.md` (Probe 1b): the CLI's `<path...>` argument accepts one or more test-file or directory paths, so a single new test is authored against `supabase test db supabase/tests/<name>.test.sql` (wrapped by every plan as `pnpm --filter @vamos/db run test:db supabase/tests/<name>.test.sql`) |
| **Full suite command** | `supabase db reset && supabase test db` |
| **Estimated runtime** | ~30–60 seconds (local Postgres reset + migration replay + pgTAP pass) — no measured baseline yet |

---

## Sampling Rate

- **After every task commit:** Run `supabase test db`
- **After every plan wave:** Run `supabase db reset && supabase test db`
- **Before `/gsd:verify-work`:** Full suite must be green, plus the `pr.yml` CI job (`db reset` → `test db` → `gen types typescript --local` + `git diff --exit-code`) green on the phase's final PR
- **Max feedback latency:** ~60 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 02-01-01 | 02-01 | 1 | DATA-01, DATA-07 (infra gate) | T-02-SC | Human legitimacy check on the `supabase` npm package before the one `pnpm add` this phase performs | manual | (human-check, no automated command — see Manual-Only Verifications) | ❌ | ⬜ pending |
| 02-01-02 | 02-01 | 1 | DATA-01, DATA-07 | T-02-17 | Supabase project moved to `packages/db`, CLI pinned exact, every CLI call bound to a package script, stack resets from zero | shell | `test ! -d supabase && test -f packages/db/supabase/config.toml && [ "$(ls packages/db/supabase/migrations 2>/dev/null \| grep -c baseline)" = "0" ] && [ "$(grep -c 'project_id = "vamos-taxi"' packages/db/supabase/config.toml)" = "1" ] && [ "$(cat packages/db/supabase/.temp/project-ref)" = "yaumjzvylngfjhtuffqs" ] && [ "$(pnpm --filter @vamos/db exec supabase --version)" = "2.115.0" ] && pnpm db:reset` | ❌ | ⬜ pending |
| 02-01-03 | 02-01 | 1 | DATA-01, DATA-07 | — | Every build doc naming the Supabase region says Zurich with a dated D-37 amendment; R2 jurisdiction (D-24) and the three CI secrets are written down | static (docs) | `grep -c "yaumjzvylngfjhtuffqs" docs/build/SUPABASE-RESOURCES.md .planning/PROJECT.md .planning/ADR-007-edge-data-residency.md \| awk -F: '{if($2<1)exit 1}' && grep -c "jurisdiction eu" docs/build/CLOUDFLARE-RESOURCES.md && grep -c "SUPABASE_DB_PASSWORD" docs/build/GSD-LAUNCH.md docs/build/SUPABASE-RESOURCES.md \| awk -F: '{if($2<1)exit 1}'` | ❌ | ⬜ pending |
| 02-02-01 | 02-02 | 2 | DATA-01, DATA-02, DATA-03, DATA-04 | T-02-19 | Extensions, roles (passwordless, guarded) and the rappen domain exist from a zero reset, twice | pgTAP | `pnpm db:reset && pnpm db:reset && [ "$(grep -c 'to vamos_edge with inherit false, set true' packages/db/supabase/migrations/20260823000002_roles_and_helpers.sql)" = "4" ] && [ "$(grep -v '^\s*--' packages/db/supabase/migrations/20260823000002_roles_and_helpers.sql \| grep -ci "password '")" = "0" ] && [ "$(grep -c 'create domain rappen as integer check (value >= 0)' packages/db/supabase/migrations/20260823000003_types.sql)" = "1" ]` | ❌ | ⬜ pending |
| 02-02-02 | 02-02 | 2 | DATA-01, DATA-02, DATA-03, DATA-04 | T-02-01 | Foundation proven by pgTAP: transaction-local identity (D-01) and the grant shape (D-02) both hold | pgTAP | `pnpm db:reset && pnpm db:test` | ❌ | ⬜ pending |
| 02-03-01 | 02-03 | 3 | DATA-01 | — | Settings split and fleet tables exist with the D-35 column set; no policy number or CHF amount in a migration | shell | `pnpm db:reset && [ "$(grep -c 'round_trip_discount_percent' packages/db/supabase/migrations/20260823000004_settings.sql)" -ge 1 ] && [ "$(grep -c 'create table public\.' packages/db/supabase/migrations/20260823000005_fleet.sql)" = "3" ]` | ❌ | ⬜ pending |
| 02-03-02 | 02-03 | 3 | AUTH-05, DATA-01 | T-02-03 | SQL half of AUTH-05 proven: role claim derived from `staff` on every mint, aal2 enforced in SQL, customers redact-only | pgTAP | `pnpm db:reset && pnpm db:test` | ❌ | ⬜ pending |
| 02-03-03 | 02-03 | 3 | DATA-01 | T-02-10 | All seven DATA-01 reference tables exist from a zero reset; shape (incl. D-35 columns) asserted by pgTAP | pgTAP | `pnpm db:reset && pnpm db:test` | ❌ | ⬜ pending |
| 02-04-01 | 02-04 | 4 | DATA-01 | T-02-23 | Versioned pricing matrix shape exists with its two triggers and one-live index; every priced column nullable | shell | `pnpm db:reset && [ "$(grep -c 'create unique index rate_versions_one_live' packages/db/supabase/migrations/20260823000008_rate_versions.sql)" = "1" ] && [ "$(grep -v '^\s*--' packages/db/supabase/migrations/20260823000008_rate_versions.sql \| grep -cE 'rappen[^,]*default [0-9]')" = "0" ]` | ❌ | ⬜ pending |
| 02-04-02 | 02-04 | 4 | DATA-01 | T-02-07 | QUOTE-10 publish gate and QUOTE-05 freeze trigger proven by pgTAP; coupons exist, redemptions deferred | pgTAP | `pnpm db:reset && pnpm db:test && [ "$(grep -v '^\s*--' packages/db/supabase/migrations/20260823000009_coupons.sql \| grep -c 'create table public.coupon_redemptions')" = "0" ]` | ❌ | ⬜ pending |
| 02-04-03 | 02-04 | 4 | DATA-01 | T-02-22 | Every price-line and surcharge label exists as a four-language ICU message; coverage gate stays green | static (i18n) | `pnpm i18n:check && node -e "for(const l of ['en','de','fr','ar']){const m=require('./apps/web/i18n/messages/'+l+'.json');const p=m.price;if(!p \|\| !p.line \|\| !p.surcharge)process.exit(1);for(const c of ['airport_pickup','night','waiting_airport','waiting_city','extra_stop','child_seat','meet_greet','ski_rack']){if(!p.surcharge[c] \|\| !p.surcharge[c].label \|\| !p.surcharge[c].rule)process.exit(2)}for(const k of ['transfer','fixed_route','coupon','round_trip_discount','total'])if(!p.line[k])process.exit(3)}"` | ❌ | ⬜ pending |
| 02-05-01 | 02-05 | 5 | DATA-01 | T-02-13 | Bookings exist in the post-ADR-014 shape; per-year reference generator proven and locked to `service_role` | pgTAP | `pnpm db:reset && pnpm db:test && [ "$(grep -v '^\s*--' packages/db/supabase/migrations/20260823000010_bookings.sql \| grep -cE 'price_chf \| manage_token \| assigned_chauffeur_id \| return_at')" = "0" ]` | ❌ | ⬜ pending |
| 02-05-02 | 02-05 | 5 | DATA-01 | T-02-09 | OPS-03's exclusion constraint is real on day one, proven with the exact error codes Phase 8 will catch | pgTAP | `pnpm db:reset && pnpm db:test && [ "$(grep -c 'deferrable initially immediate' packages/db/supabase/migrations/20260823000011_booking_legs.sql)" = "2" ]` | ❌ | ⬜ pending |
| 02-05-03 | 02-05 | 5 | DATA-01, DATA-03 | T-02-05 | Manage-token surface exists in the D-15 shape; read helper and atomic mutation both locked to `vamos_guest` | pgTAP | `pnpm db:reset && pnpm db:test && [ "$(grep -c 'grant execute on function public.manage_booking_cancel(bytea, smallint) to vamos_guest' packages/db/supabase/migrations/20260823000012_booking_access_tokens.sql)" = "1" ]` | ❌ | ⬜ pending |
| 02-06-01 | 02-06 | 6 | DATA-01 | — | Snapshot shape exists and refuses a snapshot without policy, lines array, or a half-priced amount set; forged live flag overwritten | pgTAP | `pnpm db:reset && pnpm db:test && [ "$(grep -c 'add constraint bookings_price_snapshot_fk' packages/db/supabase/migrations/20260823000013_price_snapshots.sql)" = "1" ]` | ❌ | ⬜ pending |
| 02-06-02 | 02-06 | 6 | DATA-01 | T-02-07 | Charge gate holds in every refusal case pgTAP can express; payments whitelist holds; coupon consumed by a payment row (D-29) | pgTAP | `pnpm db:reset && pnpm db:test && [ "$(grep -c 'references public.booking_payments(id)' packages/db/supabase/migrations/20260823000015_coupon_redemptions.sql)" = "1" ]` | ❌ | ⬜ pending |
| 02-07-01 | 02-07 | 7 | DATA-01 | T-02-10 | Both audit halves exist: app-written `booking_events` timeline and trigger-written `audit_log` over 15 tables, proven by pgTAP | pgTAP | `pnpm db:reset && pnpm db:test && [ "$(docker exec supabase_db_vamos-taxi psql -U postgres -tAc "select count(*) from pg_trigger where tgname like 'audit\\_%' and not tgisinternal")" = "15" ]` | ❌ | ⬜ pending |
| 02-07-02 | 02-07 | 7 | DATA-01 | T-02-08, T-02-49, T-02-50, T-02-51 | Seven evidence tables (the drafted six + `settings_versions`, F-02) cannot be mutated OR truncated by any role incl. `service_role`/`postgres` (F-03); `stripe_events`/`booking_notifications` lose DELETE and TRUNCATE but keep the handler's UPDATE (F-11); consent recorded only via the definer function | pgTAP | `pnpm db:reset && pnpm db:test && [ "$(grep -c 'force row level security' packages/db/supabase/migrations/20260823000019_append_only.sql)" = "9" ]` | ❌ | ⬜ pending |
| 02-07-03 | 02-07 | 7 | DATA-03 | T-02-31 | D-16 mutation door proven end to end: one atomic check-and-act, one generic error, one event row per state change | pgTAP | `pnpm db:reset && pnpm db:test` | ❌ | ⬜ pending |
| 02-08-01 | 02-08 | 8 | DATA-02 | T-02-02 | RLS on everywhere, grant slate clean; DATA-02 and the D-02 fail-closed baseline proven | pgTAP | `pnpm db:reset && pnpm db:test && [ "$(grep -v '^\s*--' packages/db/supabase/migrations/20260823000021_rls_customer.sql \| grep -n 'revoke all on all tables in schema public' \| head -1 \| cut -d: -f1)" -lt "$(grep -v '^\s*--' packages/db/supabase/migrations/20260823000021_rls_customer.sql \| grep -n '^grant' \| head -1 \| cut -d: -f1)" ]` | ❌ | ⬜ pending |
| 02-08-02 | 02-08 | 8 | DATA-03, DATA-04, AUTH-05 | T-02-04 | DATA-03 and DATA-04/AUTH-05's RLS half proven: guest sees one booking by token, customer gets 42501 on ops data, dispatcher needs aal2, ledger unwritable, `staff_admin_write` enforced | pgTAP | `pnpm db:reset && pnpm db:test && [ "$(grep -c 'with check (false)' packages/db/supabase/migrations/20260823000023_rls_staff.sql)" -ge 3 ]` | ❌ | ⬜ pending |
| 02-08-03 | 02-08 | 8 | DATA-04 | T-02-33 | Public content readable by the cacheable identity and nothing else; raw settings stay locked; 24-migration set resets from zero twice, 22 pgTAP files pass | pgTAP | `pnpm db:reset && pnpm db:reset && pnpm db:test` | ❌ | ⬜ pending |
| 02-09-01 | 02-09 | 9 | DATA-07 | T-02-23 | Fresh environment seeds nine tables with confirmed ADR-014 values and nothing invented; seeding again changes no row count (D-27) | pgTAP | `pnpm db:seed:gen && pnpm db:seed:check && pnpm db:reset && pnpm db:test && [ "$(grep -v '^\s*--' packages/db/supabase/seed.sql \| grep -ciE "(rappen \| percent)[^,)]*[0-9]")" = "0" ]` | ❌ | ⬜ pending |
| 02-09-02 | 02-09 | 9 | DATA-01 | T-02-37 | Types committed and drift-checked; PR gate proves the stack from zero without secrets; deploys push migrations + seed before the Worker | static (types/CI) | `pnpm db:types:check && [ "$(grep -c 'supabase/setup-cli@ab058987d8d6c725971f6cf9d0b5c98467e30bd1' .github/workflows/pr.yml .github/workflows/deploy-staging.yml .github/workflows/deploy-production.yml \| awk -F: '{s+=$2} END{print s}')" = "3" ] && ruby -ryaml -e 'ARGV.each{\|f\| YAML.load_file(f)}' .github/workflows/pr.yml .github/workflows/deploy-staging.yml .github/workflows/deploy-production.yml` | ❌ | ⬜ pending |
| 02-09-03 | 02-09 | 9 | DATA-01, DATA-07 | — | [BLOCKING] Full 24-migration schema + seed applies from zero twice with identical counts; all 23 pgTAP files pass; both drift gates green | pgTAP | `pnpm db:stop; pnpm db:start && pnpm db:reset && docker exec supabase_db_vamos-taxi psql -U postgres -tAc "select relname, n_live_tup from pg_stat_user_tables order by 1" > /tmp/vt-counts-1.txt && pnpm db:reset && docker exec supabase_db_vamos-taxi psql -U postgres -tAc "select relname, n_live_tup from pg_stat_user_tables order by 1" > /tmp/vt-counts-2.txt && diff /tmp/vt-counts-1.txt /tmp/vt-counts-2.txt && pnpm db:test && pnpm db:seed:check && pnpm db:types:check && [ "$(ls packages/db/supabase/migrations/*.sql \| wc -l)" = "24" ]` | ❌ | ⬜ pending |
| 02-10-01 | 02-10 | 10 | DATA-02, DATA-07, AUTH-05 | — | Probe pack copy-paste ready; local stack proven green so any hosted failure is attributable to the platform, not the SQL | pgTAP + static | `pnpm db:reset && pnpm db:test && grep -c "_probe_edge" docs/build/SUPABASE-RESOURCES.md` | ❌ | ⬜ pending |
| 02-10-02 | 02-10 | 10 | DATA-02, DATA-07, AUTH-05 | T-02-18 | Owner runs the five hosted probes (or defers) — credentials and dashboard access are owner-held | manual | (human-check, no automated command — see Manual-Only Verifications) | ❌ | ⬜ pending |
| 02-10-03 | 02-10 | 10 | DATA-02, DATA-07, AUTH-05 | T-02-02 | UNCERTAIN ledger closed or explicitly deferred in writing; hosted project at schema (or deferral recorded); local gate still green | pgTAP | `pnpm db:reset && pnpm db:test && [ "$(grep -cE "(U1 \| U3 \| U15).*(refused \| permitted \| re-runs \| does not re-run \| enabled \| deferred)" docs/build/SUPABASE-RESOURCES.md)" -ge 1 ]` | ❌ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

*File Exists is ❌ for every row: Plans 02-01…02-10 are fully written but not yet executed — no migration, seed, or test file exists on disk yet. Each row turns ✅ / green as its plan executes.*

---

## Wave 0 Requirements

- [ ] Framework install: `pnpm add -D -w supabase` (pinned exact version) + `supabase/setup-cli@v1` in CI — `packages/db/supabase/` does not exist yet in this repo
- [ ] `packages/db/supabase/config.toml` — created by `supabase init`
- [ ] `packages/db/supabase/tests/extensions.test.sql` — P1, `citext`/`pgcrypto`/`btree_gist`/`pgtap` bootstrap
- [ ] `packages/db/supabase/tests/staff_hook_claim.test.sql` — P2, AUTH-05
- [ ] `packages/db/supabase/tests/rate_version_publish.test.sql` — P3, QUOTE-10 publish gate
- [ ] `packages/db/supabase/tests/exclusion.test.sql` — P4, OPS-03
- [ ] `packages/db/supabase/tests/reference_format.test.sql` — P4, `VT-YY-####` reference generator
- [ ] `packages/db/supabase/tests/charge_gate.test.sql` — P5, QUOTE-10 charge-gate trigger
- [ ] `packages/db/supabase/tests/append_only.test.sql` — P5, DATA-08 foundation
- [ ] `packages/db/supabase/tests/consent_write.test.sql` — P5, `consent_log` append-only write
- [ ] `packages/db/supabase/tests/bookings_customer_rls.test.sql` — P6, DATA-02
- [ ] `packages/db/supabase/tests/bookings_manage_token_rls.test.sql` — P6, DATA-03
- [ ] `packages/db/supabase/tests/ops_role_rls.test.sql` — P6, DATA-04
- [ ] `packages/db/supabase/tests/ops_write_denied.test.sql` — P6, DATA-04
- [ ] `packages/db/supabase/tests/customer_columns.test.sql` — P6, DATA-02 column-level exposure
- [ ] `packages/db/supabase/tests/settings_public.test.sql` — P6, DATA-04 public settings read
- [ ] `packages/db/supabase/tests/fail_closed.test.sql` — P6, D2 fail-closed grants
- [ ] `packages/db/supabase/tests/seed_idempotent.test.sql` — P7, DATA-07
- [ ] `pr.yml` CI job: `supabase start` → `supabase db reset` → `supabase test db` → `supabase gen types typescript --local` + `git diff --exit-code` — no Supabase command runs in any workflow today

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|--------------------|
| Managed Supabase's `postgres` role can run `grant authenticated to vamos_edge with inherit false, set true` (U1) | DATA-02/03/04 (blocks the roles migration) | Not documented for the managed role's own privileges; only provable against a real project | Run the exact statement in the staging SQL editor before P1 is written. If refused, fall back to `create role vamos_customer nologin` mirroring `authenticated` and swap every `TO authenticated` in P6 |
| `supabase db push --include-seed` re-run semantics on a real project (U3) | DATA-07 | CLI reference documents the flag but not whether it re-runs the seed on every push; only answerable against staging | `supabase db push --include-seed --dry-run` against a scratch project, then a real second push, diff row counts |
| Custom Access Token Hook is actually invoked by the auth server (U15) | AUTH-05 | pgTAP can call the hook function directly and assert the claim comes back, but hook *enablement* is a dashboard setting ("Authentication → Hooks (Beta)"), not a local-suite fact | Confirm the hook is enabled against the live Supabase dashboard when wiring staff auth; pin the CLI/config version used |
| DATA-06 (no identity leak across a pooled Hyperdrive connection) | DATA-06 (Phase 3) | Needs the `HYPERDRIVE_NOCACHE` binding and a deployed Worker; Phase 2 only makes the proof possible (privilege-less `vamos_edge` role + `revoke all` baseline) | Deferred to Phase 3: 200-concurrent-transaction residue probe against the deployed Worker |
| Task 02-01-01 — `checkpoint:human-verify`: npm package legitimacy for `supabase@2.115.0` (T-02-SC) | infra gate, blocks the one `pnpm add` in the phase | Publisher identity, linked repository and download-volume plausibility are a human judgment call against npmjs.com/GitHub, not a fact pgTAP or a shell script can assert | Open https://www.npmjs.com/package/supabase, confirm publisher is the `supabase` org, repo is `supabase/cli`, version `2.115.0` is `latest`, and weekly downloads are in the hundreds of thousands; reply "approved" before Task 2 runs `pnpm add` |
| Task 02-10-02 — `checkpoint:human-action`: owner runs the five hosted probes (U1/D-25, D-27/U3, D-33/U15, D-28, first `db push`) or defers | DATA-02, DATA-07, AUTH-05 (managed-platform halves) | The hosted project's database password, access token and dashboard are owner-held; Claude has no credentials to run a SQL-editor probe, a `db push`, or a dashboard toggle | Owner runs the five numbered steps in `docs/build/SUPABASE-RESOURCES.md`'s probe table (SQL-editor U1 block, `pnpm db:link && pnpm db:push`, U3 dry-run + second push + row-count diff, dashboard hook enablement, `select version();`) and pastes the five results, or replies "deferred" |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 60s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-08-23
