// apps/web/tests/visual/legal-cancellation-imprint.spec.ts
import { test, expect } from "@playwright/test";
import { spawn, type ChildProcess } from "node:child_process";
import { NEXT_BIN, waitForNextServer, WEB_ROOT } from "../support/server-harness";

const CANCELLATION_IDS = [
  "tiers",
  "how",
  "modify",
  "delays",
  "driver",
  "noshow",
  "disruption",
  "refunds",
  "vouchers",
];

const IMPRINT_IDS = [
  "register",
  "kontakt",
  "vertretung",
  "mwst",
  "aufsicht",
  "dispute",
  "haftung",
  "urheberrecht",
  "credits",
];

const PORTS: Record<string, number> = {
  "component-1440": 4200,
  "component-1024": 4201,
  "component-768": 4202,
  "component-390": 4203,
};

let devServer: ChildProcess | null = null;
let baseURL = "";
let port = 4200;

function killPort(p: number) {
  try {
    spawn("sh", ["-c", `lsof -ti tcp:${p} | xargs kill -9`], { stdio: "ignore" });
  } catch {
    // already gone
  }
}

test.describe("Cancellation and imprint pages @component", () => {

  test.beforeAll(async ({}, testInfo) => {
    testInfo.setTimeout(180_000);
    port = PORTS[testInfo.project.name] ?? 4209;
    baseURL = `http://localhost:${port}`;
    killPort(port);
    devServer = spawn(NEXT_BIN, ["dev", "-p", String(port)], {
      cwd: WEB_ROOT,
      stdio: "ignore",
      detached: true,
    });
    await waitForNextServer(baseURL);
  });

  test.afterAll(() => {
    if (devServer?.pid) {
      try {
        process.kill(-devServer.pid, "SIGTERM");
      } catch {
        // already gone
      }
    }
    devServer = null;
    killPort(port);
  });

  test.beforeEach(async ({}, testInfo) => {
    testInfo.setTimeout(90_000);
  });

  for (const locale of ["en", "de", "fr", "ar"] as const) {
    const cancellationPath = locale === "en" ? "/cancellation" : `/${locale}/cancellation`;
    const imprintPath = locale === "en" ? "/imprint" : `/${locale}/imprint`;

    test(`screenshot cancellation ${locale} @component`, async ({ page }) => {
      await page.goto(baseURL + cancellationPath, { waitUntil: "domcontentloaded", timeout: 60_000 });
      await expect(page.locator("main")).toBeVisible({ timeout: 60_000 });
      await expect(page).toHaveScreenshot(`cancellation-${locale}.png`);
    });

    test(`screenshot imprint ${locale} @component`, async ({ page }) => {
      await page.goto(baseURL + imprintPath, { waitUntil: "domcontentloaded", timeout: 60_000 });
      await expect(page.locator("main")).toBeVisible({ timeout: 60_000 });
      await expect(page).toHaveScreenshot(`imprint-${locale}.png`);
    });
  }

  test("no sideways scroll at 390 @component", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "component-390", "390 only");
    for (const path of [
      "/cancellation",
      "/de/cancellation",
      "/fr/cancellation",
      "/ar/cancellation",
      "/imprint",
      "/de/imprint",
      "/fr/imprint",
      "/ar/imprint",
    ]) {
      await page.goto(baseURL + path);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      );
      expect(overflow).toBe(true);
    }
  });

  test("imprint definition-list columns @component", async ({ page }, testInfo) => {
    const name = testInfo.project.name;
    test.skip(name !== "component-390" && name !== "component-1024", "390 and 1024 only");
    await page.goto(baseURL + "/imprint");
    const cols = await page.locator("[data-dl-r]").first().evaluate((el) => {
      return getComputedStyle(el).getPropertyValue("grid-template-columns");
    });
    if (name === "component-390") {
      expect(cols.startsWith("230px")).toBe(false);
    } else {
      expect(cols.startsWith("230px")).toBe(true);
    }
  });

  test("TOC hashes match section ids @component", async ({ page }) => {
    await page.goto(baseURL + "/cancellation");
    for (const id of CANCELLATION_IDS) {
      await expect(page.locator(`#${id}`)).toHaveCount(1);
    }
    const cancelHrefs = await page.locator("[data-lg-tl]").evaluateAll((els) =>
      els.map((el) => (el as HTMLAnchorElement).getAttribute("href")),
    );
    expect(cancelHrefs.sort()).toEqual(CANCELLATION_IDS.map((id) => `#${id}`).sort());

    await page.goto(baseURL + "/imprint");
    for (const id of IMPRINT_IDS) {
      await expect(page.locator(`#${id}`)).toHaveCount(1);
    }
    const imprintHrefs = await page.locator("[data-lg-tl]").evaluateAll((els) =>
      els.map((el) => (el as HTMLAnchorElement).getAttribute("href")),
    );
    expect(imprintHrefs.sort()).toEqual(IMPRINT_IDS.map((id) => `#${id}`).sort());
  });

  test("hreflang in raw response @component", async ({ page }) => {
    for (const path of ["/cancellation", "/imprint"]) {
      const res = await page.goto(baseURL + path);
      const body = (await res?.text()) ?? "";
      expect(body).toMatch(/hreflang="en"/i);
      expect(body).toMatch(/hreflang="de"/i);
      expect(body).toMatch(/hreflang="fr"/i);
      expect(body).toMatch(/hreflang="ar"/i);
      expect(body).toMatch(/hreflang="x-default"/i);
    }
  });

  test("I18N-08 imprint notice @component", async ({ page }) => {
    await page.goto(baseURL + "/fr/imprint");
    await expect(page.locator("main")).toBeVisible();
    const frNotice = page.locator("aside.vt-legal-notice");
    await expect(frNotice).toBeVisible();
    await expect(frNotice).toContainText("anglais");
    await expect(frNotice).toContainText("allemand");

    await page.goto(baseURL + "/ar/imprint");
    await expect(page.locator("main")).toBeVisible();
    const arNotice = page.locator("aside.vt-legal-notice");
    await expect(arNotice).toBeVisible();
    await expect(arNotice).toContainText("الإنجليزية");
    await expect(arNotice).toContainText("الألمانية");

    await page.context().clearCookies();
    await page.goto(baseURL + "/imprint");
    await expect(page.locator("main")).toBeVisible();
    await expect(page.locator("aside.vt-legal-notice")).toHaveCount(0);
    await page.goto(baseURL + "/de/imprint");
    await expect(page.locator("aside.vt-legal-notice")).toHaveCount(0);

    for (const path of ["/cancellation", "/de/cancellation", "/fr/cancellation", "/ar/cancellation"]) {
      await page.goto(baseURL + path);
      await expect(page.locator("aside.vt-legal-notice")).toHaveCount(0);
    }
  });

  test("data-vt-legal false four-language claim absent @component", async ({ page }) => {
    // 05-23: the mock `data-vt-legal` attribute is retired. I18N-08 is
    // `pnpm check:legal-claims` on LEGAL_LANGUAGES, not an HTML attribute.
    for (const path of ["/imprint", "/fr/imprint", "/cancellation"]) {
      await page.goto(baseURL + path, { waitUntil: "domcontentloaded", timeout: 60_000 });
      await expect(page.locator("main")).toBeVisible({ timeout: 60_000 });
      await expect(page.locator("main")).not.toHaveAttribute("data-vt-legal");
    }
  });

  test("rtl and English data-tok @component", async ({ page }) => {
    async function toks(path: string) {
      await page.goto(baseURL + path, { waitUntil: "domcontentloaded", timeout: 60_000 });
      await expect(page.locator("main")).toBeVisible({ timeout: 60_000 });
      return page.locator("[data-tok]").allTextContents();
    }

    await page.goto(baseURL + "/ar/cancellation", { waitUntil: "domcontentloaded", timeout: 60_000 });
    await expect(page.locator("main")).toBeVisible({ timeout: 60_000 });
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl"); // dir="rtl"
    const cancelTok = await page.locator("[data-tok]").allTextContents();
    expect(cancelTok).toHaveLength(20);
    expect(await toks("/en/cancellation")).toEqual(cancelTok);
    expect(await toks("/de/cancellation")).toEqual(cancelTok);
    expect(await toks("/fr/cancellation")).toEqual(cancelTok);

    await page.goto(baseURL + "/ar/imprint", { waitUntil: "domcontentloaded", timeout: 60_000 });
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    const imprintTok = await page.locator("[data-tok]").allTextContents();
    expect(imprintTok).toHaveLength(9);
    expect(await toks("/en/imprint")).toEqual(imprintTok);
    expect(await toks("/de/imprint")).toEqual(imprintTok);
    expect(await toks("/fr/imprint")).toEqual(imprintTok);
  });

  test("imprint key column at inset-inline-start under ar @component", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "component-1024", "two-column layout");
    await page.goto(baseURL + "/ar/imprint");
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    const box = await page.locator("[data-dl-k]").first().evaluate((el) => {
      const node = el as HTMLElement;
      const parent = node.parentElement as HTMLElement;
      const r = node.getBoundingClientRect();
      const p = parent.getBoundingClientRect();
      return { left: r.left, right: r.right, parentLeft: p.left, parentRight: p.right };
    });
    const distStart = Math.abs(box.right - box.parentRight);
    const distEnd = Math.abs(box.left - box.parentLeft);
    expect(distStart).toBeLessThan(distEnd);
  });
});
