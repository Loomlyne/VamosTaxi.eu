// Secure e-mail change on the real local Worker + real local Supabase (double_confirm_changes = true):
// the hook mails a confirm link to the CURRENT and to the NEW address; the change completes when both are pressed.
// Usage: MAIL_ROOT=<tree>/apps/web/.wrangler/tmp/email E2E_HOOK_SECRET_FILE=<file> node email-change.e2e.mjs <label>
// Prints no secrets: links are parsed in-process, addresses are test addresses.
import fs from "node:fs";
import {
  RUN, ORIGIN, rec, finish, sql, Jar, req, newIp, nap, before, files, linkOf, sealE,
} from "./checkout-common.mjs";

const OLD = `e2e-chg-old-${RUN}@example.com`;
const NEW = `e2e-chg-new-${RUN}@example.com`;
const auth = (body, jar) => req("POST", "/api/auth", { jar, headers: { ...ORIGIN, "cf-connecting-ip": newIp() }, body });
const sess = async (jar) => (await req("GET", "/api/auth/session", { jar })).json;
const parts = (link) => { const q = new URL(link).searchParams; return { token_hash: q.get("token_hash"), type: q.get("type"), e: q.get("e") }; };
const press = (p, jar) => req("POST", "/api/auth/callback", { jar, headers: { ...ORIGIN, "cf-connecting-ip": newIp() }, body: { token_hash: p.token_hash, type: p.type, e: p.e, next: "/account" } });
const authEmail = () => sql(`select email from auth.users where lower(email) in (lower('${OLD}'), lower('${NEW}'))`);
const pending = () => sql(`select coalesce(email_change,'') from auth.users where lower(email) in (lower('${OLD}'), lower('${NEW}'))`);
const newMails = async (seen, want, ms = 10000) => {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    const f = files().filter((x) => !seen.has(x));
    if (f.length >= want) return f.map((x) => fs.readFileSync(x, "utf8"));
    await nap(250);
  }
  return files().filter((x) => !seen.has(x)).map((x) => fs.readFileSync(x, "utf8"));
};

// 0 a confirmed user exists and is signed in on its own device
let seen = before();
await auth({ mode: "signup", method: "password", email: OLD, password: "E2e-Chg-pass-1", firstName: "E", lastName: "Two", consent: true }, new Jar());
const [m0] = await newMails(seen, 1);
const jar = new Jar();
const signupLink = m0 && linkOf(m0);
if (signupLink) await press(parts(signupLink), jar);
const s0 = await sess(jar);
rec("0 test user exists and is signed in (sign-up link pressed on the confirm page)", s0?.signedIn === true, `signedIn=${s0?.signedIn}`);

// 1 request the change from the signed-in session
await nap(1500);
seen = before();
const ask = await auth({ action: "update-profile", email: NEW }, jar);
const mails = await newMails(seen, 2);
if (process.env.E2E_DEBUG) for (const t of mails) console.log("DBG", JSON.stringify(t.slice(0, 400)), (t.match(/https?:\/\/[^\s"<>]*confirm/g) ?? []).length);
// the local capture keeps subject-less text only: the current-address mail is the one with the "email change" heading, the new-address mail the "new email" one
const toOld = mails.find((t) => t.includes("Confirm your email change"));
const toNew = mails.find((t) => t.includes("Confirm your new email"));
const pOld = toOld && linkOf(toOld) ? parts(linkOf(toOld)) : null;
const pNew = toNew && linkOf(toNew) ? parts(linkOf(toNew)) : null;
rec("1 e-mail change request sends two mails: one to the current and one to the new address, each a confirm link (type email_change) with its own token_hash",
  ask.status === 200 && mails.length === 2 && !!pOld && !!pNew && pOld.type === "email_change" && pNew.type === "email_change" && pOld.token_hash !== pNew.token_hash && !!pOld.e && !!pNew.e,
  `request ${ask.status} ${JSON.stringify(ask.json)}; mails=${mails.length}; old-link=${!!pOld}; new-link=${!!pNew}; distinct hashes=${pOld && pNew ? pOld.token_hash !== pNew.token_hash : "n/a"}`);

if (pOld && pNew) {
  const pv = async (p) => (await req("GET", `/api/auth/confirm/preview?token_hash=${encodeURIComponent(p.token_hash)}&type=${p.type}&e=${encodeURIComponent(p.e)}`, {})).json;
  const vOld = await pv(pOld), vNew = await pv(pNew);
  rec("2 each link's confirm page names its own recipient (preview)", vOld?.email === OLD.toLowerCase() && vNew?.email === NEW.toLowerCase(), `old link names old=${vOld?.email === OLD.toLowerCase()}; new link names new=${vNew?.email === NEW.toLowerCase()}`);

  // 3 first press: the link of the NEW address, on another device, no session. Must not be an error.
  const jarNew = new Jar();
  const first = await press(pNew, jarNew);
  const sFirst = await sess(jarNew);
  rec("3 first press (new-address link): answers confirmed-waiting-for-the-other (not an error), no session, e-mail unchanged",
    first.status === 200 && first.json?.ok === true && first.json?.pending === true && sFirst?.signedIn !== true && authEmail().toLowerCase() === OLD.toLowerCase(),
    `status ${first.status} ${JSON.stringify(first.json)}; signedIn=${sFirst?.signedIn}; auth.users email unchanged=${authEmail().toLowerCase() === OLD.toLowerCase()}`);

  // 4 the same link again is spent
  const again = await press(pNew, new Jar());
  rec("4 the first link pressed again is expired", again.status === 400 && again.json?.code === "expired", `status ${again.status} ${JSON.stringify(again.json)}`);

  // 5 second press completes the change and signs in
  await nap(500);
  const jarOld = new Jar(); // the current-address link opened on a device with no session
  const second = await press(pOld, jarOld);
  const sSecond = await sess(jarOld);
  const done = authEmail().toLowerCase();
  rec("5 second press (current-address link) completes the change: auth.users email is the new address and the visitor is signed in as it",
    second.status === 200 && second.json?.ok === true && second.json?.pending !== true && done === NEW.toLowerCase() && String(sSecond?.email ?? "").toLowerCase() === NEW.toLowerCase(),
    `status ${second.status} ${JSON.stringify(second.json)}; auth.users email is new=${done === NEW.toLowerCase()}; session email is new=${String(sSecond?.email ?? "").toLowerCase() === NEW.toLowerCase()}`);
}
// 6 the other order: change again, press the CURRENT-address link first (still signed in on the first device), the new one second
const THIRD = `e2e-chg-third-${RUN}@example.com`;
await nap(1500);
seen = before();
const jarA = new Jar();
const signin = await auth({ mode: "signin", method: "password", email: NEW, password: "E2e-Chg-pass-1" }, jarA);
const ask2 = await auth({ action: "update-profile", email: THIRD }, jarA);
const mails2 = await newMails(seen, 2);
const cur2 = mails2.find((t) => t.includes("Confirm your email change"));
const nxt2 = mails2.find((t) => t.includes("Confirm your new email"));
if (cur2 && nxt2 && linkOf(cur2) && linkOf(nxt2)) {
  const pc = parts(linkOf(cur2)), pn = parts(linkOf(nxt2));
  const first2 = await press(pc, jarA);
  const mid = sql(`select email from auth.users where lower(email) in (lower('${NEW}'), lower('${THIRD}'))`).toLowerCase();
  const s1 = await sess(jarA);
  const second2 = await press(pn, new Jar());
  const end = sql(`select email from auth.users where lower(email) in (lower('${NEW}'), lower('${THIRD}'))`).toLowerCase();
  rec("6 other order: current-address link first answers pending and keeps the signed-in session; the new-address link second completes the change",
    first2.json?.pending === true && mid === NEW.toLowerCase() && s1?.signedIn === true && second2.status === 200 && second2.json?.ok === true && end === THIRD.toLowerCase(),
    `sign-in ${signin.status}; request ${ask2.status}; first ${JSON.stringify(first2.json)} (e-mail still old=${mid === NEW.toLowerCase()}, session kept=${s1?.signedIn}); second ${second2.status} ${JSON.stringify(second2.json)}; e-mail now third=${end === THIRD.toLowerCase()}`);
} else rec("6 other order", false, `signin ${signin.status}; request ${ask2.status}; mails=${mails2.length}`);
finish(process.env.OUT);
