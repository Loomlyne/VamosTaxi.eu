// Offline answers for the Phase 32 signing pictures (automatic translator). Nothing reaches a server: every
// /api/* request of the page is fulfilled (or deliberately left hanging) here. Amounts are zero (law 04).
//
// Prototype API shapes (stubbed only; the planner owns the real ones):
//
//   GET  /api/staff/translations?filter=all|machine|yours|failed&place=all|site|email|extra&q=&lang=de|fr|ar&page=1
//        → { ok, data: { rows: Line[], counts: { all, machine, yours, failed }, total, more } }
//        Line = { id, key, place: 'site'|'email'|'extra', en,
//                 de|fr|ar: { text, origin: 'machine'|'human'|null, status: 'done'|'failed'|'pending'|'missing', stale? },
//                 locked: 'legal'|'approved'|'name'|null }
//        Failed lines first, then source order; 50 per page.
//   PATCH /api/staff/translations/:id   body { de?, fr?, ar? } (only the languages he changed)
//        → { ok, data: Line }   (saved languages come back origin 'human', status 'done')
//   GET  /api/staff/tickets → ticket rows as today; each message gains
//        { lang: '<detected>', translation: { text, status: 'ready'|'pending'|'failed'|'same' } }
//        (translated into the staff member's dashboard language, staff.lang)
//   POST /api/staff/tickets/:id/reply-translate   body { text, lang }
//        → { ok, data: { text, lang, status: 'ready'|'failed' } }
//   GET  /api/staff/rate-book → surcharges[] rows gain machineLangs (existing), pendingLangs, staleLangs
//
// Pending states (loading, translating, saving) are drawn by leaving the stubbed request unfulfilled.
const NEVER = () => new Promise(() => {});

export const DEPS = process.env.P32_DEPS || new URL("../../../../", import.meta.url).pathname;
export const ME = { fullName: "Test Admin", role: "admin", email: "admin@example.com", lang: "en", twoFactor: true, userId: "u-1" };

const M = (text) => ({ text, origin: "machine", status: "done" });
const H = (text, stale) => (stale ? { text, origin: "human", status: "done", stale: true } : { text, origin: "human", status: "done" });
const F = () => ({ text: "", origin: null, status: "failed" });
const P = (text) => ({ text, origin: text ? "machine" : null, status: "pending" });

/** Owner-approved cancellation wording (already in app/vamos-i18n-dict.js) for the locked-legal line. */
const LEGAL_EN = "Where our records show you were at the pickup point and no vehicle came, you receive a full refund.";

export function lines(dict) {
  const legal = (dict && dict[LEGAL_EN]) || {};
  return [
    { id: "ln-mixed", key: "email.wait", place: "email", en: "Your driver waits %n minutes after landing at ZRH.",
      de: M("Ihr Fahrer wartet nach der Landung in ZRH %n Minuten."), fr: H("Votre chauffeur attend %n minutes après l’atterrissage à ZRH."), ar: F(), locked: null },
    { id: "ln-machine", key: "site.meet", place: "site", en: "Your driver meets you at arrivals with your name on a sign.",
      de: M("Ihr Fahrer empfängt Sie in der Ankunftshalle mit Ihrem Namen auf einem Schild."), fr: M("Votre chauffeur vous accueille aux arrivées avec votre nom sur une pancarte."), ar: M("يستقبلك سائقك في صالة الوصول ومعه لافتة باسمك."), locked: null },
    { id: "ln-ref", key: "email.confirmed", place: "email", en: "Booking VT-4821 is confirmed.",
      de: M("Buchung VT-4821 ist bestätigt."), fr: M("La réservation VT-4821 est confirmée."), ar: M("تم تأكيد الحجز VT-4821."), locked: null },
    { id: "ln-pending", key: "site.waiting", place: "site", en: "Waiting time at the airport is included.",
      de: P("Die Wartezeit am Flughafen ist inbegriffen."), fr: M("Le temps d’attente à l’aéroport est inclus."), ar: M("وقت الانتظار في المطار مشمول."), locked: null },
    { id: "ln-stale", key: "extra.child-seat", place: "extra", en: "Child seat for children up to 4 years",
      de: M("Kindersitz für Kinder bis 4 Jahre"), fr: H("Siège enfant", true), ar: M("مقعد طفل للأطفال حتى 4 سنوات"), locked: null },
    { id: "ln-legal", key: "legal.noshow", place: "site", en: LEGAL_EN,
      de: H(legal.de || ""), fr: H(legal.fr || ""), ar: H(legal.ar || ""), locked: "legal" },
    { id: "ln-name", key: "vehicle.class.van", place: "site", en: "Economy Van",
      de: H("Economy Van"), fr: H("Economy Van"), ar: H("Economy Van"), locked: "name" },
  ];
}
function countsOf(rows) {
  const L = ["de", "fr", "ar"];
  const any = (r, f) => !r.locked && L.some((l) => f(r[l]));
  return {
    all: rows.length,
    machine: rows.filter((r) => any(r, (c) => c.origin === "machine")).length,
    yours: rows.filter((r) => any(r, (c) => c.origin === "human")).length,
    failed: rows.filter((r) => any(r, (c) => c.status === "failed")).length,
  };
}

/* ---------- support ---------- */
const DE_BODY = "Guten Tag, mein Flug LX 318 landet morgen um 07:40 in Zürich. Kann der Fahrer am Ausgang warten? Ich habe zwei Koffer.";
const DE_TR = { en: "Hello, my flight LX 318 lands in Zurich tomorrow at 07:40. Can the driver wait at the exit? I have two suitcases.",
  ar: "مرحبًا، رحلتي LX 318 تهبط في زيورخ غدًا الساعة 07:40. هل يمكن للسائق الانتظار عند المخرج؟ لدي حقيبتان." };
const AR_BODY = "مرحبًا، أحتاج مقعد طفل للرحلة يوم السبت. هل هذا ممكن؟";
const AR_TR = { en: "Hello, I need a child seat for the trip on Saturday. Is that possible?" };
const EN_BODY = "Hello, can I change my pickup time to 09:30?";
const EN_TR = { ar: "مرحبًا، هل يمكنني تغيير موعد الاستلام إلى 09:30؟", de: "Guten Tag, kann ich meine Abholzeit auf 09:30 ändern?" };
const reply = (email) => ({ mailto: `mailto:${email}?subject=Re%3A%20Vamos%20Taxi`, gmail: `https://mail.google.com/mail/?view=cm&to=${email}&su=Re%3A%20Vamos%20Taxi` });
function msg(lang, body, tr, status, dash) {
  if (lang === dash) return { whoKey: "customer", when: "12 Oct 2026 · 09:12", body, files: [], lang, translation: { text: "", status: "same" } };
  return { whoKey: "customer", when: "12 Oct 2026 · 09:12", body, files: [], lang, translation: { text: status === "ready" ? (tr[dash] || "") : "", status } };
}
/** kind: de-ready | ar-ready | en-same | de-failed | de-pending; closed → status closed. */
export function ticket(kind, dash, closed) {
  const [lang, st] = kind.split("-");
  const body = lang === "de" ? DE_BODY : lang === "ar" ? AR_BODY : EN_BODY;
  const tr = lang === "de" ? DE_TR : lang === "ar" ? AR_TR : EN_TR;
  const name = lang === "de" ? "Lena Keller" : lang === "ar" ? "Mariam Haddad" : "Tom Baker";
  const email = lang === "de" ? "lena@example.test" : lang === "ar" ? "mariam@example.test" : "tom@example.test";
  return {
    id: "tk-" + kind, ticketId: "T-1042", status: closed ? "closed" : "open", name, email, phone: "", bookingRef: "VT-4821",
    locale: lang, when: "12 Oct 2026 · 09:12", last: "12 Oct 2026 · 09:12", note: "", reply: reply(email),
    messages: [msg(lang, body, tr, st === "same" ? "same" : st, dash)],
  };
}
export const REPLY_TEXT = { en: "Yes, the driver waits at the exit with a sign. Two suitcases are fine.", ar: "نعم، ينتظرك السائق عند المخرج مع لافتة. الحقيبتان لا مشكلة." };
export const REPLY_TEXT_SEAT = "Yes, we can have a child seat ready for Saturday.";
const REPLY_OUT = { de: "Ja, der Fahrer wartet am Ausgang mit einem Schild. Zwei Koffer sind kein Problem.",
  ar: "نعم، يمكننا تجهيز مقعد طفل ليوم السبت.", en: "Yes, the driver waits at the exit with a sign. Two suitcases are fine.",
  fr: "Oui, le chauffeur vous attend à la sortie avec une pancarte. Deux valises, aucun problème." };

/* ---------- pricing ---------- */
const VERSIONS = { versions: [{ id: "v-draft", status: "draft", label: "Draft" }, { id: "v-live", status: "live", label: "Live" }] };
/** kind: machine | mixed | pending | stale */
export function extra(kind) {
  const base = { id: "sx-1", type: "checkout_extra", rule: "leg", name: "Child seat", label: "Child seat", code: "child-seat", kind: "amount", amounts: {}, pct: "" };
  if (kind === "machine") return { ...base, labelDe: "Kindersitz", labelFr: "Siège enfant", labelAr: "مقعد طفل", machineLangs: ["de", "fr", "ar"] };
  if (kind === "mixed") return { ...base, labelDe: "Kindersitz", labelFr: "Siège enfant", labelAr: "", machineLangs: ["de", "fr"] };
  if (kind === "pending") return { ...base, name: "Booster seat", label: "Booster seat", code: "booster-seat", labelDe: "", labelFr: "", labelAr: "", machineLangs: [], pendingLangs: ["de", "fr", "ar"] };
  if (kind === "stale") return { ...base, name: "Child seat (up to 4 years)", label: "Child seat (up to 4 years)", labelDe: "Kindersitz", labelFr: "Siège enfant (jusqu’à 4 ans)", labelAr: "مقعد طفل (حتى 4 سنوات)", machineLangs: ["fr", "ar"], staleLangs: ["de"] };
  return base;
}

/**
 * state = { dict, dash, lines?: 'default'|'nofailed', tr: 'ok'|'hang'|'error', patch: 'ok'|'hang'|'error',
 *           tickets: [], replyTr: 'ready'|'hang'|'failed', surcharges: [] }
 */
export async function installStubs(page, state, log = []) {
  let all = lines(state.dict); // per page: a PATCH that succeeds is kept, so a re-read shows the saved row
  await page.route("**/api/**", async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const path = url.pathname;
    const method = req.method();
    const json = (body, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
    const ok = (data) => json({ ok: true, data });
    if (url.hostname !== "127.0.0.1") return route.abort();
    log.push(`${method} ${path}${url.search}`);
    if (path === "/api/consent/state") return json({ ok: true, chosen: true, choice: { functional: false, analytics: false, marketing: false }, policyVersion: "2026-09-12" });
    if (path === "/api/staff/me") return ok({ ...ME, lang: state.dash || "en" });
    if (path === "/api/staff/translations" && method === "GET") {
      if (state.tr === "hang") return NEVER();
      if (state.tr === "error") return json({ ok: false, code: "http" }, 500);
      const f = url.searchParams.get("filter") || "all";
      const q = (url.searchParams.get("q") || "").toLowerCase();
      let rows = state.lines === "nofailed" ? all.map((r) => (r.id === "ln-mixed" ? { ...r, ar: M("ينتظرك سائقك %n دقيقة بعد الهبوط في ZRH.") } : r)) : all;
      const counts = countsOf(rows);
      const L = ["de", "fr", "ar"];
      if (f === "machine") rows = rows.filter((r) => !r.locked && L.some((l) => r[l].origin === "machine"));
      if (f === "yours") rows = rows.filter((r) => !r.locked && L.some((l) => r[l].origin === "human"));
      if (f === "failed") rows = rows.filter((r) => !r.locked && L.some((l) => r[l].status === "failed"));
      if (q) rows = rows.filter((r) => [r.en, ...L.map((l) => r[l].text)].join(" ").toLowerCase().includes(q));
      rows = rows.slice().sort((a, b) => (L.some((l) => b[l].status === "failed") ? 1 : 0) - (L.some((l) => a[l].status === "failed") ? 1 : 0));
      return ok({ rows, counts, total: rows.length, more: false });
    }
    const pm = path.match(/^\/api\/staff\/translations\/([^/]+)$/);
    if (pm && method === "PATCH") {
      if (state.patch === "hang") return NEVER();
      if (state.patch === "error") return json({ ok: false, code: "http" }, 500);
      const body = JSON.parse(req.postData() || "{}");
      const row = all.find((r) => r.id === decodeURIComponent(pm[1]));
      if (!row) return json({ ok: false, code: "not-found" }, 404);
      const next = { ...row };
      for (const l of Object.keys(body)) next[l] = H(body[l]);
      all = all.map((r) => (r.id === next.id ? next : r));
      return ok(next);
    }
    if (path === "/api/staff/tickets" && method === "GET") return ok(state.tickets || []);
    if (/^\/api\/staff\/tickets\/[^/]+\/reply-translate$/.test(path)) {
      if (state.replyTr === "hang") return NEVER();
      const body = JSON.parse(req.postData() || "{}");
      if (state.replyTr === "failed") return ok({ text: "", lang: body.lang, status: "failed" });
      return ok({ text: REPLY_OUT[body.lang] || "", lang: body.lang, status: "ready" });
    }
    if (path === "/api/staff/rate-versions") return ok(VERSIONS);
    if (path === "/api/staff/rate-versions/v-draft") return ok({ gaps: [] });
    if (path === "/api/staff/rate-book" && method === "GET") return ok({ surcharges: state.surcharges || [], vatRateBps: 81, routes: [], rates: [], bands: [], regionPremiums: [], rules: [], classes: [] });
    if (method !== "GET") return ok({});
    return ok([]);
  });
  await page.route((u) => u.hostname !== "127.0.0.1", (route) => route.abort());
}
