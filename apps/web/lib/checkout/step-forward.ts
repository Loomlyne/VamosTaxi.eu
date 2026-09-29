// D-31: /checkout/trip, /checkout/details and /checkout/payment no longer exist as
// steps. They forward to the one-page /checkout and keep the query, so an old
// bookmark, a Stripe cancel_url or a sign-in return still lands with its trip.
// The target is always our own fixed path (T-26.3-15-04): no host, no `next` param.

const LOCALES = ["en", "de", "fr", "ar"];

export function checkoutForwardPath(
  locale: string,
  searchParams: Record<string, string | string[] | undefined>,
): string {
  const prefix = LOCALES.includes(locale) && locale !== "en" ? `/${locale}` : "";
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams)) {
    const first = Array.isArray(value) ? value[0] : value;
    if (typeof first === "string") qs.set(key, first);
  }
  const query = qs.toString();
  return `${prefix}/checkout${query ? `?${query}` : ""}`;
}
