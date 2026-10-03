// 261003 contact button (owner-signed direction B): the DC component on every public page, the
// React twin on the Next pages, the PAY-bar dock, the four channels, the laws, and the menu logic.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createContext, runInContext } from "node:vm";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";
import { WEB_ROOT } from "../tests/support/server-harness";

// next-intl's router needs next/navigation, which the node runner cannot load; the link is a plain anchor here.
vi.mock("next-intl/navigation", () => ({
  createNavigation: () => ({
    Link: ({ href, children, ...rest }: { href: string; children?: unknown }) => createElement("a", { href, ...rest }, children as never),
  }),
}));
import { CONTACT_CHANNELS, HIDE_FLAGS, contactPath, isTextField, triggerLabelKey } from "./contact-button";
import { ContactButton } from "@/components/shell/ContactButton";

const REPO = join(WEB_ROOT, "..", "..");
const read = (rel: string) => readFileSync(join(REPO, rel), "utf8");

const middleware = read("apps/web/middleware.ts");
const dcBlock = middleware.slice(middleware.indexOf("const DC_PAGES"), middleware.indexOf("};", middleware.indexOf("const DC_PAGES")));
/** Every public route's mock file (app/... source), from DC_PAGES in middleware.ts. */
const homeFile = /const DC_HOME = "\/app\/home\/([a-z-]+)\.html"/.exec(middleware)?.[1];
const DC_FILES = [
  ...new Set([
    ...(dcBlock.includes('"/": DC_HOME') && homeFile ? [`app/home/${homeFile}.dc.html`] : []),
    ...[...dcBlock.matchAll(/"\/app\/(home|pages)\/([a-z-]+)\.html"/g)].map((m) => `app/${m[1]}/${m[2]}.dc.html`),
  ]),
];

const BTN = { pages: read("app/pages/ContactButton.dc.html"), home: read("app/home/ContactButton.dc.html") };
const ROW = { pages: read("app/pages/ContactRow.dc.html"), home: read("app/home/ContactRow.dc.html") };
const reactCss = read("apps/web/components/shell/ContactButton.css");
const reactTsx = read("apps/web/components/shell/ContactButton.tsx") + read("apps/web/components/shell/ContactRow.tsx");

const styles = (html: string) => [...html.matchAll(/<style>([\s\S]*?)<\/style>/g)].map((m) => m[1]).join("\n");

describe("mounted on every public page", () => {
  it("DC_PAGES lists the 18 mock files", () => {
    expect(DC_FILES.length).toBe(18);
    expect(DC_FILES).toContain("app/home/home.dc.html");
    expect(DC_FILES).toContain("app/pages/coming-soon.dc.html");
  });

  it.each(DC_FILES)("%s imports ContactButton once, as the float, after the CookieBanner", (rel) => {
    const src = read(rel);
    const hits = src.match(/<dc-import name="ContactButton"[^>]*>/g) ?? [];
    expect(hits).toEqual(['<dc-import name="ContactButton" variant="float" hint-size="0,0">']);
    expect(src.indexOf('name="ContactButton"')).toBeGreaterThan(src.indexOf('name="CookieBanner"'));
  });

  it("no ops screen carries it", () => {
    const dir = join(REPO, "app/ops");
    for (const f of readdirSync(dir).filter((n) => n.endsWith(".dc.html"))) {
      expect(readFileSync(join(dir, f), "utf8"), f).not.toContain('name="ContactButton"');
    }
  });

  it("the Next shell mounts the React twin and the PAY bar docks it; the old V button is gone", () => {
    expect(read("apps/web/components/shell/SiteShell.tsx")).toContain("<ContactButton />");
    const pay = read("apps/web/components/checkout/PayBar.tsx");
    expect(pay).toMatch(/variant === "bar" \? <ContactButton variant="docked" \/>/);
    expect(read("apps/web/components/shell/index.ts")).not.toContain("ContactFab");
  });
});

describe("twins and channels", () => {
  it("home and pages twins are byte-identical", () => {
    expect(BTN.home).toBe(BTN.pages);
    expect(ROW.home).toBe(ROW.pages);
  });

  it("four rows in the owner's order with the exact hrefs, in the card and in the sheet", () => {
    const rowsOf = (html: string, size: string) =>
      [...html.matchAll(/<dc-import name="ContactRow" icon="([^"]+)" title="([^"]+)"[^>]*?href="([^"]+)"[^>]*?size="([a-z]+)" onFollow/g)]
        .filter((m) => m[4] === size)
        .map((m) => [m[2], m[3]]);
    const want = [
      ["WhatsApp", "https://wa.me/41796267082"],
      ["Call us", "tel:+41796267082"],
      ["Email", "mailto:info@vamostaxi.site"],
      ["Send us a message", "{{ contactHref }}"],
    ];
    expect(rowsOf(BTN.pages, "card")).toEqual(want);
    expect(rowsOf(BTN.pages, "sheet")).toEqual(want);
    expect(BTN.pages).toMatch(/s\.lang === 'en' \? '\/contact' : '\/' \+ s\.lang \+ '\/contact'/);
    expect(CONTACT_CHANNELS.map((c) => [c.id, c.href])).toEqual([
      ["whatsapp", "https://wa.me/41796267082"],
      ["call", "tel:+41796267082"],
      ["email", "mailto:info@vamostaxi.site"],
      ["form", null],
    ]);
    expect(CONTACT_CHANNELS[0]!.newTab).toBe(true);
  });

  it("numbers and the address are kept left to right and never translated", () => {
    expect(ROW.pages).toContain('class="vt-dir-keep" data-vt-no-i18n="1">{{ sub }}');
    expect(BTN.pages).toMatch(/title="Send us a message" sub="Contact form" keep="\{\{ no \}\}"/);
  });
});

describe("laws", () => {
  for (const [name, html] of [["ContactButton", BTN.pages], ["ContactRow", ROW.pages]] as const) {
    it(`${name}: both law lines in the helmet, no glow, no tinted yellow, no physical sides`, () => {
      const css = styles(html);
      expect(css).toContain("--vt-shadow-accent:none");
      expect(css).toContain(".vt-input--focus{box-shadow:none}");
      expect(css.replace("--vt-shadow-accent:none", "")).not.toContain("--vt-shadow-accent");
      expect(css).not.toMatch(/--vt-yellow-(50|100|200|300|600|700)\b/);
      expect(css).not.toMatch(/(^|[;{\s])(left|right|margin-left|margin-right|padding-left|padding-right)\s*:/);
      expect(css).not.toMatch(/rotate\(|scale\(/);
      expect(css).toMatch(/prefers-reduced-motion:reduce/);
    });
  }

  it("ContactButton is hidden in print", () => {
    expect(styles(BTN.pages)).toContain("@media print{[data-contact-btn],[data-cb-gal]{display:none!important}}");
  });

  it("React CSS: no glow, no tinted yellow, logical sides only, no rotate or scale", () => {
    expect(reactCss).not.toContain("--vt-shadow-accent");
    expect(reactCss).not.toMatch(/--vt-yellow-(50|100|200|300|600|700)\b/);
    expect(reactCss).not.toMatch(/^\s*(left|right|margin-left|margin-right|padding-left|padding-right)\s*:/m);
    expect(reactCss).not.toMatch(/rotate\(|scale\(/);
  });
});

describe("where the float steps aside", () => {
  it("the DC rules hide on the cookie card (phone), keyboard (phone), booking/travellers sheet and a docked button", () => {
    const css = styles(BTN.pages);
    const phone = css.slice(css.indexOf("@media (max-width:680px){"));
    expect(phone).toContain('html[data-vt-ck-open] [data-contact-btn][data-variant="float"]');
    expect(phone).toContain('[data-contact-btn][data-variant="float"][data-kb="1"]');
    for (const f of [HIDE_FLAGS.bookingSheetOpen, HIDE_FLAGS.travellersSheetOpen, HIDE_FLAGS.docked]) {
      expect(css).toContain(`html[${f}] [data-contact-btn][data-variant="float"]`);
    }
  });

  it("the React rules match", () => {
    const phone = reactCss.slice(reactCss.indexOf("@media (max-width: 680px)"));
    expect(phone).toContain("html[data-vt-ck-open] .vt-cbtn--float");
    expect(phone).toContain('.vt-cbtn--float[data-kb="1"]');
    for (const f of [HIDE_FLAGS.bookingSheetOpen, HIDE_FLAGS.travellersSheetOpen, HIDE_FLAGS.docked]) {
      expect(reactCss).toContain(`html[${f}] .vt-cbtn--float`);
    }
    expect(reactCss).toContain("calc(24px + var(--vt-ck-reserve, 0px))");
  });

  it("the owners of each state set the flag", () => {
    for (const twin of ["app/pages/CookieBanner.dc.html", "app/home/CookieBanner.dc.html"]) {
      const src = read(twin);
      expect(src).toContain("root.toggleAttribute('data-vt-ck-open', this.state.mode === 'banner')");
      expect(src).toContain("document.documentElement.removeAttribute('data-vt-ck-open')");
    }
    expect(read("apps/web/components/consent/CookieBanner.tsx")).toContain('root.setAttribute("data-vt-ck-open", "1")');
    const sheet = read("app/home/BookingSheet.dc.html");
    expect(sheet).toContain("de.setAttribute('data-vt-sheet-open', '1')");
    expect(sheet).toContain("de.removeAttribute('data-vt-sheet-open')");
    const home = read("app/home/home.dc.html");
    expect(home).toContain("toggleAttribute('data-vt-trav-open', !!on)");
    expect(home).toContain('data-bar-wrap="1" data-contact-lift="1"');
  });

  it("home: the lift is an IntersectionObserver over the bottom strip, never a scroll handler", () => {
    expect(BTN.pages).toContain("new window.IntersectionObserver(");
    expect(BTN.pages).toContain("document.querySelector('[data-contact-lift]')");
    expect(BTN.pages).not.toMatch(/addEventListener\('scroll'/);
    expect(BTN.pages).not.toMatch(/style\.setProperty\(/);
  });
});

describe("accessibility markup", () => {
  it("trigger: aria-expanded, aria-controls and a label; card is a dialog; sheet is a modal dialog", () => {
    const triggers = BTN.pages.match(/data-cb-trigger="1"[^>]*>/g) ?? [];
    expect(triggers.length).toBe(3);
    for (const t of triggers) {
      expect(t).toContain('aria-expanded="{{ openStr }}"');
      expect(t).toContain('aria-controls="{{ ariaControls }}"');
    }
    expect(BTN.pages).toMatch(/data-cb-panel="1" id="\{\{ menuId \}\}" role="dialog" aria-labelledby="\{\{ titleId \}\}" tabindex="-1"/);
    expect(BTN.pages).toMatch(/data-cb-sheet="1" id="\{\{ menuId \}\}" role="dialog" aria-modal="true"/);
    expect(BTN.pages).toContain("<ul data-cb-rows=\"1\">");
    expect(reactTsx).toContain('aria-modal="true"');
    expect(reactTsx).toContain('"aria-expanded": open');
  });
});

describe("lib/contact-button", () => {
  it("contact form address per language", () => {
    expect(contactPath("en")).toBe("/contact");
    expect(contactPath("de")).toBe("/de/contact");
    expect(contactPath("ar")).toBe("/ar/contact");
    expect(contactPath("xx")).toBe("/contact");
  });

  it("text fields raise the keyboard, buttons and checkboxes do not", () => {
    expect(isTextField({ nodeType: 1, tagName: "INPUT", type: "text" })).toBe(true);
    expect(isTextField({ nodeType: 1, tagName: "INPUT", type: "email" })).toBe(true);
    expect(isTextField({ nodeType: 1, tagName: "TEXTAREA" })).toBe(true);
    expect(isTextField({ nodeType: 1, tagName: "INPUT", type: "checkbox" })).toBe(false);
    expect(isTextField({ nodeType: 1, tagName: "BUTTON" })).toBe(false);
    expect(isTextField({ nodeType: 1, tagName: "DIV", isContentEditable: true })).toBe(true);
    expect(isTextField(null)).toBe(false);
  });

  it("the trigger's name says what it will do", () => {
    expect(triggerLabelKey(false)).toBe("openOptions");
    expect(triggerLabelKey(true)).toBe("closeOptions");
  });

  it("every contactButton message exists in the four languages", () => {
    const keys = ["contact", "close", "talk", "whatsapp", "callUs", "email", "sendMessage", "contactForm", "openOptions", "closeOptions"];
    for (const l of ["en", "de", "fr", "ar"]) {
      const m = JSON.parse(read(`apps/web/i18n/messages/${l}.json`)) as { contactButton: Record<string, string> };
      expect(Object.keys(m.contactButton).sort(), l).toEqual([...keys].sort());
    }
  });
});

describe("React twin renders closed with the right names", () => {
  it("float: pill and disc, both named 'Open contact options', aria-expanded false", () => {
    const messages = JSON.parse(read("apps/web/i18n/messages/de.json"));
    const html = renderToStaticMarkup(
      createElement(NextIntlClientProvider, { locale: "de", messages, children: createElement(ContactButton) }),
    );
    expect(html).toContain('data-contact-btn="1"');
    expect(html).toContain('data-variant="float"');
    expect(html.match(/aria-label="Kontaktoptionen öffnen"/g)?.length).toBe(2);
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain("Kontakt");
    expect(html).not.toContain('role="dialog"');
  });
});

// ── the DC logic, run in a vm with a minimal DOM ──────────────────────────────────────────
const dcLogic = (html: string) => {
  const tag = html.indexOf('<script type="text/x-dc" data-dc-script');
  const start = html.indexOf(">", tag) + 1;
  return html.slice(start, html.indexOf("</script>", start));
};

type Fn = (e: Record<string, unknown>) => void;
function openDc(narrow = false) {
  const listeners: Record<string, Fn[]> = {};
  const focused: string[] = [];
  const el = (name: string, inside: boolean) => ({ name, inside, focus: () => focused.push(name), getClientRects: () => [1] });
  const trigger = el("trigger", true);
  const panel = { ...el("panel", true), contains: (n: { inside?: boolean }) => !!n && n.inside === true, querySelectorAll: () => [] };
  const root = { contains: (n: { inside?: boolean }) => !!n && n.inside === true, querySelector: () => trigger, parentElement: null };
  const html = { attrs: {} as Record<string, string>, setAttribute(k: string, v: string) { this.attrs[k] = v; }, removeAttribute(k: string) { delete this.attrs[k]; } };
  const document = {
    documentElement: html,
    body: { name: "body" },
    activeElement: null as unknown,
    addEventListener: (t: string, f: Fn) => { (listeners[t] ??= []).push(f); },
    removeEventListener: () => undefined,
    querySelector: () => null,
  };
  const timers: (() => void)[] = [];
  const win = {
    location: { search: "" },
    innerWidth: narrow ? 390 : 1440, innerHeight: 844,
    matchMedia: () => ({ matches: narrow, addEventListener: () => undefined }),
    addEventListener: () => undefined, removeEventListener: () => undefined,
    VamosLocale: { lang: () => "de", onChange: () => () => undefined },
  };
  const DCLogic = class {
    props: Record<string, unknown>;
    state: Record<string, unknown> = {};
    constructor(props?: Record<string, unknown>) { this.props = props ?? {}; }
    setState(p: Record<string, unknown> | ((s: Record<string, unknown>) => Record<string, unknown>), cb?: () => void) {
      this.state = { ...this.state, ...(typeof p === "function" ? p(this.state) : p) };
      cb?.();
    }
  };
  const ctx = createContext({
    window: win, document, DCLogic, console,
    React: { createRef: () => ({ current: null }) },
    setTimeout: (f: () => void) => { timers.push(f); return timers.length; },
    clearTimeout: () => undefined,
  });
  runInContext(`${dcLogic(BTN.pages)}\n;globalThis.__C = Component;`, ctx);
  const C = (ctx as unknown as { __C: new (p: Record<string, unknown>) => Record<string, unknown> }).__C;
  const c = new C({ variant: "float" }) as unknown as {
    state: Record<string, unknown>; rootRef: { current: unknown }; panelRef: { current: unknown };
    componentDidMount(): void; renderVals(): Record<string, unknown>;
  };
  c.rootRef.current = root;
  c.panelRef.current = panel;
  c.componentDidMount();
  const fire = (t: string, e: Record<string, unknown>) => (listeners[t] ?? []).forEach((f) => f(e));
  const flush = () => { while (timers.length) timers.shift()!(); };
  return { c, fire, flush, focused, document, trigger, panel };
}

describe("DC menu logic", () => {
  it("opens on the trigger, moves focus into the menu, Esc closes and returns focus", () => {
    const { c, fire, focused } = openDc();
    const v = c.renderVals();
    expect(v.showPill).toBe(true);
    expect(v.triggerLabel).toBe("Open contact options");
    expect(v.contactHref).toBe("/de/contact");
    (v.toggle as () => void)();
    expect(c.state.open).toBe(true);
    expect(c.renderVals().showCard).toBe(true);
    expect(c.renderVals().pillLabel).toBe("Close");
    expect(c.renderVals().ariaControls).toMatch(/^vt-cb-[a-z0-9]+-menu$/);
    expect(focused).toEqual(["panel"]);
    let prevented = false;
    fire("keydown", { key: "Escape", preventDefault: () => { prevented = true; } });
    expect(prevented).toBe(true);
    expect(c.state.open).toBe(false);
    expect(focused).toEqual(["panel", "trigger"]);
  });

  it("a tap outside closes it; focus goes back to the button when nothing else took it", () => {
    const { c, fire, flush, focused, document } = openDc();
    (c.renderVals().toggle as () => void)();
    fire("pointerdown", { target: { inside: true } });
    expect(c.state.open).toBe(true);
    fire("pointerdown", { target: { inside: false } });
    expect(c.state.open).toBe(false);
    document.activeElement = document.body;
    flush();
    expect(focused.at(-1)).toBe("trigger");
  });

  it("following a row closes the menu; on a phone the menu is the sheet", () => {
    const { c } = openDc(true);
    const v = c.renderVals();
    expect(v.showDisc).toBe(true);
    expect(v.showPill).toBe(false);
    (v.toggle as () => void)();
    expect(c.renderVals().showSheet).toBe(true);
    expect(c.renderVals().showCard).toBe(false);
    (c.renderVals().follow as () => void)();
    expect(c.state.open).toBe(false);
  });

  it("a text field with focus marks the keyboard as up; leaving it clears the mark", () => {
    const { c, fire, flush, document } = openDc(true);
    fire("focusin", { target: { nodeType: 1, tagName: "INPUT", type: "text" } });
    expect(c.renderVals().kbAttr).toBe("1");
    document.activeElement = { nodeType: 1, tagName: "BUTTON" };
    fire("focusout", {});
    flush();
    expect(c.renderVals().kbAttr).toBe("0");
  });

  it("only a docked button flags the page (the float never hides itself)", () => {
    const { document } = openDc();
    expect(document.documentElement.attrs[HIDE_FLAGS.docked]).toBeUndefined();
    expect(BTN.pages).toContain("if (this.variant() === 'docked') document.documentElement.setAttribute('data-vt-contact-docked', '1');");
  });
});
