// apps/web/lib/ops/mapbox-zone.test.ts
//
// D-26: any Mapbox pin can become a service zone. Slug is from the label.

import { describe, expect, it } from "vitest";
import {
  mapboxIdFromPin,
  pgTextArrayLiteral,
  placeLabelFromPin,
  skiZoneType,
  zoneSlugFromPlace,
} from "./mapbox-zone";

describe("mapbox-zone", () => {
  it("reads mapbox_id from a pin object or a bare string", () => {
    expect(mapboxIdFromPin({ mapbox_id: "dXJu.zermatt" })).toBe("dXJu.zermatt");
    expect(mapboxIdFromPin("dXJu.zermatt")).toBe("dXJu.zermatt");
    expect(mapboxIdFromPin({})).toBe("");
  });

  it("slugs Interlaken and Zermatt without a seeded zone list", () => {
    expect(zoneSlugFromPlace("Interlaken, Switzerland", "sbx.1")).toBe(
      "interlaken-switzerland",
    );
    expect(zoneSlugFromPlace("Zermatt, Bahnhofplatz", "sbx.2")).toBe(
      "zermatt-bahnhofplatz",
    );
  });

  it("marks ski villages as ski, not other", () => {
    expect(skiZoneType("Zermatt, Bahnhofplatz")).toBe("ski");
    expect(skiZoneType("Interlaken")).toBe("other");
  });

  it("keeps the Mapbox display name for the zone label", () => {
    expect(
      placeLabelFromPin({ text: "Interlaken" }, "Interlaken, Switzerland"),
    ).toBe("Interlaken, Switzerland");
  });

  it("binds tags as a Postgres text[] literal", () => {
    expect(pgTextArrayLiteral(["mapbox:abc"])).toBe('{"mapbox:abc"}');
    expect(pgTextArrayLiteral([])).toBe("{}");
  });
});
