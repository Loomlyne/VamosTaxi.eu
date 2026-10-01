// Signing pictures for quick task 261001-arabic-design-g23.
// usage: node shoot.mjs <synced public root> <out dir>
// Renders each changed spot of the live DC pages at 1440 and 390, English and
// Arabic, with every /api/* answer stubbed (nothing reaches a real server).
import { mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { serve } from "./serve.mjs";

const require = createRequire(new URL("../../../../apps/web/package.json", import.meta.url));
const { chromium } = require("@playwright/test");

const [root, out] = process.argv.slice(2);
mkdirSync(out, { recursive: true });

const HIDE = `[data-ck-banner],[data-ck-veil],[data-ck-modal]{display:none!important}
*,*::before,*::after{transition:none!important;animation-duration:0s!important}`;

function api(route) {
  const url = route.request().url();
  // The sign-in form shows its "link sent" step when the send answers without a body.
  if (route.request().method() === "POST" && /\/api\/auth$/.test(url)) {
    return route.fulfill({ contentType: "application/json", body: "null" });
  }
  if (url.includes("/api/auth/session")) {
    // Signed in only where the shot needs the account page.
    const signedIn = (route.request().headers()["referer"] || "").includes("/account");
    return route.fulfill({ json: { signedIn, displayName: "Amira Keller", email: "amira@example.com", emailConfirmed: true } });
  }
  if (url.includes("/api/account/bookings")) return route.fulfill({ json: { ok: true, bookings: [], data: [] } });
  return route.fulfill({ json: { ok: true } });
}

async function open(page, path) {
  await page.goto(page.__base + path, { waitUntil: "load" });
  await page.waitForTimeout(1200);
  await page.addStyleTag({ content: HIDE });
  await page.waitForTimeout(900);
}

// Each shot returns the element to capture.
const SHOTS = {
  "phone-imprint": async (page) => {
    await open(page, "/imprint");
    return page.locator("#kontakt");
  },
  "phone-imprint-button": async (page) => {
    await open(page, "/imprint");
    return page.locator('a.vt-btn[href="tel:+41796267082"]').locator("xpath=ancestor::div[2]");
  },
  "phone-cancellation": async (page) => {
    await open(page, "/cancellation");
    return page.locator('p:has(> a[href="tel:+41796267082"])');
  },
  "phone-cancellation-button": async (page) => {
    await open(page, "/cancellation");
    return page.locator('a.vt-btn[href="tel:+41796267082"]:visible').first();
  },
  "phone-account": async (page) => {
    await open(page, "/account");
    return page.locator('a[href="tel:+41796267082"]').first().locator("xpath=ancestor::div[2]");
  },
  "arrow-header": async (page, w) => {
    await open(page, "/terms");
    if (w < 700) {
      await page.locator("[data-hd-menu-btn]").first().click();
      await page.waitForTimeout(500);
      return { el: page.locator("[data-hd-sheet]").first(), maxH: 330 };
    }
    return page.locator('header a[href="/#book"]:visible').first();
  },
  "arrow-dashboard": async (page) => {
    await page.addInitScript(() => localStorage.setItem("vamosOpsAuth", "1"));
    await open(page, "/calendar");
    await page.waitForTimeout(800);
    return page.locator('main span[style*="chevron-left.svg"]:visible').first().locator("xpath=ancestor::div[2]");
  },
  "arrow-terms-cta": async (page) => {
    await open(page, "/terms");
    return page.locator('main a.vt-btn:visible:has(span[style*="arrow-right.svg"])').last();
  },
  "arrow-faq": async (page) => {
    await open(page, "/faq");
    return page.locator('main span[style*="arrow-right.svg"]').first().locator("xpath=ancestor::*[self::a or self::button][1]");
  },
  "signin-sent": async (page) => {
    await open(page, "/sign-in");
    await page.getByRole("button", { name: /link instead|رابط/i }).first().click();
    await page.waitForTimeout(300);
    await page.locator('input[type="email"]').first().fill("amira@example.com");
    await page.locator("main button.vt-btn--primary").first().click();
    await page.waitForTimeout(900);
    return page.locator("[data-af-code]").first();
  },
  "typo-strings": async (page) => {
    await open(page, "/imprint");
    await page.evaluate(() => {
      const L = window.VamosLocale;
      const keys = ["Awaiting payment", "Awaiting live Stripe data", "Waiting, airport", "Waiting, city"];
      const box = document.createElement("div");
      box.id = "vt-typo-strip";
      box.setAttribute("data-vt-no-i18n", "1");
      box.style.cssText = "position:fixed;inset-block-start:0;inset-inline-start:0;z-index:2147483646;background:#fff;padding:24px 32px;display:grid;grid-template-columns:auto auto;gap:10px 40px;font-size:30px";
      for (const k of keys) {
        const a = document.createElement("span"); a.textContent = k; a.dir = "ltr"; a.style.cssText = "font-family:Poppins,sans-serif;font-size:16px;color:#545756";
        const b = document.createElement("span"); b.textContent = L.t(k); b.dir = "rtl"; b.lang = "ar"; b.style.fontFamily = "'Noto Sans Arabic',sans-serif";
        box.append(a, b);
      }
      document.body.append(box);
    });
    return page.locator("#vt-typo-strip");
  },
};

const only = process.env.ONLY ? new Set(process.env.ONLY.split(",")) : null;
const { server, base } = await serve(root);
const { server: opsServer, base: opsBase } = await serve(root, { ops: true });
const OPS_SHOTS = new Set(["arrow-dashboard"]);
const browser = await chromium.launch();
for (const [name, shot] of Object.entries(SHOTS)) {
  if (only && !only.has(name)) continue;
  for (const lang of name === "typo-strings" ? ["ar"] : ["en", "ar"]) {
    for (const w of name === "typo-strings" ? [1440] : [1440, 390]) {
      const ctx = await browser.newContext({ viewport: { width: w, height: 900 }, deviceScaleFactor: 1 });
      const page = await ctx.newPage();
      page.__base = OPS_SHOTS.has(name) ? opsBase : base;
      await page.addInitScript((l) => {
        localStorage.setItem("vamosLang", l);
      }, lang);
      await page.route("**/api/**", api);
      try {
        const got = await shot(page, w);
        const el = got.el ?? got;
        await el.scrollIntoViewIfNeeded();
        await page.waitForTimeout(200);
        const path = `${out}/${name}-${lang}-${w}.png`;
        if (got.maxH) {
          const b = await el.boundingBox();
          await page.screenshot({ path, clip: { x: b.x, y: b.y, width: b.width, height: Math.min(b.height, got.maxH) } });
        } else {
          await el.screenshot({ path });
        }
        console.log("ok", name, lang, w);
      } catch (e) {
        console.log("FAIL", name, lang, w, String(e).split("\n")[0]);
      }
      await ctx.close();
    }
  }
}
await browser.close();
server.close();
opsServer.close();
