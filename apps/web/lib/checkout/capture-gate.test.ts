import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));

describe("capture gate", () => {
  it("calls checkout_capture_gate and does not select bookings", () => {
    const src = readFileSync(join(here, "settle.ts"), "utf8");
    const start = src.indexOf("loadCaptureGate: async");
    const fn = src.slice(start, start + 900);
    expect(fn).toContain("checkout_capture_gate");
    expect(fn).not.toMatch(/from public\.bookings/i);
    expect(fn).not.toMatch(/from public\.booking_payments/i);
    expect(fn).not.toMatch(/from public\.price_snapshots/i);
  });
});
