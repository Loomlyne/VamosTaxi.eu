// apps/web/lib/quote/schema.test.ts
//
// Boundary proofs for the quote request schema (D-04, D-05, D-35, D-45, D-56).
// No network, no clock, no CHF figures.

import { describe, expect, it } from "vitest";
import * as fc from "fast-check";
import {
  FORBIDDEN_CLIENT_PRICE_FIELDS,
  parseQuoteRequest,
  parseRepriceRequest,
  QuoteRequestSchema,
  RepriceRequestSchema,
} from "./schema";

function validPlace(
  overrides: Partial<{ kind: "pin"; lng: number; lat: number; text: string }> = {},
) {
  return {
    kind: "pin" as const,
    lng: overrides.lng ?? 8.5417,
    lat: overrides.lat ?? 47.3769,
    text: overrides.text ?? "Zurich HB",
  };
}

function validBody(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    locale: "en",
    display_currency: "CHF",
    mode: "one_way",
    pickup: validPlace(),
    dropoff: validPlace({ lng: 8.562, lat: 47.45, text: "ZRH" }),
    legs: [{ leg_seq: 1, scheduled_local: "2026-09-01T10:30" }],
    pax: 2,
    bags: 1,
    ...overrides,
  };
}

describe("parseQuoteRequest — forbidden client price fields (D-35)", () => {
  it.each([...FORBIDDEN_CLIENT_PRICE_FIELDS])(
    "refuses body carrying %s as untrusted_input",
    (field) => {
      const body = validBody({ [field]: field === "hours" ? 3 : 1 });
      const result = parseQuoteRequest(body);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe("untrusted_input");
        expect(result.field).toBe(field);
      }
    },
  );

  it("refuses an unknown top-level key (strict, not strip)", () => {
    const result = parseQuoteRequest(validBody({ foo: 1 }));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("untrusted_input");
    }
  });

  it("property: any object with an extra top-level key fails the parse", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 24 }).filter(
          (k) =>
            ![
              "locale",
              "display_currency",
              "mode",
              "pickup",
              "dropoff",
              "legs",
              "pax",
              "bags",
              "preferred_class",
              "turnstile_token",
              "geo_session",
              "extras",
              "coupon",
              "__proto__",
              "constructor",
              "prototype",
              ...FORBIDDEN_CLIENT_PRICE_FIELDS,
            ].includes(k),
        ),
        (extraKey) => {
          const result = parseQuoteRequest(validBody({ [extraKey]: true }));
          expect(result.ok).toBe(false);
          if (!result.ok) expect(result.code).toBe("untrusted_input");
        },
      ),
      { numRuns: 40 },
    );
  });
});

describe("parseQuoteRequest — mode preprocess (D-04)", () => {
  it('maps mode "one-way" to one_way successfully', () => {
    const result = parseQuoteRequest(validBody({ mode: "one-way" }));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.mode).toBe("one_way");
  });

  it('accepts mode "one_way" as-is', () => {
    const result = parseQuoteRequest(validBody({ mode: "one_way" }));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.mode).toBe("one_way");
  });

  it('mode "hourly" yields mode_not_offered, not untrusted_input', () => {
    const result = parseQuoteRequest(validBody({ mode: "hourly" }));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("mode_not_offered");
      expect(result.code).not.toBe("untrusted_input");
    }
  });

  it("hours fails the parse regardless of mode", () => {
    const result = parseQuoteRequest(
      validBody({ mode: "one_way", hours: 2 }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("untrusted_input");
      expect(result.field).toBe("hours");
    }
  });
});

describe("parseQuoteRequest — pax / bags (D-05)", () => {
  it("pax: 0 fails", () => {
    const result = parseQuoteRequest(validBody({ pax: 0 }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("untrusted_input");
  });

  it("pax: -1 fails", () => {
    const result = parseQuoteRequest(validBody({ pax: -1 }));
    expect(result.ok).toBe(false);
  });

  it("pax: 1 parses", () => {
    const result = parseQuoteRequest(validBody({ pax: 1 }));
    expect(result.ok).toBe(true);
  });

  it("pax above 16 fails", () => {
    const result = parseQuoteRequest(validBody({ pax: 17 }));
    expect(result.ok).toBe(false);
  });

  it("bags: 0 parses", () => {
    const result = parseQuoteRequest(validBody({ bags: 0 }));
    expect(result.ok).toBe(true);
  });

  it("bags negative fails", () => {
    expect(parseQuoteRequest(validBody({ bags: -1 })).ok).toBe(false);
  });

  it("bags above 16 fails", () => {
    expect(parseQuoteRequest(validBody({ bags: 17 })).ok).toBe(false);
  });
});

describe("parseQuoteRequest — extras (D-45, D-56)", () => {
  it("child_seats: 2 → extras_max_child_seats", () => {
    const result = parseQuoteRequest(
      validBody({ extras: { child_seats: 2 } }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("extras_max_child_seats");
  });

  it("child_seats 0 and 1 parse", () => {
    expect(
      parseQuoteRequest(validBody({ extras: { child_seats: 0 } })).ok,
    ).toBe(true);
    expect(
      parseQuoteRequest(validBody({ extras: { child_seats: 1 } })).ok,
    ).toBe(true);
  });

  it("extra_stops: 2 → extras_max_stops (D-21)", () => {
    const result = parseQuoteRequest(
      validBody({ extras: { extra_stops: 2 } }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("extras_max_stops");
  });

  it.each([0, 1])("extra_stops: %i parses", (n) => {
    expect(
      parseQuoteRequest(validBody({ extras: { extra_stops: n } })).ok,
    ).toBe(true);
  });

  it("extra_stops: 1 with NO waypoints parses (count-only)", () => {
    const result = parseQuoteRequest(
      validBody({ extras: { extra_stops: 1 } }),
    );
    expect(result.ok).toBe(true);
  });

  it("extra_stops: 1 with waypoints length 2 fails", () => {
    const wp = { lng: 8.5, lat: 47.3, text: "Stop" };
    const result = parseQuoteRequest(
      validBody({
        extras: { extra_stops: 1, waypoints: [wp, wp] },
      }),
    );
    expect(result.ok).toBe(false);
  });

  it("extra_stops: 1 with waypoints length 1 parses", () => {
    const wp = { lng: 8.5, lat: 47.3, text: "Stop A" };
    const result = parseQuoteRequest(
      validBody({
        extras: {
          extra_stops: 1,
          waypoints: [wp],
        },
      }),
    );
    expect(result.ok).toBe(true);
  });

  it("oversized_luggage accepts only boolean", () => {
    expect(
      parseQuoteRequest(
        validBody({ extras: { oversized_luggage: true } }),
      ).ok,
    ).toBe(true);
    expect(
      parseQuoteRequest(
        validBody({ extras: { oversized_luggage: "yes" } }),
      ).ok,
    ).toBe(false);
  });
});

describe("parseQuoteRequest — legs / coupon / enums / places", () => {
  it("one_way accepts one leg; three legs fail", () => {
    expect(parseQuoteRequest(validBody()).ok).toBe(true);
    const three = validBody({
      legs: [
        { leg_seq: 1, scheduled_local: "2026-09-01T10:30" },
        { leg_seq: 2, scheduled_local: "2026-09-02T10:30" },
        { leg_seq: 1, scheduled_local: "2026-09-03T10:30" },
      ],
    });
    expect(parseQuoteRequest(three).ok).toBe(false);
  });

  it("return requires exactly two legs", () => {
    const one = validBody({
      mode: "return",
      legs: [{ leg_seq: 1, scheduled_local: "2026-09-01T10:30" }],
    });
    expect(parseQuoteRequest(one).ok).toBe(false);

    const two = validBody({
      mode: "return",
      legs: [
        { leg_seq: 1, scheduled_local: "2026-09-01T10:30" },
        { leg_seq: 2, scheduled_local: "2026-09-05T18:00" },
      ],
    });
    expect(parseQuoteRequest(two).ok).toBe(true);
  });

  it("coupon keeps customer casing (no toUpperCase in schema)", () => {
    const result = parseQuoteRequest(validBody({ coupon: "save10" }));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.coupon).toBe("save10");
  });

  it("display_currency accepts CHF|EUR|USD|AED only", () => {
    for (const c of ["CHF", "EUR", "USD", "AED"] as const) {
      expect(parseQuoteRequest(validBody({ display_currency: c })).ok).toBe(
        true,
      );
    }
    expect(parseQuoteRequest(validBody({ display_currency: "GBP" })).ok).toBe(
      false,
    );
  });

  it("locale accepts en|de|fr|ar only", () => {
    for (const l of ["en", "de", "fr", "ar"] as const) {
      expect(parseQuoteRequest(validBody({ locale: l })).ok).toBe(true);
    }
    expect(parseQuoteRequest(validBody({ locale: "it" })).ok).toBe(false);
  });

  it("pickup/dropoff text shorter than 2 or longer than 200 fails", () => {
    expect(
      parseQuoteRequest(
        validBody({ pickup: validPlace({ text: "Z" }) }),
      ).ok,
    ).toBe(false);
    expect(
      parseQuoteRequest(
        validBody({ pickup: validPlace({ text: "x".repeat(201) }) }),
      ).ok,
    ).toBe(false);
  });

  it("D-26: coords outside CH still parse — Mapbox is unfenced", () => {
    expect(
      parseQuoteRequest(
        validBody({
          pickup: validPlace({ lng: -0.12, lat: 51.5, text: "London" }),
        }),
      ).ok,
    ).toBe(true);
  });

  it("Zurich coords parse (inside box)", () => {
    expect(parseQuoteRequest(validBody()).ok).toBe(true);
  });
});

describe("RepriceRequestSchema", () => {
  const validReprice = {
    quote_id: "q_abc",
    lock: "v1.payload.mac",
    locale: "en",
    display_currency: "CHF",
  };

  it("parses a minimal reprice body", () => {
    const result = parseRepriceRequest(validReprice);
    expect(result.ok).toBe(true);
  });

  it("refuses forbidden price fields", () => {
    const result = parseRepriceRequest({
      ...validReprice,
      total_rappen: 100,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("untrusted_input");
      expect(result.field).toBe("total_rappen");
    }
  });

  it("refuses pax/bags/places (must come from lock)", () => {
    expect(parseRepriceRequest({ ...validReprice, pax: 2 }).ok).toBe(false);
    expect(parseRepriceRequest({ ...validReprice, mode: "one_way" }).ok).toBe(
      false,
    );
  });

  it("extras_max_stops on reprice", () => {
    const result = parseRepriceRequest({
      ...validReprice,
      extras: { extra_stops: 9 },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("extras_max_stops");
  });

  it("exports schemas usable with safeParse", () => {
    expect(QuoteRequestSchema.safeParse(validBody()).success).toBe(true);
    expect(RepriceRequestSchema.safeParse(validReprice).success).toBe(true);
  });
});
