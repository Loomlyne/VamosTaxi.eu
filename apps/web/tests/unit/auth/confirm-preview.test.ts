// F12: the preview route opens the sealed address and returns nothing else.
import { describe, expect, it, vi } from "vitest";
import { sealAddress } from "@/lib/auth/sealed-address";

const SECRET = "v1,whsec_dGVzdHNlY3JldHRlc3RzZWNyZXQ";
const limit = vi.fn(async () => ({ success: true }));

vi.mock("@opennextjs/cloudflare", () => ({
  getCloudflareContext: () => ({ env: { SEND_EMAIL_HOOK_SECRET: SECRET, AUTH_RATE_LIMITER: { limit } } }),
}));

const { GET } = await import("@/app/api/auth/confirm/preview/route");

const url = (q: string) => new Request(`https://vamostaxi.site/api/auth/confirm/preview?${q}`);

describe("GET /api/auth/confirm/preview", () => {
  it("returns only the opened address, no-store", async () => {
    const e = await sealAddress("mia@example.com", "abc", SECRET);
    const res = await GET(url(`token_hash=abc&type=magiclink&e=${e}`));
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toContain("no-store");
    expect(await res.json()).toEqual({ ok: true, email: "mia@example.com" });
    expect(limit).toHaveBeenCalled();
  });

  it("answers expired for a missing, foreign or bad e, still no-store", async () => {
    const moved = await sealAddress("mia@example.com", "zzz", SECRET);
    for (const q of [
      "token_hash=abc&type=magiclink",
      `token_hash=abc&type=magiclink&e=${moved}`,
      "token_hash=abc&type=magiclink&e=garbage",
      `e=${moved}`,
    ]) {
      const res = await GET(url(q));
      expect(res.headers.get("cache-control")).toContain("no-store");
      expect(await res.json()).toEqual({ ok: false, code: "expired" });
    }
  });

  it("answers 429 when the limiter refuses", async () => {
    limit.mockResolvedValueOnce({ success: false });
    const res = await GET(url("token_hash=abc&type=magiclink&e=x"));
    expect(res.status).toBe(429);
  });
});
