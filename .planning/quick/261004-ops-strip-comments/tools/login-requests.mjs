#!/usr/bin/env node
// login-requests: which files does the dashboard sign-in page fetch before anyone signs in?
// Loads the synced ops-login page (as /login serves it: ops-login.dc.html with its base href,
// no vamosOpsAuth flag) from a public tree and lists every same-origin request, grouped.
// Usage: node login-requests.mjs --root <apps/web/public after sync>
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import { serve } from "../../261002-p6-followups/tools/mirror-serve.mjs";

const require = createRequire(new URL("../../../../apps/web/package.json", import.meta.url));
const { chromium } = require("@playwright/test");

const i = process.argv.indexOf("--root");
const root = resolve(i === -1 ? "" : process.argv[i + 1]);
const s = await serve(root);
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const seen = new Set();
page.on("request", (r) => {
  const u = new URL(r.url());
  if (u.origin === s.base) seen.add(u.pathname.replace(/_ds\/[^/]+\//, "_ds/<uuid>/"));
});
await page.route("**/api/**", (route) => route.fulfill({ json: { ok: false, code: "no-session" }, status: 401 }));
// /login answers the synced ops-login page itself, as serveOpsDc does (the page leaves any /app/ address).
await page.route(`${s.base}/login`, (route) =>
  route.fulfill({ contentType: "text/html; charset=utf-8", body: readFileSync(join(root, "app/ops/ops-login.html"), "utf8") }),
);
await page.goto(`${s.base}/login`, { waitUntil: "load" });
await page.waitForLoadState("networkidle", { timeout: 5000 }).catch(() => {});
await page.waitForTimeout(2000);
const list = [...seen].sort();
console.log("under /app/ops/:");
for (const p of list.filter((p) => p.startsWith("/app/ops/"))) console.log(`  ${p}`);
console.log("other:");
for (const p of list.filter((p) => !p.startsWith("/app/ops/"))) console.log(`  ${p}`);
await browser.close();
s.server.close();
