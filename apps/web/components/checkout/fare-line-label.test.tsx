// 261003 fare lines: the route label keeps each town name as quoted, isolated left-to-right inside
// the translated sentence (Arabic reverses the sentence, never the names).
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import enMessages from "../../i18n/messages/en.json";
import deMessages from "../../i18n/messages/de.json";
import arMessages from "../../i18n/messages/ar.json";
import { airportFeeLabel, routeLabel } from "./fare-line-label";

type Msgs = { checkout: Record<string, string>; price: { line: Record<string, string> } };

function translator(messages: Msgs) {
  const t = ((key: string, values?: Record<string, string>) =>
    (messages.checkout[key] ?? key).replace(/\{(\w+)\}/g, (_m, name: string) => values?.[name] ?? "")) as never;
  const tPrice = ((key: string) => messages.price.line[key.replace("line.", "")] ?? key) as never;
  return { t, tPrice };
}

describe("routeLabel", () => {
  it("English: names stay as quoted, each in its own isolated span", () => {
    const { t } = translator(enMessages as unknown as Msgs);
    const html = renderToStaticMarkup(<>{routeLabel(t, "Zürich", "Genève")}</>);
    expect(html.replace(/<[^>]+>/g, "")).toBe("Zürich – Genève route");
    expect(html.match(/vt-dir-keep/g)).toHaveLength(2);
    expect(html).toContain("data-vt-no-i18n");
  });

  it("German and Arabic keep the sentence order of their own message, names untouched", () => {
    const de = translator(deMessages as unknown as Msgs);
    expect(renderToStaticMarkup(<>{routeLabel(de.t, "Zürich", "Genève")}</>).replace(/<[^>]+>/g, "")).toBe(
      "Strecke Zürich – Genève",
    );
    const ar = translator(arMessages as unknown as Msgs);
    expect(renderToStaticMarkup(<>{routeLabel(ar.t, "Zürich", "Genève")}</>).replace(/<[^>]+>/g, "")).toBe(
      "مسار Zürich – Genève",
    );
  });

  it("no names, or only one: the plain label, never half a pair", () => {
    const { t } = translator(enMessages as unknown as Msgs);
    expect(routeLabel(t, null, null)).toBe("Route price");
    expect(routeLabel(t, "Zürich", "  ")).toBe("Route price");
  });
});

describe("airportFeeLabel", () => {
  it("reads the one airport pickup fee wording in every language", () => {
    expect(airportFeeLabel(translator(enMessages as unknown as Msgs).tPrice)).toBe("Airport pickup fee");
    expect(airportFeeLabel(translator(deMessages as unknown as Msgs).tPrice)).toBe("Flughafen-Abholgebühr");
    expect(airportFeeLabel(translator(arMessages as unknown as Msgs).tPrice)).toBe("رسوم الاستقبال من المطار");
  });
});
