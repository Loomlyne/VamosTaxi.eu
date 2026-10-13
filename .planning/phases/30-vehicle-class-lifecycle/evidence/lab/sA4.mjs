import { start, open, goPricing, signIn, dlgText, S, db, goLiveInfo, gl, dbg } from "./lib.mjs";
await start({ evidenceDir: process.argv[2] });
const s = await open({ viewport: 1440, name: "s1440" });
await signIn(s);
await goPricing(s);
// bags 3
await s.page.locator("[data-draft-btn]").first().click(); await s.page.waitForTimeout(700);
await s.page.locator('[role="dialog"] button', { hasText: /^edit class$/i }).click(); await s.page.waitForTimeout(900);
const inc = s.page.locator('[role="dialog"] button[aria-label="Increase"]');
await inc.nth(1).click(); await inc.nth(1).click(); await inc.nth(1).click();
console.log("editor", await dlgText(s.page));
await s.page.locator('[role="dialog"] button', { hasText: /^save class$/i }).click(); await s.page.waitForTimeout(3000);
console.log(db("select passenger_capacity, luggage_capacity, active from public.vehicle_classes where name = 'Lab Draft Class'"));
// discard the seed draft
console.log(db("select id,status,label from public.rate_versions order by id"));
await s.page.getByRole("button", { name: /discard draft/i }).first().click(); await s.page.waitForTimeout(800);
console.log(await dlgText(s.page));
process.exit(0);
