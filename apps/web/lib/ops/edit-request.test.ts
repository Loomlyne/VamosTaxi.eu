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
    // 26.2 P1 + refunds by hand (2026-09-30): a cheaper change is "Refund due"; nothing from the
    // edit machine sends a refund to Stripe.
    expect(src).not.toMatch(/createRefund/);
    expect(src).not.toMatch(/booking_edit_refund_record/);
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

function fnBody(src: string, name: string): string {
  const start = src.indexOf(`export async function ${name}`);
  expect(start).toBeGreaterThan(-1);
  const next = src.indexOf("\nexport async function ", start + 1);
  return next === -1 ? src.slice(start) : src.slice(start, next);
}

describe("09-10 time-change request/confirm (D-23–D-26)", () => {
  it("T-09-90 only ops accept RPC mutates scheduled_at; customer request does not", () => {
    const lib = read("apps/web/lib/ops/edit-request.ts");
    const request = fnBody(lib, "requestCustomerTimeChange");
    expect(request).toMatch(/requestCustomerPaidEdit/);
    expect(request).toMatch(/scheduled_local/);
    expect(request).toMatch(/scheduled_at/);
    expect(request).not.toMatch(/update public\.booking_legs/i);
    expect(request).not.toMatch(/scheduled_at\s*=/);
    expect(lib).toMatch(/booking_edit_request_upsert/);
    expect(lib).toMatch(/booking_edit_request_accept/);

    const guest = read("apps/web/app/api/manage/time-change/route.ts");
    expect(guest).toMatch(/requestCustomerTimeChange/);
    expect(guest).not.toMatch(/update public\.booking_legs/i);
    expect(guest).not.toMatch(/AeroDataBox|LX1234/i);

    const signed = read("apps/web/app/api/account/bookings/time-change/route.ts");
    expect(signed).toMatch(/requestCustomerTimeChange/);
    expect(signed).not.toMatch(/update public\.booking_legs/i);

    const sql = read("packages/db/supabase/migrations/20260910175309_booking_edit_requests.sql");
    const applyAt = sql.indexOf("create or replace function public.booking_edit_apply_payload");
    expect(applyAt).toBeGreaterThan(-1);
    const apply = sql.slice(applyAt, applyAt + 3500);
    expect(apply).toMatch(/scheduled_at = case/);
    expect(apply).not.toMatch(/original_scheduled_at/);
    expect(sql).toMatch(/booking_edit_request_accept/);
  });

  it("T-09-92 token/JWT ownership on guest and signed-in time-change routes", () => {
    const guest = read("apps/web/app/api/manage/time-change/route.ts");
    expect(guest).toMatch(/hashManageToken/);
    expect(guest).toMatch(/kind:\s*"guest"|asGuest/);
    expect(guest).not.toMatch(/asStaff/);
    const signed = read("apps/web/app/api/account/bookings/time-change/route.ts");
    expect(signed).toMatch(/customerClaims/);
    expect(signed).not.toMatch(/@vamos\/db/);
    expect(signed).toMatch(/kind:\s*"customer"|asCustomer/);
    expect(signed).not.toMatch(/asStaff/);
  });

  it("refuse stays original, mails customer, does not call accept RPC", () => {
    const lib = read("apps/web/lib/ops/edit-request.ts");
    const refuse = fnBody(lib, "refuseEditRequest");
    expect(refuse).toMatch(/supersedePendingEditRequest/);
    expect(read("packages/db/supabase/migrations/20260930210000_system_role_narrow_reads.sql")).toMatch(
      /set status = 'superseded'/,
    );
    expect(refuse).not.toMatch(/booking_edit_request_accept/);
    expect(refuse).not.toMatch(/scheduled_at/);
    expect(refuse).not.toMatch(/booking_edit_apply_payload/);

    const staff = read("apps/web/app/[locale]/(ops)/api/staff/bookings/[id]/edit-request/route.ts");
    expect(staff).toMatch(/action/);
    expect(staff).toMatch(/refuse/);
    expect(staff).toMatch(/acceptPaidEdit/);
    expect(staff).toMatch(/refuseEditRequest/);
    expect(staff).toMatch(/notifyTimeChangeOutcome/);
    expect(staff).not.toMatch(/info@vamostaxi/);
    expect(staff).not.toMatch(/AeroDataBox|LX1234/i);

    const dual = read("apps/web/app/api/staff/bookings/[id]/edit-request/route.ts");
    expect(dual).toMatch(/edit-request\/route/);
  });

  it("D-25 confirmed time-change mails customer + bookings@ + assigned chauffeur", () => {
    const lib = read("apps/web/lib/ops/edit-request.ts");
    const notify = fnBody(lib, "notifyTimeChangeOutcome");
    expect(notify).toMatch(/notifyTimeChange/);
    expect(notify).toMatch(/includeOps:\s*outcome === "confirmed"/);
    expect(notify).toMatch(/chauffeurEmail/);
    expect(notify).not.toMatch(/info@vamostaxi/);
    const lifecycle = read("apps/web/lib/lifecycle/notify-lifecycle.ts");
    expect(lifecycle).toMatch(/BOOKINGS_OPS_EMAIL = "bookings@vamostaxi.site"/);
    const request = fnBody(lib, "requestCustomerTimeChange");
    expect(request).not.toMatch(/notifyTimeChange/);
  });

  it("same-price time-only payload still requested; second request upserts", () => {
    const lib = read("apps/web/lib/ops/edit-request.ts");
    const request = fnBody(lib, "requestCustomerTimeChange");
    expect(request).toMatch(/payload:\s*\{[\s\S]*scheduled_local/);
    expect(request).toMatch(/scheduled_at/);
    expect(lib).toMatch(/booking_edit_request_upsert/);
    expect(request).not.toMatch(/booking_edit_request_accept/);
  });
});

describe("09-10 flight write-through (D-27)", () => {
  it("updates booking_legs.flight_no via asSystem after ownership; no AeroDataBox", () => {
    const lib = read("apps/web/lib/ops/edit-request.ts");
    const write = fnBody(lib, "writeCustomerFlightNo");
    expect(write).toMatch(/writeFlightNumber/);
    const def = read("packages/db/supabase/migrations/20260930210000_system_role_narrow_reads.sql");
    expect(def).toMatch(/set flight_no = p_flight_no/);
    expect(def).toMatch(/insert into public\.booking_events/);
    expect(def).toMatch(/booking\.modified/);
    expect(write).toMatch(/notifyFlightNumber/);
    expect(write).not.toMatch(/AeroDataBox|LX1234/i);
    expect(write).not.toMatch(/info@vamostaxi/);

    const guest = read("apps/web/app/api/manage/flight/route.ts");
    expect(guest).toMatch(/writeCustomerFlightNo/);
    expect(guest).toMatch(/hashManageToken/);
    expect(guest).toMatch(/kind:\s*"guest"|asGuest/);
    expect(guest).not.toMatch(/AeroDataBox|LX1234/i);

    const signed = read("apps/web/app/api/account/bookings/flight/route.ts");
    expect(signed).toMatch(/writeCustomerFlightNo/);
    expect(signed).toMatch(/customerClaims/);
    expect(signed).not.toMatch(/@vamos\/db/);
    expect(signed).toMatch(/kind:\s*"customer"|asCustomer/);
  });

  it("P6 D19: a saved flight number stays saved when its notice fails; the customer lookup reads no erased_at", () => {
    const lib = read("apps/web/lib/ops/edit-request.ts");
    const write = fnBody(lib, "writeCustomerFlightNo");
    // The notice sits in its own try, after the write, so a refused mail claim (23514) is logged, not returned.
    expect(write).toMatch(/try \{\s*await notifyFlightNumber\([\s\S]*?\} catch \(err\) \{\s*console\.error\("writeCustomerFlightNo notice"/);
    // Neither customer role may read bookings.erased_at (column grants): naming it raised 42501.
    const owned = lib.slice(lib.indexOf("async function loadOwnedBooking("), lib.indexOf("async function loadOwnedBooking(") + 1500);
    expect(owned).toMatch(/from public\.bookings/);
    expect(owned.slice(0, owned.indexOf("\n}\n"))).not.toMatch(/b\.erased_at/);
  });

  it("manage-booking posts time-change and flight; confirmation sends them there", () => {
    const page = read("app/pages/manage-booking.dc.html");
    expect(page).toMatch(/time-change/);
    expect(page.toLowerCase()).toMatch(/flight/);
    expect(page).toMatch(/Time-change requested/);
    expect(page).not.toMatch(/AeroDataBox|LX1234/i);

    // 2026-10-01 (owner decision): time, flight and cancel live on Manage booking only.
    const confirm = read("apps/web/app/[locale]/confirmation/[ref]/ConfirmationClient.tsx");
    expect(confirm).not.toMatch(/time-change/);
    expect(confirm).not.toMatch(/\/api\/account\/bookings\//);
    expect(confirm).toMatch(/manageHint/);
    expect(confirm).not.toMatch(/AeroDataBox|LX1234/i);

    const ops = read("app/ops/OpsDetail.dc.html");
    expect(ops).toMatch(/edit-request/);
    expect(ops).toMatch(/refuse/);
  });
});
