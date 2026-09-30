import { afterEach, describe, expect, it, vi } from "vitest";

const SENTINEL = "vt-sentinel-not-a-key";
const { createUser, generateLink, createClient } = vi.hoisted(() => {
  const createUser = vi.fn();
  const generateLink = vi.fn();
  const createClient = vi.fn(() => ({ auth: { admin: { createUser, generateLink } }, from: vi.fn() }));
  return { createUser, generateLink, createClient };
});

vi.mock("@supabase/supabase-js", () => ({ createClient }));

import { checkoutAuthAdmin, legacyServiceClient, serviceRoleConfigured } from "./service-role";

const env = (o: Record<string, string | undefined>) => o as unknown as CloudflareEnv;
const full = () => env({ SUPABASE_URL: "https://x.supabase.test", SUPABASE_SERVICE_ROLE_KEY: SENTINEL });

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

describe("serviceRoleConfigured", () => {
  it("is false without key, false without url, true with both", () => {
    vi.stubEnv("SUPABASE_URL", "");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
    expect(serviceRoleConfigured(env({}))).toBe(false);
    expect(serviceRoleConfigured(env({ SUPABASE_URL: "https://x.test" }))).toBe(false);
    expect(serviceRoleConfigured(env({ SUPABASE_SERVICE_ROLE_KEY: SENTINEL }))).toBe(false);
    expect(serviceRoleConfigured(full())).toBe(true);
  });
});

describe("checkoutAuthAdmin", () => {
  it("is null when not configured", () => {
    vi.stubEnv("SUPABASE_URL", "");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
    expect(checkoutAuthAdmin(env({}))).toBeNull();
  });

  it("exposes exactly createUser and generateLink", () => {
    const admin = checkoutAuthAdmin(full())!;
    expect(Object.keys(admin)).toEqual(["createUser", "generateLink"]);
    for (const k of ["from", "rpc", "storage", "auth", "schema"]) expect(k in admin).toBe(false);
    expect(Object.isFrozen(admin)).toBe(true);
  });

  it("forwards and maps results", async () => {
    createUser.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
    generateLink.mockResolvedValue({
      data: { properties: { hashed_token: "h", verification_type: "magiclink" } },
      error: null,
    });
    const admin = checkoutAuthAdmin(full())!;
    expect(await admin.createUser({ email: "a@b.co", email_confirm: false, user_metadata: {} })).toEqual({
      userId: "u1",
      errorCode: null,
    });
    expect(await admin.generateLink({ type: "magiclink", email: "a@b.co" })).toEqual({
      hashedToken: "h",
      verificationType: "magiclink",
      errorCode: null,
    });
  });

  it("reduces errors to the code and never leaks message or sentinel", async () => {
    const spies = [vi.spyOn(console, "log"), vi.spyOn(console, "error"), vi.spyOn(console, "warn")];
    createUser.mockResolvedValue({ data: null, error: { code: "email_exists", message: `echo ${SENTINEL} a@b.co` } });
    generateLink.mockRejectedValue(new Error(`boom ${SENTINEL}`));
    const admin = checkoutAuthAdmin(full())!;
    const a = await admin.createUser({ email: "a@b.co", email_confirm: false, user_metadata: {} });
    const b = await admin.generateLink({ type: "magiclink", email: "a@b.co" });
    expect(a).toEqual({ userId: null, errorCode: "email_exists" });
    expect(b.errorCode).toBe("unknown");
    const blob = JSON.stringify([a, b, spies.map((s) => s.mock.calls)]);
    expect(blob).not.toContain(SENTINEL);
    expect(blob).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
    spies.forEach((s) => s.mockRestore());
  });
});

describe("legacyServiceClient", () => {
  it("throws a fixed text when missing, without value or name", () => {
    vi.stubEnv("SUPABASE_URL", "");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
    expect(() => legacyServiceClient(env({}))).toThrow("service role not configured");
  });
  it("builds a client when configured", () => {
    legacyServiceClient(full());
    expect(createClient).toHaveBeenCalledWith("https://x.supabase.test", SENTINEL, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  });
});
