import { test, expect, type Page, type Route } from "@playwright/test";
import { serveMock, waitForMockReady } from "../support/mock-harness";

// Quick 260930-obf item C. At >=1081 the home shows "Choose your class" under the bar once From, To and When
// are valid. Prices come only from the server quote: every figure below is a FIXTURE, never a real rate.

const SHOTS = "/private/tmp/claude-501/-Users-koss-Developer-VamosTaxi-eu/3c6c6056-f11d-41a2-8b13-17a758844e5c/scratchpad";

const PLACES = [
  { mapbox_id: "mb-air-1", name: "Fixture Airport", address: "Kloten", is_airport: true },
  { mapbox_id: "mb-street-1", name: "Fixture Street 1", address: "Zurich", is_airport: false },
];

// FIXTURE amounts (rappen) and FIXTURE photos (neutral grey SVG, never a real class photo). Van luxury has no photo on purpose: it shows the empty state.
type FixtureClass = { slug: string; name: string; eligible: boolean; ineligible_reason: string | null; effective_max_pax: number; max_bags: number; total_rappen: number | null; photo_url?: string };
const FIXTURE_CLASSES: FixtureClass[] = [
  { slug: "economy", name: "Economy", eligible: true, ineligible_reason: null, effective_max_pax: 3, max_bags: 3, total_rappen: 11100, photo_url: "/photos/classes/fixture-economy.svg" },
  { slug: "business", name: "Business", eligible: true, ineligible_reason: null, effective_max_pax: 3, max_bags: 3, total_rappen: 22200, photo_url: "/photos/classes/fixture-business.svg" },
  { slug: "van-luxury", name: "Van luxury", eligible: true, ineligible_reason: null, effective_max_pax: 7, max_bags: 7, total_rappen: 33300 },
];
const CATALOG = FIXTURE_CLASSES.map((c) => ({ ...c, total_rappen: null }));

type Counter = { posts: number; bodies: unknown[] };

async function stub(page: Page, mode: "ok" | "slow" | "error" | "limit" | "none" | "toosmall" = "ok"): Promise<Counter> {
  const counter: Counter = { posts: 0, bodies: [] };
  await page.route("**/photos/classes/**", (route) =>
    route.fulfill({ status: 200, contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360" viewBox="0 0 640 360"><rect width="640" height="360" fill="#c9cacb"/><rect x="170" y="150" width="300" height="90" rx="30" fill="#e4e5e5"/></svg>' }),
  );
  await page.route("**/api/geo/suggest**", async (route) => {
    const q = (new URL(route.request().url()).searchParams.get("q") ?? "").toLowerCase();
    const hits = PLACES.filter((s) => s.name.toLowerCase().includes(q)).map(({ mapbox_id, name, address }) => ({ mapbox_id, name, address }));
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ suggestions: hits }) });
  });
  await page.route("**/api/geo/retrieve**", async (route) => {
    const id = new URL(route.request().url()).searchParams.get("mapbox_id");
    const hit = PLACES.find((s) => s.mapbox_id === id);
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, place: hit ? { mapbox_id: id, name: hit.name, isAirport: hit.is_airport } : null }) });
  });
  await page.route("**/checkout?**", (route) => route.fulfill({ status: 200, contentType: "text/html", body: "<html><body>checkout</body></html>" }));
  await page.route("**/api/quote", async (route: Route) => {
    const req = route.request();
    if (req.method() === "GET") {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, classes: CATALOG, fixed_routes: [] }) });
      return;
    }
    counter.posts++;
    counter.bodies.push(req.postDataJSON());
    if (mode === "error") return route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ ok: false, error: "temporarily_unavailable" }) });
    if (mode === "limit") return route.fulfill({ status: 429, contentType: "application/json", body: JSON.stringify({ ok: false, error: "rate_limited" }) });
    if (mode === "slow") await new Promise((r) => setTimeout(r, 1500));
    let classes = FIXTURE_CLASSES;
    if (mode === "toosmall") {
      const pax = (req.postDataJSON() as { pax: number }).pax;
      classes = FIXTURE_CLASSES.map((c) => (pax > c.effective_max_pax ? { ...c, eligible: false, ineligible_reason: "pax", total_rappen: null } : c));
    }
    if (mode === "none") classes = FIXTURE_CLASSES.map((c) => ({ ...c, eligible: false, ineligible_reason: "pax", total_rappen: null }));
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, quote_id: "q-fixture", lock: "lock-fixture", expires_at: "2099-01-01T00:00:00Z", pricing_live: true, display_currency: "CHF", classes, no_eligible_class: mode === "none" }),
    });
  });
  return counter;
}

async function openHome(page: Page, width: number, height = 900) {
  await page.setViewportSize({ width, height });
  await page.goto(await serveMock("app/home/home.dc.html"));
  await waitForMockReady(page);
  const accept = page.getByRole("button", { name: /Accept all/i });
  if (await accept.isVisible().catch(() => false)) await accept.click();
}

async function fillTrip(page: Page, opts: { skipWhen?: boolean } = {}) {
  await page.getByRole("combobox", { name: "From", exact: true }).fill("Fixture Street");
  await page.getByRole("option", { name: /Fixture Street 1/ }).click();
  await page.getByRole("combobox", { name: "To", exact: true }).fill("Fixture Air");
  await page.getByRole("option", { name: /Fixture Airport/ }).click();
  if (opts.skipWhen) return;
  await page.locator('[data-bx="when"] button[aria-haspopup="dialog"]').click();
  const dialog = page.getByRole("dialog", { name: "When" });
  await dialog.getByRole("button", { name: "Next month" }).click();
  await dialog.getByRole("button", { name: "5", exact: true }).click();
  const saved = dialog.getByRole("button", { name: "Saved" });
  if (await saved.isVisible().catch(() => false)) await saved.click();
  await page.keyboard.press("Escape");
}

const section = (page: Page) => page.locator("[data-cc]");
const cards = (page: Page) => page.locator("[data-cc-card]:not([data-skel])");

test.describe("Home laptop class cards @component", () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== "component-1440", "laptop widths run in the 1440 project");
  });

  test("the three classes show from the start without a price; one quote once From, To and When are valid, then the server prices", async ({ page }) => {
    const c = await stub(page);
    await openHome(page, 1440);
    await expect(cards(page)).toHaveCount(3, { timeout: 6000 });
    await expect(section(page).getByRole("heading", { name: "Choose your class" })).toBeVisible();
    await expect(cards(page).nth(0)).toContainText("Economy");
    await expect(cards(page).nth(1)).toContainText("Business");
    await expect(cards(page).nth(2)).toContainText("Van luxury");
    // no figure that looks like a price before the trip is complete; seats and bags only
    await expect(section(page).locator("[data-cc-price]:not([data-cc-need])")).toHaveCount(0);
    expect(await section(page).innerText()).not.toMatch(/CHF|\d\s*\.\s*\d\d/);
    for (let i = 0; i < 3; i++) await expect(cards(page).nth(i).locator("[data-cc-need]")).toHaveText("Fill in the trip to see prices");
    await page.screenshot({ path: `${SHOTS}/obf-c-cards-empty-1440.png` });
    // Select is not silently disabled: it is aria-disabled, and clicking it names what is missing
    const sel = cards(page).nth(1).getByRole("button", { name: "Select" });
    await expect(sel).toHaveAttribute("aria-disabled", "true");
    await sel.click({ force: true }); // aria-disabled, not native disabled: a real click must reach the warning
    const warn = section(page).locator("[data-cc-warn]");
    await expect(warn).toBeVisible();
    await expect(warn).toContainText("Enter a pickup address");
    await expect(warn).toContainText("Enter a drop-off address");
    await expect(warn).toContainText("Choose a pickup time");
    await expect(page.getByRole("combobox", { name: "From", exact: true })).toBeFocused();
    expect(c.posts).toBe(0);
    await fillTrip(page, { skipWhen: true });
    await page.waitForTimeout(1300);
    expect(c.posts, "no quote while When is missing").toBe(0);
    await expect(warn).toContainText("Choose a pickup time");
    await expect(warn).not.toContainText("Enter a pickup address");
    await page.locator('[data-bx="when"] button[aria-haspopup="dialog"]').click();
    const dialog = page.getByRole("dialog", { name: "When" });
    await dialog.getByRole("button", { name: "Next month" }).click();
    await dialog.getByRole("button", { name: "5", exact: true }).click();
    await page.keyboard.press("Escape");
    await expect(cards(page).nth(0).locator("[data-cc-price]:not([data-cc-need])")).toHaveText("CHF 111", { timeout: 6000 });
    await expect(warn).toHaveCount(0);
    expect(c.posts, "exactly one quote for one trip").toBe(1);
    await page.waitForTimeout(1500);
    expect(c.posts, "never re-fired for the same trip").toBe(1);
    await expect(cards(page).nth(1).locator("[data-cc-price]")).toHaveText("CHF 222");
    await expect(cards(page).nth(2).locator("[data-cc-price]")).toHaveText("CHF 333");
    // an eligible card carries data-block="" and must read in the primary text colour, not the muted one
    await expect(cards(page).nth(0).locator("[data-cc-price]")).toHaveCSS("color", "rgb(30, 31, 31)");
    const body = c.bodies[0] as { pickup: { mapbox_id: string }; dropoff: { mapbox_id: string }; pax: number; bags: number; mode: string };
    expect(body.mode).toBe("one_way");
    expect(body.pickup.mapbox_id).toBe("mb-street-1");
    expect(body.dropoff.mapbox_id).toBe("mb-air-1");
    await page.screenshot({ path: `${SHOTS}/obf-c-cards-1440.png` });
  });

  test("photos: the owner's class photo when the server sends one, the car icon when it does not; same card height; no layout shift; correct img attributes", async ({ page }) => {
    await stub(page);
    // the photo arrives late, so the box is measured before and after it loads
    await page.route("**/photos/classes/**", async (route) => {
      await new Promise((r) => setTimeout(r, 1200));
      await route.fulfill({ status: 200, contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360"><rect width="640" height="360" fill="#c9cacb"/></svg>' });
    });
    await openHome(page, 1440, 1400);
    await expect(cards(page)).toHaveCount(3, { timeout: 6000 });
    const eco = cards(page).nth(0), van = cards(page).nth(2);
    const box = async (l: ReturnType<typeof cards>) => (await l.boundingBox())!;
    const before = [await box(cards(page).nth(0)), await box(cards(page).nth(1)), await box(van)];
    const shotBefore = await eco.locator("[data-cc-shot]").boundingBox();
    const img = eco.locator("[data-cc-shot] img");
    await expect(img).toHaveAttribute("src", "/photos/classes/fixture-economy.svg");
    await expect(img).toHaveAttribute("alt", "Economy");
    await expect(img).toHaveAttribute("width", "640");
    await expect(img).toHaveAttribute("height", "360");
    await expect(img).toHaveAttribute("loading", "lazy");
    await expect(img).toHaveAttribute("decoding", "async");
    await expect.poll(() => img.evaluate((e: HTMLImageElement) => e.complete && e.naturalWidth > 0), { timeout: 8000 }).toBe(true);
    const after = [await box(cards(page).nth(0)), await box(cards(page).nth(1)), await box(van)];
    for (let i = 0; i < 3; i++) expect(after[i], `card ${i} did not move or resize when the photo arrived`).toEqual(before[i]);
    expect(await eco.locator("[data-cc-shot]").boundingBox()).toEqual(shotBefore);
    // Van luxury has no photo: the Lucide car icon on a neutral surface, no img, no text, same height as a card with a photo
    await expect(van.locator("[data-cc-shot] img")).toHaveCount(0);
    await expect(van.locator("[data-cc-shot] > *").first()).toBeVisible();
    expect((await van.locator("[data-cc-shot]").innerText()).trim()).toBe("");
    expect((await van.locator("[data-cc-shot]").boundingBox())!.height).toBe((await eco.locator("[data-cc-shot]").boundingBox())!.height);
    expect(after[2]!.height).toBe(after[0]!.height);
    const neutral = await page.evaluate(() => {
      const probe = document.createElement("i");
      probe.style.color = "var(--vt-grey-100)";
      document.body.appendChild(probe);
      const c = getComputedStyle(probe).color;
      probe.remove();
      return c;
    });
    await expect(van.locator("[data-cc-shot]")).toHaveCSS("background-color", neutral);
  });

  test("a photo that fails to load falls back to the car icon, never a broken image", async ({ page }) => {
    await stub(page);
    await page.route("**/photos/classes/fixture-economy.svg", (route) => route.fulfill({ status: 404, body: "" }));
    await openHome(page, 1440, 1400);
    await expect(cards(page)).toHaveCount(3, { timeout: 6000 });
    await expect(cards(page).nth(0).locator("[data-cc-shot] img")).toHaveCount(0, { timeout: 6000 });
    await expect(cards(page).nth(0).locator("[data-cc-shot]")).toBeVisible();
  });

  test("the prices are not in the page source: the home file carries no amount", async ({ page }) => {
    await stub(page);
    await openHome(page, 1440);
    const html = await page.content();
    expect(html).not.toMatch(/CHF\s*[1-9]\d*/);
  });

  test("loading shows a skeleton; picking a class opens /checkout with the trip and class=", async ({ page }) => {
    await stub(page, "slow");
    await openHome(page, 1440);
    await fillTrip(page);
    // loading: the price area is the skeleton; name, seats, bags and photo stay
    await expect(page.locator("[data-cc-price-sk]")).toHaveCount(3, { timeout: 4000 });
    await expect(page.locator("[data-cc-grid]")).toHaveAttribute("aria-busy", "true");
    await expect(cards(page).nth(0)).toContainText("Economy");
    await expect(cards(page).nth(0).locator("[data-cc-price]:not([data-cc-need])")).toHaveCount(0);
    await expect(cards(page).nth(0).locator("[data-cc-shot]")).toBeVisible();
    await expect(cards(page).nth(0).locator("[data-cc-price]:not([data-cc-need])")).toHaveText(/CHF/, { timeout: 6000 });
    await page.screenshot({ path: `${SHOTS}/obf-c-cards-loading-then-ok-1440.png` });
    const nav = page.waitForRequest((r) => r.isNavigationRequest() && /\/checkout\?/.test(r.url()));
    await cards(page).nth(1).getByRole("button", { name: "Select" }).click();
    const u = new URL((await nav).url());
    expect(u.pathname).toBe("/checkout");
    expect(u.searchParams.get("class")).toBe("business");
    expect(u.searchParams.get("from")).toBe("Fixture Street 1");
    expect(u.searchParams.get("fid")).toBe("mb-street-1");
    expect(u.searchParams.get("to")).toBe("Fixture Airport");
    expect(u.searchParams.get("when")).toBeTruthy();
    expect(u.searchParams.get("pax")).toBe("1");
  });

  test("a class the party does not fit is greyed with 'Seats up to N' and cannot be picked", async ({ page }) => {
    await stub(page, "toosmall");
    await openHome(page, 1440);
    await fillTrip(page);
    await page.locator("[data-trav-btn]").click();
    const panel = page.getByRole("dialog", { name: "Travellers" });
    for (let i = 0; i < 4; i++) await panel.getByRole("button", { name: "Add a passenger" }).click();
    await panel.getByRole("button", { name: "Done" }).click();
    await expect(cards(page).nth(0)).toHaveAttribute("data-block", "pax", { timeout: 6000 });
    await expect(cards(page).nth(0)).toContainText("Seats up to 3");
    await expect(cards(page).nth(0).getByRole("button")).toHaveCount(0);
    await expect(cards(page).nth(2)).toHaveAttribute("data-block", "");
    await expect(cards(page).nth(2).getByRole("button", { name: "Select" })).toBeVisible();
    await page.screenshot({ path: `${SHOTS}/obf-c-cards-toosmall-1440.png` });
  });

  test("no class fits: the empty state says so", async ({ page }) => {
    await stub(page, "none");
    await openHome(page, 1440);
    await fillTrip(page);
    await expect(section(page).locator("[data-cc-msg]")).toContainText("No class fits this trip", { timeout: 6000 });
    await expect(section(page).getByRole("button", { name: "Select" })).toHaveCount(0);
  });

  for (const mode of ["error", "limit"] as const) {
    test(`${mode}: classes show without a price and SEE PRICES still goes to checkout`, async ({ page }) => {
      await stub(page, mode);
      await openHome(page, 1440);
      await fillTrip(page);
      await expect(section(page)).toHaveAttribute("data-state", /^(ok|none|limit|error)$/, { timeout: 8000 });
      await expect(cards(page)).toHaveCount(3);
      await expect(section(page).locator("[data-cc-price]")).toHaveCount(3);
      for (const t of await section(page).locator("[data-cc-price]").allInnerTexts()) expect(t).toBe("Price at checkout");
      await expect(section(page).locator("[data-cc-msg]")).toBeVisible();
      const nav = page.waitForRequest((r) => r.isNavigationRequest() && /\/checkout\?/.test(r.url()));
      await page.locator('#book [data-bx="cta"] button').click();
      const u = new URL((await nav).url());
      expect(u.pathname).toBe("/checkout");
      expect(u.searchParams.has("class")).toBe(false);
    });
  }

  test("at most 4 quotes a minute: the 5th trip change shows the no-price cards and sends nothing", async ({ page }) => {
    const c = await stub(page);
    await openHome(page, 1440);
    await fillTrip(page);
    await expect(section(page)).toHaveAttribute("data-state", /^(ok|none|limit|error)$/, { timeout: 8000 });
      await expect(cards(page)).toHaveCount(3);
    const trav = page.locator("[data-trav-btn]");
    for (let i = 0; i < 4; i++) {
      await trav.click();
      const panel = page.getByRole("dialog", { name: "Travellers" });
      await panel.getByRole("button", { name: "Add a passenger" }).click();
      await panel.getByRole("button", { name: "Done" }).click();
      await page.waitForTimeout(1500);
    }
    expect(c.posts, "the guard stops the 5th").toBe(4);
    await expect(section(page).locator("[data-cc-msg]")).toContainText("busy for a moment");
    await expect(section(page).locator("[data-cc-price]").first()).toHaveText("Price at checkout");
  });

  test("phone and tablet never show the cards and never call the quote", async ({ page }) => {
    const c = await stub(page);
    await openHome(page, 1024);
    await expect(section(page)).toHaveCount(0);
    await expect(page.locator("[data-bar-wrap] [data-bb]")).toBeVisible();
    expect(c.posts).toBe(0);
  });

  for (const lang of ["de", "fr", "ar"]) {
    test(`coverage of the cards is empty in ${lang}, nothing scrolls sideways`, async ({ page }) => {
      await stub(page, "toosmall");
      await openHome(page, 1440);
      await fillTrip(page);
      await expect(section(page)).toHaveAttribute("data-state", /^(ok|none|limit|error)$/, { timeout: 8000 });
      await expect(cards(page)).toHaveCount(3);
      await page.evaluate((l) => (window as unknown as { VamosLocale: { setLang(v: string): void } }).VamosLocale.setLang(l), lang);
      await page.waitForTimeout(300);
      const cov = await page.evaluate(
        (l) => (window as unknown as { VamosLocale: { coverage(r: Element, l: string): unknown } }).VamosLocale.coverage(document.querySelector("[data-cc]")!, l),
        lang,
      );
      expect(cov).toMatchObject({ count: 0, strings: [], attrs: [] });
      const w = await page.evaluate(() => ({ sw: document.scrollingElement!.scrollWidth, iw: window.innerWidth }));
      expect(w.sw).toBeLessThanOrEqual(w.iw);
      if (lang === "ar") await page.screenshot({ path: `${SHOTS}/obf-c-cards-ar-1440.png` });
    });
  }
});
