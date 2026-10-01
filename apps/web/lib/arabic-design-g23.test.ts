import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Source-level checks for quick task 261001-arabic-design-g23: the laws and
 * tokens (mirrored arrows, disabled primary button, muted text contrast), the
 * Arabic phone number, and the Arabic "waiting" typo.
 */
const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "../../..");
const read = (path: string): string => readFileSync(join(repoRoot, path), "utf8");

const PHONE = "+41 79 626 70 82";
const LRM = "‎";
// Arabic "waiting": wrong spelling has ط (U+0637), right spelling has ظ (U+0638).
const TYPO = "انتطار";
const RIGHT = "انتظار";

const tokenCopies = (name: "laws" | "colors") =>
  [`design-system/tokens/${name}.css`, `apps/web/public/brand/tokens/${name}.css`] as const;

describe("laws.css", () => {
  const [source, brand] = tokenCopies("laws");

  it("keeps design-system and public brand copies identical", () => {
    expect(read(brand)).toBe(read(source));
  });

  for (const file of tokenCopies("laws")) {
    describe(file, () => {
      const css = read(file);

      it("greys a disabled primary button instead of fading the yellow", () => {
        expect(css).toContain(
          '.vt-btn.vt-btn--primary:is([disabled],[aria-disabled="true"]),',
        );
        expect(css).toContain(
          '.vt-btn.vt-btn--primary:is([disabled],[aria-disabled="true"]):is(:hover,:active){opacity:1;background:var(--vt-grey-100);color:var(--vt-text-muted);transform:none}',
        );
      });

      it("mirrors direction-bearing glyphs in Arabic, once, right after .vt-dir-keep", () => {
        const keepAt = css.indexOf('[dir="rtl"] .vt-dir-keep{');
        const ruleAt = css.indexOf('[dir="rtl"] :is([style*="/arrow-right.svg"]');
        expect(keepAt).toBeGreaterThan(-1);
        expect(ruleAt).toBeGreaterThan(keepAt);
        const rule = css.slice(ruleAt, css.indexOf("\n", ruleAt));
        for (const glyph of ["arrow-right", "chevron-right", "chevron-left", "log-in", "log-out"]) {
          expect(rule).toContain(`[style*="/${glyph}.svg"]`);
        }
        for (const exclusion of [
          ".vt-dir-keep *",
          '[dir="ltr"] *',
          "[data-bb-mirror] *",
          "[data-bs-mirror] *",
          "[data-svc-cta-arrow] *",
          "[data-svc-circ] *",
          "[data-route-join] *",
          "[data-bt-go] *",
          "[data-bk-go] *",
          "[data-ac-more-go] *",
          ".vt-dp__nav *",
          ".vt-row__chevron *",
          ".vt-co__strip-back *",
          ".vt-co__strip-arrow *",
        ]) {
          expect(rule).toContain(exclusion);
        }
        expect(rule.endsWith("{transform:scaleX(-1)}")).toBe(true);
        expect(css.split("/arrow-right.svg").length - 1).toBe(1);
      });
    });
  }
});

describe("colors.css", () => {
  const [source, brand] = tokenCopies("colors");

  it("keeps design-system and public brand copies identical", () => {
    expect(read(brand)).toBe(read(source));
  });

  for (const file of tokenCopies("colors")) {
    it(`${file} lifts muted text to 4.5:1 under @supports color-mix`, () => {
      const css = read(file);
      expect(css).toContain("--vt-text-muted:var(--vt-grey-500);");
      expect(css).toContain("@supports (color:color-mix(in oklab,red,blue)){");
      expect(css).toContain(
        ":root{--vt-text-muted:color-mix(in oklab,var(--vt-grey-500) 60%,var(--vt-charcoal-600))}",
      );
      expect(css.indexOf("@supports")).toBeGreaterThan(css.indexOf("--vt-text-muted:var(--vt-grey-500);"));
    });
  }
});

describe("Arabic phone number", () => {
  const spanOpen = /<span class="vt-dir-keep"(?: style="white-space:nowrap")?>$/;
  const pages: Array<[string, number]> = [
    ["app/pages/imprint.dc.html", 3],
    ["app/pages/cancellation.dc.html", 2],
    ["app/pages/account.dc.html", 1],
  ];

  for (const [file, count] of pages) {
    it(`${file} wraps all ${count} number(s) in vt-dir-keep`, () => {
      const src = read(file);
      expect(src.split(PHONE).length - 1).toBe(count);
      // Every occurrence sits directly inside the span: opener before, closer after.
      let at = src.indexOf(PHONE);
      while (at !== -1) {
        expect(src.slice(0, at)).toMatch(spanOpen);
        expect(src.slice(at + PHONE.length, at + PHONE.length + "</span>".length)).toBe("</span>");
        at = src.indexOf(PHONE, at + PHONE.length);
      }
    });
  }

  it("keeps the number on one line inside the cancellation sentence", () => {
    expect(read("app/pages/cancellation.dc.html")).toContain(
      `<a href="tel:+41796267082"><span class="vt-dir-keep" style="white-space:nowrap">${PHONE}</span></a>`,
    );
  });

  it("puts a left-to-right mark before every +41 in an Arabic message and after the full number", () => {
    const messages = JSON.parse(read("apps/web/i18n/messages/ar.json")) as unknown;
    const strings: Array<[string, string]> = [];
    const walk = (node: unknown, path: string): void => {
      if (typeof node === "string") strings.push([path, node]);
      else if (node && typeof node === "object") {
        for (const [key, value] of Object.entries(node)) walk(value, path ? `${path}.${key}` : key);
      }
    };
    walk(messages, "");
    const withNumber = strings.filter(([, value]) => value.includes("+41"));
    expect(withNumber.length).toBeGreaterThanOrEqual(5);
    for (const [path, value] of withNumber) {
      for (let at = value.indexOf("+41"); at !== -1; at = value.indexOf("+41", at + 3)) {
        expect(value[at - 1], `${path}: mark before +41`).toBe(LRM);
      }
      if (value.includes(PHONE)) {
        const end = value.indexOf(PHONE) + PHONE.length;
        expect(value[end], `${path}: mark after the number`).toBe(LRM);
      }
    }
    const checkout = (messages as { checkout: Record<string, string> }).checkout;
    expect(checkout.emptyBody).toContain(`${LRM}${PHONE}${LRM}`);
    expect(checkout.quoteGeneric).toContain(`${LRM}${PHONE}${LRM}`);
  });
});

describe("Arabic spelling of waiting (انتظار)", () => {
  it("has no انتطار in the dictionary, the Arabic messages or the seed", () => {
    for (const file of [
      "app/vamos-i18n-dict.js",
      "apps/web/i18n/messages/ar.json",
      "packages/db/supabase/seed.sql",
    ]) {
      expect(read(file), file).not.toContain(TYPO);
    }
  });

  it("uses انتظار in the four strings", () => {
    const dict = read("app/vamos-i18n-dict.js");
    for (const key of ["Awaiting payment", "Awaiting live Stripe data", "Waiting, airport", "Waiting, city"]) {
      const line = dict.split("\n").find((l) => l.includes(`'${key}':`)) ?? "";
      expect(line, key).toContain(RIGHT);
    }
    const ar = JSON.parse(read("apps/web/i18n/messages/ar.json")) as {
      common: Record<string, string>;
      ops: Record<string, string>;
    };
    expect(ar.common["waiting-airport"]).toContain(RIGHT);
    expect(ar.common["waiting-city"]).toContain(RIGHT);
    expect(ar.ops["awaiting-payment"]).toContain(RIGHT);
    expect(ar.ops["awaiting-live-stripe-data"]).toContain(RIGHT);
  });
});

describe("CSP", () => {
  it("allows no Google Maps host in connect-src (G23)", () => {
    expect(read("apps/web/lib/security/headers.ts")).not.toContain("maps.googleapis.com");
  });
});
