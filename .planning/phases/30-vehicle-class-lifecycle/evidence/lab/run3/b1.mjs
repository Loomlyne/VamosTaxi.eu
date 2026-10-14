import { start, open, goPricing, signIn, dlgText, S, db, goLiveInfo, gl, BASE } from "./lib.mjs";
await start({ evidenceDir: process.argv[2] });
const s = await open({ viewport: 1440, name: "s1440" });
await signIn(s);
s.page.on("response", async (r) => { if (r.url().includes("/api/staff") && r.request().method() !== "GET") console.log("API", r.request().method(), r.url().replace(/^.*\/api/, "/api"), r.status(), (await r.text().catch(() => "")).slice(0, 300)); });
// S1 supplement: About in browser, read-only
{
  const p2 = await s.page.context().newPage();
  try { await p2.goto(BASE + "/about", { waitUntil: "load", timeout: 45000 }); await p2.waitForTimeout(4000);
    const t = await p2.evaluate(() => document.body.innerText);
    console.log("S1 supplement: About loaded, length", t.length, "names Lab Draft Class:", t.includes("Lab Draft Class"), "| has Economy:", t.includes("Economy"));
  } catch (e) { console.log("S1 supplement About error", String(e).split("\n")[0]); }
  await p2.close();
}
await goPricing(s);
await S("S12", "bags 3, discard seed draft, edit Economy, Publish", async () => {
  const badgeBtn = () => s.page.locator("[data-draft-btn]").first();
  await badgeBtn().click(); await s.page.waitForTimeout(700);
  await s.page.locator('[role="dialog"] button', { hasText: /^edit class$/i }).click(); await s.page.waitForTimeout(900);
  const inc = s.page.locator('[role="dialog"] button[aria-label="Increase"]');
  await inc.nth(1).click(); await inc.nth(1).click(); await inc.nth(1).click();
  await s.page.locator('[role="dialog"] button', { hasText: /^save class$/i }).click(); await s.page.waitForTimeout(3000);
  await badgeBtn().click(); await s.page.waitForTimeout(800);
  const g = await goLiveInfo(s.page);
  console.log("after bags save (same page):", gl(g));
  await s.page.keyboard.press("Escape"); await s.page.waitForTimeout(500);
  console.log("bags db:", db("select passenger_capacity, luggage_capacity from public.vehicle_classes where name='Lab Draft Class'"));
  console.log("rate_versions before:", db("select id,status,label from public.rate_versions order by id").replace(/\n/g, " ; "));
  await s.page.getByRole("button", { name: /discard draft/i }).first().click(); await s.page.waitForTimeout(800);
  await s.page.locator('[role="dialog"] button', { hasText: /^discard draft$/i }).click(); await s.page.waitForTimeout(3000);
  console.log("after discard:", db("select id,status,label from public.rate_versions order by id").replace(/\n/g, " ; "));
  const tr = s.page.locator("tr", { has: s.page.locator("[data-class-name]", { hasText: /^Economy$/ }) });
  await tr.locator('button[aria-label="Edit"]').click(); await s.page.waitForTimeout(900);
  const inputs = s.page.locator('[role="dialog"] input:not([type=file])');
  console.log("editor inputs", await inputs.count(), (await dlgText(s.page)).slice(0, 300));
  await inputs.nth(1).fill("0.01", { timeout: 5000 }); await s.page.waitForTimeout(300);
  await s.page.locator('[role="dialog"] button', { hasText: /^save class$/i }).click(); await s.page.waitForTimeout(3000);
  console.log("after economy save:", db("select id,status,label from public.rate_versions order by id").replace(/\n/g, " ; "));
  await s.shot("S12-after-edit");
  await s.page.getByRole("button", { name: /publish fare book/i }).first().click(); await s.page.waitForTimeout(1500);
  console.log("publish dialog:", await dlgText(s.page));
  console.log("dlg buttons:", await s.page.locator('[role="dialog"] button').allInnerTexts());
  await s.shot("S12-publish-dialog");
  return { s, ok: false, blocked: true, evidence: "intermediate" };
}, { s });
process.exit(0);
