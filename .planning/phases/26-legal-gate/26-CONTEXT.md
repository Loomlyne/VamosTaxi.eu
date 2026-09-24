# Phase 26: Legal gate - Context

**Gathered:** 2026-09-23
**Status:** Ready for planning

<domain>
## Phase Boundary

This phase is the lock. It does not load the pixel.

Add empty Meta TBC slots on the live banner, the cookies page, and the privacy page. No legal sentence in those slots. Leave the existing "Necessary cookies only" line in place. Keep the Meta flag off. Do not load `fbevents.js`. Do not send Purchase. Do not change quote, pay, or confirmation.

The gate stays closed until Koss's own lines are on those three live pages, in English, German, French, and Arabic. This phase does not contain those lines. He has not sent them. Do not write them. Do not translate them.

Later phases in this same milestone wire the pixel. They are not parked for a later milestone. They still cannot turn the pixel on while this gate is closed.

</domain>

<decisions>
## Implementation Decisions

### What counts as the lines being in
- **D-01:** The gate opens only when the Meta TBC pills are gone, in en, de, fr, and ar.
- **D-02:** Real data only. Not a pill filling a space, and not a mockup. Existing non-Meta blanks stay blanks: cookie durations, the UID, photo credit. They do not open the gate and they do not block it. Do not invent them.
- **D-03:** Only text Koss pastes opens the gate. A sentence the agent wrote keeps the flag off. Do not write the legal lines. Do not translate them. He asked for that. Refused.
- **D-04:** The current banner line "Necessary cookies only" does not count. He has to replace it before the gate opens. Until then it stays, because it is still true while the pixel is off.
- **D-05:** Chat or a doc is not enough. The lines have to be on the live banner, the live cookies page, and the live privacy page.
- **D-06:** All four languages have to be his text. A translation the agent wrote keeps the flag off.
- **D-07:** If a live line still says TBC, or still says necessary cookies only, the gate stays closed.

### What this phase puts on the pages
- **D-08:** Empty Meta TBC slots on the banner, the cookies page, and the privacy page. No sentence in them. Flag stays off.
- **D-09:** Leave "Necessary cookies only" up. The empty Meta slot sits with it. The gate stays closed.
- **D-10:** This milestone must finish with the pixel working. Do not park Meta for a later milestone. This phase still does not load the script. The Pixel ID and the Worker token are used by later phases in this same milestone, and not before the gate can open.
- **D-11:** Cookies page: one pill for the whole Meta row. No sentence. Not separate pills for name, purpose, and duration.

### When the version changes
- **D-12:** Policy version stays `2026-09-12` while the slots are empty. It changes only when his four-language lines are on the live pages.
- **D-13:** The new version string is the Zurich date that day. He does not pick a number.
- **D-14:** When that date goes live, the banner comes back. An old Accept of `2026-09-12` is not a yes to the new lines.
- **D-15:** The date customers see on the cookies and privacy pages, and the stored version, are the same Zurich date. One string.

### Who places the text
- **D-16:** He sends the exact words. The agent places those words. The agent does not write them.
- **D-17:** Place them in the code only. They stay off the live site until he says deploy.
- **D-18:** If the words still say TBC, or still say necessary cookies only, do not place them. Tell him the gate stays closed.
- **D-19:** Do not place a partial set. Wait until the banner, cookies, and privacy lines are all in his words, in all four languages. Then place that set.

### Claude's Discretion
- The Meta cookie-row duration was asked and not chosen. Do not invent a duration. D-11 already makes it one pill for the whole row, so a duration is part of his later paste, not a separate pill.
- He never selected "You decide".
- Pixel ID `1595596972063765` stays out of the client and out of any script in this phase. Record it here so later phases do not ask again. Do not read or print `META_CAPI_ACCESS_TOKEN`.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase scope
- `.planning/ROADMAP.md` — Phase 26 boundary, success criteria, and the rule that the flag stays off
- `.planning/REQUIREMENTS.md` — META-01, META-02
- `.planning/PROJECT.md` — v1.3 Meta measurement rulings. Do not invent legal text
- `.planning/research/SUMMARY.md` — measurement research. Do not draft the legal sentences from it

### Live legal surfaces
- `apps/web/components/consent/CookieBanner.tsx` — banner title is `necessary-cookies-only`. Leave that line. Add an empty Meta slot beside it
- `apps/web/lib/consent/policy.ts` — `CONSENT_POLICY_VERSION` is `2026-09-12`. Do not bump it in this phase
- `apps/web/app/[locale]/cookies/page.tsx` — existing `PendingSlot` durations stay. Add one Meta pill for the whole row
- `apps/web/app/[locale]/privacy/page.tsx` — add one empty Meta slot. No sentence
- `apps/web/components/legal/PendingSlot.tsx` — TBC pill. Reuse it. Do not invent a filled sentence
- `apps/web/lib/legal/extract-no-invent.test.ts` — legal blanks stay blanks
- `apps/web/i18n/messages/en.json` — `necessary-cookies-only`. Same key in `de.json`, `fr.json`, `ar.json`

### Secrets
- Worker secret name only: `META_CAPI_ACCESS_TOKEN` on `env.staging` (worker `vamos`). Do not read it. Do not put it in the repo. This phase does not use it.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `PendingSlot` — the empty Meta slots. Label the slot. Do not put a legal sentence inside it.
- `CookieBanner` — already renders `necessary-cookies-only` in four languages. Keep that string. Add the empty slot next to it.
- `CONSENT_POLICY_VERSION` — the stored version. Leave it at `2026-09-12` until his lines are live.

### Established Patterns
- Legal blanks are TBC pills, not drafted copy. Tests fail if a UID or other blank is invented.
- Consent marketing is off. An old Accept must not flip Meta on.
- Four locales ship together: `en`, `de`, `fr`, `ar`.

### Integration Points
- Banner: `apps/web/components/consent/CookieBanner.tsx`
- Version: `apps/web/lib/consent/policy.ts`
- Cookies table: `apps/web/app/[locale]/cookies/page.tsx`
- Privacy page: `apps/web/app/[locale]/privacy/page.tsx`
- Copy keys: `apps/web/i18n/messages/{en,de,fr,ar}.json`

</code_context>

<specifics>
## Specific Ideas

- Pixel ID `1595596972063765`. Public. Not a secret. Not loaded in this phase.
- Conversions API token is already on the Worker as `META_CAPI_ACCESS_TOKEN`. Not read. Not used here.
- Live site is `vamostaxi.site`. A line in the repo is not live.
- He wants this milestone to end with the pixel working. That is phases 27–29, after this gate can open. It is not a reason to load the pixel in this phase.

</specifics>

<deferred>
## Deferred Ideas

- Phase 27: consent record. The banner coming back on the new version is locked here (D-14). The Accept / Dismiss wiring is that phase.
- Phase 28: PageView. Wire Pixel ID `1595596972063765` only after this gate can open. No `fbevents.js` in phase 26.
- Phase 29: one server Purchase after Stripe says paid. Event id is the booking reference, same as the browser event. Do not send it now.
- He asked to send Purchase now, and to have the agent write the legal lines. Both refused. The token and the Pixel ID stay unused until the gate is open.
- These later phases are in this milestone. They are not a later milestone. They are out of phase 26.

</deferred>

---

*Phase: 26-Legal gate*
*Context gathered: 2026-09-23*
