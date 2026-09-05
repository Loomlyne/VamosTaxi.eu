import { describe, expect, it } from "vitest";
import { checkoutIntentSchema } from "./intent-schema";
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
});

describe("refuse", () => {
  it("maps quote_not_found to 404 and every other refusal to 409 or 400", async () => {
    const codes = Object.keys(CHECKOUT_REFUSALS) as CheckoutRefusalCode[];
    for (const code of codes) {
      const res = refuse(code);
      const expected = CHECKOUT_REFUSALS[code].status;
      expect(res.status).toBe(expected);
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
