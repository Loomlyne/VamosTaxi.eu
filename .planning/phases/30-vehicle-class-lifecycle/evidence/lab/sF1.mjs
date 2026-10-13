import fs from "node:fs";
import { start, open, signIn, S, DASH, BASE, EV, goPricing } from "./lib.mjs";
await start({ evidenceDir: process.argv[2] });
const vps = process.argv.slice(3).map(Number);
const OUTF = `${EV}/s10-metrics.json`;
const all = fs.existsSync(OUTF) ? JSON.parse(fs.readFileSync(OUTF, "utf8")) : [];
// In-page analysis: colour -> rgb via canvas, yellow / pale-yellow tests, box-shadow parse.
const ANALYSE = () => {
  const cv = document.createElement("canvas"); cv.width = cv.height = 1; const cx = cv.getContext("2d", { willReadFrequently: true });
  const rgba = (c) => { cx.clearRect(0, 0, 1, 1); cx.fillStyle = "#000"; cx.fillStyle = c; cx.fillRect(0, 0, 1, 1); const d = cx.getImageData(0, 0, 1, 1).data; return [d[0], d[1], d[2], d[3] / 255]; };
  const isBrandYellow = (c) => Math.abs(c[0] - 253) <= 3 && Math.abs(c[1] - 194) <= 3 && Math.abs(c[2] - 11) <= 6;
  const isPale = (c) => c[3] > 0.05 && c[0] > 200 && c[1] > 180 && c[2] > 60 && c[2] < Math.min(c[0], c[1]) - 18; // cream / pale yellow: not white-grey, not full yellow
  const colourTokens = (s) => s.match(/(rgba?|oklch|oklab|color|hsla?|lab|lch)\([^)]*\)|#[0-9a-f]{3,8}\b/gi) || [];
  return { rgba, isBrandYellow, isPale, colourTokens };
};
const scan = (page, sel, nth) => page.evaluate(({ sel, nth, an }) => {
  const A = (new Function("return (" + an + ")()"))();
  const root = document.querySelectorAll(sel)[nth ?? 0]; if (!root) return { missing: true };
  const els = [root, ...root.querySelectorAll("*")].slice(0, 60);
  const bad = [], seen = [];
  for (const e of els) {
    const cs = getComputedStyle(e);
    const sh = cs.boxShadow;
    if (sh && sh !== "none") {
      const toks = A.colourTokens(sh).map(A.rgba);
      const yellow = toks.some((c) => A.isBrandYellow(c) && c[3] > 0);
      const blur = (sh.replace(/(rgba?|oklch|oklab|color|hsla?|lab|lch)\([^)]*\)/gi, "").match(/-?[\d.]+px/g) || []).map(parseFloat);
      seen.push({ tag: e.tagName, sh: sh.slice(0, 120) });
      if (yellow) bad.push({ tag: e.tagName, why: "yellow box-shadow", sh: sh.slice(0, 120) });
    }
    for (const prop of ["backgroundColor", "borderTopColor", "borderBottomColor", "borderLeftColor", "borderRightColor", "color"]) {
      const c = A.rgba(cs[prop]);
      if (A.isPale(c) && !(prop.startsWith("border") && parseFloat(cs.borderTopWidth) === 0 && prop !== "backgroundColor")) bad.push({ tag: e.tagName, why: "pale yellow " + prop, c: c.map((x) => Math.round(x * 100) / 100).join(",") });
    }
  }
  return { n: els.length, shadows: seen.slice(0, 6), bad };
}, { sel, nth, an: ANALYSE.toString() });
const tabTo = async (page, sel) => {
  for (let i = 0; i < 120; i++) {
    await page.keyboard.press("Tab");
    if (await page.evaluate((s) => { const a = document.activeElement; return !!(a && a.matches(s)); }, sel)) return true;
  }
  return false;
};
const res = [];
for (const w of vps) {
  const s = await open({ viewport: w, lang: "en", name: `s${w}en` });
  await signIn(s);
  const rows = [];
  const states = async (label, sel, { press = true, nth = 0, release = null } = {}) => {
    const loc = s.page.locator(sel).nth(nth);
    await loc.scrollIntoViewIfNeeded().catch(() => {});
    const base = await scan(s.page, sel, nth); rows.push({ w, el: label, state: "base", ...base });
    await loc.hover({ timeout: 5000 }).catch(() => {}); await s.page.waitForTimeout(250);
    rows.push({ w, el: label, state: "hover", ...(await scan(s.page, sel, nth)) }); await s.shot(`S10-${label}-hover`);
    await s.page.mouse.move(0, 0);
    await s.page.evaluate(() => document.activeElement?.blur?.()); await s.page.keyboard.press("Shift+Tab").catch(() => {});
    await s.page.evaluate(() => { document.body.focus?.(); });
    const focused = await tabTo(s.page, sel); await s.page.waitForTimeout(250);
    rows.push({ w, el: label, state: focused ? "focus(Tab)" : "focus(Tab) NOT REACHED", ...(await scan(s.page, sel, nth)) }); await s.shot(`S10-${label}-focus`);
    if (press) {
      const box = await loc.boundingBox();
      if (box) { await s.page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await s.page.mouse.down(); await s.page.waitForTimeout(250);
        rows.push({ w, el: label, state: "press", ...(await scan(s.page, sel, nth)) }); await s.shot(`S10-${label}-press`);
        if (release) { const rb = await s.page.locator(release).first().boundingBox(); await s.page.mouse.move(rb.x + 4, rb.y + 4); } else await s.page.mouse.move(0, 0); await s.page.mouse.up(); await s.page.waitForTimeout(300); }
    }
  };
  // Pricing: badges, retired head, bring back, retire icon
  await goPricing(s);
  await states("draft-badge", "[data-draft-btn]");
  await states("live-badge", "[data-live-badge]", { press: false });
  await states("retire-icon", 'tr:has([data-live-badge]) button[aria-label="Retire"]');
  await states("retired-head-closed", "[data-retired-head]");
  await s.page.locator("[data-retired-head]").click(); await s.page.waitForTimeout(800);
  await states("retired-head-open", "[data-retired-head]");
  rows.push({ w, el: "retired-list", state: "base", ...(await scan(s.page, "[data-retired]", 0)) }); await s.shot("S10-retired-list");
  await states("bring-back", "[data-retired-row] button");
  // Go live dialog
  await goPricing(s);
  await s.page.locator("[data-draft-btn]").first().click(); await s.page.waitForTimeout(900);
  rows.push({ w, el: "golive-dialog", state: "base", ...(await scan(s.page, '[role="dialog"]', 0)) }); await s.shot("S10-golive-dialog");
  await states("golive-edit-button", '[data-golive] [data-hide-actions] button', { nth: 0, release: '[role="dialog"] .vt-dialog__title' });
  await states("golive-disabled-button", '[data-golive] [data-hide-actions] button', { nth: 1, press: false });
  // Retire dialog
  await goPricing(s);
  await s.page.locator("tr", { has: s.page.locator("[data-class-name]", { hasText: /^Business$/ }) }).locator('button[aria-label="Retire"]').click(); await s.page.waitForTimeout(1000);
  rows.push({ w, el: "retire-dialog", state: "base", ...(await scan(s.page, '[role="dialog"]', 0)) }); await s.shot("S10-retire-dialog");
  await states("retire-cancel", '[role="dialog"] [data-hide-actions] button', { nth: 0, release: '[role="dialog"] .vt-dialog__title' });
  await states("retire-confirm", '[role="dialog"] [data-hide-actions] button', { nth: 1, release: '[role="dialog"] .vt-dialog__title' });
  // Chauffeurs flag
  await s.page.goto(DASH + "/chauffeurs", { waitUntil: "networkidle" }); await s.page.waitForTimeout(1800);
  const flagSel = await s.page.evaluate(() => { const m = [...document.querySelectorAll("tr *")].filter((e) => /Retired class: pick a new one/.test(e.innerText || "")); const e = m.filter((x) => !m.some((o) => o !== x && x.contains(o)))[0]; if (!e) return null; e.setAttribute("data-s10-flag", "1"); return "[data-s10-flag]"; });
  if (flagSel) { rows.push({ w, el: "chauffeur-red-flag", state: "base", ...(await scan(s.page, flagSel, 0)) }); await s.shot("S10-red-flag"); }
  // Left-out line
  await s.page.goto(DASH + "/bookings/VT-26-0001", { waitUntil: "networkidle" }); await s.page.waitForTimeout(2200);
  const lineSel = await s.page.evaluate(() => { const m = [...document.querySelectorAll("*")].filter((e) => /left out: retired class/.test(e.innerText || "")); const e = m.filter((x) => !m.some((o) => o !== x && x.contains(o)))[0]; if (!e) return null; e.setAttribute("data-s10-line", "1"); return "[data-s10-line]"; });
  if (lineSel) { rows.push({ w, el: "left-out-line", state: "base", ...(await scan(s.page, lineSel, 0)) }); await s.shot("S10-left-out-line"); }
  res.push(...rows);
  await s.ctx.close();
  console.log("done", w);
}
const merged = [...all.filter((o) => !vps.includes(o.w)), ...res];
fs.writeFileSync(OUTF, JSON.stringify(merged, null, 1));
process.exit(0);
