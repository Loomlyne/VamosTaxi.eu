// apps/web/lib/ops/bookings-route-email.test.ts
//
// G20: the dashboard booking edit validates the contact e-mail in the route's parse step.

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
  updateBooking.mockResolvedValue({ ok: true });
});

describe("PATCH /api/staff/bookings/:id e-mail (G20)", () => {
  it.each([
    ["empty", ""],
    ["whitespace", "   "],
    ["no at sign", "ada.example.com"],
    ["no domain dot", "ada@example"],
    ["inner space", "a da@example.com"],
    ["too long", `${"a".repeat(250)}@example.com`],
    ["not a string", 5],
    ["null", null],
  ])("refuses %s with 400 invalid-email and no write", async (_label, email) => {
    const res = await patch({ email });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ ok: false, code: "invalid-email" });
    expect(updateBooking).not.toHaveBeenCalled();
  });

  it("writes a valid e-mail, trimmed", async () => {
    const res = await patch({ email: "  ada@example.com " });
    expect(res.status).toBe(200);
    expect(updateBooking).toHaveBeenCalledTimes(1);
    expect(updateBooking.mock.calls[0]?.[3]).toMatchObject({ email: "ada@example.com" });
  });

  it("leaves the e-mail untouched when the key is absent", async () => {
    const res = await patch({ phone: "+41 79 000 00 00" });
    expect(res.status).toBe(200);
    expect(updateBooking.mock.calls[0]?.[3].email).toBeUndefined();
  });
});
