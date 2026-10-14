import { start, open, signIn, goPricing } from "./lib.mjs";
await start({ evidenceDir: process.argv[2] });
const s = await open({ viewport: 1440, name: "x" });
await signIn(s); await goPricing(s);
await s.page.locator("tr", { has: s.page.locator("[data-class-name]", { hasText: /^Business$/ }) }).locator('button[aria-label="Retire"]').click(); await s.page.waitForTimeout(1000);
console.log(await s.page.evaluate(() => [...document.querySelectorAll('[role=dialog] button')].map(b=>b.textContent.trim()+" <- "+b.parentElement.className+" / "+b.parentElement.parentElement.className+" / "+(b.closest("[data-hide-actions]")?"HA":"-")).join("\n")));
process.exit(0);
