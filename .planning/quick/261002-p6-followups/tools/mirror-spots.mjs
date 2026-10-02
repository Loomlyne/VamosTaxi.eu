// Spots for tools/mirror-check.mjs: the places that carry an arrow-right / chevron-right / chevron-left /
// log-in / log-out icon, with the clicks that open the ones hidden behind a sheet or a calendar.
// Static tree (--root): every spot without `needs`. Local Worker (--base): also needs: "worker" (Next pages).
// needs: "dev-gallery": exists only on a dev server started with VAMOS_DEV_GALLERY=1 (pass --dev-gallery).
import { TOKEN } from "./mirror-stubs.mjs";

const narrow = (env) => env.width < 700;

/** A pickup a week from now, as the Europe/Zurich wall clock the checkout URL carries (YYYY-MM-DDTHH:MM). */
const checkoutWhen = `${new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10)}T08:15`;

/** Opens the phone booking sheet from the bar. */
async function openSheet(page, env) {
  await page.locator("#book button[data-bb]").first().click();
  await page.waitForSelector("[data-bs]", { state: "visible" });
  await env.wait(600);
}

/**
 * Opens the home date picker: the When field in the bar (desktop) or in the phone booking sheet (narrow).
 * The date picker on home and on manage-booking is the WhenPicker design component ([data-wp-cal]),
 * not the bundle's DatePicker (.vt-dp__nav), which no page uses.
 */
async function openHomePicker(page, env) {
  if (narrow(env)) {
    await openSheet(page, env);
    await page.locator('[data-bs] button[aria-haspopup="dialog"]').first().click();
  } else {
    await page.locator('#book button[aria-haspopup="dialog"]:not([data-trav-btn])').first().click();
  }
  await page.waitForSelector("[data-wp-cal]", { state: "visible" });
  await env.wait(400);
}

export default [
  // Home, at rest: hero CTA, services CTA, footer band; phone: the bar's chevron and the trust row's chevron.
  { name: "home", path: "/", min: 3 },
  // Home, phone only: the booking sheet opened from the bar (its "next" arrow).
  { name: "home-sheet", path: "/", widths: [390], setup: openSheet },
  // Home, phone only: the bar after a trip was typed into the sheet ("Zurich Airport > Zermatt" arrow).
  {
    name: "home-bar-trip",
    path: "/",
    widths: [390],
    setup: async (page, env) => {
      await openSheet(page, env);
      await page.locator("[data-bs] input").nth(0).fill("Zurich Airport");
      await page.locator("[data-bs] input").nth(1).fill("Zermatt");
      await env.wait(400);
      await page.locator("[data-bs] button.vt-iconbtn").first().click(); // the sheet's close button
      await env.wait(800);
    },
  },
  // Home date picker (month arrows). 1440: from the bar. 390: from the sheet.
  { name: "home-picker", path: "/", setup: openHomePicker, min: 2 },
  // Account (signed in): header link, shortcut buttons, "See all your bookings" row, sign-out.
  { name: "account", path: "/account", stub: { signedIn: true }, min: 2 },
  // Bookings list (signed in): booking rows with their chevron.
  { name: "bookings", path: "/bookings", stub: { signedIn: true }, min: 1 },
  // Manage booking (guest link), change view with its date picker opened.
  {
    name: "manage-picker",
    path: `/manage-booking?token=${TOKEN}`,
    min: 2,
    setup: async (page, env) => {
      await page.locator("button[data-fork]").first().click();
      await env.wait(600);
      await page.locator("main button[aria-haspopup]").first().click();
      await page.waitForSelector("[data-wp-cal]", { state: "visible" });
      await env.wait(400);
    },
  },
  // Dashboard (ops shell, vamosOpsAuth=1): calendar month arrows and rail toggle; bookings list pager.
  { name: "ops-calendar", path: "/calendar", host: "ops", min: 2 },
  { name: "ops-bookings", path: "/bookings", host: "ops", min: 1 },
  // Checkout trip strip (Next page): back chevron and route arrow. Needs a running Worker.
  {
    name: "checkout-strip",
    path: `/checkout?from=${encodeURIComponent("Zurich Airport")}&to=${encodeURIComponent("Zermatt")}&when=${checkoutWhen}&pax=2&bags=1`,
    needs: "worker",
    min: 2,
  },
  // Next components only a dev gallery shows: DatePicker month arrows, ListRow chevron, ServiceCard arrow.
  { name: "dev-forms", path: "/dev/components/forms", needs: "dev-gallery", min: 1 },
  { name: "dev-data", path: "/dev/components/data", needs: "dev-gallery", min: 1 },
  { name: "dev-services", path: "/dev/home/services", needs: "dev-gallery", min: 1 },
];
