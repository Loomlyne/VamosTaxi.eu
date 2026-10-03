// Van luxury 12 (quick 261001): dashboard New trip in Chromium against the local dashboard Worker (4491, VAMOS_SURFACE auto).
// A local staff admin is made on the scratch stack only (password, no TOTP: aal1 is allowed until a factor exists).
import { chromium } from "@playwright/test";
import { execFileSync } from "node:child_process";
import fs from "node:fs";

const DASH = "http://dashboard.localhost:4491";
const SHOTS = process.env.SHOTS ?? "/tmp";
const env = Object.fromEntries(fs.readFileSync(process.env.SBENV, "utf8").split("\n").filter(Boolean).map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, "")]; }));
const sql = (q) => execFileSync("docker", ["exec", "-i", "supabase_db_vamos-taxi-vl12", "psql", "-U", "postgres", "-At", "-c", q]).toString().trim();
const rec = (n, ok, ev) => console.log(`${ok ? "PASS" : "FAIL"} | ${n} | ${ev}`);

const email = `vl12-admin-${Date.now().toString(36)}@vamos.test`;
const password = "localpass-vl12";
const r = await fetch(`${env.API_URL}/auth/v1/admin/users`, { method: "POST", headers: { apikey: env.SERVICE_ROLE_KEY, authorization: `Bearer ${env.SERVICE_ROLE_KEY}`, "content-type": "application/json" }, body: JSON.stringify({ email, password, email_confirm: true }) });
const uid = (await r.json()).id;
sql(`insert into public.staff (user_id, role, full_name, accepted_at) values ('${uid}', 'admin', 'VL12 Admin', now())`);

const browser = await chromium.launch();
// Its own client address: /api/quote allows 8 a minute per address locally too.
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, extraHTTPHeaders: { "cf-connecting-ip": `10.99.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}` } });
await ctx.addInitScript(() => { try { localStorage.setItem("vamosLang", "en"); } catch (e) {} });
const page = await ctx.newPage();
// /api/fx reaches the internet from the local Worker and has crashed wrangler's local proxy twice; the
// display-currency rate is not part of this check.
await page.route(/\/api\/fx(\?.*)?$/, (r) => r.fulfill({ status: 503, contentType: "application/json", body: "{}" }));
const errors = [];
page.on("pageerror", (e) => errors.push(String(e).slice(0, 160)));
const quotes = [];
const authAnswers = [];
page.on("response", async (resp) => {
  if (new URL(resp.url()).pathname === "/api/auth") authAnswers.push(`${resp.status()} ${(await resp.text().catch(() => "")).slice(0, 160)} cookies=${(resp.headers()["set-cookie"] || "").split("\n").map((c) => c.split("=")[0]).join(",")}`);
  if (new URL(resp.url()).pathname.endsWith("/api/quote") && resp.request().method() === "POST") {
    const j = await resp.json().catch(() => null);
    quotes.push({ status: resp.status(), pax: JSON.parse(resp.request().postData() || "{}").pax, classes: (j?.classes ?? []).map((c) => `${c.slug}:${c.eligible ? "ok" : c.ineligible_reason}`) });
  }
});
await page.goto(DASH + "/login", { waitUntil: "domcontentloaded" });
await page.locator('input[type="email"], input[autocomplete="email"], input[autocomplete="username"]').first().waitFor({ timeout: 30000 });
await page.screenshot({ path: `${SHOTS}/ops-login.png` });
await page.locator('input[type="email"], input[autocomplete="email"], input[autocomplete="username"]').first().fill(email);
await page.locator('input[type="password"]').first().fill(password);
await Promise.all([
  page.waitForResponse((x) => new URL(x.url()).pathname === "/api/auth" && x.request().method() === "POST", { timeout: 20000 }).catch(() => null),
  page.getByRole("button", { name: /^\s*sign in\s*$/i }).first().click(),
]);
await page.waitForTimeout(2000);
await page.waitForURL(/\/(dashboard|bookings)/, { timeout: 20000 }).catch(() => {});
await page.screenshot({ path: `${SHOTS}/ops-after-sign-in.png` });
console.log("auth answers", JSON.stringify(authAnswers));
rec("1 local admin signs in on the dashboard host", !/\/login/.test(page.url()), page.url());
await page.goto(DASH + "/bookings/new", { waitUntil: "domcontentloaded" });
await page.waitForTimeout(2500);
await page.getByLabel("Pickup").fill("Zurich");
await page.locator("button", { hasText: "Zurich HB" }).first().click();
await page.getByLabel("Drop-off").fill("Zug");
await page.locator("button", { hasText: "Zug Bahnhof" }).first().click();
await page.getByLabel("Date").fill("2026-10-10");
await page.getByLabel("Time").fill("10:00");
await page.getByLabel("Passengers").fill("10");
await page.getByLabel("Passengers").blur();
for (let i = 0; i < 40 && !quotes.some((q) => q.pax === 10); i++) await page.waitForTimeout(250);
await page.waitForTimeout(1500);
const q10 = quotes.filter((q) => q.pax === 10).pop();
rec("2 New trip sends 10 travellers to the quote (no silent 8)", !!q10 && q10.status === 200, `quotes sent with pax: ${quotes.map((q) => q.pax).join(",")}; last: ${q10?.classes.join(" ")}`);
const opts = await page.evaluate(() => [...document.querySelectorAll("select option, [role=option]")].map((o) => o.textContent.trim()).filter(Boolean));
const classSel = await page.getByLabel("Vehicle class").first().evaluate((el) => (el.tagName === "SELECT" ? [...el.options].map((o) => o.textContent.trim()) : el.textContent.trim())).catch(() => "n/a");
rec("3 the class list offers only Van luxury for 10", JSON.stringify(classSel).includes("Van luxury") && !JSON.stringify(classSel).includes("Economy") && !JSON.stringify(classSel).includes("Business"), `class select: ${JSON.stringify(classSel)}; all options on page: ${JSON.stringify(opts).slice(0, 200)}`);
await page.screenshot({ path: `${SHOTS}/ops-new-trip-10.png` });

// Review fix 4: 13-16 says no class seats the party; more than 16 cannot be typed.
const lineText = () => page.evaluate(() => {
  const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n = w.nextNode(); n; n = w.nextNode()) {
    const t = (n.nodeValue || "").trim();
    if (/No class seats|Keine Klasse|Aucune classe|لا توجد فئة/.test(t)) return t;
  }
  return "";
});
const paxField = page.getByLabel("Passengers");
// The dashboard has no verified quote cookie: the bare bucket allows 4 quotes a minute per address.
await page.waitForTimeout(61_000);
await paxField.fill("14");
await paxField.blur();
for (let i = 0; i < 40 && !quotes.some((q) => q.pax === 14); i++) await page.waitForTimeout(250);
await page.waitForTimeout(1500);
const q14 = quotes.filter((q) => q.pax === 14).pop();
rec("4 14 travellers: the quote finds no class and the form says so", !!q14 && q14.classes.every((c) => !c.endsWith(":ok")) && (await lineText()) === "No class seats 14 passengers", `quote: ${q14?.classes.join(" ")}; line: "${await lineText()}"`);
await page.screenshot({ path: `${SHOTS}/ops-new-trip-14.png` });
await page.waitForTimeout(61_000);
await paxField.fill("20");
await paxField.blur();
await page.waitForTimeout(400);
const shown = await paxField.inputValue();
for (let i = 0; i < 40 && !quotes.some((q) => q.pax === 16); i++) await page.waitForTimeout(250);
await page.waitForTimeout(1500);
rec("5 20 typed reads 16 and quotes 16 (no Quote failed)", shown === "16" && quotes.some((q) => q.pax === 16 && q.status === 200) && !quotes.some((q) => q.pax > 16), `field "${shown}"; pax sent: ${quotes.map((q) => q.pax).join(",")}; line: "${await lineText()}"`);
await page.evaluate(() => window.VamosLocale.setLang("de"));
await page.waitForTimeout(600);
const de = await lineText();
await page.evaluate(() => window.VamosLocale.setLang("ar"));
await page.waitForTimeout(600);
const ar = await lineText();
rec("6 the line in German, then switched to Arabic", de === "Keine Klasse hat Platz für 16 Passagiere" && ar === "لا توجد فئة تتسع لـ 16 راكبًا", `de "${de}" → ar "${ar}"`);
await page.screenshot({ path: `${SHOTS}/ops-new-trip-16-ar.png` });
console.log("errors", errors);
await browser.close();
