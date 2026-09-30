// apps/web/tests/integration/signup-agreement-27.spec.ts
//
// Phase 27 plan 16 (META-03, D-03a). Browser proof of the sign-up tick on the mock sign-up page
// (app/pages/sign-in.html -> AuthForm.dc.html), served the way consent-banner-27.spec.ts serves it:
// a node:http static server over apps/web/public (run scripts/sync-dc-mock-to-public.mjs first).
// No Next server, no database. POST /api/auth is answered by page.route and its bodies collected.
//
//  A  sign-up by password at 1440, 1024, 768, 390 (en): label = 26.5 Text 1, two links, unticked press
//     sends nothing and shows the error, tick clears it, ticked press posts consent true.
//  B  sign-up by link at 390: same rule.
//  C  Sign in tab and forgot: no tick box, sign-in body has no consent key.
//  D  de, fr, ar at 390 (and de at 1024 / 768): label and error equal the message files, no sideways
//     scroll, tick row >= 44 px, rtl in ar, VamosLocale.coverage empty.
//  E  server refusals: 400 consent-required and 503 signup-unavailable.
//  F  the dashboard sign-in shows no tick.
//  G  no glow: no brand-yellow box-shadow inside the row; keyboard focus shows the design-system ring.
//
// Expected strings are read from apps/web/i18n/messages/{lang}.json, never typed here. The first-load
// path is real: nothing is injected into the page except the chosen language (a returning customer).
// The spec sets its own viewport per case and skips nothing.

import { test, expect, type Page, type Route } from "@playwright/test";
import { createServer, type Server } from "node:http";
import { existsSync, mkdirSync, readFileSync, statSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import type { AddressInfo } from "node:net";
import { WEB_ROOT } from "../support/server-harness";
import { stubConsentChosen } from "../support/consent-state";

const PUBLIC_ROOT = join(WEB_ROOT, "public");
const LANGS = ["en", "de", "fr", "ar"] as const;
type Lang = (typeof LANGS)[number];
const SHOTS = process.env.SIGNUP_SHOTS_DIR ?? "";

const msg = (l: Lang) => JSON.parse(readFileSync(join(WEB_ROOT, "i18n/messages", `${l}.json`), "utf8")).checkout as Record<string, string>;
const noticeText = (l: Lang) => msg(l).acctCreateNotice!.replace(/<\/?(terms|privacy)>/g, "");
const errorText = (l: Lang) => msg(l).acctCreateConsentError!;
const SEND_FAILED = "Could not send the link. Try again.";

let staticServer: Server | null = null;
let mockURL = "";

test.beforeAll(async () => {
  staticServer = createServer((req, res) => {
    const path = decodeURIComponent((req.url ?? "/").split("?")[0] ?? "/");
    const file = normalize(join(PUBLIC_ROOT, path));
    if (!file.startsWith(PUBLIC_ROOT) || !existsSync(file) || !statSync(file).isFile()) {
      res.statusCode = 404;
      res.end("not found");
      return;
    }
    const types: Record<string, string> = {
      ".html": "text/html; charset=utf-8",
      ".js": "text/javascript; charset=utf-8",
      ".css": "text/css; charset=utf-8",
      ".svg": "image/svg+xml",
      ".json": "application/json",
      ".woff2": "font/woff2",
      ".woff": "font/woff",
      ".jpg": "image/jpeg",
      ".png": "image/png",
    };
    res.setHeader("content-type", types[extname(file)] ?? "application/octet-stream");
    res.end(readFileSync(file));
  });
  await new Promise<void>((ok) => staticServer!.listen(0, "127.0.0.1", ok));
  mockURL = `http://127.0.0.1:${(staticServer.address() as AddressInfo).port}`;
});

test.afterAll(async () => {
  await new Promise<void>((ok) => (staticServer ? staticServer.close(() => ok()) : ok()));
  staticServer = null;
});

type AuthBody = Record<string, unknown>;
type Answer = { status: number; body: unknown };

/** Stubs the network. POST /api/auth bodies are collected; `answer` decides the reply. */
async function stubNet(page: Page, answer: () => Answer = () => ({ status: 200, body: { stage: "sent" } })) {
  const posts: AuthBody[] = [];
  await page.route(
    (url) => /cloudflare|turnstile|stripe/.test(url.hostname),
    (route) => route.abort(),
  );
  await page.route("**/api/**", (route: Route) => route.fulfill({ status: 200, contentType: "application/json", body: "{}" }));
  await stubConsentChosen(page);
  await page.route("**/api/auth", (route: Route) => {
    if (route.request().method() !== "POST") return route.fallback();
    posts.push(route.request().postDataJSON() as AuthBody);
    const a = answer();
    return route.fulfill({ status: a.status, contentType: "application/json", body: JSON.stringify(a.body) });
  });
  return posts;
}

/** Opens a mock page the way a returning customer does: only the chosen language is stored first. */
async function open(page: Page, path: string, lang: Lang = "en", size = { width: 390, height: 844 }) {
  await page.setViewportSize(size);
  if (lang !== "en") await page.addInitScript((l) => localStorage.setItem("vamosLang", l), lang);
  await page.goto(`${mockURL}${path}`);
}

const row = (page: Page) => page.locator("[data-af-consent] .vt-check");
const box = (page: Page) => page.locator('[data-af-consent] input[type="checkbox"]');
const err = (page: Page) => page.locator("[data-af-consent] [data-af-err]");
const cta = (page: Page) => page.locator("[data-af-cta] button").first();

async function ready(page: Page) {
  // The notice script loads from the component's own helmet: wait for the row to appear on its own.
  await expect(row(page)).toBeVisible({ timeout: 30_000 });
}

async function fillSignup(page: Page) {
  await page.locator('input[autocomplete="given-name"]').fill("Anna");
  await page.locator('input[autocomplete="family-name"]').fill("Keller");
  await page.locator('input[autocomplete="email"]').fill("anna.keller@example.com");
  await page.locator('input[autocomplete="new-password"]').fill("correct-horse-9");
}

/** The real checkbox input is visually hidden by the design system; a click on its box ticks it. */
const tick = (page: Page) => page.locator("[data-af-consent] .vt-check__box").click();

async function noSideways(page: Page) {
  const { sw, cw } = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
  expect(sw).toBeLessThanOrEqual(cw);
}

async function shot(page: Page, name: string) {
  if (!SHOTS) return;
  mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: join(SHOTS, `${name}.png`), fullPage: true });
}

// ------------------------------------------------------------------------------------------ A
for (const size of [
  { width: 1440, height: 900 },
  { width: 1024, height: 768 },
  { width: 768, height: 1024 },
  { width: 390, height: 844 },
]) {
  test(`A: sign-up by password needs the tick at ${size.width}px (en)`, async ({ page }) => {
    const posts = await stubNet(page);
    await open(page, "/app/pages/sign-in.html?state=e", "en", size);
    await ready(page);

    await expect(box(page)).not.toBeChecked();
    await expect(page.locator("[data-af-consent] .vt-check__text")).toHaveText(noticeText("en"));
    const links = page.locator("[data-af-consent] .vt-check__text a");
    await expect(links).toHaveCount(2);
    await expect(links.nth(0)).toHaveAttribute("href", "/terms");
    await expect(links.nth(1)).toHaveAttribute("href", "/privacy");
    for (let i = 0; i < 2; i++) {
      await expect(links.nth(i)).toHaveAttribute("target", "_blank");
      expect(await links.nth(i).getAttribute("rel")).toContain("noopener");
    }
    await noSideways(page);
    if (size.width === 1440 || size.width === 390) await shot(page, `signup-tick-en-${size.width}`);

    await fillSignup(page);
    await cta(page).click();
    await expect(err(page)).toHaveText(errorText("en"));
    await expect(err(page)).toHaveAttribute("role", "alert");
    await expect(box(page)).toHaveAttribute("aria-invalid", "true");
    expect(posts).toHaveLength(0);
    if (size.width === 390) await shot(page, "signup-tick-error-en-390");

    await tick(page);
    await expect(box(page)).toBeChecked();
    await expect(err(page)).toHaveCount(0);
    await cta(page).click();
    await expect.poll(() => posts.length).toBe(1);
    expect(posts[0]).toMatchObject({ mode: "signup", method: "password", consent: true });
    await expect(page.getByRole("heading", { name: "Check your email" })).toBeVisible();
  });
}

// ------------------------------------------------------------------------------------------ B
test("B: sign-up by link needs the tick (en, 390)", async ({ page }) => {
  const posts = await stubNet(page);
  await open(page, "/app/pages/sign-in.html?state=g", "en", { width: 390, height: 844 });
  await ready(page);
  await page.locator('input[autocomplete="email"]').fill("anna.keller@example.com");
  await cta(page).click();
  await expect(err(page)).toHaveText(errorText("en"));
  expect(posts).toHaveLength(0);
  await tick(page);
  await cta(page).click();
  await expect.poll(() => posts.length).toBe(1);
  expect(posts[0]).toMatchObject({ mode: "signup", method: "magic", consent: true });
});

// ------------------------------------------------------------------------------------------ C
test("C: the Sign in tab, link sign-in and forgot show no tick; sign-in posts no consent", async ({ page }) => {
  const posts = await stubNet(page, () => ({ status: 200, body: { ok: false, reason: "credentials" } }));
  for (const path of ["/app/pages/sign-in.html", "/app/pages/sign-in.html?state=c", "/app/pages/sign-in.html?state=i"]) {
    await open(page, path);
    await expect(page.locator('input[autocomplete="email"]')).toBeVisible({ timeout: 30_000 });
    await page.waitForTimeout(1500);
    await expect(page.locator("[data-af-consent]")).toHaveCount(0);
  }
  await open(page, "/app/pages/sign-in.html");
  await page.locator('input[autocomplete="email"]').fill("anna.keller@example.com");
  await page.locator('input[autocomplete="current-password"]').fill("correct-horse-9");
  await cta(page).click();
  await expect.poll(() => posts.length).toBe(1);
  expect(posts[0]).toMatchObject({ mode: "signin", method: "password" });
  expect("consent" in (posts[0] ?? {})).toBe(false);
});

// ------------------------------------------------------------------------------------------ D
for (const lang of ["de", "fr", "ar"] as const) {
  const sizes = lang === "de"
    ? [{ width: 390, height: 844 }, { width: 1024, height: 768 }, { width: 768, height: 1024 }]
    : [{ width: 390, height: 844 }];
  for (const size of sizes) {
    test(`D: ${lang} at ${size.width}px: notice, error, fit, coverage`, async ({ page }) => {
      await stubNet(page);
      await open(page, "/app/pages/sign-in.html?state=e", lang, size);
      await ready(page);

      await expect(page.locator("[data-af-consent] .vt-check__text")).toHaveText(noticeText(lang));
      const h = await row(page).evaluate((el) => el.getBoundingClientRect().height);
      expect(h).toBeGreaterThanOrEqual(44);
      if (lang === "ar") expect(await page.evaluate(() => document.documentElement.dir)).toBe("rtl");
      await noSideways(page);
      if (size.width === 390) await shot(page, `signup-tick-${lang}-390`);

      await fillSignup(page);
      await cta(page).click();
      await expect(err(page)).toHaveText(errorText(lang));
      await noSideways(page);
      if (size.width === 390) await shot(page, `signup-tick-error-${lang}-390`);

      const missing = await page.evaluate(() => (window as unknown as { VamosLocale: { coverage: (r: Element) => unknown } }).VamosLocale.coverage(document.body));
      // Nothing untranslated. The three example placeholders of the name and email fields (Anna, Keller,
      // you@example.com) are pre-existing sample data that no language changes.
      expect(missing).toMatchObject({ count: 3, strings: [] });
      expect((missing as unknown as { attrs: string[] }).attrs.sort()).toEqual(["Anna", "Keller", "you@example.com"]);
    });
  }
}

// ------------------------------------------------------------------------------------------ E
test("E: the server refuses (400 consent-required, 503 signup-unavailable)", async ({ page }) => {
  let next: Answer = { status: 400, body: { ok: false, reason: "consent-required" } };
  const posts = await stubNet(page, () => next);
  await open(page, "/app/pages/sign-in.html?state=e");
  await ready(page);
  await fillSignup(page);
  await tick(page);
  await cta(page).click();
  await expect.poll(() => posts.length).toBe(1);
  await expect(err(page)).toHaveText(errorText("en"));
  await expect(cta(page)).toBeVisible();
  await expect(box(page)).not.toBeChecked();

  next = { status: 503, body: { ok: false, reason: "signup-unavailable" } };
  await tick(page);
  await cta(page).click();
  await expect.poll(() => posts.length).toBe(2);
  await expect(page.getByText(SEND_FAILED)).toBeVisible();
  await expect(cta(page)).toBeVisible();
  await expect(row(page)).toBeVisible();
});

// ------------------------------------------------------------------------------------------ F
test("F: the dashboard sign-in shows no tick", async ({ page }) => {
  await stubNet(page);
  // The old mock address forwards to the real dashboard sign-in at /login (a Next page, not served by
  // this static server). Neither the forward nor the dashboard component carries the tick.
  await open(page, "/app/ops/ops-login.html");
  await page.waitForURL(/\/login$/, { timeout: 30_000 });
  await expect(page.locator("[data-af-consent]")).toHaveCount(0);
});

// ------------------------------------------------------------------------------------------ G
test("G: no glow on the tick row; keyboard focus shows the design-system ring only", async ({ page }) => {
  await stubNet(page);
  await open(page, "/app/pages/sign-in.html?state=e", "en", { width: 1440, height: 900 });
  await ready(page);
  const NEEDLE = "253, 194, 11";

  const shadows = () =>
    page.evaluate(() =>
      Array.from(document.querySelectorAll("[data-af-consent], [data-af-consent] *")).map((el) => ({
        tag: `${el.tagName.toLowerCase()}.${(el as HTMLElement).className}`,
        shadow: getComputedStyle(el).boxShadow,
      })),
    );
  const expectClean = async (when: string) => {
    for (const s of await shadows()) expect(s.shadow, `${when}: ${s.tag}`).not.toContain(NEEDLE);
  };

  await row(page).hover();
  await expectClean("hover row");
  const links = page.locator("[data-af-consent] .vt-check__text a");
  for (let i = 0; i < 2; i++) {
    await links.nth(i).hover();
    await expectClean(`hover link ${i}`);
  }
  await fillSignup(page);
  await cta(page).click();
  await expect(err(page)).toBeVisible();
  await expectClean("error showing");

  // Keyboard focus: Tab from the password eye lands on the checkbox.
  await page.locator("[data-af-eye]").focus();
  await page.keyboard.press("Tab");
  await expect(box(page)).toBeFocused();
  const ringShadow = await page.evaluate(() => {
    const p = document.createElement("div");
    p.style.boxShadow = "var(--vt-ring)";
    document.body.appendChild(p);
    const v = getComputedStyle(p).boxShadow;
    p.remove();
    return v;
  });
  expect(ringShadow).not.toBe("none");
  // The box-shadow transitions in; wait for the settled value.
  await expect
    .poll(() => page.locator("[data-af-consent] .vt-check__box").evaluate((el) => getComputedStyle(el).boxShadow))
    .toBe(ringShadow);
  for (const s of await shadows()) {
    if (s.tag.startsWith("span.vt-check__box")) continue;
    expect(s.shadow, `focus: ${s.tag}`).not.toContain(NEEDLE);
  }
});
