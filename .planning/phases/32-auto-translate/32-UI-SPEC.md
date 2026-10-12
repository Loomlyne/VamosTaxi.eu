---
phase: 32
slug: auto-translate
status: approved
reviewed_at: 2026-10-12T15:52:44Z
shadcn_initialized: false
preset: none
created: 2026-10-12
---

# Phase 32 — UI Design Contract (Automatic translator)

> Visual and interaction contract. Locked choices: `32-CONTEXT.md` D-01..D-04 and F-01..F-07. Dashboard only: the machine mark never appears on a public page or in a customer e-mail (F-04). This phase adds **four dashboard surfaces**, **no new component file** and **no new design token**. Everything composes from the bound Vamos design system (`window.VamosTaxiDesignSystem_245af1`). No vendor or model name appears in any string, anywhere.
>
> Follows the house shape of `31-UI-SPEC.md`. Read order for the planner: Surfaces, Copywriting Contract, Signing.

## Open owner questions (pictures use the recommended answer)

| Q | Question | Recommended (used in the pictures) | Effect on this spec |
|---|----------|------------------------------------|---------------------|
| Q1 (CONTEXT Q1) | How do your replies reach the customer in their language? A keep your mail app: the dashboard puts the translated text into the mail it opens. B send from the dashboard. | A | Surface 4 is written for A. If B is signed, "Answer by e-mail" and the mail-app select are replaced by a SEND button; the reply box, "Send in" select and preview stay as drawn. B needs new sending infrastructure, which CONTEXT puts out of scope unless he says otherwise. |
| Q2 | A customer writes in a fifth language (Italian, Spanish…). What language does his reply go out in? | Reply in English | Pictures unaffected. "Send in" lists the four languages only and defaults to English when the customer's language is not one of them. The alternative (the machine writes the reply in that language too) is a later phase |
| Q3 | Reviews written in another language: translate them? | Show the original quote, no machine translation | Pictures unaffected. No review text is sent to the translator and no Machine mark appears near a review |
| Q4 | The 44 human Arabic strings that spell "Vamos Taxi" in Arabic letters | Change them to Latin by hand | Pictures unaffected. The machine always writes "Vamos Taxi" in Latin (D-14a), so the human strings are the only ones that disagree; the planner lists them by grep |

## Defaults taken (non-interactive run; change any on his word)

0. **Booking notes** (CONTEXT place map row 13) are translated and stored by the backend in this phase but get no new picture: the booking detail reuses the Surface 3 message layout (translation, "Translated from …", original under it) for the note, with the same strings. No new copy.

1. **Mark wording:** `Machine` (shown uppercase by the Badge component). DE `Maschinell`, FR `Automatique`, AR `آلي`. Only machine text carries a mark; his own text carries none (the quiet state is the default).
2. **Mark tone:** `Badge tone="outline"` (transparent, `--vt-border-subtle` hairline, `--vt-text-secondary`). Not `warning`, not `accent`, not a tint. Failed uses `tone="danger"`; locked uses `tone="neutral"` with the `lock` icon. Three tones, three meanings.
3. **Route and rail:** the rail item keeps its route `/pages` and key `pages`; only its label becomes "Translations". Legal keeps its route and stays "Coming soon" (unchanged).
4. **Filter set:** All / Machine / Yours / Failed. "Never translated" lines show only under All (no fifth filter).
5. **Layout switch at 1240 px** (the ops column-collapse width already in the rules): at 1240 and above a four-column table; below 1240 a two-column row list with language tabs (DE / FR / AR) choosing the second column; below 768 the rows stack. Filter control: segmented `Tabs` at 768 and above, `BrandSelect` below 768.
6. **Editor:** kit `Dialog size="lg"`, one SAVE TRANSLATIONS button for all three languages. A language becomes "his" only if its text changed. The English source is read-only here (page copy editing is deferred in CONTEXT).
7. **No "use machine text again" control.** A line he wrote stays his. Not in this phase.
8. **Default list order:** Failed lines first, then source order. Paging: 50 rows, then a ghost "Show more" button. Search runs on the server, 300 ms after he stops typing, over the English text and all three translations.
9. **Reply box (Q1 = A):** translation starts 800 ms after he stops typing, or on blur. "Answer by e-mail" is disabled only while a translation is running (20 s ceiling, then the failed state). The mail body is: translated text, a blank line, a line of 20 hyphens, a blank line, his original. No switch to leave the original out.
10. **Mail link length:** if the body would exceed 1,800 characters, the original below the divider is left out and a quiet note says so (never a silent cut).
11. **Dashboard language** = the language he has selected in the dashboard (`VamosLocale.lang()`, which is `staff.lang`). Language names in the UI come from `Intl.DisplayNames` in that language, so no per-language name table is needed beyond the column heads. `Intl` returns French names in lowercase ("allemand"), so one helper `langName(code, uiLang)` capitalises the first letter (`toLocaleUpperCase(uiLang)`) and every option label, "Translated from" line and preview label uses it.
12. **Staff messages and internal notes in the thread are not translated** (only customer messages).

---

## Design System

| Property | Value |
|----------|-------|
| Tool | none (shadcn not used; the bound Vamos design system is the only source of visual truth) |
| Preset | not applicable |
| Component library | Vamos design system bundle `window.VamosTaxiDesignSystem_245af1` (`design-system/_ds_bundle.js`), tokens `design-system/tokens/*.css`, `laws.css` last |
| Icon library | Vendored Lucide set through `Icon` only. New uses, all already vendored: `globe`, `lock`, `search`, `loader-circle`, `circle-alert`, `mail`, `info`. No hand-drawn SVG, emoji or arrow character as icon |
| Font | Poppins for every new element. Qurova only where the page header already uses it (the `h1`, unchanged style) |

Components used (all existing, none restyled; props checked against `design-system/_ds_bundle.js`):

| Component | Where | Props |
|-----------|-------|-------|
| `Badge` | Machine / Not translated / Never translated marks, in the table, the row list, the editor, the reply preview, the Pricing field | `tone="outline"` (machine), `tone="danger"` (not translated), `tone="neutral"` + `icon="lock"` (never translated). Uppercase by component. `tone="warning"` and `tone="accent"` are forbidden (law 02) |
| `Tabs` | Filter (≥768), language tabs (<1240) | `variant="segmented"` (default). `block` below 768 for the language tabs. `variant="underline"` is **not** used: its active mark is a yellow rule and this phase adds no yellow |
| `Table` | Translations list, ≥1240 only | `columns` with `render`, `onRowClick`, `rowKey="id"` |
| `Input` | Search | `size="md" icon="search"`, `aria-label` = placeholder |
| `Textarea` | Editor fields, reply box, reply preview | `label`, `hint`, `error`, `rows`, `disabled`. Textarea focus follows the page rule `.vt-input--focus{box-shadow:none}` (charcoal border only) |
| `Dialog` | Line editor | `size="lg"`, `title`, `subtitle`, `onClose`, `footer` (Close + Save translations) |
| `Alert` | Locked explanation, failed explanation, list error, save error, reply-failed note | `tone="info"` (explanations, reply-failed), `tone="danger"` (list error, save error). `tone="accent"` forbidden |
| `Button` | Save translations, Close, Show more, Try again, Clear filters, Translate again, Answer by e-mail | Save translations and Answer by e-mail: primary `md` (existing yellow, the only accent this phase adds). Close, Show more, Try again, Clear filters, Translate again: `variant="ghost"`, `md` (44 px) |
| `BrandSelect` (dc-import, existing) | Place filter, filter below 768, "Send in", mail app | `icon`, `options`, `a11y-label`, as in `OpsSupportTicket` |
| `Toast` | "Saved" after the editor saves | `tone="success"` (existing pattern in `OpsDetail`) |

Local layout rules (`[data-*]` only, tokens only, never a class; layout and things the kit has no component for):

| Attribute | Rule |
|-----------|------|
| `[data-tr-bar]` | flex, wrap, `align-items:center`, `gap:8px 16px`; search `flex:1 1 220px; min-width:0` |
| `[data-tr-wide]` / `[data-tr-narrow]` | `display:none` swapped at 1240 px (`@media (min-width:1240px)`). Wide holds the Table, narrow holds the row list and the language Tabs |
| `[data-tr-row]` (narrow list row) | a real `<button>` (`all:unset`, `box-sizing:border-box`, `inline-size:100%`), `display:grid`, `grid-template-columns:minmax(0,1fr) minmax(0,1fr)` at 768 and above, one column below; `gap:8px 16px`; `padding:12px 16px`; `min-block-size:68px`; `border:1px solid var(--vt-border-subtle)`; `border-radius:var(--vt-radius-lg)`; `background:var(--vt-bg-surface)`; hover `border-color:var(--vt-charcoal-900)`; `:focus-visible` `box-shadow:var(--vt-ring)`; rows separated by `gap:8px` in a flex column |
| `[data-tr-cell]` | `min-width:0`; text `overflow-wrap:anywhere`; clamp to 2 lines (`-webkit-line-clamp:2`) in the list, unclamped in the editor |
| `[data-tr-src]` | English text: `var(--vt-body-sm)`, `var(--vt-weight-semibold)`, `var(--vt-text-primary)` |
| `[data-tr-txt]` | translated text: `var(--vt-body-sm)`, regular, `var(--vt-text-primary)`; locked row: `var(--vt-text-muted)` |
| `[data-tr-meta]` | muted line under the source (the place) and the mark row; it also holds the Translating… line and the English-changed line (each with a 16 px `Icon`): `var(--vt-body-xs)`, `var(--vt-text-muted)`; flex, wrap, `gap:4px 8px`, `align-items:center` |
| `[data-tr-skel]` | skeleton row built from tokens: bars `block-size:12px; border-radius:var(--vt-radius-xs); background:var(--vt-grey-100)`; `opacity` pulse only under `prefers-reduced-motion:no-preference`; no gradient, no shimmer |
| `[data-tr-editor]` | editor body: flex column, `gap:16px`; `inline-size:min(720px, calc(100vw - 48px))`, and `min(100vw - 16px, 720px)` at 860 px and below; body `overflow:auto; overscroll-behavior:contain` |
| `[data-tr-field]` | one language field; wrapper `position:relative` |
| `[data-fld-mark]` | the mark slot on a field's label row: `position:absolute; inset-block-start:0; inset-inline-end:0`. Holds a Badge, or the Translating… line (16 px `loader-circle` + 13 px muted text, not a Badge). Used by the editor fields and by the Pricing extras fields |
| `[data-reply]` | the reply block inside `[data-ov-foot]`: flex column, `gap:8px` |
| `[data-reply-bar]` | "Send in" select row: flex, wrap, `align-items:center`, `gap:8px` |
| `[data-reply-preview]` | bordered block: `border:1px solid var(--vt-border-subtle)`; `border-radius:var(--vt-radius-md)`; `padding:8px 16px`; `background:var(--vt-bg-surface)`; flex column `gap:8px` |
| `[data-msg-tr]` / `[data-msg-orig]` / `[data-msg-from]` | thread message parts, see Surface 3 |

Kept from the page, untouched: `--vt-shadow-accent:none` in `:root` and `.vt-input--focus{box-shadow:none}` on every touched page (`OpsContent`, `OpsPricing`, `OpsSupportTicket`). No glow, no tinted shadow, no yellow surface anywhere in this phase.

---

## Spacing Scale

Declared values (all from `--vt-space-*`):

| Token | Value | Usage in this phase |
|-------|-------|---------------------|
| xs | 4px | Gap between a text line and its mark row; label-to-mark gap |
| sm | 8px | Row stack gap; gap inside the reply block; gap between Badge and meta text |
| md | 16px | Row and preview padding (horizontal; the preview's vertical padding is 8px); column gap in the row list; editor field gap; between toolbar items |
| lg | 24px | Gap between toolbar and list |
| xl | 32px | Page padding (existing header and body padding, unchanged) |
| 2xl | 48px | Empty and error state block padding |
| 3xl | 64px | Not used |

Exceptions:

- `12px` (`--vt-space-3`) only for the vertical padding of `[data-tr-row]` and `[data-tr-src-block]`, as in Phase 31. `[data-reply-preview]` uses `8px 16px` and `[data-reply-bar]` uses `gap:8px`, so the reply block needs no exception.
- Touch targets: `Tabs` tab height is 40 px in the kit. Below 1240 px the two `Tabs` rows get `min-block-size:44px` on `.vt-tab` through `[data-tr-tabs]` (a size rule, not a restyle). Every Button, select and list row is 44 px or taller. Small Badges are not interactive.
- The existing support-overlay rule `[data-ov-actions] .vt-btn{min-block-size:36px}` at 860 px and below is raised to `44px` in this phase because the footer now holds the reply controls (see Surface 4). The existing `[data-ov-foot]` padding and gap stay as they are.
- Support overlay footer at 860 px and below: `max-block-size:56%` of the dialog with `overflow-y:auto; overscroll-behavior:contain`, and `[data-thread]` keeps `min-block-size:160px` (was 240) so the thread and the reply box both fit at 390 x 844.

---

## Typography

Sizes in use (4) and weights (2), all existing tokens:

| Role | Size | Weight | Line height | Where |
|------|------|--------|-------------|-------|
| Body | 14px `--vt-body-sm` | 400 `--vt-weight-regular`; 600 `--vt-weight-semibold` for the English source cell | 1.6 `--vt-body-leading` | Cell text, message text, reply text, editor fields, hints |
| Small | 13px `--vt-body-xs` | 400 | 1.6 | Place line, "Translated from German", original text under a message, hints, preview notes |
| Empty/error title | 17px `--vt-heading-4` | 600, Qurova | 1.18 `--vt-heading-leading` | Title of the empty and error blocks (as "Coming soon" already does) |
| Heading | 26px `--vt-heading-2` | 600, Qurova | 1.18 `--vt-heading-leading` | Page `h1` (existing style) |

Component text from the kit (Button label, Tabs label, Dialog title, Alert title/body, Toast, Table head, and the Badge label at 11px `--vt-label-sm`, 600, uppercase) is not overridden and is not counted in the four sizes. One line-height exception: `[data-msg-tr]` keeps the existing bubble style (14px, line height 1.55, unchanged by this phase) instead of 1.6. Weights: regular 400 and semibold 600 only. Body copy never below 13 px. Sentence case everywhere except Badge, Button and table head, which the kit uppercases.

---

## Color

| Role | Value | Usage |
|------|-------|-------|
| Dominant (60%) | `--vt-bg-page` / `--vt-bg-surface` (white) | Console page, table, rows, dialog, reply preview |
| Secondary (30%) | Charcoal `#1E1F1F` text, `--vt-text-secondary`, `--vt-text-muted`; grey `#DEDEDE` hairline `--vt-border-subtle`; `--vt-grey-100` skeleton bars and the neutral Badge | Cell text, meta lines, borders, original text under a message |
| Accent (10%) | Yellow `#FDC20B` at full strength | Reserved for exactly two controls: SAVE TRANSLATIONS in the line editor, and the existing ANSWER BY E-MAIL button. These are the only yellow this phase adds (the Pricing dialog keeps its own existing primary button, unchanged) |
| Destructive / danger | `--vt-danger` via `Badge tone="danger"` and `Alert tone="danger"` | "Not translated" mark (the same badge on the Translations screen and on the Pricing extras fields), list load error, save error. No destructive action exists in this phase |
| Info | `Alert tone="info"` (`--vt-grey-50` with hairline) | Locked-line explanation, failed-language explanation, reply-failed note |

Accent reserved for: SAVE TRANSLATIONS (editor) and ANSWER BY E-MAIL (existing). The machine mark is **not** accent: it is a hairline outline badge, muted, so a page full of machine lines stays calm. No `--vt-yellow-50..300`, no `-600/-700` text, no `Alert tone="accent"`, no `Badge tone="warning"`, no tinted left-border card, no glow on hover, focus or press (colour step on the border, `translateY(1px)` on press, focus ring `--vt-ring`; text fields charcoal border only).

---

## Surfaces and states

**Focal points** (the first thing the eye lands on, per surface):

| Surface | Focal point | How |
|---------|-------------|-----|
| Translations list | The English source column | Semibold 600 `[data-tr-src]` against regular translated text; no other element is heavier or coloured |
| Line editor | SAVE TRANSLATIONS | The only yellow in the dialog |
| Pricing extras fields | The three name fields | Unchanged; marks are quiet outline badges |
| Ticket thread | The translated text | `[data-msg-tr]` at full text colour; the "Translated from" line and the original are muted |
| Reply | The preview block ("What the customer gets") | The only bordered block in the footer; the Machine badge sits on its header |

SAVE TRANSLATIONS and ANSWER BY E-MAIL are the only yellow elements this phase adds.

### 1. Content › Translations (`app/ops/OpsContent.dc.html`, `app/ops/OpsSidebar.dc.html`)

**Rail.** The Content group item `pages` is relabelled Translations (key `navTranslations`, see copy; icon stays `globe`). Legal is unchanged. `OpsContent` with `section="legal"` keeps the existing Coming soon block exactly. `section="pages"` renders the Translations screen. The `h1` is "Translations", the subtitle one line (copy table).

**Data the screen reads** (names for the planner; the API shape is the planner's): per line `{ id, place: site|email|extra, en, de, fr, ar, state: { de, fr, ar }, locked: null|legal|approved|name }` where each language state is `machine | yours | failed | missing | pending`, and a `yours` language can carry `stale: true` (English changed since he wrote it; see the English-changed rule below). `failed` = the machine answer failed its checks and the reader sees English (F-07). `missing` on a locked line shows the approved source (F-01) and is never filled. `pending` = a machine job is queued for that language (RESEARCH §E ii); the cell shows what it served so far (the previous machine text, or English) with a Translating… line.

**Toolbar `[data-tr-bar]`**, top to bottom on narrow, one row at 1240 and above:

1. Search `Input` (icon `search`), placeholder "Search a line".
2. Filter: segmented `Tabs` All / Machine / Yours / Failed, each label followed by its count in `<span class="vt-dir-keep">`. Below 768 the same four options in a `BrandSelect` (icon `funnel`).
3. Place `BrandSelect` (icon `globe`): All places / Site / E-mails / Extras.

Below 1240, a second row: language `Tabs` (German / French / Arabic), `block` below 768, default German. The selected language is also remembered for the session only.

**Wide layout (1240 and above):** kit `Table` with columns English, German, French, Arabic. Column widths: English 28 %, others 24 %. Cell contents:

- English cell: a real `<button>` (`all:unset`) holding `[data-tr-src]` (so the row is keyboard reachable), then `[data-tr-meta]` with the place ("Site", "E-mail", "Extra") and, for locked rows, the Never translated badge.
- Language cell: `[data-tr-txt]` (2-line clamp), then `[data-tr-meta]` with the mark when it applies: `Machine` badge (outline), `Not translated` badge (danger) with the line "Shows English" instead of text, the line "Translating…" (16 px `loader-circle`, 13 px muted, no animation under reduced motion) in place of the mark while a machine job is queued, or nothing (his own text). A `yours` cell with `stale` shows the English-changed line (16 px `info` icon + 13 px muted "English changed since your translation. Your text stays.") in `[data-tr-meta]`; his text is not touched. A locked row shows its language cells in `--vt-text-muted` with no machine mark.
- Whole row is clickable (`onRowClick`) and opens the editor.

**Narrow layout (below 1240):** `[data-tr-row]` buttons. Left column: English source, place line, locked badge. Right column: the selected language's text and its mark. Below 768 the two columns stack: source first, then a hairline-less gap of 8 px, then the selected language's text and mark.

**Bidi and translation rules on every cell** (critical, the runtime would otherwise relabel them):

- Every line text (`en`, `de`, `fr`, `ar`) sits in an element with `data-vt-no-i18n` and `translate="no"`, so the dictionary runtime never translates the English source into the dashboard language.
- Each text element carries its own `lang` and `dir`: `en`/`de`/`fr` `dir="ltr"`, `ar` `dir="rtl"`; `text-align:start`. This is content direction, not document direction; the document `dir` is still set only by the runtime.
- Placeholders inside text (`{a}`, `%n`, `%s`, `VT-4821`, `CHF 000`, `ZRH`) are wrapped in `<bdi class="vt-dir-keep">`.

**Editor (`Dialog size="lg"`, opened by row click, Enter on the focused English button, or Enter/Space on a narrow row).** Title "Edit translations", subtitle = the place. Body `[data-tr-editor]`, top to bottom:

1. English (read-only): label "English (source)", the text in a bordered block (`[data-tr-src-block]`, `border:1px solid var(--vt-border-subtle)`, radius `--vt-radius-md`, padding 12/16, body-sm), `lang="en" dir="ltr"`.
2. Three `Textarea` fields `[data-tr-field="de|fr|ar"]`, labelled German / French / Arabic, `rows` = 3 (5 for lines over 160 characters). Arabic textarea carries `dir="rtl" lang="ar"`; the others `dir="ltr"`. The mark sits in `[data-fld-mark]` on the label row.
3. Footer: Close (ghost, md), Save translations (primary, md).

Field state matrix:

| State | Mark (`[data-fld-mark]`) | Hint under field | Notes |
|-------|--------------------------|------------------|-------|
| Machine text, untouched | `Machine` outline badge | "Machine text. Edit it if you like." | Editable |
| Machine text, being edited | badge disappears **as soon as the value differs from the stored machine text** (if he types it back to equal the stored text, the badge returns) | "Your text. The machine won’t change it." | Counts as dirty |
| His own text, stored | none | "Your text. The machine won’t change it." | Editable |
| Failed (shows English) | `Not translated` danger badge | `Alert tone="info"` above the field: "The machine answer failed its checks, so the site shows the English text until you write this line." | Field starts empty |
| Translating (machine job queued) | the Translating… line in `[data-fld-mark]` (not a Badge) | none | Shows the text served so far; editable. If he changes and saves it, his text wins and the queued job is dropped (human over machine) |
| His text, English changed since | none | the English-changed line (`info` icon, 13 px muted): "English changed since your translation. Your text stays." | Editable; his text is kept, never overwritten. The line clears when he saves a change to that language |
| Missing on a locked line | none | none | Read-only (below) |
| Placeholder mismatch | none changes | `error` prop: "Keep these exactly as in English: %s" (list in `vt-dir-keep`) | Save blocked while any field has an error |
| Empty after edit | none changes | `error`: "This line can't be empty." | Save blocked. There is no way to clear a line back to the machine in this phase |

Editor states:

| State | What it shows |
|-------|---------------|
| Open, clean | Save translations disabled (`disabled`), Close enabled |
| Dirty | Save translations enabled. Closing (scrim, Esc, Close) with unsaved changes shows the same inline "Keep editing / Discard changes" row the `OpsTable` editor already uses, with copy from the table below. This row is the only guard against losing edits |
| Saving | Every field and Close disabled, Save translations disabled with label "Saving…" and `loader-circle` icon. No spinner animation under `prefers-reduced-motion:reduce` |
| Saved | Dialog closes, the row updates in place (the saved languages lose their `Machine` mark), a `Toast tone="success"` "Saved" shows for 4 s. Focus returns to the row's English button |
| Save failed | `Alert tone="danger"` at the top of the editor body: "Couldn’t save. Try again." Fields keep what he typed; Save translations re-enabled |
| Locked line | Fields are not textareas: three read-only blocks (same look as the English block, text `--vt-text-muted`) with the language labels. At the top `Alert tone="info"` with the reason (legal / approved / name, copy table). No Save translations; the footer holds the same ghost Close button. A language that is missing shows the English text in its block, muted, with the line "Shows English" |
| Source line vanished (deleted between list and save) | Save failed state with the same copy. No new string |

**List states** (all inside the list area, under the toolbar):

| State | Condition | What shows |
|-------|-----------|------------|
| Loading | first load, or a filter/language change with no cached page | 8 `[data-tr-skel]` rows (wide: table-shaped; narrow: row-shaped). Toolbar stays live. `aria-busy="true"` on the list |
| Refetching | search or filter change with rows already shown | Current rows stay, `opacity` 0.56, `aria-busy="true"`; no skeleton |
| Default | rows loaded | Rows as above. If more than 50 match, a ghost "Show more" button under the list (44 px, inline-start aligned) |
| Translating (after a save or a new source line) | one or more visible cells are `pending` | Those cells show their Translating… line; the rest of the list is unchanged and stays clickable. The list re-reads the visible page at most 5 times, 2 s apart; after that the line is dropped and the cell shows what it served (text, or "Shows English"); a reload picks up the finished text |
| Empty, nothing at all | zero lines in the store | Centred block: title "No lines yet", body "Lines appear here once the site and e-mails have text to translate." |
| Empty, filter has none | Failed / Yours / Machine tab with zero rows, no search | Failed: "Nothing failed" / "Every line has a translation." Yours: "Nothing of yours yet" / "Lines you write yourself appear here." Machine: "No machine lines" / "Every line is yours or never translated." |
| Empty, no match | search or place filter returns zero | Title "No lines match", body "Try another word or clear the filters." and a ghost Button "Clear filters" |
| Error | request failed | `Alert tone="danger"` "Couldn’t load translations. Try again." and a ghost Button "Try again". Toolbar stays. The previously shown rows (if any) stay visible below the Alert |

Empty and error blocks use the page's existing empty block look (`[data-empty]` pattern: centred, `gap:8px`, `padding:48px 32px`, title 17px `--vt-heading-4`, weight 600, Qurova, as `OpsContent` "Coming soon" already does).

**Responsive**

| Width | Contract |
|-------|----------|
| 1440 | Sidebar 236 + content. Toolbar on one row (search, filter Tabs, place select). Four-column table. Editor 720 px wide |
| 1024 | Narrow layout: toolbar wraps to two rows (search + place on row 1 if width allows, filter Tabs next), language Tabs below, two-column rows. Editor 720 px |
| 768 | Same as 1024; filter Tabs still segmented; language Tabs `block`. Rows keep two columns |
| 390 | Filter in a `BrandSelect`, place `BrandSelect` next to or under it, language Tabs `block`. Rows stack (source, then selected language). Editor is `min(100vw - 16px, 720px)`, body scrolls inside, footer buttons stay visible, 44 px. No sideways scroll, no clipped text (long German/Arabic wrap with `overflow-wrap:anywhere`) |

**RTL (Arabic dashboard)**

- Logical properties only: `inset-inline-end` for `[data-fld-mark]`, `margin-inline-*`, `text-align:start`, `border-inline-*`. Table columns reverse by direction: English at the inline start (right), then German, French, Arabic leftwards.
- English, German and French line text stay `dir="ltr"` inside the RTL page and align to the cell's inline start with `text-align:start` read from their own `dir`; Arabic line text is `dir="rtl"`. In an English dashboard the Arabic cell text is RTL and right-aligned inside its cell.
- Counts in tab labels, place codes and placeholders in `vt-dir-keep`.
- The `chevron`/`arrow` icons are not used on this screen, so no mirror rule is added.

### 2. Pricing › Surcharges & extras, name fields (`app/ops/OpsPricing.dc.html`, field spec in `surchargeFields`, rendering in `app/ops/OpsTable.dc.html`)

Minimal change. The three fields `labelDe`, `labelFr`, `labelAr` keep their label, `globe` icon and place in the form. Two things change:

1. A field spec option `mark` (`machine | failed | translating | null` per field) makes `OpsTable` render in `[data-fld-mark]` on that field's label row: the `Machine` outline `Badge` when the field's value equals the stored machine value (the `extra_labels.machine_langs` rule); the danger `Not translated` badge (the same badge, tone and word as the Translations screen) when the machine answer failed; the Translating… line while a machine job is queued. The Machine mark turns off the moment he types something different, before saving, and back on if he types the stored machine text again.
2. The hint under each field is state-specific (the one shared `extraTranslated` hint is replaced):

| State | Mark | Hint |
|-------|------|------|
| New extra, not saved yet | none | "Filled in by the machine when you save." |
| Saved, translating (new extra, or English renamed) | Translating… line (not a Badge) | none. The field shows the previous machine text, or stays empty for a new extra, and is editable; if he writes in it, his text wins and the queued job is dropped. The form re-reads the extras at most 5 times, 2 s apart; after that the field shows the "No translation yet" row below until he reopens it |
| Saved, machine text | `Machine` | "Machine translation. Edit it if needed." |
| He typed or edited it | none | "Your text. The machine won’t change it." |
| Saved, translation failed (field empty) | `Not translated` danger badge (same as the Translations screen) | "No translation yet. Customers see the English name." |
| He wrote it, English name changed since | none | "English changed since your translation. Your text stays." (`info` icon, 13 px muted). His text is kept, never overwritten; the line clears when he saves a change to that field |

The English `name` field is unchanged. Renaming the English name re-translates only the machine languages (existing rule D-44, now one translator); a language he wrote keeps its text and has no mark. The mark never appears in the Pricing table column (`surchargeColumns`), which keeps showing the language's name as today. The dialog's width, field order and 44 px controls are unchanged.

RTL and 390: the badge uses `inset-inline-end:0` on the label row, so in Arabic it sits at the left end. At 390 the label row is `padding-inline-end` wide enough for the badge (`Automatique` in French is the longest) so the label never overlaps it.

### 3. Support ticket thread: customer messages in another language (`app/ops/OpsSupportTicket.dc.html`)

Applies to bubbles with `data-from="customer"` only. The server returns per message: detected language, translated text, status `ready | pending | failed | same`.

Bubble structure (replaces the single `<p>` when status is not `same`):

```
chips row (who, when)                       unchanged
[data-msg-tr]    translated text           14 px, dir from the dashboard language
[data-msg-from]  globe(16) + "Translated from German"     13 px, --vt-text-muted
[data-msg-orig]  original text             13 px, --vt-text-muted, own lang and dir
files                                       unchanged
```

- `[data-msg-tr]` is the existing `<p data-vt-no-i18n>` bubble style (14 px, 1.55 line height, `white-space:pre-wrap`), unchanged: it is the one place that keeps 1.55 instead of the 1.6 body leading.
- `[data-msg-from]` sits `margin-block-start:8px`, flex, `gap:4px`, `align-items:center`; the language name is produced by `Intl.DisplayNames` in the dashboard language through `langName()` (first letter capitalised, so French reads "Allemand", not "allemand") and sits in `data-vt-no-i18n`. If the code is unknown to `Intl`, the line reads "Translated" with no language.
- `[data-msg-orig]` sits under a hairline (`border-block-start:1px solid var(--vt-border-subtle)`, `margin-block-start:8px`, `padding-block-start:8px`), 13 px, `--vt-text-muted`, `white-space:pre-wrap`, with `lang="<detected>"` and `dir="rtl"` for Arabic (and other RTL codes) or `ltr`, `text-align:start`, `unicode-bidi:plaintext`. An Arabic original inside an English dashboard therefore reads right to left, right-aligned in the bubble; a German original inside an Arabic dashboard reads left to right, left-aligned.
- Colour: the translation keeps the bubble's text colour; the line and the original use `--vt-text-muted`. Customer bubbles are white, so contrast is unchanged from the existing meta text.

State table:

| State | Condition | Bubble shows |
|-------|-----------|--------------|
| Same language | detected language equals the dashboard language, or detection says unknown | Today's bubble, nothing added |
| Translated | status `ready`, language differs | Translation, "Translated from {language}", original underneath |
| Pending | status `pending` (message just arrived, queue has not answered) | Original text in the normal body position, and one quiet line "Translating…" (13 px muted, `loader-circle` 16 px, no animation under reduced motion). The overlay re-reads the thread at most 5 times, 2 s apart; after that the line becomes "Translation not available" until he reopens the ticket |
| Failed | status `failed` | Original text in the normal body position and the quiet line "Translation not available". No colour, no Alert, no retry control in the thread |
| Staff bubble | `data-from="staff"` | Unchanged (not translated) |
| Internal note | `data-from="note"` | Unchanged |

Board cards and the table view keep showing the original message preview as today. The `colLocale` chip keeps showing the customer's locale code.

Responsive: the bubble keeps `max-width:88%`; the three parts stack, so nothing changes at 768 or 390. German and Arabic wrap. RTL: the `globe` icon sits before the text on the inline start via flex order, no `left`/`right`.

### 4. Support ticket: his reply in the customer's language (`app/ops/OpsSupportTicket.dc.html`, inside `[data-ov-foot]`)

Shown only when the ticket is open (`canReply`). The existing read-only hint `mailHint` is replaced by the reply hint below. Order inside `[data-ov-foot]`, top to bottom: existing save-error line, `[data-reply]`, `[data-ov-actions]` (unchanged slots).

`[data-reply]`:

1. `Textarea` `[data-reply-text]`, label "Your reply" (the existing rule hides `.vt-field__label` at 860 px and below, so the Textarea also gets `aria-label` = the label and a placeholder), `rows` 3 (2 at 860 and below), placeholder "Write in your language.", `dir` follows the document.
2. `[data-reply-bar]`: `BrandSelect` `[data-reply-lang]` (icon `globe`, a11y label "Send in"), options German / English / French / Arabic (names through `langName()`, first letter capitalised in French) with the customer's language suffixed ("German · customer"). **Default = the customer's language** (ticket locale; "English" if unknown). It is a live control: changing it re-runs the translation to the new target. Beside it, the hint line (13 px muted).
3. `[data-reply-preview]` (appears only when there is text to show): header row = label "What the customer gets (German)" + `Machine` outline badge in `[data-reply-mark]`; then a `Textarea` `[data-reply-out]` (`rows` 3, 2 at 860 and below) with `dir="rtl"` and `lang="ar"` when the target is Arabic, else `ltr`. Editable.
4. `[data-reply-note]` for the failed and too-long notes.
5. Actions row (existing): Close ticket, Reopen (closed), mail app select, ANSWER BY E-MAIL (primary, mail icon, 44 px at every width).

State table:

| State | Condition | What shows |
|-------|-----------|------------|
| Empty | reply text empty | Textarea + select + hint; no preview. ANSWER BY E-MAIL **enabled** and opens a blank reply to the customer exactly as today |
| Same language | target language equals his dashboard language, or the customer's language is unknown and target is English while he writes English | No preview, no mark. Hint is the shorter "The button opens a reply in your mail app." ANSWER BY E-MAIL sends his text as written |
| Translating | text present, request running | Preview block shown with label and a `[data-tr-skel]` bar (first request) or the previous text at `opacity` 0.56 (later requests); header carries the line "Translating…" in place of the badge; ANSWER BY E-MAIL **disabled** (`disabled`, 20 s ceiling, then Failed) |
| Ready | machine answer back | Preview filled, `Machine` badge, hint under it empty. ANSWER BY E-MAIL enabled; the mail body is preview text, blank line, 20 hyphens, blank line, his original |
| Edited | he typed in the preview | `Machine` badge disappears; hint "Your edit. It stays as written." While in this state, further typing in his own text does not overwrite the preview; a ghost "Translate again" Button (`variant="ghost"`, md, 44 px) appears next to the hint to replace the preview with a fresh machine version |
| Failed | request failed, timed out, or the answer failed its checks | Preview block is replaced by `[data-reply-note]` = `Alert tone="info"` "No translation. The e-mail will contain your text as written." with a ghost "Try again" Button (`variant="ghost"`). ANSWER BY E-MAIL **enabled**; it sends his text as written, no divider |
| Too long | mail body over 1,800 characters | Mail is built without the original below the divider; quiet note (13 px muted) "Your original text was left out: it is too long for your mail app link." |
| Closed ticket | `isClosed` | Whole reply block hidden; the existing `closedBody` line and Reopen button show as today |
| Changing "Send in" | any state with text | Re-translates to the new target; an edited preview is dropped after the select changes (the new language is a different text) |

"Answer by e-mail" keeps both paths (`mailto` and Gmail, per the mail-app select). The link is built by the server for this ticket only (`tickets-map.ts`): the planner adds the body to that builder; the page never builds a recipient.

Responsive: at 1440 and 1024 the footer sits under the thread inside `[data-ov-chat]`. At 768 and 390 the dialog stacks meta over chat (existing); the footer is `max-block-size:56%` and scrolls inside; labels are hidden (aria-label and placeholder carry them); `BrandSelect` and Buttons are 44 px; the actions row wraps with ANSWER BY E-MAIL last and full width at 390 (`block`). No sideways scroll.

RTL: the preview Textarea direction follows the target language, never the page (Arabic preview RTL inside an English dashboard, German preview LTR inside an Arabic dashboard); the mark and select follow the inline start/end of the page.

---

## Copywriting Contract

Rows marked (existing) reuse the entry already in `app/vamos-i18n-dict.js` verbatim (checked 2026-10-12); the dictionary is keyed by English text, so one English text has one translation everywhere. Swiss German uses "ss", never ß. Formal address in German (Sie) and French (vous), as the dashboard tables already do. Ops copy is neutral and literal; no vendor or model name; "machine" is the only word for the engine. Badge, Button and Tabs labels are written in sentence case here and uppercased by the component.

| Element | Copy |
|---------|------|
| Primary CTA (editor) | Save translations (SAVE TRANSLATIONS) |
| Primary CTA (ticket, existing) | Answer by e-mail (ANSWER BY E-MAIL) |
| Empty state | "No lines yet" / "Lines appear here once the site and e-mails have text to translate." |
| Error state | "Couldn’t load translations. Try again." (danger Alert + Try again) |
| Destructive confirmation | none in this phase (no delete, no destructive action). The editor's dirty-close row asks "Discard your changes?" with Keep editing / Discard changes |

### Translations screen and editor (page `T` tables in `OpsContent.dc.html`, and `app/vamos-i18n-dict.js` `strings`; the two must match character for character)

| Key (T) | EN | DE | FR | AR |
|---------|----|----|----|----|
| navTranslations (rail + h1) | Translations | Übersetzungen | Traductions | الترجمات |
| translationsSub | Every line on the site and in e-mails, in four languages | Jede Zeile der Website und der E-Mails in vier Sprachen | Chaque ligne du site et des e-mails, en quatre langues | كل سطر في الموقع وفي رسائل البريد، بأربع لغات |
| searchPh | Search a line | Zeile suchen | Rechercher une ligne | ابحث عن سطر |
| fAll (existing) | All | Alle | Tous | الكل |
| fMachine (same entry as markMachine) | Machine | Maschinell | Automatique | آلي |
| fYours | Yours | Von Ihnen | Les vôtres | من كتابتك |
| fFailed (existing) | Failed | Fehlgeschlagen | Échoué | فشل |
| filterLabel (a11y, existing) | Filter | Filter | Filtre | تصفية |
| placeLabel (a11y, existing) | Where | Wo | Où | أين |
| placeAll | All places | Alle Bereiche | Tous les endroits | كل المواضع |
| placeSite | Site | Website | Site | الموقع |
| placeEmail | E-mails | E-Mails | E-mails | رسائل البريد |
| placeExtra (existing) | Extras | Zusätze | Options | إضافات |
| placeOneSite | Site | Website | Site | الموقع |
| placeOneEmail | E-mail | E-Mail | E-mail | بريد إلكتروني |
| placeOneExtra | Extra | Zusatz | Option | إضافة |
| colEn | English | Englisch | Anglais | الإنجليزية |
| colDe | German | Deutsch | Allemand | الألمانية |
| colFr | French | Französisch | Français | الفرنسية |
| colAr | Arabic | Arabisch | Arabe | العربية |
| langTabs (a11y, existing) | Language | Sprache | Langue | اللغة |
| markMachine (Badge) | Machine | Maschinell | Automatique | آلي |
| markFailed (Badge) | Not translated | Nicht übersetzt | Non traduit | غير مترجم |
| markLocked (Badge) | Never translated | Nie übersetzt | Jamais traduit | لا تُترجم أبدًا |
| shownEnglish | Shows English | Zeigt Englisch | Affiche l’anglais | يعرض الإنجليزية |
| translating (same entry as the ticket and Pricing tables) | Translating… | Wird übersetzt … | Traduction en cours… | جارٍ الترجمة… |
| englishChanged (cell line, editor hint; same entry on the Pricing page) | English changed since your translation. Your text stays. | Das Englische hat sich seit Ihrer Übersetzung geändert. Ihr Text bleibt, wie er ist. | L’anglais a changé depuis votre traduction. Votre texte reste tel quel. | تغيّر النص الإنجليزي منذ ترجمتك. يبقى نصّك كما هو. |
| showMore | Show more | Mehr anzeigen | Afficher plus | عرض المزيد |
| clearFilters (existing) | Clear filters | Filter zurücksetzen | Effacer les filtres | مسح عوامل التصفية |
| tryAgain (existing) | Try again | Erneut versuchen | Réessayer | أعد المحاولة |
| emptyAllTitle | No lines yet | Noch keine Zeilen | Aucune ligne pour l’instant | لا توجد أسطر بعد |
| emptyAllBody | Lines appear here once the site and e-mails have text to translate. | Zeilen erscheinen hier, sobald die Website und die E-Mails Text zum Übersetzen haben. | Les lignes apparaissent ici dès que le site et les e-mails ont du texte à traduire. | تظهر الأسطر هنا بمجرد أن يكون للموقع والرسائل نص للترجمة. |
| emptyFailedTitle | Nothing failed | Nichts fehlgeschlagen | Aucun échec | لا شيء فاشل |
| emptyFailedBody | Every line has a translation. | Jede Zeile hat eine Übersetzung. | Chaque ligne a une traduction. | لكل سطر ترجمة. |
| emptyYoursTitle | Nothing of yours yet | Noch nichts von Ihnen | Aucune ligne écrite par vous pour l’instant | لا شيء من كتابتك بعد |
| emptyYoursBody | Lines you write yourself appear here. | Zeilen, die Sie selbst schreiben, erscheinen hier. | Les lignes que vous écrivez vous-même apparaissent ici. | تظهر هنا الأسطر التي تكتبها بنفسك. |
| emptyMachineTitle | No machine lines | Keine maschinellen Zeilen | Aucune ligne automatique | لا توجد أسطر آلية |
| emptyMachineBody | Every line is yours or never translated. | Jede Zeile stammt von Ihnen oder wird nie übersetzt. | Chaque ligne est de vous ou n’est jamais traduite. | كل سطر من كتابتك أو لا يُترجم أبدًا. |
| noMatchTitle | No lines match | Keine passenden Zeilen | Aucune ligne ne correspond | لا توجد أسطر مطابقة |
| noMatchBody | Try another word or clear the filters. | Versuchen Sie ein anderes Wort oder setzen Sie die Filter zurück. | Essayez un autre mot ou effacez les filtres. | جرّب كلمة أخرى أو امسح عوامل التصفية. |
| loadError | Couldn’t load translations. Try again. | Übersetzungen konnten nicht geladen werden. Bitte erneut versuchen. | Impossible de charger les traductions. Réessayez. | تعذّر تحميل الترجمات. حاول مرة أخرى. |
| edTitle | Edit translations | Übersetzungen bearbeiten | Modifier les traductions | تعديل الترجمات |
| edSource | English (source) | Englisch (Quelle) | Anglais (source) | الإنجليزية (المصدر) |
| hintMachine | Machine text. Edit it if you like. | Maschineller Text. Passen Sie ihn bei Bedarf an. | Texte automatique. Modifiez-le si vous le souhaitez. | نص آلي. عدّله إن رغبت. |
| hintYours | Your text. The machine won’t change it. | Ihr Text. Die Maschine ändert ihn nicht. | Votre texte. La machine ne le modifiera pas. | نصّك. لن تغيّره الآلة. |
| failedExplain | The machine answer failed its checks, so the site shows the English text until you write this line. | Die maschinelle Antwort hat die Prüfungen nicht bestanden, deshalb zeigt die Website den englischen Text, bis Sie diese Zeile schreiben. | La réponse automatique n’a pas passé les contrôles, le site affiche donc le texte anglais jusqu’à ce que vous écriviez cette ligne. | لم تجتز الإجابة الآلية الفحوصات، لذا يعرض الموقع النص الإنجليزي إلى أن تكتب هذا السطر. |
| lockedLegal | Legal text. It is never translated by the machine and stays exactly as approved. | Rechtstext. Er wird nie maschinell übersetzt und bleibt genau wie freigegeben. | Texte juridique. Il n’est jamais traduit automatiquement et reste exactement tel qu’approuvé. | نص قانوني. لا تترجمه الآلة أبدًا ويبقى كما تمت الموافقة عليه تمامًا. |
| lockedApproved | Wording you approved. It is never translated by the machine and stays exactly as written. | Formulierung, die Sie freigegeben haben. Sie wird nie maschinell übersetzt und bleibt genau so. | Formulation que vous avez approuvée. Elle n’est jamais traduite automatiquement et reste telle quelle. | صياغة وافقت عليها. لا تترجمها الآلة أبدًا وتبقى كما كُتبت تمامًا. |
| lockedName | Product name or code. It stays the same in every language. | Produktname oder Code. Er bleibt in jeder Sprache gleich. | Nom de produit ou code. Il reste identique dans toutes les langues. | اسم منتج أو رمز. يبقى كما هو في كل اللغات. |
| closeBtn (existing) | Close | Schliessen | Fermer | إغلاق |
| keepTokens (error, `%s` = tokens) | Keep these exactly as in English: %s | Behalten Sie diese genau wie im Englischen bei: %s | Conservez-les exactement comme en anglais : %s | أبقِها كما هي في الإنجليزية تمامًا: %s |
| emptyLine (error) | This line can’t be empty. | Diese Zeile darf nicht leer sein. | Cette ligne ne peut pas être vide. | لا يمكن ترك هذا السطر فارغًا. |
| save (editor button) | Save translations | Übersetzungen speichern | Enregistrer les traductions | حفظ الترجمات |
| saving | Saving… | Wird gespeichert … | Enregistrement… | جارٍ الحفظ… |
| saved (Toast, existing) | Saved | Gespeichert | Enregistré | تم الحفظ |
| saveError | Couldn’t save. Try again. | Speichern nicht möglich. Bitte erneut versuchen. | Enregistrement impossible. Réessayez. | تعذّر الحفظ. حاول مرة أخرى. |
| discardTitle | Discard your changes? | Änderungen verwerfen? | Abandonner vos modifications ? | تجاهل تعديلاتك؟ |
| keepEditing (existing) | Keep editing | Weiter bearbeiten | Continuer à modifier | متابعة التعديل |
| discard (button in the discard row, existing) | Discard changes | Änderungen verwerfen | Abandonner les modifications | تجاهل التعديلات |

Legal (`section="legal"`) keeps its existing `legal`, `legalSub`, `soon`, `soonBody` keys unchanged. The old `pages`/`pagesSub` keys are replaced by `navTranslations`/`translationsSub` (delete the old pair; planner confirms by grep).

`placeOne*` are the per-row place labels; `place*` are the filter options. "Extras" reuses the existing dictionary entry (Zusätze / Options / إضافات), so the singular is Zusatz / Option / إضافة. The old `cancel` key is not used by this phase. The filter "Machine" and the badge "Machine" are one dictionary entry (Maschinell / Automatique / آلي).

### Pricing extras fields (page `T` tables in `OpsPricing.dc.html`; dictionary `strings`)

`extraTranslated` ("Translated automatically. Edit if needed.") is deleted and replaced by four keys. The mark texts reuse `markMachine` and `markFailed` (same entries as the Translations table), added to the Pricing `T` tables as well, together with `translating` and `englishChanged` (same entries as above).

| Key (T) | EN | DE | FR | AR |
|---------|----|----|----|----|
| markMachine | Machine | Maschinell | Automatique | آلي |
| markFailed | Not translated | Nicht übersetzt | Non traduit | غير مترجم |
| translating | Translating… | Wird übersetzt … | Traduction en cours… | جارٍ الترجمة… |
| englishChanged | English changed since your translation. Your text stays. | Das Englische hat sich seit Ihrer Übersetzung geändert. Ihr Text bleibt, wie er ist. | L’anglais a changé depuis votre traduction. Votre texte reste tel quel. | تغيّر النص الإنجليزي منذ ترجمتك. يبقى نصّك كما هو. |
| extraPending | Filled in by the machine when you save. | Wird beim Speichern maschinell ergänzt. | Complété automatiquement à l’enregistrement. | تملؤه الآلة عند الحفظ. |
| extraMachine | Machine translation. Edit it if needed. | Maschinelle Übersetzung. Bei Bedarf anpassen. | Traduction automatique. Modifiez-la si besoin. | ترجمة آلية. عدّلها عند الحاجة. |
| extraYours | Your text. The machine won’t change it. | Ihr Text. Die Maschine ändert ihn nicht. | Votre texte. La machine ne le modifiera pas. | نصّك. لن تغيّره الآلة. |
| extraMissing | No translation yet. Customers see the English name. | Noch keine Übersetzung. Kunden sehen den englischen Namen. | Pas encore de traduction. Les clients voient le nom en anglais. | لا توجد ترجمة بعد. يرى العملاء الاسم بالإنجليزية. |

### Support ticket (page `T` tables in `OpsSupportTicket.dc.html`; dictionary `strings`/`patterns`)

`mailHint` ("Read only. The button opens a reply…") is deleted: the screen is no longer read only. `%s` follows the page's existing `%n`/`%s` pattern style and is a `patterns` entry in the dictionary.

| Key (T) | EN | DE | FR | AR |
|---------|----|----|----|----|
| translatedFrom (`%s` = language name from `Intl` through `langName()`, first letter capitalised) | Translated from %s | Übersetzt (Original: %s) | Traduit (original : %s) | تُرجم من %s |
| translatedNoLang | Translated | Übersetzt | Traduit | مترجم |
| translating | Translating… | Wird übersetzt … | Traduction en cours… | جارٍ الترجمة… |
| trNotAvailable | Translation not available | Übersetzung nicht verfügbar | Traduction indisponible | الترجمة غير متاحة |
| replyLabel | Your reply | Ihre Antwort | Votre réponse | ردّك |
| replyPh | Write in your language. | Schreiben Sie in Ihrer Sprache. | Écrivez dans votre langue. | اكتب بلغتك. |
| replyHint | The button opens a reply in your mail app. The customer gets it in their language, with your text below. | Die Schaltfläche öffnet eine Antwort in Ihrem E-Mail-Programm. Der Kunde erhält sie in seiner Sprache, Ihr Text steht darunter. | Le bouton ouvre une réponse dans votre messagerie. Le client la reçoit dans sa langue, votre texte en dessous. | يفتح الزر ردًا في تطبيق بريدك. يتلقاه العميل بلغته، ونصّك تحته. |
| replyHintSame | The button opens a reply in your mail app. | Die Schaltfläche öffnet eine Antwort in Ihrem E-Mail-Programm. | Le bouton ouvre une réponse dans votre messagerie. | يفتح الزر ردًا في تطبيق بريدك. |
| sendIn (a11y + label) | Send in | Senden auf | Envoyer en | الإرسال بـ |
| sendInCustomer (`%s` = language name through `langName()`) | %s · customer | %s · Kunde | %s · client | %s · العميل |
| previewLabel (`%s` = language name through `langName()`) | What the customer gets (%s) | Das erhält der Kunde (%s) | Ce que le client reçoit (%s) | ما يتلقاه العميل (%s) |
| previewEdited | Your edit. It stays as written. | Ihre Änderung. Sie bleibt so, wie Sie sie geschrieben haben. | Votre modification. Elle reste telle quelle. | تعديلك. يبقى كما كتبته. |
| translateAgain | Translate again | Erneut übersetzen | Traduire à nouveau | أعد الترجمة |
| previewFail | No translation. The e-mail will contain your text as written. | Keine Übersetzung. Die E-Mail enthält Ihren Text unverändert. | Pas de traduction. L’e-mail contiendra votre texte tel quel. | لا توجد ترجمة. سيحتوي البريد نصّك كما كتبته. |
| mailTooLong | Your original text was left out: it is too long for your mail app link. | Ihr Originaltext wurde weggelassen: Er ist zu lang für den Link Ihres E-Mail-Programms. | Votre texte d’origine a été retiré : il est trop long pour le lien de votre messagerie. | حُذف نصّك الأصلي لأنه أطول من أن يتسع له رابط تطبيق البريد. |
| tryAgain (existing) | Try again | Erneut versuchen | Réessayer | أعد المحاولة |
| markMachine | Machine | Maschinell | Automatique | آلي |

Wording notes for the owner's signature: DE and FR "Translated from" are written as "(Original: …)" because the language name from `Intl` is nominative and German/French need an article to say "from German"; the parenthesis avoids a wrong case in any language. If he prefers a literal sentence, only German, French and Arabic of this one row change. German "Maschinell" and French "Automatique" are the mark words; English "Machine" is his own.

Words that must not appear on any dashboard or customer surface in this phase: any model, vendor or platform name; "AI"; "Gemma"; "Cloudflare"; "Workers"; "m2m". Dictionary reuse: the 2026-10-12 grep of `app/vamos-i18n-dict.js` found these English texts already present and adopted verbatim: All, Failed, Where, Extras, Filter, Language, Close, Save (kept for other pages), Saved, Clear filters, Try again, Keep editing, Discard changes. Strings with no entry are new and are added in the same pass. The mark is the word Machine and nothing else. The mark never goes into a customer e-mail or a public page.

Law checks on copy: no emoji, no invented price or stat, no placeholder text, no filler. `CHF` and references are not touched. Amounts shown in pictures are `CHF 000`. `ZRH`, `VT-4821`, class names stay Latin in every language.

---

## Registry Safety

| Registry | Blocks Used | Safety Gate |
|----------|-------------|-------------|
| shadcn official | none (shadcn not initialised) | not applicable |
| Third-party | none | not applicable; no registry is declared, so no vetting gate runs |

---

## Signing

The owner signs pictures and copy before any code. Offline renders from the real shell (`ops.dc.html`, base href and auth flag, stubbed `/api/*`, git-archive "before" where a screen already exists), bare crops on a plain white ground, no frames, no cookie sheet over a crop, demo amounts `CHF 000`. Harness: `.planning/phases/32-auto-translate/tools/render.mjs` (copied from phase 31: frame, stub, assert, compose). Every state below is drawn at **1440 en, 1440 ar, 390 en, 390 ar**. Stub data must include one line of each kind: machine in all three languages, mixed (de machine, fr yours, ar failed), locked-legal, locked-name, a line whose de cell is `pending`, a line whose fr cell is `yours` with `stale`, and an Arabic customer message and a German customer message. The Pricing stub includes an extra with a pending language and an extra whose de text he wrote after the English name changed.

**Common assertions, every frame** (a frame fails if any is false):

| # | Assertion |
|---|-----------|
| C1 | `documentElement.scrollWidth <= innerWidth` (no sideways scroll, including 390) |
| C2 | `document.documentElement.dir` is `rtl` for ar frames and `ltr` for en; `lang` matches |
| C3 | `VamosLocale.coverage(root)` returns an empty list for de, fr and ar (also run once per language on the unframed state) |
| C4 | No computed `box-shadow` on any element in the crop contains a colour other than the neutral charcoal shadow tokens; no `--vt-shadow-accent`; no `filter: blur` or `drop-shadow`. Exemption: `--vt-ring` on the single focused element (crop 2.6 focuses a row button) |
| C5 | No computed `background-color` or `border-color` equal to `--vt-yellow-50/-100/-200/-300`; no `color` equal to `--vt-yellow-600/-700`; the only `#FDC20B` backgrounds in the crop are SAVE TRANSLATIONS and ANSWER BY E-MAIL (sheet 3 also contains the Pricing dialog's existing, unchanged primary button) |
| C6 | Every `button, a, input, textarea, [role=tab], [data-tr-row]` in the crop has a box at least 44 px high (Badges are not interactive and are excluded) |
| C7 | No visible text matches `/gemma|google|cloudflare|workers|m2m|openai|anthropic|claude|gpt/i` and none matches `/\bAI\b/` (case-sensitive, no `i` flag, so words such as "said" or "Maschinell" never trip it); no `ß` in de strings of this phase |
| C8 | No console `pageerror` |
| C9 | No element in the crop has `scrollWidth > clientWidth + 1` except `[data-tr-cell]` clamped text |
| C10 | All new strings resolve: the crop text contains no key names (`trNotAvailable`, `markMachine`, …) and no `{{` |

**Sheet 1: Translations list** (`screens/sheet-1-translations-list.png`)

| Crop | State | Assertions beyond the common set |
|------|-------|----------------------------------|
| 1.1 | Default list, filter All, one line of each kind visible | 1440: `Table` with 4 `th` (English, German, French, Arabic in the page language) and ≥4 `tr`; 390: ≥4 `[data-tr-row]` stacked, language `Tabs` present with 3 tabs, one `aria-selected=true`. A de/fr/ar machine cell holds `[data-tr-mark=machine]` whose text, uppercased, equals the `markMachine` string; the "yours" cell has no `[data-tr-mark]`; the failed cell holds `[data-tr-mark=failed]` and the text "Shows English" (translated); the locked row holds `[data-tr-mark=locked]` with a `lock` icon mask and no machine mark. Every `[data-tr-cell=en]` text is Latin English in the ar frame (not translated by the runtime) and carries `data-vt-no-i18n`; every `[data-tr-cell=ar]` text has `dir=rtl lang=ar`; the others `dir=ltr`. Placeholder tokens are inside `bdi.vt-dir-keep`. Filter tab labels carry counts in `.vt-dir-keep`; 390 shows a `BrandSelect` instead of the filter `Tabs` |
| 1.2 | Loading skeleton | 8 `[data-tr-skel]` rows, `[data-tr-list][aria-busy=true]`, toolbar present and not disabled, no real row text, no animation running when `prefers-reduced-motion:reduce` |
| 1.3 | Empty: no match | `[data-tr-empty]` with the `noMatchTitle` text and a "Clear filters" button of 44 px; search input holds the stub query |
| 1.4 | Error | `Alert` with danger tone showing `loadError`, a "Try again" button, toolbar still present |
| 1.5 | Empty: Failed filter | Failed tab `aria-selected=true` (390: select shows Failed); `emptyFailedTitle` visible |
| 1.6 | Translating cell, and a line whose English changed | The pending de cell holds a `[data-tr-meta]` line with the `translating` text and a `loader-circle` mask, no `[data-tr-mark]` badge in that cell, no animation under reduced motion; the cell still shows the text it served; the row is clickable. The fr `stale` cell shows the `englishChanged` line with an `info` mask and its text unchanged |

**Sheet 2: Line editor** (`screens/sheet-2-translations-editor.png`)

| Crop | State | Assertions |
|------|-------|-----------|
| 2.1 | Editor open on the mixed line (de machine, fr yours, ar failed) | Dialog `role=dialog` with the `edTitle` title; read-only English block with `lang=en dir=ltr`; three `[data-tr-field]`; de field has `[data-fld-mark]` containing a `Badge` with machine text; fr field has no mark and the `hintYours` hint; ar field has the danger mark, an info `Alert` with `failedExplain`, and an empty textarea with `dir=rtl lang=ar`; Save translations (`save`) has `disabled`; the ghost Close and Save translations buttons are both ≥44 px; at 390 the dialog width ≤ `innerWidth - 16`; the footer is visible without scrolling the page |
| 2.2 | Editor on a locked line | No `textarea` in the dialog; three read-only blocks; an info `Alert` with `lockedLegal` text; one "Close" button and no Save; blocks use muted colour |
| 2.3 | Editor dirty with errors | de field edited: its `[data-fld-mark]` is empty and its hint is `hintYours`; fr field shows an `error` containing the token list inside `.vt-dir-keep`; Save translations enabled but the dialog marks the error (the field has the error class); Arabic frame: error text on the inline start side |
| 2.4 | Editor saving | Every `textarea` and Close `disabled`; Save translations `disabled` and its label is `saving`; a `loader-circle` icon mask is inside Save |
| 2.5 | Editor, save failed | A danger `Alert` with `saveError` at the top of the body; fields keep the typed text; Save translations enabled |
| 2.6 | List after save, toast | The saved row's de cell has no `[data-tr-mark=machine]` (mark gone); a `Toast` with `saved` text; focus is on that row's English button |

**Sheet 3: Pricing extras** (`screens/sheet-3-pricing-extras.png`; "before" from git, "after" from the tree)

| Crop | State | Assertions |
|------|-------|-----------|
| 3.1 | Extras editor, new extra (empty translations) | Three fields with the `extraPending` hint, no `[data-fld-mark]` content; the English `name` field unchanged |
| 3.2 | Extras editor, saved machine text in all three | Three `[data-fld-mark]` badges with the machine word; hints equal `extraMachine`; the label text and its badge do not overlap (bounding boxes disjoint) in de/fr at 390 and in ar |
| 3.3 | Extras editor, de edited by him, fr machine, ar failed (empty) | de: no mark, `extraYours`; fr: mark, `extraMachine`; ar: the danger `[data-fld-mark]` badge with the `markFailed` text (same tone and word as the Translations screen), `extraMissing` |
| 3.4 | Extras editor, just saved, languages translating | Each pending field's `[data-fld-mark]` holds the `translating` text and a `loader-circle` mask, not a Badge; no animation under reduced motion; fields editable; label and mark bounding boxes disjoint in de/fr at 390 and in ar |
| 3.5 | Extras editor, de written by him, English name changed since | de: no mark, hint equals `englishChanged` with an `info` mask, the de text unchanged from the stored human text; fr: machine mark as in 3.2 |

**Sheet 4: Support thread** (`screens/sheet-4-support-thread.png`; "before" from git for the unchanged own-language bubble)

| Crop | State | Assertions |
|------|-------|-----------|
| 4.1 | German customer message, dashboard en / ar | `[data-msg-tr]` holds the translation; `[data-msg-from]` reads "Translated from German" (en) / the Arabic form with "الألمانية" (ar); `[data-msg-orig]` holds the German original, `lang=de dir=ltr`, font size ≤13 px, colour `--vt-text-muted`; DOM order tr, from, orig; hairline above the original. No `Badge` in the bubble |
| 4.2 | Arabic customer message, dashboard en | `[data-msg-orig]` has `lang=ar dir=rtl`, computed `text-align` resolves to the right edge, and its box is within the bubble; the translation is LTR; the bubble does not scroll sideways |
| 4.3 | Message in the dashboard's own language | Bubble identical to today: no `[data-msg-from]`, no `[data-msg-orig]` |
| 4.4 | Translation failed | Original in the body position, one `trNotAvailable` line, no `Alert`, no button in the bubble |
| 4.5 | Translation pending | Original in the body position, `translating` line with a `loader-circle` mask, no animation under reduced motion |

**Sheet 5: Reply in the customer's language** (`screens/sheet-5-support-reply.png`; "before" from git for the footer)

| Crop | State | Assertions |
|------|-------|-----------|
| 5.1 | Empty | `[data-reply-text]` present with `aria-label` and placeholder; `[data-reply-lang]` select shows the customer's language with the `sendInCustomer` suffix; no `[data-reply-preview]`; ANSWER BY E-MAIL enabled; the old `mailHint` text is absent; ≥44 px controls at 390 |
| 5.2 | Translating | `[data-reply-preview]` present with a skeleton bar and the `translating` text; ANSWER BY E-MAIL `disabled` |
| 5.3 | Ready (machine) | Preview label "What the customer gets (German)" with the language name; `[data-reply-mark]` contains the machine badge; preview textarea non-empty with `lang`/`dir` of the target; ANSWER BY E-MAIL enabled; footer scrolls inside (`overflow-y:auto`) at 390 and the thread above it is ≥160 px tall |
| 5.4 | Ready, target Arabic, dashboard en | Preview textarea `dir=rtl lang=ar`; the reply textarea `dir=ltr`; mark present |
| 5.5 | Edited preview | No `[data-reply-mark]` badge; `previewEdited` hint; "Translate again" button ≥44 px |
| 5.6 | Failed | No preview; `Alert` info with `previewFail`; "Try again" button; ANSWER BY E-MAIL enabled |
| 5.7 | Closed ticket | No `[data-reply]` block; `closedBody` line and Reopen button present |

Stub assertion for the mail link (unit, not a picture): with a ready preview, the generated `mailto`/Gmail body decodes to preview text, `\n\n`, 20 hyphens, `\n\n`, original text; with a failed preview it decodes to the original only; over 1,800 characters it omits the original and `mailTooLong` shows.

Owner signs: (a) the five sheets, (b) every string in the Copywriting Contract in en, de, fr and ar, (c) Q1 and the defaults above. Signature is his own answer in the question form; this file does not record it until he gives it.

Verification after build (not part of signing): a Chromium run against the local Worker for search and filter, paging, open and save an editor line (mark gone, row updated, toast), locked line read-only, a German and an Arabic ticket message end to end, a reply with each state, a Pricing extra saved and edited, then 1440, 1024, 768 and 390 in en and ar with no sideways scroll; plus `VamosLocale.coverage` empty in de, fr and ar on each new element.

---

## Checker Sign-Off

gsd-ui-checker, 2026-10-12. Run 1 (19:4x +04): BLOCKED on 2 points (generic Save/Cancel labels; 5 font sizes), plus 14 recommendations. Revision 1 fixed all of them. Run 2 (19:52 +04): **VERIFIED**. The lead then fixed run 2's three small notes: curly apostrophes, one error style ("Couldn’t …"), and booking notes recorded under Defaults taken.

- [x] Dimension 1 Copywriting: FLAG (non-blocking; the notes above were fixed afterwards)
- [x] Dimension 2 Visuals: PASS
- [x] Dimension 3 Color: PASS
- [x] Dimension 4 Typography: PASS
- [x] Dimension 5 Spacing: PASS
- [x] Dimension 6 Registry Safety: PASS

**Approval:** approved by the checker 2026-10-12. This is not the owner's signature: pictures, copy and Q1–Q4 still need his answer.
