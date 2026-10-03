// Spot list for proof-mirror.mjs (-> tools/mirror-check.mjs --spots): the places that carry an arrow-right / chevron-right /
// chevron-left / log-in / log-out icon, on the REAL local Worker build. The stock list (mirror-spots.mjs) is used as it is for the
// public pages that need no sign-in; the pages behind a sign-in get the customer's or the dashboard admin's cookies (made once by
// proof-mirror.mjs, kept on globalThis.__PROOF) and are opened again with them; the manage link and the booking page open the
// seeded Van luxury booking; the dashboard's change row (old -> new arrow) is reached through Edit booking.
import stock from "./mirror-spots.mjs";

const P = () => globalThis.__PROOF;
const css = "[data-ck-banner],[data-ck-veil],[data-ck-modal]{display:none!important}*,*::before,*::after{transition:none!important;animation-duration:0s!important}";
const prefix = (env) => (env.lang === "en" ? "" : `/${env.lang}`);

/** Opens `path` again with the cookies of `who` (customer on the public host, admin on the dashboard host). */
async function again(page, env, who, path) {
  const proof = P();
  await page.context().addCookies(proof[who].cookies);
  const url = who === "admin" ? `${proof.DASH}${path}` : `${proof.BASE}${prefix(env)}${path}`;
  await page.goto(url, { waitUntil: "load" });
  await page.waitForLoadState("networkidle", { timeout: 4000 }).catch(() => {});
  await env.wait(1800);
  await page.addStyleTag({ content: css });
  await env.wait(400);
}

const signedIn = (who, path) => async (page, env) => again(page, env, who, path);

/** The change view of a booking page with its date picker opened (the "make a change" fork, then the When field). */
async function openPicker(page, env) {
  await page.locator("button[data-fork]").first().click();
  await env.wait(700);
  await page.locator("main button[aria-haspopup]").first().click();
  await page.waitForSelector("[data-wp-cal]", { state: "visible" });
  await env.wait(400);
}

/** The dashboard's booking detail, the Edit preview with a changed time: every changed field is a row "old -> new". */
async function opsChangeRow(page, env) {
  const proof = P();
  await page.context().addCookies(proof.admin.cookies);
  // The preview is driven in English (its buttons are named in English); the page then relabels in place (it listens to vamos:locale).
  // (mirror-check's own init script sets the spot's language before every load; this one is registered after it and wins)
  await page.addInitScript(() => { try { localStorage.setItem("vamosLang", "en"); } catch (e) {} });
  await page.goto(`${proof.DASH}/bookings/${proof.S.bookings.plain.reference}`, { waitUntil: "load" });
  await page.getByRole("button", { name: "Actions" }).first().waitFor({ timeout: 30000 });
  await env.wait(1200);
  await page.getByRole("button", { name: "Actions" }).first().click();
  await page.getByRole("menuitem", { name: "Edit booking", exact: true }).click();
  await page.getByLabel("Time", { exact: true }).fill("16:40");
  await page.locator("[data-ops-change-box]").waitFor({ timeout: 25000 });
  await env.wait(1200);
  await page.waitForFunction(() => !document.querySelector("[data-ops-chg-busy]") && document.querySelectorAll("[data-ops-chg-row]").length > 0, null, { timeout: 25000 });
  await page.addStyleTag({ content: css });
  if (env.lang !== "en") {
    await page.evaluate((l) => window.VamosLocale.setLang(l), env.lang);
    await env.wait(1200);
  }
}

const out = stock.map((spot) => {
  if (spot.name === "account") return { ...spot, setup: signedIn("customer", "/account") };
  if (spot.name === "bookings") return { ...spot, setup: signedIn("customer", "/bookings") };
  if (spot.name === "ops-calendar") return { ...spot, setup: signedIn("admin", "/calendar") };
  if (spot.name === "ops-bookings") return { ...spot, setup: signedIn("admin", "/bookings") };
  // the stock spot's token is a stub token: the manage link of the seeded booking instead
  if (spot.name === "manage-picker") return { ...spot, path: `/manage-booking?token=${P().S.tokens.van10}` };
  return spot;
});
// The signed-in booking page, change view with its date picker opened.
out.push({
  name: "booking-detail-picker",
  path: `/booking-detail?ref=${P().S.bookings.van10.reference}`,
  min: 2,
  setup: async (page, env) => {
    await again(page, env, "customer", `/booking-detail?ref=${P().S.bookings.van10.reference}`);
    await openPicker(page, env);
  },
});
// Dashboard: the change row's arrow in the Edit preview.
out.push({ name: "ops-change-arrow", path: "/calendar", host: "ops", min: 1, setup: opsChangeRow });

export default out;
