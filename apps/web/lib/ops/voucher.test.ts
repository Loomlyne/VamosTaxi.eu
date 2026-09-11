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
    expect(t).toMatch(/sc-if value="\{\{ dialogOpen \}\}"/);
    expect(t).toMatch(/sc-if value="\{\{ cancelOpen \}\}"/);
    expect(t).toMatch(/chauffeurs\.onChange/);
    expect(t).toMatch(/data-ops-detail-acts/);
  });
});
