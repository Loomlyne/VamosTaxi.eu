// apps/web/lib/geo/fixtures.ts
//
// Hand-written Mapbox response *shapes* for offline unit tests. These are not
// captures. Nobody later should replace them with a live Search Box / Geocoding
// / Directions body and quietly commit Licensed Map Content to the repository.
//
// None of these objects contains a real `mapbox_id`, a real access token, or a
// real session UUID. Field names match the documented Mapbox JSON so the mapper
// in mapbox.ts can be proven against the same keys production will see.
//
// D-14 / Product Terms §1.9 / §2.7.2 / §2.10.1 (PDF 21 July 2026): a recorded
// live response is Licensed Map Content. This file is a sketch of the shape.

function frozen<T>(value: T): T {
  return Object.freeze(value) as T;
}

/** Search Box `/suggest` — four hits, one of which carries coordinate-shaped keys we must strip. */
export const FIXTURE_SUGGEST_OK = frozen({
  suggestions: frozen([
    frozen({
      name: "Zürich HB",
      mapbox_id: "sbx.fixture.zurich-hb",
      feature_type: "poi",
      address: "Museumstrasse 1",
      full_address: "Museumstrasse 1, 8001 Zürich, Switzerland",
      place_formatted: "Zürich, Switzerland",
      context: frozen({
        country: frozen({ name: "Switzerland", country_code: "CH" }),
        region: frozen({ name: "Zürich" }),
        place: frozen({ name: "Zürich" }),
      }),
    }),
    frozen({
      name: "Zurich Airport",
      mapbox_id: "sbx.fixture.zurich-airport",
      feature_type: "poi",
      address: "Flughafen Zürich",
      full_address: "Flughafen Zürich, 8058 Kloten, Switzerland",
      place_formatted: "Kloten, Switzerland",
      context: frozen({
        country: frozen({ name: "Switzerland", country_code: "CH" }),
        place: frozen({ name: "Kloten" }),
      }),
    }),
    frozen({
      name: "Bahnhofstrasse",
      mapbox_id: "sbx.fixture.bahnhofstrasse",
      feature_type: "street",
      address: "Bahnhofstrasse",
      full_address: "Bahnhofstrasse, 8001 Zürich, Switzerland",
      place_formatted: "Zürich, Switzerland",
      context: frozen({
        country: frozen({ name: "Switzerland", country_code: "CH" }),
        place: frozen({ name: "Zürich" }),
      }),
    }),
    frozen({
      name: "Altstadt",
      mapbox_id: "sbx.fixture.zurich-old-town",
      feature_type: "place",
      address: "Altstadt",
      full_address: "Altstadt, Zürich, Switzerland",
      place_formatted: "Zürich, Switzerland",
      // Coordinate-shaped keys a live body might include — the mapper must drop them.
      longitude: 8.5417,
      latitude: 47.3769,
      coordinates: frozen({ longitude: 8.5417, latitude: 47.3769 }),
      context: frozen({
        country: frozen({ name: "Switzerland", country_code: "CH" }),
        place: frozen({ name: "Zürich" }),
      }),
    }),
  ]),
});

/** Search Box `/retrieve/{id}` FeatureCollection. */
export const FIXTURE_RETRIEVE_OK = frozen({
  type: "FeatureCollection",
  features: frozen([
    frozen({
      type: "Feature",
      geometry: frozen({
        type: "Point",
        coordinates: frozen([8.5402, 47.3782]) as [number, number],
      }),
      properties: frozen({
        name: "Zürich HB",
        mapbox_id: "sbx.fixture.zurich-hb",
        full_address: "Museumstrasse 1, 8001 Zürich, Switzerland",
        feature_type: "poi",
      }),
    }),
  ]),
});

/** Geocoding v6 `/reverse` FeatureCollection. */
export const FIXTURE_REVERSE_OK = frozen({
  type: "FeatureCollection",
  features: frozen([
    frozen({
      type: "Feature",
      geometry: frozen({
        type: "Point",
        coordinates: frozen([8.5417, 47.3769]) as [number, number],
      }),
      properties: frozen({
        name: "Museumstrasse 1",
        full_address: "Museumstrasse 1, 8001 Zürich, Switzerland",
        place_formatted: "Zürich, Switzerland",
        feature_type: "address",
      }),
    }),
  ]),
});

/** Reverse with nothing addressable. */
export const FIXTURE_REVERSE_EMPTY = frozen({
  type: "FeatureCollection",
  features: frozen([] as const),
});

/** Directions v5 `mapbox/driving` success. Distances are metres (fractional); durations seconds. */
export const FIXTURE_DIRECTIONS_OK = frozen({
  code: "Ok",
  routes: frozen([
    frozen({
      distance: 12345.9,
      duration: 1234.8,
      geometry: frozen({
        type: "LineString",
        coordinates: frozen([
          frozen([8.5402, 47.3782]) as [number, number],
          frozen([8.562, 47.45]) as [number, number],
        ]),
      }),
    }),
  ]),
});

/** Directions: upstream found no path. */
export const FIXTURE_DIRECTIONS_NO_ROUTE = frozen({
  code: "NoRoute",
  routes: frozen([] as const),
});

/** Directions: `Ok` but an empty routes array — still not a number we may invent. */
export const FIXTURE_DIRECTIONS_EMPTY_ROUTES = frozen({
  code: "Ok",
  routes: frozen([] as const),
});

/** Tilequery: a local path plus a valley road kilometres out (Zermatt → Täsch). */
export const FIXTURE_TILEQUERY_MAJOR = frozen({
  type: "FeatureCollection",
  features: frozen([
    frozen({
      type: "Feature",
      geometry: frozen({
        type: "Point",
        coordinates: frozen([7.7492, 46.0208]) as [number, number],
      }),
      properties: frozen({
        class: "path",
        tilequery: frozen({ distance: 80 }),
      }),
    }),
    frozen({
      type: "Feature",
      geometry: frozen({
        type: "Point",
        coordinates: frozen([7.7795, 46.0678]) as [number, number],
      }),
      properties: frozen({
        class: "secondary",
        tilequery: frozen({ distance: 5200 }),
      }),
    }),
  ]),
});

export const FIXTURE_TILEQUERY_EMPTY = frozen({
  type: "FeatureCollection",
  features: frozen([] as const),
});

/** Tilequery: only the car-free town's own streets — valley road is not in the nearest 10. */
export const FIXTURE_TILEQUERY_LOCAL = frozen({
  type: "FeatureCollection",
  features: frozen([
    frozen({
      type: "Feature",
      geometry: frozen({
        type: "Point",
        coordinates: frozen([7.7492, 46.0208]) as [number, number],
      }),
      properties: frozen({
        class: "street",
        tilequery: frozen({ distance: 40 }),
      }),
    }),
  ]),
});

/** Tilequery: a road next to the pin (connected town). */
export const FIXTURE_TILEQUERY_NEAR = frozen({
  type: "FeatureCollection",
  features: frozen([
    frozen({
      type: "Feature",
      geometry: frozen({
        type: "Point",
        coordinates: frozen([8.5417, 47.3769]) as [number, number],
      }),
      properties: frozen({
        class: "secondary",
        tilequery: frozen({ distance: 40 }),
      }),
    }),
  ]),
});

/** Generic 5xx JSON body. Must never be forwarded to a customer. */
export const FIXTURE_UPSTREAM_500 = frozen({
  message: "internal",
});
