import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  classIsSelectable,
  payLinkTokenExpiresAt,
  refusalForMissingClassId,
  stripeAccountIsLegacyUaeTest,
} from "./charge-gate";

const here = dirname(fileURLToPath(import.meta.url));
const LOCK_EXP = "2026-09-05T13:00:00.000Z";

describe("classIsSelectable", () => {
  it("rejects null and negative displayed rappen", () => {
    expect(classIsSelectable(null)).toBe(false);
    expect(classIsSelectable(-1)).toBe(false);
  });

  it("rejects non-finite displayed rappen", () => {
    expect(classIsSelectable(Number.NaN)).toBe(false);
    expect(classIsSelectable(Number.POSITIVE_INFINITY)).toBe(false);
  });

  it("accepts a finite rappen greater than or equal to zero", () => {
    expect(classIsSelectable(0)).toBe(true);
    expect(classIsSelectable(1)).toBe(true);
  });
});

describe("stripeAccountIsLegacyUaeTest", () => {
  it("is true only for the UAE test prefix", () => {
    expect(stripeAccountIsLegacyUaeTest("pk_test_51U65pW")).toBe(true);
    expect(stripeAccountIsLegacyUaeTest("pk_test_placeholder")).toBe(false);
  });
});

describe("payLinkTokenExpiresAt", () => {
  it("returns the lock instant on first send and on resend", () => {
    const first = payLinkTokenExpiresAt(LOCK_EXP);
    const resend = payLinkTokenExpiresAt(LOCK_EXP);
    expect(first.toISOString()).toBe(LOCK_EXP);
    expect(resend.getTime()).toBe(first.getTime());
    const windowEnd = Date.now() + 1440 * 60 * 1000;
    expect(Math.abs(first.getTime() - windowEnd)).toBeGreaterThan(60_000);
  });
});

describe("refusalForMissingClassId", () => {
  it("is pricing_not_live, not invalid_request", () => {
    expect(refusalForMissingClassId()).toBe("pricing_not_live");
    expect(refusalForMissingClassId()).not.toBe("invalid_request");
  });
});

describe("charge-gate source", () => {
  it("does not import stripe or read the secret", () => {
    const src = readFileSync(join(here, "charge-gate.ts"), "utf8");
    expect(src).not.toMatch(/from ["']stripe["']/);
    expect(src).not.toContain("STRIPE_SECRET_KEY");
    expect(src).not.toContain("stripeFromEnv");
  });
});

describe("pay-link email_failed pin", () => {
  it("stays a 502 named email_failed and is not collapsed", () => {
    const src = readFileSync(join(here, "../../app/api/checkout/pay-link/route.ts"), "utf8");
    const line = src.split("\n").find((row) => row.includes("email_failed"));
    expect(line).toBeDefined();
    expect(line).toMatch(/error:\s*"email_failed"/);
    expect(line).toMatch(/status:\s*502/);
    expect(line).not.toContain("pricing_not_live");
    expect(line).not.toContain("quote_expired");
    expect(line).not.toContain("payCouldNotStart");
    expect(line).not.toMatch(/error:\s*"invalid_request"/);
  });
});
