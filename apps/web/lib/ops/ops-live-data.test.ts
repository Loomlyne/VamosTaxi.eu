// apps/web/lib/ops/ops-live-data.test.ts
//
// Comment 8–10: customers from bookings, bookings board, no Support fixtures.
// File proofs + mapper unit tests. No Hyperdrive.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { mapBoardBooking } from "./bookings-map";
import { mapTicket } from "./tickets-map";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "../../../..");

function read(rel: string): string {
  return readFileSync(join(repoRoot, rel), "utf8");
}

describe("ops live data — comments 8–10", () => {
  it("ops console uses path routing with no hash hrefs", () => {
    const ops = read("app/ops/ops.dc.html");
    expect(ops).toMatch(/function readPath/);
    expect(ops).not.toMatch(/function readHash/);
    expect(ops).not.toMatch(/hashchange/);
    expect(ops).not.toMatch(/vt-ops-hash-switch/);
    const files = [
      "app/ops/OpsSidebar.dc.html",
      "app/ops/OpsDash.dc.html",
      "app/ops/OpsBoard.dc.html",
      "app/ops/OpsCalendarBoard.dc.html",
      "app/ops/OpsDetail.dc.html",
      "app/ops/OpsCustomers.dc.html",
      "app/ops/OpsFleet.dc.html",
    ];
    for (const f of files) {
      const t = read(f);
      expect(t, f).not.toMatch(/href="#/);
      expect(t, f).not.toMatch(/href:'#/);
      expect(t, f).not.toMatch(/location\.hash/);
    }
    const sidebar = read("app/ops/OpsSidebar.dc.html");
    expect(sidebar).toMatch(/href="\/dashboard"/);
    expect(sidebar).toMatch(/href:'\/support'/);
    expect(sidebar).not.toMatch(/#staff/);
    const board = read("app/ops/OpsBoard.dc.html");
    expect(board).toMatch(/\/bookings\/' \+ encodeURIComponent\(row\.id\)/);
    expect(board).not.toMatch(/#detail\//);
    const mw = read("apps/web/middleware.ts");
    expect(mw).toMatch(/serveOpsDc/);
    expect(mw).toMatch(/isOpsConsolePath/);
    expect(mw).not.toMatch(/href="#/);
  });

  it("hydrates bookings from GET /api/staff/bookings", () => {
    const data = read("app/vamos-ops-data.js");
    expect(data).toMatch(/bookings:\s*restCollection\(['"]bookings['"]/);
    expect(data).not.toMatch(/function emptyBookings/);
    expect(data).toMatch(/sessionExpiresAt/);
    expect(data).toMatch(/c\.name \|\| c\.fullName/);
    const list = read("apps/web/app/[locale]/(ops)/api/staff/bookings/route.ts");
    const pub = read("apps/web/app/api/staff/bookings/route.ts");
    expect(list).toMatch(/loadBookings/);
    expect(list).not.toMatch(/export const POST/);
    expect(pub).toMatch(/export \{ GET \}/);
  });

  it("customers list unions checkout emails", () => {
    const src = read("apps/web/lib/ops/customers.ts");
    expect(src).toMatch(/group by lower\(b\.contact_email::text\)/);
    expect(src).toMatch(/mergeCustomers/);
  });

  it("Support has no fixture tickets and GET /api/staff/tickets", () => {
    const html = read("app/ops/OpsSupportTicket.dc.html");
    expect(html).not.toMatch(/FIXTURES/);
    expect(html).not.toMatch(/fixture\.test/);
    expect(html).not.toMatch(/Fixture New/);
    expect(html).toMatch(/\/api\/staff\/tickets/);
    const list = read("apps/web/app/[locale]/(ops)/api/staff/tickets/route.ts");
    expect(list).toMatch(/loadTickets/);
    expect(list).not.toMatch(/export const POST/);
  });

  it("bookings board defaults to All and does not mention cash", () => {
    const board = read("app/ops/OpsBoard.dc.html");
    expect(board).toMatch(/filter: 'All'/);
    expect(board).toMatch(/filterAll/);
    expect(board).not.toMatch(/cash confirmation/);
    expect(board).toMatch(/Pay-link not sent/);
    expect(board).toMatch(/colCustomer/);
  });

  it("maps an unpaid quote with an open card session", () => {
    const row = mapBoardBooking({
      id: "11111111-1111-1111-1111-111111111111",
      reference: "VT-26-0707",
      status: "quote",
      contact_name: "Ada",
      contact_email: "ada@example.com",
      contact_phone: "+41 79 000 00 00",
      company_name: null,
      note: null,
      pay_link_sent_at: null,
      pickup_text: "Zurich Airport (ZRH)",
      dropoff_text: "Zurich city",
      scheduled_local: "2026-09-24T15:50",
      scheduled_at: "2026-09-24T15:50:00+00",
      flight_no: "LX123",
      pax: 2,
      bags: 1,
      class_slug: "economy",
      chauffeur_name: null,
      payment_status: "requires_payment",
      captured_at: null,
      payment_created_at: "2026-09-09T10:00:00.000Z",
      stripe_checkout_session_id: "cs_test_1",
      charged_rappen: null,
    });
    expect(row.id).toBe("VT-26-0707");
    expect(row.customer).toBe("Ada");
    expect(row.email).toBe("ada@example.com");
    expect(row.paid).toBe(false);
    expect(row.paidByCard).toBe(false);
    expect(row.cardSession).toBe(true);
    expect(row.dateIso).toBe("2026-09-24");
    expect(row.time).toBe("15:50");
    expect(row.sessionExpiresAt).toBe("2026-09-10T10:00:00.000Z");
    expect(row.totalRappen).toBe(0);
    expect(row.capturedAt).toBe("");
    expect(row.vehicle).toBe("");
    expect(row.refundRappen).toBe(0);
    expect(row.stripeFeeRappen).toBeNull();
    expect(row.durationMin).toBe(0);
    expect(row.couponCode).toBe("");
    expect(row.extras).toEqual([]);
  });

  it("maps snapshot duration, coupon, and extras onto the board row", () => {
    const row = mapBoardBooking({
      id: "11111111-1111-1111-1111-111111111111",
      reference: "VT-26-0720",
      status: "confirmed",
      contact_name: "Ada",
      contact_email: "ada@example.com",
      contact_phone: "+41 79 000 00 00",
      company_name: null,
      note: null,
      pay_link_sent_at: null,
      pickup_text: "Zurich Airport",
      dropoff_text: "Zurich Hauptbahnhof",
      scheduled_local: "2026-09-10T02:45",
      scheduled_at: "2026-09-10T00:45:00+00",
      flight_no: null,
      pax: 1,
      bags: 0,
      class_slug: "business",
      chauffeur_name: null,
      payment_status: "succeeded",
      captured_at: "2026-09-09T16:42:29.000Z",
      payment_created_at: "2026-09-09T16:40:00.000Z",
      stripe_checkout_session_id: "cs_test_paid",
      charged_rappen: 12000,
      duration_min: 16,
      distance_km: 10.6,
      coupon_code: "WELCOME",
      policy: { extras: ["child_seat"] },
    });
    expect(row.durationMin).toBe(16);
    expect(row.distanceKm).toBe(10.6);
    expect(row.couponCode).toBe("WELCOME");
    expect(row.extras).toEqual(["child_seat"]);
  });

  it("maps a captured fare onto the board row", () => {
    const row = mapBoardBooking({
      id: "11111111-1111-1111-1111-111111111111",
      reference: "VT-26-0716",
      status: "pending",
      contact_name: "Ada",
      contact_email: "ada@example.com",
      contact_phone: "+41 79 000 00 00",
      company_name: null,
      note: null,
      pay_link_sent_at: null,
      pickup_text: "Zurich Airport (ZRH)",
      dropoff_text: "Zurich city",
      scheduled_local: "2026-09-24T15:50",
      scheduled_at: "2026-09-24T15:50:00+00",
      flight_no: "LX123",
      pax: 2,
      bags: 1,
      class_slug: "economy",
      chauffeur_name: null,
      payment_status: "succeeded",
      captured_at: "2026-09-09T16:42:29.000Z",
      payment_created_at: "2026-09-09T16:40:00.000Z",
      stripe_checkout_session_id: "cs_test_paid",
      charged_rappen: 10000,
    });
    expect(row.paidByCard).toBe(true);
    expect(row.paid).toBe(true);
    expect(row.totalRappen).toBe(10000);
    expect(row.capturedAt).toBe("2026-09-09T16:42:29.000Z");
    expect(row.klass).toBe("Economy");
    expect(row.vehicle).toBe("");
    expect(row.customer).not.toMatch(/Isolation/);
    expect(row.stripeFeeRappen).toBeNull();
  });

  it("bookings board paints charged fare instead of a hardcoded 000", () => {
    const board = read("app/ops/OpsBoard.dc.html");
    const detail = read("app/ops/OpsDetail.dc.html");
    const data = read("app/vamos-ops-data.js");
    expect(board).toMatch(/fareLabel\(r\.totalRappen\)/);
    expect(board).not.toMatch(/render: \(\) => 'CHF 000'/);
    expect(detail).toMatch(/openEdit/);
    expect(detail).toMatch(/\/api\/staff\/bookings\//);
    expect(detail).toMatch(/pickupDetail/);
    expect(detail).toMatch(/data-ops-tags/);
    expect(detail).toMatch(/data-ops-detail-bar/);
    expect(detail).toMatch(/data-ops-route/);
    expect(detail).toMatch(/eventActor/);
    expect(detail).not.toMatch(/order:-1/);
    expect(data).toMatch(/totalRappen/);
  });

  it("maps a contact submission into a Support ticket", () => {
    const ticket = mapTicket(
      {
        id: "22222222-2222-2222-2222-222222222222",
        name: "Real Person",
        email: "real@vamostaxi.site",
        phone: null,
        booking_ref: null,
        message: "Need a quote",
        locale: "en",
        ticket_status: null,
        created_at: "2026-09-04T07:12:00.000Z",
        last_activity_at: null,
      },
      [],
    );
    expect(ticket.status).toBe("new");
    expect(ticket.name).toBe("Real Person");
    expect(ticket.messages).toHaveLength(1);
    expect(ticket.messages[0]?.body).toBe("Need a quote");
    expect(ticket.ticketId).toMatch(/^TKT-/);
  });

  it("maps captured sums and omits a missing Stripe fee", () => {
    const row = mapBoardBooking({
      id: "33333333-3333-3333-3333-333333333333",
      reference: "VT-26-0802",
      status: "pending",
      contact_name: "Ada",
      contact_email: "ada@example.com",
      contact_phone: "+41 79 000 00 00",
      company_name: null,
      note: null,
      pay_link_sent_at: null,
      pickup_text: "Zurich Airport (ZRH)",
      dropoff_text: "Zurich city",
      scheduled_local: "2026-09-24T15:50",
      scheduled_at: "2026-09-24T15:50:00+00",
      flight_no: null,
      pax: 1,
      bags: 0,
      class_slug: "business",
      chauffeur_name: null,
      payment_status: "succeeded",
      captured_at: "2026-09-10T08:00:00.000Z",
      payment_created_at: "2026-09-10T07:50:00.000Z",
      stripe_checkout_session_id: "cs_test_sum",
      charged_rappen: 15000,
      refund_rappen: 2000,
    });
    expect(row.capturedAt).toBe("2026-09-10T08:00:00.000Z");
    expect(row.paid).toBe(true);
    expect(row.totalRappen).toBe(15000);
    expect(row.refundRappen).toBe(2000);
    expect(row.klass).toBe("Business");
    expect(row.vehicle).toBe("");
    expect(row.stripeFeeRappen).toBeNull();
  });

  it("keeps unpaid requires_payment off income", () => {
    const row = mapBoardBooking({
      id: "44444444-4444-4444-4444-444444444444",
      reference: "VT-26-0803",
      status: "pending",
      contact_name: "Ada",
      contact_email: "ada@example.com",
      contact_phone: "+41 79 000 00 00",
      company_name: null,
      note: null,
      pay_link_sent_at: "2026-09-10T08:00:00.000Z",
      pickup_text: "Zurich Airport (ZRH)",
      dropoff_text: "Zurich city",
      scheduled_local: "2026-09-24T15:50",
      scheduled_at: "2026-09-24T15:50:00+00",
      flight_no: null,
      pax: 1,
      bags: 0,
      class_slug: "van",
      chauffeur_name: null,
      payment_status: "requires_payment",
      captured_at: null,
      payment_created_at: "2026-09-10T08:00:00.000Z",
      stripe_checkout_session_id: "cs_test_open",
      charged_rappen: 18000,
    });
    expect(row.paid).toBe(false);
    expect(row.totalRappen).toBe(0);
    expect(row.capturedAt).toBe("");
    expect(row.klass).toBe("Van");
    expect(row.vehicle).toBe("");
  });

  it("never emits Isolation names or VT-48 fixtures from the mapper", () => {
    const src = read("apps/web/lib/ops/bookings-map.ts");
    expect(src).not.toMatch(/Isolation/);
    expect(src).not.toMatch(/VT-48/);
    const row = mapBoardBooking({
      id: "55555555-5555-5555-5555-555555555555",
      reference: "VT-26-0804",
      status: "pending",
      contact_name: "Ada",
      contact_email: "ada@example.com",
      contact_phone: null,
      company_name: null,
      note: null,
      pay_link_sent_at: null,
      pickup_text: "ZRH",
      dropoff_text: "Zurich",
      scheduled_local: "2026-09-24T09:00",
      scheduled_at: "2026-09-24T09:00:00+00",
      flight_no: null,
      pax: 1,
      bags: 0,
      class_slug: "economy",
      chauffeur_name: null,
      vehicle_plate: "ZH 12345",
      vehicle_model: "E-Class",
      payment_status: "succeeded",
      captured_at: "2026-09-10T09:00:00.000Z",
      payment_created_at: "2026-09-10T08:50:00.000Z",
      stripe_checkout_session_id: "cs_test_plate",
      charged_rappen: 8000,
    });
    expect(row.vehicle).toBe("ZH 12345 · E-Class");
    expect(row.customer).not.toMatch(/Isolation/);
    expect(row.id).not.toMatch(/VT-48/);
  });

  it("OpsDash has no chauffeur-pay placeholders and filters money by capturedAt", () => {
    const dash = read("app/ops/OpsDash.dc.html");
    expect(dash).not.toMatch(/Chauffeur pay/);
    expect(dash).not.toMatch(/Fuel and tolls/);
    expect(dash).not.toMatch(/Vehicle leasing/);
    expect(dash).not.toMatch(/emptyBookings/);
    expect(dash).not.toMatch(/VT-48/);
    expect(dash).not.toMatch(/Isolation/);
    expect(dash).toMatch(/capturedAt/);
    expect(dash).toMatch(/zurichToday/);
    expect(dash).not.toMatch(/href="#/);
    expect(dash).not.toMatch(/href:'#/);
    expect(dash).toMatch(/\/bookings\?filter=Unassigned/);
    expect(dash).not.toMatch(/href=['"]\/support/);
    expect(dash).not.toMatch(/staff\/tickets/);
    expect(dash).toMatch(/Paid, no chauffeur yet/);
    expect(dash).toMatch(/fareLabel/);
  });

  it("board stays empty without fixtures and reads the filter query", () => {
    const board = read("app/ops/OpsBoard.dc.html");
    const data = read("app/vamos-ops-data.js");
    expect(board).not.toMatch(/emptyBookings/);
    expect(board).not.toMatch(/VT-48/);
    expect(board).not.toMatch(/Isolation/);
    expect(board).not.toMatch(/cash confirmation/);
    expect(board).toMatch(/function filterFromLocation/);
    expect(board).toMatch(/VamosOps\.bookings\.all\(\)/);
    expect(board).toMatch(/fareLabel\(r\.totalRappen\)/);
    expect(data).not.toMatch(/function emptyBookings/);
    expect(data).toMatch(/capturedAt: str\(b\.capturedAt\)/);
  });

  it("customers CRM has no Isolation names", () => {
    const html = read("app/ops/OpsCustomers.dc.html");
    const src = read("apps/web/lib/ops/customers.ts");
    expect(html).not.toMatch(/Isolation/);
    expect(src).not.toMatch(/Isolation/);
    expect(html).not.toMatch(/location\.hash/);
  });

  it("ops live board polls with visibility and never Realtime", () => {
    const data = read("app/vamos-ops-data.js");
    expect(data).toMatch(/visibilitychange/);
    expect(data).toMatch(/POLL_MS = 3000/);
    expect(data).toMatch(/document\.visibilityState/);
    expect(data).not.toMatch(/supabase\.channel/);
    expect(data).not.toMatch(/function emptyBookings/);
    const page = read("app/pages/bookings.dc.html");
    expect(page).toMatch(/visibilitychange/);
    expect(page).toMatch(/\/api\/account\/bookings/);
    expect(page).not.toMatch(/emptyBookings/);
  });
});
