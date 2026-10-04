import { start, finish, open, pickLang, dismissCookies, step, db, BASE } from "/Users/koss/Developer/VamosTaxi.eu/.claude/worktrees/agent-acc772106f447cb8c/scripts/test-lab/lab-browser.mjs";

const EV = "/Users/koss/Developer/VamosTaxi.eu/.claude/worktrees/agent-acc772106f447cb8c/.planning/quick/261004-hide-internal-ids/evidence/lab";
const TOKEN = "AQIDBAUGBwgJCgsMDQ4PEBESExQVFhcYGRobHB0eHyA";
const BID = "0a66ef23-6410-49a0-8c1f-ed7e2a19820c";
await start({ evidenceDir: EV });

const hasForm = async (p) => (await p.locator('[role="radiogroup"]').count()) === 3 && (await p.locator("textarea").count()) === 1;
const notFound = async (p) => /could not find this booking|nicht finden/i.test(await p.locator("body").innerText());

const a = await open({ viewport: 1440, lang: "en", name: "a" });
a.page.on("console", (m) => { if (m.type() === "error") a.errors.push("console: " + m.text().slice(0, 150)); });
await step("S3", "open token link at 1440 en", async () => {
  await a.page.goto(`${BASE}/review?token=${TOKEN}`, { waitUntil: "load" });
  await a.page.waitForTimeout(1500);
  const url = new URL(a.page.url());
  const ok = url.pathname.endsWith("/review") && !/token/.test(url.search + url.hash) && await hasForm(a.page) && !(await notFound(a.page));
  await a.page.screenshot({ path: `${EV}/S3.png` });
  return { s: a, ok, evidence: `url ${a.page.url()}; radiogroups ${await a.page.locator('[role="radiogroup"]').count()}; textarea ${await a.page.locator("textarea").count()}; submit ${await a.page.getByRole("button", { name: /submit review/i }).count()}; notFound ${await notFound(a.page)}` };
});
await step("S4", "reload", async () => {
  await a.page.reload({ waitUntil: "load" }); await a.page.waitForTimeout(1500);
  const url = new URL(a.page.url());
  const ok = url.pathname.endsWith("/review") && !/token/.test(url.search) && await hasForm(a.page);
  await a.page.screenshot({ path: `${EV}/S4.png` });
  return { s: a, ok, evidence: `url ${a.page.url()}; form ${await hasForm(a.page)}` };
});
await step("S5", "switch to Deutsch via header", async () => {
  await pickLang(a, "de"); await a.page.waitForTimeout(1500);
  const lang = await a.page.evaluate(() => document.documentElement.lang);
  const url = a.page.url();
  const ok = lang === "de" && !/token/.test(url) && await hasForm(a.page) && !(await notFound(a.page));
  await a.page.screenshot({ path: `${EV}/S5.png` });
  return { s: a, ok, evidence: `lang ${lang}; url ${url}; form ${await hasForm(a.page)}; submit btn text: ${await a.page.locator("form button[type=submit]").innerText().catch(() => "?")}` };
});

const m = await open({ viewport: 390, lang: "en", name: "m" });
await step("S6", "390 token link, Arabic", async () => {
  await m.page.goto(`${BASE}/review?token=${TOKEN}`, { waitUntil: "load" });
  await m.page.waitForTimeout(1000);
  const urlAfterOpen = m.page.url();
  let how = "burger menu";
  try {
    await dismissCookies(m.page);
    await m.page.locator("header button").last().click();
    await m.page.waitForTimeout(800);
    await m.page.locator('button[aria-label="Language"]:visible').first().click();
    await m.page.getByRole("option", { name: /\u0627\u0644\u0639\u0631\u0628\u064a\u0629/ }).first().click();
  } catch (e) { how = "failed: " + String(e).split("\n")[0]; }
  await m.page.waitForTimeout(1500);
  const info = await m.page.evaluate(() => ({ dir: document.documentElement.dir, lang: document.documentElement.lang, sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth, url: location.href }));
  const ok = info.dir === "rtl" && info.sw <= info.cw && await hasForm(m.page) && !/token/.test(info.url) && !(await notFound(m.page));
  await m.page.screenshot({ path: `${EV}/S6.png` });
  return { s: m, ok, evidence: `open url ${urlAfterOpen}; via ${how}; ${JSON.stringify(info)}; form ${await hasForm(m.page)}` };
});

await step("S7", "submit review in S3 context", async () => {
  await pickLang(a, "en"); await a.page.waitForTimeout(1000);
  const before = db(`select count(*) from public.reviews where booking_id = '${BID}'`);
  for (const g of await a.page.locator('[role="radiogroup"]').all()) await g.getByRole("radio", { name: "5" }).click();
  await a.page.locator("textarea").fill("Lab review");
  // Turnstile stand-in: wait for token (widget auto-passes with the test key) up to 20 s
  await a.page.waitForTimeout(6000);
  const resp = a.page.waitForResponse((r) => r.url().includes("/api/reviews/submit"), { timeout: 20000 });
  await a.page.getByRole("button", { name: /submit review/i }).click();
  const r = await resp; const body = await r.text();
  await a.page.waitForTimeout(1500);
  const thanks = await a.page.locator(".vt-review-thanks").count();
  const after = db(`select count(*) from public.reviews where booking_id = '${BID}'`);
  await a.page.screenshot({ path: `${EV}/S7.png` });
  return { s: a, ok: thanks === 1 && after === "1" && body.trim() === '{"ok":true}', evidence: `count ${before}->${after}; POST status ${r.status()} body ${body}; thanks ${thanks}` };
});

const c = await open({ viewport: 1440, lang: "en", name: "c" });
c.page.on("console", (mm) => { if (mm.type() === "error") c.errors.push("console: " + mm.text().slice(0, 150)); });
await step("S10", "cookies and home", async () => {
  await c.page.goto(`${BASE}/cookies`, { waitUntil: "load" }); await c.page.waitForTimeout(1200);
  const text = await c.page.locator("body").innerText();
  const m1 = /Sign-in/.test(text), m2 = /sb-[^\s]*-auth-token/.test(text);
  const row = (await c.page.locator("tr", { hasText: /auth-token/ }).first().innerText().catch(() => "")).replace(/\s+/g, " ");
  await c.page.screenshot({ path: `${EV}/S10-cookies.png`, fullPage: true });
  await c.page.goto(`${BASE}/`, { waitUntil: "load" }); await c.page.waitForTimeout(1200);
  await c.page.screenshot({ path: `${EV}/S10-home.png` });
  return { s: c, ok: m1 && m2, evidence: `Sign-in text ${m1}; sb-*-auth-token ${m2}; row "${row.slice(0, 120)}"; console/page errors: ${JSON.stringify(c.errors)}` };
});
console.log("errors A:", JSON.stringify(a.errors), "M:", JSON.stringify(m.errors));
await finish();
