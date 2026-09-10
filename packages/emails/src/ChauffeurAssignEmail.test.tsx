import { describe, expect, it } from "vitest";
import { render } from "@react-email/render";
import {
  ChauffeurAssignEmail,
  chauffeurAssignPlainText,
  chauffeurAssignSubject,
  type ChauffeurDispatchForEmail,
} from "./ChauffeurAssignEmail";
import {
  ChauffeurUnassignEmail,
  chauffeurUnassignPlainText,
  chauffeurUnassignSubject,
} from "./ChauffeurUnassignEmail";
import { chauffeurEmailLocale } from "./lib/chauffeur-locale";
import { coverage } from "./lib/t";
import type { EmailLocale } from "./lib/types";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const LOCALES: EmailLocale[] = ["en", "de", "fr", "ar"];

function trip(locale: EmailLocale): ChauffeurDispatchForEmail {
  return {
    reference: "VT-10001",
    locale,
    pickupText: "Zurich Airport (ZRH), Terminal 2",
    dropoffText: "Zurich, Bahnhofstrasse 1",
    scheduledLocal: "2026-09-22T19:55",
  };
}

describe("coverage", () => {
  it("keeps chauffeur keys in de/fr/ar", () => {
    expect(coverage()).toEqual([]);
  });
});

describe("chauffeurEmailLocale", () => {
  it("picks the first of de,fr,ar,en present on the fleet row", () => {
    expect(chauffeurEmailLocale(["it", "de", "en"])).toBe("de");
    expect(chauffeurEmailLocale(["en", "fr"])).toBe("fr");
    expect(chauffeurEmailLocale(["ar"])).toBe("ar");
    expect(chauffeurEmailLocale(["it", "es"])).toBe("en");
    expect(chauffeurEmailLocale([])).toBe("en");
    expect(chauffeurEmailLocale(null)).toBe("en");
  });
});

describe("ChauffeurAssignEmail", () => {
  it.each(LOCALES)("renders %s assign trip without fare or driver-app CTA", async (locale) => {
    const html = await render(ChauffeurAssignEmail({ trip: trip(locale) }));
    expect(html).not.toMatch(/\{[a-zA-Z.]+\}/);
    expect(html).toContain("VT-10001");
    expect(html).toContain("Zurich Airport (ZRH), Terminal 2");
    expect(html).toContain("Zurich, Bahnhofstrasse 1");
    expect(html).toContain("19:55");
    expect(html).not.toContain("2026-09-22T19:55");
    expect(html).not.toContain("CHF");
    expect(html).not.toContain("sk_test");
    expect(html).not.toContain("play.google");
    expect(html).not.toContain("apps.apple");
    expect(html).not.toContain("wa.me");
    expect(html).not.toContain("WhatsApp");
    expect(html).toContain("wordmark-email.png");
  });

  it("plain text and subject carry the reference", () => {
    const payload = trip("en");
    expect(chauffeurAssignSubject(payload)).toContain("VT-10001");
    expect(chauffeurAssignPlainText(payload)).toContain("Zurich Airport (ZRH), Terminal 2");
    expect(chauffeurAssignPlainText(payload)).not.toContain("CHF");
  });
});

describe("ChauffeurUnassignEmail", () => {
  it.each(LOCALES)("renders %s unassign trip without fare or driver-app CTA", async (locale) => {
    const html = await render(ChauffeurUnassignEmail({ trip: trip(locale) }));
    expect(html).not.toMatch(/\{[a-zA-Z.]+\}/);
    expect(html).toContain("VT-10001");
    expect(html).not.toContain("CHF");
    expect(html).not.toContain("wa.me");
    expect(html).not.toContain("play.google");
  });

  it("plain text and subject carry the reference", () => {
    const payload = trip("de");
    expect(chauffeurUnassignSubject(payload)).toContain("VT-10001");
    expect(chauffeurUnassignPlainText(payload)).toContain("Bahnhofstrasse 1");
  });
});

describe("send envelope", () => {
  it("uses noreply@vamostaxi.site and does not bump notification_claim", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const send = readFileSync(join(here, "lib/send.ts"), "utf8");
    expect(send).toContain("Vamos Taxi <noreply@vamostaxi.site>");
    expect(send).toContain("sendChauffeurAssign");
    expect(send).toContain("sendChauffeurUnassign");
    const dispatch = send.slice(send.indexOf("async function sendChauffeurDispatch"));
    expect(dispatch).not.toContain("notification_claim");
    expect(dispatch.toLowerCase()).not.toContain("gmail");
  });
});
