# Automatic translator (Phase 32): owner decisions

Signed by Koss in the question form. First round 2026-10-12 ~19:20 (+04), second round 2026-10-13 ~16:00 (+04).

## 2026-10-12

- Scope: everything that has a language — all pages, all emails, dashboard-typed content, customer messages and his replies, gaps in de/fr/ar.
- Fully automatic: every translation goes live at once in en/de/fr/ar; nothing waits for him.
- Engine: Gemma 4 on Cloudflare Workers AI (`@cf/google/gemma-4-26b-a4b-it`), Worker AI binding, no outside key.
- Privacy: no new policy line if Cloudflare's own terms confirm Workers AI keeps no data. Confirmed 2026-10-12 from developers.cloudflare.com/workers-ai/platform/privacy/ ("Cloudflare does not use your Customer Content to (1) train any AI models made available on Workers AI or (2) improve any Cloudflare or third-party services…"). Calls go to Workers AI directly, never through AI Gateway (logs on by default).
- Fixed: legal pages and owner-approved legal lines are never machine-translated; amounts, CHF, references, flight numbers, ZRH, class names, "Vamos Taxi" stay untranslated; existing human translations are never overwritten.

## 2026-10-13 (sheets 1–5 not signed; these replace them)

1. No Content › Translations page, no line editor, no "Machine" marks, no review or preview step. His words: "make it as said automatic no double check from me".
2. Dashboard Content › Pages and Content › Legal are removed completely (UI, routes, tests); Content › Reviews stays. His words: "delete as well the pages inside content/pages and legal keep reviews". Site and legal wording change only in code from then on.
3. Replies to customers: he keeps his mail app. The dashboard opens it with the customer-language text and his English below a line.
4. A customer writing in a language outside en/de/fr/ar: "the email app will handle that" — we translate only into our four languages; his reading of their message is still translated into English.
5. Home-page reviews show the original text, with a small button that translates the review into the visitor's current site language (on tap, cached, never in the page-load path, no vendor name).

Controller defaults (no owner choice needed): the 44 Arabic spellings of "Vamos Taxi" become Latin per D-14a; new strings reuse existing wording where they clashed; "live at once" means within about 60 seconds; extra names on Pricing get de/fr/ar filled automatically with no mark.
