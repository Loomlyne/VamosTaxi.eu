# Decision: download the four missing dashboard icons

Owner, question form, 2026-10-04 19:13 +0400. Answer: all three options (arrow-down, tag, sun + moon).

The icon audit (`fix/icon-audit`, quick 261004-icon-audit) found four icon names that dashboard screens ask for
with no file in `assets/icons/`, so they showed blank:

| Icon | Where |
|---|---|
| `arrow-down` | Support board column sort button (newest first) |
| `tag` | Pricing → Extras, "Extra name" field |
| `sun`, `moon` | Morning / Night fields in the nested vehicle form (looks unreachable under the "no cars" rule) |

The controller downloaded each from github.com/lucide-icons/lucide (main, `icons/<name>.svg`, ISC) and converted
it to the format of the other vendored icons (same geometry; the converter reproduces `map-pin.svg` and
`route.svg` byte for byte). Upstream sha256 prefixes: arrow-down 2b641c7a59d3, tag 85e11c07b29f,
sun a3955c8b0425, moon 205b959e940d.
