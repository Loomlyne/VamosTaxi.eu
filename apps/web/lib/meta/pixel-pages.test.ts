import { describe, expect, it } from "vitest";
import { PIXEL_CASES } from "./pixel-pages.cases";
import { PIXEL_ALLOWED_PATHS, pixelPageAllowed } from "./pixel-pages";

describe("pixelPageAllowed (server twin of the Meta page-view allow-list)", () => {
  const rows = PIXEL_CASES.filter((c) => !c.browserOnly);

  it("the shared table is big enough to mean something", () => {
    expect(rows.length).toBeGreaterThanOrEqual(60);
    expect(rows.some((r) => r.allowed)).toBe(true);
    expect(rows.some((r) => !r.allowed)).toBe(true);
  });

  it.each(rows.map((r) => [r.why, r] as const))("%s", (_why, row) => {
    expect(pixelPageAllowed(new URL(row.href)), row.href).toBe(row.allowed);
  });

  it("allowed paths are frozen and carry no trailing slash except home", () => {
    expect(Object.isFrozen(PIXEL_ALLOWED_PATHS)).toBe(true);
    for (const p of PIXEL_ALLOWED_PATHS) if (p !== "/") expect(p.endsWith("/")).toBe(false);
  });

  it("the source holds no Meta host and no pixel id", async () => {
    const { readFileSync } = await import("node:fs");
    const text = readFileSync(new URL("./pixel-pages.ts", import.meta.url), "utf8");
    expect(text.includes("face" + "book")).toBe(false);
    expect(text.includes("15955" + "96972063765")).toBe(false);
  });
});
