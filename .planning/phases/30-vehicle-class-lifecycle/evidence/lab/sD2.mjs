import { start, open, signIn, S, db, DASH } from "./lib.mjs";
await start({ evidenceDir: process.argv[2] });
const s = await open({ viewport: 1440, name: "s1440" });
await signIn(s);
await S("S16", "Move the lab-old trip one day later", async () => {
  const q = "select scheduled_at from public.booking_legs where booking_id = (select id from public.bookings where contact_email = 'p30-old@example.test')";
  const before = db(q);
  const calls = [];
  s.page.on("response", async (r) => { if (/\/api\/staff\/bookings/.test(r.url()) && r.request().method() !== "GET") calls.push(`${r.request().method()} ${r.url().replace(/^.*\/api/, "/api")} ${r.status()} ${(await r.text()).slice(0, 250)}`); });
  await s.page.goto(DASH + "/bookings/VT-26-0001", { waitUntil: "networkidle" }); await s.page.waitForTimeout(2000);
  await s.page.getByRole("button", { name: /^actions$/i }).click(); await s.page.waitForTimeout(600);
  await s.page.getByRole("menuitem", { name: /edit booking/i }).first().click(); await s.page.waitForTimeout(1500);
  const date = s.page.locator('input[value="2026-10-19"]');
  await date.fill("2026-10-20"); await s.page.waitForTimeout(400);
  await s.page.getByRole("button", { name: /^continue$/i }).click(); await s.page.waitForTimeout(4000);
  const afterFirst = await s.page.evaluate(() => ({ btns: [...document.querySelectorAll("button")].map((b) => b.textContent.trim()).filter(Boolean).slice(-6), err: [...document.querySelectorAll("[role=alert], p")].map((p) => p.innerText).filter((x) => /cannot|not offered|refus/i.test(x)) }));
  await s.shot("S16-after-continue-1");
  const second = s.page.getByRole("button", { name: /^(continue|save changes|confirm.*)$/i });
  const secondN = await second.count();
  if (secondN) { await second.first().click(); await s.page.waitForTimeout(4000); }
  let txt = await s.page.evaluate(() => document.body.innerText.replace(/\s+/g, " "));
  const refused = /This class is not offered for this trip\./.test(txt);
  await s.shot("S16-after-save");
  const after = db(q);
  const idx = txt.indexOf("This class is not offered");
  return { s, ok: refused && before === after, evidence: `after first Continue: ${JSON.stringify(afterFirst)}; second button clicked: ${secondN}; refusal text shown: ${refused} ("${idx >= 0 ? txt.slice(idx, idx + 50) : ""}"); scheduled_at before ${before} after ${after}; calls ${JSON.stringify(calls)}; page after save: ${txt.slice(txt.indexOf("TRIP") , txt.indexOf("TRIP") + 160)}` };
}, { s });
process.exit(0);
