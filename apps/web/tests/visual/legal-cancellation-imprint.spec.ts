// apps/web/tests/visual/legal-cancellation-imprint.spec.ts
import { test, expect } from "../support/test";
import { testPort } from "../support/port";
import { execFileSync, spawn, type ChildProcess } from "node:child_process";
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
]; // 26.0: the legal ship (owner-approved text) removed the vouchers section


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
  "component-1440": testPort(4200),
  "component-1024": testPort(4201),
  "component-768": testPort(4202),
  "component-390": testPort(4203),
};

let devServer: ChildProcess | null = null;
let baseURL = "";
let port = testPort(4200);

// Frees the port from a server a dead worker left behind. It used to run `lsof -ti tcp:<port> | xargs kill -9` in the
// background: that lists every process with ANY socket on the port, the Playwright worker (its fetch to the server) and
// Chromium included, and on a loaded runner lsof finished only after the new server was up, so it killed its own worker
// ("worker process exited unexpectedly, signal=SIGKILL", five tests at 0 s, the dev logs full of EADDRINUSE restarts).
// Now it runs to the end first, and only the process that LISTENS on the port is stopped.
function killPort(p: number) {
  try {
    const out = execFileSync("lsof", ["-nP", `-iTCP:${p}`, "-sTCP:LISTEN", "-t"], {
      encoding: "utf8",
      timeout: 20_000,
      stdio: ["ignore", "pipe", "ignore"],
    });
    for (const line of out.split("\n")) {
      const pid = Number(line.trim());
      if (!Number.isInteger(pid) || pid <= 1 || pid === process.pid) continue;
      try {
        process.kill(pid, "SIGKILL");
      } catch {
        // already gone
      }
    }
  } catch {
    // nothing listens on the port (lsof exits 1), or lsof is missing
  }
}

// The mocks take their language from the reader's stored choice (VamosLocale), not from
// the URL prefix, so a spec picks a language through the runtime's own public API.
async function openIn(page: import("../support/test").Page, lang: string, path: string) {
  await page.goto(baseURL + path, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await expect(page.locator("main")).toBeVisible({ timeout: 60_000 });
  await page.evaluate((l) => (window as unknown as { VamosLocale: { setLang(v: string): void } }).VamosLocale.setLang(l), lang);
  await expect(page.locator("html")).toHaveAttribute("lang", lang);
}

test.describe("Cancellation and imprint pages @component", () => {
  // One worker runs the whole file. fullyParallel spread its tests over both workers of the Linux job, every worker
  // ran beforeAll and started its own server on this ONE port: the second start answered EADDRINUSE (eight tiny
  // dev logs on the runner), and the killPort below stopped the first worker's server under its tests.
  test.describe.configure({ mode: "serial" });

  test.beforeAll(async ({}, testInfo) => {
    testInfo.setTimeout(180_000);
    port = PORTS[testInfo.project.name] ?? testPort(4209);
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
    // Owner 2026-10-01 (replaces 26.0 D-05): the imprint reads in all four languages,
    // so no reader gets the coverage note; the page itself names German as binding.
    await openIn(page, "ar", "/imprint");
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");

    for (const [lang, path] of [["en", "/imprint"], ["de", "/imprint"], ["fr", "/imprint"], ["ar", "/imprint"], ["fr", "/cancellation"], ["ar", "/cancellation"], ["de", "/cancellation"], ["en", "/cancellation"]] as const) {
      await openIn(page, lang, path);
      await expect(page.locator("#vt-legal-note")).toHaveCount(0);
    }
  });

  test("imprint and cancellation declare their languages @component", async ({ page }) => {
    for (const [path, langs] of [["/imprint", "en de fr ar"], ["/cancellation", "en de fr ar"]] as const) {
      await page.goto(baseURL + path, { waitUntil: "domcontentloaded", timeout: 60_000 });
      await expect(page.locator("main")).toBeVisible({ timeout: 60_000 });
      await expect(page.locator("main")).toHaveAttribute("data-vt-legal", langs);
    }
  });

  test("imprint notice has no sideways scroll, evidence screenshots @component", async ({ page }, testInfo) => {
    for (const locale of ["de", "ar"]) {
      await openIn(page, locale, "/imprint");
      if (locale === "ar") await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
      const fits = await page.evaluate(
        () => document.scrollingElement!.scrollWidth <= document.scrollingElement!.clientWidth,
      );
      expect(fits, `${locale} sideways scroll`).toBe(true);
      // Evidence only, not a baseline.
      await page.screenshot({ path: testInfo.outputPath(`imprint-${locale}-${testInfo.project.name}.png`), fullPage: true });
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
    // 26.0: the legal ship removed every data-tok pill; the count must stay equal in all four languages.
    expect(cancelTok).toHaveLength(0);
    expect(await toks("/en/cancellation")).toEqual(cancelTok);
    expect(await toks("/de/cancellation")).toEqual(cancelTok);
    expect(await toks("/fr/cancellation")).toEqual(cancelTok);

    await page.goto(baseURL + "/ar/imprint", { waitUntil: "domcontentloaded", timeout: 60_000 });
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    const imprintTok = await page.locator("[data-tok]").allTextContents();
    expect(imprintTok).toHaveLength(0);
    expect(await toks("/en/imprint")).toEqual(imprintTok);
    expect(await toks("/de/imprint")).toEqual(imprintTok);
    expect(await toks("/fr/imprint")).toEqual(imprintTok);
  });

  test("imprint key column at inset-inline-start under ar @component", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "component-1024", "two-column layout");
    await openIn(page, "ar", "/imprint");
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
