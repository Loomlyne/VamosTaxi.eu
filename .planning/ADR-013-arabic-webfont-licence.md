# ADR-013 — Self-host Noto Sans Arabic; delete the Google Fonts hotlink

**Status:** Accepted, 2026-08-20
**Phase:** 1 (Platform Foundation, Design System Port), Plan 05 — the pass that moves the whole
brand layer into `apps/web/public/brand/` and gives Arabic a typeface of its own instead of a
runtime CDN fetch.

## Context

**Neither vendored brand typeface has an Arabic glyph.** ADR-009 already established this:
Qurova (225 glyphs) and Poppins (1059 glyphs) are both pure Latin faces, verified from each
file's own `cmap` table. The brand has never had an Arabic display face — the Arabic surface has
only ever rendered in whatever face the browser or a runtime fallback happened to supply.

**What currently supplies that fallback is a data-protection problem, not just a gap.**
`app/vamos-locale.js:288–303` [VERIFIED this session]:

```javascript
if (RTL[state.lang]) {
  arabicFont();
  h.style.setProperty('--vt-font-body', "'Noto Sans Arabic','Poppins',system-ui,sans-serif");
  h.style.setProperty('--vt-font-display', "'Noto Sans Arabic','Qurova','Poppins',system-ui,sans-serif");
}
...
function arabicFont() {
  if (document.getElementById('vt-ar-font')) return;
  var l = document.createElement('link');
  l.id = 'vt-ar-font';
  l.rel = 'stylesheet';
  l.href = 'https://fonts.googleapis.com/css2?family=Noto+Sans+Arabic:wght@400;500;600;700&display=swap';
  document.head.appendChild(l);
}
```

Every time a visitor selects Arabic, the mock injects a `<link>` to `fonts.googleapis.com`. That
request discloses the visitor's IP address and user-agent to Google **before any consent
interaction**, and Google is not on this site's subprocessor list (ADR-010: Cloudflare, Supabase
eu-central Frankfurt, Stripe, Resend, Mapbox, AeroDataBox, Sentry). It also directly contradicts
D-31 — no third-party CDN script or asset origin in production, because the traveller this
product is built for is on airport wifi and a CDN dependency is itself a reliability risk, not
only a privacy one. This was first registered as **conflict C25** in ADR-009 and left there,
disposition OPEN, pending the code change tracked here.

**Note on scope:** `app/vamos-locale.js` is not edited by this ADR or by the plan it belongs to.
D-03 keeps the `.dc.html` mock tree untouched as the permanent visual source of truth; the mock
still carries the hotlink today, by design, and that is recorded here rather than silently
fixed. This ADR is about what `apps/web` — the production app — ships, which never reaches that
file.

**The Arabic face is chosen, not merely licensed.** D-22 amended after research delegates a pick
between two OFL candidates — Noto Sans Arabic and IBM Plex Sans Arabic — to whoever plans the
font task, on how each sits beside Poppins.

## Decision

**Self-host Noto Sans Arabic, four static weights (400/500/600/700), vendored directly from its
own upstream release — never through a webfont service.**

**Why Noto Sans Arabic over IBM Plex Sans Arabic:**

1. Its strokes are low-contrast and even, which sits beside Poppins' geometric evenness far
   better than IBM Plex Sans Arabic's more calligraphic stroke contrast — a mixed Latin/Arabic
   line (a CHF figure or a flight number inside an Arabic sentence, `.vt-dir-keep`) does not read
   as two competing weights.
2. It is the face the mocks already render via the Google Fonts hotlink being removed here. The
   Arabic screens the owner has already reviewed do not change appearance underneath a decision
   that was only ever about *where the file is served from*, not what it looks like.

**Provenance, read directly out of each vendored font file's own `name` table** — the same method
ADR-009 used for Qurova and Poppins, not a marketplace listing or an assumption from filenames:

`apps/web/public/brand/fonts/NotoSansArabic-{Regular,Medium,SemiBold,Bold}.ttf`:

- Family: `Noto Sans Arabic` (weight-specific subfamily names per the usual OFL static-font
  convention: `Noto Sans Arabic Med`, `Noto Sans Arabic SemBd` internally, full name `Noto Sans
  Arabic Medium` / `Noto Sans Arabic SemiBold`)
- Version: `2.013; ttfautohint (v1.8.4.16-eb64)` — hinted static build
- Copyright: `Copyright 2022 The Noto Project Authors (https://github.com/notofonts/arabic)`
- `LicenseDesc` (name ID 13): "This Font Software is licensed under the SIL Open Font License,
  Version 1.1…"
- `LicenseURL` (name ID 14): `https://openfontlicense.org`
- Glyph coverage: 1250 mapped codepoints per weight (Arabic script, Arabic-script punctuation,
  and enough Latin/digit coverage to render `.vt-dir-keep` figures if a component ever fell back
  to this face for them, which none does — Latin text stays in Qurova/Poppins).

**Upstream source, fetched directly, not through a webfont service:**

- Repository: `https://github.com/notofonts/arabic` (the Noto Project's own font-source
  repository — this single repository hosts the sources for both Noto Sans Arabic and Noto Naskh
  Arabic as separate GitHub Releases, keyed by tag)
- Release: `NotoSansArabic-v2.013`, published 2025-10-15, asset
  `https://github.com/notofonts/arabic/releases/download/NotoSansArabic-v2.013/NotoSansArabic-v2.013.zip`
  (18,777,381 bytes — verified against the GitHub Releases API's own recorded asset size before
  extraction)
- Files taken from the release archive's `NotoSansArabic/hinted/ttf/` directory (the hinted
  static build, matching the weight-specific-file shape Qurova and Poppins already use in this
  repo, rather than the variable-font build under `full/variable-ttf/`)
- The four static weights vendored are the same four the mocks' Google Fonts URL requested:
  `wght@400;500;600;700` → `Regular`, `Medium`, `SemiBold`, `Bold`

**Licence text vendored alongside the fonts, verbatim, unaltered:**
`apps/web/public/brand/fonts/OFL-NotoSansArabic.txt` — the exact `OFL.txt` shipped inside the
release zip (Copyright 2022 The Noto Project Authors, SIL OFL 1.1), with a short scope note
prepended (matching the precedent the existing shared `OFL.txt` already sets for the Qurova/
Poppins folder) stating this file covers only the `NotoSansArabic-*.ttf` files, not the other two
families sharing that folder. Kept as a **separate file** from `OFL.txt` rather than merged into
it, because the two licences have different copyright holders (The Noto Project Authors vs. The
Poppins Project Authors) and merging them would misstate which holder's grant covers which files.

**The token-swap mechanism D-22 asks for:** a single `--vt-font-arabic` token declared in
`apps/web/public/brand/tokens/arabic.css`, referenced by a `[dir="rtl"]`-scoped override of
`--vt-font-display` and `--vt-font-body` — the same swap `app/vamos-locale.js`'s `chrome()`
function already performs at runtime, reproduced as static CSS because `layout.tsx` already sets
`dir="rtl"` server-side and no client-side toggle is needed. No call site in any component or
page names "Noto Sans Arabic" directly; the designer's eventual pick replaces one token value.

**One shared token for both display and body in Arabic mode**, not a split
`--vt-font-arabic-display` / `--vt-font-arabic-body` pair — this matches what the mock runtime
already does (`chrome()` sets the same `'Noto Sans Arabic'` first-choice in both properties) and
answers RESEARCH's Open Question 2 for Phase 1. If the eventual designer pick turns out to want a
distinct Arabic display face, that is a second token added at that time, not a call-site rewrite.

**What is removed, not merely supplemented:** the Google Fonts `<link>` injection mechanism is
gone from the production app's dependency graph entirely — `apps/web` contains no code path that
can reach `fonts.googleapis.com` or `fonts.gstatic.com`. Loading `/ar` in a real browser makes
zero requests to any host other than the app's own origin.

## Consequences

**Cost of being wrong, per branch:**

- **Designer later supplies a different Arabic face.** Cheap — one token value changes in
  `arabic.css`, the new file(s) get vendored the same way, and this ADR's status moves to
  Superseded. No call site changes.
- **Traffic volume ever raises a question about Noto Sans Arabic's licence terms.** None exists —
  OFL 1.1 has no pageview cap, no field-of-use restriction, unlike Qurova's commercial Web Font
  tier (ADR-009). This branch carries no exposure.
- **The C25 hotlink removal is treated as done here without the mock itself changing.** Correct
  and intentional per D-03 — the mock stays as the permanent visual reference and continues to
  carry the hotlink; this ADR's scope is what ships in `apps/web`, not what the mock renders in a
  browser during design review. A future decision to also patch the mock (matching the pattern
  ADR-010's ADR set for other mock-copy corrections) is out of scope here.

**Subprocessor-list consequence this ADR removes:** with the hotlink gone from the production
app, `/ar` no longer discloses any visitor's IP or user-agent to Google. Google was never on
ADR-010's subprocessor list and does not need to be added to it — this ADR closes the gap rather
than requiring a new disclosure.

**Gate:** none — unlike ADR-009, there is no purchase or owner decision blocking this vendoring
step. OFL 1.1 carries no field-of-use restriction and no pageview cap. The only follow-up is
cosmetic: RESEARCH's backstop verification item (only a human eye settles whether Noto Sans
Arabic's optical weight sits comfortably beside Poppins at body size) and the eventual designer
pick this ADR is explicitly a stand-in for.
