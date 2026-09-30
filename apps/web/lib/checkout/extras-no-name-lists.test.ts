// apps/web/lib/checkout/extras-no-name-lists.test.ts
//
// 26.2-p4 A3: no list of extra names stays in the code that saves an extra or
// offers it on /checkout. Reads source files as text (comments removed first).
//
// What stays on purpose is named at the bottom: the readers of OLD bookings.
// They print history; they decide nothing for a new booking.

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const WEB = join(__dirname, "..", "..");
const SKIP_DIR = new Set(["node_modules", "public", "tests", "test-results"]);

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIR.has(name) || name.startsWith(".")) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(name) && !/\.(test|spec)\./.test(name)) out.push(full);
  }
  return out;
}

function source(file: string): string {
  return readFileSync(file, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((line) => !/^\s*\/\//.test(line))
    .map((line) => line.replace(/(^|[^:"'`\\])\/\/[^\n]*$/, "$1"))
    .join("\n");
}

const rel = (file: string) => relative(WEB, file);
const FILES = ["app", "lib", "components"].flatMap((dir) => walk(join(WEB, dir)));
const CATALOG = join(WEB, "lib", "checkout", "extras-catalog.ts");
const ROUTE = join(WEB, "app", "[locale]", "(ops)", "api", "staff", "rate-book", "route.ts");

describe("26.2-p4 A3: the name lists and the renaming are gone", () => {
  it("lib/ops/surcharge-codes.ts does not exist", () => {
    expect(existsSync(join(WEB, "lib", "ops", "surcharge-codes.ts"))).toBe(false);
    expect(existsSync(join(WEB, "lib", "ops", "surcharge-codes.test.ts"))).toBe(false);
  });

  it("no source file imports it or uses one of its helpers", () => {
    const gone =
      /surcharge-codes|\b(normalizeSurchargeCode|isPassengerExtra|isAutomaticSurcharge|extraWriteFields|SURCHARGE_CODES|PASSENGER_EXTRA_CODES|AUTOMATIC_SURCHARGE_CODES|SurchargeCode)\b/;
    expect(FILES.length).toBeGreaterThan(100);
    const bad = FILES.filter((file) => gone.test(source(file))).map(rel);
    expect(bad).toEqual([]);
  });

  it("the tick-box module has no name-based helper left", () => {
    const text = source(CATALOG);
    const gone = [
      "EXTRA_UI",
      "extraUi",
      "extraIsOn",
      "lockHasExtra",
      "isWaitingPayableCode",
      "extraFaresOn",
      "isExtraStopCode",
      "recapExtraFares",
      "recapExtras",
      "extraRappenOutsideLock",
      "catalogFromSurcharges",
      "pricedOnQuote",
      "FREE_WAIT_CODE",
      "MEET_GREET_CODE",
      "ExtraToggles",
      "LockExtrasPeek",
      "CheckoutExtraJson",
    ];
    expect(gone.filter((name) => new RegExp(`\\b${name}\\b`).test(text))).toEqual([]);
  });

  it("the tick-box module compares no code to a quoted name", () => {
    // Any quoted word that looks like an extra's code: lower case with _ or -, or a bare known word.
    const text = source(CATALOG);
    const quoted = [...text.matchAll(/["'`]([a-z]+(?:[_-][a-z]+)+)["'`]/g)].map((m) => m[1]!);
    const bare = [...text.matchAll(/["'`](ski|pet|night|weekend|holiday|waiting)["'`]/g)].map((m) => m[1]!);
    expect([...quoted, ...bare]).toEqual([]);
    expect(text).not.toMatch(/\.code\s*[!=]==/);
  });

  it("no source file reads the dead extras catalog of the checkout re-price", () => {
    const bad = FILES.filter((file) => /\bextrasCatalog\b/.test(source(file))).map(rel);
    expect(bad).toEqual([]);
  });
});

describe("26.2-p4 A1: the save route, read as text", () => {
  const text = source(ROUTE);

  it("binds the rule through the driver's JSON helper, never as stringified text", () => {
    expect(text).toMatch(/tx\.json\(MANUAL_PREDICATE\)/);
    expect(text).not.toMatch(/predicate[^\n]*JSON\.stringify/);
    expect(text).not.toMatch(/JSON\.stringify\([^)]*predicate/);
  });

  it("writes the rule and the quantity source on every extra insert and update", () => {
    const writes = [...text.matchAll(/(insert into public\.surcharges|update public\.surcharges set)[\s\S]*?`/g)].map(
      (m) => m[0],
    );
    expect(writes).toHaveLength(2);
    for (const statement of writes) {
      expect(statement).toMatch(/\bpredicate\b/);
      expect(statement).toMatch(/\bquantity_source\b/);
    }
  });
});

describe("what stays: the tick-box list and the readers of old bookings", () => {
  it("the tick-box module still exports what checkout, mails, receipts and the dashboard use", () => {
    const text = source(CATALOG);
    for (const name of [
      "selectableExtras",
      "humaniseCode",
      "ExtraLabelsByCode",
      "SurchargeLike",
      "SnapshotExtraFare",
      "PUBLIC_MAX_EXTRA_STOPS",
      "capExtraStops",
      "publishedMaxExtraStops",
    ]) {
      expect(text, name).toMatch(new RegExp(`export (function|const|type) ${name}\\b`));
    }
  });

  it("the old-booking readers are still there", () => {
    const has = (path: string[], name: string) =>
      expect(source(join(WEB, ...path)), `${path.join("/")} ${name}`).toMatch(new RegExp(`\\b${name}\\b`));
    has(["lib", "checkout", "pay-link.ts"], "LEGACY_EXTRA_NAMES");
    has(["lib", "checkout", "pay-link.ts"], "payLinkExtras");
    has(["lib", "checkout", "pay-link.ts"], "extrasFromPolicy");
    has(["lib", "checkout", "booking-read.ts"], "legacyExtraCodes");
    has(["lib", "checkout", "confirmation-receipt.ts"], "EXTRA_CODES");
    has(["lib", "checkout", "confirmation-receipt.ts"], "receiptPriceSplit");
  });
});
