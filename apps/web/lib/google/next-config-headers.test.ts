// The Next pages (/checkout, /confirmation/<ref>) get Google's policy from next.config.ts headers(), per address, only while the
// Google flag is open. Pay links, manage-booking and every other row keep the catch-all policy.
import { afterEach, describe, expect, it, vi } from "vitest";

type Row = { source: string; headers: { key: string; value: string }[] };

async function rows(open: boolean): Promise<Row[]> {
  vi.resetModules();
  vi.doMock("./flag", async (orig) => ({ ...(await orig<object>()), googleTagAllowed: () => open }));
  vi.doMock("next-intl/plugin", () => ({ default: () => (c: unknown) => c }));
  vi.doMock("@opennextjs/cloudflare", () => ({ initOpenNextCloudflareForDev: () => {} }));
  const mod = await import("../../next.config");
  return (await (mod.default as unknown as { headers: () => Promise<Row[]> }).headers()) as Row[];
}

afterEach(() => {
  vi.doUnmock("./flag");
  vi.doUnmock("next-intl/plugin");
  vi.doUnmock("@opennextjs/cloudflare");
  vi.resetModules();
});

const G = "google" + "tagmanager.com";
const cspRows = (r: Row[]) => r.filter((x) => x.headers.some((h) => h.key === "Content-Security-Policy"));

describe("next.config headers()", () => {
  it("flag closed: one policy row, the catch-all; no Google anywhere", async () => {
    const r = await rows(false);
    expect(cspRows(r).map((x) => x.source)).toEqual(["/:path*"]);
    expect(JSON.stringify(r).includes(G)).toBe(false);
    expect(JSON.stringify(r).includes("analytics.com")).toBe(false);
  });

  it("flag open: Google's policy on /checkout and /confirmation/:ref (and the language forms), listed after the catch-all", async () => {
    const r = await rows(true);
    const withCsp = cspRows(r);
    expect(withCsp.map((x) => x.source)).toEqual([
      "/:path*",
      "/checkout",
      "/:locale(de|fr|ar)/checkout",
      "/confirmation/:ref",
      "/:locale(de|fr|ar)/confirmation/:ref",
    ]);
    for (const row of withCsp.slice(1)) {
      const csp = row.headers.find((h) => h.key === "Content-Security-Policy")!.value;
      expect(csp).toContain(G);
      // GA4 (adopted 2026-10-11): its collection hosts ride on the same rows.
      expect(csp).toContain("https://*.google-" + "analytics.com");
      expect(csp).toContain("https://*.analytics.google.com");
      expect(csp).not.toContain("face" + "book");
    }
    expect(withCsp[0]!.headers.find((h) => h.key === "Content-Security-Policy")!.value.includes(G)).toBe(false);
  });

  it("flag open: no row for a pay link, manage-booking, review or sign-in confirm", async () => {
    const sources = cspRows(await rows(true)).map((x) => x.source).join(" ");
    for (const never of ["pay", "manage-booking", "review", "sign-in", "ops", "dashboard", "reset-password"]) {
      expect(sources.includes(never), never).toBe(false);
    }
  });
});
