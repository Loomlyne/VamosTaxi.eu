// Settings > Security sends PATCH /api/staff/profile with only { password } or
// only { email }. The route used to run updateOwnProfile first, which failed
// with staff-name-required (400) before the change ran.
import { beforeEach, describe, expect, it, vi } from "vitest";

const updateOwnProfile = vi.fn();
const changeOwnPassword = vi.fn();
const changeOwnEmail = vi.fn();
const loadOwnProfile = vi.fn();

vi.mock("@opennextjs/cloudflare", () => ({
  getCloudflareContext: () => ({ env: {} }),
}));
vi.mock("../../../app/[locale]/(ops)/ops/profile/actions", () => ({
  updateOwnProfile: (...a: unknown[]) => updateOwnProfile(...a),
  changeOwnPassword: (...a: unknown[]) => changeOwnPassword(...a),
  changeOwnEmail: (...a: unknown[]) => changeOwnEmail(...a),
}));
vi.mock("@/lib/auth/reauth", () => ({
  hasFreshReauth: async () => true,
  reauthSecret: () => "secret",
  sensitiveProfileChange: () => true,
}));
vi.mock("@/lib/ops/staff", () => ({
  loadOwnProfile: (...a: unknown[]) => loadOwnProfile(...a),
}));
vi.mock("@/lib/ops/staff-json", () => ({
  jsonOk: (data: unknown, status = 200) => Response.json({ ok: true, data }, { status }),
  jsonErr: (code: string, status: number) => Response.json({ ok: false, code }, { status }),
  withStaff:
    (handler: (c: unknown, r: Request) => Promise<Response>) => (r: Request) =>
      handler({ sub: "u1", session_id: "s1", email: "a@b.ch" }, r),
}));

import { PATCH } from "../../../app/[locale]/(ops)/api/staff/profile/route";

function call(body: unknown) {
  return PATCH(
    new Request("https://dashboard.vamostaxi.site/api/staff/profile", {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  updateOwnProfile.mockResolvedValue({ ok: false, key: "staff-name-required" });
  changeOwnPassword.mockResolvedValue({ ok: true });
  changeOwnEmail.mockResolvedValue({ ok: true });
  loadOwnProfile.mockResolvedValue({ fullName: "A" });
});

describe("PATCH /api/staff/profile without profile fields", () => {
  it("changes the password without touching the profile", async () => {
    const res = await call({ password: "a-long-new-password" });
    expect(res.status).toBe(200);
    expect(changeOwnPassword).toHaveBeenCalledWith("a-long-new-password");
    expect(updateOwnProfile).not.toHaveBeenCalled();
  });

  it("changes the e-mail without touching the profile", async () => {
    const res = await call({ email: "new@b.ch" });
    expect(res.status).toBe(200);
    expect(changeOwnEmail).toHaveBeenCalledWith("new@b.ch");
    expect(updateOwnProfile).not.toHaveBeenCalled();
  });

  it("still saves the profile when profile fields are sent", async () => {
    updateOwnProfile.mockResolvedValue({ ok: true });
    const res = await call({ fullName: "A", phone: "1", lang: "de", email: "a@b.ch" });
    expect(res.status).toBe(200);
    expect(updateOwnProfile).toHaveBeenCalledTimes(1);
  });
});
