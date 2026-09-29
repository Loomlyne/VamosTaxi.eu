import { setRequestLocale } from "next-intl/server";
import { parseTripQuery } from "@/lib/checkout/trip-url";
import { CheckoutPage } from "./CheckoutPage";

type Search = Record<string, string | string[] | undefined>;

/**
 * D-01/D-05: the one-page checkout. The server only parses the URL trip (zod, length
 * caps, regexes — T-26.3-15-01); it never quotes. The client quotes through /api/quote
 * so the abuse guards (Turnstile, rate limit, breaker) stay on the one route that
 * spends Mapbox (T-26.3-15-03).
 */
export default async function CheckoutRoute({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Search>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const query = await searchParams;
  const flat: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(query)) {
    flat[key] = Array.isArray(value) ? value[0] : value;
  }
  const { trip, errors } = parseTripQuery(flat);
  return <CheckoutPage initialTrip={trip} errors={errors} locale={locale} />;
}
