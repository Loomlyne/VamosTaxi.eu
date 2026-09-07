import { describe, expect, it } from "vitest";
import {
  companyReady,
  confirmationRecipients,
  payLinkPath,
  payLinkSentAt,
} from "./pay-link";

describe("payLinkPath", () => {
  it("is locale-aware and does not put VAT in the URL", () => {
    expect(payLinkPath("en", "tok")).toBe("/checkout/pay/tok");
    expect(payLinkPath("de", "tok")).toBe("/de/checkout/pay/tok");
    expect(payLinkPath("en", "tok")).not.toMatch(/vat|VAT|mwst/i);
  });
});

describe("payLinkSentAt", () => {
  it("does not restart the 24h clock on resend (D-37)", () => {
    expect(payLinkSentAt("2026-09-07T10:00:00.000Z", "2026-09-07T18:00:00.000Z")).toBe(
      "2026-09-07T10:00:00.000Z",
    );
    expect(payLinkSentAt(null, "2026-09-07T10:00:00.000Z")).toBe("2026-09-07T10:00:00.000Z");
  });
});

describe("confirmationRecipients", () => {
  it("mails passenger and payer when they differ (D-38)", () => {
    expect(confirmationRecipients("a@x.com", "a@x.com")).toEqual(["a@x.com"]);
    expect(confirmationRecipients("a@x.com", "finance@x.com")).toEqual(["a@x.com", "finance@x.com"]);
  });
});

describe("companyReady", () => {
  it("requires name, address, VAT for company (D-36)", () => {
    expect(companyReady({ kind: "individual", name: "", address: "", vat: "" })).toBe(true);
    expect(companyReady({ kind: "company", name: "Acme", address: "Zürich", vat: "CHE-123" })).toBe(
      true,
    );
    expect(companyReady({ kind: "company", name: "Acme", address: "", vat: "CHE-123" })).toBe(false);
  });
});
