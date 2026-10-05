// Quick 261003: requestHasStaffSession is true only when the staff gate passes.
import { beforeEach, describe, expect, it, vi } from "vitest";

const gate = vi.fn();
vi.mock("./session", () => ({ requireStaffClaims: (...a: unknown[]) => gate(...a) }));
vi.mock("../supabase/server", () => ({
  createSupabaseServerClient: async () => {
    throw new Error("no request scope in this test");
  },
}));

// S13: the staff row check. Active unless a test says otherwise.
const rowActive = vi.fn(async (_claims: unknown): Promise<boolean> => true);
vi.mock("./staff-active", () => ({ staffRowActive: (claims: unknown) => rowActive(claims) }));

import { requestHasStaffSession } from "./staff-origin";

const request = new Request("https://dashboard.vamostaxi.site/api/checkout/price", { method: "POST" });
const client = { tag: "client" } as never;

beforeEach(() => {
  gate.mockReset();
  rowActive.mockReset();
  rowActive.mockResolvedValue(true);
});

describe("requestHasStaffSession", () => {
  it("true when requireStaffClaims resolves and the staff row is active", async () => {
    gate.mockResolvedValue({ sub: "u", role: "authenticated" });
    expect(await requestHasStaffSession(request, async () => client)).toBe(true);
    expect(gate).toHaveBeenCalledWith(client);
    expect(rowActive).toHaveBeenCalledWith({ sub: "u", role: "authenticated" });
  });

  it("S13: false when the staff row is switched off or the check cannot answer", async () => {
    gate.mockResolvedValue({ sub: "u", role: "authenticated" });
    rowActive.mockResolvedValueOnce(false);
    expect(await requestHasStaffSession(request, async () => client)).toBe(false);
    rowActive.mockRejectedValueOnce(new Error("down"));
    expect(await requestHasStaffSession(request, async () => client)).toBe(false);
    // The check is injectable for callers that already hold one.
    expect(await requestHasStaffSession(request, async () => client, undefined, async () => false)).toBe(false);
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
