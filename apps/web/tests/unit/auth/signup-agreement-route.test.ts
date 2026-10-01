// 27 D-03a: POST /api/auth refuses a sign-up without the tick and records the agreement before Supabase.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { authPost, resetHarness, state } from "./harness";

const db = vi.hoisted(() => ({ calls: [] as unknown[][], order: [] as string[], fail: false }));

vi.mock("@opennextjs/cloudflare", async () => (await import("./harness")).cloudflareMock);
vi.mock("next/headers", async () => (await import("./harness")).headersMock);
vi.mock("@supabase/ssr", async () => (await import("./harness")).ssrMock);
vi.mock("@/lib/db/identity", () => ({
  asSystem: async (_env: unknown, fn: (tx: unknown) => Promise<void>) => {
    db.order.push("db");
    if (db.fail) throw Object.assign(new Error("down a@b.co"), { code: "42501" });
    const tx = async (_s: TemplateStringsArray, ...values: unknown[]) => {
      db.calls.push(values);
      return [];
    };
    await fn(tx);
  },
}));

const { POST } = await import("@/app/api/auth/route");

const pw = { mode: "signup", method: "password", email: "a@b.co", password: "12345678", firstName: "A", lastName: "B" };
const magic = { mode: "signup", method: "magic", email: "a@b.co", firstName: "A", lastName: "B" };

let signUp: ReturnType<typeof vi.fn>;
let otp: ReturnType<typeof vi.fn>;

beforeEach(() => {
  resetHarness();
  db.calls = [];
  db.order = [];
  db.fail = false;
  signUp = vi.fn(async () => {
    db.order.push("signUp");
    return { error: null };
  });
  otp = vi.fn(async () => {
    db.order.push("otp");
    return { error: null };
  });
  state.auth.signUp = signUp as never;
  state.auth.signInWithOtp = otp as never;
});

describe("without the tick", () => {
  for (const [name, body] of [["password", pw], ["magic", magic]] as const) {
    it(`${name} sign-up is refused with 400 consent-required`, async () => {
      for (const extra of [{}, { consent: false }, { consent: "true" }]) {
        const res = await POST(authPost({ ...body, ...extra }));
        expect(res.status).toBe(400);
        expect(await res.json()).toEqual({ ok: false, reason: "consent-required" });
      }
      expect(signUp).not.toHaveBeenCalled();
      expect(otp).not.toHaveBeenCalled();
      expect(db.order).toEqual([]);
    });
  }
});

describe("with the tick", () => {
  it("password: records once, before signUp, answer unchanged", async () => {
    const res = await POST(authPost({ ...pw, locale: "fr", consent: true }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ stage: "sent" });
    expect(db.order).toEqual(["db", "signUp"]);
    expect(db.calls).toHaveLength(1);
    expect(db.calls[0]?.slice(0, 3)).toEqual(["a@b.co", "2026-09-29", "fr"]);
    expect(db.calls[0]?.[4]).toBe("203.0.113.0");
  });

  it("magic: records once, before signInWithOtp with shouldCreateUser true", async () => {
    const res = await POST(authPost({ ...magic, consent: true }));
    expect(await res.json()).toEqual({ stage: "sent" });
    expect(db.order).toEqual(["db", "otp"]);
    expect((otp.mock.calls[0]?.[0] as { options: { shouldCreateUser: boolean } }).options.shouldCreateUser).toBe(true);
  });

  for (const [name, body] of [["password", pw], ["magic", magic]] as const) {
    it(`${name}: a failed record answers 503 and calls nothing, no e-mail in the log`, async () => {
      db.fail = true;
      const err = vi.spyOn(console, "error").mockImplementation(() => undefined);
      const res = await POST(authPost({ ...body, consent: true }));
      expect(res.status).toBe(503);
      expect(await res.json()).toEqual({ ok: false, reason: "signup-unavailable" });
      expect(signUp).not.toHaveBeenCalled();
      expect(otp).not.toHaveBeenCalled();
      expect(JSON.stringify(err.mock.calls)).not.toContain("a@b.co");
      err.mockRestore();
    });
  }
});

describe("other paths", () => {
  it("dashboard host: sent, no database call, no account", async () => {
    for (const body of [pw, magic]) {
      for (const consent of [true, undefined]) {
        const res = await POST(authPost({ ...body, consent }, "dashboard.vamostaxi.site"));
        expect(await res.json()).toEqual({ stage: "sent" });
      }
    }
    expect(db.order).not.toContain("db");
    expect(signUp).not.toHaveBeenCalled();
  });

  it("sign-in, forgot, resend need no consent and touch no database", async () => {
    await POST(authPost({ mode: "signin", method: "password", email: "a@b.co", password: "12345678" }));
    await POST(authPost({ mode: "signin", method: "magic", email: "a@b.co" }));
    await POST(authPost({ mode: "forgot", email: "a@b.co" }));
    expect(db.order).not.toContain("db");
    // 27 D-37: the public sign-in link makes the account; its tick comes on the finish step, not here.
    expect((otp.mock.calls[0]?.[0] as { options: { shouldCreateUser: boolean } }).options.shouldCreateUser).toBe(true);
  });
});
