---
phase: quick-260819-vjz
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - app/pages/privacy.dc.html
  - app/pages/cookies.dc.html
  - app/pages/CookieBanner.dc.html
  - app/home/CookieBanner.dc.html
  - app/vamos-i18n-dict.js
  - docs/build/LEGAL-PLACEHOLDER-CHECKLIST.md
autonomous: true
requirements: [SITE-05, SITE-06, I18N-01]
mode: quick

estimate:
  tokens: 35000
  raw_tokens: 35000
  tasks: 1
  confidence: low

must_haves:
  truths:
    - "A visitor reading the privacy processor table, the cookies strictly-necessary table, or either copy of the cookie-banner preferences sheet sees Cloudflare as the hosting party, and does not see the outgoing host name on any of those four consumer surfaces."
    - "The privacy §04 table names AeroDataBox as a processor of the flight number and arrival time the same page already collects, with a labelled TBC region pill and no invented country."
    - "The AeroDataBox description exists in English, German, French and Arabic in app/vamos-i18n-dict.js in the same pass; German uses ss and never the sharp-s character; the proper noun AeroDataBox stays Latin."
    - "The cookie-banner strictly-necessary meta line does not list AeroDataBox — it is a flight-data processor, not a cookie provider on that row."
    - "Every region and cookie-name gap that was a TBC pill before this pass is still a TBC pill after it, including the retitled hosting-region pill, the new AeroDataBox region pill, and the hosting-cookie name and duration cells."
    - "C27's disposition is RESOLVED (mocks corrected). The §D register still totals twenty-seven. The closing tally's buckets still sum to twenty-seven. C27 is no longer in the open list."
    - "The two CookieBanner.dc.html copies stay in lockstep on the strictly-necessary meta line and still differ only on the cookie-policy href, which is a per-folder relative path and is not 'fixed'."
    - "No glow, no new yellow tint, no repeating checker-mark behind body copy. Existing CookieBanner yellow-50 duration pills are left as they are."
    - "Nothing under archive/ or design-system/assets/fonts/ is modified. Cash-to-driver, C24 seeds, the contact-email rename, and every other §I work-order item stay untouched."
  artifacts:
    - "app/pages/privacy.dc.html — hosting row names Cloudflare; AeroDataBox row present with TBC region"
    - "app/pages/cookies.dc.html — Hosting-cookie Provider cell names Cloudflare"
    - "app/pages/CookieBanner.dc.html and app/home/CookieBanner.dc.html — strictly-necessary meta names Cloudflare"
    - "app/vamos-i18n-dict.js — processors block carries the AeroDataBox description in de/fr/ar"
    - "docs/build/LEGAL-PLACEHOLDER-CHECKLIST.md — C27 closed, §D arithmetic still sums, hosting-region token renamed, AeroDataBox region catalogued"
  key_links:
    - "privacy hosting row ↔ cookies Provider cell ↔ both CookieBanner meta lines: one party, four surfaces, all four or the disclosure is still false"
    - "privacy AeroDataBox row ↔ dict key 'Flight number and arrival time ·' ↔ the flight-number bullet already at privacy.dc.html:198"
    - "hosting-region TBC pill ↔ AeroDataBox-region TBC pill ↔ ADR-007 still proposed with counsel: neither pill may grow a country"
    - "C27 disposition ↔ §D header / heading / closing tally: close the row without moving the register total"
---

<objective>
Correct the four consumer-facing legal surfaces that still name the wrong hosting
party, add the missing AeroDataBox processor row with de/fr/ar in the same pass,
and close C27 against the mocks that now match ADR-010 / Q21.

Purpose: a privacy notice that names a party that processes nothing, while omitting
the aviation provider that reads a flight number tied to a booking, is a factual
misdisclosure under nFADP and GDPR. Phase 1 ports app/ as-is, so the mocks have to
be true before they become the spec. Per ADR-010.

Output: four markup swaps, one new processor row, one dictionary entry in four
languages, C27 closed. One commit. No invented region, price, or company value.
</objective>

<execution_context>
@$HOME/.claude/gsd-core/workflows/execute-plan.md
@$HOME/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@.planning/ADR-010-privacy-subprocessor-list-cloudflare.md
@.planning/ADR-007-edge-data-residency.md
@docs/build/LEGAL-PLACEHOLDER-CHECKLIST.md
@CLAUDE.md
</context>

<tasks>

<!-- planner-discipline-allow: Vercel -->
<!-- planner-discipline-allow: vercelRegion -->
<!-- planner-discipline-allow: {VERCEL_REGION} -->

<task type="tracer">
  <name>End-to-end C27 — four legal surfaces, AeroDataBox row, dictionary, register</name>
  <files>app/pages/privacy.dc.html, app/pages/cookies.dc.html, app/pages/CookieBanner.dc.html, app/home/CookieBanner.dc.html, app/vamos-i18n-dict.js, docs/build/LEGAL-PLACEHOLDER-CHECKLIST.md</files>
  <read_first>app/pages/privacy.dc.html, app/pages/cookies.dc.html, app/pages/CookieBanner.dc.html, app/home/CookieBanner.dc.html, app/vamos-i18n-dict.js, docs/build/LEGAL-PLACEHOLDER-CHECKLIST.md, .planning/ADR-010-privacy-subprocessor-list-cloudflare.md</read_first>
  <precondition>ADR-010 exists, C27 in docs/build/LEGAL-PLACEHOLDER-CHECKLIST.md is still OPEN, and the four consumer surfaces still name the outgoing host (privacy.dc.html hosting row, cookies.dc.html Hosting-cookie Provider cell, both CookieBanner strictly-necessary meta lines). Halt and report if any of those is already untrue — this pass assumes the live tree of 2026-08-19, not a half-applied edit.</precondition>
  <reversibility rating="reversible">Mock copy and a conflicts-register disposition; the live stack was already Cloudflare and the region pills stay TBC, so a later legal-wording pass can retitle any of these rows without a migration.</reversibility>
  <action>
Re-read every cited line from the live tree before editing. If a line number in this
plan disagrees with the tree, the tree wins. This is one atomic commit on purpose:
shipping the privacy table without the banner, or closing C27 while a consumer
surface still names the outgoing host, is a worse disclosure than leaving the
conflict open.

Do not open archive/, design-system/assets/fonts/, cash-to-driver, C24 seeds, the
contact-email rename, or any §I item other than the Q21 work-order bullet. Do not
fill any TBC pill. Do not restyle the CookieBanner yellow-50 duration chips (Law
01 / Law 02: they are pre-existing; this pass does not touch them). Do not add a
repeating background, a glow, or --vt-shadow-accent. Keep :root --vt-shadow-accent
at none and .vt-input--focus { box-shadow: none } exactly as they are.

Locked by ADR-010 / Q21 (2026-08-17), not re-decided here:

1. Privacy hosting row — live at app/pages/privacy.dc.html:233 inside section#processors.
   Change the data-dl-k text to Cloudflare. Retitle the data-tok pill from the
   outgoing-host region label to Cloudflare region. Keep data-vt-no-i18n, data-tok,
   and title="Awaiting a confirmed value from Vamos Taxi". The description
   Website hosting and delivery · is already keyed at app/vamos-i18n-dict.js:1425
   and must not be rewritten. Do not write a country or a region into that pill
   (ADR-007 is still proposed with counsel).

2. Cookies Hosting-cookie row — live at app/pages/cookies.dc.html:223. Change only
   the Provider cell (data-l="Provider") to Cloudflare. Leave the Name and Duration
   TBC pills (Hosting cookie, Hosting cookie duration) exactly as they are.

3. Cookie-banner strictly-necessary meta — live at app/pages/CookieBanner.dc.html:105
   and app/home/CookieBanner.dc.html:105, currently Vamos Taxi · Stripe · Supabase ·
   plus the outgoing host. Replace that last name with Cloudflare on both copies.
   Do not add AeroDataBox to this line. The two files are per-folder duplicates
   that already differ on one other line: the cookie-policy href (cookies.dc.html
   vs ../pages/cookies.dc.html). Preserve that href difference; lockstep means the
   meta line, not a byte-identical copy.

4. AeroDataBox row, per ADR-010 and Q21's restated list (Cloudflare, Supabase,
   Stripe, Resend, Mapbox, AeroDataBox, Sentry). The page already collects the
   data at app/pages/privacy.dc.html:198 (Flight number, where you gave one, and
   the arrival time we read from it.). Insert a new data-dl-r immediately after
   the Mapbox row (live :234) and before Resend (live :235), so the table order
   stays Stripe, Supabase, Cloudflare, Mapbox, AeroDataBox, Resend, Sentry,
   Analytics provider, Partner carriers — existing rows are not reordered. Shape
   it like the other unknown-region rows: data-dl-k AeroDataBox (Latin, no
   translation), data-dl-v starting Flight number and arrival time · then a
   data-vt-no-i18n data-tok pill labelled AeroDataBox region with the same title
   attribute the other region pills use. Voice: confident, plain, sentence case,
   short enough that German can grow 30 percent. Do not invent a country. Do not
   add Turnstile, KV, R2, Queues or Hyperdrive rows (same legal entity as the
   hosting row). Do not fill the Supabase region pill even though Q21 names
   eu-central Frankfurt — that value is a different token and is out of this
   pass. Do not move Sentry.

5. Dictionary, Law 03, same pass. Add one strings entry under the
   /* 04 · Processors */ block of app/vamos-i18n-dict.js, immediately after the
   Mapbox line (live :1426), keyed by the exact English source including the
   trailing space after the middle dot, matching the neighbouring keys:
   Flight number and arrival time ·
   de: Flugnummer und Ankunftszeit ·
   fr: Numéro de vol et heure d’arrivée · (apostrophe U+2019, same as
   neighbouring processor strings)
   ar: رقم الرحلة الجوية ووقت الوصول ·
   Swiss German: ss, never the sharp-s character (this German value has neither).
   Proper noun AeroDataBox stays Latin and gets no dictionary entry. Do not add
   a key for the four hosting-name swaps — grep of the dictionary for the
   outgoing host name is already 0 and must stay 0. Do not add a key for
   Cloudflare. Confirm the new key is not already present before inserting
   (duplicate keys silently override).

6. Close C27 in docs/build/LEGAL-PLACEHOLDER-CHECKLIST.md. Re-read the live §D
   block before touching counts.
   - C27 Handled cell: change the disposition from OPEN — remedy is a code edit
     outside this pass's file scope to RESOLVED (mocks corrected), stating that
     the four cited surfaces now name Cloudflare, the AeroDataBox row is present,
     and the region pills remain TBC. Keep the historical finding; do not pretend
     the conflict never existed.
   - Closing tally (live ~194–196): the register total stays 27. Move C27 out of
     the open bucket. Current buckets: 7 resolved by the 13 Aug answers, 7 closed
     by design, 1 resolved with stale mocks, 1 resolved as already-mitigated in
     markup (C26), 11 open including C27. After this pass: those first four
     buckets unchanged, plus 1 resolved (mocks corrected) (C27), plus 10 open
     (#7, #15, #16, C19–C25). 7+7+1+1+1+10 = 27. Keep the same dash character
     the open list already uses. Do not silently change any other conflict's
     count, severity, or disposition. Do not edit C22. Do not resurrect figures
     from docs/build/i18n-audit.txt or i18n-todo.txt.
   - Header sentence (~line 18) and ## D. heading stay at 27 documented
     conflicts / Conflicts register — 27. Those count the register, not the
     open subset.
   - §C Privacy tokens and §F legal.privacy.* table: rename the hosting-region
     token and key to the names Q21 already chose, {CLOUDFLARE_REGION} and
     legal.privacy.cloudflareRegion. Rewrite the flagged paragraph so it records
     that the mock now names Cloudflare and that the region value remains open
     with counsel. Add {AERODATABOX_REGION} / legal.privacy.aeroDataBoxRegion
     next to the other processor-region tokens, because this pass adds that
     TBC pill. Advance every subtotal that is a direct sum of those rows:
     Privacy 12→13, legal.privacy.* 14→15, §C 73→74, the header's catalogued
     sentence that adds §C+§G 9+§H 8 (90→91), the parenthetical 82/90 that
     rides on §C (83/91), and §F's 92 keys registered → 93. Re-count live
     data-tok pills in app/ after the new pill lands and update the header's
     live 121 / 90 unique figures to the measured numbers. Do not claim the
     catalogue and the live set are now matched — the header's unmatched-sets
     caveat stays.
   - §I Q21 work-order bullet (live ~609–610): mark it landed, and expand it to
     the four consumer surfaces plus the new processor row this pass actually
     edits, because the current bullet names only the privacy page. Do not
     action any other §I group.

7. Visual check after the markup is saved, because a previous session shipped a
   tiled checker-mark behind body copy that only a render caught. Serve the
   static tree from the repo root (relative paths; not file://). Open
   app/pages/privacy.dc.html #processors, app/pages/cookies.dc.html #necessary,
   and the cookies page's Change preferences sheet (vamos:cookie-prefs /
   openCookiePrefs) at 1440, 1024, 768 and 390. Confirm: no sideways scroll at
   390; the new privacy row stacks with the others (1-col below 620px, 200px
   key column at 620+); both region pills show the TBC suffix; the banner meta
   reads Cloudflare and does not list AeroDataBox; body copy sits on
   --vt-bg-page, not a repeating checker-mark (the 56px hero-corner stamp and
   the 14px TOC ticks are the only checker-mark.png uses, and they already
   carry no-repeat — do not add another). Switch the privacy page to German
   and to Arabic via VamosLocale.setLang and confirm the new description
   resolves and the Arabic table uses logical inline properties. If a render
   shows a tiled background, glow, or a new yellow tint, fix that regression
   in this same commit; do not leave it for later.
  </action>
  <verify>
    <automated>set -e
PRIV=app/pages/privacy.dc.html; COOK=app/pages/cookies.dc.html; BAN_P=app/pages/CookieBanner.dc.html; BAN_H=app/home/CookieBanner.dc.html; CHK=docs/build/LEGAL-PLACEHOLDER-CHECKLIST.md
if grep -q 'Vercel' "$PRIV" "$COOK" "$BAN_P" "$BAN_H"; then exit 1; fi
grep -q 'data-dl-k="1">Cloudflare<' "$PRIV"
grep -q '>Cloudflare region<' "$PRIV"
grep -q 'data-dl-k="1">AeroDataBox<' "$PRIV"
grep -q '>AeroDataBox region<' "$PRIV"
grep -q 'Flight number and arrival time ·' "$PRIV"
grep -q 'data-l="Provider">Cloudflare<' "$COOK"
if grep -q 'AeroDataBox' "$COOK" "$BAN_P" "$BAN_H"; then exit 1; fi
test "$(grep -c 'Vamos Taxi · Stripe · Supabase · Cloudflare' "$BAN_P")" = 1
test "$(grep -c 'Vamos Taxi · Stripe · Supabase · Cloudflare' "$BAN_H")" = 1
banner_extra=$(diff -u "$BAN_P" "$BAN_H" | grep -E '^[+-]' | grep -vE '^[+-]{3}' | grep -cv href= || true)
test "$banner_extra" = 0
node -e '
const fs=require("fs"); const src=fs.readFileSync("app/vamos-i18n-dict.js","utf8");
const g={window:{}}; Function("window","module","exports", src+"\n//# sourceURL=vamos-i18n-dict.js")(g.window,{},{});
const D=g.window.VamosI18n.strings; const k="Flight number and arrival time ·";
if(!D[k]) throw new Error("missing dict key");
for (const l of ["de","fr","ar"]) { if(!D[k][l]) throw new Error("missing "+l); }
if(/ß/.test(D[k].de)) throw new Error("sharp-s in de");
if(D[k].de!=="Flugnummer und Ankunftszeit ·") throw new Error("de mismatch");
if(D[k].fr!=="Numéro de vol et heure d’arrivée ·") throw new Error("fr mismatch");
if(D[k].ar!=="رقم الرحلة الجوية ووقت الوصول ·") throw new Error("ar mismatch");
console.log("dict-ok");
'
node .planning/quick/260819-279-stream-5-translation-draft-the-156-produ/i18n-measure.mjs --sharp-s | grep -q 'SHARP-S: 0'
grep -F '| C27 |' "$CHK"
grep -F 'RESOLVED (mocks corrected)' "$CHK"
test "$(grep -c '27 documented conflicts' "$CHK")" = 1
test "$(grep -c 'Conflicts register — 27' "$CHK")" = 1
grep -q '^27 conflicts' "$CHK"
grep -F '10 open (#7, #15, #16, C19–C25).' "$CHK"
if grep -q '11 open' "$CHK"; then exit 1; fi
grep -F 'legal.privacy.cloudflareRegion' "$CHK"
grep -F '{CLOUDFLARE_REGION}' "$CHK"
grep -F 'legal.privacy.aeroDataBoxRegion' "$CHK"
grep -F '{AERODATABOX_REGION}' "$CHK"
if grep -F 'legal.privacy.vercelRegion' "$CHK"; then exit 1; fi
if grep -F '{VERCEL_REGION}' "$CHK"; then exit 1; fi
if grep -n 'checker-mark.png' "$PRIV" "$COOK" | grep -v 'no-repeat' | grep -q .; then exit 1; fi
test -z "$(git status --porcelain -- archive/ design-system/assets/fonts/)"
extra=$(git status --porcelain | awk '{print $NF}' | grep -vE '^(app/pages/privacy\.dc\.html|app/pages/cookies\.dc\.html|app/pages/CookieBanner\.dc\.html|app/home/CookieBanner\.dc\.html|app/vamos-i18n-dict\.js|docs/build/LEGAL-PLACEHOLDER-CHECKLIST\.md)$' || true)
test -z "$extra"
echo PASS</automated>
    <human-check>Serve the repo root, open privacy #processors, cookies #necessary, and the cookie-preferences sheet at 1440 / 1024 / 768 / 390. Confirm Cloudflare on all four surfaces, AeroDataBox only on the privacy table, TBC on both region pills, no tiled checker behind body copy, no glow, German and Arabic resolve the new description.</human-check>
  </verify>
  <done>The four consumer legal surfaces name Cloudflare and not the outgoing host. Privacy §04 includes AeroDataBox with a four-language description and a TBC region. C27 is RESOLVED (mocks corrected), the §D total is still 27, the open list is 10 and does not include C27, and git diff names only the six permitted files.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| operator → visitor / regulator | Privacy, cookies and the consent banner are the operator's binding statement of who processes personal data |
| mock copy → Phase 1 port | Phase 1 ports app/ as-is; a wrong processor name in the mock becomes the production notice |
| TBC pill → filled value | Writing a country into a region pill manufactures a disclosure counsel has not signed |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-VJZ-01 | Information disclosure | privacy / cookies / CookieBanner processor identity | critical | mitigate | Swap the outgoing host for Cloudflare at all four cited sites in one commit, and add the AeroDataBox row that processes the flight number already collected at privacy.dc.html:198. Leaving any one surface behind is a remaining false disclosure. |
| T-VJZ-02 | Tampering | region and cookie-name TBC pills | high | mitigate | Retitle the hosting-region pill; do not fill it. Do not fill AeroDataBox region, Hosting cookie, or Hosting cookie duration. ADR-007 is still proposed. |
| T-VJZ-03 | Information disclosure | CookieBanner strictly-necessary meta | high | mitigate | Edit both per-folder copies in lockstep. Do not add AeroDataBox to the banner — it is not a cookie provider on that row, and listing it there would be a second false disclosure. |
| T-VJZ-04 | Repudiation | C27 disposition vs live mocks | high | mitigate | Close C27 only after the four-file grep for the outgoing host is 0 and the AeroDataBox row is present. The register total stays 27; only the open/resolved buckets move. |
| T-VJZ-05 | Tampering | §D / §C / §F arithmetic | medium | mitigate | Advance only the subtotals this pass actually moves (C27 out of open; one new region token). Do not rewrite C22 or resurrect superseded i18n snapshot figures. |
| T-VJZ-06 | Spoofing | tiled / glowing chrome on legal pages | medium | mitigate | Visual pass at 1440/1024/768/390; every checker-mark.png declaration keeps no-repeat; --vt-shadow-accent stays none. A previous session shipped a tiled body background that only a render caught. |
| T-VJZ-SC | Tampering | npm/pip/cargo installs | low | accept | No package-manager installs. Static HTML + one dictionary entry + a Markdown register. The Package Legitimacy Gate does not apply. |
</threat_model>

<verification>
1. grep of the four consumer files for the outgoing host name is 0; each names Cloudflare at the cited cell.
2. Privacy §04 contains an AeroDataBox row whose description matches the new dictionary key in de/fr/ar, with a TBC region pill and no country.
3. Neither CookieBanner copy nor the cookies table lists AeroDataBox.
4. The two CookieBanner files still differ only on the cookie-policy href.
5. C27 reads RESOLVED (mocks corrected); 27 documented conflicts / Conflicts register — 27 / 27 conflicts still hold; the closing open list is 10 and does not include C27; 7+7+1+1+1+10=27.
6. §F carries legal.privacy.cloudflareRegion and legal.privacy.aeroDataBoxRegion and no legal.privacy.vercelRegion.
7. i18n-measure --sharp-s prints SHARP-S: 0. git diff names only the six permitted files. archive/ and design-system/assets/fonts/ are untouched.
8. Rendered privacy, cookies and the preferences sheet at 1440/1024/768/390 show no tiled checker behind copy and no glow.
</verification>

<success_criteria>
A visitor on any of the four consumer legal surfaces is told the truth about who hosts the
site and who reads a flight number. C27 is closed against those mocks. No pending value
became a concrete one. German, French and Arabic ship with the new row.
</success_criteria>

<output>
Create `.planning/quick/260819-vjz-c27-swap-vercel-for-cloudflare-on-the-fo/260819-vjz-SUMMARY.md` when done
</output>
