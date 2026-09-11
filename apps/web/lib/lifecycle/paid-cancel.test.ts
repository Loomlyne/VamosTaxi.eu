// apps/web/lib/lifecycle/paid-cancel.test.ts
//
// 09-01 Wave 0: guest paid-cancel → createRefund THEN record_booking_refund (D-08).
// Red until 09-05 lands paid-cancel.ts. Mock Stripe only. Never sk_live_ calls.
// Synthetic rappen only. No invented CHF. No TRIP. No LX1234.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "../../../..");

function read(rel: string): string {
  return readFileSync(join(repoRoot, rel), "utf8");
}

describe("createRefund contract", () => {
  it("takes paymentIntentId, amountRappen, and idempotencyKey", () => {
    const src = read("apps/web/lib/checkout/stripe.ts");
    const start = src.indexOf("export async function createRefund");
    expect(start).toBeGreaterThan(-1);
    const body = src.slice(start, start + 700);
    expect(body).toMatch(/paymentIntentId/);
    expect(body).toMatch(/amountRappen/);
    expect(body).toMatch(/idempotencyKey/);
    expect(body).toMatch(/stripe\.refunds\.create/);
  });
});

describe("paid-cancel Stripe-before-record (D-08)", () => {
  it("calls createRefund then record_booking_refund, never the reverse", () => {
    const src = read("apps/web/lib/lifecycle/paid-cancel.ts");
    const createAt = src.indexOf("createRefund");
    const recordAt = src.indexOf("record_booking_refund");
    expect(createAt).toBeGreaterThan(-1);
    expect(recordAt).toBeGreaterThan(-1);
    expect(createAt).toBeLessThan(recordAt);
  });

  it("Stripe fail leaves cancelled + refund_status failed; no un-cancel (D-08)", () => {
    const src = read("apps/web/lib/lifecycle/paid-cancel.ts");
    expect(src).toMatch(/bookings_set_refund_failed/);
    expect(src).toMatch(/cancelled/);
    expect(src).toMatch(/failed/);
    expect(src).not.toMatch(/un-cancel/);
    expect(src).not.toMatch(/status:\s*['"]paid['"]/);
    expect(src).not.toMatch(/status:\s*['"]confirmed['"]/);
  });

  it("idempotency key includes booking id and payment id", () => {
    const src = read("apps/web/lib/lifecycle/paid-cancel.ts");
    expect(src).toMatch(/idempotencyKey/);
    expect(src).toMatch(/bookingId|booking_id|booking id/i);
    expect(src).toMatch(/paymentId|payment_id|payment id/i);
    expect(src).toMatch(/refund:\{bookingId\}:\{paymentId\}:customer-cancel|bookingId.*paymentId/);
  });
});
