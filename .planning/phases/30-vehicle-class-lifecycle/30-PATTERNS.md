# Phase 30: Vehicle class lifecycle - Pattern Map

**Mapped:** 2026-10-12
**Files analyzed:** 22 new or modified (the DC UI files are covered by the signed UI-SPEC and `30-RESEARCH.md`, not re-mapped here)
**Analogs found:** 22 / 22 (3 are exact, 16 role-match, 3 partial; see table)

Paths are relative to the worktree root. Line numbers are at HEAD `eac58927`. Migration numbers `20261012200000` and `20261012210000` are the numbers in 30-RESEARCH.md. The controller confirms them before anyone writes the files, and they must stay clear of `20261013100000`.

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match |
|---|---|---|---|---|
| `packages/db/supabase/migrations/20261012200000_class_lifecycle.sql` | migration (admin-only SECURITY DEFINER RPC) | CRUD / state machine | `migrations/20260928160000_vehicle_class_delete_or_hide.sql` | exact |
| `packages/db/supabase/migrations/20261012210000_assign_refuses_retired_class.sql` | migration (`create or replace` RPC) | request-response | `migrations/20261007160000_assign_by_class.sql` lines 64-240 | exact |
| `packages/db/supabase/tests/vehicle_class_lifecycle.test.sql` | test (pgTAP) | CRUD | `tests/vehicle_class_delete_hide.test.sql` | exact |
| `packages/db/supabase/tests/assign_retired_class.test.sql` | test (pgTAP) | request-response | `tests/assign_by_class.test.sql` | role-match |
| `packages/db/database.types.ts` | generated types | n/a | regenerate with `pnpm exec supabase` 2.115.0, then `db:types:check` | n/a |
| `apps/web/lib/ops/fleet.ts` (`loadVehicleClasses`) | service (read) | CRUD | itself, lines 317-342 | self |
| `apps/web/lib/ops/fleet-http.ts` (`presentVehicleClass`, error map) | utility (presenter) | transform | itself, lines 140-156, 354-366 | self |
| `apps/web/lib/ops/fleet-write.ts` (set status, `insertVehicleClassOnDraft` `active=false`) | service (write) | CRUD | `deleteVehicleClassIfUnreferenced` lines 252-266 | role-match |
| `apps/web/lib/ops/vehicle-class-write.ts` (status parser, drop delete helpers) | utility | transform | itself, lines 38-67 | self |
| `apps/web/app/[locale]/(ops)/api/staff/vehicle-classes/route.ts` (PATCH status, DELETE removed) | route | request-response | itself, `DELETE` lines 138-164 and `PATCH` lines 49-90 | self |
| `apps/web/app/api/staff/vehicle-classes/route.ts` (dual mount) | route | request-response | unchanged re-export | n/a |
| `apps/web/lib/ops/rate-book.ts` (`cloneRateVersionFrom` skip retired) | service | batch / transform | itself, lines 691-760 | self |
| `apps/web/lib/ops/assign.ts`, `assign-map.ts`, `.../bookings/[id]/assign/route.ts` (`class-retired`) | service + route | request-response | `class-mismatch` handling in the same three files | exact |
| `apps/web/lib/ops/chauffeurs-write.ts` (refuse retired class) | service | CRUD | `chauffeur-class-keep.test.ts` shows how it is tested | partial |
| `apps/web/middleware.ts` (`/chauffeurs`, `/fleet` forwards) | middleware | request-response | `isOpsConsolePath` + `dashboardRedirect` lines 306-362 | role-match |
| `apps/web/lib/ops/console-paths.ts` (extract) + `ops-console-paths.test.ts` | utility + test | transform | `isOpsConsolePath` extracted verbatim | role-match |
| `apps/web/lib/dc-mock-urls.ts` (+ `.test.ts:152`) | utility | request-response | itself, line 223 | self |
| `apps/web/lib/ops/ops-dc-class-lifecycle.test.ts` | test (vm-loaded DC) | event-driven | `ops-dc-p4.test.ts` | exact |
| `apps/web/lib/ops/vehicle-class-status-http.test.ts`, `vehicle-class-draft-birth.test.ts` | test (recorder) | request-response | `chauffeur-class-keep.test.ts` + `assign-class-check.test.ts` | role-match |
| `docs/runbook/p30-remove-test-classes.sql` + `.md` | runbook / owner-run SQL | batch | `docs/runbook/d37-delete-test-bookings.{sql,md}` | exact |
| `scripts/p30-local-proof.sh` | script | batch | `scripts/d37-local-proof.sh` (adapt to native lab) | role-match |

---

## Pattern Assignments

### `20261012200000_class_lifecycle.sql` (migration, state-machine RPC)

**Analog:** `packages/db/supabase/migrations/20260928160000_vehicle_class_delete_or_hide.sql`

**Header and columns** (lines 1-30). Columns and the 140-char CHECK already exist. Do not re-add them; the new migration only adds the function, grants and (if the controller approves, Pitfall 3 option A) the backfill.

**Function skeleton to copy** (lines 32-60, 105-117):
```sql
create or replace function public.ops_vehicle_class_delete_or_hide(
  p_id pg_catalog.uuid,
  p_reason pg_catalog.text
)
returns pg_catalog.text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reason pg_catalog.text;
begin
  if not app.is_admin() then
    raise exception 'admin-only' using errcode = '42501';
  end if;

  perform 1 from public.vehicle_classes c where c.id = p_id for update;
  if not found then
    raise exception 'not-found' using errcode = 'P0002';
  end if;

  v_reason := nullif(pg_catalog.btrim(coalesce(p_reason, '')), '');
  if v_reason is not null and pg_catalog.char_length(v_reason) > 140 then
    raise exception 'reason-too-long' using errcode = '22001';
  end if;
  ...
```

**Draft-only row deletes** (lines 74-86). The retire branch reuses this shape to drop the class's rows from draft versions only (CLS-06, Pitfall 5):
```sql
    delete from public.distance_bands x
     using public.rate_versions rv
     where rv.id = x.rate_version_id and rv.status = 'draft' and x.vehicle_class_id = p_id;
    delete from public.fixed_routes x ... (same shape)
    delete from public.distance_rates x ... (same shape)
```
Also delete `city_pair` `rate_version_rules` in draft versions whose payload names the class (jsonb, no FK).

**Hide update to adapt as the Retire write** (lines 96-101): `set hidden_at = coalesce(c.hidden_at, pg_catalog.now()), hidden_reason = v_reason, active = false`. Keep `photo_path` untouched.

**Grants and comment** (lines 110-117). Copy this block, with the new signature `(uuid, text, text)`, to `vamos_staff` only:
```sql
revoke all on function public.ops_vehicle_class_delete_or_hide(pg_catalog.uuid, pg_catalog.text) from public;
revoke all on function public.ops_vehicle_class_delete_or_hide(pg_catalog.uuid, pg_catalog.text) from anon, authenticated;
grant execute on function public.ops_vehicle_class_delete_or_hide(pg_catalog.uuid, pg_catalog.text) to vamos_staff;

comment on function ... is '26.1-19 D-15: ... Requires app.is_admin() (42501). EXECUTE: vamos_staff.';
```

**New (no analog): the transition table.** Exceptions are `bad-transition` (P0001) and `incomplete` (P0001, with the missing list in `detail`). Use the same `raise exception '<name>' using errcode = ...` form as above. The Worker reads `err.code`/`message`, so keep the names short and fixed.

**Do not change** the column default `active` (about 40 pgTAP files insert classes with the default `true`).

---

### `20261012210000_assign_refuses_retired_class.sql` (migration, `create or replace`)

**Analog:** `packages/db/supabase/migrations/20261007160000_assign_by_class.sql`. This is the newest definition of `ops_assign_leg`; the only earlier one is `20260910164004_ops_assign_leg.sql`.

Copy the whole function body verbatim (lines 64-220, about 155 lines, so lift it from the file with a script or editor, not by hand). Change only one block: insert the retired check after the class-mismatch check at lines 155-157:
```sql
  if v_chauffeur.vehicle_class_id <> v_leg.vehicle_class_id then
    raise exception 'class-mismatch' using errcode = 'P0001';
  end if;
  -- NEW (Phase 30, CLS-09):
  if exists (select 1 from public.vehicle_classes c
              where c.id = v_chauffeur.vehicle_class_id and c.hidden_at is not null) then
    raise exception 'class-retired' using errcode = 'P0001';
  end if;
```
Keep these three things identical to the original:
- the signature `(uuid, uuid, uuid)`, the `returns table (booking_id, leg_id, chauffeur_id, vehicle_id)` and `#variable_conflict use_column`;
- the grants (lines 222-232): `revoke all ... from public; grant execute ... to vamos_system;` (not `vamos_staff`);
- the comment, with `class-retired` added.

---

### `tests/vehicle_class_lifecycle.test.sql` (pgTAP, admin-only RPC)

**Analog:** `packages/db/supabase/tests/vehicle_class_delete_hide.test.sql`

**Structure** (lines 9-10, 155): `begin; select plan(N); ... select * from finish(); rollback;`. The header comment says "Rolled back. Synthetic integer rappen only, never a product CHF." Keep that.

**Schema and privilege assertions** (lines 13-23):
```sql
select has_function('public', 'ops_vehicle_class_delete_or_hide', array['uuid', 'text'], '...');
select ok(not has_function_privilege('anon', 'public.ops_vehicle_class_delete_or_hide(uuid, text)', 'execute'), '...');
select ok(not has_function_privilege('authenticated', '...', 'execute'), '...');
```

**Fixtures** (lines 25-60). Slug-prefixed classes (`vh-*`), a temp table of ids with `grant select on vh to vamos_staff`, draft rows taken from `(select id from public.rate_versions where status = 'draft' order by id limit 1)`, auth users with fixed UUID prefixes, and `public.staff` rows for an admin and a dispatcher.

**Role and claims switch for the dispatcher-refused and admin cases** (lines 130-145):
```sql
set local role vamos_staff;
select set_config('request.jwt.claims',
  jsonb_build_object('sub', '26119000-0000-4000-a000-000000000002', 'role', 'authenticated', 'aal', 'aal2',
    'app_metadata', jsonb_build_object('vamos_role', 'dispatcher'))::text, true);
select throws_ok(format($f$select public.ops_vehicle_class_delete_or_hide(%L::uuid, null)$f$, (select free from vh)),
  '42501', null, 'a dispatcher cannot delete a class');
reset role;
select set_config('request.jwt.claims', '', true);
```
Use a fresh UUID block (not `26119000-...`, which is taken) for the new fixtures. For the "Go live needs a live-book row" cases, follow `tests/rest_function_grants.test.sql` lines 28-40 for the fixture order: retire the old live version, insert a version and its priced `distance_rates` row, then `update public.rate_versions set status = 'live'`.

**Frozen rows:** `distance_rates`, `fixed_routes`, `distance_bands` and `rate_version_rules` are frozen once a version is not draft. Tests of "frozen books keep their rows" must not try to delete from them as superuser without `set local session_replication_role = replica`.

**Audit assertion (CLS-14):** no existing test is a strong template. Assert a new `audit_log` row for `table_name = 'vehicle_classes'` after each transition (trigger `audit_vehicle_classes`, `20260823000017_audit_log.sql:82`).

---

### `tests/assign_retired_class.test.sql` (pgTAP)

**Analog:** `packages/db/supabase/tests/assign_by_class.test.sql`. Do not weaken that file.

Copy the fixture pattern (lines 13-40) and the privilege block (lines 128-136):
```sql
select function_privs_are('public', 'ops_assign_leg', '{uuid,uuid,uuid}'::text[], 'vamos_system', '{EXECUTE}'::text[], '...');
select ok((select prosecdef and proconfig = array['search_path=""'] from pg_proc
            where oid = 'public.ops_assign_leg(uuid,uuid,uuid)'::regprocedure), '...');
```
Refusal assertion, line 137 shape:
```sql
select throws_ok(
  format($f$select * from public.ops_assign_leg(%L::uuid, %L::uuid, %L::uuid)$f$,
         (select trip from fx), (select luca from fx), (select actor from fx)),
  'P0001', 'class-retired', 'a driver on a retired class is refused');
```
Use the same `fx` temp table of trip, driver and actor ids. Retire the driver's class with a plain `update ... set hidden_at = now(), active = false` (the RPC is only the Worker's door, so the test does not need the lifecycle function).

---

### `apps/web/lib/ops/fleet-write.ts` (set status via RPC; `insertVehicleClassOnDraft`)

**Analog:** `deleteVehicleClassIfUnreferenced`, lines 252-266:
```ts
return asStaff(env, claims, async (sql) => {
  const rows = await sql<{ result: string }[]>`
    select public.ops_vehicle_class_delete_or_hide(${id}::uuid, ${reason}) as result
  `;
  const result = rows[0]?.result;
  if (result === "deleted" || result === "in-use" || result === "hidden") return result;
  throw new Error("ops_vehicle_class_delete_or_hide");
});
```
New `setVehicleClassStatus(env, claims, id, to, reason)` follows this shape. Return the RPC's answer; do not catch SQL refusals inside the callback (see "postgres.js begin() rethrows caught errors"); catch them in the route. Return `missing` as comma text, never a `text[]` (Worker client has no arrays).

**Draft birth:** change the insert at lines 171-182. The `active` column takes `${parsed.active}`. Hard-code `false` there (and in the rate-book PUT distance branch, `route.ts` ~796-810). Delete `deleteVehicleClassIfUnreferenced` and `ClassDeleteResult` in the same task ("deleted means gone").

---

### `apps/web/app/[locale]/(ops)/api/staff/vehicle-classes/route.ts` (staff route, `withAdmin`)

**Analog:** the same file.

**Imports and wrappers** (lines 8-30): `getCloudflareContext`, `withAdmin`/`withStaff`/`jsonOk`/`jsonErr` from `@/lib/ops/staff-json`, `fleetJsonError`/`readJsonBody`/`presentVehicleClass` from `@/lib/ops/fleet-http`, and `export const dynamic = "force-dynamic";`.

**PATCH body check style** (lines 49-57):
```ts
export const PATCH = withAdmin(async (claims, request) => {
  try {
    const body = await readJsonBody(request);
    const rec = asRecord(body);
    if (!rec) return jsonErr("invalid", 400);
    const id = typeof rec.id === "string" ? rec.id : "";
    if (!id) return jsonErr("invalid", 400);
```
Add the status branch at the top of PATCH: if `rec.status` is present, whitelist it to `draft|live|retired`, require `ANY_UUID` on the id, run `parseClassDeleteReason(rec.reason)` (rename it; the logic is reusable, 140-char cap) and ignore every other key. This prevents mass assignment and keeps the capacity path separate.

**Status map** (DELETE catch, lines 158-163). This is the status map to copy and extend:
```ts
} catch (err) {
  const code = (err as { code?: unknown } | null)?.code;
  if (code === "P0002") return jsonErr("not-found", 404);
  if (code === "42501") return jsonErr("not-admin", 403);
  return fleetJsonError(err);
}
```
Add (contract in 30-RESEARCH.md "Constraints for the planner" 3): message `incomplete` returns 409 `{code:'incomplete', missing}` through `jsonErr("incomplete", 409, { missing })`; message `bad-transition` returns 409; `22001` returns 400 `invalid-reason`. Read the SQL error text the way `assign-map.ts` lines 76-80 does (`message === name || message.startsWith(`${name}\n`)`).

**Remove** the `DELETE` export, the `deleteVehicleClassIfUnreferenced` import, `classDeleteReply` and the `removeUnusedClassPhotos(...,"class-deleted")` call. Retired classes keep `photo_path` (`class-photo-sweep.ts` never removes a key a class row points to).

**Presenter** (`fleet-http.ts:140-156`): extend the object literal with `status`, `retiredReason`, `inLiveBook`, `missing` (comma text), computed in the SQL of `loadVehicleClasses` (`fleet.ts:322-338`: add `vc.hidden_at`, `vc.hidden_reason` and an `exists(...)` against `rate_versions.status='live'`). Compute the status server-side; never from `active` on the client.

---

### `apps/web/lib/ops/rate-book.ts` (`cloneRateVersionFrom`)

**Analog:** itself, lines 691-760. The three copy statements at lines 719-740 select from `distance_rates`, `fixed_routes` and `distance_bands` with only `where rate_version_id = ${source.id}`. Add a join (copy the style of the existing insert-select):
```ts
await tx`
  insert into public.distance_rates (...)
  select ${newId}, d.vehicle_class_id, ...
    from public.distance_rates d
    join public.vehicle_classes vc on vc.id = d.vehicle_class_id and vc.hidden_at is null
   where d.rate_version_id = ${source.id}
`;
```
Same for `fixed_routes` and `distance_bands`. `rate_version_rules` of kind `city_pair` are filtered by payload class id. Note lines 700-707: an existing `ops-draft-from-<id>` draft is returned as is, so the Retire RPC must remove the class's rows from open drafts too.

**Test style:** `lib/ops/rate-book-draft.test.ts` and the `*.local.test.ts` DB-lab pattern (run through `pnpm test:db-lab`).

---

### `assign.ts`, `assign-map.ts`, `assign/route.ts` (`class-retired`)

**Analog:** the existing `class-mismatch` in all three files.
- `assign-map.ts:38-46`: add `"class-retired"` to `NAMED`.
- `assign/route.ts:24-41`, `failStatus`: add `code === "class-retired"` to the 409 list.
- `assign.ts`: the pre-check for a retired-class driver sits next to `assignClassRefusal` (`assign-map.ts:91-98`). Test it like `assign-class-check.test.ts`: `vi.mock("../db/identity", ...)` for `asStaff`/`asSystem` and assert that no write happens on a refusal.

---

### `apps/web/middleware.ts`, `apps/web/lib/ops/console-paths.ts`, `apps/web/lib/dc-mock-urls.ts`

**Analog:** `middleware.ts:306-362`.

**Console path set** (lines 306-343): `OPS_CONSOLE_EXACT` lists `"/fleet"` and `"/fleet/chauffeurs"`, and `isOpsConsolePath` accepts `/fleet/chauffeurs/<id>` (lines 335-337). Replace with `/chauffeurs` and `/chauffeurs/<id>`:
```ts
if (segments.length === 2 && segments[0] === "chauffeurs") return true;
```
`isOpsConsolePath` is private in the middleware today, which is why CLS-11 needs it extracted to `lib/ops/console-paths.ts` before it can be unit-tested. Move `OPS_CONSOLE_EXACT`, `normalizeDashboardPath` and `isOpsConsolePath` together.

**Forward** (the `dashboardRedirect` helper, lines 356-360). Reuse it, and add the forwards before the `isOpsConsolePath` checks at lines 381 and 411 (both the `ops-changes` branch and the signed-in branch) so they apply in both:
```ts
function dashboardRedirect(url: URL, status: 307 | 308 = 307): NextResponse {
  const out = NextResponse.redirect(url, status);
  out.headers.set("Cache-Control", "private, no-store");
  return out;
}
```
Use the default 307 (the file's comment, lines 351-355, explains a 308 gets cached forever). The target is `dashboardAbs(request, "/chauffeurs" + rest)` (lines 296-303 keep the locale prefix). The `/fleet` forward must sit inside the signed-in branch, otherwise a signed-out visitor to `/fleet` sees a redirect that leaks that the route exists; copy how signed-out console paths fall to `/login`.

**`dc-mock-urls.ts:223`**: change `redirectTo(url, "/fleet/chauffeurs", null)` to `"/chauffeurs"`. Update `dc-mock-urls.test.ts:140-153` (the test is titled "chauffeur API goes to the fleet page" and asserts the `/fleet/chauffeurs` location). Rename the title too.

**Other tests that hit these paths:** `tests/unit/ops-dashboard-host.test.ts`, `lib/ops/ops-live-data.test.ts`, `tests/integration/ops-dashboard-host.spec.ts`.

---

### `apps/web/lib/ops/ops-dc-class-lifecycle.test.ts` (vm-loaded DC logic)

**Analog:** `apps/web/lib/ops/ops-dc-p4.test.ts` (exact for the technique). `ops-dc-chauffeur-class.test.ts` and `ops-dc-arabic-count-lines.test.ts` are the other two to follow, and they already cover OpsPricing/OpsDetail strings.

**Loader** (p4 lines 16-30):
```ts
const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "../../../..");
function scriptOf(name: string): string {
  const m = read(`app/ops/${name}`).match(/<script type="text\/x-dc" data-dc-script[^>]*>\n([\s\S]*?)\n<\/script>/);
  if (!m?.[1]) throw new Error(`missing script block in ${name}`);
  return m[1];
}
```
**Stub base class** (p4 lines 35-45): `class StubLogic { props = {}; state = {}; setState(patch, done) {...}; forceUpdate() {} }`.

**Evaluate** (p4 lines 79-90):
```ts
const out = new Function(
  "DCLogic", "window", "document", "localStorage", "history", "PopStateEvent", "navigator",
  `${scriptOf("OpsDetail.dc.html")}\nreturn { Component, T };`,
)(StubLogic, win, { body: { style: {} } }, { getItem: () => "en" }, { pushState: noop }, class {}, {}) as {...};
```
Build `win` with `VamosOpsApi`, `VamosOps` (collections via a `coll(rows)` helper, p4 lines 47-56), `VamosLocale`, and `addEventListener`/`removeEventListener`/`dispatchEvent`. Then `comp.state = { ...comp.state, lang }` per language and assert `comp.renderVals()`. Loop over `LANGS = ["en","de","fr","ar"]` as p4 does.

**Prerequisites:** the loader reads `app/ops/*.dc.html` directly. The page is `OpsPricing.dc.html`, and after the rename `OpsChauffeurs.dc.html`. Run `node scripts/sync-dc-mock-to-public.mjs` before vitest, and run vitest as `apps/web/node_modules/.bin/vitest`. `ops-dc-editor-foot.test.ts` currently expects `>{{ deleteBtnLabel }}<` and must change (answer 10: no Delete in the Edit class foot).

---

### `vehicle-class-status-http.test.ts` and `vehicle-class-draft-birth.test.ts` (recorder tests)

**Analog:** `apps/web/lib/ops/chauffeur-class-keep.test.ts` (lines 9-45).
```ts
const asStaff = vi.fn();
vi.mock("../db/identity", () => ({ asStaff: (...a: unknown[]) => asStaff(...a) }));
vi.mock("../supabase/server", () => ({ createSupabaseServerClient: () => ({}), createServerSupabaseClient: () => ({}) }));

function recorder() {
  const calls: { text: string; values: unknown[] }[] = [];
  const sql = (strings: TemplateStringsArray, ...values: unknown[]) => {
    calls.push({ text: strings.join("$"), values });
    return Promise.resolve([{ id: ID }]);
  };
  return { sql, calls };
}
const claims: VamosClaims = { sub: "a0000000-...", role: "authenticated", app_metadata: { vamos_role: "admin" } };
```
For the draft-birth test, make `asStaff` call its callback with the recorder's `sql` and assert that the recorded insert text has `active` bound to `false`. For the status route, mock `getCloudflareContext` and `@/lib/ops/staff-json` the way other route tests in `lib/ops/*.test.ts` do (check `fleet-http.test.ts` first); pure parsers (`parseClassDeleteReason` successor) follow `vehicle-class-write.test.ts`, which is plain input/output `expect(...).toEqual`.

---

### `docs/runbook/p30-remove-test-classes.sql` (+ `.md`) (owner-run, one transaction)

**Analog:** `docs/runbook/d37-delete-test-bookings.sql` (204 lines) and `.md` (46 lines). Copy the layout and wording, not the tables.

**Header and STEP 0 preview as a commented block** (sql lines 1-20): "OWNER RUNS THIS. Agents never run it." plus a preview `select` inside `/* ... */` that the owner runs first.

**Params with a count guard** (sql lines 40-60):
```sql
begin;
create temporary table d37_params on commit drop as
select timestamptz '2026-09-29 00:00:00+00' as cutoff, 33::int as expected;
...
do $$ declare v_found int := ...; v_expected int := ...;
begin
  if v_found <> v_expected then
    raise exception 'D-37 abort: % ... expected %. Nothing was changed.', v_found, v_expected;
  end if;
```
For Phase 30: the id list is `select id from public.vehicle_classes where slug in ('business','economy','first','van','mahaha')`, expected 5, plus a second guard that the reviews with `external_ref in ('rv-1',...,'rv-5')` number 5 (`external_ref` is the key, not `id`).

**Zero-reference guard (new, from decision 6):** abort if any of `booking_legs`, `price_snapshots`, `vehicles`, `chauffeurs` still points at those ids (live check 2026-10-11 found none).

**FK self-check** (sql lines 63-92): the `pg_constraint` query with `v_listed text[]`. Copy it with `confrelid = 'public.vehicle_classes'::regclass` and the listed tables `distance_rates, fixed_routes, distance_bands, booking_legs, price_snapshots, vehicles, chauffeurs, reviews`. An unlisted referencing table aborts.

**Backup schema before delete** (sql lines 94-120): `create schema backup_p30_<date>; create table backup_p30_<date>.vehicle_classes as select * from public.vehicle_classes where id in (...)`, one table for each child table, the `city_pair` rules and the reviews.

**Disable and re-enable triggers inside the transaction** (sql lines 122-128, 150-156). The frozen triggers for this phase are `distance_rates_frozen`, `fixed_routes_frozen`, `distance_bands_frozen` and `rate_version_rules_frozen` (from `20260823000008_rate_versions.sql` and `20261007250000`). The `_ins` insert variants are not touched by a delete. Delete children, then classes, then reviews.

**Final assert block** (sql lines 158-203): counts of backups equal ids, 0 rows left, `select ... from pg_trigger where tgname in (...) and tgenabled = 'D'` must be empty, then `raise notice 'D-37 done: ...'` and `commit;`. Rename the messages to `P30`.

**`.md` runbook** (md lines 1-46): the numbered steps, "Expected messages (NOTICE lines)", "If you see `... abort: ...` nothing was changed. Send me the message", "Why it is safe". Add what the D-37 runbook does not have: the `archive/*` tag of the rows on GitHub first, and the different-model (Sonnet) check recorded in the hand-over. The R2 photo keys are not touched by SQL; the next publish sweep removes them after the 24 h grace period.

---

### `scripts/p30-local-proof.sh` (native lab, no Docker)

**Analog:** `scripts/d37-local-proof.sh` (184 lines). Its logic transfers (refuse non-local, wrong-count run aborts and changes nothing, real run, per-table backup counts, no trigger left in `tgenabled='D'`); its plumbing does not.

**What to replace** (d37 lines 13-33): the Docker lines are hard-wired to a container and to port 55322:
```bash
CONTAINER="supabase_db_vamos-taxi-263"
DB_URL="postgres://postgres:postgres@127.0.0.1:55322/postgres"
psql_() { docker exec -i "$CONTAINER" psql -U postgres -v ON_ERROR_STOP=1 -At "$@"; }
```
**Native lab replacement:** `scripts/test-lab/lab.sh env <name>` prints `export LAB_DB_URL=...` and `export LAB_PSQL=...` (lab.sh lines 399-414; `LAB_PSQL` is only set when `LAB_RUNTIME=native`). The script should take the lab name as `$1`, `eval "$(scripts/test-lab/lab.sh env "$1")"`, then:
```bash
psql_() { "$LAB_PSQL" "$LAB_DB_URL" -At -v ON_ERROR_STOP=1 "$@"; }
```
and refuse unless `LAB_DB_URL` matches `127.0.0.1:45[1-9]22` (slot port block from `set_ports`, lab.sh lines 33-40: `SB_DB = 45000 + n*100 + 22`), and `lab.sh status` shows the stack is the lab's own. `lab.sh up p30` creates the stack; `lab.sh pgtap` resets it, so run the proof after pgTAP or use `lab.sh reseed`.

Keep the d37 pattern of a `sed`-substituted copy of the script for the proof (swap the `expected` value for the fixture count), the `wrong.sql` run that must abort with the exact message, and `trap cleanup_fixture EXIT`. The fixture here is simpler than d37's: insert 5 synthetic classes with child rows in a closed live-style version (`set local session_replication_role = replica` for the frozen inserts), 5 synthetic reviews, then assert they are gone and the backup schema holds them. Use synthetic integers only.

---

## Shared Patterns

### Admin-only SECURITY DEFINER RPC posture
**Source:** `20260928160000_vehicle_class_delete_or_hide.sql` lines 32-60 and 110-117.
**Apply to:** the new lifecycle RPC. `security definer`, `set search_path = ''`, fully `pg_catalog.`-qualified types, `app.is_admin()` guard with `42501`, `for update` on the row, `revoke ... from public` and from `anon, authenticated`, `grant ... to vamos_staff`. The assign RPC is the opposite door: `vamos_system` only.

### REST revoke
**Source:** `20261007320000_rest_function_revoke.sql` and `tests/rest_function_grants.test.sql` lines 54-60. A new SECURITY DEFINER function in `public` is executable by `public` by default; the explicit `revoke` lines above are the whole mitigation. Assert them in pgTAP with `has_function_privilege('anon'|'authenticated', ..., 'EXECUTE')`. That migration is unapplied on live and stays so until the owner's word; the new migration must not depend on it.

### Staff route auth and JSON door
**Source:** `lib/ops/staff-json.ts` lines 27-31 (`jsonOk`, `jsonErr(code, status, extra?)`), 123-130 (`withStaff`, `withAdmin`).
**Apply to:** every route change. Status changes use `withAdmin` (the RPC is the second guard). Reads stay `withStaff`.

### Error mapping
**Source:** the DELETE catch in `vehicle-classes/route.ts:158-163` plus `fleetJsonError` (`fleet-http.ts:354-366`, `VehicleClassInputError` returns 400, `23505` 409, `23503` 409, `23514` 400, otherwise 500). Catch SQL refusals outside `asStaff`'s callback.

### Worker pg client limits
`fetch_types:false`: no `text[]` in or out; `JSON.stringify(x)::jsonb` arrives as a JSON string (use `sql.json`). Return `missing` as comma-separated text.

### DC logic tests through `vm`
**Source:** `ops-dc-p4.test.ts` lines 16-90. Run `node scripts/sync-dc-mock-to-public.mjs` first. Parallel agents run only the files they touched; the lead runs `pnpm gate:local` once.

### Four languages and DC rules
All touched `.dc.html` keep `--vt-shadow-accent:none` and `.vt-input--focus{box-shadow:none}`; every new string lands in `app/vamos-i18n-dict.js` with de, fr, ar; `VamosLocale.coverage(root)` is empty; Arabic count forms reuse `arCountForm` (pinned in `ops-dc-arabic-count-lines.test.ts`). The UI-SPEC rev 4 lists what the prototype got wrong (Pitfall 9).

---

## No Analog Found

| File / Concern | Role | Data Flow | Reason |
|---|---|---|---|
| State-machine transition table inside the lifecycle RPC (draft/live/retired, `bad-transition`, `incomplete` with missing list) | migration | state machine | No existing RPC has a transition table; reuse the skeleton above, use 30-RESEARCH.md Pattern 1 pseudocode |
| `audit_log` assertion for a class state change | test | audit | The trigger exists (`20260823000017_audit_log.sql:82`) but no pgTAP test asserts a `vehicle_classes` audit row; write from the table's columns |
| `missing` list defined by one SQL `exists` used by both the guard and the presenter | service | read | New; both the RPC and `loadVehicleClasses` must share one definition (a SQL view or function is the option; plain duplication risks drift) |
| Native-lab variant of a destructive-script proof | script | batch | `d37-local-proof.sh` is Docker-only; no native-lab proof script exists yet. `lab.sh env` supplies `LAB_PSQL` and `LAB_DB_URL` |

## Metadata

**Analog search scope:** `packages/db/supabase/{migrations,tests}`, `apps/web/{lib/ops,lib,app/[locale]/(ops)/api/staff,middleware.ts}`, `docs/runbook`, `scripts`, `scripts/test-lab`.
**Files read:** 20, with targeted ranges for the large ones (`assign_by_class.sql` 431 lines, `middleware.ts`, `rate-book.ts`, `lab.sh` 655 lines). No PNG, no whole `.dc.html` or dictionary.
**Pattern extraction date:** 2026-10-12
