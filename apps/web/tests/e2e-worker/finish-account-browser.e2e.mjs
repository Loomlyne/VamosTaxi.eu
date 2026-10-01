// 27.1 (27 D-37): the finish-your-account step in a real browser (Chromium, phone width) against the real local Worker.
//   /sign-in "Email me a link" for a new address -> the mailed confirm page -> SIGN IN -> /sign-up?state=finish shows the
//   address read-only -> Finish without the tick is refused on the page -> with names, mobile and the tick -> /account.
// Run after auth-worker.e2e.mjs on the same Worker (phase 1 of run.sh, or by hand with the same env). Nothing is stubbed:
// every request goes to the real Worker and the real local Supabase.
import { chromium } from "@playwright/test";
import { PORT, RUN, rec, finish, sql, before, newMail, linkOf } from "./checkout-common.mjs";

const BASE = `http://localhost:${PORT}`;
const EMAIL = `e2e-finish-browser-${RUN}@example.com`;
const browser = await chromium.launch();
const errors = [];
try {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await ctx.addInitScript(() => {
    try { localStorage.setItem("vamosLang", "en"); } catch (e) {}
  });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push(String(e).slice(0, 120)));

  // F1: ask for a sign-in link with an address that has no account.
  await page.goto(`${BASE}/sign-in`, { waitUntil: "load", timeout: 60000 });
  await page.getByRole("button", { name: "Email me a link instead" }).click();
  await page.getByLabel("Email").fill(EMAIL);
  const seen = before();
  await page.getByRole("button", { name: "Email me a link" }).click();
  await page.locator("[data-af]").getByText("Send another link").waitFor({ timeout: 15000 });
  const mail = await newMail(seen, 10000);
  const link = mail && linkOf(mail);
  rec("F1 the page shows 'check your email' and the mail holds a confirm link", !!link, `mail=${!!mail} link=${!!link}`);

  // F2: open the link, press SIGN IN, land on the finish step with the address shown.
  if (link) {
    const u = new URL(link);
    await page.goto(`${BASE}${u.pathname}${u.search}`, { waitUntil: "load" });
    await page.getByRole("button", { name: "SIGN IN" }).click();
    await page.waitForURL((x) => x.pathname === "/sign-up" && x.searchParams.get("state") === "finish", { timeout: 20000 });
    await page.getByRole("heading", { name: "Finish your account" }).waitFor({ timeout: 15000 });
    const shown = await page.locator("[data-af] [data-note]").innerText();
    const tabs = await page.locator("[data-af] [role=tablist]").count();
    rec("F2 the link lands on 'Finish your account' with the address read-only and no sign-in/sign-up tabs",
      shown.toLowerCase().includes(EMAIL) && tabs === 0, `url=${page.url().replace(BASE, "")}; address shown=${shown.toLowerCase().includes(EMAIL)}; tabs=${tabs}`);

    // F3: Finish without the tick is refused on the page; nothing is written.
    await page.getByLabel("First name").fill("Mia");
    await page.getByLabel("Last name").fill("Keller");
    await page.getByLabel("Mobile number (optional)").fill("+41 79 000 00 00");
    await page.getByRole("button", { name: "FINISH ACCOUNT" }).click();
    await page.getByText("Tick the box to accept the Terms and confirm the Privacy notice.").waitFor({ timeout: 5000 });
    const rows0 = sql(`select count(*) from public.account_agreement_records where lower(email)=lower('${EMAIL}')`);
    rec("F3 Finish without the tick shows the tick error and writes no record", rows0 === "0", `records=${rows0}`);

    // F4: tick and finish -> /account, one record, name and phone on the customer row, no longer asked.
    await page.locator("[data-af-consent] input[type=checkbox]").check();
    await page.getByRole("button", { name: "FINISH ACCOUNT" }).click();
    await page.waitForURL((x) => x.pathname === "/account", { timeout: 20000 });
    await page.waitForTimeout(1500);
    const stillAccount = new URL(page.url()).pathname === "/account";
    const rows1 = sql(`select count(*) from public.account_agreement_records where lower(email)=lower('${EMAIL}') and surface='sign-up' and choice='create'`);
    const cust = sql(`select full_name || '|' || phone from public.customers where email='${EMAIL}'`);
    const pending = sql(`select count(*) from public.account_finish_pending p join auth.users u on u.id=p.user_id where u.email='${EMAIL}' and p.finished_at is null`);
    const sideways = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    rec("F4 with the tick: lands on /account and stays there; one sign-up record; name and phone on the customer row",
      stillAccount && rows1 === "1" && cust === "Mia Keller|+41790000000" && pending === "0" && !sideways,
      `url=${page.url().replace(BASE, "")}; records=${rows1}; customer=${cust}; unfinished marks=${pending}; sideways scroll=${sideways}`);
  } else {
    rec("F2-F4 finish in the browser", false, "no link");
  }
  rec("F5 no page errors", errors.length === 0, errors.length ? errors.slice(0, 3).join(" | ") : "none");
  await ctx.close();
} catch (e) {
  rec("F-run finish browser run", false, String(e).slice(0, 300));
} finally {
  await browser.close();
  finish(process.env.OUT);
}
