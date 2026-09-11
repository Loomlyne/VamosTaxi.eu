// apps/web/lib/lifecycle/booking-detail-route.test.ts
//
// 09-01 Wave 0: /booking-detail absent from LEFTOVER_EXACT, present as live
// DC_PAGES / DC_MOCK_CANONICAL. Red until 09-08. Token miss is an error string,
// never sample TRIP. No LX1234.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { DC_MOCK_CANONICAL, should404MockLeak } from "../dc-mock-urls";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "../../../..");

function read(rel: string): string {
  return readFileSync(join(repoRoot, rel), "utf8");
}

describe("/booking-detail live DC route", () => {
  it("is absent from LEFTOVER_EXACT", () => {
    const src = read("apps/web/lib/dc-mock-urls.ts");
    const leftoverStart = src.indexOf("LEFTOVER_EXACT");
    expect(leftoverStart).toBeGreaterThan(-1);
    const leftoverBlock = src.slice(leftoverStart, src.indexOf("DOC_DEST"));
    expect(leftoverBlock).toMatch(/LEFTOVER_EXACT/);
    expect(leftoverBlock).not.toContain('"/booking-detail"');
    expect(should404MockLeak("/booking-detail")).toBe(false);
  });

  it("is present as live DC_PAGES / DC_MOCK_CANONICAL", () => {
    const mw = read("apps/web/middleware.ts");
    const pagesStart = mw.indexOf("const DC_PAGES");
    expect(pagesStart).toBeGreaterThan(-1);
    const pagesBlock = mw.slice(pagesStart, mw.indexOf("const DC_FILE_ROUTE"));
    expect(pagesBlock).toMatch(/DC_PAGES/);
    expect(pagesBlock).toContain('"/booking-detail"');
    expect(DC_MOCK_CANONICAL["/app/pages/booking-detail"]).toBe("/booking-detail");
  });

  it("token miss is an error string, never sample TRIP", () => {
    const src = read("apps/web/app/api/manage/booking/route.ts");
    expect(src).toMatch(/not found|gone|could not find/i);
    expect(src).not.toMatch(/\bTRIP\b/);
    expect(src).not.toMatch(/LX1234/);
  });
});
