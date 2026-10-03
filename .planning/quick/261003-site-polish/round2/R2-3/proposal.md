# R2-3 — "Where we drive" rows: hover, focus, press

## Root cause of rgb(166,123,5)
- #A67B05 is `--vt-yellow-700` (design-system/tokens/colors.css:27). `--vt-text-link-hover` is defined as that token (colors.css:71),
  and design-system/tokens/base.css:11 sets `a:hover{color:var(--vt-text-link-hover)}`.
- The row is an `<a>`. home.dc.html, FAQ, Services, Reviews, WhyVamos, CookieBanner... each carry their own `a:hover{color:var(--vt-text-link-hover)}` (specificity 0,1,1).
  WhereWeDrive's `[data-ww-row]{color:var(--vt-text-primary)}` is 0,1,0 and has no hover colour, so on hover the row text turns #A67B05.
  (Measured live: rest rgb(30,31,31), hover rgb(166,123,5).)
- laws.css does load (styles.css @imports it last) but is overridden: 62 of 63 DC files also link tokens/colors.css individually, and the runtime
  appends those `<link>`s after styles.css, so colors.css re-declares `--vt-yellow-700:#A67B05` on :root after laws.css aliased it to charcoal.
  Measured: `getComputedStyle(:root).getPropertyValue('--vt-yellow-700')` = #A67B05 on the served home page. So the law-02 alias is dead on every page
  that links the token files singly: every link hover, `--vt-yellow-600` (#D19C04) too.
- Fix for this component: every row state sets `color` explicitly with a (0,2,0) selector. Site-wide fix (separate job, needs owner OK): add
  `<link ... tokens/laws.css>` as the LAST link in each helmet, or drop the individual token links and keep styles.css only.

## A (recommended) / B
See proposal.css. A = charcoal fill, white text, yellow arrows, chevron slides 4px toward inline-end, tag flips to yellow-on-charcoal.
B = #FDC20B fill, charcoal text, chevron slides.
Both: rows get padding-inline 12px with matching negative margin so the text does not move and the fill has air; radius 12px (--vt-radius-md).

States (A / B):
- rest: as today (white/grey, hairline).
- hover (pointer devices only, `@media (hover:hover)`): fill, text colour, chevron nudge.
- focus-visible (keyboard): same fill as hover PLUS A: --vt-ring; B: 2px charcoal inset ring (yellow ring would vanish on yellow).
- press: translateY(1px) and one step darker fill (A: charcoal-800, B: --vt-accent-hover #EDB306).
- touch: no hover (hover:hover query keeps phones from sticking in the hover state after a tap). The tap shows the press state for the touch
  duration (fill + 1px), then the page scrolls to the booking card.
- RTL: arrow/chevron are already mirrored by `[dir=rtl] ... scaleX(-1)`; the nudge is -4px in RTL via `--ww-nudge`.
- Reduced motion: no transition, no nudge, no press translate.

Files the coder touches: app/home/WhereWeDrive.dc.html and the byte-identical twin app/pages/WhereWeDrive.dc.html (CSS only; no markup, no i18n).
React twin apps/web/components: check if a WhereWeDrive twin exists (grep) and mirror.
