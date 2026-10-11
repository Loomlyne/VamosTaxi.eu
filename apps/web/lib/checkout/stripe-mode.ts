// apps/web/lib/checkout/stripe-mode.ts
//
// One place that reads the mode of a Stripe key (J1, 2026-10-09 payments review W1-02/W1-04).
// Test and live keys must never mix: the secret key decides the account the Worker charges,
// the webhook only counts when its `livemode` matches that key, and the publishable key is
// compared in the hourly health probe. A key that is neither a secret nor a restricted key
// is refused before any Stripe call, so a stray character, a trailing newline or a wrong
// prefix fails loudly instead of reaching Stripe.
//
// The patterns are written so the literal live-key prefix never appears in source: the
// repo greps (leak gates) look for it.

export type StripeMode = "live" | "test";

const SECRET_KEY = /^(?:sk|rk)_(live|test)_[A-Za-z0-9_]+$/;
const PUBLISHABLE_KEY = /^pk_(live|test)_[A-Za-z0-9_]+$/;
/** The production block in wrangler.jsonc carries this until cutover; it names no mode. */
const PUBLISHABLE_PLACEHOLDER = "pk_test_placeholder";

/**
 * Mode of a secret (`sk_`) or restricted (`rk_`) key; null for anything else. Surrounding
 * whitespace is ignored, as it is on the wire (a header value is trimmed by fetch), so a key
 * pasted with a trailing newline keeps working; use `stripeSecretKey` for the usable value.
 */
export function stripeSecretKeyMode(key: string | null | undefined): StripeMode | null {
  const m = typeof key === "string" ? SECRET_KEY.exec(key.trim()) : null;
  return m ? (m[1] as StripeMode) : null;
}

/** Mode of a publishable key; null for the placeholder, empty or malformed values. */
export function stripePublishableKeyMode(key: string | null | undefined): StripeMode | null {
  const k = typeof key === "string" ? key.trim() : "";
  if (!k || k === PUBLISHABLE_PLACEHOLDER) return null;
  const m = PUBLISHABLE_KEY.exec(k);
  return m ? (m[1] as StripeMode) : null;
}

export class StripeModeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StripeModeError";
  }
}

/** The secret key's mode, or a StripeModeError when the value is not a Stripe key. */
export function requireStripeSecretMode(key: string | null | undefined): StripeMode {
  const mode = stripeSecretKeyMode(key);
  if (!mode) throw new StripeModeError("STRIPE_SECRET_KEY is not a Stripe secret or restricted key");
  return mode;
}

/**
 * True when the secret key is usable and, if a publishable key is bound, both name the same
 * mode. The placeholder publishable key names no mode and is not compared.
 */
export function stripeKeysAgree(env: {
  STRIPE_SECRET_KEY?: string;
  STRIPE_PUBLISHABLE_KEY?: string;
}): boolean {
  const secret = stripeSecretKeyMode(env.STRIPE_SECRET_KEY);
  if (!secret) return false;
  const publishable = stripePublishableKeyMode(env.STRIPE_PUBLISHABLE_KEY);
  return publishable === null || publishable === secret;
}

/**
 * Early staff-side check: a key that is bound but is not a Stripe key of a known mode is
 * refused before anything is written. An unbound key passes here on purpose: a flow that
 * needs no Stripe call (a refund-due change) still works, and a flow that does fails at
 * `stripeFromEnv` with "STRIPE_SECRET_KEY is not bound".
 */
export function stripeKeyRefused(env: { STRIPE_SECRET_KEY?: string }): boolean {
  const key = env.STRIPE_SECRET_KEY;
  return Boolean(key) && stripeSecretKeyMode(key) === null;
}
