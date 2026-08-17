# ADR-001 — Replacing the VamosLocale runtime for SSR

**Status:** Accepted, 2026-08-17
**Phase:** 1 (Platform Foundation)
**Supersedes:** the mechanism in `app/vamos-locale.js`, not its contract

## Context

`app/vamos-locale.js` translates by walking DOM text nodes after render, patching
`placeholder`, `aria-label`, `title` and `alt`, and re-running on every React re-render. In
the mocks — client-rendered, no server — that works and is genuinely elegant.

Under Next.js Server Components it breaks in a way that is visible to every visitor: the
server has no DOM to walk, so the HTML ships in English and flips to the chosen language
after hydration. In Arabic it also flips direction. That is a flash of wrong content on
every page, worst on the slow connections that need SSR most, and it defeats the SEO reason
for server-rendering at all.

`CLAUDE.md` mandates the `VamosLocale` contract platform-wide: `setLang`, `setCur`,
`onChange`, `money()`, in-place relabelling, and never a reload to apply a choice. The
contract stays. The mechanism underneath it changes.

## Decision

**Language is a route segment. Currency is client state. The dictionary is the single
source for both.**

1. **Language lives in the URL** — `/de/...`, `/fr/...`, `/ar/...`, with English at the
   root. The server reads the segment, renders that language, and emits `<html lang dir>`
   correctly in the initial HTML. No flash, no direction flip, and `hreflang` alternates
   come out of the same structure rather than being maintained separately.

2. **Strings resolve at render time, never after it.** `t(key, params)` in server
   components; a `useT()` hook in client components, seeded by a provider with only the
   strings that page actually renders. No DOM walking anywhere, so nothing depends on when
   React re-renders.

3. **Concatenated strings become parameterised messages.** `vamos-i18n-dict.js`'s `patterns`
   regex list exists to catch strings the code built from parts. Replaced by
   `t('quote.passengers', { n: 3 })` — the whole class of "left English because it has a
   number in it" stops being possible rather than being caught after the fact.

4. **Currency never touches the server.** Because `money()` only swaps the mark and never
   the number, currency is presentational. It stays pure client state — instant, no
   navigation, no cache variance.

5. **A compatibility shim keeps the mandated contract.** `VamosLocale.setLang` performs a
   soft navigation to the same path under the new segment and writes the mirroring cookie;
   `setCur` sets client state; `onChange` still notifies subscribers. Calling code — and
   `CLAUDE.md`'s rules about it — does not change.

## Consequences

**Good.** Correct language in the server HTML, which is the requirement (I18N-03) that the
old mechanism cannot meet at all. SEO alternates fall out of the routing. Cache keys are
clean, because language is in the path rather than in a cookie the cache must vary on.
Parameterised messages kill an entire bug class.

**Cost.** A soft navigation remounts the page subtree, so component state below the segment
does not survive a language switch. For most pages that is invisible. For the **booking
widget it is not** — switching language mid-booking must not discard a half-filled form.

**Therefore, a Phase 1 acceptance test, not a Phase 6 discovery:** fill the booking widget
partially, switch language, and assert every field survives. Booking state persists to the
URL or session storage rather than living in component state alone. If that test cannot be
made to pass cleanly, this decision is wrong and language moves to a cookie with `Vary`
handling — but the URL approach is tried first, because it is the one that serves SEO and
caching.

**Open.** Whether the four locale segments are four route groups or one dynamic `[lang]`
segment is an implementation detail for Phase 1 planning, not an architectural choice.
