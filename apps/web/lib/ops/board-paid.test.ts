// D-26 / D-39: a confirmed booking with a captured payment is on the default board whatever its
// day; an unpaid pending booking appears only under "Awaiting payment". Reads the DC source.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { mapBoardBooking, type SqlBoardRow } from "./bookings-map";

const here = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(join(here, "../../../../app/ops/OpsBoard.dc.html"), "utf8");

function fn(name: string): string {
  const m = html.match(new RegExp(`function ${name}\\(b\\) \\{([\\s\\S]*?)\\n\\}`));
  if (!m?.[1]) throw new Error(`missing ${name}`);
  return m[1];
}

type Row = { paid?: boolean; status?: string; driver?: string };
const isClosedStatus = new Function("b", fn("isClosedStatus")) as (b: Row) => boolean;
const isBoardTrip = new Function("b", "isClosedStatus", fn("isBoardTrip")) as (
  b: Row,
  c: typeof isClosedStatus,
) => boolean;
const isUnpaid = new Function("b", fn("isUnpaid")) as (b: Row) => boolean;

const base: SqlBoardRow = {
  id: "00000000-0000-4000-8000-000000000737",
  reference: "VT-26-0737",
  status: "confirmed",
  contact_name: "Test Guest",
  contact_email: null,
  contact_phone: null,
  company_name: null,
  note: null,
  pay_link_sent_at: "2026-09-20T10:00:00Z",
  pickup_text: "Zurich Airport",
  dropoff_text: "Bahnhofstrasse",
  scheduled_local: "2026-09-21 08:15",
  scheduled_at: "2026-09-21T06:15:00Z",
  flight_no: null,
  pax: 2,
  bags: 1,
  class_slug: "economy",
  chauffeur_name: null,
  payment_status: "captured",
  captured_at: "2026-09-20T10:05:00Z",
  payment_created_at: "2026-09-20T10:01:00Z",
  stripe_checkout_session_id: null,
  charged_rappen: null,
};

describe("ops board paid visibility", () => {
  it("maps a captured payment to paid (VT-26-0737 shape), past or future", () => {
    expect(mapBoardBooking(base).paid).toBe(true);
    expect(mapBoardBooking({ ...base, scheduled_local: "2026-01-01 08:15" }).paid).toBe(true);
  });

  it("the paid row is on All and not under Awaiting payment", () => {
    const paid = mapBoardBooking(base);
    expect(isBoardTrip(paid, isClosedStatus)).toBe(true);
    expect(isUnpaid(paid)).toBe(false);
  });

  it("a pending unpaid row (with or without a pay link) is only under Awaiting payment", () => {
    for (const link of ["2026-09-20T10:00:00Z", null]) {
      const pending = mapBoardBooking({
        ...base,
        status: "pending",
        captured_at: null,
        payment_status: null,
        pay_link_sent_at: link,
      });
      expect(pending.paid).toBe(false);
      expect(isBoardTrip(pending, isClosedStatus)).toBe(false);
      expect(isUnpaid(pending)).toBe(true);
    }
  });

  it("cancelled unpaid rows are not awaiting payment", () => {
    expect(isUnpaid({ paid: false, status: "cancelled" })).toBe(false);
  });

  it("the All filter uses isBoardTrip and Awaiting payment uses isUnpaid, and no payLinkSent gate remains", () => {
    expect(html).toMatch(/key:'All', label: t\.filterAll, test: isBoardTrip/);
    expect(html).toMatch(/key:'Awaiting payment', label: t\.filterAwaiting, test: isUnpaid/);
    expect(html).not.toMatch(/payLinkSent && !b\.paid/);
    expect(html.match(/No bookings awaiting payment\./g)?.length).toBe(1);
  });
});
