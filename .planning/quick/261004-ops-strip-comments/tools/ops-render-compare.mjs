#!/usr/bin/env node
// ops-render-compare: load the dashboard shell and two screens (board, booking detail) from two
// synced public trees in headless Chromium and compare what renders. Used to prove that stripping
// the served dashboard copy (public/app/ops) changes no screen.
//
// Usage: node ops-render-compare.mjs --before <public tree> --after <public tree> [--out DIR]
//   Each tree is apps/web/public after scripts/sync-dc-mock-to-public.mjs.
// Per tree, path, language and width it records: body innerText, element count, the rendered DOM
// (body outerHTML with generated ids, the clock and <style>/<script> bodies removed), whether each
// <style>/<script> body after is the before body minus its comments, console errors, page errors,
// failed or 404 requests, and a full-page PNG. Exit 1 when any pair differs or any error shows.
// /api/** is answered here (stub rows, money 0: the screens show their own CHF 000 mark); nothing
// reaches a real server. The shell is served as the dashboard host does (serveOpsDc): the synced
// ops.html with its base href, plus the vamosOpsAuth flag.
import { mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { serve } from "../../261002-p6-followups/tools/mirror-serve.mjs";
import { stripCss, stripJsChecked } from "../../../../scripts/strip-public-comments.mjs";

const JS = new Set(["", "text/javascript", "application/javascript", "module", "text/x-dc", "text/babel"]);

const require = createRequire(new URL("../../../../apps/web/package.json", import.meta.url));
const { chromium } = require("@playwright/test");

const args = process.argv.slice(2);
const opt = (name) => {
  const i = args.indexOf(name);
  return i === -1 ? null : args[i + 1];
};
const before = resolve(opt("--before") ?? "");
const after = resolve(opt("--after") ?? "");
const out = resolve(opt("--out") ?? "ops-render-compare-out");
mkdirSync(out, { recursive: true });

const PATHS = ["/dashboard", "/bookings", "/bookings/VT-26-0807"];
const LANGS = ["en", "ar"];
const WIDTHS = [1440, 390];

const day = (n) => new Date(Date.UTC(2026, 9, 10 + n, 12)).toISOString().slice(0, 10);
function row(ref, uuid, n, status, klass) {
  return {
    id: ref, bookingId: uuid, time: "08:15", date: day(n), dateIso: day(n), pickupAt: `${day(n)}T06:15:00.000Z`,
    customer: "Amira Keller", email: "amira@example.com", phone: "+41 79 000 00 00",
    pickup: "Zurich Airport", dropoff: "Zermatt", klass, className: klass, pax: 3, bags: 2,
    status, paid: status === "paid" || status === "confirmed", paidByCard: true, totalRappen: 0, capturedRappen: 0,
    flight: "LX 318", note: "", extras: [], fareLines: [], events: [], refundStatus: "none",
  };
}
const ROWS = [
  row("VT-26-0807", "6a1f0e0e-0807-4c0d-9a31-0d5b1c4a0807", 0, "confirmed", "Van luxury"),
  row("VT-26-0808", "6a1f0e0e-0808-4c0d-9a31-0d5b1c4a0808", 1, "paid", "Business"),
  row("VT-26-0809", "6a1f0e0e-0809-4c0d-9a31-0d5b1c4a0809", 2, "pending", "Economy"),
];
const ME = { fullName: "Test Admin", role: "admin", email: "admin@example.com", lang: "en", twoFactor: true, userId: "u-1" };

function api(route) {
  const req = route.request();
  const path = new URL(req.url()).pathname;
  if (req.method() === "POST" && path === "/api/auth") return route.fulfill({ contentType: "application/json", body: "null" });
  if (path === "/api/staff/me") return route.fulfill({ json: { ok: true, data: ME } });
  if (path === "/api/staff/bookings") return route.fulfill({ json: { ok: true, data: ROWS } });
  if (/^\/api\/staff\/bookings\/[^/]+\/refund$/.test(path)) return route.fulfill({ json: { ok: true, data: null } });
  if (path === "/api/staff/chauffeurs") return route.fulfill({ json: { ok: true, data: [] } });
  return route.fulfill({ json: { ok: true, data: [] } });
}

/**
 * In the page: what rendered, with generated ids and clock text normalised. The DC runtime keeps
 * each screen's <style> and logic <script> text in the DOM; those bodies are lifted out (`code`)
 * so the markup compares on its own and the code compares as "after = before minus comments".
 */
function snapshot() {
  const code = [];
  const clone = document.body.cloneNode(true);
  for (const el of clone.querySelectorAll("style, script")) {
    code.push({ tag: el.tagName.toLowerCase(), type: el.getAttribute("type") || "", text: el.textContent || "" });
    el.textContent = "";
  }
  const html = clone.outerHTML
    .replace(/\s(id|for|aria-labelledby|aria-controls|aria-describedby)="[^"]*"/g, "")
    .replace(/\b\d{1,2}:\d{2}(:\d{2})?\b/g, "HH:MM");
  return {
    text: document.body.innerText.replace(/\b\d{1,2}:\d{2}(:\d{2})?\b/g, "HH:MM"),
    count: document.querySelectorAll("*").length,
    html,
    code,
    dir: document.documentElement.getAttribute("dir") || "",
    title: document.title,
  };
}

/** Every <style>/<script> body after equals the before body with its comments stripped. */
function codeMatches(before, after) {
  if (before.length !== after.length) return `blocks ${before.length}/${after.length}`;
  for (let i = 0; i < before.length; i++) {
    const x = before[i];
    const y = after[i];
    if (x.tag !== y.tag || x.type !== y.type) return `block ${i} kind ${x.tag}/${y.tag}`;
    const want = x.tag === "style" ? stripCss(x.text) : JS.has(x.type.toLowerCase()) ? stripJsChecked(x.text) : x.text;
    if (want !== y.text) return `block ${i} (${x.tag} ${x.type}) is not the stripped before`;
  }
  return "";
}

async function capture(browser, base, path, lang, width, tag) {
  const ctx = await browser.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: 1, reducedMotion: "reduce" });
  const page = await ctx.newPage();
  const errors = [];
  page.on("console", (m) => { if (m.type() === "error") errors.push(`console: ${m.text().slice(0, 200)}`); });
  page.on("pageerror", (e) => errors.push(`pageerror: ${String(e).split("\n")[0].slice(0, 200)}`));
  page.on("requestfailed", (r) => errors.push(`requestfailed: ${r.url()}`));
  page.on("response", (r) => { if (r.status() >= 400) errors.push(`http ${r.status()}: ${r.url()}`); });
  await page.addInitScript((l) => {
    localStorage.setItem("vamosLang", l);
    localStorage.setItem("vamosOpsAuth", "1");
  }, lang);
  await page.route("**/api/**", api);
  await page.goto(`${base}${path}`, { waitUntil: "load" });
  await page.waitForLoadState("networkidle", { timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(2500);
  await page.addStyleTag({ content: "*,*::before,*::after{transition:none!important;animation:none!important;caret-color:transparent!important}" });
  await page.waitForTimeout(300);
  const snap = await page.evaluate(snapshot);
  const png = await page.screenshot({ fullPage: true });
  writeFileSync(`${out}/${tag}.png`, png);
  await ctx.close();
  return { ...snap, errors, png };
}

const b = await serve(before, { ops: true });
const a = await serve(after, { ops: true });
const browser = await chromium.launch({ headless: true });
let bad = 0;
const lines = [];
for (const path of PATHS) {
  for (const lang of LANGS) {
    for (const width of WIDTHS) {
      const slug = `${path.replace(/\//g, "_").replace(/^_/, "")}-${lang}-${width}`;
      const x = await capture(browser, b.base, path, lang, width, `${slug}-before`);
      const y = await capture(browser, a.base, path, lang, width, `${slug}-after`);
      const codeDiff = codeMatches(x.code, y.code);
      const same = {
        text: x.text === y.text,
        count: x.count === y.count,
        dom: x.html === y.html,
        code: codeDiff === "",
        png: Buffer.compare(x.png, y.png) === 0,
      };
      const ok = same.text && same.count && same.dom && same.code && x.errors.length === 0 && y.errors.length === 0 && x.text.length > 50;
      if (!ok) bad++;
      const line = `${ok ? "ok  " : "FAIL"} ${path.padEnd(22)} ${lang} ${String(width).padStart(4)}  text=${same.text} (${y.text.length} chars) elements=${x.count}/${y.count} dom=${same.dom} code=${same.code ? `stripped (${y.code.length} blocks)` : codeDiff} png-identical=${same.png} dir=${y.dir || "ltr"} errors before=${x.errors.length} after=${y.errors.length}`;
      console.log(line);
      lines.push(line);
      for (const e of [...x.errors.map((m) => `  before ${m}`), ...y.errors.map((m) => `  after  ${m}`)]) { console.log(e); lines.push(e); }
      if (!same.dom) {
        writeFileSync(`${out}/${slug}-before.html`, x.html);
        writeFileSync(`${out}/${slug}-after.html`, y.html);
      }
    }
  }
}
writeFileSync(`${out}/result.txt`, lines.join("\n") + "\n");
await browser.close();
b.server.close();
a.server.close();
console.log(bad ? `${bad} pair(s) differ or show errors` : "all pairs identical, no errors");
process.exit(bad ? 1 : 0);
