#!/usr/bin/env node
// U11 pictures (NOT committed as a fix): the design-system Button has no `outline` variant, so every
// <Button variant="outline"> renders as bare text. Each screen is shot twice, from the same stubs:
//   before  the screens as they are on this branch (variant="outline")
//   after   a scratch copy of the public tree in which every Button (not IconButton, whose `outline` exists)
//           says variant="ghost" instead. Nothing in app/ is changed by this script.
//
//   [ONLY=<screen/state substring>] node u11.mjs <public tree> <scratch dir> <out dir>
//
// Pictures: u11-<screen>-<state>-<before|after>-<w>.png, English, 1440 and 390 wide, bare crop of the console's
// main column. A scenario that cannot reach its state says so and is listed at the end.
import { cpSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import { serve } from "./serve.mjs";
import { answer, stubRows, MONEY_AFTER } from "./fixtures.mjs";

const require = createRequire(new URL("../../../../apps/web/package.json", import.meta.url));
const { chromium } = require("@playwright/test");
const [, , treeArg, scratchArg, outArg] = process.argv;
const tree = resolve(treeArg);
const scratch = mkdtempSync(join(resolve(scratchArg), "u11-"));
const out = resolve(outArg);
mkdirSync(out, { recursive: true });

// The "after" tree.
const ghost = join(scratch, "ghost-public");
cpSync(tree, ghost, { recursive: true });
let swapped = 0;
for (const f of readdirSync(join(ghost, "app/ops")).filter((n) => n.endsWith(".dc.html"))) {
  const p = join(ghost, "app/ops", f);
  const src = readFileSync(p, "utf8");
  let next = src.replace(/(VamosTaxiDesignSystem_245af1\.Button"[^>\n]*?)variant="outline"/g, (_m, head) => { swapped += 1; return `${head}variant="ghost"`; });
  // OpsCalendarBoard picks the Button variant of its Kanban / Table switch in code: '' (primary) when active, else 'outline'.
  next = next.replace(/(kanbanVariant: view === 'kanban' \? '' : |tableVariant: view === 'table' \? '' : )'outline'/g, (_m, head) => { swapped += 1; return `${head}'ghost'`; });
  if (next !== src) writeFileSync(p, next);
}
console.log(`ghost tree: ${swapped} Button(s) switched outline -> ghost (IconButton left alone)`);

const rows = await stubRows(resolve(new URL("../../../../", import.meta.url).pathname), scratch);
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

const browser = await chromium.launch({ headless: true });
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

for (const [label, root] of [["before", tree], ["after", ghost]]) {
  const { server, base } = await serve(root);
  for (const sc of SCENARIOS) {
    if (process.env.ONLY && !`${sc.screen}/${sc.state}`.includes(process.env.ONLY)) continue;
    for (const width of [1440, 390]) {
      const b = await shoot(base, label, sc, width);
      if (width === 1440) console.log(`${label}  ${sc.screen}/${sc.state}: ${b ? JSON.stringify(b.slice(0, 6)) : "NOT PICTURED"}`);
    }
  }
  server.close();
}
await browser.close();
rmSync(scratch, { recursive: true, force: true });
console.log(skipped.length ? `not pictured:\n${skipped.join("\n")}` : "every scenario pictured");
