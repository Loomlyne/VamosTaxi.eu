import { start, finish, open, bookFromHome, chooseClass, fillTraveller, applyVoucher, pressPay, coverage, BASE, DASH, fakes, db, step, money, dashboardSignIn } from "/Users/koss/Developer/VamosTaxi.eu/.claude/worktrees/test-lab/scripts/test-lab/lab-browser.mjs";
await start({ evidenceDir: process.argv[2] });
const payLabel = async (s) => (await s.page.getByRole("button", { name: /^\s*pay\b/i }).first().innerText().catch(() => "")).replace(/\s+/g, " ");
const t = await open({ viewport: 768, name: "t768" });
let first, second;
await step("T1", "home to /checkout at 768", async () => {
  await bookFromHome(t);
  const n = await t.page.locator("[data-co-class]").count();
  return { s: t, ok: new URL(t.page.url()).pathname === "/checkout" && n >= 1, evidence: `${new URL(t.page.url()).pathname}; ${n} classes` };
}, { shot: true });
await step("T2", "Economy, traveller, voucher LABPCT", async () => {
  await chooseClass(t, /Economy/i); await fillTraveller(t);
  const l1 = await payLabel(t); first = money(l1);
  await applyVoucher(t, "LABPCT");
  const l2 = await payLabel(t); second = money(l2);
  return { s: t, ok: second > 0 && second < first, evidence: `PAY "${l1}" -> "${l2}"` };
}, { shot: true });
await step("T3", "PAY: intent 200, one new session, amount", async () => {
  const n0 = (await fakes("/__sessions")).length;
  const intent = await pressPay(t); const all = await fakes("/__sessions");
  const got = all[all.length - 1]?.amount_total;
  return { s: t, ok: intent?.status === 200 && all.length === n0 + 1 && got === Math.round(second * 100), evidence: `intent ${intent?.status}; sessions ${n0}->${all.length}; amount_total ${got}; second PAY ${second} (x100=${Math.round(second*100)})` };
}, { shot: true });
await t.ctx.close();
const a = await open({ viewport: 390, lang: "ar", name: "ar390" });
await step("T4", "Arabic home at 390", async () => {
  await a.page.goto(BASE + "/", { waitUntil: "networkidle" });
  await a.page.waitForTimeout(1500);
  const dir = await a.page.evaluate(() => document.documentElement.dir);
  const c = await coverage(a.page, "#book");
  const w = await a.page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
  await a.page.screenshot({ path: `${process.argv[2]}/T4.png` });
  return { s: a, ok: dir === "rtl" && c.count === 0 && w[0] <= w[1], evidence: `dir ${dir}; coverage ${c.count} ${JSON.stringify(c.strings).slice(0,150)}; scrollWidth ${w[0]} innerWidth ${w[1]}` };
});
await a.ctx.close();
const d = await open({ viewport: 1440, name: "dash1440" });
await step("T5", "dashboard sign-in", async () => {
  await dashboardSignIn(d);
  await d.page.waitForTimeout(1500);
  const p = new URL(d.page.url()).pathname;
  await d.page.screenshot({ path: `${process.argv[2]}/T5.png` });
  return { s: d, ok: p.startsWith("/dashboard"), evidence: `path ${p}` };
});
await d.ctx.close();
await step("T6", "bookings in last 30 minutes", async () => {
  const n = Number(db("select count(*) from bookings where created_at > now() - interval '30 minutes'"));
  return { ok: n >= 1, evidence: `count ${n}` };
});
await finish();
