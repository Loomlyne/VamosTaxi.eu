import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { WEB_ROOT } from "../../tests/support/server-harness";

describe("checkout details guest (D-39)", () => {
  it("keeps guest without a password and puts password on create-an-account", () => {
    const src = readFileSync(join(WEB_ROOT, "app/[locale]/checkout/CheckoutClient.tsx"), "utf8");
    expect(src).toContain("guestNoPassword");
    expect(src).toMatch(/type=["']password["']/);
    expect(src).toContain('autoComplete="new-password"');
  });
});
