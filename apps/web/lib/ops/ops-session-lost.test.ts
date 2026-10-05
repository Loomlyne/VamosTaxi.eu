// apps/web/lib/ops/ops-session-lost.test.ts
//
// U8a (2026-10-05): the dashboard shell is one document. When the session dies while it is open, the
// next screen file it fetches is a private 404 (the gate), the DC runtime renders an empty placeholder,
// and the person sat on a blank page with a sidebar. `app/vamos-ops-api.js` now sends the browser to
// /login when a staff answer says the session is gone, or when a screen file 404s and /api/staff/me
// says the same. This runs the real file in a vm with a stub window, fetch and storage. No DOM, no network.

import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const SOURCE = readFileSync(join(here, "../../../../app/vamos-ops-api.js"), "utf8");
const OPS_DIR = join(here, "../../../../app/ops");

// What ops.dc.html mounts, read from its markup. Three kinds of file under app/ops:
//   - route screens: a `dc-import` inside `<sc-if value="{{ isX }}">`, one per route;
//   - top-level imports: a `dc-import` outside every `sc-if` (OpsSidebar). The runtime fetches them when the
//     shell boots and they stay on the page, so a miss leaves the shell without them until a reload;
//   - nested parts: every other file, which a screen or a conditional bar fetches while it runs (PlaceSearch when
//     OpsDetail enters edit mode, BrandSelect, ActionsMenu inside `hasBarItems`, OpsTable ...).
// Only the first two may reload a live page after a 404: a reload for a nested part would throw an edit away.
const SHELL_FILE = readFileSync(join(OPS_DIR, "ops.dc.html"), "utf8");
const SHELL_MARKUP = SHELL_FILE.slice(SHELL_FILE.indexOf("<x-dc>"), SHELL_FILE.indexOf("</x-dc>")).replace(/<!--[\s\S]*?-->/g, "");
function shellMounts(markup: string): { routes: string[]; topLevel: string[] } {
  const routes: string[] = [];
  const topLevel: string[] = [];
  const open: boolean[] = []; // one entry per open sc-if: is it a route switch (`isX`)?
  for (const m of markup.matchAll(/<sc-if\b([^>]*)>|<\/sc-if>|<dc-import\b[^>]*?\bname="(\w+)"/g)) {
    if (m[0].startsWith("<sc-if")) open.push(/value="\{\{\s*is\w+\s*\}\}"/.test(m[1] ?? ""));
    else if (m[0].startsWith("</sc-if")) open.pop();
    else if (open.length === 0) topLevel.push(m[2] as string);
    else if (open[open.length - 1]) routes.push(m[2] as string);
  }
  return { routes, topLevel };
}
const MOUNTS = shellMounts(SHELL_MARKUP);
const ROUTE_SCREENS = MOUNTS.routes;
const TOP_LEVEL_IMPORTS = MOUNTS.topLevel;
const RELOAD_FILES = [...ROUTE_SCREENS, ...TOP_LEVEL_IMPORTS];
const NESTED_PARTS = readdirSync(OPS_DIR)
  .filter((name) => name.endsWith(".dc.html"))
  .map((name) => name.replace(/\.dc\.html$/, ""))
  .filter((name) => !RELOAD_FILES.includes(name));
const ORIGIN = "https://dashboard.vamostaxi.site";

type Answer = { status: number; body?: unknown; url?: string };
type Route = (url: string, init?: RequestInit) => Answer | Promise<Answer> | "network";

function jsonResponse(answer: Answer, url: string): Response {
  const res = new Response(answer.body === undefined ? null : JSON.stringify(answer.body), {
    status: answer.status,
    headers: { "content-type": "application/json" },
  });
  Object.defineProperty(res, "url", { value: answer.url ?? url });
  return res;
}

function storage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (k: string) => (data.has(k) ? data.get(k)! : null),
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
    has: (k: string) => data.has(k),
  };
}

/** One browser tab: the file loaded `loads` times (the shell's helmet runs it twice). */
function tab(
  route: Route,
  opts: { loads?: number; session?: Record<string, string>; clock?: { now: number }; bare?: boolean } = {},
) {
  const calls: string[] = [];
  const replaced: string[] = [];
  const reloaded: string[] = [];
  const pushes: string[] = [];
  const listeners: Record<string, Array<() => void>> = {};
  const local = storage({ vamosOpsAuth: "1" });
  const session = storage(opts.session);
  const sandbox: Record<string, unknown> = {
    // The shell navigates with history.pushState (+ a popstate event) and the browser's back button fires popstate.
    history: { pushState: (_state: unknown, _title: string, url?: string) => void pushes.push(String(url ?? "")) },
    addEventListener: (type: string, fn: () => void) => void (listeners[type] ??= []).push(fn),
    location: {
      origin: ORIGIN,
      href: `${ORIGIN}/customers`,
      replace: (to: string) => void replaced.push(to),
      reload: () => void reloaded.push("reload"),
    },
    localStorage: local,
    sessionStorage: session,
    URL,
    Promise,
    Date: opts.clock
      ? class extends Date {
          static now() {
            return opts.clock!.now;
          }
        }
      : Date,
    Number,
    JSON,
    Response,
  };
  if (opts.bare) {
    delete sandbox.history;
    delete sandbox.addEventListener;
  }
  sandbox.window = sandbox;
  sandbox.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    calls.push(`${init?.method ?? (typeof input === "object" && "method" in input ? input.method : "GET")} ${url}`);
    const answer = await route(url, init);
    if (answer === "network") throw new TypeError("network down");
    return jsonResponse(answer, new URL(url, ORIGIN).href);
  };
  vm.createContext(sandbox);
  for (let i = 0; i < (opts.loads ?? 1); i++) vm.runInContext(SOURCE, sandbox);
  const win = sandbox as {
    fetch: (input: string | { url: string; method?: string }, init?: RequestInit) => Promise<Response>;
    history: { pushState: (state: unknown, title: string, url?: string) => void };
    VamosOpsApi: { request: (m: string, p: string, b?: unknown) => Promise<Record<string, unknown>> };
  };
  const fire = (type: string) => (listeners[type] ?? []).forEach((fn) => fn());
  return { win, calls, replaced, reloaded, local, session, pushes, fire, listeners };
}

const flush = async () => {
  for (let i = 0; i < 12; i++) await new Promise((resolve) => setImmediate(resolve));
};

const SCREEN = "/app/ops/OpsCustomers.dc.html";
const NO_SESSION = { status: 401, body: { ok: false, code: "no-session" } };
const NEEDS_MFA = { status: 403, body: { ok: false, code: "needs-mfa" } };
// Security S13: the staff row was switched off; every /api/staff/* call answers it.
const NOT_STAFF = { status: 403, body: { ok: false, code: "not-staff" } };

describe("dashboard shell: a dead session goes to /login, not a blank screen (U8a)", () => {
  it("a screen file answers 404 and /api/staff/me says no-session: to /login, flag cleared, one redirect", async () => {
    const t = tab((url) => (url.startsWith("/app/ops/") ? { status: 404 } : NO_SESSION));
    const res = await t.win.fetch(SCREEN);
    expect(res.status).toBe(404); // the runtime still gets its answer
    await flush();
    expect(t.replaced).toEqual(["/login"]);
    expect(t.local.has("vamosOpsAuth")).toBe(false);
    expect(t.calls).toEqual([`GET ${SCREEN}`, "GET /api/staff/me"]);
  });

  it("a second 404 while the first is being checked or after it, still one redirect and one /api/staff/me call", async () => {
    const t = tab((url) => (url.startsWith("/app/ops/") ? { status: 404 } : NO_SESSION));
    await Promise.all([t.win.fetch(SCREEN), t.win.fetch("/app/ops/OpsFleet.dc.html")]);
    await flush();
    await t.win.fetch("/app/ops/OpsReviews.dc.html");
    await flush();
    expect(t.replaced).toEqual(["/login"]);
    expect(t.calls.filter((c) => c === "GET /api/staff/me")).toHaveLength(1);
  });

  it("a screen file 404 with a live session is a missing file, not a dead session: no redirect", async () => {
    const t = tab((url) => (url.startsWith("/app/ops/") ? { status: 404 } : { status: 200, body: { ok: true, data: {} } }));
    await t.win.fetch(SCREEN);
    await flush();
    expect(t.replaced).toEqual([]);
    expect(t.local.has("vamosOpsAuth")).toBe(true);
  });

  // U8 review nit: the gate waits at most 5 s for Supabase Auth and answers the private 404 past that. A
  // session that is alive but was slow once left the screen blank for good, because the DC runtime keeps
  // the miss and never asks for that file again. The page is reloaded once; the second miss stays.
  it("slow Auth: a screen file 404 while /api/staff/me says the session is alive reloads the page once", async () => {
    const t = tab((url) => (url.startsWith("/app/ops/") ? { status: 404 } : { status: 200, body: { ok: true, data: { role: "admin" } } }));
    await t.win.fetch(SCREEN);
    await flush();
    expect(t.reloaded).toEqual(["reload"]);
    expect(t.replaced).toEqual([]);
    expect(t.local.has("vamosOpsAuth")).toBe(true);
    expect(t.calls).toEqual([`GET ${SCREEN}`, "GET /api/staff/me"]);
  });

  it("several screen files missing at once are one probe and one reload", async () => {
    const t = tab((url) => (url.startsWith("/app/ops/") ? { status: 404 } : { status: 200, body: { ok: true, data: {} } }));
    await Promise.all([t.win.fetch(SCREEN), t.win.fetch("/app/ops/OpsFleet.dc.html")]);
    await flush();
    await t.win.fetch("/app/ops/OpsReviews.dc.html");
    await flush();
    expect(t.reloaded).toHaveLength(1);
  });

  it("a page that was just reloaded for a missing screen and misses again stays put (a missing file is not a loop)", async () => {
    const clock = { now: 1_000_000 };
    const t = tab((url) => (url.startsWith("/app/ops/") ? { status: 404 } : { status: 200, body: { ok: true, data: {} } }), {
      clock,
      session: { vamosOpsScreenRetryAt: String(clock.now - 3000) },
    });
    await t.win.fetch(SCREEN);
    await flush();
    expect(t.reloaded).toEqual([]);
    expect(t.replaced).toEqual([]);
  });

  // U8 review 2: the probe behind the reload (/api/staff/me) has no timeout of its own, so with Auth that
  // stays slow the chain "404 at 5 s, probe answers at 6+ s, mark older than 15 s" repeats: a reload every ~16 s.
  it("Auth that stays slow: a third 404 after the second reload (16 s apart each) does not reload", async () => {
    const clock = { now: 2_000_000 };
    const t = tab((url) => (url.startsWith("/app/ops/") ? { status: 404 } : { status: 200, body: { ok: true, data: {} } }), { clock });
    for (let round = 0; round < 5; round += 1) {
      await t.win.fetch(SCREEN);
      await flush();
      clock.now += 16_000;
    }
    expect(t.reloaded).toEqual(["reload", "reload"]);
    expect(t.replaced).toEqual([]);
  });

  it("the count is per tab and lives in session storage: a page that came back after two reloads sees it", async () => {
    const clock = { now: 2_000_000 };
    const t = tab((url) => (url.startsWith("/app/ops/") ? { status: 404 } : { status: 200, body: { ok: true, data: {} } }), {
      clock,
      session: { vamosOpsScreenRetryAt: String(clock.now - 20_000), vamosOpsScreenRetryCount: "2" },
    });
    await t.win.fetch(SCREEN);
    await flush();
    expect(t.reloaded).toEqual([]);
  });

  it("after ten quiet minutes the count starts again: a person who navigates later is helped again", async () => {
    const clock = { now: 2_000_000 };
    const t = tab((url) => (url.startsWith("/app/ops/") ? { status: 404 } : { status: 200, body: { ok: true, data: {} } }), {
      clock,
      session: { vamosOpsScreenRetryAt: String(clock.now - 601_000), vamosOpsScreenRetryCount: "2" },
    });
    await t.win.fetch(SCREEN);
    await flush();
    expect(t.reloaded).toEqual(["reload"]);
    expect(t.session.getItem("vamosOpsScreenRetryCount")).toBe("1");
  });

  // Follow-up 1 (2026-10-05): the count is read from session storage. A value that is not a number made it NaN,
  // `NaN >= 2` is false, and the writer stored String(NaN + 1) = "NaN" again: the reload came back every 16 s.
  it("a count in session storage that is not a number is read as zero: two reloads, then it stops", async () => {
    const clock = { now: 2_000_000 };
    const t = tab((url) => (url.startsWith("/app/ops/") ? { status: 404 } : { status: 200, body: { ok: true, data: {} } }), {
      clock,
      session: { vamosOpsScreenRetryAt: String(clock.now - 20_000), vamosOpsScreenRetryCount: "abc" },
    });
    for (let round = 0; round < 6; round += 1) {
      await t.win.fetch(SCREEN);
      await flush();
      clock.now += 16_000;
    }
    expect(t.reloaded).toEqual(["reload", "reload"]);
    expect(t.session.getItem("vamosOpsScreenRetryCount")).toBe("2");
  });

  it.each(["", "NaN", "undefined", "-3", "-0.5", "Infinity", "1e999", "0x", "2px"])(
    "whatever junk the count holds (%j), the page is reloaded at most twice and the stored count is a number again",
    async (junk) => {
      const clock = { now: 2_000_000 };
      const t = tab((url) => (url.startsWith("/app/ops/") ? { status: 404 } : { status: 200, body: { ok: true, data: {} } }), {
        clock,
        session: { vamosOpsScreenRetryAt: String(clock.now - 20_000), vamosOpsScreenRetryCount: junk },
      });
      for (let round = 0; round < 6; round += 1) {
        await t.win.fetch(SCREEN);
        await flush();
        clock.now += 16_000;
      }
      expect(t.reloaded.length).toBeLessThanOrEqual(2);
      expect(Number.isFinite(Number(t.session.getItem("vamosOpsScreenRetryCount")))).toBe(true);
    },
  );

  it("a time mark that is not a number does not stop the count: still at most two reloads", async () => {
    const clock = { now: 2_000_000 };
    const t = tab((url) => (url.startsWith("/app/ops/") ? { status: 404 } : { status: 200, body: { ok: true, data: {} } }), {
      clock,
      session: { vamosOpsScreenRetryAt: "soon", vamosOpsScreenRetryCount: "1" },
    });
    for (let round = 0; round < 6; round += 1) {
      await t.win.fetch(SCREEN);
      await flush();
      clock.now += 16_000;
    }
    expect(t.reloaded).toEqual(["reload"]);
  });

  // Follow-up review F3: a time mark in the future (a clock that was set back, a bad value) made `now - last` negative, so
  // "never within 15 s of the last reload" held for as long as the clock stayed behind the mark: no reload at all. A mark
  // that has not happened yet is read as no mark; the count still limits the page to two reloads.
  it("a reload mark in the future is read as no mark: the page is reloaded (counted), and the mark becomes the real time", async () => {
    const clock = { now: 2_000_000 };
    const t = tab((url) => (url.startsWith("/app/ops/") ? { status: 404 } : { status: 200, body: { ok: true, data: {} } }), {
      clock,
      session: { vamosOpsScreenRetryAt: String(clock.now + 3_600_000), vamosOpsScreenRetryCount: "1" },
    });
    await t.win.fetch(SCREEN);
    await flush();
    expect(t.reloaded).toEqual(["reload"]);
    expect(t.session.getItem("vamosOpsScreenRetryAt")).toBe(String(clock.now));
    expect(t.session.getItem("vamosOpsScreenRetryCount")).toBe("2");
    for (let round = 0; round < 4; round += 1) {
      clock.now += 16_000;
      await t.win.fetch(SCREEN);
      await flush();
    }
    expect(t.reloaded).toHaveLength(1); // at most two in all, the count still holds
  });

  it("a mark that is 14 s in the past still holds the page back, one in the future does not", async () => {
    const clock = { now: 2_000_000 };
    const past = tab((url) => (url.startsWith("/app/ops/") ? { status: 404 } : { status: 200, body: { ok: true, data: {} } }), {
      clock,
      session: { vamosOpsScreenRetryAt: String(clock.now - 14_000) },
    });
    await past.win.fetch(SCREEN);
    await flush();
    expect(past.reloaded).toEqual([]);
  });

  // U8a loop guard: the same flaw. A death mark in the future held every redirect back (`now - last < 15000` is true for a
  // negative number), so a dead session never went to /login until the clock caught up.
  it("a death mark in the future does not hold the redirect back: a dead session still goes to /login", async () => {
    const clock = { now: 5_000_000 };
    const t = tab(() => NO_SESSION, { clock, session: { vamosOpsSessionLostAt: String(clock.now + 3_600_000) } });
    await t.win.VamosOpsApi.request("GET", "/api/staff/bookings");
    await flush();
    expect(t.replaced).toEqual(["/login"]);
    expect(t.session.getItem("vamosOpsSessionLostAt")).toBe(String(clock.now));
  });

  it("a junk death mark does not hold the redirect back either", async () => {
    for (const junk of ["soon", "NaN", "-5", ""]) {
      const t = tab(() => NO_SESSION, { session: { vamosOpsSessionLostAt: junk } });
      await t.win.VamosOpsApi.request("GET", "/api/staff/bookings");
      await flush();
      expect(t.replaced, JSON.stringify(junk)).toEqual(["/login"]);
    }
  });

  // U8 review 2: the reload is for a screen that did not load, not for a part a screen fetches while it runs.
  // PlaceSearch is first fetched when OpsDetail enters edit mode: a reload then would throw the edit away.
  it("finds the shell's route screens, its top-level imports and the nested parts (the next tests are not reading nothing)", () => {
    expect(ROUTE_SCREENS).toContain("OpsBoard");
    expect(ROUTE_SCREENS).toContain("OpsDetail");
    expect(ROUTE_SCREENS.length).toBeGreaterThanOrEqual(13);
    // Follow-up 2 (2026-10-05): the sidebar is imported at the top level of the shell, outside any sc-if.
    expect(TOP_LEVEL_IMPORTS).toContain("OpsSidebar");
    expect(ROUTE_SCREENS).not.toContain("OpsSidebar");
    for (const nested of ["PlaceSearch", "BrandSelect", "ActionsMenu", "OpsTable"]) {
      expect(NESTED_PARTS, nested).toContain(nested);
      expect(RELOAD_FILES, nested).not.toContain(nested);
    }
    // The action menu of the top bar sits inside `hasBarItems`, so it is not a top-level import.
    expect(TOP_LEVEL_IMPORTS).not.toContain("ActionsMenu");
  });

  const aliveAnswer = { status: 200, body: { ok: true, data: {} } };

  it("every route screen and top-level import of the shell that 404s while the session is alive reloads the page once", async () => {
    for (const name of RELOAD_FILES) {
      const t = tab((url) => (url === `/app/ops/${name}.dc.html` ? { status: 404 } : aliveAnswer));
      await t.win.fetch(`/app/ops/${name}.dc.html`);
      await flush();
      expect(t.reloaded, name).toEqual(["reload"]);
    }
  });

  it("no nested part that 404s while the session is alive reloads the page (a reload would discard an edit)", async () => {
    for (const name of NESTED_PARTS) {
      const t = tab((url) => (url === `/app/ops/${name}.dc.html` ? { status: 404 } : aliveAnswer));
      await t.win.fetch(`/app/ops/${name}.dc.html`);
      await flush();
      expect(t.reloaded, name).toEqual([]);
      expect(t.replaced, name).toEqual([]);
    }
  });

  it("a nested part that 404s because the session is dead still goes to /login", async () => {
    const t = tab((url) => (url.startsWith("/app/ops/") ? { status: 404 } : NO_SESSION));
    await t.win.fetch("/app/ops/PlaceSearch.dc.html");
    await flush();
    expect(t.replaced).toEqual(["/login"]);
    expect(t.reloaded).toEqual([]);
  });

  // Follow-up 2: the sidebar is fetched once, when the shell boots. With Auth slow at that moment it 404s while the
  // screen file (asked a moment later) is a 200: the dashboard stayed without a sidebar until a hand reload.
  it("the sidebar 404s at boot while the session is alive: the page reloads once (one probe)", async () => {
    const t = tab((url) => (url === "/app/ops/OpsSidebar.dc.html" ? { status: 404 } : aliveAnswer));
    await t.win.fetch("/app/ops/OpsSidebar.dc.html");
    await t.win.fetch("/app/ops/OpsCustomers.dc.html");
    await flush();
    expect(t.reloaded).toEqual(["reload"]);
    expect(t.replaced).toEqual([]);
    expect(t.calls.filter((c) => c === "GET /api/staff/me")).toHaveLength(1);
  });

  it("the sidebar 404s because the session is dead: to /login, no reload", async () => {
    const t = tab((url) => (url.startsWith("/app/ops/") ? { status: 404 } : NO_SESSION));
    await t.win.fetch("/app/ops/OpsSidebar.dc.html");
    await flush();
    expect(t.replaced).toEqual(["/login"]);
    expect(t.reloaded).toEqual([]);
  });

  it("the sidebar's reload is the same counted, spaced reload as a screen's: at most twice per tab", async () => {
    const clock = { now: 2_000_000 };
    const t = tab((url) => (url.startsWith("/app/ops/") ? { status: 404 } : aliveAnswer), { clock });
    for (let round = 0; round < 5; round += 1) {
      await t.win.fetch("/app/ops/OpsSidebar.dc.html");
      await flush();
      clock.now += 16_000;
    }
    expect(t.reloaded).toEqual(["reload", "reload"]);
  });

  it("a route screen that 404s while the check for a nested part is still running is not forgotten: one probe, one reload", async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const t = tab(async (url) => {
      if (url === "/api/staff/me") {
        await gate; // the probe is slow
        return aliveAnswer;
      }
      return { status: 404 };
    });
    await t.win.fetch("/app/ops/PlaceSearch.dc.html");
    await t.win.fetch("/app/ops/OpsDetail.dc.html");
    await flush();
    expect(t.reloaded).toEqual([]);
    release();
    await flush();
    expect(t.calls.filter((c) => c === "GET /api/staff/me")).toHaveLength(1);
    expect(t.reloaded).toEqual(["reload"]);
  });

  it("a nested part and nothing else missing while the check is running: no reload", async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const t = tab(async (url) => {
      if (url === "/api/staff/me") {
        await gate;
        return aliveAnswer;
      }
      return { status: 404 };
    });
    await t.win.fetch("/app/ops/PlaceSearch.dc.html");
    await t.win.fetch("/app/ops/BrandSelect.dc.html");
    release();
    await flush();
    expect(t.reloaded).toEqual([]);
  });

  it("an old retry mark does not block a new reload", async () => {
    const clock = { now: 1_000_000 };
    const t = tab((url) => (url.startsWith("/app/ops/") ? { status: 404 } : { status: 200, body: { ok: true, data: {} } }), {
      clock,
      session: { vamosOpsScreenRetryAt: String(clock.now - 600_000) },
    });
    await t.win.fetch(SCREEN);
    await flush();
    expect(t.reloaded).toEqual(["reload"]);
  });

  it("no reload when the check itself failed (server down, a 5xx, or a dead session that goes to /login)", async () => {
    const down = tab((url) => (url.startsWith("/app/ops/") ? { status: 404 } : "network"));
    await down.win.fetch(SCREEN);
    const sick = tab((url) => (url.startsWith("/app/ops/") ? { status: 404 } : { status: 503, body: { ok: false, code: "staff-check-failed" } }));
    await sick.win.fetch(SCREEN);
    const dead = tab((url) => (url.startsWith("/app/ops/") ? { status: 404 } : NO_SESSION));
    await dead.win.fetch(SCREEN);
    await flush();
    expect(down.reloaded).toEqual([]);
    expect(sick.reloaded).toEqual([]);
    expect(dead.reloaded).toEqual([]);
    expect(dead.replaced).toEqual(["/login"]);
  });

  it("without session storage there is no guard, so no reload (a blank screen is better than a loop)", async () => {
    const t = tab((url) => (url.startsWith("/app/ops/") ? { status: 404 } : { status: 200, body: { ok: true, data: {} } }));
    Object.defineProperty(t.win, "sessionStorage", {
      value: {
        getItem: () => {
          throw new Error("blocked");
        },
        setItem: () => {
          throw new Error("blocked");
        },
      },
    });
    await t.win.fetch(SCREEN);
    await flush();
    expect(t.reloaded).toEqual([]);
  });

  it("a screen file 404 while the session check cannot reach the server: no redirect (offline is not signed out)", async () => {
    const t = tab((url) => (url.startsWith("/app/ops/") ? { status: 404 } : "network"));
    await t.win.fetch(SCREEN);
    await flush();
    expect(t.replaced).toEqual([]);
  });

  it("a staff API call that answers 401 no-session: to /login, and the screen still gets the answer", async () => {
    const t = tab(() => NO_SESSION);
    const answer = await t.win.VamosOpsApi.request("GET", "/api/staff/bookings");
    expect(answer).toMatchObject({ ok: false, code: "no-session" });
    await flush();
    expect(t.replaced).toEqual(["/login"]);
  });

  it("403 needs-mfa (the code is asked on /login): to /login", async () => {
    const t = tab(() => ({ status: 403, body: { ok: false, code: "needs-mfa" } }));
    await t.win.VamosOpsApi.request("GET", "/api/staff/settings");
    await flush();
    expect(t.replaced).toEqual(["/login"]);
  });

  // Follow-up 3 (2026-10-05, controller): security S13 answers a switched-off staff row 403 not-staff on every
  // /api/staff/* call. That left a blank screen with an error. It is a dead session as far as this person goes.
  it("a switched-off staff row (403 not-staff from /api/staff/*) is a dead session: to /login, flag cleared, the screen still gets the answer", async () => {
    const t = tab(() => NOT_STAFF);
    const answer = await t.win.VamosOpsApi.request("GET", "/api/staff/bookings");
    expect(answer).toMatchObject({ ok: false, code: "not-staff" });
    await flush();
    expect(t.replaced).toEqual(["/login"]);
    expect(t.local.has("vamosOpsAuth")).toBe(false);
  });

  it("a screen file 404 while /api/staff/me says not-staff goes to /login too (the probe counts it)", async () => {
    const t = tab((url) => (url.startsWith("/app/ops/") ? { status: 404 } : NOT_STAFF));
    await t.win.fetch(SCREEN);
    await flush();
    expect(t.replaced).toEqual(["/login"]);
    expect(t.reloaded).toEqual([]);
    expect(t.local.has("vamosOpsAuth")).toBe(false);
    expect(t.calls).toEqual([`GET ${SCREEN}`, "GET /api/staff/me"]);
  });

  it("not-staff counts only on /api/staff/*: the same code from another path stays that screen's own message", async () => {
    for (const path of ["/api/auth/callback", "/api/photos/upload", "/api/checkout/intent"]) {
      const t = tab(() => NOT_STAFF);
      await t.win.VamosOpsApi.request("GET", path);
      await flush();
      expect(t.replaced, path).toEqual([]);
      expect(t.local.has("vamosOpsAuth"), path).toBe(true);
    }
  });

  it("not-staff on a 401, or any other status, is not the dead-session answer", async () => {
    for (const answer of [
      { status: 401, body: { ok: false, code: "not-staff" } },
      { status: 404, body: { ok: false, code: "not-staff" } },
      { status: 500, body: { ok: false, code: "not-staff" } },
    ]) {
      const t = tab(() => answer);
      await t.win.VamosOpsApi.request("GET", "/api/staff/bookings");
      await flush();
      expect(t.replaced, String(answer.status)).toEqual([]);
    }
  });

  it("other refusals stay the screen's own message: not-admin, csrf, staff-check-failed, a 401 without the code, /api/auth", async () => {
    for (const method of ["GET", "POST"]) {
      for (const [path, answer] of [
        ["/api/staff/pricing", { status: 403, body: { ok: false, code: "not-admin" } }],
        ["/api/staff/settings", { status: 403, body: { ok: false, code: "csrf" } }],
        ["/api/staff/bookings", { status: 503, body: { ok: false, code: "staff-check-failed" } }],
        ["/api/staff/claim-invite", { status: 401, body: { ok: false } }],
        ["/api/staff/settings", { status: 403, body: { ok: false } }],
        ["/api/auth", { status: 401, body: { ok: false, code: "no-session" } }],
      ] as const) {
        const t = tab(() => answer);
        await t.win.VamosOpsApi.request(method, path, method === "GET" ? undefined : {});
        await flush();
        expect(t.replaced, `${method} ${path}`).toEqual([]);
        expect(t.local.has("vamosOpsAuth"), `${method} ${path}`).toBe(true);
      }
    }
  });

  it("an answer from another origin is ignored", async () => {
    const t = tab(() => ({ status: 404, url: "https://elsewhere.example/app/ops/OpsCustomers.dc.html" }));
    await t.win.fetch("https://elsewhere.example/app/ops/OpsCustomers.dc.html");
    await flush();
    expect(t.calls).toEqual(["GET https://elsewhere.example/app/ops/OpsCustomers.dc.html"]);
    expect(t.replaced).toEqual([]);
  });

  it("the shell's helmet runs the file twice: one watcher, so one probe per 404", async () => {
    const t = tab((url) => (url.startsWith("/app/ops/") ? { status: 404 } : NO_SESSION), { loads: 2 });
    await t.win.fetch(SCREEN);
    await flush();
    expect(t.calls).toEqual([`GET ${SCREEN}`, "GET /api/staff/me"]);
    expect(t.replaced).toEqual(["/login"]);
  });

  it("a page that just came back from /login and sees a dead session again stays put (no bounce loop)", async () => {
    const t = tab(() => NO_SESSION, { session: { vamosOpsSessionLostAt: String(Date.now() - 2000) } });
    await t.win.VamosOpsApi.request("GET", "/api/staff/bookings");
    await flush();
    expect(t.replaced).toEqual([]);
  });

  // U8 review nit: the "already redirected" flag was set before the 15 s guard, so a redirect the guard
  // held back left it set for the life of the page and a later, real death never redirected.
  it("a redirect the 15 s guard held back does not use up the page: a death 20 s later still goes to /login", async () => {
    const clock = { now: 5_000_000 };
    const t = tab(() => NO_SESSION, { clock, session: { vamosOpsSessionLostAt: String(clock.now - 2000) } });
    await t.win.VamosOpsApi.request("GET", "/api/staff/bookings");
    await flush();
    expect(t.replaced).toEqual([]); // held back: it just came back from /login
    clock.now += 20_000;
    await t.win.VamosOpsApi.request("GET", "/api/staff/bookings");
    await flush();
    expect(t.replaced).toEqual(["/login"]);
    expect(t.session.has("vamosOpsSessionLostAt")).toBe(true);
  });

  it("inside the 15 s window every further death answer stays held back, and a redirect is not repeated once it was made", async () => {
    const clock = { now: 5_000_000 };
    const held = tab(() => NO_SESSION, { clock, session: { vamosOpsSessionLostAt: String(clock.now - 2000) } });
    for (let i = 0; i < 3; i += 1) await held.win.VamosOpsApi.request("GET", "/api/staff/bookings");
    await flush();
    expect(held.replaced).toEqual([]);
    const fresh = tab(() => NO_SESSION, { clock });
    for (let i = 0; i < 3; i += 1) await fresh.win.VamosOpsApi.request("GET", "/api/staff/bookings");
    await flush();
    expect(fresh.replaced).toEqual(["/login"]);
  });

  it("an old mark (a sign-in an hour ago) does not block a new redirect", async () => {
    const t = tab(() => NO_SESSION, { session: { vamosOpsSessionLostAt: String(Date.now() - 3_600_000) } });
    await t.win.VamosOpsApi.request("GET", "/api/staff/bookings");
    await flush();
    expect(t.replaced).toEqual(["/login"]);
  });

  it("ordinary traffic is untouched: 200s and 404s of data are returned as before, nothing is checked", async () => {
    const t = tab((url) => (url === "/api/staff/me" ? { status: 200, body: { ok: true, data: { role: "admin" } } } : { status: 404, body: { ok: false, code: "not-found" } }));
    expect(await t.win.VamosOpsApi.request("GET", "/api/staff/me")).toMatchObject({ ok: true });
    expect(await t.win.VamosOpsApi.request("GET", "/api/staff/bookings/VT-1")).toMatchObject({ code: "not-found" });
    await flush();
    expect(t.replaced).toEqual([]);
    expect(t.calls).toEqual(["GET /api/staff/me", "GET /api/staff/bookings/VT-1"]);
  });
});

// Follow-up 4 (2026-10-05, controller): a write (POST, PUT, PATCH, DELETE) answered with a dead session used to send the
// browser to /login at once, and the form the person had typed went with it. Now the page stays (the screen shows its
// own error as before), the page marks the session lost, and the next read, screen load or navigation goes to /login.
describe("a write that fails on a dead session keeps the page; the next read, screen load or navigation goes to /login", () => {
  const WRITES = ["POST", "PUT", "PATCH", "DELETE"] as const;
  const DEAD = [
    ["no-session", NO_SESSION],
    ["needs-mfa", NEEDS_MFA],
    ["not-staff", NOT_STAFF],
  ] as const;
  const ALIVE = { status: 200, body: { ok: true, data: {} } };

  /** Writes answer `writeAnswer`, everything else answers `readAnswer`. */
  const split = (writeAnswer: Answer | "network", readAnswer: Answer) => (_url: string, init?: RequestInit) =>
    init?.method && init.method !== "GET" ? writeAnswer : readAnswer;

  for (const method of WRITES) {
    for (const [code, answer] of DEAD) {
      it(`a failed ${method} (${code}) keeps the page: no redirect, the sign-in flag stays, the screen still gets its answer`, async () => {
        const t = tab(split(answer, ALIVE));
        const got = await t.win.VamosOpsApi.request(method, "/api/staff/settings", { a: 1 });
        await flush();
        expect(got).toMatchObject({ ok: false, code });
        expect(t.replaced).toEqual([]);
        expect(t.reloaded).toEqual([]);
        expect(t.local.has("vamosOpsAuth")).toBe(true);
      });
    }
  }

  it("the next staff read after the failed write goes to /login, whatever that read answers; it still gets its answer", async () => {
    for (const readAnswer of [ALIVE, NO_SESSION]) {
      const t = tab(split(NO_SESSION, readAnswer));
      await t.win.VamosOpsApi.request("PATCH", "/api/staff/bookings/VT-1", { status: "cancelled" });
      await flush();
      expect(t.replaced).toEqual([]);
      const got = await t.win.VamosOpsApi.request("GET", "/api/staff/bookings");
      await flush();
      expect(got).toMatchObject({ ok: readAnswer === ALIVE });
      expect(t.replaced).toEqual(["/login"]);
      expect(t.local.has("vamosOpsAuth")).toBe(false);
    }
  });

  it("the next screen load goes to /login", async () => {
    const t = tab(split(NO_SESSION, ALIVE));
    await t.win.VamosOpsApi.request("POST", "/api/staff/settings", {});
    await flush();
    expect(t.replaced).toEqual([]);
    await t.win.fetch("/app/ops/OpsPricing.dc.html");
    await flush();
    expect(t.replaced).toEqual(["/login"]);
  });

  it("the next navigation goes to /login: history.pushState (the shell's own route change) and popstate (back / forward)", async () => {
    const pushed = tab(split(NO_SESSION, ALIVE));
    await pushed.win.VamosOpsApi.request("PUT", "/api/staff/rate-book", {});
    await flush();
    expect(pushed.replaced).toEqual([]);
    pushed.win.history.pushState({}, "", "/pricing");
    expect(pushed.replaced).toEqual(["/login"]);
    expect(pushed.pushes).toEqual(["/pricing"]); // the browser's own pushState still runs

    const popped = tab(split(NOT_STAFF, ALIVE));
    await popped.win.VamosOpsApi.request("POST", "/api/staff/settings", {});
    await flush();
    expect(popped.replaced).toEqual([]);
    popped.fire("popstate");
    expect(popped.replaced).toEqual(["/login"]);
  });

  it("before any failed write nothing is redirected: reads, screen loads, pushState and popstate all pass through", async () => {
    const t = tab(() => ALIVE);
    await t.win.VamosOpsApi.request("GET", "/api/staff/bookings");
    await t.win.fetch("/app/ops/OpsPricing.dc.html");
    t.win.history.pushState({}, "", "/pricing");
    t.fire("popstate");
    await t.win.VamosOpsApi.request("POST", "/api/staff/settings", {});
    await flush();
    expect(t.replaced).toEqual([]);
    expect(t.pushes).toEqual(["/pricing"]);
    expect(t.local.has("vamosOpsAuth")).toBe(true);
  });

  it("a write refused for another reason does not mark the page: not-admin, csrf, no code, a 500, a dropped connection", async () => {
    for (const writeAnswer of [
      { status: 403, body: { ok: false, code: "not-admin" } },
      { status: 403, body: { ok: false, code: "csrf" } },
      { status: 401, body: { ok: false } },
      { status: 503, body: { ok: false, code: "staff-check-failed" } },
      { status: 500, body: { ok: false, code: "http" } },
      "network" as const,
    ]) {
      const t = tab(split(writeAnswer, ALIVE));
      await t.win.VamosOpsApi.request("POST", "/api/staff/settings", {});
      await flush();
      await t.win.VamosOpsApi.request("GET", "/api/staff/bookings");
      await t.win.fetch("/app/ops/OpsPricing.dc.html");
      t.win.history.pushState({}, "", "/pricing");
      t.fire("popstate");
      await flush();
      expect(t.replaced, JSON.stringify(writeAnswer)).toEqual([]);
    }
  });

  it("not-staff from a write counts only on /api/staff/*, like for reads", async () => {
    const t = tab(split(NOT_STAFF, ALIVE));
    await t.win.VamosOpsApi.request("POST", "/api/checkout/intent", {});
    await flush();
    await t.win.VamosOpsApi.request("GET", "/api/staff/bookings");
    await flush();
    expect(t.replaced).toEqual([]);
  });

  it("many reads after the failed write are one redirect; a second failed write adds nothing", async () => {
    const t = tab(split(NO_SESSION, ALIVE));
    await t.win.VamosOpsApi.request("POST", "/api/staff/settings", {});
    await Promise.all([t.win.VamosOpsApi.request("GET", "/api/staff/bookings"), t.win.fetch("/app/ops/OpsPricing.dc.html")]);
    await t.win.VamosOpsApi.request("PATCH", "/api/staff/settings", {});
    t.win.history.pushState({}, "", "/pricing");
    await flush();
    expect(t.replaced).toEqual(["/login"]);
  });

  it("the 15 s loop guard still applies: held back, the mark waits, and the next read after the window goes to /login", async () => {
    const clock = { now: 5_000_000 };
    const t = tab(split(NO_SESSION, ALIVE), { clock, session: { vamosOpsSessionLostAt: String(clock.now - 2000) } });
    await t.win.VamosOpsApi.request("POST", "/api/staff/settings", {});
    await t.win.VamosOpsApi.request("GET", "/api/staff/bookings");
    await flush();
    expect(t.replaced).toEqual([]); // it just came back from /login
    clock.now += 20_000;
    await t.win.VamosOpsApi.request("GET", "/api/staff/bookings");
    await flush();
    expect(t.replaced).toEqual(["/login"]);
  });

  it("a staff write that goes through after the refused one proves the session is alive: the mark is cleared", async () => {
    let writes = 0;
    const t = tab((_url, init) => {
      if (init?.method === "POST") return ++writes === 1 ? NO_SESSION : ALIVE; // a refresh race: the retry works
      return ALIVE;
    });
    await t.win.VamosOpsApi.request("POST", "/api/staff/settings", {});
    await t.win.VamosOpsApi.request("POST", "/api/staff/settings", {});
    await flush();
    await t.win.VamosOpsApi.request("GET", "/api/staff/bookings");
    t.win.history.pushState({}, "", "/pricing");
    await flush();
    expect(t.replaced).toEqual([]);
  });

  it("the method is read from the init (any case) and from a Request-like input", async () => {
    const lower = tab(split(NO_SESSION, ALIVE));
    await lower.win.fetch("/api/staff/settings", { method: "post" });
    await flush();
    expect(lower.replaced).toEqual([]);
    await lower.win.fetch("/api/staff/bookings");
    await flush();
    expect(lower.replaced).toEqual(["/login"]);

    const byRequest = tab((url, init) => (url === "/api/staff/settings" && !init ? NO_SESSION : ALIVE));
    await byRequest.win.fetch({ url: "/api/staff/settings", method: "PATCH" });
    await flush();
    expect(byRequest.replaced).toEqual([]);
    await byRequest.win.fetch({ url: "/api/staff/bookings", method: "GET" });
    await flush();
    expect(byRequest.replaced).toEqual(["/login"]);
  });

  it("only the console's own reads count: another origin, a font, a photo and a non-console path do not redirect", async () => {
    const t = tab(split(NO_SESSION, ALIVE));
    await t.win.VamosOpsApi.request("POST", "/api/staff/settings", {});
    await flush();
    await t.win.fetch("https://elsewhere.example/api/staff/bookings");
    await t.win.fetch("/photos/driver.jpg");
    await t.win.fetch("/_ds/fonts/Poppins.woff2");
    await t.win.fetch("/app/ops/ops.dc.html.map");
    await flush();
    expect(t.replaced).toEqual([]);
  });

  it("a read that is dead by itself still goes at once, as before (reads are not held back)", async () => {
    const t = tab(() => NOT_STAFF);
    await t.win.VamosOpsApi.request("GET", "/api/staff/bookings");
    await flush();
    expect(t.replaced).toEqual(["/login"]);
  });

  it("the shell's helmet runs the file twice: pushState is wrapped once and one redirect is made", async () => {
    const t = tab(split(NO_SESSION, ALIVE), { loads: 2 });
    expect(t.listeners.popstate).toHaveLength(1);
    await t.win.VamosOpsApi.request("POST", "/api/staff/settings", {});
    await flush();
    t.win.history.pushState({}, "", "/pricing");
    await flush();
    expect(t.pushes).toEqual(["/pricing"]); // the original ran once, not once per wrapper
    expect(t.replaced).toEqual(["/login"]);
  });

  it("a page without history or addEventListener still runs: no navigation hook, but reads still redirect", async () => {
    const t = tab(split(NO_SESSION, ALIVE), { bare: true });
    await t.win.VamosOpsApi.request("POST", "/api/staff/settings", {});
    await t.win.VamosOpsApi.request("GET", "/api/staff/bookings");
    await flush();
    expect(t.replaced).toEqual(["/login"]);
  });
});
