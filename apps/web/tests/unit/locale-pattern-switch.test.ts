// apps/web/tests/unit/locale-pattern-switch.test.ts
//
// Quick 261001: the real app/vamos-i18n-dict.js and app/vamos-locale.js, loaded the way a page loads them, then
// VamosLocale.t() for a reader who switches language on a page already shown in another one. Arabic counts 11-99
// travellers with the singular accusative (12 راكبًا); 3-10 keep the plural (7 ركاب), also when the text on the page
// is German or French. Before the fix, fromPattern widened every group to (.+) and the 11-99 entries caught every count.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

type Win = Record<string, unknown> & { VamosLocale?: { t: (s: string, lang: string) => string } };

/** A page stub just wide enough for the two scripts to boot; nothing else is faked. */
function loadRuntime(): Win {
  const store: Record<string, string> = {};
  const el = () => ({
    setAttribute() {}, getAttribute() { return null; }, removeAttribute() {},
    style: { removeProperty() {}, setProperty() {} },
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
    appendChild() {}, querySelectorAll: () => [], querySelector: () => null, addEventListener() {},
  });
  const document = {
    documentElement: el(), head: el(), body: el(), readyState: "complete", cookie: "",
    addEventListener() {}, querySelectorAll: () => [], querySelector: () => null, createElement: el,
    createTreeWalker: () => ({ nextNode: () => null }),
  };
  const localStorage = {
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => { store[k] = String(v); },
    removeItem: (k: string) => { delete store[k]; },
  };
  const win: Win = {
    document, localStorage, addEventListener() {}, removeEventListener() {}, dispatchEvent() {},
    location: { pathname: "/", search: "", hostname: "localhost" }, navigator: { language: "en" },
    matchMedia: () => ({ matches: false, addEventListener() {} }), setTimeout, clearTimeout,
    CustomEvent: class { type: string; detail: unknown; constructor(t: string, o?: { detail?: unknown }) { this.type = t; this.detail = o?.detail; } },
    MutationObserver: class { observe() {} disconnect() {} }, NodeFilter: { SHOW_TEXT: 4 },
    fetch: () => Promise.reject(new Error("offline")),
  };
  win.window = win;
  const names = ["window", "document", "localStorage", "navigator", "location", "CustomEvent", "MutationObserver", "NodeFilter", "fetch"];
  for (const file of ["vamos-i18n-dict.js", "vamos-locale.js"]) {
    const src = readFileSync(join(process.cwd(), "../../app", file), "utf8");
    new Function(...names, src)(...names.map((n) => win[n]));
  }
  return win;
}

const runtime = loadRuntime();
const t = (key: string, lang: string) => runtime.VamosLocale!.t(key, lang);

describe("switching language keeps the right Arabic count form (real vamos-locale.js)", () => {
  it.each([
    // German page → Arabic, 3, 7, 10 and 12 travellers
    ["3 Passagiere · 1 Gepäckstück", "ar", "3 ركاب · حقيبة واحدة"],
    ["Bis zu 7 Passagiere", "ar", "حتى 7 ركاب"],
    ["7 Passagiere · VT-4821", "ar", "7 مسافرين · VT-4821"],
    ["10 Passagiere · 0 Gepäckstücke", "ar", "10 ركاب · 0 حقائب"],
    ["12 Passagiere · 0 Gepäckstücke", "ar", "12 راكبًا · 0 حقائب"],
    // French page → Arabic
    ["3 passagers", "ar", "3 ركاب"],
    ["Jusqu’à 7 passagers", "ar", "حتى 7 ركاب"],
    ["10 passagers · 0 bagages", "ar", "10 ركاب · 0 حقائب"],
    ["12 passagers · 0 bagages", "ar", "12 راكبًا · 0 حقائب"],
    // English page → Arabic
    ["7 passengers · 0 bags", "ar", "7 ركاب · 0 حقائب"],
    ["12 passengers · 0 bags", "ar", "12 راكبًا · 0 حقائب"],
    ["Up to 12 passengers", "ar", "حتى 12 راكبًا"],
    ["12 passengers · VT-4821", "ar", "12 مسافرًا · VT-4821"],
    // Arabic page → English, German
    ["12 راكبًا · 0 حقائب", "en", "12 passengers · 0 bags"],
    ["7 ركاب", "en", "7 passengers"],
    ["حتى 7 ركاب", "de", "Bis zu 7 Passagiere"],
    // A template that leaves its number out still translates
    ["Das ist die einzige Buchung.", "ar", "هذا هو الحجز الوحيد."],
    // A wider template no longer swallows a narrower one
    ["Bis zu 7 Gepäckstücke", "en", "Up to 7 bags"],
    // Dashboard New trip: no class seats the party
    ["No class seats 14 passengers", "de", "Keine Klasse hat Platz für 14 Passagiere"],
    ["No class seats 14 passengers", "fr", "Aucune classe n’accueille 14 passagers"],
    ["No class seats 14 passengers", "ar", "لا توجد فئة تتسع لـ 14 راكبًا"],
    ["No class seats 8 passengers", "ar", "لا توجد فئة تتسع لـ 8 ركاب"],
    ["No class seats 2 passengers", "ar", "لا توجد فئة تتسع لراكبَين"],
    ["No class seats 1 passenger", "ar", "لا توجد فئة تتسع لراكب واحد"],
    ["Keine Klasse hat Platz für 8 Passagiere", "ar", "لا توجد فئة تتسع لـ 8 ركاب"],
    ["Aucune classe n’accueille 14 passagers", "ar", "لا توجد فئة تتسع لـ 14 راكبًا"],
    ["لا توجد فئة تتسع لـ 14 راكبًا", "en", "No class seats 14 passengers"],
    // 26.2 P6 (D19): the Resend answer names the address; switching language keeps it, and the older
    // "Sent to …" template does not swallow it (nor the other way round)
    ["Sent. Check anna@example.test in a minute or two.", "de", "Gesendet. Prüfen Sie anna@example.test in ein bis zwei Minuten."],
    ["Sent. Check anna@example.test in a minute or two.", "fr", "Envoyé. Vérifiez anna@example.test d’ici une à deux minutes."],
    ["Sent. Check anna@example.test in a minute or two.", "ar", "تم الإرسال. تحقّق من anna@example.test خلال دقيقة أو دقيقتين."],
    ["Gesendet. Prüfen Sie anna@example.test in ein bis zwei Minuten.", "fr", "Envoyé. Vérifiez anna@example.test d’ici une à deux minutes."],
    ["تم الإرسال. تحقّق من anna@example.test خلال دقيقة أو دقيقتين.", "en", "Sent. Check anna@example.test in a minute or two."],
    ["Gesendet an anna@example.test", "fr", "Envoyé à anna@example.test"],
    // The guest-cancel refusal (a fixed line)
    ["This page is for another booking. Open the link from its e-mail again.", "de", "Diese Seite gehört zu einer anderen Buchung. Öffnen Sie den Link aus ihrer E-Mail erneut."],
    ["Diese Seite gehört zu einer anderen Buchung. Öffnen Sie den Link aus ihrer E-Mail erneut.", "ar", "هذه الصفحة تخص حجزًا آخر. افتح الرابط من بريده الإلكتروني مرة أخرى."],
  ])("%s → %s reads %s", (key, lang, want) => {
    expect(t(key, lang)).toBe(want);
  });
});

// Quick 261015-6om (decision 2026-10-13 item 17, line signed 2026-10-15): the checkout hold line. The Next app
// says it through an ICU plural; the DC mock and any page that builds the sentence get the same forms here
// (Arabic per CLDR: one, two, 3-10, 11 and up), and the mock's two fragments around its TBC pill translate.
describe("the checkout hold line, every form (real vamos-locale.js)", () => {
  it.each([
    ["This price is held for 48 hours.", "de", "Dieser Preis gilt 48 Stunden."],
    ["This price is held for 48 hours.", "fr", "Ce prix est maintenu 48 heures."],
    ["This price is held for 48 hours.", "ar", "يُثبَّت هذا السعر لمدة 48 ساعة."],
    ["This price is held for 1 hour.", "de", "Dieser Preis gilt 1 Stunde."],
    ["This price is held for 1 hour.", "fr", "Ce prix est maintenu 1 heure."],
    ["This price is held for 1 hour.", "ar", "يُثبَّت هذا السعر لمدة ساعة واحدة."],
    ["This price is held for 2 hours.", "de", "Dieser Preis gilt 2 Stunden."],
    ["This price is held for 2 hours.", "ar", "يُثبَّت هذا السعر لمدة ساعتين."],
    ["This price is held for 3 hours.", "ar", "يُثبَّت هذا السعر لمدة 3 ساعات."],
    ["This price is held for 10 hours.", "ar", "يُثبَّت هذا السعر لمدة 10 ساعات."],
    ["This price is held for 11 hours.", "ar", "يُثبَّت هذا السعر لمدة 11 ساعة."],
    ["This price is held for 24 hours.", "ar", "يُثبَّت هذا السعر لمدة 24 ساعة."],
    ["This price is held for 24 hours.", "fr", "Ce prix est maintenu 24 heures."],
    // A page already shown in another language
    ["Dieser Preis gilt 7 Stunden.", "ar", "يُثبَّت هذا السعر لمدة 7 ساعات."],
    ["Dieser Preis gilt 12 Stunden.", "ar", "يُثبَّت هذا السعر لمدة 12 ساعة."],
    ["Dieser Preis gilt 1 Stunde.", "fr", "Ce prix est maintenu 1 heure."],
    ["يُثبَّت هذا السعر لمدة 12 ساعة.", "en", "This price is held for 12 hours."],
    ["يُثبَّت هذا السعر لمدة ساعة واحدة.", "en", "This price is held for 1 hour."],
    ["يُثبَّت هذا السعر لمدة ساعتين.", "de", "Dieser Preis gilt 2 Stunden."],
    ["Ce prix est maintenu 5 heures.", "de", "Dieser Preis gilt 5 Stunden."],
    // checkout.dc.html: the two text nodes around the hours pill
    ["This price is held for", "de", "Dieser Preis gilt"],
    ["This price is held for", "fr", "Ce prix est maintenu"],
    ["This price is held for", "ar", "يُثبَّت هذا السعر لمدة"],
    ["hours.", "de", "Stunden."],
    ["hours.", "fr", "heures."],
    ["hours.", "ar", "ساعة."],
    ["Dieser Preis gilt", "ar", "يُثبَّت هذا السعر لمدة"],
    ["Stunden.", "fr", "heures."],
  ])("%s → %s reads %s", (key, lang, want) => {
    expect(t(key, lang)).toBe(want);
  });
});
