const SESSION_ID = /^cs_(?:test|live)_[A-Za-z0-9]+$/;
const LOCALES = new Set(["en", "de", "fr", "ar"]);

export function checkoutSessionIdFromSecret(secret: string): string {
  const cut = secret.indexOf("_secret_");
  const id = cut > 0 ? secret.slice(0, cut) : "";
  return SESSION_ID.test(id) ? id : "";
}

export function checkoutPageLocale(pathname: string): string {
  const first = pathname.split("/").filter(Boolean)[0] ?? "";
  return LOCALES.has(first) && first !== "en" ? first : "en";
}

export function checkoutReturnUrl(
  origin: string,
  reference: string,
  sessionId: string,
  locale = "en",
): string {
  return checkoutSettleUrl(origin, sessionId, locale, reference);
}

/** Settle URL. Reference is optional — the return route looks the booking up by session id. */
export function checkoutSettleUrl(
  origin: string,
  sessionId: string,
  locale = "en",
  reference = "",
): string {
  const url = new URL("/api/checkout/return", origin);
  if (reference) url.searchParams.set("ref", reference);
  url.searchParams.set("session", sessionId);
  url.searchParams.set("locale", LOCALES.has(locale) ? locale : "en");
  return url.toString();
}

/**
 * Checkout Session `return_url`. Stripe replaces `{CHECKOUT_SESSION_ID}`.
 * Do not encode the braces. The booking reference is not known when the
 * session is created, so the return route looks it up.
 */
export function stripeCheckoutReturnUrl(origin: string, locale = "en"): string {
  const base = origin.replace(/\/$/, "");
  const loc = LOCALES.has(locale) ? locale : "en";
  return `${base}/api/checkout/return?locale=${loc}&session_id={CHECKOUT_SESSION_ID}`;
}
