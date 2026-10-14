// Phase 31 brief steps D1-D12 (dashboard). Run: eval "$(scripts/test-lab/lab.sh env p31-refunds)" && node <this file>
// Sign-in note: the dashboard login is email link + 6-digit code only (no password field); the code is read from the
// lab's local mail file (apps/web/.wrangler/tmp/email) and typed into the real form as the admin lab-admin@vamos.local.
import fs from "node:fs";
import { start, finish, open, DASH, setLang, step } from "../../../../scripts/test-lab/lab-browser.mjs";
import { signInCode } from "./signin-code.mjs";
const EV = new URL(".", import.meta.url).pathname.replace(/\/$/, "");
await start({ evidenceDir: EV });
const s = await open({ viewport: 1440, name: "dash" });
const { page, ctx } = s;
const sleep = (ms) => page.waitForTimeout(ms);
const reqs = []; page.on("request", (r) => { const u = new URL(r.url()); if (u.pathname.startsWith("/api/")) reqs.push({ m: r.method(), p: u.pathname }); });
const opened = []; ctx.on("page", (p) => opened.push(p));
await ctx.route(/dashboard\.stripe\.com/, (r) => r.fulfill({ status: 200, contentType: "text/html", body: "<title>stub</title>stub" })); // new tab stays off the internet; its URL is still checked
const SIZE = { 1440: [1440, 900], 1024: [1024, 768], 768: [768, 1024], 390: [390, 844] };
const shot = (id) => page.screenshot({ path: `${EV}/${id}.png` });
const text = () => page.evaluate(() => document.body.innerText);
const flat = (t) => t.replace(/\s+/g, " ");
await signInCode(page);

/** Opens a booking at a width (and language, in place); resolves once /stripe-payments answered. */
async function openBooking(ref, w, lang) {
  await page.setViewportSize({ width: SIZE[w][0], height: SIZE[w][1] });
  const resp = page.waitForResponse((r) => /\/stripe-payments/.test(r.url()), { timeout: 20000 }).catch(() => null);
  await page.goto(`${DASH}/bookings/${ref}`, { waitUntil: "domcontentloaded" });
  await page.locator("button[aria-haspopup=menu]:visible").first().waitFor({ timeout: 20000 }).catch(() => {});
  if (lang) await setLang(s, lang);
  const r = await resp; await sleep(1000);
  return r;
}
// the visible Actions button: the page's own at 1440, the top bar's at 1080 and narrower (either label, any language)
const actionsBtn = () => page.locator("button[aria-haspopup=menu]:visible").filter({ hasText: /^\s*(actions|aktionen|actions|الإجراءات)\s*$/i }).first();
const item = (re) => page.locator("[data-am-item]").filter({ hasText: re }).first();
async function openMenu() { await actionsBtn().click(); await page.locator("[data-am-pop]").first().waitFor({ timeout: 5000 }); await sleep(250); }
const stripeRows = () => page.locator("[data-ops-stripe-row]");
const cov = (sel) => page.evaluate((q) => { const el = document.querySelector(q); if (!el) return { missing: true }; const c = window.VamosLocale.coverage(el); return { count: c.count ?? c.length ?? 0, strings: (c.strings ?? c).slice?.(0, 5) }; }, sel);
const disabledState = (loc) => loc.evaluate((e) => ({ disabled: e.disabled === true || e.hasAttribute("disabled"), aria: e.getAttribute("aria-disabled") }));
async function clickForTab(re) {
  const n0 = opened.length, np = ctx.waitForEvent("page", { timeout: 8000 }).catch(() => null);
  await item(re).click();
  const p = await np; await sleep(800);
  let url = p ? p.url() : ""; if (p && !/stripe\.com/.test(url)) { await p.waitForURL(/dashboard\.stripe\.com/, { timeout: 5000 }).catch(() => {}); url = p.url(); }
  return { p, url, count: opened.length - n0 };
}

// D1: the answer is held 4 s so the item can be read before it arrives
await step("D1", "(a) item disabled before /stripe-payments, one Stripe tab after", async () => {
  await page.route(/\/stripe-payments/, async (r) => { await new Promise((x) => setTimeout(x, 4000)); await r.continue(); });
  await page.setViewportSize({ width: 1440, height: 900 });
  const resp = page.waitForResponse((r) => /\/stripe-payments/.test(r.url()), { timeout: 20000 });
  await page.goto(`${DASH}/bookings/VT-99-31301`, { waitUntil: "domcontentloaded" });
  await actionsBtn().waitFor({ timeout: 20000 });
  await openMenu();
  const before = await disabledState(item(/refund in stripe/i));
  await page.screenshot({ path: `${EV}/D1-before.png` });
  await page.keyboard.press("Escape"); await sleep(200);
  await resp; await page.unroute(/\/stripe-payments/); await sleep(1200);
  if (await page.locator("[data-am-pop]").count()) { await page.keyboard.press("Escape"); await sleep(200); }
  await openMenu();
  const after = await disabledState(item(/refund in stripe/i));
  const { p, url, count } = await clickForTab(/refund in stripe/i);
  const t = await text();
  await shot("D1");
  if (p) await p.close();
  const wasDisabled = before.disabled || before.aria === "true";
  return { ok: wasDisabled && !after.disabled && after.aria !== "true" && count === 1 && url.startsWith("https://dashboard.stripe.com/") && url.includes("pi_lab_p31_a") && !/which payment/i.test(t),
    evidence: `before ${JSON.stringify(before)}; after ${JSON.stringify(after)}; new pages ${count}; url ${url}; "Which payment?" shown ${/which payment/i.test(t)}` };
});

await step("D2", "(b) Which payment? two rows, safe links", async () => {
  await openBooking("VT-99-31302", 1440);
  await openMenu(); await item(/refund in stripe/i).click(); await sleep(1000);
  const t = await text(), n = await stripeRows().count();
  const links = await stripeRows().locator("a").evaluateAll((as) => as.map((a) => ({ txt: a.innerText.trim(), href: a.href, target: a.target, rel: a.rel })));
  await shot("D2");
  const hasBoth = links.some((l) => l.href.includes("pi_lab_p31_b_extra")) && links.some((l) => l.href.includes("pi_lab_p31_b") && !l.href.includes("_extra"));
  return { ok: /which payment\?/i.test(t) && n === 2 && links.length === 2 && links.every((l) => l.target === "_blank" && /noopener/.test(l.rel) && l.href.startsWith("https://dashboard.stripe.com/")) && hasBoth, evidence: `rows ${n}; ${JSON.stringify(links)}` };
});

await step("D3", "(c) no Stripe payment message", async () => {
  const n0 = opened.length;
  await openBooking("VT-99-31303", 1440);
  await openMenu(); const it = item(/refund in stripe/i);
  const st = await disabledState(it);
  await it.click({ timeout: 4000 }).catch(() => {}); await sleep(1000);
  const t = await text(); await shot("D3");
  const msg = /This booking has no Stripe payment to open\./.test(t);
  return { ok: msg && opened.length === n0, evidence: `item ${JSON.stringify(st)}; message shown ${msg}; new pages ${opened.length - n0}` };
});

await step("D4", "(d) Refund to check, no confirm/decline", async () => {
  await openBooking("VT-99-31304", 1440);
  const t = await text(); await shot("D4");
  return { ok: /Refund to check/.test(t) && !/confirm refund/i.test(t) && !/decline refund/i.test(t), evidence: `note ${/Refund to check/.test(t)}; confirm refund ${/confirm refund/i.test(t)}; decline refund ${/decline refund/i.test(t)}` };
});
await step("D5", "(e) Refund to check absent", async () => {
  await openBooking("VT-99-31305", 1440);
  const t = await text(); await shot("D5");
  return { ok: !/refund to check/i.test(t), evidence: `contains "refund to check" (case-insensitive): ${/refund to check/i.test(t)}` };
});
await step("D6", "(f) Refunded visible, no Refund to check", async () => {
  await openBooking("VT-99-31306", 1440);
  const t = await text(); await shot("D6");
  return { ok: !/refund to check/i.test(t) && /Refunded/.test(t), evidence: `refund to check (ci) ${/refund to check/i.test(t)}; "Refunded" exact case ${/Refunded/.test(t)}; any case ${/refunded/i.test(t)}` };
});

await step("D7", "390 ar: item in top-bar menu, list wraps", async () => {
  await openBooking("VT-99-31302", 390, "ar");
  const fold = await page.evaluate(() => { const e = document.querySelector("[data-ops-fold]"); return e ? getComputedStyle(e).display : "absent"; });
  const bar = await page.evaluate(() => { const e = document.querySelector("[data-ops-top-acts]"); return !!e && getComputedStyle(e).display !== "none" && !!e.querySelector("button[aria-haspopup=menu]"); });
  await page.locator("[data-ops-top-acts] button[aria-haspopup=menu]").first().click(); await page.locator("[data-am-pop]").first().waitFor(); await sleep(300);
  const names = (await page.locator("[data-am-item]").allInnerTexts()).map((x) => x.trim());
  await page.locator("[data-am-item]").filter({ hasText: /الاسترداد في Stripe/ }).first().click(); await sleep(1000);
  const t = await text(), n = await stripeRows().count();
  const geo = await stripeRows().evaluateAll((rows) => rows.map((r) => {
    const tx = r.querySelector("[data-ops-stripe-text]").getBoundingClientRect(), a = r.querySelector("a").getBoundingClientRect(), k = r.querySelector("[data-ops-stripe-k]");
    return { textBottom: Math.round(tx.bottom), linkTop: Math.round(a.top), linkLeft: Math.round(a.left), linkRight: Math.round(a.right), textH: Math.round(tx.height), lh: parseFloat(getComputedStyle(k).lineHeight) || 20 }; }));
  const sw = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth, document.dir]);
  await shot("D7");
  const wrapOk = geo.every((g) => (g.linkTop >= g.textBottom - 1 || g.textH > g.lh * 1.5) && g.linkLeft >= 0 && g.linkRight <= 390);
  return { ok: fold === "none" && bar && t.includes("أي دفعة؟") && n === 2 && wrapOk && sw[0] === sw[1], evidence: `own fold display ${fold}; top-bar menu ${bar}; menu items [${names.join(" | ")}]; list shown ${t.includes("أي دفعة؟")}; rows ${n}; geo ${JSON.stringify(geo)}; scrollWidth ${sw[0]}/${sw[1]}; dir ${sw[2]}` };
});

await step("D8", "1440 ar: (d) note text and rtl", async () => {
  await openBooking("VT-99-31304", 1440, "ar");
  const t = flat(await text()); await shot("D8");
  const title = "استرداد للمراجعة", body = "أُلغي الحجز وعليه دفعة مسجّلة. إذا كانت سياسة الإلغاء تتيح استردادًا، فنفّذه في Stripe. تعرضه هذه الصفحة بمجرد أن يسجّله Stripe.";
  const dir = await page.evaluate(() => document.dir);
  return { ok: t.includes(title) && t.includes(body) && dir === "rtl", evidence: `title ${t.includes(title)}; body ${t.includes(body)}; dir ${dir}` };
});

await step("D10", "1024 de: (b) menu item and list", async () => {
  await openBooking("VT-99-31302", 1024, "de");
  await openMenu();
  const names = (await page.locator("[data-am-item]").allInnerTexts()).map((x) => x.trim());
  const it = item(/In Stripe rückerstatten/), have = await it.count();
  await it.click(); await sleep(1000);
  const t = await text(), n = await stripeRows().count();
  const btns = (await stripeRows().locator("a,button").allInnerTexts()).map((b) => b.trim());
  const sw = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
  await shot("D10");
  return { ok: have === 1 && /Welche Zahlung\?/.test(t) && n === 2 && btns.length >= 2 && btns.every((b) => /in stripe öffnen/i.test(b)) && sw[0] === sw[1], evidence: `menu [${names.join(" | ")}]; item ${have}; "Welche Zahlung?" ${/Welche Zahlung\?/.test(t)}; rows ${n}; buttons ${JSON.stringify(btns)}; scrollWidth ${sw[0]}/${sw[1]}` };
});

await step("D11", "768 en: (a) Stripe tab, (d) note, no sideways scroll", async () => {
  await openBooking("VT-99-31301", 768, "en");
  const sw1 = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
  const ownFold = await page.evaluate(() => getComputedStyle(document.querySelector("[data-ops-fold]")).display);
  await openMenu();
  const { p, url, count } = await clickForTab(/refund in stripe/i);
  await shot("D11-a"); if (p) await p.close();
  await openBooking("VT-99-31304", 768, "en");
  const t = await text(), sw2 = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
  await shot("D11");
  return { ok: count === 1 && url.startsWith("https://dashboard.stripe.com/") && url.includes("pi_lab_p31_a") && /Refund to check/.test(t) && sw1[0] === sw1[1] && sw2[0] === sw2[1],
    evidence: `own fold display ${ownFold} (menu opened from the top bar); new pages ${count}; url ${url}; note ${/Refund to check/.test(t)}; scrollWidth (a) ${sw1[0]}/${sw1[1]}, (d) ${sw2[0]}/${sw2[1]}` };
});

const cov12 = [];
await step("D12", "1440 de/fr/ar coverage (9 calls)", async () => {
  let ok = true;
  const label = { de: /In Stripe rückerstatten/, fr: /Stripe/, ar: /Stripe/ };
  for (const lang of ["de", "fr", "ar"]) {
    await openBooking("VT-99-31302", 1440, lang);
    await openMenu();
    const menu = await cov("[data-am-pop]");
    await item(label[lang]).click(); await sleep(1000);
    const rows = await stripeRows().count();
    const region = await cov("[data-ops-refund-region]");
    await openBooking("VT-99-31304", 1440, lang);
    let target = "[data-ops-refund-region]", note = await cov(target);
    if (note.missing) { // the note sits outside a refund region: the Alert holding it
      target = "Alert"; note = await page.evaluate(() => { const hit = [...document.querySelectorAll("[role=alert],[class*=lert]")].find((e) => /\S/.test(e.innerText)); if (!hit) return { missing: true }; const c = window.VamosLocale.coverage(hit); return { count: c.count ?? c.length ?? 0, strings: (c.strings ?? c).slice?.(0, 5), alert: hit.innerText.slice(0, 60) }; });
    }
    await shot(`D12-${lang}`);
    cov12.push({ lang, menu, region, rowsInList: rows, noteTarget: target, note });
    for (const c of [menu, region, note]) if (c.missing || c.count !== 0) ok = false;
  }
  fs.writeFileSync(`${EV}/d12-coverage.json`, JSON.stringify(cov12, null, 1));
  return { ok, evidence: cov12.map((c) => `${c.lang}: menu ${c.menu.count ?? "missing"}, region ${c.region.count ?? "missing"} (rows ${c.rowsInList}), note[${c.noteTarget}] ${c.note.count ?? "missing"}`).join("; ") };
});

await step("D9", "request log: no /refund, /refund-decision; a GET /stripe-payments", async () => {
  const bad = reqs.filter((r) => /\/(refund|refund-decision)$/.test(r.p)), gets = reqs.filter((r) => r.m === "GET" && /\/stripe-payments$/.test(r.p));
  fs.writeFileSync(`${EV}/d9-requests.json`, JSON.stringify(reqs, null, 1));
  return { ok: bad.length === 0 && gets.length >= 1, evidence: `${reqs.length} api requests; refund paths ${JSON.stringify(bad)}; GET stripe-payments ${gets.length}; methods seen ${[...new Set(reqs.map((r) => r.m))]}` };
});
fs.existsSync(`${EV}/results.json`);
await finish();
