import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  classIsSelectable,
  payLinkTokenExpiresAt,
  quoteUnpriced,
  refusalForMissingClassId,
  stripeAccountIsLegacyUaeTest,
} from "./charge-gate";

const here = dirname(fileURLToPath(import.meta.url));
const LOCK_EXP = "2026-09-05T13:00:00.000Z";
// Sent late in the quote lock (under 4 h left): the pay link still gets 24 h (D-20a).
const POSTGRES_NOW = "2026-09-05T09:15:00.000Z";

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
  it("D-20/D-20a: holds exactly 24 hours after the Postgres now it is given", () => {
    const at = payLinkTokenExpiresAt(POSTGRES_NOW);
    expect(at.toISOString()).toBe("2026-09-06T09:15:00.000Z");
    expect(at.getTime() - Date.parse(POSTGRES_NOW)).toBe(24 * 60 * 60 * 1000);
  });

  it("D-20: does not return the quote lock exp — a link sent late in the lock still gets 24 hours", () => {
    const at = payLinkTokenExpiresAt(POSTGRES_NOW);
    expect(at.toISOString()).not.toBe(LOCK_EXP);
    expect(at.getTime()).toBeGreaterThan(Date.parse(LOCK_EXP));
  });

  it("D-20: is pure — the same Postgres now gives the same instant, independent of the Worker clock", () => {
    expect(payLinkTokenExpiresAt(POSTGRES_NOW).getTime()).toBe(payLinkTokenExpiresAt(POSTGRES_NOW).getTime());
  });
});

describe("quoteUnpriced", () => {
  it("does not close booking when an idle class is CHF 000 and another class is priced", () => {
    expect(quoteUnpriced([null, 18500])).toBe(false);
    expect(quoteUnpriced([null, 0])).toBe(false);
  });

  it("stays closed when every class total is missing", () => {
    expect(quoteUnpriced([])).toBe(true);
    expect(quoteUnpriced([null, null])).toBe(true);
    expect(quoteUnpriced([Number.NaN])).toBe(true);
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
