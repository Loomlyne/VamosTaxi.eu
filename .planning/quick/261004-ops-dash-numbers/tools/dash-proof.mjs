// 261004 ops-dash-numbers: read every dashboard tile per period on the lab's local Worker.
// Usage: eval "$(scripts/test-lab/lab.sh env <name>)" && node .planning/quick/261004-ops-dash-numbers/tools/dash-proof.mjs <label>
// Writes <label>-read.json and screenshots (en 1440, ar 390) into ../screens/. Lab only, never live.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { start, open, dashboardSignIn, DASH, coverage } from "../../../../scripts/test-lab/lab-browser.mjs";

const label = process.argv[2] || "run";
const here = path.dirname(fileURLToPath(import.meta.url));
const screens = path.join(here, "..", "screens");
fs.mkdirSync(screens, { recursive: true });
await start({ evidenceDir: path.join(here, "..", "evidence", label) });

const PERIODS = [["today", "Today"], ["week", "7 days"], ["month", "30 days"], ["all", "All time"]];

async function readScreen(page) {
  return page.evaluate(() => {
    const main = document.querySelector("main");
    const ops = window.VamosOps;
    return {
      text: main ? main.innerText : "",
      storeBookings: ops ? ops.bookings.all().length : -1,
      storeChauffeurs: ops ? ops.chauffeurs.all().length : -1,
    };
  });
}

function dashCalls(s) {
  return s.apiLog.filter((l) => l.path.startsWith("/api/staff/dashboard") || l.path === "/api/staff/bookings" || l.path === "/api/staff/chauffeurs")
    .map((l) => ({ at: l.at, path: l.path, status: l.status, body: l.path.startsWith("/api/staff/dashboard") ? l.response : l.response.slice(0, 80) }));
}

const out = { label, at: new Date().toISOString(), runs: [] };

// en 1440: every period through the pills.
{
  const s = await open({ viewport: 1440, lang: "en", name: `${label}-en-1440` });
  await dashboardSignIn(s);
  await s.page.goto(DASH + "/dashboard", { waitUntil: "domcontentloaded" });
  // What the screen shows before the stores fill, then once the network is quiet.
  await s.page.waitForSelector("main h1", { timeout: 20000 });
  const early = await readScreen(s.page);
  await s.page.waitForLoadState("networkidle");
  await s.page.waitForTimeout(1500);
  out.runs.push({ view: "en-1440", period: "first-paint", ...early });
  for (const [key, name] of PERIODS) {
    if (key !== "today") {
      await s.page.locator("[data-period-pills] >> text=" + name).first().click();
      await s.page.waitForTimeout(2500);
    }
    const r = await readScreen(s.page);
    out.runs.push({ view: "en-1440", period: key, ...r });
    if (key === "today" || key === "all") {
      await s.page.screenshot({ path: path.join(screens, `${label}-en-1440-${key}.png`), fullPage: true });
    }
  }
  out.calls = dashCalls(s);
  out.errors = s.errors;
  out.coverageEn = await coverage(s.page, "main").catch((e) => ({ error: String(e) }));
  await s.ctx.close();
}

// ar 390: default period (Today) and All time through the select.
{
  // Sign in in English (the helper presses "Sign in"), then switch the page to Arabic in place.
  const s = await open({ viewport: 390, lang: "en", name: `${label}-ar-390` });
  await dashboardSignIn(s);
  await s.page.goto(DASH + "/dashboard", { waitUntil: "networkidle" });
  await s.page.evaluate(() => window.VamosLocale.setLang("ar"));
  await s.page.waitForTimeout(2000);
  const r = await readScreen(s.page);
  out.runs.push({ view: "ar-390", period: "today", ...r });
  out.scrollX390 = await s.page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  out.dirAr = await s.page.evaluate(() => document.documentElement.getAttribute("dir"));
  await s.page.screenshot({ path: path.join(screens, `${label}-ar-390-today.png`), fullPage: true });
  out.errorsAr = s.errors;
  await s.ctx.close();
}

fs.writeFileSync(path.join(here, "..", "evidence", `${label}-read.json`), JSON.stringify(out, null, 1));
for (const r of out.runs) {
  console.log(`== ${r.view} ${r.period} store bookings=${r.storeBookings} chauffeurs=${r.storeChauffeurs}`);
  console.log(r.text.replace(/\n+/g, " | ").slice(0, 900));
}
console.log("calls", JSON.stringify(out.calls.filter((c) => c.path.startsWith("/api/staff/dashboard"))));
console.log("errors", JSON.stringify(out.errors), JSON.stringify(out.errorsAr), "scrollX390", out.scrollX390, "dir", out.dirAr);
console.log("coverage en", JSON.stringify(out.coverageEn).slice(0, 400));
process.exit(0);
