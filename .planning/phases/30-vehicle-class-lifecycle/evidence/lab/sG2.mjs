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
  await s.page.goto(BASE + "/chauffeurs", { waitUntil: "domcontentloaded", timeout: 20000 }); await s.page.waitForTimeout(2500);
  const pubTxt = await s.page.evaluate(() => document.body.innerText.replace(/\s+/g, " ").slice(0, 200));
  await s.shot("S11-public");
  const notDash = pub.status() === 404 && !/Lab Old Driver|Who drives/.test(pubTxt);
  return { s, ok: dashOk && notDash, evidence: `dashboard /chauffeurs ${r.status()}, text "${dashTxt}"; public /chauffeurs ${pub.status()}, text "${pubTxt}"` };
}, { s });
process.exit(0);
