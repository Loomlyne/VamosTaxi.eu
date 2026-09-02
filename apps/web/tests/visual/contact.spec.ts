import { test, expect, type Page } from "@playwright/test";
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { waitForNextServer, WEB_ROOT } from "../support/server-harness";

const PORTS: Record<string, number> = {
  "component-1440": 4250,
  "component-1024": 4251,
  "component-768": 4252,
  "component-390": 4253,
};

const LOCALES = ["en", "de", "fr", "ar"] as const;

const LOCAL_NEXT = join(WEB_ROOT, "node_modules", ".bin", "next");
const MAIN_NEXT = join(WEB_ROOT, "..", "..", "..", "..", "apps", "web", "node_modules", ".bin", "next");
const NEXT_BIN = existsSync(LOCAL_NEXT) ? LOCAL_NEXT : MAIN_NEXT;

const CHANNELS_SRC = readFileSync(join(WEB_ROOT, "lib", "contact-channels.ts"), "utf8");
const PHONE_HREF = CHANNELS_SRC.match(/PHONE_HREF = "([^"]+)"/)?.[1] ?? "";
const WHATSAPP_HREF = CHANNELS_SRC.match(/WHATSAPP_HREF = "([^"]+)"/)?.[1] ?? "";

let devServer: ChildProcess | null = null;
let baseURL = "";

function pathFor(locale: string, route: "/contact" | "/dev/contact-form"): string {
  return locale === "en" ? route : `/${locale}${route}`;
}

async function gotoLocale(page: Page, locale: (typeof LOCALES)[number], route: "/contact" | "/dev/contact-form") {
  await page.addInitScript((lang) => localStorage.setItem("vamosLang", lang), locale);
  await page.goto(baseURL + pathFor(locale, route), { timeout: 60_000 });
  await page.evaluate((lang) => {
    localStorage.setItem("vamosLang", lang);
    (window as Window & typeof globalThis & { VamosLocale?: { setLang: (value: string) => void } })
      .VamosLocale?.setLang(lang);
  }, locale);
  await expect(page.locator("html")).toHaveAttribute("lang", locale);
  await page.waitForTimeout(400);
}

test.describe("Contact page and form @component", () => {
  test.describe.configure({ mode: "serial" });

  test.beforeAll(async ({}, testInfo) => {
    testInfo.setTimeout(240_000);
    const port = PORTS[testInfo.project.name] ?? 4259;
    baseURL = `http://localhost:${port}`;
    devServer = spawn(NEXT_BIN, ["dev", "-p", String(port)], {
      cwd: WEB_ROOT,
      stdio: "ignore",
      detached: true,
      env: {
        ...process.env,
        TEST_DIST_DIR: `test-results/.next-contact-${port}`,
        TURNSTILE_SITE_KEY: "1x00000000000000000000AA",
      },
    });
    await waitForNextServer(baseURL, 180_000);
  });

  test.afterAll(() => {
    if (devServer?.pid) {
      try {
        process.kill(-devServer.pid, "SIGTERM");
      } catch {
        /* gone */
      }
    }
    devServer = null;
  });

  test.beforeEach(async ({ page }) => {
    await page.route("https://challenges.cloudflare.com/**", async (route) => {
      const url = route.request().url();
      if (url.includes("api.js")) {
        await route.fulfill({
          contentType: "application/javascript",
          body: `window.turnstile={render(el,opts){if(opts&&opts.callback)opts.callback("XXXX.DUMMY.TOKEN.XXXX");return "w";},remove(){},reset(){}};`,
        });
        return;
      }
      await route.abort();
    });
  });

  for (const locale of LOCALES) {
    test(`screenshot contact ${locale} @component`, async ({ page }) => {
      await gotoLocale(page, locale, "/contact");
      await expect(page.locator("#dc-root")).toBeVisible({ timeout: 30_000 });
      await expect(page.locator("#dc-root [data-ch]")).toHaveCount(3, { timeout: 30_000 });
      await expect(page.locator("#dc-root [data-ch]").first()).toBeVisible({ timeout: 30_000 });
      // Playwright freezes motion for deterministic captures. The production page
      // transition therefore remains over the DC page unless the test removes it.
      await page.addStyleTag({ content: "#vt-page-transition{display:none!important}" });
      await expect(page).toHaveScreenshot(`contact-${locale}.png`);
    });

    test(`screenshot gallery ${locale} @component`, async ({ page }) => {
      await gotoLocale(page, locale, "/dev/contact-form");
      await expect(page.locator("[data-contact-gallery]")).toBeVisible({ timeout: 30_000 });
      await expect(page).toHaveScreenshot(`contact-gallery-${locale}.png`);
    });
  }

  test("no sideways scroll at 390 @component", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "component-390", "390 only");
    for (const locale of LOCALES) {
      await gotoLocale(page, locale, "/contact");
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      );
      expect(overflow).toBe(true);
    }
  });

  test("form is the first block on mobile @component", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "component-390", "390 only");
    await gotoLocale(page, "en", "/contact");
    const order = await page.evaluate(() => {
      const formCol = document.querySelector("section[aria-labelledby='form-h']");
      const aside = document.querySelector("aside");
      if (!formCol || !aside) return null;
      return {
        formTop: formCol.getBoundingClientRect().top,
        asideTop: aside.getBoundingClientRect().top,
      };
    });
    expect(order).not.toBeNull();
    if (!order) return;
    expect(order.formTop).toBeLessThan(order.asideTop);
  });

  test("channel tiles and form controls are at least 44px @component", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "component-390", "390 only");
    await gotoLocale(page, "en", "/contact");
    const sizes = await page.evaluate(() => {
      const nodes = [
        ...document.querySelectorAll("[data-ch]"),
        ...document.querySelectorAll("form input, form textarea, form button"),
      ];
      return nodes.map((el) => (el as HTMLElement).getBoundingClientRect().height);
    });
    expect(sizes.length).toBeGreaterThan(0);
    for (const h of sizes) expect(h).toBeGreaterThanOrEqual(44);
  });

  test("phone and WhatsApp hrefs match contact-channels @component", async ({ page }) => {
    expect(WHATSAPP_HREF).toContain("wa.me/41796267082");
    expect(PHONE_HREF.startsWith("tel:")).toBe(true);
    await gotoLocale(page, "en", "/contact");
    await expect(page.locator('a[data-ch][href^="tel:"]')).toHaveAttribute("href", PHONE_HREF);
    await expect(page.locator('a[data-ch][href*="wa.me"]')).toHaveAttribute("href", WHATSAPP_HREF);
  });

  test("Arabic contact page preserves RTL chrome and callable direct channels @component", async ({ page }) => {
    await gotoLocale(page, "ar", "/contact");
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await expect(page.locator('a[data-ch][href^="tel:"]')).toHaveAttribute("href", PHONE_HREF);
    await expect(page.locator('a[data-ch][href*="wa.me"]')).toHaveAttribute("href", WHATSAPP_HREF);
  });

  test("text field has no default box shadow @component", async ({ page }) => {
    await gotoLocale(page, "en", "/contact");
    const input = page.locator("#ct-name");
    await expect(input).toHaveCSS("box-shadow", "none");
  });

  test("placeholders and labels differ between en and de @component", async ({ page }) => {
    await gotoLocale(page, "en", "/contact");
    const en = await page.evaluate(() => {
      const placeholders = [...document.querySelectorAll("input[placeholder], textarea[placeholder]")].map(
        (el) => (el as HTMLInputElement).placeholder,
      );
      const labels = [...document.querySelectorAll("form label")].map((el) => el.textContent ?? "");
      return { placeholders, labels };
    });
    await gotoLocale(page, "de", "/contact");
    const de = await page.evaluate(() => {
      const placeholders = [...document.querySelectorAll("input[placeholder], textarea[placeholder]")].map(
        (el) => (el as HTMLInputElement).placeholder,
      );
      const labels = [...document.querySelectorAll("form label")].map((el) => el.textContent ?? "");
      return { placeholders, labels };
    });
    expect(en.placeholders.join("|")).not.toBe(de.placeholders.join("|"));
    expect(en.labels.join("|")).not.toBe(de.labels.join("|"));
  });

  test("failure codes map to translated messages not raw codes @component", async ({ page }) => {
    const codes = ["challenge_failed", "invalid_input", "unavailable"] as const;
    const messages = {
      challenge_failed: { en: "", de: "" },
      invalid_input: { en: "", de: "" },
      unavailable: { en: "", de: "" },
    };

    for (const locale of ["en", "de"] as const) {
      for (const code of codes) {
        await page.route("**/api/contact", async (route) => {
          const status = code === "challenge_failed" ? 403 : code === "invalid_input" ? 400 : 503;
          await route.fulfill({
            status,
            contentType: "application/json",
            body: JSON.stringify({ ok: false, code }),
          });
        });
        await gotoLocale(page, locale, "/contact");
        await expect(page.locator("#dc-root [data-ch]").first()).toBeVisible({ timeout: 30_000 });
        await page.addStyleTag({ content: "#vt-page-transition{display:none!important}" });
        await page.locator("#ct-name").fill("Ada Lovelace");
        await page.locator("#ct-email").fill("ada@example.com");
        await page.locator("#ct-msg").fill("Please move my pickup two hours later than booked.");
        await page.locator('form button[type="submit"]').click();
        const banner = page.getByRole("alert").last();
        await expect(banner).toBeVisible({ timeout: 10_000 });
        if (locale === "de") {
          await expect(banner).not.toContainText("Your message did not send", { timeout: 5_000 });
        }
        const text = (await banner.innerText()).trim();
        expect(text.length).toBeGreaterThan(0);
        expect(text.includes(code)).toBe(false);
        messages[code][locale] = text;
        await page.unroute("**/api/contact");
      }
    }

    expect(messages.challenge_failed.en).not.toBe(messages.challenge_failed.de);
    expect(messages.unavailable.en).not.toBe(messages.unavailable.de);
  });
});
