/**
 * One shared table of addresses for the Google tag list (owner decision 2026-10-09). The server twin
 * (`google-pages.ts`) and the browser loader (`app/vamos-google.js`) must give the same answer for every row.
 * Only the path decides: a query or a hash on an allowed path does not change the answer.
 */
export interface GoogleCase {
  readonly href: string;
  readonly allowed: boolean;
  readonly why: string;
}

const SITE = "https://vamostaxi.site";

export const GOOGLE_CASES: readonly GoogleCase[] = [
  { href: `${SITE}/`, allowed: true, why: "home" },
  { href: `${SITE}/?gclid=abc&utm_source=google#book`, allowed: true, why: "an ad click id and a query never decide" },
  { href: `${SITE}/?service=airport#book`, allowed: true, why: "service link" },
  { href: `${SITE}/about`, allowed: true, why: "about" },
  { href: `${SITE}/de/faq`, allowed: true, why: "language page" },
  { href: `${SITE}/ar`, allowed: true, why: "language home" },
  { href: `${SITE}/contact`, allowed: true, why: "contact" },
  { href: `${SITE}/account/transfers`, allowed: true, why: "account section" },
  { href: `${SITE}/sign-in`, allowed: true, why: "sign-in" },
  { href: `${SITE}/checkout`, allowed: true, why: "the one-page checkout" },
  { href: `${SITE}/checkout?from=Zurich&to=Geneva&when=2026-10-10T10:00`, allowed: true, why: "checkout with a trip (path only is read)" },
  { href: `${SITE}/de/checkout`, allowed: true, why: "checkout in German" },
  { href: `${SITE}/confirmation/VT-26-07331`, allowed: true, why: "confirmation" },
  { href: `${SITE}/fr/confirmation/VT-26-0733`, allowed: true, why: "confirmation in French, four digits" },

  { href: `${SITE}/checkout/pay/abc123`, allowed: false, why: "pay link" },
  { href: `${SITE}/de/checkout/pay/abc123`, allowed: false, why: "pay link in German" },
  { href: `${SITE}/checkout/trip`, allowed: false, why: "retired checkout step" },
  { href: `${SITE}/confirmation`, allowed: false, why: "confirmation with no reference" },
  { href: `${SITE}/confirmation/abc`, allowed: false, why: "confirmation with a bad reference" },
  { href: `${SITE}/confirmation/VT-26-07331/extra`, allowed: false, why: "confirmation with a longer path" },
  { href: `${SITE}/en/confirmation/VT-26-07331`, allowed: false, why: "no /en prefix" },
  { href: `${SITE}/manage-booking`, allowed: false, why: "manage booking" },
  { href: `${SITE}/booking-detail`, allowed: false, why: "booking detail" },
  { href: `${SITE}/review`, allowed: false, why: "review" },
  { href: `${SITE}/reset-password`, allowed: false, why: "reset password" },
  { href: `${SITE}/sign-in/confirm`, allowed: false, why: "sign-in confirm" },
  { href: `${SITE}/ops`, allowed: false, why: "ops" },
  { href: `${SITE}/dashboard`, allowed: false, why: "dashboard path" },
  { href: `${SITE}/dev`, allowed: false, why: "dev gallery" },
  { href: `${SITE}/api/consent/state`, allowed: false, why: "api" },
  { href: `${SITE}/about/`, allowed: false, why: "trailing slash" },
  { href: "https://dashboard.vamostaxi.site/about", allowed: false, why: "dashboard host" },
  { href: "https://dashboard.vamostaxi.site/checkout", allowed: false, why: "dashboard host checkout" },
  { href: "https://www.vamostaxi.site/about", allowed: false, why: "www host" },
  { href: "https://vamos.koussay.workers.dev/about", allowed: false, why: "workers.dev host" },
  { href: "https://localhost/about", allowed: false, why: "localhost" },
  { href: "http://vamostaxi.site/about", allowed: false, why: "http" },
  { href: "https://vamostaxi.site:8443/about", allowed: false, why: "a port" },
  { href: "https://user@vamostaxi.site/about", allowed: false, why: "credentials" },
  { href: "https://vamostaxi.eu/about", allowed: false, why: "the other domain" },
];
