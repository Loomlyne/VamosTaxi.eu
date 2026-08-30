// apps/web/lib/quote/client-contract.test.ts
//
// Exhaustiveness of REFUSAL_BINDINGS, on-disk component existence, D-46
// null amounts, DIR_KEEP_PARAMS dictionary cross-check.

import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { QUOTE_ERRORS, type QuoteErrorCode } from "./errors";
import {
  DIR_KEEP_PARAMS,
  LOCK_DANGER_THRESHOLD_S,
  REFUSAL_BINDINGS,
  type Binding,
} from "./client-contract";
import {
  COUPON_REFUSAL_RULES,
  INELIGIBLE_REASONS,
  allClientFixtures,
  couponApplied,
  couponRefusals,
  eligibleBoard,
  fixedRouteMatch,
  ineligibleReasonBoard,
  noEligibleClassBoard,
  returnJourney,
} from "./client-fixtures";

const here = dirname(fileURLToPath(import.meta.url));
const componentsRoot = join(here, "../../components");
const enPath = join(here, "../../i18n/messages/en.json");

const COMPONENT_FILES: Record<Exclude<Binding["component"], "data-tok">, string> =
  {
    Input: "forms/Input.tsx",
    Alert: "feedback/Alert.tsx",
    DatePicker: "forms/DatePicker.tsx",
    PriceSummary: "transfer/PriceSummary.tsx",
    Toast: "feedback/Toast.tsx",
    Counter: "forms/Counter.tsx",
  };

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

function walkAmounts(
  value: unknown,
  acc: Array<{ key: string; amount: unknown }> = [],
  key = "",
): Array<{ key: string; amount: unknown }> {
  if (Array.isArray(value)) {
    value.forEach((item, i) => walkAmounts(item, acc, `${key}[${i}]`));
    return acc;
  }
  if (value !== null && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) {
      const path = key ? `${key}.${k}` : k;
      if (k === "total_rappen" || k === "amount_rappen") {
        acc.push({ key: path, amount: v });
      } else {
        walkAmounts(v, acc, path);
      }
    }
  }
  return acc;
}

describe("REFUSAL_BINDINGS exhaustive", () => {
  it("covers every QuoteErrorCode — no entry is undefined", () => {
    const codes = Object.keys(QUOTE_ERRORS) as QuoteErrorCode[];
    expect(codes.length).toBeGreaterThan(0);
    for (const code of codes) {
      expect(REFUSAL_BINDINGS[code], code).toBeDefined();
      expect(REFUSAL_BINDINGS[code].i18n_key).toBe(QUOTE_ERRORS[code].i18n_key);
    }
    expect(Object.keys(REFUSAL_BINDINGS).sort()).toEqual([...codes].sort());
  });

  it("names only ported components, and each file exists on disk", () => {
    const seen = new Set<Binding["component"]>();
    for (const binding of Object.values(REFUSAL_BINDINGS)) {
      seen.add(binding.component);
      if (binding.component === "data-tok") continue;
      const rel = COMPONENT_FILES[binding.component];
      expect(rel, binding.component).toBeTruthy();
      expect(
        existsSync(join(componentsRoot, rel)),
        `${binding.component} → ${rel}`,
      ).toBe(true);
    }
    expect(seen.size).toBeGreaterThan(1);
  });

  it("marks service_area_undefined englishOnPurpose + data-tok, and no other entry", () => {
    expect(REFUSAL_BINDINGS.service_area_undefined.englishOnPurpose).toBe(true);
    expect(REFUSAL_BINDINGS.service_area_undefined.component).toBe("data-tok");
    const flagged = (Object.entries(REFUSAL_BINDINGS) as [
      QuoteErrorCode,
      Binding,
    ][]).filter(([, b]) => b.englishOnPurpose);
    expect(flagged.map(([code]) => code)).toEqual(["service_area_undefined"]);
  });

  it("binds pricing_not_live to PriceSummary slot note, never error", () => {
    expect(REFUSAL_BINDINGS.pricing_not_live.component).toBe("PriceSummary");
    expect(REFUSAL_BINDINGS.pricing_not_live.slot).toBe("note");
    expect(REFUSAL_BINDINGS.pricing_not_live.slot).not.toBe("error");
    expect(REFUSAL_BINDINGS.pricing_not_live.assumption).toBe(7);
  });
});

describe("DIR_KEEP_PARAMS and lock threshold", () => {
  it("each DIR_KEEP_PARAMS name appears in a quote.* or price.* en.json value", () => {
    const en = JSON.parse(readFileSync(enPath, "utf8")) as {
      quote: unknown;
      price: unknown;
    };
    const haystack = [
      ...collectStrings(en.quote),
      ...collectStrings(en.price),
    ].join("\n");
    expect(DIR_KEEP_PARAMS.length).toBeGreaterThan(0);
    for (const name of DIR_KEEP_PARAMS) {
      expect(haystack.includes(`{${name}}`), `{${name}} missing`).toBe(true);
    }
  });

  it("LOCK_DANGER_THRESHOLD_S is two minutes (Assumption 1, arbitrary)", () => {
    expect(LOCK_DANGER_THRESHOLD_S).toBe(120);
  });
});

describe("client fixtures (D-46)", () => {
  it("every total_rappen and amount_rappen across all fixtures is null", () => {
    const fixtures = allClientFixtures();
    expect(fixtures.length).toBeGreaterThanOrEqual(12);
    for (const fixture of fixtures) {
      const amounts = walkAmounts(fixture);
      expect(amounts.length, fixture.quote_id).toBeGreaterThan(0);
      for (const row of amounts) {
        expect(row.amount, `${fixture.quote_id} ${row.key}`).toBeNull();
      }
    }
  });

  it("ships a full eligible board of three classes", () => {
    expect(eligibleBoard.classes.every((c) => c.eligible)).toBe(true);
    expect(eligibleBoard.classes).toHaveLength(3);
    expect(eligibleBoard.no_eligible_class).toBe(false);
  });

  it("ships one class per ineligible_reason value", () => {
    const reasons = ineligibleReasonBoard.classes.map((c) => c.ineligible_reason);
    expect(reasons.sort()).toEqual([...INELIGIBLE_REASONS].sort());
    expect(ineligibleReasonBoard.classes.every((c) => !c.eligible)).toBe(true);
    expect(INELIGIBLE_REASONS).toHaveLength(5);
  });

  it("ships no_eligible_class: true with every card still present", () => {
    expect(noEligibleClassBoard.no_eligible_class).toBe(true);
    expect(noEligibleClassBoard.classes).toHaveLength(3);
  });

  it("ships a return journey with two legs", () => {
    expect(returnJourney.route.legs).toHaveLength(2);
    expect(returnJourney.route.legs.map((l) => l.leg_seq)).toEqual([1, 2]);
  });

  it("ships a fixed-route match", () => {
    expect(fixedRouteMatch.classes.some((c) => c.fixed_route)).toBe(true);
  });

  it("ships a reprice with coupon.applied true", () => {
    expect(couponApplied.coupon?.applied).toBe(true);
    expect(couponApplied.coupon?.rule).toBe("ok");
  });

  it("ships a reprice for each of the seven coupon refusal rules", () => {
    expect(COUPON_REFUSAL_RULES).toHaveLength(7);
    for (const rule of COUPON_REFUSAL_RULES) {
      expect(couponRefusals[rule].coupon?.applied, rule).toBe(false);
      expect(couponRefusals[rule].coupon?.rule, rule).toBe(rule);
    }
  });

  it("contains no CHF figure", () => {
    expect(JSON.stringify(allClientFixtures())).not.toMatch(/CHF\s*\d/);
  });

  it("contains no mapbox_id", () => {
    expect(JSON.stringify(allClientFixtures())).not.toMatch(/mapbox_id/i);
  });

  it("contains no real flight number", () => {
    expect(JSON.stringify(allClientFixtures())).not.toMatch(
      /\b(EK|LX|BA|AF|LH)\s*\d{1,4}\b/,
    );
  });

  it("contains no real address", () => {
    expect(JSON.stringify(allClientFixtures())).not.toMatch(
      /Bahnhofstrasse|Kloten|Flughafen Zürich/i,
    );
  });
});
