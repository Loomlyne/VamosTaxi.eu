// apps/web/tests/integration/ops-dc-pricing.spec.ts
//
// OpsPricing draft→publish is a JSON POST, not the per-row live toggle.
// Database-free. Unauthenticated 401 and dispatcher 403 reuse the staff JSON
// door (same as GET /api/staff/me). This spec locks the mock wiring + dual mount.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test, expect } from "@playwright/test";
import { jsonErr, staffStatus, withAdmin } from "../../lib/ops/staff-json";

const RUN_PROJECT = "component-1440";
const here = dirname(fileURLToPath(import.meta.url));
const webRoot = join(here, "../..");
const repoRoot = join(webRoot, "../..");

test.beforeEach(async ({}, testInfo) => {
  test.skip(
    testInfo.project.name !== RUN_PROJECT,
    "Pricing proofs do not vary by breakpoint — this spec runs once, under component-1440.",
  );
});

test.describe("OpsPricing draft→publish @ops-dc-pricing", () => {
  test("unauthenticated envelope is JSON 401 { ok: false, code: no-session }", async () => {
    expect(staffStatus("no-session")).toEqual({ code: "no-session", status: 401 });
    const response = jsonErr("no-session", 401);
    expect(response.status).toBe(401);
    expect(response.headers.get("content-type")).toMatch(/application\/json/);
    expect(await response.json()).toEqual({ ok: false, code: "no-session" });
  });

  test("publish without admin is JSON 403 { ok: false, code: not-admin }", async () => {
    expect(staffStatus("not-admin")).toEqual({ code: "not-admin", status: 403 });
    const response = jsonErr("not-admin", 403);
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ ok: false, code: "not-admin" });
    expect(withAdmin).toEqual(expect.any(Function));
  });

  test("app/api/staff/rate-versions and rate-book re-export the (ops) handlers", () => {
    const versions = readFileSync(join(webRoot, "app/api/staff/rate-versions/route.ts"), "utf8");
    expect(versions).toMatch(/export\s*\{\s*GET,\s*POST\s*\}/);
    expect(versions).toMatch(/\[locale\]\/\(ops\)\/api\/staff\/rate-versions\/route/);

    const publish = readFileSync(
      join(webRoot, "app/api/staff/rate-versions/[id]/publish/route.ts"),
      "utf8",
    );
    expect(publish).toMatch(/export\s*\{\s*POST\s*\}/);
    expect(publish).toMatch(/\[locale\]\/\(ops\)\/api\/staff\/rate-versions\/\[id\]\/publish\/route/);

    const book = readFileSync(join(webRoot, "app/api/staff/rate-book/route.ts"), "utf8");
    expect(book).toMatch(/export\s*\{\s*GET,\s*PUT\s*\}/);
    expect(book).toMatch(/\[locale\]\/\(ops\)\/api\/staff\/rate-book\/route/);
  });

  test("OpsPricing POSTs publish and keeps row saves on PUT /api/staff/rate-book", () => {
    const html = readFileSync(join(repoRoot, "app/ops/OpsPricing.dc.html"), "utf8");
    expect(html).toMatch(/\/api\/staff\/rate-versions\/['"]\s*\+\s*id\s*\+\s*['"]\/publish/);
    expect(html).toMatch(/\/api\/staff\/rate-book/);
    expect(html).toMatch(/VamosOps\.routes/);
    expect(html).toMatch(/VamosOps\.rates/);
    expect(html).toMatch(/VamosOps\.surcharges/);
    expect(html).toMatch(/data-pricing-publish/);
    expect(html).not.toMatch(/--vt-yellow-50/);
    expect(html).not.toMatch(/err\.message/);
  });

  test("Publish + completeness chrome exists in en/de/fr/ar", () => {
    const html = readFileSync(join(repoRoot, "app/ops/OpsPricing.dc.html"), "utf8");
    expect(html).toMatch(/en:[\s\S]*publish:'Publish'/);
    expect(html).toMatch(/de:[\s\S]*publish:'Veröffentlichen'/);
    expect(html).toMatch(/fr:[\s\S]*publish:'Publier'/);
    expect(html).toMatch(/ar:[\s\S]*publish:'نشر'/);
    expect(html).toMatch(/en:[\s\S]*completenessTitle:'Draft completeness'/);
    expect(html).toMatch(/de:[\s\S]*completenessTitle:'Entwurfsvollständigkeit'/);
    expect(html).toMatch(/fr:[\s\S]*completenessTitle:'Complétude du brouillon'/);
    expect(html).toMatch(/ar:[\s\S]*completenessTitle:'اكتمال المسودة'/);
  });
});
