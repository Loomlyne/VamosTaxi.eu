// Offline answers for the Phase 32 signing pictures (automatic translator, revision 2026-10-13). Nothing reaches a
// server: every /api/* request of the page is fulfilled (or deliberately left hanging) here. Amounts are zero.
//
// Prototype API shapes (stubbed only; the planner owns the real ones):
//   GET  /api/staff/tickets → ticket rows as today; each message gains
//        { lang: '<detected>', translation: { text, status: 'ready'|'pending'|'failed'|'same' } }
//        (translated into the staff member's dashboard language, staff.lang)
//   POST /api/staff/tickets/:id/reply-translate   body { text, lang }
//        → { ok, data: { text, lang, status: 'ready'|'failed' } }
//   GET  /api/reviews → published rows as today; each row gains `language` ('de' | 'en' | 'ar' | … | null)
//   GET  /api/reviews/:id/translation?lang=ar → { ok, data: { text, lang } } (cached by the server)
//
// Pending states (translating) are drawn by leaving the stubbed request unfulfilled.
const NEVER = () => new Promise(() => {});

export const DEPS = process.env.P32_DEPS || new URL("../../../../", import.meta.url).pathname;
export const ME = { fullName: "Test Admin", role: "admin", email: "admin@example.com", lang: "en", twoFactor: true, userId: "u-1" };

/* ---------- support ---------- */
const BODY = {
  de: "Guten Tag, mein Flug LX 318 landet morgen um 07:40 in Zürich. Kann der Fahrer am Ausgang warten? Ich habe zwei Koffer.",
  ar: "مرحبًا، أحتاج مقعد طفل للرحلة يوم السبت. هل هذا ممكن؟",
  it: "Buongiorno, il mio volo atterra domani alle 07:40 a Zurigo. L’autista può aspettare all’uscita? Ho due valigie.",
  en: "Hello, can I change my pickup time to 09:30?",
};
const TR = {
  de: { en: "Hello, my flight LX 318 lands in Zurich tomorrow at 07:40. Can the driver wait at the exit? I have two suitcases.",
        ar: "مرحبًا، رحلتي LX 318 تهبط في زيورخ غدًا الساعة 07:40. هل يمكن للسائق الانتظار عند المخرج؟ لدي حقيبتان." },
  ar: { en: "Hello, I need a child seat for the trip on Saturday. Is that possible?" },
  it: { en: "Hello, my flight lands in Zurich tomorrow at 07:40. Can the driver wait at the exit? I have two suitcases.",
        ar: "مرحبًا، ستهبط رحلتي في زيورخ غدًا الساعة 07:40. هل يمكن للسائق الانتظار عند المخرج؟ لدي حقيبتان." },
  en: { ar: "مرحبًا، هل يمكنني تغيير موعد الاستلام إلى 09:30؟" },
};
const NAME = { de: "Lena Keller", ar: "Mariam Haddad", it: "Marco Bianchi", en: "Tom Baker" };
const MAIL = { de: "lena@example.test", ar: "mariam@example.test", it: "marco@example.test", en: "tom@example.test" };
const reply = (email) => ({ mailto: `mailto:${email}?subject=Re%3A%20Vamos%20Taxi`, gmail: `https://mail.google.com/mail/?view=cm&to=${email}&su=Re%3A%20Vamos%20Taxi` });
/** Message in the dashboard's own language (status same): the English or Arabic sentence itself. */
const OWN = { en: BODY.en, ar: "مرحبًا، هل يمكنني تغيير موعد الاستلام إلى 09:30؟" };
/**
 * lang: detected language of the customer message; st: ready | pending | failed | same.
 * A ticket whose message is already in the dashboard language is status same (no translation block).
 */
export function ticket(lang, st, dash, closed) {
  const own = lang === dash;
  const body = own ? OWN[dash] : BODY[lang];
  const status = own ? "same" : st;
  const text = status === "ready" ? (TR[lang] || {})[dash] || "" : "";
  return {
    id: `tk-${lang}-${st}`, ticketId: "T-1042", status: closed ? "closed" : "open", name: NAME[lang], email: MAIL[lang], phone: "", bookingRef: "VT-4821",
    locale: lang, when: "12 Oct 2026 · 09:12", last: "12 Oct 2026 · 09:12", note: "", reply: reply(MAIL[lang]),
    messages: [{ whoKey: "customer", when: "12 Oct 2026 · 09:12", body, files: [], lang, translation: { text, status } }],
  };
}
export const REPLY_TEXT = { en: "Yes, the driver waits at the exit with a sign. Two suitcases are fine.", ar: "نعم، ينتظرك السائق عند المخرج مع لافتة. الحقيبتان لا مشكلة." };
const REPLY_OUT = {
  de: "Ja, der Fahrer wartet am Ausgang mit einem Schild. Zwei Koffer sind kein Problem.",
  it: "Sì, l’autista aspetta all’uscita con un cartello. Due valigie non sono un problema.",
  en: "Yes, the driver waits at the exit with a sign. Two suitcases are fine.",
};
const LONG_SENTENCE = "Der Fahrer wartet am Ausgang mit einem Schild und hilft Ihnen mit dem Gepäck. ";
const LONG_EN = "The driver waits at the exit with a sign and helps you with your luggage. ";
export const LONG_TEXT = LONG_EN.repeat(12).trim(); // ~900 characters typed
const LONG_OUT = LONG_SENTENCE.repeat(12).trim();

/* ---------- home reviews ---------- */
const R = (id, source, name, body, rating, routeLabel, language, sourceUrl) =>
  ({ id, source, authorName: name, authorRole: "", body, rating, routeLabel, language, sourceUrl: sourceUrl || null, verified: true, published: true, sortOrder: 0 });
export const REVIEWS = {
  de: R("rv-de", "google", "Lena K.", "Pünktlicher Fahrer am Flughafen Zürich, saubere Limousine und ein Fixpreis vor der Zahlung. Gerne wieder.", 5, "ZRH to Zug", "de"),
  en: R("rv-en", "trustpilot", "Tom B.", "The driver was waiting at arrivals with my name on a sign. A smooth ride into the city.", 5, "ZRH to Zurich", "en"),
  ar: R("rv-ar", "tripadvisor", "Mariam H.", "كان السائق في انتظارنا في صالة الوصول، والسيارة نظيفة والسعر كما اتفقنا.", 5, "ZRH to Lucerne", "ar"),
  unk: R("rv-unk", "manual", "Sam R.", "Great service from start to finish.", 5, "", null),
  en2: R("rv-en2", "google", "Ravi P.", "On time, clear price, easy to book.", 4, "ZRH to Basel", "en"),
  ar2: R("rv-ar2", "google", "Nour S.", "رحلة مريحة وسائق محترم.", 5, "ZRH to Zug", "ar"),
};
/** Translations the stub server returns: review id -> site language. */
export const REVIEW_TR = {
  "rv-de": { en: "Punctual driver at Zurich Airport, a clean saloon and a fixed price before payment. Gladly again.",
             ar: "سائق ملتزم بالموعد في مطار زيورخ، وسيارة نظيفة وسعر ثابت قبل الدفع. أرحب بتكرار التجربة." },
  "rv-en": { ar: "كان السائق ينتظرني في صالة الوصول ومعه لافتة باسمي. رحلة سلسة إلى المدينة.", de: "Der Fahrer wartete am Ankunftsbereich mit einem Schild mit meinem Namen. Eine ruhige Fahrt in die Stadt." },
  "rv-en2": { ar: "في الموعد، سعر واضح، وحجز سهل.", de: "Pünktlich, klarer Preis, einfach zu buchen." },
  "rv-ar": { en: "The driver was waiting for us in the arrivals hall, the car was clean and the price was as agreed.", de: "Der Fahrer wartete in der Ankunftshalle auf uns, das Auto war sauber und der Preis wie vereinbart." },
  "rv-ar2": { en: "A comfortable ride and a respectful driver." },
};
export const REVIEW_SETS = {
  five: ["de", "en", "ar", "unk", "en2"],
  drift: ["de", "en", "ar", "unk", "en2", "ar2", "de", "en", "ar"].map((k, i) => (i < 6 ? REVIEWS[k] : { ...REVIEWS[k], id: REVIEWS[k].id + "-" + i })),
  // single-purpose sets so a crop holds exactly the cards it is about
  sameEn: ["en", "unk", "en2"],
  sameAr: ["ar", "unk", "ar2"],
};

/**
 * state = { dash, tickets: [], replyTr: 'ready'|'hang'|'failed'|'delay', reviews: 'five'|'drift'|..., revTr: 'ok'|'hang'|'error' }
 */
export async function installStubs(page, state, log = []) {
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
    if (path === "/api/staff/tickets" && method === "GET") return ok(state.tickets || []);
    if (/^\/api\/staff\/tickets\/[^/]+\/reply-translate$/.test(path)) {
      if (state.replyTr === "hang") return NEVER();
      const body = JSON.parse(req.postData() || "{}");
      log.push("reply-translate " + JSON.stringify({ lang: body.lang, n: (body.text || "").length }));
      if (state.replyTr === "failed") return ok({ text: "", lang: body.lang, status: "failed" });
      if (state.replyTr === "delay") await new Promise((r) => setTimeout(r, state.delayMs || 500));
      const out = (body.text || "").length > 600 ? LONG_OUT : REPLY_OUT[body.lang] || "";
      return ok({ text: out, lang: body.lang, status: "ready" });
    }
    if (path === "/api/reviews" && method === "GET") {
      const keys = state.reviews || "five";
      const rows = (REVIEW_SETS[keys] || REVIEW_SETS.five).map((k) => (typeof k === "string" ? REVIEWS[k] : k));
      return ok(rows);
    }
    const tm = path.match(/^\/api\/reviews\/([^/]+)\/translation$/);
    if (tm) {
      if (state.revTr === "hang") return NEVER();
      if (state.revTr === "error") return json({ ok: false, code: "http" }, 500);
      const id = decodeURIComponent(tm[1]).replace(/-\d+$/, "");
      const lang = url.searchParams.get("lang");
      const text = (REVIEW_TR[id] || {})[lang];
      return text ? ok({ text, lang }) : json({ ok: false, code: "not-found" }, 404);
    }
    if (method !== "GET") return ok({});
    return ok([]);
  });
  await page.route((u) => u.hostname !== "127.0.0.1", (route) => route.abort());
}
