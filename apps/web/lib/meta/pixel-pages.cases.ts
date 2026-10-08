/**
 * One shared table of addresses for the Meta page-view allow-list (Phase 28, D-01..D-03).
 * The server twin (`pixel-pages.ts`) and the browser loader (`app/vamos-meta.js`) must give the same
 * answer for every row. Rows with a `referrer` are browser-only: the server never sees one.
 * No Meta host and no pixel id in this file.
 */
export interface PixelCase {
  readonly href: string;
  readonly referrer?: string;
  readonly allowed: boolean;
  readonly why: string;
  readonly browserOnly?: true;
}

const SITE = "https://vamostaxi.site";
const NINE = ["about", "faq", "contact", "terms", "privacy", "cookies", "cancellation", "imprint"] as const;
const LANGS = ["de", "fr", "ar"] as const;
const SECTIONS = ["transfers", "details", "mobile", "preferences", "security", "close"] as const;

const generated: PixelCase[] = [
  { href: `${SITE}/`, allowed: true, why: "home" },
  ...NINE.map((p) => ({ href: `${SITE}/${p}`, allowed: true, why: `clean page /${p}` })),
  ...LANGS.map((l) => ({ href: `${SITE}/${l}`, allowed: true, why: `home in ${l}` })),
  ...LANGS.flatMap((l) => NINE.map((p) => ({ href: `${SITE}/${l}/${p}`, allowed: true, why: `/${l}/${p}` }))),
  ...SECTIONS.map((s) => ({ href: `${SITE}/account/${s}`, allowed: true, why: `account section ${s}` })),
];

export const PIXEL_CASES: readonly PixelCase[] = [
  ...generated,
  { href: `${SITE}/coming-soon`, allowed: true, why: "coming soon" },
  { href: `${SITE}/sitemap`, allowed: true, why: "sitemap" },
  { href: `${SITE}/account`, allowed: true, why: "signed-in account" },
  { href: `${SITE}/bookings`, allowed: true, why: "signed-in bookings" },
  { href: `${SITE}/sign-in`, allowed: true, why: "sign-in with no query at all" },
  { href: `${SITE}/sign-up`, allowed: true, why: "sign-up with no query at all" },

  // Ad click ids and anchors on pages that are not sign-in / sign-up (D-03).
  { href: `${SITE}/about?fbclid=abc`, allowed: true, why: "fbclid is what _fbc is" },
  { href: `${SITE}/?utm_source=x&utm_campaign=y`, allowed: true, why: "utm keys" },
  { href: `${SITE}/?fbclid=IwAR0abc_DEF-123&utm_source=meta`, allowed: true, why: "fbclid and utm together" },
  { href: `${SITE}/de/about?utm_medium=cpc`, allowed: true, why: "utm on a language address" },
  { href: `${SITE}/faq#faq`, allowed: true, why: "plain anchor" },
  { href: `${SITE}/about?fbclid=abc#top`, allowed: true, why: "click id and anchor" },

  // The service link the agency uses in adverts (2026-10-09): one lower-case word.
  { href: `${SITE}/?service=airport#book`, allowed: true, why: "service link with the booking anchor" },
  { href: `${SITE}/?service=airport`, allowed: true, why: "service word" },
  { href: `${SITE}/?service=city-transfer&utm_source=meta&fbclid=abc`, allowed: true, why: "service with click id and utm" },
  { href: `${SITE}/de?service=airport#book`, allowed: true, why: "service on a language home" },
  { href: `${SITE}/?service=`, allowed: false, why: "service with no word" },
  { href: `${SITE}/?service`, allowed: false, why: "service with no value at all" },
  { href: `${SITE}/?service=Airport`, allowed: false, why: "service with a capital" },
  { href: `${SITE}/?service=air%70ort`, allowed: false, why: "service with an escape (read raw)" },
  { href: `${SITE}/?service=a%40b.com`, allowed: false, why: "service holding an e-mail address" },
  { href: `${SITE}/?service=airport&token=1`, allowed: false, why: "service next to a deny key" },
  { href: `${SITE}/?service=${"a".repeat(33)}`, allowed: false, why: "service longer than 32" },
  { href: `${SITE}/?service=airport+x`, allowed: false, why: "service with a plus" },
  { href: `${SITE}/about?service=airport`, allowed: true, why: "service on another clean page" },
  { href: `${SITE}/sign-in?service=airport`, allowed: false, why: "sign-in takes no query" },
  { href: `${SITE}/checkout?service=airport`, allowed: false, why: "checkout is not a pixel page" },

  // Strict reading of D-01 (owner, 2026-10-03): sign-in and sign-up are bare addresses only.
  { href: `${SITE}/sign-in?fbclid=x`, allowed: false, why: "sign-in with an ad click id is not counted" },
  { href: `${SITE}/sign-up?fbclid=x`, allowed: false, why: "sign-up with an ad click id is not counted" },
  { href: `${SITE}/sign-up?code=x`, allowed: false, why: "sign-up with a code" },
  { href: `${SITE}/sign-in?returnTo=/checkout?from=a&to=b`, allowed: false, why: "sign-in carrying a whole trip" },
  { href: `${SITE}/sign-in?`, allowed: false, why: "an empty query mark is still a query string" },
  { href: `${SITE}/sign-in/confirm`, allowed: false, why: "sign-in confirm page" },

  // D-02 paths.
  { href: `${SITE}/checkout`, allowed: false, why: "checkout" },
  { href: `${SITE}/checkout/trip`, allowed: false, why: "checkout trip" },
  { href: `${SITE}/checkout/pay/abc`, allowed: false, why: "pay link" },
  { href: `${SITE}/confirmation`, allowed: false, why: "confirmation" },
  { href: `${SITE}/confirmation/VT-26-07331`, allowed: false, why: "confirmation with a reference" },
  { href: `${SITE}/manage-booking`, allowed: false, why: "manage booking" },
  { href: `${SITE}/booking-detail`, allowed: false, why: "booking detail" },
  { href: `${SITE}/review`, allowed: false, why: "review" },
  { href: `${SITE}/reset-password`, allowed: false, why: "reset password" },
  { href: `${SITE}/api/consent/state`, allowed: false, why: "api" },
  { href: `${SITE}/ops`, allowed: false, why: "ops" },
  { href: `${SITE}/dashboard`, allowed: false, why: "dashboard path" },
  { href: `${SITE}/dev`, allowed: false, why: "dev gallery" },
  { href: `${SITE}/en/about`, allowed: false, why: "no /en prefix" },
  { href: `${SITE}/de/sign-in`, allowed: false, why: "sign-in has no language address" },
  { href: `${SITE}/de/account`, allowed: false, why: "account has no language address" },
  { href: `${SITE}/account/foo`, allowed: false, why: "unknown account section" },
  { href: `${SITE}/about/`, allowed: false, why: "trailing slash" },
  { href: `${SITE}/app/pages/about.html`, allowed: false, why: "mock file path" },
  { href: `${SITE}/de/`, allowed: false, why: "language home with a trailing slash" },

  // Deny keys on an allowed path.
  { href: `${SITE}/about?token=x`, allowed: false, why: "key token" },
  { href: `${SITE}/about?ref=1`, allowed: false, why: "key ref" },
  { href: `${SITE}/about?reference=1`, allowed: false, why: "key reference" },
  { href: `${SITE}/about?session=cs_1`, allowed: false, why: "key session" },
  { href: `${SITE}/about?resume=1`, allowed: false, why: "key resume" },
  { href: `${SITE}/about?returnTo=/x`, allowed: false, why: "key returnTo" },
  { href: `${SITE}/about?code=1`, allowed: false, why: "key code" },
  { href: `${SITE}/about?token_hash=1`, allowed: false, why: "key token_hash" },
  { href: `${SITE}/about?gclid=1`, allowed: false, why: "key gclid is not an allowed key" },
  { href: `${SITE}/faq?q=refund`, allowed: false, why: "key q (free text)" },
  { href: `${SITE}/about?utm_source=a%40b.com`, allowed: false, why: "an e-mail address inside a value" },
  { href: `${SITE}/about?utm_source=vt-26-1`, allowed: false, why: "reference inside a value, lower case" },
  { href: `${SITE}/about?utm_source=a%2540b.com`, allowed: false, why: "a double-encoded @ (%2540) in a value" },
  { href: `${SITE}/about?utm_source=a%252540b.com`, allowed: false, why: "a triple-encoded @" },
  { href: `${SITE}/about?utm_source=a%2540b.com%25`, allowed: false, why: "a double-encoded @ with a stray %25 after it" },
  { href: `${SITE}/about?utm_source=vt%252D26-1`, allowed: false, why: "a double-encoded reference (vt%252D)" },
  { href: `${SITE}/about?utm_source=%${"25".repeat(7)}41`, allowed: false, why: "still decoding after five rounds" },
  { href: `${SITE}/about?utm_source=100%25`, allowed: true, why: "a single-encoded percent sign is harmless" },
  { href: `${SITE}/about?fbclid=%`, allowed: false, why: "undecodable value fails closed" },

  // Hashes.
  { href: `${SITE}/about#token=x`, allowed: false, why: "hash with =" },
  { href: `${SITE}/about#access_token=x`, allowed: false, why: "implicit flow hash" },
  { href: `${SITE}/about#a&b`, allowed: false, why: "hash with &" },
  { href: `${SITE}/about#a%20b`, allowed: false, why: "hash with %" },
  { href: `${SITE}/about#VT-26-07331`, allowed: false, why: "reference in the hash" },
  { href: `${SITE}/about#${"a".repeat(65)}`, allowed: false, why: "hash longer than 64" },

  // Hosts and protocol.
  { href: "https://dashboard.vamostaxi.site/about", allowed: false, why: "dashboard host" },
  { href: "https://www.vamostaxi.site/about", allowed: false, why: "www host" },
  { href: "https://vamos.koussay.workers.dev/about", allowed: false, why: "workers.dev host" },
  { href: "https://localhost/about", allowed: false, why: "localhost" },
  { href: "http://localhost:4300/about", allowed: false, why: "localhost with a port and http" },
  { href: "https://vamostaxi.eu/about", allowed: false, why: "the other domain" },
  { href: "http://vamostaxi.site/about", allowed: false, why: "http" },
  { href: "https://vamostaxi.site:8443/about", allowed: false, why: "a port" },
  { href: "https://user@vamostaxi.site/about", allowed: false, why: "credentials in the address" },

  // Referrers (browser only; research Pattern 3, layer 1).
  { href: `${SITE}/about`, referrer: "", allowed: true, why: "no referrer", browserOnly: true },
  { href: `${SITE}/about`, referrer: `${SITE}/`, allowed: true, why: "bare origin referrer", browserOnly: true },
  { href: `${SITE}/about`, referrer: `${SITE}/about`, allowed: true, why: "clean same-site referrer", browserOnly: true },
  { href: `${SITE}/about`, referrer: `${SITE}/confirmation/VT-26-07331`, allowed: false, why: "referrer is a confirmation", browserOnly: true },
  { href: `${SITE}/about`, referrer: `${SITE}/checkout?from=a&to=b`, allowed: false, why: "referrer is a checkout trip", browserOnly: true },
  { href: `${SITE}/about`, referrer: `${SITE}/checkout/pay/tok`, allowed: false, why: "referrer is a pay link", browserOnly: true },
  { href: `${SITE}/about`, referrer: "https://dashboard.vamostaxi.site/", allowed: true, why: "bare origin of another own host", browserOnly: true },
  { href: `${SITE}/about`, referrer: "https://dashboard.vamostaxi.site/bookings/x", allowed: false, why: "deep address on another own host", browserOnly: true },
  { href: `${SITE}/about`, referrer: "https://www.google.com/", allowed: true, why: "search engine", browserOnly: true },
  { href: `${SITE}/about`, referrer: "https://l.facebook.com/l.php?u=x", allowed: true, why: "Meta redirect page with its long address (owner D5, 2026-10-09)", browserOnly: true },
  { href: `${SITE}/?fbclid=x`, referrer: "https://l.facebook.com/l.php?u=https%3A%2F%2Fvamostaxi.site%2F%3Ffbclid%3DIwAR0abc&h=AT0abcDEF-ghi_JKL&__tn__=-UK-R", allowed: true, why: "real shape of a Facebook advert click", browserOnly: true },
  { href: `${SITE}/`, referrer: "https://lm.facebook.com/l.php?u=x&h=y", allowed: true, why: "lm.facebook.com", browserOnly: true },
  { href: `${SITE}/`, referrer: "https://l.instagram.com/?u=x&e=y", allowed: true, why: "l.instagram.com", browserOnly: true },
  { href: `${SITE}/`, referrer: "https://m.facebook.com/", allowed: true, why: "m.facebook.com bare", browserOnly: true },
  { href: `${SITE}/`, referrer: "https://www.instagram.com/p/abc123/", allowed: true, why: "Instagram post address", browserOnly: true },
  { href: `${SITE}/`, referrer: "https://l.messenger.com/l.php?u=x", allowed: true, why: "Messenger redirect", browserOnly: true },
  { href: `${SITE}/`, referrer: "https://evilfacebook.com/l.php?u=x", allowed: false, why: "suffix of another name", browserOnly: true },
  { href: `${SITE}/`, referrer: "https://facebook.com.evil.test/l.php?u=x", allowed: false, why: "Meta name as a label of another site", browserOnly: true },
  { href: `${SITE}/`, referrer: "https://facebook.com@evil.test/l.php?u=x", allowed: false, why: "Meta name as a username", browserOnly: true },
  { href: `${SITE}/`, referrer: "https://faceb00k.com/l.php?u=x", allowed: false, why: "look-alike name", browserOnly: true },
  { href: `${SITE}/`, referrer: "https://xn--facebook-9wa.com/l.php?u=x", allowed: false, why: "punycode look-alike", browserOnly: true },
  { href: `${SITE}/`, referrer: "https://facebook.com./l.php?u=x", allowed: false, why: "trailing dot host", browserOnly: true },
  { href: `${SITE}/`, referrer: "http://l.facebook.com/l.php?u=x", allowed: false, why: "Meta host over http", browserOnly: true },
  { href: `${SITE}/`, referrer: "https://l.facebook.com:8443/l.php?u=x", allowed: false, why: "Meta host with a port", browserOnly: true },
  { href: `${SITE}/`, referrer: "https://user:pw@l.facebook.com/l.php?u=x", allowed: false, why: "Meta host with credentials", browserOnly: true },
  { href: `${SITE}/`, referrer: "https://l.facebook.com/l.php?u=x#frag", allowed: false, why: "Meta host with a hash", browserOnly: true },
  { href: `${SITE}/`, referrer: "https://l.facebook.com/l.php?u=a%40b.com", allowed: false, why: "Meta host with an e-mail inside", browserOnly: true },
  { href: `${SITE}/`, referrer: "https://l.facebook.com/l.php?u=a%2540b.com", allowed: false, why: "Meta host with a double-encoded @", browserOnly: true },
  { href: `${SITE}/`, referrer: "https://l.facebook.com/l.php?u=vt-26-07331", allowed: false, why: "Meta host with a booking reference inside", browserOnly: true },
  { href: `${SITE}/`, referrer: "https://l.facebook.com/l.php?u=vt%252D26-1", allowed: false, why: "Meta host with a double-encoded reference", browserOnly: true },
  { href: `${SITE}/`, referrer: `https://l.facebook.com/l.php?u=${"a".repeat(2100)}`, allowed: false, why: "Meta host with an address over 2048", browserOnly: true },
  { href: `${SITE}/`, referrer: "https://l.facebook.com/l.php?u=%", allowed: false, why: "Meta host with an undecodable address", browserOnly: true },
  { href: `${SITE}/about`, referrer: "https://l.facebook.com/", allowed: true, why: "outside referrer that is a bare origin", browserOnly: true },
  { href: `${SITE}/about`, referrer: "https://www.google.com/search?q=vamos+taxi", allowed: false, why: "search results address with a query", browserOnly: true },
  { href: `${SITE}/about`, referrer: "https://example.test/#x", allowed: false, why: "outside referrer with a hash", browserOnly: true },
  { href: `${SITE}/about`, referrer: "https://example.test/page?token=abc", allowed: false, why: "cross-site referrer with token", browserOnly: true },
  { href: `${SITE}/about`, referrer: "https://example.test/VT-1", allowed: false, why: "cross-site referrer with a reference", browserOnly: true },
  { href: `${SITE}/about`, referrer: "https://example.test/?e=a@b.c", allowed: false, why: "cross-site referrer with an e-mail", browserOnly: true },
  { href: `${SITE}/about`, referrer: "not a url", allowed: false, why: "unparseable referrer fails closed", browserOnly: true },
];
