import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { WEB_ROOT } from "../../tests/support/server-harness";

describe("checkout details guest (D-39)", () => {
  it("has no password field on checkout", () => {
    const src = readFileSync(join(WEB_ROOT, "app/[locale]/checkout/CheckoutClient.tsx"), "utf8");
    expect(src).not.toMatch(/type=["']password["']/);
    expect(src).toContain("guestNoPassword");
  });
});
