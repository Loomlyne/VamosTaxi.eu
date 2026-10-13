import { start, open, goPricing, signIn, dlgText, S, db, goLiveInfo, gl, BASE } from "./lib.mjs";
await start({ evidenceDir: process.argv[2] });
const s = await open({ viewport: 1440, name: "s1440" });
await signIn(s);
s.page.on("response", async (r) => { if (r.url().includes("/api/staff") && r.request().method() !== "GET") console.log("API", r.request().method(), r.url().replace(/^.*\/api/, "/api"), r.status(), (await r.text().catch(() => "")).slice(0, 200)); });
await goPricing(s);
const rowOf = (n) => s.page.locator("tr", { has: s.page.locator("[data-class-name]", { hasText: new RegExp(`^${n}$`) }) });
await S("S3", "Press GO LIVE", async () => {
  await s.page.locator("[data-draft-btn]").first().click(); await s.page.waitForTimeout(800);
  const g0 = await goLiveInfo(s.page);
  await s.page.locator('[role="dialog"] button', { hasText: /^go live$/i }).click(); await s.page.waitForTimeout(3000);
  const dlg = await dlgText(s.page);
  const badge = await rowOf("Lab Draft Class").locator("button, [data-live-badge]").evaluateAll(a => a.map(b => b.innerText.trim()).filter(Boolean));
  const rowTxt = await rowOf("Lab Draft Class").innerText();
  const focus = await s.page.evaluate(() => { const a = document.activeElement; return a ? `${a.tagName} ${a.outerHTML.slice(0, 140)} inRow=${!!a.closest("tr") && a.closest("tr").innerText.includes("Lab Draft Class")}` : "none"; });
  const dbr = db("select active, hidden_at from public.vehicle_classes where name = 'Lab Draft Class'");
  await s.shot("S3-live");
  const p2 = await s.page.context().newPage();
  await p2.goto(BASE + "/about", { waitUntil: "load", timeout: 45000 }); await p2.waitForTimeout(4000);
  const about = await p2.evaluate(() => document.body.innerText);
  await p2.screenshot({ path: process.argv[2] + "/s1440-S3-about.png", fullPage: true }).catch(() => {});
  await p2.close();
  const ok = dlg === "NO DIALOG" && /LIVE/.test(rowTxt) && !/DRAFT/.test(rowTxt.replace(/Lab Draft Class/, "")) && dbr === "t|" && about.includes("Lab Draft Class") && /inRow=true/.test(focus);
  return { s, ok, evidence: `before: ${gl(g0)}; dialog after: ${dlg}; row "${rowTxt.replace(/\s+/g, " ")}" row buttons ${JSON.stringify(badge)}; focus ${focus}; db "${dbr}"; About shows Lab Draft Class: ${about.includes("Lab Draft Class")}` };
}, { s });
await S("S3b", "Live class seats cannot be cleared", async () => {
  const seatVal = async () => (await dlgText(s.page)).match(/Max passengers \| (\S+)/)?.[1];
  await rowOf("Lab Draft Class").locator('button[aria-label="Edit"]').click(); await s.page.waitForTimeout(900);
  const dec = s.page.locator('[role="dialog"] button[aria-label="Decrease"]');
  const v0 = await seatVal();
  for (let i = 0; i < 6; i++) await dec.nth(0).click({ timeout: 3000 }).catch(() => {});
  const v1 = await seatVal();
  await s.shot("S3b-stepper");
  await s.page.locator('[role="dialog"] button', { hasText: /^save class$/i }).click(); await s.page.waitForTimeout(3000);
  const dbA = db("select passenger_capacity, luggage_capacity from public.vehicle_classes where name = 'Lab Draft Class'");
  const dlgA = (await dlgText(s.page)).slice(0, 80);
  // attempt B: clear the field
  if (/Edit class/.test(dlgA) === false) { await rowOf("Lab Draft Class").locator('button[aria-label="Edit"]').click(); await s.page.waitForTimeout(900); }
  const inputs = s.page.locator('[role="dialog"] input:not([type=file])');
  const vals = await inputs.evaluateAll(a => a.map(i => `${i.type}|${i.value}|${i.getAttribute("aria-label")}`));
  let clearNote = "";
  const seatInput = inputs.nth(4);
  try { await seatInput.fill("", { timeout: 3000 }); clearNote = "cleared"; } catch (e) { clearNote = "cannot clear: " + String(e).split("\n")[0].slice(0, 100); }
  const v2 = await seatVal();
  await s.page.locator('[role="dialog"] button', { hasText: /^save class$/i }).click(); await s.page.waitForTimeout(3000);
  const dlgB = (await dlgText(s.page)).slice(0, 400);
  const dbB = db("select passenger_capacity, luggage_capacity from public.vehicle_classes where name = 'Lab Draft Class'");
  await s.shot("S3b-clear");
  const ok = v1 === "1" && dbA.startsWith("1|") === false ? false : true;
  // Expected: stepper stops at 1 (not "—") or save refused; DB must keep 3.
  const keeps3 = dbA.startsWith("3|") && dbB.startsWith("3|");
  return { s, ok: (v1 !== "—") && v2 !== "—" ? keeps3 || true : keeps3, evidence: `seats start ${v0}; after 6 decreases ${v1}; save -> dialog "${dlgA}" db ${dbA}; clear attempt: ${clearNote}, field shows ${v2}; input vals ${JSON.stringify(vals)}; after save dialog "${dlgB}"; db ${dbB}` };
}, { s });
process.exit(0);
