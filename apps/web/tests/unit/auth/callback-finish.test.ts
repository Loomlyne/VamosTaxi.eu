// 27.1 (27 D-37): the confirm button sends an account the sign-in link just made to the finish step,
// carrying a checkout target along; a finished account and the dashboard host are not affected.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { sealAddress } from "@/lib/auth/sealed-address";

const SECRET = "v1,whsec_dGVzdHNlY3JldHRlc3RzZWNyZXQ";
const db = vi.hoisted(() => ({ finish: true, asked: [] as string[] }));
const auth = { verifyOtp: vi.fn(), getUser: vi.fn(), signOut: vi.fn() };

vi.mock("@opennextjs/cloudflare", () => ({
  getCloudflareContext: () => ({ env: { SEND_EMAIL_HOOK_SECRET: SECRET } }),
}));
vi.mock("@/lib/ops/session", () => ({
  getStaffClaims: async () => ({ sub: "user-1" }),
  staffDecisionOf: () => "allow",
}));
vi.mock("@/lib/db/system-reads", () => ({
  readAccountFinishRequired: async (_env: unknown, id: string) => {
    db.asked.push(id);
    return db.finish;
  },
  markAccountFinishPending: async () => undefined,
  markAccountFinished: async () => undefined,
}));
vi.mock("@/lib/supabase/server", () => ({
  authSetCookieHeader: (c: { name: string; value: string }) => `${c.name}=${c.value}; Path=/`,
  createServerSupabaseClient: async () => {
    auth.verifyOtp.mockImplementation(async () => ({ data: { user: { id: "user-1", email: "mia@example.com" } }, error: null }));
    auth.getUser.mockImplementation(async () => ({ data: { user: null } }));
    return { auth };
  },
}));

const { POST } = await import("@/app/api/auth/callback/route");

async function press(extra: Record<string, unknown>, host = "vamostaxi.site"): Promise<Record<string, unknown>> {
  const e = await sealAddress("mia@example.com", "abc", SECRET);
  const res = await POST(
    new Request(`https://${host}/api/auth/callback`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: `https://${host}` },
      body: JSON.stringify({ token_hash: "abc", type: "signup", e, ...extra }),
    }),
  );
  return (await res.json()) as Record<string, unknown>;
}

beforeEach(() => {
  db.finish = true;
  db.asked = [];
});

describe("confirm button, account that must finish", () => {
  it("lands on the localized finish step", async () => {
    expect(await press({ next: "/de/account" })).toEqual({ ok: true, target: "/de/sign-up?state=finish" });
    expect(db.asked).toEqual(["user-1"]);
  });

  it("carries a checkout target as returnTo", async () => {
    const co = "/checkout?from=Zurich%20Airport&class=business";
    const out = await press({ nextb: Buffer.from(co).toString("base64url") });
    const target = new URL(String(out.target), "https://vamostaxi.site");
    expect(target.pathname).toBe("/sign-up");
    expect(target.searchParams.get("returnTo")).toBe(co);
  });

  it("a finished account goes where it was going", async () => {
    db.finish = false;
    expect(await press({ next: "/account" })).toEqual({ ok: true, target: "/account" });
  });

  it("the dashboard host never asks", async () => {
    const out = await press({ next: "/account" }, "dashboard.vamostaxi.site");
    expect(String(out.target)).not.toContain("sign-up");
    expect(db.asked).toEqual([]);
  });
});
