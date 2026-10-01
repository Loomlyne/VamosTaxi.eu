import { describe, expect, it } from "vitest";
import { loadWebAnalytics, WEB_ANALYTICS_SRC, WEB_ANALYTICS_TOKEN } from "./web-analytics";

type FakeScript = { src?: string; defer?: boolean; attrs: Record<string, string>; setAttribute(k: string, v: string): void };

function docAt(hostname: string) {
  const scripts: FakeScript[] = [];
  const doc = {
    location: { hostname },
    querySelector: (sel: string) => scripts.find((s) => sel.includes(`"${s.src}"`)) ?? null,
    createElement: () => {
      const el: FakeScript = { attrs: {}, setAttribute(k, v) { el.attrs[k] = v; } };
      return el;
    },
    head: { appendChild: (el: FakeScript) => scripts.push(el) },
  };
  return { doc: doc as unknown as Document, scripts };
}

describe("loadWebAnalytics", () => {
  it("adds the beacon once on the public site, with the site token", () => {
    const { doc, scripts } = docAt("vamostaxi.site");
    expect(loadWebAnalytics(doc)).toBe(true);
    expect(loadWebAnalytics(doc)).toBe(false);
    expect(scripts.length).toBe(1);
    expect(scripts[0]!.src).toBe(WEB_ANALYTICS_SRC);
    expect(scripts[0]!.defer).toBe(true);
    expect(JSON.parse(scripts[0]!.attrs["data-cf-beacon"]!)).toEqual({ token: WEB_ANALYTICS_TOKEN });
  });

  it("never loads on the dashboard, locally or on another host", () => {
    for (const host of ["dashboard.vamostaxi.site", "localhost", "127.0.0.1", "vamostaxi.site.example.com"]) {
      const { doc, scripts } = docAt(host);
      expect(loadWebAnalytics(doc), host).toBe(false);
      expect(scripts.length, host).toBe(0);
    }
  });
});
