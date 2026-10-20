import { describe, expect, it, vi } from "vitest";
import gateway, { type Env } from "../../dashboard-gateway";

function env(app: () => Response, pub: () => Response = () => new Response("pub")) {
  const APP = { fetch: vi.fn(async () => app()) };
  const PUBLIC = { fetch: vi.fn(async () => pub()) };
  return { e: { APP, PUBLIC } as unknown as Env, APP, PUBLIC };
}
const req = (path: string) => new Request(`https://dashboard.vamostaxi.site${path}`);

describe("dashboard gateway no-transform", () => {
  it("adds no-transform to HTML from APP", async () => {
    const { e } = env(
      () =>
        new Response("<p>x</p>", {
          headers: { "content-type": "text/html", "cache-control": "private, no-store" },
        }),
    );
    const res = await gateway.fetch(req("/login"), e);
    expect(res.headers.get("cache-control")).toBe("private, no-store, no-transform");
  });

  it("leaves a 307 redirect alone", async () => {
    const { e } = env(() => new Response(null, { status: 307, headers: { location: "/login" } }));
    const res = await gateway.fetch(req("/"), e);
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("/login");
  });

  it("leaves PUBLIC css alone", async () => {
    const { e, PUBLIC } = env(
      () => new Response("x"),
      () =>
        new Response("a{}", {
          headers: { "content-type": "text/css", "cache-control": "public, max-age=31536000, immutable" },
        }),
    );
    const res = await gateway.fetch(req("/_next/static/x.css"), e);
    expect(PUBLIC.fetch).toHaveBeenCalled();
    expect(res.headers.get("cache-control")).toBe("public, max-age=31536000, immutable");
  });

  it("answers robots.txt itself", async () => {
    const { e, APP, PUBLIC } = env(() => new Response("x"));
    const res = await gateway.fetch(req("/robots.txt"), e);
    expect(res.headers.get("cache-control")).toBe("public, max-age=3600");
    expect(APP.fetch).not.toHaveBeenCalled();
    expect(PUBLIC.fetch).not.toHaveBeenCalled();
  });
});
