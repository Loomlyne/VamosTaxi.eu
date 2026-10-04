import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { stripInternalHeaders } from "./strip-internal-headers";

describe("stripInternalHeaders (reviewer F9)", () => {
  it("drops x-middleware-set-cookie and keeps Set-Cookie, status, location and body", async () => {
    const h = new Headers({ location: "/manage-booking", "x-middleware-set-cookie": "vt_manage=secret; Path=/" });
    h.append("set-cookie", "vt_manage=secret; Path=/; HttpOnly");
    const res = stripInternalHeaders(new Response("x", { status: 302, headers: h }));
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/manage-booking");
    expect(res.headers.has("x-middleware-set-cookie")).toBe(false);
    expect(res.headers.get("set-cookie")).toContain("vt_manage=secret");
    expect(await res.text()).toBe("x");
  });

  it("returns the same object when there is nothing to remove", () => {
    const r = new Response("y", { headers: { "x-consent-present": "0" } });
    expect(stripInternalHeaders(r)).toBe(r);
  });

  it("the Worker applies it to every OpenNext answer", () => {
    const w = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "../../worker.ts"), "utf8");
    expect(w.match(/stripInternalHeaders\(await handler\.fetch\(/g)?.length).toBe(2);
  });
});
