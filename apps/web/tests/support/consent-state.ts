// apps/web/tests/support/consent-state.ts
//
// Phase 27 (META-04). The consent banner asks the server whether this browser already chose
// (GET /api/consent/state). Specs that are not about the banner answer "chosen" so the card
// never appears; the banner spec answers "not chosen" and follows the POSTs it sees.

import type { Page, Route } from "@playwright/test";

const POLICY = "test";

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({
    status,
    contentType: "application/json",
    headers: { "cache-control": "private, no-store" },
    body: JSON.stringify(body),
  });
}

/** Every state read answers "already chosen: necessary only". The banner stays out of the way. */
export async function stubConsentChosen(page: Page): Promise<void> {
  await page.route("**/api/consent/state", (route) =>
    json(route, {
      ok: true,
      chosen: true,
      policyVersion: POLICY,
      choice: {
        method: "reject_all",
        functional: false,
        analytics: false,
        marketing: false,
        recordedAt: "2026-01-01T00:00:00.000Z",
      },
    }),
  );
}

/** Every state read answers "nothing chosen yet". The banner card shows. */
export async function stubConsentUnchosen(page: Page): Promise<void> {
  await page.route("**/api/consent/state", (route) =>
    json(route, { ok: true, chosen: false, policyVersion: POLICY }),
  );
}

export type ConsentPost = Record<string, unknown>;

/**
 * Starts unchosen. Records every POST body sent to /api/consent, answers { ok: true }, and from
 * then on answers the state read with chosen:true and the posted categories.
 */
export async function statefulConsentStub(page: Page): Promise<{ posts: ConsentPost[] }> {
  const posts: ConsentPost[] = [];
  let last: ConsentPost | null = null;
  await page.route("**/api/consent/state", (route) => {
    if (!last) return json(route, { ok: true, chosen: false, policyVersion: POLICY });
    return json(route, {
      ok: true,
      chosen: true,
      policyVersion: POLICY,
      choice: {
        method: String(last.method ?? "reject_all"),
        functional: last.functional === true,
        analytics: last.analytics === true,
        marketing: last.marketing === true,
        recordedAt: "2026-01-01T00:00:00.000Z",
      },
    });
  });
  await page.route("**/api/consent", (route) => {
    if (route.request().method() !== "POST") return route.fallback();
    const body = JSON.parse(route.request().postData() ?? "{}") as ConsentPost;
    posts.push(body);
    last = body;
    return json(route, { ok: true });
  });
  return { posts };
}
