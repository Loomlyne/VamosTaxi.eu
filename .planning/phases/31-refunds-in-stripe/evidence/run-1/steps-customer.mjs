// Phase 31 brief steps C1-C8 (customer pages). Run: eval "$(scripts/test-lab/lab.sh env p31-refunds)" && node <this file>
// Signed-in steps use lab-p31-cust@vamos.local (password in $LAB_STATE/customer.txt, never printed).
import fs from "node:fs";
import { start, finish, open, BASE, dismissCookies, setLang, step } from "../../../../scripts/test-lab/lab-browser.mjs";
const EV = new URL(".", import.meta.url).pathname.replace(/\/$/, "");
await start({ evidenceDir: EV });
const SIZE = { 1440: [1440, 900], 1024: [1024, 768], 768: [768, 1024], 390: [390, 844] };
const MANAGE = BASE + "/manage-booking?token=MTIzNDU2Nzg5Ojs8PT4_QEFCQ0RFRkdISUpLTE1OT1A", DETAIL = BASE + "/booking-detail?ref=VT-99-31304";
const cust = Object.fromEntries(fs.readFileSync(`${process.env.LAB_STATE}/customer.txt`, "utf8").split("\n").filter(Boolean).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]));
const pageTexts = []; // C5: every customer step's page text
const flat = (t) => t.replace(/\s+/g, " ");

const anon = await open({ viewport: 1440, name: "anon" });
const signed = await open({ viewport: 1440, name: "cust" });
const swh = (s) => s.page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);

async function manage(w, lang) {
  const { page } = anon;
  await page.setViewportSize({ width: SIZE[w][0], height: SIZE[w][1] });
  await page.goto(MANAGE, { waitUntil: "networkidle" });
  await dismissCookies(page); await page.waitForTimeout(1200);
  if (lang) await setLang(anon, lang);
}
/** Opens the cancel sheet (the card that was not there before) and tags it data-p31=sheet. */
async function openSheet() {
  const { page } = anon;
  await page.evaluate(() => document.querySelectorAll("[data-card][data-noprint]").forEach((e) => e.setAttribute("data-p31-pre", "1")));
  await page.locator("button[data-fork]:has([data-fork-cta=ghost])").first().click();
  await page.waitForTimeout(1000);
  const ok = await page.evaluate(() => { const c = [...document.querySelectorAll("[data-card][data-noprint]")].find((e) => !e.hasAttribute("data-p31-pre") && e.offsetParent !== null && e.querySelector("h2")); if (!c) return false; c.setAttribute("data-p31", "sheet"); return true; });
  if (!ok) throw new Error("cancel sheet did not open");
}
const sheetText = () => anon.page.evaluate(() => document.querySelector("[data-p31=sheet]").innerText);
const pageText = (s) => s.page.evaluate(() => document.body.innerText);

await step("C1", "1440 en manage (a): cancel sheet line, no CHF/Stripe", async () => {
  await manage(1440, "en"); await openSheet();
  const sh = flat(await sheetText()), pt = await pageText(anon); pageTexts.push(["C1", pt]);
  await anon.page.screenshot({ path: `${EV}/C1.png` });
  const line = "This trip will be cancelled. Any refund follows the cancellation policy.";
  return { ok: sh.includes(line) && !/CHF/.test(sh) && !/stripe/i.test(sh), evidence: `line ${sh.includes(line)}; CHF in sheet ${/CHF/.test(sh)}; Stripe in sheet ${/stripe/i.test(sh)}` };
});

await step("C2", "390 ar manage (a): cancel sheet line", async () => {
  await manage(390, "ar"); await openSheet();
  const sh = flat(await sheetText()), pt = await pageText(anon), sw = await swh(anon); pageTexts.push(["C2", pt]);
  await anon.page.screenshot({ path: `${EV}/C2.png` });
  const line = "ستُلغى هذه الرحلة. يخضع أي استرداد لسياسة الإلغاء.";
  return { ok: sh.includes(line) && !/CHF/.test(sh) && !/stripe/i.test(sh) && sw[0] === sw[1], evidence: `line ${sh.includes(line)}; CHF ${/CHF/.test(sh)}; Stripe ${/stripe/i.test(sh)}; scrollWidth ${sw[0]}/${sw[1]}` };
});

await step("C6", "1024 de manage (a): cancel sheet line", async () => {
  await manage(1024, "de"); await openSheet();
  const sh = flat(await sheetText()), pt = await pageText(anon), sw = await swh(anon); pageTexts.push(["C6", pt]);
  await anon.page.screenshot({ path: `${EV}/C6.png` });
  const line = "Diese Fahrt wird storniert. Eine allfällige Rückerstattung richtet sich nach den Stornierungsbedingungen.";
  return { ok: sh.includes(line) && !/CHF/.test(sh) && sw[0] === sw[1], evidence: `line ${sh.includes(line)}; CHF in sheet ${/CHF/.test(sh)}; scrollWidth ${sw[0]}/${sw[1]}` };
});

const cov8 = [];
await step("C8", "1440 de/fr/ar coverage: cancel sheet (a), Refund row (d)", async () => {
  let ok = true;
  for (const lang of ["de", "fr", "ar"]) {
    await manage(1440, "en"); await openSheet();
    await setLang(anon, lang);
    const sheet = await anon.page.evaluate(() => { const c = window.VamosLocale.coverage(document.querySelector("[data-p31=sheet]")); return { count: c.count ?? c.length ?? 0, strings: (c.strings ?? c).slice?.(0, 6) }; });
    await anon.page.screenshot({ path: `${EV}/C8-sheet-${lang}.png` });
    pageTexts.push(["C8-sheet-" + lang, await pageText(anon)]);
    cov8.push({ lang, target: "cancel sheet (a)", ...sheet });
    ok = ok && sheet.count === 0;
  }
  // booking-detail needs the signed-in context; done below after C3
  return { ok, evidence: "cancel sheet: " + cov8.map((c) => `${c.lang} ${c.count} ${JSON.stringify(c.strings)}`).join("; ") };
});

// customer sign-in
{
  const { page } = signed;
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(BASE + "/sign-in", { waitUntil: "networkidle" });
  await dismissCookies(page); await page.waitForTimeout(800);
  await page.locator('input[type=email]').fill(cust.email);
  await page.locator('input[type=password]').fill(cust.password);
  await page.getByRole("button", { name: /^\s*sign in\s*$/i }).last().click();
  await page.waitForURL((u) => !/\/sign-in/.test(u.pathname), { timeout: 20000 }).catch(() => {});
  console.log("signed-in url:", new URL(page.url()).pathname);
}
async function detail(w, lang) {
  const { page } = signed;
  await page.setViewportSize({ width: SIZE[w][0], height: SIZE[w][1] });
  await page.goto(DETAIL, { waitUntil: "networkidle" });
  await dismissCookies(page); await page.waitForTimeout(1500);
  await page.evaluate(() => { const r = [...document.querySelectorAll("[data-row]")].find((e) => e.querySelector("[data-row-k]") && /^refund$/i.test(e.querySelector("[data-row-k]").innerText.trim())); if (r) r.setAttribute("data-p31", "refund-row"); });
  if (lang) await setLang(signed, lang);
}
const refundRow = (s) => s.page.evaluate(() => { const r = document.querySelector("[data-p31=refund-row]"); return r ? r.innerText.replace(/\s+/g, " ").trim() : null; });

await step("C3", "1440 en booking-detail (d): Refund row", async () => {
  await detail(1440, "en");
  const row = await refundRow(signed), pt = await pageText(signed); pageTexts.push(["C3", pt]);
  await signed.page.screenshot({ path: `${EV}/C3.png` });
  return { ok: row !== null && row.includes("Refund follows the cancellation policy"), evidence: `url ${new URL(signed.page.url()).pathname}${new URL(signed.page.url()).search}; row "${row}"` };
});
await step("C4", "390 ar booking-detail (d): Refund row", async () => {
  await detail(390, "ar");
  const row = await refundRow(signed), sw = await swh(signed), pt = await pageText(signed); pageTexts.push(["C4", pt]);
  await signed.page.screenshot({ path: `${EV}/C4.png` });
  return { ok: row !== null && row.includes("الاسترداد وفق سياسة الإلغاء") && sw[0] === sw[1], evidence: `row "${row}"; scrollWidth ${sw[0]}/${sw[1]}` };
});
await step("C7", "768 en booking-detail (d): Refund row", async () => {
  await detail(768, "en");
  const row = await refundRow(signed), sw = await swh(signed), pt = await pageText(signed); pageTexts.push(["C7", pt]);
  await signed.page.screenshot({ path: `${EV}/C7.png` });
  return { ok: row !== null && row.includes("Refund follows the cancellation policy") && sw[0] === sw[1], evidence: `row "${row}"; scrollWidth ${sw[0]}/${sw[1]}` };
});

await step("C8b", "C8 second half: Refund row (d) coverage de/fr/ar", async () => {
  let ok = true; const out = [];
  for (const lang of ["de", "fr", "ar"]) {
    await detail(1440, "en"); await setLang(signed, lang);
    const c = await signed.page.evaluate(() => { const r = document.querySelector("[data-p31=refund-row]"); if (!r) return { missing: true }; const x = window.VamosLocale.coverage(r); return { count: x.count ?? x.length ?? 0, strings: (x.strings ?? x).slice?.(0, 6), text: r.innerText.replace(/\s+/g, " ").trim() }; });
    await signed.page.screenshot({ path: `${EV}/C8-row-${lang}.png` });
    pageTexts.push(["C8-row-" + lang, await pageText(signed)]);
    cov8.push({ lang, target: "refund row (d)", ...c }); out.push(`${lang} ${c.missing ? "row missing" : c.count} "${c.text}"`);
    ok = ok && !c.missing && c.count === 0;
  }
  fs.writeFileSync(`${EV}/c8-coverage.json`, JSON.stringify(cov8, null, 1));
  return { ok, evidence: "refund row: " + out.join("; ") };
});

await step("C5", "no page text of C1-C4, C6-C8 contains Stripe", async () => {
  const hit = pageTexts.filter(([, t]) => /stripe/i.test(t)).map(([id]) => id);
  return { ok: hit.length === 0 && pageTexts.length === 12, evidence: `pages read ${pageTexts.map(([id]) => id)}; containing Stripe: [${hit}]` };
});
await finish();
