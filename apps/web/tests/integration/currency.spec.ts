// apps/web/tests/integration/currency.spec.ts
//
// I18N-05 / ADR-004's own wording: "the currency switch changes the mark, never the
// number." D-16 additionally requires the switch to be pure client state — no request,
// no navigation, nothing that would vary a cache key for what is a purely presentational
// choice. Both halves are asserted directly here rather than assumed from the store's
// own implementation.
//
// Runs against the real Next.js app (`next dev`, spawned in beforeAll), the same
// dev-server pattern tests/integration/lenis.spec.ts established — the dev-only
// `window.__vamosMoney` / `window.__vamosSetCurrency` test hooks
// (apps/web/lib/locale-shim.ts's `LocaleShimBootstrap`) only exist on a hydrated page.
//
// Tagged "@currency" so `pnpm test:visual --grep @currency` (01-VALIDATION.md's own
// mapping for I18N-05) runs this suite alone, and the plain `pnpm test:visual` still
// picks it up as part of the full run.

import { test, expect, type Page } from "@playwright/test";
import { spawn, type ChildProcess } from "node:child_process";
import { join } from "node:path";

const RUN_PROJECT = "component-1440";
// Playwright compiles this file to CommonJS (apps/web/package.json has no "type":
// "module"), so __dirname is the plain CJS global, matching lenis.spec.ts's own
// convention. tests/integration -> tests -> apps/web.
const WEB_ROOT = join(__dirname, "..", "..");

let devServer: ChildProcess | null = null;
let baseURL = "";

async function waitForServer(url: string, timeoutMs = 60_000): Promise<void> {
  const start = Date.now();
  let lastError: unknown;
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.status < 500) return;
    } catch (err) {
      lastError = err;
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  throw new Error(
    `Dev server at ${url} did not become ready within ${timeoutMs}ms: ${String(lastError)}`,
  );
}

test.beforeAll(async ({}, testInfo) => {
  if (testInfo.project.name !== RUN_PROJECT) return;

  testInfo.setTimeout(90_000);

  const port = 4100 + testInfo.workerIndex;
  baseURL = `http://localhost:${port}`;
  devServer = spawn("pnpm", ["exec", "next", "dev", "-p", String(port)], {
    cwd: WEB_ROOT,
    stdio: "ignore",
    detached: true,
  });
  await waitForServer(baseURL);
});

test.afterAll(() => {
  if (devServer?.pid) {
    try {
      process.kill(-devServer.pid, "SIGTERM");
    } catch {
      // Already gone.
    }
  }
  devServer = null;
});

test.beforeEach(async ({}, testInfo) => {
  test.skip(
    testInfo.project.name !== RUN_PROJECT,
    "The currency store's behaviour doesn't vary by breakpoint — this spec runs once, under component-1440.",
  );
});

async function waitForHooks(page: Page): Promise<void> {
  await page.waitForFunction(
    () => typeof window.__vamosMoney === "function" && typeof window.__vamosSetCurrency === "function",
  );
}

function digitsOnly(value: string): string {
  return value.replace(/\D/g, "");
}

function markOnly(value: string): string {
  return value.replace(/[\d\s.,']/g, "");
}

test.describe("Currency swaps the mark, never the number @currency", () => {
  test.describe.configure({ mode: "serial" });

  test("the server always renders CHF; switching currency changes only the mark, and the digit sequence is byte-identical", async ({
    page,
  }) => {
    await page.goto(baseURL + "/");

    // D-16: the server always renders CHF — proven before the currency-switch test
    // hook is even called, straight from the client's first read of the store.
    await waitForHooks(page);
    const chf = await page.evaluate(() => window.__vamosMoney?.(null));
    expect(chf).toBe("CHF 000");

    const eur = await page.evaluate(() => {
      window.__vamosSetCurrency?.("EUR");
      return window.__vamosMoney?.(null);
    });
    expect(eur).toBeTruthy();

    // The mark changed...
    expect(markOnly(eur as string)).not.toBe(markOnly(chf as string));
    // ...and the figure did not — ADR-004's whole point, asserted as bytes rather than
    // trusted from the formatter's own implementation.
    expect(digitsOnly(eur as string)).toBe(digitsOnly(chf as string));
    expect(digitsOnly(eur as string)).toBe("000");
  });

  test("switching currency touches no request and triggers no navigation — it is pure client state", async ({
    page,
  }) => {
    await page.goto(baseURL + "/");
    await waitForHooks(page);

    const urlBefore = page.url();
    const requestsDuringSwitch: string[] = [];
    page.on("request", (request) => requestsDuringSwitch.push(request.url()));

    await page.evaluate(() => window.__vamosSetCurrency?.("USD"));
    // Give any accidental request a moment to fire before asserting its absence —
    // the switch itself is synchronous, so this is a generous margin, not a race.
    await page.waitForTimeout(200);

    expect(requestsDuringSwitch).toEqual([]);
    expect(page.url()).toBe(urlBefore);

    const usd = await page.evaluate(() => window.__vamosMoney?.(null));
    expect(usd).toBe("$000");
  });

  test("every currency renders the same one CHF-priced figure — ADR-004's 'display-only, CHF is the one priced currency'", async ({
    page,
  }) => {
    await page.goto(baseURL + "/");
    await waitForHooks(page);

    // The display preference genuinely switches (proven by the mark)...
    const aed = await page.evaluate(() => {
      window.__vamosSetCurrency?.("AED");
      return window.__vamosMoney?.(null);
    });
    expect(aed).toBe("AED 000");
    expect(await page.evaluate(() => window.localStorage.getItem("vamosCurrency"))).toBe("AED");

    // ...but there is never a second, independently-priced figure behind it: every
    // mark this suite has exercised (CHF, EUR, USD, AED) formats the identical
    // placeholder figure, "000" — one CHF amount, four marks, never four price lists
    // (the mock's now-dropped `moneySet()` shape ADR-004 explicitly rejects).
    for (const code of ["CHF", "EUR", "USD", "AED"] as const) {
      const formatted = await page.evaluate((c) => {
        window.__vamosSetCurrency?.(c);
        return window.__vamosMoney?.(null);
      }, code);
      expect(digitsOnly(formatted as string)).toBe("000");
    }
  });
});
