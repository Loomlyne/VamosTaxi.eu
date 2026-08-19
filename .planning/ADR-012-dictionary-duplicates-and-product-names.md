# ADR-012 — Dictionary duplicate keys, and the Arabic vehicle-class names they exposed

**Status:** Accepted 2026-08-19, an engineering decision taken now, with one consequence flagged
for the owner rather than decided unilaterally.
**Phase:** Pre-Phase 1 (mock-copy correction). `app/vamos-i18n-dict.js` is the dictionary Phase 1
ports as the i18n runtime's data source, so its duplicate keys and wrong Arabic values need
fixing in the mock before that port treats the file as clean.

## Context

**Method, and why it matters for this file specifically.** The dictionary was loaded through
Node with a `window` shim (`global.window = {}; eval(readFileSync('app/vamos-i18n-dict.js'))`)
and read back as `window.VamosI18n.strings`, rather than regex-scraped. This file escapes
apostrophes with a right single quotation mark inside some values (`l'e-mail`, `d'assistance`)
and contains brace-wrapped interpolation tokens (`{1}`, `$1`) that a naïve `'…':` pattern can
misread as a key boundary; loading it as the JavaScript object it actually is avoids both traps
and gives an exact count rather than an estimated one.

**The counts.** A separate scan of every `'key': {` line (not the loaded object, so duplicates
are visible before JavaScript's own last-write-wins semantics discards them) finds **1440 literal
key occurrences**, **1427 distinct keys**, and **13 duplicated keys** — matching the `1427 string
entries` C22 already cites from the same file. The rule that makes the 13 matter: in a JavaScript
object literal, the later key wins and the earlier one is silently discarded at parse time —
`{ a: 1, a: 2 }` evaluates to `{ a: 2 }`, no error, no warning. Each of the 13 earlier entries is
therefore dead code sitting in a 1440-line file a reader would reasonably believe is live,
because nothing about the syntax marks it as superseded.

**Six identical duplicates — harmless today, worth deduplicating for hygiene.** Both copies carry
the same `de`/`fr`/`ar` values; keeping either changes nothing a user sees.

| Key | Line 1 | Line 2 |
|---|---|---|
| `Passengers` | 426 | 1143 |
| `Destination` | 429 | 1129 |
| `imprint` | 451 | 1239 |
| `We answer within` | 470 | 1351 |
| `On shift` | 740 | 752 |
| `Van` | 398 | 1136 |

(`Van`'s two copies agree with each other — `ar: 'فان'` at both lines — which is exactly why the
identical-duplicate check alone did not catch that it is still wrong; see below.)

**Five conflicts where the surviving (later) value is already the better translation — dead entry
removed, no translation changed:**

| Key (lines) | Dead (earlier) | Live (later, kept) | Why the live one is right |
|---|---|---|---|
| `Transfer voucher` (547, 1185) | de: `Transfer-Gutschein` | de: `Transfergutschein` | The standard closed German compound — German does not hyphenate this pairing |
| `Resend email` (553, 1188) | ar: `إعادة إرسال البريد` | ar: `أعد إرسال البريد` | The imperative form, correct for a button label; the dead value is a noun phrase ("resending") |
| `cookie policy` (578, 1236) | fr: `politique de cookies` | fr: `politique relative aux cookies` | The correct French legal register for a policy document |
| `More actions` (747, 963) | fr: `Plus d'actions` | fr: `Autres actions` | Idiomatic overflow-menu phrasing; the dead value is a calque of the English "more" |
| `Vehicle class` (756, 1132) | fr: `Classe du véhicule` | fr: `Classe de véhicule` | The label form without the definite article — correct for a table-header/label context |

Remedy for all five: delete the dead earlier entry, keep the live later value exactly as it
stands, change no translation.

**Two conflicts that are a larger finding — both values wrong, and this is how it became
visible.** `Economy` (lines 396, 1133) and `Business` (lines 397, 1134) are each duplicated with
**disagreeing** Arabic values — two different transliterations of the same English product name:

| Key | Line 396/397 (dead) | Line 1133/1134 (live, but also wrong) |
|---|---|---|
| `Economy` | `ar: 'إيكونومي'` | `ar: 'اكونومي'` |
| `Business` | `ar: 'بزنس'` | `ar: 'بيزنس'` |

Neither value is a translation — both are transliterations of the English word into Arabic
script, and the two copies of each disagree on how to spell the transliteration. That
disagreement is what made the problem visible: an identical-value check finds nothing wrong with
`Van`, whose two copies happen to agree (`ar: 'فان'` at both lines), even though `Van` has exactly
the same underlying defect — the root `CLAUDE.md` and `design-system/readme.md:660` both state
that product names (`Vamos Taxi`, `Economy`, `Business`, `Van`) are never translated. A
transliteration is not a translation, but it is also not the Latin product name — it is a third,
unauthorised category this repository backed into for three vehicle classes, consistently for one
of them and inconsistently for the other two.

**The fourth row in the same block, not a duplicate but the same pattern's third instance.**
`app/vamos-i18n-dict.js:1132–1136` reads, in source order: `Vehicle class`, `Economy`,
`Business`, `First`, `Van`. The `First` entry at `:1135` — `'First': { de: 'First', fr: 'First',
ar: 'الأولى' }` — is not duplicated anywhere else in the file, so it did not surface in the
duplicate-key scan at all, but it belongs to the same four-row block and carries the same
underlying defect one step further: `الأولى` is not a transliteration of "First," it is a genuine
Arabic *translation* of the word (literally "the first") — the third inconsistency inside one
four-row block, and the only one of the three that is a real translation rather than even a
transliteration. `docs/build/LEGAL-PLACEHOLDER-CHECKLIST.md:20` already records that the "First"
class is "moot after decision 13" (13 Aug 2026, three classes only, no `first`), and §I
(`:566–570`) already lists `app/home/home.dc.html`'s `first`-class removals as a work order for
the mock-copy pass — but §I's list does not yet include this dictionary entry. This ADR routes
its deletion to that same §I work order rather than performing it here.

## Decision

**The Arabic values for `Economy`, `Business` and `Van` become the Latin product names verbatim
— `Economy`, `Business`, `Van` — in all four languages, matching how `Vamos Taxi` itself already
renders unchanged in every language.** The rule this follows is stated identically in both
authored sources: root `CLAUDE.md` and `design-system/readme.md:659–661` both list product names
among what is deliberately never translated — and neither source carves out an exception for
transliteration. A transliteration is not neutral; it is a translation-adjacent choice this
project's own rule already forecloses.

**The mechanism that makes a Latin island inside Arabic text a supported case, not a layout
hazard:** `design-system/tokens/laws.css:57` — `[dir="rtl"] .vt-dir-keep{direction:ltr;
unicode-bidi:isolate}` — already exists for exactly this purpose and is already named for it in
`design-system/readme.md:663–666`: "Put `.vt-dir-keep` on anything that must stay LTR inside
Arabic text — references, times, flight numbers, CHF figures." Vehicle-class names are the same
category as those four examples: a fixed Latin token that must not reverse or reflow inside
right-to-left prose. No new mechanism is invented; this decision extends a pattern this codebase
already ships and already uses for currency figures and flight numbers on the same legal and
booking pages.

**Flagged for the owner, not decided past this point:** an Arabic-reading customer will therefore
see `Economy`, `Business`, `Van` rendered in Latin script inside otherwise-Arabic sentences,
exactly as they already see `Vamos Taxi`. This is a deliberate consequence of the
never-translate-product-names rule, not an oversight — and it is the owner's brand call to
overturn if they disagree, not an engineering default to quietly ship past them. This ADR
recommends the rule's own logical extension; it does not claim the owner has separately confirmed
transliteration is unwanted for these three specific words.

## Consequences

**Cost of being wrong:** nothing here can break a rendered surface today. A duplicate key is
silently overridden by JavaScript's own semantics, and every currently-live value (including the
wrong transliterations) is a syntactically valid string that renders without error. The cost is
entirely downstream and quiet: dead translations nobody knows are dead sitting in the file
indefinitely, and — more visibly — an Arabic-reading customer seeing two different spellings of
the same vehicle class on two different screens (`إيكونومي` on one, `اكونومي` on another),
which reads as carelessness on a product surface even though nothing is functionally broken.

## What this implies for the mock-copy pass

- Delete the seven dead (earlier) entries: `Transfer voucher:547`, `Resend email:553`,
  `cookie policy:578`, `More actions:747`, `Vehicle class:756`, `Economy:396`, `Business:397` —
  keeping each key's later, live occurrence.
- Deduplicate the six identical pairs, keeping one occurrence of each: `Passengers`,
  `Destination`, `imprint`, `We answer within`, `On shift`, `Van` (any one of the two lines per
  key; values are already identical).
- Replace the Arabic value for `Economy`, `Business` and `Van` (the surviving, post-dedup entries)
  with the Latin product name verbatim (`Economy`, `Business`, `Van`), wrapped in the
  `.vt-dir-keep` class defined at `design-system/tokens/laws.css:57` wherever these names render
  inside Arabic-direction markup.
- Delete `app/vamos-i18n-dict.js:1135` (`'First': …`) as part of the decision-13 `first`-class
  removal already listed in `docs/build/LEGAL-PLACEHOLDER-CHECKLIST.md` §I (`:566–570`) — add this
  line to that existing work order rather than treating it as a new item.
- The duplicate-key baseline of 13 recorded by the `.planning/quick/260819-mdn-…` measurement
  pass drops to 0 once the seven deletions and six dedup merges above land.
