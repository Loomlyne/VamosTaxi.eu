# Hand-over: 05-28 close-out (job B8), /contact

- Branch: `claude/project-thread-jbsapo` (GitHub). The final commit is this hand-over commit, which sits on top of `26607a44`.
- Cut from origin/main `194aee66`. origin/main was still `194aee66` at 2026-10-01 15:19 (+04), so there was nothing to merge.
- Plan: `05-28-B8-PLAN.md`, signed by the owner in the thread on 2026-10-01.
- Migrations: none. Database: untouched. Deploy: none. A single-Worker ship (`vamos`), with no gateway change.

## What changed

| Commit | Change |
|---|---|
| `02007573` | Plan file |
| `b8575f41` | `app/pages/contact.dc.html`: the telephone, WhatsApp and e-mail values in "Reach us directly" are wrapped in the design system's `vt-dir-keep` span, so Arabic shows `+41 79 626 70 82` and no longer `82 70 626 79 41+`. `app/vamos-i18n-dict.js`: three new keys in de / fr / ar ("Call, message, or email the team directly.", "For time-sensitive requests, call us on the number opposite.", and the sent-state "For time-sensitive travel, call us on the number opposite."). |
| `26607a44` | `apps/web/lib/contact-source.test.ts`: a guard for both changes |

The other three owner comments (Turnstile "Success" box, resize corner, social icon sizes) were already live. Read on vamostaxi.site/contact on 2026-10-01: `#ct-turnstile` is 0 px high at rest, the message field has `resize: none`, and all four social glyphs are 26 × 26. Worker `vamos` lists `CONTACT_EMAIL_FROM`, `CONTACT_SUPPORT_RECIPIENT` and `RESEND_API_KEY`. Only the names were read, never the values.

## Checks (one run on `b8575f41`, 2026-10-01 15:0x–15:19 +04)

| Check | Result |
|---|---|
| typecheck | pass |
| lint | pass |
| lint:css | pass |
| i18n:check | pass |
| check:legal-claims | pass |
| check:numbers | pass |
| check:public-env | pass |
| check:db-fences | pass |
| db:seed:check | pass |
| test:unit | pass (web 3440 passed / 5 skipped; emails 165) |
| build | pass |
| `vitest run lib/contact-source.test.ts` on `26607a44` | pass, 9 tests |

The local page was served from `apps/web/public` after `scripts/sync-dc-mock-to-public.mjs`:
- `VamosLocale.coverage()` lists no strings in de, fr or ar.
- At 1440, 1024, 768 and 390, in all four languages: the page is never wider than the viewport, and the numbers sit flush with their labels (right-aligned in Arabic).
- An Arabic screenshot at 390 shows `+41 79 626 70 82`.

## Not verified

- No contact message was sent, so mail delivery on live is unproven. A message needs the owner's yes, and it writes a live row.
- The sent-state line was translated, but its panel was not opened in the browser.
- The Playwright contact suites (`contact-lifecycle`, `visual/contact`) were not run.
- The footer phone (`SiteFooter`, every page) also reads reversed in Arabic. It is outside this plan, and no footer file was touched.

## Owner test after Ship

1. Open https://vamostaxi.site/ar/contact on your phone. Under "تواصل معنا مباشرة", both numbers should read `+41 79 626 70 82`, left to right.
2. Switch to Deutsch. The line under "Schreiben Sie uns" and the line under "Direkt erreichen" should be in German. Repeat in Français.
3. On /contact in English, type a name, your own e-mail and a message of a few words, then press Send. Expected: no Cloudflare box at rest, the "Message received" panel, an acknowledgement in your inbox, and a copy in info@vamostaxi.site.
