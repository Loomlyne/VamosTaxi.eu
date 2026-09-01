// apps/web/tests/integration/ops-dc-content-loader.spec.ts
//
// I18N-07: DC Content PATCH writes content_strings; loadMessagesFromDb can
// read that row when CONTENT_SOURCE=db. Database-free — no Hyperdrive.
// JSON default still skips the query. Tagged @i18n. component-1440 only.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test, expect } from "@playwright/test";
import { CONTENT_SOURCE, loadMessagesFromDb, unflattenKeys } from "../../lib/content/messages";
import en from "../../i18n/messages/en.json";

const RUN_PROJECT = "component-1440";
const webRoot = process.cwd();

test.beforeEach(async ({}, testInfo) => {
  test.skip(
    testInfo.project.name !== RUN_PROJECT,
    "Loader proofs do not vary by breakpoint — this spec runs once, under component-1440.",
  );
});

test.describe("DC content editor → public loader @i18n", () => {
  test("CONTENT_SOURCE exported default is json", () => {
    expect(CONTENT_SOURCE).toBe("json");
  });

  test("JSON default loadMessagesFromDb returns the dictionary without a db round-trip", async () => {
    delete process.env.CONTENT_SOURCE;
    const messages = await loadMessagesFromDb("en");
    expect(messages).toEqual(en);
  });

  test("a PATCH-shaped content_strings row projects into nested messages", () => {
    const afterPatch = { "a.b": "Edited after PATCH" };
    expect(unflattenKeys(afterPatch)).toEqual({ a: { b: "Edited after PATCH" } });
  });

  test("loadRawMessages is a one-line delegate to loadMessagesFromDb", () => {
    const request = readFileSync(join(webRoot, "i18n/request.ts"), "utf8");
    expect(request).toMatch(
      /import \{ loadMessagesFromDb as loadRawFromContent \} from "\.\.\/lib\/content\/messages"/,
    );
    expect(request).toMatch(
      /async function loadRawMessages\(locale: Locale\): Promise<Messages> \{\s*return loadRawFromContent\(locale\);\s*\}/,
    );
    expect(request).not.toMatch(/publicSql/);
    expect(request).not.toMatch(/CONTENT_SOURCE/);
  });

  test("staff PATCH writes via asStaff, not publicSql", () => {
    const patchRoute = readFileSync(
      join(webRoot, "app/[locale]/(ops)/api/staff/content/[key]/route.ts"),
      "utf8",
    );
    expect(patchRoute).toMatch(/PATCH \/api\/staff\/content\/:key/);
    expect(patchRoute).toMatch(/updateContentString/);
    expect(patchRoute).toMatch(/asStaff/);
    expect(patchRoute).not.toMatch(/publicSql/);
  });

  test("public loader reads via publicSql on HYPERDRIVE when source is db", () => {
    const loader = readFileSync(join(webRoot, "lib/content/messages.ts"), "utf8");
    expect(loader).toMatch(/export const CONTENT_SOURCE: ContentSource = "json"/);
    expect(loader).toMatch(/publicSql\(env\)/);
    expect(loader).toMatch(/from public\.content_strings/);
    expect(loader).not.toMatch(/asStaff/);
  });

  test("runbook names DC #pages / #legal and CONTENT_SOURCE=json rollback", () => {
    const runbook = readFileSync(join(webRoot, "../../docs/build/CONTENT-STRINGS-RUNBOOK.md"), "utf8");
    expect(runbook).toMatch(/#pages/);
    expect(runbook).toMatch(/#legal/);
    expect(runbook).toMatch(/OpsContent/);
    expect(runbook).toMatch(/CONTENT_SOURCE=json/);
    expect(runbook).not.toMatch(/open Next \/ops\/content/);
    expect(runbook).toMatch(/There is no Next `\/ops\/content` page/);
  });
});
