# Phase 31: Refunds in Stripe - Pattern Map

**Mapped:** 2026-10-12
**Files analyzed:** 34 new or modified (removals listed in the last section, no pattern needed)
**Analogs found:** 31 / 34 (3 are partial: noted per file)

All paths are from the repo root. Line numbers were read in this worktree on 2026-10-12. Migration file names stay placeholders (`20261012240000_refund_check_reader.sql`): no number is reserved.

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `apps/web/app/[locale]/(ops)/api/staff/bookings/[id]/stripe-payments/route.ts` (NEW, GET) | route | request-response | `.../[id]/refund/route.ts` GET (l.98-106) + `.../[id]/pay-link/route.ts` | exact |
| `apps/web/app/api/staff/bookings/[id]/stripe-payments/route.ts` (NEW, 2-line mount) | route | request-response | `apps/web/app/api/staff/bookings/[id]/pay-link/route.ts` | exact |
| `apps/web/lib/ops/stripe-payments.ts` (NEW, asStaff read) | service | CRUD (read) | `apps/web/lib/ops/refund.ts` `readRefundState` (l.111-205) + `resolve-booking-id.ts` | exact |
| `apps/web/lib/checkout/stripe-dashboard-url.ts` (NEW, pure) | utility | transform | `apps/web/lib/checkout/stripe-mode.ts` + id regex of `stripe-fee.ts:39` | role-match |
| `apps/web/lib/checkout/stripe-dashboard-url.test.ts` (NEW) | test | transform | `apps/web/lib/checkout/stripe-mode.test.ts` | exact |
| `apps/web/lib/ops/stripe-payments.test.ts` (NEW) | test | request-response | `apps/web/lib/ops/refund.test.ts` (source pins l.96-110, 325-341) | role-match |
| `apps/web/lib/checkout/money-events.ts` (CHANGE: `mailCustomerRefund` dep) | service | event-driven | itself, `alertRefundFailed` dep (l.103) + loop l.240-270 | exact |
| `apps/web/lib/checkout/settle.ts` (CHANGE: `recordChargeRefund` returns bookingId, wires mail dep) | service | event-driven | itself l.946-960 | exact |
| `apps/web/lib/checkout/refund-mail.ts` (NEW, claim-send-settle for kind `refund`) | service | event-driven | `apps/web/lib/lifecycle/notify-lifecycle.ts` `claimThenSend` (l.73-125) + `lib/checkout/notify.ts` `confirmationDeps` (l.263-309) | role-match |
| `apps/web/lib/checkout/refund-mail.test.ts` (NEW) | test | event-driven | `apps/web/lib/checkout/money-events.test.ts` `deps()` (l.72-90) | exact |
| `packages/emails/src/refund.ts` + `src/lib/send.ts` `sendRefund` (CHANGE: copy, `idempotencyKey`) | utility/service | request-response | itself; Resend idempotency in `apps/web/lib/forms/notify.ts:99` | exact |
| `packages/emails/src/RefundCheckEmail.ts` (NEW, English only) + `sendRefundCheck` in `send.ts` | utility | transform | `packages/emails/src/refund.ts` (`layoutHtml`/`layoutText`, no React) + `sendOpsMustFix` (`send.ts:494-530`) | role-match |
| `apps/web/lib/ops/must-fix-mail.ts` (CHANGE: `deliverRefundCheckAlert`) | service | request-response | `deliverStuckPaymentAlert` (l.107-120) + `sendMustFixOrThrow` (l.42-50) | exact |
| `apps/web/lib/checkout/refund-check.ts` (NEW, nightly) | service | batch | `apps/web/lib/checkout/stripe-fee.ts` (`sweepStripeFeesWithDeps` l.132, `stripeFeeDbDeps` l.189, `sweepStripeFees` l.211) | exact |
| `apps/web/lib/checkout/refund-check.test.ts` (NEW) | test | batch | `apps/web/lib/checkout/stripe-fee.test.ts` | exact |
| `apps/web/lib/checkout/refund-check.local.test.ts` (NEW) | test | batch | `apps/web/lib/checkout/stripe-fee.local.test.ts` | exact |
| `apps/web/lib/db/system-reads.ts` (CHANGE: `loadRefundCheckRows`) | utility | CRUD (read) | `loadMustFixTrip` (l.125-127) | exact |
| `apps/web/worker.ts` (CHANGE: third try/catch in `0 3 * * *` branch) | config/entry | batch | itself l.123-139 | exact |
| `apps/web/lib/env.d.ts`, `apps/web/wrangler.jsonc`, `apps/web/.dev.vars.example` (CHANGE: `STRIPE_ACCOUNT_ID`) | config | n/a | `STRIPE_PUBLISHABLE_KEY` entries (env.d.ts:375-381, wrangler.jsonc:75, .dev.vars.example:58-64) | exact |
| `packages/db/supabase/tests/refund_check_reader.test.sql` (NEW pgTAP) | test | CRUD (read) | `packages/db/supabase/tests/stripe_fee_record.test.sql` | exact |
| `app/ops/OpsDetail.dc.html` (CHANGE: refund area, T tables, `syncStripe`, menu item) | component | request-response | the signed prototype `31-prototype-wip.patch` + existing `syncRefund`/`loadRefund` (l.1453-1470) | exact (signed) |
| `app/pages/booking-detail.dc.html`, `app/pages/manage-booking.dc.html` (CHANGE: policy line) | component | n/a | `31-prototype-wip.patch` hunks l.182-250 | exact (signed) |
| `app/vamos-manage-ticket.js` (CHANGE: `refundLine`) | utility | transform | `31-prototype-wip.patch` hunk l.252-265 | exact (signed) |
| `app/vamos-i18n-dict.js` (CHANGE: delete old entries; new ones already committed) | config | n/a | lines 211-216 (patterns), 2369-2388 (strings) already in tree | exact |
| `apps/web/lib/ops/ops-refund-stripe-dc.test.ts` (NEW, replaces `ops-refund-review-dc.test.ts`) | test | n/a | `ops-refund-review-dc.test.ts` (source pins) + `ops-dc-chauffeur-class.test.ts` `loadLogic` (vm) | exact |
| `apps/web/lib/ops/ops-dc-dash-design.test.ts` etc. (4 `markRefund:` anchor tests) | test | n/a | themselves | exact |
| `apps/web/lib/lifecycle/paid-cancel.ts` (CHANGE: no amount) + `app/api/account/bookings/paid-cancel/route.ts` + `app/api/manage/cancel/route.ts` + `manage/booking/route.ts` + `account/bookings/details/route.ts` | service/route | request-response | themselves | exact |
| `packages/emails/src/CancellationEmail.tsx` + `src/messages/{en,de,fr,ar}.json` (CHANGE) | component | transform | itself l.24-54; json `cancellation.*` l.91-94 | exact |
| `apps/web/i18n/messages/{en,de,fr,ar}.json` (CHANGE `checkout.cancelSheetFull/Ops`, `refundPendingOps`) | config | n/a | lines 573-575 | exact |
| `.planning/decisions/2026-10-12-refunds-in-stripe-wording.md` (NEW) | doc | n/a | `.planning/decisions/2026-09-30-refunds-by-hand.md` (`### Tn` + 4-row table) | exact |
| `apps/web/lib/legal/refund-texts-20-10.test.ts` (REWRITE) | test | n/a | itself (`table()` helper l.21-34) | exact |
| `docs/runbook/refunds.md` (REWRITE) | doc | n/a | itself | exact |

## Pattern Assignments

### Staff route `GET .../stripe-payments` (route, request-response) — both mounts

**Analog:** `apps/web/app/[locale]/(ops)/api/staff/bookings/[id]/refund/route.ts` (GET) and `.../pay-link/route.ts`

**Imports + key parser** (`pay-link/route.ts:6-18`, `refund/route.ts:17-32`). Change the literal route name to `"stripe-payments"`:
```typescript
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { jsonErr, jsonOk, withAdmin } from "@/lib/ops/staff-json";

export const dynamic = "force-dynamic";

function bookingKey(request: Request): string | null {
  const parts = new URL(request.url).pathname.split("/").filter(Boolean);
  const i = parts.lastIndexOf("bookings");
  const id = parts[i + 1] ?? "";
  if (!id || id === "refund") return null;   // -> "stripe-payments"
  return id;
}
```

**GET handler** (`refund/route.ts:98-106`, admin only, answer envelope `{ ok:true, data }` from `staff-json.ts:27-33`):
```typescript
export const GET = withAdmin(async (claims, request) => {
  const id = bookingKey(request);
  if (!id) return jsonErr("not-found", 404);
  const { env } = getCloudflareContext();
  const picker = await loadRefundPicker(env, claims, id);          // -> loadStripePayments(env, claims, id)
  if (!picker.ok) return jsonErr(picker.code, refundFailStatus(picker.code));
  const { ok: _ok, ...data } = picker;
  return jsonOk({ id, ...data });                                  // -> jsonOk(rows) (UI-SPEC: data is the array)
});
```
`withAdmin` (`staff-json.ts:128`) already 404s document navigations and re-checks the active staff row. Use `withAdmin`, not `withStaff` (`withStaff` lets reads through for non-admins, l.123-126).

**Plain mount (2 lines, copy verbatim, GET only)** (`apps/web/app/api/staff/bookings/[id]/pay-link/route.ts`):
```typescript
export const dynamic = "force-dynamic";
export { GET } from "../../../../../[locale]/(ops)/api/staff/bookings/[id]/stripe-payments/route";
```
(The old refund mount exports `{ GET, POST }`; the new one exports `GET` only.)

**Test pin pattern for both mounts** (`lib/ops/refund.test.ts:96-110, 325-341`, source reads, no route import):
```typescript
const pub = read("apps/web/app/api/staff/bookings/[id]/refund-decision/route.ts");
expect(pub).toMatch(/refund-decision\/route/);
```

---

### `apps/web/lib/ops/stripe-payments.ts` (service, read as staff)

**Analog:** `apps/web/lib/ops/refund.ts` `readRefundState` (l.111-205) and `loadRefundPicker` (l.210-240); key resolution `apps/web/lib/ops/resolve-booking-id.ts`.

**Key resolution** (`resolve-booking-id.ts:6-23`, `asStaff`, RLS, `erased_at is null`, id or reference):
```typescript
export async function resolveStaffBookingId(env: CloudflareEnv, claims: VamosClaims, key: string): Promise<string | null> {
  const trimmed = key.trim();
  if (!trimmed) return null;
  return asStaff(env, claims, async (sql) => {
    const rows = await sql<{ id: string }[]>`
      select id from public.bookings
       where erased_at is null and (id::text = ${trimmed} or reference = ${trimmed})
       limit 1`;
    return rows[0]?.id ?? null;
  });
}
```

**Payments query to copy and change** (`refund.ts:~139-165`). Keep `is_extra` and the non-reversed `refunded` sum; drop the `booking_refund_intents` join; replace `captured_at is not null` by `status = 'succeeded'` plus a `pi_` filter; order newest first (research Q4):
```typescript
const pays = await sql<PayRow[]>`
  select p.id, p.stripe_payment_intent_id, p.charged_rappen, p.captured_at,
         exists (select 1 from public.booking_edit_requests as e where e.extra_snapshot_id = p.snapshot_id) as is_extra,
         coalesce((select sum(r.refund_rappen) from public.booking_refunds as r where r.payment_id = p.id
                    and not exists (select 1 from public.booking_refund_reversals as x where x.refund_id = r.id)), 0) as refunded
    from public.booking_payments as p
   where p.booking_id = ${bookingId}::uuid
     and p.status = 'succeeded'
     and p.stripe_payment_intent_id like 'pi\_%'
   order by p.captured_at desc nulls last, p.id desc`;
```
**Row mapping** (`refund.ts:~178-188`): `leftRappen: Math.max(0, charged - refunded)`, `capturedAt: new Date(p.captured_at).toISOString()`, `kind: p.is_extra ? "extra" : "trip"`, plus the `n()` numeric coercion helper (`refund.ts:105-108`). Add `url` from `stripePaymentUrl(...)`; drop the row when it returns `null`.

**Error discipline:** memory `postgres-begin-rethrows-caught-errors` — never catch SQL refusals inside the `asStaff` callback.

---

### `apps/web/lib/checkout/stripe-dashboard-url.ts` (utility, pure transform)

**Analogs:** `apps/web/lib/checkout/stripe-mode.ts` (mode type, file header style, patterns written so no live literal appears), id-shape regex `stripe-fee.ts:39`.

**Mode source — call this in the route, not inside the builder** (`stripe-mode.ts:13-28`):
```typescript
export type StripeMode = "live" | "test";
const SECRET_KEY = /^(?:sk|rk)_(live|test)_[A-Za-z0-9_]+$/;
export function stripeSecretKeyMode(key: string | null | undefined): StripeMode | null {
  const m = typeof key === "string" ? SECRET_KEY.exec(key.trim()) : null;
  return m ? (m[1] as StripeMode) : null;
}
```
**Id shape discipline** (`stripe-fee.ts:38-39`):
```typescript
/** The Stripe ids a payment row can store: its PaymentIntent, or its Checkout Session before the write-back. */
const STRIPE_PAYMENT_ID = /^(pi|cs)_[A-Za-z0-9_]{1,250}$/;
```
**Builder shape to write** (research Pattern 2; C-01 says unset or malformed `acct_` is dropped, never passed through):
```typescript
import type { StripeMode } from "./stripe-mode";
const ACCT = /^acct_[A-Za-z0-9]{8,64}$/;
const PI = /^pi_[A-Za-z0-9_]{1,250}$/;
export function stripePaymentUrl(i: { mode: StripeMode | null; accountId?: string; paymentIntentId: string }): string | null { ... }
```
Fixed origin `https://dashboard.stripe.com`; `/test` only for `mode === "test"`; `null` mode returns `null`. Test file copies `stripe-mode.test.ts` table-driven style; cases: live, test, with/without acct, malformed acct dropped, `cs_`/`ch_` id refused, injection (`pi_x/../`, `?`, `#`, whitespace), null mode.

**Env wiring** — add `STRIPE_ACCOUNT_ID?: string` next to `STRIPE_PUBLISHABLE_KEY` in `lib/env.d.ts` (l.375-381 doc-comment style: "wrangler.jsonc `vars` — not a secret"); `wrangler.jsonc` `env.staging.vars` after l.75 (live account per C-01; `env.production` unset); `.dev.vars.example` (l.58-64 style: `# Optional. ...` then `STRIPE_ACCOUNT_ID=`; sandbox id goes here).

---

### Customer refund mail on `'recorded'` (service, event-driven)

**Analogs:** `apps/web/lib/checkout/money-events.ts` (deps type + loop), `apps/web/lib/lifecycle/notify-lifecycle.ts` `claimThenSend`, `apps/web/lib/checkout/notify.ts` (`confirmationDeps` reads via `checkout_booking_for_email`).

**Deps type to extend** (`money-events.ts:103-123`, optional deps with a doc line each):
```typescript
/** J7 W6-05: mail ops that a refund was reversed, then record the mail. Throws when the mail did not go out. */
alertRefundFailed?: (input: MoneyAlertInput) => Promise<void>;
/** public.stripe_charge_refunded_record -- idempotent on stripeRefundId. */
recordChargeRefund: (input: ChargeRefundInput) => Promise<{ outcome: string }>;   // -> { outcome: string; bookingId: string | null }
```
New optional dep: `mailCustomerRefund?: (input: { bookingId: string; stripeRefundId: string; refundRappen: number }) => Promise<void>`.

**Hook point** (`money-events.ts:247-261`, inside the `for (const refund of refunds)` try block; the `catch` at l.261 maps SQL errors to retries, so the mail call needs its OWN inner try/catch, never inside the outer catch):
```typescript
const { outcome } = await deps.recordChargeRefund({
  paymentIntentId, sessionId, stripeRefundId: refund.id, refundRappen: refund.amount,
  created: new Date(refund.created * 1000),
  appSource: refund.metadata?.vamos_source === "app",
});
deps.emit("info", "charge_refund_recorded", { eventId: message.eventId, refundId: refund.id, outcome });
// NEW, only when outcome === "recorded" && bookingId && vamos_source !== "app" && deps.mailCustomerRefund:
//   try { await deps.mailCustomerRefund(...) } catch { deps.emit("error", "customer_refund_mail_failed", {...}) }
```
Amount = `refund.amount` of this Stripe refund (D-11), never booking totals. The mail must not change the `HandleResult`.

**settle.ts return to extend** (`settle.ts:946-960`; the SQL already returns `booking_id`, `refund_id`, `outcome`, `20261012160000_refund_ledger_mirroring.sql:706-710`):
```typescript
recordChargeRefund: async (input) => {
  const rows = await asSystem(env, async (sql) => {
    return sql`select * from public.stripe_charge_refunded_record(
        ${input.paymentIntentId}, ${input.sessionId}, ${input.stripeRefundId}, ${input.refundRappen},
        ${input.created.toISOString()}::timestamptz, ${input.appSource})`;
  });
  return { outcome: String(rows[0]?.outcome ?? "unknown") };      // add bookingId: rows[0]?.booking_id ? String(...) : null
},
```

**Claim then send then settle** (`notify-lifecycle.ts:73-125`; copy the shape, new file `refund-mail.ts`, call a new `notification_claim_refund` instead of `notification_claim`):
```typescript
const claimId = await asSystem(env, async (sql) => {
  const rows = await sql`
    select public.notification_claim(${claim.bookingId}::uuid, ${claim.kind}, ${claim.bookingLegId ?? null}::uuid,
                                     ${"email"}, ${claim.locale}, ${TEMPLATE_VERSION[claim.kind]}) as id`;
  const id = rows[0]?.id;
  return id == null ? null : Number(id);
});
if (claimId == null) return;
let outcome: SendOutcome;
try { outcome = await send(); } catch (err) { outcome = { ok: false, error: err instanceof Error ? err.message : "send failed" }; }
await asSystem(env, async (sql) => {
  if (outcome.ok) await sql`select public.notification_settle(${claimId}::bigint, ${outcome.providerMessageId}, ${null}::text)`;
  else await sql`select public.notification_settle(${claimId}::bigint, ${null}::text, ${outcome.error})`;
});
```
Template version must match `^[a-z_]+@[0-9]{4}-[0-9]{2}-[0-9]{2}-[0-9]+$` (the claim function raises `invalid_template_version` otherwise, `20260827000004:428-446`), e.g. `refund@2026-10-13-1`.

**Reading the booking for the mail** — `checkout_booking_for_email` (returns `reference, locale, contact_name, contact_email, payer_email, ...`, `20260930100000_confirmation_mail_definer.sql:662-684`), called as in `notify.ts:306-313`:
```typescript
const rows = await sql`select * from public.checkout_booking_for_email(${bookingId}::uuid)`;
return (rows[0] as ConfirmationMailRow | undefined) ?? null;
```
Recipients: `refundMailRecipients(contactEmail, payerEmail)` (`packages/emails/src/lib/send.ts:365-374`). Locale mapping: `asEmailLocale` (`notify.ts:~96`) or `emailLocale` from `must-fix-mail.ts`.

**Resend idempotency key** — precedent `apps/web/lib/forms/notify.ts:99`: `await new Resend(apiKey).emails.send(payload, { idempotencyKey })`. Add an optional `idempotencyKey` to `sendRefund` (`send.ts:377-420`, which today calls `resend.emails.send({...})` with no second argument) and pass `refund-mail:<re_id>`.

**GAP the planner must close:** the existing sweep does NOT retry a `refund` claim. `sweepStuckNotifications` (`notify.ts:401`) is called with default `kinds = ["confirmation"]` from `worker.ts:125,176`, and its `deliver` is `deliverConfirmationWithDeps`, which rebuilds a confirmation. D-10's "retried by the existing sweep path" therefore needs either a refund-specific `deliver` plus `kinds` including `'refund'`, or an explicit note that a failed refund mail is retried only by a second sweep call. Also: `notify-lifecycle.ts:42-50` claims kinds the live check refuses (C-04): do not copy its `LifecycleKind` list, copy only `claimThenSend`.

**Test pattern** (`money-events.test.ts:72-90`): `deps(patch)` factory with `vi.fn` per dep; cases: recorded->1 mail, already->0, `vamos_source=app`->0, same refund via two events->1, mail throws->event still acked.

---

### Customer refund mail copy (emails, 4 languages)

**Analog:** `packages/emails/src/refund.ts` (`COPY: Record<EmailLocale, Copy>` l.33-80, `fill()` single-pass replacer l.84-89, `usableAmount` l.92-94, Arabic LTR isolation of the amount l.101, `layoutHtml`/`layoutText` l.111-112).
```typescript
const amount = amountRappen === null ? "" : locale === "ar" ? `⁦${formatPaidTotal(amountRappen)}⁩` : formatPaidTotal(amountRappen);
```
Replace the `issued*` strings with the S-03 draft table in `31-CONTEXT.md` (l.197-202) only AFTER the owner signs it. `{reference}` also needs LRI/PDI isolation in Arabic (CONTEXT l.195). Update `refund.test.ts` (fill, phone-LTR, snapshot tests l.1-50) in step.

---

### Nightly check `apps/web/lib/checkout/refund-check.ts` (service, batch)

**Analog:** `apps/web/lib/checkout/stripe-fee.ts`.

**Header/rules block to mimic** (l.1-22): why it runs, "never writes", "Logs carry counts only".

**Pure core with injected deps, result record of counts** (`stripe-fee.ts:132-186`): `StripeFeeSweepDeps` (l.~108-114) -> `RefundCheckDeps { listStripeRefunds, readSite, sendAlert, emit }`; core loops, classifies, never throws for one bad row; separate `catch` per external call.

**DB wrapper through definers** (`stripe-fee.ts:189-208`):
```typescript
export function stripeFeeDbDeps(env: CloudflareEnv): Pick<StripeFeeSweepDeps, "pending" | "record"> {
  return {
    pending: async (limit) => {
      const rows = await asSystem(env, async (sql) => {
        return sql<{ stripe_payment_intent_id: string | null }[]>`
          select stripe_payment_intent_id from public.checkout_payment_fee_pending(${limit}::int4)`;
      });
      return rows.map((row) => String(row.stripe_payment_intent_id ?? "")).filter((id) => STRIPE_PAYMENT_ID.test(id));
    },
```
For the new reader use `system-reads.ts` instead of raw `asSystem` in the check file (file rule l.1-9: "A new asSystem read of a table belongs here as a function"):
```typescript
export const loadMustFixTrip = async (env: CloudflareEnv, key: string) =>
  (await asSystem(env, (sql) => sql<MustFixTripRow[]>`select * from public.must_fix_trip_read(${key})`))[0] ?? null;
```
Pass the Stripe list with `sql.json(...)`, never `JSON.stringify(x)::jsonb` or a JS array (memory `worker-pg-client-no-arrays`; array precedent `notify.ts:~412` uses `sql.array(k, 1009)`).

**Env wrapper** (`stripe-fee.ts:211-218`):
```typescript
export async function sweepStripeFees(env: CloudflareEnv): Promise<StripeFeeSweepResult> {
  const stripe = stripeFromEnv(env);   // fetch http client, maxNetworkRetries 2, timeout 10s (stripe.ts:18-33)
  return sweepStripeFeesWithDeps({ ...stripeFeeDbDeps(env), read: (stripeId) => readStripeFee(stripe, stripeId) });
}
```
Stripe list (read only, research Code Examples): `stripe.refunds.list({ created: { gte: now - 48*3600, lt: now - 30*60 }, limit: 100 }).autoPagingToArray({ limit: 500 })`; `500` returned -> "truncated" in the mail. No `.create`/`.update` anywhere in the file (code-review gate).

**Error classification to reuse** (`stripe-fee.ts:~96-105` `stripeReadErrorKind`: transient vs missing vs other) to decide the "could not run" mail.

**Cron wiring** (`apps/web/worker.ts:123-139`; add a third block before `return;`, same shape, counts only):
```typescript
try {
  const cleaned = await sweepMetaPurchaseIds(env);
} catch {
}
return;
```
Import goes with the others at `worker.ts:33-36` (`import { sweepStripeFees } from "./lib/checkout/stripe-fee";`).

**Alert mail** — `apps/web/lib/ops/must-fix-mail.ts`:
```typescript
async function sendMustFixOrThrow(env: CloudflareEnv, payload: OpsMustFixForEmail): Promise<void> {
  const key = env.RESEND_API_KEY ?? "";
  if (!key) throw new MustFixMailError("no_api_key");
  const outcome = await sendOpsMustFix({ RESEND_API_KEY: key }, payload, SUPPORT_EMAIL);
  if (!outcome.ok) throw new MustFixMailError("send_failed");
}
```
`deliverRefundCheckAlert(env, report)` copies `deliverStuckPaymentAlert` (l.107-120) in shape but cannot reuse `OpsMustFixEmail` (it carries trips plus `{eventId,eventType,objectId}` only, `OpsMustFixEmail.tsx:46-58`). Add a new English-only renderer (no React tree) modelled on `renderRefundEmail`'s `layoutHtml(locale, inner, ...)`/`layoutText` use (`refund.ts:107-113`), a `sendRefundCheck(env, payload, to)` modelled on `sendOpsMustFix` (`send.ts:494-530`, returns `SendOutcome`, never throws), and keep the `MustFixMailError` throw. Mail text: `31-CONTEXT.md` D-09 l.71-95 verbatim.

**Test patterns:** `stripe-fee.test.ts` (imports l.1-14; deps as `vi.fn`; synthetic rappen only), `stripe-fee.local.test.ts` (skip unless `VAMOS_LOCAL_DB_PORT`; `workerSql` from `packages/db/test/support/worker-client`; `env` as `{ HYPERDRIVE_NOCACHE: { connectionString: "postgres://vamos_edge:vamos_edge@127.0.0.1:${PORT}/postgres" } }`; fixture insert helper l.28-60 with `session_replication_role = replica`).

---

### Migration `20261012240000_refund_check_reader.sql` (migration)

commit;`, "apply it verbatim as a whole"), `20261007290000_stripe_fee_record.sql` (a `language sql stable security definer` reader plus its grants/comments).

**Reader skeleton to copy** (`20261007290000_stripe_fee_record.sql:35-55`):
```sql
create or replace function public.checkout_payment_fee_pending(p_limit pg_catalog.int4 default 20)
returns table (stripe_payment_intent_id pg_catalog.text)
language sql
stable
security definer
set search_path = ''
set lock_timeout = '2s'
set statement_timeout = '5s'
as $$ ... $$;
```
For `public.refund_check_read(p_refunds pg_catalog.jsonb)` use the same attributes, all types `pg_catalog.`-qualified, all tables `public.`-qualified. Output columns per research "Migrations wanted" (stripe_refund_id, payment_intent_id, payment_found, booking_reference, site_refund_rappen, site_reason, site_reversed, booking_refunded_rappen, booking_rows_sum_rappen); reference only, never name or e-mail (D-12). Exclusions: refunds on `status = 'duplicate'` payments and reversed refunds from the sum (`stripe_charge_refunded_record` skips `duplicate`, `20261012160000:806-827`).

**Grants/comment tail** (`stripe_fee_record.sql:104-108`; research says grants to `vamos_system` only):
```sql
revoke all on function public.checkout_payment_fee_pending(pg_catalog.int4) from public, anon, authenticated;
grant execute on function public.checkout_payment_fee_pending(pg_catalog.int4) to vamos_system;
comment on function public.checkout_payment_fee_pending(pg_catalog.int4) is '...';
```

**Claim function (`notification_claim_refund`)** — copy `notification_claim` (`20260827000004_settlement_rpcs.sql:428-478`), `language plpgsql security definer set search_path = ''`; keep the template-version regex guard; change the dedupe line from
```sql
v_dedupe := p_booking_id::pg_catalog.text || ':' || p_kind || ':' || coalesce(p_booking_leg_id::pg_catalog.text, '');
```
to `'booking:refund:' || p_stripe_refund_id` (D-10; the `dedupe_key text not null unique` column is `20260823000014:226`), insert kind `'refund'` (allowed by the check, `20260823000014:218`, C-04), `on conflict (dedupe_key) do nothing returning id into v_id`. Grant block as `notification_claim` (l.480-510): `revoke all ... from public; grant execute ... to vamos_system;` plus `comment on function`. Rides in the same file as the reader (D-10: one apply).

**pgTAP analog:** `packages/db/supabase/tests/stripe_fee_record.test.sql`. Copy: `begin; select plan(N);` header (l.9-10), fixture inserts with `set local session_replication_role = replica;` (l.33-72), shape checks (l.89-99):
```sql
select ok((select p.prosecdef and p.proconfig @> array['search_path=""', 'lock_timeout=2s', 'statement_timeout=5s']
             from pg_proc p where p.oid = 'public.checkout_payment_fee_record(text,int4)'::regprocedure), '...');
select is((select p.provolatile::text from pg_proc p where p.oid = '...'::regprocedure), 's', 'pending: stable (reads only)');
```
grant checks (l.101-122: `aclexplode(p.proacl)`, grantees limited to `postgres, service_role, vamos_system`, `has_function_privilege('anon'|'authenticated'|'vamos_staff'|'vamos_guest', ..., 'EXECUTE')` false), calls under `set local role vamos_system; ... reset role;` (l.139-158). Fixtures required by research: recorded, missing, amount differs, reversed, unlinked, duplicate-payment refund, booking-total mismatch.

**Regeneration gates:** `pnpm db:types:check` (database.types.ts conflicts with Phase 30's 30-01), `db:test` / `test:db-lab`.

---

### `app/ops/OpsDetail.dc.html` (component, request-response)

**Analog = the signed prototype** `31-prototype-wip.patch` (hunks: CSS l.5-16, markup l.17-57, T tables l.58-89, `syncStripe` l.90-125, `renderVals` l.128-170, menu handler l.171-181). Apply it, then the 6 UI-SPEC deviations (`31-UI-SPEC.md:282-289`): `disabled` until links arrive, delete unreachable code after `return;`, bidi `isolate()` per part, `showRefundDue` fields exist already.

**Existing fetch-on-open pattern to mirror for `syncStripe`** (`OpsDetail.dc.html:1453-1471`):
```javascript
syncRefund = () => {
  const b = this.getBooking();
  const key = b.bookingId || b.id || '';
  const prof = window.VamosOps && window.VamosOps.profile ? window.VamosOps.profile.get() : {};
  ...
  const tag = want ? key + ':' + status : '';
  if (tag === this._refundTag) return;
  this._refundTag = tag;
  if (want) this.loadRefund(key);
};
loadRefund = (key) => {
  const client = window.VamosOpsApi;
  if (!client || typeof client.request !== 'function' || !key) return;
  client.request('GET', '/api/staff/bookings/' + encodeURIComponent(key) + '/refund').then((json) => {
    if (json && json.ok && json.data) this.setState({ refundData: { key, data: json.data } });
  });
};
```
Call sites: `componentDidUpdate` area (l.1429) and `componentDidMount` (l.1484), next to `this.syncRefund()`.

**Existing menu item to replace** (l.1832; prototype gives the new line) and menu handler (l.2352-2361, keeps the `goRefund()` scroll helper l.1442-1451).

**Things to delete** (UI-SPEC l.254, CONTEXT l.134): decision-box markup l.440-505, `refundBody`/`postRefund`/`postDecision` l.1701-1788, `markRefund` l.2332, T keys listed in UI-SPEC. Existing region/row/pay CSS stays (`[data-ops-refund-region|row|label|pay]`, `[data-ops-decide-body]`).

**Phase 30 overlap (C-03):** same file, different regions; conflicts only in T-table key lines (en/de/fr/ar `actions:` line next to `markRefund:` at l.856/999/1186/1332). Keep both key sets when merging.

---

### DC tests

**`apps/web/lib/ops/ops-refund-stripe-dc.test.ts` (NEW)** — two analogs, both exact:

1. Source pins (`ops-refund-review-dc.test.ts:1-60, 88-130`): `read()`, `tBlocks(src)` splitting the `T = {` table by language, then
```typescript
for (const lang of ["en", "de", "fr", "ar"] as const)
  for (const key of KEYS) expect(blocks[lang], `${lang}.${key}`).toMatch(new RegExp(`\\b${key}:'`));
expect(dc).toMatch(/Alert" tone="info" title="\{\{ tCheckTitle \}\}"/);
expect(dc).not.toMatch(/tone="accent"/);
expect(dc).toMatch(/--vt-shadow-accent:none/);
```
German `ß` check pattern at l.104-110.

2. vm logic harness (`ops-dc-chauffeur-class.test.ts:14-120`): `scriptOf()`, `templateOf()`, `Base` class stub with `setState`, `loadLogic(file, win, lang, props)` building `new Function("DCLogic","StreamableLogic","React","window","document","history","localStorage","location","PopStateEvent", src + ";return Component;")`; `win.VamosOpsApi.request` as `vi.fn(async () => ({ ok: true, data: [...] }))`, `flush = () => new Promise(r => setTimeout(r, 0))`. Use it for: one payment -> `window.open` called with `(url, '_blank', 'noopener')` synchronously, several -> list state, none -> error code `no-stripe-payment`, menu item `disabled` before the fetch resolves, `showRefundDue` true/false per state table.

**Anchors to re-anchor before deleting `markRefund`** (research Q5): `lib/ops/customers-board.test.ts:104`, `ops-class-change-dc.test.ts:52`, `ops-dc-u08.test.ts:231`, `ops-p6-edit-dc.test.ts:79` slice the `saveEdit` source up to `markRefund:`.

**Customer-side test pattern** (`tests/unit/manage-ticket-account-refund.test.ts:1-30`, source slicing by function name: `src.slice(src.indexOf("function loadAccount"), src.indexOf("function cancelGuest"))`; `tests/unit/manage-ticket-cancel-guest.test.ts:9-24` runs the file in `runInNewContext(src, { window, fetch, ... })`).

---

### Customer cancel surfaces

**Pages and ticket JS:** use the signed hunks in `31-prototype-wip.patch` l.182-265 verbatim (`booking-detail.dc.html:489,492,542,548-549`; `manage-booking.dc.html:499,502,552,558-559`; `app/vamos-manage-ticket.js:269` -> `return t("Refund follows the cancellation policy");`, drop the unused `owed` var). `changeCreditLine` (l.285-305) and `CHANGE_CREDIT_LINE`/`TRIP_CREDIT_LINE` stay untouched (owner-approved 2026-10-01).

**Server:** `finishPaidCancel` (`apps/web/lib/lifecycle/paid-cancel.ts:176-197`) keeps the `refundLine` decision for the mail but stops returning `refundRappen`:
```typescript
const refundLine = fullDue ? "full_captured" : refundMode === "pending_ops" ? "pending_ops" : "none";
...
return { ok: true, bookingId, refundMode,
  refundStatus: fullDue || refundMode === "pending_ops" ? "pending_ops" : "none",
  refundRappen: fullDue ? refundRappen : 0 };          // drop this field
```
Both routes echo it and must stop (`app/api/account/bookings/paid-cancel/route.ts:54-62`, `app/api/manage/cancel/route.ts:58-67`: `refundMode`, `refundStatus`, `refundRappen`, `payoutCountry`, `availableOn`). The DC pages read `result.body.refundStatus` and used `refundRappen` as `refundOwedRappen` (`booking-detail.dc.html:957`, `manage-booking.dc.html:965`); remove that branch.

**Email:** `packages/emails/src/CancellationEmail.tsx:24-28`:
```typescript
function refundKey(line: CancellationRefundLine): string {
  if (line === "pending_ops") return "cancellation.refundPendingOps";
  if (line === "full_captured") return "cancellation.refundFullCaptured";
  return "cancellation.refundNone";
}
```
Both non-none branches return one new key (suggested `cancellation.refundPolicy`); `messages/*.json` `cancellation.*` (en.json l.91-94) gets the new key, loses the two old ones; `refundNone` stays. `customer-resend.ts:41 refundLineOf` is built the same way (collapse in step).

**Internal mail copy** (`packages/emails/src/messages/en.json`): `opsMustFix.differenceNotAppliedBody` (l.78, "Send it back from the dashboard") and `opsMustFix.refundFailedBody` (l.82) point to Stripe; `refundFailed.body` (l.100) already says "Retry the refund in Stripe". Tests: `OpsMustFixEmail.test.tsx`.

**Dictionary:** new strings and the two `patterns` are ALREADY in `app/vamos-i18n-dict.js` (patterns l.211-216, strings l.2369-2388, commit `25b65671`). Remaining dictionary work is deleting the old entries (l.1500 "Full refund · sent by our team", l.1501 "Refund under review", and the other `cancelSheet`/Refund-card entries near l.1845, 1861-1865) after grep confirms no use. Entry format: `"English text": { de: "...", fr: "...", ar: "..." },`.

---

### Wording decision file + `refund-texts` test

**Analog for the decision file:** `.planning/decisions/2026-09-30-refunds-by-hand.md` — `### Tn — <where it lives>` heading, then a table whose rows are exactly `| en | text |`, `| de | text |`, `| fr | text |`, `| ar | text |` (the test regex is `^\| ${lang} \| (.+) \|$`, `refund-texts-20-10.test.ts:29`). New file `.planning/decisions/2026-10-12-refunds-in-stripe-wording.md` holds: cancel-sheet line (replaces T2), Refund-row value (replaces ROW), cancellation-email line (replaces T4 and T5), dead-card paragraph, and, once signed, the customer refund mail subject/body. Source of the signed text: `31-UI-SPEC.md:260-263`.

**Test analog (rewrite in place):** `apps/web/lib/legal/refund-texts-20-10.test.ts`
```typescript
function table(tag: string): Texts {
  const start = decision.indexOf(`### ${tag} `);
  ...
  const m = block.match(new RegExp(`^\\| ${lang} \\| (.+) \\|$`, "m"));
```
Keep T1 and T3 (policy page, still the older decision file). Re-point T2/T4/T5/ROW to the new file (`expectInDict`, `expectInJson` helpers l.60-76 unchanged). Extend the `banned` list (l.131-138) with "our team decides" / "our team sends" for the touched surfaces only; note the test also scans `app/pages/*.html` for ALL banned words, so the list must not ban strings that remain in untouched pages (for example `cancellation.dc.html`, whose T1 sentence "Our team sends the refund after you cancel" is kept).

---

## Shared Patterns

### Staff auth and envelope
**Source:** `apps/web/lib/ops/staff-json.ts:27-33, 123-130`
**Apply to:** the new `stripe-payments` route.
```typescript
export function jsonOk(data: unknown, status = 200): Response { return Response.json({ ok: true, data }, { status, headers: STAFF_JSON_HEADERS }); }
export function jsonErr(code: string, status: number, extra?: Record<string, unknown>): Response { ... }
export function withAdmin(handler: StaffJsonHandler): (request: Request) => Promise<Response> { return (request) => staffResponse(request, requireAdminClaims, handler); }
```

### Database access doors
**Source:** `apps/web/lib/db/identity.ts` (`asStaff`, `asSystem`), `apps/web/lib/db/system-reads.ts:1-9`
**Apply to:** every new DB read. Staff reads of tables go through `asStaff` (RLS, `vamos_staff` has SELECT); cron and webhook reads go through a definer function called as `asSystem` (`vamos_system` has NO table SELECT: raw SQL = 42501). Catch SQL refusals around the call, never inside the callback. `pnpm check:db-fences` enforces.

### Mail failure never changes the money answer
**Source:** `apps/web/lib/checkout/notify.ts:1-10, 168-243` ("Claim, read, send, settle. Never throws") and `must-fix-mail.ts:23-40` (`MustFixMailError`, fixed code words, no address or name in messages)
**Apply to:** customer refund mail (log at error level, never retry the event), nightly alert (throw `MustFixMailError`, the cron's own catch logs `outcome: "failed"`).

### Logging: counts and ids only
**Source:** `apps/web/worker.ts:123-139` (`emit("info"|"error", name, { counts })`), `stripe-fee.ts:20-22`
**Apply to:** the nightly check and the customer mail. No names, e-mails, Stripe error text or amounts in logs; the internal mail (not logs) may hold references, CHF amounts and Stripe ids (D-12).

### Migration conventions
**Apply to:** `20261012240000_refund_check_reader.sql`. `begin; ... commit;` as one apply (connector `apply_migration`, md5 guard by the controller), `set search_path = ''`, every type `pg_catalog.`, every table `public.`, `revoke all ... from public, anon, authenticated; grant execute ... to vamos_system;`, a `comment on function` per function, additive only (no table DDL, no rows touched).

### Four languages and platform laws for every visible string
**Source:** `app/vamos-i18n-dict.js` (strings keyed by the English text, `patterns` for concatenated strings), page `T` tables in `OpsDetail.dc.html`, `ops-detail-i18n.test.ts` (T key parity en/de/fr/ar)
**Apply to:** all DC edits. Page `T` copy must equal dictionary text character for character; Swiss German "ss"; amounts and references in `vt-dir-keep` + `data-vt-no-i18n`; run `VamosLocale.coverage(root)` on each new element; `--vt-shadow-accent:none` and `.vt-input--focus{box-shadow:none}` stay.

### Test layout
**Source:** `apps/web/vitest.config.ts` (includes `lib/**/*.test.ts`, `tests/unit/**`); `*.local.test.ts` skip unless `VAMOS_LOCAL_DB_PORT`; DC tests read the synced copy (`node ../../scripts/sync-dc-mock-to-public.mjs` runs first in `pnpm --filter web test`)
**Apply to:** agents run only touched test files; the lead runs `pnpm gate:local` once.

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `RefundCheckEmail` (English-only internal report mail with lists of references, CHF amounts and Stripe ids) | utility | transform | No internal report mail carries lists or ids of this kind. `OpsMustFixEmail` carries trips plus one event id; `refund.ts` is customer-facing in four languages. Use `refund.ts` (`layoutHtml`/`layoutText`) for the shell only and the signed D-09 text for the body. |
| Refund-mail retry through the notification sweep | service | batch | The sweep is confirmation-only (`notify.ts:355-399, 401`; `worker.ts:125,176` pass the default `kinds`). A refund `deliver` and the `kinds` argument have to be designed; `sweepStuckNotificationsWithDeps` already takes `deps.deliver` and `kinds`, so the seam exists. |
| Stripe Dashboard URL form | utility | transform | The three `/payments/pi_...` forms are `[ASSUMED]` (research A1); verify once per mode on a real payment before ship. The builder is pure, so only the string template changes. |

## Removals (no pattern needed, list for the planner)

`apps/web/lib/ops/refund.ts`, `refund-map.ts` (keep `sqlErrorCode`, `PAYMENT_CHANGED`, `isPaymentChanged`, `mapRefundSqlError`, `RefundFail`, `refundFailStatus`, imported by `bookings-write.ts:14`, `edit-request-map.ts:6`, `booking-change-map.ts:11`), both mounts of `.../refund/route.ts` and `.../refund-decision/route.ts`, tests `refund-by-hand.test.ts`, `refund-by-hand.local.test.ts`, `ops-refund-review-dc.test.ts`. Full blast-radius table: `31-RESEARCH.md` Q5.

## Metadata

**Analog search scope:** `apps/web/{app,lib,tests,worker.ts}`, `packages/emails/src`, `packages/db/supabase/{migrations,tests}`, `app/{ops,pages}`, `app/vamos-*.js`, `.planning/decisions`
**Files scanned:** about 45 read in whole or in cited ranges
**Pattern extraction date:** 2026-10-12
