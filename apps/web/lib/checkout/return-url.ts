const SESSION_ID = /^cs_(?:test|live)_[A-Za-z0-9]+$/;
const LOCALES: readonly string[] = Object.freeze(["en", "de", "fr", "ar"]);

export function checkoutSessionIdFromSecret(secret: string): string {
  const cut = secret.indexOf("_secret_");
  const id = cut > 0 ? secret.slice(0, cut) : "";
  return SESSION_ID.test(id) ? id : "";
}

export function checkoutPageLocale(pathname: string): string {
  const first = pathname.split("/").filter(Boolean)[0] ?? "";
  return LOCALES.includes(first) && first !== "en" ? first : "en";
}

/**
 * Checkout Session `return_url`. Stripe replaces `{CHECKOUT_SESSION_ID}`.
 * Do not encode the braces. The booking reference is not known when the
 * session is created, so the return route looks it up.
 */
export function stripeCheckoutReturnUrl(origin: string, locale = "en"): string {
  const base = origin.replace(/\/$/, "");
  const loc = LOCALES.includes(locale) ? locale : "en";
  return `${base}/api/checkout/return?locale=${loc}&session_id={CHECKOUT_SESSION_ID}`;
}
