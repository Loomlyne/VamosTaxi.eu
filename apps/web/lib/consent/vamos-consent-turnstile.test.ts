// app/vamos-consent.js hands out the page's Turnstile widget. The cookie banner asks for action 'consent'; the
// sign-in page (S5, 2026-10-05) asks for 'account' with the visitor's language and a hook for "the box opens".
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import vm from "node:vm";
import { describe, expect, it, vi } from "vitest";

const src = readFileSync(resolve(__dirname, "../../../../app/vamos-consent.js"), "utf8");

type Options = Record<string, unknown> & {
  callback: (t: string) => void;
  "expired-callback": () => void;
  "error-callback": () => void;
};

function load(siteKey: string | null, page: { apiLoaded?: boolean; tag?: boolean } = {}) {
  const rendered: Options[] = [];
  const executed: string[] = [];
  const scripts: Array<{ src?: string }> = [];
  const win: Record<string, unknown> = {
    VamosLocale: { lang: () => "en" },
    turnstile: page.apiLoaded === false ? undefined : {
      render: (_box: unknown, o: Options) => {
        rendered.push(o);
        return `w${rendered.length}`;
      },
      execute: (id: string) => void executed.push(id),
      reset: () => undefined,
      remove: () => undefined,
    },
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  };
  const ctx = vm.createContext({
    window: win,
    location: { hostname: "localhost" },
    document: {
      querySelector: (sel: string) => {
        if (sel.includes("vt-turnstile-site-key")) return siteKey !== null ? { getAttribute: () => siteKey } : null;
        if (sel.includes("turnstile/v0/api.js")) return page.tag ? {} : null;
        return null;
      },
      createElement: () => ({}),
      head: { appendChild: (el: { src?: string }) => scripts.push(el) },
    },
    localStorage: { getItem: () => null, setItem: () => undefined, removeItem: () => undefined },
    fetch: () => Promise.reject(new Error("unused")),
    Promise,
    JSON,
    Date,
    setTimeout,
    clearTimeout,
    console,
  });
  vm.runInContext(src, ctx);
  return { api: win.VamosConsent as { turnstile: (...a: unknown[]) => { execute(): void; remove(): void } }, rendered, executed, scripts };
}

describe("VamosConsent.turnstile", () => {
  it("keeps asking for action 'consent', in 'interaction-only' / 'execute' mode, when no options are given", () => {
    const h = load("site-key");
    const w = h.api.turnstile({}, () => undefined, () => undefined);
    w.execute();
    expect(h.rendered).toHaveLength(1);
    expect(h.rendered[0]).toMatchObject({ sitekey: "site-key", action: "consent", appearance: "interaction-only", execution: "execute" });
    expect(h.rendered[0]).not.toHaveProperty("language");
    expect(h.rendered[0]).not.toHaveProperty("before-interactive-callback");
    expect(h.executed).toEqual(["w1"]);
  });

  it("asks for action 'account' with a language and an interaction hook when the sign-in page says so", () => {
    const h = load("site-key");
    const seen: boolean[] = [];
    const tokens: string[] = [];
    h.api.turnstile({}, (t: string) => tokens.push(t), () => undefined, {
      action: "account",
      language: "ar-eg",
      onInteractive: (open: boolean) => seen.push(open),
    });
    const o = h.rendered[0]!;
    expect(o).toMatchObject({ action: "account", language: "ar-eg" });
    (o["before-interactive-callback"] as () => void)();
    (o["after-interactive-callback"] as () => void)();
    expect(seen).toEqual([true, false]);
    o.callback("tok");
    expect(tokens).toEqual(["tok"]);
  });

  it("with no site key on the page it reports 'no-site-key' and renders nothing", () => {
    const h = load(null);
    const onError = vi.fn();
    const w = h.api.turnstile({}, () => undefined, onError, { action: "account" });
    w.execute();
    expect(onError).toHaveBeenCalledWith("no-site-key");
    expect(h.rendered).toHaveLength(0);
  });

  it("adds the Turnstile script once, and not at all when the page already carries the tag", () => {
    const fresh = load("site-key", { apiLoaded: false });
    fresh.api.turnstile({}, () => undefined, () => undefined).remove();
    fresh.api.turnstile({}, () => undefined, () => undefined).remove();
    expect(fresh.scripts).toHaveLength(1);

    const tagged = load("site-key", { apiLoaded: false, tag: true });
    tagged.api.turnstile({}, () => undefined, () => undefined).remove();
    expect(tagged.scripts).toHaveLength(0);
  });
});
