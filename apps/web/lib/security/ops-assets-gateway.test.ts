import { describe, expect, it, vi } from "vitest";
import gateway, { type Env } from "../../dashboard-gateway";
import { serveOpsAsset } from "../dc-mock-urls";

function env() {
  const APP = { fetch: vi.fn(async () => new Response("app")) };
  const PUBLIC = { fetch: vi.fn(async () => new Response("public")) };
  return { APP, PUBLIC, typed: { APP, PUBLIC } as unknown as Env };
}
const at = (path: string) => new Request(`https://dashboard.vamostaxi.site${path}`);

describe("F16: gateway routes dashboard screen files to the Dashboard entrypoint", () => {
  it("sends /app/ops and /app/ops/* to env.APP, never to PUBLIC", async () => {
    for (const path of ["/app/ops", "/app/ops/ops.dc.html", "/app/ops/support.js", "/app/ops/OpsBoard.dc.html"]) {
      const e = env();
      await gateway.fetch(at(path), e.typed);
      expect(e.APP.fetch, path).toHaveBeenCalledTimes(1);
      expect(e.PUBLIC.fetch, path).not.toHaveBeenCalled();
    }
  });

  it("other assets still go to the public entrance on the apex host", async () => {
    const e = env();
    await gateway.fetch(at("/_next/static/x.js"), e.typed);
    expect(e.PUBLIC.fetch).toHaveBeenCalledTimes(1);
    const sent = e.PUBLIC.fetch.mock.calls[0] as unknown as [Request];
    expect(new URL(sent[0].url).hostname).toBe("vamostaxi.site");
    expect(e.APP.fetch).not.toHaveBeenCalled();
  });
});

describe("F16: Dashboard entrypoint serves the screen file with headers", () => {
  it("adds CSP, X-Frame-Options DENY and noindex to a found file", async () => {
    const assets = { fetch: vi.fn(async () => new Response("<html>", { headers: { "content-type": "text/html" } })) };
    const res = await serveOpsAsset(at("/app/ops/ops.dc.html"), assets);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-security-policy")).toContain("frame-ancestors 'none'");
    expect(res.headers.get("x-frame-options")).toBe("DENY");
    expect(res.headers.get("x-robots-tag")).toBe("noindex");
    expect(await res.text()).toBe("<html>");
  });

  it("a missing file is a private no-store 404 with headers", async () => {
    const assets = { fetch: vi.fn(async () => new Response("nope", { status: 404 })) };
    const res = await serveOpsAsset(at("/app/ops/none.js"), assets);
    expect(res.status).toBe(404);
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    expect(res.headers.get("x-frame-options")).toBe("DENY");
  });
});
