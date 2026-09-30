repo: lucide-icons/lucide
branch: main
path: icons

## Last sync

date: 2026-08-09T22:42:57Z

### Updated in this project

- Vendored eight more Lucide glyphs into `assets/icons/`, verbatim from `main` — `eye`,
  `eye-off`, `trash-2`, `grip-vertical`, `lock`, `upload`, `external-link`, `image` — for the
  new ops Reviews screen (publish toggle, drag handle, delete, photo upload, original link).
- Unrelated to GitHub but shipped this turn: review scaffolds deleted from all 12 product
  pages, the Services section now links the booking widget, and `app/vamos-reviews.js` +
  `app/ops-reviews.dc.html` added (dashboard-managed reviews).

## Sync history

### 2026-09-30 — Lenis removed

- `assets/lenis.js`, `assets/lenis.css` and `assets/lenis-boot.js` deleted, the `lenis` npm package removed from `apps/web`, and the design system's own `VamosScroll` removed from `design-system/_ds_bundle.js`. Scrolling is native (see `CLAUDE.md`, "Scrolling is native"). The older entries below are kept as provenance history.

### 2026-08-04T20:30:29Z — darkroomengineering/lenis@main

- Re-read `darkroomengineering/lenis` README (no-code setup, `data-lenis-prevent`, nested
  scroll) to confirm the vendored boot settings; no library upgrade (still 1.3.23).
- Wrapped `assets/lenis.js` in a load guard — several Design Components load it from their
  `<helmet>`, and a second evaluation threw `LINE_HEIGHT has already been declared`.
- Added the three Lenis files to the five surfaces that lacked them: `AuthForm`,
  `AuthStates`, `PhoneVerify`, `ResetForm`, `ops-login`. All 36 now load them.
- Unrelated to GitHub but shipped this turn: `app/vamos-locale.js` + `app/vamos-i18n-dict.js`,
  the platform-wide language/currency runtime (see `CLAUDE.md`).

## Sync history

### 2026-08-04T09:37:08Z — darkroomengineering/lenis@main

- Vendored **Lenis** smooth scroll into `assets/lenis.js` + `assets/lenis.css`.
- Added `assets/lenis-boot.js`: one instance per surface, brand motion settings
  (`lerp:.12`, native touch, anchors on, nested scroll allowed), reduced-motion aware.
- All 31 `app/*.dc.html` surfaces then loaded those three files from their `<helmet>`.

### 2026-08-04T01:00:30Z — lucide-icons/lucide@main

- Vendored six Lucide glyphs into `assets/icons/`, verbatim from source — `chevron-up`,
  `file-text`, `message-circle`, `circle-alert`, `loader-circle` from `main`.
- `youtube` came from tag **v0.263.1**: Lucide has since removed every brand icon from
  `main`, so `main` has no `youtube.svg`. The project's existing `facebook.svg` and
  `instagram.svg` are not Lucide at all — they are filled 22×22 brand glyphs from the
  Figma source, so the social row deliberately mixes two provenances.
- These join the 49-glyph Lucide subset the design system already vendors (guide §5),
  same 24×24 / 2px-stroke / round-cap set, rendered as CSS masks through `Icon`.

### 2026-08-04T20:30:29Z — darkroomengineering/lenis@main (details moved from Last sync)

- Re-read the Lenis README to confirm the vendored boot settings; no library upgrade (1.3.23).
- Wrapped `assets/lenis.js` in a load guard; added the three Lenis files to five surfaces.

## Screen map

| Screen | Taken from these repos |
|---|---|
| `app/faq.dc.html` | `chevron-up` (expand-all control), `file-text` (deference blocks) |
| `app/contact.dc.html` | `message-circle` (WhatsApp, live chat), `circle-alert` (field errors), `loader-circle` (sending state), `youtube` (social row) |
| `app/terms.dc.html`, `privacy`, `cookies`, `cancellation`, `imprint` | pre-existing Lucide subset only |

Note: only icon assets are imported from GitHub. Nothing else in the
project derives from those repos — the product source of truth is the Vamos Taxi design
system and the `docs/SPEC-*.md` set.
