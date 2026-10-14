// Lab run of the "Price stays valid for" field (quick 261013, Task 3) on the LAB's local Worker dashboard.
// Nothing is stubbed: real sign-in, real PUT /api/staff/rate-book, real Publish, real database read-back.
// LOCAL LAB ONLY (lab name pricing-pol by default); never a live site or database.
//
//   bash scripts/test-lab/lab.sh up pricing-pol --rebuild            # dashboard Worker on (the orchestrator's lab)
//   node .planning/quick/261013-pricing-staff-policies/tools/lab-lock-field.mjs [labName] [evidenceDir]
//
// The script reads the lab's ports itself (`scripts/test-lab/lab.sh env <labName>`) when LAB_DB_URL is not set,
// so an earlier `eval "$(bash scripts/test-lab/lab.sh env pricing-pol)"` is optional.
// Steps: sign in as the lab admin → Pricing › Distance rules shows 24 → type 48 → Save → the draft holds 2880 minutes
// → reload shows 48 → Publish fare book succeeds → the live book and the newest settings_versions row hold 2880.
// Prints PASS/FAIL lines (lab-browser.mjs step format) and exits 1 on any FAIL. The lab keeps 48 hours afterwards
// (lab data is disposable; a `lab.sh reseed` brings back the seed).
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";

const repo = resolve(new URL("../../../../", import.meta.url).pathname);
const LAB = process.argv[2] || process.env.LAB_NAME || "pricing-pol";
const EVIDENCE = process.argv[3] || join(repo, ".planning/quick/261013-pricing-staff-policies/screens/lab-lock-field");

// 1. The lab's variables, before lab-browser.mjs reads them at import.
if (!process.env.LAB_DB_URL || (process.env.LAB_NAME && process.env.LAB_NAME !== LAB)) {
  let out = "";
  try { out = execFileSync("bash", [join(repo, "scripts/test-lab/lab.sh"), "env", LAB], { cwd: repo, stdio: ["ignore", "pipe", "pipe"] }).toString(); }
  catch (e) { console.log(`FAIL | setup | lab.sh env ${LAB}: ${String(e.stderr || e.message).split("\n").filter(Boolean)[0] || "failed"}`); process.exit(1); }
  for (const line of out.split("\n")) {
    const m = /^export ([A-Z_]+)=(.*)$/.exec(line.trim());
    if (!m) continue;
    // lab.sh prints values with printf %q: undo its backslash escapes and surrounding $'…' / '…'.
    let v = m[2];
    if (/^\$'.*'$/.test(v)) v = v.slice(2, -1);
    else if (/^'.*'$/.test(v)) v = v.slice(1, -1);
    process.env[m[1]] = v.replace(/\\(.)/g, "$1");
  }
}
for (const k of ["LAB_DASH", "LAB_DB_URL", "LAB_ADMIN_FILE", "WEB_DIR"]) {
  if (!process.env[k]) { console.log(`FAIL | setup | ${k} is not set: is lab ${LAB} up? (bash scripts/test-lab/lab.sh up ${LAB} --rebuild)`); process.exit(1); }
}
if (!/^postgres(ql)?:\/\/[^@]+@(127\.0\.0\.1|localhost):\d+\//.test(process.env.LAB_DB_URL)) {
  console.log(`FAIL | setup | LAB_DB_URL is not a local database: refusing`); process.exit(1);
}

const { start, finish, open, dashboardSignIn, step, DASH } = await import(join(repo, "scripts/test-lab/lab-browser.mjs"));
const postgres = createRequire(join(repo, "apps/web/package.json"))("postgres");
// Read-only session: the database itself refuses a write from this script.
const sql = postgres(process.env.LAB_DB_URL, { max: 1, idle_timeout: 5, connection: { default_transaction_read_only: "on", application_name: "lab-lock-field" } });

const draftRow = async () => (await sql`select id, quote_lock_minutes from public.rate_versions where status = 'draft' order by id desc limit 1`)[0] ?? null;
const liveRow = async () => (await sql`select id, quote_lock_minutes from public.rate_versions where status = 'live' order by id desc limit 1`)[0] ?? null;
const newestSettings = async () => (await sql`select id, quote_lock_minutes from public.settings_versions order by id desc limit 1`)[0] ?? null;

await start({ evidenceDir: EVIDENCE });
const s = await open({ viewport: 1440, lang: "en", name: "lock1440" });
const { page } = s;
const input = () => page.locator("[data-lock-field] input");
const saveBtn = () => page.locator("[data-lock-save] button");
async function openDistanceRules() {
  await page.goto(DASH + "/pricing", { waitUntil: "networkidle" });
  await page.locator("[data-set-item]").nth(1).click();
  await input().waitFor({ timeout: 15000 });
  // The field fills from GET /api/staff/rate-book after mount.
  for (let i = 0; i < 40 && !(await input().inputValue()); i++) await page.waitForTimeout(250);
}
const btnState = async () => saveBtn().evaluate((b) => ({ primary: b.classList.contains("vt-btn--primary"), ghost: b.classList.contains("vt-btn--ghost"), disabled: b.disabled }));

let draftId = null;
// The dashboard login opens on "Email me a link" (password is no longer offered there), so the shared
// dashboardSignIn helper (password form) cannot sign in. Sign in the way the owner does, with the emailed
// 6-digit code: the page requests it, then this script mints a fresh code for the same address through the
// lab's LOCAL Supabase admin API (generate_link, service key from the lab's own sb.env; 127.0.0.1 only) and
// types it. The lab's auth mail reaches neither Mailpit nor the fakes mailbox, so the code is minted, not read.
async function magicSignIn() {
  const f = Object.fromEntries(readFileSync(process.env.LAB_ADMIN_FILE, "utf8").split("\n").filter(Boolean).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]));
  const sb = Object.fromEntries(readFileSync(join(process.env.LAB_STATE, "sb.env"), "utf8").split("\n").filter((l) => /^[A-Z_]+=/.test(l)).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).replace(/^"|"$/g, "")]));
  if (!/^http:\/\/(127\.0\.0\.1|localhost):\d+/.test(sb.API_URL || "")) throw new Error("refusing: lab API_URL is not local");
  await page.goto(DASH + "/login", { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  await page.locator("input[type=email]").fill(f.email);
  await page.getByRole("button", { name: /email me a link/i }).click();
  const box = page.locator("input[autocomplete='one-time-code'], input[inputmode='numeric']").first();
  await box.waitFor({ timeout: 15000 });
  const r = await fetch(`${sb.API_URL}/auth/v1/admin/generate_link`, {
    method: "POST",
    headers: { apikey: sb.SERVICE_ROLE_KEY, authorization: `Bearer ${sb.SERVICE_ROLE_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({ type: "magiclink", email: f.email }),
  });
  const j = await r.json();
  const code = j.email_otp ?? j.properties?.email_otp;
  if (!code) throw new Error(`generate_link gave no code (${r.status})`);
  await box.fill(code);
  await page.getByRole("button", { name: /^sign in$/i }).click();
  await page.waitForURL((u) => !/\/login/.test(u.pathname), { timeout: 20000 });
}
const ok1 = await step("L1", "dashboard sign-in as the lab admin (emailed code)", async () => {
  await magicSignIn();
  return { ok: !/\/login/.test(new URL(page.url()).pathname), evidence: new URL(page.url()).pathname };
});
if (ok1) {
  await step("L2", "Pricing › Distance rules shows Price stays valid for 24 hours; Save ghost and off", async () => {
    await openDistanceRules();
    const value = await input().inputValue();
    const label = await page.locator("[data-lock-field] label").innerText();
    const b = await btnState();
    const live = await liveRow();
    return { ok: value === "24" && /Price stays valid for/.test(label) && b.ghost && b.disabled, evidence: `value "${value}"; label "${label}"; save ${JSON.stringify(b)}; live book ${JSON.stringify(live)}` };
  }, { shot: true });

  await step("L3", "type 48: Save turns primary; click Save → PUT 200 and the draft holds 2880 minutes", async () => {
    await input().fill("48");
    await page.waitForTimeout(200);
    const b = await btnState();
    const [resp] = await Promise.all([
      page.waitForResponse((r) => new URL(r.url()).pathname.endsWith("/api/staff/rate-book") && r.request().method() === "PUT", { timeout: 15000 }),
      saveBtn().click(),
    ]);
    const body = resp.request().postData();
    const status = resp.status();
    await page.waitForTimeout(800);
    const d = await draftRow();
    draftId = d ? d.id : null;
    const after = await btnState();
    const okLine = await page.locator("[data-lock-ok]").isVisible();
    return {
      ok: b.primary && !b.disabled && status === 200 && JSON.stringify(JSON.parse(body || "null")) === JSON.stringify({ kind: "rule", ruleKind: "quote_lock", quoteLockHours: 48 }) && d && Number(d.quote_lock_minutes) === 2880 && after.ghost && after.disabled && okLine,
      evidence: `before click ${JSON.stringify(b)}; PUT ${status} body ${body}; draft ${JSON.stringify(d)}; after ${JSON.stringify(after)}; saved line ${okLine}`,
    };
  }, { shot: true });

  await step("L4", "reload: the field shows 48", async () => {
    await page.reload({ waitUntil: "networkidle" });
    await openDistanceRules();
    const value = await input().inputValue();
    return { ok: value === "48", evidence: `value "${value}"` };
  }, { shot: true });

  await step("L5", "Publish fare book succeeds", async () => {
    // Header Publish (desktop): the primary button in the header's action group.
    await page.locator("header [data-ops-fold] button.vt-btn--primary").first().click();
    const dlg = page.locator("[role=dialog]").first();
    await dlg.waitFor({ timeout: 10000 });
    const text = await dlg.innerText();
    const warn = await page.locator("[data-price-warn]").count();
    const [resp] = await Promise.all([
      page.waitForResponse((r) => /\/api\/staff\/rate-versions\/[^/]+\/publish$/.test(new URL(r.url()).pathname) && r.request().method() === "POST", { timeout: 30000 }),
      dlg.locator("button.vt-btn--primary").last().click(),
    ]);
    const status = resp.status();
    let answer = ""; try { answer = (await resp.text()).slice(0, 200); } catch (e) {}
    await page.waitForTimeout(1200);
    const okShown = await page.locator("[data-publish-ok]").isVisible().catch(() => false);
    return { ok: status === 200 && /"ok":true/.test(answer) && warn === 0 && !/km band/i.test(text), evidence: `POST publish ${status} ${answer}; success line ${okShown}; dialog band text ${/km band/i.test(text)}; data-price-warn ${warn}` };
  }, { shot: true });

  await step("L6", "the published book and the newest settings_versions row hold 2880 minutes", async () => {
    const live = await liveRow();
    const sv = await newestSettings();
    const d = await draftRow();
    return {
      ok: live && Number(live.quote_lock_minutes) === 2880 && (draftId == null || String(live.id) === String(draftId)) && sv && Number(sv.quote_lock_minutes) === 2880,
      evidence: `live ${JSON.stringify(live)} (saved draft id ${draftId}); newest settings_versions ${JSON.stringify(sv)}; open draft now ${JSON.stringify(d)}`,
    };
  });

  await step("L7", "no page error during the run", async () => ({ ok: s.errors.length === 0, evidence: s.errors.length ? s.errors[0] : "none" }));
}
await sql.end({ timeout: 5 });
await finish();
