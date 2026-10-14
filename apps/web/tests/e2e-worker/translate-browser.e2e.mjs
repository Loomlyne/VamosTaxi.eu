// Phase 32 plan 12: the three translate surfaces in a real browser (headless Chromium, one lane) against the local
// Worker build of the lab (scripts/test-lab/lab.sh up p32), real routes and the real lab database, at 1440, 1024, 768
// and 390 in en, de, fr and ar.
//   A  dashboard rail: Content holds Reviews only; /pages and /legal open no screen.
//   B  support ticket: customer messages translated with the original underneath (German, Arabic, Italian), same
//      language unchanged, pending -> "Translation not available" after the re-reads, failed; the reply box opens the
//      agreed mail body (empty, ready, failed, outside the four languages, too long) and a closed ticket has none.
//   C  home review card: Translate -> Translating... -> the cached translation -> Show original (no new request),
//      an uncached review fails quietly with Try again, a language switch resets, nothing is requested at page load.
// The lab Worker has no AI binding, so no model is ever called: happy paths come from cache rows seeded by
// translate-seed.sql, failure paths from the missing binding. The ONLY stub is the reply-translate "ready" answer
// (POST /api/staff/tickets/<id>/reply-translate), because a ready reply needs the model; review translation requests
// pass to the real route, held 900 ms so the busy label can be seen. The Gmail URL is read from an intercepted
// window.open (the mail app link and the Gmail link share one body builder, withBody()).
// Needs: eval "$(scripts/test-lab/lab.sh env p32)". Writes PASS/FAIL lines to stdout and /api statuses (no bodies)
// to $API_LOG. Exit 1 on any failure.
import { createRequire } from "node:module";
import fs from "node:fs";
import { execFileSync } from "node:child_process";

const need = (k) => { if (!process.env[k]) throw new Error(`${k} is not set: eval "$(scripts/test-lab/lab.sh env p32)" first`); return process.env[k]; };
const { chromium } = createRequire(need("WEB_DIR") + "/package.json")("@playwright/test");
const BASE = need("LAB_BASE"), DASH = need("LAB_DASH");
const API_LOG = process.env.API_LOG || "/dev/null";
const ONLY_W = process.env.P32_WIDTHS ? process.env.P32_WIDTHS.split(",").map(Number) : null;
const ONLY_L = process.env.P32_LANGS ? process.env.P32_LANGS.split(",") : null;
const ONLY_S = process.env.P32_SURFACES ? process.env.P32_SURFACES.split(",") : null;

// Lab database: native stack psql (lab.sh env). Writes are limited to refreshing the pending fixture's clock.
function psql(sql) {
  if (process.env.LAB_RUNTIME !== "native") throw new Error("translate-browser expects the native lab runtime");
  return execFileSync(need("LAB_PSQL"), [need("LAB_DB_URL"), "-At", "-v", "ON_ERROR_STOP=1", "-c", sql]).toString().trim();
}
const marker = psql("select count(*) from pg_roles where rolname='vamos_throwaway_test_stack'");
if (marker !== "1") throw new Error("not a throwaway lab stack: refusing");

const SIZES = [[1440, 900], [1024, 768], [768, 1024], [390, 844]].filter(([w]) => !ONLY_W || ONLY_W.includes(w));
const LANGS = ["en", "de", "fr", "ar"].filter((l) => !ONLY_L || ONLY_L.includes(l));
const RULE = "-".repeat(20);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const dirOf = (l) => (l === "ar" ? "rtl" : "ltr");

// ---- fixtures (mirror translate-seed.sql) ---------------------------------------------------------------------------
const REFS = Object.fromEntries(psql("select external_ref || '=' || public.review_ref(body) from public.reviews where external_ref like 'p32-rv-%'").split("\n").filter(Boolean).map((l) => l.split("=")));
const REVIEW = {
  "p32-rv-de": { lang: "de", body: "Der Fahrer war pünktlich am Ausgang und hat beim Gepäck geholfen. Sehr angenehme Fahrt.",
    tr: { en: "The driver was on time at the exit and helped with the luggage. A very pleasant ride.", fr: "Le chauffeur était à l'heure à la sortie et a aidé avec les bagages. Un trajet très agréable.", ar: "كان السائق في الموعد عند المخرج وساعد في الأمتعة. رحلة ممتعة جدا." } },
  "p32-rv-ar": { lang: "ar", body: "كان السائق في الموعد عند المخرج وساعدنا في الأمتعة. رحلة مريحة جدا.",
    tr: { en: "The driver was on time at the exit and helped us with the luggage. A very comfortable ride.", de: "Der Fahrer war pünktlich am Ausgang und half uns mit dem Gepäck. Eine sehr bequeme Fahrt.", fr: "Le chauffeur était à l'heure à la sortie et nous a aidés avec les bagages. Un trajet très confortable." } },
};
const MSG = {
  Kessler: { lang: "de", tr: { en: "Hello, I need a child seat on Friday. Please confirm the pickup at exit B.", fr: "Bonjour, j'ai besoin d'un siège enfant vendredi. Merci de confirmer la prise en charge à la sortie B.", ar: "مرحبا، أحتاج إلى مقعد للأطفال يوم الجمعة. يرجى تأكيد الالتقاء عند المخرج B." } },
  Haddad: { lang: "ar", tr: { en: "Hello, I need a child seat on Friday. Please confirm the meeting point at the exit.", de: "Hallo, ich brauche am Freitag einen Kindersitz. Bitte bestätigen Sie den Treffpunkt am Ausgang.", fr: "Bonjour, j'ai besoin d'un siège enfant vendredi. Merci de confirmer le point de rendez-vous à la sortie." } },
  Rossi: { lang: "it", tr: { en: "Good morning, I would like to know if the driver can wait at the terminal exit. Many thanks.", de: "Guten Morgen, ich möchte wissen, ob der Fahrer am Ausgang des Terminals warten kann. Vielen Dank.", fr: "Bonjour, je voudrais savoir si le chauffeur peut attendre à la sortie du terminal. Merci beaucoup.", ar: "صباح الخير، أود أن أعرف إن كان السائق يستطيع الانتظار عند مخرج المبنى. شكرا جزيلا." } },
  Brown: { lang: "en", tr: { de: "Hallo, kann der Fahrer am Ausgang der Ankunftshalle warten? Danke.", fr: "Bonjour, le chauffeur peut-il attendre à la sortie des arrivées ? Merci.", ar: "مرحبا، هل يمكن للسائق الانتظار عند مخرج الوصول؟ شكرا." } },
};
// Visible copy the checks expect, per language (app/vamos-i18n-dict.js and the OpsSupportTicket T table).
const T = {
  translate: { en: "Translate", de: "Übersetzen", fr: "Traduire", ar: "ترجمة" },
  translating: { en: "Translating…", de: "Wird übersetzt …", fr: "Traduction en cours…", ar: "جارٍ الترجمة…" },
  showOriginal: { en: "Show original", de: "Original anzeigen", fr: "Afficher l’original", ar: "عرض النص الأصلي" },
  tryAgain: { en: "Try again", de: "Erneut versuchen", fr: "Réessayer", ar: "أعد المحاولة" },
  notAvailable: { en: "Translation not available", de: "Übersetzung nicht verfügbar", fr: "Traduction indisponible", ar: "الترجمة غير متاحة" },
  hintRaw: {
    en: "The button opens a reply in your mail app. Your text stays as written: the customer’s language is not one of our four.",
    de: "Die Schaltfläche öffnet eine Antwort in Ihrem E-Mail-Programm. Ihr Text bleibt unverändert: Die Sprache des Kunden gehört nicht zu unseren vier.",
    fr: "Le bouton ouvre une réponse dans votre messagerie. Votre texte reste tel quel : la langue du client ne fait pas partie de nos quatre.",
    ar: "يفتح الزر ردًا في تطبيق بريدك. يبقى نصّك كما هو: لغة العميل ليست من لغاتنا الأربع.",
  },
  untranslated: { en: "Couldn’t translate. The e-mail opened with your text as written.", de: "Übersetzung nicht möglich. Die E-Mail wurde mit Ihrem Text unverändert geöffnet.", fr: "Traduction impossible. L’e-mail s’est ouvert avec votre texte tel quel.", ar: "تعذّرت الترجمة. فُتح البريد بنصّك كما كتبته." },
  tooLong: { en: "Your original text was left out: it is too long for your mail app link.", de: "Ihr Originaltext wurde weggelassen: Er ist zu lang für den Link Ihres E-Mail-Programms.", fr: "Votre texte d’origine a été retiré : il est trop long pour le lien de votre messagerie.", ar: "حُذف نصّك الأصلي لأنه أطول من أن يتسع له رابط تطبيق البريد." },
};
const RAIL_REVIEWS = { en: "Reviews", de: "Bewertungen", fr: "Avis", ar: "التقييمات" };
// English UI strings seen on the ticket overlay in the English frame (T table): none may show in a de/fr/ar frame.
const EN_UI = new Set();
const UI_SELS = ["[data-reply-hint]", "[data-reply] label", "[data-reply-note]", "[data-ov-answer] button", "[data-ov-actions] .vt-btn", "[data-ov-actions] [aria-haspopup]", "[data-msg-from]", "[data-msg-status]", "[data-hint]"];
async function uiStrings(page) {
  return page.evaluate((sels) => sels.flatMap((x) => [...document.querySelectorAll(x)]).filter((e) => e.getClientRects().length)
    .map((e) => (e.innerText || e.getAttribute("aria-label") || "").trim()).filter((t) => /[A-Za-z]{3}/.test(t)), UI_SELS);
}
async function noEnglish(page, lang) {
  if (lang === "en") { for (const t of await uiStrings(page)) EN_UI.add(t); return null; }
  if (!EN_UI.size) return null;
  const txt = await page.locator("[data-vt-support]").first().innerText();
  const hit = [...EN_UI].filter((t) => txt.includes(t));
  return ["C3 no English UI string of the English frame shows (T table translated)", hit.length === 0, hit.join(" | ")];
}
const KEYS = ["trNotAvailable", "translatedFrom", "translatedNoLang", "replyHint", "replyHintRaw", "replyHintSame", "replyReady", "replyUntranslated", "mailTooLong", "trLabel", "trText", "fromLine", "noteText", "closedBody"];
const VENDOR = /gemma|google|cloudflare|workers|m2m|openai|anthropic|claude|gpt|machine/i;

// ---- results --------------------------------------------------------------------------------------------------------
const results = [];
const tally = { A: [0, 0], B: [0, 0], C: [0, 0] };
let firstTapClean = 0, firstTapFrames = 0;
function frameResult(surface, id, checks) {
  const failed = checks.filter((c) => !c[1]);
  tally[surface][failed.length ? 1 : 0]++;
  console.log(`${failed.length ? "FAIL" : "PASS"} | ${id} | ${checks.length - failed.length}/${checks.length} checks`);
  for (const [label, ok, ev] of checks) if (!ok || process.env.VERBOSE) console.log(`   ${ok ? "ok" : "NO"} ${label}${ev ? " :: " + String(ev).replace(/\s+/g, " ").slice(0, 300) : ""}`);
  results.push({ surface, id, ok: !failed.length, failed: failed.map((c) => c[0]) });
}
const apiStream = fs.createWriteStream(API_LOG, { flags: "a" });
function logApi(page, frame) {
  page.on("response", (r) => {
    const u = new URL(r.url());
    if (!u.pathname.startsWith("/api/")) return;
    apiStream.write(`${new Date().toISOString()} ${frame} ${r.request().method()} ${u.pathname}${u.search} ${r.status()}\n`);
  });
}

// ---- shared per-frame checks ----------------------------------------------------------------------------------------
async function common(page, { lang, roots, targets, errors }) {
  const out = [];
  const g = await page.evaluate(({ roots, targets }) => {
    const els = roots.flatMap((s) => [...document.querySelectorAll(s)]).filter((e) => e.getClientRects().length);
    const text = els.map((e) => e.innerText).join("\n");
    const small = [];
    for (const s of targets) for (const e of document.querySelectorAll(s)) {
      if (!e.getClientRects().length) continue;
      const b = e.getBoundingClientRect();
      if (b.height + 0.5 < 44) small.push(`${s} ${Math.round(b.width)}x${Math.round(b.height)}`);
    }
    return {
      sideways: document.documentElement.scrollWidth > window.innerWidth + 1,
      sw: document.documentElement.scrollWidth, iw: window.innerWidth,
      htmlLang: document.documentElement.lang, htmlDir: document.documentElement.dir || getComputedStyle(document.documentElement).direction,
      text, small, roots: els.length,
    };
  }, { roots, targets });
  out.push(["C1 no sideways scroll", !g.sideways, `scrollWidth ${g.sw} innerWidth ${g.iw}`]);
  out.push(["C2 html lang/dir", g.htmlLang.slice(0, 2) === lang && g.htmlDir === dirOf(lang), `lang=${g.htmlLang} dir=${g.htmlDir}`]);
  out.push(["C6 touch targets >= 44 px", g.small.length === 0, g.small.join(" | ")]);
  const vendor = VENDOR.test(g.text) || /\bAI\b/.test(g.text);
  out.push(["C7 no vendor/model name, no 'machine', no ß in de", g.roots > 0 && !vendor && !(lang === "de" && /ß/.test(g.text)), `roots=${g.roots} vendor=${vendor}`]);
  const keyHit = KEYS.filter((k) => new RegExp("\\b" + k + "\\b").test(g.text));
  out.push(["C10 no %s, {{ or key names", !keyHit.length && !g.text.includes("{{") && !g.text.includes("%s"), keyHit.join(",")]);
  out.push(["C8 no page error", errors.length === 0, errors.slice(0, 2).join(" | ")]);
  return out;
}
/** C3: in the English frame, every visible English string under the selectors resolves in de, fr and ar. */
async function coverage(page, sels) {
  return page.evaluate((sels) => {
    const miss = {};
    for (const l of ["de", "fr", "ar"]) {
      const m = [];
      for (const e of sels.flatMap((s) => [...document.querySelectorAll(s)])) {
        const r = window.VamosLocale.coverage(e, l);
        const ks = (x) => (Array.isArray(x) ? x.map((y) => (typeof y === "string" ? y : JSON.stringify(y))) : Object.keys(x || {}));
        m.push(...ks(r.strings), ...ks(r.attrs));
      }
      if (m.length) miss[l] = [...new Set(m)];
    }
    return miss;
  }, sels);
}

let browser, dashState;
const liveHits = [];
async function newCtx({ w, h, lang, dash, init }) {
  const ctx = await browser.newContext({
    viewport: { width: w, height: h }, reducedMotion: "reduce", locale: lang === "ar" ? "ar" : "en-GB",
    storageState: dash ? dashState : undefined,
    extraHTTPHeaders: { "cf-connecting-ip": `10.32.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}` },
  });
  await ctx.addInitScript((l) => { try { localStorage.setItem("vamosLang", l); } catch (e) {} }, lang);
  if (init) await ctx.addInitScript(init);
  // Never the live site: any request to a vamostaxi host is aborted and counted as a failure of the run.
  await ctx.route((u) => /(^|\.)vamostaxi\.(site|eu)$/i.test(u.hostname), (r) => { liveHits.push(r.request().url().split("?")[0]); return r.abort(); });
  // /api/fx reaches the internet; answered here as the lab helper does (not part of any translate surface).
  await ctx.route(/\/api\/fx/, (r) => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ base: "CHF", rates: { CHF: 1, EUR: 1, USD: 1, AED: 1 }, rate: 1 }) }));
  return ctx;
}
// The dashboard has no password (ops AuthForm is link-only). Requesting a link per run hits the lab's auth e-mail
// rate limit (email_sent = 2 an hour), so the link is minted with the admin generate_link call (no mail sent) and
// built exactly as provision-account.ts builds it (F12: confirm page, address sealed in `e`), as checkout-account.e2e.mjs
// does. Then the real confirm page is opened and its SIGN IN button pressed in the browser.
async function sealE(email, tokenHash, secret) {
  const enc = new TextEncoder();
  const material = await crypto.subtle.importKey("raw", enc.encode(secret), "HKDF", false, ["deriveKey"]);
  const key = await crypto.subtle.deriveKey({ name: "HKDF", hash: "SHA-256", salt: new Uint8Array(0), info: enc.encode("vamos-f12-sealed-address-v1") }, material, { name: "AES-GCM", length: 256 }, false, ["encrypt"]);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: enc.encode(tokenHash) }, key, enc.encode(email.trim().toLowerCase())));
  return Buffer.from([...iv, ...ct]).toString("base64url");
}
const kv = (file) => Object.fromEntries(fs.readFileSync(file, "utf8").split("\n").filter(Boolean).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).replace(/^"|"$/g, "")]));
async function signIn() {
  const st = need("LAB_STATE");
  const f = kv(need("LAB_ADMIN_FILE"));
  const sb = kv(st + "/sb.env");
  const r = await fetch(sb.API_URL + "/auth/v1/admin/generate_link", {
    method: "POST", headers: { apikey: sb.SERVICE_ROLE_KEY, authorization: "Bearer " + sb.SERVICE_ROLE_KEY, "content-type": "application/json" },
    body: JSON.stringify({ type: "magiclink", email: f.email }),
  });
  const gl = await r.json();
  const hashed = gl.hashed_token ?? gl.properties?.hashed_token;
  const vtype = gl.verification_type ?? gl.properties?.verification_type ?? "magiclink";
  if (!hashed) throw new Error(`generate_link answered ${r.status} without a token`);
  const e = await sealE(f.email, hashed, fs.readFileSync(st + "/hook-secret", "utf8").trim());
  const ctx = await newCtx({ w: 1440, h: 900, lang: "en" });
  const page = await ctx.newPage();
  await page.goto(`${DASH}/login/confirm?token_hash=${encodeURIComponent(hashed)}&type=${vtype}&e=${encodeURIComponent(e)}`, { waitUntil: "load", timeout: 60000 });
  const confirm = page.getByRole("button", { name: /^sign in$/i }).first();
  await confirm.waitFor({ state: "visible", timeout: 30000 }).catch(async () => {
    throw new Error(`no SIGN IN on the confirm page: ${(await page.locator("body").innerText()).replace(/\s+/g, " ").slice(0, 200)}`);
  });
  await page.waitForTimeout(800);
  // The public confirm page carries the cookie sheet; it is set aside so it cannot cover the button.
  await page.addStyleTag({ content: "[data-ck-sheet],[data-ck-veil]{display:none!important}" });
  await confirm.click({ timeout: 15000 }).catch(async (err) => {
    throw new Error(`SIGN IN: ${String(err.message).split("\n")[0]} :: ${(await page.locator("body").innerText()).replace(/\s+/g, " ").slice(0, 160)}`);
  });
  await page.waitForURL((u) => !/\/(login|sign-in)/.test(u.pathname), { timeout: 30000 }).catch(async () => {
    throw new Error(`sign-in did not leave ${new URL(page.url()).pathname}: ${(await page.locator("body").innerText()).replace(/\s+/g, " ").slice(0, 200)}`);
  });
  await page.waitForTimeout(1500);
  console.log(`signed in on the dashboard through the confirm page (${vtype} link from generate_link, no mail sent; landed on ${new URL(page.url()).pathname})`);
  dashState = await ctx.storageState();
  await ctx.close();
}

// ---- A: dashboard rail --------------------------------------------------------------------------------------------
async function surfaceA(w, h, lang) {
  const id = `A ${w} ${lang}`;
  const ctx = await newCtx({ w, h, lang, dash: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e).slice(0, 160)));
  logApi(page, id);
  const checks = [];
  try {
    await page.goto(DASH + "/dashboard", { waitUntil: "load", timeout: 60000 });
    await page.locator("[data-ops-nav] nav, [data-ops-nav] a").first().waitFor({ state: "attached", timeout: 30000 });
    await page.waitForTimeout(800);
    const drawer = await page.evaluate(() => getComputedStyle(document.querySelector("[data-ops-nav]")).position === "fixed");
    if (drawer) { await page.locator("[data-ops-top-start] button").first().click(); await page.waitForTimeout(500); }
    const group = page.locator("[data-ops-nav] button[aria-expanded]:not([data-rail-toggle]):not([aria-haspopup])").first();
    if ((await group.getAttribute("aria-expanded")) !== "true") { await group.click(); await page.waitForTimeout(400); }
    const rail = await page.evaluate(() => {
      const hrefs = [...document.querySelectorAll("[data-ops-nav] a[href]")].map((a) => a.getAttribute("href"));
      const rv = [...document.querySelectorAll('[data-ops-nav] a[href="/reviews"]')];
      const box = rv[0] && rv[0].getClientRects().length ? rv[0].getBoundingClientRect() : null;
      const kids = rv[0] ? rv[0].parentElement.querySelectorAll("a[href]").length : 0;
      return { hrefs, reviews: rv.length, h: box ? box.height : 0, kids, anyPages: document.querySelectorAll('a[href="/pages"], a[href="/legal"]').length };
    });
    checks.push(["A1 Content group holds exactly one link, a[href=/reviews]", rail.reviews === 1 && rail.kids === 1, `reviews=${rail.reviews} children=${rail.kids}`]);
    checks.push(["A2 no /pages or /legal link anywhere", rail.anyPages === 0 && !rail.hrefs.includes("/pages") && !rail.hrefs.includes("/legal"), rail.hrefs.join(" ")]);
    checks.push(["A3 Reviews row >= 44 px", rail.h + 0.5 >= 44, `h=${rail.h}`]);
    checks.push(...(await common(page, { lang, roots: ["[data-ops-nav]"], targets: ['[data-ops-nav] a[href="/reviews"]'], errors })));
    // The rail translates through OpsSidebar's own table (not the dictionary); the one child left is checked both ways.
    const rvText = (await page.locator('[data-ops-nav] a[href="/reviews"]').first().innerText()).trim();
    checks.push(["A5 the Reviews row reads in the frame language", rvText === RAIL_REVIEWS[lang], `text=${rvText}`]);
    if (lang === "en") {
      const miss = await coverage(page, ['[data-ops-nav] a[href="/reviews"]']);
      checks.push(["C3 coverage empty (de, fr, ar) on the Reviews row", Object.keys(miss).length === 0, JSON.stringify(miss)]);
    }
    for (const p of ["/pages", "/legal"]) {
      const resp = await page.goto(DASH + p, { waitUntil: "load", timeout: 60000 });
      await page.waitForTimeout(2500);
      const s = await page.evaluate(() => ({
        shell: !!document.querySelector("[data-ops-main]"),
        content: !!document.querySelector('dc-import[name="OpsContent"], [data-vt-content], [data-content-editor]'),
        title: (document.querySelector("[data-ops-top-title]")?.innerText || "").trim().slice(0, 40),
      }));
      const status = resp ? resp.status() : 0;
      checks.push([`A4 ${p} opens no screen (dashboard shell or not found, no OpsContent)`, !s.content && (s.shell || status === 404), `status=${status} shell=${s.shell} content=${s.content} title=${s.title}`]);
    }
    checks.push(["C8 no page error after /pages and /legal", errors.length === 0, errors.slice(0, 2).join(" | ")]);
  } catch (e) {
    checks.push(["A run", false, String(e.message || e).split("\n")[0]]);
  }
  frameResult("A", id, checks);
  await ctx.close();
}

// ---- B: support ticket --------------------------------------------------------------------------------------------
const MAIL_INIT = `(() => {
  try { localStorage.setItem("vamosOpsMailApp", "gmail"); } catch (e) {}
  window.__opened = [];
  window.open = function (u) { const rec = { u: u || "" }; window.__opened.push(rec); return { opener: null, closed: false, close() {}, location: { set href(v) { rec.u = v; }, get href() { return rec.u; } } }; };
})();`;
async function openTicket(page, surname) {
  await page.goto(DASH + "/support", { waitUntil: "load", timeout: 60000 });
  const search = page.locator("[data-search] input").first();
  await search.waitFor({ state: "visible", timeout: 30000 });
  await page.waitForFunction(() => document.querySelectorAll("[data-kb-body], [data-tbl-scroll] tbody tr").length > 0, null, { timeout: 30000 });
  await search.fill(surname);
  await page.waitForTimeout(400);
  await page.locator("[data-kb-body]:visible, [data-tbl-scroll] tbody tr:visible").first().click();
  await page.locator("[data-msg]").first().waitFor({ timeout: 15000 });
  await page.waitForTimeout(500);
  const who = await page.locator("[data-vt-support]").first().innerText();
  if (!who.includes(surname)) throw new Error(`opened ticket is not ${surname}`);
}
async function bubble(page) {
  return page.evaluate(() => {
    const b = document.querySelector('[data-msg][data-from="customer"]');
    if (!b) return null;
    const a = (s, k) => b.querySelector(s)?.getAttribute(k) ?? null;
    const t = (s) => b.querySelector(s)?.innerText?.trim() ?? null;
    return {
      tr: t("[data-msg-tr]"), trLang: a("[data-msg-tr]", "lang"), trDir: a("[data-msg-tr]", "dir"),
      from: t("[data-msg-from]"), orig: t("[data-msg-orig]"), origLang: a("[data-msg-orig]", "lang"), origDir: a("[data-msg-orig]", "dir"),
      body: t("[data-msg-body]"), status: t("[data-msg-status]"),
    };
  });
}
async function opened(page) { return page.evaluate(() => window.__opened.map((o) => o.u)); }
const bodyOf = (u) => { try { return new URL(u).searchParams.get("body"); } catch { return undefined; } };

async function surfaceB(w, h, lang) {
  const id = `B ${w} ${lang}`;
  const checks = [];
  let stubMode = "pass";
  const STUB = "STUB translation for the reply state check";
  const LONG_IN = ("Thank you for writing to us, we will confirm the meeting point before your ride. ").repeat(12).trim();
  const LONG_OUT = ("Merci de nous avoir écrit, nous confirmerons le point de rendez-vous avant votre trajet. ").repeat(11).trim();
  const ctx = await newCtx({ w, h, lang, dash: true, init: MAIL_INIT });
  let replyPosts = 0;
  await ctx.route(/\/api\/staff\/tickets\/[^/]+\/reply-translate$/, async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    replyPosts++;
    if (stubMode === "ready") return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, data: { status: "ready", text: STUB } }) });
    if (stubMode === "long") return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, data: { status: "ready", text: LONG_OUT } }) });
    return route.continue();
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e).slice(0, 160)));
  logApi(page, id);
  const step = async (label, fn) => { try { await fn(); } catch (e) { checks.push([label, false, String(e.message || e).split("\n")[0]]); } };

  // B1 translated messages: German, Arabic, Italian, English (same language in the English dashboard).
  for (const name of ["Kessler", "Haddad", "Rossi", "Brown"]) {
    await step(`B1 ${name}`, async () => {
      await openTicket(page, name);
      const m = MSG[name];
      const b = await bubble(page);
      if (m.lang === lang) {
        checks.push([`B1 ${name} (${m.lang}) in its own language: original only`, !!b && !b.tr && !!b.body && !b.orig, JSON.stringify(b)]);
      } else {
        checks.push([`B1 ${name} (${m.lang}) translated + original underneath`, !!b && b.tr === m.tr[lang] && b.trLang === lang && b.trDir === dirOf(lang)
          && !!b.from && !!b.orig && b.origLang === m.lang && b.origDir === dirOf(m.lang), JSON.stringify(b)]);
      }
      if (m.lang !== lang) { const ne = await noEnglish(page, lang); if (ne) checks.push([`${ne[0]} (${name})`, ne[1], ne[2]]); }
      if (name === "Kessler" || (name === "Haddad" && lang === "en")) {
        checks.push(...(await common(page, { lang, roots: ["[data-vt-support] [data-thread]", "[data-ov-foot]"], targets: ["[data-ov-answer] button", "[data-ov-actions] .vt-btn"], errors })).map(([l, o, e]) => [`${l} (thread ${name})`, o, e]));
      }
      if (name === "Rossi") {
        // Italian customer: his reply stays as written, no translation call.
        const before = replyPosts;
        await page.locator("[data-reply] textarea").fill("Yes, the driver waits at the terminal exit.");
        await page.waitForTimeout(1800);
        const hint = (await page.locator("[data-reply-hint]").innerText()).trim();
        await page.evaluate(() => { window.__opened.length = 0; });
        await page.locator("[data-ov-answer] button").click();
        await page.waitForTimeout(600);
        const u = (await opened(page))[0] || "";
        checks.push(["B5 Italian customer: raw hint, no reply-translate call, mail body = his text", replyPosts === before && hint === T.hintRaw[lang] && bodyOf(u) === "Yes, the driver waits at the terminal exit.",
          `posts=${replyPosts - before} hint=${hint.slice(0, 60)} body=${bodyOf(u)}`]);
      }
    });
  }

  // B2 pending: Translating... then "Translation not available" after the re-reads (5 x 2 s).
  await step("B2 pending", async () => {
    psql("update public.support_messages m set created_at = now() from public.contact_submissions s where s.id = m.submission_id and s.idempotency_key = 'p32-pend'");
    await openTicket(page, "Weber");
    const first = (await bubble(page))?.status;
    await page.waitForFunction((t) => (document.querySelector('[data-msg][data-from="customer"] [data-msg-status]')?.innerText || "").trim() === t, T.notAvailable[lang], { timeout: 25000 }).catch(() => {});
    const last = (await bubble(page))?.status;
    checks.push(["B2 pending shows Translating…, then Translation not available after the re-reads", first === T.translating[lang] && last === T.notAvailable[lang], `first=${first} last=${last}`]);
    const ne = await noEnglish(page, lang); if (ne) checks.push([`${ne[0]} (pending)`, ne[1], ne[2]]);
  });
  // B3 failed.
  await step("B3 failed", async () => {
    await openTicket(page, "Fischer");
    const b = await bubble(page);
    checks.push(["B3 failed shows the original and Translation not available", !!b && !b.tr && !!b.body && b.status === T.notAvailable[lang], JSON.stringify(b)]);
  });

  // B4 reply states on a ticket whose customer language is not the dashboard's.
  const replyName = lang === "de" ? "Haddad" : "Kessler";
  await step("B4 reply", async () => {
    await openTicket(page, replyName);
    const box = page.locator("[data-reply] textarea");
    const answer = page.locator("[data-ov-answer] button");
    const press = async () => { await page.evaluate(() => { window.__opened.length = 0; }); await answer.click(); await page.waitForTimeout(700); return (await opened(page))[0] || ""; };
    // empty
    let u = await press();
    checks.push(["B4a empty reply opens a blank mail (Gmail link, no body)", u.startsWith("https://mail.google.com/") && bodyOf(u) === null, u.slice(0, 80)]);
    // ready (stubbed answer)
    stubMode = "ready";
    const text1 = "Thank you, the driver will wait at the exit.";
    let wait = page.waitForResponse((r) => r.url().includes("/reply-translate") && r.request().method() === "POST", { timeout: 10000 });
    await box.fill(text1);
    await wait; await page.waitForTimeout(400);
    u = await press();
    checks.push(["B4b ready: body = translation, blank line, 20 hyphens, blank line, original", bodyOf(u) === `${STUB}\n\n${RULE}\n\n${text1}`, JSON.stringify(bodyOf(u))]);
    // failed (real route, no AI binding)
    stubMode = "pass";
    const text2 = "We are sorry, the driver is ready at the exit.";
    wait = page.waitForResponse((r) => r.url().includes("/reply-translate") && r.request().method() === "POST", { timeout: 25000 });
    await box.fill(text2);
    const realAns = await wait; const realStatus = realAns.status(); let realBody = ""; try { realBody = JSON.parse(await realAns.text())?.data?.status; } catch {}
    await page.waitForTimeout(400);
    u = await press();
    const note2 = (await page.locator("[data-reply-note]").innerText().catch(() => "")).trim();
    checks.push(["B4c failed (real route, no binding): his text as written + the note", realBody === "failed" && bodyOf(u) === text2 && note2 === T.untranslated[lang], `route=${realStatus}/${realBody} body=${bodyOf(u)} note=${note2}`]);
    // too long (stubbed answer)
    stubMode = "long";
    wait = page.waitForResponse((r) => r.url().includes("/reply-translate") && r.request().method() === "POST", { timeout: 10000 });
    await box.fill(LONG_IN);
    await wait; await page.waitForTimeout(400);
    const note3 = (await page.locator("[data-reply-note]").innerText().catch(() => "")).trim();
    u = await press();
    checks.push(["B4d too long: translation only + the note", bodyOf(u) === LONG_OUT && note3 === T.tooLong[lang], `len=${(bodyOf(u) || "").length} note=${note3}`]);
    stubMode = "pass";
    if (lang === "en") {
      // Phase 32 strings are also in the dictionary: the reply box and the customer bubble resolve in de, fr, ar.
      const miss = await coverage(page, ["[data-reply]", "[data-msg-from]", "[data-msg-status]"]);
      checks.push(["C3 coverage empty (de, fr, ar) on the reply box and translation lines", Object.keys(miss).length === 0, JSON.stringify(miss)]);
    }
    const ne = await noEnglish(page, lang); if (ne) checks.push([`${ne[0]} (reply box)`, ne[1], ne[2]]);
    checks.push(...(await common(page, { lang, roots: ["[data-ov-foot]"], targets: ["[data-ov-answer] button"], errors })).map(([l, o, e]) => [`${l} (reply box)`, o, e]));
  });
  // B6 closed: no reply box.
  await step("B6 closed", async () => {
    await openTicket(page, "Meier");
    const n = await page.locator("[data-reply]").count();
    const ans = await page.locator("[data-ov-answer]").count();
    checks.push(["B6 closed ticket: no reply box, no ANSWER BY E-MAIL", n === 0 && ans === 0, `reply=${n} answer=${ans}`]);
  });
  checks.push(["C8 no page error (whole surface)", errors.length === 0, errors.slice(0, 2).join(" | ")]);
  frameResult("B", id, checks);
  await ctx.close();
}

// ---- C: home review card ------------------------------------------------------------------------------------------
async function surfaceC(w, h, lang) {
  const id = `C ${w} ${lang}`;
  const checks = [];
  const ctx = await newCtx({ w, h, lang });
  const trReqs = [];
  // Real route, held 900 ms so the busy state is visible (pass-through, not a stub).
  await ctx.route(/\/api\/reviews\/[0-9a-f]{16}\/translation/, async (route) => { trReqs.push(route.request().url()); await sleep(900); await route.continue(); });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e).slice(0, 160)));
  logApi(page, id);
  const cached = lang === "de" ? "p32-rv-ar" : "p32-rv-de";
  const uncached = lang === "de" ? "p32-rv-en" : "p32-rv-de2";
  const card = (k) => page.locator(`[data-rv-card]:has(> blockquote#rvq-${REFS[k]})`);
  const label = (k) => card(k).locator("[data-rv-tr] span").last();
  const text = (k) => card(k).locator("[data-rv-text]");
  try {
    await page.goto(BASE + "/", { waitUntil: "load", timeout: 60000 });
    await page.locator("[data-ck-sheet] [data-ck-acts] button").nth(1).click({ timeout: 6000 }).catch(() => {});
    await page.waitForTimeout(1500);
    if (await page.locator("[data-ck-sheet]").isVisible().catch(() => false)) {
      // The lab has no reachable Turnstile, so the consent POST may not land: hide the sheet for the layout checks.
      await page.addStyleTag({ content: "[data-ck-sheet],[data-ck-veil]{display:none!important}" });
      console.log(`   note ${id}: cookie sheet hidden by style (consent not saved in the lab)`);
    }
    await page.locator("[data-rv-wall]").first().scrollIntoViewIfNeeded({ timeout: 30000 });
    await card(cached).waitFor({ state: "attached", timeout: 30000 });
    await page.waitForTimeout(1500);
    firstTapFrames++;
    const atLoad = trReqs.length;
    if (atLoad === 0) firstTapClean++;
    checks.push(["C-0 no translation request at page load", atLoad === 0, `requests=${atLoad}`]);
    const noBtn = await card("p32-rv-null").locator("[data-rv-tr]").count();
    checks.push(["C-1 review with no known language: no Translate button", noBtn === 0, `buttons=${noBtn}`]);
    const same = { en: "p32-rv-en", de: "p32-rv-de", ar: "p32-rv-ar" }[lang];
    if (same) {
      const n = await card(same).locator("[data-rv-tr]").count();
      checks.push([`C-2 review already in ${lang}: no Translate button`, n === 0, `buttons=${n}`]);
    }
    await card(cached).scrollIntoViewIfNeeded();
    const l0 = (await label(cached).innerText()).trim();
    const orig = (await text(cached).innerText()).trim();
    await card(cached).locator("[data-rv-tr]").click();
    await page.waitForTimeout(250);
    const busyLabel = (await label(cached).innerText()).trim();
    const busy = await card(cached).locator("[data-rv-tr]").getAttribute("aria-busy");
    await page.waitForFunction(([sel, t]) => (document.querySelector(sel)?.innerText || "").trim() === t, [`[data-rv-card]:has(> blockquote#rvq-${REFS[cached]}) [data-rv-tr] span:last-child`, T.showOriginal[lang]], { timeout: 15000 }).catch(() => {});
    const shown = (await text(cached).innerText()).trim();
    const pLang = await text(cached).getAttribute("lang"), pDir = await text(cached).getAttribute("dir");
    const want = REVIEW[cached].tr[lang];
    checks.push(["C-3 Translate -> Translating… (busy)", l0 === T.translate[lang] && busyLabel === T.translating[lang] && busy === "true", `label0=${l0} busy=${busyLabel}/${busy}`]);
    checks.push(["C-4 the cached translation shows, with lang/dir set", shown === want && pLang === lang && pDir === dirOf(lang) && trReqs.length === 1, `shown=${shown.slice(0, 50)} lang=${pLang} dir=${pDir} requests=${trReqs.length}`]);
    await card(cached).locator("[data-rv-tr]").click();
    await page.waitForTimeout(500);
    const back = (await text(cached).innerText()).trim();
    const l2 = (await label(cached).innerText()).trim();
    checks.push(["C-5 Show original -> the original, no new request", back === orig && orig === REVIEW[cached].body && l2 === T.translate[lang] && trReqs.length === 1, `back=${back.slice(0, 40)} label=${l2} requests=${trReqs.length}`]);
    // Failure: no cache row and no AI binding -> quiet note + Try again.
    await card(uncached).scrollIntoViewIfNeeded();
    const origU = (await text(uncached).innerText()).trim();
    await card(uncached).locator("[data-rv-tr]").click();
    await page.waitForFunction(([sel, t]) => (document.querySelector(sel)?.innerText || "").trim() === t, [`[data-rv-card]:has(> blockquote#rvq-${REFS[uncached]}) [data-rv-tr] span:last-child`, T.tryAgain[lang]], { timeout: 20000 }).catch(() => {});
    const failNote = (await card(uncached).locator("[data-rv-tr-note]").innerText().catch(() => "")).trim();
    const failLabel = (await label(uncached).innerText()).trim();
    const stillOrig = (await text(uncached).innerText()).trim();
    checks.push(["C-6 uncached review: Translation not available + Try again, original stays", failNote === T.notAvailable[lang] && failLabel === T.tryAgain[lang] && stillOrig === origU, `note=${failNote} label=${failLabel}`]);
    if (lang === "en") {
      const miss = await coverage(page, ["[data-rv-wall]"]);
      checks.push(["C3 coverage empty (de, fr, ar) on the review wall (Translate, Translation not available, Try again)", Object.keys(miss).length === 0, JSON.stringify(miss)]);
    }
    checks.push(...(await common(page, { lang, roots: ["[data-rv-wall]"], targets: ["[data-rv-tr]"], errors })));
    // Language switch resets: translate again, switch language, the card is back to the original and the label to Translate.
    await card(cached).locator("[data-rv-tr]").click();
    await page.waitForFunction(([sel, t]) => (document.querySelector(sel)?.innerText || "").trim() === t, [`[data-rv-card]:has(> blockquote#rvq-${REFS[cached]}) [data-rv-tr] span:last-child`, T.showOriginal[lang]], { timeout: 15000 }).catch(() => {});
    const other = lang === "fr" ? "en" : "fr";
    await page.evaluate((l) => window.VamosLocale.setLang(l), other);
    await page.waitForTimeout(900);
    const afterText = (await text(cached).innerText()).trim();
    const afterLabel = (await label(cached).innerText()).trim();
    checks.push([`C-7 language switch (${lang} -> ${other}) resets the card`, afterText === REVIEW[cached].body && afterLabel === T.translate[other], `text=${afterText.slice(0, 40)} label=${afterLabel}`]);
  } catch (e) {
    checks.push(["C run", false, String(e.message || e).split("\n")[0]]);
  }
  frameResult("C", id, checks);
  await ctx.close();
}

// ---- run ----------------------------------------------------------------------------------------------------------
const t0 = Date.now();
browser = await chromium.launch();
let code = 0;
try {
  console.log(`start ${new Date().toISOString()} | public ${BASE} | dashboard ${DASH} | refs ${Object.keys(REFS).length}`);
  await signIn();
  for (const [w, h] of SIZES) for (const lang of LANGS) {
    if (!ONLY_S || ONLY_S.includes("A")) await surfaceA(w, h, lang);
    if (!ONLY_S || ONLY_S.includes("B")) await surfaceB(w, h, lang);
    if (!ONLY_S || ONLY_S.includes("C")) await surfaceC(w, h, lang);
  }
} catch (e) {
  console.log(`FAIL | run | ${String(e.message || e).split("\n")[0]}`);
  code = 1;
} finally {
  await browser.close();
  apiStream.end();
}
const fails = results.filter((r) => !r.ok).length + (liveHits.length ? 1 : 0);
console.log(`requests to a live vamostaxi host (aborted): ${liveHits.length}${liveHits.length ? " " + [...new Set(liveHits)].join(" ") : ""}`);
console.log(`frames | A ${tally.A[0]} pass ${tally.A[1]} fail | B ${tally.B[0]} pass ${tally.B[1]} fail | C ${tally.C[0]} pass ${tally.C[1]} fail`);
console.log(`review translation requests before the first tap: 0 in ${firstTapClean} of ${firstTapFrames} home frames`);
console.log(`stubbed route: POST /api/staff/tickets/<id>/reply-translate (ready and too-long states only); everything else real`);
console.log(`duration ${Math.round((Date.now() - t0) / 1000)} s`);
process.exit(code || fails ? 1 : 0);
