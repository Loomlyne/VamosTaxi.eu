import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { mapAccountBooking, type AccountSqlRow } from "./bookings";

const now = new Date("2026-09-10T12:00:00.000Z");

const base: AccountSqlRow = {
  reference: "VT-26-0720",
  status: "confirmed",
  price_total_rappen: 12000,
  pickup_text: "Zurich Airport",
  dropoff_text: "Zurich Hauptbahnhof",
  scheduled_local: "2026-09-10T02:45",
  scheduled_at: "2026-09-10T00:45:00.000Z",
  pax: 1,
};

describe("mapAccountBooking", () => {
  it("maps a paid confirmed trip onto BookingRow fields", () => {
    const row = mapAccountBooking(base, now);
    expect(row.ref).toBe("VT-26-0720");
    expect(row.href).toBe("/confirmation/VT-26-0720");
    expect(row.date).toBe("Thu 10 Sept");
    expect(row.time).toBe("02:45");
    expect(row.route).toBe("Zurich Airport → Zurich Hauptbahnhof");
    expect(row.vehicle).toBe("");
    expect(row.chauffeur).toBe("");
    expect(row.pax).toBe(1);
    expect(row.priceRappen).toBe(12000);
    expect(row.status).toBe("booked");
    expect(row.when).toBe("past");
    expect(row.group).toBe("September 2026");
  });

  it("keeps chauffeur and vehicle empty until assigned", () => {
    const row = mapAccountBooking(
      {
        ...base,
        chauffeur_name: null,
        vehicle_plate: null,
        vehicle_model: null,
      },
      now,
    );
    expect(row.chauffeur).toBe("");
    expect(row.vehicle).toBe("");
    expect(row.vehicle).not.toBe("Business");
    expect(row.vehicle).not.toBe("Economy");
  });

  it("joins chauffeur name and fleet plate/model after assign", () => {
    const row = mapAccountBooking(
      {
        ...base,
        status: "assigned",
        chauffeur_name: "Lena Meier",
        vehicle_plate: "ZH 12345",
        vehicle_model: "V-Class",
      },
      now,
    );
    expect(row.chauffeur).toBe("Lena Meier");
    expect(row.vehicle).toBe("ZH 12345 · V-Class");
    expect(row.status).toBe("booked");
    expect(row.vehicle).not.toMatch(/Business|Economy|Van|First/);
  });

  it("maps a sent pay-link onto waiting payment, not a resume href", () => {
    const row = mapAccountBooking(
      {
        ...base,
        status: "pending",
        pay_link_sent_at: "2026-09-10T08:00:00.000Z",
        scheduled_local: "2026-09-12T04:15",
        scheduled_at: "2026-09-12T02:15:00.000Z",
      },
      now,
    );
    expect(row.status).toBe("awaiting_payment");
    expect(row.href).toBe("/confirmation/VT-26-0720");
    expect(row.pay_url).toBeNull();
    expect(row.payable).toBe(false);
    expect(row.when).toBe("upcoming");
  });

  it("shows a paid booking that once had a pay link as booked, never finished", () => {
    const row = mapAccountBooking(
      {
        ...base,
        status: "confirmed",
        pay_link_sent_at: "2026-09-10T08:00:00.000Z",
      },
      now,
    );
    expect(row.status).toBe("booked");
    expect(row.status).not.toBe("finished");
    expect(row.href).toBe("/confirmation/VT-26-0720");
  });

  it("turns Pay off when is_test (D-33)", () => {
    const row = mapAccountBooking(
      {
        ...base,
        status: "pending",
        is_test: true,
        scheduled_local: "2026-09-12T04:15",
        scheduled_at: "2026-09-12T02:15:00.000Z",
      },
      now,
    );
    expect(row.status).toBe("awaiting_payment");
    expect(row.pay_url).toBeNull();
    expect(row.payable).toBe(false);
    expect(row.href).toBe("/confirmation/VT-26-0720");
    expect(row.href).not.toBe("/checkout/payment");
  });

  it("keeps unpaid in upcoming after the pickup time", () => {
    const row = mapAccountBooking(
      {
        ...base,
        status: "pending",
        scheduled_local: "2026-09-09T04:15",
        scheduled_at: "2026-09-09T02:15:00.000Z",
      },
      now,
    );
    expect(row.status).toBe("awaiting_payment");
    expect(row.when).toBe("upcoming");
  });

  it("keeps a future confirmed trip in upcoming", () => {
    const row = mapAccountBooking(
      {
        ...base,
        scheduled_local: "2026-09-11T10:00",
        scheduled_at: "2026-09-11T08:00:00.000Z",
      },
      now,
    );
    expect(row.when).toBe("upcoming");
    expect(row.status).toBe("booked");
  });

  it("does not invent a CHF string or Isolation name", () => {
    const row = mapAccountBooking(base, now);
    expect(JSON.stringify(row)).not.toMatch(/CHF/);
    expect(JSON.stringify(row)).not.toMatch(/Isolation/);
  });
});

describe("GET /api/account/bookings", () => {
  it("lists by asCustomer contact_email and never asSystem SELECT", () => {
    const src = readFileSync(new URL("../../app/api/account/bookings/route.ts", import.meta.url), "utf8");
    expect(src).toContain("asCustomer");
    expect(src).toContain("contact_email");
    expect(src).not.toContain("asSystem");
    expect(src).toContain("<> 'quote'");
    expect(src).not.toContain("not in ('quote', 'pending')");
    expect(src).toContain("exists (select 1 from public.reviews");
    expect(src).toContain("has_review");
    expect(src).toContain("b.is_test");
    expect(src).toContain("b.pay_link_sent_at");
    expect(src).toContain("b.pay_link_sent_at is not null");
  });
});

describe("reviewState", () => {
  it("is none until ops marks completed or no-show", () => {
    expect(mapAccountBooking(base, now).reviewState).toBe("none");
    expect(mapAccountBooking(base, now).reviewHref).toBe("");
  });

  it("is requested with signed-in /review?ref= after completed", () => {
    const row = mapAccountBooking({ ...base, status: "completed" }, now);
    expect(row.reviewState).toBe("requested");
    expect(row.reviewHref).toBe("/review?ref=VT-26-0720");
    expect(row.status).toBe("completed");
  });

  it("is requested after no_show", () => {
    const row = mapAccountBooking({ ...base, status: "no_show" }, now);
    expect(row.reviewState).toBe("requested");
    expect(row.reviewHref).toBe("/review?ref=VT-26-0720");
  });

  it("stays reviewed linking to /review after submit (D-21)", () => {
    const row = mapAccountBooking({ ...base, status: "completed", has_review: true }, now);
    expect(row.reviewState).toBe("reviewed");
    expect(row.reviewHref).toBe("/review");
  });
});

describe("09-11 ops complete wiring", () => {
  it("staff PATCH completed/no_show calls mark RPCs, never a client status write", () => {
    const src = readFileSync(
      new URL("../../app/[locale]/(ops)/api/staff/bookings/[id]/route.ts", import.meta.url),
      "utf8",
    );
    expect(src).toContain("markComplete");
    expect(src).toContain("markNoShow");
    expect(src).toContain('status === "completed"');
    expect(src).toContain('status === "no_show"');
    expect(src).toContain("notifyReviewRequest");
    expect(src).not.toContain("set status = ${");
  });

  it("ops_mark SQL is SECURITY DEFINER, vamos_system only, no auto-refund", () => {
    const sql = readFileSync(
      new URL("../../../../packages/db/supabase/migrations/20260912033121_booking_lifecycle_ops_complete.sql", import.meta.url),
      "utf8",
    );
    expect(sql).toContain("ops_mark_complete");
    expect(sql).toContain("ops_mark_no_show");
    expect(sql).toContain("security definer");
    expect(sql).toContain("to vamos_system");
    expect(sql).not.toContain("to anon");
    expect(sql).not.toContain("record_booking_refund");
    expect(sql).not.toContain("insert into public.booking_refunds");
  });

  it("account and bookings pages render Review trip / Reviewed chips", () => {
    const account = readFileSync(new URL("../../../../app/pages/account.dc.html", import.meta.url), "utf8");
    const bookings = readFileSync(new URL("../../../../app/pages/bookings.dc.html", import.meta.url), "utf8");
    expect(account).toContain("Review trip");
    expect(account).toContain("Reviewed");
    expect(account).toContain("b.reviewHref");
    expect(bookings).toContain("Review trip");
    expect(bookings).toContain("Reviewed");
    expect(bookings).toContain("b.reviewHref");
  });

  it("OpsDetail Complete/No-show PATCH status through the staff API", () => {
    const html = readFileSync(new URL("../../../../app/ops/OpsDetail.dc.html", import.meta.url), "utf8");
    expect(html).toContain("status: 'completed'");
    expect(html).toContain("status: 'no_show'");
    expect(html).toContain("/api/staff/bookings/");
    expect(html).toContain("markComplete");
    expect(html).toContain("markNoShow");
  });
});
