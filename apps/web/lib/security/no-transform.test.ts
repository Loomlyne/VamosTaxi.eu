import { describe, expect, it } from "vitest";
import { mergeNoTransform, withNoTransform } from "./no-transform";

const DEFAULT = "private, no-store, no-transform";

describe("mergeNoTransform", () => {
  it("defaults for null and empty", () => {
    expect(mergeNoTransform(null)).toBe(DEFAULT);
    expect(mergeNoTransform("")).toBe(DEFAULT);
  });
  it("appends to existing directives, keeping order", () => {
    expect(mergeNoTransform("private, no-store")).toBe(DEFAULT);
    expect(mergeNoTransform("public, max-age=0, must-revalidate")).toBe(
      "public, max-age=0, must-revalidate, no-transform",
    );
  });
  it("does not duplicate, case-insensitive", () => {
    expect(mergeNoTransform("private, No-Transform")).toBe("private, No-Transform");
  });
});

describe("withNoTransform", () => {
  const html = "text/html; charset=utf-8";

  it("adds no-transform to HTML, keeps status and body", async () => {
    const res = withNoTransform(
      new Response("<p>x</p>", {
        status: 200,
        statusText: "OK",
        headers: { "content-type": html, "cache-control": "private, no-store" },
      }),
    );
    expect(res.headers.get("cache-control")).toBe(DEFAULT);
    expect(res.status).toBe(200);
    expect(res.statusText).toBe("OK");
    expect(await res.text()).toBe("<p>x</p>");
  });

  it("sets the default when HTML has no cache-control", () => {
    const res = withNoTransform(new Response("x", { headers: { "content-type": html } }));
    expect(res.headers.get("cache-control")).toBe(DEFAULT);
  });

  it("keeps two Set-Cookie headers and other headers", () => {
    const h = new Headers({
      "content-type": html,
      "x-robots-tag": "noindex",
      "content-security-policy": "default-src 'self'",
    });
    h.append("set-cookie", "a=1; Path=/");
    h.append("set-cookie", "b=2; Path=/");
    const res = withNoTransform(new Response("x", { headers: h }));
    expect(res.headers.getSetCookie()).toEqual(["a=1; Path=/", "b=2; Path=/"]);
    expect(res.headers.get("x-robots-tag")).toBe("noindex");
    expect(res.headers.get("content-security-policy")).toBe("default-src 'self'");
  });

  it("returns a 307 without content-type unchanged", () => {
    const r = new Response(null, { status: 307, headers: { location: "/login" } });
    const res = withNoTransform(r);
    expect(res).toBe(r);
    expect(res.headers.get("location")).toBe("/login");
  });

  it.each([
    "application/json",
    "text/css",
    "application/javascript",
    "image/svg+xml",
    "text/plain",
  ])("returns %s unchanged", (type) => {
    const r = new Response("x", { headers: { "content-type": type } });
    expect(withNoTransform(r)).toBe(r);
  });

  it("streams: original body is passed through, not read", () => {
    const r = new Response("x", { headers: { "content-type": html } });
    const body = r.body;
    const res = withNoTransform(r);
    expect(r.bodyUsed).toBe(false);
    expect(body).not.toBeNull();
    expect(res.body).toBeTruthy();
  });
});
