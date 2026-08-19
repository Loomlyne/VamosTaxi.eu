---
phase: quick-260819-uoq
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - .planning/ADR-010-privacy-subprocessor-list-cloudflare.md
  - .planning/ADR-011-data-tok-labels-stay-english.md
  - .planning/ADR-012-dictionary-duplicates-and-product-names.md
  - docs/build/LEGAL-PLACEHOLDER-CHECKLIST.md
autonomous: true
requirements: [BLOCKER-S1, BLOCKER-S5]
mode: quick

estimate:
  tokens: 48000
  raw_tokens: 48000
  tasks: 3
  confidence: low

must_haves:
  truths:
    - "Three decisions that were already taken, and are currently recorded only as loose prose beneath a conflicts tally or not at all, exist as numbered ADRs in `.planning/` at the depth and in the shape of ADR-009 — context with evidence, a decision, consequences, and an explicit cost of being wrong."
    - "Nothing under `app/`, `design-system/` or `assets/` is modified by this pass. `git status --porcelain -- app/ design-system/ assets/` is empty at the end of the run. Each ADR instead ends with a section naming the exact file and line of every edit it authorises, so the separate mock-copy pass is mechanical rather than interpretive."
    - "Every file:line citation an ADR carries is re-read from the live tree at the moment it is written, not copied from the planning brief. These ADRs become the cited authority for a later code pass, so a line number that has drifted turns into a false record that pass will follow."
    - "ADR-010 records a decision the owner already took — Q21, answered 2026-08-17, which classes naming Vercel as a correctness fix rather than a copy preference — so its status says it is recording an accepted decision whose mock edit is outstanding, and does not present itself as a fresh engineering choice."
    - "ADR-010 names all four occurrences, not the two previously recorded: the privacy subprocessor row, the cookies provider cell, and the strictly-necessary category meta in both copies of `CookieBanner.dc.html`. The per-folder duplicate is named explicitly, because a fix applied to one copy and not the other leaves the first legal surface a visitor sees still wrong."
    - "ADR-010 records that `app/vamos-i18n-dict.js` contains zero occurrences of the provider name, so the swap itself needs no dictionary edit and the de/fr/ar surfaces correct themselves — and records separately that adding the missing AeroDataBox processor row does need its description in all three languages in the same pass, under Law 03."
    - "No pending value becomes a concrete one. The Cloudflare region stays a `data-tok` gap because ADR-007 leaves region pinning open with counsel; the cookies table changes its Provider cell only, with the cookie name and duration left TBC and the reason stated."
    - "ADR-010 separates what it decides from what it escalates: the final legal wording of the processor list, the region, and Sentry's consent classification are named as the owner's or counsel's, not settled here."
    - "ADR-011 settles the `data-tok` label question by tracing the contradiction to its source rather than arbitrating between two authorities: the two authored sources agree, and the single dissenting sentence is a flattening artifact whose own source carries it under a heading the flattening dropped. The evidence for that provenance — including the neighbouring list item that only parses under the dropped heading — is written down."
    - "ADR-011 carries the mechanism evidence that makes the decision more than a preference: the TBC suffix is CSS generated content the translation runtime cannot reach, so a translated label can only ever render as a mixed-language chip, while the pill's tooltip is already keyed and already localised in four languages."
    - "ADR-011 states the measured half-implemented position — ninety distinct pill labels, twenty-one keyed, sixty-nine not — and draws the three consequences that follow: the sixty-nine are already compliant and must be excluded from residual measurement rather than counted as debt; the twenty-one existing keys are not deleted, because several of those strings also occur as ordinary non-pill copy; and enforcement belongs at the element, beside the runtime's existing opt-out checks."
    - "Any remedy ADR-011 recommends names the attribute the runtime actually implements, not the one the root instruction file documents. C26 already records that those two names differ, and a remedy written against the documented name would silently do nothing."
    - "ADR-012 states how its numbers were obtained — the dictionary loaded through Node with a window shim rather than regex-scraped — and why that distinction matters for this particular file, so the counts can be reproduced instead of believed."
    - "ADR-012 distinguishes the three kinds of duplicate it found: six identical pairs that are harmless hygiene, five conflicts where the surviving value is already the better translation and only dead code needs removing, and two whose values are both wrong and which surface a larger finding."
    - "ADR-012 decides that the Arabic values for the vehicle-class product names become the Latin names verbatim, states the rule that forces it, names the existing mechanism that makes Latin islands inside RTL text a supported case, and flags to the owner that an Arabic reader will therefore see Latin class names — as a deliberate brand consequence that is theirs to overturn, not an oversight."
    - "ADR-012 records the fourth row of the same block — the translated name for a vehicle class the owner's decision 13 cut on 13 Aug 2026 — and routes its deletion to the removal already listed in §I rather than performing it."
    - "The Vercel misdisclosure is registered as C27 in §D in the same row format as C19–C26, with severity, the four cited sites, and a disposition."
    - "The §D count reads twenty-seven at all three sites — the header sentence, the section heading, and the closing tally line — and read twenty-six at all three before the edit. The tally's buckets still sum to the total, and C27 appears in the open list."
    - "The two items recorded beneath the tally as pending and unnumbered are closed, each pointing at the ADR that now carries it, and the preamble that explains why they were left unnumbered no longer contradicts a register that has moved."
    - "No counted evidence is lost in closing those two entries: the measured ninety / twenty-one / sixty-nine figures survive, either in place or by an explicit pointer to the ADR that carries them."
    - "Nothing is invented: no CHF figure, region, address, price, licence term, company detail or date appears anywhere it did not already exist in a cited source."
  artifacts:
    - ".planning/ADR-010-privacy-subprocessor-list-cloudflare.md — the accepted Q21 decision written down, its four mock sites named, the missing AeroDataBox processor row registered"
    - ".planning/ADR-011-data-tok-labels-stay-english.md — the pill-label question settled on provenance and mechanism, with the two documentation defects it implies listed but not applied"
    - ".planning/ADR-012-dictionary-duplicates-and-product-names.md — thirteen duplicate keys classified, seven dead entries identified, the Arabic product-name rule decided and flagged"
    - "docs/build/LEGAL-PLACEHOLDER-CHECKLIST.md — C27 registered, three count sites advanced, both pending entries closed against their ADRs"
  key_links:
    - "ADR-010 ↔ C27 ↔ the pending entry it closes: one finding, three places, all three naming each other, so a reader arriving at any one of them reaches the full record"
    - "§D count sites ↔ each other ↔ the tally arithmetic: three sites and five buckets, all advancing together or the register contradicts itself"
    - "Each ADR's implications section ↔ the mock-copy pass: the follow-up pass reads only that section, so an edit missing from it is an edit that will not happen"
    - "Cited file:line ↔ the live tree at write time: these ADRs are the authority a later code pass will follow, so a drifted citation is worse than no citation"
    - "ADR-011's recommended enforcement ↔ the attribute the runtime implements: a remedy naming the documented-but-absent attribute would register advice that cannot work"
---

<objective>
Write down three decisions that were reached and independently verified at the end of the
Vamos Taxi V1 blocker-closing session, and that currently survive only as prose beneath a
conflicts tally or not at all: the Vercel misdisclosure on the privacy and cookie surfaces,
the contested translation status of `data-tok` pill labels, and the dictionary's duplicate
keys with the Arabic product-name inconsistency they exposed.

Purpose: each of these three was left unnumbered for a defensible reason — the register was
fixed for that pass, or the remedy touched files that pass could not open — and the cost of
that is that three settled decisions now live somewhere no future pass is obliged to read.
Two of them sit under a paragraph explaining that they are not conflicts, which is exactly
where a decision goes to be forgotten. This pass converts them into cited, numbered records,
each ending with the exact edits it authorises, so the code pass that follows is mechanical.

Output: three ADRs, and a conflicts register that has moved from twenty-six to twenty-seven
with its pending block closed. No code changes. The mock edits every one of these implies are
listed, not performed.
</objective>

<execution_context>
@$HOME/.claude/gsd-core/workflows/execute-plan.md
@$HOME/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@.planning/ADR-009-qurova-webfont-licence.md
@docs/build/LEGAL-PLACEHOLDER-CHECKLIST.md
@docs/build/OPEN-QUESTIONS.md
</context>

<tasks>

<task type="tracer">
  <name>Task 1: ADR-010 — the Vercel misdisclosure, written down and registered as C27</name>
  <files>.planning/ADR-010-privacy-subprocessor-list-cloudflare.md, docs/build/LEGAL-PLACEHOLDER-CHECKLIST.md</files>
  <precondition>`.planning/ADR-009-qurova-webfont-licence.md` is the highest-numbered ADR in `.planning/`, and `docs/build/LEGAL-PLACEHOLDER-CHECKLIST.md` reads twenty-six at all three §D count sites. Halt and report if either is untrue — the ADR number and every count edit below depend on both.</precondition>
  <action>
Take one decision the whole way from an ADR file through the conflicts register to its three
count sites, so the doc-to-register path is proven before the other two decisions are written.

First re-read, from the live tree, every location this ADR will cite, and use what the tree
says rather than what this plan says. The four occurrences of the provider name are
`app/pages/privacy.dc.html:233` (the subprocessor row in §04, its description reading
"Website hosting and delivery ·" followed by a TBC region pill), `app/pages/cookies.dc.html:223`
(the Provider cell of the strictly-necessary cookie table), `app/pages/CookieBanner.dc.html:105`
and `app/home/CookieBanner.dc.html:105` (the strictly-necessary category meta line, listing
the party alongside Vamos Taxi, Stripe and Supabase). Confirm each line number, quote the cell
or span accurately, and note that the two `CookieBanner` files are per-folder duplicates of one
component that must move in lockstep. Confirm by count that `app/vamos-i18n-dict.js` holds zero
occurrences of the provider name, and locate the two already-translated description strings
that surround it in that file; cite them by the line numbers the tree reports.

Then write `.planning/ADR-010-privacy-subprocessor-list-cloudflare.md` in ADR-009's shape —
a title line, a Status line, a Phase line, then Context, Decision, Consequences.

Status must reflect that this records an owner decision already taken: Q21 in
`docs/build/OPEN-QUESTIONS.md` was answered 2026-08-17 and classes the rename as a correctness
fix rather than a copy preference, so the status is an accepted decision recorded on
2026-08-19 whose mock edit is the outstanding half — not a proposal. Cite the authorities:
`.planning/PROJECT.md`'s ban on the platform, `docs/build/GSD-LAUNCH.md`'s statement of the
same, the Q21 answer with its date, and
`.planning/quick/260818-wxa-stream-1-blocker-reconciliation-mark-eve/260818-wxa-SUMMARY.md`,
which records that the rename was deliberately deferred so the document and the code would
move together. Verify that summary's line reference before citing it.

The decision is the swap at all four sites. State the two things it does not change and why:
the region stays a `data-tok` gap, because Workers execute at the edge and ADR-007 leaves
region pinning open with counsel, so writing any region would be inventing a value; and on the
cookies table only the Provider cell changes, with the cookie name and duration left TBC
because the new provider does set real edge cookies but which ones depends on features not yet
enabled. Record separately that the swap needs no dictionary edit — the provider name is a bare
proper noun in markup and the surrounding descriptions are already translated — so the German,
French and Arabic surfaces correct themselves.

Record the second finding in the same ADR: the aviation-data provider is missing from the
privacy processor list entirely while the page collects flight numbers, which tied to a booking
are personal data. Cite the line where the page collects them. State that adding that row does
need its description in de, fr and ar in the same pass, under Law 03 — unlike the swap. State
that Turnstile, KV, R2, Queues and Hyperdrive are products of the same provider rather than
separate legal entities, so they get no rows.

Consequences must carry an explicit cost of being wrong in both directions: low in the swap
direction, because the stack is contractually fixed; high in the do-nothing direction, because
a privacy notice naming a non-processor while omitting a real one is a factual misdisclosure
under nFADP and GDPR that counsel has to unwind after launch. Close with a short section naming
what this ADR escalates rather than decides — the final legal wording of the processor list,
which Q21's own answer reserves for the owner's legal review; the region, which is with counsel;
and Sentry's consent classification, which `.planning/PROJECT.md` carries as a revisit.

End the file with a section headed "What this implies for the mock-copy pass", listing the
four provider-name edits by file and line, the new processor row with its three translations,
and the explicit note that the swap alone requires no dictionary change.

Then register the finding in `docs/build/LEGAL-PLACEHOLDER-CHECKLIST.md` §D as C27, in the
same row format as the C19–C26 rows already there: identifier, one-line conflict name,
severity, then a Handled cell that names all four cited sites, states why a wrong processor
name on a consumer legal page is a transparency problem rather than a typo, points at the new
ADR file by name, and ends with a disposition. Choose the severity and disposition from the
row's own evidence and the legend at the top of the file; the remedy is a code edit outside
this pass's file scope, so the disposition must say so rather than claim closure.

Finally advance the §D count from twenty-six to twenty-seven at all three sites — the header
sentence near the top of the file that counts documented conflicts, the `## D.` section
heading, and the closing tally line beneath the register — and add C27 to that tally's list of
open items. The tally's buckets must still sum to the new total after the edit; if they do not,
the arithmetic is wrong and the edit is not finished.
  </action>
  <verify>
    <automated>test -f .planning/ADR-010-privacy-subprocessor-list-cloudflare.md && grep -qi 'cost of being wrong' .planning/ADR-010-privacy-subprocessor-list-cloudflare.md && grep -q 'What this implies for the mock-copy pass' .planning/ADR-010-privacy-subprocessor-list-cloudflare.md && grep -q 'privacy.dc.html:233' .planning/ADR-010-privacy-subprocessor-list-cloudflare.md && grep -q 'cookies.dc.html:223' .planning/ADR-010-privacy-subprocessor-list-cloudflare.md && grep -q 'pages/CookieBanner.dc.html:105' .planning/ADR-010-privacy-subprocessor-list-cloudflare.md && grep -q 'home/CookieBanner.dc.html:105' .planning/ADR-010-privacy-subprocessor-list-cloudflare.md && grep -q '| C27 |' docs/build/LEGAL-PLACEHOLDER-CHECKLIST.md && grep -q 'ADR-010-privacy-subprocessor-list-cloudflare' docs/build/LEGAL-PLACEHOLDER-CHECKLIST.md && [ "$(grep -c 'Conflicts register — 27' docs/build/LEGAL-PLACEHOLDER-CHECKLIST.md)" = 1 ] && [ "$(grep -c '27 documented conflicts' docs/build/LEGAL-PLACEHOLDER-CHECKLIST.md)" = 1 ] && [ "$(grep -c '^27 conflicts' docs/build/LEGAL-PLACEHOLDER-CHECKLIST.md)" = 1 ] && [ "$(grep -cE 'Conflicts register . 26|26 documented conflicts|^26 conflicts' docs/build/LEGAL-PLACEHOLDER-CHECKLIST.md)" = 0 ] && [ -z "$(git status --porcelain -- app/ design-system/ assets/)" ] && echo PASS</automated>
    <human-check>The tally line's five buckets sum to twenty-seven, and C27 appears in its open list.</human-check>
  </verify>
  <done>ADR-010 exists, cites four verified sites, states its cost of being wrong, and ends with its implications section. C27 is registered in the C19–C26 row format. All three §D count sites read twenty-seven, none reads twenty-six, and nothing under `app/`, `design-system/` or `assets/` has changed.</done>
</task>

<task type="auto">
  <name>Task 2: ADR-011 and ADR-012 — the pill-label rule and the dictionary findings</name>
  <files>.planning/ADR-011-data-tok-labels-stay-english.md, .planning/ADR-012-dictionary-duplicates-and-product-names.md</files>
  <action>
Write the two engineering decisions taken now, in the same shape Task 1 used. Re-read every
location from the live tree before citing it; where a line number in this plan disagrees with
the tree, the tree wins and the ADR records what the tree says.

**ADR-011 — `data-tok` pill labels stay English.** Status: accepted 2026-08-19, an engineering
decision taken now. The point of the Context section is that this is not a tie between two
authorities that had to be arbitrated — it is one authored rule and one transcription defect.
Set out the three sources with file and line: the root `CLAUDE.md` sentence naming TBC
placeholder labels among the copy that stays English on purpose; `design-system/readme.md` §9,
the bound design source of truth, listing anything inside the pill attribute among the things
deliberately not translated; and the sentence in `.claude/CLAUDE.md` that says the opposite.
Then give the provenance of that third sentence: it is a flattened copy of the generated
`.planning/codebase/CONVENTIONS.md` list written by the codebase-mapper on 2026-08-17, where
the same list sits under a heading marking the list as things never to do — a heading the
flattening dropped, inverting the meaning. Name the corroborating tell: the neighbouring item
in the same list only parses under that dropped heading. Verify the commit reference for that
mapper run before citing it, and drop the reference rather than guess if it does not check out.

Then the mechanism evidence, which is what makes this more than a preference. The TBC suffix is
CSS generated content in `design-system/tokens/laws.css`; the translation runtime in
`app/vamos-locale.js` walks DOM text nodes and four attributes and cannot reach CSS content, so
the suffix is English in every language under either policy and translating the label can only
ever produce a mixed-language chip — give a concrete German example. Note that the pill's
tooltip is keyed in `app/vamos-i18n-dict.js` and does translate, so the explanation of each gap
is already localised in all four languages. Close the argument on Law 04's own purpose: a gap
must be unmistakable and greppable when the answer lands, and a translated label starts reading
like content and breaks label-grep traceability.

State the measured position — ninety distinct pill labels across `app/pages/*.dc.html`,
twenty-one with a dictionary key and sixty-nine without, verified twice independently — and
say plainly that the repository has half-implemented both readings at once.

The decision is that everything inside a pill deliberately stays English, with three
consequences stated as consequences rather than tasks. The sixty-nine unkeyed labels are
already compliant, need no work, and must be excluded from any i18n residual measurement rather
than counted as debt. The twenty-one existing dictionary entries are not deleted, because
several of those strings also occur as ordinary non-pill copy on the same pages — name at least
two such strings and the page they appear on — so removing the keys would break legitimate
translations. Enforcement therefore belongs at the element: the runtime should skip the pill
subtree, a one-line addition beside the existing opt-out checks in `app/vamos-locale.js`, whose
line numbers you verify before citing.

Record the two documentation fixes that stop this recurring — the sentence in `.claude/CLAUDE.md`
and its generator line in `.planning/codebase/CONVENTIONS.md`, both to be brought to the
readme §9 wording — and state explicitly that neither is applied in this pass, because those
files are outside its scope. Record the adjacent defect already registered as C26: the root
instruction file documents an opt-out attribute the runtime does not implement, and the runtime
implements a differently named one, so any remedy must use the implemented name.

Cost of being wrong, both directions: if pills should have been translated, a non-English
customer sees roughly ninety English fragments on legal pages — a polish cost, bounded by their
transience and the already-localised tooltip, recoverable by adding entries at any time. If they
should not have been, translating them costs roughly two hundred throwaway dictionary entries,
mixed-language chips in all three languages regardless, an Arabic bidi wart, and diluted gap
visibility on exactly the legal pages where Law 04 matters to a regulator. End with the
implications section listing the runtime one-liner and the two documentation corrections.

**ADR-012 — dictionary duplicate keys, and Arabic transliteration of product names.** Status:
accepted 2026-08-19, an engineering decision taken now, with one consequence flagged for the
owner. Open by stating the method and why it matters for this file specifically: the dictionary
was loaded through Node with a window shim rather than regex-scraped, because the file escapes
apostrophes and contains brace-wrapped tokens that mislead naive patterns. Give the counts —
literal key occurrences, distinct keys, duplicated keys, of which conflicting and identical —
and state the rule that makes them matter: in a JavaScript object literal the later key wins, so
each conflicting earlier entry is dead code a reader would reasonably believe is live.

List the six identical duplicates with both line numbers each, and classify them as harmless
today and worth deduplicating for hygiene, keeping one.

Reproduce the five conflicts where the surviving value is already the better translation as a
table with four columns — key with both line numbers, the dead earlier value, the live later
value, and why the live one is right — carrying the reasons as given: the standard closed German
compound, the imperative for a button label, the correct French legal register, the idiomatic
overflow-menu phrasing rather than a calque, and the label form without the definite article.
The remedy for all five is to delete the dead earlier entry and change no translation.

Then the two conflicts that are a larger finding, where both values are wrong: the two vehicle
classes whose Arabic values are transliterations that disagree with each other — which is only
how the problem became visible — and the third class, transliterated consistently in both of its
copies, which is why the identical-duplicate check did not catch it. State the rule from the root
`CLAUDE.md` and `design-system/readme.md` §9 that product names are never translated, and decide
that the Arabic values for those three become the Latin names verbatim, in all four languages.
Name the existing mechanism that makes this a supported case rather than a layout hazard — the
LTR-island class defined in `design-system/tokens/laws.css`, already used for codes, references
and currency figures — and cite its line after verifying it. Flag for the owner, in the ADR
itself, that an Arabic reader will therefore see Latin class names: a deliberate brand
consequence of the never-translate rule, theirs to overturn if they disagree.

Record the fourth row of the same block: the entry holding a translated name for the vehicle
class the owner's decision 13 cut on 13 Aug 2026, which should be deleted along with the rest of
that class removal already listed in §I of the checklist, and whose Arabic is a genuine
translation rather than even a transliteration — a third inconsistency in one four-row block.

Cost of being wrong: nothing here can break a rendered surface today, since a duplicate key is
silently overridden and every live value is a valid string; the cost is dead translations nobody
knows are dead, and an Arabic reader seeing two different words for the same vehicle class on two
different screens. End with the implications section listing every edit — the seven dead entries
to delete, the six identical pairs to dedupe, the three Arabic product-name values to replace,
the cut-class entry to delete, and the LTR-island class where the names render in Arabic — plus
a note that the duplicate-key baseline recorded in the 260819-mdn plan drops once these land.
  </action>
  <verify>
    <automated>for f in .planning/ADR-011-data-tok-labels-stay-english.md .planning/ADR-012-dictionary-duplicates-and-product-names.md; do test -f "$f" || exit 1; grep -qi 'cost of being wrong' "$f" || exit 1; grep -q 'What this implies for the mock-copy pass' "$f" || exit 1; grep -q '2026-08-19' "$f" || exit 1; done && grep -q 'vamos-locale.js' .planning/ADR-011-data-tok-labels-stay-english.md && grep -q 'laws.css' .planning/ADR-011-data-tok-labels-stay-english.md && grep -q 'readme.md' .planning/ADR-011-data-tok-labels-stay-english.md && grep -q 'vamos-i18n-dict.js' .planning/ADR-012-dictionary-duplicates-and-product-names.md && grep -q 'vt-dir-keep' .planning/ADR-012-dictionary-duplicates-and-product-names.md && [ -z "$(git status --porcelain -- app/ design-system/ assets/)" ] && echo PASS</automated>
    <human-check>Each cited file:line in both ADRs resolves to what the ADR says it resolves to, spot-checked on the runtime opt-out lines, the CSS suffix rule, and at least three dictionary entries.</human-check>
  </verify>
  <done>ADR-011 and ADR-012 exist, each with a dated status, cited evidence read from the live tree, an explicit cost of being wrong in both directions, and an implications section listing the exact edits it authorises. ADR-011 recommends enforcement against the attribute the runtime implements. ADR-012 decides the Latin product names and flags the Arabic consequence to the owner. Nothing under `app/`, `design-system/` or `assets/` has changed.</done>
</task>

<task type="auto">
  <name>Task 3: Close the two pending entries against their ADRs</name>
  <files>docs/build/LEGAL-PLACEHOLDER-CHECKLIST.md</files>
  <action>
Rewrite the block that sits beneath the §D tally holding the two items recorded as pending and
unnumbered, so that both are closed and each points at the ADR that now carries it.

Its preamble currently explains that these items are unnumbered because the register was fixed
at its previous total for that pass and each needed an owner decision or a code change outside
that pass's file scope. That reason has expired for both: one is now a numbered conflict and the
other is a written decision. Replace the preamble with one that states what the block now is —
items settled since, each recorded in an ADR — without contradicting a register that has moved.

Close the pill-label entry by pointing it at `.planning/ADR-011-data-tok-labels-stay-english.md`
and stating the outcome in one line: labels stay English, the sixty-nine unkeyed ones are
compliant rather than debt, the twenty-one existing keys stay, and enforcement moves to the
runtime. Keep the measured evidence — ninety distinct labels, twenty-one keyed, sixty-nine not —
either in place or by an explicit pointer to the ADR that carries it; do not drop the numbers on
the floor, they are the reason the decision is defensible.

Close the provider-name entry by pointing it at
`.planning/ADR-010-privacy-subprocessor-list-cloudflare.md` and at its now-numbered row C27,
and correct it in passing: it records two occurrences, and there are four. State the corrected
count and let the ADR carry the detail rather than repeating all four sites here.

Change nothing else in the file. The three §D count sites must still read twenty-seven when this
task finishes, and the tally's buckets must still sum.
  </action>
  <verify>
    <automated>grep -q 'ADR-011-data-tok-labels-stay-english' docs/build/LEGAL-PLACEHOLDER-CHECKLIST.md && grep -q 'ADR-010-privacy-subprocessor-list-cloudflare' docs/build/LEGAL-PLACEHOLDER-CHECKLIST.md && [ "$(grep -c 'Conflicts register — 27' docs/build/LEGAL-PLACEHOLDER-CHECKLIST.md)" = 1 ] && [ "$(grep -c '27 documented conflicts' docs/build/LEGAL-PLACEHOLDER-CHECKLIST.md)" = 1 ] && [ "$(grep -c '^27 conflicts' docs/build/LEGAL-PLACEHOLDER-CHECKLIST.md)" = 1 ] && [ "$(git diff --name-only | grep -vcE '^(\.planning/ADR-01[012]-|docs/build/LEGAL-PLACEHOLDER-CHECKLIST\.md)')" = 0 ] && [ -z "$(git status --porcelain -- app/ design-system/ assets/)" ] && echo PASS</automated>
    <human-check>Read the rewritten block start to finish: it no longer claims the register is fixed at a total it has passed, both entries name their ADR, and the counted pill-label evidence is still reachable.</human-check>
  </verify>
  <done>Both formerly pending entries are closed against their ADRs, the corrected occurrence count is stated, the preamble no longer contradicts the register, the §D count still reads twenty-seven at all three sites, and `git diff --name-only` lists only the three ADR files and the checklist.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| repository → public web page | The privacy and cookie surfaces are read by a consumer, and by a regulator, as the operator's binding statement of who processes their data |
| ADR → the code pass that follows it | Each ADR's implications section is executed as written by a later pass; a wrong file:line there becomes a wrong edit |
| planning brief → written record | A figure carried forward from a brief without re-measurement becomes a fact the register then asserts on its own authority |
| decision → conflicts register | A settled item recorded outside the numbered register is a decision no future pass is obliged to read |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-UOQ-01 | Repudiation | privacy and cookies subprocessor disclosure | critical | mitigate | ADR-010 names all four occurrences rather than the two previously recorded, and registers the missing aviation-data processor. A notice naming a party that processes nothing while omitting one that processes flight numbers misstates the disclosure in both directions at once; recording only two of four sites would leave the consent banner — the first legal surface a visitor sees — still wrong after the fix pass believes itself finished. |
| T-UOQ-02 | Tampering | ADR file:line citations | high | mitigate | Every task re-reads each location from the live tree before citing it and prefers the tree over this plan. These ADRs are the authority the mock-copy pass follows, so a drifted line number silently redirects a legal-copy edit to the wrong element. |
| T-UOQ-03 | Tampering | pending values on legal surfaces | high | mitigate | The region stays a TBC gap and the cookie name and duration stay TBC, with the reason written down in ADR-010. Filling any of them to make a row look complete would manufacture a disclosure the owner never made and counsel never saw. |
| T-UOQ-04 | Tampering | `docs/build/LEGAL-PLACEHOLDER-CHECKLIST.md` §D | medium | mitigate | Three count sites and a five-bucket tally advance together, gated automatically on the new total appearing at all three and the old total appearing at none, with the arithmetic read by a human. A register that disagrees with itself is worse than one that is out of date, because it stops being usable as evidence. |
| T-UOQ-05 | Information disclosure | Arabic font fallback and the processor list | medium | transfer | C25 already records that the Arabic fallback hotlinks a third-party CDN, disclosing visitor IP to a party absent from the processor list. This pass does not reopen it; ADR-010 states the processor set it is working from so the two records agree rather than drift. |
| T-UOQ-06 | Denial of service | scope of this pass | low | mitigate | Every task gates on `git status --porcelain -- app/ design-system/ assets/` being empty, and Task 3 gates on the full diff naming only the four permitted files. A legal-copy edit made outside the reviewable mock-copy pass would ship unreviewed on a consumer page. |
| T-UOQ-SC | Tampering | npm/pip/cargo installs | low | accept | No package-manager installs occur. This pass writes Markdown only; the Package Legitimacy Gate does not apply and no audit table is required. |
</threat_model>

<verification>
1. `.planning/ADR-010-privacy-subprocessor-list-cloudflare.md`,
   `.planning/ADR-011-data-tok-labels-stay-english.md` and
   `.planning/ADR-012-dictionary-duplicates-and-product-names.md` all exist, each with a dated
   status line, an explicit cost of being wrong, and a closing implications section.
2. ADR-010's status records an accepted owner decision from the 2026-08-17 Q21 answer, not a
   fresh proposal, and names all four occurrence sites plus the missing processor row.
3. `docs/build/LEGAL-PLACEHOLDER-CHECKLIST.md` carries C27 in the C19–C26 row format, reads
   twenty-seven at all three §D count sites, reads twenty-six at none, and its tally buckets sum
   to twenty-seven with C27 in the open list.
4. The block beneath the tally closes both formerly pending items against their ADRs and no
   longer explains itself by a register total that has moved.
5. `git status --porcelain -- app/ design-system/ assets/` is empty.
6. `git diff --name-only` lists only the three ADR files and the checklist.
7. Spot-check: at least five file:line citations drawn from across the three ADRs resolve to what
   the ADR says they resolve to.
</verification>

<success_criteria>
Three decisions that existed only as prose, or not at all, are numbered ADRs at ADR-009's depth,
each ending with the exact edits it authorises. The conflicts register has moved from twenty-six
to twenty-seven consistently, its pending block is closed against those ADRs, and not one byte
under `app/`, `design-system/` or `assets/` has changed.
</success_criteria>

<output>
Create `.planning/quick/260819-uoq-record-three-decided-items-as-adrs-verce/260819-uoq-SUMMARY.md` when done
</output>
