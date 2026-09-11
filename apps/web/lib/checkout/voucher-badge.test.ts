import { describe, expect, it } from "vitest";
import { voucherBadgeStatus, voucherNeedsPayment } from "./voucher-badge";

describe("voucherBadgeStatus", () => {
  it("keeps confirmed, assigned, completed, cancelled, refunded", () => {
    expect(voucherBadgeStatus("confirmed")).toBe("confirmed");
    expect(voucherBadgeStatus("assigned")).toBe("assigned");
    expect(voucherBadgeStatus("completed")).toBe("completed");
    expect(voucherBadgeStatus("cancelled")).toBe("cancelled");
    expect(voucherBadgeStatus("refunded")).toBe("refunded");
  });

  it("maps unpaid pending to pending and captured pending to paid", () => {
    expect(voucherBadgeStatus("pending")).toBe("pending");
    expect(voucherBadgeStatus("pending", "succeeded")).toBe("paid");
    expect(voucherBadgeStatus("paid")).toBe("paid");
  });

  it("maps no_show and failed payment", () => {
    expect(voucherBadgeStatus("no_show")).toBe("no-show");
    expect(voucherBadgeStatus("pending", "failed")).toBe("cancelled");
  });

  it("flags Needs payment only for unpaid quote/pending", () => {
    expect(voucherNeedsPayment("pending")).toBe(true);
    expect(voucherNeedsPayment("quote")).toBe(true);
    expect(voucherNeedsPayment("paid")).toBe(false);
    expect(voucherNeedsPayment("confirmed")).toBe(false);
  });
});
