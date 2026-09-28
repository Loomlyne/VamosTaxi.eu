import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { WEB_ROOT } from "../../tests/support/server-harness";
import { pickedClassName, vehicleLabel } from "./picked-class";

// D-14: the customer sees Economy / Business / Van luxury, never a raw class slug (T-26.1-89).

const t = (key: string) => `t:${key}`;
const client = readFileSync(join(WEB_ROOT, "app/[locale]/checkout/CheckoutClient.tsx"), "utf8");

describe("pickedClassName (D-14)", () => {
  it("uses the dashboard name from the trip's class offers", () => {
    const trip = {
      vehicle: "mercedes-benz-v-class",
      classOffers: [
        { slug: "saden", name: "Economy" },
        { slug: "mercedes-benz-v-class", name: "Business" },
        { slug: "van-luxury", name: "Van luxury" },
      ],
    };
    expect(pickedClassName("mercedes-benz-v-class", trip, t)).toBe("Business");
    expect(pickedClassName("saden", trip, t)).toBe("Economy");
    expect(pickedClassName("van-luxury", trip, t)).toBe("Van luxury");
  });

  it("falls back to the stored vehicle name for the picked slug", () => {
    expect(pickedClassName("saden", { vehicle: "saden", vehicleName: "Economy" }, t)).toBe("Economy");
  });

  it("never shows a live slug when the trip carries no names", () => {
    expect(pickedClassName("saden", null, t)).toBe("t:classEconomy");
    expect(pickedClassName("mercedes-benz-v-class", {}, t)).toBe("t:classBusiness");
    expect(pickedClassName("van-luxury", {}, t)).toBe("t:classVanLuxury");
  });
});

describe("vehicleLabel (D-14)", () => {
  it("maps live and legacy slugs onto the three classes", () => {
    expect(vehicleLabel("saden", t)).toBe("t:classEconomy");
    expect(vehicleLabel("economy", t)).toBe("t:classEconomy");
    expect(vehicleLabel("mercedes-benz-v-class", t)).toBe("t:classBusiness");
    expect(vehicleLabel("business", t)).toBe("t:classBusiness");
    expect(vehicleLabel("van-luxury", t)).toBe("t:classVanLuxury");
    expect(vehicleLabel("van", t)).toBe("t:classVanLuxury");
  });

  it("no longer labels anything First", () => {
    expect(vehicleLabel("first", t)).not.toBe("t:classFirst");
  });
});

describe("checkout source pin (D-14)", () => {
  it("imports the label helpers instead of keeping a local slug table", () => {
    expect(client).toMatch(/from "@\/lib\/checkout\/picked-class"/);
    expect(client).not.toMatch(/function vehicleLabel\(/);
    expect(client).not.toMatch(/classFirst/);
  });

  it("the payment panel and the trip rail both render pickedClassName", () => {
    expect(client).toContain("pickedClassName(paySlug || vehicle, tripForPay, t)");
    expect(client).toContain("pickedClassName(vehicle, tripForPay, t)");
    expect(client).not.toMatch(/vt-checkout__picked">\{vehicleLabel\(/);
  });

  it("every language has Van luxury and none has First", () => {
    for (const lang of ["en", "de", "fr", "ar"]) {
      const raw = readFileSync(join(WEB_ROOT, `i18n/messages/${lang}.json`), "utf8");
      expect(raw, lang).toMatch(/"classVanLuxury":/);
      expect(raw, lang).not.toMatch(/"classFirst":/);
    }
  });
});
