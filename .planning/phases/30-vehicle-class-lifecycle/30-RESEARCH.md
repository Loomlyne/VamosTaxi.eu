# Phase 30: Vehicle class lifecycle - Research

**Researched:** 2026-10-12
**Domain:** Postgres lifecycle state on `vehicle_classes`, staff JSON routes on a Next/OpenNext Worker, `.dc.html` dashboard mocks (served live), route rename, one-off owner-run SQL script
**Confidence:** HIGH on code/DB facts (all read in this worktree at HEAD `dbc60975`, merged with main `65c0b285`); MEDIUM on three product edge cases flagged as Open Questions (no web research needed: no new libraries)

## Summary

The signed UI is already drawn as a prototype in the DC mocks, and its client half is close to what the product needs, but **none of the server half exists**. The prototype calls `GET /api/staff/vehicle-classes` expecting `status`, `retiredReason`, `inLiveBook`; `PATCH /api/staff/vehicle-classes {id,status}`; `DELETE ...` as Retire. Today the route returns only `active`, ignores `status`, and DELETE still runs the old hard-delete-or-hide RPC. In the picture harness (`tools/stubs.mjs`) those answers are stubbed. So the phase is: (1) one DB migration adding lifecycle RPCs and an assign guard, (2) server routes/presenters/clone/insert changes that make the prototype's contract true, (3) rebuilding the DC pieces to the UI-SPEC (the prototype deviates from it in several places, listed below), (4) the `/chauffeurs` rename, (5) the owner-run removal script.

The cheapest correct data model needs **no new column and no change to any public surface**. Draft = `active=false` and `hidden_at is null`; Live = `active=true` and `hidden_at is null`; Retired = `hidden_at is not null` (`active=false`, reason in the existing `hidden_reason`, 140-char CHECK already there). The existing public code already hides `active=false` classes (RLS policy `using (active)`, `eligibility.ts` `cls.active === false`, `mapRateBook` `!cls.hidden_at`), so Draft and Retired classes cannot reach `/api/quote` or the new-trip form even while a frozen live book still rates them. The only DB-visible insert paths that must change are the two places that create a class with `active = true`.

Two UI-SPEC facts are **wrong against the code** and must be corrected in the plan (details under Common Pitfalls): the seed is generated from `apps/web/i18n/messages/*.json`, not from `app/vamos-i18n-dict.js`, and the Next page `apps/web/app/[locale]/about/page.tsx` still uses `the-fleet` and `three-classes-chosen-by-what-you-are-carrying`; and Seats/Bags cannot be "missing" today because both columns are NOT NULL and the Add-class form pre-fills 3 and 3.

**Primary recommendation:** Keep the prototype's client contract, make it real with one admin-only RPC `ops_vehicle_class_set_status(id, to, reason)` plus an `ops_assign_leg` guard (two migrations from `20261012200000`, numbers confirmed by the controller), flip both class-insert paths to `active=false`, filter retired classes out of `cloneRateVersionFrom`, and rebuild the DC UI to the signed UI-SPEC rather than shipping the prototype as is.

<user_constraints>
## User Constraints (from CONTEXT.md)

CONTEXT.md has no formal Decisions / Discretion / Deferred headings; it points to the signed decisions file. Copied faithfully:

### Locked Decisions
Source of truth: `.planning/decisions/2026-10-11-fleet-lifecycle.md` (signed 2026-10-11, amendments signed 2026-10-12) and `30-UI-SPEC.md` rev 4 (approved; every element signed on sheets 1-10).
1. **Retire, never delete.** Action is "Retire": the class leaves the site, the new-trip form and every new price book, moves to a Retired list, can be brought back. Past price books keep its rows. No hard delete from the UI, no error.
2. **States Draft -> Live -> Retired.** New class starts Draft (dashboard only); "Go live" turns it on; Retired comes back as a Draft, then Go live (amended 2026-10-12).
3. **Go-live list:** seats, bags and photo; a price row in the live price book. 3a name typed once in English, same in en/de/fr/ar. 3b chauffeurs are not part of adding a class; the link stays on the chauffeur side (class + plate; Assign filters by class).
4. **New price books skip retired classes.** Draft and Live classes are copied. A class brought back needs a new price before going live.
5. **Chauffeur on a retired class:** keeps the class; list says "Retired class: pick a new one"; cannot be assigned to a new booking until changed.
6. **The 5 old classes (business, economy, first, van, mahaha) removed for good, once**, by one script Koss runs himself after an `archive/*` tag of those rows on GitHub and a different-model check. 6a Business goes too. 6b reviews rv-1...rv-5 are deleted too.
7. **No fleet page.** Classes stay on Pricing. Remove "fleet" from the dashboard (route, component name, copy, dict). 7a Pricing rows get states (Live/Draft badge; Draft badge opens the missing-list dialog with Go live). 7b `/chauffeurs`; `/fleet/chauffeurs` and `/fleet` forward.
8. Rules text in `CLAUDE.local.md` (done).
- UI-SPEC rev 4 binding answers: 44px tap areas on 32px controls (answers 5, 6); Retire is reachable only from the table row, the Delete button in the Edit class foot is removed (answer 10); Go live only checks the live-book row and never publishes (answer 8); why-line names the first missing item in order Photo, Seats, Bags, Price (answer 1, option A); Assign shows only the "left out" line for a retired-class trip (open question 1); Arabic count forms for the Retire count line and Assign "left out" line (open question 2); WITH A CLASS counts chauffeurs on a Live class (answer 14); About title "Pick the class that fits." (answer 9).

### Claude's Discretion
Not stated in CONTEXT.md. Treated as discretion (research recommends, planner confirms with controller): how Draft/Live/Retired is stored, RPC and route shapes, the exact JSON contract, test file layout, wave split.

### Deferred Ideas (OUT OF SCOPE)
- Rest of the dashboard's Arabic plural forms (later job; only the two chauffeur count lines now).
- Home hero line "Guest reviews will show here once they are published." (separate `/gsd-quick` on his word).
- Business class returns only as a new Draft on his word; never with an invented rate.
- Publishing a price book, price book row 18 Publish, deleting test bookings, live Stripe key, `vamostaxi.eu` cutover: his word every time.
- 1024 and 768 pictures (checked in the execution test plan, not drawn).
</user_constraints>

<phase_requirements>
## Phase Requirements

ROADMAP says "TBD". IDs below are derived from the decisions file and UI-SPEC; the controller should add them to `REQUIREMENTS.md`. Note `INT-08` ("dashboard delete is hard when unreferenced, otherwise hidden with a reason") is superseded by CLS-04/CLS-05.

| ID | Description | Research Support |
|----|-------------|------------------|
| CLS-01 | ADD CLASS creates a Draft (`active=false`, `hidden_at null`): never on `/api/quote`, About/home cards, new-trip form | Both insert paths hard-code `active=true` (rate-book PUT distance branch; `insertVehicleClassOnDraft`); public filters already exclude `active=false` |
| CLS-02 | Go live is a DB-guarded transition: photo, seats, bags present and a live-book row for the class; refusal returns the missing list; never publishes | New RPC `ops_vehicle_class_set_status`; live book = `rate_versions.status='live'`; publish trigger guarantees priced rows |
| CLS-03 | Pricing class table: LIVE/DRAFT badge, DRAFT opens the Go live dialog (4-item checklist, why-line, EDIT CLASS, GO LIVE) | Prototype in `OpsPricing.dc.html`; why-line order must follow UI-SPEC (prototype puts Price first) |
| CLS-04 | Retire (reason <= 140) replaces Delete; count line and last-Live warning; Edit-class foot keeps Cancel and Save only; no hard-delete path reachable | RPC `live|draft -> retired`; DELETE verb removed; `hidden_reason` CHECK exists |
| CLS-05 | Retired list under the table, Bring back returns the class as a Draft (checked again, needs new price) | RPC `retired -> draft`; ensure an unpriced draft-book row so the owner can price it |
| CLS-06 | New price books skip retired classes; an open draft drops them on Retire | `cloneRateVersionFrom` copies distance_rates, fixed_routes, distance_bands with no filter today |
| CLS-07 | Only Live classes reach customers and staff pickers (quote, new trip, chauffeur class options) | `loadLiveClasses` in `vamos-ops-data.js` lists every available class of the live book: must add status Live filter |
| CLS-08 | Chauffeur on a retired class: red flag, class select offers Live only, WITH A CLASS counts Live only, server refuses writing a retired class | `chauffeurs-write.ts` writes `vehicle_class_id` unchecked today |
| CLS-09 | Assign never offers or accepts a chauffeur on a retired class; "left out" line; retired-class trip shows no false "No chauffeur has the class" | `ops_assign_leg` (20261007160000) + `assign.ts` pre-check + `assign-map.ts`; OpsDetail picker |
| CLS-10 | Arabic count forms (1, 2, 3-10, 11-99, 100+) on the Retire count line and Assign "left out" line | Prototype + `ops-dc-arabic-count-lines.test.ts` already pin it |
| CLS-11 | `/chauffeurs` (+ `/chauffeurs/<id>`); `/fleet`, `/fleet/chauffeurs[/<id>]` forward; `OpsFleet.dc.html` -> `OpsChauffeurs.dc.html`; no "fleet"/"vehicle" wording left on the screen | middleware `OPS_CONSOLE_EXACT`, `dc-mock-urls.ts`, `ops.dc.html`, sitemap, reference list below |
| CLS-12 | About/home `VehicleClasses` title "Pick the class that fits." (four languages), dead fleet strings removed | Two byte-identical copies; seed source is `messages/*.json`, see Pitfall 1 |
| CLS-13 | One-off removal of the 5 test classes and reviews rv-1..rv-5: owner-run SQL + runbook + local proof; agents never run it on live | Precedent `docs/runbook/d37-delete-test-bookings.{sql,md}`; frozen-row triggers must be handled |
| CLS-14 | Class state changes are audited; four platform laws, tap areas, RTL, `VamosLocale.coverage` empty on every touched surface | `audit_vehicle_classes` trigger exists; laws in CLAUDE.md |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

From `./CLAUDE.md`, `.claude/CLAUDE.md`, `CLAUDE.local.md` and the user's global rules:
- Design system is the only visual truth; compose kit components (`Badge`, `Button`, `IconButton`, `Dialog`, `Textarea`, `Icon`, `OpsTable`); no invented colour/font/radius/shadow.
- No glow (`--vt-shadow-accent:none` and `.vt-input--focus{box-shadow:none}` in every touched `.dc.html`); no tinted yellow (no `Badge tone="warning"`, no `Alert tone="accent"`, no `--vt-yellow-50..300`).
- Four languages in the same pass (en, de Swiss "ss", fr, ar); every visible string incl. `aria-label`, `title`, `placeholder`; split-node rule for `{{ value }}` sentences; `VamosLocale.coverage(root)` empty; `pnpm i18n:check` green.
- Logical CSS properties; Latin class names/plates in `vt-dir-keep` + `data-vt-no-i18n`; Arabic numbers in `vt-dir-keep`.
- `CHF 000` placeholders; never invent a price; the agent never clicks Publish.
- Check 1440 / 1024 / 768 / 390; touch targets 44px; no sideways scroll at 390; native scrolling only.
- Class names Economy Sedan / Economy Van / Luxury Van only; say "class", never "fleet"; a class is retired, never deleted.
- Every uploaded image lives in R2 (`classes/` keys; retired classes keep `photo_path`).
- GSD is mandatory for edits (`/gsd-execute-phase` etc.).
- Migrations: next numbers start `20261012200000` (reserved block, ask the controller before writing one); NEVER `supabase db push`; live apply only by the controller via the Supabase MCP, verbatim, read back and compared; work sessions never touch live. Controller notes a refund job is starting at `20261013100000`: do not collide.
- Types: `pnpm exec supabase` 2.115.0, then `db:types:check`; after a seed change re-pin `seed_idempotent.test.sql` to the seed header counts.
- Vitest in a worktree: `apps/web/node_modules/.bin/vitest`, after `node scripts/sync-dc-mock-to-public.mjs`. pgTAP/browser only via the test lab (`scripts/test-lab/lab.sh`, native Supabase, never Docker). Plans end at a hand-over; deploy and push to `main` are the controller's.
- Parallel agents run touched tests only; the lead runs full gates once (`pnpm gate:local`).
- Memory constraints that bite this phase: "Deleted means gone everywhere" (dead strings/code are removed, not left), "Worker pg client has no arrays / sql.json", "Customer column grants / asSystem definer-only", "postgres.js begin() rethrows caught errors", "Two-Worker deploy order" (test every intermediate pair), "DC i18n: text nodes split", "Helmet scripts run twice", "New i18n keys and gates".

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Class lifecycle state and transition guards | Database (RPC, `security definer`, admin-only) | API route (maps errors) | Go-live guard must hold for every caller; mirrors `ops_vehicle_class_delete_or_hide` |
| "Price in the live book" check | Database | API presenter (`inLiveBook`, `missing`) | One query used by the guard and by the checklist, so UI and server cannot disagree |
| Excluding Draft/Retired from customers | Database RLS + pricing kernel (already) | — | `using (active)`, `eligibility.ts`, `mapRateBook`: unchanged |
| New price book skips retired | API/lib (`cloneRateVersionFrom`) | — | Copy logic is in TypeScript SQL |
| Assign refuses retired-class chauffeur | Database (`ops_assign_leg`) | `assign.ts` pre-check, DC picker | RPC is the authority; pre-check gives a named error; picker is convenience |
| Retire/Go-live/Bring-back UI, Retired list, flags, left-out line | Browser (`.dc.html` mocks served by the Worker) | — | The live dashboard IS these mocks |
| `/chauffeurs` routing and forwards | Frontend server (`middleware.ts`, `dc-mock-urls.ts`) | Browser (`ops.dc.html` path parser) | Middleware decides which paths serve `ops.dc.html` |
| One-off removal | Owner-run SQL (Supabase SQL editor) | Runbook + local proof | Live data, archive tag first, never agent-run |

## Standard Stack

No new packages. Everything is the existing stack.

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Next 15 + `@opennextjs/cloudflare` | as pinned | staff JSON routes (dual-mounted `app/api/staff/**` re-export `app/[locale]/(ops)/api/staff/**`) | project stack [VERIFIED: repo] |
| `postgres` (postgres.js 3.4.9) via `asStaff` / `asSystem` | pinned | SQL in route libs | all writes go through `asStaff` (D-02) [VERIFIED: `fleet-write.ts`] |
| Supabase Postgres + pgTAP | CLI 2.119.0 native | RPCs, tests | project test lab [VERIFIED: `supabase --version`] |
| Vamos design-system bundle `VamosTaxiDesignSystem_245af1` | vendored | Badge, Button, IconButton, Dialog, Textarea, Icon | UI-SPEC |
| vitest | 4.1.11 | unit tests incl. vm-loaded DC files | `apps/web/package.json` |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Derived state (`active` + `hidden_at`) | New `status` column / enum | Column is explicit but ~40 pgTAP files insert classes with default `active=true`, a new default would break or silently change them; derived needs no types/seed change. Recommended: derived. |
| One `set_status` RPC | Three RPCs (retire / bring_back / go_live) | Single function = one grant, one test file, one audit story. Recommended: one. |

**Installation:** none. **Package Legitimacy Audit:** not applicable, this phase installs no external packages.

## Architecture Patterns

### System Architecture Diagram

```
Owner (dashboard, Pricing page)
  |  click Draft badge / Retire icon / Bring back / ADD CLASS
  v
OpsPricing.dc.html  --(VamosOps.classes/retireClass/goLiveClass/bringBackClass)-->  app/vamos-ops-data.js
  |                                                                                   |
  |  GET  /api/staff/vehicle-classes  ->  rows {status, retiredReason, inLiveBook, missing[], ...}
  |  PATCH /api/staff/vehicle-classes {id, status, reason?}   (withAdmin)
  |  PUT  /api/staff/rate-book {kind:'distance'}   (ADD CLASS: inserts class active=false + draft rate row)
  v
Worker routes  ->  lib/ops/fleet.ts (read) / fleet-write.ts (write) / rate-book.ts
  |                                   |
  |  asStaff tx                       |  select public.ops_vehicle_class_set_status(id, to, reason)
  v                                   v
Postgres:  vehicle_classes (active, hidden_at, hidden_reason)  +  audit_vehicle_classes trigger
           rate_versions(status live|draft)  distance_rates(available, priced by publish trigger)
  |
  +--> public side (unchanged): RLS using(active); quote_rate_book -> mapRateBook(!hidden_at) -> evaluateEligibility(active!==false)
  +--> Assign: POST /api/staff/bookings/:id/assign -> assign.ts pre-check -> ops_assign_leg (new: refuse retired driver class)
  +--> Publish (owner only): cloneRateVersionFrom skips retired classes; frozen live book keeps old rows
```

### Recommended Project Structure (touch list)
```
packages/db/supabase/migrations/   20261012200000_class_lifecycle.sql   (RPC, grants, backfill if approved)
                                    20261012210000_assign_refuses_retired_class.sql  (create or replace ops_assign_leg)
packages/db/supabase/tests/        vehicle_class_lifecycle.test.sql ; assign_retired_class.test.sql
packages/db/database.types.ts      regenerated (Functions only)
apps/web/lib/ops/                  fleet.ts (loadVehicleClasses: state, reason, inLiveBook, missing)
                                   fleet-http.ts (presentVehicleClass), fleet-write.ts (set status; insert active=false)
                                   vehicle-class-write.ts (status parser; remove delete-reply helpers), rate-book.ts (clone skip)
                                   assign.ts / assign-map.ts (class-retired), chauffeurs-write.ts (refuse retired class)
apps/web/app/[locale]/(ops)/api/staff/vehicle-classes/route.ts  (PATCH status; DELETE removed)
apps/web/app/[locale]/(ops)/api/staff/rate-book/route.ts        (distance insert: active=false; refuse reattach to retired slug)
apps/web/middleware.ts, apps/web/lib/dc-mock-urls.ts            (/chauffeurs, forwards)
app/ops/OpsPricing|OpsDetail|OpsChauffeurs(OpsFleet)|OpsTable|ops|OpsSidebar|OpsSoon|OpsDash .dc.html
app/vamos-ops-data.js, app/vamos-ops-api.js, app/vamos-i18n-dict.js, app/pages|home/VehicleClasses.dc.html, app/pages/sitemap.dc.html
docs/runbook/p30-remove-test-classes.{sql,md} ; scripts/p30-local-proof.sh
```

### Pattern 1: Lifecycle RPC (mirror of the existing function)
**What:** `security definer`, `set search_path = ''`, `app.is_admin()` guard (42501), `select ... for update` on the class row, explicit transition table, errors as `raise exception '<name>' using errcode = ...`, `revoke ... from public/anon/authenticated; grant execute ... to vamos_staff`.
**Source:** `packages/db/supabase/migrations/20260928160000_vehicle_class_delete_or_hide.sql` [VERIFIED: repo]. Pseudocode:

```sql
-- legal moves: draft->live (guarded), live->retired, draft->retired, retired->draft. Anything else: 'bad-transition' (P0001).
-- retire: set active=false, hidden_at=now(), hidden_reason=nullif(btrim(reason),'') (<=140, 22001 otherwise); keep photo_path; delete the class's rows
--         from DRAFT rate versions only (distance_rates, fixed_routes, distance_bands, city_pair rules) - frozen books keep theirs.
-- bring back: hidden_at=null, hidden_reason=null, active=false; ensure an unpriced distance_rates row in the writable draft (prices NULL)
-- go live: guard = photo_path not blank AND passenger_capacity>=1 AND luggage_capacity is not null
--          AND exists(distance_rates d join rate_versions rv on rv.id=d.rate_version_id
--                     where rv.status='live' and d.vehicle_class_id=p_id and d.available)
--          else raise 'incomplete' with a detail listing missing keys; on success active=true, hidden_at=null, hidden_reason=null.
```
Why "priced" is implied: `tg_rate_version_transition` refuses to publish while any `available` distance_rates row has a NULL base/per-km/min fare [VERIFIED: `20260823000008_rate_versions.sql`], and `tg_pricing_row_frozen` stops later edits, so an `available` row in the live book is a priced row.

### Pattern 2: Presenter carries the checklist
`presentVehicleClass` (`fleet-http.ts:140`) returns `status`, `retiredReason`, `inLiveBook`, and `missing` (subset of `photo|seats|bags|price`) computed in the same SQL as the guard, so the dialog and the server agree (UI-SPEC: "the checklist re-reads the server state").

### Pattern 3: DC logic tests load the file through `vm`
`ops-dc-p4.test.ts`, `ops-dc-chauffeur-class.test.ts`, `ops-dc-arabic-count-lines.test.ts` read the `.dc.html`, evaluate its logic class with stubs and assert `renderVals()`. New lifecycle tests follow this shape [VERIFIED: repo].

### Anti-Patterns to Avoid
- **Reusing DELETE as Retire** (the prototype does): leaves a verb that means two things and keeps the hard-delete code alive. Use `PATCH {status}`.
- **A second source of truth for state** (a `status` text column kept in sync by hand): drift between `active`, `hidden_at` and `status`.
- **Deriving "retired" client-side from `active===false`** (prototype fallback `statusOf`): Draft is also `active=false`; the server must send `status`.
- **Writing the lifecycle into the pricing kernel**: it already handles `active`/`hidden_at`; add tests, not code.
- **Deleting `photo_path` on Retire**: Bring back needs it and `class-photo-sweep.ts` never removes a key a class row points to.

## Real vs drawing-only map (prototype pieces)

| Prototype piece | Status | What makes it real |
|---|---|---|
| `GET /api/staff/vehicle-classes` rows with `status`, `retiredReason`, `inLiveBook` | **Stubbed** (`stubs.mjs` `classRows`); real route returns `active` only (`presentVehicleClass`) | extend `loadVehicleClasses` SQL (`hidden_at`, `hidden_reason`, live-book `exists`) + presenter |
| `VamosOps.classes()`, `retireClass`, `setClassStatus`, `bringBackClass`, `goLiveClass` (`vamos-ops-data.js` ~1138-1165) | Client code real, **server answers missing** | `PATCH status` route + RPC; switch `retireClass` from DELETE to PATCH |
| Retire dialog (reason Textarea, 140 cap, count line, last-Live warning) | Real UI; count and warning computed from client lists (correct per spec); POST is DELETE (wrong verb) | rebuild to spec weights/spacing; wire to PATCH |
| Draft badge + Go live dialog + checklist | Real UI, checklist computed **client-side** from row fields (`inLiveBook`) | use server `missing[]`; fix why-line order (prototype puts Price first, spec says Photo, Seats, Bags, Price) |
| Retired list + Bring back | Real UI; `draftOnlyRows` shows Draft classes with no row in the viewed book | Bring back RPC must create the unpriced draft row; remove `max-width:78px`, `padding:8px 16px`, weight 500, `padding:10px 16px` (UI-SPEC "Forbidden from the prototype") |
| Edit-class foot `deleteBtnLabel` relabel (`OpsTable`) | Wrong vs spec | remove the Delete slot entirely (answer 10); `ops-dc-editor-foot.test.ts` currently expects `>{{ deleteBtnLabel }}<` and must be changed |
| Chauffeur flag, class column 270px, narrow layout, WITH A CLASS live-only | Real UI; reads `classRows` from the same GET | needs server `status`; prototype keeps a "Retired" tag in the class select options (spec: Live only) and `fontWeight:500` (forbidden) |
| Assign picker filter + left-out line (`OpsDetail`) | Real UI; server unaware | add `class-retired` in RPC/pre-check/map; picker uses server `status` |
| `/chauffeurs` in `ops.dc.html`, Sidebar, Dash, OpsFleet links | Real in the DC file | middleware + `dc-mock-urls.ts` + sitemap + forwards still `/fleet` |
| Dictionary additions, Arabic count patterns, About title | Real | remove dead entries; `i18n:check` |
| Fleet wording inside `OpsFleet.dc.html` | Prototype **rewords** vehicle strings; spec says **remove** unused ones (`vehicles`, `vSub`, `footFleet`, `delVBody`, `cntVehicles`, `cntInService`, `cntSeats`, `cntWithVehicle`, `nounV`, `nounVs`) in 4 languages | delete, then grep `fleet\|vehicle` on the screen |

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Class state storage | new column + sync trigger | `active` + `hidden_at` + `hidden_reason` (existing) | public code already honours them |
| Audit of state changes | custom log table | existing `audit_vehicle_classes` trigger (`tg_audit_row`) | already on insert/update/delete [VERIFIED: `20260823000017_audit_log.sql:82`] |
| Reason length rule | app-only check | `vehicle_classes_hidden_reason_len` CHECK + RPC `22001` | already in DB |
| "Is this class priced in the live book" | UI-side inference from rate rows | the RPC's `exists` query exposed as `inLiveBook`/`missing` | one definition |
| Frozen-row bypass in the one-off | `update ... set status` hacks | the D-37 pattern: backup schema, count guard, FK self-check, triggers disabled and re-enabled inside one transaction | `distance_rates/fixed_routes/distance_bands/rate_version_rules` are `before update or delete` frozen outside draft |
| Class photo cleanup | manual R2 deletes in code | existing `removeUnusedClassPhotos` / publish sweep (24 h grace) | already handles unreferenced keys |
| Arabic count forms | per-page ad hoc rules | the shared `arCountForm` already pinned by `ops-dc-arabic-count-lines.test.ts` | keeps OpsPricing, OpsDetail and dictionary identical |

## Runtime State Inventory

(Rename `/fleet/chauffeurs` -> `/chauffeurs`, `OpsFleet` -> `OpsChauffeurs`, and removal of test classes/reviews.)

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | Live `vehicle_classes`: 5 test classes `active=false, hidden_at null` (decision facts, 2026-10-11) plus 3 live ones; `reviews` rows with `external_ref` rv-1..rv-5 (the key is `external_ref`, not `id`; `source='manual'`, deletable); pricing rows of those classes only in retired books (business 9/6/25, economy 7/6/25, first 9/6/20, van 10/6/25, mahaha 2/0/0 distance/fixed/bands); `rate_version_rules` `city_pair` payloads may name a class id (jsonb, no FK) | Data deletion = the owner-run script (CLS-13), with backup schema + count guard; delete `city_pair` rules naming those ids; data migration for the 5 as "Draft" ghosts: see Pitfall 3 |
| Live service config | R2 `classes/...` photos of the 5 test classes (storage, not git) | Next publish sweeps unreferenced `classes/` keys after 24 h grace; verify with `wrangler r2 object list` by the controller; never in the SQL script |
| OS-registered state | None - verified by grep: no task/launchd/pm2 entry names `fleet/chauffeurs` in repo scripts | none |
| Secrets/env vars | None - no env var or secret is keyed on these names | none |
| Build artifacts | Ignored `apps/web/public/app/` is a synced copy of `app/`: stale `OpsFleet.dc.html` stays after rename until `sync-dc-mock-to-public.mjs` runs (it has `sync-prune.mjs`); `apps/web/.open-next` build; lab Worker builds embed old paths | run sync before tests; rebuild the Worker before browser runs |
| Code references to `OpsFleet` / `/fleet` (beyond the UI-SPEC list) | UI-SPEC lists 9 tests; the grep at HEAD also finds `apps/web/tests/unit/no-photo-remove-link.test.ts:20`, `apps/web/tests/integration/ops-dc-fleet.spec.ts:62` (excluded from vitest, still must be updated), comments in `lib/ops/vehicle-seats.ts:22` and `lib/ops/must-fix-mail.ts:5`, `lib/ops/edit-request.test.ts`; `app/vamos-ops-api.js:50` screen whitelist; `lib/dc-mock-urls.test.ts:152` | rename in one task; finish with `grep -rn "OpsFleet\|fleet/chauffeurs"` returning only the deliberate forward cases |

## Common Pitfalls

### Pitfall 1: UI-SPEC says the seed comes from the dictionary; it does not
**What goes wrong:** Plan removes `about.the-fleet` etc., runs `db:seed:gen`, re-pins `seed_idempotent` - but the generator reads `apps/web/i18n/messages/{en,de,fr,ar}.json` [VERIFIED: `packages/db/seed/generate-seed.mjs` header; `seed.sql:254` row `about.the-fleet`]. Those keys are used by `apps/web/app/[locale]/about/page.tsx:58-59` [VERIFIED: grep]. Removing only the dictionary entries (`vamos-i18n-dict.js`, used by the DC mocks that customers actually see: `/about` -> `/app/pages/about.html`, `middleware.ts:44`) leaves the seed and the pinned counts (content_strings 2707 + 26, `seed_idempotent.test.sql:134`) unchanged.
**How to avoid:** Plan default = dictionary-only removal, no seed churn. If the controller wants the unreachable Next about page and `messages/*.json` cleaned too, it is an explicit extra task (edit `page.tsx`, four message files, `db:seed:gen`, re-pin; seed header count must be read from the regenerated header, never guessed). Tell Koss which UI-SPEC line is wrong ("Plan consequence" paragraph, and the dead-string table's "no `.tsx` file uses it").
**Warning signs:** `pnpm db:seed:check` or `i18n:check` failing after message edits.

### Pitfall 2: Seats and Bags can never be "missing"
`passenger_capacity smallint not null check (1..16)`, `luggage_capacity smallint not null check (0..16)` [VERIFIED: `20260823000005_fleet.sql`]; the Add-class form pre-fills `maxPax:3, maxBags:3` (`OpsPricing.dc.html:1674`); the rate-book route defaults bags to `maxPax`. Only Photo and Price can be missing in practice. The checklist and guard must define done as `passenger_capacity >= 1` and `luggage_capacity is not null`. If the owner wants those two to be real gates, ADD CLASS must stop pre-filling (a product change not covered by the signed sheets): list under Open Questions, do not decide silently. Seats value: the dashboard writes the same number to `vehicle_classes.passenger_capacity` and `distance_rates.max_pax` in the rate-book PUT [VERIFIED: route.ts], so use the class column.

### Pitfall 3: The five legacy test classes would appear as Draft rows
They are `active=false, hidden_at null` on live, which is exactly the derived "Draft". The prototype's `draftOnlyRows` lists every Draft class, so after deploy and before the owner runs the script, five junk Draft rows (with GO LIVE) would show on Pricing. Options (controller to choose, recommend A): **A.** the status migration backfills `hidden_at = now()` for `active=false and hidden_at is null` rows (they become Retired, reason null, visibly "gone", still deletable by the script); **B.** run the script before deploying. A touches live data inside a migration and so needs the controller's explicit nod; B constrains ship order. [ASSUMED: live still matches the 2026-10-11 facts; the controller re-reads the live rows read-only before applying.]

### Pitfall 4: Two class-creation paths set `active=true`
`PUT /api/staff/rate-book` distance branch (two literal `true` values in the two inserts, `route.ts` ~796-810) and `insertVehicleClassOnDraft` (`fleet-write.ts`, `parsed.active` defaults true via `assertVehicleClassInput`). Both must create Draft. Do **not** change the column default: ~40 pgTAP files insert classes with default `active=true`. Also `planVehicleClassWrite` re-attaches a typed name to an existing class **by slug**: typing a retired class's name in ADD CLASS would update the retired class and write a draft rate row for an invisible (filtered) class. The route should answer a 409 `class-retired` for that case; the UI shows the generic save error (no new copy is signed).

### Pitfall 5: `cloneRateVersionFrom` reuses an existing draft
`slug = ops-draft-from-<source.id>`; `existing[0]` returns early [VERIFIED: rate-book.ts:700-707], so a draft opened before a class was retired still contains that class. Filtering the clone alone is not enough; Retire must also remove the class's rows from open draft versions (draft rows are deletable; `tg_pricing_row_frozen` only blocks non-draft) or Publish would rate a retired class again. Frozen live/retired books keep their rows (decision 1). This deletes any price the owner typed for that class in the open draft: confirm with the controller (Open Question 2).

### Pitfall 6: Staff pickers read the live book, not the class state
`loadLiveClasses` (`vamos-ops-data.js` ~113-160) offers every class with an `available` rate in the live book as a chauffeur class option. A Draft class that was priced and published, or a Retired class not yet dropped from the live book, would be offered. Filter by `status==='live'` from the same `vehicle-classes` response it already fetches. Also keep `classNames()` (`active` filter) behaving: Draft is `active=false` so it is "not on offer" there, which is correct.

### Pitfall 7: Chauffeur editor can silently clear a retired class
Spec: the Class select offers Live classes only, but decision 5 says the chauffeur keeps the class. If the select drops the retired current value and the editor posts `vehicleClassId: ""`, `updateChauffeurRow` clears it (`chauffeurs-write.ts:98` clears on explicit null/""; omission keeps it - tested by `chauffeur-class-keep.test.ts`). The editor must omit `vehicleClassId` when untouched. Server should refuse an explicit write of a retired class (same-value re-write allowed). Prototype instead shows the retired class in the options with a "Retired" tag (spec says Live only): decide in the plan (Open Question 4).

### Pitfall 8: Retire of a class with in-flight bookings
Retire sets `active=false`; every re-pricing path that runs `evaluateEligibility` then treats that class as not on offer (pay link of an unpaid booking, a customer-requested change, staff trip change). This is existing behaviour for any inactive class, but Retire makes it routine. Paid upcoming trips keep their chauffeur (UI-SPEC). Add a pgTAP/vitest probe of `class_change_reprice` and the pay-link path for a booking whose class is retired, and write down the expected refusal; do not invent new customer copy.

### Pitfall 9: Prototype deviations from the signed UI-SPEC (rebuild, do not ship as is)
Why-line priority (Price first vs Photo, Seats, Bags, Price); weight 500 (`fontWeight:500`, `--vt-weight-medium`); `padding:10px 16px` head; `padding:8px 16px` rows; `[data-class-cell]{max-width:78px}`; Retired tag option in chauffeur select; kept (reworded) vehicle strings; Delete button relabelled instead of removed; no `aria-haspopup`/`aria-label` on the Draft button (`title` only), no 44px tap-area pseudo-elements on the badge and row icons beyond the dialog X; Retiring… / Going live… / error strings and `bringBackAnnounce` live region are not wired; focus management (first focus CANCEL / EDIT CLASS, return to trigger, focus to Retired head after Retire) absent. All are in UI-SPEC and need tasks.

### Pitfall 10: Worker pg-client quirks
No array support (`fetch_types:false`): return the `missing` list as `text` joined by comma or `jsonb` via `sql.json`, never a `text[]`; wrap RPC refusals outside `asStaff`'s `begin()` callback (a caught error inside is rethrown); read through the real Worker client in local tests (memory notes).

### Pitfall 11: Ship order and live apply
Migrations are additive; applying them before the Worker deploy is safe (old Worker ignores the new RPC; an old Worker meeting `class-retired` maps it to `unknown`). The backfill (Pitfall 3 option A) changes how the old dashboard sees five classes: old UI treats `hidden_at` as "Hidden from public", acceptable. The dashboard gateway/`vamos` Worker pair must be tested together locally (memory "Two-Worker deploy order") because `/chauffeurs` is a new document path. The controller applies each migration file verbatim via MCP and compares `pg_get_functiondef` md5 with the local file.

## Code Examples

### Public exclusion already in place (verified, no change)
```ts
// apps/web/lib/pricing/eligibility.ts:59 [VERIFIED: repo]
export function classOnOffer(book: RateBook, classId: string): boolean {
  const cls = book.classes.find((row) => row.id === classId);
  if (cls?.active === false) return false;
  ...
}
// apps/web/lib/pricing/rateBook.ts:239: classes = mapList(...).filter((cls) => ratedIds.has(cls.id) && !cls.hidden_at)
// 20260823000024_rls_public.sql:20: create policy vehicle_classes_public_read ... using (active)
```

### Clone must skip retired classes (change)
```ts
// apps/web/lib/ops/rate-book.ts cloneRateVersionFrom: add to distance_rates, fixed_routes, distance_bands copies
//   join public.vehicle_classes vc on vc.id = <table>.vehicle_class_id and vc.hidden_at is null
// and copy `city_pair` rate_version_rules only when their payload.vehicleClassId is not a retired class.
```

### Assign guard (new migration; keep signature, return shape, grants of 20261007160000)
```sql
-- after the class-mismatch check:
if exists (select 1 from public.vehicle_classes c
            where c.id = v_chauffeur.vehicle_class_id and c.hidden_at is not null) then
  raise exception 'class-retired' using errcode = 'P0001';
end if;
```
`assign-map.ts` `NAMED` gets `class-retired`; `assign/route.ts` `failStatus` returns 409 for it; `OpsDetail` falls to the existing generic `assignFailed` message (no new copy is signed).

### Frozen-row handling in the one-off script (shape, from D-37)
```sql
begin;
-- params: expected class count = 5, expected reviews = 5; abort on mismatch
-- backup schema backup_p30_<date>: copy classes, their distance_rates/fixed_routes/distance_bands/rate_version_rules(city_pair), the 5 reviews
-- guard: 0 booking_legs / price_snapshots / vehicles / chauffeurs reference the 5 (abort otherwise)
-- FK self-check: every table with an FK to vehicle_classes is in the script's list
alter table public.distance_rates   disable trigger distance_rates_frozen;
alter table public.fixed_routes     disable trigger fixed_routes_frozen;
alter table public.distance_bands   disable trigger distance_bands_frozen;
alter table public.rate_version_rules disable trigger rate_version_rules_frozen;
-- delete children, then classes, then reviews where external_ref in ('rv-1',...,'rv-5')
-- re-enable the four triggers; assert tgenabled = 'O' for each before commit
commit;
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Delete = hard delete if unreferenced else hide with reason (26.1-19 D-15) | Retire (reversible) with Draft/Live/Retired | this phase | `deleteVehicleClassIfUnreferenced`, `classDeleteReply`, `parseClassDeleteReason` (rename: reason parser reused), the hide-conflict dialog strings (`hideConflict*`, `deleteClass*`) and the "Hidden from public" chip become dead: remove them (memory: deleted means gone). Keep the old RPC in the database (applied migrations are immutable) unless the controller wants a drop migration; remove the Worker path to it. |
| Class goes public once active and in the live book | Class is Draft until Go live | this phase | existing live classes stay Live (`active=true`) - no regression |

**Deprecated/outdated:** INT-08 text in REQUIREMENTS.md; `vehicle_class_delete_hide.test.sql` keeps testing the retained RPC (change only if the RPC is dropped).

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Live DB still has exactly the 5 legacy classes `active=false, hidden_at null` and no hidden classes (facts dated 2026-10-11) | Pitfall 3, Runtime State | Backfill/option A would mis-classify; controller re-reads live read-only before apply |
| A2 | Derived state (no new column) is acceptable to the controller | Primary recommendation | If an explicit column is wanted, add `status` + sync CHECK and regen types; more tests |
| A3 | Retire may delete the class's rows from open draft price books | Pitfall 5 | Owner loses unpublished prices typed for that class |
| A4 | "Price in the live book" = an `available` live-version `distance_rates` row (fixed-route-only classes do not count) | Pattern 1 | A fixed-route-only class could never go live |
| A5 | Bring back inserts an unpriced draft row with `available=true` (publish then refuses until priced, same as ADD CLASS today) | Pattern 1 | Owner cannot publish other changes while a brought-back class is unpriced; alternative `available=false` changes what "in live book" means |
| A6 | The Next page `/[locale]/about` reaches no customer (middleware maps `/about` to the DC page) | Pitfall 1 | If wrong, the old fleet copy is customer-visible and the seed/messages task becomes mandatory |
| A7 | No customer copy is needed for the server `class-retired` / `class-retired` slug refusals (generic errors) | Code Examples | Owner may want a sentence; would need signing in 4 languages |

## Open Questions

1. **Backfill or order for the five ghost Draft rows** (Pitfall 3)
   - Known: derived model reads them as Draft. Unclear: controller preference (migration backfill to Retired vs run script first).
   - Recommendation: option A, stated in the hand-over; controller re-verifies live rows first.
2. **Retire and the open draft price book** (Pitfall 5)
   - Recommendation: remove the retired class's rows from draft versions inside the RPC; mention in the Retire dialog? No copy is signed, so say it in the hand-over only.
3. **Seats/Bags gates** (Pitfall 2) - leave as always-done (matches today's form), or stop pre-filling in ADD CLASS? Recommend leave, list in hand-over so Koss knows two of four checklist items cannot currently fail.
4. **Chauffeur editor: show the current retired class (tagged) or blank?** Spec says Live only; decision 5 says keep. Recommend: no retired option; editor omits `vehicleClassId` unless changed; flag text covers the explanation.
5. **Next about page + `messages/*.json` fleet keys** - leave (recommended) or clean with seed regen (Pitfall 1).
6. **Drop the old `ops_vehicle_class_delete_or_hide` RPC?** Recommend keep, unreachable from the Worker; one fewer live change.
7. **Draft class priced only via fixed routes** (A4).

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node | vitest, scripts | yes | 26.7.0 | — |
| pnpm | gates | yes | 11.7.0 | — |
| vitest binary (`apps/web/node_modules/.bin/vitest`) | unit tests in worktree | yes | 4.1.11 | — |
| Supabase CLI native | `lab.sh pgtap`, local types | yes | 2.119.0 (needs >= 2.118) | repo-pinned CLI 2.115.0 for `db:types` (needs a running stack on its own ports) |
| Docker | — | not used (project rule) | — | native runtime |
| Test lab (`lab.sh`) | pgTAP, browser run | script present, no lab running (`~/.vamos-scratch` has only `ctl`) | — | `lab.sh up p30` |
| Chromium via `lab-browser.mjs` / Playwright | browser UAT by `vamos-tester` | Playwright in `node_modules/.pnpm` (11 entries) | — | Hermes owns in-app UAT |
| esbuild (for `tools/stubs.mjs`) | picture harness only | via pnpm store | — | — |
| `psql` / Docker `d37-local-proof.sh` | one-off script proof | existing proof script requires Docker container and port 55322 | — | write a native-lab variant (`scripts/p30-local-proof.sh`) using `lab.sh` env; do not reuse the Docker one |

**Missing with no fallback:** none. Baseline checked: `node scripts/sync-dc-mock-to-public.mjs` then vitest on `ops-dc-arabic-count-lines`, `ops-dc-chauffeur-class`, `dc-mock-urls` = 56 tests pass at HEAD.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest 4.1.11 (unit, vm-loaded DC files); pgTAP via native lab; browser via test lab brief |
| Config file | `apps/web/vitest.config.ts` (includes `lib/**`, `tests/unit/**`; excludes `tests/integration/**`, `tests/visual/**`) |
| Quick run command | `node scripts/sync-dc-mock-to-public.mjs && cd apps/web && ./node_modules/.bin/vitest run lib/ops/<file>.test.ts` |
| Full suite command | `pnpm gate:local` (lead only, once); DB: `scripts/test-lab/lab.sh pgtap p30` and `pnpm test:db-lab` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| CLS-01 | ADD CLASS (both paths) inserts `active=false`; Draft never on board | vitest (recorder) + pgTAP | `vitest run lib/ops/vehicle-class-draft-birth.test.ts` ; lab pgtap | Wave 0 |
| CLS-02 | go live refused with missing list; succeeds only with photo + live-book row; never changes `rate_versions`; non-admin 42501; bad transition | pgTAP | `lab.sh pgtap p30` (`vehicle_class_lifecycle.test.sql`) | Wave 0 |
| CLS-02/04/05 | route: PATCH status mapping 200/400/403/404/409, DELETE gone, body whitelist | vitest | `vitest run lib/ops/vehicle-class-status-http.test.ts` | Wave 0 |
| CLS-03 | Draft badge/dialog items from server `missing`, why-line order, GO LIVE disabled | vitest vm on `OpsPricing.dc.html` | `vitest run lib/ops/ops-dc-class-lifecycle.test.ts` | Wave 0 |
| CLS-04 | Retire dialog: reason cap 140, count line, last-Live warning (Live only, no other Live), RETIRE enabled, Edit foot has no Delete | vitest vm | same file; update `ops-dc-editor-foot.test.ts` | partly (editor-foot exists, needs change) |
| CLS-05 | Retired list hidden at 0; Bring back -> Draft; announce text | vitest vm + pgTAP (row ensured) | as above | Wave 0 |
| CLS-06 | clone skips retired; open draft loses rows on retire; frozen books keep rows | pgTAP + `*.local.test.ts` | `lab.sh pgtap p30`; `pnpm test:db-lab` | Wave 0 (extend `rate-book-draft.test.ts` style) |
| CLS-07 | `liveBookBoard`/`/api/quote` omit Draft and Retired even when the live book rates them; chauffeur class options Live only | vitest | `vitest run lib/pricing/public-board.test.ts lib/ops/ops-dc-class-pickers.test.ts` | extend existing + Wave 0 |
| CLS-08 | flag, Live-only select, WITH A CLASS live-only, editor omits untouched class, server refuses retired class write | vitest vm + recorder | `vitest run lib/ops/ops-dc-chauffeur-class.test.ts lib/ops/chauffeur-class-keep.test.ts` | exist (update) |
| CLS-09 | `ops_assign_leg` refuses retired-class driver (`class-retired`); map + status 409; picker hides driver; left-out line count and no false note | pgTAP + vitest | `lab.sh pgtap p30` (`assign_retired_class.test.sql`); `vitest run lib/ops/assign.test.ts` | Wave 0 / extend |
| CLS-10 | Arabic forms 1,2,3-10,11-99,100+ in Retire and Assign lines | vitest | `vitest run lib/ops/ops-dc-arabic-count-lines.test.ts` | exists |
| CLS-11 | `/chauffeurs`, `/chauffeurs/<id>` serve console; `/fleet`, `/fleet/chauffeurs[/id]` forward; API-document redirect target; no `OpsFleet` left; no "fleet"/"vehicle" visible text on the screen | vitest | `vitest run lib/dc-mock-urls.test.ts lib/ops/ops-console-paths.test.ts` ; grep gate | Wave 0 (`isOpsConsolePath` is private inside `middleware.ts`: extract to `lib/ops/console-paths.ts` so it is testable) |
| CLS-12 | About/home copies byte-identical, new title in 4 languages, old key gone, `i18n:check` | vitest + `pnpm i18n:check` | `vitest run lib/vehicle-classes-title.test.ts`; `pnpm i18n:check` | Wave 0 |
| CLS-13 | script aborts on count mismatch/unlisted FK; deletes exactly 5 classes + 5 reviews; triggers re-enabled; backup copies exist | local proof against native lab DB | `bash scripts/p30-local-proof.sh` (new, refuses non-local) | Wave 0 |
| CLS-14 | state change writes `audit_log`; laws: no glow lines, tap-area rules, `VamosLocale.coverage` empty in en/de/fr/ar | pgTAP + vitest + `i18n:check` + lab browser | `lab.sh pgtap p30`; test lab brief (1440/1024/768/390 en/de/ar) | Wave 0 |

Browser/UAT (test-lab brief `.planning/templates/TEST-BRIEF.md`, run by `vamos-tester`; Hermes owns in-app UAT): add class -> Draft, Go live refused then enabled after the lab book publishes (lab data only, never live prices), Retire with reason, Bring back, `/fleet/chauffeurs` forward, Assign for a retired-class trip, Pricing at 390 with the Retired list open, Arabic frames. A lab run is never proof for live; the owner's 4242 payment after deploy is.

### Sampling Rate
- **Per task commit:** the touched test files only.
- **Per wave merge:** `vitest run lib/ops lib/pricing lib/dc-mock-urls.test.ts` plus `lab.sh pgtap p30` when SQL changed.
- **Phase gate:** `pnpm gate:local` once by the lead (typecheck, lint, `i18n:check`, `check:numbers`, build, unit, db-lab), `db:types:check`, then hand-over.

### Wave 0 Gaps
- [ ] `packages/db/supabase/tests/vehicle_class_lifecycle.test.sql` - CLS-02, CLS-04, CLS-05, CLS-06, CLS-14
- [ ] `packages/db/supabase/tests/assign_retired_class.test.sql` - CLS-09 (do not weaken `assign_by_class.test.sql`)
- [ ] `apps/web/lib/ops/vehicle-class-status-http.test.ts`, `vehicle-class-draft-birth.test.ts`
- [ ] `apps/web/lib/ops/ops-dc-class-lifecycle.test.ts` (vm-load OpsPricing; pattern from `ops-dc-p4.test.ts`)
- [ ] `apps/web/lib/ops/console-paths.ts` + `ops-console-paths.test.ts`
- [ ] `scripts/p30-local-proof.sh` + `docs/runbook/p30-remove-test-classes.{sql,md}`
- [ ] Update on rename: the 9+ tests listed in Runtime State Inventory

## Security Domain

`security_enforcement` is on (ASVS level 1, block on high).

### Applicable ASVS Categories
| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no change | existing staff session + aal2 gate in middleware |
| V3 Session Management | no change | existing |
| V4 Access Control | **yes** | `withAdmin` on the status PATCH; RPC `app.is_admin()`; EXECUTE only `vamos_staff`; `ops_assign_leg` stays `vamos_system` only |
| V5 Input Validation | **yes** | uuid regex; `status` whitelist `draft|live|retired`; reason `<= 140` after trim (route + CHECK + RPC `22001`); no mass assignment (PATCH with `status` ignores other keys) |
| V6 Cryptography | no | none |
| V8/V12 Data | one-off script touches live data | backup schema, count guard, owner-run only |

### Known Threat Patterns
| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Non-admin staff retires/goes live via REST | Elevation | `revoke` from public/anon/authenticated, `vamos_staff` only, `app.is_admin()` check; pgTAP asserts anon/authenticated cannot execute (pattern in `vehicle_class_delete_hide.test.sql`) |
| Crafted checkout for a Draft/Retired class slug | Tampering | `evaluateEligibility` + RLS already drop it; add a test |
| Stored reason rendered as markup | XSS | rendered as React text in DC (no `dangerouslySetInnerHTML`); keep `data-vt-no-i18n` text nodes; length-capped |
| Transition race (two admins) | Tampering | `select ... for update` in the RPC |
| Script deletes live referenced rows | Tampering | FK self-check, count guard, zero-reference guard, one transaction |
| REST exposure of the new SECURITY DEFINER function | Info disclosure / EoP | mirror the REST-revoke posture of J9 (`rest_function_grants`); explicit revoke in the migration |
| Missing audit on state change | Repudiation | existing `audit_vehicle_classes` row trigger; assert in pgTAP |

## Constraints for the planner

1. **Plans list exact files; no two parallel plans share a file.** Suggested split: P1 DB (two migrations + pgTAP + types) -> P2 server (routes, presenters, clone, insert paths, assign, chauffeur write, middleware, dc-mock-urls, console-paths extraction) and P3 DC UI (OpsPricing/OpsTable, ops-data/ops-api, OpsDetail, rename to OpsChauffeurs, ops/Sidebar/Dash/Soon, dict, VehicleClasses x2, sitemap) can run in parallel after P1 is merged locally, sharing only the JSON contract below -> P4 one-off runbook + proof + hand-over. Shared files with J1-J10 (`vamos-i18n-dict.js`, `OpsDetail.dc.html`, `database.types.ts`, `seed.sql`): append own keys/lines only, merge `origin/main` before hand-over (`30-J10-OVERLAP.md`).
2. **Migrations:** `20261012200000_class_lifecycle.sql`, `20261012210000_assign_refuses_retired_class.sql`; **ask the controller before writing either**, and keep clear of `20261013100000`. Never `db push`; never touch live; the controller applies verbatim and reads back. Applied files are never edited. `ops_assign_leg` is replaced with `create or replace`, same signature/return/grants, body copied from `20261007160000` plus the retired check.
3. **JSON contract (server -> UI), freeze it first:** `GET /api/staff/vehicle-classes` row = existing fields + `status: 'live'|'draft'|'retired'`, `retiredReason: string`, `inLiveBook: boolean`, `missing: string` (comma list of `photo,seats,bags,price`) [no arrays through the Worker client]. `PATCH /api/staff/vehicle-classes {id, status, reason?}` -> `200 {ok,data:row}`; `409 {code:'incomplete', missing}`; `409 {code:'bad-transition'}`; `404`; `403 not-admin`; `400 invalid|invalid-reason`. DELETE removed (405). `ops.retireClass` switches to PATCH.
4. **No price, no Publish:** nothing in this phase writes a price or calls `/publish`. Fixtures use synthetic integers in tests only (never in a picture or a seed). Pictures/UAT show `CHF 000`.
5. **UI is rebuilt to UI-SPEC rev 4** (it is approved; the prototype is raw material). Each UI task runs the four-language check, `VamosLocale.coverage` empty, `.vt-input--focus{box-shadow:none}` and `--vt-shadow-accent:none` kept in every touched `.dc.html`, then 1440/1024/768/390 in the test lab.
6. **Rename in one atomic task:** `git mv app/ops/OpsFleet.dc.html app/ops/OpsChauffeurs.dc.html` plus every reference (list above), then `node scripts/sync-dc-mock-to-public.mjs`. Also rename the invisible identifiers `FLEET`/`isFleet`/`_offFleet` in the same pass or note why not. Server library names `fleet*.ts` are not dashboard wording; leave them (state this in the plan).
7. **Middleware:** add `/chauffeurs` and `/chauffeurs/<id>` to the console paths; `/fleet`, `/fleet/chauffeurs`, `/fleet/chauffeurs/<id>` answer a dashboard redirect (307, `private, no-store`, per `dashboardRedirect`) to `/chauffeurs[...]`; `dc-mock-urls.ts:223` target becomes `/chauffeurs` (its test at line 152 changes). Also the in-DC fallback in `ops.dc.html` keeps accepting the old paths (already in the prototype).
8. **The removal script is its own plan** (decision 6): archive tag of the rows on GitHub, different-model reviewer (Sonnet, since Opus plans), local proof, runbook in the D-37 style; Koss runs it; the plan never executes it against anything but the local lab. Include `city_pair` rules and the R2 photo note.
9. **Hand-over lists:** migration files and order, the backfill choice (Pitfall 3), unresolved Open Questions, "two of four checklist items cannot currently fail" (Pitfall 2), the wrong UI-SPEC claims (Pitfall 1 and the OpsFleet reference list), and that the 4242 payment after deploy is the real proof.

## Sources

### Primary (HIGH confidence) - this repository at HEAD `dbc60975`
- `.planning/decisions/2026-10-11-fleet-lifecycle.md`, `30-UI-SPEC.md` (rev 4), `30-DESIGN-SIGNED.md`, `30-J10-OVERLAP.md`, `30-CONTEXT.md`
- `packages/db/supabase/migrations/`: `20260823000005_fleet.sql`, `20260823000008_rate_versions.sql`, `20260823000024_rls_public.sql`, `20260823000017_audit_log.sql`, `20260914190000_quote_rate_book_live_classes.sql`, `20260914191000_vehicle_class_any_photo.sql`, `20260925140000_chauffeur_vehicle_class_id.sql`, `20260928160000_vehicle_class_delete_or_hide.sql`, `20261007160000_assign_by_class.sql`, `20261007250000_pricing_row_frozen_restore.sql`
- `apps/web/app/[locale]/(ops)/api/staff/{vehicle-classes,rate-book,bookings/[id]/assign,rate-versions/[id]/publish}/route.ts`
- `apps/web/lib/ops/{fleet,fleet-http,fleet-write,vehicle-class-write,rate-book,assign,assign-map,chauffeurs,chauffeurs-write,class-photo-sweep}.ts`; `apps/web/lib/pricing/{eligibility,public-board,rateBook}.ts`; `apps/web/middleware.ts`; `apps/web/lib/dc-mock-urls.ts`
- `app/vamos-ops-data.js`, `app/ops/{OpsPricing,OpsDetail,OpsFleet,OpsTable,ops}.dc.html`, `.planning/phases/30-vehicle-class-lifecycle/tools/stubs.mjs`, `git diff origin/main...HEAD` of the prototype
- `docs/runbook/d37-delete-test-bookings.{md,sql}`, `scripts/d37-local-proof.sh`, `docs/runbook/test-lab.md`, `scripts/test-lab/lab.sh`
- Baseline run: 56 tests green on three touched test files (2026-10-12)

### Secondary (MEDIUM)
- Auto-memory notes (Worker pg client, Two-Worker deploy order, Deleted means gone, DC i18n split nodes) - project memory, not re-verified this session

### Tertiary (LOW)
- Live-database facts (5 legacy classes, reviews, per-class row counts) come from the decisions file dated 2026-10-11, not re-read (research may not touch live)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - no new packages; everything read in repo
- Architecture (derived state, RPC, public exclusion): HIGH for code paths; MEDIUM for the product choices in Open Questions
- Pitfalls: HIGH for 1, 2, 4, 5, 6, 7, 9 (read directly); MEDIUM for 3, 8, 11 (depend on live state / runtime paths)

**Research date:** 2026-10-12
**Valid until:** 2026-10-26 (main is moving: J-series and a refund job; re-run `git diff origin/main` and re-check migration numbers before planning)
