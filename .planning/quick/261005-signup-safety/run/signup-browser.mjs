// Browser run for the sign-up safety job (S5, 2026-10-05): /sign-up and the forgot-password form on the test lab.
// The lab's Worker is real (built from this branch), its Supabase is local, siteverify and Resend are the lab's
// stand-ins. Cloudflare's browser script (challenges.cloudflare.com api.js) is replaced here by a stand-in with
// three behaviours: pass (unseen), interactive (a small box that must be ticked), error (the check cannot run),
// badtoken (hands out a token the stand-in siteverify refuses). Local only, no live site.
//   eval "$(scripts/test-lab/lab.sh env <name>)"
//   node signup-browser.mjs <evidenceDir> <screensDir>
import { createRequire } from "node:module";
import fs from "node:fs";

const need = (k) => { if (!process.env[k]) throw new Error(`${k} is not set`); return process.env[k]; };
const WEB = need("WEB_DIR"), BASE = need("LAB_BASE"), DASH = need("LAB_DASH"), FAKE = need("LAB_FAKE");
const [, , EVIDENCE, SCREENS] = process.argv;
fs.mkdirSync(EVIDENCE, { recursive: true });
fs.mkdirSync(SCREENS, { recursive: true });
const { chromium } = createRequire(WEB + "/package.json")("@playwright/test");

const STANDIN = `(function(){
  var n=0,tok=0,W={};
  window.__ts={mode:window.__tsMode||'pass',log:[]};
  window.turnstile={
    render:function(box,o){var id='w'+(++n);W[id]={box:box,o:o};window.__ts.log.push({fn:'render',action:o.action,language:o.language,appearance:o.appearance,execution:o.execution,sitekey:o.sitekey});return id;},
    execute:function(id){
      var w=W[id],m=window.__ts.mode;window.__ts.log.push({fn:'execute',mode:m});
      if(m==='error'){setTimeout(function(){w.o['error-callback']&&w.o['error-callback']();},40);return;}
      var token=(m==='badtoken')?'fail':'lab-token-'+(++tok);
      if(m==='interactive'){
        w.o['before-interactive-callback']&&w.o['before-interactive-callback']();
        w.box.innerHTML='<label id="ts-standin" style="display:flex;align-items:center;gap:12px;box-sizing:border-box;width:300px;max-width:100%;height:65px;padding:0 16px;border:1px solid #d0d0d0;border-radius:4px;background:#fafafa;font:14px/1 system-ui,sans-serif;color:#222"><input id="ts-tick" type="checkbox" style="width:24px;height:24px;margin:0"><span>Verify you are human</span></label>';
        w.box.querySelector('#ts-tick').addEventListener('change',function(){
          setTimeout(function(){w.box.innerHTML='';w.o['after-interactive-callback']&&w.o['after-interactive-callback']();w.o.callback(token);},60);
        });
        return;
      }
      setTimeout(function(){w.o.callback(token);},40);
    },
    reset:function(){window.__ts.log.push({fn:'reset'});},
    remove:function(id){var w=W[id];if(w)w.box.innerHTML='';window.__ts.log.push({fn:'remove'});}
  };
})();`;

const results = [];
let ipN = 20 + Math.floor(Math.random() * 100);
const run = Date.now().toString(36);
const mailAddr = (tag) => `s5-${tag}-${run}@example.test`;
const note = (m) => console.log("  ", m);
const record = (status, name, detail = "") => {
  results.push({ status, name, detail });
  console.log(`${status} | ${name}${detail ? " | " + detail : ""}`);
};
async function step(name, fn) {
  if (process.env.ONLY && !name.includes(process.env.ONLY)) return;
  try {
    const detail = await fn();
    record("PASS", name, typeof detail === "string" ? detail : "");
  } catch (e) {
    record("FAIL", name, String(e?.message ?? e).split("\n")[0].slice(0, 300));
  }
}
const eq = (a, b, what) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${what}: got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`); };
const ok = (c, what) => { if (!c) throw new Error(what); };

const browser = await chromium.launch({ channel: "chromium" });

async function openPage({ width, lang = "en", mode = "pass", path = "/sign-up" }) {
  const ctx = await browser.newContext({
    viewport: { width, height: width >= 1000 ? 900 : 844 },
    extraHTTPHeaders: { "cf-connecting-ip": `10.55.${ipN++ % 250}.${Math.floor(Math.random() * 250)}` },
  });
  await ctx.addInitScript((l) => { try { localStorage.setItem("vamosLang", l); } catch (e) {} }, lang);
  await ctx.route(/challenges\.cloudflare\.com\/turnstile\/v0\/api\.js/, (r) => r.fulfill({ status: 200, contentType: "application/javascript", body: STANDIN }));
  const page = await ctx.newPage();
  const api = [], errors = [];
  page.on("pageerror", (e) => errors.push(String(e).slice(0, 200)));
  page.on("response", async (r) => {
    const u = new URL(r.url());
    if (u.pathname !== "/api/auth" || r.request().method() !== "POST") return;
    let body = ""; try { body = await r.text(); } catch (e) {}
    api.push({ status: r.status(), request: r.request().postData() ?? "", response: body });
  });
  await page.goto(BASE + path, { waitUntil: "load" });
  await page.waitForSelector("[data-af] h1", { timeout: 20000 });
  await page.evaluate((m) => { window.__tsMode = m; if (window.__ts) window.__ts.mode = m; }, mode);
  // The check is warmed up on arrival, so the stand-in is already loaded for sign-up and forgot pages.
  if (path === "/sign-up") await page.waitForFunction(() => window.__ts && window.__ts.log.some((l) => l.fn === "render"), null, { timeout: 10000 }).catch(() => {});
  await page.locator("button", { hasText: /necessary only|nur notwendige|uniquement|الضرورية فقط/i }).first().click({ timeout: 2500 }).catch(() => {});
  await page.waitForTimeout(500);
  return { ctx, page, api, errors, close: () => ctx.close() };
}

const setMode = (page, m) => page.evaluate((x) => { window.__tsMode = x; if (window.__ts) window.__ts.mode = x; }, m);
const tsLog = (page) => page.evaluate(() => (window.__ts ? window.__ts.log : []));
// Mail: the lab Worker's EMAIL binding is wrangler's local one, which logs To / Subject and writes the text and
// html to files (the Resend stand-in only sees mail when the binding is absent). Read them from the Worker log.
const PUBLIC_LOG = need("LAB_STATE") + "/logs/public.log";
const mails = async () => {
  const log = fs.readFileSync(PUBLIC_LOG, "utf8").replace(/\x1b\[[0-9;]*m/g, "");
  const out = [];
  for (const m of log.matchAll(/To: (\S+)\nSubject: ([^\n]*)\n\nText: (\S+)\nHTML: (\S+)/g)) {
    const read = (f) => { try { return fs.readFileSync(f, "utf8"); } catch (e) { return ""; } };
    out.push({ to: [m[1]], subject: m[2], text: read(m[3]), html: read(m[4]) });
  }
  return out;
};
const stats = async () => (await fetch(FAKE + "/__stats")).json();
const waitMail = async (to, ms = 20000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const m = (await mails()).filter((x) => x.to.includes(to));
    if (m.length) return m;
    await new Promise((r) => setTimeout(r, 500));
  }
  return [];
};
// The design-system checkbox hides its native input; a real DOM click on the input is what a keyboard or screen-reader user fires.
async function tickConsent(page) {
  await page.waitForSelector('[data-af-consent] input[type="checkbox"]', { state: "attached", timeout: 15000 });
  await page.evaluate(() => { const b = document.querySelector('[data-af-consent] input[type="checkbox"]'); if (b && !b.checked) b.click(); });
  await page.waitForFunction(() => { const b = document.querySelector('[data-af-consent] input[type="checkbox"]'); return !!b && b.checked; }, null, { timeout: 5000 });
}
async function fillSignUp(page, email, { first = "Mallory", last = "Typedname" } = {}) {
  await page.locator('[data-af] input[autocomplete="given-name"]').fill(first);
  await page.locator('[data-af] input[autocomplete="family-name"]').fill(last);
  await page.locator('[data-af] input[type="email"]').fill(email);
  await page.locator('[data-af] input[autocomplete="new-password"]').fill("correct-horse-9");
  await tickConsent(page);
}
const noSideways = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
const hideOverlays = (page) => page.addStyleTag({ content: "[data-contact-btn],[data-jump]{display:none!important}" });
const crop = async (page, file) => { await hideOverlays(page); await page.locator("[data-af]").first().screenshot({ path: `${SCREENS}/${file}` }); };
const coverage = (page) => page.evaluate(() => { const c = window.VamosLocale.coverage(document.querySelector("[data-af]")); return { count: c.count, strings: c.strings, attrs: c.attrs }; });

// ---------- 1. sign-up, password, unseen check, desktop ----------
await step("1440 en: password sign-up runs the unseen check and sends the token; the mail has no typed name", async () => {
  const s0 = await stats();
  const email = mailAddr("pw");
  const t = await openPage({ width: 1440 });
  const log0 = await tsLog(t.page);
  const renders0 = log0.filter((l) => l.fn === "render"), removes0 = log0.filter((l) => l.fn === "remove");
  ok(renders0.length >= 1 && renders0.length - removes0.length === 1, `exactly one live widget, got ${renders0.length} rendered / ${removes0.length} removed`);
  eq([renders0.at(-1).action, renders0.at(-1).language, renders0.at(-1).appearance, renders0.at(-1).execution], ["account", "en", "interaction-only", "execute"], "widget warmed up on arrival");
  eq(log0.some((l) => l.fn === "execute"), false, "nothing executed before submit");
  await fillSignUp(t.page, email);
  await t.page.getByRole("button", { name: /create account/i }).click();
  await t.page.getByRole("heading", { name: /check your email/i }).waitFor({ timeout: 20000 });
  const post = t.api.find((a) => a.request.includes('"mode":"signup"'));
  ok(post, "no sign-up POST seen");
  ok(/"turnstileToken":"lab-token-1"/.test(post.request) && /"idempotencyKey":"[0-9a-f-]{36}"/.test(post.request), "token + key not in the POST");
  eq([post.status, JSON.parse(post.response)], [200, { stage: "sent" }], "answer");
  const s1 = await stats();
  eq(s1.turnstile - s0.turnstile, 1, "one siteverify");
  const got = await waitMail(email);
  ok(got.length === 1, `expected one mail, got ${got.length}`);
  const m = got[0];
  ok(m.subject === "Confirm your Vamos Taxi account", "subject " + m.subject);
  ok(!/Mallory|Typedname/.test(m.html + m.text + m.subject), "typed name in the mail");
  ok(!/Hello/.test(m.html + m.text), "greeting in the mail");
  fs.writeFileSync(`${EVIDENCE}/signup-mail-en.txt`, `to: ${m.to}\nsubject: ${m.subject}\n\n${m.text}\n`);
  await t.close();
  return "token sent, 1 siteverify, mail has no name and no greeting";
});

// ---------- 2. sign-up at 390: closed box (same as before), open box (interactive), then through ----------
await step("390 en: the form looks as before (box closed), no sideways scroll", async () => {
  const t = await openPage({ width: 390, mode: "interactive" });
  eq(await noSideways(t.page), true, "no sideways scroll");
  const box = await t.page.locator("#af-turnstile").boundingBox();
  ok(box && box.height === 0, "closed box has height " + box?.height);
  await crop(t.page, "after-signup-390.png");
  await t.close();
});

await step("390 en: a suspicious visitor sees the small box, in view, no sideways scroll; ticking sends the sign-up", async () => {
  const email = mailAddr("tick");
  const t = await openPage({ width: 390, mode: "interactive" });
  await fillSignUp(t.page, email);
  await t.page.getByRole("button", { name: /create account/i }).click();
  await t.page.locator('#af-turnstile[data-open="true"]').waitFor({ timeout: 10000 });
  await t.page.waitForTimeout(700); // the scroll into view
  const box = await t.page.locator("#ts-standin").boundingBox();
  const vp = t.page.viewportSize();
  ok(box && box.x >= 0 && box.x + box.width <= vp.width && box.y >= 0 && box.y + box.height <= vp.height, "box not fully in view: " + JSON.stringify(box));
  eq(await noSideways(t.page), true, "no sideways scroll with the box open");
  eq(t.api.length, 0, "nothing sent before the tick");
  await crop(t.page, "after-signup-390-box-open.png");
  await t.page.locator("#ts-tick").check();
  await t.page.getByRole("heading", { name: /check your email/i }).waitFor({ timeout: 20000 });
  const post = t.api.find((a) => a.request.includes('"mode":"signup"'));
  ok(post && /"turnstileToken":"lab-token-1"/.test(post.request) && post.status === 200, "sign-up not sent with the token after the tick");
  await t.close();
  return "box opened in view, sent after the tick";
});

// ---------- 3. the check cannot run / is refused ----------
await step("1440 en: check cannot run -> nothing sent, 'Could not send the link. Try again.' shows", async () => {
  const t = await openPage({ width: 1440, mode: "error" });
  await fillSignUp(t.page, mailAddr("err"));
  await t.page.getByRole("button", { name: /create account/i }).click();
  await t.page.getByText("Could not send the link. Try again.").first().waitFor({ timeout: 10000 });
  eq(t.api.length, 0, "no /api/auth call");
  await crop(t.page, "after-signup-1440-check-failed.png");
  await t.close();
});

await step("390 en: Cloudflare refuses the token -> server 403 challenge-failed, same line, no mail", async () => {
  const email = mailAddr("bad");
  const t = await openPage({ width: 390, mode: "badtoken" });
  await fillSignUp(t.page, email);
  await t.page.getByRole("button", { name: /create account/i }).click();
  await t.page.getByText("Could not send the link. Try again.").first().waitFor({ timeout: 10000 });
  const post = t.api.find((a) => a.request.includes('"mode":"signup"'));
  ok(post, "no POST");
  eq([post.status, JSON.parse(post.response)], [403, { ok: false, reason: "challenge-failed" }], "answer");
  await crop(t.page, "after-signup-390-refused.png");
  await t.close();
  await new Promise((r) => setTimeout(r, 2500));
  eq((await mails()).filter((x) => x.to.includes(email)).length, 0, "a mail was sent");
});

// ---------- 4. link sign-up ----------
await step("1440 en: 'Sign up with a link instead' also sends the token", async () => {
  const email = mailAddr("link");
  const t = await openPage({ width: 1440 });
  await t.page.getByRole("button", { name: /sign up with a link instead/i }).click();
  await t.page.locator('[data-af] input[autocomplete="given-name"]').fill("Mallory");
  await t.page.locator('[data-af] input[autocomplete="family-name"]').fill("Typedname");
  await t.page.locator('[data-af] input[type="email"]').fill(email);
  await tickConsent(t.page);
  await t.page.getByRole("button", { name: /email me a link/i }).click();
  await t.page.getByRole("heading", { name: /check your email/i }).waitFor({ timeout: 20000 });
  const post = t.api.find((a) => a.request.includes('"method":"magic"'));
  ok(post && /"turnstileToken":"lab-token-1"/.test(post.request) && post.status === 200, "token missing on the link sign-up");
  const got = await waitMail(email);
  ok(got.length === 1 && !/Mallory|Typedname|Hello/.test(got[0].html + got[0].text), "link sign-up mail has the name or no mail");
  await t.close();
});

// ---------- 5. 'Send another link' needs a fresh token ----------
await step("1440 en: 'Send another link' on the sent page asks again (token 2) and sends", async () => {
  const email = mailAddr("again");
  const t = await openPage({ width: 1440 });
  await fillSignUp(t.page, email);
  await t.page.getByRole("button", { name: /create account/i }).click();
  await t.page.getByRole("heading", { name: /check your email/i }).waitFor({ timeout: 20000 });
  await t.page.getByRole("button", { name: /send another link/i }).click();
  await t.page.getByText("Sent again just now.").waitFor({ timeout: 10000 });
  for (let i = 0; i < 40 && t.api.filter((a) => a.request.includes('"mode":"signup"')).length < 2; i++) await t.page.waitForTimeout(250);
  const posts = t.api.filter((a) => a.request.includes('"mode":"signup"'));
  eq(posts.length, 2, "two sign-up POSTs");
  ok(/lab-token-1/.test(posts[0].request) && /lab-token-2/.test(posts[1].request), "second POST has no fresh token");
  ok(posts[0].request.match(/idempotencyKey":"([^"]+)/)[1] !== posts[1].request.match(/idempotencyKey":"([^"]+)/)[1], "same idempotency key twice");
  await t.close();
});

await step("1440 en: 'Send another link' with the check failing shows the line on the sent page, sends nothing", async () => {
  const t = await openPage({ width: 1440 });
  await fillSignUp(t.page, mailAddr("again2"));
  await t.page.getByRole("button", { name: /create account/i }).click();
  await t.page.getByRole("heading", { name: /check your email/i }).waitFor({ timeout: 20000 });
  await setMode(t.page, "error");
  await t.page.getByRole("button", { name: /send another link/i }).click();
  await t.page.getByText("Could not send the link. Try again.").waitFor({ timeout: 10000 });
  eq(t.api.filter((a) => a.request.includes('"mode":"signup"')).length, 1, "second send must not go out");
  await t.close();
});

// ---------- 6. forgot password ----------
await step("1440 en: forgot password runs the check and sends the token; the answer is 'sent'", async () => {
  const t = await openPage({ width: 1440, path: "/sign-in" });
  await t.page.getByRole("button", { name: /forgot password/i }).click();
  await t.page.waitForFunction(() => window.__ts && window.__ts.log.some((l) => l.fn === "render"), null, { timeout: 10000 });
  await t.page.locator('[data-af] input[type="email"]').fill("lab-admin@vamos.local");
  await t.page.getByRole("button", { name: /send reset link/i }).click();
  await t.page.getByRole("heading", { name: /check your email/i }).waitFor({ timeout: 20000 });
  const post = t.api.find((a) => a.request.includes('"mode":"forgot"'));
  ok(post && /"turnstileToken":"lab-token-1"/.test(post.request) && post.status === 200, "forgot POST without token");
  const render = (await tsLog(t.page)).find((l) => l.fn === "render");
  eq([render.action, render.appearance], ["account", "interaction-only"], "widget");
  await t.close();
});

await step("390 en: forgot password, suspicious visitor: box opens, ticking sends; crop", async () => {
  const t = await openPage({ width: 390, path: "/sign-in", mode: "interactive" });
  await t.page.getByRole("button", { name: /forgot password/i }).click();
  await t.page.locator('[data-af] input[type="email"]').fill("lab-admin@vamos.local");
  await t.page.getByRole("button", { name: /send reset link/i }).click();
  await t.page.locator('#af-turnstile[data-open="true"]').waitFor({ timeout: 10000 });
  await t.page.waitForTimeout(700);
  eq(await noSideways(t.page), true, "no sideways scroll");
  await crop(t.page, "after-forgot-390-box-open.png");
  await t.page.locator("#ts-tick").check();
  await t.page.getByRole("heading", { name: /check your email/i }).waitFor({ timeout: 20000 });
  ok(t.api.some((a) => a.request.includes('"mode":"forgot"') && /turnstileToken/.test(a.request) && a.status === 200), "forgot not sent with token");
  await t.close();
});

await step("390 en: forgot password with the check failing: nothing sent, line shows", async () => {
  const t = await openPage({ width: 390, path: "/sign-in", mode: "error" });
  await t.page.getByRole("button", { name: /forgot password/i }).click();
  await t.page.locator('[data-af] input[type="email"]').fill("lab-admin@vamos.local");
  await t.page.getByRole("button", { name: /send reset link/i }).click();
  await t.page.getByText("Could not send the link. Try again.").first().waitFor({ timeout: 10000 });
  eq(t.api.length, 0, "no call");
  await t.close();
});

// ---------- 7. sign-in is untouched ----------
await step("1440 en: password sign-in sends no token and never loads the check", async () => {
  const t = await openPage({ width: 1440, path: "/sign-in" });
  await t.page.locator('[data-af] input[type="email"]').fill("nobody@example.test");
  await t.page.locator('[data-af] input[autocomplete="current-password"]').fill("wrong-password-1");
  await t.page.getByRole("button", { name: /^sign in$/i }).last().click();
  await t.page.getByText(/don't match/i).waitFor({ timeout: 15000 });
  const post = t.api.find((a) => a.request.includes('"mode":"signin"'));
  ok(post && !/turnstile/i.test(post.request), "sign-in carries a token");
  eq(await tsLog(t.page), [], "Turnstile was never touched on sign-in");
  await t.close();
});

// ---------- 8. languages: nothing untranslated, RTL ----------
for (const lang of ["de", "fr", "ar"]) {
  await step(`390 ${lang}: sign-up form, failure line and sent page have no untranslated string (coverage empty)`, async () => {
    const t = await openPage({ width: 390, lang, mode: "error" });
    if (lang === "ar") eq(await t.page.evaluate(() => document.documentElement.dir), "rtl", "dir");
    const c1 = await coverage(t.page);
    eq(c1.count, 0, "form coverage " + JSON.stringify(c1));
    await fillSignUp(t.page, mailAddr("l" + lang), { first: "Mia", last: "K" });
    await t.page.locator("[data-af] button.vt-btn, [data-af] button").filter({ hasText: /.+/ }).last(); // keep the lookup cheap
    await t.page.evaluate(() => { const b = [...document.querySelectorAll("[data-af-cta] button")][0]; b && b.click(); });
    await t.page.waitForFunction(() => /Could not send|konnte nicht gesendet|Impossible d.envoyer|تعذر إرسال/.test(document.querySelector("[data-af]").innerText), null, { timeout: 10000 });
    const c2 = await coverage(t.page);
    eq(c2.count, 0, "banner coverage " + JSON.stringify(c2));
    await crop(t.page, `after-signup-390-${lang}-check-failed.png`);
    eq(await noSideways(t.page), true, "no sideways scroll");
    await setMode(t.page, "pass");
    await t.page.evaluate(() => { const b = [...document.querySelectorAll("[data-af-cta] button")][0]; b && b.click(); });
    await t.page.waitForFunction(() => document.querySelector("[data-af] [data-af-view='sent']"), null, { timeout: 20000 });
    const c3 = await coverage(t.page);
    eq(c3.count, 0, "sent page coverage " + JSON.stringify(c3));
    await t.close();
    return `forms/banner/sent coverage 0${lang === "ar" ? ", dir=rtl" : ""}`;
  });
}

await step("390 ar: the Cloudflare widget is asked for Arabic (ar-eg), the box opens in view, no sideways scroll", async () => {
  const t = await openPage({ width: 390, lang: "ar", mode: "interactive" });
  const render = (await tsLog(t.page)).find((l) => l.fn === "render");
  eq(render.language, "ar-eg", "widget language");
  await fillSignUp(t.page, mailAddr("arbox"), { first: "Mia", last: "K" });
  await t.page.evaluate(() => { const b = [...document.querySelectorAll("[data-af-cta] button")][0]; b && b.click(); });
  await t.page.locator('#af-turnstile[data-open="true"]').waitFor({ timeout: 10000 });
  await t.page.waitForTimeout(700);
  eq(await noSideways(t.page), true, "no sideways scroll");
  const box = await t.page.locator("#ts-standin").boundingBox();
  ok(box && box.x >= 0 && box.x + box.width <= 390, "box outside the viewport: " + JSON.stringify(box));
  await crop(t.page, "after-signup-390-ar-box-open.png");
  await t.close();
});

for (const lang of ["de", "fr"]) {
  await step(`390 ${lang}: the widget is asked for ${lang}`, async () => {
    const t = await openPage({ width: 390, lang });
    eq((await tsLog(t.page)).find((l) => l.fn === "render").language, lang, "widget language");
    await t.close();
  });
}

// ---------- 9. the server, straight (no browser): fails closed ----------
async function post(host, body, ip) {
  const res = await fetch(host + "/api/auth", {
    method: "POST",
    headers: { "content-type": "application/json", origin: host, "cf-connecting-ip": ip ?? `10.66.${ipN++ % 250}.${Math.floor(Math.random() * 250)}` },
    body: JSON.stringify(body),
  });
  return [res.status, await res.json()];
}
const base = { email: mailAddr("api"), firstName: "Mallory", lastName: "Typedname", consent: true };
const signupPw = { mode: "signup", method: "password", password: "correct-horse-9", ...base };
const signupLink = { mode: "signup", method: "magic", ...base };
const forgotReq = { mode: "forgot", email: "lab-admin@vamos.local" };

await step("API: sign-up and forgot without a token, or with a refused token -> 403 challenge-failed; nothing mailed", async () => {
  const before = (await mails()).length;
  for (const [name, body] of [["password sign-up", signupPw], ["link sign-up", signupLink], ["forgot", forgotReq]]) {
    eq(await post(BASE, body), [403, { ok: false, reason: "challenge-failed" }], `${name}, no token`);
    eq(await post(BASE, { ...body, turnstileToken: "" }), [403, { ok: false, reason: "challenge-failed" }], `${name}, empty token`);
    eq(await post(BASE, { ...body, turnstileToken: "fail" }), [403, { ok: false, reason: "challenge-failed" }], `${name}, refused token`);
  }
  await new Promise((r) => setTimeout(r, 2500));
  eq((await mails()).length, before, "a mail went out");
});

await step("API: with a good token they still work (200 sent); sign-in, code and the checkout link are as before", async () => {
  eq(await post(BASE, { ...signupPw, email: mailAddr("api2"), turnstileToken: "good-1" }), [200, { stage: "sent" }], "password sign-up");
  eq(await post(BASE, { ...signupLink, email: mailAddr("api3"), turnstileToken: "good-2" }), [200, { stage: "sent" }], "link sign-up");
  eq(await post(BASE, { ...forgotReq, turnstileToken: "good-3" }), [200, { stage: "sent" }], "forgot");
  const [st, body] = await post(BASE, { mode: "signin", method: "password", email: "nobody@example.test", password: "wrong-password-1" });
  eq([st, body], [200, { stage: "form", banner: "credentials" }], "password sign-in, no token needed");
  eq((await post(BASE, { mode: "verify-code", email: "nobody@example.test", code: "123456" }))[0], 400, "code sign-in is not asked for a token");
  eq(await post(BASE, { mode: "signin", method: "magic", origin: "checkout", email: "nobody@example.test", turnstileToken: "fail" }), [403, { stage: "form", banner: "send_failed" }], "checkout link keeps its own refusal");
});

await step("API: a sign-up without the tick is refused for the tick (400), before the check is asked", async () => {
  const s0 = await stats();
  eq(await post(BASE, { ...signupPw, email: mailAddr("api4"), consent: false, turnstileToken: "good-4" }), [400, { ok: false, reason: "consent-required" }], "no tick");
  eq((await stats()).turnstile, s0.turnstile, "siteverify was asked");
});

await step("API: dashboard host is unchanged (sign-up 'sent' without any check; forgot-password not asked for a token)", async () => {
  const s0 = await stats();
  eq(await post(DASH, { ...signupPw, email: mailAddr("dash") }), [200, { stage: "sent" }], "dashboard sign-up");
  eq(await post(DASH, forgotReq), [200, { stage: "sent" }], "dashboard forgot");
  eq((await stats()).turnstile, s0.turnstile, "siteverify was asked on the dashboard host");
});

await browser.close();
const failed = results.filter((r) => r.status === "FAIL").length;
fs.writeFileSync(`${EVIDENCE}/results.json`, JSON.stringify({ at: new Date().toISOString(), base: BASE, results }, null, 1));
console.log(`${results.length - failed} pass, ${failed} fail`);
process.exit(failed ? 1 : 0);
