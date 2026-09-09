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
});
