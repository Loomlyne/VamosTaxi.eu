// The client bundle inlines NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY as
// pk_test_placeholder. That string is truthy, so `env || prop` never reaches
// the Worker key and Stripe.js never loads. Card, Apple Pay, and TWINT stay blank.

const PLACEHOLDER = "pk_test_placeholder";

export function stripeBrowserKey(envKey: string | undefined, propKey: string): string {
  const env = (envKey ?? "").trim();
  if (env && env !== PLACEHOLDER) return env;
  return propKey.trim();
}
