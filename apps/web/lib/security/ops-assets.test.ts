import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  guardOpsAsset,
  isOpsAssetRequest,
  withOpsAssetHeaders,
} from "../dc-mock-urls";

const root = resolve(__dirname, "../..");

function req(path: string, host = "vamostaxi.site", headers?: HeadersInit): Request {
  return new Request(`https://${host}${path}`, { headers });
}

describe("F16: dashboard screen files", () => {
  it("wrangler.jsonc runs the Worker first for /app/ops/* (every assets block)", () => {
    const text = readFileSync(resolve(root, "wrangler.jsonc"), "utf8");
    const blocks = text.match(/"run_worker_first":\s*\[[^\]]*\]/g) ?? [];
    expect(blocks.length).toBe((text.match(/"assets":\s*\{/g) ?? []).length);
    expect(blocks.length).toBeGreaterThan(0);
    for (const block of blocks) expect(block).toContain('"/app/ops/*"');
  });

  it("recognises /app/ops and its files only", () => {
    expect(isOpsAssetRequest(req("/app/ops/ops.dc.html"))).toBe(true);
    expect(isOpsAssetRequest(req("/app/ops/support.js"))).toBe(true);
    expect(isOpsAssetRequest(req("/app/ops"))).toBe(true);
    expect(isOpsAssetRequest(req("/app/pages/about.dc.html"))).toBe(false);
    expect(isOpsAssetRequest(req("/app/operations.js"))).toBe(false);
  });

  it("public host: /app/ops/* is a private no-store 404, even with the internal header", () => {
    for (const host of ["vamostaxi.site", "www.vamostaxi.site"]) {
      const res = guardOpsAsset(
        req("/app/ops/ops.dc.html", host, { "x-vamos-dc-asset": "1" }),
      );
      expect(res?.status).toBe(404);
      expect(res?.headers.get("cache-control")).toBe("private, no-store");
      expect(res?.headers.get("x-frame-options")).toBe("DENY");
    }
  });

  it("dashboard host: not hidden; answer gets full security headers and noindex", () => {
    const dash = req("/app/ops/ops.dc.html", "dashboard.vamostaxi.site");
    expect(guardOpsAsset(dash)).toBeNull();
    const out = withOpsAssetHeaders(
      new Response("<html>", { status: 200, headers: { "content-type": "text/html" } }),
    );
    expect(out.status).toBe(200);
    expect(out.headers.get("content-security-policy")).toContain("frame-ancestors 'none'");
    expect(out.headers.get("x-frame-options")).toBe("DENY");
    expect(out.headers.get("x-content-type-options")).toBe("nosniff");
    expect(out.headers.get("strict-transport-security")).toContain("max-age");
    expect(out.headers.get("x-robots-tag")).toBe("noindex");
    expect(out.headers.get("content-type")).toBe("text/html");
  });

  it("non-ops paths are untouched by the guard", () => {
    expect(guardOpsAsset(req("/app/pages/support.js"))).toBeNull();
    expect(guardOpsAsset(req("/"))).toBeNull();
  });

  it("worker.ts applies the guard on the surface-pinned request, before the apex asset pin", () => {
    const src = readFileSync(resolve(root, "worker.ts"), "utf8");
    const surfaced = src.indexOf("pinRequestToSurface(request, surface, sni)");
    const guard = src.indexOf("guardOpsAsset(");
    const apex = src.indexOf("pinRequestToApexAssets(");
    expect(surfaced).toBeGreaterThan(-1);
    expect(guard).toBeGreaterThan(surfaced);
    expect(apex).toBeGreaterThan(guard);
    // F16: the screen file is read from ASSETS (after the guard, before the apex pin).
    const serve = src.indexOf("serveOpsAsset(surfaced, env.ASSETS)");
    expect(serve).toBeGreaterThan(guard);
    expect(apex).toBeGreaterThan(serve);
  });
});
