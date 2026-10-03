// Phase 28, review 2 item 1: the React banner (checkout, confirmation, pay link) clears Meta's
// browser state when the server says no choice is recorded, as the mock loader does.
//
// The real CookieBanner is rendered with react-dom/server; its effects are captured (the server render
// never runs them) and run by hand against a stubbed fetch, document and window.

import { createElement, type EffectCallback } from "react";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const effects: EffectCallback[] = [];

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return {
    ...actual,
    useEffect: (fn: EffectCallback) => void effects.push(fn),
    useLayoutEffect: () => undefined,
  };
});
vi.mock("next-intl", () => ({ useLocale: () => "en", useTranslations: () => (k: string) => k }));
vi.mock("next-intl/navigation", () => ({ createNavigation: () => ({ Link: () => null }) }));
vi.mock("@/components/core", () => ({ Button: () => null, Icon: () => null }));
vi.mock("@/components/feedback", () => ({ Alert: () => null }));
vi.mock("@/components/forms", () => ({ Switch: () => null }));
vi.mock("@/components/forms/TurnstileWidget", () => ({ TurnstileWidget: () => null }));
vi.mock("@/lib/consent/web-analytics", () => ({ loadWebAnalytics: vi.fn() }));

import { CookieBanner } from "./CookieBanner";

let cookieWrites: string[] = [];
let removedKeys: string[] = [];

function stubBrowser(fetchImpl: () => Promise<unknown>) {
  vi.stubGlobal("document", {
    set cookie(v: string) {
      cookieWrites.push(v);
    },
    get cookie() {
      return "";
    },
  });
  vi.stubGlobal("window", {
    location: { hostname: "vamostaxi.site" },
    localStorage: { removeItem: (k: string) => removedKeys.push(k), getItem: () => null, setItem: () => undefined },
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  });
  vi.stubGlobal("fetch", fetchImpl);
}

/** Render the banner, run every captured effect, let the state fetch settle. */
async function mount() {
  effects.length = 0;
  renderToString(createElement(CookieBanner, { siteKey: undefined }));
  for (const fn of [...effects]) fn();
  await new Promise((r) => setTimeout(r, 0));
}

const replying = (body: unknown) => async () => ({ ok: true, json: async () => body });
const clearedFbp = () => cookieWrites.some((w) => w.startsWith("_fbp=; Max-Age=0"));

beforeEach(() => {
  cookieWrites = [];
  removedKeys = [];
});
afterEach(() => vi.unstubAllGlobals());

describe("CookieBanner and Meta's browser state (review 2 item 1)", () => {
  it("no choice recorded (chosen: false): _fbp, _fbc and both storage keys are cleared", async () => {
    stubBrowser(replying({ chosen: false, policyVersion: "2026-10-01" }));
    await mount();
    expect(clearedFbp()).toBe(true);
    expect(cookieWrites.some((w) => w.startsWith("_fbc=; Max-Age=0; path=/; domain=.vamostaxi.site"))).toBe(true);
    expect(removedKeys.sort()).toEqual(["aemSource", "multiFbc"]);
  });

  it("a saved choice with Marketing off clears", async () => {
    stubBrowser(
      replying({ chosen: true, policyVersion: "2026-10-01", choice: { functional: true, analytics: false, marketing: false } }),
    );
    await mount();
    expect(clearedFbp()).toBe(true);
  });

  it("a saved choice with Marketing on deletes nothing", async () => {
    stubBrowser(
      replying({ chosen: true, policyVersion: "2026-10-01", choice: { functional: true, analytics: true, marketing: true } }),
    );
    await mount();
    expect(cookieWrites).toEqual([]);
    expect(removedKeys).toEqual([]);
  });

  it("server unreachable (network error or a 500): deletes nothing", async () => {
    stubBrowser(async () => {
      throw new Error("offline");
    });
    await mount();
    expect(cookieWrites).toEqual([]);
    expect(removedKeys).toEqual([]);

    stubBrowser(async () => ({ ok: false, json: async () => ({}) }));
    await mount();
    expect(cookieWrites).toEqual([]);
    expect(removedKeys).toEqual([]);
  });
});
