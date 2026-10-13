import { start, open, goPricing, signIn, S, db, goLiveInfo, gl, saveResults } from "./lib.mjs";
await start({ evidenceDir: process.argv[2] });
const s = await open({ viewport: 1440, name: "s1440" });
await signIn(s);
await goPricing(s);
await S("S2", "Click DRAFT badge", async () => {
  const rowHtml = await s.page.evaluate(() => { const r = [...document.querySelectorAll("tr")].find(r => r.innerText.includes("Lab Draft Class")); return r ? [...r.querySelectorAll("[data-draft-btn], [data-live-badge], button")].map(b => `${b.tagName}[${[...b.attributes].map(a=>a.name+"="+a.value).join(" ").slice(0,80)}]"${b.innerText.trim()}"`).join(" ; ") : "NO ROW"; });
  console.log("ROW:", rowHtml);
  const badge = await s.page.locator("[data-draft-btn]").first().innerText();
  await s.page.locator("[data-draft-btn]").first().click();
  await s.page.waitForTimeout(800);
  const o = await goLiveInfo(s.page);
  const ok = o.title === "Before this class goes live" && o.items.length === 4 && o.items.every(i => i.includes("=missing(") && !/\(\)$/.test(i)) && o.why === "Add a photo first" && o.whyDirectlyAboveButtons && o.btns.join().toLowerCase() === "edit class:enabled,go live:disabled";
  await s.shot("S2-dialog");
  return { s, ok, evidence: `badge "${badge}"; ` + gl(o) };
}, { s });
process.exit(0);
