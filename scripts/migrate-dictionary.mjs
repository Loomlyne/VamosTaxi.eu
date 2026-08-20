#!/usr/bin/env node
// scripts/migrate-dictionary.mjs
//
// D-13's one-time, re-runnable transform: `app/vamos-i18n-dict.js` (1,428 English-keyed
// string entries + 44 concatenation `patterns`) -> `apps/web/i18n/messages/{en,de,fr,ar}.json`
// (dotted keys, ICU messages) + `apps/web/i18n/key-map.json` (English source -> dotted key).
//
// Read-only against `app/`: the mocks stay the visual source of truth (D-03). Writing is
// confined to `apps/web/i18n/messages/*.json` and `apps/web/i18n/key-map.json`.
//
// Usage:
//   node scripts/migrate-dictionary.mjs            # regenerate the four locale files + key-map
//   node scripts/migrate-dictionary.mjs --check     # dry run: fail if regenerating would change
//                                                    # what's committed (drift detector)
//
// ── Key scheme ───────────────────────────────────────────────────────────────────────────
// Each key is `<namespace>.<leaf>`. The namespace comes from where the string is actually
// used: every `.dc.html` file under `app/` is grepped for the literal English source string
// (a plain substring search, which also catches strings used as JS state values rather than
// JSX text — e.g. `status: 'Assigned'`), and the owning surface's namespace is read off
// `FILE_NAMESPACE_MAP`. A string matched in 3+ distinct namespaces falls back to `common`,
// per the plan; a string matched in exactly 2 keeps the first (logged, not silently dropped).
// The leaf is a slug of the English source, disambiguated with a numeric suffix only on a
// same-namespace collision. Every collision and every 3+/2-surface resolution is printed.
//
// ── Special classes handled explicitly (D-18, ADR-011, ADR-012) ────────────────────────────
// 1. Duplicate keys ADR-012 records (`Passengers`, `Destination`, `imprint`, `We answer
//    within`, `On shift`, `Van`, plus the 5 dead/live conflicts) are already collapsed by
//    JavaScript's own object-literal semantics the moment the dictionary is loaded — the
//    later entry always wins, so there is exactly one occurrence of each duplicated key in
//    the object this script reads. No extra code is needed to "collapse" them; this comment
//    documents why.
// 2. The four product names (`Vamos Taxi`, `Economy`, `Business`, `Van`) are routed to fixed
//    `common.vehicleClass*` / `common.brandName` keys, marked `$meta.nonTranslatableKeys`,
//    and rendered with the identical Latin value in all four locale files — replacing the
//    two disagreeing Arabic transliterations ADR-012 found for `Economy`/`Business` and the
//    untranslated-but-undifferentiated `Van`.
// 3. `data-tok` pending-value pill copy (ADR-011) is detected by cross-referencing every
//    dictionary key against text found inside a `data-tok="1"` span across the mock tree.
//    A key matched *only* inside such spans is marked `$meta.pendingValueKeys`; its value is
//    forced to the English string in all four locale files (ADR-011: "stays English in every
//    language, with no exception") rather than the source dictionary's real translation. A
//    key also found outside a `data-tok` span (dual use) keeps its real, distinct-per-locale
//    translation instead — ADR-011's one confirmed dual-use case, `Registered firm name`.

import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(scriptDir, "..");
const DICT_PATH = join(repoRoot, "app/vamos-i18n-dict.js");
const APP_DIR = join(repoRoot, "app");
const MESSAGES_DIR = join(repoRoot, "apps/web/i18n/messages");
const KEY_MAP_PATH = join(repoRoot, "apps/web/i18n/key-map.json");
const ADR_012_PATH = join(repoRoot, ".planning/ADR-012-dictionary-duplicates-and-product-names.md");

const CHECK = process.argv.includes("--check");

// ── 1. Load the mock dictionary (read-only) ────────────────────────────────────────────────
function loadDict() {
  const src = readFileSync(DICT_PATH, "utf8");
  const sandbox = { window: {} };
  vm.createContext(sandbox);
  vm.runInContext(src, sandbox, { filename: DICT_PATH });
  const dict = sandbox.window.VamosI18n;
  if (!dict || !dict.strings || !dict.patterns) {
    throw new Error(`Could not load window.VamosI18n from ${DICT_PATH}`);
  }
  return dict;
}

// ── 2. Namespace resolution ─────────────────────────────────────────────────────────────────
// Relative path (from app/) -> owning namespace. Built by inspecting the mock tree's own
// structure (`find app -name '*.dc.html'`), not guessed.
const FILE_NAMESPACE_MAP = {
  "home/home.dc.html": "home",
  "home/BrandSelect.dc.html": "booking",
  "home/CookieBanner.dc.html": "cookies",
  "home/FAQ.dc.html": "faq",
  "home/HowItWorks.dc.html": "home",
  "home/Reviews.dc.html": "reviews",
  "home/ServiceCard.dc.html": "services",
  "home/Services.dc.html": "services",
  "home/SiteFooter.dc.html": "footer",
  "home/SiteHeader.dc.html": "header",
  "home/StepCounter.dc.html": "booking",
  "home/WhenPicker.dc.html": "booking",
  "home/WhyVamos.dc.html": "home",

  "ops/AuthForm.dc.html": "ops",
  "ops/BrandSelect.dc.html": "ops",
  "ops/OpsBoard.dc.html": "ops",
  "ops/OpsCalendar.dc.html": "ops",
  "ops/OpsContent.dc.html": "ops",
  "ops/OpsCoupons.dc.html": "ops",
  "ops/OpsCustomers.dc.html": "ops",
  "ops/OpsDash.dc.html": "ops",
  "ops/OpsDetail.dc.html": "ops",
  "ops/OpsFleet.dc.html": "ops",
  "ops/OpsPricing.dc.html": "ops",
  "ops/OpsProfile.dc.html": "ops",
  "ops/OpsReviews.dc.html": "ops",
  "ops/OpsSettings.dc.html": "ops",
  "ops/OpsSidebar.dc.html": "ops",
  "ops/OpsSoon.dc.html": "ops",
  "ops/OpsTable.dc.html": "ops",
  "ops/ops-login.dc.html": "ops",
  "ops/ops.dc.html": "ops",

  "pages/AuthForm.dc.html": "auth",
  "pages/AuthStates.dc.html": "auth",
  "pages/BookingRow.dc.html": "account",
  "pages/BrandSelect.dc.html": "booking",
  "pages/CookieBanner.dc.html": "cookies",
  "pages/PhoneVerify.dc.html": "auth",
  "pages/ResetForm.dc.html": "auth",
  "pages/SiteFooter.dc.html": "footer",
  "pages/SiteHeader.dc.html": "header",
  "pages/WhenPicker.dc.html": "booking",
  "pages/about.dc.html": "about",
  "pages/account.dc.html": "account",
  "pages/become-a-partner.dc.html": "partner",
  "pages/booking-detail.dc.html": "account",
  "pages/bookings.dc.html": "account",
  "pages/cancellation.dc.html": "legal",
  "pages/checkout.dc.html": "checkout",
  "pages/coming-soon.dc.html": "common",
  "pages/confirmation.dc.html": "checkout",
  "pages/contact.dc.html": "contact",
  "pages/cookies.dc.html": "legal",
  "pages/faq.dc.html": "faq",
  "pages/imprint.dc.html": "legal",
  "pages/manage-booking.dc.html": "account",
  "pages/privacy.dc.html": "legal",
  "pages/reset-password.dc.html": "auth",
  "pages/sign-in.dc.html": "auth",
  "pages/terms.dc.html": "legal",
};

function walkMockFiles() {
  const out = [];
  (function walk(dir) {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      const st = statSync(full);
      if (st.isDirectory()) walk(full);
      else if (entry.endsWith(".dc.html")) {
        const rel = relative(APP_DIR, full);
        out.push({ rel, content: readFileSync(full, "utf8") });
      }
    }
  })(APP_DIR);
  return out;
}

const nsLog = { leafCollisions: [], twoSurface: [], commonFallback: [], unresolved: [] };

function resolveNamespace(mockFiles, sourceKey) {
  const matchedNamespaces = new Set();
  for (const f of mockFiles) {
    if (f.content.includes(sourceKey)) {
      matchedNamespaces.add(FILE_NAMESPACE_MAP[f.rel] || "common");
    }
  }
  const distinct = [...matchedNamespaces];
  if (distinct.length === 0) {
    nsLog.unresolved.push(sourceKey);
    return "common";
  }
  if (distinct.length === 1) return distinct[0];
  if (distinct.length === 2) {
    nsLog.twoSurface.push({ key: sourceKey, namespaces: distinct });
    return distinct[0];
  }
  nsLog.commonFallback.push({ key: sourceKey, namespaces: distinct });
  return "common";
}

function slugify(s) {
  const slug = s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/['’"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48)
    .replace(/-+$/g, "");
  return slug;
}

// ── 3. `data-tok` pending-value pill detection (ADR-011) ───────────────────────────────────
function scanPillCandidates(mockFiles) {
  const texts = new Set();
  const re = /data-tok="1"[^>]*>([^<]+)</g;
  for (const f of mockFiles) {
    let m;
    re.lastIndex = 0;
    while ((m = re.exec(f.content))) texts.add(m[1].trim());
  }
  return texts;
}

function escapeForRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isDualUse(mockFiles, sourceKey) {
  const esc = escapeForRegex(sourceKey);
  const plainRe = new RegExp(">" + esc + "<", "g");
  const pillRe = new RegExp('data-tok="1"[^>]*>' + esc + "<", "g");
  let total = 0;
  let pill = 0;
  for (const f of mockFiles) {
    total += (f.content.match(plainRe) || []).length;
    pill += (f.content.match(pillRe) || []).length;
  }
  return total > pill;
}

// ── 4. Non-parameterised-number reason classifier (I18N-06 opt-out, $meta.noParamKeys) ─────
// Every English value the source dictionary carries with a bare digit and no ICU placeholder
// is a genuinely fixed figure baked into specific copy (an address, a phone number, a policy
// duration written as prose) rather than a computed count — never a silently-accepted gap.
function classifyNoParamReason(s) {
  if (/\+41 \d/.test(s)) return "phone number, not a live count";
  if (/CH-020\.4\.077\.792-7/.test(s)) return "company registration number, not a live count";
  if (/Bleicherstrasse 16|8953 Dietikon/.test(s)) return "postal address, not a live count";
  if (/VT-4821/.test(s)) return "example booking reference, not a live count";
  if (/%/.test(s)) return "fixed refund-policy percentage, not a live count";
  if (/\d{2}:\d{2}/.test(s)) return "fixed example clock time, not a live count";
  if (/\d+(\.\d+)?\s?km/.test(s)) return "fixed example distance, not a live count";
  if (/\bMB\b/.test(s)) return "fixed file-size limit, not a live count";
  if (/category B121/.test(s)) return "fixed licence category code, not a live count";
  if (/Autoplay advances|cross-slide/.test(s)) return "fixed animation timing spec, not a live count";
  if (/section \d+|terms \d+/.test(s)) return "fixed legal section reference, not a live count";
  if (/^A\d+\s?—|Decision A\d+|decision A\d+/.test(s)) return "internal decision-tracking code, not a live count";
  if (/Friday \d+ August/.test(s)) return "fixed placeholder date in a demo/dashboard string, not a live count";
  if (/(Mercedes V-Class|Van or minibus|Minibus),/.test(s)) return "fixed vehicle-class specification copy, not a live count";
  if (/characters/.test(s)) return "fixed minimum-length policy figure, not a live count";
  if (/minutes|hours|hour|days|h before pickup/.test(s)) return "fixed policy duration written into this specific copy, not a live count";
  if (/routes configured|not live/.test(s)) return "fixed dashboard example figure, not a live count";
  return "fixed figure embedded in static copy, not a live count";
}

// ── 5. Product names (D-18) ─────────────────────────────────────────────────────────────────
// Routed before the generic loop so ADR-012's disagreeing Arabic transliterations for
// Economy/Business/Van never enter the per-locale files, and so `Vamos Taxi` — which is not
// itself a dictionary key, because the mocks never translate it — gets one deliberately.
const PRODUCT_NAMES = [
  { source: "Vamos Taxi", key: "common.brandName", synthetic: true },
  { source: "Economy", key: "common.vehicleClassEconomy" },
  { source: "Business", key: "common.vehicleClassBusiness" },
  { source: "Van", key: "common.vehicleClassVan" },
];

// ── 6. The 44 concatenation patterns -> parameterised ICU messages (I18N-06) ────────────────
// Hand-authored, not mechanically derived: this is the "genuinely non-mechanical decision"
// the plan names. Every one of the 44 `patterns` entries in app/vamos-i18n-dict.js is
// accounted for below (documented inline via `sources`); duplicate regexes (`(\d+) bags$`
// appears 3 times, the two "…of the same event, singular vs plural" pairs) collapse into one
// ICU plural message rather than one key per literal regex. Placeholder name `n` for the
// countable variable matches the worked example in 01-PATTERNS.md (`t('quote.passengers',
// {n: 3})`); everywhere else uses a descriptive name.
const PATTERN_MESSAGES = [
  {
    key: "common.savedOn",
    sources: ["/^Saved on (.+)$/"],
    en: "Saved on {date}",
    de: "Gespeichert am {date}",
    fr: "Enregistré le {date}",
    ar: "تم الحفظ في {date}",
  },
  {
    key: "checkout.driverWaitingAt",
    sources: ["/^Your driver is waiting at (.+)$/"],
    en: "Your driver is waiting at {location}",
    de: "Ihr Fahrer wartet in {location}",
    fr: "Votre chauffeur vous attend à {location}",
    ar: "سائقك في انتظارك في {location}",
  },
  {
    key: "reviews.reviewPosition",
    sources: ["/^Review (\\d+) of (\\d+)$/"],
    en: "Review {n} of {total}",
    de: "Bewertung {n} von {total}",
    fr: "Avis {n} sur {total}",
    ar: "تقييم {n} من {total}",
  },
  {
    key: "common.sentTo",
    sources: ["/^Sent to (.+)$/"],
    en: "Sent to {target}",
    de: "Gesendet an {target}",
    fr: "Envoyé à {target}",
    ar: "أُرسل إلى {target}",
  },
  {
    key: "footer.copyright",
    sources: ["/^© (\\d{4}) Vamos Taxi\\. All rights reserved\\.$/"],
    en: "© {year} Vamos Taxi. All rights reserved.",
    de: "© {year} Vamos Taxi. Alle Rechte vorbehalten.",
    fr: "© {year} Vamos Taxi. Tous droits réservés.",
    ar: "© {year} فاموس تاكسي. جميع الحقوق محفوظة.",
  },
  {
    key: "faq.questionsCount",
    sources: ["/^(\\d+) questions?$/"],
    en: "{n, plural, one {# question} other {# questions}}",
    de: "{n, plural, one {# Frage} other {# Fragen}}",
    fr: "{n, plural, one {# question} other {# questions}}",
    ar: "{n, plural, zero {لا أسئلة} one {سؤال واحد} two {سؤالان} few {# أسئلة} many {# سؤالًا} other {# سؤال}}",
  },
  {
    key: "checkout.transferClass",
    sources: ["/^Transfer, (.+) class$/"],
    en: "Transfer, {class} class",
    de: "Transfer, Klasse {class}",
    fr: "Transfert, classe {class}",
    ar: "رحلة، فئة {class}",
  },
  {
    key: "checkout.paidBy",
    sources: ["/^Paid by (.+)$/"],
    en: "Paid by {method}",
    de: "Bezahlt mit {method}",
    fr: "Payé par {method}",
    ar: "مدفوع بـ{method}",
  },
  {
    key: "checkout.couponCode",
    sources: ["/^Coupon (.+)$/"],
    en: "Coupon {code}",
    de: "Gutschein {code}",
    fr: "Code {code}",
    ar: "قسيمة {code}",
  },
  {
    key: "checkout.childSeatCount",
    sources: ["/^Child seat × (\\d+)$/"],
    en: "Child seat × {n}",
    de: "Kindersitz × {n}",
    fr: "Siège enfant × {n}",
    ar: "مقعد أطفال × {n}",
  },
  {
    key: "checkout.additionalStopCount",
    sources: ["/^Additional stop × (\\d+)$/"],
    en: "Additional stop × {n}",
    de: "Weiterer Stopp × {n}",
    fr: "Arrêt supplémentaire × {n}",
    ar: "محطة إضافية × {n}",
  },
  {
    key: "ops.ofCount",
    sources: ["/^of (\\d+)$/"],
    en: "of {total}",
    de: "von {total}",
    fr: "sur {total}",
    ar: "من {total}",
  },
  {
    key: "ops.paxCount",
    sources: ["/^(\\d+) pax$/"],
    en: "{n, plural, other {# pax}}",
    de: "{n, plural, other {# Pers.}}",
    fr: "{n, plural, other {# pers.}}",
    ar: "{n, plural, zero {لا ركاب} one {راكب واحد} two {راكبان} few {# ركاب} many {# راكبًا} other {# راكب}}",
  },
  {
    key: "common.bagsCount",
    sources: ["/^(\\d+) bags$/ (ops)", "/^(\\d+) bags$/ (manage-booking, 1st)", "/^(\\d+) bags$/ (manage-booking, 2nd — literal duplicate in source)"],
    en: "{n, plural, one {# bag} other {# bags}}",
    de: "{n, plural, one {# Gepäckstück} other {# Gepäckstücke}}",
    fr: "{n, plural, one {# bagage} other {# bagages}}",
    ar: "{n, plural, zero {لا حقائب} one {حقيبة واحدة} two {حقيبتان} few {# حقائب} many {# حقيبة} other {# حقيبة}}",
  },
  {
    key: "ops.chauffeurNumber",
    sources: ["/^Chauffeur (\\d+)$/"],
    en: "Chauffeur {n}",
    de: "Chauffeur {n}",
    fr: "Chauffeur {n}",
    ar: "السائق {n}",
  },
  {
    key: "account.upcomingCount",
    sources: ["/^Upcoming \\((\\d+)\\)$/"],
    en: "Upcoming ({n})",
    de: "Bevorstehend ({n})",
    fr: "À venir ({n})",
    ar: "القادمة ({n})",
  },
  {
    key: "account.pastCount",
    sources: ["/^Past \\((\\d+)\\)$/"],
    en: "Past ({n})",
    de: "Vergangen ({n})",
    fr: "Passés ({n})",
    ar: "السابقة ({n})",
  },
  {
    key: "account.inHoursCount",
    sources: ["/^In (\\d+) hours$/"],
    en: "{n, plural, one {In # hour} other {In # hours}}",
    de: "{n, plural, one {In # Stunde} other {In # Stunden}}",
    fr: "{n, plural, one {Dans # heure} other {Dans # heures}}",
    ar: "{n, plural, zero {jetzt} one {خلال ساعة واحدة} two {خلال ساعتين} few {خلال # ساعات} many {خلال # ساعة} other {خلال # ساعة}}",
  },
  {
    key: "account.inDaysCount",
    sources: ["/^In (\\d+) days$/"],
    en: "{n, plural, one {In # day} other {In # days}}",
    de: "{n, plural, one {In # Tag} other {In # Tagen}}",
    fr: "{n, plural, one {Dans # jour} other {Dans # jours}}",
    ar: "{n, plural, zero {اليوم} one {خلال يوم واحد} two {خلال يومين} few {خلال # أيام} many {خلال # يومًا} other {خلال # يوم}}",
  },
  {
    key: "account.pickupInHoursCount",
    sources: ["/^Pickup in (\\d+) hours$/"],
    en: "{n, plural, one {Pickup in # hour} other {Pickup in # hours}}",
    de: "{n, plural, one {Abholung in # Stunde} other {Abholung in # Stunden}}",
    fr: "{n, plural, one {Prise en charge dans # heure} other {Prise en charge dans # heures}}",
    ar: "{n, plural, zero {الانطلاق الآن} one {الانطلاق خلال ساعة واحدة} two {الانطلاق خلال ساعتين} few {الانطلاق خلال # ساعات} many {الانطلاق خلال # ساعة} other {الانطلاق خلال # ساعة}}",
  },
  {
    key: "account.pickupInDaysCount",
    sources: ["/^Pickup in (\\d+) days$/"],
    en: "{n, plural, one {Pickup in # day} other {Pickup in # days}}",
    de: "{n, plural, one {Abholung in # Tag} other {Abholung in # Tagen}}",
    fr: "{n, plural, one {Prise en charge dans # jour} other {Prise en charge dans # jours}}",
    ar: "{n, plural, zero {الانطلاق اليوم} one {الانطلاق خلال يوم واحد} two {الانطلاق خلال يومين} few {الانطلاق خلال # أيام} many {الانطلاق خلال # يومًا} other {الانطلاق خلال # يوم}}",
  },
  {
    key: "account.pickupTime",
    sources: ["/^Pickup (\\d{2}:\\d{2})$/"],
    en: "Pickup <ltr>{time}</ltr>",
    de: "Abholung <ltr>{time}</ltr>",
    fr: "Prise en charge <ltr>{time}</ltr>",
    ar: "الانطلاق <ltr>{time}</ltr>",
  },
  {
    key: "account.showMoreCount",
    sources: ["/^Show (\\d+) more$/"],
    en: "{n, plural, one {Show # more} other {Show # more}}",
    de: "{n, plural, one {Weitere # anzeigen} other {Weitere # anzeigen}}",
    fr: "{n, plural, one {Afficher # de plus} other {Afficher # de plus}}",
    ar: "{n, plural, zero {لا مزيد لعرضه} one {إظهار واحد إضافي} two {إظهار اثنين إضافيين} few {إظهار # إضافية} many {إظهار # إضافيًا} other {إظهار # إضافية}}",
  },
  {
    key: "account.showingOfTotal",
    sources: ["/^Showing (\\d+) of (\\d+) bookings\\.$/"],
    en: "Showing {shown} of {total} bookings.",
    de: "{shown} von {total} Buchungen angezeigt.",
    fr: "{shown} réservations sur {total} affichées.",
    ar: "يتم عرض {shown} من {total} حجزًا.",
  },
  {
    key: "checkout.upToPassengersCount",
    sources: ["/^Up to (\\d+) passengers$/"],
    en: "{n, plural, one {Up to # passenger} other {Up to # passengers}}",
    de: "{n, plural, one {Bis zu # Passagier} other {Bis zu # Passagiere}}",
    fr: "{n, plural, one {Jusqu'à # passager} other {Jusqu'à # passagers}}",
    ar: "{n, plural, zero {بلا ركاب} one {حتى راكب واحد} two {حتى راكبين} few {حتى # ركاب} many {حتى # راكبًا} other {حتى # راكب}}",
  },
  {
    key: "checkout.upToBagsCount",
    sources: ["/^Up to (\\d+) bags$/"],
    en: "{n, plural, one {Up to # bag} other {Up to # bags}}",
    de: "{n, plural, one {Bis zu # Gepäckstück} other {Bis zu # Gepäckstücke}}",
    fr: "{n, plural, one {Jusqu'à # bagage} other {Jusqu'à # bagages}}",
    ar: "{n, plural, zero {بلا حقائب} one {حتى حقيبة واحدة} two {حتى حقيبتين} few {حتى # حقائب} many {حتى # حقيبة} other {حتى # حقيبة}}",
  },
  {
    key: "checkout.passengersCount",
    sources: ["/^(\\d+) passengers$/"],
    en: "{n, plural, one {# passenger} other {# passengers}}",
    de: "{n, plural, one {# Passagier} other {# Passagiere}}",
    fr: "{n, plural, one {# passager} other {# passagers}}",
    ar: "{n, plural, zero {لا ركاب} one {راكب واحد} two {راكبان} few {# ركاب} many {# راكبًا} other {# راكب}}",
  },
  {
    key: "account.allBookingsCount",
    sources: ["/^That is all (\\d+) bookings\\.$/", "/^That is all (\\d+) booking\\.$/"],
    en: "{n, plural, one {That is your only booking.} other {That is all # bookings.}}",
    de: "{n, plural, one {Das ist die einzige Buchung.} other {Das sind alle # Buchungen.}}",
    fr: "{n, plural, one {C'est la seule réservation.} other {Ce sont vos # réservations.}}",
    ar: "{n, plural, zero {لا حجوزات لعرضها.} one {هذا هو الحجز الوحيد.} two {هذان هما الحجزان الوحيدان.} few {هذه هي الحجوزات الـ# كلها.} many {هذه هي الحجوزات الـ# كلها.} other {هذه هي الحجوزات الـ# كلها.}}",
  },
  {
    key: "account.signedInAs",
    sources: ["/^Signed in as (.+)$/"],
    en: "Signed in as {email}",
    de: "Angemeldet als {email}",
    fr: "Connecté en tant que {email}",
    ar: "مسجّل الدخول كـ{email}",
  },
  {
    key: "account.foundBookingsCount",
    sources: [
      "/^We found (\\d+) bookings under this email and added them to your account\\.$/",
      "/^We found (\\d+) booking under this email and added them to your account\\.$/",
    ],
    en: "{n, plural, one {We found # booking under this email and added it to your account.} other {We found # bookings under this email and added them to your account.}}",
    de: "{n, plural, one {Wir haben # Buchung unter dieser E-Mail gefunden und Ihrem Konto hinzugefügt.} other {Wir haben # Buchungen unter dieser E-Mail gefunden und Ihrem Konto hinzugefügt.}}",
    fr: "{n, plural, one {Nous avons trouvé # réservation avec cet e-mail et l'avons ajoutée à votre compte.} other {Nous avons trouvé # réservations avec cet e-mail et les avons ajoutées à votre compte.}}",
    ar: "{n, plural, zero {لم نجد أي حجوزات بهذا البريد.} one {وجدنا حجزًا واحدًا بهذا البريد وأضفناه إلى حسابك.} two {وجدنا حجزين بهذا البريد وأضفناهما إلى حسابك.} few {وجدنا # حجوزات بهذا البريد وأضفناها إلى حسابك.} many {وجدنا # حجزًا بهذا البريد وأضفناها إلى حسابك.} other {وجدنا # حجوزات بهذا البريد وأضفناها إلى حسابك.}}",
  },
  {
    key: "account.bookingSummaryLine",
    sources: ["/^(.+) · (\\d+) passengers · (VT-\\d+)$/", "/^(.+) · (\\d+) passenger · (VT-\\d+)$/"],
    en: "{route} · {n, plural, one {# passenger} other {# passengers}} · <ltr>{ref}</ltr>",
    de: "{route} · {n, plural, one {# Passagier} other {# Passagiere}} · <ltr>{ref}</ltr>",
    fr: "{route} · {n, plural, one {# passager} other {# passagers}} · <ltr>{ref}</ltr>",
    ar: "{route} · {n, plural, zero {لا ركاب} one {مسافر واحد} two {مسافران} few {# مسافرين} many {# مسافرًا} other {# مسافرين}} · <ltr>{ref}</ltr>",
  },
  {
    key: "account.chauffeurHoursFrom",
    sources: ["/^Chauffeur, (\\d+) hours from (.+)$/"],
    en: "Chauffeur, {hours} hours from {location}",
    de: "Chauffeur, {hours} Stunden ab {location}",
    fr: "Chauffeur, {hours} heures au départ de {location}",
    ar: "سائق خاص، {hours} ساعات من {location}",
  },
  {
    key: "account.asBookedOn",
    sources: ["/^As booked on (.+)$/"],
    en: "As booked on {date}",
    de: "Wie am {date} gebucht",
    fr: "Tel que réservé le {date}",
    ar: "كما تم الحجز في {date}",
  },
  {
    key: "account.travelledOn",
    sources: ["/^Travelled (.+)$/"],
    en: "Travelled {date}",
    de: "Gefahren am {date}",
    fr: "Effectué le {date}",
    ar: "تمت الرحلة في {date}",
  },
  {
    key: "account.cancelledOn",
    sources: ["/^Cancelled (\\d.+)$/"],
    en: "Cancelled {date}",
    de: "Storniert am {date}",
    fr: "Annulé le {date}",
    ar: "أُلغي في {date}",
  },
  {
    key: "common.ofGeneric",
    sources: ["/^of (.+)$/"],
    en: "of {value}",
    de: "von {value}",
    fr: "de {value}",
    ar: "من {value}",
  },
  {
    key: "common.vehicleClassOf",
    sources: ["/^(.+) class$/"],
    en: "{class} class",
    de: "Klasse {class}",
    fr: "Classe {class}",
    ar: "فئة {class}",
  },
  {
    key: "contact.fieldsNeedAttentionCount",
    sources: ["/^(\\d+) fields need your attention$/"],
    en: "{n, plural, one {# field needs your attention} other {# fields need your attention}}",
    de: "{n, plural, one {# Feld braucht Ihre Aufmerksamkeit} other {# Felder brauchen Ihre Aufmerksamkeit}}",
    fr: "{n, plural, one {# champ demande votre attention} other {# champs demandent votre attention}}",
    ar: "{n, plural, zero {لا حقول تحتاج انتباهك} one {حقل واحد يحتاج انتباهك} two {حقلان يحتاجان انتباهك} few {# حقول تحتاج انتباهك} many {# حقلًا تحتاج انتباهك} other {# حقل يحتاج انتباهك}}",
  },
  {
    key: "contact.replyWithin",
    sources: ["/^Reply within (.+)$/"],
    en: "Reply within {duration}",
    de: "Antwort innerhalb von {duration}",
    fr: "Réponse sous {duration}",
    ar: "الرد خلال {duration}",
  },
];
// Fix a copy/paste slip above (Arabic zero-hour branch was accidentally left in German
// during drafting) before this file is ever run.
for (const m of PATTERN_MESSAGES) {
  if (m.key === "account.inHoursCount") {
    m.ar =
      "{n, plural, zero {الآن} one {خلال ساعة واحدة} two {خلال ساعتين} few {خلال # ساعات} many {خلال # ساعة} other {خلال # ساعة}}";
  }
}

// ── 7. Assembly helpers ──────────────────────────────────────────────────────────────────
function setNested(obj, dottedKey, value) {
  const parts = dottedKey.split(".");
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    cur[parts[i]] = cur[parts[i]] || {};
    cur = cur[parts[i]];
  }
  cur[parts[parts.length - 1]] = value;
}

function sortDeep(o) {
  if (typeof o !== "object" || o === null) return o;
  const out = {};
  for (const k of Object.keys(o).sort()) out[k] = sortDeep(o[k]);
  return out;
}

function reorder(obj, includeMeta) {
  const out = {};
  if (obj.HomePage) out.HomePage = obj.HomePage;
  const nsKeys = Object.keys(obj)
    .filter((k) => k !== "HomePage" && k !== "$meta")
    .sort();
  for (const k of nsKeys) out[k] = sortDeep(obj[k]);
  if (includeMeta && obj.$meta) out.$meta = obj.$meta;
  return out;
}

function loadExistingHomePage(locale) {
  const p = join(MESSAGES_DIR, `${locale}.json`);
  if (!existsSync(p)) return null;
  try {
    const data = JSON.parse(readFileSync(p, "utf8"));
    return data.HomePage || null;
  } catch {
    return null;
  }
}

// ── 8. Main ──────────────────────────────────────────────────────────────────────────────
function main() {
  if (!existsSync(ADR_012_PATH)) {
    throw new Error(`Expected ADR-012 at ${ADR_012_PATH} — the duplicate/product-name rules it records are load-bearing for this migration.`);
  }

  const dict = loadDict();
  const mockFiles = walkMockFiles();
  const pillCandidates = scanPillCandidates(mockFiles);

  const en = {};
  const de = {};
  const fr = {};
  const ar = {};
  const keyMap = {};
  const meta = { pendingValueKeys: [], nonTranslatableKeys: [], noParamKeys: {} };
  const usedLeaves = {};
  let pluralCount = 0;
  let pillOnlyCount = 0;
  let dualUseCount = 0;

  // Product names first (D-18) — these three are also real dictionary keys and must not
  // flow through the generic per-string loop below.
  for (const p of PRODUCT_NAMES) {
    setNested(en, p.key, p.source);
    setNested(de, p.key, p.source);
    setNested(fr, p.key, p.source);
    setNested(ar, p.key, p.source);
    meta.nonTranslatableKeys.push(p.key);
    if (!p.synthetic) keyMap[p.source] = p.key;
  }
  const PRODUCT_NAME_SOURCES = new Set(PRODUCT_NAMES.filter((p) => !p.synthetic).map((p) => p.source));

  // The generic per-string loop.
  for (const [sourceKey, translations] of Object.entries(dict.strings)) {
    if (PRODUCT_NAME_SOURCES.has(sourceKey)) continue;

    const namespace = resolveNamespace(mockFiles, sourceKey);
    const baseLeaf = slugify(sourceKey) || `entry-${Object.keys(keyMap).length}`;
    usedLeaves[namespace] = usedLeaves[namespace] || new Set();
    let finalLeaf = baseLeaf;
    let suffix = 2;
    while (usedLeaves[namespace].has(finalLeaf)) {
      nsLog.leafCollisions.push({ namespace, leaf: baseLeaf, source: sourceKey, resolvedAs: `${baseLeaf}-${suffix}` });
      finalLeaf = `${baseLeaf}-${suffix}`;
      suffix++;
    }
    usedLeaves[namespace].add(finalLeaf);
    const dottedKey = `${namespace}.${finalLeaf}`;
    keyMap[sourceKey] = dottedKey;

    setNested(en, dottedKey, sourceKey);

    const isPillCandidate = pillCandidates.has(sourceKey);
    const dualUse = isPillCandidate && isDualUse(mockFiles, sourceKey);

    if (isPillCandidate && !dualUse) {
      // ADR-011: pending-value pill copy stays English in every language, with no exception.
      pillOnlyCount++;
      meta.pendingValueKeys.push(dottedKey);
      setNested(de, dottedKey, sourceKey);
      setNested(fr, dottedKey, sourceKey);
      setNested(ar, dottedKey, sourceKey);
    } else {
      if (isPillCandidate && dualUse) dualUseCount++;
      setNested(de, dottedKey, translations.de);
      setNested(fr, dottedKey, translations.fr);
      setNested(ar, dottedKey, translations.ar);
    }

    if (/\d/.test(sourceKey) && !sourceKey.includes("{")) {
      meta.noParamKeys[dottedKey] = classifyNoParamReason(sourceKey);
    }
  }

  // The 44 concatenation patterns -> parameterised ICU messages.
  for (const p of PATTERN_MESSAGES) {
    setNested(en, p.key, p.en);
    setNested(de, p.key, p.de);
    setNested(fr, p.key, p.fr);
    setNested(ar, p.key, p.ar);
    for (const src of p.sources) keyMap[`pattern:${src}`] = p.key;
    if (/\{[a-zA-Z]+,\s*plural,/.test(p.en)) pluralCount++;
  }

  // Preserve the tracer's HomePage namespace (Plan 01) untouched.
  for (const [locale, obj] of [
    ["en", en],
    ["de", de],
    ["fr", fr],
    ["ar", ar],
  ]) {
    const hp = loadExistingHomePage(locale);
    if (hp) obj.HomePage = hp;
  }

  // en.json is the authority check-i18n-coverage.mjs reads $meta from; the other three
  // locale files carry a shape-identical copy purely so a naive flatten (one that does not
  // special-case a "$"-prefixed top-level key, unlike check-i18n-coverage.mjs's own
  // `flatten()`) still finds the same key COUNT in all four files. The real gate ignores
  // $meta in every locale file uniformly, so this is inert there. `noParamKeys`' values are
  // replaced with `true` in the mirrored copy (same key set, non-string value) rather than
  // repeating the English reason text, so a naive "is this long string byte-identical
  // across locales" check does not mistake 54 English-only opt-out reasons for untranslated
  // content.
  const metaMirror = {
    pendingValueKeys: meta.pendingValueKeys,
    nonTranslatableKeys: meta.nonTranslatableKeys,
    noParamKeys: Object.fromEntries(Object.keys(meta.noParamKeys).map((k) => [k, true])),
  };
  en.$meta = meta;
  de.$meta = metaMirror;
  fr.$meta = metaMirror;
  ar.$meta = metaMirror;

  const outputs = {
    "en.json": reorder(en, true),
    "de.json": reorder(de, true),
    "fr.json": reorder(fr, true),
    "ar.json": reorder(ar, true),
  };
  const sortedKeyMap = Object.fromEntries(Object.entries(keyMap).sort(([a], [b]) => a.localeCompare(b)));

  // ── Report ────────────────────────────────────────────────────────────────────────────
  console.log(`migrate-dictionary: ${Object.keys(dict.strings).length} source strings, ${PATTERN_MESSAGES.length} pattern-derived keys`);
  console.log(`  namespace resolution: ${nsLog.commonFallback.length} fell back to 'common' (3+ surfaces), ${nsLog.twoSurface.length} resolved from 2 surfaces (kept the first), ${nsLog.unresolved.length} matched no file (routed to 'common')`);
  if (nsLog.commonFallback.length) {
    console.log(`  common fallbacks:`);
    for (const c of nsLog.commonFallback) console.log(`    "${c.key}" -> [${c.namespaces.join(", ")}]`);
  }
  if (nsLog.twoSurface.length) {
    console.log(`  two-surface picks:`);
    for (const c of nsLog.twoSurface) console.log(`    "${c.key}" -> [${c.namespaces.join(", ")}], kept "${c.namespaces[0]}"`);
  }
  if (nsLog.leafCollisions.length) {
    console.log(`  leaf collisions (disambiguated with a numeric suffix):`);
    for (const c of nsLog.leafCollisions) console.log(`    ${c.namespace}.${c.leaf} <- "${c.source}" resolved as ${c.namespace}.${c.resolvedAs}`);
  }
  console.log(`  pending-value pill keys (ADR-011, English-only in every locale): ${pillOnlyCount}`);
  console.log(`  dual-use pill keys (kept real per-locale translation, ADR-011 consequence #2): ${dualUseCount}`);
  console.log(`  non-parameterised-number opt-outs ($meta.noParamKeys): ${Object.keys(meta.noParamKeys).length}`);
  console.log(`  non-translatable product-name keys: ${meta.nonTranslatableKeys.length}`);
  console.log(`  ICU plural messages emitted: ${pluralCount}`);

  const totalKeys = Object.keys(sortedKeyMap).filter((k) => !k.startsWith("pattern:")).length;
  console.log(`  key-map.json: ${totalKeys} source-string entries + ${PATTERN_MESSAGES.reduce((a, p) => a + p.sources.length, 0)} pattern entries`);

  // ── Write or check ────────────────────────────────────────────────────────────────────
  if (CHECK) {
    let drift = false;
    for (const [file, obj] of Object.entries(outputs)) {
      const p = join(MESSAGES_DIR, file);
      const current = existsSync(p) ? readFileSync(p, "utf8") : "";
      const next = JSON.stringify(obj, null, 2) + "\n";
      if (current !== next) {
        drift = true;
        console.error(`DRIFT: ${file} differs from what's committed — re-run without --check to regenerate.`);
      }
    }
    const currentMap = existsSync(KEY_MAP_PATH) ? readFileSync(KEY_MAP_PATH, "utf8") : "";
    const nextMap = JSON.stringify(sortedKeyMap, null, 2) + "\n";
    if (currentMap !== nextMap) {
      drift = true;
      console.error(`DRIFT: key-map.json differs from what's committed — re-run without --check to regenerate.`);
    }
    if (drift) process.exit(1);
    console.log("migrate-dictionary --check: no drift.");
    return;
  }

  for (const [file, obj] of Object.entries(outputs)) {
    writeFileSync(join(MESSAGES_DIR, file), JSON.stringify(obj, null, 2) + "\n");
  }
  writeFileSync(KEY_MAP_PATH, JSON.stringify(sortedKeyMap, null, 2) + "\n");
  console.log(`Wrote ${Object.keys(outputs).join(", ")} and key-map.json to ${MESSAGES_DIR}`);
}

main();
