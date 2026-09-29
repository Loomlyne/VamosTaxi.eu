import { describe, expect, it } from "vitest";
import { CONFIRMING_MS, confirmationPhase } from "./confirmation-phase";

describe("confirmationPhase (D-27)", () => {
  it("confirmed or assigned is booked at any elapsed time", () => {
    for (const status of ["confirmed", "assigned"]) {
      for (const elapsedMs of [0, 5000, 60_000]) {
        expect(confirmationPhase({ elapsedMs, status, paymentStatus: null })).toBe("booked");
      }
    }
  });

  it("a captured payment is booked", () => {
    expect(confirmationPhase({ elapsedMs: 1000, status: "pending", paymentStatus: "succeeded" })).toBe("booked");
  });

  it("pending or paid before 20 s is confirming, after is received", () => {
    for (const status of ["pending", "paid", "quote"]) {
      expect(confirmationPhase({ elapsedMs: 0, status, paymentStatus: null })).toBe("confirming");
      expect(confirmationPhase({ elapsedMs: CONFIRMING_MS - 1, status, paymentStatus: null })).toBe("confirming");
      expect(confirmationPhase({ elapsedMs: CONFIRMING_MS, status, paymentStatus: null })).toBe("received");
    }
  });

  it("not visible yet is confirming, then received, never an error", () => {
    expect(confirmationPhase({ elapsedMs: 3000, status: null, paymentStatus: null })).toBe("confirming");
    expect(confirmationPhase({ elapsedMs: 25_000, status: "", paymentStatus: null })).toBe("received");
  });

  it("a failed payment on the return path still never shows error copy", () => {
    expect(confirmationPhase({ elapsedMs: 1000, status: "pending", paymentStatus: "failed" })).toBe("confirming");
    expect(confirmationPhase({ elapsedMs: 30_000, status: "pending", paymentStatus: "failed" })).toBe("received");
  });

  it("a cancelled or refunded booking is hidden from the return path", () => {
    for (const status of ["cancelled", "refunded", "no_show"]) {
      expect(confirmationPhase({ elapsedMs: 0, status, paymentStatus: null })).toBe("hidden");
    }
  });
});
