// apps/web/lib/ops/support-reply-dc.test.ts
//
// Phase 32 plan 10: the reply flow of app/ops/OpsSupportTicket.dc.html, run for real. The script block of the
// page is evaluated in a vm with stubbed VamosOpsApi, VamosLocale, window.open, navigator.userActivation and
// timers; no DOM, no network. The dashboard sends nothing: the mail opens in his own mail app or Gmail.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "../../../..");
const SRC = readFileSync(join(repoRoot, "app/ops/OpsSupportTicket.dc.html"), "utf8");

const SCRIPT = (() => {
  const m = SRC.match(/<script type="text\/x-dc" data-dc-script[^>]*>([\s\S]*?)<\/script>/);
  if (!m?.[1]) throw new Error("page script not found");
  return m[1];
})();

const MAILTO = "mailto:anna@example.ch?subject=Re%3A%20Hallo&In-Reply-To=%3Cx%40y%3E";
const GMAIL = "https://mail.google.com/mail/?view=cm&fs=1&to=anna%40example.ch&su=Re%3A%20Hallo";
const HY = "--------------------";

type Json = { ok: boolean; data?: unknown };
type Deferred = { body: Record<string, unknown>; path: string; resolve: (v: Json) => void; reject: () => void };

type Ticket = Record<string, unknown>;

function ticket(over: Partial<Ticket> = {}, replyLang = "de", msgLang = "de"): Ticket {
  return {
    id: "t1", ticketId: "VT-T1", status: "open", name: "Anna Muster", email: "anna@example.ch", phone: "",
    bookingRef: "", locale: "de", when: "1 Jan", last: "1 Jan", note: "",
    reply: { mailto: MAILTO, gmail: GMAIL, lang: replyLang },
    messages: [{
      whoKey: "customer", when: "1 Jan", body: "Guten Tag, wo ist mein Fahrer?", files: [],
      lang: msgLang, translation: { status: "ready", text: "Hello, where is my driver?" },
    }],
    ...over,
  };
}

type Env = {
  inst: any;
  win: any;
  posts: Deferred[];
  gets: string[];
  calls: Array<{ method: string; path: string }>;
  nav: { userActivation: { isActive: boolean } };
  tab: { location: { href: string }; opener: unknown; close: () => void; closed: boolean };
  flush: () => Promise<void>;
  openedTab: () => boolean;
};

function load(rows: Ticket[] = [ticket()], lang = "en"): Env {
  const posts: Deferred[] = [];
  const gets: string[] = [];
  const calls: Array<{ method: string; path: string }> = [];
  const listeners: Record<string, Array<(e: unknown) => void>> = {};
  const tab = { location: { href: "" }, opener: {} as unknown, closed: false, close() { tab.closed = true; } };
  let tabOpened = false;
  const nav = { userActivation: { isActive: true } };
  let getData: Ticket[] = rows;
  const api = {
    request(method: string, path: string, body?: Record<string, unknown>) {
      calls.push({ method, path });
      if (method === "GET") {
        gets.push(path);
        return Promise.resolve({ ok: true, data: JSON.parse(JSON.stringify(getData)) });
      }
      return new Promise<Json>((resolve, reject) => {
        posts.push({ body: body ?? {}, path, resolve, reject: () => reject(new Error("net")) });
      });
    },
  };
  const win: any = {
    VamosOpsApi: api,
    VamosLocale: { lang: () => lang },
    localStorage: { getItem: () => null, setItem: () => undefined },
    matchMedia: () => ({ matches: false }),
    location: { href: "" },
    addEventListener: (n: string, f: (e: unknown) => void) => { (listeners[n] ??= []).push(f); },
    removeEventListener: () => undefined,
    dispatchEvent: () => true,
    open: vi.fn((url: string) => {
      if (url === "") { tabOpened = true; return tab; }
      return null;
    }),
    emit: (n: string, e: unknown) => { for (const f of listeners[n] ?? []) f(e); },
    setRows: (r: Ticket[]) => { getData = r; },
  };
  const ctx: Record<string, unknown> = {
    window: win,
    document: { addEventListener: () => undefined, removeEventListener: () => undefined, querySelector: () => null, visibilityState: "visible" },
    navigator: nav,
    requestAnimationFrame: (f: () => void) => f(),
    CustomEvent: class { constructor(public type: string, public init?: unknown) {} },
    setTimeout: (f: () => void, ms?: number) => setTimeout(f, ms),
    clearTimeout: (id: unknown) => clearTimeout(id as never),
    DCLogic: class {
      state: any;
      setState(patch: any, cb?: () => void) {
        Object.assign(this.state, typeof patch === "function" ? patch(this.state) : patch);
        if (cb) cb();
      }
      forceUpdate() {}
    },
  };
  vm.createContext(ctx);
  vm.runInContext(SCRIPT + "\n;globalThis.__Component = Component;", ctx);
  const inst = new (ctx.__Component as new () => any)();
  inst.componentDidMount();
  return {
    inst, win, posts, gets, calls, nav, tab,
    flush: async () => { for (let i = 0; i < 8; i += 1) await Promise.resolve(); },
    openedTab: () => tabOpened,
  };
}

const typed = (env: Env, text: string) => env.inst.setReplyText({ target: { value: text } });

/** Open the ticket, type, let the 800 ms debounce fire. */
async function typeAndWait(env: Env, text: string) {
  typed(env, text);
  await vi.advanceTimersByTimeAsync(800);
  await env.flush();
}

async function ready(env: Env, translation: string, text = "Where is my driver?") {
  await typeAndWait(env, text);
  const post = env.posts[env.posts.length - 1];
  post?.resolve({ ok: true, data: { status: "ready", text: translation } });
  await env.flush();
}

async function boot(rows?: Ticket[], lang?: string) {
  const env = load(rows, lang);
  await env.flush();
  env.inst.openTicket("t1");
  await env.flush();
  return env;
}

function bodyOf(url: string): string {
  const i = url.indexOf("&body=");
  expect(i, url).toBeGreaterThan(-1);
  return decodeURIComponent(url.slice(i + 6));
}

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

describe("reply mode", () => {
  it("empty box -> empty; target equals his language -> same; outside en/de/fr/ar -> raw; else translate", async () => {
    const env = await boot();
    const open = env.inst.openNow();
    expect(env.inst.replyMode(open, "   ")).toBe("empty");
    expect(env.inst.replyMode(open, "Hi")).toBe("translate");
    env.inst.state.lang = "de";
    expect(env.inst.replyMode(open, "Hi")).toBe("same");
    env.inst.state.lang = "en";
    const tr = await boot([ticket({}, "tr", "tr")]);
    expect(tr.inst.replyMode(tr.inst.openNow(), "Hi")).toBe("raw");
    typed(tr, "Hi");
    const t = tr.inst.renderVals();
    expect(t.replyHint).toContain("Your text stays as written");
  });

  it("the reply target prefers reply.lang, else the latest customer language, else the ticket locale", async () => {
    const a = await boot([ticket({}, "fr", "de")]);
    expect(a.inst.targetOf(a.inst.openNow())).toBe("fr");
    const b = await boot([ticket({}, "", "de")]);
    expect(b.inst.targetOf(b.inst.openNow())).toBe("de");
    const c = await boot([ticket({ locale: "ar", messages: [{ whoKey: "customer", when: "x", body: "y", files: [], lang: "", translation: null }] }, "", "")]);
    expect(c.inst.targetOf(c.inst.openNow())).toBe("ar");
  });
});

describe("mail body", () => {
  it("mail app: translation, blank line, 20 hyphens, blank line, his text; recipient and subject stay the server's", async () => {
    const env = await boot();
    await ready(env, "Wo ist mein Fahrer?", "Where is my driver?");
    env.inst.answerByMail();
    const href = env.win.location.href as string;
    expect(href.startsWith(MAILTO + "&body=")).toBe(true);
    const body = bodyOf(href);
    expect(HY).toHaveLength(20);
    expect(body).toBe("Wo ist mein Fahrer?\n\n" + HY + "\n\nWhere is my driver?");
  });

  it("Gmail: the same body is appended to the server-built compose link", async () => {
    const env = await boot();
    env.inst.setMailApp("gmail");
    await ready(env, "Wo ist mein Fahrer?", "Where is my driver?");
    env.inst.answerByMail();
    const call = env.win.open.mock.calls.find((c: unknown[]) => String(c[0]).startsWith("https://mail.google.com/"));
    expect(call).toBeTruthy();
    const url = String(call?.[0]);
    expect(url.startsWith(GMAIL + "&body=")).toBe(true);
    expect(bodyOf(url)).toBe("Wo ist mein Fahrer?\n\n" + HY + "\n\nWhere is my driver?");
  });

  it("same language and raw targets open his text as written, with the matching hint", async () => {
    const same = await boot([ticket()], "de");
    typed(same, "Hallo Anna");
    same.inst.answerByMail();
    expect(bodyOf(same.win.location.href)).toBe("Hallo Anna");
    expect(same.posts).toHaveLength(0);
    expect(same.inst.renderVals().replyHint).toBe("Die Schaltfläche öffnet eine Antwort in Ihrem E-Mail-Programm.");
    const raw = await boot([ticket({}, "tr", "tr")]);
    typed(raw, "Hello");
    await vi.advanceTimersByTimeAsync(2000);
    expect(raw.posts).toHaveLength(0);
    raw.inst.answerByMail();
    expect(bodyOf(raw.win.location.href)).toBe("Hello");
  });

  it("an empty box opens the mail with no body", async () => {
    const env = await boot();
    env.inst.answerByMail();
    expect(env.win.location.href).toBe(MAILTO);
  });

  it("over 1,800 characters the original is left out and the note says so", async () => {
    const env = await boot();
    await ready(env, "a".repeat(1000), "b".repeat(900));
    env.inst.answerByMail();
    expect(bodyOf(env.win.location.href)).toBe("a".repeat(1000));
    expect(env.inst.renderVals().replyNote).toBe("Your original text was left out: it is too long for your mail app link.");
    // exactly 1,800 characters keeps the original
    const ok = await boot();
    await ready(ok, "a".repeat(888), "b".repeat(888));
    ok.inst.answerByMail();
    expect(bodyOf(ok.win.location.href)).toBe("a".repeat(888) + "\n\n" + HY + "\n\n" + "b".repeat(888));
    expect(ok.inst.renderVals().replyNote).toBe("");
  });
});

describe("failed, skipped and slow translations", () => {
  it("failed -> his text only, no divider, and the quiet note until he edits", async () => {
    const env = await boot();
    await typeAndWait(env, "Where is my driver?");
    env.posts[0]?.resolve({ ok: true, data: { status: "failed" } });
    await env.flush();
    env.inst.answerByMail();
    expect(bodyOf(env.win.location.href)).toBe("Where is my driver?");
    expect(env.win.location.href).not.toContain(HY);
    expect(env.inst.renderVals().replyNote).toBe("Couldn’t translate. The e-mail opened with your text as written.");
    typed(env, "Where is my driver now?");
    expect(env.inst.renderVals().replyNote).toBe("");
  });

  it("a network error is the failed path", async () => {
    const env = await boot();
    await typeAndWait(env, "Hi there");
    env.posts[0]?.reject();
    await env.flush();
    env.inst.answerByMail();
    expect(bodyOf(env.win.location.href)).toBe("Hi there");
    expect(env.inst.renderVals().replyNote).toContain("Couldn’t translate");
  });

  it("skipped -> his text only, no divider, no failure note", async () => {
    const env = await boot();
    await typeAndWait(env, "08:15");
    env.posts[0]?.resolve({ ok: true, data: { status: "skipped" } });
    await env.flush();
    env.inst.answerByMail();
    expect(bodyOf(env.win.location.href)).toBe("08:15");
    expect(env.inst.renderVals().replyNote).toBe("");
  });

  it("click while translating: disabled, aria-busy, loader icon, Translating…; the answer opens the mail", async () => {
    const env = await boot();
    typed(env, "Where is my driver?");
    env.inst.answerByMail();
    await env.flush();
    const v = env.inst.renderVals();
    expect(v.answerOff).toBe(true);
    expect(v.answerBusy).toBe("true");
    expect(v.answerIcon).toBe("loader-circle");
    expect(v.answerLabel).toBe("Translating…");
    expect(env.posts).toHaveLength(1);
    env.posts[0]?.resolve({ ok: true, data: { status: "ready", text: "Wo ist mein Fahrer?" } });
    await env.flush();
    expect(bodyOf(env.win.location.href)).toBe("Wo ist mein Fahrer?\n\n" + HY + "\n\nWhere is my driver?");
    const after = env.inst.renderVals();
    expect(after.answerBusy).toBe("false");
    expect(after.answerIcon).toBe("mail");
    expect(after.answerLabel).toBe("Answer by e-mail");
  });

  it("editing during busy discards the running answer", async () => {
    const env = await boot();
    typed(env, "First text");
    env.inst.answerByMail();
    await env.flush();
    typed(env, "Second text");
    expect(env.inst.renderVals().answerBusy).toBe("false");
    env.posts[0]?.resolve({ ok: true, data: { status: "ready", text: "Erster Text" } });
    await env.flush();
    expect(env.win.location.href).toBe("");
    expect(env.inst.replyFor(env.inst.openNow()).out).toBe("");
  });

  it("20 s ceiling -> the failed path: mail opens with his text as written", async () => {
    const env = await boot();
    typed(env, "Where is my driver?");
    env.inst.answerByMail();
    await env.flush();
    await vi.advanceTimersByTimeAsync(20000);
    await env.flush();
    expect(bodyOf(env.win.location.href)).toBe("Where is my driver?");
    expect(env.inst.renderVals().replyNote).toContain("Couldn’t translate");
    // a late answer is ignored
    env.posts[0]?.resolve({ ok: true, data: { status: "ready", text: "spät" } });
    await env.flush();
    expect(env.inst.replyFor(env.inst.openNow()).status).toBe("failed");
  });
});

describe("Gmail tab and click activation", () => {
  it("Gmail: the tab is opened inside the click and filled when the answer is ready", async () => {
    const env = await boot();
    env.inst.setMailApp("gmail");
    typed(env, "Where is my driver?");
    env.inst.answerByMail();
    expect(env.openedTab()).toBe(true);
    expect(env.tab.opener).toBeNull();
    expect(env.tab.location.href).toBe("");
    await env.flush();
    env.posts[0]?.resolve({ ok: true, data: { status: "ready", text: "Wo ist mein Fahrer?" } });
    await env.flush();
    expect(env.tab.location.href.startsWith(GMAIL + "&body=")).toBe(true);
    expect(bodyOf(env.tab.location.href)).toBe("Wo ist mein Fahrer?\n\n" + HY + "\n\nWhere is my driver?");
  });

  it("editing while the Gmail tab waits closes the blank tab", async () => {
    const env = await boot();
    env.inst.setMailApp("gmail");
    typed(env, "One");
    env.inst.answerByMail();
    await env.flush();
    typed(env, "Two");
    expect(env.tab.closed).toBe(true);
  });

  it("mail app: click activation gone on arrival -> quiet 'ready' line, the next press opens at once", async () => {
    const env = await boot();
    typed(env, "Where is my driver?");
    env.inst.answerByMail();
    await env.flush();
    env.nav.userActivation.isActive = false;
    env.posts[0]?.resolve({ ok: true, data: { status: "ready", text: "Wo ist mein Fahrer?" } });
    await env.flush();
    expect(env.win.location.href).toBe("");
    expect(env.inst.renderVals().replyNote).toBe("Translation ready. Press the button again to open your mail.");
    expect(env.inst.renderVals().answerOff).toBe(false);
    env.inst.answerByMail();
    expect(bodyOf(env.win.location.href)).toBe("Wo ist mein Fahrer?\n\n" + HY + "\n\nWhere is my driver?");
    expect(env.posts).toHaveLength(1);
  });
});

describe("typing, debounce, and what is sent", () => {
  it("typing debounces 800 ms, then one POST with { text, lang, from }; the same text is never translated twice", async () => {
    const env = await boot([ticket()], "en");
    typed(env, "Where");
    await vi.advanceTimersByTimeAsync(500);
    typed(env, "Where is my driver?");
    await vi.advanceTimersByTimeAsync(700);
    expect(env.posts).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(100);
    await env.flush();
    expect(env.posts).toHaveLength(1);
    expect(env.posts[0]?.path).toBe("/api/staff/tickets/t1/reply-translate");
    expect(env.posts[0]?.body).toEqual({ text: "Where is my driver?", lang: "de", from: "en" });
    env.posts[0]?.resolve({ ok: true, data: { status: "ready", text: "Wo ist mein Fahrer?" } });
    await env.flush();
    env.inst.runTranslate();
    env.inst.answerByMail();
    await env.flush();
    expect(env.posts).toHaveLength(1);
  });

  it("the page only ever reads tickets, patches status or note, and posts reply-translate: no send endpoint", async () => {
    const env = await boot();
    await ready(env, "Wo ist mein Fahrer?");
    env.inst.answerByMail();
    env.inst.closeTicket();
    await env.flush();
    for (const c of env.calls) {
      const ok =
        (c.method === "GET" && /^\/api\/staff\/tickets\?lang=(en|de|fr|ar)$/.test(c.path)) ||
        (c.method === "PATCH" && /^\/api\/staff\/tickets\/t1$/.test(c.path)) ||
        (c.method === "POST" && c.path === "/api/staff/tickets/t1/reply-translate");
      expect(ok, `${c.method} ${c.path}`).toBe(true);
    }
  });

  it("closed ticket: no reply box; no recipient: the button stays off", async () => {
    const closed = await boot([ticket({ status: "closed" })]);
    expect(closed.inst.renderVals().canReply).toBe(false);
    expect(SRC).toMatch(/<sc-if value="\{\{ canReply \}\}"[^>]*>\s*<div data-reply="1">/);
    const none = await boot([ticket({ reply: { mailto: "", gmail: "", lang: "de" } })]);
    expect(none.inst.renderVals().answerOff).toBe(true);
  });
});

describe("customer messages and the pending poll", () => {
  it("ready shows the translation, the language line in his language, and the original with its own direction", async () => {
    const env = await boot([ticket({ messages: [{ whoKey: "customer", when: "x", body: "مرحبا", files: [], lang: "ar", translation: { status: "ready", text: "Hello" } }] }, "ar", "ar")]);
    const m = env.inst.renderVals().thread[0];
    expect(m.isTr).toBe(true);
    expect(m.trText).toBe("Hello");
    expect(m.fromLine).toBe("Translated from Arabic");
    expect(m.dir).toBe("rtl");
    expect(m.lang).toBe("ar");
    expect(m.dashDir).toBe("ltr");
    expect(m.body).toBe("مرحبا");
  });

  it("same language looks as today; failed shows Translation not available; pending shows Translating…", async () => {
    const rows = [ticket({ messages: [
      { whoKey: "customer", when: "x", body: "Hello", files: [], lang: "en", translation: { status: "same", text: "" } },
      { whoKey: "customer", when: "x", body: "Hallo", files: [], lang: "de", translation: { status: "failed", text: "" } },
      { whoKey: "customer", when: "x", body: "Bonjour", files: [], lang: "fr", translation: { status: "pending", text: "" } },
      { whoKey: "staff", when: "x", body: "Hi", files: [], lang: "", translation: null },
    ] })];
    const env = await boot(rows);
    const t = env.inst.renderVals().thread;
    expect(t[0]).toMatchObject({ isPlain: true, hasNote: false, isTr: false });
    expect(t[1]).toMatchObject({ isPlain: true, hasNote: true, noteText: "Translation not available", noteIcon: "info" });
    expect(t[2]).toMatchObject({ isPlain: true, hasNote: true, noteText: "Translating…", noteIcon: "loader-circle", noteSpin: "1" });
    expect(t[3]).toMatchObject({ isPlain: true, hasNote: false });
  });

  it("pending re-reads at most 5 times, 2 s apart, then reads as failed until the ticket is opened again", async () => {
    const pending = [ticket({ messages: [{ whoKey: "customer", when: "x", body: "Hallo", files: [], lang: "de", translation: { status: "pending", text: "" } }] })];
    const env = load(pending);
    await env.flush();
    expect(env.gets).toHaveLength(1);
    env.inst.openTicket("t1");
    await env.flush();
    for (let i = 1; i <= 5; i += 1) {
      await vi.advanceTimersByTimeAsync(1999);
      expect(env.gets).toHaveLength(i);
      await vi.advanceTimersByTimeAsync(1);
      await env.flush();
      expect(env.gets).toHaveLength(i + 1);
    }
    await vi.advanceTimersByTimeAsync(10000);
    expect(env.gets).toHaveLength(6);
    expect(env.inst.renderVals().thread[0]).toMatchObject({ hasNote: true, noteText: "Translation not available" });
    env.inst.closeOverlay();
    env.inst.openTicket("t1");
    await env.flush();
    expect(env.inst.renderVals().thread[0]).toMatchObject({ noteText: "Translating…" });
  });

  it("reads the tickets in his dashboard language and again when the language changes", async () => {
    const env = load([ticket()], "fr");
    await env.flush();
    expect(env.gets).toEqual(["/api/staff/tickets?lang=fr"]);
    env.win.emit("vamos:locale", { detail: { lang: "de" } });
    await env.flush();
    expect(env.gets).toEqual(["/api/staff/tickets?lang=fr", "/api/staff/tickets?lang=de"]);
  });
});

describe("html sinks (T-32-44)", () => {
  it("customer and translated text are DC text bindings only, never an html sink", () => {
    expect(SRC).not.toMatch(/innerHTML|outerHTML|insertAdjacentHTML|dangerouslySetInnerHTML|document\.write/);
    expect(SRC).toContain('<p data-msg-tr="1" data-vt-no-i18n="1" lang="{{ m.dashLang }}" dir="{{ m.dashDir }}">{{ m.trText }}</p>');
    expect(SRC).toContain('data-msg-orig="1"');
  });
});
