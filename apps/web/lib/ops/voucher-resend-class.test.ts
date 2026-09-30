// apps/web/lib/ops/voucher-resend-class.test.ts
//
// 26.2-BP A7: the resent confirmation names the vehicle class the way the first
// confirmation does (the class name), not the raw slug. Fakes only, no Hyperdrive.

import { beforeEach, describe, expect, it, vi } from "vitest";

const sendConfirmation = vi.fn();
let mailRow: Record<string, unknown> = {};

function fakeSql() {
  return (strings: TemplateStringsArray) => {
    const text = strings.join("?");
    if (text.includes("booking_payments")) return Promise.resolve([{ id: 1 }]);
    if (text.includes("checkout_booking_for_email")) return Promise.resolve([mailRow]);
    if (text.includes("booking_snapshot_policy")) return Promise.resolve([{ policy: null }]);
    return Promise.resolve([]);
  };
}

vi.mock("@/lib/db/identity", () => ({
  asStaff: (_env: unknown, _claims: unknown, fn: (sql: unknown) => unknown) => fn(fakeSql()),
  asSystem: (_env: unknown, fn: (sql: unknown) => unknown) => fn(fakeSql()),
}));
vi.mock("@/lib/checkout/manage-token", () => ({
  mintManageToken: async () => ({ raw: "rawtoken0123456789", hash: new Uint8Array(32) }),
}));
vi.mock("./resolve-booking-id", () => ({
  resolveStaffBookingId: async () => "00000000-0000-4000-8000-000000000001",
}));
vi.mock("@vamos/emails/confirmation", () => ({
  sendConfirmation: (...a: unknown[]) => sendConfirmation(...a),
}));

import { resendVoucher } from "./voucher";

const env = { RESEND_API_KEY: "re_test" } as unknown as CloudflareEnv;
const claims = {} as never;

function row(over: Record<string, unknown>) {
  return {
    reference: "VT-26-0042",
    locale: "de",
    contact_name: "Ada Lovelace",
    contact_email: "ada@example.test",
    price_total_rappen: 11300,
    pickup_text: "Zürich Flughafen",
    dropoff_text: "Bahnhofstrasse 1",
    scheduled_local: "2026-09-22T19:55",
    flight_no: null,
    pax: 2,
    bags: 1,
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  sendConfirmation.mockResolvedValue({ ok: true, providerMessageId: "re_1" });
});

describe("resendVoucher vehicle class label (A7)", () => {
  it.each([
    ["saden", "Economy"],
    ["mercedes-benz-v-class", "Business"],
    ["van-luxury", "Van luxury"],
  ])("prints the class name for slug %s", async (slug, name) => {
    mailRow = row({ vehicle_class_slug: slug, vehicle_class_name: name });
    const res = await resendVoucher(env, claims, "VT-26-0042");
    expect(res).toEqual({ ok: true, email: "ada@example.test" });
    const payload = sendConfirmation.mock.calls[0]?.[1] as { legs: { vehicleClassLabel: string }[] };
    expect(payload.legs[0]?.vehicleClassLabel).toBe(name);
  });

  it("falls back to the slug when the class row has no name", async () => {
    mailRow = row({ vehicle_class_slug: "saden", vehicle_class_name: null });
    await resendVoucher(env, claims, "VT-26-0042");
    const payload = sendConfirmation.mock.calls[0]?.[1] as { legs: { vehicleClassLabel: string }[] };
    expect(payload.legs[0]?.vehicleClassLabel).toBe("saden");
  });
});
