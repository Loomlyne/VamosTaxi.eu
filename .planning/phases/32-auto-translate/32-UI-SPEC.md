---
phase: 32
slug: auto-translate
status: approved
reviewed_at: 2026-10-13
shadcn_initialized: false
preset: none
created: 2026-10-12
revised: 2026-10-13
---

# Phase 32 — UI Design Contract (Automatic translator)

> Revision 2026-10-13. The owner did not sign the 2026-10-12 spec; his answers of 2026-10-13 replace it. Translation is **fully automatic and silent**: no Translations page, no line editor, no "Machine" mark, no review or preview step. This phase now touches **three surfaces and no new component file, no new token, no new yellow**: (A) the dashboard rail and Content group, (B) the support ticket (customer messages and the reply), (C) the review card on the public home page. Everything composes from the bound Vamos design system (`window.VamosTaxiDesignSystem_245af1`). No vendor or model name, and the word "machine", appear in no string, on any surface.
>
> Locked upstream: `32-CONTEXT.md` D-01..D-04, F-01..F-07 (F-04 is narrowed: there is now no mark anywhere). Read order for the planner: Owner answers, Surfaces, Copywriting Contract, Signing.

## Owner answers 2026-10-13 (final)

| # | His words / answer | Effect |
|---|--------------------|--------|
| 1 | "no remove that new page translations, make it as said automatic no double check from me" | No Content › Translations page, no line editor, no marks, no preview. Translation happens by itself |
| 2 | "delete as well the pages inside content/pages and legal keep reviews" | Content › Pages and Content › Legal are removed (rail items, screens, routes). Content › Reviews stays. Site and legal wording change only in code |
| 3 | "Keep your mail app" | Reply stays ANSWER BY E-MAIL into his mail app or Gmail. The mail holds the customer-language text, then his English below a line. Gmail opening is the preview |
| 4 | Customer messages | Shown in his dashboard language, with "Translated from <Language>" and the original underneath. A message in a language outside en/de/fr/ar is still translated for him. For a reply to a customer whose language is outside the four, "the email app will handle that": his text goes as written |
| 5 | "show original and add a small button on the review to translate it" | Home review cards show the original; a small button translates into the visitor's site language on tap |
| 6 | Controller defaults | Existing dictionary wording is reused where strings clashed; Pricing extras get de/fr/ar names filled automatically with no mark; 44 Arabic "Vamos Taxi" spellings go Latin (no UI) |

## Defaults taken (non-interactive run; change any on his word)

1. **Content group stays with one child (Reviews).** It is his own wording ("Content › Reviews stays"). Flattening it into a single Reviews row is a later call. The one remaining child row is raised from 40 px to 44 px (touch target rule).
2. **Old addresses.** `/pages` and `/legal` are no longer console paths: they fall through the existing unknown-path rule of `ops.dc.html` (`readPath` returns the dashboard). No redirect page, no "moved" notice. They also leave `OPS_CONSOLE_EXACT` in `apps/web/middleware.ts`.
3. **Pricing extras: no UI change at all.** The three name fields keep their `globe` icon and the existing hint "Translated automatically. Edit if needed." It stays true (fields are filled automatically and remain editable) and is neutral. No mark, no Translating line, no polling: a field shows whatever is stored when the form opens.
4. **Reply target language.** Language of his latest customer message when the backend detected one, else the ticket locale. If it is en, de, fr or ar and differs from his dashboard language: translate. If it equals his dashboard language, or is outside the four: his text goes as written and the hint says which. No language picker.
5. **Reply timing.** The text is translated silently 800 ms after he stops typing and the result is kept for that exact text; a click uses it at once. A click before it is ready shows the busy state (20 s ceiling). Nothing translated is ever shown to him.
6. **Browser activation.** Gmail path: the new tab is opened synchronously at the click and filled when ready. Mail-app path: if the answer arrives after the browser's click activation lapsed (`navigator.userActivation.isActive === false`), the mail is not forced; the box shows one quiet line (`replyReady`) and the next press opens it instantly.
7. **Mail link length.** If the mail body would exceed 1,800 characters, the original below the divider is left out and a quiet note says so (never a silent cut).
8. **Review language.** The button shows only when the backend knows the review's language and it differs from the visitor's site language. Unknown language: no button. A translation lives for the page view only and is dropped when the visitor changes the site language.
9. **Wording for signature.** German and French "Translated from" is written "(Original: …)" because the language name is nominative and those languages need a case ("aus dem Deutschen"). If he prefers a literal sentence, only de/fr/ar of that one row change.
10. **Booking notes** (CONTEXT row 13) are translated by the backend but not drawn: if the booking detail shows a stored translation it uses the Surface B message layout and strings. Not part of the signing sheets.
11. **Dashboard language** = `VamosLocale.lang()` (`staff.lang`). Language names come from `Intl.DisplayNames` in that language through one helper `langName(code, uiLang)` that capitalises the first letter (French returns "allemand").

---

## Design System

| Property | Value |
|----------|-------|
| Tool | none (shadcn not used; the bound Vamos design system is the only source of visual truth) |
| Preset | not applicable |
| Component library | Vamos design system bundle `window.VamosTaxiDesignSystem_245af1`, tokens `design-system/tokens/*.css`, `laws.css` last |
| Icon library | Vendored Lucide set through `Icon` only. Used here, all already vendored: `globe`, `loader-circle`, `info`, `mail`, `star`, `file-text`. No hand-drawn SVG, emoji or arrow character |
| Font | Poppins for every new element. Qurova nowhere new |

Components used (existing, none restyled; props checked against `design-system/_ds_bundle.js`):

| Component | Where | Props |
|-----------|-------|-------|
| `Textarea` | Reply box (B) | `rows` 3 (2 at 860 and below), `aria-label` = label, `placeholder`, `dir` follows the document. Focus: page rule `.vt-input--focus{box-shadow:none}` (charcoal border only) |
| `Button` | ANSWER BY E-MAIL (existing, B); Close ticket / Reopen (existing) | ANSWER BY E-MAIL stays `size="md"` primary with `icon="mail"`; busy state swaps the icon to `loader-circle` and the label to "Translating…" with `disabled` and `aria-busy="true"`. No other new Button |
| `BrandSelect` (existing dc-import) | Mail app select (B), unchanged | as in `OpsSupportTicket` today |
| `Icon` | globe / loader-circle / info, 16 px | `color="currentColor"` |

The review translate control (C) is **not** a kit Button: the kit has no text-button variant (its `ghost` is an outlined 44 px pill, too loud repeated on every card). It is a local `[data-rv-tr]` rule following the signed `[data-rv-link]` pattern already in `Reviews.dc.html` (borderless, 44 px target, spacing cancelled out of the row height). No `Alert`, `Badge`, `Toast`, `Dialog`, `Table`, `Tabs` or `Input` is used by this phase.

Local layout rules (`[data-*]` only, tokens only, never a class):

| Attribute | Rule |
|-----------|------|
| Rail child row (`OpsSidebar.dc.html`, Content items) | `height:44px` (was 40). Nothing else changes |
| `[data-msg-tr]` | the existing message `<p>` (14 px, line-height 1.55, `white-space:pre-wrap`, `data-vt-no-i18n`) |
| `[data-msg-from]` | flex, `align-items:center`, `gap:4px`, `margin-block-start:8px`, `var(--vt-body-xs)`, `var(--vt-text-muted)`; 16 px `globe` icon first; language name in `data-vt-no-i18n` |
| `[data-msg-orig]` | `margin-block-start:8px; padding-block-start:8px; border-block-start:1px solid var(--vt-border-subtle)`, `var(--vt-body-xs)`, `var(--vt-text-muted)`, `white-space:pre-wrap`, `overflow-wrap:anywhere`, `text-align:start`, `unicode-bidi:plaintext`, own `lang` and `dir` |
| `[data-msg-status]` | pending / failed quiet line: flex, `gap:4px`, `margin-block-start:8px`, `var(--vt-body-xs)`, `var(--vt-text-muted)`; 16 px icon |
| `[data-reply]` | inside `[data-ov-foot]`: flex column, `gap:8px` |
| `[data-reply-hint]`, `[data-reply-note]` | `var(--vt-body-xs)`, `var(--vt-text-muted)`, `margin:0`. The note adds a 16 px `info` icon, flex, `gap:4px` |
| `[data-rv-tr-row]` (Reviews card) | flex, wrap, `align-items:center`, `gap:4px 12px`, `align-self:flex-start`, `margin-block:-8px` (cancels half of the 44 px target out of the card's 16 px gap, as `[data-rv-link]` does) |
| `[data-rv-tr]` (button) | `all:unset`, `box-sizing:border-box`, `display:inline-flex`, `align-items:center`, `gap:8px`, `min-block-size:44px`, `min-inline-size:44px`, `padding-inline:8px`, `border-radius:var(--vt-radius-pill)`, `font-family:var(--vt-font-body)`, `font-size:var(--vt-body-sm)`, `font-weight:var(--vt-weight-semibold)`, `color:var(--vt-text-primary)`, `cursor:pointer`; hover `background:var(--vt-grey-50)`; active `background:var(--vt-grey-100)` + `translateY(1px)`; `:focus-visible` `box-shadow:var(--vt-ring)`; `[aria-busy=true]` `cursor:progress`, no hover fill. No underline animation, no glow |
| `[data-rv-tr-note]` | the failed line: `var(--vt-body-sm)`, regular, `var(--vt-text-secondary)`, `role="status"`, `min-width:0`, `overflow-wrap:anywhere` |

Kept untouched on every page: `--vt-shadow-accent:none` in `:root` and `.vt-input--focus{box-shadow:none}` (`OpsSupportTicket`, `Reviews`).

---

## Spacing Scale

All from `--vt-space-*`, multiples of 4:

| Token | Value | Usage in this phase |
|-------|-------|---------------------|
| xs | 4px | Icon-to-text gap in the "Translated from" line, the pending/failed line and the reply note |
| sm | 8px | Gap between a message's parts; gap inside the reply block; button icon-to-label gap; review button inline padding |
| md | 16px | Existing review card gap (unchanged) |
| lg | 24px | Not used |
| xl | 32px | Not used |
| 2xl | 48px | Not used |
| 3xl | 64px | Not used |

Exceptions:

- `12px` (`--vt-space-3`): the gap between the review failed line and its button; the existing support bubble padding is unchanged.
- `-8px` block margin on `[data-rv-tr-row]` only (cancels the oversized touch target out of the card rhythm; same device as `[data-rv-link]`).
- Touch targets: rail child row 44 px; `[data-rv-tr]` 44 px high and wide; reply `Textarea`, mail-app select and ANSWER BY E-MAIL 44 px or taller.
- Support overlay at 860 px and below: `[data-ov-actions] .vt-btn{min-block-size:36px}` is raised to `44px`; `[data-ov-foot]` gets `max-block-size:56%` of the dialog with `overflow-y:auto; overscroll-behavior:contain`; `[data-thread]` `min-block-size` goes from 240 to 160 so the thread and the reply box both fit at 390 x 844.

---

## Typography

Sizes in use (2 new, both existing tokens) and weights (2):

| Role | Size | Weight | Line height | Where |
|------|------|--------|-------------|-------|
| Body | 14px `--vt-body-sm` | 400 `--vt-weight-regular`; 600 `--vt-weight-semibold` on the review translate button | 1.55 (message bubble, existing) / 1.6 `--vt-body-leading` | `[data-msg-tr]`, reply text, `[data-rv-tr]`, `[data-rv-tr-note]`, translated review text keeps the card's existing 16px `--vt-body-md` |
| Small | 13px `--vt-body-xs` | 400 | 1.6 | `[data-msg-from]`, `[data-msg-orig]`, `[data-msg-status]`, reply hint and note |

The card's existing sizes (16px quote and name, 14px route) and the kit's own Button/Select text are not overridden and not new. Weights: 400 and 600 only. Body copy never below 13 px. Sentence case everywhere except the kit Button label (uppercase by component).

---

## Color

| Role | Value | Usage |
|------|-------|-------|
| Dominant (60%) | `--vt-bg-page` / `--vt-bg-surface` (white) | Ticket thread and bubbles, reply block, review cards |
| Secondary (30%) | Charcoal `#1E1F1F` text; `--vt-text-secondary`, `--vt-text-muted`; grey `#DEDEDE` hairline `--vt-border-subtle`; `--vt-grey-50/-100` hover and press fills; the existing charcoal rail | Translation text, "Translated from" line, original text, hints, notes, hairline above an original, rail |
| Accent (10%) | Yellow `#FDC20B` at full strength | **This phase adds no yellow.** It stays on what already exists: the ANSWER BY E-MAIL button, the active rail row and the review stars. The review translate button is charcoal text on white |
| Destructive / danger | none | A failed translation is not an alarm: it is a quiet muted line. No `--vt-danger`, no `Alert`, no Badge |

Accent reserved for: ANSWER BY E-MAIL (existing, sheet b) and the elements that already carry it. No `--vt-yellow-50..300`, no `-600/-700` text, no `Alert tone="accent"`, no `Badge tone="warning"`, no tinted left-border card, no glow on hover, focus or press (colour step, `translateY(1px)` on press, focus ring `--vt-ring`; text fields charcoal border only).

---

## Surfaces and states

**Focal points**

| Surface | Focal point | How |
|---------|-------------|-----|
| A. Rail | The active Reviews row under Content | The existing active-row style is the only filled item in the group |
| B. Message | The translated text | `[data-msg-tr]` at full text colour; the "Translated from" line and the original are muted 13 px |
| B. Reply | ANSWER BY E-MAIL | The only yellow in the footer |
| C. Review card | The review quote | The translate button is 14 px semibold text with no fill; nothing on the card outweighs the quote |

### A. Dashboard rail and Content (`app/ops/OpsSidebar.dc.html`, `app/ops/ops.dc.html`, `apps/web/middleware.ts`)

| | Before (git, `HEAD`) | After |
|---|----------------------|-------|
| Content group, open | Pages (`globe`), Legal (`shield-check`), Reviews (`star`) | Reviews (`star`) |
| `CONTENT` const in `ops.dc.html` | `['pages','legal']` + reviews route separate | removed; Reviews renders by `isReviews` only |
| `NAV` `CONTENT` in `OpsSidebar` | 3 items | 1 item: `{ key:'reviews', href:'/reviews', icon:'star' }` |
| `data-props.active` options | includes `pages`, `legal` | `pages`, `legal` removed |
| Routes `/pages`, `/legal` | open `OpsContent` | not routes. Unknown-path rule applies (Default 2) |
| `OpsContent.dc.html` | "Coming soon" screens for both | file deleted (it serves no other section); its `T` keys `pages, legal, pagesSub, legalSub, soon, soonBody` and rail labels `Pages`, `Legal` go too, after the planner greps for other uses in `vamos-i18n-dict.js` |

Rules:

- The group header "Content" (`file-text` icon, chevron) is unchanged. It opens to one child. A group with no explicit choice follows its route: on `/reviews` it is open with Reviews active; elsewhere it follows the saved choice.
- Collapsed rail (icons only): unchanged behaviour. Tapping Content expands the rail and opens the group.
- Child row: 44 px high (Default 1), `margin-inline-start:8px`, `border-radius:999px`, existing weights and colours.
- Below 1081 px the rail is the drawer; same group, same single child.
- RTL: group indent already uses `margin-inline-start` and `border-inline-start`; Arabic label "التقييمات" is the existing entry.
- There is no empty state: Reviews is always present.

### B. Support ticket (`app/ops/OpsSupportTicket.dc.html`, links from `apps/web/lib/ops/tickets-map.ts`)

**B1. Customer messages.** Applies to bubbles with `data-from="customer"` only. The server returns per message: detected language, translation into his dashboard language, status `ready | pending | failed | same`. Staff bubbles and internal notes are never translated. Board cards and the table keep the original preview; the locale chip keeps the locale code.

```
chips row (who, when)                              unchanged
[data-msg-tr]    translated text                    14 px
[data-msg-from]  globe(16) + "Translated from German"   13 px muted
[data-msg-orig]  original text, own lang and dir    13 px muted, hairline above
files                                               unchanged
```

| State | Condition | Bubble shows |
|-------|-----------|--------------|
| Same language | status `same` (detected language equals his dashboard language, or no detection) | Today's bubble, nothing added |
| Translated | `ready`, language differs, including languages outside en/de/fr/ar | Translation, "Translated from {language}", original underneath. If `Intl` does not know the code the line reads "Translated" with no language |
| Pending | `pending` (just arrived) | Original in the normal body position and one `[data-msg-status]` line "Translating…" (16 px `loader-circle`, no spin under `prefers-reduced-motion:reduce`). The overlay re-reads the thread at most 5 times, 2 s apart; then the line becomes "Translation not available" until he reopens the ticket |
| Failed | `failed` | Original in the normal body position and the `[data-msg-status]` line "Translation not available" (16 px `info`). No colour, no retry control |

`[data-msg-orig]` is `lang="<detected>"`, `dir="rtl"` for Arabic and other RTL codes else `ltr`. An Arabic original in an English dashboard reads right to left and sits at the right edge of the bubble; a German original in an Arabic dashboard reads left to right at the left. The translation itself follows the dashboard direction. The bubble keeps `max-width:88%`; the three parts stack, so 768 and 390 change nothing. No Badge, no mark, no colour.

**B2. Reply** (inside `[data-ov-foot]`, open tickets only; the old `mailHint` line is replaced). Order top to bottom: existing save-error line, `[data-reply]`, `[data-ov-actions]` (unchanged slots).

`[data-reply]`:

1. `Textarea` `[data-reply-text]`, label "Your reply" (the existing rule hides `.vt-field__label` at 860 and below, so it also carries `aria-label` and the placeholder "Write in your language."). He writes in his dashboard language.
2. `[data-reply-hint]` under it (13 px muted): the hint for the current case (copy table).
3. `[data-reply-note]` (only in the failed, ready-after-lapse and too-long cases): one line, 13 px muted, `info` icon.
4. Actions row (existing): Close ticket, Reopen (closed), mail-app `BrandSelect`, ANSWER BY E-MAIL (`data-reply-answer`).

The mail body, built from the server's link plus `&body=` (the page appends only the body; the recipient and subject stay server-built, and the subject is in the target language when a translation is used):

```
<text in the customer's language>
<blank line>
--------------------        (exactly 20 hyphens)
<blank line>
<his original text>
```

Without a usable translation the body is his text as written, no divider.

| State | Condition | What shows |
|-------|-----------|------------|
| Empty | box empty | Hint only. ANSWER BY E-MAIL **enabled**; opens a blank reply to the customer exactly as today |
| Ready to send, will translate | text present, target in en/de/fr/ar and different from his language | Hint `replyHint`. Silent translation runs 800 ms after he stops typing (Default 5). Button enabled |
| Same language | target equals his dashboard language | Hint `replyHintSame`. No translation, text as written. Button enabled |
| Language outside the four | detected customer language not en/de/fr/ar | Hint `replyHintRaw`. No translation, text as written, no divider. Button enabled |
| Busy | click while the translation is still running | Button disabled, `aria-busy="true"`, `loader-circle` icon, label "Translating…" (no spin under reduced motion). The box stays editable; editing during busy discards the running answer and returns to "Ready to send". 20 s ceiling, then Failed |
| Done | answer back | The mail app or Gmail opens with the body above. The box keeps his text. Gmail path: the tab was opened at the click and is filled now |
| Failed | request failed, timed out, or the answer failed its checks | The mail opens with his text as written, no divider. `[data-reply-note]` "Couldn’t translate. The e-mail opened with your text as written." stays until he edits the text. Button enabled again |
| Ready after lapse | answer arrived after click activation lapsed (Default 6) | Mail not forced. `[data-reply-note]` "Translation ready. Press the button again to open your mail." Button enabled; the next press opens at once |
| Too long | body over 1,800 characters | Mail is built without the original below the divider; `[data-reply-note]` "Your original text was left out: it is too long for your mail app link." |
| No recipient | ticket has no usable address (`answerOff`, today's rule) | Button disabled exactly as today; no new copy |
| Closed ticket | `isClosed` | Whole `[data-reply]` hidden; existing `closedBody` line and Reopen button as today |

Responsive: at 1440 and 1024 the footer sits under the thread in `[data-ov-chat]`. At 768 and 390 the dialog stacks meta over chat (existing); the footer scrolls inside its 56 % cap; the label is hidden (aria-label and placeholder carry it); the actions row wraps with ANSWER BY E-MAIL last and full width at 390 (`block`). No sideways scroll. German grows ~30 %: hints are written to wrap, never clip.

RTL: the reply box follows the document direction (he writes in his dashboard language); the hint, note and icon follow inline start; the mail body is built from text and carries no direction of its own.

### C. Home review card (`app/home/Reviews.dc.html`, mounted by `app/home/home.dc.html` line 642 as `<dc-import name="Reviews">`)

**Visibility today.** The section renders only when at least 3 published reviews exist (`enough`); until the store answers it shows a skeleton, and under 3 it renders nothing. A read of the public `GET /api/reviews` on 2026-10-13 returned 5 published rows, so the section is visible on home now. From 7 published reviews and above 680 px it is a drifting wall (every card twice, the copy `aria-hidden` and `inert`, the wall pauses on `:hover` and `:focus-within`); otherwise a still masonry wall.

**Placement.** Inside `[data-rv-card]`, directly after `<blockquote data-rv-q>` and before `[data-rv-who]`: a row `[data-rv-tr-row]` holding the button and, when failed, the note. The quote keeps `data-vt-no-i18n`. The card, its stars, source link, name and platform mark are unchanged.

Button: `[data-rv-tr]` with a 16 px `globe` icon before the label (inline start). Row is `align-self:flex-start`.

| State | Condition | Row shows | Quote shows |
|-------|-----------|-----------|-------------|
| None | review language unknown, or equal to the site language | no row at all (the card is exactly today's card) | original |
| Default | review language known and differs from the site language | button "Translate" | original, `dir="auto"` as today |
| Busy | tapped, waiting (20 s ceiling, then Failed) | same button, `aria-busy="true"`, `aria-disabled="true"` (stays focusable so focus is not lost), `loader-circle` icon, label "Translating…". No second tap acts | original |
| Translated | answer back | button "Show original" (same place, same style; focus stays on it) | translation, `lang` = site language, `dir` = `rtl` when the site language is Arabic else `ltr` (the `<bdi>` wrapper is kept), same type and quote marks. The blockquote is `aria-live="polite"` |
| Back to original | tap "Show original" | button "Translate" again (the client keeps the answer, so a second tap is instant and makes no request) | original |
| Failed | request failed, timed out, rate limited | the note "Translation not available" (`role="status"`) then the button "Try again" (retry makes a new request) | original stays |

Rules: state is per review id and per site language, so in the drift wall the visible card and its three aria-hidden copies change together (their buttons are `inert`); a change of site language drops every translated card back to default. The translated text is not stored in the page, in `localStorage` or anywhere else. The call happens only on a tap (never on page load) and the server answers from its cache when it can (F-06). While the visitor holds the button, hovers it, or has focus inside the wall, the existing pause rule keeps the drifting wall still. No tooltip, no badge, no wording about how it was translated.

Responsive: 1440 and 1024 (2 or 3 columns), 768 (2 columns), 390 (1 column, no drift): the row stays inline-start aligned and wraps (note above the button) when the note is long; German "Original anzeigen" and French "Afficher l’original" fit the card width without clipping. RTL: icon and label flip by logical order; the button sits at the inline start (right in Arabic) with `align-self:flex-start`.

---

## Copywriting Contract

Rows marked (existing) reuse the entry already in `app/vamos-i18n-dict.js` or the page table verbatim (grep 2026-10-13); the dictionary is keyed by English text, so one English text has one translation everywhere. Swiss German uses "ss", never ß. Formal address (Sie, vous). Ops copy is neutral and literal. No vendor or model name, no "machine", no "AI".

| Element | Copy |
|---------|------|
| Primary CTA (ticket, existing) | Answer by e-mail (ANSWER BY E-MAIL) |
| Primary action (home) | Translate |
| Empty state | none new. An empty reply box is a valid state (blank reply opens). No empty state on the rail or the review card |
| Error state | Dashboard: "Couldn’t translate. The e-mail opened with your text as written." Home: "Translation not available" + "Try again" |
| Destructive actions | none in this phase. Removing Pages and Legal is a code change, not a user action: no confirmation UI |

### Dashboard: support ticket (page `T` tables in `OpsSupportTicket.dc.html` and `strings`/`patterns` in `app/vamos-i18n-dict.js`; they must match character for character)

`mailHint` ("Read only. The button opens a reply…") is deleted. `%s` is a `patterns` entry in the dictionary.

| Key | EN | DE | FR | AR |
|-----|----|----|----|----|
| answer (existing in the page `T` table; new in `app/vamos-i18n-dict.js`) | Answer by e-mail | Per E-Mail antworten | Répondre par e-mail | الرد عبر البريد الإلكتروني |
| translatedFrom (`%s` = language name via `langName()`) | Translated from %s | Übersetzt (Original: %s) | Traduit (original : %s) | تُرجم من %s |
| translatedNoLang | Translated | Übersetzt | Traduit | مترجم |
| translating (also the busy button label and the home busy label) | Translating… | Wird übersetzt … | Traduction en cours… | جارٍ الترجمة… |
| trNotAvailable (also home) | Translation not available | Übersetzung nicht verfügbar | Traduction indisponible | الترجمة غير متاحة |
| replyLabel | Your reply | Ihre Antwort | Votre réponse | ردّك |
| replyPh | Write in your language. | Schreiben Sie in Ihrer Sprache. | Écrivez dans votre langue. | اكتب بلغتك. |
| replyHint | The button opens a reply in your mail app. The customer gets it in their language, with your text below. | Die Schaltfläche öffnet eine Antwort in Ihrem E-Mail-Programm. Der Kunde erhält sie in seiner Sprache, Ihr Text steht darunter. | Le bouton ouvre une réponse dans votre messagerie. Le client la reçoit dans sa langue, votre texte en dessous. | يفتح الزر ردًا في تطبيق بريدك. يتلقاه العميل بلغته، ونصّك تحته. |
| replyHintSame | The button opens a reply in your mail app. | Die Schaltfläche öffnet eine Antwort in Ihrem E-Mail-Programm. | Le bouton ouvre une réponse dans votre messagerie. | يفتح الزر ردًا في تطبيق بريدك. |
| replyHintRaw | The button opens a reply in your mail app. Your text stays as written: the customer’s language is not one of our four. | Die Schaltfläche öffnet eine Antwort in Ihrem E-Mail-Programm. Ihr Text bleibt unverändert: Die Sprache des Kunden gehört nicht zu unseren vier. | Le bouton ouvre une réponse dans votre messagerie. Votre texte reste tel quel : la langue du client ne fait pas partie de nos quatre. | يفتح الزر ردًا في تطبيق بريدك. يبقى نصّك كما هو: لغة العميل ليست من لغاتنا الأربع. |
| replyUntranslated | Couldn’t translate. The e-mail opened with your text as written. | Übersetzung nicht möglich. Die E-Mail wurde mit Ihrem Text unverändert geöffnet. | Traduction impossible. L’e-mail s’est ouvert avec votre texte tel quel. | تعذّرت الترجمة. فُتح البريد بنصّك كما كتبته. |
| replyReady | Translation ready. Press the button again to open your mail. | Übersetzung fertig. Drücken Sie die Schaltfläche erneut, um Ihr E-Mail-Programm zu öffnen. | Traduction prête. Appuyez de nouveau sur le bouton pour ouvrir votre messagerie. | الترجمة جاهزة. اضغط الزر مرة أخرى لفتح تطبيق البريد. |
| mailTooLong | Your original text was left out: it is too long for your mail app link. | Ihr Originaltext wurde weggelassen: Er ist zu lang für den Link Ihres E-Mail-Programms. | Votre texte d’origine a été retiré : il est trop long pour le lien de votre messagerie. | حُذف نصّك الأصلي لأنه أطول من أن يتسع له رابط تطبيق البريد. |

### Home: review card (`Reviews.dc.html` markup in English; strings added to `app/vamos-i18n-dict.js`, which relabels the button, note and busy label)

| Key | EN | DE | FR | AR |
|-----|----|----|----|----|
| rvTranslate | Translate | Übersetzen | Traduire | ترجمة |
| rvShowOriginal | Show original | Original anzeigen | Afficher l’original | عرض النص الأصلي |
| translating (same entry as above) | Translating… | Wird übersetzt … | Traduction en cours… | جارٍ الترجمة… |
| trNotAvailable (same entry as above) | Translation not available | Übersetzung nicht verfügbar | Traduction indisponible | الترجمة غير متاحة |
| tryAgain (existing) | Try again | Erneut versuchen | Réessayer | أعد المحاولة |

The button's accessible name is its visible label; `aria-describedby` points at the card's quote so repeated "Translate" buttons are told apart. The translated review text is not in the dictionary (it comes from the server per visit).

### Sidebar and Pricing

No new strings. The rail keeps "Content" and "Reviews" (existing entries). Pricing keeps "Translated automatically. Edit if needed." (existing in `OpsPricing.dc.html`, de/fr/ar already there). Removed with Pages and Legal: rail labels `Pages`, `Legal` and the `OpsContent` table (planner greps `vamos-i18n-dict.js` before deleting any shared entry; `Reviews` stays).

Law checks on copy: no emoji, no invented price or stat, no placeholder text. `ZRH`, `VT-4821`, `CHF`, class names stay Latin in every language. "Vamos Taxi" is Latin in Arabic too (D-14a).

---

## Removed by owner decision 2026-10-13

- Content › Translations page: list, filters, place filter, search, language tabs, paging, skeleton, empty and error states, the line editor (Dialog, fields, dirty guard, saving, saved Toast), locked-line view, rail relabel "Translations".
- Every mark: "Machine", "Not translated", "Never translated"; the Translating… and English-changed lines; "Shows English".
- Pricing extras marks and the four state hints (the existing neutral hint stays, Default 3).
- Reply preview block, "Send in" select, preview badge, "Edited" hint, "Translate again".
- Content › Pages and Content › Legal screens, their rail items, their routes and `OpsContent.dc.html`.
- The old Q1–Q4 table and its pictures (old sheets 1–5 in `screens/` are superseded and not for signing). Old Q3 "reviews stay original with no translation" is reversed by answer 5.

---

## Registry Safety

| Registry | Blocks Used | Safety Gate |
|----------|-------------|-------------|
| shadcn official | none (shadcn not initialised) | not applicable |
| Third-party | none | not applicable; no registry is declared, so no vetting gate runs |

---

## Signing

The owner signs pictures and copy before any code. Offline renders from the real shells (dashboard `ops.dc.html` with base href and auth flag and stubbed `/api/*`; the public `home.dc.html` with a stubbed `/api/reviews`), bare crops on a plain white ground, no frames, no cookie sheet over a crop. Harness: `.planning/phases/32-auto-translate/tools/render.mjs` (frame, stub, assert, compose; `stubs.mjs` extended for the stubs below). Every crop is drawn at **1440 en, 1440 ar, 390 en, 390 ar**. "Before" crops come from `git archive` of `HEAD` for any screen that exists today (rail, ticket thread, ticket footer, review card). Sheets: (a) `screens/sheet-a-sidebar-content.png`, (b) `screens/sheet-b-support-ticket-part-a.png` + `-part-b.png` (split for size), (c) `screens/sheet-c-review-translate.png`. Crop ids are `SA-n`, `SB-n`, `SC-n` so they never collide with the common assertions C1–C10.

Stub data. Dashboard: a German customer message, an Arabic customer message, an Italian customer message (language outside the four), one message in the dashboard's own language, one pending, one failed; an open ticket with a German customer, one with an Italian customer, one closed. Home: at least 3 published reviews, among them one German, one English, one Arabic, one with unknown language; the site language is the frame's language. A second home stub has 7 reviews (drift) for the DOM-only assertions.

**Common assertions, every frame** (a frame fails if any is false):

| # | Assertion |
|---|-----------|
| C1 | `documentElement.scrollWidth <= innerWidth` (no sideways scroll, including 390) |
| C2 | `document.documentElement.dir` is `rtl` for ar frames and `ltr` for en; `lang` matches |
| C3 | `VamosLocale.coverage(root)` returns an empty list for de, fr and ar (run once per language on each unframed state) |
| C4 | No computed `box-shadow` on any element in the crop contains a colour other than the neutral charcoal shadow tokens; no `--vt-shadow-accent`; no `filter: blur` or `drop-shadow`. Exemption: `--vt-ring` on the single focused element |
| C5 | No computed `background-color` or `border-color` equal to `--vt-yellow-50/-100/-200/-300`; no `color` equal to `--vt-yellow-600/-700`; the set of `#FDC20B` backgrounds equals the set in the matching "before" crop (this phase adds none): sheet a active rail row, sheet b ANSWER BY E-MAIL, sheet c the existing own-source stars |
| C6 | Every `button, a, input, textarea, select, [role=tab], [data-rv-tr]` in the crop has a box at least 44 px high. Exemption: the existing rail collapse toggle `[data-rail-toggle]` (40 px, untouched by this phase) |
| C7 | Dashboard crops: no visible text matches `/gemma|google|cloudflare|workers|m2m|openai|anthropic|claude|gpt|machine/i` and none matches `/\bAI\b/` (case-sensitive, no `i` flag). Public crops (sheet c): the same regex; image `alt` and `aria-label` text of the existing platform marks is not visible text and is exempt. No `ß` in any de string of this phase |
| C8 | No console `pageerror` |
| C9 | No element in the crop has `scrollWidth > clientWidth + 1` |
| C10 | All new strings resolve: the crop text contains none of the key names (`translatedFrom`, `replyHintRaw`, `rvTranslate`, …), no `%s`, and no `{{` |

**Sheet a: rail and Content** (`screens/sheet-a-sidebar-content.png`; before from git)

| Crop | State | Assertions beyond the common set |
|------|-------|----------------------------------|
| SA-1 | Before: Content open on Reviews, with Pages and Legal | Evidence only: three children (Pages, Legal, Reviews) |
| SA-2 | After: Content open on `/reviews` (390: drawer open) | Exactly one `a` inside the Content group, `href="/reviews"`, the active style; no `a[href="/pages"]`, no `a[href="/legal"]` anywhere in the document; group header has `aria-expanded="true"`; the child row box is ≥44 px high; labels resolve in the page language (ar: "التقييمات") |
| SA-3 | After: Content closed, on another route (Bookings active) | Group header `aria-expanded="false"`; no child rendered; Bookings carries the active style |
| SA-4 | After: rail collapsed to icons (1440 only; 390 uses the drawer) | Content icon `file-text` present; clicking it expands the rail and opens the group with one child |
| SA-5 | Address check (assertion, not a picture) | Loading `/pages` and `/legal` on the dashboard host renders the dashboard route; no `OpsContent` node in the DOM |

**Sheet b: support ticket** (`screens/sheet-b-support-ticket-part-a.png` + `-part-b.png`; before from git for the own-language bubble and the footer)

| Crop | State | Assertions |
|------|-------|-----------|
| SB-1 | Before: footer with the read-only hint, mail-app select, ANSWER BY E-MAIL | Evidence only |
| SB-2 | German customer message, dashboard en and ar | `[data-msg-tr]` holds the translation; `[data-msg-from]` reads "Translated from German" (en) / "تُرجم من الألمانية" (ar) with a `globe` mask; `[data-msg-orig]` holds the German text, `lang=de dir=ltr`, computed font-size ≤13 px, colour `--vt-text-muted`; DOM order tr, from, orig; a 1px `--vt-border-subtle` rule above the original; no `Badge` and no element named mark in the bubble |
| SB-3 | Arabic customer message, dashboard en | `[data-msg-orig]` has `lang=ar dir=rtl`; its text edge sits at the bubble's right; the translation is LTR; the bubble does not scroll sideways |
| SB-4 | Italian customer message (outside the four), dashboard en | Reads "Translated from Italian"; original `lang=it`; same structure as SB-2 |
| SB-5 | Message in the dashboard's own language | Identical to the "before" bubble: no `[data-msg-from]`, no `[data-msg-orig]` |
| SB-6 | Translation pending | Original in body position, a `[data-msg-status]` line with the `translating` text and a `loader-circle` mask; no animation under reduced motion |
| SB-7 | Translation failed | Original in body position, a `[data-msg-status]` line with `trNotAvailable` and an `info` mask; no `Alert`, no button in the bubble |
| SB-8 | Reply, empty (German customer) | `[data-reply-text]` present with `aria-label` and placeholder; hint equals `replyHint`; no `[data-reply-note]`; ANSWER BY E-MAIL enabled; the old read-only hint text is absent; no preview element, no language select other than the mail-app select |
| SB-9 | Reply typed, target differs (German customer, English text) | Hint `replyHint`; button enabled and labelled `answer` (uppercase by component); mail-app select present; footer scrolls inside (`overflow-y:auto`) at 390 and the thread above it is ≥160 px tall |
| SB-10 | Busy | Button `disabled` and `aria-busy=true`, label equals `translating`, `loader-circle` mask inside, no `mail` mask; box still editable; no animation under reduced motion |
| SB-11 | Failed (untranslated) | `[data-reply-note]` with `replyUntranslated` and an `info` mask under the box; button enabled and labelled `answer` |
| SB-12 | Customer language outside the four (Italian), text typed | Hint equals `replyHintRaw`; no note; button enabled |
| SB-13 | Too long / ready after lapse (one crop each) | `[data-reply-note]` equals `mailTooLong` / `replyReady` |
| SB-14 | Closed ticket | No `[data-reply]`; the `closedBody` line and the Reopen button present |

Unit stubs for the mail link (not pictures): with a ready translation the generated `mailto` and Gmail body decode to translated text, `\n\n`, 20 hyphens, `\n\n`, original text; with a failed or skipped translation the body decodes to his text only; over 1,800 characters the original is omitted; the recipient equals the ticket's server-built address; the Gmail tab is opened synchronously in the click handler.

**Sheet c: review card** (`screens/sheet-c-review-translate.png`; before from git)

| Crop | State | Assertions |
|------|-------|-----------|
| SC-1 | Before: the card as it is today | Evidence only |
| SC-2 | Default: German review on an English site (ar frame: English review on an Arabic site) | One `[data-rv-tr]` with the `rvTranslate` text and a `globe` mask, ≥44 px high and wide; the quote still holds the original; the card's other elements (stars, name, mark) pixel-identical to SC-1 apart from the added row; card height grows by ≤48 px (44 px row, 8 px cancelled top and bottom, plus the 16 px card gap) |
| SC-3 | Same language and unknown language | No `[data-rv-tr-row]` in the card (two cards in one crop); card identical to SC-1 |
| SC-4 | Busy | `[data-rv-tr]` has `aria-busy=true` and `aria-disabled=true`, label equals `translating`, a `loader-circle` mask; quote still the original; no animation under reduced motion |
| SC-5 | Translated | Quote text equals the stub translation with `lang` = frame language and `dir` = `rtl` in ar else `ltr`; button label equals `rvShowOriginal`; no word other than the translation and the button label was added; blockquote has `aria-live=polite` |
| SC-6 | Failed | A `[data-rv-tr-note]` with `trNotAvailable` (`role=status`) and a button labelled `tryAgain`; the quote still the original; the note colour is not `--vt-danger` |
| SC-7 | Drift wall (DOM only, 1440 en) | With 7 stub reviews, translating one review changes the quote text in the visible card and in its `aria-hidden` copies; copies' `[data-rv-tr]` are inside `inert` items; the wall's animation is paused while the button has focus |

Verification after build (not part of signing): a Chromium run against the local Worker for a German and an Arabic ticket message end to end, a reply in each state, the rail with Reviews only (and `/pages`, `/legal` falling through), a home review translated, shown back to the original, failed and retried; then 1440, 1024, 768 and 390 in en and ar with no sideways scroll; `VamosLocale.coverage` empty in de, fr and ar on each new element.

Owner signs: (a) the three sheets, (b) every string in the Copywriting Contract in en, de, fr and ar, (c) the defaults above. Signature is his own answer in the question form; this file does not record it until he gives it.

---

## Checker Sign-Off

gsd-ui-checker, 2026-10-13 ~17:00 +04, revision 2 (run in the foreground): **VERIFIED**. D-05 to D-10 are all honoured, and the spec matches 32-STRINGS.md character for character.

- [x] Dimension 1 Copywriting: FLAG (non-blocking: "Translate" is a bare verb; kept, because the button is small and `aria-describedby` names the review)
- [x] Dimension 2 Visuals: PASS
- [x] Dimension 3 Color: PASS (no new yellow)
- [x] Dimension 4 Typography: PASS (3 sizes, 2 weights)
- [x] Dimension 5 Spacing: FLAG (non-blocking: a 12 px gap in the review failed note)
- [x] Dimension 6 Registry Safety: PASS

**Approval:** approved by the checker. This is not the owner's signature; the three sheets, the strings and the defaults still need his answer.
