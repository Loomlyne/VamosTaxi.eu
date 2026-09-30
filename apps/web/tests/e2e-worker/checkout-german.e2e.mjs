// 26.5 plan 07: one run from a German start, in a real browser (Chromium) against the real local Worker.
//   /de -> checkout -> the panel and both notices are German -> a guest PAY through the page's own PAY button writes a record with
//   locale "de" -> sign-in by e-mail link from the checkout returns to the same checkout in German -> /de/privacy shows "Ihr Konto".
// Run by run.sh after checkout-account.e2e.mjs, on the same Worker (local stand-in secrets, fakes.mjs for Stripe and Turnstile).
// What is stubbed in the browser, and why: the challenge script (no network to Cloudflare needed), /api/quote (it needs Mapbox; the
// answer carries a lock signed with the local Worker's secret, so the real /api/checkout/price and /api/checkout/intent verify it),
// the place lookups, and the navigation to checkout.stripe.com. Everything else is the real page talking to the real Worker.
import { chromium } from "@playwright/test";
import fs from "node:fs";
import {
  PORT, RUN, rec, finish, sql, before, newMail, linkOf, createAuthUser, ensureFixture, mintQuote, agreementRows, consentLogCount, CLASS_SLUG,
} from "./checkout-common.mjs";

ensureFixture({ guestSwitch: true });
const BASE = `http://localhost:${PORT}`;
const messages = JSON.parse(fs.readFileSync(new URL("../../i18n/messages/de.json", import.meta.url), "utf8"));
const m = messages.checkout;
const stripTags = (s) => s.replace(/<[^>]+>/g, "");
// The approved German texts, from the owner's decision files (not from the message files, so a wrong message file fails).
const notice = fs.readFileSync(new URL("../../../../.planning/decisions/2026-09-29-checkout-account-notice.md", import.meta.url), "utf8");
const decided = (heading) => (notice.split(heading)[1] ?? "").split("\n").find((l) => l.startsWith("| de |"))?.replace(/^\| de \| /, "").replace(/ \|$/, "") ?? "";
const TEXT1_DE = decided("## Text 1");
const TEXT2_DE = decided("## Text 2");
const legal = fs.readFileSync(new URL("../../../../.planning/decisions/2026-09-30-legal-pages.md", import.meta.url), "utf8");
const PRIV_DE = ((legal.split('## Privacy paragraph "Your account"')[1] ?? "").split("\n").find((l) => l.startsWith("| de |")) ?? "").replace(/^\| de \| /, "").replace(/ \|$/, "").replace(/\*\*/g, "");

const q = await mintQuote({ pax: 1, bags: 0, totalRappen: 600 });
const TRIP = `from=Zurich%20Airport&fid=dXJuOm1ieHBvaTox&to=Zurich%20HB&tid=dXJuOm1ieHBvaTox2&gs=11111111-1111-4111-8111-111111111111&when=${encodeURIComponent(q.when)}&pax=1&bags=0`;
const CO_PATH = `/checkout?${TRIP}`;

async function stubs(page) {
  await page.route((u) => u.hostname.includes("cloudflare") || u.hostname.includes("turnstile"), (route) =>
    route.fulfill({ status: 200, contentType: "application/javascript",
      body: "window.turnstile={render:function(el,o){setTimeout(function(){o.callback('e2e-token')},0);return 'w1'},remove:function(){},reset:function(){}};" }));
  await page.route("**/api/flight/**", (r) => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: false }) }));
  await page.route("**/api/geo/retrieve**", (r) => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ place: { isAirport: false } }) }));
  await page.route("**/api/quote", (route) => {
    if (route.request().method() !== "POST") return route.fallback();
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({
      ok: true, quote_id: q.quoteId, lock: q.lock, expires_at: q.payload.exp, pricing_live: true,
      classes: [{ slug: CLASS_SLUG, name: "Business", eligible: true, ineligible_reason: null, effective_max_pax: 3, max_bags: 3, fixed_route: false,
        total_rappen: 600, lines: [], photo_url: null }],
    }) });
  });
  await page.route((u) => u.hostname === "checkout.stripe.com", (r) => r.fulfill({ status: 200, contentType: "text/html", body: "<title>stripe stand-in</title>" }));
}

const browser = await chromium.launch();
const errors = [];
try {
  // ---- 1 German start: /de sets the language, checkout follows it ----
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push(String(e).slice(0, 120)));
  await stubs(page);
  await page.goto(`${BASE}/de`, { waitUntil: "load", timeout: 60000 });
  await page.waitForFunction(() => document.documentElement.lang === "de", null, { timeout: 30000 });
  await page.waitForTimeout(1500);
  const cookieDe = (await ctx.cookies()).find((c) => c.name === "NEXT_LOCALE")?.value;
  rec("G1 German start: /de renders in German and the language choice is kept in NEXT_LOCALE", cookieDe === "de", `html lang=de; NEXT_LOCALE=${cookieDe}`);

  await page.goto(`${BASE}${CO_PATH}`, { waitUntil: "load", timeout: 60000 });
  await page.locator("[data-co-classes]").waitFor({ timeout: 30000 });
  const htmlLang = await page.evaluate(() => document.documentElement.lang);
  const dir = await page.evaluate(() => document.documentElement.dir);
  await page.locator(`[data-co-class="${CLASS_SLUG}"] button`).first().click();

  const panelText = await page.locator("[data-acct-choice]").innerText();
  const en = JSON.parse(fs.readFileSync(new URL("../../i18n/messages/en.json", import.meta.url), "utf8")).checkout;
  // The kicker is set in capitals by the stylesheet, so compare case-insensitively.
  const lowPanel = panelText.toLowerCase();
  const allDe = [m.acctKicker, m.acctGuestTitle, m.acctSignInTitle, m.acctCreateTitle].every((t) => lowPanel.includes(t.toLowerCase()));
  const noEn = ["acctKicker", "acctGuestTitle", "acctSignInTitle", "acctCreateTitle"].every((k) => !lowPanel.includes(en[k].toLowerCase()));
  const note2 = (await page.locator('[data-acct-note="guest"]').innerText()).trim();
  rec("G2 /checkout in German: the panel is German and the guest notice (Text 2) is the approved German text, verbatim",
    htmlLang === "de" && dir === "ltr" && allDe && noEn && note2 === TEXT2_DE && TEXT2_DE.length > 40,
    `html lang=${htmlLang}; panel titles German=${allDe}; no English titles=${noEn}; Text 2 verbatim=${note2 === TEXT2_DE}`);

  await page.locator('[data-acct-option="create"]').click();
  const label = (await page.locator("[data-acct-consent]").innerText()).replace(/\s+/g, " ").trim();
  const hrefs = await page.$$eval("[data-acct-consent] a", (as) => as.map((a) => a.getAttribute("href")));
  rec("G3 Create an account in German: the tick label is the approved German Text 1, verbatim, linking Terms and Privacy",
    label === TEXT1_DE && TEXT1_DE.length > 40 && hrefs.some((h) => /\/terms$/.test(h ?? "")) && hrefs.some((h) => /\/privacy$/.test(h ?? "")),
    `Text 1 verbatim=${label === TEXT1_DE}; links=${hrefs.join(",")}`);
  await page.locator('[data-acct-option="guest"]').click();

  // ---- 2 a guest PAY through the page's own button ----
  const GUEST = `e2e-de-guest-${RUN}@example.com`;
  const intents = [];
  page.on("request", (r) => { if (r.url().endsWith("/api/checkout/intent") && r.method() === "POST") intents.push(JSON.parse(r.postData() ?? "{}")); });
  await page.locator('[data-co-contact] input[autocomplete="given-name"]').fill("Gerda");
  await page.locator('[data-co-contact] input[autocomplete="family-name"]').fill("Gast");
  await page.locator('[data-co-contact] input[autocomplete="email"]').fill(GUEST);
  await page.locator("[data-co-contact] [data-vt-phone] input").fill("41796267082");
  const consentBefore = consentLogCount();
  await page.locator("[data-co-pay]").click();
  await page.waitForURL((u) => u.hostname === "checkout.stripe.com", { timeout: 30000 }).catch(() => {});
  const rows = JSON.parse(agreementRows(GUEST));
  rec("G4 German guest PAY (page button): goes to the Stripe page; one informed record, locale de; no consent_log row",
    /checkout\.stripe\.com/.test(page.url()) && rows.length === 1 && rows[0].choice === "guest" && rows[0].kind === "informed" && rows[0].locale === "de" && rows[0].surface === "checkout"
      && consentLogCount() === consentBefore && intents[0]?.locale === "de" && intents[0]?.account?.choice === "guest",
    `url=${new URL(page.url()).hostname}; rows=${rows.length} ${JSON.stringify(rows[0] ?? {})}; page sent locale=${intents[0]?.locale} account.choice=${intents[0]?.account?.choice}; consent_log unchanged=${consentLogCount() === consentBefore}`);

  // ---- 3 sign in from the checkout, in German ----
  const KNOWN = `e2e-de-known-${RUN}@example.com`;
  await createAuthUser(KNOWN, { locale: "de" }, true);
  const ctx2 = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const p2 = await ctx2.newPage();
  await stubs(p2);
  await p2.goto(`${BASE}/de`, { waitUntil: "load", timeout: 60000 });
  await p2.waitForFunction(() => document.documentElement.lang === "de", null, { timeout: 30000 });
  await p2.waitForTimeout(1000);
  await p2.goto(`${BASE}${CO_PATH}`, { waitUntil: "load", timeout: 60000 });
  await p2.locator("[data-co-classes]").waitFor({ timeout: 30000 });
  await p2.locator(`[data-co-class="${CLASS_SLUG}"] button`).first().click();
  let authBody = null;
  p2.on("request", (r) => { if (r.url().endsWith("/api/auth") && r.method() === "POST") authBody = JSON.parse(r.postData() ?? "{}"); });
  let authAnswer = '';
  p2.on('response', async (r) => { if (r.url().endsWith('/api/auth') && r.request().method() === 'POST') authAnswer = `${r.status()} ${(await r.text()).slice(0, 60)}`; });
  const seen = before();
  await p2.locator('[data-acct-option="signin"]').click();
  await p2.locator("[data-acct-signin='form'] input[type=email]").fill(KNOWN);
  await p2.locator("[data-acct-signin='form'] [data-acct-action]").click();
  await p2.locator("[data-acct-signin='sent']").waitFor({ timeout: 30000 });
  const sentText = await p2.locator("[data-acct-signin='sent']").innerText();
  const mail = await newMail(seen, 15000);
  const link = mail && linkOf(mail);
  rec("G5 sign-in from the German checkout: the answer is the German 'check your inbox' screen and the mail is German",
    sentText.includes(m.acctSentHeading) && !!mail && /Bei Vamos Taxi anmelden|Anmelden/.test(mail) && !!link,
    `sent screen German=${sentText.includes(m.acctSentHeading)}; mail German heading=${!!mail && /Bei Vamos Taxi anmelden/.test(mail)}; link=${!!link}; page sent keys=${Object.keys(authBody ?? {}).join(',')} tokenLen=${String(authBody?.turnstileToken ?? '').length} mode=${authBody?.mode}/${authBody?.method}/${authBody?.origin} answer=${authAnswer}`);

  if (link) {
    await p2.goto(link, { waitUntil: "load", timeout: 60000 });
    await p2.locator("[data-co-classes]").waitFor({ timeout: 30000 });
    await p2.waitForTimeout(1500);
    const u = new URL(p2.url());
    const want = new URL(`${BASE}${CO_PATH}`);
    const sameQuery = [...want.searchParams].every(([k, v]) => u.searchParams.get(k) === v);
    const lang2 = await p2.evaluate(() => document.documentElement.lang);
    const signedInText = (await p2.locator("body").innerText());
    rec("G6 the link brings the customer back to the same checkout in German, signed in, with the trip",
      u.pathname === "/checkout" && sameQuery && lang2 === "de" && signedInText.includes(m.signedInAs.replace("{email}", KNOWN)),
      `path=${u.pathname}; every trip parameter kept=${sameQuery}; html lang=${lang2}; German "Angemeldet als <e-mail>" shown=${signedInText.includes(m.signedInAs.replace("{email}", KNOWN))}`);
  } else rec("G6 the link brings the customer back to the same checkout in German", false, "no link");

  // ---- 4 /de/privacy ----
  const p3 = await ctx.newPage();
  await p3.goto(`${BASE}/de/privacy`, { waitUntil: "load", timeout: 60000 });
  await p3.waitForFunction(() => document.body.innerText.includes("Ihr Konto."), null, { timeout: 30000 }).catch(() => {});
  const priv = (await p3.evaluate(() => document.body.innerText)).replace(/\s+/g, " ");
  rec("G7 /de/privacy shows the approved 'Ihr Konto' paragraph, verbatim", PRIV_DE.length > 60 && priv.includes(PRIV_DE.replace(/\s+/g, " ")),
    `paragraph found=${priv.includes(PRIV_DE.replace(/\s+/g, " "))}; lead "Ihr Konto." present=${priv.includes("Ihr Konto.")}`);
  rec("G8 no page error in the browser during the German run", errors.length === 0, errors.length ? errors.join(" | ") : "none");
} catch (e) {
  rec("G-run German browser run", false, String(e).slice(0, 300));
} finally {
  await browser.close();
}
finish(process.env.OUT);
