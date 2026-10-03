// 261003 contact button (owner-signed direction B): every public page in a real Chromium.
// usage: node contact-button-browser.e2e.mjs <base url> <worker|static> <out dir> [only=a,b]
//   worker: the local Worker build (opennextjs-cloudflare build + wrangler dev --local, no database);
//           public routes, /de|/fr|/ar prefixes, plus the Next pages the middleware does not hand to a mock.
//   static: the synced mocks (node scripts/sync-dc-mock-to-public.mjs) served from apps/web/public.
//           Static skips /contact and /account: both leave the static path for the Worker routes (/contact, /sign-in); worker mode proves them.
// No database behind either: /api/** is answered in the browser (consent state chosen or not, quote and
// checkout reads where a page needs them). One PASS/FAIL line per check, a JSON summary, screenshots.
import { mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(new URL("../../package.json", import.meta.url));
const { chromium } = require("@playwright/test");
const [base, mode, out, onlyArg] = process.argv.slice(2);
if (!base || !mode || !out) throw new Error("usage: <base> <worker|static> <out dir>");
mkdirSync(out, { recursive: true });
const ONLY = (onlyArg || "").replace(/^only=/, "").split(",").filter(Boolean);
const want = (k) => ONLY.length === 0 || ONLY.includes(k);

const results = [];
const log = (ok, what, detail = "") => {
  results.push({ ok, what, detail: String(detail).slice(0, 300) });
  console.log(ok ? "PASS" : "FAIL", "|", what, detail ? "| " + String(detail).slice(0, 200) : "");
};

const LANGS = ["en", "de", "fr", "ar"];
const WIDTHS = [1440, 1024, 768, 390];
const DC = [
  ["/", "home/home"], ["/about", "pages/about"], ["/faq", "pages/faq"], ["/contact", "pages/contact"],
  ["/terms", "pages/terms"], ["/privacy", "pages/privacy"], ["/cookies", "pages/cookies"],
  ["/cancellation", "pages/cancellation"], ["/imprint", "pages/imprint"], ["/sign-in", "pages/sign-in"],
  ["/sign-up", "pages/sign-in"], ["/sign-in/confirm", "pages/sign-in-confirm"], ["/reset-password", "pages/reset-password"],
  ["/manage-booking", "pages/manage-booking"], ["/booking-detail", "pages/booking-detail"], ["/account", "pages/account"],
  ["/bookings", "pages/bookings"], ["/coming-soon", "pages/coming-soon"], ["/sitemap", "pages/sitemap"],
];
/** Next pages reached by customers (worker only): the shell's float. */
const NEXT = ["/review", "/confirmation", "/no-such-page-261003"];
const HREFS = (lang) => ["https://wa.me/41796267082", "tel:+41796267082", "mailto:info@vamostaxi.site", lang === "en" ? "/contact" : `/${lang}/contact`];

const url = (route, lang, file) => {
  if (mode === "static") return `${base}/app/${file}.html`;
  if (lang === "en") return base + route;
  return base + "/" + lang + (route === "/" ? "" : route);
};

let consentChosen = true;
async function newCtx(browser, w, lang, h) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h ?? (w <= 680 ? 844 : 900) }, isMobile: w <= 680, hasTouch: w <= 680 });
  await ctx.addInitScript((l) => { try { localStorage.setItem("vamosLang", l); } catch {} }, lang);
  await ctx.route("**/api/**", (r) => {
    const p = new URL(r.request().url()).pathname;
    if (p === "/api/consent/state") {
      return r.fulfill({ json: consentChosen ? { ok: true, chosen: true, choice: { functional: false, analytics: false, marketing: false }, policyVersion: "test" } : { ok: true, chosen: false, policyVersion: "test" } });
    }
    if (p === "/api/quote") {
      // Two eligible classes, no amounts: `total_rappen: null` keeps every figure on the page at CHF 000 (never an invented price).
      return r.fulfill({ json: { ok: true, quote_id: "q-261003", lock: "l-261003", expires_at: new Date(Date.now() + 3600e3).toISOString(), pricing_live: true, route: { legs: [{ distance_m: 18400, road: true }] }, classes: [
        { slug: "economy", name: "Economy", photo_url: "", eligible: true, effective_max_pax: 3, max_bags: 3, total_rappen: null },
        { slug: "business", name: "Business", photo_url: "", eligible: true, effective_max_pax: 3, max_bags: 3, total_rappen: null } ] } });
    }
    if (p === "/api/fx") return r.fulfill({ json: { ok: true, rates: { CHF: 1, EUR: 1, USD: 1, AED: 1 } } });
    return r.fulfill({ json: { ok: true, signedIn: false } });
  });
  return ctx;
}

async function settle(page) {
  await page.waitForSelector("[data-contact-btn]", { state: "attached", timeout: 30000 });
  await page.waitForTimeout(900);
}

/** State of the floating button and its menu, read in the page. */
const read = (page) => page.evaluate(() => {
  const floats = [...document.querySelectorAll('[data-contact-btn][data-variant="float"]')];
  const f = floats[0];
  const vis = (n) => !!n && n.getClientRects().length > 0 && getComputedStyle(n).visibility !== "hidden";
  const trig = f ? [...f.querySelectorAll("[data-cb-trigger]")].find(vis) : null;
  const tr = trig && trig.getBoundingClientRect();
  const menu = document.querySelector("[data-cb-panel]:not([data-cb-gal] *),[data-cb-sheet]:not([data-cb-gal] *),.vt-cbtn__panel,.vt-cbtn__sheet");
  const links = menu ? [...menu.querySelectorAll("a[data-crow]")].map((a) => a.getAttribute("href")) : [];
  const ae = document.activeElement;
  return {
    floats: floats.length, shown: vis(f) && vis(trig), pos: f ? getComputedStyle(f).position : "",
    rect: tr ? [Math.round(tr.left), Math.round(tr.top), Math.round(tr.width), Math.round(tr.height)] : null,
    text: trig ? trig.innerText.trim() : "", label: trig ? trig.getAttribute("aria-label") : "",
    menu: !!menu, menuRole: menu ? menu.getAttribute("role") : "", modal: menu ? menu.getAttribute("aria-modal") : "",
    links, focusTrig: !!ae && ae.hasAttribute("data-cb-trigger"),
    sw: document.scrollingElement.scrollWidth, iw: innerWidth, vh: innerHeight, dir: document.documentElement.dir,
  };
});

async function clickTrigger(page, scope = '[data-contact-btn][data-variant="float"]') {
  const handle = await page.evaluateHandle((s) => [...document.querySelectorAll(`${s} [data-cb-trigger]`)].find((n) => n.getClientRects().length > 0), scope);
  await handle.asElement().click();
  await page.waitForTimeout(450);
}

async function coverage(page, lang) {
  return page.evaluate((l) => {
    const L = window.VamosLocale;
    if (!L || typeof L.coverage !== "function") return null;
    const roots = [...document.querySelectorAll("[data-contact-btn],[data-cb-sheet],[data-cb-scrim]")];
    let count = 0; const strings = [];
    for (const r of roots) { const c = L.coverage(r, l); count += c.count; strings.push(...c.strings, ...(c.attrs || []).map((a) => a.text || a)); }
    return { count, strings: strings.slice(0, 5) };
  }, lang === "en" ? "de" : lang);
}

const browser = await chromium.launch({ chromiumSandbox: false });

// ── 1. every page × width × language: once, opens, Esc, outside, focus, hrefs, no sideways scroll ──────────
if (want("pages")) {
  const pages = mode === "worker" ? [...DC.map(([r, f]) => [r, f, "dc"]), ...NEXT.map((r) => [r, null, "next"])] : DC.filter(([r]) => r !== "/sign-up" && r !== "/contact" && r !== "/account").map(([r, f]) => [r, f, "dc"]);
  for (const lang of LANGS) {
    for (const w of WIDTHS) {
      const ctx = await newCtx(browser, w, lang);
      const page = await ctx.newPage();
      const errs = [];
      page.on("pageerror", (e) => errs.push(String(e).slice(0, 120)));
      for (const [route, file, kind] of pages) {
        const tag = `${route} ${w} ${lang}`;
        try {
          await page.goto(url(route, lang, file), { waitUntil: "load", timeout: 60000 });
          await settle(page);
          await page.mouse.move(1, 1);
          let s = await read(page);
          const narrow = w <= 680;
          const okShape = narrow ? s.rect && s.rect[2] === 54 && s.rect[3] === 54 : s.rect && s.rect[3] === 54 && s.text.length > 0;
          const endSide = s.rect && (lang === "ar" ? s.rect[0] <= 28 : s.rect[0] + s.rect[2] >= w - 28);
          log(s.floats === 1 && s.shown && okShape && endSide && s.sw <= s.iw, `present once, ${narrow ? "disc" : "pill"}, inline-end, no sideways scroll | ${tag}`, JSON.stringify({ floats: s.floats, shown: s.shown, rect: s.rect, text: s.text, sw: s.sw }));
          await clickTrigger(page);
          s = await read(page);
          const hrefs = HREFS(lang);
          const linksOk = s.links.length === 4 && s.links.every((h, i) => h === hrefs[i]);
          log(s.menu && s.menuRole === "dialog" && (narrow ? s.modal === "true" : s.modal !== "true") && linksOk && s.sw <= s.iw, `opens (${narrow ? "modal sheet" : "card"}), four rows with the right links | ${tag}`, JSON.stringify(s.links));
          if (kind === "dc") {
            const cov = await coverage(page, lang);
            log(cov && cov.count === 0, `VamosLocale.coverage empty | ${tag}`, JSON.stringify(cov));
          }
          if ((lang === "en" || lang === "ar") && (w === 1440 || w === 390)) {
            await page.screenshot({ path: `${out}/open-${(route.replace(/\//g, "_") || "_home")}-${w}-${lang}.jpg`, type: "jpeg", quality: 60 });
          }
          await page.keyboard.press("Escape");
          await page.waitForTimeout(300);
          s = await read(page);
          log(!s.menu && s.focusTrig, `Esc closes, focus back on the button | ${tag}`);
          await clickTrigger(page);
          await page.mouse.click(narrow ? Math.round(w / 2) : 40, narrow ? 120 : Math.round(s.vh / 2));
          await page.waitForTimeout(350);
          s = await read(page);
          log(!s.menu, `a click outside closes | ${tag}`, `focus on button: ${s.focusTrig}`);
        } catch (e) {
          log(false, `page run | ${tag}`, String(e).slice(0, 200));
        }
      }
      if (errs.length) console.log("page errors", lang, w, JSON.stringify(errs.slice(0, 3)));
      await ctx.close();
    }
  }
}

// ── 2. cookie card open: phone steps aside, wider screens keep it ───────────────────────────────────────────
if (want("cookie")) {
  consentChosen = false;
  for (const [route, file] of [["/about", "pages/about"], ["/", "home/home"], ...(mode === "worker" ? [["/review", null]] : [])]) {
    for (const [w, lang] of [[390, "en"], [390, "ar"], [768, "en"], [1440, "en"]]) {
      const ctx = await newCtx(browser, w, lang);
      const page = await ctx.newPage();
      await page.goto(url(route, lang, file), { waitUntil: "load", timeout: 60000 });
      await settle(page);
      await page.waitForTimeout(800);
      const s = await read(page);
      const ck = await page.evaluate(() => document.documentElement.hasAttribute("data-vt-ck-open"));
      const expectShown = w > 680;
      log(ck && s.shown === expectShown, `cookie card open: float ${expectShown ? "stays" : "steps aside"} | ${route} ${w} ${lang}`, JSON.stringify({ ck, shown: s.shown }));
      if (w === 390) await page.screenshot({ path: `${out}/cookie-${route.replace(/\//g, "_") || "_home"}-390-${lang}.png` });
      await ctx.close();
    }
  }
  consentChosen = true;
}

// ── 3. home on a phone: lifted above "Where to?", corner after scroll, hidden while the booking sheet is open ─
if (want("home")) {
  for (const lang of ["en", "ar"]) {
    const ctx = await newCtx(browser, 390, lang);
    const page = await ctx.newPage();
    await page.goto(url("/", lang, "home/home"), { waitUntil: "load", timeout: 60000 });
    await settle(page);
    await page.waitForTimeout(800);
    const geo = () => page.evaluate(() => {
      const r = document.querySelector('[data-contact-btn][data-variant="float"]');
      const t = [...r.querySelectorAll("[data-cb-trigger]")].find((n) => n.getClientRects().length > 0);
      const b = t ? t.getBoundingClientRect() : null;
      const c = document.querySelector("[data-contact-lift]").getBoundingClientRect();
      return { lift: r.getAttribute("data-lift"), pos: getComputedStyle(r).position, disc: b && [Math.round(b.left), Math.round(b.top), Math.round(b.bottom)], cardTop: Math.round(c.top), cardBottom: Math.round(c.bottom), vh: innerHeight, shown: !!t };
    });
    let g = await geo();
    log(g.shown && g.lift === "1" && g.disc[2] <= g.cardTop - 8 && g.disc[2] >= g.cardTop - 16, `home phone: disc just above the Where-to card | ${lang}`, JSON.stringify(g));
    await page.screenshot({ path: `${out}/home-lift-390-${lang}.png` });
    await page.evaluate(() => window.scrollTo(0, 420));
    await page.waitForTimeout(500);
    g = await geo();
    const overlap = g.disc && !(g.disc[2] <= g.cardTop || g.disc[1] >= g.cardBottom);
    log(g.lift === "0" && g.pos === "fixed" && g.vh - g.disc[2] >= 14 && g.vh - g.disc[2] <= 18 && !overlap, `home phone: back in the corner after scroll | ${lang}`, JSON.stringify(g));
    await page.screenshot({ path: `${out}/home-corner-390-${lang}.png` });
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(500);
    g = await geo();
    log(g.lift === "1", `home phone: lifts again at the top | ${lang}`, JSON.stringify(g));
    await page.locator("button[data-bb]").first().click();
    await page.waitForTimeout(900);
    const hid = await page.evaluate(() => ({ flag: document.documentElement.hasAttribute("data-vt-sheet-open"), display: getComputedStyle(document.querySelector('[data-contact-btn][data-variant="float"]')).display }));
    log(hid.flag && hid.display === "none", `home phone: booking sheet open hides the disc | ${lang}`, JSON.stringify(hid));
    await page.screenshot({ path: `${out}/home-sheet-390-${lang}.png` });
    await page.keyboard.press("Escape");
    await page.waitForTimeout(700);
    const back = await page.evaluate(() => ({ flag: document.documentElement.hasAttribute("data-vt-sheet-open"), display: getComputedStyle(document.querySelector('[data-contact-btn][data-variant="float"]')).display }));
    log(!back.flag && back.display !== "none", `home phone: sheet closed, disc back | ${lang}`, JSON.stringify(back));
    await ctx.close();
  }
}

// ── 4. keyboard up on a phone ────────────────────────────────────────────────────────────────────────────────
if (want("keyboard")) {
  for (const [w, expectHidden] of [[390, true], [1440, false]]) {
    const ctx = await newCtx(browser, w, "en");
    const page = await ctx.newPage();
    const kb = mode === "worker" ? ["/contact", "pages/contact"] : ["/sign-in", "pages/sign-in"];
    await page.goto(url(kb[0], "en", kb[1]), { waitUntil: "load", timeout: 60000 });
    await settle(page);
    const field = page.locator('input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]):not([type="password"]), textarea').locator("visible=true").first();
    await field.focus();
    await page.waitForTimeout(300);
    const s = await read(page);
    log(s.shown === !expectHidden, `text field focused: float ${expectHidden ? "hidden" : "stays"} | ${kb[0]} ${w}`);
    await page.locator("h1").first().click();
    await page.waitForTimeout(300);
    const s2 = await read(page);
    log(s2.shown, `field left: float back | ${kb[0]} ${w}`);
    await ctx.close();
  }
}

// ── 6. /checkout (worker only): the PAY bar docks the button at 1080 and below; above it the float stays ──────
if (want("checkout") && mode === "worker") {
  const trip = new URLSearchParams({ from: "Zurich Airport (ZRH)", fid: "f-261003", to: "Bahnhofstrasse 1, Zurich", tid: "t-261003", gs: "6f1c2f2a-5f0b-4f0e-9d3b-1b2c3d4e5f60", when: "2027-01-15T10:30", pax: "2", bags: "1" });
  const co = (lang) => `${base}${lang === "en" ? "" : "/" + lang}/checkout?${trip}`;
  /** Geometry of the bar's three parts and what the browser says is on top at PAY's centre. */
  const bar = (page) => page.evaluate(() => {
    const b = document.querySelector('[data-co-pay-bar="bar"]');
    if (!b) return { bar: false };
    const box = (n) => { if (!n) return null; const r = n.getBoundingClientRect(); return { l: Math.round(r.left), r: Math.round(r.right), t: Math.round(r.top), b: Math.round(r.bottom), w: Math.round(r.width), h: Math.round(r.height) }; };
    const total = b.querySelector(".vt-copay__total");
    const dock = b.querySelector('[data-contact-btn][data-variant="docked"] [data-cb-trigger]');
    const pay = b.querySelector("[data-co-pay]");
    const pr = pay.getBoundingClientRect();
    const top = document.elementFromPoint(pr.left + pr.width / 2, pr.top + pr.height / 2);
    const vis = (n) => !!n && n.getClientRects().length > 0 && getComputedStyle(n).visibility !== "hidden";
    const floats = [...document.querySelectorAll('[data-contact-btn][data-variant="float"]')];
    const ft = floats[0] && [...floats[0].querySelectorAll("[data-cb-trigger]")].find(vis);
    return {
      bar: true, total: box(total), dock: box(dock), pay: box(pay), dir: document.documentElement.dir,
      payOnTop: !!top && !!top.closest("[data-co-pay]"), topTag: top ? top.tagName + "." + String(top.className).slice(0, 40) : null,
      floatShown: !!ft, floatBox: ft ? box(ft) : null, sw: document.scrollingElement.scrollWidth, iw: innerWidth,
      payLabel: pay.innerText.replace(/\s+/g, " ").trim(),
    };
  });
  for (const lang of ["en", "ar"]) {
    for (const w of [1024, 768, 390]) {
      for (const cookie of [false, true]) {
        consentChosen = !cookie;
        const ctx = await newCtx(browser, w, lang);
        const page = await ctx.newPage();
        const tag = `/checkout ${w} ${lang}${cookie ? " cookie card open" : ""}`;
        try {
          await page.goto(co(lang), { waitUntil: "load", timeout: 60000 });
          await page.waitForSelector('[data-co-pay-bar="bar"] [data-contact-btn]', { state: "attached", timeout: 30000 });
          await page.waitForTimeout(1400);
          const g = await bar(page);
          const ltr = g.dir !== "rtl";
          const order = g.bar && g.total && g.dock && g.pay && (ltr ? g.total.l < g.dock.l && g.dock.l < g.pay.l : g.pay.l < g.dock.l && g.dock.l < g.total.l);
          const noOverlap = g.bar && (ltr ? g.total.r <= g.dock.l + 1 && g.dock.r <= g.pay.l + 1 : g.pay.r <= g.dock.l + 1 && g.dock.r <= g.total.l + 1);
          log(order && noOverlap && g.dock.w === 54 && g.dock.h === 54, `PAY bar order ${ltr ? "Total · contact · PAY" : "PAY · contact · Total (mirrored)"}, contact 54 px, no overlap | ${tag}`, JSON.stringify({ total: g.total, dock: g.dock, pay: g.pay }));
          log(g.payOnTop, `elementFromPoint at PAY's centre is PAY | ${tag}`, g.topTag);
          log(!g.floatShown, `float not shown on /checkout at ${w} (docked only) | ${tag}`);
          log(g.sw <= g.iw, `no sideways scroll | ${tag}`, `${g.sw} <= ${g.iw}`);
          if (cookie) {
            const ck = await page.evaluate(() => ({ attr: document.documentElement.hasAttribute("data-vt-ck-open"), dockedShown: !![...document.querySelectorAll('[data-contact-btn][data-variant="docked"] [data-cb-trigger]')].find((n) => n.getClientRects().length > 0) }));
            log(ck.attr && ck.dockedShown, `cookie card open: docked button still rides in the lifted bar | ${tag}`, JSON.stringify(ck));
          }
          // The docked button opens the same menu (a sheet on a phone, a card above it on a tablet).
          await clickTrigger(page, '[data-contact-btn][data-variant="docked"]');
          const m = await read(page);
          const narrow = w <= 680;
          log(m.menu && (narrow ? m.modal === "true" : m.modal !== "true") && m.links.length === 4 && m.links.every((h, i) => h === HREFS(lang)[i]), `docked button opens the menu with four rows | ${tag}`, JSON.stringify(m.links));
          if (!cookie && (w === 390 || w === 768)) await page.screenshot({ path: `${out}/checkout-${w}-${lang}-menu.jpg`, type: "jpeg", quality: 60 });
          await page.keyboard.press("Escape");
          await page.waitForTimeout(350);
          const ae = await page.evaluate(() => { const a = document.activeElement; return !!a && !!a.closest('[data-contact-btn][data-variant="docked"]'); });
          log(ae, `Esc closes, focus back on the docked button | ${tag}`);
          if (w === 390 || cookie) await page.screenshot({ path: `${out}/checkout-${w}-${lang}${cookie ? "-cookie" : ""}.png` });
          // Longest real figure the bar can show: set as text only (never saved in a screenshot); PAY must stay on top and inside the screen.
          if (!cookie) {
            await page.evaluate(() => {
              for (const n of document.querySelectorAll('[data-co-pay-bar="bar"] [data-co-total]')) n.textContent = "CHF 12'450.00";
              const pay = document.querySelector('[data-co-pay-bar="bar"] [data-co-pay]');
              const spans = pay.querySelectorAll("span.vt-dir-keep");
              if (spans[0]) spans[0].textContent = "CHF 12'450.00";
            });
            await page.waitForTimeout(200);
            const g2 = await bar(page);
            log(g2.payOnTop && g2.pay.l >= 0 && g2.pay.r <= g2.iw && g2.total.l >= 0 && g2.total.r <= g2.iw && g2.sw <= g2.iw, `longest figure in the bar: PAY on top, everything inside the screen | ${tag}`, JSON.stringify({ total: g2.total, dock: g2.dock, pay: g2.pay }));
          }
        } catch (e) {
          log(false, `checkout run | ${tag}`, String(e).slice(0, 200));
        }
        await ctx.close();
      }
    }
  }
  consentChosen = true;
  // Above 1080: the float shows, the rail keeps its PAY, nothing sits on PAY (also on a short laptop).
  for (const [w, h] of [[1440, 900], [1280, 720], [1181, 700]]) {
    const ctx = await newCtx(browser, w, "en", h);
    const page = await ctx.newPage();
    const tag = `/checkout ${w}x${h} en`;
    try {
      await page.goto(co("en"), { waitUntil: "load", timeout: 60000 });
      await page.waitForSelector('[data-contact-btn][data-variant="float"]', { state: "attached", timeout: 30000 });
      await page.waitForTimeout(1400);
      const r = await page.evaluate(() => {
        const vis = (n) => !!n && n.getClientRects().length > 0 && getComputedStyle(n).visibility !== "hidden";
        const f = document.querySelector('[data-contact-btn][data-variant="float"]');
        const t = f && [...f.querySelectorAll("[data-cb-trigger]")].find(vis);
        const pay = document.querySelector('[data-co-pay-bar="rail"] [data-co-pay]');
        if (pay) pay.scrollIntoView({ block: "center", behavior: "instant" });
        const fr = t && t.getBoundingClientRect();
        const pr = pay && pay.getBoundingClientRect();
        const hit = pr ? document.elementFromPoint(pr.left + pr.width / 2, pr.top + pr.height / 2) : null;
        const inter = fr && pr ? !(fr.right <= pr.left || fr.left >= pr.right || fr.bottom <= pr.top || fr.top >= pr.bottom) : null;
        return { floatShown: !!t, railPay: !!pay, bottomBar: !!document.querySelector('[data-co-pay-bar="bar"]'), payOnTop: !!hit && !!hit.closest("[data-co-pay]"), overlap: inter, fr: fr && [Math.round(fr.left), Math.round(fr.top), Math.round(fr.width), Math.round(fr.height)], pr: pr && [Math.round(pr.left), Math.round(pr.top), Math.round(pr.width), Math.round(pr.height)] };
      });
      log(r.floatShown && r.railPay && !r.bottomBar && r.payOnTop && r.overlap === false, `float shown, rail PAY on top, float does not cover PAY | ${tag}`, JSON.stringify(r));
      await page.screenshot({ path: `${out}/checkout-${w}x${h}-en.png` });
    } catch (e) {
      log(false, `checkout run | ${tag}`, String(e).slice(0, 200));
    }
    await ctx.close();
  }
}

// ── 5. print ────────────────────────────────────────────────────────────────────────────────────────────────
if (want("print")) {
  const ctx = await newCtx(browser, 1440, "en");
  const page = await ctx.newPage();
  await page.goto(url("/about", "en", "pages/about"), { waitUntil: "load", timeout: 60000 });
  await settle(page);
  await page.emulateMedia({ media: "print" });
  const d = await page.evaluate(() => getComputedStyle(document.querySelector("[data-contact-btn]")).display);
  log(d === "none", "hidden in print | /about", d);
  await ctx.close();
}

await browser.close();
const pass = results.filter((r) => r.ok).length;
const fail = results.length - pass;
writeFileSync(`${out}/results-${mode}.json`, JSON.stringify({ base, mode, pass, fail, results }, null, 1));
console.log(`SUMMARY ${mode}: ${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
