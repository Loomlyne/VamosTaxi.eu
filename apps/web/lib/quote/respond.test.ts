// apps/web/lib/quote/respond.test.ts
//
// Status codes come from errors.ts; bodies carry no English sentence.

import { describe, expect, it } from "vitest";
import {
  QUOTE_ERRORS,
  type QuoteErrorCode,
} from "./errors";
import { errorResponse, quoteResponse } from "./respond";
import type { QuotePipelineOk } from "./pipeline";
import type { ClassBoardEntry, Line, PolicySnapshot } from "../pricing/types";

const ALL_CODES = Object.keys(QUOTE_ERRORS) as QuoteErrorCode[];

const SUCCESS_KEYS = [
  "ok",
  "quote_id",
  "lock",
  "expires_at",
  "engine_version",
  "pricing_live",
  "rate_version",
  "settings_version_id",
  "display_currency",
  "route",
  "no_eligible_class",
  "classes",
  "policy",
] as const;

const ENGLISH_SENTENCE = /[A-Za-z]{3,}\s+[A-Za-z]{3,}/;

function collectStrings(value: unknown, acc: string[] = []): string[] {
  if (typeof value === "string") {
    acc.push(value);
    return acc;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectStrings(item, acc);
    return acc;
  }
  if (value !== null && typeof value === "object") {
    for (const v of Object.values(value)) collectStrings(v, acc);
  }
  return acc;
}

function unpricedLine(): Line {
  return {
    seq: 1,
    leg_seq: 1,
    kind: "fare",
    code: "distance",
    i18n_key: "price.line.distance",
    basis: { rule: "per_km" },
    amount_rappen: null,
  };
}

function unpricedClass(slug: ClassBoardEntry["slug"]): ClassBoardEntry {
  return {
    slug,
    eligible: true,
    ineligible_reason: null,
    effective_max_pax: slug === "van" ? 8 : 3,
    max_bags: slug === "van" ? 8 : 3,
    fixed_route: false,
    total_rappen: null,
    lines: [unpricedLine()],
  };
}

function policy(): PolicySnapshot {
  return {
    settings_version_id: 1,
    free_cancel_hours: null,
    modification_deadline_hours: null,
    min_advance_minutes: null,
    airport_waiting_minutes: null,
    city_waiting_minutes: null,
    cancellation_tiers: [],
    policy_doc: null,
  };
}

function successQuote(overrides: Partial<QuotePipelineOk> = {}): QuotePipelineOk {
  return {
    ok: true,
    quote_id: "11111111-1111-4111-8111-111111111111",
    lock: "v1.payload.mac",
    expires_at: "2099-01-01T12:00:00.000Z",
    engine_version: "quote-engine@abcdef1",
    pricing_live: false,
    rate_version: null,
    settings_version_id: 1,
    display_currency: "CHF",
    route: {
      legs: [
        {
          leg_seq: 1,
          distance_m: 12000,
          duration_s: 1200,
          geometry: { type: "LineString", coordinates: [[8.54, 47.37], [8.56, 47.45]] },
          origin_zone_id: null,
          dest_zone_id: null,
        },
      ],
    },
    no_eligible_class: false,
    classes: [
      unpricedClass("economy"),
      unpricedClass("business"),
      unpricedClass("van"),
    ],
    policy: policy(),
    ...overrides,
  };
}

describe("errorResponse", () => {
  it("returns status, i18n_key and action from errors.ts for all 26 codes", async () => {
    expect(ALL_CODES).toHaveLength(26);
    for (const code of ALL_CODES) {
      const res =
        code === "min_advance"
          ? errorResponse("min_advance", { minutes: 180 })
          : errorResponse(code);
      const entry = QUOTE_ERRORS[code];
      expect(res.status, code).toBe(entry.status);
      expect(res.headers.get("Cache-Control")).toBe("no-store");
      const body = (await res.json()) as Record<string, unknown>;
      expect(body.ok).toBe(false);
      expect(body.error).toBe(code);
      expect(body.i18n_key).toBe(entry.i18n_key);
      expect(body.action ?? null).toBe(entry.action);
      expect(body).not.toHaveProperty("lock");
      expect(body).not.toHaveProperty("message");
    }
  });

  it("carries params.minutes for min_advance so the ICU placeholder cannot render empty", async () => {
    const res = errorResponse("min_advance", { minutes: 180 });
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.params).toEqual({ minutes: 180 });
    // @ts-expect-error min_advance requires { minutes }
    errorResponse("min_advance");
  });

  it("contains no English sentence in any error JSON body", async () => {
    for (const code of ALL_CODES) {
      const res =
        code === "min_advance"
          ? errorResponse("min_advance", { minutes: 180 })
          : errorResponse(code);
      const body = await res.json();
      for (const s of collectStrings(body)) {
        expect(ENGLISH_SENTENCE.test(s), `${code}: ${s}`).toBe(false);
      }
    }
  });

  it("quote_not_found and an expired-and-forged lock produce byte-identical bodies", async () => {
    const a = await errorResponse("quote_not_found").text();
    const b = await errorResponse("quote_not_found").text();
    expect(a).toBe(b);
    expect(JSON.parse(a)).toEqual({
      ok: false,
      error: "quote_not_found",
      i18n_key: QUOTE_ERRORS.quote_not_found.i18n_key,
      action: QUOTE_ERRORS.quote_not_found.action,
    });
  });
});

describe("quoteResponse", () => {
  it("emits every field in the contract list and no extra field", async () => {
    const res = quoteResponse(successQuote());
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    const body = (await res.json()) as Record<string, unknown>;
    expect(Object.keys(body).sort()).toEqual([...SUCCESS_KEYS].sort());
    expect(body.ok).toBe(true);
    expect(body).not.toHaveProperty("error");
  });

  it("against a fully-null board still emits complete lines, pricing_live false and rate_version null", async () => {
    const res = quoteResponse(successQuote());
    const body = (await res.json()) as QuotePipelineOk;
    expect(body.pricing_live).toBe(false);
    expect(body.rate_version).toBeNull();
    expect(body.classes).toHaveLength(3);
    for (const cls of body.classes) {
      expect(cls.total_rappen).toBeNull();
      expect(cls.lines.length).toBeGreaterThan(0);
      for (const line of cls.lines) {
        expect(line.amount_rappen).toBeNull();
      }
    }
  });

  it("never emits lock on an error and never emits error on a success — shapes are disjoint", async () => {
    const err = (await errorResponse("untrusted_input").json()) as Record<
      string,
      unknown
    >;
    const ok = (await quoteResponse(successQuote()).json()) as Record<
      string,
      unknown
    >;
    expect(err.ok).toBe(false);
    expect(ok.ok).toBe(true);
    expect(err).not.toHaveProperty("lock");
    expect(ok).not.toHaveProperty("error");
  });

  it("contains no English sentence in the success JSON body", async () => {
    const body = await quoteResponse(successQuote()).json();
    for (const s of collectStrings(body)) {
      expect(ENGLISH_SENTENCE.test(s), s).toBe(false);
    }
  });

  it("includes coupon on a reprice body and no extra keys beyond the contract plus coupon", async () => {
    const res = quoteResponse(
      successQuote({
        coupon: {
          code: "SAVE10",
          applied: false,
          rule: "unpriced",
          i18n_key: "quote.coupon.error.unpriced",
        },
      }),
    );
    const body = (await res.json()) as Record<string, unknown>;
    expect(Object.keys(body).sort()).toEqual(
      [...SUCCESS_KEYS, "coupon"].sort(),
    );
    expect(body.coupon).toEqual({
      code: "SAVE10",
      applied: false,
      rule: "unpriced",
      i18n_key: "quote.coupon.error.unpriced",
    });
  });
});
