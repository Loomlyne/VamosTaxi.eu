// The agency's old GA4 G-JW17PMTRE9 rides on Google's served config for the Ads tag (owner 2026-10-17: remove it,
// filter approved). app/vamos-google.js drops its /g/collect hits and clears its cookie; every other request passes.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import vm from "node:vm";
import { describe, expect, it } from "vitest";
import { GA4_MEASUREMENT_ID, GOOGLE_TAG_ID } from "./flag";

const SRC = readFileSync(resolve(__dirname, "../../../../app/vamos-google.js"), "utf8");
// The filter reads only the path and the tid, so a neutral host stands in for Google's.
const HOST = "https://collector.example";
const DEAD = `${HOST}/g/collect?v=2&tid=G-JW17PMTRE9&gtm=x&en=page_view`;
const LIVE = `${HOST}/g/collect?v=2&tid=${GA4_MEASUREMENT_ID}&gtm=x&en=page_view`;
const ADS = `${HOST}/ccm/collect?tid=${GOOGLE_TAG_ID}&en=page_view`;

function load(cookie = "") {
  const fetched: string[] = [];
  const beacons: string[] = [];
  const writes: string[] = [];
  const timers: { fn: () => void; ms: number }[] = [];
  const realFetch = (u: unknown) => {
    fetched.push(String(u));
    return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true, chosen: false }) });
  };
  const win: Record<string, unknown> = {
    fetch: realFetch,
    navigator: { sendBeacon: (u: string) => (beacons.push(u), true) },
    addEventListener: () => {},
    dispatchEvent: () => true,
  };
  let jar = cookie;
  const document = {
    get cookie() { return jar; },
    set cookie(v: string) { writes.push(v); },
    createElement: () => ({}),
    getElementsByTagName: () => [{ parentNode: { insertBefore: () => {} } }],
    head: { appendChild: () => {} },
    addEventListener: () => {},
    title: "",
    referrer: "",
  };
  const ctx: Record<string, unknown> = {
    window: win, document, navigator: win.navigator,
    location: { href: "https://vamostaxi.site/de", hostname: "vamostaxi.site", pathname: "/de", search: "" },
    URL, JSON, Promise, Date, Math, isFinite, String, Object, Response,
    setTimeout: (fn: () => void, ms: number) => (timers.push({ fn, ms }), timers.length),
    fetch: (u: unknown) => (win.fetch as (u: unknown) => unknown)(u),
  };
  vm.createContext(ctx);
  vm.runInContext(SRC, ctx);
  return { win, fetched, beacons, writes, timers, setJar: (v: string) => { jar = v; } };
}

describe("app/vamos-google.js: the dead G-JW17PMTRE9 is filtered", () => {
  it("a /g/collect fetch for G-JW17PMTRE9 never leaves; the live GA4 and the Ads tag do", async () => {
    const h = load();
    const f = h.win.fetch as (u: unknown) => Promise<{ status?: number }>;
    const r = await f(DEAD);
    expect(r.status).toBe(204);
    expect(h.fetched).not.toContain(DEAD);
    await f(LIVE);
    await f(ADS);
    expect(h.fetched).toContain(LIVE);
    expect(h.fetched).toContain(ADS);
  });

  it("a Request-like object for G-JW17PMTRE9 is dropped too", async () => {
    const h = load();
    await (h.win.fetch as (u: unknown) => Promise<unknown>)({ url: DEAD });
    expect(h.fetched.some((u) => u.includes("G-JW17PMTRE9"))).toBe(false);
  });

  it("sendBeacon drops only G-JW17PMTRE9", () => {
    const h = load();
    const send = (h.win.navigator as { sendBeacon: (u: string) => boolean }).sendBeacon;
    expect(send(DEAD)).toBe(true);
    expect(send(LIVE)).toBe(true);
    expect(h.beacons).toEqual([LIVE]);
  });

  it("only exact tid: a lookalike id passes", async () => {
    const h = load();
    const look = DEAD.replace("G-JW17PMTRE9", "G-JW17PMTRE99");
    await (h.win.fetch as (u: unknown) => Promise<unknown>)(look);
    expect(h.fetched).toContain(look);
  });

  it("its cookie is deleted when present, and nothing is written when it is absent", () => {
    const clean = load("_fbp=fb.1.1.1");
    for (const t of clean.timers.splice(0)) if (t.ms === 4000) t.fn();
    expect(clean.writes.some((w) => w.startsWith("_ga_JW17PMTRE9="))).toBe(false);
    const dirty = load(`_ga_JW17PMTRE9=GS1.1.x; _ga_${GA4_MEASUREMENT_ID.slice(2)}=GS1.1.y`);
    expect(dirty.writes.some((w) => w.startsWith("_ga_JW17PMTRE9=; Max-Age=0"))).toBe(true);
    expect(dirty.writes.some((w) => w.startsWith(`_ga_${GA4_MEASUREMENT_ID.slice(2)}=`))).toBe(false);
  });
});
