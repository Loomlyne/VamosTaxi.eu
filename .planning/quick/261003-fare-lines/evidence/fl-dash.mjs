// Dashboard booking detail: a real staff password sign-in on the dashboard host (aal1, no factor yet), then the booking.
import fs from "node:fs";
import { launch, newContext, newPage, sql, rec, SHOTS, DASH } from "./lib.mjs";

const env = Object.fromEntries(fs.readFileSync("/Users/koss/Developer/VamosTaxi.eu/.claude/worktrees/agent-a6ce6d39e2579cbf7/apps/web/.e2e-sb.env", "utf8").split("\n").filter(Boolean).map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, "")]; }));
const email = `fl-admin-${Date.now().toString(36)}@vamos.test`;
const password = "localpass-fl-admin";
const r = await fetch(`${env.API_URL}/auth/v1/admin/users`, { method: "POST", headers: { apikey: env.SERVICE_ROLE_KEY, authorization: `Bearer ${env.SERVICE_ROLE_KEY}`, "content-type": "application/json" }, body: JSON.stringify({ email, password, email_confirm: true }) });
const uid = (await r.json()).id;
sql(`insert into public.staff (user_id, role, full_name, accepted_at) values ('${uid}', 'admin', 'FL Admin', now())`);
const lang = process.env.LANG_CODE ?? "en";
const st = JSON.parse(fs.readFileSync(`/private/tmp/vamos-fl/state-${lang === "ar" ? "ar" : lang}.json`, "utf8"));
const browser = await launch();
const ctx = await newContext(browser, { lang, w: Number(process.env.W ?? 1440), h: Number(process.env.W ?? 1440) >= 1000 ? 900 : 844 });
const page = await newPage(ctx, []);
page.on("response", async (x) => { const u = new URL(x.url()); if (u.pathname.startsWith("/api/") && !/fx|session|reviews|consent/.test(u.pathname)) console.log("api", x.request().method(), u.pathname, x.status()); });
await page.goto(DASH + "/login", { waitUntil: "domcontentloaded" });
await page.locator('input[type="email"], input[autocomplete="email"], input[autocomplete="username"]').first().waitFor({ timeout: 40000 });
await page.locator('input[type="email"], input[autocomplete="email"], input[autocomplete="username"]').first().fill(email);
await page.locator('input[type="password"]').first().fill(password);
await Promise.all([
  page.waitForResponse((x) => new URL(x.url()).pathname === "/api/auth" && x.request().method() === "POST", { timeout: 25000 }).catch(() => null),
  page.getByRole("button", { name: /^\s*(sign in|anmelden|connexion|se connecter|تسجيل الدخول)\s*$/i }).first().click(),
]);
await page.waitForTimeout(3000);
console.log("after sign-in", page.url());
await page.goto(DASH + "/bookings", { waitUntil: "domcontentloaded" });
await page.waitForTimeout(6000);
console.log("LIST", (await page.evaluate(() => document.body.innerText)).replace(/\s+/g, " ").slice(0, 500));
await page.screenshot({ path: "/private/tmp/vamos-fl/dash-list.png" });
const want = (process.env.WANT_TOTAL ?? (Number(st.totalRappen) / 100).toFixed(2));
const row = page.locator(`text=CHF ${want}`).first();
console.log("row found", await row.count());
await row.click({ timeout: 8000 }).catch((e) => console.log("click", String(e).slice(0, 100)));
await page.waitForTimeout(4000);
console.log("URL", page.url());
console.log("DETAIL", (await page.evaluate(() => document.body.innerText)).replace(/\s+/g, " ").slice(0, 1500));
await page.screenshot({ path: `${SHOTS}/dashboard-detail-${process.env.W ?? 1440}-${lang}.png`, fullPage: true });
await browser.close();
