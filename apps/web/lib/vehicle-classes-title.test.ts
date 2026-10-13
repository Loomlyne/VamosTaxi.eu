// apps/web/lib/vehicle-classes-title.test.ts
//
// Phase 30 (CLS-12, CLS-14): the public "Our classes" block reads "Pick the class that fits."
// on both copies of VehicleClasses.dc.html, the dead About "fleet" strings are gone from the
// dictionary and home.dc.html, and every Phase 30 dashboard string resolves in de, fr and ar.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(__dirname, "../../..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

const pagesCopy = read("app/pages/VehicleClasses.dc.html");
const homeCopy = read("app/home/VehicleClasses.dc.html");
const dict = read("app/vamos-i18n-dict.js");
const home = read("app/home/home.dc.html");

/** The text of one dictionary entry, keyed by its English source, or "" when absent. */
const entry = (key: string): string => {
  const needle = `'${key}': {`;
  const needleDq = `["${key}"] = {`;
  let i = dict.indexOf(needle);
  if (i < 0) i = dict.indexOf(needleDq);
  if (i < 0) return "";
  return dict.slice(i, dict.indexOf("\n", i));
};

describe("About / home 'Our classes' title", () => {
  it("keeps the two copies byte-identical", () => {
    expect(pagesCopy).toBe(homeCopy);
  });

  it("reads 'Pick the class that fits.' and no longer 'Three classes'", () => {
    for (const copy of [pagesCopy, homeCopy]) {
      expect(copy).toContain(">Pick the class that fits.<");
      expect(copy).not.toContain("Three classes");
    }
  });

  it("has the signed de, fr and ar lines", () => {
    const e = entry("Pick the class that fits.");
    expect(e).toContain("Wählen Sie die Klasse, die passt.");
    expect(e).toContain("Choisissez la classe qui vous convient.");
    expect(e).toContain("اختر الفئة التي تناسبك.");
  });
});

describe("dead About fleet wording", () => {
  it("is gone from the dictionary", () => {
    expect(dict).not.toContain("'The fleet'");
    expect(dict).not.toContain("Three classes, chosen by what you are carrying");
    expect(dict).not.toContain("A saloon for one or two travellers with ordinary luggage.");
  });

  it("keeps the entries other surfaces still use", () => {
    expect(dict).toContain("'Drivers and fleet owners'");
    expect(dict).toContain("'3 passengers'");
  });

  it("is gone from home.dc.html", () => {
    expect(home).not.toContain("aboutH2");
    expect(home).not.toContain("aboutEyebrow");
    expect(home).not.toContain("aboutBody");
    expect(home).not.toContain("One fleet, one price list");
  });
});

describe("Phase 30 dashboard strings resolve in de, fr and ar", () => {
  const strings: Record<string, [string, string, string]> = {
    "Going live…": ["Wird live geschaltet…", "Mise en ligne…", "جارٍ التشغيل…"],
    "Retiring…": ["Wird stillgelegt…", "Retrait…", "جارٍ الإيقاف…"],
    "Bringing back…": ["Wird zurückgeholt…", "Remise en cours…", "جارٍ الإعادة…"],
    "Hide retired classes": ["Stillgelegte Klassen ausblenden", "Masquer les classes retirées", "إخفاء الفئات الموقوفة"],
    "Show retired classes": ["Stillgelegte Klassen anzeigen", "Afficher les classes retirées", "عرض الفئات الموقوفة"],
    "Draft: see what is missing": ["Entwurf: Fehlendes anzeigen", "Brouillon : voir ce qui manque", "مسودة: عرض الناقص"],
    Missing: ["Fehlt", "Manquant", "ناقص"],
    "Edit class": ["Klasse bearbeiten", "Modifier la classe", "تعديل الفئة"],
    "Could not retire this class. Try again.": [
      "Stilllegen ist fehlgeschlagen. Bitte erneut versuchen.",
      "Le retrait a échoué. Réessayez.",
      "تعذّر إيقاف الفئة. حاول مجددًا.",
    ],
    "Could not go live. Check the list and try again.": [
      "Live schalten ist fehlgeschlagen. Liste prüfen und erneut versuchen.",
      "La mise en ligne a échoué. Vérifiez la liste et réessayez.",
      "تعذّر التشغيل. راجع القائمة وحاول مجددًا.",
    ],
    "Could not bring this class back. Try again.": [
      "Zurückholen ist fehlgeschlagen. Bitte erneut versuchen.",
      "La remise a échoué. Réessayez.",
      "تعذّر إعادة الفئة. حاول مجددًا.",
    ],
    "Back as a Draft. Add a price in the price book, then go live.": [
      "Wieder als Entwurf da. Preis im Preisbuch ergänzen, dann live schalten.",
      "De retour en brouillon. Ajoutez un prix dans le livre de prix, puis mettez en ligne.",
      "عادت كمسودة. أضف سعرًا في كتاب الأسعار ثم شغّلها.",
    ],
    "paid trips ahead have no chauffeur yet": [
      "kommende bezahlte Fahrten haben noch keinen Chauffeur",
      "courses payées à venir n’ont pas encore de chauffeur",
      "رحلات مدفوعة قادمة بلا سائق بعد",
    ],
    "paid trip ahead has no chauffeur yet": [
      "kommende bezahlte Fahrt hat noch keinen Chauffeur",
      "course payée à venir n’a pas encore de chauffeur",
      "رحلة مدفوعة قادمة بلا سائق بعد",
    ],
  };

  for (const [key, [de, fr, ar]] of Object.entries(strings)) {
    it(`'${key}'`, () => {
      const e = entry(key);
      expect(e).not.toBe("");
      expect(e).toContain(de);
      expect(e).toContain(fr);
      expect(e).toContain(ar);
    });
  }

  it("uses no 'ß' in the Phase 30 German", () => {
    for (const [, [de]] of Object.entries(strings)) expect(de).not.toContain("ß");
  });

  it("holds the sheet-11b trip sentence once per key and five count patterns", () => {
    expect(dict.split("'paid trips ahead have no chauffeur yet'").length - 1).toBe(1);
    expect(dict.split("'paid trip ahead has no chauffeur yet'").length - 1).toBe(1);
    expect((dict.match(/paid trips? ahead ha/g) || []).length).toBe(7);
  });
});
