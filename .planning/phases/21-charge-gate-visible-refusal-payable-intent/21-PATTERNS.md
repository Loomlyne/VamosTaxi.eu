# Phase 21: Charge gate + visible refusal + payable intent - Pattern Map

**Mapped:** 2026-09-23
**Files analyzed:** 13
**Analogs found:** 13 / 13

CONTEXT D-01…D-17 win. Custom Checkout stays `ui_mode: "elements"`. No hosted Checkout. No `sk_live_`. No `.eu`. No invented CHF. Bound account is the UAE test prefix `pk_test_51U65pW` only — never paste a full `pk_test_` / `sk_test_` / `whsec_`.

Dirty from another session — read, do not revert, do not stage with this doc:

- `apps/web/app/[locale]/checkout/CheckoutClient.tsx`
- `apps/web/app/[locale]/checkout/PaymentPanel.tsx`
- `apps/web/app/api/checkout/pay-link/route.ts`
- `apps/web/lib/checkout/checkout-comments.test.ts` (do not edit; do not drop `refusal === "pricingNotLive"`)

Do not touch leftovers 16 / 17 / 19 / 20. Do not write `apps/web/public/app/`. Do not `supabase db push`. Do not set `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`.

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `apps/web/lib/checkout/charge-gate.ts` | utility | transform | `apps/web/lib/checkout/vamos-trip.ts` `peekLockClassRappen` + `apps/web/lib/checkout/stripe.ts` `stripePublishableKey` | role-match |
| `apps/web/lib/checkout/charge-gate.test.ts` | test | request-response | `apps/web/lib/checkout/intent.test.ts` | role-match |
| `packages/db/supabase/migrations/<after-20260920000003>_checkout_guest_requote_cancel.sql` | migration | CRUD | `packages/db/supabase/migrations/20260911180000_checkout_cancel_unpaid.sql` | role-match |
| `apps/web/app/api/checkout/requote/route.ts` | route | request-response | `apps/web/app/api/checkout/pay-link/route.ts` + `apps/web/lib/checkout/load-open-payment.ts` | role-match |
| `apps/web/components/home/BookingBoard.tsx` | component | transform | same file `publicRappen` / `VehicleCard` `disabled` | exact |
| `apps/web/app/[locale]/checkout/CheckoutClassCards.tsx` | component | transform | same file `classFits` disable | exact |
| `apps/web/app/api/checkout/intent/route.ts` | route | request-response | same file + `apps/web/lib/checkout/errors.ts` `refuse` | exact |
| `apps/web/lib/checkout/intent.ts` | service | request-response | same file `runCheckoutIntent` refuse-before-create | exact |
| `apps/web/app/[locale]/checkout/CheckoutClient.tsx` | component | request-response | same file payment step + kit `Input` / `Alert` / `Button` | exact |
| `apps/web/app/[locale]/checkout/PaymentPanel.tsx` | component | request-response | same file `CheckoutProvider` secret gate | exact |
| `apps/web/app/[locale]/checkout/pay/[token]/PayClient.tsx` | component | request-response | `CheckoutClient.tsx` payment sheet + this file's recap | role-match |
| `apps/web/app/api/checkout/pay-link/route.ts` | route | request-response | same file `setPayLink` call + `verifyLock` | exact |
| `apps/web/app/api/checkout/pay-link/open/route.ts` | route | request-response | same file reuse branch + intent refuse-before-Stripe | role-match |

## Pattern Assignments

### `apps/web/lib/checkout/charge-gate.ts` (utility, transform)

**Analog:** `apps/web/lib/checkout/vamos-trip.ts` (predicate) and `apps/web/lib/checkout/stripe.ts` (prefix check, no secret read)

Wave 0 home. Pure functions only. No Stripe SDK import. No key material. Callers: BookingBoard, CheckoutClassCards (via parent), intent route, pay-link route, pay-link open route, `runCheckoutIntent` before `createCheckoutSession`.

**Selectable predicate** — copy the null-stays-null rule from `peekLockClassRappen` (lines 190–214). Do not invent a fare. Displayed rappen null → not selectable. Card stays listed (that filter lives in BookingBoard, not here).

```190:214:apps/web/lib/checkout/vamos-trip.ts
/**
 * Display-only. Does not verify HMAC. Missing/unreadable lock → null (CHF 000).
 * Never invent a fare.
 */
export function peekLockClassRappen(lock: string | undefined, slug: string): number | null {
  if (!lock || !slug) return null;
  // decode omitted — missing slug or non-finite total_rappen returns null
  if (typeof r.total_rappen !== "number" || !Number.isFinite(r.total_rappen) || r.total_rappen < 0) {
    return null;
  }
  return r.total_rappen;
}
```

Home already paints null when pricing is not live. Select-off uses that displayed value, not a second price:

```132:138:apps/web/components/home/BookingBoard.tsx
/** D-19: public amounts stay CHF 000 until Publish-as-flip. */
function publicRappen(
  pricingLive: boolean,
  rappen: number | null | undefined,
): number | null {
  return pricingLive ? rappen ?? null : null;
}
```

**Prefix guard** — same shape as `stripePublishableKey`: read the publishable string, do not log it, do not touch `STRIPE_SECRET_KEY`. Compare the prefix only.

```43:50:apps/web/lib/checkout/stripe.ts
/** Publishable key from wrangler `vars` — never a secret, never `pk_live_` here. */
export function stripePublishableKey(env: CloudflareEnv): string {
  const key = env.STRIPE_PUBLISHABLE_KEY;
  if (!key) {
    throw missingEnvError("STRIPE_PUBLISHABLE_KEY");
  }
  return key;
}
```

```typescript
/** Bound staging account is not the client's. Do not mint on it. */
export function stripeAccountIsLegacyUaeTest(publishableKey: string): boolean {
  return publishableKey.startsWith("pk_test_51U65pW");
}
```

True → do not call `stripeFromEnv`, `createCheckoutSession`, `retrieveCheckoutSession`, or `expireCheckoutSession`. Unpriced and expired never reach this check. Do not invent an account id. Do not add a refusal code. Do not map the stop to `invalid_request` (that paints `payCouldNotStart`).

**Token-exp pin** — return the verified lock `exp`. Do not add `checkoutWindowMinutes`. Do not `max(old, now+window)`.

```typescript
export function payLinkTokenExpiresAt(lockExpIso: string): Date {
  return new Date(lockExpIso);
}
```

---

### `apps/web/lib/checkout/charge-gate.test.ts` (test, request-response)

**Analog:** `apps/web/lib/checkout/intent.test.ts`

Vitest in `apps/web/lib/**/*.test.ts`. No `tests/integration/*.spec.ts`. No full key. Prefix string `pk_test_51U65pW` is the fixture, nothing longer. `pk_test_placeholder` in the intent deps is the existing non-UAE stand-in — do not replace it with a real key.

**Imports / harness** (lines 1–8, 80–88):

```1:8:apps/web/lib/checkout/intent.test.ts
import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { mintLock, type QuoteLockPayload } from "../quote/lock";
import { extraFaresOn } from "./extras-catalog";
import { runCheckoutIntent, type CheckoutIntentDeps } from "./intent";
import type { CheckoutIntentRequest } from "./intent-schema";
```

```80:88:apps/web/lib/checkout/intent.test.ts
    createCheckoutSession: async () => {
      order.push("stripe");
      return {
        id: "cs_test_1",
        client_secret: "cs_test_1_secret",
        payment_intent: "pi_test_1",
        currency: "chf",
      } as never;
    },
```

**Refusal assertions to copy** (status + code, create not called):

```145:151:apps/web/lib/checkout/intent.test.ts
  it("returns 409 quote_expired", async () => {
    const p = payload({ exp: "2026-09-05T11:00:00.000Z" });
    const body = await bodyFor(p);
    const res = await runCheckoutIntent(body, deps(p));
    expect(res.status).toBe(409);
    expect(((await res.json()) as { code: string }).code).toBe("quote_expired");
  });
```

```153:168:apps/web/lib/checkout/intent.test.ts
  it("returns 409 pricing_not_live", async () => {
    const p = payload();
    const body = await bodyFor(p);
    const res = await runCheckoutIntent(
      body,
      deps(p, {
        reprice: () => ({
          pricing_live: false,
          engine_version: p.engine_version,
          classes: [{ slug: "economy", total_rappen: null, eligible: true }],
        }),
      }),
    );
    expect(res.status).toBe(409);
    expect(((await res.json()) as { code: string }).code).toBe("pricing_not_live");
  });
```

**Reuse assertion** (lines 406–437): `create` and `createBooking` are `vi.fn`; expect `not.toHaveBeenCalled()` when `loadOpenPayment` returns a payable session. Keep that. Prefix-guard tests use the same `not.toHaveBeenCalled()` on create.

Wave 0 cases in this file, not in the dirty comments test:

- `stripeAccountIsLegacyUaeTest("pk_test_51U65pW")` true; a non-matching `pk_test_` prefix false. No secret.
- Missing class id helper returns `pricing_not_live`, not `invalid_request`.
- Null displayed rappen is not selectable; a number is. No CHF constant.
- `payLinkTokenExpiresAt(lockExp)` equals that exp on first send and on resend. Not `now + window`.

`email_failed` stays a 502 in `pay-link/route.ts`. Assert it here by reading that route source if it is not already asserted outside `checkout-comments.test.ts`. Do not remap it.

Sibling for the peek fixture (do not move it): `apps/web/lib/checkout/checkout-fields.test.ts` lines 26–38.

---

### `packages/db/supabase/migrations/<after-20260920000003>_checkout_guest_requote_cancel.sql` (migration, CRUD)

**Analog:** `packages/db/supabase/migrations/20260911180000_checkout_cancel_unpaid.sql` (cancel body). Grant analog: `packages/db/supabase/migrations/20260909133000_checkout_open_payment.sql`. Status pair: `checkout_set_pay_link` lines 72–74. Payment status spelling: `20260823000014_payments_refunds.sql` line 19.

Latest migration on disk: `20260920000003_coupons_per_rate_version.sql`. New file sorts after that. Agent writes the file. Owner applies. `autonomous: false`. No `supabase db push`. No Stripe inside the function. No `booking_refunds` insert.

Suggested name: `public.checkout_requote_cancel(p_quote_id pg_catalog.uuid)`. Do not replace `checkout_cancel_unpaid` (that one is JWT email + reference, `authenticated` only).

**Body to copy** (legs + booking `cancelled`, British spelling, definer, empty search_path). Drop the JWT email check. Input is `quote_id`, not reference.

```5:47:packages/db/supabase/migrations/20260911180000_checkout_cancel_unpaid.sql
create or replace function public.checkout_cancel_unpaid(p_reference text)
returns table (booking_id uuid, reference text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.bookings%rowtype;
begin
  -- DO NOT copy the JWT email gate. Guest Requote has no session.
  select b.* into v
    from public.bookings b
   where b.reference = p_reference
   for update of b;
  if v.status is distinct from 'pending' then
    raise exception 'not_cancellable' using errcode = 'P0001';
  end if;
  update public.booking_legs bl
     set status = 'cancelled'
   where bl.booking_id = v.id
     and bl.status not in ('completed', 'no_show', 'cancelled');
  update public.bookings
     set status = 'cancelled'
   where id = v.id;
```

Widen the status gate to the pair already used by pay-link, not pending-only:

```72:74:packages/db/supabase/migrations/20260907000002_checkout_company_paylink.sql
  if v_status not in ('pending', 'quote') then
    raise exception 'quote_already_booked' using errcode = 'restrict_violation';
  end if;
```

Lookup by `quote_id` the way `checkout_open_payment` does (line 24). Refuse if any `booking_payments.status = 'succeeded'` (copy the exists-check in `checkout_attach_payment`, lines 156–163). Then set unpaid rows to the existing enum value `canceled` (American spelling — do not invent a status):

```18:19:packages/db/supabase/migrations/20260823000014_payments_refunds.sql
  status                   text not null check (status in
                            ('requires_payment','succeeded','failed','canceled')),
```

`checkout_open_payment` only returns `requires_payment` (line 25). `canceled` makes the next intent reuse miss. That is the point.

**Grant — not the analog's `authenticated` grant.** Copy the vamos_checkout-only grant. Also revoke `anon` and `authenticated`. Default EXECUTE on public is the hole.

```31:32:packages/db/supabase/migrations/20260909133000_checkout_open_payment.sql
revoke all on function public.checkout_open_payment(pg_catalog.uuid) from public;
grant execute on function public.checkout_open_payment(pg_catalog.uuid) to vamos_checkout;
```

```62:63:packages/db/supabase/migrations/20260911180000_checkout_cancel_unpaid.sql
revoke all on function public.checkout_cancel_unpaid(text) from public;
grant execute on function public.checkout_cancel_unpaid(text) to authenticated;
-- DO NOT copy this grant. Requote is vamos_checkout only.
```

Until the owner applies, Requote must not pretend the row is gone. The refusal UI does not wait on this RPC.

---

### `apps/web/app/api/checkout/requote/route.ts` (route, request-response)

**Analog:** guest checkout POST in `pay-link/route.ts`. SQL call shape from `load-open-payment.ts`. Do not copy `apps/web/app/api/account/bookings/cancel/route.ts` auth (`asCustomer`, JWT email, `VT-` ref).

`app/home/home.dc.html` posts `/api/checkout/abandon`. That route is not in `apps/web`. Do not add a second door this phase. One RPC, one route, called by checkout Requote only. Token page has no Requote (D-10).

**CSRF + guest role:**

```36:39:apps/web/app/api/checkout/pay-link/route.ts
export async function POST(request: Request) {
  const blocked = csrfForbidden(request);
  if (blocked) return blocked;
  const { env } = getCloudflareContext();
```

```41:51:apps/web/lib/security/origin.ts
export function csrfForbidden(
  request: Request,
  kind: "public" | "auth" = "public",
): Response | null {
  const origin = request.headers.get("Origin");
  const ok = kind === "auth" ? authOriginAllowed(origin) : publicOriginAllowed(origin);
  if (ok) return null;
  return Response.json(
    { ok: false, code: "csrf" },
    { status: 403, headers: { "cache-control": "private, no-store" } },
  );
}
```

```100:109:apps/web/lib/db/identity.ts
/**
 * POST `/api/checkout/intent` — SET ROLE `vamos_checkout`. Guest checkout passes `null`
 * claims.
 */
export const asCheckout = <T,>(
  env: CloudflareEnv,
  claims: VamosClaims | null,
  fn: QueryFn<T>,
) => withIdentity(env, "checkout", claims, fn);
```

**RPC call** — same `select * from public.<fn>` shape as `loadOpenPayment`, with `quote_id`, not a reference:

```14:20:apps/web/lib/checkout/load-open-payment.ts
export async function loadOpenPayment(
  sql: postgres.TransactionSql,
  quoteId: string,
): Promise<OpenPayment | null> {
  const rows = await sql`
    select * from public.checkout_open_payment(${quoteId}::uuid)
  `;
```

Call `asCheckout(env, null, ...)`. Do not call `expireCheckoutSession` while `stripeAccountIsLegacyUaeTest` is true. Do not mint. After the owner checkpoint, expire is Worker-side only, after the RPC, and only if a session id was already stored. The function itself has no Stripe.

Account cancel is the anti-pattern for this route:

```35:40:apps/web/app/api/account/bookings/cancel/route.ts
  const rows = await asCustomer(env, claims, async (sql) => {
    return await sql<{ booking_id: string; reference: string }[]>`
      select * from public.checkout_cancel_unpaid(${ref})
    `;
  });
```

---

### `apps/web/components/home/BookingBoard.tsx` (component, transform)

**Analog:** this file. Select off is not hide.

`publicFleet` drops `no_rate` only. Do not also drop null rappen (that merges unpriced with Phase 18 D-32 hide).

```114:117:apps/web/components/home/BookingBoard.tsx
/** Deleted from the fare book (no_rate) does not keep a public card. */
function publicFleet(classes: ClassBoardEntry[]): ClassBoardEntry[] {
  return classes.filter((entry) => entry.ineligible_reason !== "no_rate");
}
```

Gap: `disabled={!eligible}` leaves an eligible null-rappen card selectable. `onSelect` has the same guard. Tie both to displayed rappen null. Keep the card. No tooltip. No `pricingNotLive` on the card.

```468:497:apps/web/components/home/BookingBoard.tsx
      {(quote ? publicFleet(quote.classes) : idleClasses).map((entry) => {
            const eligible = !!quote && entry.eligible;
            // price uses publicRappen(...) — null paints CHF 000 via formatChfRappen
            return (
              <VehicleCard
                disabled={!eligible}
                onSelect={() => {
                  if (!eligible) return;
                  setSelected(entry.slug);
                }}
              />
            );
          })}
```

`VehicleCard` already sets native `disabled` and `aria-disabled`. Do not drop `aria-disabled`. Do not add a Select label.

```74:80:apps/web/components/transfer/VehicleCard.tsx
    <button
      type="button"
      onClick={disabled || loading ? undefined : onSelect}
      aria-pressed={selected}
      aria-disabled={disabled || undefined}
      disabled={disabled}
```

Silent card: delete the pricing-not-live note when the selected total is null. That string is the Pay backstop, not the fleet card (D-01).

```504:507:apps/web/components/home/BookingBoard.tsx
  const pricingNote =
    selectedEntry && selectedEntry.total_rappen == null
      ? label(REFUSAL_BINDINGS.pricing_not_live.i18n_key)
      : undefined;
```

Amount stays `formatAmount` / `formatChfRappen(null)` → `CHF 000`. Do not write `CHF 0` or a blank.

```54:63:apps/web/lib/currency.ts
/** `amount == null` -> the Law 04 placeholder figure (`"000"`), never a real number. */
export function formatAmount(
  amount: number | null | undefined,
  currency: CurrencyCode = "CHF",
): string {
  const figure = amount == null ? "000" : formatFigure(amount);
  return `${mark.sym}${mark.space}${figure}`;
}
```

---

### `apps/web/app/[locale]/checkout/CheckoutClassCards.tsx` (component, transform)

**Analog:** this file's fit disable. Add a second off-switch for null `peekLockClassRappen`. Parent already peeks (`CheckoutClient.tsx` line 1070). Pass selectable in. Do not put a fare on the chip. Do not use `na_pax` copy.

```51:66:apps/web/app/[locale]/checkout/CheckoutClassCards.tsx
      {offered.map((offer) => {
        const picked = vehicle === offer.slug;
        const fit = classFits(offer.slug, passengers, luggage, offered);
        return (
          <button
            type="button"
            data-fit={fit ? "true" : "false"}
            aria-pressed={picked}
            aria-disabled={!fit}
            disabled={!fit}
            onClick={() => {
              if (fit) onChange(offer.slug);
            }}
          >
```

Unpriced uses the same opacity as `data-fit="false"` (`.42`). Keep the card in `offered`. Continue must not enter Pay on a null peek — `startPayment` already returns before fetch:

```767:769:apps/web/app/[locale]/checkout/CheckoutClient.tsx
    if (peekLockClassRappen(lock, vehicleClass) == null) {
      if (!opts?.silent || step === "payment") setRefusal("pricingNotLive");
      return "fail";
    }
```

That backstop is not Select off. The chip is still activatable today.

---

### `apps/web/app/api/checkout/intent/route.ts` (route, request-response)

**Analog:** this file. Business rules stay in `runCheckoutIntent`. The route bug is order: Stripe client is built before the class-id check, and a miss is `invalid_request`.

```71:86:apps/web/app/api/checkout/intent/route.ts
  const stripe = stripeFromEnv(env);
  // lookup follows
  const { postgresNowIso, vehicleClassId } = await asQuote(env, async (sql) => {
    // lookupVehicleClassId(sql, body.vehicle_class)
  });
  if (!vehicleClassId) {
    return refuse("invalid_request");
  }
```

`stripeFromEnv` throws when `STRIPE_SECRET_KEY` is missing. The outer catch then returns 500 `intent_unhandled`, so UAT cannot tell `CHF 000` from a missing secret.

```32:40:apps/web/app/api/checkout/intent/route.ts
export async function POST(request: Request) {
  try {
    return await postIntent(request);
  } catch (err) {
    console.error("checkout_intent_unhandled", err instanceof Error ? err.message : String(err));
    return new Response(
      JSON.stringify({ ok: false, error: "intent_unhandled" }),
      { status: 500 },
    );
  }
}
```

Fix: missing class id → `refuse("pricing_not_live")` before `stripeFromEnv`. Same for the UAE prefix on the payable path: stop before `stripeFromEnv`. Keep `csrfForbidden` (line 54). Keep zod `invalid_request` for a body that does not parse (lines 61–67) — that is a bad request, not a missing class. Do not retarget `email_failed`. Do not add a code.

`refuse` already maps `pricing_not_live` to 409 with `action: null`. Do not change that. The Pay screen shows Requote because UI-SPEC says so, not because the JSON gained `action: "requote"`.

```6:16:apps/web/lib/checkout/errors.ts
export const CHECKOUT_REFUSALS = {
  quote_expired: { status: 409, action: "requote" as const },
  pricing_not_live: { status: 409, action: null },
  payment_window_closed: { status: 409, action: null },
  invalid_request: { status: 400, action: null },
} as const;
```

Same class-id miss exists in `pay-link/route.ts` lines 52 and 65–67. Fix both. Do not construct Stripe to answer either.

---

### `apps/web/lib/checkout/intent.ts` (service, request-response)

**Analog:** this file. Keep the refuse-before-create order. Do not switch to PaymentIntent-only. Do not send `ui_mode: "custom"` or `success_url`.

```219:234:apps/web/lib/checkout/intent.ts
  if (!checked.ok) {
    return refuse(mapQuoteCode(checked.code));
  }
  // pay gate, then chosen class total
  if (netRappen == null) {
    return refuse("pricing_not_live");
  }
```

```243:244:apps/web/lib/checkout/intent.ts
  if (!deps.vehicleClassId) {
    return refuse("invalid_request");
  }
```

Route owns the lookup miss (`pricing_not_live` before Stripe). This inner check must not stay `invalid_request` if a caller still passes an empty id — same code, still before `createCheckoutSession` (line 267).

Session reuse stays. Do not add a table.

```124:138:apps/web/lib/checkout/intent.ts
async function payableFromOpen(...) {
  if (!existing) return null;
  const stored = await deps.retrieveCheckoutSession(existing.stripe_checkout_session_id).catch(
    () => null,
  );
  if (!sessionIsPayable(payable, chargedRappen)) return null;
  return { row: existing, payable };
}
```

```171:181:apps/web/lib/checkout/stripe.ts
export function sessionIsPayable(
  session: Stripe.Checkout.Session | null,
  chargedRappen: number,
): session is Stripe.Checkout.Session {
  if (!session?.client_secret) return false;
  if (session.status && session.status !== "open") return false;
  if ((session.currency ?? "").toLowerCase() === CHARGE_CURRENCY) {
    const amount = session.amount_subtotal ?? session.amount_total;
    if (typeof amount === "number" && amount !== chargedRappen) return false;
  }
  return true;
}
```

Create stays elements. Do not add `payment_method_types`. Do not add `success_url`.

```19:20:apps/web/lib/checkout/stripe.ts
export const CHECKOUT_UI_MODE = "elements" as const;
```

```83:86:apps/web/lib/checkout/stripe.ts
  return stripe.checkout.sessions.create(
    {
      mode: "payment",
      ui_mode: CHECKOUT_UI_MODE,
```

Prefix guard: if the publishable prefix is `pk_test_51U65pW`, do not call `deps.createCheckoutSession` or `deps.retrieveCheckoutSession`. Retrieve-miss after the owner swap is "old session not reused" (D-16) — replacement create only on the client account, only while the lock is live. Tests already cover reuse (`intent.test.ts` lines 406–437). Do not weaken them.

`expiresAt` at line 251 is `workerNow + checkoutWindowMinutes`. That clock is the Checkout Session clamp input, not the pay-link token. Do not use it as `tokenExpiresAt`.

---

### `apps/web/app/[locale]/checkout/CheckoutClient.tsx` (component, request-response)

**Analog:** this file. Dirty — edit forward, do not revert. Frozen chrome: Alert + existing pay sheet. No new layout.

**Code map — do not collapse:**

```75:85:apps/web/app/[locale]/checkout/CheckoutClient.tsx
const REFUSAL_KEYS: Record<string, string> = {
  quote_expired: "quoteExpired",
  pricing_not_live: "pricingNotLive",
  payment_window_closed: "paymentWindowClosed",
  invalid_request: "payCouldNotStart",
};
```

`onPay` does `setRefusal((current) => current ?? "payCouldNotStart")` (line 1050). A charge-gate refusal must already be set, so this fallback must not replace `pricingNotLive` / `quoteExpired`.

**Land blocked:** do not render `PaymentPanel`. Do not POST `/api/checkout/intent`. Dummy kit fields. Alert first inside the payment card, above the fields — not only in `.vt-checkout__payfoot` after the cancel copy.

Today the panel always mounts, and the Alert sits in the foot:

```1714:1749:apps/web/app/[locale]/checkout/CheckoutClient.tsx
              <div className="vt-checkout__payblock">
                <PaymentPanel
                  publishableKey={publishable}
                  clientSecret={clientSecret ?? ""}
                />
              </div>
              <div className="vt-checkout__payfoot">
                {refusal && refusal !== "couponNoLongerValid" ? (
                  <Alert tone={refusal === "pricingNotLive" ? "info" : "danger"}>
                    {t(refusal)}
                    {requote ? (
                      <Button variant="ghost" size="sm" href={homeHref}>
                        {t("requote")}
                      </Button>
                    ) : null}
                  </Alert>
                ) : null}
```

`Alert` defaults `role="note"`, then spreads `rest`, so `role="alert"` from the caller wins. Do not edit `Alert.tsx`.

```46:50:apps/web/components/feedback/Alert.tsx
    <div
      className={["vt-alert", `vt-alert--${tone}`, className].filter(Boolean).join(" ")}
      role="note"
      {...rest}
    >
```

Tones: unpriced `info`, expired `danger`. Never `accent`.

**Dummy fields** — kit `Input` / `Select`, native `disabled`, empty values. Labels already on `PaymentPanel`: `cardNumber`, `cardExpiry`, `cardCvc`, `cardCountry`. Placeholders `1234 1234 1234 1234`, `MM / YY`, `CVC` are format hints, not prices. Country dead at `CH`. Icon `credit-card`. Grid `.vt-checkout__cardfields`. Do not invent a PAN.

```25:25:apps/web/components/forms/Input.tsx
  disabled?: boolean;
```

```62:67:apps/web/components/forms/Input.tsx
  const box = [
    "vt-input",
    `vt-input--${size}`,
    disabled ? "vt-input--disabled" : "",
  ]
```

```22:22:apps/web/components/forms/Select.tsx
  disabled?: boolean;
```

**Requote** is a button, not a link. `href` makes `Button` render `<a>` and skips the cancel.

```89:98:apps/web/components/core/Button.tsx
  if (href) {
    return (
      <a href={disabled ? undefined : href} className={cls}>
        {inner}
      </a>
    );
  }
```

Use `variant="ghost"` `size="md"` `sentenceCase` (that is `.vt-btn--sentence`), no `href`. `onClick`: POST the requote route (cancel unpaid immediately), then Home wipe. Do not wait for Home load. No confirm dialog. Absent when this is not checkout Pay.

`requote` already includes `pricingNotLive` (lines 1074–1080). Keep that. Do not add card copy.

**Lock zero (D-04):** no reload, no second intent. `startPayment` returns `"ok"` when `clientSecretRef.current` is set (line 748) — do not clear that secret and re-fetch at zero. If Stripe was not mounted, become the dummy land-blocked state. If it was mounted, leave `PaymentPanel` and pass a locked flag. Pay and Email a pay link `disabled` immediately (they already disable on `classFareRappen == null`, lines 1756 and 1763 — also disable on expired / locked).

The Worker clock is decorative. Server `payload.exp` vs Postgres `now()` still refuses.

```18:23:apps/web/lib/quote/lock.ts
//  3. It is not the enforcement point — the authoritative refusal is Postgres
//     now() inside the snapshot-write transaction ...
// The Worker-side check and the UI countdown are decorative, and any copy or
// comment implying otherwise is wrong.
```

```44:44:apps/web/lib/quote/lock.ts
export const QUOTE_LOCK_MINUTES = 1440;
```

---

### `apps/web/app/[locale]/checkout/PaymentPanel.tsx` (component, request-response)

**Analog:** this file. Dirty — edit forward. `CheckoutProvider` is already gated on `secret`. `Elements` is not. That is the iframe bug.

```379:398:apps/web/app/[locale]/checkout/PaymentPanel.tsx
  return (
    <div className="vt-checkout__pay" data-checkout-pay>
      {secret ? (
        <CheckoutProvider
          key={secret}
          stripe={promise}
          options={{ clientSecret: secret }}
        >
          <CheckoutSession sessionRef={sessionRef} onExpress={onExpress} />
        </CheckoutProvider>
      ) : null}
      <Elements stripe={promise} options={cardOptions}>
        <VamosCardFields name={billingName} email={billingEmail} onCreate={onCardCreate} onComplete={onComplete} />
      </Elements>
    </div>
  );
```

Land-blocked: parent does not render this component. Do not call `loadStripe` for dummy fields.

```103:110:apps/web/app/[locale]/checkout/PaymentPanel.tsx
function browserStripe(publishableKey: string): Promise<Stripe | null> {
  const key = (process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || publishableKey || "").trim();
  if (!key || key === "pk_test_placeholder") return Promise.resolve(null);
  if (!stripePromise || stripePromiseKey !== key) {
    stripePromiseKey = key;
    stripePromise = loadStripe(key);
  }
  return stripePromise;
}
```

Do not set `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`. Phase 25 owns that preference. Do not "fix" it this phase.

**Lock zero, already mounted:** no code analog. Do not remount dummy `Input`s over live iframes. Do not call intent. Leave the nodes. `pointer-events: none`. Cannot type. Express/Link inert / `hidden`. Parent owns the danger Alert.

Field chrome to mirror in the dummy block (labels only):

```204:218:apps/web/app/[locale]/checkout/PaymentPanel.tsx
      <h2 className="vt-checkout__method">{t("payWithCard")}</h2>
      <div className="vt-checkout__cardfields" data-checkout-card-fields>
      <div className="vt-field" data-checkout-card-number>
        <span className="vt-field__label">{t("cardNumber")}</span>
        <div className="vt-input vt-input--md">
          <span className="vt-checkout__card-brand">
            <Icon name="credit-card" size={16} />
          </span>
          <CardNumberElement
            options={{ placeholder: "1234 1234 1234 1234" }}
          />
```

Expiry placeholder is `MM / YY` (line 244). CVC placeholder is `CVC` (line 255). Country is `Select` `label={t("cardCountry")}` (lines 231–237).

---

### `apps/web/app/[locale]/checkout/pay/[token]/PayClient.tsx` (component, request-response)

**Analog:** this file's recap + `CheckoutClient` payment sheet. No Requote. No Home button. Payer cannot edit the trip.

Today a non-ok open collapses to `paymentWindowClosed`, and empty `clientSecret` omits the fields:

```49:51:apps/web/app/[locale]/checkout/pay/[token]/PayClient.tsx
        if (!res.ok) {
          setError(json.code === "quote_already_booked" ? "quoteAlreadyBooked" : "paymentWindowClosed");
          return;
        }
```

```113:139:apps/web/app/[locale]/checkout/pay/[token]/PayClient.tsx
          {error ? <Alert tone="danger">{t(error)}</Alert> : null}
          {clientSecret ? (
            <>
              <PaymentPanel
                publishableKey={publishable}
                clientSecret={clientSecret}
              />
              <Button size="lg" disabled={paying || busy} onClick={() => void onPay()}>
                {t("pay-and-continue")}
              </Button>
            </>
          ) : null}
```

Map `pricing_not_live` → `pricingNotLive` (`tone="info"`), `quote_expired` → `quoteExpired` (`tone="danger"`). Do not paint `paymentWindowClosed` or `payCouldNotStart` for those. Keep recap (title → pickup/dropoff → amount via `formatAmount` → Alert → fields). Dead token: dummy fields under the Alert, Pay disabled, no Stripe, no session. `role="alert"` on the Alert. No Requote control. "Get a new price" is the `quoteExpired` sentence, not a button.

---

### `apps/web/app/api/checkout/pay-link/route.ts` (route, request-response)

**Analog:** this file. Dirty — edit forward. `email_failed` stays 502. Do not collapse it.

```186:188:apps/web/app/api/checkout/pay-link/route.ts
  if (!sent.ok) {
    return Response.json({ error: "email_failed", code: "email_failed" }, { status: 502, headers: { "cache-control": "private, no-store" } });
  }
```

Same Stripe-before-class-id bug as intent (lines 52, 65–67). Missing class id → `pricing_not_live` before `stripeFromEnv`. Prefix guard before `stripeFromEnv` on the payable path. Intent already refuses `quote_expired` / `pricing_not_live` — keep returning `intentRes` unchanged (line 133).

Token clock bug: `tokenExpiresAt` is intent `expires_at`, which is now+window, not lock `exp`.

```141:152:apps/web/app/api/checkout/pay-link/route.ts
  const payToken = await mintManageToken();
  await asCheckout(env, null, (sql) =>
    setPayLink(sql, {
      bookingId: payload.booking_id,
      billingKind: body.billing_kind,
      payerEmail: body.payer_email,
      tokenHash: payToken.hash,
      tokenExpiresAt: new Date(payload.expires_at),
    }),
  );
```

`verifyLock` already runs just below (lines 157–166), too late, and it passes `"0001-01-01T00:00:00.000Z"` so an expired lock still yields a payload for the email. For the token, verify against worker/postgres now first. Pass `new Date(lockPayload.exp)` via `payLinkTokenExpiresAt`. Resend mints a new hash, so `on conflict (token_hash) do nothing` does not update the old row — the new row's `expires_at` is whatever this caller passes. Do not pass `now + checkoutWindowMinutes`.

SQL does not clamp the argument (A3, verified). Do not change `checkout_set_pay_link`. `pay_link_sent_at` already does not restart:

```76:77:packages/db/supabase/migrations/20260907000002_checkout_company_paylink.sql
  -- D-37: resend allowed; 24h clock does not restart.
  v_sent := coalesce(v_sent, now());
```

```89:94:packages/db/supabase/migrations/20260907000002_checkout_company_paylink.sql
  insert into public.booking_access_tokens (
    booking_id, purpose, token_hash, expires_at
  ) values (
    p_booking_id, 'pay', p_token_hash, p_token_expires_at
  )
  on conflict (token_hash) do nothing;
```

`setPayLink` already takes a `Date`. No signature change.

```5:16:apps/web/lib/checkout/set-pay-link.ts
export async function setPayLink(
  sql: postgres.TransactionSql,
  args: {
    bookingId: string;
    tokenHash: Uint8Array;
    tokenExpiresAt: Date;
  },
)
```

---

### `apps/web/app/api/checkout/pay-link/open/route.ts` (route, request-response)

**Analog:** this file's reuse branch. Hash miss and a null charge currently paint `payment_window_closed`, then the route builds a Stripe client and may `sessions.create`.

```78:104:apps/web/app/api/checkout/pay-link/open/route.ts
    const rows = await asCheckout(env, null, (sql) => sql`
      select * from public.checkout_pay_link_by_hash(decode(${tokenHex}, 'hex'))
    `);
    const found = rows[0];
    if (!found) return refuse("payment_window_closed");
  } catch (err) {
    const state = sqlState(err);
    if (state === "P0002" || state === "23P01") return refuse("payment_window_closed");
    throw err;
  }
  if (charged == null || !Number.isFinite(charged) || charged <= 0) {
    return refuse("payment_window_closed");
  }
```

```116:144:apps/web/app/api/checkout/pay-link/open/route.ts
  const stripe = stripeFromEnv(env);
  const existing = await asCheckout(env, null, (sql) => loadOpenPayment(sql, quoteId));
  if (existing) {
    const stored = await retrieveCheckoutSession(stripe, existing.stripe_checkout_session_id).catch(
      () => null,
    );
    if (sessionIsPayable(stored, charged)) {
      // reuse client_secret — keep
    }
  }
  const session = await createCheckoutSession(stripe, {
    chargedRappen: charged,
    idempotencyKey: `paylink:${reference}:${Math.floor(expiresAt.getTime() / 1000)}`,
  });
```

Hash RPC already requires `t.expires_at > now()` and `s.expires_at > now()`, not `quote_lock_expires_at`. Pinning token exp to lock exp is what makes a dead lock miss. Do not add a migration for that unless the caller pin is skipped.

```242:247:packages/db/supabase/migrations/20260907000002_checkout_company_paylink.sql
     where t.token_hash = p_token_hash
       and t.purpose = 'pay'
       and t.revoked_at is null
       and t.expires_at > now()
       and s.expires_at > now()
       and b.status in ('pending', 'quote');
```

Miss / `P0002` on this page → `refuse("quote_expired")`, not `payment_window_closed`. Null or non-positive charge → `refuse("pricing_not_live")`. Both before `stripeFromEnv`. Prefix guard before retrieve and before `createCheckoutSession`. Keep the 23001 reuse branch (lines 169–196). Keep `quote_already_booked` for a real replay. Do not mint to fill disabled iframes.

---

## Shared Patterns

### Refusal vocabulary

**Source:** `apps/web/lib/checkout/errors.ts`
**Apply to:** intent route, pay-link route, pay-link open route, CheckoutClient, PayClient

Do not edit the map to collapse codes. `pricing_not_live` and `quote_expired` stay 409. `invalid_request` stays 400 and is not the charge gate. `email_failed` is not in this map; it stays a 502 on the pay-link route.

```28:46:apps/web/lib/checkout/errors.ts
export function refuse(
  code: CheckoutRefusalCode,
  extra?: { field?: string },
): Response {
  const entry = CHECKOUT_REFUSALS[code];
  const body: CheckoutRefusal = { code };
  if (entry.action) {
    body.action = entry.action;
  }
  return new Response(JSON.stringify(body), {
    status: entry.status,
    headers: {
      "content-type": "application/json",
      "cache-control": "private, no-store",
    },
  });
}
```

Wire `action` is not the Pay button. UI-SPEC puts Requote on checkout Pay for `pricingNotLive` even though `action` is null.

### Guest checkout identity

**Source:** `apps/web/lib/db/identity.ts` `asCheckout`
**Apply to:** intent, pay-link, pay-link open, new requote route

`asCheckout(env, null, fn)`. Not `asCustomer`. Not `asSystem`. Not anon EXECUTE on the new RPC.

### CSRF

**Source:** `apps/web/lib/security/origin.ts` `csrfForbidden`
**Apply to:** every new or touched checkout POST. Keep the existing call. Do not drop it while reordering the class-id check.

### Custom Checkout

**Source:** `apps/web/lib/checkout/stripe.ts` lines 19–20 and 83–98
**Apply to:** any payable `sessions.create`

`CHECKOUT_UI_MODE = "elements"`. `mode: "payment"`. `return_url` set. No `success_url`. No `payment_method_types`. No hosted Checkout. No PaymentIntent-only rewrite. `stripe.test.ts` line 38 already asserts `"elements"`.

### Amounts

**Source:** `apps/web/lib/currency.ts` `formatAmount`
**Apply to:** home cards, checkout rail, token recap, dummy state

Null → `CHF 000`. Do not invent rappen. Payable UAT class is **mahaha**. Live book id **15**. Do not Publish.

### UAE prefix

**Source:** new `stripeAccountIsLegacyUaeTest` in `charge-gate.ts`
**Apply to:** intent route, `runCheckoutIntent` create/retrieve, pay-link route, pay-link open route, requote expire call

Prefix `pk_test_51U65pW` only. Agent never reads secrets. Owner `wrangler secret put` is not a code task. If the prefix is still bound, payable create stops. Unpriced and expired still never open Stripe.

### D-09 until owner apply

**Source:** new migration + requote route
**Apply to:** CheckoutClient Requote `onClick`

Worker calls the RPC, then navigates Home. If the RPC is not applied, do not fake a cancelled row in the client. Refusal UI does not depend on it.

## No Analog Found

| Behavior | Role | Data Flow | Reason |
|----------|------|-----------|--------|
| Disable already-mounted Stripe at lock zero | component | request-response | `PaymentPanel` always mounts `<Elements>`. Nothing sets `pointer-events: none` on a live iframe. Follow `21-UI-SPEC.md` P3. Do not remount dummy inputs over iframes. Do not mint. |

Everything else has an analog above.

## Metadata

**Analog search scope:** `apps/web/lib/checkout/`, `apps/web/app/api/checkout/`, `apps/web/app/[locale]/checkout/`, `apps/web/components/home/BookingBoard.tsx`, `apps/web/components/forms/`, `apps/web/components/feedback/Alert.tsx`, `apps/web/components/core/Button.tsx`, `apps/web/components/transfer/VehicleCard.tsx`, `packages/db/supabase/migrations/20260911180000_checkout_cancel_unpaid.sql`, `20260909133000_checkout_open_payment.sql`, `20260907000002_checkout_company_paylink.sql`, `20260823000014_payments_refunds.sql`
**Files scanned:** 13 classified + those analogs
**Pattern extraction date:** 2026-09-23

## Planner notes

- Do not modify `errors.ts` to collapse codes.
- Do not modify `set-pay-link.ts` or `checkout_set_pay_link` for the clock. Change the caller argument.
- Do not modify `stripe.ts` `CHECKOUT_UI_MODE`. Prefix guard lives in `charge-gate.ts` so Wave 0 does not import the Stripe SDK.
- Do not edit `checkout-comments.test.ts`.
- Schema task: git migration only, owner-apply, `autonomous: false`.
- `<automated>` points at `lib/**/*.test.ts`, specifically `lib/checkout/charge-gate.test.ts` and `lib/checkout/intent.test.ts`. Not `tests/integration/*.spec.ts`.
