# Phase 32: Automatic translator - Pattern Map

**Mapped:** 2026-10-13
**Files analyzed:** 44 (new, modified, deleted)
**Analogs found:** 38 / 44 (6 have no analog; see the end)
**Basis:** CONTEXT (D-05..D-10, F-01..F-07), RESEARCH (revision note on top), UI-SPEC (signed), `32-prototype-wip.patch` (signed markup), worktree `phase-32-auto-translate` at `dd097065`, `origin/main` = `71e3b326`.

Naming rule from CONTEXT (wins over RESEARCH): the server module lives in `apps/web/lib/translate/`, not `lib/i18n/machine/`.

## Read this first (things that will bite a plan)

1. **`worker.ts` queue(): the `-dlq` branch catches a translate DLQ.** `apps/web/worker.ts` line 231 is `if (batch.queue.endsWith("-dlq"))` and sends it to the Stripe alert mail (`consumeDlqMessage`, `handleDlqMessage`). The translate branch must come BEFORE line 231 and must match `batch.queue.startsWith("vamos-translate")` (both the queue and its `-dlq`). RESEARCH only warns about the Stripe loop (line 250), which is the second trap.
2. **Public reviews have no id.** `apps/web/lib/public/reviews.ts` lines 13-27 (`PublicReview`) and `app/api/reviews/route.ts` follow security S10 (2026-10-05): no row id leaves the server. The signed prototype keys the tap on `r.id` and calls `GET /api/reviews/{id}/translation?lang=` (patch lines 805-814), and RESEARCH says `POST /api/reviews/:id/translate`. Two conflicts to settle in the plan: (a) verb (the prototype GET is CDN-cacheable, which matches D-09 and F-06; a POST is not), (b) the handle. Recommended: add a public opaque `ref` (first 16 hex of `sha256(body)`, a derived value, not a row id) to `PublicReview`, and make the route resolve the `ref` only against published rows. The DC `fromApi()` in `app/vamos-reviews.js` line 71 reads `r.id`, so it must read `ref` instead.
3. **`public.reviews` is column-granted.** `20261005120000_reviews_column_grants.sql` lines 31-40 grant an explicit column list to `anon, vamos_public`. A new `reviews.language` column is invisible to `lib/public/reviews.ts` until the grant is extended in the new migration, and `tests/reviews_column_grants.test.sql` (`plan(24)`) pins the list.
4. **`vamos_system` is definer-only** (`20260930210000_system_role_narrow_reads.sql` header; `lib/db/system-reads.ts` lines 1-9): no raw table statement through `asSystem`, except the support tables. The queue consumer therefore writes through new `SECURITY DEFINER` functions. `staff_extra_label_upsert` is `vamos_staff` + `app.is_admin()` only (`20260930140000_extra_labels.sql` lines 45-87), so a queue consumer cannot call it. Either keep the extras translation inline in the staff save (as `saveExtraLabels` does today) or add a `system_extra_label_fill` function.
5. **New dynamic icon names need an entry.** `apps/web/lib/icons/dynamic-icon-bindings.ts` is read by `icon-files-exist.test.ts`; a `name="{{ … }}"` binding not listed fails. Needed: `c.icon` for `OpsSidebar` CONTENT shrinks from `["globe","shield-check","star"]` (line 47) to `["star"]`; add `r.trIcon` (`globe`, `loader-circle`) for `Reviews.dc.html`, `answerIcon` (`mail`, `loader-circle`) and `m.noteIcon` (`loader-circle`, `info`) for `OpsSupportTicket.dc.html`.
6. **Existing guard tests that the prototype contradicts.** `apps/web/tests/unit/ops-support-read-only.test.ts` asserts no `Textarea` (line 33), a literal `icon="mail" disabled="{{ answerOff }}" …` (line 35) and `mailHint:'` x4 (line 60). The reply box and the busy icon break all three; rewrite the test to the new contract (the dashboard still sends nothing: only the mail link opens). `tickets-route-readonly.test.ts` (PATCH refuses `reply`) stays valid because the new route is separate.
7. **Migration numbers are the controller's.** Latest on `main`: `20261012190000_duplicate_out_of_cancel_basis.sql`. Phase 30 holds `20261012200000`, `…210000`, `…220000_edit_request_retired_class`. Phase 31 also holds `20261012240000_refund_check_reader` (two branches already share `…220000`). Phase 32 files sort after both. Names only here; none written.
8. **Prototype patch will not apply cleanly after Phase 30** (see Overlap section). Treat `32-prototype-wip.patch` as markup reference and re-apply by hand on the post-Phase-30 text.

## File Classification

### New files

| File | Role | Data flow | Closest analog | Match |
|------|------|-----------|----------------|-------|
| `apps/web/lib/translate/translate.ts` (call, `AiLike`, model id, `enable_thinking:false`) | service | request-response | `apps/web/lib/ops/extra-label-translate.ts` | exact |
| `apps/web/lib/translate/mask.ts`, `guard.ts`, `post-process.ts` | utility | transform | `extra-label-translate.ts` `clean()` (lines 18-22) | partial |
| `apps/web/lib/translate/store.ts` (cache get/put through definer RPCs) | service | CRUD | `apps/web/lib/db/system-reads.ts` | exact |
| `apps/web/lib/translate/jobs.ts` (job handler: support, review, extra, sweep) | service | event-driven | `apps/web/lib/checkout/stripe-events-sweep.ts` (deps-injected sweep) | role-match |
| `apps/web/lib/translate/queue-consumer.ts` | service | event-driven | `apps/web/lib/checkout/queue-consumers.ts` | exact |
| `apps/web/lib/translate/*.test.ts` (mask, guard, translate, consumer) | test | transform | `lib/ops/extra-label-translate.test.ts`, `lib/checkout/queue-consumers.test.ts` | exact |
| `apps/web/app/api/reviews/[ref]/translation/route.ts` | route | request-response, cached | `apps/web/app/api/reviews/route.ts` + `app/api/fx/route.ts` | exact |
| `apps/web/app/[locale]/(ops)/api/staff/tickets/[id]/reply-translate/route.ts` + dual mount `apps/web/app/api/staff/tickets/[id]/reply-translate/route.ts` | route | request-response | `…/staff/tickets/[id]/route.ts` + its 2-line mount | exact |
| `packages/db/supabase/migrations/<ts>_translations.sql` (cache table, RLS, audit trigger) | migration | CRUD | `20260930140000_extra_labels.sql` | exact |
| `<ts>_translation_rpcs.sql` (`system_*` put/get/claim, EXECUTE `vamos_system`) | migration | CRUD | `20260930210000_system_role_narrow_reads.sql` | exact |
| `<ts>_support_message_language.sql` (`detected_lang`, `support_message_translations`, staff select RLS) | migration | CRUD | `20260904182631_contact_ticket_schema.sql` lines 98-130 | role-match |
| `<ts>_reviews_language.sql` (`reviews.language`, column grant, translate cache read) | migration | CRUD | `20261005120000_reviews_column_grants.sql` | exact |
| `packages/db/supabase/tests/translations_human_wins.test.sql`, `translation_public_only.test.sql`, `support_translation_staff_only.test.sql`, `reviews_column_grants` update | test (pgTAP) | CRUD | `tests/extra_labels.test.sql`, `tests/system_role_narrow_reads.test.sql` | exact |
| `scripts/i18n-fill.mjs` (+ `scripts/i18n-fill.test.mjs`) | utility | batch, file-I/O | `scripts/pull-content-strings.mjs` | role-match |

### Modified files

| File | Change | Role | Closest analog / reference |
|------|--------|------|----------------------------|
| `apps/web/worker.ts` | translate branch first in `queue()`; translate sweep in the `0 3 * * *` block | entry | itself (lines 123-139, 219-266) |
| `apps/web/wrangler.jsonc` | producer + consumer + DLQ in `env.staging` (lines 95-134) and `env.production` (308-…) | config | Stripe queue block |
| `apps/web/lib/env.d.ts` | `TRANSLATE_QUEUE: Queue` next to `STRIPE_EVENTS` (line 55); update `AI?` comment (line 38) | config | lines 36-55 |
| `apps/web/lib/ops/extra-label-translate.ts` (+ `.test.ts`, `rate-book-labels.test.ts`) | m2m100 call to the shared engine; keep `planExtraLabels` staff-wins | service | itself, lines 72-105 |
| `apps/web/app/[locale]/(ops)/api/staff/rate-book/route.ts` | `saveExtraLabels` (lines 660-692) uses the new engine/queue | route | itself |
| `apps/web/lib/ops/ticket-inbound.ts` | enqueue after the transaction returns "ok" | service | itself, lines 98-122 |
| `apps/web/app/api/contact/route.ts` | enqueue after `submissionId` (line 70) | route | itself |
| `apps/web/lib/ops/tickets.ts`, `tickets-map.ts` | message `lang` + `translation{text,status}`; `ticketReply` unchanged | service | lines 71-160 of `tickets-map.ts` |
| `apps/web/lib/public/reviews.ts` | `language`, `ref` in `PublicReview` | service | lines 13-83 |
| `apps/web/lib/abuse/read-rate-limit.ts` | add `"review-translate"` to `ReadRoute` | utility | line 18 |
| `apps/web/lib/icons/dynamic-icon-bindings.ts` | entries (see top, item 5) | config | lines 29-60 |
| `app/home/Reviews.dc.html` | translate button | component | patch lines 1-156 |
| `app/ops/OpsSupportTicket.dc.html` | translated message, reply box | component | patch lines 273-695 |
| `app/ops/OpsSidebar.dc.html`, `app/ops/ops.dc.html` | drop Pages/Legal | component | patch lines 242-271, 696-741 |
| `app/vamos-reviews.js` | `lang`/`ref`, `translate()` | utility | patch lines 790-818 |
| `app/vamos-ops-api.js` | drop `OpsContent: 1` | config | patch lines 777-788 |
| `app/vamos-i18n-dict.js` | append strings + 1 pattern (append-only) | config | patch lines 742-776 |
| `apps/web/middleware.ts` or (post-Phase-30) `apps/web/lib/ops/console-paths.ts` | drop `/pages`, `/legal` | config | see Overlap |
| `tests/unit/ops-support-read-only.test.ts`, `ops-dc-content-loader.spec.ts` | rewrite / trim | test | see item 6 |
| `docs/build/CONTENT-STRINGS-RUNBOOK.md` (lines 10-16), `docs/build/MISSING-FEATURES.md` (line 190) | rewrite staff-route steps | docs | n/a |

### Deleted files (CONTEXT `<removed>`, all verified present in the worktree)

`app/ops/OpsContent.dc.html`; `apps/web/app/[locale]/(ops)/api/staff/content/{route.ts,[key]/route.ts,[key]/flags/route.ts}`; dual mounts `apps/web/app/api/staff/content/{route.ts,[key]/route.ts,[key]/flags/route.ts}`; `apps/web/app/[locale]/(ops)/ops/content/actions.ts`; `apps/web/lib/ops/content.ts`; `apps/web/tests/integration/ops-dc-content.spec.ts`; `content-string-edit.spec.ts`. Trim `ops-dc-content-loader.spec.ts` (line 51 and 70-78). Grep (2026-10-13) finds no other importer; extra hits to clean: `apps/web/lib/icons/dynamic-icon-bindings.ts:47`, `docs/build/MISSING-FEATURES.md:190`. Keep `apps/web/lib/db/content.ts`. Dictionary rows `'Pages'` (line 2344) and `'Legal'` (line 255) are removal candidates after a grep for other users.

## Pattern Assignments

### `apps/web/lib/translate/translate.ts` (service, request-response)

**Analog:** `apps/web/lib/ops/extra-label-translate.ts`

**Binding type and no-throw contract** (lines 10-14, 24-30, 42-44):
```typescript
/** Minimal shape of the Workers AI binding we use (the real `Ai` type satisfies it). */
export type AiLike = { run: (model: string, input: Record<string, unknown>) => Promise<unknown> };
export async function translateExtraName(ai: AiLike | null | undefined, en: string) {
  if (!ai || !text) return {};
  ...
  } catch {
    console.error("extra_label_translate", lang);   // reason only, never the text
  }
```
Copy: `ai` is nullable (tests, local runs: `AI?: Ai`, `lib/env.d.ts` line 41); the function never throws; a failed language is simply absent (F-07). Extend `AiLike.run` with the third `opts` argument (`{ signal }`), as RESEARCH section A says; the real `Ai` type has it.

**Post-process** (lines 18-22): `out.replace(/ß/g, "ss")`, trim, slice. Generalise to `ß→ss`, `ẞ→SS` for de and Arabic-Indic digits to 0-9 for ar (F-03, deterministic).

**Call shape (RESEARCH Code Examples lines 284-299, apply as written):** `messages`, `response_format: json_schema`, `temperature: 0.2`, `max_completion_tokens`, `chat_template_kwargs: { enable_thinking: false }`, `signal: AbortSignal.timeout(...)`. Model id in ONE exported constant (replace `TRANSLATE_MODEL = "@cf/meta/m2m100-1.2b"`, line 13). Call `env.AI.run` directly, never AI Gateway (D-04).

**Test pattern** (`extra-label-translate.test.ts` lines 4-11): a `vi.fn` stub typed as `AiLike`, one case per failure; add the unit assertion that the input object carries `enable_thinking:false` (RESEARCH pitfall 1).

---

### `apps/web/lib/translate/store.ts` (service, CRUD through definer functions)

**Analog:** `apps/web/lib/db/system-reads.ts`

**Imports and wrapper style** (lines 11, 77-80, 104-108):
```typescript
import { asSystem } from "./identity";
export const loadPaidCancelMail = async (env: CloudflareEnv, bookingId: string) =>
  (await asSystem(env, (sql) =>
    sql<PaidCancelMailRow[]>`select * from public.paid_cancel_mail_read(${bookingId}::uuid)`,
  ))[0] ?? null;
export const markRefundProcessing = (env: CloudflareEnv, bookingId: string) =>
  asSystem(env, async (sql) => { await sql`select public.booking_refund_processing_mark(${bookingId}::uuid)`; });
```
Rules to keep: one narrow wrapper per function; never raw table SQL through `asSystem` (the support tables are the only exception); a client is never built at module scope (`scripts/check-db-access-fences.mjs`: module-scope client and module-level Sets are banned; read its header lines 1-20 before writing). Worker pg client has no arrays: pass a JSON string with `sql.json`, never `text[]` (memory worker-pg-client-no-arrays); `pgTextArrayLiteral` (`lib/checkout/pg-array.ts` line 5) is the existing escape for `::text[]`.

Hash key: `crypto.subtle.digest("SHA-256", …)` over `lang + "\n" + NFC(trimmed, whitespace-collapsed source)` (RESEARCH D). `prompt_version` is a column, not part of the key.

---

### `apps/web/lib/translate/queue-consumer.ts` (service, event-driven)

**Analog:** `apps/web/lib/checkout/queue-consumers.ts` (testable consumers that take their I/O; `worker.ts` itself cannot be imported by vitest because it imports `cloudflare:workers` and `.open-next/worker.js`, lines 9-12). So RESEARCH's `worker-translate-queue.test.ts` should be a `queue-consumer.test.ts` next to the module.

**Core pattern** (lines 11-14, 33-62):
```typescript
type Emit = (level: "debug" | "info" | "warn" | "error", type: string, fields?: Record<string, ScalarValue>) => void;
export type ConsumerMessage = QueueMessageControl & { id: string; body: unknown };
export function caughtFields(err: unknown): Record<string, string> { … }   // SQLSTATE or error name, never text
...
  } catch (err) {
    emit("error", "queue_handler_threw", { messageId: message.id, …caughtFields(err) });
    try { message.retry({ delaySeconds: retryDelayForAttempt(message.attempts) }); ackOutcome = "retry"; }
    catch { ackOutcome = "ack-failed"; }
  }
  if (ackOutcome === "ack-failed") throw new Error("queue message could be neither acked nor retried");
```
Reuse `caughtFields` and `retryDelayForAttempt` (`lib/checkout/settle-errors`). Message body is ids only, never text (RESEARCH E, Privacy). The translate DLQ branch acks and logs; it must not call `handleDlqMessage` (that mails info@). Test pattern: `queue-consumers.test.ts` lines 4-50 (`msg()` factory with `ack`/`retry` mocks, assert no PII in `emit` calls).

---

### `apps/web/worker.ts` (entry)

**Queue branch placement** (lines 219-248, 250-265): insert before line 231:
```typescript
if (batch.queue.startsWith("vamos-translate")) {   // BEFORE the Stripe "-dlq" check at line 231
  …consume…; return;
}
if (batch.queue.endsWith("-dlq")) { … }            // existing Stripe DLQ
```
**Cron** (lines 123-139): the `0 3 * * *` block ends with `return;` at line 138; add the translate sweep as its own try/catch with the same `emit(...)` shape:
```typescript
try { const cleaned = await sweepMetaPurchaseIds(env); emit("info", "meta_purchase_sweep", { cleaned }); }
catch { emit("error", "meta_purchase_sweep", { outcome: "failed" }); }
```
Counts only in the log. Mail info@ only on failure (CONTEXT Jev/automation line is a proposal; build only on his word).
Phase 31 inserts a `refundCheck` try/catch in the same block (see Overlap).

### `apps/web/wrangler.jsonc` (config)

Copy the Stripe pair at `env.staging` lines 95-134 and the `env.production` twin (line 308 onwards): producer `{ "binding": "TRANSLATE_QUEUE", "queue": "vamos-translate-staging" }`, consumer (RESEARCH E: `max_batch_size 5`, `max_batch_timeout 2`, `max_retries 6`, `retry_delay 30`, `dead_letter_queue`), and a DLQ consumer with no `dead_letter_queue` (lines 123-134). Top-level bindings are not inherited by named envs (file comment, RESEARCH A), so both envs get their own block. The `ai` binding exists already (lines 90 and 304) and its comment ("extra names are machine-translated on save (D-44)") is stale. Queue creation is a live-account step: report it to the controller, do not run it.

---

### `apps/web/app/api/reviews/[ref]/translation/route.ts` (route, public, cache-first)

**Analogs:** `apps/web/app/api/reviews/route.ts`, `apps/web/app/api/fx/route.ts`

**Imports + rate limit + headers** (`reviews/route.ts` lines 7-35):
```typescript
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { readAllowed, readRateLimited } from "@/lib/abuse/read-rate-limit";
export const dynamic = "force-dynamic";
const noStore = { "cache-control": "private, no-store" };
const shared = { "cache-control": "public, max-age=300, s-maxage=300" };
function jsonOk(data: unknown, status = 200): Response { return Response.json({ ok: true, data }, { status, headers: shared }); }
export async function GET(request: Request) {
  const { env } = getCloudflareContext();
  if (!(await readAllowed(env.READ_RATE_LIMITER, "reviews", request))) return readRateLimited();
```
Envelope is `{ ok, data }` / `{ ok:false, code }` (the prototype reads `json.ok ? json.data.text`, patch line 811). Add `"review-translate"` to `ReadRoute` (`read-rate-limit.ts` line 18) so it gets its own key, `read:review-translate:<ip>` (120/60 s, namespace 1012). Failure answers `private, no-store` (fx route lines 12-17 do the same for non-200). Method guards: copy the `POST/PATCH/DELETE → 405` stubs (lines 38-45) for the verbs not used.

**Behaviour to implement:** cache-first read in the translation store; on a miss, send one model call inline with `AbortSignal.timeout`, store, answer; target must be one of en/de/fr/ar; ref must match a published review (a fixed 'public contexts only' filter, so no customer text can be asked for); on any failure `{ ok:false, code:"unavailable" }` (D-09: no model call at page load, only on tap; F-07). Never put vendor or model name in the body (F-04).

**Mapping:** `lib/public/reviews.ts` select (lines 56-75) gains `r.language` and the derived `ref`; `PublicReview` type (lines 13-27) gains both; the `ref` must not be the row `id` (S10).

---

### `…/staff/tickets/[id]/reply-translate/route.ts` (route, staff, request-response)

**Analog:** `apps/web/app/[locale]/(ops)/api/staff/tickets/[id]/route.ts` (lines 1-62) and the dual mount `apps/web/app/api/staff/tickets/[id]/route.ts` (two lines):
```typescript
export const dynamic = "force-dynamic";
export { PATCH } from "../../../../[locale]/(ops)/api/staff/tickets/[id]/route";
```
Handler skeleton (same file):
```typescript
export const PATCH = withStaff(async (claims, request) => {
  const id = ticketId(request);                       // last path segment: adjust to .at(-2) for /reply-translate
  if (!id) return jsonErr("not-found", 404);
  let body: unknown;
  try { body = await request.json(); } catch { return jsonErr("invalid-json", 400); }
  if (!body || typeof body !== "object" || Array.isArray(body)) return jsonErr("invalid-json", 400);
  const { env } = getCloudflareContext();
  …
  return jsonOk({ … });
});
```
`withStaff`/`jsonOk`/`jsonErr` are in `lib/ops/staff-json.ts` (lines 24-35; CSRF origin check lines 37-52; mutating calls need an allowlisted Origin). The prototype posts `{ text, lang }` and reads `json.data.status === "ready"` and `json.data.text` (patch lines 551-556). Reply text is staff-typed so it may use the synchronous call; apply the same guard; cap length (RESEARCH V5: 4000); target outside en/de/fr/ar returns `status:"skipped"` (D-08). Log reason codes only, never text (RESEARCH V7). Verify the ticket exists through `asStaff` (as `patchTicket` does) so a foreign id is `not-found`.

---

### `apps/web/lib/ops/tickets.ts` + `tickets-map.ts` (service, CRUD read)

**Analog:** themselves. `OpsTicketMessage` (tickets-map.ts lines 27-32) gets `lang: string` and `translation: { text: string; status: "ready"|"pending"|"failed"|"same" } | null` (the prototype's `cloneTickets` reads exactly those two, patch lines 419-427). `SqlMessage` (lines 82-89) gains the new columns; `loadTickets` (tickets.ts lines 71-80 select list) adds `m.detected_lang` and a left join (or second query) to the staff-only translation table for `staff.lang`. The mapping at lines 168-178 is where the two fields are attached. `ticketReply` (lines 117-153) stays server-built (recipient, subject, thread); the page appends only `&body=` (UI-SPEC B2). The fallback branch at lines 179-187 (no messages: `row.message`) needs `lang: ""`.

### `apps/web/lib/ops/ticket-inbound.ts` and `apps/web/app/api/contact/route.ts` (enqueue points)

`ticket-inbound.ts` inserts the message inside `asSystem(...)` at lines 98-122 (`returning id` at line 114, `messageId` at line 115). Do NOT send on the queue inside the transaction (it could fire before commit). Return the id out of the transaction (the function currently returns `"ok"|"drop"`; widen it, or set a local `let newMessageId` assigned inside and read after `await asSystem(...)` resolves at line 142), then `env.TRANSLATE_QUEUE.send({ kind: "support", id })` in its own try/catch so a queue fault never turns `"ok"` into `"unavailable"` (F-07). Reuse the shape of `stripe-events-sweep.ts` line 160: `enqueue: (message) => env.STRIPE_EVENTS.send(message).then(() => undefined)`.
`contact/route.ts`: the form message row is created by the definer `submit_contact_message` (lines 62-68, `submissionId` at 69-70). Enqueue `{ kind: "support", submissionId }` right after line 70 and before the e-mail work, in its own try/catch; the job resolves the `inbound_form` message row at run time. Body of the job message: ids only.

---

### `apps/web/lib/ops/extra-label-translate.ts` and the rate-book route (extras)

**Staff-wins logic to keep** (lines 72-105): `planExtraLabels(ai, existing, input)`; a value the staff typed that differs from stored is a staff value; machine values are re-translated only when `en` changed or missing; failure never blocks. Keep `machineLangs` internally (D-02, F-05), never shown. Replace only the engine: `translateExtraName` becomes one call to the shared module returning `{de,fr,ar}`. The existing tests stub `ai.run` returning `{ translated_text }` keyed by `target_lang` (`extra-label-translate.test.ts` lines 4-11, `rate-book-labels.test.ts` lines 4-8); both need the new Gemma response shape (`choices[0].message.content` JSON).
Call site: `rate-book/route.ts` `saveExtraLabels` lines 660-692 (`planExtraLabels(ai, existingAll[code] ?? null, …)` then `staff_extra_label_upsert` with `pgTextArrayLiteral(plan.machineLangs)::text[]`). The catch at line 690 logs `console.error("extra_label_translate")` with no text. Phase 30 edits this file from line 12 and 538 and 804 onward; lines 600-692 are untouched.

---

### Migrations

**`<ts>_translations.sql` — analog `20260930140000_extra_labels.sql`** (lines 8-29):
```sql
create table public.extra_labels (
  id bigint generated always as identity primary key, … 
  machine_langs text[] not null default '{}' check (machine_langs <@ array['de','fr','ar']::text[]),
  updated_at timestamptz not null default now(), updated_by uuid );
alter table public.extra_labels enable row level security;
revoke all on table public.extra_labels from public, anon, authenticated;
create trigger audit_extra_labels after insert or update or delete on public.extra_labels
  for each row execute function public.tg_audit_row();
```
Copy: identity PK (the audit trigger needs a non-null `record_id`, asserted in the test), RLS on, revoke all, audit trigger, `comment on table`. Columns per RESEARCH D (`source_hash`, `target_lang`, `origin`, `status`, `prompt_version`, `attempts`, `last_error`). Unique `(source_hash, target_lang)`. Machine write: `on conflict … do update … where translations.origin = 'machine'` (a human row can never be overwritten; pgTAP-tested).

**`<ts>_translation_rpcs.sql` — analog `20260930210000_system_role_narrow_reads.sql`**: function style (lines 20-36):
```sql
create or replace function public.paid_cancel_mail_read(p_booking_id pg_catalog.uuid)
returns table (reference pg_catalog.text, …)
language sql stable security definer set search_path = ''
as $$ select … from public.bookings as b … $$;
```
and the grant loop at the file end: `revoke all … from public/anon/authenticated; grant execute … to vamos_system; comment on function … 'EXECUTE: vamos_system only.'`. Schema-qualify everything, `pg_catalog.` types, empty `search_path`. A public-read function (cached review translation) follows `extra_labels_read()` (extra_labels.sql lines 31-43): `grant execute … to anon, authenticated, vamos_checkout, vamos_system, vamos_staff` with `revoke all … from public`. Check `20261012170000_db_privilege_hardening.sql` before choosing which roles may EXECUTE (it changed the default grants).

**`<ts>_support_message_language.sql` — analog `20260904182631_contact_ticket_schema.sql`** (lines 98-130): `enable` + `force row level security`, `revoke all … from public, vamos_public, vamos_edge, vamos_guest, anon, authenticated`, then `grant select … to vamos_staff` with a policy `using ((select app.is_staff()))`. Customer text goes only in these staff-only tables, never in `translations` (RESEARCH pitfall 3).

**`<ts>_reviews_language.sql` — analog `20261005120000_reviews_column_grants.sql`** (lines 31-40): `alter table public.reviews add column language text …`, then repeat the `grant select (…, language) on public.reviews to anon, vamos_public;` block with the new column (and the `authenticated` block). A column not listed is unreadable by `publicSql` (item 3).

**pgTAP analog `tests/extra_labels.test.sql`** (lines 1-60): `begin; select plan(N);` seed `auth.users` + `public.staff`, `function_privs_are(...)` per role, `set local role vamos_staff; select set_config('request.jwt.claims', …)`, `throws_ok(..., '42501', …)`, audit-row count at the end, `select * from finish(); rollback;`. Run through `scripts/test-lab/lab.sh pgtap <name>` (see `32-VALIDATION.md`).

---

### `scripts/i18n-fill.mjs` (batch, file I/O)

**Analog:** `scripts/pull-content-strings.mjs` (227 lines): shebang + header comment, `repoRoot` from `import.meta.url`, `MESSAGES_DIR = apps/web/i18n/messages`, `LOCALES = ["en","de","fr","ar"]`, `--check` flag, `flatten()` that skips `$` meta keys (lines 25-40), "never invents a key, reports instead". Gaps found: messages JSON 1 key x3 languages (RESEARCH), dict 0, emails 0; never touch `$meta.noParamKeys`, `nonTranslatableKeys`, `pendingValueKeys`, legal namespaces, the five `data-vt-legal` pages (F-01). Reaches Workers AI through `getPlatformProxy({ environment: "staging", configPath: "apps/web/wrangler.jsonc" })`; dev guard is in `apps/web/next.config.ts` lines 198-215 (`VAMOS_DEV_REMOTE_BINDINGS=0` in CI because `AI` is always remote). After a fill: `pnpm db:seed:gen`, then `pnpm i18n:check` (`scripts/check-i18n-coverage.mjs` header, three blocking checks). Email catalog reader to respect: `packages/emails/src/lib/t.ts` lines 12-45 (flat lookup, `?? FLAT.en` fallback, `{key}` placeholder pass).

---

### DC files (use the signed patch as markup reference; do not re-derive)

| File | Source in `32-prototype-wip.patch` | Notes |
|------|------------------------------------|-------|
| `app/home/Reviews.dc.html` | lines 1-156 | Insert after `<blockquote data-rv-q>`; loop appears twice (main + copy), clones need `qid + '-c' + k` (line 153). CSS follows the existing `[data-rv-link]` block (patch lines 9-16). |
| `app/ops/OpsSupportTicket.dc.html` | lines 273-695 | Sets `:root{--vt-shadow-accent:none}` and `.vt-input--focus{box-shadow:none}` (law, patch 281-282). Reply logic at 480-621 (`watchPending`, `runTranslate`, `finishBusy`, `mailBody`, `openMail`, `answerByMail`). Strings in page `T` x4 languages (patch 388-415) must equal `32-STRINGS.md` and the dict. |
| `app/ops/OpsSidebar.dc.html` | 242-271 | CONTENT array to one item; child row 40 to 44 px; `data-props.active` options lose `pages`, `legal`. |
| `app/ops/ops.dc.html` | 696-741 | Drop `isContent` mount, `CONTENT`, `HASH_TO_PATH` entries, `readPath` lines, `contentSection`. |
| `app/vamos-reviews.js` | 790-818 | `lang` in `fromApi` (read `language`), `translate(id, lang)` via the same `api()` helper (file line 43-67). Switch id to the opaque `ref` (item 2). |
| `app/vamos-i18n-dict.js` | 742-776 | One pattern before `Saved on` (patch 750-751) and one block of strings before `/* ── Reviews */` (patch 759-773). Existing entries reused: `'Try again'` (main line 495), `'Reviews'` (310). |
| `app/vamos-ops-api.js` | 777-788 | Remove `OpsContent: 1` (the SHELL_SCREENS list equals the screen imports of ops.dc.html). |

Dictionary gate reminders from memory: DC `{{ value }}` splits sentences into text nodes (dc-i18n-text-nodes-split), so `Translated from %s` stays a `patterns` regex entry, with the language name inside `data-vt-no-i18n`; `data-i18n-skip` is ignored. After editing mocks, `scripts/sync-dc-mock-to-public.mjs` mirrors them into the gitignored `apps/web/public/app/`.

DC logic test pattern: tests that read the `.dc.html` text and `vm`-run the logic live under `apps/web/lib/ops/*-dc*.test.ts` (e.g. `ops-dc-u08.test.ts`, `phase-15-dc.test.ts`, `reviews-json.test.ts`). The mail-body unit stubs in UI-SPEC "Signing" belong there.

## Shared Patterns

### Staff route envelope and CSRF
**Source:** `apps/web/lib/ops/staff-json.ts` lines 24-52 (`jsonOk`, `jsonErr`, `staffOriginAllowed`, `withStaff`). **Apply to:** `reply-translate` route. Every staff route has a dual mount in `app/api/staff/...` that re-exports from `app/[locale]/(ops)/api/staff/...`; `lib/dc-mock-urls.ts` lines 187-188 already lets `/api/staff/*` through on the dashboard host.

### Public read: rate limit, no-store on failure
**Source:** `apps/web/lib/abuse/read-rate-limit.ts` lines 29-67 (`readAllowed` lets the request through when the binding is missing; `readRateLimited` = 429, `private, no-store`, `retry-after: 60`). **Apply to:** the review translation route.

### No text in logs, no text in queue messages
**Source:** `apps/web/lib/checkout/queue-consumers.ts` `caughtFields` (lines 25-30) and the PII test (`queue-consumers.test.ts` lines 32-35). **Apply to:** every translate path; log `{reason, lang, hash}` only (RESEARCH C5, V7).

### Machine never overwrites human
**Source:** `extra-label-translate.ts` lines 85-92 (staff value wins) and `extra_labels.machine_langs`. **Apply to:** `translations.origin`, every `put_machine` function (`where origin='machine'`), the fill script (skip any `(key, lang)` that already has a value, even one identical to English: F-05).

### Legal and approved text are never translated (F-01)
**Source:** `$meta.noParamKeys` / `nonTranslatableKeys` / `pendingValueKeys` in `apps/web/i18n/messages/en.json`, `content_strings.non_translatable`, pages with `data-vt-legal`. **Apply to:** fill script, overlay, review route (reviews are customer text, not legal; fine), queue sweep.

### No model call in a public page view (F-06, F-07)
Overlay and cache reads are plain SELECTs through `publicSql` (`lib/db/public.ts`, built per call, never at module scope) or a definer function; the only public model call is the tap on a review, rate limited and cache-first.

## Overlap with Phase 30 and Phase 31 (both unmerged; `git diff origin/main...origin/phase-3x`)

Both branches fork from the current `origin/main` (`71e3b326`), so the three-dot diffs below are exactly their changes.

### Phase 30 (`origin/phase-30-vehicle-class-lifecycle`, 509 files)

| File | What Phase 30 changes | Near what Phase 32 touches |
|------|----------------------|----------------------------|
| `app/ops/OpsSidebar.dc.html` (+4/-2) | Adds `:root{--vt-shadow-accent:none}` and `.vt-input--focus{box-shadow:none}` at line 12 (+2 lines); `chauffeurs` href `/fleet/chauffeurs` becomes `/chauffeurs` (main line 124, now 126). | Phase 32 edits the CONTENT array (main 135-139, becomes 137-141), the `contentItems` row `height:40px` (main line 59) and `data-props` (main 117). The `CONTENT` hunk in the patch has no `chauffeurs` context, so it should apply with an offset of +2; the `<script data-props>` line is a single long line and may need a manual redo. Phase 30 already adds the two law lines, so Phase 32 must not add them again. |
| `app/ops/ops.dc.html` (+18/-) | Renames `FLEET`/`isFleet` to `CHAUFFEURS`/`isChauffeurs`, `OpsFleet` to `OpsChauffeurs`; `HASH_TO_PATH` `vehicles`/`chauffeurs` to `/chauffeurs`; `readPath` accepts `/chauffeurs`, `/fleet`, `/fleet/chauffeurs` and a `chauffeurBase` split. | Phase 32 removes `CONTENT` (main 261), `pages`/`legal` in `HASH_TO_PATH` (266), two `readPath` lines (315-316), `contentSection`/`isContent` (439-440), the `OpsContent` mount (224-226). The patch hunks carry context lines `const FLEET = …`, `customers: '/customers', vehicles: '/fleet/chauffeurs' …`, `isDash: …, isFleet: …`, so those hunks FAIL after Phase 30. Edit by hand against the post-30 text. |
| `app/vamos-ops-api.js` (+1/-1) | Line 50: `OpsFleet: 1` becomes `OpsChauffeurs: 1`. | The patch's one-line hunk (lines 777-788) has `OpsFleet: 1` in its context line, so it fails; remove only `OpsContent: 1`. |
| `apps/web/middleware.ts` (+52/-) | Moves `OPS_CONSOLE_EXACT`, `normalizeDashboardPath`, `isOpsConsolePath` out of the file into new `apps/web/lib/ops/console-paths.ts` (list at its lines 8-23 still contains `"/pages"`, `"/legal"`); adds `legacyChauffeursPath`. New test `apps/web/lib/ops/ops-console-paths.test.ts` (no `/pages` assertion found). | CONTEXT names `middleware.ts:320-321`. Post-30 the target is `apps/web/lib/ops/console-paths.ts` lines 20-21. Plan against the post-30 state or the edit lands in a block that no longer exists. |
| `app/ops/OpsTable.dc.html` (+33/-) | Adds law lines (line 11), `[data-vt-tap44]` rule, `stepValue`/`allowEmpty`, `onAskDelete`, `footDelete`, `tapArea`. | Phase 32 has NO edit in this file. Extras fields still use `{ key:'labelDe', icon:'globe', hint:t.extraTranslated }` from `OpsPricing.dc.html` (main lines 1520-1522, hint string line 344). |
| `app/ops/OpsPricing.dc.html` (+530) | Class lifecycle (draft/live/retired, go-live checklist, retired list). Its diff has no hunk touching `labelDe`, `extraName*` or `extraTranslated`. | Phase 32 makes no edit here (UI-SPEC "Pricing extras: no UI change"). Only the server side of extras changes. |
| `app/vamos-ops-data.js` (+54/-) | Hunks at lines 118-154 (class status map), 629 (`numOrNull`), 905-906 (`maxPax`/`maxBags`), 1122-1156 (`deleteClass` replaced by `retireClass`, `setClassStatus`, `bringBackClass`, `goLiveClass`). | Phase 32 has NO edit in this file. Nothing to coordinate. |
| `app/vamos-i18n-dict.js` (+92/-) | Adds 35 lines at line 71 (pattern area), removes fleet/class strings (lines 586-592, 955-958, 1044), adds 40 lines at 964, edits line 2404. No Phase 30 entry shares a key with the new Phase 32 strings. | Phase 32 adds a pattern at line 20 and a string block after `'Your driver is assigned to your booking…'` (around line 306 on main, before `/* ── Reviews */`). Both are append-only inserts in regions Phase 30 does not touch, so they merge, but line numbers move by about +35. Locate by the anchor text, not the number. |
| `apps/web/lib/icons/dynamic-icon-bindings.ts` | Edits lines 9, 13, 39-42 (renames OpsFleet entries, adds `retiredChevron`, `i.icon` for OpsPricing). | Phase 32 edits line 47 (`c.icon` CONTENT) and adds lines near 29 and 52-54. Adjacent, not overlapping; both branches append entries. |
| `apps/web/app/[locale]/(ops)/api/staff/rate-book/route.ts` | Hunks at 12, 538, 804 onward. | `saveExtraLabels` (600-692) is untouched. |
| Tests naming the files | `apps/web/lib/ops/ops-pricing-tabs.test.ts`, `ops-dc-*` files changed | `ops-dc-content.spec.ts` on Phase 30 still asserts `OpsContent` is "Coming soon" (line 73-74); Phase 32 deletes that spec, so a rebase conflict (modify/delete) is expected there. |

### Phase 31 (`origin/phase-31-refunds-in-stripe`, 138 files)

| File | What Phase 31 changes | Near what Phase 32 touches |
|------|----------------------|----------------------------|
| `app/vamos-i18n-dict.js` (+33/-9) | Hunks at 210 (+5, pattern area), 971-995, 1286, 1495, 1859, 2326, 2363 (+16). Removes review-wait refund strings. | No shared keys with Phase 32. The pattern hunk at line 210 sits well away from line 20 (Phase 32 pattern) and line ~306 (Phase 32 strings). |
| `apps/web/worker.ts` (+18) | Import `refundCheck` (line 36) and a `try/catch` block inside the `0 3 * * *` branch after `sweepMetaPurchaseIds`, before `return;` (main lines 131-139). | Phase 32 also appends a sweep in the same block and adds the translate branch in `queue()`. Same hunk area: expect a textual conflict in the cron block; keep both blocks, Phase 31 first, then translate, then `return;`. The `queue()` change does not overlap. |
| `apps/web/wrangler.jsonc` (+2) | Adds `STRIPE_ACCOUNT_ID` to the `vars` block at about line 76 (inside the `env.staging` span, lines 43-276, next to a live publishable key). | Phase 32 edits the `queues` blocks (staging 95-134, production 308+). Different hunks. |
| `apps/web/lib/env.d.ts` (+7) | Adds a Stripe account id var. | Phase 32 adds `TRANSLATE_QUEUE`; neighbouring, append only. |
| `packages/db/supabase/migrations/20261012240000_refund_check_reader.sql` | New migration (also `…220000` on Phase 30). | Phase 32 numbers must sort after both. |
| `packages/emails/src/messages/{en,de,fr,ar}.json` (+7 each) | New refund strings. | Phase 32's email-catalog fill reads these files; fill only after Phase 31 lands or tolerate new keys. |

## No Analog Found

| File / concern | Role | Data flow | Reason |
|----------------|------|-----------|--------|
| Placeholder masking and the output guard (`mask.ts`, `guard.ts`) | utility | transform | No tokenizer/ICU validator in the repo. Use RESEARCH C and add `@formatjs/icu-messageformat-parser` (already transitive via next-intl; pin 3.5.17, slopcheck OK per RESEARCH). Property tests can use fast-check only if it is already a dependency; check `apps/web/package.json` first. |
| Language detection by the same model call (`{lang, en}`) | service | transform | No detector exists (m2m100 does not detect). RESEARCH H: Arabic-script ratio over 30% first, then the Gemma `lang` field, then `contact_submissions.locale`. |
| Gmail tab opened at click and filled later (`_gtab`, `navigator.userActivation`) | component | event-driven | No similar browser-activation code in the DC pages; the signed patch (lines 563-621) is the only reference. |
| `Intl.DisplayNames` `langName()` helper in a DC page | utility | transform | New; patch lines 440-447. |
| Overlay route `GET /api/i18n/overlay?lang=` merged by `vamos-locale.js` | route + client | request-response | Described in RESEARCH D and CONTEXT code_context, but after the 2026-10-13 revision the only dashboard-typed text that needs it is the extras (read through `extra_labels_read()` already). Decide in the plan whether it is built at all. If it is, copy `app/api/fx/route.ts` (module-level `memo`, `Cache-Control: public, max-age=…`) and `vamos-locale.js` `loadFx()` (lines 158-170: `fetch('/api/fx', { credentials:'same-origin' })`, `.catch(function(){})`, then `emit()`); note the db-fences ban on module-level Sets, a plain object memo is what `fx` uses. Helmet scripts run twice (guard with `if (window.X) return`). |
| Worker-side queue test that imports `worker.ts` | test | event-driven | Not possible (imports `cloudflare:workers`); test the extracted consumer instead. |
| Live queue creation (`wrangler queues create vamos-translate-{staging,production}[-dlq]`) | ops step | n/a | Live-account action; report to the controller, owner/ship step. |

## Metadata

**Analog search scope:** `apps/web/lib/{ops,checkout,db,public,abuse,icons,content}`, `apps/web/app/api`, `apps/web/app/[locale]/(ops)/api/staff`, `apps/web/worker.ts`, `wrangler.jsonc`, `packages/db/supabase/{migrations,tests}`, `packages/emails/src/lib`, `scripts/`, `app/{ops,home}`, plus `git diff origin/main...origin/phase-30-vehicle-class-lifecycle` and `…phase-31-refunds-in-stripe` for the named files.
**Files read or grepped:** about 60.
**Pattern extraction date:** 2026-10-13
