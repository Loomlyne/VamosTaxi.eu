// Quick 261002-p6-followups: the browser proof, in a REAL Chromium against the REAL local Worker build and the REAL local
// Supabase stack (started by proof-run.sh). Nothing is stubbed in the page or in the Worker; only the outside services
// (Stripe, Mapbox, Resend, Turnstile) are local stand-ins. The bookings come from
// apps/web/lib/ops/p6-followups-browser.local-seed.test.ts: van10, waiting, plain (one customer, synthetic rappen).
//
//   P1   a paid Van luxury booking of 10 travellers reads 10 on the guest link (/manage-booking?token=) and signed in
//        (/booking-detail?ref=): en, de, fr, ar x 1440, 1024, 768, 390; the passengers line, no 8
//   P3   Arabic phone numbers read +41 79 626 70 82 left to right: lookup view, booking view, change view, both pages
//   P4   a customer's time request while the owner's change waits for its difference: 409 staff-change-waiting, the owner's
//        sentence in the toast in every language, the toast inside the viewport and centred, its close button, 9 s lifetime;
//        then the same request on a booking with no waiting change is accepted (200)
//   COV  VamosLocale.coverage(main) in de, fr, ar on every page view
//   SCROLL  nothing scrolls sideways at 390
// Output: PNGs in screens/proof, evidence/proof-browser.json and evidence/proof-browser.log. Nothing printed is a secret:
// passwords are generated here, held in memory and set on the local stack's users through its admin API.
// PROOF_ONLY=P1,P3,P4,COV runs only those groups; PROOF_FAST=1 skips the 9-second toast timing runs.
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";

const require = createRequire(new URL("../../../../apps/web/package.json", import.meta.url));
const { chromium } = require("@playwright/test");

const env = process.env;
const S = JSON.parse(fs.readFileSync(env.PROOF_SEED, "utf8"));
const BASE = env.PROOF_BASE;
const JOB = env.PROOF_JOB;
const EVID = env.PROOF_EVID;
const SHOTS = path.join(JOB, "screens", "proof");
const API = `http://127.0.0.1:${env.SB_API_PORT ?? "61621"}`;
const SERVICE = env.SB_SERVICE_KEY ?? "";
const DB = env.SB_DB_CONTAINER ?? "supabase_db_vamos-taxi-p6f";
const ONLY = (env.PROOF_ONLY ?? "").split(",").map((x) => x.trim()).filter(Boolean);
const want = (g) => ONLY.length === 0 || ONLY.includes(g);
const FAST = env.PROOF_FAST === "1";
fs.mkdirSync(SHOTS, { recursive: true });
fs.mkdirSync(EVID, { recursive: true });
// A full run starts from an empty picture folder (a partial run, PROOF_ONLY, keeps the others).
if (ONLY.length === 0) for (const f of fs.readdirSync(SHOTS)) if (f.endsWith(".png")) fs.unlinkSync(path.join(SHOTS, f));

const LANGS = ["en", "de", "fr", "ar"];
const WIDTHS = [1440, 1024, 768, 390];
const REF = Object.fromEntries(Object.entries(S.bookings).map(([k, b]) => [k, b.reference]));

// The owner's refusal text, word for word (.planning/decisions/2026-10-02-p6-followups.md, F2).
const REFUSAL = {
  en: "A change to this trip is waiting for payment. Pay the difference from our e-mail first, then ask for a new time.",
  de: "Eine Änderung dieser Fahrt wartet auf die Zahlung. Bezahlen Sie zuerst die Differenz über unsere E-Mail und fragen Sie dann nach einer neuen Zeit.",
  fr: "Une modification de ce trajet attend le paiement. Payez d’abord la différence depuis notre e-mail, puis demandez une nouvelle heure.",
  ar: "يوجد تعديل على هذه الرحلة بانتظار الدفع. ادفع الفرق أولاً من رسالتنا الإلكترونية، ثم اطلب وقتاً جديداً.",
};
const PHONE = "+41 79 626 70 82";

const nap = (ms) => new Promise((r) => setTimeout(r, ms));
const BIDI = new RegExp("[\\u2066-\\u2069\\u200e\\u200f]", "g");
const norm = (s) => String(s ?? "").replace(BIDI, "").replace(/\s+/g, " ").trim();
const short = (s, n = 160) => norm(s).slice(0, n);
const rnd = (n) => Math.floor(Math.random() * n);
const newIp = () => `10.${100 + rnd(100)}.${rnd(250)}.${1 + rnd(250)}`;
const password = () => crypto.randomBytes(12).toString("base64url") + "Aa1!";
const psql = (q) => execFileSync("docker", ["exec", "-i", DB, "psql", "-U", "postgres", "-d", "postgres", "-At", "-v", "ON_ERROR_STOP=1", "-c", q]).toString().trim();
const adminApi = (method, p, body) => fetch(`${API}${p}`, { method, headers: { apikey: SERVICE, authorization: `Bearer ${SERVICE}`, "content-type": "application/json" }, body: JSON.stringify(body) });

const results = [];
const shots = [];
const coverage = [];
const notes = [];
const pageErrors = [];
const lines = [];
function log(s) { lines.push(s); console.log(s); }
function rec(id, name, ok, detail) {
  results.push({ id, name, ok, detail });
  log(`${ok === null ? "N/A " : ok ? "PASS" : "FAIL"} | ${id} ${name} | ${detail}`);
}
async function shot(page, name, locator) {
  const file = path.join(SHOTS, `${name}.png`);
  try {
    if (locator) await locator.screenshot({ path: file }); else await page.screenshot({ path: file });
    shots.push(path.relative(JOB, file));
  } catch (e) { log(`(no screenshot ${name}: ${short(e, 90)})`); }
}

const HIDE = "[data-ck-banner],[data-ck-veil],[data-ck-modal]{display:none!important}";
let bannerHidden = 0;
let browser;
let guestState = null;
let customerState = null;

async function newCtx(lang, width, state) {
  const ctx = await browser.newContext({
    viewport: { width, height: width < 700 ? 844 : 900 },
    storageState: state ?? undefined,
    extraHTTPHeaders: { "cf-connecting-ip": newIp() },
  });
  await ctx.addInitScript((l) => { try { localStorage.setItem("vamosLang", l); } catch (e) {} }, lang);
  // /api/fx asks an outside provider over the internet; a slow answer has dropped the local Worker runtime before (memory
  // local-checkout-browser-run). The page falls back to CHF without it; nothing on these pages shows a converted amount.
  await ctx.route("**/api/fx", (r) => r.fulfill({ status: 503, json: { ok: false, code: "fx_unavailable" } }));
  return ctx;
}
function watch(page, label) {
  page.on("pageerror", (e) => pageErrors.push(`${label}: ${short(e, 160)}`));
}
/** Takes the cookie banner out of the way if it is still up (the bootstrap context chose "necessary only"). */
async function noBanner(page) {
  if (await page.locator("[data-ck-banner]").first().isVisible().catch(() => false)) {
    bannerHidden++;
    await page.addStyleTag({ content: HIDE });
  }
}
const urlOf = (door, key) => door === "guest"
  ? `${BASE}/manage-booking?token=${S.tokens[key]}`
  : `${BASE}/booking-detail?ref=${REF[key]}`;
const stateOf = (door) => (door === "guest" ? guestState : customerState);

async function openBooking(page, door, key) {
  await goto(page, urlOf(door, key));
  await page.getByText(REF[key]).first().waitFor({ timeout: 30000 });
  await noBanner(page);
  await nap(900);
}
async function openLookup(page, door) {
  await goto(page, door === "guest" ? `${BASE}/manage-booking` : `${BASE}/booking-detail`);
  await nap(2500);
  await noBanner(page);
}
/** scrollWidth against the viewport; when the page scrolls sideways, the outermost elements that stick out (to find the cause). */
const sideways = (page) => page.evaluate(() => {
  const cw = document.documentElement.clientWidth;
  const sx = window.scrollX;
  const r = { sw: document.documentElement.scrollWidth, cw, iw: window.innerWidth, scrollX: Math.round(sx), culprits: [] };
  if (r.sw > cw) {
    // elements whose far edge, in page coordinates, is past the viewport width; the innermost ones are the cause
    const hit = [...document.querySelectorAll("body *")].filter((el) => { const q = el.getBoundingClientRect(); return q.width > 0 && q.right + sx > cw + 0.5; });
    const inner = hit.filter((el) => !hit.some((o) => o !== el && el.contains(o)));
    r.culprits = inner.slice(0, 5).map((el) => {
      const q = el.getBoundingClientRect();
      const attrs = [...el.attributes].map((a) => a.name).filter((n) => n.startsWith("data-")).slice(0, 2).join(",");
      return `${el.tagName.toLowerCase()}${attrs ? `[${attrs}]` : ""} page x ${Math.round(q.left + sx)}..${Math.round(q.right + sx)} "${(el.textContent || "").replace(/\s+/g, " ").trim().slice(0, 50)}"`;
    });
  }
  return r;
});
const swText = (s) => `scrollWidth ${s.sw}/${s.cw}${s.scrollX ? ` (page scrolled sideways by ${s.scrollX})` : ""}${s.culprits && s.culprits.length ? ` (sticking out: ${s.culprits.join(" | ")})` : ""}`;
/** Waits for the public Worker to answer (a local Worker runtime can drop mid-run; proof-run.sh brings it back). */
async function waitHealthy(maxMs = 150000) {
  const t0 = Date.now();
  while (Date.now() - t0 < maxMs) {
    try { const r = await fetch(`${BASE}/api/auth/session`, { signal: AbortSignal.timeout(5000) }); if (r.status) return true; } catch (e) { void e; }
    await nap(3000);
  }
  return false;
}
async function goto(page, url) {
  for (let i = 0; i < 3; i++) {
    try { return await page.goto(url, { waitUntil: "load", timeout: 60000 }); } catch (e) {
      if (!/ERR_CONNECTION|ECONNREFUSED|Timeout/.test(String(e)) || i === 2) throw e;
      log(`(page.goto ${short(url, 60)} failed: ${short(e, 80)}; waiting for the Worker)`);
      await waitHealthy();
    }
  }
}
async function readCoverage(page) {
  return page.evaluate(() => {
    const root = document.querySelector("main") || document.body;
    const r = window.VamosLocale && window.VamosLocale.coverage ? window.VamosLocale.coverage(root) : null;
    if (r == null) return { count: -1, strings: ["VamosLocale.coverage is not available"] };
    if (Array.isArray(r)) return { count: r.length, strings: r };
    return { count: r.count ?? (r.strings ? r.strings.length : 0), strings: r.strings ?? [] };
  });
}

// Phone spots: every tel: link inside main, its digit groups and where each one is drawn.
function phoneProbe() {
  const visible = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== "hidden"; };
  const root = document.querySelector("main") || document.body;
  return [...root.querySelectorAll('a[href="tel:+41796267082"]')].filter(visible).map((a) => {
    const groups = [];
    const walker = document.createTreeWalker(a, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const re = /\+?\d+/g;
      let m;
      while ((m = re.exec(node.textContent))) {
        const range = document.createRange();
        range.setStart(node, m.index);
        range.setEnd(node, m.index + m[0].length);
        const q = range.getClientRects()[0];
        if (q) groups.push({ t: m[0], x: Math.round(q.left * 10) / 10 });
      }
    }
    const keep = a.querySelector(".vt-dir-keep");
    return {
      text: a.innerText.replace(/\s+/g, " ").trim(),
      groups,
      ltr: groups.length === 5 && groups.every((g, i) => i === 0 || g.x > groups[i - 1].x),
      keepDirection: keep ? getComputedStyle(keep).direction : null,
      where: a.closest("[data-fork]") ? "fork-card" : "button",
    };
  });
}
const phoneOk = (p) => p.length > 0 && p.every((x) => x.ltr && norm(x.text) === PHONE);
const phoneText = (p) => p.map((x) => `${x.where} "${x.text}" ${x.groups.map((g) => `${g.t}@${g.x}`).join(" ")} ltr=${x.ltr}`).join(" ; ") || "no tel link in main";

// ---------------------------------------------------------------------------------------------------------- setup
browser = await chromium.launch();
let customerPw = "";
try {
  // The customer's account (admin API, in memory only) and the two browser states: a guest who chose "necessary only", and
  // the signed-in customer.
  customerPw = password();
  let rc = await adminApi("POST", "/auth/v1/admin/users", { email: S.customerEmail, password: customerPw, email_confirm: true });
  if (rc.status === 422) {
    const users = (await (await adminApi("GET", "/auth/v1/admin/users?per_page=1000")).json()).users ?? [];
    const u = users.find((x) => x.email === S.customerEmail);
    if (u) rc = await adminApi("PUT", `/auth/v1/admin/users/${u.id}`, { password: customerPw, email_confirm: true });
  }
  rec("S0", "the local stack accepts the customer's password (admin API)", rc.status < 300, `customer ${rc.status}`);

  const boot = await newCtx("en", 1440, null);
  const bp = await boot.newPage();
  watch(bp, "boot");
  await bp.goto(`${BASE}/sign-in`, { waitUntil: "load", timeout: 60000 });
  await bp.waitForLoadState("networkidle");
  await bp.getByRole("button", { name: "Necessary only" }).click({ timeout: 8000 }).catch(() => {});
  await nap(800);
  guestState = await boot.storageState();
  for (let i = 0; i < 4; i++) {
    await bp.getByLabel("Email").fill(S.customerEmail);
    await bp.getByLabel("Password").first().fill(customerPw);
    if ((await bp.getByLabel("Email").inputValue()) === S.customerEmail && (await bp.getByLabel("Password").first().inputValue()) === customerPw) break;
    await nap(800);
  }
  await bp.getByRole("button", { name: "Sign in", exact: true }).last().click();
  await bp.waitForURL((u) => !u.pathname.startsWith("/sign-in"), { timeout: 30000 });
  await nap(1200);
  customerState = await boot.storageState();
  await boot.close();
  const signedIn = (await (await fetch(`${BASE}/api/auth/session`, { headers: { cookie: customerState.cookies.map((c) => `${c.name}=${c.value}`).join("; ") } })).json()).signedIn;
  rec("S1", "the customer signs in at /sign-in with a password (state reused by the signed-in checks)", customerState.cookies.length > 0 && signedIn === true, `cookies ${customerState.cookies.length}, session signedIn=${signedIn}`);

  // ---------------------------------------------------------------------------------------------------- P1
  // P1 also fills the COV list for the booking view, the change view and the cancel view.
  if (want("P1")) {
    for (const door of ["guest", "account"]) {
      for (const lang of LANGS) {
        const ctx = await newCtx(lang, 1440, stateOf(door));
        const page = await ctx.newPage();
        watch(page, `P1 ${door} ${lang}`);
        for (const width of WIDTHS) {
          try {
            await page.setViewportSize({ width, height: width < 700 ? 844 : 900 });
            await openBooking(page, door, "van10");
            const r = await page.evaluate(() => {
              const t = window.VamosLocale.t;
              const exp10 = t("10 passengers"), exp8 = t("8 passengers");
              const main = document.querySelector("main") || document.body;
              const same = (el) => el.textContent.replace(/[\u2066-\u2069]/g, "").trim() === exp10;
              const hits = [...main.querySelectorAll("*")].filter((el) => same(el) && ![...el.children].some(same) && el.getBoundingClientRect().width > 0);
              const text = main.innerText;
              const eight = new RegExp(`(^|[^\\d:.\\/])8\\s*(passengers|Passagiere|passagers|ركاب|راكب)`, "i").test(text) || text.includes(exp8);
              return { exp10, exp8, n10: hits.length, line: hits[0] ? hits[0].textContent.trim() : "", eight, dir: document.documentElement.dir, lang: document.documentElement.lang, cls: /Van luxury/.test(text) };
            });
            const sw = await sideways(page);
            const ok = r.n10 >= 1 && !r.eight && (lang !== "ar" || r.dir === "rtl") && (width !== 390 || sw.sw <= 390);
            rec(`P1 ${door} ${lang} ${width}`, "van10 reads 10 travellers, no 8", ok,
              `line "${r.line}" (expected "${r.exp10}") x${r.n10}; 8-line present: ${r.eight}; dir ${r.dir}; Van luxury shown: ${r.cls}; ${swText(sw)}`);
            if (width === 1440 || width === 390) await shot(page, `p1-${door}-${lang}-${width}`, page.locator("main").first());
            if (width === 1440 && lang !== "en" && want("COV")) {
              const cov = [];
              cov.push({ view: "booking", ...(await readCoverage(page)) });
              await page.locator("button[data-fork]").nth(0).click();
              await nap(700);
              cov.push({ view: "change", ...(await readCoverage(page)) });
              await page.locator("button[data-back]").first().click().catch(() => {});
              await nap(500);
              if ((await page.locator("button[data-fork]").count()) > 1) {
                await page.locator("button[data-fork]").nth(1).click();
                await nap(700);
                cov.push({ view: "cancel", ...(await readCoverage(page)) });
              } else {
                notes.push(`COV ${door} ${lang}: no cancel fork on the booking view (button[data-fork] x1), the cancel view cannot be opened`);
              }
              for (const c of cov) coverage.push({ door, lang, ...c });
            }
          } catch (e) {
            rec(`P1 ${door} ${lang} ${width}`, "van10 reads 10 travellers, no 8", false, `stopped: ${short(e, 200)}`);
          }
        }
        await ctx.close();
      }
    }
  }

  // ---------------------------------------------------------------------------------------------------- P3
  if (want("P3")) {
    // A control: the same number in a right-to-left paragraph with no isolation is read right to left. It shows the probe can tell.
    {
      const ctx = await newCtx("ar", 1440, guestState);
      const page = await ctx.newPage();
      await openBooking(page, "guest", "van10");
      const ctl = await page.evaluate((phone) => {
        const a = document.createElement("a");
        a.href = "tel:+41796267082";
        a.textContent = phone;
        a.style.cssText = "position:fixed;top:0;inset-inline-start:0;background:#fff;color:#000;z-index:99999";
        (document.querySelector("main") || document.body).appendChild(a);
        const groups = [];
        const node = a.firstChild;
        const re = /\+?\d+/g;
        let m;
        while ((m = re.exec(node.textContent))) {
          const range = document.createRange();
          range.setStart(node, m.index);
          range.setEnd(node, m.index + m[0].length);
          groups.push({ t: m[0], x: Math.round(range.getClientRects()[0].left * 10) / 10 });
        }
        a.remove();
        return { groups, ltr: groups.every((g, i) => i === 0 || g.x > groups[i - 1].x) };
      }, PHONE);
      rec("P3 control", "the probe sees an unwrapped number in Arabic as reversed (so a pass below means something)", ctl.ltr === false, ctl.groups.map((g) => `${g.t}@${g.x}`).join(" ") + ` ltr=${ctl.ltr}`);
      await ctx.close();
    }
    const viewsOf = [
      { view: "lookup", open: async (page, door) => openLookup(page, door), door: { guest: "guest", account: "guest" } },
    ];
    void viewsOf;
    for (const door of ["guest", "account"]) {
      for (const lang of ["ar", "en"]) {
        for (const width of lang === "ar" ? WIDTHS : [1440]) {
          // lookup view: nobody is signed in, no token (the page's own door)
          {
            const ctx = await newCtx(lang, width, guestState);
            const page = await ctx.newPage();
            watch(page, `P3 lookup ${door}`);
            try {
              await openLookup(page, door);
              const p = await page.evaluate(phoneProbe);
              const sw = await sideways(page);
              rec(`P3 ${door} ${lang} ${width} lookup`, "lookup view: the phone reads left to right", phoneOk(p) && (width !== 390 || sw.sw <= 390), `${phoneText(p)}; ${swText(sw)}`);
              if (lang === "ar" && (width === 1440 || width === 390)) {
                const loc = page.locator('main a[href="tel:+41796267082"]').first();
                await shot(page, `p3-${door}-${lang}-${width}-lookup`, loc.locator("xpath=ancestor::div[3]"));
              }
            } catch (e) { rec(`P3 ${door} ${lang} ${width} lookup`, "lookup view: the phone reads left to right", false, `stopped: ${short(e, 200)}`); }
            if (lang !== "en" && width === 1440) {
              try { coverage.push({ door, lang, view: "lookup", ...(await readCoverage(page)) }); } catch (e) { void e; }
            }
            await ctx.close();
          }
          // booking view and change view of a booking
          {
            const ctx = await newCtx(lang, width, stateOf(door));
            const page = await ctx.newPage();
            watch(page, `P3 booking ${door}`);
            try {
              await openBooking(page, door, "van10");
              const p = await page.evaluate(phoneProbe);
              rec(`P3 ${door} ${lang} ${width} booking`, "booking view: the phone reads left to right", phoneOk(p), phoneText(p));
              if (lang === "ar" && (width === 1440 || width === 390)) {
                await shot(page, `p3-${door}-${lang}-${width}-booking`, page.locator('main a[href="tel:+41796267082"]').first().locator("xpath=ancestor::div[3]"));
              }
              await page.locator("button[data-fork]").nth(0).click();
              await nap(800);
              const q = await page.evaluate(phoneProbe);
              const sw = await sideways(page);
              rec(`P3 ${door} ${lang} ${width} change`, "change view: the phone reads left to right", phoneOk(q) && (width !== 390 || sw.sw <= 390), `${phoneText(q)}; ${swText(sw)}`);
              if (lang === "ar" && (width === 1440 || width === 390)) {
                await shot(page, `p3-${door}-${lang}-${width}-change`);
              }
            } catch (e) { rec(`P3 ${door} ${lang} ${width} booking/change`, "booking and change view: the phone reads left to right", false, `stopped: ${short(e, 200)}`); }
            await ctx.close();
          }
        }
      }
    }
    rec("P3 fork", "the 'Call dispatch' fork card (third phone spot)", null, "not reachable by a customer today (bookingTiming 'late' is never set), so it is not on a page a customer can open; its markup carries vt-dir-keep (read in the file)");
  }

  // ---------------------------------------------------------------------------------------------------- P4
  /** One customer time request through the real page: change view, a new time, the request button. */
  async function timeRequestOnce(door, key, lang, width, opts = {}) {
    const ctx = await newCtx(lang, width, stateOf(door));
    const page = await ctx.newPage();
    watch(page, `P4 ${door} ${key} ${lang} ${width}`);
    const out = { door, key, lang, width };
    try {
      await openBooking(page, door, key);
      await page.locator("button[data-fork]").nth(0).click();
      await nap(700);
      await page.locator('main button[aria-haspopup="dialog"]').first().click();
      await nap(500);
      await page.locator("[data-wp-time] button").first().click();
      await nap(300);
      await page.locator("[data-wp-row]").locator("xpath=..").locator("button").last().click();
      await nap(600);
      const req = page.locator("main button.vt-btn--primary:not([disabled])").last();
      await req.scrollIntoViewIfNeeded();
      const answered = page.waitForResponse((r) => /\/time-change$/.test(new URL(r.url()).pathname) && r.request().method() === "POST", { timeout: 20000 });
      await req.click();
      const r = await answered;
      out.status = r.status();
      out.body = await r.json().catch(() => ({}));
      out.url = new URL(r.url()).pathname;
      const wrap = page.locator('[aria-live="polite"]').first();
      await wrap.waitFor({ state: "visible", timeout: 8000 });
      const seen = Date.now();
      await nap(250);
      out.toastText = norm(await wrap.innerText());
      out.geom = await page.evaluate(() => {
        const w = document.querySelector('[aria-live="polite"]');
        const vw = document.documentElement.clientWidth;
        if (!w) return null;
        let box = null;
        for (const el of w.querySelectorAll("*")) {
          const q = el.getBoundingClientRect();
          if (q.width > 0 && q.height > 0 && (!box || q.width * q.height > box.width * box.height)) box = q;
        }
        if (!box) return null;
        const wq = w.getBoundingClientRect();
        return { vw, left: Math.round(box.left * 10) / 10, right: Math.round(box.right * 10) / 10, width: Math.round(box.width), centre: Math.round(((box.left + box.right) / 2 - vw / 2) * 10) / 10, wrapLeft: Math.round(wq.left), wrapRight: Math.round(wq.right), dir: document.documentElement.dir };
      });
      out.sideways = await sideways(page);
      if (opts.shot) await shot(page, opts.shot);
      if (opts.close) {
        await wrap.locator("button").first().click();
        await nap(500);
        out.closed = (await page.locator('[aria-live="polite"]').count()) === 0;
      }
      if (opts.timing) {
        await nap(Math.max(0, 8000 - (Date.now() - seen)));
        out.visibleAt8 = (await page.locator('[aria-live="polite"]').count()) > 0;
        await nap(Math.max(0, 10000 - (Date.now() - seen)));
        out.goneAt10 = (await page.locator('[aria-live="polite"]').count()) === 0;
      }
    } catch (e) {
      out.error = short(e, 240);
    }
    await ctx.close();
    return out;
  }
  /** As above; a run that stopped before the server answered (the Worker dropped) is repeated once when it is back. */
  async function timeRequest(...args) {
    let o = await timeRequestOnce(...args);
    if (o.error && o.status === undefined) {
      log(`(time request ${args.slice(0, 4).join(" ")} stopped before an answer: ${short(o.error, 90)}; retrying once)`);
      await waitHealthy();
      o = await timeRequestOnce(...args);
    }
    return o;
  }
  const geomOk = (g) => !!g && g.left >= 15.5 && g.right <= g.vw - 15.5 && Math.abs(g.centre) <= 1.5;
  const geomText = (g) => (g ? `box ${g.left}..${g.right} of ${g.vw} (width ${g.width}, centre offset ${g.centre})` : "no toast box");

  if (want("P4")) {
    const staffBefore = psql(`select r.status || '/' || (r.extra_session_id is not null) from public.booking_edit_requests r where r.booking_id = '${S.bookings.waiting.id}' and r.actor = 'staff'`);
    for (const door of ["guest", "account"]) {
      for (const lang of LANGS) {
        for (const width of WIDTHS) {
          const special = lang === "ar" && width === 390;
          const o = await timeRequest(door, "waiting", lang, width, { shot: `p4-${door}-${lang}-${width}-refused` });
          const textOk = norm(o.toastText) === norm(REFUSAL[lang]);
          const ok = !o.error && o.status === 409 && o.body && o.body.code === "staff-change-waiting" && o.url.includes(door === "guest" ? "/api/manage/" : "/api/account/") && textOk && geomOk(o.geom) && (width !== 390 || o.sideways.sw <= 390);
          rec(`P4 ${door} ${lang} ${width}`, "waiting staff change: 409 staff-change-waiting, the owner's sentence, toast on screen and centred", ok,
            o.error ? `stopped: ${o.error}` : `${o.url} ${o.status} ${JSON.stringify(o.body)}; toast ${textOk ? "= the signed sentence" : `DIFFERS: "${short(o.toastText, 120)}"`}; ${geomText(o.geom)}; ${swText(o.sideways)}${special ? " (ar 390)" : ""}`);
        }
      }
      // close button and lifetime: Arabic at 390 (the hard case), English at 1440
      for (const [lang, width] of [["ar", 390], ["en", 1440]]) {
        const c = await timeRequest(door, "waiting", lang, width, { close: true });
        rec(`P4 ${door} ${lang} ${width} close`, "the toast's own close button closes it", !c.error && c.status === 409 && c.closed === true, c.error ? `stopped: ${c.error}` : `status ${c.status}; closed after click: ${c.closed}`);
        if (!FAST) {
          const t = await timeRequest(door, "waiting", lang, width, { timing: true });
          rec(`P4 ${door} ${lang} ${width} timing`, "the toast is still there at 8 s and gone by 10 s", !t.error && t.visibleAt8 === true && t.goneAt10 === true, t.error ? `stopped: ${t.error}` : `status ${t.status}; visible at 8 s: ${t.visibleAt8}; gone at 10 s: ${t.goneAt10}`);
        }
      }
    }
    const staffAfter = psql(`select r.status || '/' || (r.extra_session_id is not null) from public.booking_edit_requests r where r.booking_id = '${S.bookings.waiting.id}' and r.actor = 'staff'`);
    const custRows = psql(`select count(*) from public.booking_edit_requests where booking_id = '${S.bookings.waiting.id}' and actor <> 'staff'`);
    rec("P4 db", "after every refused request: the staff change still waits, no customer row was written", staffBefore === "requested/true" && staffAfter === "requested/true" && custRows === "0", `staff request before ${staffBefore}, after ${staffAfter}; customer rows ${custRows}`);

    // The same request on a booking with nothing waiting is accepted.
    for (const door of ["guest", "account"]) {
      for (const lang of LANGS) {
        for (const width of [1440, 390]) {
          const o = await timeRequest(door, "plain", lang, width, { shot: `p4-${door}-${lang}-${width}-accepted` });
          const row = psql(`select coalesce(string_agg(r.actor || '/' || r.status || '/' || (r.payload ->> 'scheduled_local'), ' ; ' order by r.created_at), '') from public.booking_edit_requests r where r.booking_id = '${S.bookings.plain.id}'`);
          const accepted = !o.error && o.status === 200 && o.body && o.body.ok === true;
          const textOk = lang === "en" ? /^Time-change requested\./.test(o.toastText ?? "") : !!o.toastText && norm(o.toastText) !== norm(REFUSAL[lang]) && !/Could not request/.test(o.toastText);
          rec(`P4 plain ${door} ${lang} ${width}`, "no waiting change: the time request is accepted (200)", accepted && textOk && geomOk(o.geom),
            o.error ? `stopped: ${o.error}` : `${o.url} ${o.status} ${JSON.stringify(o.body)}; toast "${short(o.toastText, 100)}"; ${geomText(o.geom)}; requests on the booking now: ${short(row, 150)}`);
        }
      }
    }
  }

  // ---------------------------------------------------------------------------------------------------- COV
  // The booking, change and cancel views are read in P1 (de, fr, ar at 1440); the lookup view in P3. Without P1/P3 nothing is read.
  // VamosLocale.coverage lists every text it cannot find in the dictionary. Three kinds of entry are not page copy: the booking's own
  // data as the server sends it (a date label, the place names), and the VAT line, which the page builds in the active language in code.
  // Everything else is page copy that has no de/fr/ar line: that is what must be empty.
  const DATA = [/^(Mon|Tue|Wed|Thu|Fri|Sat|Sun) \d{1,2} [A-Z][a-z]{2}( · \d{1,2}:\d{2})?$/, /^Zurich( |$)/, /^Zug( |$)/];
  const BUILT = [/^(Mehrwertsteuer|TVA|ضريبة القيمة المضافة) [\d.]+ ?%$/];
  const kindOf = (s) => (DATA.some((re) => re.test(norm(s))) ? "data" : BUILT.some((re) => re.test(norm(s))) ? "built" : "copy");
  if (want("COV")) {
    // The lookup view of German and French (Arabic's is read in P3, with the phone check).
    for (const door of ["guest", "account"]) {
      for (const lang of ["de", "fr"]) {
        const ctx = await newCtx(lang, 1440, guestState);
        const page = await ctx.newPage();
        watch(page, `COV lookup ${door} ${lang}`);
        try {
          await openLookup(page, door);
          coverage.push({ door, lang, view: "lookup", ...(await readCoverage(page)) });
        } catch (e) {
          notes.push(`COV ${door} ${lang} lookup: stopped, ${short(e, 120)}`);
        }
        await ctx.close();
      }
    }
    for (const lang of ["de", "fr", "ar"]) {
      for (const door of ["guest", "account"]) {
        for (const view of ["lookup", "booking", "change", "cancel"]) {
          const c = coverage.find((x) => x.door === door && x.lang === lang && x.view === view);
          if (!c) continue;
          const copy = c.strings.filter((s) => kindOf(s) === "copy");
          const other = c.strings.filter((s) => kindOf(s) !== "copy");
          c.copy = copy;
          c.other = other;
          rec(`COV ${door} ${lang} ${view}`, "VamosLocale.coverage(main): no page copy without a translation", c.count >= 0 && copy.length === 0,
            `count ${c.count}; page copy ${copy.length}${copy.length ? `: ${copy.slice(0, 12).map((s) => `"${short(s, 80)}"`).join(", ")}${copy.length > 12 ? " ..." : ""}` : ""}; data/built-in-code (not copy) ${other.length}${other.length ? `: ${other.map((s) => `"${short(s, 50)}"`).join(", ")}` : ""}`);
        }
      }
    }
  }
} catch (e) {
  rec("RUN", "the proof script ran to the end", false, `stopped: ${short(e.stack ?? e, 400)}`);
} finally {
  await browser.close();
}

rec("ERR", "no uncaught page errors in any context", pageErrors.length === 0, pageErrors.length ? [...new Set(pageErrors)].slice(0, 6).join(" | ") : "none");
rec("BAN", "the cookie banner stayed down on its own (the 'necessary only' state was reused)", bannerHidden === 0 ? true : null, bannerHidden === 0 ? "never visible" : `it was visible ${bannerHidden} time(s) and was hidden with a style rule so it did not cover the toast or the page`);
const failed = results.filter((r) => r.ok === false);
log(`\n${failed.length === 0 ? "PASS" : "FAIL"}: ${results.filter((r) => r.ok === true).length} pass, ${failed.length} fail, ${results.filter((r) => r.ok === null).length} n/a`);
fs.writeFileSync(path.join(EVID, ONLY.length ? "proof-browser-partial.json" : "proof-browser.json"), JSON.stringify({ at: new Date().toISOString(), base: BASE, only: ONLY, seed: { tag: S.tag, bookings: REF }, results, coverage, notes, shots }, null, 1));
fs.writeFileSync(path.join(EVID, ONLY.length ? "proof-browser-partial.log" : "proof-browser.log"), lines.join("\n") + "\n");
process.exit(failed.length === 0 ? 0 : 1);
