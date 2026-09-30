import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import { TripDistance } from "@/app/[locale]/checkout/sections/TripDistance";
import en from "@/i18n/messages/en.json";
import de from "@/i18n/messages/de.json";
import fr from "@/i18n/messages/fr.json";
import ar from "@/i18n/messages/ar.json";

const render = (locale: string, messages: Record<string, unknown>, props: { km?: string | null; noRoad?: boolean }) =>
  renderToString(
    <NextIntlClientProvider locale={locale} messages={messages}>
      <TripDistance className="x" {...props} />
    </NextIntlClientProvider>,
  );

describe("TripDistance (booking polish)", () => {
  it("writes the figure with the direction kept on the digits only", () => {
    const html = render("en", en, { km: "148.2" });
    expect(html).toContain('<span class="vt-dir-keep">148.2</span> km');
    expect(html).not.toContain("data-co-no-road");
  });

  it("Arabic puts the translated unit around the same digits", () => {
    const html = render("ar", ar, { km: "148.2" });
    expect(html).toContain('<span class="vt-dir-keep">148.2</span> كم');
  });

  it("no road: the owner's words in four languages, no figure", () => {
    const words = { en: "No road route", de: "Keine Strassenroute", fr: "Pas d&#x27;itinéraire routier", ar: "لا يوجد طريق بري" };
    const sets = { en, de, fr, ar } as Record<string, Record<string, unknown>>;
    for (const [loc, text] of Object.entries(words)) {
      const html = render(loc, sets[loc]!, { km: "148.2", noRoad: true });
      expect(html).toContain(text);
      expect(html).toContain("data-co-no-road");
      expect(html).not.toContain("148.2");
      expect(html).not.toContain("vt-dir-keep");
    }
  });

  it("renders nothing without a figure and without the no-road flag", () => {
    expect(render("en", en, { km: null })).toBe("");
  });
});
