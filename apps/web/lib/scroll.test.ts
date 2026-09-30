// apps/web/lib/scroll.test.ts

import { afterEach, describe, expect, it, vi } from "vitest";
import { STICKY_HEADER_OFFSET, scrollToElement } from "./scroll";

function stubPage(opts: { reduce: boolean; top: number; scrollY: number; byId?: Record<string, unknown> }) {
  const scrollTo = vi.fn();
  vi.stubGlobal("window", {
    pageYOffset: opts.scrollY,
    scrollTo,
    matchMedia: () => ({ matches: opts.reduce }),
  });
  vi.stubGlobal("document", { getElementById: (id: string) => opts.byId?.[id] ?? null });
  const el = { getBoundingClientRect: () => ({ top: opts.top }) } as unknown as HTMLElement;
  return { scrollTo, el };
}

afterEach(() => vi.unstubAllGlobals());

describe("scrollToElement", () => {
  it("lands below the sticky header, smooth", () => {
    const { scrollTo, el } = stubPage({ reduce: false, top: 500, scrollY: 100 });
    scrollToElement(el);
    expect(scrollTo).toHaveBeenCalledWith({ top: 500 + 100 + STICKY_HEADER_OFFSET, behavior: "smooth" });
  });

  it("jumps with reduced motion", () => {
    const { scrollTo, el } = stubPage({ reduce: true, top: 200, scrollY: 0 });
    scrollToElement(el);
    expect(scrollTo).toHaveBeenCalledWith({ top: 200 + STICKY_HEADER_OFFSET, behavior: "auto" });
  });

  it("finds an id with or without a leading hash", () => {
    const target = { getBoundingClientRect: () => ({ top: 300 }) };
    const { scrollTo } = stubPage({ reduce: false, top: 0, scrollY: 0, byId: { faq: target } });
    scrollToElement("faq");
    scrollToElement("#faq");
    expect(scrollTo).toHaveBeenCalledTimes(2);
    expect(scrollTo).toHaveBeenCalledWith({ top: 300 + STICKY_HEADER_OFFSET, behavior: "smooth" });
  });

  it("does nothing when the id has no element", () => {
    const { scrollTo } = stubPage({ reduce: false, top: 0, scrollY: 0 });
    scrollToElement("nope");
    expect(scrollTo).not.toHaveBeenCalled();
  });

  it("takes an explicit offset", () => {
    const { scrollTo, el } = stubPage({ reduce: false, top: 400, scrollY: 0 });
    scrollToElement(el, -24);
    expect(scrollTo).toHaveBeenCalledWith({ top: 376, behavior: "smooth" });
  });
});
