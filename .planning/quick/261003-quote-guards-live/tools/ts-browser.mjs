// Quick 261003 quote-guards-live, owner decision A: the price challenge on the page customers use
// (/checkout, the React CheckoutPage; home is the DC mock and never POSTs /api/quote), in headless
// Chromium against the local Worker build, with Cloudflare's PUBLIC Turnstile test keys: the real
// widget script in the browser, the real siteverify for the quote guard (tools/ts-proxy.mjs).
//   eval "$(scripts/test-lab/lab.sh env guards)"; MODE=<mode> node ts-browser.mjs <evidenceDir>
// MODE (must match the worker.sh start that is running):
//   pass         SITEKEY=pass TS_SECRET=pass        widget passes by itself -> prices -> PAY
//   interactive  SITEKEY=interactive TS_SECRET=pass  a visible checkbox; a click passes -> prices -> PAY
//   secretfail   SITEKEY=pass TS_SECRET=fail        token refused by siteverify -> message + TRY AGAIN, no spinner
//   block        SITEKEY=block TS_SECRET=pass       widget itself fails -> message + TRY AGAIN, no spinner
//   langs        SITEKEY=interactive TS_SECRET=pass  the challenge state in de / fr / ar (390) and en (768)
import { start, finish, open, bookFromHome, chooseClass, fillTraveller, pressPay, pickLang, fakes, step, money } from "../../../../scripts/test-lab/lab-browser.mjs";

const MODE = process.env.MODE ?? "pass";

/**
 * lab-browser's open() sends cf-connecting-ip on EVERY request of the context. Cloudflare refuses a
 * client-sent cf-connecting-ip, so the real Turnstile widget never got a token (lab harness fault,
 * not the site). Keep the per-context client address, but only on requests to the local Worker.
 */
let ipSeq = 1 + Math.floor(Math.random() * 200);
async function openReal(opts) {
  const s = await open(opts);
  const ip = `10.79.${ipSeq++ % 250}.${1 + Math.floor(Math.random() * 250)}`;
  await s.ctx.setExtraHTTPHeaders({});
  const local = new URL(process.env.LAB_BASE).host;
  await s.ctx.route((u) => u.host === local, (r) => r.continue({ headers: { ...r.request().headers(), "cf-connecting-ip": ip } }));
  return s;
}
await start({ evidenceDir: process.argv[2] ?? `${process.env.LAB_STATE}/evidence-qg` });

const quotes = (s) => s.apiLog.filter((l) => l.method === "POST" && l.path === "/api/quote");
const last = (s) => quotes(s).at(-1);
const payLabel = async (s) => (await s.page.getByRole("button", { name: /^\s*pay\b/i }).first().innerText().catch(() => "")).replace(/\s+/g, " ");
const errCode = (s) => s.page.locator("[data-co-classes-error]").first().getAttribute("data-co-error-code", { timeout: 1000 }).catch(() => null);
// The widget's iframe sits in Cloudflare's shadow root; its host div is what a selector reaches.
const widgetFrame = (s) => s.page.locator("[data-co-classes-error] .vt-turnstile");
const widgetShown = async (s) => { const b = await widgetFrame(s).first().boundingBox().catch(() => null); return Boolean(b && b.height >= 40); };

/** Reloads /checkout until the class list shows the challenge (3rd quote in the window), at most 4 times. */
async function reachChallenge(s) {
  for (let i = 0; i < 4; i++) {
    if ((await errCode(s)) === "turnstile_required") return true;
    await s.page.reload({ waitUntil: "load" });
    await s.page.locator("[data-co-class], [data-co-classes-error]").first().waitFor({ timeout: 20000 }).catch(() => {});
    await s.page.waitForTimeout(600);
  }
  return (await errCode(s)) === "turnstile_required";
}
const trace = (s) => quotes(s).map((q) => `${q.status}${/turnstile_token/.test(q.request ?? "") ? "+token" : ""}:${(/"error":"([a-z_]+)"/.exec(q.response ?? "") ?? [, "ok"])[1]}`).join(" ");

async function clickCheckbox(s) {
  // The test-mode interactive widget: a checkbox inside Cloudflare's iframe. Click its left part by position
  // (the iframe is cross-origin with a closed shadow root, so no selector reaches the box itself).
  const box = await widgetFrame(s).first().boundingBox({ timeout: 15000 });
  if (!box) throw new Error("no widget iframe box");
  await s.page.mouse.click(box.x + 22, box.y + 32);
}

async function payFlow(s) {
  await chooseClass(s, /Economy/i);
  const shown = money(await payLabel(s));
  await fillTraveller(s);
  const n0 = (await fakes("/__sessions")).length;
  const intent = await pressPay(s);
  const all = await fakes("/__sessions");
  const got = all[all.length - 1]?.amount_total;
  return { ok: intent?.status === 200 && all.length === n0 + 1 && got === Math.round(shown * 100),
           evidence: `intent ${intent?.status}; fake Stripe sessions ${n0}->${all.length}; amount ${got} rappen = PAY label ${shown}` };
}

if (MODE === "pass" || MODE === "interactive") {
  for (const vp of [1440, 390]) {
    const s = await openReal({ viewport: vp, name: `${MODE}-${vp}` });
    await step(`A-${MODE}-${vp}-1`, "home -> /checkout, prices on the first quote", async () => {
      await bookFromHome(s);
      return { s, ok: (await s.page.locator("[data-co-class]").count()) >= 3, evidence: `quotes ${trace(s)}` };
    }, { shot: true });
    await step(`A-${MODE}-${vp}-2`, "reloads until the 3rd quote: the challenge shows in the class list", async () => {
      // pass mode: the widget may pass by itself at once, so look at the answers, not only the screen
      let seen = await reachChallenge(s);
      if (!seen) seen = quotes(s).some((q) => q.status === 403 && /turnstile_required/.test(q.response ?? ""));
      if (MODE === "interactive") for (let i = 0; i < 30 && !(await widgetShown(s)); i++) await s.page.waitForTimeout(500);
      await s.page.waitForTimeout(MODE === "interactive" ? 2500 : 300);
      await s.shot(`A-${MODE}-${vp}-2-challenge`);
      const shown = await widgetShown(s);
      return { s, ok: seen && (MODE !== "interactive" || shown), evidence: `quotes ${trace(s)}; widget box shown ${shown}` };
    });
    await step(`A-${MODE}-${vp}-3`, "the solved challenge prices the trip (token in the body, real siteverify)", async () => {
      if (MODE === "interactive") await clickCheckbox(s);
      const priced = await s.page.locator("[data-co-class]").first().waitFor({ timeout: 25000 }).then(() => true, () => false);
      await s.page.waitForTimeout(800);
      const q = last(s);
      const tokenOnPage = await s.page.evaluate(() => [...document.querySelectorAll('input[name="cf-turnstile-response"]')].map((i) => i.value.length));
      return { s, ok: priced && q?.status === 200 && /turnstile_token/.test(q.request ?? ""), evidence: `quotes ${trace(s)}; widget token lengths ${JSON.stringify(tokenOnPage)}; page errors ${s.errors.slice(0, 2).join(" | ")}` };
    }, { shot: true });
    await step(`A-${MODE}-${vp}-4`, "Economy, traveller, PAY: one fake Stripe session for the shown total", async () => ({ s, ...(await payFlow(s)) }), { shot: true });
    await s.ctx.close();
  }
}

if (MODE === "secretfail" || MODE === "block") {
  const s = await openReal({ viewport: 1440, name: `${MODE}-1440` });
  await step(`A-${MODE}-1`, "home -> /checkout, prices", async () => {
    await bookFromHome(s);
    return { s, ok: (await s.page.locator("[data-co-class]").count()) >= 3, evidence: `quotes ${trace(s)}` };
  });
  await step(`A-${MODE}-2`, "3rd quote: challenge; a refused/blocked token ends on the message and TRY AGAIN, not a spinner", async () => {
    const seen = await reachChallenge(s);
    await s.page.waitForTimeout(8000); // let the widget act and any token round-trip finish
    const loading = await s.page.locator("[data-co-classes-loading]").count();
    const code = await errCode(s);
    const retry = await s.page.locator("[data-co-retry]").count();
    const alert = (await s.page.locator('[data-co-classes-error] [role="alert"]').first().innerText().catch(() => "")).trim();
    await s.shot(`A-${MODE}-2-refused`);
    return { s, ok: seen && loading === 0 && code === "turnstile_required" && retry === 1 && alert.length > 0,
             evidence: `quotes ${trace(s)}; code ${code}; loading ${loading}; TRY AGAIN ${retry}; alert "${alert}"` };
  });
  await step(`A-${MODE}-3`, "TRY AGAIN answers again (challenge or rate limit), still never a spinner", async () => {
    const n = quotes(s).length;
    await s.page.locator("[data-co-retry]").click();
    await s.page.waitForTimeout(8000);
    const code = await errCode(s);
    return { s, ok: quotes(s).length > n && (await s.page.locator("[data-co-classes-loading]").count()) === 0 && code !== null,
             evidence: `quotes ${trace(s)}; now ${code}` };
  }, { shot: true });
  await s.ctx.close();
}

if (MODE === "langs") {
  for (const [lang, vp] of [["de", 390], ["fr", 390], ["ar", 390], ["en", 768]]) {
    const s = await openReal({ viewport: vp, name: `langs-${lang}-${vp}` });
    await step(`A-lang-${lang}-${vp}`, `challenge state in ${lang} at ${vp}`, async () => {
      await bookFromHome(s);
      if (lang !== "en") await s.page.evaluate((l) => { document.cookie = `NEXT_LOCALE=${l}; path=/`; }, lang);
      const seen = await reachChallenge(s);
      for (let i = 0; i < 30 && !(await widgetShown(s)); i++) await s.page.waitForTimeout(500);
      await s.page.waitForTimeout(2500);
      const alert = (await s.page.locator('[data-co-classes-error] [role="alert"]').first().innerText().catch(() => "")).trim();
      const htmlLang = await s.page.evaluate(() => document.documentElement.lang);
      const dir = await s.page.evaluate(() => document.documentElement.dir);
      const sideways = await s.page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
      await s.shot(`A-lang-${lang}-${vp}`);
      return { s, ok: seen && htmlLang === lang && alert.length > 0 && !sideways && (lang !== "ar" || dir === "rtl"),
               evidence: `lang ${htmlLang} dir ${dir}; alert "${alert}"; sideways ${sideways}; quotes ${trace(s)}` };
    });
    await s.ctx.close();
  }
}

await finish();
