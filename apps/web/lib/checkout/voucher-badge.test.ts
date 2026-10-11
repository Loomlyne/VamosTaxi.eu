import { describe, expect, it } from "vitest";
import {
  voucherBadgeStatus,
  voucherNeedsPayment,
  voucherRefundAmountRappen,
  voucherRefundLabelKey,
} from "./voucher-badge";
import { cancelWindowFromMode } from "./cancel-window";

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

describe("voucherRefundLabelKey (UI-SPEC §2)", () => {
  it("names the customer's refund state in plain words", () => {
    expect(voucherRefundLabelKey("pending_ops")).toBe("refundPendingOps");
    expect(voucherRefundLabelKey("processing")).toBe("refundProcessing");
    expect(voucherRefundLabelKey("refunded")).toBe("refunded");
    expect(voucherRefundLabelKey("failed")).toBe("refundFailedLabel");
    expect(voucherRefundLabelKey("declined")).toBe("refundDeclinedLabel");
    expect(voucherRefundLabelKey(" DECLINED ")).toBe("refundDeclinedLabel");
    expect(voucherRefundLabelKey("none")).toBeNull();
    expect(voucherRefundLabelKey(null)).toBeNull();
  });
});

describe("voucherRefundAmountRappen (D-23a)", () => {
  it("shows the decided amount while pending or processing", () => {
    expect(voucherRefundAmountRappen({ refundStatus: "pending_ops", refundOwedRappen: 4800 })).toBe(4800);
    expect(voucherRefundAmountRappen({ refundStatus: "processing", refundOwedRappen: 12000 })).toBe(12000);
  });

  it("shows nothing while the admin has not set an amount", () => {
    expect(voucherRefundAmountRappen({ refundStatus: "pending_ops", refundOwedRappen: null })).toBeNull();
    expect(voucherRefundAmountRappen({ refundStatus: "pending_ops", refundOwedRappen: 0 })).toBeNull();
  });

  it("prefers the refunded amount once money moved", () => {
    expect(
      voucherRefundAmountRappen({ refundStatus: "refunded", refundedRappen: 4800, refundOwedRappen: 12000 }),
    ).toBe(4800);
    expect(voucherRefundAmountRappen({ refundStatus: "refunded", refundOwedRappen: 12000 })).toBe(12000);
  });

  it("never shows an amount for declined, failed or none", () => {
    expect(voucherRefundAmountRappen({ refundStatus: "declined", refundOwedRappen: 0 })).toBeNull();
    expect(voucherRefundAmountRappen({ refundStatus: "failed", refundOwedRappen: 12000 })).toBeNull();
    expect(voucherRefundAmountRappen({ refundStatus: "none", refundedRappen: 100 })).toBeNull();
  });
});

describe("cancelWindowFromMode (D-23/D-24, J7 W6-01)", () => {
  it("shows the automatic full refund only when compute_cancellation_refund said auto_full", () => {
    expect(cancelWindowFromMode("auto_full")).toBe("auto_full");
  });

  it("sends every other answer to the admin review: pending_ops, none, nothing readable", () => {
    expect(cancelWindowFromMode("pending_ops")).toBe("pending_ops");
    expect(cancelWindowFromMode("none")).toBe("pending_ops");
    expect(cancelWindowFromMode(null)).toBe("pending_ops");
    expect(cancelWindowFromMode(undefined)).toBe("pending_ops");
    expect(cancelWindowFromMode("")).toBe("pending_ops");
  });
});
