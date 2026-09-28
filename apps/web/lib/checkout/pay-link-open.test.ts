import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { CHECKOUT_REFUSALS } from "./errors";
import { payLinkSessionId, resolvePayLinkRefusal } from "./pay-link-state";

const here = dirname(fileURLToPath(import.meta.url));

async function body(res: Response): Promise<Record<string, unknown>> {
  return (await res.json()) as Record<string, unknown>;
}

describe("pay-link refusal codes (errors.ts)", () => {
  it("adds pay_link_paid, pay_link_refunded_duplicate and pay_link_expired as 409 with no action", () => {
    for (const code of ["pay_link_paid", "pay_link_refunded_duplicate", "pay_link_expired"] as const) {
      expect(CHECKOUT_REFUSALS[code]).toEqual({ status: 409, action: null });
    }
  });
});

describe("payLinkSessionId", () => {
  it("accepts a Stripe Checkout Session id in test or live mode", () => {
    expect(payLinkSessionId("cs_test_a1B2c3")).toBe("cs_test_a1B2c3");
    expect(payLinkSessionId("cs_live_Z9y8")).toBe("cs_live_Z9y8");
  });

  it("ignores anything else instead of refusing the open call (T-26.1-48)", () => {
    for (const value of [undefined, null, "", 42, "cs_test_", "pi_test_abc", "cs_test_abc'--", "cs_other_abc", " cs_test_abc"]) {
      expect(payLinkSessionId(value)).toBeNull();
    }
  });
});

describe("resolvePayLinkRefusal", () => {
  it("D-21: a paid booking answers pay_link_paid with the reference", async () => {
    const readState = vi.fn().mockResolvedValue({ state: "paid", reference: "VT-26-0001" });
    const res = await resolvePayLinkRefusal({ readState }, null);
    expect(res.status).toBe(409);
    expect(await body(res)).toEqual({ ok: false, code: "pay_link_paid", reference: "VT-26-0001" });
    expect(readState).toHaveBeenCalledWith(null);
  });

  it("D-22: the recipient's refunded duplicate session answers pay_link_refunded_duplicate", async () => {
    const readState = vi.fn().mockResolvedValue({ state: "refunded_duplicate", reference: "VT-26-0002" });
    const res = await resolvePayLinkRefusal({ readState }, "cs_test_abc");
    expect(res.status).toBe(409);
    expect(await body(res)).toEqual({ ok: false, code: "pay_link_refunded_duplicate", reference: "VT-26-0002" });
    expect(readState).toHaveBeenCalledWith("cs_test_abc");
  });

  it("an expired, cancelled or unknown link answers pay_link_expired with no reference", async () => {
    const readState = vi.fn().mockResolvedValue({ state: "expired", reference: null });
    const res = await resolvePayLinkRefusal({ readState }, null);
    expect(res.status).toBe(409);
    expect(await body(res)).toEqual({ ok: false, code: "pay_link_expired" });
  });

  it("no state row, or a contradictory payable state, is still pay_link_expired", async () => {
    for (const row of [null, { state: "payable", reference: "VT-26-0003" }, { state: "paid", reference: null }]) {
      const res = await resolvePayLinkRefusal({ readState: vi.fn().mockResolvedValue(row) }, null);
      expect(await body(res)).toEqual({ ok: false, code: "pay_link_expired" });
    }
  });

  it("answers private, no-store", async () => {
    const res = await resolvePayLinkRefusal({ readState: vi.fn().mockResolvedValue(null) }, null);
    expect(res.headers.get("cache-control")).toBe("private, no-store");
  });
});

describe("pay-link open route wiring", () => {
  const src = readFileSync(join(here, "../../app/api/checkout/pay-link/open/route.ts"), "utf8");

  it("reads checkout_pay_link_state on a hash miss and passes the checked session id", () => {
    expect(src).toContain("public.checkout_pay_link_state(");
    expect(src).toContain("resolvePayLinkRefusal(");
    expect(src).toContain("payLinkSessionId(");
  });
});
