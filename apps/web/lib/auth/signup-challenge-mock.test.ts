// Security S5 (owner, 2026-10-05): the sign-in page (app/pages/AuthForm.dc.html, the file customers are served)
// runs the Cloudflare check before it sends a sign-up or a forgot-password, and asks again for every send
// ("Send another link" included). Sign-in does not ask. The page logic runs here in a VM with a fake Turnstile.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createContext, runInContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "../../../..");
const html = readFileSync(join(repoRoot, "app/pages/AuthForm.dc.html"), "utf8");
const script = (() => {
  const tag = html.indexOf('<script type="text/x-dc" data-dc-script');
  const start = html.indexOf(">", tag) + 1;
  return html.slice(start, html.indexOf("</script>", start));
})();

type Reply = Record<string, unknown>;
type Form = {
  state: Record<string, unknown>;
  setState(p: Record<string, unknown>): void;
  componentDidMount(): void;
  submit(): void;
  resend(): void;
  renderVals(): Record<string, unknown>;
};

/** What the fake Turnstile does when the form calls execute(): hand out the next token, or fail. */
type Plan = Array<string | null>;

function load(opts: { props?: Record<string, unknown>; lang?: string; plan?: Plan; replies?: Reply[]; noHelper?: boolean; syncAnswer?: boolean; lateHelper?: boolean }) {
  const widgets: Array<{ opts: Record<string, unknown>; executes: number; resets: number; removed: boolean }> = [];
  const fetched: Array<{ url: string; body: Record<string, unknown> }> = [];
  const plan = [...(opts.plan ?? ["tok-1", "tok-2", "tok-3"])];
  const replies = [...(opts.replies ?? [])];
  const box = { scrollIntoView: vi.fn() };
  const timers: Array<() => void> = [];

  const helper = {
    turnstile: (_box: unknown, onToken: (t: string) => void, onError: (c: string) => void, o: Record<string, unknown>) => {
      const w = { opts: o, executes: 0, resets: 0, removed: false };
      widgets.push(w);
      return {
        execute: () => {
          w.executes++;
          const next = plan.shift();
          // Cloudflare answers after the call returns, unless the test wants the answer inside execute().
          const answer = () => (next ? onToken(next) : onError("error"));
          if (opts.syncAnswer) answer();
          else Promise.resolve().then(answer);
        },
        reset: () => void w.resets++,
        remove: () => void (w.removed = true),
      };
    },
  };

  const win: Record<string, unknown> = {
    VamosLocale: { lang: () => opts.lang ?? "en", onChange: () => () => undefined },
    VamosAccountNotice: { segments: () => [] },
    VamosConsent: opts.noHelper || opts.lateHelper ? undefined : helper,
    crypto: { randomUUID: () => `uuid-${fetched.length + 1}` },
    matchMedia: () => ({ matches: false }),
  };
  const ctx = createContext({
    window: win,
    document: { getElementById: (id: string) => (id === "af-turnstile" ? box : null), querySelector: () => null },
    location: { search: "" },
    sessionStorage: { getItem: () => null, setItem: () => undefined, removeItem: () => undefined },
    localStorage: { getItem: () => null, setItem: () => undefined, removeItem: () => undefined },
    URLSearchParams,
    fetch: async (url: string, init: { body: string }) => {
      fetched.push({ url, body: JSON.parse(init.body) as Record<string, unknown> });
      const reply = replies.shift() ?? { stage: "sent" };
      return { json: async () => reply };
    },
    setTimeout: (fn: () => void) => { timers.push(fn); return timers.length; },
    clearTimeout: () => undefined,
    console,
    React: { createElement: () => null },
    DCLogic: class {
      props: Record<string, unknown>;
      state: Record<string, unknown> = {};
      constructor(props?: Record<string, unknown>) {
        this.props = props ?? {};
      }
      setState(p: Record<string, unknown> | ((s: Record<string, unknown>) => Record<string, unknown>), cb?: () => void) {
        this.state = { ...this.state, ...(typeof p === "function" ? p(this.state) : p) };
        cb?.();
      }
    },
  });
  runInContext(`${script}\n;globalThis.__C = Component;`, ctx);
  const C = (ctx as unknown as { __C: new (p: Record<string, unknown>) => Form }).__C;
  const form = new C(opts.props ?? {});
  form.componentDidMount();
  const settle = async () => {
    for (let i = 0; i < 10; i++) await new Promise((r) => setImmediate(r));
  };
  /** The helmet script (vamos-consent.js) lands after the form is up. */
  const landHelper = () => {
    win.VamosConsent = helper;
    while (timers.length) timers.shift()!();
  };
  return { form, widgets, fetched, box, settle, landHelper };
}

const SIGNUP = { mode: "signup", method: "password", email: "mia@example.test", password: "12345678", firstName: "Mia", lastName: "K", consent: true };

describe("sign-up on the sign-in page", () => {
  it("runs the check first, and sends the token and a fresh key with the sign-up", async () => {
    const t = load({ props: { mode: "signup" }, lang: "de" });
    // Warmed up on arrival: one widget, action 'account', the visitor's language, nothing executed yet.
    expect(t.widgets).toHaveLength(1);
    expect(t.widgets[0]!.opts).toMatchObject({ action: "account", language: "de" });
    expect(t.widgets[0]!.executes).toBe(0);
    t.form.setState(SIGNUP);
    t.form.submit();
    expect(t.fetched).toHaveLength(0); // nothing leaves before the token
    await t.settle();
    expect(t.widgets[0]!.resets).toBe(1);
    expect(t.widgets[0]!.executes).toBe(1);
    expect(t.fetched).toHaveLength(1);
    expect(t.fetched[0]!.url).toBe("/api/auth");
    expect(t.fetched[0]!.body).toMatchObject({ mode: "signup", method: "password", turnstileToken: "tok-1", idempotencyKey: "uuid-1" });
    expect(t.form.state.stage).toBe("sent");
  });

  it("an answer that arrives inside execute() is not lost, and the next send still asks again", async () => {
    const t = load({ props: { mode: "signup" }, syncAnswer: true, plan: ["tok-1", "tok-2"] });
    t.form.setState(SIGNUP);
    t.form.submit();
    await t.settle();
    expect(t.fetched[0]!.body).toMatchObject({ turnstileToken: "tok-1" });
    t.form.resend();
    await t.settle();
    expect(t.fetched[1]!.body).toMatchObject({ turnstileToken: "tok-2" });
  });

  it("the link sign-up asks as well", async () => {
    const t = load({ props: { mode: "signup", method: "magic" } });
    t.form.setState({ ...SIGNUP, method: "magic" });
    t.form.submit();
    await t.settle();
    expect(t.fetched[0]!.body).toMatchObject({ mode: "signup", method: "magic", turnstileToken: "tok-1" });
  });

  it("if the check cannot run, nothing is sent and the person sees the existing 'Could not send the link' line", async () => {
    const t = load({ props: { mode: "signup" }, plan: [null] });
    t.form.setState(SIGNUP);
    t.form.submit();
    await t.settle();
    expect(t.fetched).toHaveLength(0);
    expect(t.form.state).toMatchObject({ stage: "form", banner: "send-failed" });
    expect(t.form.renderVals().bannerSendFailed).toBe(true);
  });

  it("the helper script landing after the form is up still warms the check up (no re-render needed)", () => {
    const t = load({ props: { mode: "signup" }, lateHelper: true });
    expect(t.widgets).toHaveLength(0);
    t.landHelper();
    expect(t.widgets).toHaveLength(1);
    expect(t.widgets[0]!.opts).toMatchObject({ action: "account" });
  });

  it("with no Turnstile helper on the page it fails closed the same way", async () => {
    const t = load({ props: { mode: "signup" }, noHelper: true });
    t.form.setState(SIGNUP);
    t.form.submit();
    await t.settle();
    expect(t.fetched).toHaveLength(0);
    expect(t.form.state).toMatchObject({ stage: "form", banner: "send-failed" });
  });

  it("when the server refuses the token (challenge-failed) the same line shows", async () => {
    const t = load({ props: { mode: "signup" }, replies: [{ ok: false, reason: "challenge-failed" }] });
    t.form.setState(SIGNUP);
    t.form.submit();
    await t.settle();
    expect(t.fetched).toHaveLength(1);
    expect(t.form.state).toMatchObject({ stage: "form", banner: "send-failed" });
  });

  it("'Send another link' gets a fresh token; a failed check shows the line on the sent page", async () => {
    const t = load({ props: { mode: "signup" }, plan: ["tok-1", "tok-2", null] });
    t.form.setState(SIGNUP);
    t.form.submit();
    await t.settle();
    expect(t.form.state.stage).toBe("sent");
    t.form.resend();
    await t.settle();
    expect(t.fetched).toHaveLength(2);
    expect(t.fetched[1]!.body).toMatchObject({ mode: "signup", turnstileToken: "tok-2" });
    expect(t.fetched[1]!.body.idempotencyKey).not.toBe(t.fetched[0]!.body.idempotencyKey);
    t.form.resend();
    await t.settle();
    expect(t.fetched).toHaveLength(2); // the third check failed: nothing sent
    expect(t.form.state).toMatchObject({ resent: false, resendFailed: true });
    expect(t.form.renderVals().resendFailed).toBe(true);
  });

  it("the box opens only when Cloudflare asks for a tick, and scrolls into view", async () => {
    const t = load({ props: { mode: "signup" } });
    const onInteractive = t.widgets[0]!.opts.onInteractive as (open: boolean) => void;
    expect(t.form.renderVals().tsOpen).toBe(false);
    onInteractive(true);
    expect(t.form.renderVals().tsOpen).toBe(true);
    expect(t.box.scrollIntoView).toHaveBeenCalledWith({ block: "center", behavior: "smooth" });
    onInteractive(false);
    expect(t.form.renderVals().tsOpen).toBe(false);
  });

  it("Arabic gets the Arabic widget text", () => {
    const t = load({ props: { mode: "signup" }, lang: "ar" });
    expect(t.widgets[0]!.opts.language).toBe("ar-eg");
  });
});

describe("forgot password on the sign-in page", () => {
  it("runs the check and sends the token with the request", async () => {
    const t = load({ props: { mode: "forgot" } });
    t.form.setState({ email: "mia@example.test" });
    t.form.submit();
    expect(t.fetched).toHaveLength(0);
    await t.settle();
    expect(t.fetched[0]!.body).toEqual({ locale: "en", mode: "forgot", email: "mia@example.test", turnstileToken: "tok-1", idempotencyKey: "uuid-1" });
    expect(t.form.state.stage).toBe("sent");
  });

  it("an arrival in sign-in then 'Forgot password?' warms the check up on the mode change", () => {
    const t = load({ props: { mode: "signin" } });
    expect(t.widgets).toHaveLength(0); // sign-in never loads Cloudflare's script
    t.form.setState({ mode: "forgot" });
    // The DC runtime calls componentDidUpdate with the previous props only.
    (t.form as unknown as { componentDidUpdate(p: unknown): void }).componentDidUpdate({});
    expect(t.widgets).toHaveLength(1);
  });
});

describe("what does not ask", () => {
  it("password sign-in sends no token and never touches Turnstile", async () => {
    const t = load({ props: { mode: "signin" }, replies: [{ ok: true }] });
    t.form.setState({ email: "mia@example.test", password: "12345678" });
    t.form.submit();
    await t.settle();
    expect(t.widgets).toHaveLength(0);
    expect(t.fetched).toHaveLength(1);
    expect(t.fetched[0]!.body).not.toHaveProperty("turnstileToken");
  });

  it("the sign-in link and its 'Send another link' send no token", async () => {
    const t = load({ props: { mode: "signin", method: "magic" } });
    t.form.setState({ email: "mia@example.test" });
    t.form.submit();
    await t.settle();
    t.form.resend();
    await t.settle();
    expect(t.widgets).toHaveLength(0);
    expect(t.fetched).toHaveLength(2);
    for (const f of t.fetched) expect(f.body).not.toHaveProperty("turnstileToken");
  });

  it("the gallery (frozen) and the dispatch surface stay on the demo rules: no widget, no request", async () => {
    for (const props of [{ mode: "signup", frozen: true }, { mode: "signup", surface: "ops" }]) {
      const t = load({ props });
      expect(t.widgets).toHaveLength(0);
      expect(t.form.renderVals().canChallenge).toBe(false);
      t.form.setState({ ...SIGNUP, consent: false });
      t.form.submit();
      await t.settle();
      expect(t.fetched).toHaveLength(0);
    }
  });
});

describe("page source pins", () => {
  it("loads the shared helper, owns one persistent box, and keeps the laws", () => {
    expect(html).toContain('<script src="../vamos-consent.js"></script>');
    expect(html.split('id="af-turnstile"').length - 1).toBe(1);
    // The box is closed (no height) until Cloudflare asks; never display:none, which would stop the unseen check.
    expect(html).toMatch(/\[data-af-ts\]\{[^}]*block-size:0[^}]*\}/);
    expect(html).not.toMatch(/\[data-af-ts\][^{]*\{[^}]*display:none/);
    // Logical properties only, no glow.
    expect(html).not.toMatch(/\[data-af-ts\][^{]*\{[^}]*(margin-left|margin-right|box-shadow)/);
  });

  it("the new line on the sent page is a string the dictionary already carries in all four languages", () => {
    const dict = readFileSync(join(repoRoot, "app/vamos-i18n-dict.js"), "utf8");
    const line = "Could not send the link. Try again.";
    // The form banner, the "send the link again" failure banner and the new sent-page line.
    expect(html.split(`>${line}<`).length - 1).toBe(3);
    const entry = dict.split("\n").find((l) => l.includes(`'${line}'`)) ?? "";
    for (const lang of ["de:", "fr:", "ar:"]) expect(entry).toContain(lang);
  });
});
