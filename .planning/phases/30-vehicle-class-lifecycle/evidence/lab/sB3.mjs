import { start, open, goPricing, signIn, dlgText, S, db } from "./lib.mjs";
await start({ evidenceDir: process.argv[2] });
const s = await open({ viewport: 1440, name: "s1440" });
await signIn(s);
await goPricing(s);
await S("S5", "Open Retired classes list", async () => {
  const head = s.page.locator("[data-retired-head]");
  const chevron = async () => head.evaluate((e) => [...e.querySelectorAll("[aria-hidden]")].map((i) => (getComputedStyle(i).maskImage || "").replace(/.*icons\//, "").replace(/["')]/g, "")).join(","));
  const c0 = await chevron(), exp0 = await head.getAttribute("aria-expanded");
  await head.click(); await s.page.waitForTimeout(1000);
  const c1 = await chevron(), exp1 = await head.getAttribute("aria-expanded");
  const rows = await s.page.evaluate(() => [...document.querySelectorAll("[data-retired-row]")].map((r) => ({ t: r.innerText.replace(/\s+/g, " ").trim(), btn: [...r.querySelectorAll("button")].map((b) => b.innerText.trim()).join("/") })));
  await s.shot("S5-retired-open");
  const ok = rows.length === 2 && rows.some((r) => r.t.includes("Lab old class") && r.t.includes("Lab: retired before the run") && /bring back/i.test(r.btn)) && rows.some((r) => r.t.includes("Lab Draft Class") && r.t.includes("No longer offered") && /bring back/i.test(r.btn)) && /up/.test(c1);
  return { s, ok, evidence: `chevron closed ${c0} (expanded ${exp0}) -> open ${c1} (expanded ${exp1}); rows ${JSON.stringify(rows)}` };
}, { s });
process.exit(0);
