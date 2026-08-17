# Legal page shell — shared template for five pages

**Surfaces:** `terms.dc.html` · `privacy.dc.html` · `cookies.dc.html` · `cancellation.dc.html` ·
`imprint.dc.html` · **Component:** `CookieBanner.dc.html`
**Position in site map:** footer → Legal cluster · cross-linked from checkout and confirmation
**Status:** built 4 Aug 2026 · structure final for review · **no binding legal wording written**

---

## 0. What this is, and what it deliberately is not

The client supplies every binding clause. This shell is structure, typography, navigation and
state — with three honest markers where content is missing:

| Marker | Looks like | Means |
|---|---|---|
| Token chip | `{TOKEN_NAME}` — yellow-50 fill, yellow-300 hairline, charcoal text | a number, date or name nobody has confirmed |
| Slot block | 1px dashed grey-300 on grey-50, uppercase caption | binding text only a lawyer writes; the caption says what it must cover |
| Decision flag | 1px charcoal card, uppercase kicker + `triangle-alert` / `info` | two archived sources contradict each other; the client picks |

Tokens are written with **single** braces, not `{{ }}`: double braces are the Design Component
template's own hole syntax and would render as nothing. In the Next.js port they become
`{{TOKEN}}` or a CMS field — one-to-one, same names.

The **review scaffold** — the charcoal “what this page still needs from you” panel, the decision
flags and the slot requirement lines — is not part of the published page. Every page carries
`showReviewScaffold` and `showSlotNotes` so a reviewer can see the shipping page in one click.
This follows the precedent from SPEC-home-services §2 (Koussay, 3 Aug): dev notices do not ship.

## 1. Source

The mounted Figma file `700 web` carries **no long-form legal or article layout** — 702 marketing
section frames, no policy page, no table of contents, no consent UI. Grep for `Privacy Policy`
returns footer links only. So the shell is authored from the Vamos system's own layout rules
rather than transcribed:

| Element | Source |
|---|---|
| 1200px container, `clamp(20px,5vw,56px)` gutter | design system §3 *Layout rules* |
| Sticky rail at `top:96px` | quote / checkout precedent, offset for the 76px charcoal header |
| Tier card rhythm (§ cancellation 01) | `700 web` /Main/43 — node **30:1653**: 3 equal columns, 16px check glyph on a 32px gutter, 16/24 body |
| Charcoal title band + checker corner mark | design system §3 *signature devices*, one mark per surface |
| 68ch measure | brief's 65–75ch, at `--vt-body-md` 16px/1.6 |

## 2. Geometry

| Element | Value |
|---|---|
| Grid | `264px + minmax(0,1fr)`, gap `clamp(40px,5vw,80px)` from 900px; single column below |
| Prose measure | `68ch` (≈ 640px at 16px Poppins) |
| Section rhythm | 36px padding, 1px `--vt-grey-200` rule between sections; first section has no rule |
| Heading ramp | h1 `--vt-display-2` · h2 `--vt-heading-1` 32px · h3 `--vt-heading-3` 20px · h4 13px uppercase label |
| Section number | 13px uppercase, own line above the h2, `--vt-charcoal-600` |
| Anchor offset | `scroll-margin-top:108px` (76px header + 32px) |
| Rail item | 2px inline-start border, 13px inset, 44px min hit height on mobile |
| Title band | 44px top / 40px bottom padding, checker mark 56px flush to the top-right corner |
| Cards | 16px radius, 1px `--vt-border-subtle`, `--vt-shadow-sm` — the system's default card |
| Slot / flag blocks | 12px and 16px radius, never a coloured left border |

## 3. Behaviour

- **Table of contents.** Literal markup, not generated — every label stays directly editable and
  paints with the first stream. Scroll-spy is one `IntersectionObserver` with
  `rootMargin:'-104px 0px -60% 0px'`; the topmost intersecting section wins, the active link takes
  `data-on` (charcoal text, yellow 2px border, charcoal number) and the rail auto-scrolls to keep
  it centred. Below 900px the rail collapses into a 44px “On this page” disclosure.
- **Print.** `window.print()` from the title band. Header, footer, rail, banner and closing block
  carry `data-lg-noprint`; the charcoal band inverts to white-on-black, tokens lose their fill so
  they photocopy, tables un-stack, `@page` margin 18mm. Terms and cancellation were the
  requirement; all five behave the same way because customers print whichever one is in dispute.
- **Consent.** `CookieBanner` is mounted once per page and owns the record
  (`localStorage.vamosCookieConsent` = `{necessary,functional,analytics,marketing,ts,v}`). Anything
  can reopen it by dispatching `window` event `vamos:cookie-prefs` — the footer link, the privacy
  page, the cookie page all do. Opt-in: everything except strictly necessary starts off.
- **Banner never covers the CTA.** It is fixed, so it reserves its own space —
  `document.body.style.paddingBottom` is set to 272px while the banner is visible below 640px,
  cleared the moment a choice is made. Desktop is a 452px card bottom-left, not a full-width bar,
  so the booking widget and the primary CTA stay clear.
- **Reduced motion.** `prefers-reduced-motion: reduce` kills every transition and the sheet
  entrance, globally, per page.

## 4. Accessibility

- One `h1` per page; h2 per section, h3/h4 inside. No skipped level.
- Rail is a `<nav aria-label="Sections">` **before** the article in DOM order — the reason the
  table of contents sits left rather than in quote/checkout's right rail.
- Focus is always visible: `:focus-visible` → 3px `rgb(253 194 11 / .45)`, 3px offset.
- Every control is ≥44px: TOC disclosure, print button, language segments, banner buttons,
  switch rows.
- Consent dialog is `role="dialog" aria-modal="true"`, focused on open, Escape closes, veil click
  closes, the necessary switch is `disabled` with a visible “always on” label rather than absent.
- Cookie tables are real `<table>` with `<caption>` and `th[scope=col]`; the mobile card form is
  CSS only, so the header text is still announced through `td[data-l]`.

## 5. Colour — measured, not assumed

Ratios computed against the WCAG 2.1 formula on the actual token values:

| Pair | Ratio | Verdict |
|---|---|---|
| `--vt-charcoal-900` #1E1F1F on white | **16.52:1** | AAA — headings, prose emphasis |
| `--vt-charcoal-600` #545756 on white | **7.31:1** | AAA — body prose, section numbers, labels |
| `--vt-grey-500` #767877 on white | **4.44:1** | ✗ fails AA for text under 18px |
| `--vt-grey-550` #6B6D6C on white | **5.21:1** | AA with margin — the new `--vt-text-muted` |
| `--vt-yellow-700` #A67B05 on white | **3.85:1** | ✗ normal text · ✓ large text and UI |
| #A67B05 on `--vt-yellow-50` #FFFBEE | **3.72:1** | ✗ — this was the first token-chip colour |
| `--vt-charcoal-900` on `--vt-yellow-50` | **15.96:1** | AAA — the chip colour shipped |
| `--vt-yellow` #FDC20B on `--vt-charcoal-900` | **10.15:1** | AAA — kickers on the title band, primary button label |
| white 66% on `--vt-charcoal-900` | **7.79:1** | AAA — `--vt-text-inverse-muted` |
| `--vt-yellow` on white | **1.63:1** | decorative only — the active-rail border, never a lone signal |

Two consequences, applied in all five pages and in `CookieBanner`:

1. `--vt-text-muted` is re-pointed at a **new** `--vt-grey-550` #6B6D6C. **One definition**, in
   `_ds/…/tokens/colors.css` beside the alias it replaces — not per page. Five per-page `:root`
   overrides would be five forks of the design system, eight after the next slice, and the
   Next.js port lands tokens in `globals.css` + `tailwind.config.ts` where a page-level override
   is silently dropped. `--vt-grey-500` itself is untouched and stays available for hairlines and
   disabled glyphs; only the *text* alias moved. **Push this to the source design system** — the
   bound copy under `_ds/` is overwritten by a re-sync.

   **Why not charcoal-600.** The obvious fix — point muted at charcoal-600, 7.30:1 — is wrong:
   `--vt-text-secondary` *is* charcoal-600, so muted and secondary would render identically and a
   two-step ramp would collapse to one. Home relies on that gap (row label in secondary, meta line
   beside it in muted); so do the vehicle cards and the suggestion lists. `grey-550` #6B6D6C clears
   AA at **5.21:1** while staying well clear of secondary's 7.31:1, and the move from #767877 is
   small enough that the four frozen screens (home, quote, checkout, ops) do not visibly shift.
   That margin is deliberate — the threshold value would sit near #717372 and leave nothing in
   hand for a future tint. Ratios here are recomputed against the live DOM, not asserted: an
   earlier draft of this table read 4.76:1, from raising the sRGB channel to 2.4 without first
   dividing by 1.055.

   Pages keep exactly one `:root` line of their own: the project-mandated
   `--vt-shadow-accent:none`, plus the three asset-base vars `Icon`/`Logo`/`CheckerMark` read.
2. Token chips and tier figures print charcoal on yellow-50, not yellow-700 — which is also what
   design system §3 says about yellow: charcoal on yellow, and yellow means action, not text.

No new colour was invented. No gradient, no coloured shadow, no glow (project rule).

## 6. Type, space, motion

- Qurova for h1–h3, section numbers, tokens and tier figures; Poppins for prose, labels, tables.
- Prose 16px/1.6 `--vt-charcoal-600`; small print 13px; nothing below 13px.
- 4px scale throughout; radii 4 chip · 8 rail item · 12 slot · 16 card · 24 sheet · pill controls.
- Motion: 140ms colour on hover, 200ms veil, 320ms sheet entrance, `translateY(1px)` on press.
  Nothing scales, nothing loops.

## 7. Component inventory

| Component | Where it comes from | Notes |
|---|---|---|
| `SiteHeader` `variant="inverse"` | existing project DC | 76px charcoal sticky bar; its DE/EN toggle drives the imprint's initial language. Nav collapses to a menu below 1140px — see `SPEC-imprint.md` §5 |
| `SiteFooter` | existing project DC | Legal column extended — see §8 |
| `CookieBanner` | **new**, this slice | banner + preferences dialog + consent record + reopen event |
| Legal title band | shell markup | breadcrumb, kicker, h1, standfirst, stamp row, print |
| Table of contents rail | shell markup | literal links + scroll-spy + mobile disclosure |
| Cross-link cluster | shell markup | five documents, `aria-current` on the open one |
| Section anchor | shell markup | numbered h2 with `id` and 108px scroll offset |
| Policy table | `<table data-ct>` | four columns; stacks to cards under 720px |
| Tier / comparison block | `<div data-tier>` ×3 | cancellation 01, prints three-up |
| Definition list | `<div data-dl>` | 230px label column from 620px, stacked below |
| Token chip · slot block · decision flag | shell markup | the three review markers |
| Last-updated stamp | shell markup | date + version + scope, one row |
| Review scaffold panel | shell markup | charcoal, per page, behind a tweak |
| `Alert` `Badge` `Button` `Icon` `Switch` | design system bundle | not re-implemented |

Deliberately **not** used: the design system `Table` (array props would make every cell
non-editable — these tables are content, not a dispatcher grid) and `Dialog` (the consent sheet
needs its own bottom-anchored geometry and a locked row).

## 8. Footer information architecture

Legal cluster now reads in the same order as the rail, so a customer never sees two orders:

| Column | Items |
|---|---|
| Company | About · Contact · **Become a partner** |
| Services | Airport transfers · City to city · Corporate transfers · Chauffeur by the hour |
| Support | FAQs · Manage a booking · Help |
| **Legal** | Terms & conditions · **Cancellation & refunds** · Privacy policy · **Cookie policy** · Imprint · **Cookie preferences** |
| Contact | Registered address · email · phone · Instagram · Facebook |

Four fixes against the archived footer: “Informations” is gone, “Data Protection” is called
Privacy policy, Cancellation and Cookies exist as pages instead of clauses buried in the terms,
and Become a partner has a home. Cookie preferences is a `<button>`, not a link — it opens the
dialog and is exempt from the footer's per-character hover animation.

## 9. Responsive

| Width | Layout |
|---|---|
| 360–619 | one column · TOC disclosure · tables as cards · tiers stacked · banner full-width sheet, body padded 272px |
| 620–719 | definition lists gain their 230px label column |
| 720–899 | tables become real tables; tiers go three-up at 640 |
| 900–1279 | rail appears and sticks at 96px |
| 1280+ | container caps at 1200px; measure stays 68ch — the rail takes the extra width, the prose does not |

Tablet note: 720–899 is the one band where a real four-column table sits under a stacked TOC.
It fits because the table's own columns are content-sized and the prose is capped at 68ch.

## 10. Tweaks

| Prop | Type | Default | Why |
|---|---|---|---|
| `showReviewScaffold` | boolean | `true` | one switch between the review artefact and the shipping page |
| `showSlotNotes` | boolean | `true` | keep the slot frames, drop the “must state…” briefing lines |
| `cookieState` | enum | `auto` | force the banner or the dialog open on any page, for review |
| `startLanguage` | enum | `de` | imprint only — `de` / `en` / `both` |

## 10a. Tokens and the i18n port

Tokens are written with **single** braces (`{FREE_CANCEL_WINDOW}`) because `{{ }}` is the Design
Component template's own hole syntax and would render as nothing. That is right for this engine and
wrong for the destination: in JSX, single braces are interpolation of a bare identifier, so a token
copied straight across either fails the build or silently resolves to something else.

So the swap target is decided now, not at port time: **every token maps 1:1 to an i18n key**, since
EN + DE is a launch requirement anyway and the intermediate step buys nothing.

```
legal.<page>.<camelKey>      page-owned value
legal.common.<camelKey>      value that appears on more than one page
```

Ten of the 73 are shared, and they are shared on purpose: a fact stated on two pages gets **one**
key. Per-page duplicates are exactly how the archived site ended up promising a full refund in the
FAQ and 75% in the terms. The complete table is §F of `LEGAL-PLACEHOLDER-CHECKLIST.md` — 73 tokens,
73 keys, each listed once, so the find-replace runs unattended.

Values are whole translated strings (`"60 minutes"` / `"60 Minuten"`), never a bare number with a
unit glued on in the template: German does not always put the unit where English does.

## 11. Next.js handoff

- One shared `app/(legal)/layout.tsx`: title band, rail, prose container, closing block. Each page
  is MDX or a CMS document; the rail is generated from its heading tree at build time — the
  literal-markup rule here exists because a Design Component streams, not because generation is
  wrong in Next.
- Scroll-spy: same `IntersectionObserver` margins, in a small `useActiveSection` hook.
- Print: move the `@media print` block into `globals.css` unchanged, keep `data-lg-noprint`.
- Consent: the record shape is already the contract. Read it in a `ConsentProvider`, gate the
  analytics and Sentry scripts on it, and mirror it server-side if the client wants a consent log
  (open question — see the checklist).
- shadcn/ui mapping: `Alert` → alert, `Badge` → badge, `Switch` → switch, the dialog → `Dialog`
  with `className` overriding the bottom anchor. Tables stay hand-written; do not reach for
  `DataTable`.
