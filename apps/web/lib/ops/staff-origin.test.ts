// Quick 261003: requestHasStaffSession is true only when the staff gate passes.
import { beforeEach, describe, expect, it, vi } from "vitest";

const gate = vi.fn();
vi.mock("./session", () => ({ requireStaffClaims: (...a: unknown[]) => gate(...a) }));
vi.mock("../supabase/server", () => ({
  createSupabaseServerClient: async () => {
    throw new Error("no request scope in this test");
  },
}));

import { requestHasStaffSession } from "./staff-origin";

const request = new Request("https://dashboard.vamostaxi.site/api/checkout/price", { method: "POST" });
const client = { tag: "client" } as never;

beforeEach(() => gate.mockReset());

describe("requestHasStaffSession", () => {
  it("true when requireStaffClaims resolves", async () => {
    gate.mockResolvedValue({ sub: "u", role: "authenticated" });
    expect(await requestHasStaffSession(request, async () => client)).toBe(true);
    expect(gate).toHaveBeenCalledWith(client);
  });

  it("false when the gate refuses (no session, not staff, needs MFA)", async () => {
    for (const reason of ["no-session", "not-staff", "needs-mfa"]) {
      gate.mockRejectedValueOnce(Object.assign(new Error(reason), { reason }));
      expect(await requestHasStaffSession(request, async () => client)).toBe(false);
    }
  });

  it("false when the client cannot be built", async () => {
    expect(await requestHasStaffSession(request, async () => Promise.reject(new Error("no env")))).toBe(false);
    expect(await requestHasStaffSession(request)).toBe(false);
    expect(gate).not.toHaveBeenCalled();
  });
});
