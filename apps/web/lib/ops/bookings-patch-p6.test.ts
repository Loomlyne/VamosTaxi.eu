// apps/web/lib/ops/bookings-patch-p6.test.ts
//
// 26.2 P6 (plan step 4, D6, D8): the in-place save of a PAID booking stops touching places, date,
// time, passengers, bags and class — a body that still carries one gets the named refusal
// "use-change" and nothing is written (that change is priced and confirmed through …/change). Name,
// e-mail, phone and note stay instant and are recorded in the history (booking_staff_contact_update,
// no e-mail); the flight number stays instant, recorded, and the assigned driver gets the existing
// flight-number e-mail. The two old holes are gone with it: an emptied pickup was saved empty, an
// emptied passengers field failed the save.

import { beforeEach, describe, expect, it, vi } from "vitest";

const updateBooking = vi.fn();

vi.mock("@/lib/ops/staff-json", async () => {
  const actual = await vi.importActual<typeof import("./staff-json")>("./staff-json");
  return {
    ...actual,
    withStaff: (handler: (claims: unknown, request: Request) => Promise<Response> | Response) =>
      (request: Request) => handler({ sub: "s" }, request),
  };
});
vi.mock("@opennextjs/cloudflare", () => ({ getCloudflareContext: () => ({ env: {} }) }));
vi.mock("@/lib/lifecycle/notify-lifecycle", () => ({ notifyReviewRequest: vi.fn() }));
vi.mock("@/lib/ops/bookings-write", () => ({
  cancelBooking: vi.fn(),
  eraseBooking: vi.fn(),
  markArrival: vi.fn(),
  markComplete: vi.fn(),
  markNoShow: vi.fn(),
  updateBooking: (...args: unknown[]) => updateBooking(...args),
}));

import { PATCH } from "../../app/[locale]/(ops)/api/staff/bookings/[id]/route";

function patch(body: unknown): Promise<Response> {
  const request = new Request("https://dashboard.vamostaxi.site/api/staff/bookings/VT-1", {
    method: "PATCH",
    body: JSON.stringify(body),
  });
  return (PATCH as unknown as (r: Request) => Promise<Response>)(request);
}

beforeEach(() => {
  updateBooking.mockReset();
  updateBooking.mockResolvedValue({ ok: true, changed: ["contact_phone"], flightChanged: false, driverMailed: false });
});

describe("PATCH /api/staff/bookings/:id on a paid booking (26.2 P6)", () => {
  it.each([
    ["pickup", { pickup: "Zug" }],
    ["an emptied pickup (old hole: saved empty)", { pickup: "" }],
    ["dropoff", { dropoff: "Zug" }],
    ["date and time", { dateIso: "2026-10-08", time: "10:00" }],
    ["passengers", { pax: 3 }],
    ["an emptied passengers field (old hole: Number('') = 0 failed the save)", { pax: 0 }],
    ["bags", { bags: 2 }],
    ["a class", { klass: "business" }],
  ])("refuses %s with 400 use-change and writes nothing", async (_label, body) => {
    const res = await patch({ phone: "+41 79 000 00 00", ...body });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ ok: false, code: "use-change" });
    expect(updateBooking).not.toHaveBeenCalled();
  });

  it("name, e-mail, phone, note and flight go to the instant save, nothing else", async () => {
    const res = await patch({ customer: "Anna Keller", email: "anna@example.com", phone: "+41 79 111 22 33", note: "Gate B", flight: "LX 320" });
    expect(res.status).toBe(200);
    expect(updateBooking.mock.calls[0]?.[3]).toEqual({
      customer: "Anna Keller", email: "anna@example.com", phone: "+41 79 111 22 33", note: "Gate B", flight: "LX 320",
    });
    expect(await res.json()).toMatchObject({ ok: true, data: { id: "VT-1", changed: ["contact_phone"], driverMailed: false } });
  });

  it("an unpaid booking answers 409 unpaid", async () => {
    updateBooking.mockResolvedValue({ ok: false, code: "unpaid" });
    const res = await patch({ phone: "+41 79 000 00 00" });
    expect(res.status).toBe(409);
  });
});

describe("updateBooking: the instant save through the definer function (26.2 P6)", () => {
  it("is booking_staff_contact_update under asSystem; the flight change mails the assigned driver", async () => {
    vi.resetModules();
    vi.doUnmock("@/lib/ops/bookings-write");
    const asStaff = vi.fn();
    const calls: { text: string; values: unknown[] }[] = [];
    const sendFlightNumber = vi.fn(async () => ({ ok: true, providerMessageId: "m1" }));
    vi.doMock("@/lib/db/identity", () => ({
      asStaff: (...a: unknown[]) => asStaff(...a),
      asSystem: async (_env: unknown, fn: (sql: unknown) => Promise<unknown>) =>
        fn((strings: TemplateStringsArray, ...values: unknown[]) => {
          const text = strings.join("?");
          calls.push({ text, values });
          if (text.includes("booking_staff_contact_update")) {
            return Promise.resolve([{ booking_id: "b1", changed_fields: "contact_phone,flight_no", flight_changed: true, assigned_chauffeur_id: "c1" }]);
          }
          if (text.includes("booking_change_mail_facts")) {
            return Promise.resolve([{ email: "marco@example.test", languages_csv: "fr", reference: "VT-1", pickup_text: "A", dropoff_text: "B", scheduled_local: "2026-10-08T10:00" }]);
          }
          return Promise.resolve([]);
        }),
    }));
    vi.doMock("./resolve-booking-id", () => ({ resolveStaffBookingId: async () => "b1" }));
    vi.doMock("@/lib/checkout/manage-token", () => ({ mintManageToken: vi.fn() }));
    vi.doMock("@vamos/emails/confirmation", () => ({
      sendFlightNumber: (...a: unknown[]) => (sendFlightNumber as unknown as (...x: unknown[]) => unknown)(...a),
      chauffeurEmailLocale: (langs: string[]) => (langs[0] === "fr" ? "fr" : "en"),
    }));
    const { updateBooking: real } = await import("./bookings-write");
    const env = { RESEND_API_KEY: "re_test" } as unknown as CloudflareEnv;
    const out = await real(env, { sub: "a1" } as never, "VT-1", { phone: " +41 79 111 22 33 ", flight: " lx 320 " });
    expect(out).toEqual({ ok: true, changed: ["contact_phone", "flight_no"], flightChanged: true, driverMailed: true });
    const write = calls.find((c) => c.text.includes("booking_staff_contact_update"))!;
    expect(write.values).toEqual(["b1", "a1", null, null, " +41 79 111 22 33 ", null, " lx 320 "]);
    // No table write from the Worker: the in-place UPDATE of bookings / booking_legs is gone.
    expect(calls.some((c) => /update\s+public\.(bookings|booking_legs)/i.test(c.text))).toBe(false);
    expect(asStaff).not.toHaveBeenCalled();
    expect(sendFlightNumber).toHaveBeenCalledWith(
      { RESEND_API_KEY: "re_test" },
      { reference: "VT-1", locale: "fr", pickupText: "A", dropoffText: "B", scheduledLocal: "2026-10-08T10:00", flightNo: "LX 320" },
      "marco@example.test",
    );
  });

  it("an unpaid booking is refused by the function and mapped around asSystem", async () => {
    vi.resetModules();
    vi.doUnmock("@/lib/ops/bookings-write");
    vi.doMock("@/lib/db/identity", () => ({
      asStaff: vi.fn(),
      asSystem: async () => {
        throw Object.assign(new Error("unpaid"), { code: "P0001" });
      },
    }));
    vi.doMock("./resolve-booking-id", () => ({ resolveStaffBookingId: async () => "b1" }));
    vi.doMock("@/lib/checkout/manage-token", () => ({ mintManageToken: vi.fn() }));
    const { updateBooking: real } = await import("./bookings-write");
    expect(await real({} as CloudflareEnv, { sub: "a1" } as never, "VT-1", { phone: "x" })).toEqual({ ok: false, code: "unpaid" });
  });
});
