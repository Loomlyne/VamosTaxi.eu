// apps/web/tests/support/fake-stripe.ts
//
// Stand-in for Stripe's hosted Checkout page (26.3 D-38). Test code only: nothing here is
// imported by the app, no route or middleware is added, and no Stripe key is needed.
//
// installFakeStripe(page, opts):
//   - answers POST /api/checkout/intent with the hosted shape, url on the REAL Stripe
//     origin so the checkout's own origin check needs no test bypass;
//   - serves that origin's /pay/<session> as a tiny page with PAY and BACK buttons that
//     navigate to the success_url (with {CHECKOUT_SESSION_ID} filled in) or cancel_url;
//   - optionally mocks /api/checkout/return and /api/checkout/status/*.
// It records every intent request body (never amounts) for assertions.

import type { Page, Route } from "@playwright/test";

export const FAKE_STRIPE_HOST = "https://checkout.stripe.com/c";

export type FakeStripeOutcome = "paid" | "cancel" | "unpaid";

export type FakeStripeOptions = {
  outcome: FakeStripeOutcome;
  /** Mock /api/checkout/return: hop to confirmation (paid) or back to checkout (unpaid/cancel). */
  returnRoute?: boolean;
  /** Reference the mocked return route redirects to when paid. */
  reference?: string;
  /** Quote id used in the resume redirect of the mocked return route. */
  resumeQuoteId?: string;
  /** Sequence for /api/checkout/status/*; the last entry repeats. Omit to leave the route alone. */
  status?: Array<"pending" | "confirmed" | "never">;
  /** Intent response overrides (e.g. ok:false errors). */
  intentResponse?: Record<string, unknown>;
  intentStatus?: number;
};

export type FakeStripeHandle = {
  /** Parsed JSON bodies of every intent request, in order. */
  intentBodies: Array<Record<string, unknown>>;
  /** Session ids handed out so far. */
  sessions: string[];
};

const DEFAULT_REFERENCE = "VT-00-0000";

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({
    status,
    contentType: "application/json",
    headers: { "cache-control": "private, no-store" },
    body: JSON.stringify(body),
  });
}

/** Origin-relative success and cancel URLs the real intent route would hand Stripe. */
function payPage(successUrl: string, cancelUrl: string, sessionId: string): string {
  const s = JSON.stringify(successUrl.replace("{CHECKOUT_SESSION_ID}", sessionId));
  const c = JSON.stringify(cancelUrl);
  return `<!doctype html><html><head><meta charset="utf-8"><title>Fake Stripe</title></head>
<body data-fake-stripe="1" data-session="${sessionId}">
<main><h1>Fake Stripe Checkout</h1>
<button type="button" data-testid="fake-stripe-pay" onclick='location.assign(${s})'>PAY</button>
<button type="button" data-testid="fake-stripe-back" onclick='location.assign(${c})'>BACK</button>
</main></body></html>`;
}

export async function installFakeStripe(
  page: Page,
  opts: FakeStripeOptions,
): Promise<FakeStripeHandle> {
  const handle: FakeStripeHandle = { intentBodies: [], sessions: [] };
  let counter = 0;
  const base = new URL(page.url() === "about:blank" ? "http://127.0.0.1" : page.url()).origin;

  await page.route("**/api/checkout/intent", async (route) => {
    const req = route.request();
    if (req.method() !== "POST") return route.fallback();
    let body: Record<string, unknown> = {};
    try {
      body = req.postDataJSON() as Record<string, unknown>;
    } catch {
      /* non-JSON body: record empty */
    }
    handle.intentBodies.push(body);
    if (opts.intentResponse) return json(route, opts.intentResponse, opts.intentStatus ?? 200);
    counter += 1;
    const sessionId = `cs_test_fake_${counter}`;
    handle.sessions.push(sessionId);
    const origin = new URL(req.url()).origin || base;
    const locale = typeof body.locale === "string" ? body.locale : "en";
    const success = `${origin}/api/checkout/return?locale=${locale}&session_id={CHECKOUT_SESSION_ID}`;
    const cancel = `${origin}/${locale}/checkout?resume=${encodeURIComponent(opts.resumeQuoteId ?? "fake-quote")}`;
    const url =
      `${FAKE_STRIPE_HOST}/pay/${sessionId}` +
      `?success=${encodeURIComponent(success)}&cancel=${encodeURIComponent(cancel)}`;
    return json(route, {
      ok: true,
      reference: opts.reference ?? DEFAULT_REFERENCE,
      booking_id: "00000000-0000-4000-8000-000000000263",
      url,
      expires_at: new Date(Date.now() + 30 * 60_000).toISOString(),
      amount_rappen: 0,
    });
  });

  await page.route(`${FAKE_STRIPE_HOST}/**`, async (route) => {
    const u = new URL(route.request().url());
    const sessionId = u.pathname.split("/").pop() ?? "cs_test_fake_0";
    const success = u.searchParams.get("success") ?? "/";
    const cancel = u.searchParams.get("cancel") ?? "/";
    // "cancel" outcome: PAY is wired to the cancel URL too, so a test cannot pay by mistake.
    const payTarget = opts.outcome === "paid" ? success : cancel;
    return route.fulfill({
      status: 200,
      contentType: "text/html; charset=utf-8",
      body: payPage(payTarget, cancel, sessionId),
    });
  });

  if (opts.returnRoute) {
    await page.route("**/api/checkout/return**", async (route) => {
      const u = new URL(route.request().url());
      const locale = u.searchParams.get("locale") ?? "en";
      const location =
        opts.outcome === "paid"
          ? `/${locale}/confirmation/${opts.reference ?? DEFAULT_REFERENCE}`
          : `/${locale}/checkout?resume=${encodeURIComponent(opts.resumeQuoteId ?? "fake-quote")}&pay=unpaid`;
      // Playwright does not route the target of a 303 (redirected requests bypass
      // page.route), so hop with a document that replaces location instead.
      return route.fulfill({
        status: 200,
        contentType: "text/html; charset=utf-8",
        body: `<!doctype html><body><script>location.replace(${JSON.stringify(location)})</script></body>`,
      });
    });
  }

  if (opts.status && opts.status.length > 0) {
    const seq = opts.status;
    let i = 0;
    await page.route("**/api/checkout/status/**", async (route) => {
      const step = seq[Math.min(i, seq.length - 1)];
      i += 1;
      if (step === "confirmed") return json(route, { status: "confirmed", paymentStatus: "succeeded" });
      return json(route, { status: "awaiting_payment", paymentStatus: "pending" });
    });
  }

  return handle;
}
