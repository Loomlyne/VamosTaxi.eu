# Handoff — Phases 3 & 4, research through execution

**Written:** 2026-08-22, Vamos Taxi V1.
**For:** a fresh session picking this up cold. Self-contained — you do not need the
conversation that produced it.
**Covers:** Phase 3 (Hyperdrive Data Access Wiring) and Phase 4 (Quote & Pricing Engine),
from research to shipped code.

---

## 0. Read this first — the one-paragraph situation

Vamos Taxi is a Swiss pre-booked airport-transfer platform (Zurich first). Not ride-hailing:
no live GPS, no nearest-driver matching. The design phase is finished — every screen exists
as a working `.dc.html` mock and the brand system is vendored. This is the production build
of that package on Next.js 15 / Cloudflare Workers / Supabase. Phase 1 (platform foundation,
design-system port, i18n runtime) is being executed by a **separate concurrent session** and
is at 13 of 14 plans. Phase 2 (schema, RLS, staff auth) is **fully designed but not
implemented** — 206 KB of reviewed design documents exist, no migration has been written.
Phases 3 and 4 were mid-design when the session that owned them ran out of budget.

Your job is to finish 3 and 4: complete the research, plan them, and execute them.

---

## 1. Hard file guard — read before you write anything

A **second session is actively writing** `apps/web/**`. Until Phase 1 plan 01-14 is
committed, treat these as owned by someone else:

| Path | Status |
|---|---|
| `apps/web/**` | **another session is writing** — do not touch until 01-14 lands |
| `app/**` (the `.dc.html` mocks) | read-only source of truth, never edit |
| `.planning/STATE.md`, `.planning/ROADMAP.md`, `.planning/REQUIREMENTS.md` | owned by the GSD orchestrator, do not hand-edit |
| `.planning/phases/01-*/`, `.planning/phases/02-*/` | finished input, not yours to edit |
| `.planning/phases/03-*/`, `.planning/phases/04-*/` | **yours** |
| `packages/db/` | yours, but only once Phase 2 is being executed |

Check before starting:

```bash
git -C /Users/koss/Developer/VamosTaxi.eu log --oneline -5
git -C /Users/koss/Developer/VamosTaxi.eu status --short
```

If you see `feat(01-14)` in the log and no `apps/web` files in `status`, Phase 1 is done and
the guard on `apps/web/**` lifts. If you still see `01-13` or untracked `apps/web` files, the
other session is live — stay out.

Two commits landing at once on `main` is not corruption, but it does race `index.lock`.
Coordinate or work on a branch.

---

## 2. The four platform laws — binding, non-negotiable

A change that breaks one of these is wrong even when it looks fine.

1. **No glow, ever.** No coloured/soft glow on any state. `--vt-shadow-accent: none` in every
   surface. Allowed instead: colour change, border change, `translateY(1px)` on press, the
   neutral charcoal shadow tokens, and `--vt-ring`. Text inputs additionally set
   `.vt-input--focus { box-shadow: none }`.
2. **No tinted yellow or brownish surfaces.** Never `--vt-yellow-50/100/200/300` as a
   background or border; never `-600/-700` as text or icon colour. Attention is carried by
   charcoal, by full-strength `#FDC20B` on charcoal, or by `--vt-danger` / `--vt-success`.
3. **Four languages in the same pass.** Every visible string — including `placeholder`,
   `aria-label`, `title`, `alt`, error messages, empty states — ships in English, German,
   French and Arabic together. Arabic is first-class RTL: lay out with logical properties,
   never `left`/`right` for anything carrying text. Swiss German, "ss" not "ß".
4. **A pending value is a labelled gap.** Never invent a CHF price — not in code, not in
   fixtures, not in tests, **not in documentation prose or worked examples**. Write `CHF 000`.
   A value the client still owes is `<span data-tok>free cancel window</span>`, which renders
   as "free cancel window TBC".

> A previous run of this work put `"why 75 % of CHF 147?"` into a design document as an
> illustrative example. That is a law-4 violation and the fidelity reviewer is now explicitly
> instructed to grep for it. Do not reintroduce it.

---

## 3. What already exists — inventory

### Phase 2, complete and reviewed (do not redo)

`.planning/phases/02-data-schema-rls-staff-auth-foundations/`

| File | Size | What it is |
|---|---|---|
| `02-SCHEMA-DRAFT.md` | 133 KB | 29 tables, roles, RLS enabled on all 29, `FORCE RLS` on 6 append-only tables, 30 policies grouped by actor, pgTAP tests, migration layout, seed |
| `02-RESEARCH.md` | 74 KB | 24 decisions `D1..D24`, 22 uncertainties `U1..U22`, owner blockers, proposed plan split `P1..P7` |
| `research/*.md` | 247 KB | the 7 raw research lanes that fed it |

It survived three adversarial lenses that raised **36 blocker/major findings, all applied**.
Treat `D1..D24` as settled. If you must contradict one, say so explicitly and record why.

### Decisions from Phase 2 that bind Phases 3 and 4

- **D1** — identity reaches SQL via `set_config('role',…,true)` + `set_config('request.jwt.claims',…,true)`,
  both `is_local`, inside **one explicit transaction**. Postgres reverts both at COMMIT/ROLLBACK.
- **D2** — the security boundary is grants on a privilege-less `vamos_edge` login role
  (`NOINHERIT`, granted `INHERIT FALSE, SET TRUE`). A forgotten wrapper raises `42501`
  rather than leaking a stale identity.
- **D3** — **two** Hyperdrive configs: `HYPERDRIVE_NOCACHE` (cache-disabled; identity,
  transactions, auth/permission/billing reads) and `HYPERDRIVE` (`vamos_public`, cacheable content).
- **D6** — money is `create domain rappen as integer`, CHF minor units. The stored number **is**
  Stripe's `amount`. Rounding: each line half-up to whole rappen when computed; the total is the
  sum of already-rounded lines, never the rounding of an unrounded sum.
- **D7** — versioned `rate_versions` batches + insert-only booking-level `price_snapshots`
  with typed totals plus jsonb `lines` and `policy`.
- **D8** — snapshot line labels are an **i18n key + numeric params**, never English prose.
  Otherwise a German confirmation carries an English price line frozen in an immutable row.
- **D9** — `pricing_live` is **not a boolean**. It is exactly one `rate_versions` row with
  `status='live'` (partial unique index), plus a `BEFORE INSERT` charge-gate trigger on
  `booking_payments`. A boolean gets flipped by accident and records nothing.
- **D11** — a return trip is **one** `bookings` row + `booking_legs`, with **one** shared
  snapshot and `price_snapshot_legs` per-leg subtotals. The round-trip discount is booking-level.
- **D12** — booking reference is `VT-YY-####` from a per-year sequence table.
- **D16** — two partial `EXCLUDE USING gist` constraints on `booking_legs` (chauffeur, vehicle)
  over a `STORED` generated `tstzrange`, `DEFERRABLE INITIALLY IMMEDIATE`.
- **D19** — append-only enforced by four layers: trigger + `REVOKE UPDATE,DELETE` +
  RLS-with-no-policy + `FORCE ROW LEVEL SECURITY`. `service_role` carries `BYPASSRLS`, so only
  the trigger catches a migration running as `postgres`.

### Uncertainties inherited — settle these, do not silently resolve them

| # | Item | The check that settles it | Blocks |
|---|---|---|---|
| U1 | Can managed Supabase's `postgres` grant `authenticated` to `vamos_edge` `with inherit false, set true`? | Run that exact statement in the staging SQL editor. If refused: create `vamos_customer nologin` mirroring `authenticated`'s grants, and rewrite every `TO authenticated` in the RLS migration | The first Phase 2 migration file |
| U2 | Is `set_config('role',$1,true)` ≡ `SET LOCAL ROLE`? | `begin; select set_config('role','authenticated',true); select current_user; commit; select current_user;` — expect `authenticated` then `vamos_edge` | Phase 3 `withIdentity` |
| U3 | Does `supabase db push --include-seed` re-run the seed every push or once? | Dry-run against a scratch project, then a real second push, diff row counts | CI deploy step |
| U6 | One `price_snapshot` row per **eligible class** per quote, or only the chosen class? GSD-LAUNCH §4.1 is ambiguous | **Phase 4 must settle this.** Recommendation was one row per class — cheap at Zurich volume, unchosen rows are dispute evidence | The `/api/quote` response contract |
| U7 | Coupon consumed at quote time or payment time? | **Phase 4 must settle this.** Recommendation was consume at payment, with a soft KV reservation across the 30-min window | The `coupon_redemptions` migration |
| U8 | Sub-rappen per-km rates (e.g. CHF 3.855/km truncates under `per_km_rappen integer`) | Read the CHF matrix when it lands; fix is `per_km_millirappen` | `distance_rates` column type — safe to defer |
| U16 | Round-trip discount percentage | Owner, with the matrix. **Do not seed a number, not even in a fixture** | Phase 4 |
| U20 | Who mints `bookings.idempotency_key` and its lifetime | Phase 7 checkout contract | Double-charge protection |

### Four conflicts with `docs/build/GSD-LAUNCH.md` — unresolved, needs an owner decision

GSD-LAUNCH is a binding handoff document and it contradicts the Phase 2 design in four places.
Both cannot be implemented. The Phase 2 research chose its own side each time; nobody has
ratified that.

| GSD-LAUNCH § Phase 2 says | Phase 2 design says | Chosen |
|---|---|---|
| `bookings.price_chf numeric` | `price_snapshot_id` → `price_snapshots` | design |
| `bookings.manage_token uuid` | separate `booking_access_tokens`, SHA-256 hashed, rotatable | design |
| `bookings.assigned_chauffeur_id` | assignment lives on `booking_legs` | design (ADR-006 requires it) |
| `settings` as one mutable row | split `settings` + immutable `settings_versions` | design |

**Action:** raise these with the owner and record the outcome as an ADR before Phase 2
execution writes a migration. If the owner sides with GSD-LAUNCH on any of them, the Phase 2
schema changes and Phase 4's snapshot design changes with it.

### Owner blockers still open

- **The CHF price matrix does not exist.** The engine ships behind `pricing_live=false`,
  checkout disabled in production, every amount on screen reading `CHF 000` (QUOTE-10).
  This is a hard requirement, not a placeholder convenience.
- **Policy numbers** (free-cancel window, waiting allowances) unanswered. ADR-002: waiting
  allowances stay NULL until answered. NULL renders as a labelled TBC gap; code refuses to
  invent a default.
- **No Cloudflare account and no Supabase project are provisioned.** Nothing in Phase 3 can be
  measured against real infrastructure. Phase 1 plan 01-01 task 3 (deploy to
  staging.vamostaxi.eu) is blocked on the same thing. See `.planning/STATE.md` → Blockers.
- Vehicle/destination photography, payment/social brand marks — do not block 3 or 4.

### Phases 3 and 4 — partial

`.planning/phases/03-hyperdrive-data-access-wiring/` and
`.planning/phases/04-quote-pricing-engine/`

**Research is DONE and harvested.** Workflow run `wf_748ad5af-88b` completed all 8 research
lanes; the run was stopped deliberately at the session-budget ceiling just after the
synthesiser started. Nothing was lost.

| File | Size | Phase |
|---|---|---|
| `03-*/research/isolation-proof.md` | 78 KB | 3 — DATA-06, the hard gate |
| `03-*/research/hyperdrive-wiring.md` | 39 KB | 3 — DATA-05, bindings, client, `withIdentity` |
| `04-*/research/quote-engine-core.md` | 77 KB | 4 — pipeline, snapshot, `pricing_live` |
| `04-*/research/coupons-extras.md` | 39 KB | 4 — QUOTE-06/11, settles U7 |
| `04-*/research/geo-routing.md` | 39 KB | 4 — Mapbox, service area |
| `04-*/research/quote-lock-expiry.md` | 35 KB | 4 — QUOTE-04 |
| `04-*/research/abuse-ratelimit.md` | 30 KB | 4 — QUOTE-09 |
| `04-*/research/flight-autofill.md` | 23 KB | 4 — QUOTE-08 |

362 KB total. Two lanes (`coupons-extras`, `geo-routing`) wrote their briefs straight to disk
and returned only a summary; those summaries are kept as `*.RETURN-SUMMARY.md` — the full
research is the plain `.md`.

**What has NOT been done:** synthesis, adversarial verification, hardening, planning,
execution. No `03-RESEARCH.md`, no `04-RESEARCH.md`, no `04-API-CONTRACT.md` exists yet.

### One finding from the research that changes the stated architecture

`geo-routing.md` reports, from the Mapbox Product Terms PDF (2025-10-01) rather than from
training data, that **§2.10.1 bars exporting/caching Mapbox responses**. The project's own
stack documentation (`.claude/CLAUDE.md`, `PROJECT.md`) specifies "Mapbox Geocoding +
Directions APIs — cached in Cloudflare KV by place-id pair (24 h TTL)". Those two statements
are incompatible. The lane's recommendation is to treat every Mapbox response as
request-scoped and non-cacheable unless Mapbox sales overturns it **in writing**.

This is an owner/commercial decision, not an engineering one, and it changes the cost model
for the quote endpoint. Raise it before Phase 4 is planned. Verify the claim against the
current terms yourself — it is load-bearing.

---

## 4. Recovering a killed run — do this first

Workflow agent results live only in the run's `journal.jsonl` until the script reaches its
return statement. A run killed by the session limit **looks empty but is not**. A previous run
lost 4 of 13 agents to the limit; the other 9 (247 KB of research) were recovered from the
journal and are the `02-*/research/*.md` files today.

A reusable harvester is committed at `.planning/tools/harvest-workflow.mjs`:

```bash
cd /Users/koss/Developer/VamosTaxi.eu

# Phase 3 + 4 run that was in flight when this was written:
node .planning/tools/harvest-workflow.mjs wf_748ad5af-88b \
  .planning/phases/04-quote-pricing-engine/research

# It accepts a bare runId (it searches ~/.claude/projects) or a full transcript dir.
# It prints: N started, M completed, and names the ones that never returned —
# those are exactly the agents to re-run.
```

It names each file after the agent's lane, falling back to the result's first heading, then
the agent id. It writes `_manifest.json` alongside.

**Resume vs restart.** If the script is unchanged, resuming replays every completed agent from
cache for free and re-runs only the failed ones:

```
Workflow({ scriptPath: "<path printed by the original Workflow call>",
           resumeFromRunId: "wf_748ad5af-88b" })
```

The script path for the in-flight run is:
`~/.claude/projects/-Users-koss-Developer-VamosTaxi-eu/b0a3e441-189f-44da-9d1d-6b576b18e103/workflows/scripts/phase34-hyperdrive-quote-engine-groundwork-wf_748ad5af-88b.js`

Resume first. Only restart from scratch if the lane structure below is genuinely better than
what ran.

### The bug to not reintroduce

The first Phase 2 workflow returned `{"findings": 0, "note": "draft survived all three lenses
unchanged"}`. That was **false**. All three verify agents had died on the session limit,
`allFindings` was empty because of failure, and an `if (allFindings.length === 0)` branch
reported it as a clean review. Every verify stage you write must compare
**lenses-returned against lenses-expected** and say `ZERO FINDINGS IS NOT A CLEAN VERDICT —
treat as unreviewed` when they differ. A silent empty array reads as success and is the most
dangerous failure mode in this whole setup.

---

## 5. Budget discipline — how not to lose work

The session limit is a rolling ~5-hour window. There is **no tool that reports usage
percentage**; you find out only when an agent fails with
`You've hit your session limit · resets <time>`. Plan for that, do not try to detect it.

Rules that follow from it:

1. **Write the escape hatch before you need it**, not at 90%. This document is that pattern.
2. **Checkpoint between waves.** Each wave below ends with a harvest and a written file. A
   limit kill then costs one wave, not the run.
3. **Never let a wave exceed ~13 agents.** The two completed runs cost 1.18 M and 848 K
   subagent tokens for 13–14 agents each. Budget roughly 60–90 K subagent tokens per research
   agent, more for opus at high effort.
4. **Tier the models.** Opus only for: adversarial verification, the isolation proof, the
   pricing pipeline, synthesis, hardening. Sonnet for documented-path research. Haiku for
   mechanical extraction. This is not cosmetic — it roughly halves a wave's cost.
5. **On a limit hit:** harvest immediately, write down which agents never returned, note the
   reset time, and resume with `resumeFromRunId` after it passes.

---

## 6. The plan — five waves

> **STATUS: waves A, B and C are already done.** The 8 completed research lanes listed in §3
> cover them. **Start at wave D (synthesis).** The finer 17-lane split below is kept because
> it names the questions each lane had to answer — use it as the checklist the synthesiser and
> the verify lenses hold the research to, and re-run only a lane whose question came back
> unanswered.

The earlier run used 8 research lanes. This splits them finer (17 lanes) so each agent has one
answerable question, and adds explicit verification and execution waves. Run the waves in
order. Do not merge them — the checkpoint between each is what makes a limit kill survivable.

### Wave A — Phase 3 research (5 lanes + synth + 3 verify + harden = 10 agents)

| Lane | Model | Question it must answer alone |
|---|---|---|
| `hyperdrive-bindings` | sonnet | Both `wrangler.jsonc` configs per D3, exact setting that makes one cache-disabled, how the **direct** connection string (port 5432, never Supavisor 6543) is formed and stored as a secret |
| `pg-client-lifecycle` | sonnet | postgres.js construction in a Worker — module scope vs per-invocation; correct `max` / `idle_timeout` / `connect_timeout` / `prepare` behind Hyperdrive; whether `fetch_types` must be off; what breaks specifically under `@opennextjs/cloudflare` |
| `with-identity-wrapper` | **opus** | The `withIdentity(kind, claims, fn)` implementation of D1+D2 in full TypeScript — explicit BEGIN, both `set_config` calls, the closed `PG_ROLE` map, behaviour on throw, all four actor variants, and what a caller who forgets the wrapper gets (`42501`) |
| `isolation-proof` | **opus** | DATA-06. Enumerate **every** way request-scoped identity could survive onto the next request on a pooled connection: plain `SET`; a transaction left open by early return or throw; a connection returned mid-transaction; prepared-statement plan reuse; postgres.js pipelining; an unawaited promise; `waitUntil` work running after the response. For each, say whether D1/D2 structurally prevents it or only a test catches it. Then design the test — how two real identities are minted, how genuine concurrency is forced, how many iterations make a negative result mean anything — **plus a deliberate negative control** (a variant with the bug present that the test must fail against). Without the negative control the test proves nothing. |
| `latency-instrumentation` | sonnet | DATA-05. What p50 < 30 ms actually measures (Worker→Hyperdrive→Postgres for a representative query), how to instrument without paid APM, realistic eu-central figures from a European PoP vs a distant one, what Smart Placement does and does not change |

Then: synthesise → `03-RESEARCH.md`; 3 opus lenses (isolation-soundness, forward-compat,
fidelity-against-Phase-2); harden.

**Checkpoint:** `03-RESEARCH.md` exists, decisions and UNCERTAIN tables populated, U1/U2/U3
carried forward with their exact checks.

### Wave B — Phase 4 research, part 1: the money path (6 lanes = 6 agents)

| Lane | Model | Question |
|---|---|---|
| `quote-pipeline-order` | **opus** | The exact computation order — resolve live `rate_versions` → fixed-route match → else per-km + min-fare → surcharges → extras → coupon → totals. **State the order and why**: a percentage surcharge before vs after a coupon is different money. Apply D6's rounding concretely and show that recomputing from the stored lines reproduces the total. |
| `class-eligibility` | sonnet | QUOTE-02. Passengers and luggage clamped per class from `vehicle_classes`/`distance_rates` `maxPax`; what happens when no class is eligible |
| `snapshot-write-shape` | **opus** | D7/D8. The exact jsonb `lines` array a computed quote produces — i18n keys + numeric params, never prose — and the `policy` object. **Settle U6** with reasoning. Worked example in `CHF 000` only. |
| `pricing-live-gate` | sonnet | QUOTE-10 end to end: what `/api/quote` returns, what the widget renders, why checkout is unreachable, how the flip happens via D9's single `status='live'` row. Prove it is impossible to charge with no live rate version. |
| `quote-lock-expiry` | sonnet | QUOTE-04. Where the lock lives (snapshot `expires_at` vs KV vs both — argue it); the server-side re-check in the checkout POST; clock discipline (server time only, UTC); the Cron expiry sweep **reconciled against D19's insert-only rule**; what happens when a quote expires mid-checkout and the rate version has since changed |
| `determinism-audit` | **opus** | QUOTE-05. Same inputs + same rate version must yield the same amount forever. What could break it — a live surcharge join, a clock read, locale-dependent rounding, a float anywhere — and how the design prevents each |

**Checkpoint:** harvest. These six are the highest-value agents in the whole handoff; if the
limit hits, resume rather than restart.

### Wave C — Phase 4 research, part 2: the edges (6 lanes = 6 agents)

| Lane | Model | Question |
|---|---|---|
| `geocoding-search` | sonnet | Mapbox Geocoding (verify the current version) for search-as-you-type + reverse geocode for a dropped pin; session tokens and their billing effect; biasing to the Zurich region; **what place names look like in Arabic** (law 3) |
| `distance-routing-cache` | sonnet | Directions vs Matrix for driving distance + duration, and which; what is stored on the leg (`estimated_duration_minutes` feeds Phase 8's exclusion constraint); the KV key shape for the place-id pair, 24 h TTL, size limits, what must **not** be cached |
| `service-area-advance` | sonnet | QUOTE-07. How the eligible area is defined (the `service_zones` table? polygon? cantons?); the server-side check; a refusal message that says **which** rule failed — outside area vs inside minimum advance time — with the advance time read from `settings`, never a constant |
| `flight-autofill` | sonnet | QUOTE-08. AeroDataBox's current API shape, auth, rate limits, tier; what a lookup returns (scheduled vs estimated vs actual); ambiguity (a number flies daily, codeshares); the buffer — and if the owner has not answered, it stays NULL and the field **refuses to autofill rather than guessing**; KV TTL differing for a future vs same-day flight; the documented degradation path ("flight autofill down → prompt for manual time"); **where the line is** so this does not accidentally become the live tracking that Phase 9 owns |
| `coupons` | sonnet | QUOTE-06. Validation against the `coupons` table — active, window, cap, percent vs amount; refusal messages naming the failed rule; **settle U7**, covering the abandoned-quote problem and the race where two customers redeem the last use simultaneously (what locks it) |
| `extras-lines` | sonnet | QUOTE-11. Child seat, additional stop, oversized luggage each as its **own** priced line; where the catalogue lives; per-booking or per-leg (D11 — does a child seat apply to both legs?); how an additional stop changes the routed distance and therefore the base fare, not just its own line |

### Wave D — Phase 4 abuse + synthesis + verification (1 + 1 + 5 + 1 = 8 agents)

| Agent | Model | Job |
|---|---|---|
| `abuse-ratelimit` | sonnet | QUOTE-09. Cloudflare Rate Limiting on the plan tier in use; what to key on (IP is weak behind CGNAT — what else); 429 vs challenge; Turnstile placement that does not wreck "book in under a minute" (escalate after N requests, not on the first); server-side siteverify in the Worker; behaviour when Turnstile itself is down; WAF rules that would false-positive on a normal booking POST; a per-quote KV counter and refusing bogus geometry **before** paying Mapbox; the threshold reasoning that still lets a real customer re-quote several times a minute; how an attack is noticed at all given Logpush is deferred |
| `synthesise` | **opus** | Write `04-RESEARCH.md` + `04-API-CONTRACT.md` |
| `verify:abuse-money` | **opus** | Any path where the customer influences the price (client-supplied distance/class/total); an expired quote that still pays; a rate version changing underneath a quote; a coupon past its cap under concurrency; sum-of-lines ≠ stored total, or half-up applied twice; surcharge ordering a customer can game by reordering inputs; `pricing_live=false` bypassed; unauthenticated callers burning Mapbox quota; a rate limit keyed on something trivially rotated; a replayed Turnstile token; PII or a place id in a KV key shared across customers |
| `verify:forward-compat` | **opus** | What Phase 5, 7, 8, 9 inherit: a response shape checkout cannot use; a `quote_id` that cannot become a booking idempotently (U20); a snapshot that cannot explain a Phase 9 refund; missing `estimated_duration_minutes` so Phase 8's exclusion constraint cannot be satisfied; a leg model breaking ADR-006/D11; an error vocabulary Phase 5 cannot render in four languages; a coupon model that breaks when Phase 9 refunds a booking that consumed a use |
| `verify:fidelity` | **opus** | Against `02-SCHEMA-DRAFT.md` and the real mocks (`app/home/home.dc.html`, `app/pages/checkout.dc.html`, `docs/build/SPEC-home-booking-widget.md`, `SPEC-home-flight-autofill.md`, `SPEC-checkout-confirmation.md`): a column referenced that does not exist or has the wrong name/type; a D1–D24 decision contradicted without being named; a U-item silently resolved; a field the widget collects that the API cannot accept; a SPEC behaviour dropped; **any invented CHF figure — there must be none**; a customer-visible string as English prose instead of an i18n key; rappen handled as a float or string |
| `verify:i18n-rtl` | sonnet | Every string the two phases introduce exists as a key with de/fr/ar; concatenated strings are ICU messages not string addition; error messages are instructions not blame ("Check the flight number", never "Invalid flight"); nothing in the quote flow assumes LTR |
| `verify:ops-reality` | sonnet | Does this survive a dispatcher's day? A phone booking with no Mapbox route; a quote for an address Mapbox cannot geocode; a customer who changes passengers four times; a coupon the owner wants to kill mid-day; the `CHF 000` state as an actual person sees it |
| `harden` | **opus** | Apply / reject / defer every finding, then write both plan splits |

**Every finding gets applied, rejected with a written rebuttal, or deferred with an owning
phase named. Never silently dropped.** The Phase 2 run produced 36 findings and applied all 36.

### Wave E — planning, then execution

Phases 3 and 4 have `**Plans**: TBD` in the roadmap. Turn the research into executable plans
through the GSD workflow — do not hand-write plan files:

```
/gsd-plan-phase 3      # consumes 03-RESEARCH.md
/gsd-execute-phase 3   # hard gate: nothing downstream is trustworthy until this passes
/gsd-plan-phase 4
/gsd-execute-phase 4
```

**Phase 3 is a hard gate.** Its success criteria are (1) p50 round-trip under 30 ms from the
staging Worker and (2) two concurrent requests as two different customers never seeing each
other's row, proven by a concurrent two-customer isolation test — *not* a single manual query.
Neither can be measured until a Cloudflare account and a Supabase project exist. If they still
do not: build and unit-test everything against `supabase start` locally, land the isolation
test **with its negative control passing locally**, and mark the staging measurement as the
one deferred task. Do not declare the gate passed on a local run.

**Phase 4 ordering.** Everything except the real numbers can ship behind `pricing_live=false`.
Sequence so the CHF-matrix-blocked work is last and small.

**Phase 2 must be executed before Phase 3 can be.** It is designed but not implemented — no
migration exists. Either run `/gsd-plan-phase 2` → `/gsd-execute-phase 2` first, or accept
that Phase 3 has nothing to connect to. Resolve the four GSD-LAUNCH conflicts (§3) before that
migration is written.

---

## 7. Definition of done

**Phase 3 is done when:** both Hyperdrive configs are bound and the direct connection string
is confirmed (5432, not 6543); `withIdentity` exists with all four actor variants and a caller
that forgets it gets `42501`; the concurrent two-customer isolation test passes **and its
negative control fails**; U1 and U2 are answered against a real project; p50 is measured from
staging or explicitly recorded as deferred with the reason.

**Phase 4 is done when:** all eleven QUOTE requirements have a coverage entry; U6 and U7 are
settled with written reasoning; `/api/quote` matches `04-API-CONTRACT.md`; a quote holds 30
minutes and an expired one is refused **server-side** with the UI bypassed in a test; the
stored breakdown recomputes to the stored total; every amount reads `CHF 000` under
`pricing_live=false` and checkout cannot be reached; the endpoint is rate-limited and
challenges repeat anonymous callers; every string resolves in en/de/fr/ar; nothing scrolls
sideways at 390 px and the widget stacks first on mobile.

**Neither is done while any surface is English-only, any amount is an invented number, or any
verify lens failed to return.**

---

## 8. Quick command reference

```bash
cd /Users/koss/Developer/VamosTaxi.eu

# who is writing what
git log --oneline -5 && git status --short

# recover a killed workflow run
node .planning/tools/harvest-workflow.mjs <wf_runid> <outDir>

# the gates (root package.json)
pnpm typecheck          # tsc --noEmit across the workspace
pnpm lint:css           # stylelint, enforces laws 1 and 2
pnpm i18n:check         # translation coverage, enforces law 3
pnpm build              # next build
pnpm test:visual        # playwright
pnpm check:public-env   # NEXT_PUBLIC_ allowlist

# state
cat .planning/STATE.md
```

`pnpm i18n:check` reads its ADR-011/D-18 exclusions from a reserved `$meta` block in
`en.json` — they are not hardcoded, so a dictionary migration and the script cannot drift apart.
