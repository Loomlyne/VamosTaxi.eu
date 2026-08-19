# ADR-011 — `data-tok` pill labels stay English, everywhere, deliberately

**Status:** Accepted 2026-08-19, an engineering decision taken now — not an arbitration between
two equally valid readings, but the resolution of one authored rule against one transcription
defect.
**Phase:** Pre-Phase 1 (mock-copy correction / documentation correction). The runtime change
this ADR recommends touches `app/vamos-locale.js`, which Phase 1 ports as the i18n runtime's
foundation (`.planning/STATE.md`: "the i18n runtime's SSR-safe architecture … is decided in
Phase 1, not deferred") — so the skip rule belongs in the mock before that port, not after.

## Context

**This was never a tie.** Three sources speak to whether copy inside a `data-tok` pill is
translated:

1. Root `CLAUDE.md:126` — "The only copy that stays English on purpose is internal: review
   scaffolds, client-input notes, `TBC` placeholder labels" — pill labels named directly, as
   English-on-purpose.
2. `design-system/readme.md:659–661` (§9, "Four languages") — the bound design source of truth:
   "Deliberately **not** translated: 'Ride with class' (the tagline is set artwork), product names
   (`Vamos Taxi`, `Economy`, `Business`, `Van`), codes and references (`ZRH`, `VT-4821`, `CHF`),
   and anything inside `[data-tok]`." Both authored sources agree, independently, in the project's
   two governing documents.
3. `.claude/CLAUDE.md:371` — "Copy inside `[data-tok]` pills (those are pending client input,
   translate them in place)" — the single sentence that says the opposite.

**Where the third sentence comes from.** `.claude/CLAUDE.md` was written by commit `68574a4`
("docs: create roadmap (11 phases)"), 2026-08-17 23:41. It draws its Copy Voice section from
`.planning/codebase/CONVENTIONS.md`, written earlier the same day by commit `ba0e3e5` ("docs: map
existing codebase"), 2026-08-17 22:06 — the codebase-mapper's own generated output. In
`CONVENTIONS.md:359–363`, the identical sentence sits under a `**Never:**` heading:

```
**Never:**
- "Ride with class" (tagline is set artwork, never change it)
- Product names vary (always `Vamos Taxi`, `Economy`, `Business`, `Van`)
- Codes/references change (always `ZRH`, `CHF`, `VT-4821`)
- Copy inside `[data-tok]` pills (those are pending client input, translate them in place)
```

`.claude/CLAUDE.md`'s Copy Voice section flattens `CONVENTIONS.md`'s four headed groups
(**Register**, **Money, numbers, time**, **Microcopy**, **Never**) into one undifferentiated
bulleted list, dropping every heading including `**Never:**`. Stripped of that heading, the
sentence inverts: what was "never translate copy inside `[data-tok]` pills" reads as an
instruction to translate them. The corroborating tell sits one line above it in the same list:
"Product names vary (always `Vamos Taxi`, `Economy`, `Business`, `Van`)" only parses as a
sentence under the dropped `**Never:**` heading — read alone it says product names *vary*, then
immediately contradicts itself by naming four names that never vary. Both bullets are casualties
of the same flattening; the pill-label one simply happens to invert its meaning rather than just
lose its grammar.

**The mechanism evidence — why this is not a preference between two readings.** The `TBC` suffix
that marks every `data-tok` pill is CSS generated content: `design-system/tokens/laws.css:65` —
`[data-tok]::after{content:" TBC"; …}`. `app/vamos-locale.js`'s translation runtime walks DOM text
nodes and four attributes (`placeholder`, `aria-label`, `title`, `alt` — `:55`); it has no access
to CSS `::after` content and never will. That means the `TBC` suffix renders in English in every
language under either reading — translating the pill's own words can only ever produce a
mixed-language chip. Concrete example, German, `app/pages/privacy.dc.html:233`: under the
"translate in place" reading the pill would read *"Cloudflare-Region TBC"* — a German noun phrase
glued to an English typographic tag the CSS itself supplies and the runtime cannot reach. The
pill's *tooltip*, by contrast, is already keyed and already localised in all four languages:
`title="Awaiting a confirmed value from Vamos Taxi"` resolves via
`app/vamos-i18n-dict.js:585` — `de`: "Warten auf einen bestätigten Wert von Vamos Taxi", `fr`:
"En attente d'une valeur confirmée par Vamos Taxi", `ar`: "بانتظار قيمة مؤكَّدة من فاموس تاكسي" —
because `title` is one of the four translatable attributes the runtime does reach. The gap's
*explanation* is already fully localised; only the pill's own placeholder words are contested.

**Independent corroboration from the bound design system's own vendored implementation.**
`design-system/_ds_bundle.js` inlines a copy of `vamos-locale.js` from the design system's own
`assets/` (its header's `sourceHashes` records `"assets/vamos-locale.js":"e96834ea8a55"`). That
vendored copy's `applyTo()` (`_ds_bundle.js:582`) and `coverage()` (`:740`) both reject any node
under `p.closest('[data-i18n-skip],[data-tok],.vt-dir-keep')` — `[data-tok]` is already, in the
bound design system's own reference implementation, an automatic, structural skip selector,
requiring no per-element opt-out at all. `app/vamos-locale.js` loads *after*
`design-system/_ds_bundle.js` in every page's `<helmet>` (e.g. `app/pages/terms.dc.html:27` then
`:32`) and reassigns `window.VamosLocale` at `app/vamos-locale.js:424`, so the bundle's copy is
superseded at runtime — but its skip logic is still the bound system's own stated behaviour, and
it treats `[data-tok]` as skip-by-default exactly as this ADR now decides. `app/vamos-locale.js`
diverges from it two ways: it renames the skip attribute from `data-i18n-skip` to
`data-vt-no-i18n` (already registered as C26 — see below), and it drops the automatic
`[data-tok]` skip entirely, requiring the attribute to be hand-added per pill. That is the third,
independent source pointing the same direction as the two authored documents.

**The measured, half-implemented position.** Counted live across `app/pages/*.dc.html` with a
`data-tok="1"` text-node extraction (Node, not regex — see ADR-012 for why that distinction
matters for this repository): **90 distinct pill labels** (89 static strings plus one dynamic
binding, `{{ shareLabel }}` at `app/pages/manage-booking.dc.html:557`), **114 raw occurrences**.
Of those 90, **21 already carry a dictionary key** in `app/vamos-i18n-dict.js` and **69 do not**
(68 static plus the one dynamic binding, which resolves through its own logic rather than a
dictionary key). Separately, of the 114 raw pill-span occurrences, **91 already carry
`data-vt-no-i18n`** on the same element (opting themselves out by hand) and **23 do not** — a
second, independent axis of the same inconsistency, spread across `AuthForm.dc.html`,
`ResetForm.dc.html`, `PhoneVerify.dc.html`, both `CookieBanner.dc.html` copies, `account.dc.html`,
`booking-detail.dc.html` and `manage-booking.dc.html`. The repository has already
half-implemented both readings of the contested instruction at once, on two separate mechanisms.

## Decision

**Everything inside a `data-tok` pill deliberately stays English, in every language, with no
exception.** Three consequences follow, stated as consequences rather than as further tasks:

1. **The sixty-nine unkeyed labels are already compliant, not debt.** They need no dictionary
   work and must be excluded from any future i18n residual measurement — counting them as gaps
   would be measuring against the wrong policy.
2. **The twenty-one existing dictionary entries are not deleted.** At least one of them is
   confirmed to also serve ordinary, non-pill copy on the same set of pages: `Registered firm
   name` is keyed at `app/vamos-i18n-dict.js:1707` and used as a `data-tok` pill at
   `app/pages/terms.dc.html:185`, but the identical English string is *also* the plain,
   non-`data-tok` label text at `app/pages/imprint.dc.html:188`
   (`<span lang="de" …>Eingetragener Firmenname</span><span lang="en">Registered firm name</span>`)
   — imprint's bilingual toggle relies on the dictionary entry to resolve that label in French and
   Arabic. Deleting the key because it happens to also dress a pill would silently break that
   legitimate, non-pill translation. The other twenty were not each individually proven to have a
   second use in this pass, but the one confirmed case is exactly the failure mode blanket
   deletion risks — the safe default is to leave all twenty-one in place and let a future
   pill-scoped audit remove only the ones proven pill-only, rather than delete first and discover
   the collision after a translated legal page silently regresses.
3. **Enforcement moves to the element, not to the dictionary.** `app/vamos-locale.js`'s `skipped()`
   function already checks `data-vt-no-i18n` and `translate="no"` at `:216`; its two
   `TreeWalker.acceptNode` callbacks repeat the same check at `:256` and `:477`. The fix is to add
   `[data-tok]` as a third condition at all three sites — restoring parity with the bound design
   system's own vendored behaviour in `_ds_bundle.js:582`/`:740` — so that a pill needs no
   per-element `data-vt-no-i18n` at all and the 23-of-114 inconsistency in hand-applied opt-outs
   stops mattering.

**The two documentation defects that caused this are corrected in the same pass as this ADR.**
The sentence at `.claude/CLAUDE.md:371` and its generator source at
`.planning/codebase/CONVENTIONS.md:363` both now read like `design-system/readme.md:659–661` —
anything inside `[data-tok]` deliberately not translated, each with a one-line pointer back to
this ADR. This task's original file scope excluded both files, on the grounds that a
documentation-only pass could record the defect without touching it; the orchestrator widened
that scope for exactly these two lines, on the grounds that they are the root cause this ADR
exists to eliminate and leaving the corrupted sentence live would guarantee the contradiction gets
re-litigated by the next reader who opens `.claude/CLAUDE.md` instead of this file.

**The adjacent defect this decision depends on staying correctly named.** C26 in
`docs/build/LEGAL-PLACEHOLDER-CHECKLIST.md` already records that root `CLAUDE.md` (via
`.claude/CLAUDE.md:262` and `:331`) documents `data-i18n-skip` as the opt-out attribute, while
`app/vamos-locale.js` implements `data-vt-no-i18n` — a different name (`grep -c 'data-i18n-skip'
app/vamos-locale.js` is 0). Any remedy for this ADR's enforcement recommendation must be written
against `data-vt-no-i18n` and `[data-tok]`, the names the runtime actually checks, not
`data-i18n-skip`, the name the documentation gives — a remedy written against the documented name
would silently do nothing, exactly as C26 already found for the `data-slot` case.

## Consequences

**Cost of being wrong, both directions:**

- **If pills should have been translated (this decision is wrong).** A non-English customer sees
  roughly ninety English fragments scattered across the five legal pages and the funnel. This is
  a polish cost, not a correctness one: every gap's tooltip is already localised, so the customer
  still understands *why* the fragment is there in their own language; the fragments are
  transient by construction (each one disappears the day its real value lands); and the fix is
  additive at any time — add ninety dictionary entries, no markup change required.
- **If pills should not have been translated (this decision is right, and the alternative had
  shipped anyway).** Translating them costs roughly two hundred throwaway dictionary entries
  (ninety labels × up to three target languages minus the twenty-one that already exist) that all
  become dead weight the day the pill's value is confirmed and the `data-tok` wrapper comes off.
  Every one of those entries still produces the mixed-language chip described above in all three
  languages, regardless of translation quality — the CSS suffix cannot be reached either way. In
  Arabic specifically, RTL text with an LTR "TBC" tag embedded mid-sentence is a bidi rendering
  wart on every legal page. And translating gap labels dilutes exactly the visibility Law 04
  exists to preserve: a `data-tok` pill is supposed to be unmistakable and greppable as "not yet a
  fact" — a translated label starts reading like ordinary content and breaks that traceability on
  the pages where a regulator is most likely to be reading it.

## What this implies for the mock-copy pass

- `app/vamos-locale.js:216` — add `data-tok` as a third skip condition in `skipped()`, beside
  `data-vt-no-i18n` and `translate="no"`.
- `app/vamos-locale.js:256` and `:477` — mirror the same addition in both `TreeWalker.acceptNode`
  callbacks, so `apply()`/`observe()` and `coverage()` agree with `skipped()`.
- `.claude/CLAUDE.md:371` and `.planning/codebase/CONVENTIONS.md:363` — already corrected in this
  same pass (scope widened by the orchestrator), to read as "deliberately not translated,"
  matching `design-system/readme.md:659–661`. No further action needed on these two lines.
- No dictionary deletions. The twenty-one existing keys stay; the sixty-nine unkeyed labels need
  no work and are excluded from future i18n residual counts.
