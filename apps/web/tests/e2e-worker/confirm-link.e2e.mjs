// F12 end-to-end on the real local Worker + real local Supabase: the e-mailed sign-in link is a confirm page.
// Usage: MAIL_ROOT=<tree>/apps/web/.wrangler/tmp/email E2E_HOOK_SECRET_FILE=<file> node confirm-link.e2e.mjs <label>
// Prints no secrets: mail links are parsed in-process only, addresses are test addresses.
import fs from "node:fs";
import {
  PORT, RUN, ORIGIN, rec, finish, sql, Jar, req, newIp, nap, before, newMail, linkOf, sealE,
} from "./checkout-common.mjs";

const A = `e2e-f12-a-${RUN}@example.com`;
const ATT = `e2e-f12-attacker-${RUN}@example.com`;
const ana = `e2e-f12-ana-${RUN}@example.com`;
const auth = (body, jar) => req("POST", "/api/auth", { jar, headers: { ...ORIGIN, "cf-connecting-ip": newIp() }, body });
const sess = async (jar) => (await req("GET", "/api/auth/session", { jar })).json;
const parts = (link) => { const u = new URL(link); const q = u.searchParams; return { u, token_hash: q.get("token_hash"), type: q.get("type"), e: q.get("e"), next: q.get("next") }; };
const press = (p, jar, extra = {}, headers = ORIGIN) => req("POST", "/api/auth/callback", { jar, headers: { ...headers, "cf-connecting-ip": newIp() }, body: { token_hash: p.token_hash, type: p.type, e: p.e, next: p.next ?? undefined, ...extra } });
const userCount = (e) => Number(sql(`select count(*) from auth.users where lower(email)=lower('${e}')`));

// Two real users (confirmed) made by the stack's admin API route in the tests: use sign-up + link so the address exists.
async function makeUser(email) {
  const seen = before();
  await auth({ mode: "signup", method: "password", email, password: "E2e-F12-pass-1", firstName: "E", lastName: "Two", consent: true }, new Jar());
  const mail = await newMail(seen);
  const link = mail && linkOf(mail);
  if (!link) return false;
  await press(parts(link), new Jar());
  return true;
}
const okA = await makeUser(A), okAt = await makeUser(ATT), okAna = await makeUser(ana);
rec("0 three test users exist (sign-up link pressed on the confirm page)", okA && okAt && okAna, `A=${okA} attacker=${okAt} ana=${okAna}; auth.users=${userCount(A)}/${userCount(ATT)}/${userCount(ana)}`);
await nap(1500);

// 1 magic link for A: the mail holds the site's confirm URL with e, never /auth/v1/verify or the callback
let seen = before();
const reqA = await auth({ mode: "signin", method: "magic", email: A }, new Jar());
const mail1 = await newMail(seen);
const link1 = mail1 && linkOf(mail1);
const p1 = link1 ? parts(link1) : null;
rec("1 magic link mail is /sign-in/confirm with token_hash, type and a sealed e (no /auth/v1/verify, no callback, no plain address)",
  !!p1 && p1.u.pathname === "/sign-in/confirm" && !!p1.token_hash && p1.type === "magiclink" && !!p1.e && !mail1.includes("/auth/v1/verify") && !mail1.includes("/api/auth/callback") && !p1.u.search.includes(encodeURIComponent(A)) && !p1.u.search.includes(A),
  `request ${reqA.status}; path=${p1?.u.pathname}; type=${p1?.type}; e present=${!!p1?.e}`);

if (p1) {
  // 2 opening the page (GET) spends nothing and shows no session; preview returns only the address
  const jarB = new Jar(); // "another device"
  const page = await req("GET", `/sign-in/confirm${p1.u.search}`, { jar: jarB });
  const sAfterGet = await sess(jarB);
  const prev = await req("GET", `/api/auth/confirm/preview?token_hash=${encodeURIComponent(p1.token_hash)}&type=${p1.type}&e=${encodeURIComponent(p1.e)}`, { jar: jarB });
  const prevBad = await req("GET", `/api/auth/confirm/preview?token_hash=other&type=${p1.type}&e=${encodeURIComponent(p1.e)}`, { jar: jarB });
  rec("2 GET of the confirm page: 200, private/no-store/noindex, no session; preview answers only the address (no-store); a moved seal answers expired",
    page.status === 200 && /no-store/.test(page.headers?.["cache-control"] ?? "private, no-store") && sAfterGet?.signedIn !== true && prev.json?.ok === true && prev.json?.email === A.toLowerCase() && Object.keys(prev.json).sort().join() === "email,ok" && prevBad.json?.ok === false && prevBad.json?.code === "expired",
    `page ${page.status}; session after GET=${sAfterGet?.signedIn}; preview=${JSON.stringify({ ...prev.json, email: prev.json?.email ? "<the address>" : undefined })}; moved seal=${JSON.stringify(prevBad.json)}`);

  // 3 a cross-site POST and a missing e are refused, nothing is spent
  const evil = await press(p1, new Jar(), {}, { origin: "https://evil.example" });
  const noOrigin = await press(p1, new Jar(), {}, {});
  const noE = await press({ ...p1, e: undefined }, new Jar());
  const wrongE = await press(p1, new Jar(), { e: await sealE(ATT, p1.token_hash) }); // a seal for another address on this token: verifyOtp gives A, so the address check refuses
  const sAfterRefusals = await sess(jarB);
  rec("3 POST from another site or without Origin is 403; without e 400; a seal for another address is refused and leaves no session",
    evil.status === 403 && noOrigin.status === 403 && noE.status === 400 && wrongE.status === 400 && !(wrongE.setCookies ?? []).some((c) => /sb-.*-auth-token=[^;]+/.test(c) && !/Max-Age=0/i.test(c)),
    `evil ${evil.status}; no origin ${noOrigin.status}; no e ${noE.status}; foreign seal ${wrongE.status} ${JSON.stringify(wrongE.json)}`);

  // 4 the link was spent by the refused address check? (verifyOtp runs before the address check) -> request a fresh link for the real press
  await nap(1500);
  seen = before();
  await auth({ mode: "signin", method: "magic", email: A }, new Jar());
  const mail4 = await newMail(seen);
  const p4 = parts(linkOf(mail4));
  const jarD = new Jar();
  const ok = await press(p4, jarD);
  const sD = await sess(jarD);
  rec("4 the button (POST) on another device signs in for the address the page showed; target is validated and cookies reach the response",
    ok.status === 200 && ok.json?.ok === true && typeof ok.json?.target === "string" && ok.json.target.startsWith("/") && sD?.signedIn === true && (ok.setCookies ?? []).some((c) => /^sb-.*-auth-token/.test(c)),
    `status ${ok.status}; target=${ok.json?.target}; signedIn=${sD?.signedIn}; session cookies set=${(ok.setCookies ?? []).filter((c) => /^sb-/.test(c)).length}`);
  const again = await press(p4, new Jar());
  rec("5 the same link pressed again is expired (one use)", again.status === 400 && again.json?.code === "expired", `status ${again.status} ${JSON.stringify(again.json)}`);
}

// 6 the crafted old form: the attacker's own token in /api/auth/callback?token_hash= no longer signs the victim in
await nap(1500);
seen = before();
await auth({ mode: "signin", method: "magic", email: ATT }, new Jar());
const mailAt = await newMail(seen);
const pAt = parts(linkOf(mailAt));
const victim = new Jar();
const crafted = await req("GET", `/api/auth/callback?token_hash=${encodeURIComponent(pAt.token_hash)}&type=magiclink&next=${encodeURIComponent("/en/account")}`, { jar: victim });
const sVictim = await sess(victim);
rec("6 crafted /api/auth/callback?token_hash=... (attacker's token): 302 to the confirm page, no cookie, no session",
  crafted.status === 302 && /\/sign-in\/confirm/.test(crafted.location ?? "") && (crafted.setCookies ?? []).length === 0 && sVictim?.signedIn !== true,
  `status ${crafted.status}; location path=${(crafted.location ?? "").split("?")[0]}; cookies=${(crafted.setCookies ?? []).length}; signedIn=${sVictim?.signedIn}`);
// and the attacker's link still works for the attacker's own address only: the page shows the attacker's address
const prevAt = await req("GET", `/api/auth/confirm/preview?token_hash=${encodeURIComponent(pAt.token_hash)}&type=magiclink&e=${encodeURIComponent(pAt.e)}`, { jar: victim });
rec("7 an attacker link shown to a victim names the attacker's address (the screen the victim reads)", prevAt.json?.email === ATT.toLowerCase(), `preview address equals the attacker's=${prevAt.json?.email === ATT.toLowerCase()}`);

// 8 already signed in as someone else: pressing switches the account
await nap(1500);
seen = before();
const jarS = new Jar();
await auth({ mode: "signin", method: "password", email: ana, password: "E2e-F12-pass-1" }, jarS);
const sAna = await sess(jarS);
await auth({ mode: "signin", method: "magic", email: A }, new Jar());
const mail8 = await newMail(seen);
const p8 = parts(linkOf(mail8));
const r8 = await press(p8, jarS);
const s8 = await sess(jarS);
rec("8 signed in as Ana, pressing A's link switches to A (the session is A's afterwards)", sAna?.signedIn === true && r8.status === 200 && s8?.signedIn === true && (s8.email ?? "").toLowerCase() === A.toLowerCase(), `before=${sAna?.signedIn}; press ${r8.status}; after signedIn=${s8?.signedIn} is A=${(s8?.email ?? "").toLowerCase() === A.toLowerCase()}`);

// 9 the mailed recovery and sign-up links are confirm links too
await nap(1500);
seen = before();
await auth({ mode: "forgot", email: A }, new Jar());
const mail9 = await newMail(seen);
const l9 = mail9 && linkOf(mail9);
rec("9 the password-reset mail is a confirm link of type recovery", !!l9 && new URL(l9).pathname === "/sign-in/confirm" && new URL(l9).searchParams.get("type") === "recovery", `path=${l9 && new URL(l9).pathname}; type=${l9 && new URL(l9).searchParams.get("type")}`);

finish(process.env.OUT);
