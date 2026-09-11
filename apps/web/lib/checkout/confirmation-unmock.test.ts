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
    const pageClient = readFileSync(
      join(WEB_ROOT, "app/[locale]/confirmation/[ref]/ConfirmationClient.tsx"),
      "utf8",
    );
    const voucher = readFileSync(join(WEB_ROOT, "components/booking/BookingVoucher.tsx"), "utf8");
    const client = `${pageClient}\n${voucher}`;
    const css = [
      readFileSync(join(WEB_ROOT, "app/[locale]/confirmation/[ref]/confirmation.css"), "utf8"),
      readFileSync(join(WEB_ROOT, "components/booking/BookingVoucher.css"), "utf8"),
    ].join("\n");
    const route = readFileSync(join(WEB_ROOT, "app/api/checkout/status/[ref]/route.ts"), "utf8");
    expect(pageClient).toContain("<BookingVoucher");
    expect(pageClient).toContain('<Icon name="phone"');
    expect(pageClient).toContain('<Icon name="message-circle"');
    expect(pageClient).not.toContain("data-vt-icon");
    expect(pageClient).not.toContain('icon="phone"');
    expect(pageClient).not.toContain('icon="message-circle"');
    expect(pageClient).toContain("if (!waiting) return");
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
    expect(client).toContain("data-confirmation-bags");
    expect(client).toContain("data-confirmation-arrive");
    expect(client).toContain("data-confirmation-paid-with");
    expect(client).toContain("pickupDetail");
    expect(client).toContain("dropoffDetail");
    expect(client).toContain("data-confirmation-pickup-at");
    expect(client).toContain("data-confirmation-duration");
    expect(client).toContain('name="map-pin"');
    expect(client).toContain('name="clock"');
    expect(client).toContain("duration=");
    const routeSrc = readFileSync(join(WEB_ROOT, "components/transfer/RouteSummary.tsx"), "utf8");
    const routeCss = readFileSync(join(WEB_ROOT, "components/transfer/RouteSummary.css"), "utf8");
    expect(routeSrc).toContain("vt-route__rail");
    expect(routeSrc).toContain("vt-route__duration");
    expect(routeSrc).not.toContain("vt-route__spine");
    expect(routeSrc).not.toContain("vt-route__segment");
    expect(routeCss).toContain(".vt-route__rail");
    expect(routeCss).toContain("flex:1 1 auto");
    expect(routeCss).toContain("rgb(255 255 255 / 0.45)");
    expect(client).toContain("couponPercentOff");
    expect(client).toContain("fareExVat");
    expect(client).toContain("vatIncl");
    expect(client).toContain("receiptPriceSplit");
    expect(client).toContain("data-confirmation-coupon");
    expect(client).not.toContain("vt-confirmation__voucher-title");
    expect(client).not.toContain("{t(\"transferVoucher\")}");
    expect(css).toContain(".vt-confirmation__voucher-head .vt-badge");
    expect(css).toContain("z-index: 2");
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
