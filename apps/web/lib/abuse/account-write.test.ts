// apps/web/lib/abuse/account-write.test.ts
//
// 26.2 audit U02-4: a missing rate-limit binding lets the account/manage write through
// (fail open) and logs once; a present binding still limits.

import { beforeEach, describe, expect, it, vi } from "vitest";

const getCloudflareContext = vi.fn();
vi.mock("@opennextjs/cloudflare", () => ({
  getCloudflareContext: (...args: unknown[]) => getCloudflareContext(...args),
}));

const REQUEST = () =>
  new Request("https://example.test/api/manage/cancel", {
    method: "POST",
    headers: { "cf-connecting-ip": "203.0.113.10" },
  });

describe("accountWriteForbidden", () => {
  beforeEach(() => {
    vi.resetModules();
    getCloudflareContext.mockReset();
    vi.restoreAllMocks();
  });

  it("fails open when the binding is missing and logs once", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    getCloudflareContext.mockReturnValue({ env: {} });
    const { accountWriteForbidden } = await import("./account-write");
    expect(await accountWriteForbidden(REQUEST())).toBeNull();
    expect(await accountWriteForbidden(REQUEST())).toBeNull();
    expect(logSpy).toHaveBeenCalledTimes(1);
    const line = JSON.parse(String(logSpy.mock.calls[0]?.[0])) as Record<string, unknown>;
    expect(line.type).toBe("account_write_limiter_missing");
    expect(JSON.stringify(line)).not.toContain("203.0.113.10");
  });

  it("still answers 429 when the binding rejects", async () => {
    getCloudflareContext.mockReturnValue({
      env: { QUOTE_RATE_LIMITER_BARE: { limit: async () => ({ success: false }) } },
    });
    const { accountWriteForbidden } = await import("./account-write");
    const res = await accountWriteForbidden(REQUEST());
    expect(res?.status).toBe(429);
  });

  it("lets the request through when the binding allows it", async () => {
    getCloudflareContext.mockReturnValue({
      env: { QUOTE_RATE_LIMITER_BARE: { limit: async () => ({ success: true }) } },
    });
    const { accountWriteForbidden } = await import("./account-write");
    expect(await accountWriteForbidden(REQUEST())).toBeNull();
  });
});
