import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { WEB_ROOT } from "../../tests/support/server-harness";
import {
  isCapturedPayment,
  isFailedPayment,
  isFailedStatus,
  isVoucherStatus,
} from "./booking-status";

describe("confirmation unmock (D-40)", () => {
  it("does not map /confirmation to a DC mock", () => {
    const src = readFileSync(join(WEB_ROOT, "middleware.ts"), "utf8");
    const pages = src.match(/const DC_PAGES[\s\S]*?\n\};/);
    expect(pages?.[0]).toBeTruthy();
    expect(pages?.[0]).not.toMatch(/["']\/confirmation["']/);
    expect(pages?.[0]).not.toContain("confirmation.html");
  });

  it("does not invent a fake VT-5xxx on the confirmation page", () => {
    const page = readFileSync(
      join(WEB_ROOT, "app/[locale]/confirmation/[ref]/page.tsx"),
      "utf8",
    );
    const index = readFileSync(join(WEB_ROOT, "app/[locale]/confirmation/page.tsx"), "utf8");
    const client = readFileSync(
      join(WEB_ROOT, "app/[locale]/confirmation/[ref]/ConfirmationClient.tsx"),
      "utf8",
    );
    for (const src of [page, index, client]) {
      expect(src).not.toMatch(/VT-5\d{3}/);
      expect(src).not.toContain("confirmation.dc.html");
    }
    expect(index).toContain("notVisibleTitle");
  });

  it("keeps polling until voucher or error, never a silent stop", () => {
    const client = readFileSync(
      join(WEB_ROOT, "app/[locale]/confirmation/[ref]/ConfirmationClient.tsx"),
      "utf8",
    );
    const css = readFileSync(
      join(WEB_ROOT, "app/[locale]/confirmation/[ref]/confirmation.css"),
      "utf8",
    );
    const route = readFileSync(join(WEB_ROOT, "app/api/checkout/status/[ref]/route.ts"), "utf8");
    expect(client).toContain("if (!waiting) return");
    expect(client).toContain("data-confirmation-voucher");
    expect(client).toContain("data-confirmation-failed");
    expect(client).not.toContain("processingStepEmail");
    expect(client).not.toContain("data-confirmation-wait");
    expect(client).not.toContain("loader-circle");
    expect(client).toContain("failedTitle");
    expect(client).toContain("setTimeout(tick, 0)");
    expect(client).toContain("pollOutcome");
    expect(client).not.toContain('status="pending"');
    expect(client).toContain('credentials: "include"');
    expect(client).toContain("isCapturedPayment");
    expect(client).not.toContain('if (phase !== "processing") return;');
    expect(client).not.toContain("POLL_GIVE_UP_MS) return");
    expect(client).toContain("There is no coupon/voucher");
    expect(client).not.toContain("processingTitle");
    expect(client).not.toContain("We're confirming your payment");
    expect(client).toContain("data-confirmation-extra");
    expect(client).toContain("data-confirmation-receipt");
    expect(client).toContain("data-confirmation-payer");
    expect(client).toContain("couponCode");
    expect(client).toContain("priceTotalRappen");
    expect(client).not.toContain("airport-pickup-fee");
    expect(client).not.toContain("total={null}");
    expect(css).toContain(".vt-confirmation__wait");
    expect(css).toContain(".vt-confirmation__steps");
    expect(route).toContain("paymentStatus");
    expect(route).toContain("readManageCookie");
  });

  it("treats confirmed as voucher and failed payment as error", () => {
    expect(isVoucherStatus("confirmed")).toBe(true);
    expect(isFailedStatus("cancelled")).toBe(true);
    expect(isFailedPayment("failed")).toBe(true);
    expect(isFailedPayment("canceled")).toBe(true);
    expect(isFailedPayment("requires_payment")).toBe(false);
    expect(isVoucherStatus("pending")).toBe(false);
    expect(isCapturedPayment("succeeded")).toBe(true);
    expect(isCapturedPayment("requires_payment")).toBe(false);
  });
});
