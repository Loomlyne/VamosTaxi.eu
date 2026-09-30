import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import vm from "node:vm";
import { describe, expect, it } from "vitest";

const SRC_PATH = resolve(__dirname, "../../../../app/vamos-consent.js");
const src = readFileSync(SRC_PATH, "utf8");

type Reply = { status: number; body: unknown } | "reject";

interface Harness {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  api: any;
  calls: { url: string; init: { method?: string; body?: string } | undefined }[];
  store: Record<string, string>;
  events: unknown[];
}

function load(reply: Reply): Harness {
  const calls: Harness["calls"] = [];
  const store: Record<string, string> = {};
  const events: unknown[] = [];
  const listeners: Record<string, ((e: unknown) => void)[]> = {};
  const win: Record<string, unknown> = {};
  win.addEventListener = (n: string, fn: (e: unknown) => void) => {
    (listeners[n] = listeners[n] || []).push(fn);
  };
  win.removeEventListener = (n: string, fn: (e: unknown) => void) => {
    listeners[n] = (listeners[n] || []).filter((f) => f !== fn);
  };
  win.dispatchEvent = (e: { type: string }) => {
    events.push(e);
    (listeners[e.type] || []).forEach((f) => f(e));
    return true;
  };
  win.CustomEvent = function CustomEvent(this: Record<string, unknown>, type: string, init: { detail?: unknown }) {
    this.type = type;
    this.detail = init && init.detail;
  };
  win.VamosLocale = { lang: () => "de" };
  win.fetch = (url: string, init?: { method?: string; body?: string }) => {
    calls.push({ url, init });
    if (reply === "reject") return Promise.reject(new Error("network"));
    return Promise.resolve({
      ok: reply.status >= 200 && reply.status < 300,
      status: reply.status,
      json: () => Promise.resolve(reply.body),
    });
  };
  win.localStorage = {
    getItem: (k: string) => (k in store ? store[k] : null),
    setItem: (k: string, v: string) => {
      store[k] = String(v);
    },
    removeItem: (k: string) => {
      delete store[k];
    },
  };
  const ctx: Record<string, unknown> = {
    window: win,
    document: { querySelector: () => null, createElement: () => ({}), head: { appendChild() {} } },
    localStorage: win.localStorage,
    fetch: win.fetch,
    CustomEvent: win.CustomEvent,
    Promise,
    JSON,
    Date,
    setTimeout,
    console,
  };
  win.document = ctx.document;
  vm.createContext(ctx);
  vm.runInContext(src, ctx);
  return { api: win.VamosConsent, calls, store, events };
}

const ALL_OFF = { functional: false, analytics: false, marketing: false };

describe("app/vamos-consent.js", () => {
  it("state() resolves the server answer and never rejects", async () => {
    const ok = load({ status: 200, body: { ok: true, chosen: false, policyVersion: "2026-09-30" } });
    const r = await ok.api.state();
    expect(r.ok).toBe(true);
    expect(r.chosen).toBe(false);
    expect(ok.calls[0]!.url).toBe("/api/consent/state");

    const down = load({ status: 503, body: { ok: false } });
    expect(await down.api.state()).toEqual({ ok: false });

    const boom = load("reject");
    expect(await boom.api.state()).toEqual({ ok: false });
  });

  it("save() posts the choice and, on 200, writes the cache and fires vamos:consent", async () => {
    const h = load({ status: 200, body: { ok: true, chosen: false, policyVersion: "2026-09-30" } });
    await h.api.state(); // learns the policy version the cache is stamped with
    const r = await h.api.save("reject_all", ALL_OFF, {});
    expect(r).toEqual({ ok: true });
    const post = h.calls.find((c) => c.url === "/api/consent");
    expect(post).toBeTruthy();
    const body = JSON.parse(post!.init!.body as string);
    expect(body.method).toBe("reject_all");
    expect(body.locale).toBe("de");
    expect(body.functional).toBe(false);
    expect(body.analytics).toBe(false);
    expect(body.marketing).toBe(false);
    expect("turnstileToken" in body).toBe(false);
    const cache = JSON.parse(h.store.vamosCookieConsent!);
    expect(cache.v).toBe("2026-09-30");
    expect(cache.method).toBe("reject_all");
    expect(cache.marketing).toBe(false);
    expect(h.events.length).toBe(1);
  });

  it("save() on 429 resolves rate_limited, leaves the cache alone, fires nothing", async () => {
    const h = load({ status: 429, body: { ok: false } });
    const r = await h.api.save("accept_all", { functional: true, analytics: true, marketing: true }, { turnstileToken: "t" });
    expect(r).toEqual({ ok: false, code: "rate_limited" });
    expect(h.store.vamosCookieConsent).toBeUndefined();
    expect(h.events.length).toBe(0);
  });

  it("cached() ignores a cache whose version differs from the known policy version", async () => {
    const h = load({ status: 200, body: { ok: true, chosen: false, policyVersion: "2026-09-30" } });
    await h.api.state();
    h.store.vamosCookieConsent = JSON.stringify({ necessary: true, functional: true, analytics: false, marketing: false, v: 1 });
    expect(h.api.cached()).toBeNull();
    h.store.vamosCookieConsent = JSON.stringify({ v: "2026-09-30", method: "reject_all", ...ALL_OFF, at: "x" });
    expect(h.api.cached()).not.toBeNull();
  });

  it("is plain ES5-style script: no async, no arrow functions, no Meta", () => {
    expect(/\basync\b/.test(src)).toBe(false);
    expect(src.includes("=>")).toBe(false);
    expect(/fbevents|facebook/.test(src)).toBe(false);
  });
});
