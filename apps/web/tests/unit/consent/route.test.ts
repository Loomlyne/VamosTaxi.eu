// 27 D-05 / D-33: POST /api/consent writes the chosen categories; Turnstile iff marketing is true.

import { beforeEach, describe, expect, it, vi } from "vitest";

const recordConsent = vi.fn();
const verifyTurnstile = vi.fn();
const checkWriteRateLimit = vi.fn();
const asAnon = vi.fn();

vi.mock("@opennextjs/cloudflare", () => ({ getCloudflareContext: () => ({ env: {} }) }));
vi.mock("@/lib/security/origin", () => ({ csrfForbidden: () => null }));
vi.mock("@/lib/abuse/rate-limit", () => ({
  checkWriteRateLimit: (...a: unknown[]) => checkWriteRateLimit(...a),
}));
vi.mock("@/lib/turnstile", () => ({ verifyTurnstile: (...a: unknown[]) => verifyTurnstile(...a) }));
vi.mock("@/lib/db/identity", () => ({ asAnon: (...a: unknown[]) => asAnon(...a) }));
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
  asAnon.mockReset().mockImplementation(async (_env: unknown, fn: (tx: unknown) => Promise<void>) => fn({}));
});

describe("POST /api/consent", () => {
  it("accept_all without a valid token is 403 challenge_failed and writes nothing", async () => {
    verifyTurnstile.mockResolvedValue({ ok: false });
    const res = await post({ method: "accept_all", locale: "en", turnstileToken: "bad" });
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ ok: false, code: "challenge_failed" });
    expect(asAnon).not.toHaveBeenCalled();
    expect(recordConsent).not.toHaveBeenCalled();
  });

  it("accept_all with a valid token records all true and sets the subject cookie", async () => {
    verifyTurnstile.mockResolvedValue({ ok: true });
    const res = await post({ method: "accept_all", locale: "de", turnstileToken: "ok" });
    expect(res.status).toBe(200);
    expect(recordConsent.mock.calls[0]?.[1]).toMatchObject({ method: "accept_all", categories: ALL_TRUE });
    expect(res.headers.get("Set-Cookie")).toContain("consent_subject=");
    expect(res.headers.get("Cache-Control")).toBe("private, no-store");
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

  it("settings_change with marketing true needs the token, then records marketing true", async () => {
    verifyTurnstile.mockResolvedValueOnce({ ok: false });
    const body = { method: "settings_change", locale: "en", functional: true, analytics: true, marketing: true };
    const denied = await post(body);
    expect(denied.status).toBe(403);
    expect(recordConsent).not.toHaveBeenCalled();
    verifyTurnstile.mockResolvedValueOnce({ ok: true });
    const ok = await post({ ...body, turnstileToken: "ok" });
    expect(ok.status).toBe(200);
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
    expect(asAnon).not.toHaveBeenCalled();
    expect(verifyTurnstile).not.toHaveBeenCalled();
  });

  it("a database failure is 503 unavailable with no cookie", async () => {
    asAnon.mockRejectedValue(new Error("db down"));
    const res = await post({ method: "reject_all", locale: "en" });
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ ok: false, code: "unavailable" });
    expect(res.headers.get("Set-Cookie")).toBeNull();
    expect(res.headers.get("Cache-Control")).toBe("private, no-store");
  });
});
