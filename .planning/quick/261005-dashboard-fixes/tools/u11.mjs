#!/usr/bin/env node
// U11 pictures. The design-system Button has no `outline` variant, so every <Button variant="outline"> drew the
// browser's own grey button face. The owner signed "all 26 white with a line" (ghost) on 2026-10-05.
//
//   [ONLY=<screen/state substring>] node u11.mjs <before|after> <public tree> <scratch dir> <out dir>
//
//   after   shoots the REAL files: the synced public tree of this branch (node scripts/sync-dc-mock-to-public.mjs
//           first), nothing swapped.
//   before  shoots the screens as they were before U11: a copy of that public tree whose app/ops/*.dc.html are put
//           back to their text at the commit in $U11_BEFORE_REF (the branch tip before the U11 commit).
//
// Pictures: u11-<screen>-<state>-<before|after>-<w>.png, English, 1440 and 390 wide, bare crop of the console's
// main column (or of the open dialog). A scenario that cannot reach its state says so and is listed at the end.
import { cpSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import { serve } from "./serve.mjs";
import { answer, stubRows, MONEY_AFTER } from "./fixtures.mjs";

const require = createRequire(new URL("../../../../apps/web/package.json", import.meta.url));
const { chromium } = require("@playwright/test");
const [, , labelArg, treeArg, scratchArg, outArg] = process.argv;
if (!["before", "after"].includes(labelArg) || !treeArg || !scratchArg || !outArg) {
  throw new Error("usage: u11.mjs <before|after> <public tree> <scratch dir> <out dir>");
}
const repo = resolve(new URL("../../../../", import.meta.url).pathname);
const scratch = mkdtempSync(join(resolve(scratchArg), "u11-"));
const out = resolve(outArg);
mkdirSync(out, { recursive: true });

let tree = resolve(treeArg);
if (labelArg === "before") {
  const ref = process.env.U11_BEFORE_REF;
  if (!ref) throw new Error("before needs U11_BEFORE_REF (the commit before the U11 commit)");
  const copy = join(scratch, "before-public");
  cpSync(tree, copy, { recursive: true });
  for (const f of readdirSync(join(repo, "app/ops")).filter((n) => n.endsWith(".dc.html"))) {
    const text = execFileSync("git", ["show", `${ref}:app/ops/${f}`], { cwd: repo, maxBuffer: 64 * 1024 * 1024 });
    writeFileSync(join(copy, "app/ops", f), text);
  }
  tree = copy;
}

const rows = await stubRows(repo, scratch);
const TICKET = {
  id: "t1", ticketId: "T-0001", status: "new", name: "Ada Example", email: "ada@example.test", phone: "+41 79 000 00 00",
  bookingRef: "VT-26-0829", locale: "en", when: "5 Oct 2026 · 09:10", last: "5 Oct 2026 · 09:10", note: "",
  reply: { mailto: "mailto:ada@example.test", gmail: "https://mail.google.com/mail/?view=cm&to=ada@example.test" },
  messages: [{ whoKey: "customer", when: "5 Oct 2026 · 09:10", body: "Is the driver able to wait at arrivals?", files: [] }],
};
const CHAUFFEUR = {
  id: "ch1", name: "Marco Bianchi", phone: "+41 79 000 00 01", email: "marco@example.test", vehicleClassId: "c1", vehicleClassName: "Economy",
  plate: "ZH 100", status: "shift", languages: ["de", "en"], licence: "", note: "", shiftWeekdays: [1, 2, 3, 4, 5], shiftStart: "08:00", shiftEnd: "17:00", leaveRanges: [],
};
const CUSTOMER = { id: "cu1", name: "Ada Example", email: "ada@example.test", phone: "+41 79 000 00 00", type: "private", bookings: 1 };

function respond(method, path) {
  if (path === "/api/staff/tickets") return { status: 200, json: { ok: true, data: [TICKET] } };
  if (path === "/api/staff/chauffeurs") return { status: 200, json: { ok: true, data: [CHAUFFEUR] } };
  if (path === "/api/staff/customers") return { status: 200, json: { ok: true, data: [CUSTOMER] } };
  if (path === "/api/staff/rate-versions") return { status: 200, json: { ok: true, data: { versions: [{ id: "d1", status: "draft" }, { id: "l1", status: "live" }] } } };
  if (path === "/api/staff/rate-versions/d1") return { status: 200, json: { ok: true, data: { gaps: [{ label: "Economy has no per-km rate", kind: "rate", id: "g1" }] } } };
  return answer(method, path, { rows, money: MONEY_AFTER });
}

const SCENARIOS = [
  { screen: "OpsBoard", state: "toolbar-and-paging", route: "/bookings", ready: "[data-vt-board] tbody tr" },
  { screen: "OpsCalendarBoard", state: "month", route: "/calendar", ready: "text=/Today/i" },
  { screen: "OpsNewTrip", state: "back", route: "/bookings/new", ready: "text=/Back/i" },
  { screen: "OpsSettings", state: "dirty-discard", route: "/settings", ready: "input", act: async (page) => { await page.locator("main input[type=text], main input:not([type])").first().fill("Changed AG"); } },
  { screen: "OpsProfile", state: "dirty-discard", route: "/profile", ready: "input", act: async (page) => { await page.locator("main input[type=text], main input:not([type])").first().fill("Changed Name"); } },
  { screen: "OpsTable", state: "clear-the-search", route: "/customers", ready: "text=Ada Example", act: async (page) => { await page.locator("main input").first().fill("zzzz-no-match"); await page.waitForSelector("text=Clear the search", { timeout: 4000 }); } },
  { screen: "OpsTable", state: "keep-it-delete", route: "/customers", ready: "text=Ada Example", crop: "[role=dialog]", act: async (page) => {
      await page.locator("tbody tr").first().click();
      await page.getByRole("button", { name: /^delete/i }).first().click({ timeout: 4000 });
      await page.waitForSelector("text=Keep it", { timeout: 4000 });
    } },
  { screen: "OpsDetail", state: "keep-booking-cancel", route: "/bookings/VT-26-0829", ready: "[data-ops-route-chip]", crop: "[role=dialog]", act: async (page) => {
      await page.locator("button:visible", { hasText: /^actions$/i }).first().click();
      await page.waitForTimeout(300);
      await page.locator("button:visible", { hasText: /^cancel booking$/i }).first().click();
      await page.waitForSelector("text=Keep it", { timeout: 4000 });
    } },
  { screen: "OpsFleet", state: "chauffeur-edit", route: "/fleet/chauffeurs/ch1", ready: "text=Marco Bianchi" },
  { screen: "OpsSupportTicket", state: "ticket-open", route: "/support", ready: "text=Ada Example", act: async (page) => {
      await page.getByText("Ada Example").first().click();
      await page.waitForSelector("text=/Close ticket/i", { timeout: 4000 });
    } },
  { screen: "OpsPricing", state: "publish-dialog", route: "/pricing", ready: "text=/Publish/i", crop: "[role=dialog]", act: async (page) => {
      // At phone width the header pair is folded into the bottom bar (display:none), so the click is dispatched.
      await page.locator("[data-ops-fold] button", { hasText: /^publish/i }).first().dispatchEvent("click");
      await page.waitForSelector("[role=dialog]", { timeout: 6000 });
    } },
  { screen: "OpsPricing", state: "discard-dialog", route: "/pricing", ready: "text=/Publish/i", crop: "[role=dialog]", act: async (page) => {
      await page.locator("[data-ops-fold] button", { hasText: /^discard/i }).first().dispatchEvent("click");
      await page.waitForSelector("[role=dialog]", { timeout: 6000 });
    } },
];

const browser = await chromium.launch({ headless: true, executablePath: process.env.PW_CHROMIUM || undefined });
const skipped = [];

async function shoot(base, label, sc, width) {
  const ctx = await browser.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: 2, reducedMotion: "reduce" });
  const page = await ctx.newPage();
  await page.addInitScript(() => { localStorage.setItem("vamosLang", "en"); localStorage.setItem("vamosOpsAuth", "1"); });
  await page.route("**/api/**", (route) => {
    const req = route.request();
    const a = respond(req.method(), new URL(req.url()).pathname);
    return route.fulfill({ status: a.status, contentType: "application/json", body: JSON.stringify(a.json) });
  });
  try {
    await page.goto(`${base}${sc.route}`, { waitUntil: "load" });
    await page.waitForSelector(sc.ready, { timeout: 15000 });
    await page.waitForTimeout(1500);
    await page.addStyleTag({ content: "*,*::before,*::after{transition:none!important;animation:none!important;caret-color:transparent!important}" });
    if (sc.act) await sc.act(page);
    await page.waitForTimeout(500);
    const file = resolve(out, `u11-${sc.screen}-${sc.state}-${label}-${width}.png`);
    await page.locator(sc.crop || "[data-ops-main]").first().screenshot({ path: file });
    const buttons = await page.evaluate(() => [...document.querySelectorAll(".vt-btn--outline, .vt-btn--ghost")].map((b) => ({ cls: b.className.match(/vt-btn--(outline|ghost)/)[1], bg: getComputedStyle(b).backgroundColor, border: getComputedStyle(b).borderTopColor, text: b.textContent.trim().slice(0, 24) })));
    return buttons;
  } catch (e) {
    skipped.push(`${sc.screen}/${sc.state} ${label} ${width}: ${String(e.message).split("\n")[0].slice(0, 120)}`);
    return null;
  } finally {
    await ctx.close();
  }
}

{
  const { server, base } = await serve(tree);
  for (const sc of SCENARIOS) {
    if (process.env.ONLY && !`${sc.screen}/${sc.state}`.includes(process.env.ONLY)) continue;
    for (const width of [1440, 390]) {
      const b = await shoot(base, labelArg, sc, width);
      if (width === 1440) {
        const outline = b ? b.filter((x) => x.cls === "outline").length : 0;
        const ghost = b ? b.filter((x) => x.cls === "ghost").length : 0;
        console.log(`${labelArg}  ${sc.screen}/${sc.state}: ${b ? `vt-btn--outline x${outline}, vt-btn--ghost x${ghost}` : "NOT PICTURED"}`);
      }
    }
  }
  server.close();
}
await browser.close();
rmSync(scratch, { recursive: true, force: true });
console.log(skipped.length ? `not pictured:\n${skipped.join("\n")}` : "every scenario pictured");
