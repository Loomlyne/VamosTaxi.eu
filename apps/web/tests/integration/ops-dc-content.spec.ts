// apps/web/tests/integration/ops-dc-content.spec.ts
//
// Pages/Legal rail still exists; OpsContent is Coming soon (no CMS editor).
// Staff content API envelopes stay JSON. Database-free — no Hyperdrive.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test, expect } from "../support/test";
import { jsonErr, staffStatus } from "../../lib/ops/staff-json";

const RUN_PROJECT = "component-1440";
const webRoot = process.cwd();
const repoRoot = join(webRoot, "../..");

test.beforeEach(async ({}, testInfo) => {
  test.skip(
    testInfo.project.name !== RUN_PROJECT,
    "Content proofs do not vary by breakpoint — this spec runs once, under component-1440.",
  );
});

test.describe("GET /api/staff/content @ops-dc-content", () => {
  test("unauthenticated envelope is JSON 401 { ok: false, code: no-session }", async () => {
    expect(staffStatus("no-session")).toEqual({ code: "no-session", status: 401 });
    const response = jsonErr("no-session", 401);
    expect(response.status).toBe(401);
    expect(response.headers.get("content-type")).toMatch(/application\/json/);
    expect(await response.json()).toEqual({ ok: false, code: "no-session" });
  });

  test("app/api/staff/content re-exports the (ops) GET", () => {
    const publicRoute = readFileSync(join(webRoot, "app/api/staff/content/route.ts"), "utf8");
    expect(publicRoute).toMatch(/export\s*\{\s*GET\s*\}/);
    expect(publicRoute).toMatch(/\[locale\]\/\(ops\)\/api\/staff\/content\/route/);
  });

  test("app/api/staff/content/[key] re-exports the (ops) PATCH", () => {
    const publicRoute = readFileSync(
      join(webRoot, "app/api/staff/content/[key]/route.ts"),
      "utf8",
    );
    expect(publicRoute).toMatch(/export\s*\{\s*PATCH\s*\}/);
    expect(publicRoute).toMatch(/\[locale\]\/\(ops\)\/api\/staff\/content\/\[key\]\/route/);
  });

  test("flag PATCH type keeps three independent fields", () => {
    const flagsRoute = readFileSync(
      join(webRoot, "app/[locale]/(ops)/api/staff/content/[key]/flags/route.ts"),
      "utf8",
    );
    // 26.0: the patch type moved to ContentStringFlagsPatch; the route merges each field on its own.
    expect(flagsRoute).toMatch(/ContentStringFlagsPatch/);
    expect(flagsRoute).toMatch(/patch\.pendingValue \?\? existing\.pendingValue/);
    expect(flagsRoute).toMatch(/patch\.nonTranslatable \?\? existing\.nonTranslatable/);
    expect(flagsRoute).toMatch(/patch\.noParamReason !== undefined/);
    expect(flagsRoute).not.toMatch(/translatable\?: boolean/);
    expect(flagsRoute).toMatch(/loadContentRow/);
    expect(flagsRoute).toMatch(/setContentStringFlags/);
  });

  test("GET list route reaches loadLegalCoverage", () => {
    const listRoute = readFileSync(
      join(webRoot, "app/[locale]/(ops)/api/staff/content/route.ts"),
      "utf8",
    );
    expect(listRoute).toMatch(/loadLegalCoverage/);
    expect(listRoute).toMatch(/loadNamespaces/);
    expect(listRoute).toMatch(/loadContentStrings/);
    expect(listRoute).toMatch(/withStaff/);
    expect(listRoute).not.toMatch(/publicSql/);
  });

  test("OpsContent Pages/Legal is Coming soon, not a CMS editor", () => {
    const mock = readFileSync(join(repoRoot, "app/ops/OpsContent.dc.html"), "utf8");
    expect(mock).toMatch(/Coming soon/);
    expect(mock).toMatch(/Bald verfügbar/);
    expect(mock).toMatch(/Bientôt disponible/);
    expect(mock).toMatch(/قريبًا/);
    expect(mock).toMatch(/en: \{/);
    expect(mock).toMatch(/de: \{/);
    expect(mock).toMatch(/fr: \{/);
    expect(mock).toMatch(/ar: \{/);
    expect(mock).not.toMatch(/\/api\/staff\/content/);
    expect(mock).not.toMatch(/pending_value/);
    expect(mock).not.toMatch(/non_translatable/);
    expect(mock).not.toMatch(/no_param_reason/);
    expect(mock).not.toMatch(/tFlagPending/);
    expect(mock).not.toMatch(/coverage/);
    expect(mock).not.toMatch(/become-a-partner/);
    expect(mock).not.toMatch(/home\.dc\.html/);
  });

  test("public i18n dict has no Become a partner CTA", () => {
    const dict = readFileSync(join(repoRoot, "app/vamos-i18n-dict.js"), "utf8");
    expect(dict).not.toMatch(/Become a partner/);
    expect(dict).not.toMatch(/become-a-partner/);
  });

  test("loadRawMessages is still the JSON default (06-11)", () => {
    const loader = readFileSync(join(webRoot, "i18n/request.ts"), "utf8");
    expect(loader).toMatch(/async function loadRawMessages/);
    expect(loader).not.toMatch(/loadRawMessages[\s\S]*publicSql/);
  });
});
