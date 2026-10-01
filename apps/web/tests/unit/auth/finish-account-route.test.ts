// 27.1 (27 D-37): the finish step through POST /api/auth, the code sign-in's finish flag, the session
// snapshot's finishRequired (only when asked) and the confirm button's finish target.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { authPost, resetHarness, setCookieHeaders, state, writeCookies } from "./harness";

const db = vi.hoisted(() => ({ finish: true as boolean | Error, order: [] as string[], recordFails: false }));

vi.mock("@opennextjs/cloudflare", async () => (await import("./harness")).cloudflareMock);
vi.mock("next/headers", async () => (await import("./harness")).headersMock);
vi.mock("@supabase/ssr", async () => (await import("./harness")).ssrMock);
vi.mock("@/lib/db/system-reads", () => ({
  readAccountFinishRequired: async () => {
    db.order.push("read");
    if (db.finish instanceof Error) throw db.finish;
    return db.finish;
  },
}));
vi.mock("@/lib/db/identity", () => ({
  asSystem: async (_env: unknown, fn: (tx: unknown) => Promise<unknown>) => {
    if (db.recordFails) throw Object.assign(new Error("x"), { code: "42501" });
    db.order.push("record");
    return fn(async () => []);
  },
}));

const { POST } = await import("@/app/api/auth/route");
const { GET: SESSION } = await import("@/app/api/auth/session/route");
const session = { name: "sb-x-auth-token", value: "session-2", options: { path: "/" } };
const mia = { id: "user-1", email: "mia@example.test", user_metadata: {}, app_metadata: {}, email_confirmed_at: "2026-10-01" };
const body = { action: "finish-account", firstName: "Mia", lastName: "Keller", phone: "+41 79 000 00 00", consent: true };

beforeEach(() => {
  resetHarness();
  db.finish = true;
  db.order = [];
  db.recordFails = false;
  state.auth.getUser = (async () => ({ data: { user: mia }, error: null })) as never;
});

describe("POST /api/auth finish-account", () => {
  it("records the tick, then saves the profile, and sends the refreshed session cookie", async () => {
    const update = vi.fn(async (_a: unknown) => {
      db.order.push("profile");
      writeCookies(session);
      return { error: null };
    });
    state.auth.updateUser = update as never;
    const res = await POST(authPost(body));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(db.order).toEqual(["read", "record", "profile"]);
    expect(update).toHaveBeenCalledWith({
      data: { first_name: "Mia", last_name: "Keller", full_name: "Mia Keller", phone: "+41 79 000 00 00" },
    });
    expect(setCookieHeaders(res).join("\n")).toContain("sb-x-auth-token=session-2");
    expect(res.headers.get("cache-control")).toBe("private, no-store");
  });

  it("without the tick: 400 consent-required, nothing read or written", async () => {
    const update = vi.fn();
    state.auth.updateUser = update as never;
    const res = await POST(authPost({ ...body, consent: false }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ ok: false, reason: "consent-required" });
    expect(db.order).toEqual([]);
    expect(update).not.toHaveBeenCalled();
  });

  it("signed out: 401, nothing written", async () => {
    state.auth.getUser = (async () => ({ data: { user: null }, error: null })) as never;
    const res = await POST(authPost(body));
    expect(res.status).toBe(401);
    expect(db.order).toEqual([]);
  });

  it("record failure: 503 signup-unavailable and no profile write", async () => {
    db.recordFails = true;
    const update = vi.fn();
    state.auth.updateUser = update as never;
    const res = await POST(authPost(body));
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ ok: false, reason: "signup-unavailable" });
    expect(update).not.toHaveBeenCalled();
  });

  it("an e-mail in the body is refused, never used", async () => {
    const res = await POST(authPost({ ...body, email: "other@example.test" }));
    expect(res.status).toBe(400);
    expect(db.order).toEqual([]);
  });

  it("is not offered on the dashboard host", async () => {
    const res = await POST(authPost(body, "dashboard.vamostaxi.site"));
    expect(res.status).toBe(404);
    expect(db.order).toEqual([]);
  });
});

describe("verify-code on an account the sign-in link made", () => {
  it("answers finish: true so the page opens the finish step", async () => {
    state.auth.verifyOtp = (async () => {
      writeCookies(session);
      return { error: null };
    }) as never;
    const res = await POST(authPost({ mode: "verify-code", email: "mia@example.test", code: "123456" }));
    expect(await res.json()).toEqual({ ok: true, finish: true });
  });

  it("a finished account answers plain ok", async () => {
    db.finish = false;
    state.auth.verifyOtp = (async () => ({ error: null })) as never;
    const res = await POST(authPost({ mode: "verify-code", email: "mia@example.test", code: "123456" }));
    expect(await res.json()).toEqual({ ok: true });
  });
});

describe("GET /api/auth/session finishRequired", () => {
  it("is read only when asked with ?finish=1", async () => {
    const plain = (await (await SESSION(new Request("https://vamostaxi.site/api/auth/session"))).json()) as Record<string, unknown>;
    expect(plain.finishRequired).toBe(false);
    expect(db.order).toEqual([]);
    const asked = (await (await SESSION(new Request("https://vamostaxi.site/api/auth/session?finish=1"))).json()) as Record<string, unknown>;
    expect(asked).toMatchObject({ signedIn: true, email: "mia@example.test", finishRequired: true });
  });

  it("a failed read answers false, so the account page still opens", async () => {
    db.finish = new Error("down");
    const asked = (await (await SESSION(new Request("https://vamostaxi.site/api/auth/session?finish=1"))).json()) as Record<string, unknown>;
    expect(asked.finishRequired).toBe(false);
  });
});
