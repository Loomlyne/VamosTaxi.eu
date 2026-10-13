import { start, open, signIn, S, DASH, BASE, goPricing } from "./lib.mjs";
await start({ evidenceDir: process.argv[2] });
const s = await open({ viewport: 1440, name: "s1440" });
await signIn(s);
await S("S11", "dashboard /chauffeurs vs public /chauffeurs", async () => {
  const r = await s.ctx.request.get(DASH + "/chauffeurs", { maxRedirects: 0 });
  await s.page.goto(DASH + "/chauffeurs", { waitUntil: "networkidle" }); await s.page.waitForTimeout(1500);
  const dashTxt = await s.page.evaluate(() => document.body.innerText.replace(/\s+/g, " ").slice(0, 160));
  const dashOk = r.status() === 200 && /Chauffeurs/.test(dashTxt) && /Lab Old Driver/.test(await s.page.evaluate(() => document.body.innerText));
  const pub = await s.ctx.request.get(BASE + "/chauffeurs", { maxRedirects: 0 });
  await s.page.goto(BASE + "/chauffeurs", { waitUntil: "networkidle" }); await s.page.waitForTimeout(1200);
  const pubTxt = await s.page.evaluate(() => document.body.innerText.replace(/\s+/g, " ").slice(0, 200));
  await s.shot("S11-public");
  const notDash = pub.status() === 404 && !/Lab Old Driver|Who drives/.test(pubTxt);
  return { s, ok: dashOk && notDash, evidence: `dashboard /chauffeurs ${r.status()}, text "${dashTxt}"; public /chauffeurs ${pub.status()}, text "${pubTxt}"` };
}, { s });
// S9 extra: badge clipping at 390 (precise)
const m = await open({ viewport: 390, name: "s390en" });
await signIn(m); await goPricing(m);
const clip = await m.page.evaluate(() => [...document.querySelectorAll("tr")].filter((r) => r.querySelector("[data-class-name]")).map((r) => { const n = r.querySelector("[data-class-name]").getBoundingClientRect(); const b = (r.querySelector("[data-draft-btn] .vt-badge") || r.querySelector("[data-live-badge] .vt-badge")); const br = b.getBoundingClientRect(); const cell = r.querySelector("[data-class-cell]").getBoundingClientRect(); const td = r.querySelector("[data-class-cell]").closest("td").getBoundingClientRect(); return { name: r.querySelector("[data-class-name]").innerText, badge: b.innerText, wrapsUnder: br.top >= n.bottom - 1, inCell: br.left >= cell.left - 1 && br.right <= cell.right + 1, inTd: br.left >= td.left - 1 && br.right <= td.right + 1, bw: Math.round(br.width), bh: Math.round(br.height), textFits: b.scrollWidth <= b.clientWidth + 1 }; }));
console.log(JSON.stringify(clip));
process.exit(0);
