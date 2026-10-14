// Phase 32 plan 11: the home review card's translate control (UI-SPEC surface C).
// The DC logic class is run in a vm with a stub VamosLocale and VamosReviews.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createContext, runInContext } from "node:vm";
import { describe, expect, it } from "vitest";
import { WEB_ROOT } from "../../tests/support/server-harness";

const REPO = join(WEB_ROOT, "..", "..");
const html = readFileSync(join(REPO, "app/home/Reviews.dc.html"), "utf8");
const store = readFileSync(join(REPO, "app/vamos-reviews.js"), "utf8");
const strings = readFileSync(
  join(REPO, ".planning/phases/32-auto-translate/32-STRINGS.md"),
  "utf8",
);

const dcLogic = (src: string) => {
  const tag = src.indexOf('<script type="text/x-dc" data-dc-script');
  const start = src.indexOf(">", tag) + 1;
  return src.slice(start, src.indexOf("</script>", start));
};

/** English column of 32-STRINGS.md section C, by key. */
function sectionC(): Record<string, string> {
  const from = strings.indexOf("## C. Home review card");
  const next = strings.indexOf("\n## ", from + 5);
  const out: Record<string, string> = {};
  for (const line of strings.slice(from, next < 0 ? undefined : next).split("\n")) {
    const cells = line.split("|").map((c) => c.trim());
    if (cells.length > 3 && cells[1] && cells[2] && !/^[-:]+$/.test(cells[1]) && cells[1] !== "Key") {
      out[cells[1].replace(/\s*\(.*\)$/, "")] = cells[2];
    }
  }
  return out;
}

type Row = { id: string; ref: string; lang: string; text: string; source: string; rating: number; name: string; route: string; url: string };
type Answer = { ok: boolean; text?: string };
type Card = Record<string, unknown> & { tap: () => void };

function mk(opts: { lang?: string; rows?: Row[] } = {}) {
  const calls: Array<{ ref: string; lang: string; resolve: (a: Answer) => void }> = [];
  const timers = new Map<number, { f: () => void; ms: number }>();
  let tid = 0;
  const localeSubs: Array<(v: { lang: string }) => void> = [];
  const rows = opts.rows ?? [
    { id: "", ref: "aaaaaaaaaaaaaaaa", lang: "de", text: "Sehr gut", source: "manual", rating: 5, name: "A", route: "", url: "" },
    { id: "", ref: "bbbbbbbbbbbbbbbb", lang: "en", text: "Great", source: "manual", rating: 5, name: "B", route: "", url: "" },
    { id: "", ref: "cccccccccccccccc", lang: "", text: "Unknown", source: "manual", rating: 5, name: "C", route: "", url: "" },
  ];
  const win = {
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    matchMedia: () => ({ matches: false, addEventListener: () => undefined }),
    VamosLocale: {
      lang: () => opts.lang ?? "en",
      onChange: (fn: (v: { lang: string }) => void) => {
        localeSubs.push(fn);
        return () => undefined;
      },
    },
    VamosReviews: {
      published: () => rows,
      ready: () => true,
      onChange: () => () => undefined,
      sourceLabel: (s: string) => s,
      translate: (ref: string, lang: string) =>
        new Promise<Answer>((resolve) => calls.push({ ref, lang, resolve })),
    },
  };
  const DCLogic = class {
    props: Record<string, unknown> = {};
    state: Record<string, unknown> = {};
    setState(p: Record<string, unknown> | ((s: Record<string, unknown>) => Record<string, unknown>)) {
      this.state = { ...this.state, ...(typeof p === "function" ? p(this.state) : p) };
    }
  };
  const ctx = createContext({
    window: win,
    DCLogic,
    console,
    URL,
    Object,
    setInterval: () => 0,
    clearInterval: () => undefined,
    setTimeout: (f: () => void, ms: number) => {
      timers.set(++tid, { f, ms });
      return tid;
    },
    clearTimeout: (id: number) => {
      timers.delete(id);
    },
  });
  runInContext(`${dcLogic(html)}\n;globalThis.__C = Component;`, ctx);
  const C = (ctx as unknown as { __C: new () => { state: Record<string, unknown>; componentDidMount(): void; renderVals(): Record<string, unknown> } }).__C;
  const c = new C();
  const cardsOf = () => c.renderVals().cards as [Card, Card, Card, ...Card[]];
  return { c, calls, timers, cardsOf, localeSubs, win };
}

const flushMicro = () => new Promise((r) => setTimeout(r, 0));

describe("review card translate control (UI-SPEC surface C)", () => {
  it("fetches nothing on mount or render", () => {
    const { c, calls, cardsOf } = mk();
    c.componentDidMount();
    cardsOf();
    cardsOf();
    expect(calls).toHaveLength(0);
  });

  it("shows the control only when the review language is known and differs from the site language", () => {
    const { c, cardsOf } = mk();
    c.componentDidMount();
    const [de, en, unknown] = cardsOf();
    expect(de.trShow).toBe(true);
    expect(en.trShow).toBe(false);
    expect(unknown.trShow).toBe(false);
  });

  it("walks idle -> busy -> translated -> original -> translated with one request", async () => {
    const { c, calls, cardsOf } = mk();
    c.componentDidMount();
    let card = cardsOf()[0];
    expect(card.trLabel).toBe("Translate");
    expect(card.trIcon).toBe("globe");
    expect(card.shown).toBe("Sehr gut");
    expect(card.trBusy).toBeNull();
    card.tap();
    expect(calls).toEqual([expect.objectContaining({ ref: "aaaaaaaaaaaaaaaa", lang: "en" })]);
    card = cardsOf()[0];
    expect(card.trLabel).toBe("Translating…");
    expect(card.trIcon).toBe("loader-circle");
    expect(card.trBusy).toBe("true");
    expect(card.shown).toBe("Sehr gut");
    card.tap(); // busy: no second request
    expect(calls).toHaveLength(1);
    calls[0]!.resolve({ ok: true, text: "Very good" });
    await flushMicro();
    card = cardsOf()[0];
    expect(card.trLabel).toBe("Show original");
    expect(card.trIcon).toBe("globe");
    expect(card.shown).toBe("Very good");
    expect(card.qLang).toBe("en");
    expect(card.qDir).toBe("ltr");
    card.tap();
    card = cardsOf()[0];
    expect(card.trLabel).toBe("Translate");
    expect(card.shown).toBe("Sehr gut");
    expect(card.qDir).toBe("auto");
    card.tap(); // second tap after done: shown again, no request
    card = cardsOf()[0];
    expect(card.shown).toBe("Very good");
    expect(calls).toHaveLength(1);
  });

  it("an Arabic site sets dir rtl on the translated text", async () => {
    const { c, calls, cardsOf } = mk({ lang: "ar" });
    c.componentDidMount();
    cardsOf()[0].tap();
    calls[0]!.resolve({ ok: true, text: "جيد جدا" });
    await flushMicro();
    const card = cardsOf()[0];
    expect(card.qDir).toBe("rtl");
    expect(card.qLang).toBe("ar");
  });

  it("a failed request keeps the original, shows the note and Try again; a retry asks again", async () => {
    const { c, calls, cardsOf } = mk();
    c.componentDidMount();
    cardsOf()[0].tap();
    calls[0]!.resolve({ ok: false });
    await flushMicro();
    let card = cardsOf()[0];
    expect(card.trFailed).toBe(true);
    expect(card.trLabel).toBe("Try again");
    expect(card.shown).toBe("Sehr gut");
    card.tap();
    expect(calls).toHaveLength(2);
    card = cardsOf()[0];
    expect(card.trFailed).toBe(false);
    expect(card.trLabel).toBe("Translating…");
  });

  it("the 20 s ceiling turns busy into failed and a late answer is ignored", async () => {
    const { c, calls, timers, cardsOf } = mk();
    c.componentDidMount();
    cardsOf()[0].tap();
    const ceiling = [...timers.values()].find((t) => t.ms === 20000);
    expect(ceiling).toBeTruthy();
    ceiling!.f();
    expect(cardsOf()[0].trFailed).toBe(true);
    calls[0]!.resolve({ ok: true, text: "late" });
    await flushMicro();
    expect(cardsOf()[0].shown).toBe("Sehr gut");
  });

  it("a site language change drops every translated card back to the original", async () => {
    const { c, calls, cardsOf, localeSubs } = mk();
    c.componentDidMount();
    cardsOf()[0].tap();
    calls[0]!.resolve({ ok: true, text: "Very good" });
    await flushMicro();
    expect(cardsOf()[0].shown).toBe("Very good");
    expect(localeSubs).toHaveLength(1);
    localeSubs[0]?.({ lang: "fr" });
    const card = cardsOf()[0];
    expect(card.shown).toBe("Sehr gut");
    expect(card.trLabel).toBe("Translate");
    expect(calls).toHaveLength(1);
  });

  it("the drifting wall: the visible card and its hidden copies change together, copies stay inert", async () => {
    const rows: Row[] = Array.from({ length: 7 }, (_, i) => ({
      id: "",
      ref: String(i).repeat(16),
      lang: "de",
      text: `Text ${i}`,
      source: "manual",
      rating: 5,
      name: `N${i}`,
      route: "",
      url: "",
    }));
    const { c, calls, cardsOf } = mk({ rows });
    c.componentDidMount();
    const first = cardsOf()[0];
    first.tap();
    calls[0]!.resolve({ ok: true, text: "Translated 0" });
    await flushMicro();
    const v = c.renderVals() as { drift: boolean; cols: Array<{ items: Array<Record<string, unknown>> }> };
    expect(v.drift).toBe(true);
    const mine = v.cols.flatMap((col) => col.items).filter((o) => o.qid === `rvq-${"0".repeat(16)}` || String(o.qid).startsWith(`rvq-${"0".repeat(16)}-c`));
    expect(mine).toHaveLength(4);
    expect(mine.every((o) => o.shown === "Translated 0")).toBe(true);
    const copies = mine.filter((o) => o.cloneAttr === "1");
    expect(copies).toHaveLength(3);
    expect(copies.every((o) => o.inertAttr === "" && o.hiddenAttr === "true")).toBe(true);
    expect(new Set(mine.map((o) => o.qid)).size).toBe(4);
  });

  it("emits exactly the signed English labels of 32-STRINGS.md section C", async () => {
    const C = sectionC();
    const { c, calls, cardsOf } = mk();
    c.componentDidMount();
    expect(cardsOf()[0].trLabel).toBe(C.rvTranslate);
    cardsOf()[0].tap();
    expect(cardsOf()[0].trLabel).toBe(C.translating);
    calls[0]!.resolve({ ok: true, text: "x" });
    await flushMicro();
    expect(cardsOf()[0].trLabel).toBe(C.rvShowOriginal);
    // failed
    const m2 = mk();
    m2.c.componentDidMount();
    m2.cardsOf()[0].tap();
    m2.calls[0]!.resolve({ ok: false });
    await flushMicro();
    expect(m2.cardsOf()[0].trLabel).toBe(C.tryAgain);
    const note = /<span data-rv-tr-note="1" role="status">([^<]+)<\/span>/.exec(html);
    expect(note?.[1]).toBe(C.trNotAvailable);
    expect(C.rvTranslate).toBe("Translate");
    expect(C.translating).toBe("Translating…");
  });

  it("markup: ref-keyed, quote stays no-i18n, escaped text binding, no vendor or machine words, laws kept", () => {
    expect(html.match(/data-rv-tr="1"/g)).toHaveLength(2);
    expect(html.match(/data-rv-tr-row="1"/g)).toHaveLength(2);
    expect(html.match(/<p data-rv-text="1" data-vt-no-i18n="1"/g)).toHaveLength(2);
    expect(html).toContain("<bdi>{{ r.shown }}</bdi>");
    expect(html).not.toMatch(/innerHTML|dangerouslySetInnerHTML|v-html/);
    expect(html).not.toMatch(/\br\.id\b/);
    expect(html).not.toMatch(/gemma|google ai|cloudflare|machine/i);
    expect(html).not.toContain("const T = {");
    expect(html).toContain("--vt-shadow-accent:none");
    expect(html).toContain("aria-describedby=\"{{ r.qid }}\"");
    const css = html.slice(html.indexOf("[data-rv-tr-row]"), html.indexOf("[data-rv-text]{"));
    expect(css).not.toMatch(/(margin|padding)-(left|right)|box-shadow:[^;}]*(rgba|#)/);
    expect(css).toContain("min-block-size:44px");
    expect(html).not.toMatch(/localStorage/);
  });

  it("the store asks by opaque ref, never throws, and keeps nothing", async () => {
    expect(store).toContain("/translation?lang=");
    const win: Record<string, unknown> = {
      addEventListener: () => undefined,
      dispatchEvent: () => true,
      CustomEvent: class {},
    };
    const paths: string[] = [];
    let reply: unknown = { ok: true, data: { text: "Hi" } };
    win.VamosOpsApi = {
      request: (m: string, p: string) => {
        paths.push(`${m} ${p}`);
        return reply instanceof Error ? Promise.reject(reply) : Promise.resolve(reply);
      },
    };
    const ctx = createContext({ window: win, location: { hostname: "vamostaxi.site" }, console, Promise });
    runInContext(store, ctx);
    const s = win.VamosReviews as {
      translate(ref: string, lang: string): Promise<Answer>;
      all(): unknown[];
    };
    expect(await s.translate("abc123", "de")).toEqual({ ok: true, text: "Hi" });
    expect(paths[0]).toBe("GET /api/reviews/abc123/translation?lang=de");
    reply = { ok: false, code: "unavailable" };
    expect(await s.translate("abc123", "de")).toEqual({ ok: false });
    reply = { ok: true, data: {} };
    expect(await s.translate("abc123", "de")).toEqual({ ok: false });
    reply = new Error("boom");
    expect(await s.translate("abc123", "de")).toEqual({ ok: false });
  });
});
