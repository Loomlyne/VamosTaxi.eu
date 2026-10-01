// apps/web/tests/integration/ops-dc-reviews.spec.ts
//
// Unauthenticated GET /api/staff/reviews is JSON 401. Empty list is the
// shipping state (D-35). Database-free. Dual mount + mock contracts.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test, expect } from "../support/test";
import { jsonErr, jsonOk, staffStatus } from "../../lib/ops/staff-json";

const RUN_PROJECT = "component-1440";
const here = __dirname;
const webRoot = join(here, "../..");
const repoRoot = join(webRoot, "../..");

test.beforeEach(async ({}, testInfo) => {
  test.skip(
    testInfo.project.name !== RUN_PROJECT,
    "Reviews proofs do not vary by breakpoint — this spec runs once, under component-1440.",
  );
});

test.describe("GET /api/staff/reviews @ops-dc-reviews", () => {
  test("unauthenticated envelope is JSON 401 { ok: false, code: no-session }", async () => {
    expect(staffStatus("no-session")).toEqual({ code: "no-session", status: 401 });
    const response = jsonErr("no-session", 401);
    expect(response.status).toBe(401);
    expect(response.headers.get("content-type")).toMatch(/application\/json/);
    expect(await response.json()).toEqual({ ok: false, code: "no-session" });
  });

  test("empty list envelope is { ok: true, data: [] }", async () => {
    const response = jsonOk([]);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, data: [] });
  });

  test("app/api/staff/reviews re-exports the (ops) GET and POST", () => {
    const publicRoute = readFileSync(join(webRoot, "app/api/staff/reviews/route.ts"), "utf8");
    expect(publicRoute).toMatch(/export\s*\{\s*GET\s*,\s*POST\s*\}/);
    expect(publicRoute).toMatch(/\[locale\]\/\(ops\)\/api\/staff\/reviews\/route/);
  });

  test("app/api/staff/reviews/[id] re-exports PATCH and DELETE", () => {
    const publicRoute = readFileSync(
      join(webRoot, "app/api/staff/reviews/[id]/route.ts"),
      "utf8",
    );
    expect(publicRoute).toMatch(/export\s*\{\s*PATCH\s*,\s*DELETE\s*\}/);
    expect(publicRoute).toMatch(/\[locale\]\/\(ops\)\/api\/staff\/reviews\/\[id\]\/route/);
  });

  test("(ops) PATCH calls moveReview and setReviewPublished", () => {
    const route = readFileSync(
      join(webRoot, "app/[locale]/(ops)/api/staff/reviews/[id]/route.ts"),
      "utf8",
    );
    expect(route).toMatch(/moveReview/);
    expect(route).toMatch(/setReviewPublished/);
    expect(route).not.toMatch(/dnd-kit|react-beautiful-dnd|sortablejs/i);
  });

  test("vamos-reviews.js has no localStorage and no fake quote SEED", () => {
    const store = readFileSync(join(repoRoot, "app/vamos-reviews.js"), "utf8");
    expect(store).not.toMatch(/localStorage/);
    expect(store).not.toMatch(/\bSEED\b/);
    expect(store).toMatch(/\/api\/staff\/reviews/);
    expect(store).toMatch(/all:\s*function\s*\(\)\s*\{\s*hydrate\(\);\s*return list\.slice\(\);/);
  });

  test("OpsReviews.dc.html talks to /api/staff/reviews and has no photo upload or drag", () => {
    const html = readFileSync(join(repoRoot, "app/ops/OpsReviews.dc.html"), "utf8");
    expect(html).not.toMatch(/type="file"/);
    expect(html).not.toMatch(/\/api\/photos\/upload/);
    expect(html).not.toMatch(/grip-vertical/);
    expect(html).not.toMatch(/draggable="true"/);
    expect(html).toMatch(/chevron-up/);
    expect(html).not.toMatch(/readAsDataURL/);
    expect(html).toMatch(/tEmptyTitle/);
    expect(html).toMatch(/isEmpty/);
    expect(html).not.toMatch(/Saved in this browser/);
  });
});
