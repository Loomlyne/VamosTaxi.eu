// apps/web/lib/ops/edit-request.test.ts
//
// 08-07: extra difference, unpaid refuse, merge expire. No Hyperdrive.
// Do not import app/api/**/route.ts.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  extraCheckoutMetadata,
  fareDifferenceRappen,
  mapEditSqlError,
  shouldExpireOldExtraSession,
  unpaidFieldPatchRefused,
} from "./edit-request-map";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "../../../..");

function read(rel: string): string {
  return readFileSync(join(repoRoot, rel), "utf8");
}

describe("fareDifferenceRappen", () => {
  it("is the difference only, never a new full fare", () => {
    expect(fareDifferenceRappen(12000, 8000)).toBe(4000);
    expect(fareDifferenceRappen(8000, 8000)).toBe(0);
    expect(fareDifferenceRappen(5000, 8000)).toBe(-3000);
  });
});

describe("extraCheckoutMetadata", () => {
  it("sets kind extra and extra_id", () => {
    expect(extraCheckoutMetadata("booking-1", "extra-9")).toEqual({
      booking_id: "booking-1",
      kind: "extra",
      extra_id: "extra-9",
    });
  });
});

describe("unpaidFieldPatchRefused", () => {
  it("refuses unpaid field PATCH", () => {
    expect(unpaidFieldPatchRefused(false)).toBe(true);
    expect(unpaidFieldPatchRefused(true)).toBe(false);
  });
});

describe("shouldExpireOldExtraSession", () => {
  it("expires the old extra session only when the amount changed", () => {
    expect(shouldExpireOldExtraSession(4000, 4000)).toBe(false);
    expect(shouldExpireOldExtraSession(4000, 5000)).toBe(true);
    expect(shouldExpireOldExtraSession(null, 4000)).toBe(false);
  });
});

describe("mapEditSqlError", () => {
  it("maps capacity and overlap to must-fix", () => {
    expect(mapEditSqlError({ message: "capacity" })).toEqual({ ok: false, code: "must-fix" });
    expect(mapEditSqlError({ code: "23P01" })).toEqual({ ok: false, code: "must-fix" });
    expect(mapEditSqlError({ message: "unpaid" })).toEqual({ ok: false, code: "unpaid" });
  });
});

describe("08-09 must-fix mail", () => {
  it("emails ops on extra-accept overlap and does not cancel", () => {
    const src = read("apps/web/lib/ops/edit-request.ts");
    expect(src).toMatch(/deliverOverlapMustFix/);
    expect(src).toMatch(/must-fix/);
    expect(src).not.toMatch(/status\s*=\s*['\"]cancelled['\"]/);
    expect(src).not.toMatch(/OpsFleet/);
    const mail = read("apps/web/lib/ops/must-fix-mail.ts");
    expect(mail).toContain("SUPPORT_EMAIL");
    expect(mail).toContain("sendOpsMustFix");
    expect(mail).not.toMatch(/notification_claim/);
    const settle = read("apps/web/lib/checkout/settle.ts");
    expect(settle).toMatch(/deliverOverlapMustFix/);
    expect(settle).toMatch(/kind === \"extra\"/);
  });
});

describe("08-07 file proofs", () => {
  it("does not import route.ts, uses asSystem, extra difference session", () => {
    const src = read("apps/web/lib/ops/edit-request.ts");
    expect(src).not.toMatch(/app\/api\/.+\/route/);
    expect(src).toMatch(/asSystem/);
    expect(src).toMatch(/Never asStaff INSERT/);
    expect(src).not.toMatch(/from \"@\/lib\/db\/identity\".*asStaff/);
    expect(src).not.toMatch(/:6543/);
    expect(src).toMatch(/expireCheckoutSession/);
    expect(src).toMatch(/createCheckoutSession/);
    expect(src).toMatch(/createRefund/);
    expect(src).toMatch(/extraCheckoutMetadata/);
    const stripe = read("apps/web/lib/checkout/stripe.ts");
    expect(stripe).toMatch(/kind: "extra"/);
    expect(stripe).toMatch(/extra_id/);
    const write = read("apps/web/lib/ops/bookings-write.ts");
    expect(write.toLowerCase()).toMatch(/unpaid/);
    const settle = read("apps/web/lib/checkout/settle.ts");
    expect(settle).toMatch(/checkout_extra_payment_settle/);
    expect(settle).toMatch(/kind === "extra"/);
    const sql = read("packages/db/supabase/migrations/20260910175309_booking_edit_requests.sql");
    expect(sql).toMatch(/booking_edit_requests/);
    expect(sql).toMatch(/checkout_extra_payment_settle/);
    expect(sql).toMatch(/not run pending/);
    expect(sql).toMatch(/tg_payment_matches_snapshot is/);
    expect(sql).toMatch(/revoke all on table public.booking_edit_requests/);
    expect(sql).toMatch(/grant select on table public.booking_edit_requests to vamos_staff/);
    const detail = read("app/ops/OpsDetail.dc.html");
    expect(detail).toMatch(/edit-accept/);
    expect(detail).toMatch(/Cancel and create a new trip/);
    expect(detail).toMatch(/mustFix/);
    expect(detail).not.toMatch(/glow/i);
    const dash = read("app/ops/OpsDash.dc.html");
    expect(dash).toMatch(/Pending edits/);
    expect(dash).toMatch(/Needs attention/);
  });
});

describe("08-10 customer paid-edit request", () => {
  it("POSTs requested via JWT or manage token, never asStaff, never mutates booking columns", () => {
    const src = read("apps/web/lib/ops/edit-request.ts");
    expect(src).toMatch(/requestCustomerPaidEdit/);
    expect(src).toMatch(/'customer'/);
    expect(src).toMatch(/asCustomer/);
    expect(src).toMatch(/asGuest/);
    expect(src).toMatch(/booking_edit_request_upsert/);
    expect(src).not.toMatch(/from \"@\/lib\/db\/identity\".*asStaff/);
    expect(src).not.toMatch(/asStaff\(/);
    expect(src).not.toMatch(/:6543/);
    const route = read("apps/web/app/api/account/bookings/route.ts");
    expect(route).toMatch(/export async function POST/);
    expect(route).toMatch(/requestCustomerPaidEdit/);
    expect(route).toMatch(/hashManageToken/);
    expect(route).toMatch(/customerClaims/);
    expect(route).not.toMatch(/asStaff/);
    expect(route).not.toMatch(/become-a-partner/);
    const page = read("app/pages/bookings.dc.html");
    expect(page).toMatch(/\/api\/account\/bookings/);
    expect(page).not.toMatch(/Request a change/);
    expect(page).not.toMatch(/requestEditFor/);
    expect(page).not.toMatch(/become-a-partner/);
  });
});
