// 27 D-05: POST /api/consent writes the chosen categories. No Turnstile on consent (owner 2026-10-26, replaces D-33).

import { beforeEach, describe, expect, it, vi } from "vitest";

const recordConsent = vi.fn();
const verifyTurnstile = vi.fn();
const checkWriteRateLimit = vi.fn();
const asCheckout = vi.fn();

vi.mock("@opennextjs/cloudflare", () => ({ getCloudflareContext: () => ({ env: {} }) }));
vi.mock("@/lib/security/origin", () => ({ csrfForbidden: () => null }));
vi.mock("@/lib/abuse/rate-limit", () => ({
  checkWriteRateLimit: (...a: unknown[]) => checkWriteRateLimit(...a),
}));
vi.mock("@/lib/turnstile", () => ({ verifyTurnstile: (...a: unknown[]) => verifyTurnstile(...a) }));
vi.mock("@/lib/db/identity", () => ({ asCheckout: (...a: unknown[]) => asCheckout(...a) }));
vi.mock("@/lib/consent/bind", () => ({ recordConsent: (...a: unknown[]) => recordConsent(...a) }));

import { POST } from "@/app/api/consent/route";

const post = (body: unknown) =>
  POST(
    new Request("https://vamostaxi.site/api/consent", {
      method: "POST",
      headers: { "content-type": "application/json", origin: "https://vamostaxi.site" },
      body: JSON.stringify(body),
    }),
  );

const ALL_TRUE = { functional: true, analytics: true, marketing: true };
const ALL_FALSE = { functional: false, analytics: false, marketing: false };

beforeEach(() => {
  recordConsent.mockReset();
  verifyTurnstile.mockReset();
  checkWriteRateLimit.mockReset().mockResolvedValue({ ok: true });
  asCheckout.mockReset().mockImplementation(async (_env: unknown, _claims: unknown, fn: (tx: unknown) => Promise<void>) => fn({}));
});

describe("POST /api/consent", () => {
  it("accept_all records all true with no token, never calls Turnstile, sets the subject cookie", async () => {
    const res = await post({ method: "accept_all", locale: "de" });
    expect(res.status).toBe(200);
    expect(verifyTurnstile).not.toHaveBeenCalled();
    expect(recordConsent.mock.calls[0]?.[1]).toMatchObject({ method: "accept_all", categories: ALL_TRUE });
    // 261005 S6: written as vamos_checkout with no claims, never as anon (Supabase REST cannot call it).
    expect(asCheckout.mock.calls[0]?.[1]).toBeNull();
    expect(res.headers.get("Set-Cookie")).toContain("consent_subject=");
    expect(res.headers.get("Cache-Control")).toBe("private, no-store");
  });

  it("a stray turnstileToken in the body is ignored", async () => {
    const res = await post({ method: "accept_all", locale: "en", turnstileToken: "anything" });
    expect(res.status).toBe(200);
    expect(verifyTurnstile).not.toHaveBeenCalled();
    expect(recordConsent).toHaveBeenCalledTimes(1);
  });

  it("the write limit still answers 429 and writes nothing", async () => {
    checkWriteRateLimit.mockResolvedValue({ ok: false });
    const res = await post({ method: "accept_all", locale: "en" });
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({ ok: false, code: "rate_limited" });
    expect(recordConsent).not.toHaveBeenCalled();
  });

  it("reject_all never verifies Turnstile and records all false, even if the body says otherwise", async () => {
    const res = await post({ method: "reject_all", locale: "en", marketing: true });
    expect(res.status).toBe(200);
    expect(verifyTurnstile).not.toHaveBeenCalled();
    expect(recordConsent.mock.calls[0]?.[1]).toMatchObject({ categories: ALL_FALSE });
  });

  it("settings_change with marketing false skips Turnstile and records exactly the switches", async () => {
    const res = await post({
      method: "settings_change",
      locale: "fr",
      functional: true,
      analytics: false,
      marketing: false,
    });
    expect(res.status).toBe(200);
    expect(verifyTurnstile).not.toHaveBeenCalled();
    expect(recordConsent.mock.calls[0]?.[1]).toMatchObject({
      method: "settings_change",
      categories: { functional: true, analytics: false, marketing: false },
    });
  });

  it("settings_change with marketing true records marketing true with no token", async () => {
    const body = { method: "settings_change", locale: "en", functional: true, analytics: true, marketing: true };
    const ok = await post(body);
    expect(ok.status).toBe(200);
    expect(verifyTurnstile).not.toHaveBeenCalled();
    expect(recordConsent.mock.calls[0]?.[1]).toMatchObject({ categories: ALL_TRUE });
  });

  it("settings_change with a missing or string switch is 400 invalid_input, no write, no cookie", async () => {
    for (const bad of [
      { functional: true, analytics: true },
      { functional: true, analytics: true, marketing: "true" },
    ]) {
      const res = await post({ method: "settings_change", locale: "en", ...bad });
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ ok: false, code: "invalid_input" });
      expect(res.headers.get("Set-Cookie")).toBeNull();
    }
    expect(asCheckout).not.toHaveBeenCalled();
    expect(verifyTurnstile).not.toHaveBeenCalled();
  });

  it("a database failure is 503 unavailable with no cookie", async () => {
    asCheckout.mockRejectedValue(new Error("db down"));
    const res = await post({ method: "reject_all", locale: "en" });
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ ok: false, code: "unavailable" });
    expect(res.headers.get("Set-Cookie")).toBeNull();
    expect(res.headers.get("Cache-Control")).toBe("private, no-store");
  });
});
