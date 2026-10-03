// apps/web/lib/checkout/dashboard-new-trip-origin.test.ts
//
// Quick 261003 regression. Live 2026-10-03: dashboard New trip "Save trip" got 403 csrf
// because /api/checkout/price and /api/checkout/intent only accepted public-site Origins,
// and the console posts from https://dashboard.vamostaxi.site. Local runs passed because
// `localhost` sat in both lists. This test drives every public POST the New trip screen
// makes, as the screen makes it (dashboard host, dashboard Origin), through the real route
// handlers. Each body is broken JSON, so no handler gets past parsing: nothing is priced,
// written or charged here; the test only reads which gate answered.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it, vi } from "vitest";

let staff = false;
let staffAsked = 0;

vi.mock("@opennextjs/cloudflare", () => ({
  getCloudflareContext: () => ({ env: { QUOTE_LOCK_SECRET: "test-lock-secret" } }),
}));
vi.mock("@/lib/ops/staff-origin", () => ({
  requestHasStaffSession: async () => {
    staffAsked += 1;
    return staff;
  },
}));

import { POST as quotePost } from "../../app/api/quote/route";
import { POST as repricePost } from "../../app/api/quote/reprice/route";
import { POST as pricePost } from "../../app/api/checkout/price/route";
import { POST as intentPost } from "../../app/api/checkout/intent/route";

const here = dirname(fileURLToPath(import.meta.url));
const SCREEN = readFileSync(join(here, "../../../../app/ops/OpsNewTrip.dc.html"), "utf8");

const ROUTES: Record<string, (r: Request) => Promise<Response>> = {
  "/api/quote": quotePost,
  "/api/quote/reprice": repricePost,
  "/api/checkout/price": pricePost,
  "/api/checkout/intent": intentPost,
};

/** The public (non-/api/staff) paths the New trip screen POSTs to, read from the screen itself. */
function screenPublicPosts(): string[] {
  const paths = [...SCREEN.matchAll(/postJson\(\s*'(\/api\/[^'?]+)'/g)].map((m) => m[1] as string);
  return [...new Set(paths)].filter((p) => !p.startsWith("/api/staff/")).sort();
}

function post(path: string, origin: string | null, host = "https://dashboard.vamostaxi.site"): Request {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (origin) headers.Origin = origin;
  return new Request(`${host}${path}`, { method: "POST", headers, body: "{" });
}

async function csrfRefused(res: Response): Promise<boolean> {
  if (res.status !== 403) return false;
  const body = (await res.clone().json().catch(() => null)) as { code?: string; error?: string } | null;
  return body?.code === "csrf" || body?.error === "csrf";
}

beforeEach(() => {
  staff = false;
  staffAsked = 0;
});

describe("dashboard New trip → public routes (quick 261003)", () => {
  it("the screen's public POSTs are exactly the four routes covered here", () => {
    expect(screenPublicPosts()).toEqual(Object.keys(ROUTES).sort());
  });

  it("signed-in staff on the dashboard: no Save-path request is refused as csrf", async () => {
    staff = true;
    for (const path of screenPublicPosts()) {
      const res = await ROUTES[path]!(post(path, "https://dashboard.vamostaxi.site"));
      expect(await csrfRefused(res), `${path} → ${res.status}`).toBe(false);
      expect(res.status, path).toBe(400);
    }
  });

  it("dashboard Origin without a staff session: price and intent stay 403 csrf", async () => {
    staff = false;
    for (const path of ["/api/checkout/price", "/api/checkout/intent"]) {
      const res = await ROUTES[path]!(post(path, "https://dashboard.vamostaxi.site"));
      expect(await csrfRefused(res), path).toBe(true);
    }
    expect(staffAsked).toBe(2);
  });

  it("dashboard Origin sent to the public host: price and intent 403, staff never asked", async () => {
    staff = true;
    for (const path of ["/api/checkout/price", "/api/checkout/intent"]) {
      const res = await ROUTES[path]!(post(path, "https://dashboard.vamostaxi.site", "https://vamostaxi.site"));
      expect(await csrfRefused(res), path).toBe(true);
    }
    expect(staffAsked).toBe(0);
  });

  it("foreign or missing Origin: every route 403 csrf, staff never asked", async () => {
    staff = true;
    for (const path of Object.keys(ROUTES)) {
      for (const origin of ["https://evil.example", null]) {
        const res = await ROUTES[path]!(post(path, origin));
        expect(await csrfRefused(res), `${path} ${origin}`).toBe(true);
      }
    }
    expect(staffAsked).toBe(0);
  });

  it("public checkout is unchanged: public Origin passes price and intent without a staff lookup", async () => {
    for (const path of ["/api/checkout/price", "/api/checkout/intent"]) {
      const res = await ROUTES[path]!(post(path, "https://vamostaxi.site", "https://vamostaxi.site"));
      expect(await csrfRefused(res), path).toBe(false);
      expect(res.status, path).toBe(400);
    }
    expect(staffAsked).toBe(0);
  });
});
