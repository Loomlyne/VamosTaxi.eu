// Clicks the policy card on the dashboard Settings page in a real browser, against the
// synced DC tree, with every /api answer stubbed. No database, no Worker.
//
// Why this exists: 27.1 shipped a Finish button that did nothing while its unit tests were
// green. A new DC form step is not proven until it has been clicked.
//
//   node .planning/quick/261002-hph-policy-settings-publish/tools/drive.mjs
import { createRequire } from "node:module";
const require_ = createRequire(process.cwd() + "/apps/web/package.json");
const { chromium } = require_("@playwright/test");
import { serve } from "./serve.mjs";

const root = "apps/web/public";
const LANG = process.env.VT_LANG || "en";
const LIVE_CITY = 15;   // what customers get now
const WANT_CITY = 30;   // what /terms section 08 promises

let state = {
  company: "Vamos Taxi", address: "", uid: "", phone: "", email: "",
  defaultLang: "en", defaultCur: "CHF",
  cash: false, card: true, twint: true, invoice: false,
  emailConfirm: true, emailReminder: true, smsReminder: false, opsAlerts: true,
  chauffeurTurnaround: 30, vatRateBps: 0,
  minAdvance: 180, cancelWindow: 24, airportWait: 60, cityWait: LIVE_CITY,
  liveMinAdvance: 180, liveCancelWindow: 24, liveAirportWait: 60, liveCityWait: LIVE_CITY,
  policyChanges: [], policyDirty: false,
  policySlug: "fare-publish-18", policyLabel: "Staging matrix", policyEffectiveFrom: "2026-09-26T23:43:05Z",
};

function recompute() {
  const pairs = [
    ["min_advance_minutes", "minAdvance", "liveMinAdvance"],
    ["free_cancel_hours", "cancelWindow", "liveCancelWindow"],
    ["airport_waiting_minutes", "airportWait", "liveAirportWait"],
    ["city_waiting_minutes", "cityWait", "liveCityWait"],
  ];
  state.policyChanges = pairs.flatMap(([field, d, l]) =>
    String(state[d]) === String(state[l]) ? [] : [{ field, from: state[l], to: state[d] }]);
  state.policyDirty = state.policyChanges.length > 0;
}

const steps = [];
function note(ok, what) { steps.push({ ok, what }); console.log(`${ok ? "PASS" : "FAIL"}  ${what}`); }

const api = async (route) => {
  const req = route.request();
  const url = new URL(req.url());
  const path = url.pathname;
  const json = (data) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, data }) });

  if (path.endsWith("/api/staff/settings") && req.method() === "GET") { recompute(); return json(state); }
  if (path.endsWith("/api/staff/settings") && req.method() === "PATCH") {
    const body = JSON.parse(req.postData() || "{}");
    for (const k of ["minAdvance", "cancelWindow", "airportWait", "cityWait"]) {
      if (body[k] !== undefined) state[k] = body[k] === "" ? null : Number(body[k]);
    }
    recompute();
    return json(state);
  }
  if (path.endsWith("/api/staff/settings/policy-publish") && req.method() === "POST") {
    const changes = state.policyChanges;
    state.liveMinAdvance = state.minAdvance; state.liveCancelWindow = state.cancelWindow;
    state.liveAirportWait = state.airportWait; state.liveCityWait = state.cityWait;
    recompute();
    return json({
      published: true, changes,
      liveMinAdvance: state.liveMinAdvance, liveCancelWindow: state.liveCancelWindow,
      liveAirportWait: state.liveAirportWait, liveCityWait: state.liveCityWait,
      policySlug: "policy-publish-20261002T085500000", policyEffectiveFrom: new Date().toISOString(),
    });
  }
  if (path.endsWith("/api/staff/profile")) return json({ email: "owner@vamostaxi.site", role: "admin" });
  if (path.includes("/api/auth")) return json({ email: "owner@vamostaxi.site", role: "admin", passkeys: [] });
  return json({});
};

const { server, base } = await serve(root, { ops: true });
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await ctx.newPage();
await page.addInitScript((l) => { localStorage.setItem("vamosOpsAuth", "1"); localStorage.setItem("vamosLang", l); }, LANG);
await page.route("**/api/**", api);
page.on("pageerror", (e) => note(false, `page error: ${e.message}`));

try {
  await page.goto(`${base}/settings`, { waitUntil: "networkidle" });
  await page.waitForTimeout(900);

  // The policy pane. The page opens on Company, so this click is not optional:
  // without it the script types into the Phone box and proves nothing.
  await page.locator("nav button, aside button, button").filter({ hasText: /Booking policy|Buchungsregeln|Réservation|قواعد الحجز/ }).first().click();
  await page.waitForTimeout(500);

  const boxes = page.locator("section input");
  note((await boxes.count()) === 4, `the policy pane shows its four boxes (saw ${await boxes.count()})`);
  const box = boxes.nth(3); // City waiting included
  await box.fill(String(WANT_CITY));
  await page.waitForTimeout(300);
  note((await box.inputValue()) === String(WANT_CITY), `the City waiting box accepts ${WANT_CITY} (it used to ignore typing)`);

  // Save
  const save = page.locator('button:has-text("SAVE"), button:has-text("SPEICHERN"), button:has-text("ENREGISTRER"), button:has-text("حفظ")').first();
  note(await save.isEnabled(), "Save is live after typing");
  await save.click();
  await page.waitForTimeout(700);

  const changeText = await page.locator('[data-policy-changes="1"]').innerText().catch(() => "");
  note(/15/.test(changeText) && /30/.test(changeText), `the change list names 15 → 30 (got: ${changeText.replace(/\n/g, " | ").slice(0, 120)})`);

  const publish = page.locator('[data-publish-row="1"] button').first();
  note(await publish.isEnabled(), "Publish opens once the draft is saved and differs from live");
  await publish.click();
  await page.waitForTimeout(300);
  const go = page.locator('[data-publish-confirm="1"] button').first();
  note(await go.count() > 0, "the confirm asks before anything reaches a customer");
  note((await publish.innerText()).trim().length > 0, `the Publish button carries its own text in ${LANG} (it rendered blank with a label= prop)`);
  await go.click();
  await page.waitForTimeout(800);

  note(state.liveCityWait === WANT_CITY, `the server now holds city waiting = ${state.liveCityWait}`);
  const after = await page.locator('[data-policy-changes="1"]').innerText().catch(() => "");
  note(!/15/.test(after) || after.trim() === "", "the change list empties after publishing");
} catch (err) {
  note(false, `threw: ${err.message}`);
} finally {
  await browser.close();
  server.close();
}

const failed = steps.filter((s) => !s.ok);
console.log(`\n[${LANG}] ${steps.length - failed.length}/${steps.length} checks passed`);
process.exit(failed.length ? 1 : 0);
