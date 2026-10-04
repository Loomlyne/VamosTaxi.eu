import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { clientMessages } from "./client-messages";

const web = join(dirname(fileURLToPath(import.meta.url)), "../..");
const en = JSON.parse(readFileSync(join(web, "i18n/messages/en.json"), "utf8"));

describe("client messages (reviewer F7)", () => {
  it("drops the dashboard and checker namespaces except the ops keys a public page reads", () => {
    const m = clientMessages(en);
    expect(Object.keys(m.ops as object)).toEqual(["waiting-time"]);
    expect(m.$meta).toBeUndefined();
    expect(m.checkout).toBe(en.checkout);
    expect(m.cookies).toBe(en.cookies);
    expect((m.common as Record<string, unknown>)["privacy-policy"]).toBe(en.common["privacy-policy"]);
    const text = JSON.stringify(m);
    for (const s of ["Stripe webhook", "Refunds to issue", "Review scaffold"]) {
      // The phrase exists in the full set (so this test means something) but not in what the browser gets.
      expect(JSON.stringify(en).toLowerCase()).toContain(s.toLowerCase());
      expect(text.toLowerCase()).not.toContain(s.toLowerCase());
    }
  });

  it("every public client component's namespace survives", () => {
    const m = clientMessages(en);
    for (const ns of ["about", "account", "auth", "booking", "checkout", "common", "contact", "contactButton", "cookies", "errors", "faq", "footer", "header", "home", "legal", "partner", "price", "quote", "reviews", "services", "statusBadge"]) {
      expect(m[ns], ns).toBeDefined();
    }
  });

  it("the locale layout hands the provider the reduced set", () => {
    const layout = readFileSync(join(web, "app/[locale]/layout.tsx"), "utf8");
    expect(layout).toContain("messages={clientMessages(messages)}");
  });
});
