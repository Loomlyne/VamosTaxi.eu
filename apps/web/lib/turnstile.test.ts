// apps/web/lib/turnstile.test.ts
//
// SITE-04 siteverify helper. `fetch` is stubbed — no network, no Cloudflare account.

import { afterEach, describe, expect, it, vi } from "vitest";
import { verifyTurnstile } from "./turnstile";

const SECRET = "test-form-turnstile-secret-not-a-credential";
const TOKEN = "turnstile-token-fixture";
const IDEMPOTENCY = "00000000-0000-4000-8000-000000000001";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("verifyTurnstile", () => {
  it("returns ok true on a success body", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ success: true })),
    );
    const result = await verifyTurnstile(SECRET, TOKEN, {
      action: "contact",
      idempotencyKey: IDEMPOTENCY,
    });
    expect(result).toEqual({ ok: true });
  });

  it("returns the upstream error-codes on failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse({ success: false, "error-codes": ["invalid-input-response"] }),
      ),
    );
    const result = await verifyTurnstile(SECRET, TOKEN, {
      action: "contact",
      idempotencyKey: IDEMPOTENCY,
    });
    expect(result).toEqual({ ok: false, codes: ["invalid-input-response"] });
  });

  it("missing secret fails closed without calling fetch", async () => {
    const fetchFn = vi.fn();
    vi.stubGlobal("fetch", fetchFn);
    const result = await verifyTurnstile(undefined, TOKEN, {
      action: "contact",
      idempotencyKey: IDEMPOTENCY,
    });
    expect(result).toEqual({ ok: false, codes: ["missing-secret"] });
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("non-200 upstream is unavailable, never a throw", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ success: true }, 502)),
    );
    const result = await verifyTurnstile(SECRET, TOKEN, {
      action: "contact",
      idempotencyKey: IDEMPOTENCY,
    });
    expect(result).toEqual({ ok: false, codes: ["unavailable"] });
  });

  it("unparseable body is unavailable, never a throw", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("not-json", { status: 200 })),
    );
    const result = await verifyTurnstile(SECRET, TOKEN, {
      action: "contact",
      idempotencyKey: IDEMPOTENCY,
    });
    expect(result).toEqual({ ok: false, codes: ["unavailable"] });
  });

  it("sends action and idempotency_key on the form-encoded body", async () => {
    const fetchFn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe("https://challenges.cloudflare.com/turnstile/v0/siteverify");
      expect(init?.method).toBe("POST");
      const raw = init?.body;
      expect(raw).toBeInstanceOf(URLSearchParams);
      const params = raw as URLSearchParams;
      expect(params.get("action")).toBe("contact");
      expect(params.get("idempotency_key")).toBe(IDEMPOTENCY);
      expect(params.get("response")).toBe(TOKEN);
      expect(params.get("remoteip")).toBe("203.0.113.10");
      return jsonResponse({ success: true });
    });
    vi.stubGlobal("fetch", fetchFn);
    await verifyTurnstile(SECRET, TOKEN, {
      action: "contact",
      idempotencyKey: IDEMPOTENCY,
      remoteip: "203.0.113.10",
    });
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });
});
