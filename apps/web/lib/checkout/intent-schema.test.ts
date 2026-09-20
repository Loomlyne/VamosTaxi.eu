import { describe, expect, it } from "vitest";
import { checkoutIntentSchema, checkoutPayLinkSchema } from "./intent-schema";
import { CHECKOUT_REFUSALS, refuse, type CheckoutRefusalCode } from "./errors";

const valid = {
  quote_id: "00000000-0000-4000-8000-000000000001",
  lock: "v1.payload.mac",
  vehicle_class: "economy",
  contact: { name: "Ada", email: "ada@example.test", phone: "+41790000000" },
  locale: "en",
  display_currency: "CHF",
  idempotency_key: "idem-1",
} as const;

describe("checkoutIntentSchema", () => {
  it("accepts a minimal valid body", () => {
    const parsed = checkoutIntentSchema.safeParse(valid);
    expect(parsed.success).toBe(true);
  });

  it("rejects a missing idempotency_key", () => {
    const { idempotency_key: _drop, ...rest } = valid;
    const parsed = checkoutIntentSchema.safeParse(rest);
    expect(parsed.success).toBe(false);
  });

  it.each(["total_rappen", "distance_m", "rate_version_id", "lines", "expires_at"] as const)(
    "rejects server-derived field %s",
    (field) => {
      const parsed = checkoutIntentSchema.safeParse({ ...valid, [field]: 1 });
      expect(parsed.success).toBe(false);
    },
  );

  it("rejects an unknown locale", () => {
    const parsed = checkoutIntentSchema.safeParse({ ...valid, locale: "it" });
    expect(parsed.success).toBe(false);
  });

  it("rejects an unknown display_currency", () => {
    const parsed = checkoutIntentSchema.safeParse({ ...valid, display_currency: "GBP" });
    expect(parsed.success).toBe(false);
  });

  it("accepts kebab vehicle slugs and rejects display names", () => {
    const empty = checkoutIntentSchema.safeParse({ ...valid, coupon: "" });
    expect(empty.success).toBe(true);
    if (empty.success) expect(empty.data.coupon).toBeNull();
    const named = checkoutIntentSchema.safeParse({ ...valid, vehicle_class: "Economy Taxi" });
    expect(named.success).toBe(false);
    const liveSlug = checkoutIntentSchema.safeParse({ ...valid, vehicle_class: "suv" });
    expect(liveSlug.success).toBe(true);
    if (liveSlug.success) expect(liveSlug.data.vehicle_class).toBe("suv");
  });

  it("accepts a company pay-link without name address VAT", () => {
    const parsed = checkoutPayLinkSchema.safeParse({
      ...valid,
      billing_kind: "company",
      payer_email: "ada@example.test",
    });
    expect(parsed.success).toBe(true);
  });

  it("accepts a company pay-link with name address VAT", () => {
    const parsed = checkoutPayLinkSchema.safeParse({
      ...valid,
      billing_kind: "company",
      company_name: "Acme AG",
      company_address: "Bahnhofstrasse 1",
      company_vat: "CHE-123.456.789",
      payer_email: "ada@example.test",
    });
    expect(parsed.success).toBe(true);
  });
});

describe("refuse", () => {
  it("maps quote_not_found to 404 and every other refusal to 409 or 400", async () => {
    const codes = Object.keys(CHECKOUT_REFUSALS) as CheckoutRefusalCode[];
    for (const code of codes) {
      const res = refuse(code);
      const expected = CHECKOUT_REFUSALS[code].status;
      expect(res.status).toBe(expected);
      expect(res.headers.get("cache-control")).toMatch(/no-store/i);
      if (code === "quote_not_found") {
        expect(res.status).toBe(404);
      } else if (code === "invalid_request" || code === "turnstile_failed") {
        expect(res.status).toBe(400);
      } else {
        expect(res.status).toBe(409);
      }
      const body = (await res.json()) as { code: string; action?: string };
      expect(body.code).toBe(code);
    }
  });
});
