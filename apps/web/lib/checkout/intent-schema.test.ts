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

const validWeb = {
  ...valid,
  trip: {
    from: "Zurich Airport",
    fid: "mbx-from",
    to: "Bahnhofstrasse 1, Zurich",
    tid: "mbx-to",
    gs: "11111111-1111-4111-8111-111111111111",
    when: "2026-12-01T09:30",
    pax: 2,
    bags: 1,
    flight: "LX318",
  },
} as const;

describe("checkoutIntentSchema", () => {
  it("accepts a minimal valid body", () => {
    const parsed = checkoutIntentSchema.safeParse(validWeb);
    expect(parsed.success).toBe(true);
  });

  it("rejects a missing idempotency_key", () => {
    const { idempotency_key: _drop, ...rest } = validWeb;
    const parsed = checkoutIntentSchema.safeParse(rest);
    expect(parsed.success).toBe(false);
  });

  it.each(["total_rappen", "distance_m", "rate_version_id", "lines", "expires_at"] as const)(
    "rejects server-derived field %s",
    (field) => {
      const parsed = checkoutIntentSchema.safeParse({ ...validWeb, [field]: 1 });
      expect(parsed.success).toBe(false);
    },
  );

  it("rejects an unknown locale", () => {
    const parsed = checkoutIntentSchema.safeParse({ ...validWeb, locale: "it" });
    expect(parsed.success).toBe(false);
  });

  it("rejects an unknown display_currency", () => {
    const parsed = checkoutIntentSchema.safeParse({ ...validWeb, display_currency: "GBP" });
    expect(parsed.success).toBe(false);
  });

  it("accepts kebab vehicle slugs and rejects display names", () => {
    const empty = checkoutIntentSchema.safeParse({ ...validWeb, coupon: "" });
    expect(empty.success).toBe(true);
    if (empty.success) expect(empty.data.coupon).toBeNull();
    const named = checkoutIntentSchema.safeParse({ ...validWeb, vehicle_class: "Economy Taxi" });
    expect(named.success).toBe(false);
    const liveSlug = checkoutIntentSchema.safeParse({ ...validWeb, vehicle_class: "suv" });
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

describe("checkoutIntentSchema — flight_no (D-08b, 26.1-30)", () => {
  it("accepts an optional flight_no and normalises blank to null", () => {
    const withFlight = checkoutIntentSchema.safeParse({ ...validWeb, flight_no: " LX1234 " });
    expect(withFlight.success).toBe(true);
    if (withFlight.success) expect(withFlight.data.flight_no).toBe("LX1234");
    const blank = checkoutIntentSchema.safeParse({ ...validWeb, flight_no: "  " });
    expect(blank.success).toBe(true);
    if (blank.success) expect(blank.data.flight_no).toBeNull();
    const absent = checkoutIntentSchema.safeParse(validWeb);
    expect(absent.success).toBe(true);
    if (absent.success) expect(absent.data.flight_no).toBeUndefined();
  });

  it("rejects a flight_no longer than 16 characters", () => {
    const parsed = checkoutIntentSchema.safeParse({ ...validWeb, flight_no: "X".repeat(17) });
    expect(parsed.success).toBe(false);
  });

  it("pay-link accepts the same flight_no", () => {
    const parsed = checkoutPayLinkSchema.safeParse({
      ...valid,
      flight_no: "LX1234",
      billing_kind: "individual",
      payer_email: "ada@example.test",
    });
    expect(parsed.success).toBe(true);
  });
});


describe("checkoutIntentSchema web body (26.3 D-15, D-35)", () => {
  it("takes extra_codes deduped and defaults the company and note fields to empty", () => {
    const parsed = checkoutIntentSchema.safeParse({
      ...validWeb,
      extra_codes: ["child_seat", "child_seat", "ski-bag"],
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.extra_codes).toEqual(["child_seat", "ski-bag"]);
      expect(parsed.data.company_name).toBe("");
      expect(parsed.data.driver_note).toBe("");
      expect(parsed.data.trip.fid).toBe("mbx-from");
      expect(parsed.data.trip.flight).toBe("LX318");
    }
  });

  it("refuses the old three-code extras object", () => {
    expect(checkoutIntentSchema.safeParse({ ...validWeb, extras: { child_seats: 1 } }).success).toBe(false);
  });

  it("refuses bad extra codes and more than twenty", () => {
    expect(checkoutIntentSchema.safeParse({ ...validWeb, extra_codes: ["Child Seat"] }).success).toBe(false);
    const many = Array.from({ length: 21 }, (_, i) => `c${i}`);
    expect(checkoutIntentSchema.safeParse({ ...validWeb, extra_codes: many }).success).toBe(false);
  });

  it("caps company name, address, VAT and driver note", () => {
    expect(checkoutIntentSchema.safeParse({ ...validWeb, company_name: "x".repeat(201) }).success).toBe(false);
    expect(checkoutIntentSchema.safeParse({ ...validWeb, company_address: "x".repeat(401) }).success).toBe(false);
    expect(checkoutIntentSchema.safeParse({ ...validWeb, company_vat: "x".repeat(41) }).success).toBe(false);
    expect(checkoutIntentSchema.safeParse({ ...validWeb, driver_note: "x".repeat(501) }).success).toBe(false);
  });

  it("accepts supersedes only as a uuid", () => {
    const id = "22222222-2222-4222-8222-222222222222";
    expect(checkoutIntentSchema.safeParse({ ...validWeb, supersedes: id }).success).toBe(true);
    expect(checkoutIntentSchema.safeParse({ ...validWeb, supersedes: "nope" }).success).toBe(false);
  });

  it("requires a valid trip", () => {
    const { trip: _drop, ...rest } = validWeb;
    expect(checkoutIntentSchema.safeParse(rest).success).toBe(false);
    expect(
      checkoutIntentSchema.safeParse({ ...validWeb, trip: { ...validWeb.trip, when: "tomorrow" } }).success,
    ).toBe(false);
    expect(
      checkoutIntentSchema.safeParse({ ...validWeb, trip: { ...validWeb.trip, pax: 0 } }).success,
    ).toBe(false);
  });
});
