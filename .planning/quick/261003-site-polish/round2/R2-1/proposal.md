# R2-1 — address suggestion list (From / To)

## What is wrong today
1. Icon is guessed from text: `geoHitIcon()` (home.dc.html ~684) tests name + address for "airport|flughafen|aeroport|zrh|gva|bsl" -> any hotel with "Airport" in its name or street gets the plane; everything else is a pin. The server sends only `mapbox_id, name, address, context` (`publicSuggestion`, apps/web/lib/geo/session.ts) -- no type, so the client cannot do better.
2. Every live hit is drawn as a boxed row with a black tile (`data-tone=geo`): the list reads as a stack of buttons, no hierarchy, no way to tell hotel from street.
3. No match highlight; sub line is the long `full_address` (truncated "Switzerla...").
4. Client re-sorts by name-prefix, so a street whose name starts with the query beats the airport/station Mapbox ranked first.
5. Keyboard-active row = pale grey only; ESC/arrow key hints show on touch screens.
6. Loading = one spinner line; no-results = nothing (list just closes); empty field = nothing (no Popular group exists in code; LOCS has 4 airports + HB to feed one).
7. Sheet (BookingSheet) rows are the same as desktop but without the group head, so the two lists drift.

## Proposal (one direction, both surfaces)
- Row: 56px, no outline, 12px radius, 36px tile (grey-100, charcoal glyph), name 500 with the typed part 700, sub 13px muted, kind label at the end (10px uppercase muted: AIRPORT / HOTEL / STATION / ADDRESS / CITY / PLACE). The label says in words what the glyph means (also helps colour-blind / small-glyph reading).
- Hover = grey-50 fill. Keyboard-active (`aria-selected=true`) = grey-100 fill + tile inverts to charcoal/white. No glow, no tint, no left accent.
- Sub line = `context` (Mapbox `place_formatted`: "8302 Kloten, Switzerland"); hotels/pois: street + locality (`Talstrasse 1, 8001 Zurich`). Falls back to `address`.
- Loading: 3 skeleton rows (grey-100 tile + two bars, pulse; static under reduced-motion).
- Empty result: tile with search icon, "No places found for "xyz"" + hint "Try the street and city, a hotel name or an airport code."
- Popular group (field focused and empty): ZRH T2, GVA, BSL, Zurich HB from existing `LOCS`. OPTIONAL: say no and it is dropped.
- Key hints footer only where `(hover:hover) and (pointer:fine)`.
- Drop the client name-prefix re-sort (keep Mapbox order) -- OPTIONAL, owner call.

## Icon by real field
Server adds `kind` to the public suggestion, derived in `mapSuggestion` from Search Box `feature_type`, `poi_category[]`, `poi_category_ids[]`, `maki` (same inputs `isAirportFeature` already trusts):

| kind | rule | icon |
|---|---|---|
| airport | `isAirportFeature(raw)` | plane |
| hotel | feature_type=poi and any poi_category/id contains hotel, lodging, motel, hostel, resort, guest house, bed and breakfast; or maki lodging | bed* |
| station | feature_type=poi and poi_category contains railway station / train station / rail; or maki rail, rail-metro, rail-light | train-front* |
| address | feature_type address or street | map-pin |
| place | feature_type place, locality, neighborhood, district, region, postcode, country | map* |
| poi | any other poi | map-pin |

Client: `icon = KIND_ICON[hit.kind]`; if `kind` is missing (old Worker, saved `LOCS`) fall back to `l.air ? 'plane' : l.icon`. `geoHitIcon()` text guessing is removed. LOCS: add `kind` to the 4 airports (airport), HB (station), Dolder/Baur (hotel), street rows (address), ski rows keep `snowflake`.

## Icons: missing in assets/icons/ (coder adds the real Lucide files, same 24px stroke 2 format)
- `bed.svg`
- `train-front.svg`
- `map.svg`
Present and used: `plane.svg`, `map-pin.svg`, `search.svg`. (The pictures use hand-copied path data from Lucide for the three missing ones.)

## Markup the coder applies (home.dc.html both `[data-sug]` lists, BookingSheet.dc.html both `[data-bs-sug]` lists)
Row (replace the inline-styled spans):
```
<div data-sug-row="1" data-kind="{{ s.kind }}" ... aria-selected="{{ s.sel }}" ...>
  <span data-sug-tile="1" aria-hidden="true"><Icon name="{{ s.icon }}" size=16/></span>
  <span data-sug-text="1" data-vt-no-i18n>
    <span data-sug-name="1">{{ s.pre }}<span data-sug-hit>{{ s.hit }}</span>{{ s.post }}</span>
    <span data-sug-sub="1">{{ s.sub }}</span>
  </span>
  <span data-sug-kind="1">{{ s.kindLabel }}</span>
</div>
```
`s.pre/hit/post` come from the same function the picture uses (`hl()` in proposal.js: accent- and case-insensitive, matches the start of each typed word). Remove `data-sug-go`. Names and addresses are data: keep `data-vt-no-i18n` on the text block (the sheet already has it; the desktop list does not). Skeleton and empty blocks: `[data-sug-skel]` x3 while `geo==='loading' && !items.length` (replaces the spinner line) and `[data-sug-empty]` when `geo==='ok' && typed && !items.length`. Both in the sheet too (the sheet shows nothing today when the list is empty). CSS = proposal.css verbatim (tokens only); BookingSheet keeps its own `[data-bs-sug]` flex column.

## New visible strings (4 languages) -> i18n.js in this folder
Airport, Hotel, Station, Address, City, Place, Popular, No places found for, hint line. "Search results" exists already (`results`). The empty-state title is a concatenation -> pattern entry.

## Files the coder touches
- apps/web/lib/geo/mapbox.ts (SuggestHit + mapSuggestion + kind derivation), apps/web/lib/geo/session.ts (publicSuggestion), their unit tests, any `/api/geo/suggest` contract test
- app/home/home.dc.html (+ twin check), app/home/BookingSheet.dc.html (+ twin app/pages if one exists), `hitsFor()` passes kind/pre/hit/post
- assets/icons/bed.svg, train-front.svg, map.svg (+ apps/web/public copy via sync script)
- app/vamos-i18n-dict.js (lead merges)
- design-system: none (local rules for list rows; no kit component exists for it)

## Risks
- Server change: `/api/geo/suggest` gains a field; the public-field whitelist test must be updated. No coordinates leak; no new Mapbox billing (fields already in the response).
- Worker/mock order: mock ships on the static site, Worker separately -- the client fallback keeps old Worker responses working (plane/pin as today).
- Laws: no glow, no yellow, tokens only, logical properties (kind label sits at inline-end; verified in Arabic), 4 languages. Touch: 56px rows.
- Behavioural: dropping the re-sort and the Popular group are product choices, shown but optional.

## Extra findings
- Desktop list (home.dc.html `[data-sug]`) has no `data-vt-no-i18n` on the name/sub spans: in Arabic the live runtime translates Mapbox names ("Zurich Airport (ZRH)" came out as an Arabic name in the picture run). The sheet already protects them. Fix is part of the markup above.
- RTL: Latin names/postcodes inside an Arabic page need `[dir=rtl] [data-sug-name],[data-sug-sub]{direction:ltr;text-align:end}` (in proposal.css) or the postcode jumps to the wrong end of "8302 Kloten".

## Recommendation
Single direction (no A/B): one neutral tile + kind label + bold match is the quietest list that still tells hotel from street; keep the black tile only for the keyboard-active row.

## Pictures (screens/)
R2-1-before-{en,ar}-{1440,1024,768,390}.png; R2-1-after-{en,ar}-{1440,1024,768,390}.png (1440 = desktop dropdown, 1024/768/390 = sheet).
States: R2-1-after-{hover-en-1440, active-{en,ar}-1440, active-{en,ar}-768, loading-en-{1440,390}, loading-ar-390, empty-{en,ar}-{1440,390}, popular-en-{1440,390}, popular-ar-390}.png
Re-run: ./runall2.sh (needs `python3 -m http.server 4797` in apps/web/public).
