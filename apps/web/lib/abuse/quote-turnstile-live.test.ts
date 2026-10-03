// apps/web/lib/abuse/quote-turnstile-live.test.ts
//
// Quick 261003 (owner decision A): the price challenge reads the secret live really has
// (TURNSTILE_SECRET_KEY), takes the token /checkout really sends (body `turnstile_token`),
// and never challenges a signed-in staff session on the dashboard New trip.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { quoteTurnstileSecret, turnstileGuard, turnstileTokenOf, wireQuoteAbuse } from "./guards";

const IP = "203.0.113.20";
const QS = "test-vamos-qs-secret-not-a-real-credential-01";
const WEB = join(__dirname, "..", "..");

class MemoryKV {
  readonly store = new Map<string, string>();
  async get(key: string) {
    return this.store.get(key) ?? null;
  }
  async put(key: string, value: string) {
    this.store.set(key, value);
  }
}

function okFetch(success: boolean) {
  return vi.fn(async () => new Response(JSON.stringify({ success }), { status: 200 }));
}

function env(extra: Record<string, unknown>): CloudflareEnv {
  return { VAMOS_QS_SECRET: QS, QUOTE_ABUSE: new MemoryKV(), ...extra } as unknown as CloudflareEnv;
}

function req(headers: Record<string, string> = {}): Request {
  return new Request("https://vamostaxi.site/api/quote", {
    method: "POST",
    headers: { "cf-connecting-ip": IP, ...headers },
  });
}

describe("quoteTurnstileSecret", () => {
  it("uses TURNSTILE_SECRET_KEY, the name live Worker vamos has", () => {
    expect(quoteTurnstileSecret(env({ TURNSTILE_SECRET_KEY: "shared" }))).toBe("shared");
  });
  it("prefers TURNSTILE_SECRET_KEY over the old name when both exist", () => {
    expect(quoteTurnstileSecret(env({ TURNSTILE_SECRET_KEY: "shared", TURNSTILE_SECRET: "old" }))).toBe("shared");
  });
  it("falls back to the old TURNSTILE_SECRET only when the shared key is absent", () => {
    expect(quoteTurnstileSecret(env({ TURNSTILE_SECRET: "old" }))).toBe("old");
  });
  it("is undefined when neither is set or both are empty (guard fails open as before)", () => {
    expect(quoteTurnstileSecret(env({}))).toBeUndefined();
    expect(quoteTurnstileSecret(env({ TURNSTILE_SECRET_KEY: "", TURNSTILE_SECRET: "" }))).toBeUndefined();
  });
});

describe("turnstileTokenOf", () => {
  it("reads the body field /checkout sends", () => {
    expect(turnstileTokenOf(req(), { turnstile_token: "tok-body" })).toBe("tok-body");
  });
  it("prefers the body over the header", () => {
    expect(turnstileTokenOf(req({ "cf-turnstile-response": "tok-h" }), { turnstile_token: "tok-body" })).toBe("tok-body");
  });
  it("falls back to the cf-turnstile-response header", () => {
    expect(turnstileTokenOf(req({ "cf-turnstile-response": "tok-h" }), {})).toBe("tok-h");
  });
  it("null when neither carries a token or the body field is not a string", () => {
    expect(turnstileTokenOf(req(), { turnstile_token: 7 })).toBeNull();
    expect(turnstileTokenOf(req(), null)).toBeNull();
  });
});

describe("wireQuoteAbuse turnstile (live shape: TURNSTILE_SECRET_KEY only)", () => {
  it("enforces from the 3rd quote, and a body token that siteverify passes gets through", async () => {
    const e = env({ TURNSTILE_SECRET_KEY: "shared" });
    const fetchSpy = okFetch(true);
    vi.stubGlobal("fetch", fetchSpy);
    try {
      expect(await (await wireQuoteAbuse(e, req(), "quote", { body: {} })).turnstile()).toEqual({ ok: true });
      expect(await (await wireQuoteAbuse(e, req(), "quote", { body: {} })).turnstile()).toEqual({ ok: true });
      expect(await (await wireQuoteAbuse(e, req(), "quote", { body: {} })).turnstile()).toEqual({
        ok: false,
        code: "turnstile_required",
      });
      expect(fetchSpy).not.toHaveBeenCalled();
      const solved = await wireQuoteAbuse(e, req(), "quote", { body: { turnstile_token: "tok-pass" } });
      expect(await solved.turnstile()).toEqual({ ok: true });
      expect(fetchSpy).toHaveBeenCalledTimes(1);
      const sent = JSON.parse(String((fetchSpy.mock.calls[0] as unknown as [string, RequestInit])[1].body));
      expect(sent).toMatchObject({ secret: "shared", response: "tok-pass" });
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("a token siteverify refuses stays turnstile_required", async () => {
    const e = env({ TURNSTILE_SECRET_KEY: "shared" });
    vi.stubGlobal("fetch", okFetch(false));
    try {
      for (let i = 0; i < 2; i++) await (await wireQuoteAbuse(e, req(), "quote", { body: {} })).turnstile();
      const bad = await wireQuoteAbuse(e, req(), "quote", { body: { turnstile_token: "tok-fail" } });
      expect(await bad.turnstile()).toEqual({ ok: false, code: "turnstile_required" });
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("with no Turnstile secret at all the 3rd quote still passes (unchanged fail-open)", async () => {
    const e = env({});
    for (let i = 0; i < 5; i++) {
      expect(await (await wireQuoteAbuse(e, req(), "quote", { body: {} })).turnstile()).toEqual({ ok: true });
    }
  });

  it("the staff exemption is asked only when the challenge would refuse, and lets the 3rd quote through", async () => {
    const e = env({ TURNSTILE_SECRET_KEY: "shared" });
    const exempt = vi.fn(async () => true);
    for (let i = 0; i < 2; i++) {
      expect(await (await wireQuoteAbuse(e, req(), "quote", { body: {}, turnstileExempt: exempt })).turnstile()).toEqual({ ok: true });
    }
    expect(exempt).not.toHaveBeenCalled();
    expect(await (await wireQuoteAbuse(e, req(), "quote", { body: {}, turnstileExempt: exempt })).turnstile()).toEqual({ ok: true });
    expect(exempt).toHaveBeenCalledTimes(1);
  });

  it("a refused or throwing staff check is no exemption", async () => {
    const store = { n: 0, async increment() { return ++this.n; } };
    const base = { ip: IP, cookie: null, secret: QS, turnstileSecret: "shared", attemptStore: store, token: null };
    store.n = 2;
    expect(await turnstileGuard({ ...base, exempt: async () => false })()).toEqual({ ok: false, code: "turnstile_required" });
    store.n = 2;
    expect(await turnstileGuard({ ...base, exempt: async () => { throw new Error("db down"); } })()).toEqual({
      ok: false,
      code: "turnstile_required",
    });
  });
});

describe("quote route wiring", () => {
  it("passes the parsed body and a staff check limited to the dashboard host", () => {
    const src = readFileSync(join(WEB, "app/api/quote/route.ts"), "utf8");
    expect(src).toMatch(/body: pre\.body/);
    expect(src).toMatch(/turnstileExempt: dashboardHost \? \(\) => requestHasStaffSession\(request, undefined, authCookies\) : undefined/);
  });
  it("guards.ts no longer reads env.TURNSTILE_SECRET directly for the guard", () => {
    const src = readFileSync(join(WEB, "lib/abuse/guards.ts"), "utf8");
    expect(src).not.toMatch(/turnstileSecret: env\.TURNSTILE_SECRET\b/);
    expect(src).toMatch(/turnstileSecret: quoteTurnstileSecret\(env\)/);
  });
});
