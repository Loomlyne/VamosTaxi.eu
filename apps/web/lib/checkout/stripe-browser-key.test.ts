import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { WEB_ROOT } from "../../tests/support/server-harness";
import { stripeBrowserKey } from "./stripe-browser-key";

describe("stripe browser key", () => {
  it("ignores the baked placeholder and uses the Worker key", () => {
    expect(stripeBrowserKey("pk_test_placeholder", "pk_test_worker")).toBe("pk_test_worker");
    expect(stripeBrowserKey("", "pk_test_worker")).toBe("pk_test_worker");
    expect(stripeBrowserKey(undefined, "pk_test_worker")).toBe("pk_test_worker");
  });

  it("keeps a real baked key", () => {
    expect(stripeBrowserKey("pk_test_baked", "pk_test_worker")).toBe("pk_test_baked");
  });

  it("does not let the placeholder discard the key the Worker already sent", () => {
    const panel = readFileSync(join(WEB_ROOT, "app/[locale]/checkout/PaymentPanel.tsx"), "utf8");
    expect(panel).toContain("stripeBrowserKey");
    expect(panel).not.toContain("NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || publishableKey");
  });
});
