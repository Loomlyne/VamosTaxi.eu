---
phase: quick-260819-mdn
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - .planning/quick/260819-279-stream-5-translation-draft-the-156-produ/i18n-measure.mjs
  - app/vamos-i18n-dict.js
  - docs/build/i18n-audit.txt
  - docs/build/i18n-todo.txt
  - docs/build/LEGAL-PLACEHOLDER-CHECKLIST.md
autonomous: true
requirements: [BLOCKER-S5]
mode: quick

estimate:
  tokens: 55000
  raw_tokens: 55000
  tasks: 3
  confidence: low

must_haves:
  truths:
    - "The residual is settled from the live tree by one committed, re-runnable harness, and the number reported is the number that harness prints — not a number carried forward from any snapshot file."
    - "Every string the harness reports as missing is classified into a named category before anything is written: correct-as-is (proper noun, brand, cookie name, address, template binding, TBC pill label) or genuinely customer-facing prose that must be translated. The two counts sum to the harness total, and that sum is shown."
    - "Nothing is added to `app/vamos-i18n-dict.js` that already has a key there. A duplicate key in the object literal silently overrides the original and would be a regression disguised as work, so an entry is added only after proving the exact string does not already resolve, and the duplicate count does not rise above its measured HEAD baseline of thirteen."
    - "The thirteen duplicate keys already present at HEAD — seven of them carrying conflicting values, so seven translations in the file are dead code a reader would reasonably believe is live — are reported with the winning value named for each of the seven, and are not silently fixed, because choosing between two live translations is a judgement for whoever has the pages open."
    - "If the measured customer-facing residual is zero, the plan reports zero and adds nothing. An empty deliverable that is true beats a filled one that duplicates existing entries."
    - "Every German value in the dictionary uses the Swiss `ss` digraph — zero sharp-s characters across all `de` values and all `de` pattern replacements, proved by loading the dictionary rather than grepping the file, because line 7 of the file names that character legitimately in a comment."
    - "Every dictionary entry and every pattern still carries all three of `de`, `fr` and `ar` after the pass."
    - "The two snapshot files each carry a dated marker at the top saying they are superseded and naming what supersedes them, and neither loses a single line of its existing content."
    - "C22 states the measured position instead of the stale one: it no longer quotes the figure it currently quotes, it names the snapshot file that produced that figure, it cites the dictionary-completeness finding, and its disposition reflects that it is close to resolved rather than open at the severity recorded."
    - "No `data-vt-legal` attribute is narrowed, widened or otherwise touched. The measurement says those attributes are substantially correct and the earlier plan's narrowing is cancelled."
    - "C26 is registered for the slot-caption scaffolding leak, with a counted number of slot blocks and a counted number of internal instruction strings, and its recommended remedy names the attribute the runtime actually honours rather than one it does not implement."
    - "The §D count reads twenty-six at all three sites — the opening sentence, the section heading, and the closing tally line — and read twenty-five at all three before the edit."
    - "The contradiction between the two instruction files about `data-tok` pill labels is recorded for the owner with the counted evidence that the repository is already inconsistent on it, and is recorded in a form that does not disturb the §D count."
    - "Nothing under `app/pages/`, `design-system/` or `assets/` is modified. `git status --porcelain app/pages/` is empty at the end of the run."
    - "Nothing is invented: no CHF figure, policy number, capacity, address or company detail appears anywhere it did not already exist, and no TBC gap becomes a concrete value in any language."
  artifacts:
    - ".planning/quick/260819-279-stream-5-translation-draft-the-156-produ/i18n-measure.mjs — committed as the reproducible evidence for every number this pass reports"
    - "app/vamos-i18n-dict.js — only if the measurement finds genuinely customer-facing prose still missing"
    - "docs/build/i18n-audit.txt and docs/build/i18n-todo.txt — dated superseded markers, contents intact"
    - "docs/build/LEGAL-PLACEHOLDER-CHECKLIST.md — C22 rewritten, C26 registered, three count sites advanced, contradiction recorded"
  key_links:
    - "The harness's printed table → C22's rewritten text → the two snapshot markers: one measurement feeds three consumers, so all three agree by construction"
    - "Dictionary key ↔ the exact DOM text node: a key that differs by an apostrophe or a collapsed space never resolves, so a key is only added after probing the exact extracted string"
    - "The runtime's real opt-out attribute ↔ C26's recommended remedy: a remedy naming a mechanism the runtime does not implement would be registered advice that cannot work"
    - "§D count sites ↔ each other: three sites, all three advance together or the register contradicts itself"
---

<objective>
Close Stream 5 of `.planning/BLOCKER-SOLVE-PLAN.md` on measured evidence rather than on a
snapshot, and correct the two register entries that were written from the snapshot.

Purpose: this backlog has now been re-derived three times from files that stopped being true,
and each derivation produced a smaller phantom than the last — 866, then 710/156, then 438,
then 8. The point of this pass is to stop the sequence: settle the number against the live
tree with a harness that can be re-run, write that number into the two places that quote it,
and mark the snapshot files so a fourth derivation is impossible.

Output: the harness committed as evidence; whatever genuinely remains untranslated, translated;
the two snapshot files marked superseded with their contents intact; C22 rewritten to the
measured position; C26 registered; the §D count advanced to twenty-six at all three sites; and
the `data-tok` pill-label contradiction between the two instruction files recorded for the
owner with the counted evidence that the repository is already inconsistent on it.

This is a quick task. It leads with a tracer — measure, classify, then write — because every
number downstream in this plan is the harness's number, and a plan that wrote first and
measured second would be the fourth phantom.
</objective>

<execution_context>
@$HOME/.claude/gsd-core/workflows/execute-plan.md
@$HOME/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@CLAUDE.md
@.claude/CLAUDE.md
@.planning/STATE.md
</context>

<established_facts>
Measured in the planning session on 2026-08-19 against the live tree, with the harness the
previous executor left behind at
`.planning/quick/260819-279-stream-5-translation-draft-the-156-produ/i18n-measure.mjs`. That
harness is complete and working — all four of its modes (`--calibrate`, `--all`,
`--pages a,b,c`, `--sharp-s`) are implemented, and it is currently untracked. It is the
evidence for everything below.

**The working tree is clean.** `git status --porcelain app/ docs/` prints nothing. The
dictionary at HEAD is what was measured; no earlier executor changed it.

**The dictionary is complete for prose.** 1427 string entries, 44 patterns, and the harness's
own dictionary check reports zero sharp-s characters across all `de` values and all `de`
pattern replacements.

**The dictionary already has duplicate keys at HEAD, and this is a live defect.** The file
holds **1440 literal keys** resolving to **1427 distinct** ones — **13 duplicates**. Six repeat
an identical value and are merely noise; **seven carry conflicting values**, so for those seven
the later occurrence silently wins and the earlier translation is dead code that a reader would
reasonably believe is live. The seven: `More actions`, `Vehicle class`, `Economy`, `Business`,
`Transfer voucher`, `Resend email`, `cookie policy`. Thirteen is therefore the **baseline** the
duplicate gate below allows, not zero — a gate at zero would fail before the executor touched
anything. This defect is reported in this pass, not fixed in it.

**The eight strings the task brief lists as needing translation all already resolve.** Each was
probed by extracting the exact visible text from its own source line — decoding entities,
collapsing whitespace, trimming — and looking it up in the loaded dictionary:

| # | page:line | result |
|---|---|---|
| 1 | `app/pages/terms.dc.html:254` — smoking / alcohol and food | exact key present |
| 2 | `app/pages/terms.dc.html:342` — snow, closed roads, strikes | exact key present (plus its two sibling nodes) |
| 3 | `app/pages/terms.dc.html:236` — partner carrier | exact key present |
| 4 | `app/pages/terms.dc.html:219` — the journey between the two addresses | exact key present |
| 5 | `app/pages/privacy.dc.html:203` — payment metadata only | exact key present |
| 6 | `app/pages/faq.dc.html:273` — Swiss law decides which seat | exact key present |
| 7 | `app/pages/faq.dc.html:188` — driver's name, vehicle and telephone | exact key present, and its trailing sibling node too |
| 8 | `app/pages/cancellation.dc.html:285` — of your cancellation confirmation | matched by an existing `patterns` entry |

Entries 7 and 8 are not JS concatenations. They are single text nodes split by an inline
`data-tok` pill that already carries `data-vt-no-i18n="1"`, so the runtime looks up each side
as its own node — and both sides already have keys. **No new `patterns` entry is required for
either.** The brief's instruction to add two pattern entries would add regexes for strings that
already resolve exactly.

**The whole live residual is thirty-two strings, and none of them is prose.** `--all` reports:

| page | candidates | resolved | missing |
|---|---|---|---|
| terms | 122 | 122 | **0** |
| privacy | 116 | 110 | 6 |
| cookies | 67 | 61 | 6 |
| cancellation | 93 | 93 | **0** |
| imprint | 63 | 56 | 7 |
| become-a-partner | 62 | 58 | 4 |
| contact | 60 | 51 | 9 |
| about | 71 | 71 | **0** |
| faq | 52 | 52 | **0** |

legal 19, product 13. Enumerated, every one of the thirty-two is a proper noun, a brand name,
an email address, a company identifier, a cookie name, a template binding or a placeholder
example: `info@vamostaxi.eu`, `Stripe Payments Europe Ltd`, `Supabase`, `Vercel`, `Mapbox`,
`Sentry`, `Stripe`, `Vamos Taxi`, `__stripe_mid · __stripe_sid`, `GmbH`,
`CH-020.4.077.792-7`, `WhatsApp`, `vamostaxi.eu`, `Ben Othman Houssein`, `Ben Othman`,
`Phone{{ phoneOpt }}`, `Email{{ emailOpt }}`, `you@example.com`, `Bleicherstrasse 16`,
`VT-0000`, `Facebook`, `Instagram`, `YouTube`, `Trustpilot`.

The harness's own header states its counts are an **upper bound** on the real gap — its regex
subtree skip can under-shoot the runtime's TreeWalker, never over-shoot it. An upper bound of
thirty-two, all thirty-two correct as they stand, means the customer-facing prose residual on
these nine pages is **zero**. The executor re-proves this rather than taking it from here.

**The blind spot to name, not to close.** The harness reads `.dc.html` source and skips
`<script>`, so strings the page's own JavaScript builds at runtime are outside what it can
see. `docs/build/i18n-audit-js.txt` is the record of those. This pass does not measure them
and must say so rather than implying full coverage.

**The runtime's opt-out attribute is `data-vt-no-i18n` (or `translate="no"`).**
`app/vamos-locale.js` rejects such a node and its subtree at lines 216, 256 and 477.
`data-i18n-skip` appears **zero times** in `app/vamos-locale.js` — the root `CLAUDE.md`
names it, but the runtime does not implement it. C26's remedy must therefore name
`data-vt-no-i18n`, or name adding `data-slot` to the runtime's own reject list, and must flag
that `data-i18n-skip` is documented but not wired.

**The slot blocks count seventeen**, matching §B: `grep -c 'data-slot="1"'` gives terms 8,
privacy 2, cookies 0, cancellation 3, imprint 4.

**The pill-label contradiction is already live in the repository, not hypothetical.** Across
`app/pages/*.dc.html` there are **90 distinct `data-tok` pill labels**. **21 of them already
have a dictionary key**; **69 do not**. So the repository has already half-implemented both
readings of the two instruction files at once. That count is the evidence the owner needs.

**The three §D count sites**, all currently reading twenty-five:
`docs/build/LEGAL-PLACEHOLDER-CHECKLIST.md` line 18 (the opening sentence), line 162 (the
`## D.` heading), and line 192 (the closing tally). C22 is at line 187, C25 at line 190.

**A finding outside this pass's remit, recorded here so it is not lost.**
`app/pages/privacy.dc.html:233` names **Vercel** as the website-hosting subprocessor and
`app/pages/cookies.dc.html:223` names **Vercel** as the hosting-cookie provider — on live
consumer-facing legal pages — while `PROJECT.md` fixes the stack as Cloudflare Workers with
"no Vercel anywhere", and the subprocessor set recorded under C25 (Cloudflare, Supabase,
Stripe, Resend, Mapbox, AeroDataBox, Sentry) does not include Vercel. A privacy notice naming
the wrong data processor is an nFADP/GDPR transparency problem, not a typo. It is **not
registered as a numbered conflict in this pass**, because the brief fixes the §D count at
twenty-six and a new number would break that gate, and because the remedy is an edit to two
legal pages this pass may not touch. It is carried in the summary and in the note beneath the
§D tally as a pending registration for the next stream.

**No package-manager installs occur in this task.** The harness is zero-dependency Node ESM.
The Package Legitimacy Gate does not apply.
</established_facts>

<tasks>

<task type="tracer">
  <name>Task 1: Settle the residual against the live tree and translate only what genuinely misses</name>
  <files>.planning/quick/260819-279-stream-5-translation-draft-the-156-produ/i18n-measure.mjs, app/vamos-i18n-dict.js</files>
  <precondition>`git status --porcelain app/ docs/` prints nothing before you begin. If either tree is dirty, stop — this pass gates on proving that `app/pages/` is untouched at the end, and a pre-existing modification there would make that gate meaningless.</precondition>
  <action>
This is the thin end-to-end slice: measure, classify, decide, write only what the measurement
justifies. Everything Tasks 2 and 3 write is this task's number.

**Run the harness first, before reading anything else.** It already exists and needs no
changes:

    node .planning/quick/260819-279-stream-5-translation-draft-the-156-produ/i18n-measure.mjs --calibrate
    node .planning/quick/260819-279-stream-5-translation-draft-the-156-produ/i18n-measure.mjs --all

Calibration runs three surfaces the old snapshot records at zero missing. A small residual on
those is expected and is copy added since; a large one means the extractor is wrong and
everything downstream is void. Record what you get.

**Then enumerate the missing strings, not just their count.** The `--all` mode prints totals
only. Get the list itself — the simplest honest route is to copy the harness to a scratch
directory exactly three levels below the repository root (its own `REPO_ROOT` is
`path.resolve(__dirname, '..','..','..')`, so a copy at `.planning/quick/<scratch>/m.mjs`
resolves correctly), add a loop that prints `r.missing` after `printTable(results)` in the
`--pages` branch, run it, and delete the scratch copy. Do not modify the committed harness to
do this; it is the evidence artefact and must stay as it is.

**Classify every string the harness reports, before writing a single dictionary entry.** Two
buckets, and their counts must sum to the harness total. Show the sum.

- **Correct as it stands.** Proper nouns and brand names (`Stripe`, `Supabase`, `Mapbox`,
  `Sentry`, `WhatsApp`, `Facebook`, `Instagram`, `YouTube`, `Trustpilot`, `Vamos Taxi`),
  company identifiers and legal-entity strings, email addresses and domains, street addresses,
  cookie names, reference codes, placeholder examples such as `you@example.com` and `VT-0000`,
  `{{ … }}` template bindings which are expressions rather than literals, and TBC pill labels.
  None of these acquires a dictionary key. The imprint's hardcoded German `lang="de"` spans are
  also correct as they stand and are not a gap.
- **Genuinely customer-facing prose.** A sentence, heading, hint, error, empty state or label a
  traveller or applicant actually reads. This is the only bucket that gets translated.

**The expected outcome of that classification is that the second bucket is empty.** The
planning session measured an upper bound of thirty-two strings and every one of them fell in
the first bucket; the eight strings the task brief names were each probed against the exact
text extracted from their own source line and each already resolves, four of them on a page
the harness now reports at zero missing. **If your classification agrees, add nothing and say
so plainly.** An empty deliverable that is true is the correct result here, and it is the whole
point of re-measuring rather than executing the brief's list on faith.

**Before adding any entry, prove the exact string is absent.** Load the dictionary through the
`global.window` shim the harness uses and test the extracted string for an own-property key and
against every pattern. `app/vamos-i18n-dict.js` is a single object literal: a duplicate key
silently overrides the first occurrence, so adding a key that already exists is a regression
that loading the file would hide, because the loader dedupes. A string that differs from an
existing key by a typographic apostrophe, a non-breaking space or an entity decoding is a
different string — resolve which one the DOM actually produces and key that one.

**Report the duplicate-key defect the baseline exposes, and do not fix it.** The file holds
1440 literal keys against 1427 distinct — thirteen duplicates, of which seven carry conflicting
values (`More actions`, `Vehicle class`, `Economy`, `Business`, `Transfer voucher`,
`Resend email`, `cookie policy`). For those seven the later occurrence wins and the earlier
translation never renders. Confirm the count yourself, and for each of the seven state **which
value is currently live** — that is the fact whoever fixes it will need. Do not choose between
the two translations here: that is a judgement for a pass that has the pages open, and picking
one blind would change rendered copy in three languages under cover of a measurement task.
Carry it into the summary alongside the other pending findings.

**If, and only if, the second bucket is non-empty**, add its entries in the file's existing
shape: one entry per line, `'English key': { de: '…', fr: '…', ar: '…' },`, filed under the
existing section comment for that page (`/* ── Contact page ─── */`, `/* ── FAQ page ─── */`,
`/* ── About page ─── */`, and the become-a-partner entries under the section already holding
them). Do not restructure, reorder or reformat existing entries; this file is
append-and-insert only.

Voice: formal *Sie* in German, as every existing entry uses. Swiss German — the `ss` digraph,
never the sharp-s. Read a dozen neighbouring entries in each of the three languages first and
make the new ones sound like siblings. Arabic is real Arabic, right-to-left, following the
existing entries' handling of embedded Latin references and figures. Never translate
`Vamos Taxi`, `Economy`, `Business`, `Van`, "Ride with class", `ZRH`, `CHF`, `VT-` references
or cookie names. Invent nothing: a sentence sitting beside a `data-tok` gap carries the same
gap in every language, and turning a pending window or a pending reply time into a figure would
manufacture a consumer promise in three languages the owner never made in one.

**Then commit the harness as it stands.** It is currently untracked and it is the evidence for
every number in this pass; an unversioned harness makes the number unreproducible the moment
this directory is cleaned.

**Do not touch `app/pages/` at all.** The earlier plan's `data-vt-legal` narrowing is cancelled
— the measurement says those attributes are substantially correct. Widen nothing, narrow
nothing, edit no copy.

Report, for the summary: the calibration residual; the nine-page table; the two bucket counts
and their sum; how many entries you added; and the harness's blind spot on runtime-built
strings, named rather than implied away.
  </action>
  <verify>
    <automated>node .planning/quick/260819-279-stream-5-translation-draft-the-156-produ/i18n-measure.mjs --calibrate && node .planning/quick/260819-279-stream-5-translation-draft-the-156-produ/i18n-measure.mjs --all</automated>
    <automated>node .planning/quick/260819-279-stream-5-translation-draft-the-156-produ/i18n-measure.mjs --sharp-s | grep -qx 'SHARP-S: 0'</automated>
    <automated>node -e "global.window={};require('./app/vamos-i18n-dict.js');const D=window.VamosI18n;let bad=[];for(const k in D.strings){const e=D.strings[k];for(const l of ['de','fr','ar'])if(!e[l]||!String(e[l]).trim())bad.push(l+' :: '+k)}for(const p of D.patterns)for(const l of ['de','fr','ar'])if(!p[l])bad.push(l+' :: '+p.re);if(bad.length){console.error(bad.slice(0,20).join('\n'));process.exit(1)}console.log('ALL-FOUR-LANGS OK '+Object.keys(D.strings).length+' entries, '+D.patterns.length+' patterns')"</automated>
    <automated>node -e "const s=require('fs').readFileSync('app/vamos-i18n-dict.js','utf8');const m=[...s.matchAll(/^\s{6}'((?:[^'\\\\]|\\\\.)*)':\s*\{/gm)].map(x=>x[1]);const n=m.length-new Set(m).size;console.log('duplicate keys: '+n+' (HEAD baseline 13), literal keys '+m.length);if(n>13){console.error('NEW DUPLICATE KEY INTRODUCED');process.exit(1)}"</automated>
    <automated>test -z "$(git status --porcelain app/pages/ design-system/ assets/)"</automated>
    <automated>git ls-files --error-unmatch .planning/quick/260819-279-stream-5-translation-draft-the-156-produ/i18n-measure.mjs >/dev/null 2>&1 || git add -N .planning/quick/260819-279-stream-5-translation-draft-the-156-produ/i18n-measure.mjs</automated>
  </verify>
  <done>The harness runs clean in all three modes and its nine-page table is recorded. Every string it reports as missing is classified into one of the two named buckets and the counts sum to its total, with the sum shown. Any entry added was proved absent first, and the duplicate count is still at or below its HEAD baseline of thirteen. The seven conflicting-value duplicates are reported with the currently live value named for each, and none of them is changed. Zero sharp-s characters across all `de` values and `de` pattern replacements, proved by loading the dictionary. Every entry and pattern carries `de`, `fr` and `ar`. `app/pages/`, `design-system/` and `assets/` are untouched. The harness is tracked in git. The runtime-built-string blind spot is stated, not implied away.</done>
</task>

<task type="auto">
  <name>Task 2: Mark the two snapshot files superseded so nobody derives a fourth phantom backlog</name>
  <files>docs/build/i18n-audit.txt, docs/build/i18n-todo.txt</files>
  <precondition>Task 1's nine-page table exists. The marker quotes that table's totals, so writing it first would put an unmeasured number into the file this pass exists to correct.</precondition>
  <action>
Both files are snapshots taken before the dictionary was filled in, and both are still cited —
`grep -rln 'i18n-audit\|i18n-todo' docs/ .planning/` finds them referenced from
`docs/build/GSD-LAUNCH.md`, `docs/build/MISSING-FEATURES.md`,
`docs/build/LEGAL-PLACEHOLDER-CHECKLIST.md`, `.planning/BLOCKER-SOLVE-PROMPT.md` and two
`.planning/codebase/` documents. Every re-derivation of this backlog has started from one of
them. Marking them is the durable half of this pass.

Prepend a short dated block to the top of each. **Preserve every existing line** — this is an
insertion at the top, not a rewrite, and the files' own contents remain the historical record.

Each block states, in plain sentences:

- that the file is a snapshot superseded on 2026-08-19 and must not be cited as current;
- what it reports (the audit's per-page missing totals; the todo file's line count) and what
  the live tree reports instead, quoting Task 1's per-page table and its totals;
- the concrete proof that it is stale — the audit still lists the string
  `English · Deutsch to follow`, which no longer exists anywhere under `app/`;
- that the live number is produced by
  `.planning/quick/260819-279-stream-5-translation-draft-the-156-produ/i18n-measure.mjs`,
  naming its `--all` mode, so the reader re-runs it rather than trusting either number;
- that the harness's counts are an upper bound on the real gap, per its own header, and that
  strings built by the page's JavaScript at runtime are outside what it measures —
  `docs/build/i18n-audit-js.txt` is the record of those.

Use the comment convention each file already uses so the block reads as part of the file rather
than as something pasted on top of it. Invent nothing: every figure in these blocks comes from
Task 1's run.
  </action>
  <verify>
    <automated>head -12 docs/build/i18n-audit.txt | grep -q '2026-08-19' && head -12 docs/build/i18n-todo.txt | grep -q '2026-08-19'</automated>
    <automated>head -12 docs/build/i18n-audit.txt | grep -qi 'supersede' && head -12 docs/build/i18n-todo.txt | grep -qi 'supersede'</automated>
    <automated>head -12 docs/build/i18n-audit.txt | grep -q 'i18n-measure.mjs' && head -12 docs/build/i18n-todo.txt | grep -q 'i18n-measure.mjs'</automated>
    <automated>grep -q 'terms  strings:204' docs/build/i18n-audit.txt && grep -q '=== terms (102)' docs/build/i18n-todo.txt</automated>
    <automated>test "$(wc -l < docs/build/i18n-audit.txt)" -gt 883 && test "$(wc -l < docs/build/i18n-todo.txt)" -gt 604</automated>
  </verify>
  <done>Both files carry a dated superseded block in their first twelve lines, naming the harness and quoting Task 1's measured totals against their own. Both files' original opening data lines survive and both files are longer than they were, so no content was dropped. The upper-bound caveat and the runtime-built-string blind spot are both stated.</done>
</task>

<task type="auto">
  <name>Task 3: Correct C22, register C26, advance the §D count, and record the pill-label contradiction</name>
  <files>docs/build/LEGAL-PLACEHOLDER-CHECKLIST.md</files>
  <precondition>Task 1's measured table exists, and `grep -n 'documented conflicts' docs/build/LEGAL-PLACEHOLDER-CHECKLIST.md` plus the `## D.` heading and the closing tally line agree on the same numeral before you edit. If the three sites already disagree, say so and reconcile them to the same starting value first, because advancing three sites that started apart would hide a pre-existing inconsistency rather than fix it.</precondition>
  <action>
Apply every change here as a scoped `Edit`. Never rewrite this file whole.

**First, rewrite C22 at line 187.** It was written from `docs/build/i18n-audit.txt` and asserts
a figure and a false-coverage claim the live tree does not support. Its replacement states the
measured position:

- the dictionary holds the entry and pattern counts Task 1 measured, and the completeness check
  finds no entry missing `de`, `fr` or `ar`;
- the per-page residual on the five legal pages from Task 1's table, and that every string in
  that residual is a proper noun, brand name, identifier, cookie name, address or template
  binding rather than prose;
- therefore `data-vt-legal="en de fr ar"` on those five pages is **substantially borne out** by
  the dictionary, and **no attribute is narrowed** — the earlier remediation is cancelled;
- plainly, in the row itself, that the figure this row previously carried came from a stale
  snapshot, naming `docs/build/i18n-audit.txt` as that snapshot and noting it is now marked
  superseded;
- the disposition changed accordingly — this is close to resolved, not open at the severity
  recorded. Keep whatever residual is genuinely still open (the runtime-built strings the
  harness cannot see) named as the residual, so the row does not overclaim in the opposite
  direction.

The row must no longer carry the numeral it currently quotes as the untranslated-legal-strings
count. Removing that numeral is the point of the rewrite; the gate below checks it is gone.

**Then register C26**, immediately after C25, in the same row format the other C-rows use.
Substance:

- the seventeen `data-slot="1"` blocks on the five legal pages (terms 8, privacy 2, cookies 0,
  cancellation 3, imprint 4 — matching §B's count of seventeen) contain internal drafting
  instructions addressed to a lawyer, not consumer copy. Count them yourself with the same
  extraction Task 1 used and state the number you got; the planning session's figure is
  fifty-one and a different number is a finding, not an error to hide;
- `app/vamos-locale.js` does not opt `data-slot` out — its reject list is `data-vt-no-i18n` and
  `translate="no"` at lines 216, 256 and 477 — so the runtime treats these reviewer notes as
  shippable copy and translates them, against the root `CLAUDE.md` rule that review scaffolds
  stay English on purpose;
- remedy to **recommend, not perform**: put `data-vt-no-i18n` on the seventeen slot containers,
  or add `data-slot` to the runtime's own reject list. Note explicitly that the root
  `CLAUDE.md` names `data-i18n-skip` for this purpose but `app/vamos-locale.js` implements no
  such attribute — a remedy written against the documented name would not work, and the
  documentation-versus-runtime mismatch is itself worth the owner knowing;
- severity medium, disposition OPEN.

**Then advance the count at all three sites** — the opening sentence near line 18, the `## D.`
heading at line 162, and the closing tally at line 192 — each by one, to twenty-six. Line 192
also breaks the total down into resolved/closed/open groups; C26 joins the open group and the
group figures must still sum to the new total. Verify the three sites agreed before your edit
and agree after it.

**Then record the instruction-file contradiction**, as a short named note directly beneath the
§D closing tally. It is **not** a numbered conflict — the brief fixes this register at
twenty-six and a new number would contradict the count you just set — so label it explicitly as
a recorded contradiction awaiting an owner decision rather than as a register row. It states:

- the root `CLAUDE.md` says the only copy that stays English on purpose is internal, naming TBC
  placeholder labels among it; `.claude/CLAUDE.md` §Copy Voice says copy inside `[data-tok]`
  pills is to be translated in place;
- this pass follows the root file, because it is the project-rules file and it is unambiguous —
  so TBC pill labels stay English here;
- the repository is already inconsistent on the question, and this is the number that shows it:
  across `app/pages/*.dc.html` there are ninety distinct `data-tok` pill labels, of which
  twenty-one already have a dictionary key and sixty-nine do not. Re-count these yourself and
  state the numbers you got;
- it decides whether roughly ninety pill labels are a translation obligation, so it needs
  settling once rather than being re-decided per pass.

**Finally, in the same note area, record the pending registration** carried in
`<established_facts>`: `app/pages/privacy.dc.html:233` names Vercel as the website-hosting
subprocessor and `app/pages/cookies.dc.html:223` names Vercel as the hosting-cookie provider,
on consumer-facing legal pages, while `PROJECT.md` fixes the stack as Cloudflare Workers with
no Vercel anywhere and the subprocessor set recorded under C25 does not include Vercel. State
that it is **not** numbered in this pass — the count is fixed at twenty-six and the remedy is
an edit to two legal pages this pass may not touch — and that it should be registered and fixed
by the stream that next opens those files. Do not edit either page.

Do not edit C25's substance, and do not alter any other row.
  </action>
  <verify>
    <automated>test "$(grep -c 'Conflicts register — 26' docs/build/LEGAL-PLACEHOLDER-CHECKLIST.md)" = "1"</automated>
    <automated>test "$(grep -c '26 documented conflicts' docs/build/LEGAL-PLACEHOLDER-CHECKLIST.md)" = "1"</automated>
    <automated>test "$(grep -c '^26 conflicts' docs/build/LEGAL-PLACEHOLDER-CHECKLIST.md)" = "1"</automated>
    <automated>test "$(grep -cE 'register — 25|25 documented conflicts|^25 conflicts' docs/build/LEGAL-PLACEHOLDER-CHECKLIST.md)" = "0"</automated>
    <automated>test "$(grep -c '^| C26 |' docs/build/LEGAL-PLACEHOLDER-CHECKLIST.md)" = "1"</automated>
    <automated>grep '^| C26 |' docs/build/LEGAL-PLACEHOLDER-CHECKLIST.md | grep -q 'data-vt-no-i18n' && grep '^| C26 |' docs/build/LEGAL-PLACEHOLDER-CHECKLIST.md | grep -q 'data-slot'</automated>
    <automated>grep '^| C22 |' docs/build/LEGAL-PLACEHOLDER-CHECKLIST.md | grep -q 'i18n-audit.txt'</automated>
    <automated>test "$(grep -c '^| C22 .*438' docs/build/LEGAL-PLACEHOLDER-CHECKLIST.md)" = "0"</automated>
    <automated>test -z "$(git status --porcelain app/pages/ design-system/ assets/)"</automated>
    <human-check>Read the rewritten C22 row and the new C26 row cold, as the next person to open this register. Does C22 now say what the tree shows, name the snapshot that misled it, and stop short of claiming the opposite overclaim — that translation coverage is complete when runtime-built strings were never measured? Does C26's remedy name an attribute the runtime actually honours? And does the note beneath the tally make the pill-label question look like a decision waiting for the owner rather than a resolved matter? Neither the note nor the tone of C22 is greppable; both are the point of the correction.</human-check>
  </verify>
  <done>C22 states the measured position, names `docs/build/i18n-audit.txt` as the stale source, no longer carries the figure it previously quoted, and its disposition reflects close-to-resolved with the runtime-built-string residual named. C26 is registered once, in the register's row format, citing the seventeen slot blocks with a counted instruction-string number, naming `data-slot` and `data-vt-no-i18n`, and flagging that `data-i18n-skip` is documented but not implemented. All three §D count sites read twenty-six and none reads twenty-five, and the tally's group figures sum to the new total. The pill-label contradiction is recorded beneath the tally with its ninety / twenty-one / sixty-nine evidence and labelled as awaiting an owner decision rather than as a numbered conflict. The Vercel subprocessor finding is recorded as a pending registration. Nothing under `app/pages/`, `design-system/` or `assets/` changed.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| repository → public web page | Legal and privacy copy, and the language coverage a page asserts, are read by consumers as the operator's binding statement |
| snapshot document → future planning pass | A stale figure quoted as current re-scopes work that does not exist, three times so far |
| English source copy → translated copy | Each language boundary is a place a pending TBC gap can silently become an asserted value |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-S5R-01 | Tampering | `app/vamos-i18n-dict.js` | high | mitigate | Task 1 proves a string is absent before adding a key, and the duplicate-key gate fails the run if a key appears twice. `app/vamos-i18n-dict.js` is one object literal, so a duplicate key silently overrides the original — a regression that would otherwise pass every other gate in this plan. |
| T-S5R-02 | Tampering | TBC pill labels and the strings beside them | high | mitigate | Task 1 forbids turning any `data-tok` gap into a concrete value in any language. A pending cancellation window or reply time rendered as a figure in de/fr/ar manufactures a consumer promise in three languages the owner never made in one. |
| T-S5R-03 | Repudiation | `data-vt-legal` on the five legal pages | medium | accept | The measurement shows the attributes are substantially borne out, so this pass narrows nothing and the gate proves `app/pages/` is untouched. The residual risk — runtime-built strings the static harness cannot see — is named in C22 rather than closed, so the row does not overclaim in the opposite direction. |
| T-S5R-04 | Information disclosure | `data-slot` reviewer instructions | medium | accept | The seventeen slot blocks leak internal drafting instructions to the translation runtime and would ship as consumer copy. The remedy is markup on pages outside this pass's permitted scope, so it is registered as C26 with a counted number and a remedy naming the attribute the runtime honours, rather than performed. |
| T-S5R-05 | Repudiation | privacy and cookies subprocessor lists | high | transfer | Both pages name Vercel as a data processor the project does not use. Outside this pass's file scope; recorded as a pending registration beneath the §D tally and escalated in the summary so the stream that next opens those pages fixes it. |
| T-S5R-SC | Tampering | npm/pip/cargo installs | low | accept | No package-manager installs occur. The harness is zero-dependency Node ESM run from the repository. The Package Legitimacy Gate does not apply and no audit table is required. |
</threat_model>

<verification>
1. `node .planning/quick/260819-279-stream-5-translation-draft-the-156-produ/i18n-measure.mjs --all` runs clean, and its table is the number quoted in both snapshot markers and in C22.
2. Loading the dictionary reports zero sharp-s characters across every `de` value and `de` pattern replacement, and every entry and pattern carries `de`, `fr` and `ar`.
3. The dictionary's duplicate-key count is still thirteen or fewer, and the seven conflicting-value duplicates are reported with the live value named for each.
4. `git status --porcelain app/pages/ design-system/ assets/` is empty.
5. `git diff --stat` touches only the files listed in `files_modified`.
6. Both snapshot files are longer than they were and their original opening data lines survive.
7. The three §D count sites all read twenty-six and none reads twenty-five; the tally's group figures sum to twenty-six.
8. `VamosLocale.coverage()` in a real DOM: attempt it. There is no `package.json`, no `node_modules` and no headless browser on this machine, so it will most likely be unavailable without a network install. If so, say exactly that in the summary and name the static harness as what was checked instead. Do not describe a static measurement as a coverage run.
9. The summary reports the measured numbers and states plainly that the 866 and 604 figures previously in circulation came from `docs/build/i18n-audit.txt` and `docs/build/i18n-todo.txt` respectively, that both are snapshots taken before the dictionary was filled in, and that both are now marked superseded.
</verification>

<success_criteria>
- The residual is settled from the live tree by a committed, re-runnable harness, and every number this pass writes is that harness's number.
- Whatever genuinely remained untranslated is translated, in the existing dictionary's voice, with Swiss `ss` throughout — and if nothing remained, the pass says so plainly rather than manufacturing work.
- No new dictionary key is duplicated, the seven pre-existing conflicting duplicates are reported rather than silently resolved, and no TBC gap became a concrete value in any language.
- The two snapshot files can no longer be mistaken for current, with their contents intact.
- C22 says what the tree shows, names what misled it, and neither overclaims nor underclaims.
- C26 is registered with a counted number and a remedy that names a mechanism the runtime actually implements.
- The §D count is consistent at twenty-six across all three sites.
- The pill-label contradiction and the Vercel subprocessor finding are both recorded for the owner rather than silently decided or silently dropped.
</success_criteria>

<output>
Create `.planning/quick/260819-mdn-stream-5-resumed-translate-the-8-residua/260819-mdn-SUMMARY.md` when done.
</output>
