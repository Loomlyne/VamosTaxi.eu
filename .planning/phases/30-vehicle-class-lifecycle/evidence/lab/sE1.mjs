import fs from "node:fs";
import { start, open, signIn, coverage, db, DASH, BASE, EV } from "./lib.mjs";
await start({ evidenceDir: process.argv[2] });
const widths = process.argv.slice(3).map(Number);
const langs = ["en", "de", "fr", "ar"];
const out = [];
const OUTF = `${EV}/s9-metrics.json`;
const old = fs.existsSync(OUTF) ? JSON.parse(fs.readFileSync(OUTF, "utf8")) : [];
const metrics = (page) => page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth, dir: document.documentElement.dir, lang: document.documentElement.lang }));
for (const w of widths) for (const lang of langs) {
  const s = await open({ viewport: w, lang, name: `s${w}${lang}` });
  await signIn(s);
  const rec = async (view, extra = {}) => {
    const m = await metrics(s.page);
    let cov = null; try { cov = await coverage(s.page); } catch (e) { cov = { error: String(e).slice(0, 80) }; }
    let dcov = null; if (extra.dlg) { try { const c = await coverage(s.page, '[role="dialog"]'); dcov = { count: c.count, strings: c.strings.slice(0, 5) }; } catch (e) { dcov = { error: String(e).slice(0, 60) }; } }
    await s.shot(`S9-${view}`);
    out.push({ w, lang, view, sw: m.sw, iw: m.iw, noSideways: m.sw <= m.iw, dir: m.dir, covCount: cov?.count ?? null, covStrings: cov?.strings?.slice?.(0, 5) ?? cov?.error, dcov, ...extra });
  };
  const pricing = async () => { await s.page.goto(DASH + "/pricing", { waitUntil: "networkidle" }); await s.page.waitForTimeout(1500); await s.page.locator("button[data-set-item]").nth(1).click(); await s.page.waitForTimeout(1000); };
  try {
    await pricing();
    const badge = await s.page.evaluate(() => { const row = [...document.querySelectorAll("tr")].find((r) => r.querySelector("[data-draft-btn]")); const n = row?.querySelector("[data-class-name]"), b = row?.querySelector("[data-draft-btn]"); if (!n || !b) return null; const a = n.getBoundingClientRect(), c = b.getBoundingClientRect(), cell = n.parentElement.getBoundingClientRect(); const live = [...document.querySelectorAll("[data-live-badge]")][0].getBoundingClientRect(); return { badgeBelowName: c.top >= a.bottom - 1, sameLine: Math.abs(c.top - a.top) < 6, badgeInsideCell: c.left >= cell.left - 1 && c.right <= cell.right + 1, clippedText: b.scrollWidth > b.clientWidth + 1, nameBidi: getComputedStyle(n).unicodeBidi, liveBadgeW: Math.round(live.width) }; });
    await rec("pricing-table", { badge });
    await s.page.locator("[data-draft-btn]").first().click(); await s.page.waitForTimeout(900);
    const dlg = async () => s.page.evaluate(() => { const d = document.querySelector('[role="dialog"]'); if (!d) return null; const r = d.getBoundingClientRect(); const cs = getComputedStyle(d); return { fits: r.top >= 0 && r.bottom <= innerHeight + 1 && r.left >= 0 && r.right <= innerWidth + 1, scrollsInside: d.scrollHeight > d.clientHeight && /auto|scroll/.test(cs.overflowY), r: [Math.round(r.left), Math.round(r.top), Math.round(r.right), Math.round(r.bottom)] }; });
    await rec("pricing-golive", { dlg: await dlg() });
    await pricing();
    await s.page.locator("tr", { has: s.page.locator("[data-class-name]", { hasText: /^Business$/ }) }).locator("button").last().click(); await s.page.waitForTimeout(1200);
    await rec("pricing-retire", { dlg: await dlg() });
    await pricing();
    await s.page.locator("[data-retired-head]").click(); await s.page.waitForTimeout(900);
    await s.page.locator("[data-retired-head]").scrollIntoViewIfNeeded();
    await rec("pricing-retired-open");
    await s.page.goto(DASH + "/chauffeurs", { waitUntil: "networkidle" }); await s.page.waitForTimeout(2000);
    const ch = await s.page.evaluate(() => { const r = [...document.querySelectorAll("tr")].find((x) => /Lab Old Driver/.test(x.innerText)); const cells = r ? [...r.querySelectorAll("td")].map((td) => ({ t: td.innerText.replace(/\s+/g, " ").trim().slice(0, 40), dir: getComputedStyle(td).direction, bidi: getComputedStyle(td).unicodeBidi })) : null; return cells; });
    await rec("chauffeurs", { cells: ch });
    await s.page.goto(DASH + "/bookings/VT-26-0001", { waitUntil: "networkidle" }); await s.page.waitForTimeout(2500);
    const bd = await s.page.evaluate(() => { const ref = [...document.querySelectorAll("*")].filter((e) => e.children.length === 0 && /^VT-26-0001$/.test(e.textContent.trim()))[0]; return ref ? { dir: getComputedStyle(ref).direction, bidi: getComputedStyle(ref).unicodeBidi, cls: ref.className.toString().slice(0, 60) } : null; });
    await rec("booking-detail", { ref: bd });
    await s.page.goto(BASE + "/about", { waitUntil: "networkidle" }); await s.page.waitForTimeout(2000);
    await rec("about");
  } catch (e) { out.push({ w, lang, error: String(e).slice(0, 300) }); }
  await s.ctx.close();
  console.log(`done ${w} ${lang}`);
}
const merged = [...old.filter((o) => !out.some((n) => n.w === o.w && n.lang === o.lang)), ...out];
fs.writeFileSync(OUTF, JSON.stringify(merged, null, 1));
process.exit(0);
