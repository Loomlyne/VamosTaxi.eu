// apps/web/tests/support/meta-pixel.ts
//
// Phase 28 plan 28-06. Browser harness for the Meta page view: pages are fulfilled at their public
// addresses (https://vamostaxi.site/...) from apps/web/public (run scripts/sync-dc-mock-to-public.mjs
// first), Meta's hosts are fulfilled locally, every other outside request is aborted. No request ever
// reaches Meta. No Next server, no database.
//
// Meta strings are built from parts (lib/meta/legal-gate.test.ts scans for the literal names).
import type { BrowserContext, Page, Route } from "@playwright/test";
import { existsSync, readFileSync, statSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { WEB_ROOT } from "./server-harness";

const PUBLIC_ROOT = join(WEB_ROOT, "public");
const MIDDLEWARE = readFileSync(join(WEB_ROOT, "middleware.ts"), "utf8");
const STUB = join(WEB_ROOT, "tests", "fixtures", "fbevents-stub.js");

export const META_SCRIPT_HOST = "connect." + "face" + "book" + ".net";
export const META_BEACON_HOST = "www." + "face" + "book" + ".com";
const POLICY = "test";

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".json": "application/json",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".jpg": "image/jpeg",
  ".png": "image/png",
};

/** DC_PAGES from middleware.ts: public address -> mock file under apps/web/public. */
function dcPages(): Record<string, string> {
  const home = /const DC_HOME = "([^"]+)"/.exec(MIDDLEWARE)![1]!;
  const block = /const DC_PAGES: Record<string, string> = \{([\s\S]*?)\n\};/.exec(MIDDLEWARE);
  if (!block) throw new Error("DC_PAGES not found in middleware.ts");
  const out: Record<string, string> = {};
  for (const m of block[1]!.matchAll(/"([^"]+)":\s*(DC_HOME|"[^"]+")/g)) {
    out[m[1]!] = m[2] === "DC_HOME" ? home : m[2]!.slice(1, -1);
  }
  return out;
}
const PAGES = dcPages();

/** The mock file behind a public address, or null. Mirrors what the Worker serves. */
export function mockFor(pathname: string): string | null {
  let p = pathname;
  const lang = /^\/(de|fr|ar)(?=\/|$)/.exec(p);
  if (lang) p = p.slice(3) || "/";
  const account = /^\/account\/(transfers|details|mobile|preferences|security|close)$/.exec(p);
  if (account) p = "/account";
  return PAGES[p] ?? null;
}

export interface SiteOptions {
  /** Rewrite the two baked flags in /app/vamos-meta.js. */
  flagsOn: boolean;
  /** Content-Security-Policy to send on mock pages (the real specs pass the policy the Worker would send). */
  csp?: string;
}

export interface Outside {
  /** Requests to a host that is neither the site nor an intercepted one. */
  aborted: string[];
}

/** Fulfil the site (and the dashboard host) from apps/web/public. */
export async function routeSite(context: BrowserContext, opts: SiteOptions): Promise<void> {
  await context.route(/^https:\/\/(dashboard\.)?vamostaxi\.site\//, async (route: Route) => {
    const url = new URL(route.request().url());
    if (url.pathname.startsWith("/api/")) return route.fulfill({ status: 404, contentType: "application/json", body: "{}" });
    const mock = route.request().resourceType() === "document" ? mockFor(url.pathname) : null;
    const rel = mock ?? url.pathname;
    const file = normalize(join(PUBLIC_ROOT, decodeURIComponent(rel)));
    if (!file.startsWith(PUBLIC_ROOT) || !existsSync(file) || !statSync(file).isFile()) {
      return route.fulfill({ status: 404, body: "not found" });
    }
    let body: string | Buffer;
    if (mock) {
      body = readFileSync(file, "utf8").replace(/<head([^>]*)>/i, '<head$1><meta name="vt-turnstile-site-key" content="test">');
    } else if (url.pathname === "/app/vamos-meta.js") {
      body = readFileSync(file, "utf8")
        .replace(/var GATE_OPEN = (true|false);/, `var GATE_OPEN = ${opts.flagsOn};`)
        .replace(/var SWITCHES_OFF = (true|false);/, `var SWITCHES_OFF = ${opts.flagsOn};`);
    } else {
      body = readFileSync(file);
    }
    return route.fulfill({
      status: 200,
      contentType: TYPES[extname(file)] ?? "application/octet-stream",
      headers: { "cache-control": "no-store", ...(mock && opts.csp ? { "content-security-policy": opts.csp } : {}) },
      body,
    });
  });
}

/** Meta's script host gets the stub, its beacon host answers 200 empty. Returns the beacon URLs seen. */
export async function routeMeta(context: BrowserContext): Promise<{ beacons: URL[]; scripts: string[] }> {
  const beacons: URL[] = [];
  const scripts: string[] = [];
  await context.route(`https://${META_SCRIPT_HOST}/**`, (route) => {
    scripts.push(route.request().url());
    return route.fulfill({ status: 200, contentType: "text/javascript", body: readFileSync(STUB, "utf8") });
  });
  await context.route(`https://${META_BEACON_HOST}/**`, (route) => {
    beacons.push(new URL(route.request().url()));
    return route.fulfill({ status: 200, contentType: "image/gif", body: Buffer.alloc(0) });
  });
  return { beacons, scripts };
}

/** A tiny Turnstile: render returns an id, execute calls the callback with a token. */
export async function routeTurnstile(context: BrowserContext): Promise<void> {
  await context.route("https://challenges.cloudflare.com/**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "text/javascript",
      body: `window.turnstile={render:function(b,o){window.__tsOpts=o;return 'w1'},execute:function(){setTimeout(function(){window.__tsOpts.callback('test-token')},0)},reset:function(){},remove:function(){}};`,
    }),
  );
}

/** Abort everything else that is not the site or Meta, and record it. Register this FIRST (lowest priority). */
export async function blockOthers(context: BrowserContext): Promise<Outside> {
  const aborted: string[] = [];
  await context.route(/^https?:\/\/(?!(dashboard\.)?vamostaxi\.site\/)/, (route) => {
    aborted.push(route.request().url());
    return route.abort();
  });
  return { aborted };
}

function json(route: Route, body: unknown) {
  return route.fulfill({
    status: 200,
    contentType: "application/json",
    headers: { "cache-control": "private, no-store" },
    body: JSON.stringify(body),
  });
}

/** The server says: chosen, with these categories. Mutable so a spec can change the answer. */
export async function stubConsentMarketing(page: Page, marketing: boolean | null): Promise<{ set: (m: boolean | null) => void; reads: number }> {
  const box = { marketing, reads: 0 };
  await page.route("**/api/consent/state", (route) => {
    box.reads += 1;
    if (box.marketing === null) return json(route, { ok: true, chosen: false, policyVersion: POLICY });
    return json(route, {
      ok: true,
      chosen: true,
      policyVersion: POLICY,
      choice: {
        method: box.marketing ? "accept_all" : "reject_all",
        functional: box.marketing,
        analytics: box.marketing,
        marketing: box.marketing,
        recordedAt: "2026-01-01T00:00:00.000Z",
      },
    });
  });
  await page.route("**/api/consent", (route) => {
    if (route.request().method() !== "POST") return route.fallback();
    const body = JSON.parse(route.request().postData() ?? "{}") as { marketing?: boolean };
    box.marketing = body.marketing === true;
    return json(route, { ok: true });
  });
  return {
    set: (m) => void (box.marketing = m),
    get reads() {
      return box.reads;
    },
  };
}
