// 26.5 plan 07: checkout sign-in, provisioned accounts and the account record at PAY, on the real
// Worker build (wrangler dev) against the real local Supabase with the Send Email Hook on.
// Run by run.sh after the auth and other-device scenarios, on a Worker that also holds the local
// stand-in secrets (mkcfg.mjs phase2) and reaches fakes.mjs for Stripe and Turnstile.
//   MAIL_ROOT=<tree>/apps/web/.wrangler/tmp/email SB_DB_CONTAINER=supabase_db_vamos-taxi-265 \
//   SB_API_PORT=61321 SB_ANON_KEY=... SB_SERVICE_KEY=... E2E_PORT=4295 node checkout-account.e2e.mjs <label>
// Local only. Prints no secrets: mail links, codes, tokens and access tokens are parsed in-process.
import crypto from "node:crypto";
import {
  PORT, RUN, ORIGIN, rec, finish, sql, sqlFile, Jar, req, newIp, nap, timed, before, newMail, mailCount, linkOf, codeOf, subjectOf, linkType, follow,
  admin, createAuthUser, authUserCount, confirmedAt, ensureFixture, setGuestSwitch, mintQuote, intentBody, payReq, agreementRows, consentLogCount,
  sessionCookie, CLASS_SLUG, freshWindow,
} from "./checkout-common.mjs";

const LABEL = process.argv[2] ?? "run";
ensureFixture({ guestSwitch: true });

const TOKEN = "e2e-turnstile-token"; // the fake siteverify accepts any token except "fail"
const CO = "/checkout?from=Zurich%20Airport&to=Zurich%20HB&when=2099-01-01T10%3A00&pax=2&bags=1&class=business";
const signIn = (email, jar, extra = {}) =>
  req("POST", "/api/auth", { jar, headers: { ...ORIGIN, "cf-connecting-ip": newIp() },
    body: { method: "magic", mode: "signin", origin: "checkout", email, turnstileToken: TOKEN, returnTo: CO, locale: "en", ...extra } });

// ---- 1-3 neutral sign-in: known and unknown ---------------------------------------------------
const KNOWN = `e2e-co-known-${RUN}@example.com`, UNKNOWN = `e2e-co-unknown-${RUN}@example.com`;
await createAuthUser(KNOWN, {}, true);

let seen = before();
const rKnown = await timed(() => signIn(KNOWN, new Jar()));
const mailKnown = await newMail(seen);
rec("1 checkout sign-in, known confirmed e-mail: 200 sent, one mail",
  rKnown.status === 200 && rKnown.json?.stage === "sent" && !!mailKnown && mailCount(seen) === 1,
  `status ${rKnown.status} body=${JSON.stringify(rKnown.json)} mails=${mailCount(seen)} link=${!!(mailKnown && linkOf(mailKnown))} code=${!!(mailKnown && codeOf(mailKnown))} type=${mailKnown ? linkType(linkOf(mailKnown) ?? "") : "-"}`);

await nap(1500);
seen = before();
const rUnknown = await timed(() => signIn(UNKNOWN, new Jar()));
await nap(3000);
rec("2 checkout sign-in, unknown e-mail: same status and body, no auth user, no mail",
  rUnknown.status === rKnown.status && rUnknown.text === rKnown.text && authUserCount(UNKNOWN) === 0 && mailCount(seen) === 0,
  `status ${rUnknown.status} identical body=${rUnknown.text === rKnown.text} auth.users=${authUserCount(UNKNOWN)} mails=${mailCount(seen)}`);

rec("3 timing floor: both answers take at least 1200 ms",
  rKnown.ms >= 1200 && rUnknown.ms >= 1200,
  `known ${rKnown.ms} ms, unknown ${rUnknown.ms} ms, difference ${Math.abs(rKnown.ms - rUnknown.ms)} ms`);

// ---- 4 unconfirmed checkout-made user: account_signin mail, link path and code path ------------
const UNCONF_A = `e2e-co-unconf-a-${RUN}@example.com`, UNCONF_B = `e2e-co-unconf-b-${RUN}@example.com`;
await createAuthUser(UNCONF_A, { vamos_account_origin: "checkout-create", locale: "en" }, false);
await nap(1200);
seen = before();
const jar4 = new Jar();
let r = await signIn(UNCONF_A, jar4);
const m4 = await newMail(seen);
const l4 = m4 && linkOf(m4);
// The local capture keeps the text part only. The account_signin template says "Sign in and finish your account";
// the sign-up template says "Confirm your email" and the plain sign-in link says "Sign in to Vamos Taxi".
const notSignupTemplate = !!m4 && /Sign in and finish your account/.test(m4) && !/Confirm your email/.test(m4);
const hasCode4 = !!m4 && !!codeOf(m4);
rec("4 unconfirmed checkout user: sent, and the mail is the account_signin template (not the sign-up one)",
  r.status === 200 && r.json?.stage === "sent" && notSignupTemplate && !!l4 && hasCode4,
  `status ${r.status} stage=${r.json?.stage}; heading "Sign in and finish your account" present=${notSignupTemplate}; email_action_type in link=${l4 ? linkType(l4) : "-"}; link=${!!l4} code=${hasCode4}`);

if (l4) {
  const f = await follow(l4, jar4);
  const wantPath = CO.replace(/%20/g, "%20");
  const sameCheckout = f.finalPath.split("?")[0] === "/checkout" && ["from", "to", "when", "pax", "bags", "class"].every((k) => new URL(`http://x${f.finalPath}`).searchParams.get(k) === new URL(`http://x${CO}`).searchParams.get(k));
  const sess = await req("GET", "/api/auth/session", { jar: jar4 });
  rec("4a link path: lands on the exact checkout returnTo (path and query) with a session, e-mail now confirmed",
    sameCheckout && sess.json?.signedIn === true && confirmedAt(UNCONF_A) !== "",
    `hops=${f.hops.join(">")} final=${f.finalPath} query kept=${sameCheckout} signedIn=${sess.json?.signedIn} confirmed=${confirmedAt(UNCONF_A) !== ""}`);
} else rec("4a link path", false, "no link in the mail");

await createAuthUser(UNCONF_B, { vamos_account_origin: "checkout-create", locale: "en" }, false);
await nap(1200);
seen = before();
await signIn(UNCONF_B, new Jar());
const m4b = await newMail(seen);
const code4b = m4b && codeOf(m4b);
if (code4b) {
  const jarB = new Jar();
  const v = await req("POST", "/api/auth", { jar: jarB, headers: { ...ORIGIN, "cf-connecting-ip": newIp() }, body: { mode: "verify-code", email: UNCONF_B, code: code4b } });
  const sess = await req("GET", "/api/auth/session", { jar: jarB });
  rec("4b code path: the 6-digit code signs in and confirms the e-mail (type email verifies a sign-up code)",
    v.status === 200 && v.json?.ok === true && sess.json?.signedIn === true && confirmedAt(UNCONF_B) !== "",
    `verify-code ${v.status} ${JSON.stringify(v.json)}; signedIn=${sess.json?.signedIn}; confirmed=${confirmedAt(UNCONF_B) !== ""}`);
} else rec("4b code path", false, "no code in the mail");

// ---- 5-6 provisioned account: nothing before the link, the booking after it --------------------
const PROV = `e2e-co-prov-${RUN}@example.com`;
const provId = await createAuthUser(PROV, { vamos_account_origin: "checkout-create", locale: "en" }, false);
await sqlFile(`
insert into public.bookings (contact_name, contact_email, contact_phone, quote_id, status)
 values ('Pia Provisioned', '${PROV}', '+41795550111', '${crypto.randomUUID()}', 'paid');
insert into public.booking_legs (booking_id, leg_seq, direction, pickup_text, dropoff_text, scheduled_at, scheduled_local, vehicle_class_id)
 select b.id, 1, 'outbound', 'Zurich Airport', 'Zurich HB', now() + interval '30 days', to_char(now() + interval '30 days', 'YYYY-MM-DD"T"HH24:MI'), vc.id
   from public.bookings b, public.vehicle_classes vc where b.contact_email = '${PROV}' and vc.slug = '${CLASS_SLUG}';
insert into public.price_snapshots (quote_id, vehicle_class_id, rate_version_id, rate_version_is_live, settings_version_id, engine_version, pax, bags, lines, policy, booking_id, expires_at, quote_lock_expires_at, subtotal_rappen, surcharges_rappen, discount_rappen, total_rappen)
 select b.quote_id, vc.id, rv.id, true, (select id from public.settings_versions order by effective_from desc, id desc limit 1), 'quote-engine@e2e', 1, 0,
        '[{"seq":1,"leg_seq":1,"kind":"fare","code":"distance_fare","i18n_key":"price.line.transfer","amount_rappen":1000}]'::jsonb,
        jsonb_build_object('cancellation_tiers','[]'::jsonb,'free_cancel_hours',24,'airport_waiting_minutes',60,'city_waiting_minutes',15,'settings_version_id',1,'modification_deadline_hours',24,'min_advance_minutes',180,'policy_doc','test'),
        b.id, now() + interval '2 hours', now() + interval '2 hours', 1000, 0, 0, 1000
   from public.bookings b, public.vehicle_classes vc, public.rate_versions rv where b.contact_email = '${PROV}' and vc.slug = '${CLASS_SLUG}' and rv.slug = 'e2e265-rv';
update public.bookings b set price_snapshot_id = s.id, price_total_rappen = 1000 from public.price_snapshots s where s.booking_id = b.id and b.contact_email = '${PROV}';
`);
const pwTry = await req("POST", "/api/auth", { jar: new Jar(), headers: { ...ORIGIN, "cf-connecting-ip": newIp() }, body: { mode: "signin", method: "password", email: PROV, password: "E2e-No-Password-1" } });
const noSession = await req("GET", "/api/account/bookings", { jar: new Jar() });
const pwJar = new Jar();
await req("POST", "/api/auth", { jar: pwJar, headers: { ...ORIGIN, "cf-connecting-ip": newIp() }, body: { mode: "signin", method: "password", email: PROV, password: "E2e-No-Password-1" } });
const pwSess = await req("GET", "/api/auth/session", { jar: pwJar });
const linkedBefore = sql(`select customer_id is not null from public.bookings where contact_email='${PROV}'`);
rec("6 before the link: nothing is linked to the account (customer_id null) and no session exists",
  linkedBefore === "f" && noSession.status === 401 && pwSess.json?.signedIn !== true,
  `booking customer_id set=${linkedBefore}; /api/account/bookings without session ${noSession.status}; password sign-in gives a session=${pwSess.json?.signedIn === true} (answer ${pwTry.status} ${JSON.stringify(pwTry.json)})`);

// Follow the callback link built exactly as provision-account.ts builds it: verify type = generateLink's verification_type, else magiclink.
const gl = await admin("POST", "/auth/v1/admin/generate_link", { type: "magiclink", email: PROV });
const hashed = gl.json?.hashed_token ?? gl.json?.properties?.hashed_token;
const vtype = gl.json?.verification_type ?? gl.json?.properties?.verification_type ?? "magiclink";
const cb = (t) => `/api/auth/callback?token_hash=${encodeURIComponent(hashed)}&type=${t}&next=${encodeURIComponent("/en/account")}`;
const jar5 = new Jar();
let f5 = await follow(`http://localhost:${PORT}${cb(vtype)}`, jar5);
let s5 = await req("GET", "/api/auth/session", { jar: jar5 });
let usedType = vtype;
let fallbackNeeded = false;
if (s5.json?.signedIn !== true) {
  // Plan 05's fallback: the same hash with type=email. A fresh link is needed, the first token is spent.
  fallbackNeeded = true;
  const gl2 = await admin("POST", "/auth/v1/admin/generate_link", { type: "magiclink", email: PROV });
  const h2 = gl2.json?.hashed_token ?? gl2.json?.properties?.hashed_token;
  const jarE = new Jar();
  await follow(`http://localhost:${PORT}/api/auth/callback?token_hash=${encodeURIComponent(h2)}&type=email&next=${encodeURIComponent("/en/account")}`, jarE);
  const sE = await req("GET", "/api/auth/session", { jar: jarE });
  usedType = sE.json?.signedIn === true ? "email (fallback works)" : "none works";
}
const list5 = await req("GET", "/api/account/bookings", { jar: jar5 });
const consentRows = Number(sql(`select count(*) from public.consent_log c join auth.users u on u.id = c.customer_id or c.customer_id in (select id from public.customers where user_id = u.id) where u.email='${PROV}'`));
const meta = sql(`select raw_user_meta_data::text from auth.users where email='${PROV}'`);
rec("5 provisioned account: link signs in, e-mail confirmed, the paid booking is listed (D-05 after confirmation); no consent_log row, no signup_consent",
  s5.json?.signedIn === true && confirmedAt(PROV) !== "" && list5.status === 200 && /Pia|VT-|reference/.test(list5.text) && consentRows === 0 && !meta.includes("signup_consent"),
  `verify type from generateLink=${vtype}${fallbackNeeded ? `; fallback needed: ${usedType}` : " (worked as built, no fallback)"}; hops=${f5.hops.join(">")} signedIn=${s5.json?.signedIn} confirmed=${confirmedAt(PROV) !== ""}; /api/account/bookings ${list5.status} lists the booking=${/VT-/.test(list5.text)}; consent_log rows=${consentRows}; signup_consent in metadata=${meta.includes("signup_consent")}`);

// ---- 7-9 PAY: guest (informed), create (consent), no session cookie, no consent_log ------------
const consentBefore = consentLogCount();

// guest, switch ON
const G_EMAIL = `e2e-co-guest-${RUN}@example.com`;
const qG = await mintQuote();
r = await payReq(intentBody(qG, { email: G_EMAIL, account: { choice: "guest", consent: false, turnstile_token: TOKEN, idempotency_key: `acct-${qG.quoteId}`, return_to: CO } }));
const gRows = JSON.parse(agreementRows(G_EMAIL));
rec("7a guest PAY (switch ON): Stripe page comes back, exactly one informed record for surface checkout, no session cookie",
  r.status === 200 && r.json?.ok === true && /^https:\/\/checkout\.stripe\.com\//.test(r.json?.url ?? "") && gRows.length === 1
    && gRows[0].surface === "checkout" && gRows[0].choice === "guest" && gRows[0].kind === "informed" && gRows[0].booking === true && gRows[0].locale === "en"
    && !sessionCookie(r.setCookies),
  `status ${r.status} ok=${r.json?.ok}; rows=${gRows.length} ${JSON.stringify(gRows[0] ?? {})}; session cookie on the answer=${sessionCookie(r.setCookies)}`);

// create with the tick
const C_EMAIL = `e2e-co-create-${RUN}@example.com`;
const qC = await mintQuote();
r = await payReq(intentBody(qC, { email: C_EMAIL, account: { choice: "create", consent: true, turnstile_token: TOKEN, idempotency_key: `acct-${qC.quoteId}`, return_to: CO } }));
const cRows = JSON.parse(agreementRows(C_EMAIL));
rec("7b create PAY with the tick: Stripe page comes back, exactly one consent record, no session cookie",
  r.status === 200 && r.json?.ok === true && cRows.length === 1 && cRows[0].surface === "checkout" && cRows[0].choice === "create" && cRows[0].kind === "consent"
    && cRows[0].booking === true && !sessionCookie(r.setCookies),
  `status ${r.status} ok=${r.json?.ok}; rows=${cRows.length} ${JSON.stringify(cRows[0] ?? {})}; session cookie on the answer=${sessionCookie(r.setCookies)}`);

// create without the tick: names what is missing, no booking, no record
const N_EMAIL = `e2e-co-notick-${RUN}@example.com`;
const qN = await mintQuote();
r = await payReq(intentBody(qN, { email: N_EMAIL, account: { choice: "create", consent: false, turnstile_token: TOKEN, idempotency_key: `acct-${qN.quoteId}`, return_to: CO } }));
const nBookings = Number(sql(`select count(*) from public.bookings where contact_email='${N_EMAIL}'`));
rec("7c create PAY without the tick: refused with account_consent_required, no booking, no record",
  r.status === 400 && r.json?.code === "account_consent_required" && nBookings === 0 && JSON.parse(agreementRows(N_EMAIL)).length === 0 && !sessionCookie(r.setCookies),
  `status ${r.status} code=${r.json?.code}; bookings=${nBookings}; records=${JSON.parse(agreementRows(N_EMAIL)).length}`);

// guest PAY with an e-mail that already has an account: sign in first, no Stripe, no booking
const K_EMAIL = KNOWN;
const qK = await mintQuote();
seen = before();
r = await payReq(intentBody(qK, { email: K_EMAIL, account: { choice: "guest", consent: false, turnstile_token: TOKEN, idempotency_key: `acct-${qK.quoteId}`, return_to: CO } }));
const kMail = await newMail(seen);
rec("7d guest PAY with an e-mail that has an account: sign_in_first, a sign-in link is mailed, no Stripe URL, no booking, no session cookie",
  r.status === 200 && r.json?.code === "sign_in_first" && !r.json?.url && Number(sql(`select count(*) from public.bookings where quote_id='${qK.quoteId}'`)) === 0 && !!kMail && !sessionCookie(r.setCookies),
  `status ${r.status} code=${r.json?.code} url=${!!r.json?.url}; mail=${!!kMail}; session cookie=${sessionCookie(r.setCookies)}`);

rec("8 neither PAY wrote a consent_log row", consentLogCount() === consentBefore, `consent_log rows before ${consentBefore}, after ${consentLogCount()}`);

// ---- 9 the switch OFF is today's guest checkout ------------------------------------------------
setGuestSwitch(false);
await nap(500);
const O_EMAIL = `e2e-co-off-${RUN}@example.com`;
const qO = await mintQuote();
r = await payReq(intentBody(qO, { email: O_EMAIL, account: { choice: "guest", consent: false, turnstile_token: TOKEN, idempotency_key: `acct-${qO.quoteId}`, return_to: CO } }));
const page = await req("GET", CO);
rec("9 switch OFF: guest PAY goes to Stripe with no record; /checkout shows no guest notice (D-09)",
  r.status === 200 && r.json?.ok === true && JSON.parse(agreementRows(O_EMAIL)).length === 0 && !page.text.includes('data-acct-note="guest"'),
  `status ${r.status} ok=${r.json?.ok}; records=${JSON.parse(agreementRows(O_EMAIL)).length}; guest note element on /checkout=${page.text.includes('data-acct-note="guest"')}`);
setGuestSwitch(true);
await nap(500);

// ---- 10 Text 2 on /checkout with the switch ON --------------------------------------------------
const TEXT2_EN = "We create an account for this email so you can see your booking later. No password needed. We send you a link to sign in.";
const pageOn = await req("GET", CO);
const m = /data-acct-note="guest">([^<]*)</.exec(pageOn.text);
rec("10 switch ON: Text 2 (guest notice) is rendered on /checkout, verbatim",
  pageOn.status === 200 && m?.[1] === TEXT2_EN,
  `status ${pageOn.status}; note element present=${!!m}; verbatim=${m?.[1] === TEXT2_EN}`);

// ---- 11 Pay limits (D-20) ----------------------------------------------------------------------
{
  const qL = await mintQuote();
  const codes = [];
  for (let i = 1; i <= 6; i++) {
    const x = await payReq(intentBody(qL, { email: `e2e-co-limit-${RUN}@example.com`, idem: `limit-${RUN}-${i}` }));
    codes.push(`${x.status}${x.json?.code ? ":" + x.json.code : ""}`);
    if (i < 6) await nap(150);
  }
  rec("11a 6th Pay press on one price is refused (5 per quote)", codes[5].startsWith("429") && codes[5].includes("pay_limit") && !codes.slice(0, 5).some((c) => c.includes("pay_limit")), `answers=${codes.join(" ")}`);

  const ip = newIp();
  const res = [];
  const bodies = [];
  for (let i = 1; i <= 9; i++) bodies.push(intentBody(await mintQuote(), { email: `e2e-co-rate-${RUN}-${i}@example.com` }));
  await freshWindow(15000); // the local limiter counts per wall-clock minute
  for (let i = 0; i < 9; i++) {
    const x = await payReq(bodies[i], { ip });
    res.push(`${x.status}${x.json?.code && x.status === 429 ? ":" + x.json.code : ""}`);
  }
  rec("11b 9th Pay press from one connection inside a minute is refused (8 per minute per IP)", res[8].includes("rate_limited") && !res.slice(0, 8).some((c) => c.includes("rate_limited")), `answers=${res.join(" ")}`);
}

finish(process.env.OUT);
