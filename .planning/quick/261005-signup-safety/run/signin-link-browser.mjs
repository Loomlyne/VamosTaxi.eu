// Browser run for the sign-in link (S5, owner answer 2026-10-05): "Email me a link" at /sign-in runs the same
// invisible Cloudflare check as sign-up, and the server needs the token only for an address with no account.
// Existing customers get their link as before; a new address without a passed check gets the same "sent" answer
// and nothing is mailed or made. The lab's Worker is real (built from this branch), its Supabase is local, siteverify
// is the lab's stand-in; Cloudflare's browser script is replaced by the same stand-in as signup-browser.mjs
// (pass / interactive / error / badtoken). Local only, no live site.
//   eval "$(scripts/test-lab/lab.sh env <name>)"
//   node signin-link-browser.mjs <evidenceDir> <screensDir>
import { createRequire } from "node:module";
import fs from "node:fs";

const need = (k) => { if (!process.env[k]) throw new Error(`${k} is not set`); return process.env[k]; };
const WEB = need("WEB_DIR"), BASE = need("LAB_BASE"), DASH = need("LAB_DASH"), FAKE = need("LAB_FAKE"), STATE = need("LAB_STATE");
const [, , EVIDENCE, SCREENS] = process.argv;
fs.mkdirSync(EVIDENCE, { recursive: true });
fs.mkdirSync(SCREENS, { recursive: true });
const { chromium } = createRequire(WEB + "/package.json")("@playwright/test");

const STANDIN = `(function(){
  var n=0,tok=0,W={};
  window.__ts={mode:window.__tsMode||'pass',log:[]};
  window.turnstile={
    render:function(box,o){var id='w'+(++n);W[id]={box:box,o:o};window.__ts.log.push({fn:'render',action:o.action,language:o.language,appearance:o.appearance,execution:o.execution});return id;},
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
let ipN = 40 + Math.floor(Math.random() * 100);
const run = Date.now().toString(36);
const addr = (tag) => `s7-${tag}-${run}@example.test`;
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

// ---- lab accounts (the lab's own local Supabase, admin API with the lab's service key) ----
const env = Object.fromEntries(fs.readFileSync(STATE + "/sb.env", "utf8").split("\n").filter(Boolean).map((l) => {
  const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, "")];
}));
const adminHeaders = { apikey: env.SERVICE_ROLE_KEY, authorization: "Bearer " + env.SERVICE_ROLE_KEY, "content-type": "application/json" };
async function createConfirmed(email) {
  const r = await fetch(env.API_URL + "/auth/v1/admin/users", { method: "POST", headers: adminHeaders, body: JSON.stringify({ email, password: "lab-existing-9-" + run, email_confirm: true }) });
  if (r.status >= 300) throw new Error("could not make the lab customer " + r.status);
}
async function accountExists(email) {
  const r = await fetch(env.API_URL + "/auth/v1/admin/users?per_page=1000", { headers: adminHeaders });
  const j = await r.json();
  return (j.users ?? []).some((u) => u.email === email);
}

const browser = await chromium.launch({ channel: "chromium" });

async function openPage({ width, lang = "en", mode = "pass" }) {
  const ctx = await browser.newContext({
    viewport: { width, height: width >= 1000 ? 900 : 844 },
    extraHTTPHeaders: { "cf-connecting-ip": `10.77.${ipN++ % 250}.${Math.floor(Math.random() * 250)}` },
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
  await page.goto(BASE + "/sign-in", { waitUntil: "load" });
  await page.waitForSelector("[data-af] h1", { timeout: 20000 });
  await page.evaluate((m) => { window.__tsMode = m; if (window.__ts) window.__ts.mode = m; }, mode);
  await page.locator("button", { hasText: /necessary only|nur notwendige|uniquement|الضرورية فقط/i }).first().click({ timeout: 2500 }).catch(() => {});
  await page.waitForTimeout(500);
  return { ctx, page, api, errors, close: () => ctx.close() };
}
const tsLog = (page) => page.evaluate(() => (window.__ts ? window.__ts.log : []));
const setMode = (page, m) => page.evaluate((x) => { window.__tsMode = x; if (window.__ts) window.__ts.mode = x; }, m);
const PUBLIC_LOG = STATE + "/logs/public.log";
const mails = () => {
  const log = fs.readFileSync(PUBLIC_LOG, "utf8").replace(/\x1b\[[0-9;]*m/g, "");
  const out = [];
  for (const m of log.matchAll(/To: (\S+)\nSubject: ([^\n]*)\n\nText: (\S+)\nHTML: (\S+)/g)) {
    const read = (f) => { try { return fs.readFileSync(f, "utf8"); } catch (e) { return ""; } };
    out.push({ to: m[1], subject: m[2], text: read(m[3]), html: read(m[4]) });
  }
  return out;
};
const waitMail = async (to, ms = 20000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const m = mails().filter((x) => x.to === to);
    if (m.length) return m;
    await new Promise((r) => setTimeout(r, 500));
  }
  return [];
};
const settleNoMail = async (to) => { await new Promise((r) => setTimeout(r, 3000)); return mails().filter((x) => x.to === to); };
const stats = async () => (await fetch(FAKE + "/__stats")).json();
const noSideways = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
const hideOverlays = (page) => page.addStyleTag({ content: "[data-contact-btn],[data-jump]{display:none!important}" });
const crop = async (page, file) => { await hideOverlays(page); await page.locator("[data-af]").first().screenshot({ path: `${SCREENS}/${file}` }); };
const coverage = (page) => page.evaluate(() => { const c = window.VamosLocale.coverage(document.querySelector("[data-af]")); return { count: c.count, strings: c.strings, attrs: c.attrs }; });
const sentText = (page) => page.locator("[data-af]").first().innerText();

/** On /sign-in: switch to the link method, wait for the check to be warmed up, type the address. */
async function chooseLink(page, email) {
  await page.getByRole("button", { name: /email me a link instead/i }).click();
  await page.waitForFunction(() => window.__ts && window.__ts.log.some((l) => l.fn === "render"), null, { timeout: 10000 });
  await page.locator('[data-af] input[type="email"]').fill(email);
}
const sendLink = (page) => page.getByRole("button", { name: /email me a link$/i }).click();
const sentHeading = (page) => page.getByRole("heading", { name: /check your email/i }).waitFor({ timeout: 20000 });
const linkPost = (t) => t.api.filter((a) => a.request.includes('"mode":"signin"') && a.request.includes('"method":"magic"'));

const EXISTING = addr("existing");
await createConfirmed(EXISTING);

// ---------- 1. existing customer ----------
await step("390 en: existing customer, unseen check: the page sends the token, the link is mailed to the address", async () => {
  const t = await openPage({ width: 390 });
  eq((await tsLog(t.page)).length, 0, "password sign-in never touched Turnstile before the link was chosen");
  await chooseLink(t.page, EXISTING);
  const render = (await tsLog(t.page)).find((l) => l.fn === "render");
  eq([render.action, render.appearance, render.execution], ["account", "interaction-only", "execute"], "widget warmed up on choosing the link");
  const box = await t.page.locator("#af-turnstile").boundingBox();
  ok(box && box.height === 0, "closed box has height " + box?.height);
  eq(await noSideways(t.page), true, "no sideways scroll");
  await crop(t.page, "after-signin-link-390-form.png");
  await sendLink(t.page);
  await sentHeading(t.page);
  const posts = linkPost(t);
  eq(posts.length, 1, "one link POST");
  ok(/"turnstileToken":"lab-token-1"/.test(posts[0].request) && /"idempotencyKey":"[0-9a-f-]{36}"/.test(posts[0].request), "token + key not in the POST");
  eq([posts[0].status, JSON.parse(posts[0].response)], [200, { stage: "sent" }], "answer");
  const got = await waitMail(EXISTING);
  ok(got.length === 1, `expected one mail to the existing customer, got ${got.length}`);
  fs.writeFileSync(`${EVIDENCE}/signin-link-existing-mail.txt`, `to: ${got[0].to}\nsubject: ${got[0].subject}\n`);
  eq(await noSideways(t.page), true, "no sideways scroll on the sent page");
  await crop(t.page, "after-signin-link-390-sent-existing.png");
  await t.close();
  return "token sent, link mailed (" + got[0].subject + ")";
});

await step("390 en: existing customer, the check cannot run: the request still goes with no token, link mailed, no failure line", async () => {
  const t = await openPage({ width: 390, mode: "error" });
  await chooseLink(t.page, EXISTING);
  const before = mails().filter((x) => x.to === EXISTING).length;
  await sendLink(t.page);
  await sentHeading(t.page);
  const posts = linkPost(t);
  eq(posts.length, 1, "one link POST");
  ok(!/turnstileToken/.test(posts[0].request), "a token was sent");
  eq([posts[0].status, JSON.parse(posts[0].response)], [200, { stage: "sent" }], "answer");
  eq(await t.page.getByText("Could not send the link. Try again.").count(), 0, "failure line shown");
  for (let i = 0; i < 40 && mails().filter((x) => x.to === EXISTING).length <= before; i++) await new Promise((r) => setTimeout(r, 500));
  eq(mails().filter((x) => x.to === EXISTING).length, before + 1, "the existing customer was not mailed");
  await t.close();
});

// ---------- 2. new address ----------
await step("390 en: new address, unseen check: token sent, the account is made and the confirmation mailed", async () => {
  const email = addr("new-pass");
  const t = await openPage({ width: 390 });
  await chooseLink(t.page, email);
  await sendLink(t.page);
  await sentHeading(t.page);
  const posts = linkPost(t);
  ok(/"turnstileToken":"lab-token-1"/.test(posts[0].request), "token missing");
  eq([posts[0].status, JSON.parse(posts[0].response)], [200, { stage: "sent" }], "answer");
  const got = await waitMail(email);
  ok(got.length === 1, `expected one mail to the new address, got ${got.length}`);
  ok(await accountExists(email), "no account was made for the new address");
  fs.writeFileSync(`${EVIDENCE}/signin-link-new-mail.txt`, `to: ${got[0].to}\nsubject: ${got[0].subject}\n`);
  await t.close();
  return "mail: " + got[0].subject;
});

await step("390 en: new address, the check cannot run: the SAME sent page as an existing customer, nothing mailed, no account made", async () => {
  const email = addr("new-err");
  const tNew = await openPage({ width: 390, mode: "error" });
  await chooseLink(tNew.page, email);
  await sendLink(tNew.page);
  await sentHeading(tNew.page);
  const post = linkPost(tNew)[0];
  ok(!/turnstileToken/.test(post.request), "a token was sent");
  eq([post.status, JSON.parse(post.response)], [200, { stage: "sent" }], "answer");
  eq(await tNew.page.getByText("Could not send the link. Try again.").count(), 0, "failure line shown");
  const newText = (await sentText(tNew.page));
  await crop(tNew.page, "after-signin-link-390-sent-new-no-check.png");
  eq((await settleNoMail(email)).length, 0, "a mail went to the new address");
  eq(await accountExists(email), false, "an account was made for the new address");
  // The same sent page, word for word, as the existing customer gets.
  const tOld = await openPage({ width: 390, mode: "error" });
  await chooseLink(tOld.page, EXISTING);
  await sendLink(tOld.page);
  await sentHeading(tOld.page);
  const oldPost = linkPost(tOld)[0];
  const oldText = (await sentText(tOld.page));
  eq([post.status, post.response], [oldPost.status, oldPost.response], "status and body, new vs existing");
  eq(newText.replace(email, "X"), oldText.replace(EXISTING, "X"), "page text, new vs existing");
  await tNew.close(); await tOld.close();
  return "same status, body and page text as an existing customer";
});

await step("390 en: new address, Cloudflare refuses the token: the same sent page, nothing mailed, no account", async () => {
  const email = addr("new-bad");
  const t = await openPage({ width: 390, mode: "badtoken" });
  await chooseLink(t.page, email);
  await sendLink(t.page);
  await sentHeading(t.page);
  const post = linkPost(t)[0];
  ok(/turnstileToken/.test(post.request), "the page should have sent the (refused) token");
  eq([post.status, JSON.parse(post.response)], [200, { stage: "sent" }], "answer");
  eq((await settleNoMail(email)).length, 0, "a mail went to the new address");
  eq(await accountExists(email), false, "an account was made");
  await t.close();
});

await step("390 en: new address, a suspicious visitor sees the small box, in view, no sideways scroll; ticking sends and the mail goes", async () => {
  const email = addr("new-tick");
  const t = await openPage({ width: 390, mode: "interactive" });
  await chooseLink(t.page, email);
  await sendLink(t.page);
  await t.page.locator('#af-turnstile[data-open="true"]').waitFor({ timeout: 10000 });
  await t.page.waitForTimeout(700);
  const box = await t.page.locator("#ts-standin").boundingBox();
  const vp = t.page.viewportSize();
  ok(box && box.x >= 0 && box.x + box.width <= vp.width && box.y >= 0 && box.y + box.height <= vp.height, "box not fully in view: " + JSON.stringify(box));
  eq(await noSideways(t.page), true, "no sideways scroll with the box open");
  eq(linkPost(t).length, 0, "nothing sent before the tick");
  await crop(t.page, "after-signin-link-390-box-open.png");
  await t.page.locator("#ts-tick").check();
  await sentHeading(t.page);
  const post = linkPost(t)[0];
  ok(/"turnstileToken":"lab-token-1"/.test(post.request) && post.status === 200, "link not sent with the token after the tick");
  eq((await waitMail(email)).length, 1, "the new address was not mailed after the tick");
  await t.close();
});

await step("390 en: 'Send another link' asks again (token 2, a fresh key) for the link too", async () => {
  const t = await openPage({ width: 390 });
  await chooseLink(t.page, EXISTING);
  await sendLink(t.page);
  await sentHeading(t.page);
  await t.page.getByRole("button", { name: /send another link/i }).click();
  await t.page.getByText("Sent again just now.").waitFor({ timeout: 10000 });
  for (let i = 0; i < 40 && linkPost(t).length < 2; i++) await t.page.waitForTimeout(250);
  const posts = linkPost(t);
  eq(posts.length, 2, "two link POSTs");
  ok(/lab-token-1/.test(posts[0].request) && /lab-token-2/.test(posts[1].request), "second POST has no fresh token");
  ok(posts[0].request.match(/idempotencyKey":"([^"]+)/)[1] !== posts[1].request.match(/idempotencyKey":"([^"]+)/)[1], "same key twice");
  await setMode(t.page, "error");
  await t.page.getByRole("button", { name: /send another link/i }).click();
  for (let i = 0; i < 40 && linkPost(t).length < 3; i++) await t.page.waitForTimeout(250);
  const third = linkPost(t)[2];
  ok(third && !/turnstileToken/.test(third.request), "the third send should go without a token when the check cannot run");
  eq(await t.page.getByText("Could not send the link. Try again.").count(), 0, "failure line shown");
  await t.close();
});

// ---------- 3. what does not change ----------
await step("1440 en: password sign-in still sends no token and never loads the check", async () => {
  const t = await openPage({ width: 1440 });
  await t.page.locator('[data-af] input[type="email"]').fill("nobody@example.test");
  await t.page.locator('[data-af] input[autocomplete="current-password"]').fill("wrong-password-1");
  await t.page.getByRole("button", { name: /^sign in$/i }).last().click();
  await t.page.getByText(/don't match/i).waitFor({ timeout: 15000 });
  const post = t.api.find((a) => a.request.includes('"mode":"signin"'));
  ok(post && !/turnstile/i.test(post.request), "password sign-in carries a token");
  eq(await tsLog(t.page), [], "Turnstile was never touched");
  await t.close();
});

for (const lang of ["de", "fr", "ar"]) {
  await step(`390 ${lang}: the sign-in link form and the sent page have no untranslated string${lang === "ar" ? ", rtl, no sideways scroll" : ""}`, async () => {
    const t = await openPage({ width: 390, lang });
    if (lang === "ar") eq(await t.page.evaluate(() => document.documentElement.dir), "rtl", "dir");
    const label = await t.page.evaluate(() => window.VamosLocale.t("Email me a link instead"));
    await t.page.getByRole("button", { name: label }).click();
    await t.page.waitForFunction(() => window.__ts && window.__ts.log.some((l) => l.fn === "render"), null, { timeout: 10000 });
    const render = (await tsLog(t.page)).find((l) => l.fn === "render");
    eq(render.language, lang === "ar" ? "ar-eg" : lang, "widget language");
    await t.page.locator('[data-af] input[type="email"]').fill(EXISTING);
    eq((await coverage(t.page)).count, 0, "form coverage");
    await t.page.evaluate(() => { const b = [...document.querySelectorAll("[data-af-cta] button")][0]; b && b.click(); });
    await t.page.waitForFunction(() => document.querySelector("[data-af] [data-af-view='sent']"), null, { timeout: 20000 });
    eq((await coverage(t.page)).count, 0, "sent page coverage");
    eq(await noSideways(t.page), true, "no sideways scroll");
    await t.close();
  });
}

// ---------- 4. the server, straight (no browser): same answer, status, cookies and timing floor ----------
async function post(host, body, ip) {
  const t0 = Date.now();
  const res = await fetch(host + "/api/auth", {
    method: "POST",
    headers: { "content-type": "application/json", origin: host, "cf-connecting-ip": ip ?? `10.88.${ipN++ % 250}.${Math.floor(Math.random() * 250)}` },
    body: JSON.stringify(body),
  });
  const body2 = await res.json();
  const names = res.headers.getSetCookie().map((c) => c.split("=")[0]).sort();
  // supabase-js names its per-flow verifier cookie with a random id for every call (same address, same page), so it
  // is compared by shape; the check below shows two calls for the SAME address already differ in it.
  const shape = names.map((n) => n.replace(/-flow-[0-9a-f]{32}-/, "-flow-<id>-"));
  return { status: res.status, body: body2, ms: Date.now() - t0, cookies: shape, rawCookies: names };
}
const link = (email, extra = {}) => ({ mode: "signin", method: "magic", email, ...extra });

await step("API: existing vs new address with no token: same status, body, cookie names and the same timing floor; only the existing one is mailed", async () => {
  const fresh = addr("api-new");
  const a = await post(BASE, link(EXISTING));
  const b = await post(BASE, link(fresh));
  eq([a.status, a.body, a.cookies], [b.status, b.body, b.cookies], "existing vs new");
  const a2 = await post(BASE, link(EXISTING));
  ok(a.rawCookies.join() !== a2.rawCookies.join(), "the per-flow cookie id is random per call, even for one address");
  eq(a2.cookies, a.cookies, "existing vs existing, by shape");
  eq(a.status, 200, "status");
  ok(a.ms >= 1150 && b.ms >= 1150, `both wait at least the floor (${a.ms} ms / ${b.ms} ms)`);
  ok(Math.abs(a.ms - b.ms) < 600, `the two take about as long (${a.ms} ms / ${b.ms} ms)`);
  eq((await settleNoMail(fresh)).length, 0, "the new address was mailed");
  eq(await accountExists(fresh), false, "an account was made");
  fs.writeFileSync(`${EVIDENCE}/signin-link-api-timing.txt`, `existing, no token: ${a.status} ${JSON.stringify(a.body)} ${a.ms} ms cookies=${a.cookies}\nnew, no token:      ${b.status} ${JSON.stringify(b.body)} ${b.ms} ms cookies=${b.cookies}\n`);
  return `${a.ms} ms vs ${b.ms} ms, cookies ${a.cookies.join("+") || "none"}`;
});

await step("API: new address, empty / refused token -> same neutral answer, nothing mailed; good token -> mailed; an existing customer is not blocked by a refused token", async () => {
  const s0 = await stats();
  const e1 = addr("api-empty"), e2 = addr("api-refused"), g1 = addr("api-good");
  const neutral = { status: 200, body: { stage: "sent" } };
  for (const [email, extra] of [[e1, { turnstileToken: "" }], [e2, { turnstileToken: "fail" }]]) {
    const r = await post(BASE, link(email, extra));
    eq([r.status, r.body], [neutral.status, neutral.body], "neutral answer for " + email);
  }
  eq((await settleNoMail(e1)).length + mails().filter((x) => x.to === e2).length, 0, "a mail went to a new address without a passed check");
  eq([(await post(BASE, link(g1, { turnstileToken: "good-1" }))).status], [200], "good token");
  eq((await waitMail(g1)).length, 1, "the new address with a good token was not mailed");
  eq(await accountExists(e1) || (await accountExists(e2)), false, "an account was made without a check");
  // An existing customer who sends a refused token is not blocked by it.
  const before = mails().filter((x) => x.to === EXISTING).length;
  eq([(await post(BASE, link(EXISTING, { turnstileToken: "fail" }))).status], [200], "existing + refused token");
  for (let i = 0; i < 40 && mails().filter((x) => x.to === EXISTING).length <= before; i++) await new Promise((r) => setTimeout(r, 500));
  eq(mails().filter((x) => x.to === EXISTING).length, before + 1, "the existing customer with a refused token was not mailed");
  const s1 = await stats();
  return `siteverify asked ${s1.turnstile - s0.turnstile} times (new addresses only)`;
});

await step("API: the link SIGN-UP still needs the token; dashboard host unchanged", async () => {
  const base = { email: addr("api-signup"), firstName: "Mia", lastName: "K", consent: true };
  eq([(await post(BASE, { mode: "signup", method: "magic", ...base })).status], [403], "link sign-up, no token");
  eq([(await post(BASE, { mode: "signup", method: "magic", ...base, turnstileToken: "good-9" })).status], [200], "link sign-up, good token");
  const s0 = await stats();
  const d = await post(DASH, link(addr("dash-new")));
  eq([d.status, d.body], [200, { stage: "sent" }], "dashboard link for a new address");
  eq((await stats()).turnstile, s0.turnstile, "siteverify was asked on the dashboard host");
  eq(await accountExists(addr("dash-new")), false, "the dashboard made an account");
});

await browser.close();
const failed = results.filter((r) => r.status === "FAIL").length;
fs.writeFileSync(`${EVIDENCE}/signin-link-results.json`, JSON.stringify({ at: new Date().toISOString(), base: BASE, results }, null, 1));
console.log(`${results.length - failed} pass, ${failed} fail`);
process.exit(failed ? 1 : 0);
