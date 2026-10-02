// Opens the home booking form in a real browser, opens the time picker, and checks the
// hour sits to the LEFT of the minute in every language. In Arabic the row was reversed
// and 04:30 read as "30 : 04".
import { createRequire } from "node:module";
const require_ = createRequire(process.cwd() + "/apps/web/package.json");
const { chromium } = require_("@playwright/test");
import { serve } from "./serve.mjs";

const LANG = process.env.VT_LANG || "ar";
const { server, base } = await serve("apps/web/public");
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await ctx.newPage();
await page.addInitScript((l) => localStorage.setItem("vamosLang", l), LANG);
await page.route("**/api/**", (r) =>
  r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, data: {} }) }));

let bad = 0;
const note = (ok, what) => { if (!ok) bad++; console.log(`${ok ? "PASS" : "FAIL"}  [${LANG}] ${what}`); };

try {
  await page.goto(base + "/", { waitUntil: "networkidle" });
  await page.waitForTimeout(1200);
  note(await page.locator("html").getAttribute("dir") === (LANG === "ar" ? "rtl" : null) || LANG !== "ar",
    `the page is ${LANG === "ar" ? "right-to-left" : "left-to-right"}`);

  // Open the Time field, whatever it is called in this language.
  // Desktop home: the "When" field of the booking box opens the WhenPicker.
  // Phone: the booking sheet's own Time field. Try both.
  const when = page.locator('[data-om-label="When"] button, [data-bs-time] button, [data-bs-time]').first();
  await when.click({ timeout: 15000 });
  await page.waitForTimeout(900);

  // The markup order is hour, colon, minute. The bug was purely visual: the RTL row
  // painted them in the opposite order. So the check is DOM order == screen order.
  // aria-labels are translated at runtime, so they cannot be used to find the hour.
  const box = await page.evaluate(() => {
    const spans = [...document.querySelectorAll("span")]
      .filter((s) => /^\d{2}$/.test((s.textContent || "").trim()) && s.style.fontSize === "40px");
    if (spans.length < 2) return null;
    return {
      domOrder: spans.map((s) => s.textContent.trim()),
      screenOrder: spans
        .map((s) => ({ t: s.textContent.trim(), x: s.getBoundingClientRect().left }))
        .sort((a, b) => a.x - b.x)
        .map((v) => v.t),
    };
  });

  if (!box) note(false, "could not find the two time numbers on screen");
  else {
    note(true, `markup order ${box.domOrder.join(":")}  screen order ${box.screenOrder.join(":")}`);
    note(
      box.domOrder.join(":") === box.screenOrder.join(":"),
      "the hour is painted before the minute (it used to read reversed in Arabic)",
    );
  }
} catch (e) {
  note(false, "threw: " + e.message);
} finally {
  await browser.close(); server.close();
}
console.log(bad ? `\n[${LANG}] ${bad} check(s) failed` : `\n[${LANG}] all checks passed`);
process.exit(bad ? 1 : 0);
