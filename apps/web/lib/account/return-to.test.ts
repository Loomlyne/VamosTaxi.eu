import { describe, expect, it } from "vitest";
import { safeReturnTo } from "./return-to";

describe("safeReturnTo", () => {
  it("keeps a checkout path with its query", () => {
    const u = "/checkout?from=zrh&class=business&extras=roof-box";
    expect(safeReturnTo(u)).toBe(u);
    expect(safeReturnTo("/de/checkout?from=zrh")).toBe("/de/checkout?from=zrh");
    expect(safeReturnTo("/checkout")).toBe("/checkout");
  });
  it("rejects everything else", () => {
    for (const bad of ["//evil.com", "https://x", "/account", "/checkout/../x", "javascript:alert(1)", "/checkout\\evil", "/checkout/trip", "", null, undefined, "/xx/checkout"]) {
      expect(safeReturnTo(bad as string)).toBeNull();
    }
  });
  it("rejects over 2000 chars", () => {
    expect(safeReturnTo("/checkout?a=" + "x".repeat(2000))).toBeNull();
  });
});
