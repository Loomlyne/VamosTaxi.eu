// apps/web/lib/flight-lines.test.ts
//
// Owner answer 6, 2026-10-05: "we just need flight number not trcking". The site takes a flight
// number; it does not look the flight up, follow it or move a pickup with it. No customer line may
// say otherwise, in any of the four languages. The replacement wording is a draft until the owner
// approves it (.planning/quick/261005-content-flight-promise/HANDOVER.md).

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(__dirname, "../../..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

function* walk(dir: string, ext: RegExp): Generator<string> {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === ".next" || name === "ops") continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) yield* walk(full, ext);
    else if (ext.test(name) && !/\.test\./.test(name)) yield full;
  }
}

/** Promise shapes, in the four languages. Case-insensitive. */
const PROMISES: ReadonlyArray<RegExp> = [
  /we (track|watch) (your|the|this) flight/i,
  /flight tracked|flight tracking|flight-tracking/i,
  /(driver|flight) (tracks|watches) (this|the|your) flight/i,
  /real arrival|actual landing time we see|we see against your flight|delay is visible to us/i,
  /(pickup|pick-up)( time)? moves (with|automatically)|moves with the (flight|real)/i,
  /verfolgen (ihren|den|diesen) flug|flugverfolgung|flug wird verfolgt|beobachten ihren flug/i,
  /suivons (votre|le) vol|suivi de vol|vol suivi|suit ce vol/i,
  /نتابع رحلتك|نتتبّع الرحلة|نتتبع رحلتك|نتابع الرحلة|الرحلة متابَعة|يتابع سائقك/,
];

describe("no customer line promises flight tracking", () => {
  const sources: string[] = [
    ...[...walk(join(ROOT, "app/home"), /\.html$/), ...walk(join(ROOT, "app/pages"), /\.html$/)].map((f) => relative(ROOT, f)),
    "app/vamos-i18n-dict.js",
    "apps/web/i18n/messages/en.json",
    "apps/web/i18n/messages/de.json",
    "apps/web/i18n/messages/fr.json",
    "apps/web/i18n/messages/ar.json",
    ...[...walk(join(ROOT, "apps/web/app"), /\.(ts|tsx)$/), ...walk(join(ROOT, "apps/web/components"), /\.(ts|tsx)$/)].map((f) => relative(ROOT, f)),
  ];

  it("the scan covers the mocks, the dictionary, the message files and the Next pages", () => {
    expect(sources.length).toBeGreaterThan(60);
    expect(sources).toContain("app/home/home.dc.html");
    expect(sources).toContain("app/pages/terms.dc.html");
  });

  it("finds none of the promise shapes anywhere", () => {
    const hits: string[] = [];
    for (const rel of sources) {
      const text = read(rel);
      for (const re of PROMISES) {
        const m = re.exec(text);
        if (m) hits.push(`${rel}: ${m[0]}`);
      }
    }
    expect(hits).toEqual([]);
  });
});

describe("the drafted flight lines", () => {
  const dict = read("app/vamos-i18n-dict.js");
  const NEW_LINES = [
    "So your driver knows which flight to meet",
    "Waiting time included",
    "We take your flight number",
    "Give it when you book, so your driver knows which flight to meet.",
    "Tell us as soon as you know, on the number in your confirmation. The waiting time then counts from the new landing time, at no extra cost.",
    "Cancel early and you get the most back; the closer to pickup, the less, because a driver is already committed to your journey. Flight delays are handled separately: tell us as soon as you know.",
    "Tell us the flight number for an airport pickup, so your driver knows which flight to meet.",
    "Airport pickups: 60 minutes after landing.",
    "If your flight is delayed, tell us as soon as you know and the allowance counts from the new landing time.",
    "Give us the flight number for an airport pickup. The included waiting allowance counts from the landing time, not from the time you booked.",
    "Delay within the same day: tell us as soon as you know, on the number in your confirmation. The allowance counts from the new landing time.",
    "Flight number, where you gave one.",
    "Airline code and number, as printed on your boarding pass. Your driver meets this flight, so keep it up to date.",
  ];

  function entry(en: string): { de: string; fr: string; ar: string } | null {
    const esc = en.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const m = new RegExp(`S\\["${esc}"\\] = \\{ de: "([^"]*)", fr: "([^"]*)", ar: "([^"]*)" \\};`).exec(dict);
    return m ? { de: m[1]!, fr: m[2]!, ar: m[3]! } : null;
  }

  it("each has de, fr and ar in the dictionary, never the English, never an eszett", () => {
    for (const en of NEW_LINES) {
      const e = entry(en);
      expect(e, en).not.toBeNull();
      for (const l of ["de", "fr", "ar"] as const) {
        expect(e![l].length, `${l}: ${en}`).toBeGreaterThan(3);
        expect(e![l], `${l}: ${en}`).not.toBe(en);
      }
      expect(e!.de, en).not.toContain("ß");
    }
  });

  it("each is rendered by a mock (the home box, sheet, cards, FAQ or a legal page) or by the home script", () => {
    const mocks = [...walk(join(ROOT, "app/home"), /\.html$/), ...walk(join(ROOT, "app/pages"), /\.html$/)].map((f) => readFileSync(f, "utf8")).join("\n");
    for (const en of NEW_LINES) expect(mocks, en).toContain(en);
  });

  it("the home How it works mock keeps one table per language with no lookup promise", () => {
    const hiw = read("app/home/HowItWorks.dc.html");
    expect(hiw).toContain("s1c: 'Enter your pickup, drop-off and time. For an airport pickup, add your flight number.'");
    expect(hiw).not.toMatch(/Type a flight number|Geben Sie eine Flugnummer ein|Saisissez un numéro de vol|أدخل رقم الرحلة فيأتي/);
  });

  it("the checkout trip editor hint and the cancellation page lose the old lines in all four languages", () => {
    for (const l of ["en", "de", "fr", "ar"]) {
      const m = JSON.parse(read(`apps/web/i18n/messages/${l}.json`));
      expect(m.checkout.tripFlightHint, l).toBeTruthy();
      expect(m.legal["no-flight-number-on-the-booking-we-cannot-see-th"], l).toBeUndefined();
      expect(m.legal["delay-within-the-same-day-the-pickup-moves-autom"], l).toBeUndefined();
    }
    const en = JSON.parse(read("apps/web/i18n/messages/en.json"));
    expect(en.checkout.tripFlightHint).toBe("So your driver knows which flight to meet");
  });

  it("the terms and cancellation keep the approved waiting values: 60 minutes at an airport, 30 elsewhere", () => {
    const terms = read("app/pages/terms.dc.html");
    expect(terms).toContain("Airport pickups: 60 minutes after landing.");
    expect(terms).toContain("All other pickups: 30 minutes, counted from the booked time.");
    const canc = read("app/pages/cancellation.dc.html");
    expect(canc).toContain("Airport pickups: 60 minutes from the actual landing time.");
    expect(canc).toContain("All other pickups: 30 minutes from the booked time.");
  });
});
