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
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await ctx.addInitScript(() => { try { localStorage.setItem("vamosLang", "en"); } catch (e) {} });
const page = await ctx.newPage();
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
await page.waitForURL(/dashboard|bookings/, { timeout: 20000 }).catch(() => {});
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
console.log("errors", errors);
await browser.close();
