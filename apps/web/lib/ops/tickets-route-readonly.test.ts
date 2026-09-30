// apps/web/lib/ops/tickets-route-readonly.test.ts
//
// G27: the dashboard Support page is read-only. PATCH /api/staff/tickets/:id refuses
// a body that carries `reply` before any database or mail call.

import { beforeEach, describe, expect, it, vi } from "vitest";

const asStaff = vi.fn();
const sendContactMessage = vi.fn();

vi.mock("@/lib/ops/staff-json", async () => {
  const actual = await vi.importActual<typeof import("./staff-json")>("./staff-json");
  return {
    ...actual,
    withStaff: (handler: (claims: unknown, request: Request) => Promise<Response> | Response) =>
      (request: Request) => handler({ sub: "s" }, request),
  };
});
vi.mock("@opennextjs/cloudflare", () => ({
  getCloudflareContext: () => ({ env: { RESEND_API_KEY: "re_test" } }),
}));
vi.mock("@/lib/db/identity", () => ({
  asStaff: (...args: unknown[]) => asStaff(...args),
}));
vi.mock("@/lib/forms/notify", () => ({
  sendContactMessage: (...args: unknown[]) => sendContactMessage(...args),
}));

import { PATCH } from "../../app/[locale]/(ops)/api/staff/tickets/[id]/route";

function patch(body: unknown): Promise<Response> {
  const request = new Request("https://dashboard.vamostaxi.site/api/staff/tickets/abc", {
    method: "PATCH",
    body: JSON.stringify(body),
  });
  return (PATCH as unknown as (r: Request) => Promise<Response>)(request);
}

beforeEach(() => {
  asStaff.mockReset();
  sendContactMessage.mockReset();
  asStaff.mockImplementation(async (_e: unknown, _c: unknown, fn: (sql: unknown) => Promise<unknown>) => {
    const sql = async () => [{ ticket_status: "open", phone: "", booking_ref: "" }];
    return fn(sql);
  });
});

describe("PATCH /api/staff/tickets/:id is read-only for replies (G27)", () => {
  it.each([{ reply: "Thanks." }, { reply: "" }, { status: "open", reply: "x" }])(
    "answers 400 read-only for %j with no database call and no mail",
    async (body) => {
      const res = await patch(body);
      expect(res.status).toBe(400);
      expect(await res.json()).toMatchObject({ ok: false, code: "read-only" });
      expect(asStaff).not.toHaveBeenCalled();
      expect(sendContactMessage).not.toHaveBeenCalled();
    },
  );

  it("still closes a ticket", async () => {
    const res = await patch({ status: "closed" });
    expect(res.status).toBe(200);
    expect(sendContactMessage).not.toHaveBeenCalled();
  });

  it("still saves phone, booking ref and note", async () => {
    const res = await patch({ phone: "+41", note: "internal" });
    expect(res.status).toBe(200);
    expect(sendContactMessage).not.toHaveBeenCalled();
  });
});
