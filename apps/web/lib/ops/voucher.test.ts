// apps/web/lib/ops/voucher.test.ts
//
// File proofs for staff voucher resend. No Hyperdrive.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "../../../..");

function read(rel: string): string {
  return readFileSync(join(repoRoot, rel), "utf8");
}

describe("staff voucher resend", () => {
  it("sends via Resend, skips the first-send claim, dual-mounts POST", () => {
    const src = read("apps/web/lib/ops/voucher.ts");
    expect(src).toMatch(/sendConfirmation/);
    expect(src).toMatch(/checkout_booking_for_email/);
    expect(src).toMatch(/asSystem/);
    expect(src).not.toMatch(/notification_claim\(/);
    expect(src).not.toMatch(/:6543/);
    const locale = read("apps/web/app/[locale]/(ops)/api/staff/bookings/[id]/voucher/route.ts");
    const pub = read("apps/web/app/api/staff/bookings/[id]/voucher/route.ts");
    expect(locale).toMatch(/withStaff/);
    expect(locale).toMatch(/resendVoucher/);
    expect(pub).toMatch(/export \{ POST \}/);
  });

  it("OpsDetail POSTs /voucher and opens assign/cancel via sc-if", () => {
    const t = read("app/ops/OpsDetail.dc.html");
    expect(t).toMatch(/\/voucher/);
    expect(t).not.toMatch(/resendVoucher: \(\) => this\.notify/);
    // 260930-dash-design: Assign is the box on the page (no dialog any more).
    expect(t).toMatch(/sc-if value="\{\{ showAssignPicker \}\}"/);
    expect(t).toMatch(/sc-if value="\{\{ cancelOpen \}\}"/);
    expect(t).toMatch(/chauffeurs\.onChange/);
    expect(t).toMatch(/data-ops-detail-acts/);
  });
});

describe("customer refund words and amount (26.1-18, UI-SPEC §2)", () => {
  const msgs = (lang: string) =>
    JSON.parse(read(`apps/web/i18n/messages/${lang}.json`)) as { checkout: Record<string, string> };

  it("replaces Pending Ops with Refund under review and adds No refund, in four languages", () => {
    expect(read("apps/web/i18n/messages/en.json")).not.toContain('"Pending Ops"');
    const want: Record<string, [string, string]> = {
      en: ["Refund under review", "No refund"],
      de: ["Rückerstattung in Prüfung", "Keine Rückerstattung"],
      fr: ["Remboursement en cours d’examen", "Aucun remboursement"],
      ar: ["الاسترداد قيد المراجعة", "لا يوجد استرداد"],
    };
    for (const [lang, [pending, declined]] of Object.entries(want)) {
      const c = msgs(lang).checkout;
      expect(c.refundPendingOps, lang).toBe(pending);
      expect(c.refundDeclinedLabel, lang).toBe(declined);
    }
  });

  it("BookingVoucher maps refund words through the helper and prints the amount with formatAmount", () => {
    const src = read("apps/web/components/booking/BookingVoucher.tsx");
    expect(src).toMatch(/voucherRefundLabelKey\(/);
    expect(src).toMatch(/voucherRefundAmountRappen\(/);
    expect(src).toMatch(/formatAmount\(refundAmountMajor\)/);
    expect(src).toMatch(/data-confirmation-refund-amount/);
    expect(src).toMatch(/refundOwedRappen\?: number \| null/);
    expect(src).toMatch(/refundedRappen\?: number \| null/);
  });

  it("customer cancel screens use the shared D-24 window, not a 6 hour cut-off", () => {
    const route = read("apps/web/app/api/manage/booking/route.ts");
    const client = read("apps/web/app/[locale]/confirmation/[ref]/ConfirmationClient.tsx");
    for (const src of [route, client]) {
      expect(src).toMatch(/customerCancelWindow\(/);
      expect(src).not.toMatch(/hours > 6/);
    }
    expect(client).not.toMatch(/cancelSheetClose/);
    expect(client).toMatch(/refundRappen/);
  });
});
