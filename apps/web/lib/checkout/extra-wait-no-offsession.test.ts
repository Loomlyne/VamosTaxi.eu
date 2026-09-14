import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));

function read(name: string): string {
  return readFileSync(join(here, name), "utf8");
}

describe("D-23 grep gate — no off-session extra-wait debit", () => {
  it("checkout charge path has no off_session or waiting PaymentIntent capture", () => {
    for (const name of ["intent.ts", "settle.ts", "stripe.ts", "webhook.ts"] as const) {
      const src = read(name);
      expect(src, name).not.toMatch(/off_session/);
      expect(src, name).not.toMatch(/setup_future_usage/);
      expect(src, name).not.toMatch(/paymentIntents\.create/);
      expect(src, name).not.toMatch(/PaymentIntent\.create/);
      expect(src, name).not.toMatch(/waiting[\s\S]{0,80}paymentIntents/i);
      expect(src, name).not.toMatch(/paymentIntents[\s\S]{0,80}waiting/i);
    }
    const intent = read("intent.ts");
    expect(intent).toMatch(/waiting extra is 0 at pay/);
  });

  it("ops extra wait is display-only and never opens a PaymentIntent", () => {
    const src = readFileSync(join(here, "../ops/bookings-map.ts"), "utf8");
    expect(src).toMatch(/Display only — never a Stripe amount/);
    expect(src).not.toMatch(/off_session/);
    expect(src).not.toMatch(/setup_future_usage/);
    expect(src).not.toMatch(/paymentIntents\.create/);
    expect(src).not.toMatch(/PaymentIntent\.create/);
  });

  it("checkout recap does not paint region or night/weekend/holiday lines", () => {
    const recap = readFileSync(
      join(here, "../../app/[locale]/checkout/CheckoutClient.tsx"),
      "utf8",
    );
    expect(recap).not.toMatch(/region_premium/);
    expect(recap).not.toMatch(/['"]night['"]/);
    expect(recap).not.toMatch(/['"]weekend['"]/);
    expect(recap).not.toMatch(/['"]holiday['"]/);
    const quote = readFileSync(join(here, "../pricing/priceQuote.ts"), "utf8");
    expect(quote).not.toMatch(/buildRegionPremiumLine/);
    expect(quote).not.toMatch(/region_premium/);
  });
});
