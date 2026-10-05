// Security S5 (2026-10-05): the sign-up / forgot-password check runs through the real lib/turnstile helper here
// (only Cloudflare's siteverify answer is faked), to show it fails closed and is bound to the action and host.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { authPost, resetHarness, state } from "./harness";

vi.mock("@opennextjs/cloudflare", async () => (await import("./harness")).cloudflareMock);
vi.mock("next/headers", async () => (await import("./harness")).headersMock);
vi.mock("@supabase/ssr", async () => (await import("./harness")).ssrMock);
vi.mock("@/lib/db/identity", () => ({
  asSystem: async (_env: unknown, fn: (tx: unknown) => Promise<unknown>) => fn(async () => []),
}));
vi.mock("@/lib/db/system-reads", () => ({
  markAccountFinishPending: async () => undefined,
  // No address has an account here: every sign-in link is for a new address and so needs the check.
  readCheckoutAccountUserState: async () => ({ user_exists: false, confirmed: false, checkout_origin: false }),
}));

const { POST } = await import("@/app/api/auth/route");

const forgot = { mode: "forgot", email: "mia@example.test", turnstileToken: "real-token", idempotencyKey: "11111111-1111-4111-8111-111111111111" };
const signup = {
  mode: "signup", method: "password", email: "mia@example.test", password: "12345678",
  firstName: "Mia", lastName: "K", consent: true, turnstileToken: "real-token", idempotencyKey: "22222222-2222-4222-8222-222222222222",
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

let sent: number;
let siteverify: ReturnType<typeof vi.fn>;

function answer(body: unknown) {
  siteverify.mockImplementation(async () => new Response(JSON.stringify(body), { status: 200 }));
}

beforeEach(() => {
  resetHarness();
  sent = 0;
  state.auth.resetPasswordForEmail = (async () => {
    sent++;
    return { error: null };
  }) as never;
  state.auth.signUp = (async () => {
    sent++;
    return { error: null };
  }) as never;
  state.env.TURNSTILE_SECRET_KEY = "sekret";
  state.env.CONTACT_TURNSTILE_ALLOWED_HOSTNAMES = "vamostaxi.site";
  siteverify = vi.fn();
  vi.stubGlobal("fetch", siteverify);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("S5: the real check, fail closed", () => {
  it("a good answer for action 'account' on our host lets the mail go; the form carries action, key and IP", async () => {
    answer({ success: true, action: "account", hostname: "vamostaxi.site" });
    const res = await POST(authPost(forgot));
    expect(res.status).toBe(200);
    expect(sent).toBe(1);
    const sentForm = new URLSearchParams(String((siteverify.mock.calls[0]?.[1] as { body: URLSearchParams }).body));
    expect(sentForm.get("response")).toBe("real-token");
    expect(sentForm.get("action")).toBe("account");
    // The key is made on the server: the one in the body is ignored (token replay, S5 review).
    expect(sentForm.get("idempotency_key")).toMatch(UUID);
    expect(sentForm.get("idempotency_key")).not.toBe(forgot.idempotencyKey);
    expect(sentForm.get("remoteip")).toBe("203.0.113.9");
  });

  it("works the same for the password sign-up", async () => {
    answer({ success: true, action: "account", hostname: "vamostaxi.site" });
    const res = await POST(authPost(signup));
    expect(res.status).toBe(200);
    expect(sent).toBe(1);
  });

  it("no secret on the Worker: refused, and Cloudflare is not even asked", async () => {
    delete state.env.TURNSTILE_SECRET_KEY;
    const err = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const res = await POST(authPost(forgot));
    expect(res.status).toBe(403);
    expect(sent).toBe(0);
    expect(siteverify).not.toHaveBeenCalled();
    err.mockRestore();
  });

  it("no hostname binding on the Worker: refused", async () => {
    delete state.env.CONTACT_TURNSTILE_ALLOWED_HOSTNAMES;
    answer({ success: true, action: "account", hostname: "vamostaxi.site" });
    const res = await POST(authPost(forgot));
    expect(res.status).toBe(403);
    expect(sent).toBe(0);
  });

  it("Cloudflare unreachable: refused, not waved through", async () => {
    siteverify.mockRejectedValue(new Error("network down"));
    const res = await POST(authPost(signup));
    expect(res.status).toBe(403);
    expect(sent).toBe(0);
  });

  it("Cloudflare answers non-200: refused", async () => {
    siteverify.mockImplementation(async () => new Response("{}", { status: 500 }));
    const res = await POST(authPost(forgot));
    expect(res.status).toBe(403);
    expect(sent).toBe(0);
  });

  it("a token minted for another action (the consent banner's) is refused", async () => {
    answer({ success: true, action: "consent", hostname: "vamostaxi.site" });
    const res = await POST(authPost(forgot));
    expect(res.status).toBe(403);
    expect(sent).toBe(0);
  });

  it("a token minted on another host is refused", async () => {
    answer({ success: true, action: "account", hostname: "evil.example" });
    const res = await POST(authPost(signup));
    expect(res.status).toBe(403);
    expect(sent).toBe(0);
  });

  it("success: false is refused", async () => {
    answer({ success: false, "error-codes": ["timeout-or-duplicate"] });
    const res = await POST(authPost(forgot));
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ ok: false, reason: "challenge-failed" });
    expect(sent).toBe(0);
  });

  it("one solved token cannot be posted again for another address: the second verify carries a new key and is refused", async () => {
    // Cloudflare's rule: a token re-verified with the SAME idempotency_key within 300 s gets the same success;
    // a second use with another key is "timeout-or-duplicate".
    const firstKeyOfToken = new Map<string, string>();
    const keysSeen: string[] = [];
    siteverify.mockImplementation(async (_url: unknown, init: { body: URLSearchParams }) => {
      const form = new URLSearchParams(String(init.body));
      const token = form.get("response") ?? "";
      const key = form.get("idempotency_key") ?? "";
      keysSeen.push(key);
      const first = firstKeyOfToken.get(token);
      if (first === undefined) firstKeyOfToken.set(token, key);
      return new Response(
        JSON.stringify(
          first === undefined || first === key
            ? { success: true, action: "account", hostname: "vamostaxi.site" }
            : { success: false, "error-codes": ["timeout-or-duplicate"] },
        ),
        { status: 200 },
      );
    });
    // Same token, and the browser's key the same both times (what a replaying bot would send).
    const one = await POST(authPost({ ...forgot, email: "one@example.test" }));
    const two = await POST(authPost({ ...forgot, email: "two@example.test" }));
    expect(one.status).toBe(200);
    expect(two.status).toBe(403);
    expect(await two.json()).toEqual({ ok: false, reason: "challenge-failed" });
    expect(sent).toBe(1);
    expect(keysSeen).toHaveLength(2);
    expect(keysSeen[0]).not.toBe(keysSeen[1]);
    expect(keysSeen).not.toContain(forgot.idempotencyKey);
  });

  it("the sign-in link for a new address: one solved token is good once; replayed for another new address, nothing is sent", async () => {
    const firstKeyOfToken = new Map<string, string>();
    siteverify.mockImplementation(async (_url: unknown, init: { body: URLSearchParams }) => {
      const form = new URLSearchParams(String(init.body));
      const token = form.get("response") ?? "";
      const key = form.get("idempotency_key") ?? "";
      const first = firstKeyOfToken.get(token);
      if (first === undefined) firstKeyOfToken.set(token, key);
      return new Response(
        JSON.stringify(
          first === undefined || first === key
            ? { success: true, action: "account", hostname: "vamostaxi.site" }
            : { success: false, "error-codes": ["timeout-or-duplicate"] },
        ),
        { status: 200 },
      );
    });
    const mailed: string[] = [];
    state.auth.signInWithOtp = (async (args: { email: string }) => {
      mailed.push(args.email);
      return { error: /@invalid\.invalid$/.test(args.email) ? { code: "otp_disabled" } : null };
    }) as never;
    const link = (email: string) =>
      POST(authPost({ mode: "signin", method: "magic", email, turnstileToken: "real-token", idempotencyKey: forgot.idempotencyKey }));
    const one = await link("one@example.test");
    const two = await link("two@example.test");
    // Same neutral answer for both; only the first reached its own address.
    expect(one.status).toBe(200);
    expect(await one.json()).toEqual({ stage: "sent" });
    expect(two.status).toBe(200);
    expect(await two.json()).toEqual({ stage: "sent" });
    expect(mailed).toHaveLength(2);
    expect(mailed[0]).toBe("one@example.test");
    expect(mailed[1]).toMatch(/^no-link-.*@invalid\.invalid$/);
    expect(JSON.stringify(mailed)).not.toContain("two@example.test");
  });
});
