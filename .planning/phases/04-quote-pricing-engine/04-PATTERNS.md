# Phase 4: Quote & Pricing Engine - Pattern Map

**Mapped:** 2026-08-24
**Files analyzed:** 41 (new/modified, across the CONTEXT's informational P1–P8 split)
**Analogs found:** 41 / 41 — but read the caveats below before trusting that count. Most of
Phase 4's TypeScript has **no direct-content analog** in this repo (no route handler, no zod
schema, no HMAC/crypto code, no Mapbox/AeroDataBox client exist anywhere yet). What this repo
*does* have, in force, is a **doc-header and module-shape convention** (`apps/web/lib/*.ts`) and
a **pure-kernel style** (`apps/web/lib/currency.ts`) that every new Phase 4 module must match —
those are the load-bearing analogs, cited per group below.

## Caveats that matter more than the count

1. **A real schema conflict exists between `04-CONTEXT.md`'s `<specifics>` and the already-applied
   Phase 2 migration.** CONTEXT says: *"Lock TTL: `settings.quote_lock_minutes integer not null
   default 30` — an engine parameter on the mutable `settings` singleton, not on
   `settings_versions`."* But `packages/db/supabase/migrations/20260823000004_settings.sql`
   (committed, `feat(02-03)`) already added **both** `quote_lock_minutes` **and**
   `checkout_window_minutes` to **`settings_versions`** (immutable, versioned), not to `settings`.
   Confirmed live by `packages/db/supabase/tests/reference_tables.test.sql` line 28-29
   (`has_column('public','settings_versions','quote_lock_minutes', …)`). This is *more* correct
   against D-47's "two clocks" model (a booking pins the policy version it was sold under) than
   CONTEXT's own text — but it means the additive migration
   `<ts>_quote_gates.sql` **must not** re-add `settings.quote_lock_minutes`; it should add only
   `settings_versions.service_area_geojson` (confirmed absent from every landed migration —
   `grep -rn service_area_geojson packages/db/supabase/migrations/*.sql` returns nothing) plus the
   two trigger hardenings (D-26/D-32). Flag this to the planner explicitly; do not silently "fix"
   CONTEXT.md back.
2. **`rate_versions`, `surcharges`, `service_zones`, `distance_rates`, `fixed_routes`, `coupons`,
   `coupon_redemptions`, `price_snapshots`, `price_snapshot_legs` do not exist in any applied
   migration yet.** `packages/db/supabase/migrations/` currently holds only
   `20260823000001…007` (extensions, roles, types, settings, fleet, customers_and_staff — 006 is
   uncommitted/in-flight right now per the orchestrator's note, content_and_reviews). Phase 4's
   "additive" migrations are additive **against tables Wave 4 (Phase 2's own 0007/0008 plans,
   `rate_versions`/`coupons`) may not have landed by the time Phase 4 planning runs.** Where
   absent, the analog is `.planning/phases/02-data-schema-rls-staff-auth-foundations/
   02-SCHEMA-DRAFT.md` §§0007/0008/0012 (quoted in full below) — **and the planner must re-check
   at execution time whether Wave 4 landed the real migration first**, in which case the base
   migration is the analog and Phase 4's file is genuinely additive.
3. **Zod is not a dependency anywhere** (`grep -n zod apps/web/package.json package.json`
   returns nothing). **Vitest and fast-check are not dependencies anywhere** either — CONTEXT's
   own `<specifics>` names this as a Wave 0 task (`pnpm add -D --filter web vitest fast-check`).
   Both are genuinely new tooling for this repo, not a port of an existing pattern.
4. **`apps/web/app/api/` does not exist.** No Next.js Route Handler of any kind exists in this
   repo yet — `apps/web/middleware.ts`'s own matcher (`"/((?!api|_next|_vercel|.*\\..*).*)"`)
   already carves out `/api/*` from the `[locale]` i18n routing, confirming `app/api/**/route.ts`
   (outside `[locale]`) is the correct, already-anticipated location — but there is no file there
   to imitate the Route Handler shape from. The closest *fetch-handler* shape in this repo is
   `apps/web/worker.ts`'s raw `ExportedHandler` (ee below).
5. **The Hyperdrive data-access layer (`withIdentity`, `asQuote`, `publicSql`,
   `packages/db/src/**`) is a Phase 3 deliverable and does not exist in this codebase yet.**
   Phase 3 has research and a pattern map (`03-RESEARCH.md`, `03-PATTERNS.md`) but
   `packages/db/src/` does not exist on disk (`find packages/db/src` returns nothing) and
   `apps/web/lib/db/` does not exist either. Cited below as **the contract Phase 4's route
   handlers must call once Phase 3 lands**, explicitly marked not-yet-real. Notably, Phase 3's
   frozen `IdentityKind` union is `"anon" | "customer" | "staff" | "guest"` — it has **no
   `"quote"` kind**. `04-RESEARCH.md`'s `asQuote` (D-34/D-60, billing reads must go through
   `HYPERDRIVE_NOCACHE`, never the cached `HYPERDRIVE`) is **not yet specified as a concrete
   function anywhere** — it is closest to `asAnon` (public, unauthenticated caller) but bound to
   the nocache connection string instead of the cached one. The planner must either extend
   Phase 3's identity module with a fifth kind or add a Phase-4-local `asQuote` wrapper around
   `withIdentityCore(env.HYPERDRIVE_NOCACHE.connectionString, "anon", undefined, fn)`. This is a
   genuine open seam between Phase 3 and Phase 4, not an oversight in either phase's docs.
6. **`apps/web/wrangler.jsonc`'s `env.production` `hyperdrive` block, and `HYPERDRIVE_NOCACHE`
   entirely, do not exist yet** — only `HYPERDRIVE` (cached) is declared, under `env.production`
   only (not `env.staging`), with a placeholder id explicitly waiting on Phase 3. Phase 4 adds
   `QUOTE_ABUSE` (KV), `QUOTE_ABUSE_METRICS` (Analytics Engine), `QUOTE_RATE_LIMITER`
   (`ratelimits`), `MAPBOX_DAILY_UNIT_SENTINEL` (var), `PRICING_PREVIEW` (staging-only var) on
   top of whatever shape Phase 3 leaves this file in — a real, sequential edit conflict the
   planner should call out to whoever runs Phase 3 first.

---

## File Classification

Grouped by the CONTEXT's own informational P1–P8 split (`04-CONTEXT.md` "Proposed plan split")
since each group shares one analog set — following `03-PATTERNS.md`'s own convention for a
phase this size.

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `apps/web/lib/pricing/round.ts` | utility (pure kernel) | transform | `apps/web/lib/currency.ts` | convention (role-match) |
| `apps/web/lib/pricing/eligibility.ts` | utility (pure kernel) | transform | `apps/web/lib/currency.ts` | convention (role-match) |
| `apps/web/lib/pricing/predicates.ts` | utility (pure kernel) | transform | `apps/web/lib/currency.ts` | convention (role-match) |
| `apps/web/lib/pricing/priceQuote.ts` (name at planner's discretion) | service (pipeline orchestrator) | transform | `apps/web/lib/currency.ts` (module shape) + `04-RESEARCH.md` §1/§3/§13 (pipeline content) | convention / content: research |
| `apps/web/lib/pricing/*.test.ts` (round/eligibility/predicates/priceQuote) | test (Vitest + fast-check property) | transform | none — Vitest not installed anywhere | **no analog** |
| `apps/web/vitest.config.ts` | config | — | `apps/web/playwright.config.ts` (nearest test-runner-config shape in this repo) | role-match only |
| `apps/web/app/api/quote/route.ts` | route/controller | request-response | none — no Route Handler exists; `apps/web/worker.ts` (raw fetch-handler shape) + `04-API-CONTRACT.md` §2 (content) | role-match (shape) / content: API contract |
| `apps/web/app/api/quote/reprice/route.ts` | route/controller | request-response | same as above | role-match / content: API contract |
| `apps/web/app/api/geo/suggest/route.ts` | route/controller (proxy) | request-response | same as above | role-match / content: API contract |
| `apps/web/app/api/geo/retrieve/route.ts` | route/controller (proxy) | request-response | same as above | role-match / content: API contract |
| `apps/web/app/api/geo/reverse/route.ts` | route/controller (proxy) | request-response | same as above | role-match / content: API contract |
| `apps/web/app/api/flight/[no]/route.ts` | route/controller | request-response | same as above | role-match / content: API contract |
| `apps/web/lib/quote/schema.ts` (zod contract, name at planner's discretion) | utility (validation) | transform | none — zod not installed anywhere | **no analog** |
| `apps/web/lib/quote/errors.ts` (error-mapping table) | utility | transform | `apps/web/lib/logger.ts` (doc-header, structured-object convention) | convention only |
| `apps/web/lib/quote/lock.ts` (HMAC mint/verify/rotate) | service (crypto) | transform | none — no WebCrypto/HMAC code anywhere in this repo | **no analog** (module-shape convention: `apps/web/lib/currency.ts`) |
| `apps/web/lib/geo/mapbox.ts` (suggest/retrieve/reverse/directions client) | service (external API client) | request-response | none — no external HTTP client exists anywhere in `apps/web/lib` | **no analog** (convention: `apps/web/lib/logger.ts`) |
| `apps/web/lib/geo/service-area.ts` (point-in-polygon) | utility (pure) | transform | `apps/web/lib/currency.ts` (pure-function module shape) | convention only |
| `apps/web/lib/flight/aerodatabox.ts` (client + KV TTL tiers) | service (external API client + cache) | request-response | none for the HTTP client; **role-match** for the KV-cache shape: `apps/web/lib/env.d.ts`'s `GEO_CACHE: KVNamespace` typing convention | convention only |
| `apps/web/lib/abuse/turnstile.ts` (siteverify) | service (external API client) | request-response | none | **no analog** |
| `apps/web/lib/abuse/rate-limit.ts` (`ratelimits` binding wrapper) | service | request-response | none — `ratelimits` binding unused anywhere yet | **no analog** |
| `apps/web/lib/abuse/vamos-qs.ts` (signed cookie) | utility (crypto) | transform | none | **no analog** (module-shape convention: `apps/web/lib/currency.ts`) |
| `apps/web/worker.ts` (edit — `scheduled()` gets the 10-min abuse-anomaly Cron) | entry point | event-driven (Cron) | itself, current committed version — **already names Phase 4 as the first real consumer of `scheduled()`** | **exact match — same file** |
| `packages/db/supabase/migrations/<ts>_surcharge_predicate.sql` | migration | batch | `02-SCHEMA-DRAFT.md` §0007 `surcharges` (if `rate_versions`/`surcharges` not yet landed) or the real landed migration (if Wave 4 shipped it first) | design-doc analog **or** real analog — check at execution time |
| `packages/db/supabase/migrations/<ts>_service_zone_types.sql` | migration | batch | `02-SCHEMA-DRAFT.md` §0007 `service_zones` (same caveat) | design-doc analog **or** real analog |
| `packages/db/supabase/migrations/<ts>_snapshot_alternatives.sql` | migration | batch | `02-SCHEMA-DRAFT.md` §0012 `price_snapshots` (same caveat) | design-doc analog **or** real analog |
| `packages/db/supabase/migrations/<ts>_coupon_release.sql` | migration | batch | `02-SCHEMA-DRAFT.md` §0008 `coupons`/`coupon_redemptions` (same caveat) | design-doc analog **or** real analog |
| `packages/db/supabase/migrations/<ts>_quote_gates.sql` | migration | batch | `packages/db/supabase/migrations/20260823000004_settings.sql` (settings_versions is the real, landed host for `service_area_geojson` — see Caveat 1) | **real, landed analog** |
| `packages/db/supabase/migrations/<ts>_flight_provenance.sql` | migration | batch | `packages/db/supabase/migrations/20260823000006_customers_and_staff.sql` (nearest landed "add columns to an existing entity + a new event kind" shape — `booking_legs` itself is not yet landed either; check at execution time) | role-match (shape) |
| `packages/db/supabase/tests/*.test.sql` (one per QUOTE-0x claim, e.g. `quote_lock_clock.test.sql`, `charge_gate.test.sql`, `coupon_evaluate.test.sql`) | test (pgTAP) | request-response | `packages/db/supabase/tests/identity_helpers.test.sql` + `packages/db/supabase/tests/reference_tables.test.sql` | **exact match — same convention** |
| `apps/web/i18n/messages/{en,de,fr,ar}.json` (edit — `quote.*`/`price.*` keys) | config (i18n dictionary) | — | itself, current committed version (existing `price.surcharge.{night,airport_pickup,waiting_city}.*` keys already there from Phase 2) | **exact match — same file, extending an existing namespace** |
| `apps/web/components/transfer/{PriceSummary,VehicleCard,RouteSummary}.tsx` | component | request-response (render) | itself — **UI-SPEC's own finding is zero prop changes needed**; only the widget composing them (Phase 5) changes | **exact match — no edit required in Phase 4 per UI-SPEC §A/§B/§D** |
| Quote-lock countdown composition (new, Phase 5's widget file per UI-SPEC §C) | component (composition, not a new Design Component) | event-driven (client tick) | `apps/web/lib/booking-draft.ts` (sessionStorage + `useSyncExternalStore` store shape) | convention only, **forward reference — file itself is Phase 5, not Phase 4** |
| `.github/workflows/pr.yml` (edit — add `pnpm --filter web exec vitest run`) | config (CI) | batch | itself, current committed version | **exact match — same file** |
| `package.json` (root, edit — vitest/fast-check devDependency, `test:unit` script) | config | — | itself, current committed version (`i18n:check`/`db:test` script shape to imitate for a new `test:unit` entry) | **exact match — same file** |
| `apps/web/wrangler.jsonc` (edit — `QUOTE_ABUSE` KV, `QUOTE_ABUSE_METRICS` AE, `QUOTE_RATE_LIMITER` ratelimits, `MAPBOX_DAILY_UNIT_SENTINEL` var, `PRICING_PREVIEW` staging var) | config | — | itself, current committed version | **exact match — same file, see Caveat 6** |
| `apps/web/lib/env.d.ts` (edit — typed bindings for the above + `HYPERDRIVE_NOCACHE`) | config (types) | — | itself, current committed version | **exact match — same file** |

---

## Pattern Assignments

### P1 — Kernel: `round.ts`, `eligibility.ts`, `predicates.ts`, `priceQuote.ts`

**Analog:** `apps/web/lib/currency.ts` (read in full — it is the only pure, I/O-free,
Law-04-aware TypeScript module in this codebase, and it is the module every kernel line
ultimately renders through).

**Doc-header convention to copy** (`apps/web/lib/currency.ts` lines 1–22): a file-path comment,
a one-paragraph "what this is and why it's narrow" statement, an explicit citation of the
CLAUDE.md law it exists to satisfy, and a closing paragraph naming the Law-04 placeholder
behaviour ("passing no `amount` … is the only value any caller in this codebase should pass
today"). Every kernel file should open the same way, citing `D-06`/`D-43` (rounding) or
`D-01`/`D-44` (eligibility) instead of ADR-004/Law 04.

**Pure-function, no-class shape to copy** (lines 24–64): named exports, a closed union type for
the small enum (`CurrencyCode` here; `IdentityKind`-style closed unions are the same pattern
elsewhere in Phase 3's design), a `Record<ClosedUnion, Shape>` lookup table as the single source
of truth, and one function per concern (`formatFigure` private helper, `formatAmount` public
API) — `round.ts` should shape up as `roundHalfUp(rappen: number, hundredths: number): number`
+ `percentOf(baseRappen, hundredths): number`, both throwing on a non-safe-integer per
D-43 ("`roundHalfUp` throws on a non-safe-integer" — `03-RESEARCH.md` T3), never accepting a
float.

**What the kernel must NOT do, cited from the same file's own discipline:** `formatAmount`
never calls `Date`, never reads `localStorage`, never subscribes to anything — it is a pure
render-boundary formatter. `priceQuote()` must hold the same discipline for the opposite
reason (D-43/T2/T3): no `Date` API call inside the kernel, `computedAt` always injected, no
`parseFloat` (banned — parse `numeric(5,2)` percent strings with a digit regex per D-43), no
`Math.round`.

**Content source (not a codebase analog — this repo has no existing pricing pipeline):**
`04-RESEARCH.md` §1 (pipeline order, the nine numbered steps), §3 (the rounding table, "Line /
Exact ratio / Rounded at"), §13 (the full worked JSON line shape — `seq`, `leg_seq`, `kind`,
`code`, `i18n_key`, `params`, `basis`, `source_row`, `amount_rappen`). Treat §13's JSON block as
the literal return shape to implement, not a similar shape to imitate.

**Types to switch on (real, landed):** `packages/db/supabase/migrations/20260823000003_types.sql`
— `surcharge_kind` (`'amount' | 'percent' | 'included'`), `coupon_kind`, `rate_version_status`,
`display_currency`, and the `rappen` domain (`create domain rappen as integer check (value >=
0)`, line 64 — "each price line is rounded half-up to the whole rappen when computed; a total is
the sum of ALREADY-ROUNDED lines" is the domain's own comment, already binding law before Phase 4
writes a line of TypeScript).

---

### P2 — HTTP contract: `/api/quote`, `/api/quote/reprice`, zod schema, error mapping

**No Route Handler analog exists in this repo.** Nearest fetch-handler shape:
`apps/web/worker.ts` (read in full — 67 lines). Copy its conventions, not its content:

- Structured logging via `withRequestContext` (`apps/web/lib/logger.ts`) at the top of every
  handler, one `emit(...)` call per meaningful event, never a bare `console.log`.
- `satisfies ExportedHandler<CloudflareEnv>` — every handler function is typed against the real
  `CloudflareEnv` interface (`apps/web/lib/env.d.ts`), never `any`.
- The file's own comment names Phase 4 as the reason `scheduled()` exists at all ("Phase 4
  (quote expiry, no-show sweep) … attach real cases to the same exports") — **but D-29 forbids
  a mutating Cron on `price_snapshots`.** The one legitimate `scheduled()` consumer Phase 4 adds
  is the abuse-anomaly Cron (`04-RESEARCH.md` §12 "Observability without Logpush" — "a 10-minute
  Cron that emails ops via Resend on trip-rate / Turnstile-failure anomalies"), not a quote-expiry
  sweep. Do not let the file's own comment lead the planner toward the sweep D-29 explicitly bars.

**Content source for the route bodies:** `04-API-CONTRACT.md` §2–§7 (request/response shape,
error vocabulary) and `04-RESEARCH.md`'s `QuoteResponse`/`QuoteLockPayload` field lists
(`04-CONTEXT.md` `<specifics>`, verbatim field names — copy those exactly, they are locked).

**Zod:** genuinely new to this repo (Caveat 3). No local convention to copy for schema shape;
`04-CONTEXT.md` D-04/D-68's "widget tokens are preprocessed before the strict Zod union" is the
one structural rule already decided — a `z.preprocess` (or manual remap) step ahead of a
`z.discriminatedUnion` on `mode`, not a bare union.

**Error handling / response formatting:** no try/catch convention exists yet for a request
handler in this repo (the closest is `apps/web/i18n/request.ts`'s `onError`/
`getMessageFallback` pair — copy its **shape**: a small, named function per failure class,
each emitting one structured log line and returning a safe fallback, never letting the raw
error surface). `04-RESEARCH.md` §"decisions taken here" table (D41-D75) is the content source
for which SQLSTATE / HTTP status pairs map to which `quote.error.*` key.

---

### P3 — Geo: Mapbox client, service-area check

**No analog for the HTTP client.** `apps/web/lib/logger.ts`'s doc-header convention
(two-hard-rules comment block, scalar-only field typing) is the module-shape convention to
copy for `apps/web/lib/geo/mapbox.ts`'s own doc header — cite D-52/D-53/D-14 (no Mapbox KV
cache; live call every quote) as prominently as `logger.ts` cites its own two hard rules.

**Service-area point-in-polygon (`apps/web/lib/geo/service-area.ts`):** pure-function shape,
same as P1's kernel — copy `apps/web/lib/currency.ts`'s "one function per concern, no class,
named exports" shape. Content is D-17/D-54's two-path check (`04-RESEARCH.md` §7): named
`fixed_routes` pair in either order, **or** both coordinates inside
`settings_versions.service_area_geojson`; NULL polygon fails closed, NULL `min_advance_minutes`
skips the threshold (opposite NULL handling — keep both branches explicit, do not collapse to
one "if NULL, skip" helper).

**KV usage convention:** `apps/web/lib/env.d.ts`'s `GEO_CACHE: KVNamespace` doc comment
("Phase 4 (pricing/quotes) is the first real consumer") is confirmation this binding is already
reserved and typed for exactly this phase — read/write through `env.GEO_CACHE` directly, no new
binding needed for the polygon/fixed-route-geometry cache (D-52 — this is the **one** legitimate
KV cache Mapbox-adjacent, "our data," not a cache of a live Mapbox response).

---

### P4 — Flight: AeroDataBox client, KV TTL tiers

**No analog for the HTTP client**, same as P3. **Role-match for the KV cache shape:**
`apps/web/lib/env.d.ts`'s binding-doc-comment convention — declare `FLIGHT_API_KEY` as a
wrangler secret (never a `vars` entry, per the file's own top-level comment: "No `vars` block
ever carries a credential"). Content: `04-RESEARCH.md` §11 (key shape `flight:{NUMBER}:
{YYYY-MM-DD}`, TTL tiers 90s/30min/6h, the three-way degradation table 400/404/503).

**No booking-widget disambiguation-dialog file exists yet** — `Dialog.tsx` (read in full)
already supports the composition UI-SPEC §F specifies (`size`, `title`, focus-trap, scroll-lock)
with zero new props; this is a Phase 5 concern, cited here only so the planner does not
propose changing `Dialog.tsx` itself in Phase 4.

---

### P5 — Coupons & extras: `evaluate_coupon()`, surcharge seeds

**Migration analog:** `02-SCHEMA-DRAFT.md` §0008 (`coupons`, `coupon_redemptions`, quoted in
full above under Caveat 2) is the base shape Phase 4's `<ts>_coupon_release.sql` is additive
against — **check whether Wave 4 already landed `0008_coupons.sql` for real** before treating
the draft as authoritative; if it has, diff against the real file instead.

**pgTAP convention for `evaluate_coupon()`'s seven-rule refusal ladder:**
`packages/db/supabase/tests/identity_helpers.test.sql`'s `throws_ok(...)`/`lives_ok(...)`
pattern (lines 61–70) — one `throws_ok` per named SQLSTATE, one `lives_ok` per legal path,
`plan(N)` at the top matching the exact assertion count. Seven refusal rules
(`04-RESEARCH.md` §6 table) map to seven `throws_ok`/`is()` pairs at minimum, one per named
i18n key (`quote.coupon.error.not_found` … `.per_user_cap`).

**Extras duplication rule (child seat / oversized luggage onto both legs):** no code analog;
content only, `04-RESEARCH.md` §10 + D-45 — two lines, two `leg_seq`s, never one
`leg_seq: null` line for a per-leg extra.

---

### P6 — Abuse: `vamos_qs`, rate limiting, Turnstile, daily breaker

**No analog for any of the three services** (Turnstile client, `ratelimits` binding wrapper,
signed-cookie HMAC). Module-shape convention: `apps/web/lib/currency.ts` / `apps/web/lib/
logger.ts` doc-header style. Content: `04-RESEARCH.md` §12 in full (three layers, thresholds,
the `vamos_qs` HMAC signing requirement D-63, the daily-breaker KV key shape).

**Signed-cookie HMAC (`vamos_qs`) and the quote-lock HMAC (P2) share one shape** — both are
"HMAC-SHA256 over canonical input, verified server-side, unsigned/unverifiable falls to the
least-privileged bucket." Implement once as a shared primitive
(`apps/web/lib/crypto/hmac.ts`, planner's discretion on filename) rather than two independent
HMAC implementations — this is a **cross-cutting pattern**, not two separate ones; see Shared
Patterns below.

**Zone-level Rate Limiting Rule and WAF CRS sensitivity are Cloudflare dashboard/Terraform
config, not application code** — no file in this repo represents them today and none should be
invented; note this as infrastructure-as-config the planner should scope to a runbook, not a
source file.

---

### P7 — Snapshot write + gates: additive triggers, `shown_alternatives`, charge gate hardening

**Real, landed analog for the `service_area_geojson` host table:**
`packages/db/supabase/migrations/20260823000004_settings.sql` (read in full above) — same
`settings_versions` table, same "immutable policy history" comment convention
(`comment on table public.settings_versions is '…'`), same nullable-until-confirmed column
style (`airport_waiting_minutes integer check (… >= 0)`, no default). Add
`service_area_geojson jsonb` (or `text` holding a GeoJSON string — planner's call, D-54 does not
specify the column type) the same way: nullable, commented, no default, fail-closed handled in
application code (D-17), not a NOT NULL constraint.

**Charge-gate `SECURITY DEFINER` hardening (D-32, D-58):** no landed trigger yet exists to edit
(`tg_payment_matches_snapshot` is only in `02-SCHEMA-DRAFT.md` — not yet a real migration, per
Caveat 2). The nearest **real, landed** `SECURITY DEFINER` trigger convention in this codebase
is `packages/db/supabase/migrations/20260823000006_customers_and_staff.sql`'s erasure-guard
trigger (proven live by `reference_tables.test.sql` lines 87–95, `tg_customers_erasure_guard`
raising `restrict_violation` (`23001`) without `app.is_admin()`) — same `security definer set
search_path = ''`, explicit `IF NOT FOUND`/guard-condition-then-raise shape D-32 asks for.

**pgTAP convention for the trigger-order proof (D-25/D-50, `charge_gate.test.sql` run as
`authenticated` and `vamos_guest`):** `packages/db/supabase/tests/identity_helpers.test.sql`'s
`set local role anon; … reset role;` block (lines 60–71) is the exact pattern for running one
assertion block under a named role inside the same transaction — extend it to `vamos_guest` and
`authenticated` per D-50.

---

## Shared Patterns

### Doc-header convention (cross-cutting — every new `.ts`/`.sql` file in this phase)
**Source:** `apps/web/lib/logger.ts` lines 1–13, `apps/web/lib/currency.ts` lines 1–22,
`packages/db/supabase/migrations/20260823000004_settings.sql` lines 1–7.
**Apply to:** every new file this phase creates, TypeScript and SQL alike.
```
// <file path, exact>
//
// <one paragraph: what this is, and the specific problem it exists to prevent — not a
// generic description>
//
// <D-NN / QUOTE-NN citation for the binding decision(s) this file embodies, and what is
// explicitly OUT of scope for this file (the negative space), same as currency.ts's own
// "this module has no React state, no onChange broadcast, and no localStorage read">
```
Every file in this phase should cite its governing `D-NN` from `04-RESEARCH.md`/`04-CONTEXT.md`
in its own header, exactly as `settings.sql` cites `D-10`/`D-35` and `logger.ts` cites `D-38`.

### Structured logging (cross-cutting — every route handler, abuse check, Cron)
**Source:** `apps/web/lib/logger.ts` (full file) + `apps/web/worker.ts` lines 22–31, 38–55.
**Apply to:** `/api/quote`, `/api/quote/reprice`, `/api/geo/*`, `/api/flight/:no`, the abuse
Cron.
```typescript
const emit = withRequestContext({ requestId: crypto.randomUUID(), route: "/api/quote", locale });
emit("info", "quote_computed", { rate_version_id, pricing_live, class_count: classes.length });
```
Never a bare `console.log`; `LogFields` is scalar-only (no whole `Request`/`Headers` object) —
this constraint alone stops a route handler accidentally logging a raw Turnstile token or a
Mapbox session token, which is exactly the credential-redaction concern D-63/QUOTE-09 raises
independently.

### The `CHF 000` placeholder rule (cross-cutting — every priced value this phase touches)
**Source:** `apps/web/lib/currency.ts` lines 54–64.
**Apply to:** every kernel line, every route response, every i18n key with a money figure.
```typescript
export function formatAmount(amount: number | null | undefined, currency: CurrencyCode = "CHF"): string {
  const mark = CURRENCY_MARKS[currency];
  const figure = amount == null ? "000" : formatFigure(amount);
  return `${mark.sym}${mark.space}${figure}`;
}
```
D-46 requires every priced value in Phase 4 to render through this exact function, unchanged —
never a new formatter, never a UI conditional on `pricing_live` (`04-RESEARCH.md` §8 layer 4:
"Not a UI conditional"). This module needs **zero edits** for Phase 4.

### i18n key convention (cross-cutting — every `quote.*`/`price.*` key)
**Source:** `apps/web/i18n/messages/en.json` (existing `price.surcharge.{night,airport_pickup,
waiting_city}.*` keys), `apps/web/i18n/request.ts` (loader/fallback/coverage mechanics),
`scripts/check-i18n-coverage.mjs` (the blocking gate, full file read).
**Apply to:** every string in `04-RESEARCH.md` §14's table.
- ICU plurals with a bare `{n}` param name (never `count`/`quantity` on the same key — I-01).
- `$meta.pendingValueKeys` for `quote.error.service_area_undefined` (ADR-011 — English-only on
  purpose, opts out of the cross-locale coverage check, never a bare `{TOKEN}` string).
- Run `pnpm i18n:check` (`node scripts/check-i18n-coverage.mjs`) as this phase's i18n gate — it
  already scans `apps/web/{app,components,lib}` for literal `t("key")` call sites and fails on
  an unresolved key or a bare digit with no ICU placeholder (I18N-06), which directly enforces
  D-13's "one error → one i18n key" rule and the "always pass `n`, including `n=1`" rule (I-01).

### Hyperdrive access (cross-cutting — every route handler, Phase 3 dependency)
**Source:** `03-RESEARCH.md` "Code Examples" §1–§3 (lines 1669–1863, quoted above) — **Phase 3
deliverable, not yet in the codebase.**
```typescript
// packages/db/src/identity.ts (Phase 3, not yet real)
export async function withIdentity<K extends IdentityKind, T>(
  connectionString: string, kind: K, claims: ClaimsFor<K>,
  fn: (tx: postgres.TransactionSql) => Promise<T>,
): Promise<T> { /* sql.begin(...) — one explicit transaction, role dropped, claim bound */ }
```
Phase 4's route handlers call this (once Phase 3 lands it) via `apps/web/lib/db/identity.ts`'s
named wrappers (`asCustomer`/`asStaff`/`asGuest`/`asAnon`). **`asQuote` does not exist in
Phase 3's frozen `IdentityKind` union** — see Caveat 5. Every rate-book read, coupon validation,
and snapshot write MUST bind to `env.HYPERDRIVE_NOCACHE`, never the cached `env.HYPERDRIVE`
(D-34/D-60) — `apps/web/lib/env.d.ts`'s existing `HYPERDRIVE?: Hyperdrive` doc comment already
establishes the "optional until Phase 3, compile error if read without a null check" convention
this phase's `HYPERDRIVE_NOCACHE` addition should copy exactly.

---

## No Analog Found

Files with no close match anywhere in the codebase — planner should build from
`04-RESEARCH.md`/`04-API-CONTRACT.md` content directly, following only the doc-header and
module-shape conventions cited above:

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `apps/web/lib/pricing/*.test.ts` | test | transform | Vitest + fast-check not installed anywhere (Wave 0 task) |
| `apps/web/lib/quote/schema.ts` | utility (validation) | transform | zod not a dependency anywhere in this repo |
| `apps/web/lib/quote/lock.ts` (HMAC quote lock) | service (crypto) | transform | No WebCrypto/HMAC code exists in this repo |
| `apps/web/lib/abuse/vamos-qs.ts` (signed cookie) | utility (crypto) | transform | Same — shares the HMAC primitive with the quote lock (see Shared Patterns) |
| `apps/web/lib/geo/mapbox.ts` | service (external API client) | request-response | No external HTTP client exists anywhere in `apps/web/lib` |
| `apps/web/lib/flight/aerodatabox.ts` | service (external API client) | request-response | Same |
| `apps/web/lib/abuse/turnstile.ts` | service (external API client) | request-response | Same |
| `apps/web/lib/abuse/rate-limit.ts` | service | request-response | `ratelimits` Cloudflare binding unused anywhere in this repo |
| `apps/web/app/api/**/route.ts` (all six) | route/controller | request-response | No Next.js Route Handler of any kind exists in this repo yet (`apps/web/app/api/` does not exist) |
| Zone-level Rate Limiting Rule, WAF CRS sensitivity | infrastructure config | — | Cloudflare dashboard/Terraform, not a source file in this repo |

---

## Metadata

**Analog search scope:** `apps/web/{lib,components,i18n,app,tests}`, `apps/web/worker.ts`,
`apps/web/middleware.ts`, `apps/web/wrangler.jsonc`, `apps/web/playwright.config.ts`,
`packages/db/supabase/{migrations,tests}`, `scripts/`, root `package.json`,
`.planning/phases/{02-data-schema-rls-staff-auth-foundations,03-hyperdrive-data-access-wiring}/`.
**Files scanned (read in full or targeted range):** `apps/web/lib/currency.ts`,
`apps/web/lib/logger.ts`, `apps/web/lib/env.d.ts`, `apps/web/lib/booking-draft.ts`,
`apps/web/middleware.ts`, `apps/web/worker.ts`, `apps/web/wrangler.jsonc`,
`apps/web/i18n/{routing,request}.ts`, `apps/web/i18n/messages/en.json` (partial),
`apps/web/components/transfer/{PriceSummary,VehicleCard,RouteSummary}.tsx`,
`apps/web/components/core/{Icon,Tag}.tsx`, `apps/web/components/forms/{Counter,Checkbox}.tsx`,
`apps/web/components/feedback/{Dialog,Alert,Toast}.tsx`, `apps/web/playwright.config.ts`,
`apps/web/tests/support/server-harness.ts`, `apps/web/package.json`, root `package.json`,
`scripts/check-i18n-coverage.mjs`, `packages/db/supabase/migrations/2026082300000{3,4,5}_*.sql`,
`packages/db/supabase/tests/{identity_helpers,reference_tables}.test.sql`,
`02-SCHEMA-DRAFT.md` (§0007/§0008/§0012), `02-PATTERNS.md`, `03-PATTERNS.md`,
`03-RESEARCH.md` (§"Code Examples", lines 1662–1874).
**Pattern extraction date:** 2026-08-24
