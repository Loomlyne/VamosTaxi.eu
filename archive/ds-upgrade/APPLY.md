# Apply this upgrade to the Vamos Taxi design system

Everything in this folder is laid out **exactly as it should sit at the design-system
root**. Applying it is a copy, not a merge — no file in the system is deleted.

| From here | To the design system | Action |
|---|---|---|
| `app/` | `<ds-root>/app/` | **new folder** — 41 Design Components, the DC runtime, the i18n dictionary and the locale runtime |
| `assets/lenis.js` · `lenis.css` · `lenis-boot.js` | `<ds-root>/assets/` | **new** — the vendored smooth-scroll runtime |
| `assets/icons/*.svg` (9 files) | `<ds-root>/assets/icons/` | **new** — takes the glyph set from 49 to 58 |
| `tokens/laws.css` | `<ds-root>/tokens/` | **new** — the four house laws as a token layer |
| `guidelines/*.card.html` (6 files) | `<ds-root>/guidelines/` | 5 **new** specimen cards; `elevation.html` **replaces** the existing one, which still advertised the glow |
| `readme.md` | `<ds-root>/readme.md` | **replaces** — same guide, extended with §4.4 and §8–§11 |
| `SKILL.md` | `<ds-root>/SKILL.md` | **replaces** — non-negotiables now include the four new laws |
| `MIGRATION.md` | `<ds-root>/MIGRATION.md` | **new** — old `ui_kits/` screen → new Design Component |

`Design System Upgrade.dc.html` in the product project is the browsable index of all of
this. It is a review surface, not part of the package — do not copy it across.

## One edit after copying

`<ds-root>/styles.css` is an `@import`-only entry point. Add the new token layer as the
**last** import so it wins over the sheets it corrects:

```css
@import url("tokens/laws.css");
```

That single line is what turns off the yellow button glow, blocks the tinted-yellow
surfaces and drops the focus ring on text inputs system-wide. Until it is added, the
Design Components still behave (each one sets the same three values in its own `:root`),
but the older `.jsx` components and the `ui_kits/` pages do not.

## What does *not* change

- `components/core|forms|navigation|feedback|transfer|data/` — the `.jsx` primitives are
  untouched and still the base layer. The Design Components **compose** them; they do not
  replace them.
- `_ds_bundle.js` — no rebuild needed. The new files consume the bundle, they do not
  belong to it.
- `components/mobile/` — the Rolic kit is unaffected.
- `ui_kits/` and `templates/` — still valid. See `MIGRATION.md` for which screen is now
  superseded by which Design Component.

## Verify after applying

Open `<ds-root>/app/home.dc.html`. You should get the charcoal overlay header, the hero
photograph, the booking widget, and — with the language pill — the whole page relabelling
in place in German, French and Arabic without a reload.
