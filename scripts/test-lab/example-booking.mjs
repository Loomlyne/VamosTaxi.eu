// Self-test of the lab and the model for step scripts: one step() per numbered brief step.
//   eval "$(scripts/test-lab/lab.sh env <name>)" && node scripts/test-lab/example-booking.mjs [evidenceDir]
// Amounts are the lab's stand-ins (seed-live-like.sql), never prices.
import { start, finish, open, bookFromHome, chooseClass, fillTraveller, applyVoucher, pressPay, pickLang, coverage, BASE, fakes, db, step, money } from "./lab-browser.mjs";

await start({ evidenceDir: process.argv[2] ?? `${process.env.LAB_STATE}/evidence-example` });

const payLabel = async (s) => (await s.page.getByRole("button", { name: /^\s*pay\b/i }).first().innerText().catch(() => "")).replace(/\s+/g, " ");
const sessions = async () => (await fakes("/__sessions")).length;
/** Pays and checks the fake Stripe session: one new session, amount (rappen) = the total shown on PAY. */
async function payAndCheck(s) {
  const n0 = await sessions(), shown = money(await payLabel(s));
  const intent = await pressPay(s), all = await fakes("/__sessions");
  const got = all[all.length - 1]?.amount_total;
  return { ok: intent?.status === 200 && all.length === n0 + 1 && got === Math.round(shown * 100),
           evidence: `intent ${intent?.status}; sessions ${n0}->${all.length}; fake Stripe ${got} rappen; PAY label shows ${shown}` };
}

const w = await open({ viewport: 1440, name: "w1440" });
await step("S1", "home to /checkout at 1440 (en)", async () => {
  await bookFromHome(w);
  return { s: w, ok: /\/checkout/.test(w.page.url()) && (await w.page.locator("[data-co-class]").count()) >= 3, evidence: `${new URL(w.page.url()).pathname}; ${await w.page.locator("[data-co-class]").count()} classes` };
});
await step("S2", "Economy chosen", async () => {
  await chooseClass(w, /Economy/i);
  const l = await payLabel(w);
  return { s: w, ok: money(l) > 0, evidence: `PAY label "${l}"` };
});
await step("S3", "traveller filled", async () => {
  const { email } = await fillTraveller(w);
  return { s: w, ok: (await w.page.getByLabel(/^Email/).inputValue()) === email, evidence: `email ${email}` };
});
await step("S4", "PAY makes one fake Stripe session equal to the shown total", async () => ({ s: w, ...(await payAndCheck(w)) }));
await w.ctx.close();

const m = await open({ viewport: 390, name: "m390" });
await step("S5", "same flow at 390 (phone sheet)", async () => {
  await bookFromHome(m); await chooseClass(m, /Economy/i); await fillTraveller(m);
  return { s: m, ...(await payAndCheck(m)) };
});
await m.ctx.close();

const g = await open({ viewport: 1440, name: "de1440" });
await step("S6", "German: /checkout labels, then the home booking widget has no untranslated strings", async () => {
  await bookFromHome(g); await pickLang(g, "de");
  const text = await g.page.evaluate(() => document.body.innerText), pay = (await g.page.getByRole("button", { name: /bezahlen/i }).count()) > 0;
  const english = ["Choose your class", "Who is travelling", "Continue as guest"].filter((t) => text.includes(t));
  const lang = await g.page.evaluate(() => document.documentElement.lang);
  await g.page.goto(BASE + "/", { waitUntil: "networkidle" }); // DC mock page: VamosLocale exists there ({ count, strings })
  const c = await coverage(g.page, "#book");
  return { s: g, ok: lang === "de" && pay && english.length === 0 && c.count === 0, evidence: `/checkout lang ${lang}, PAY in German ${pay}, English left [${english}]; #book coverage count ${c.count} ${JSON.stringify(c.strings).slice(0, 120)}` };
});
await g.ctx.close();

const v = await open({ viewport: 1440, name: "fix1440" });
await step("S7", "LABFIX lowers the total and the fake session amount matches", async () => {
  await bookFromHome(v); await chooseClass(v, /Economy/i);
  const full = money(await payLabel(v));
  await applyVoucher(v, "LABFIX"); await fillTraveller(v);
  const less = money(await payLabel(v)), r = await payAndCheck(v);
  return { s: v, ok: less < full && r.ok, evidence: `full ${full} -> ${less}; ${r.evidence}; DB bookings ${db("select count(*) from public.bookings")}` };
});
await v.ctx.close();

await finish();
