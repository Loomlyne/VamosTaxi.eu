import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { WEB_ROOT } from "../../tests/support/server-harness";
import { checkoutTraveler } from "./checkout-traveler";
import { readCheckoutSession, writeCheckoutSession } from "./checkout-session-store";

describe("checkout session for the card box", () => {
  it("uses the saved trip when the payment page's contact state is still empty", () => {
    expect(
      checkoutTraveler(
        { firstName: "", lastName: "", email: "", mobile: "" },
        { firstName: "Ada", lastName: "Lovelace", email: "ada@example.test", mobile: "+41790000000" },
      ),
    ).toEqual({
      firstName: "Ada",
      lastName: "Lovelace",
      email: "ada@example.test",
      mobile: "+41790000000",
    });
  });

  it("does not invent a traveler", () => {
    expect(
      checkoutTraveler({ firstName: "", lastName: "", email: "", mobile: "" }, null),
    ).toBeNull();
  });

  it("restores the secret for this quote only", () => {
    const mem = new Map<string, string>();
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: {
        sessionStorage: {
          getItem: (key: string) => mem.get(key) ?? null,
          setItem: (key: string, value: string) => {
            mem.set(key, value);
          },
        },
      },
    });
    writeCheckoutSession({
      quoteId: "q-1",
      clientSecret: "cs_test_secret",
      clientSecretHex: "6373",
      publishableKey: "pk_test_worker",
      reference: "VT-26-0001",
    });
    expect(readCheckoutSession("q-1")?.clientSecret).toBe("cs_test_secret");
    expect(readCheckoutSession("q-2")).toBeNull();
  });

  it("payment page keeps the secret and asks for it from the saved trip", () => {
    const client = readFileSync(join(WEB_ROOT, "app/[locale]/checkout/CheckoutClient.tsx"), "utf8");
    expect(client).toContain("readCheckoutSession");
    expect(client).toContain("writeCheckoutSession");
    expect(client).toContain("checkoutTraveler");
    const pay = client.slice(client.indexOf('step !== "payment"'));
    expect(pay).toContain("checkoutTraveler");
    expect(pay).not.toMatch(/!contact\.firstName\.trim\(\)[\s\S]{0,180}return;/);
    expect(pay).not.toContain("if (!draft.idempotencyKey) return;");
    expect(client).toContain("if (!idempotencyKey && quoteId)");
    expect(client).not.toContain('tCommon("loading")');
  });
});
