// apps/web/lib/checkout/errors.ts
//
// Closed refusal vocabulary for POST /api/checkout/intent (04-API-CONTRACT.md §7
// plus checkout-only codes). No customer-facing English.

export const CHECKOUT_REFUSALS = {
  // Bad HMAC and unknown quote_id are the same 404 — no oracle (§6).
  quote_not_found: { status: 404, action: "requote" as const },
  quote_expired: { status: 409, action: "requote" as const },
  pricing_not_live: { status: 409, action: null },
  price_changed: { status: 409, action: "requote" as const },
  engine_changed: { status: 409, action: "requote" as const },
  coupon_no_longer_valid: { status: 409, action: "requote" as const },
  quote_already_booked: { status: 409, action: null },
  payment_window_closed: { status: 409, action: null },
  invalid_request: { status: 400, action: null },
  turnstile_failed: { status: 400, action: null },
} as const satisfies Record<string, { status: number; action: "requote" | null }>;

export type CheckoutRefusalCode = keyof typeof CHECKOUT_REFUSALS;

export type CheckoutRefusal = {
  code: CheckoutRefusalCode;
  action?: "requote";
  field?: string;
};

export function refuse(
  code: CheckoutRefusalCode,
  extra?: { field?: string },
): Response {
  const entry = CHECKOUT_REFUSALS[code];
  const body: CheckoutRefusal = { code };
  if (entry.action) {
    body.action = entry.action;
  }
  if (extra?.field) {
    body.field = extra.field;
  }
  return new Response(JSON.stringify(body), {
    status: entry.status,
    headers: { "content-type": "application/json" },
  });
}
