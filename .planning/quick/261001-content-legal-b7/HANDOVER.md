# Hand-over — content and legal fixes (B7), 2026-10-01

Branch `claude/project-thread-6r5gz9`, cut from main `194aee66` (main had not moved at hand-over).
Owner's answers: `.planning/decisions/2026-10-01-content-legal-b7.md`.
Built in a cloud thread: no GSD, no `CLAUDE.local.md`. Nothing deployed, nothing written to the live database.

## What changed

| Commit | What |
|---|---|
| `7302a49a` | Cherry-pick of `fe4e37a0` (2026-09-30, never shipped): /terms section 03 "sent by email … the driver's number is on your manage-booking page" instead of SMS; /about fleet shows the live classes (Van luxury 12 passengers, 9 cases, checked against the live `vehicle_classes` rows). Four languages |
| `fb85ea42` | Footer: the Imprint link is back under Legal (both `SiteFooter.dc.html` copies). The 2026-09-20 footer merge (#45) had dropped it. Phone and e-mail wrapped in `vt-dir-keep`, so the number no longer reads reversed in Arabic |
| `0632e719` | Imprint declares `en de fr ar`: the "This page exists in English and German. The English text is binding." notice is gone for French and Arabic readers. The page itself already translated (only names and numbers stay as they are). Its own intro keeps "The German version is the binding one". Replaces 26.0 D-05; `legal-languages.ts` and `check-legal-language-claims.mjs` follow |
| `71340a8e` | Cloudflare Web Analytics loads only after a saved Analytics yes: mock pages through `app/vamos-consent.js`, Next pages (/checkout, /confirmation) through `CookieBanner.tsx` + `lib/consent/web-analytics.ts`. Public site only (vamostaxi.site/.eu), never the dashboard. CSP allows `static.cloudflareinsights.com` (script) and `cloudflareinsights.com` (connect). /cookies and /privacy already say "off until you allow them", so no wording changed |
| `ac137459` | Seed: city waiting 30 minutes (was 15). The seed only fills a fresh database (`on conflict do nothing`) |
| `59d367fc` | Decision record |

## Checks (merged tree, cloud container)

| Check | Result |
|---|---|
| pnpm typecheck | pass |
| pnpm lint | pass |
| pnpm lint:css | pass |
| pnpm i18n:check | pass |
| pnpm check:legal-claims | pass (all 3) |
| pnpm check:numbers | pass |
| pnpm check:public-env | pass |
| pnpm check:db-fences | pass |
| pnpm db:seed:check | pass (no drift) |
| pnpm test:unit | pass: web 3443 (5 skipped), emails 165, db 14 |
| pnpm build | pass |
| Browser, `next start` of the build | Footer shows Imprint at 390 (ar), 768 (de), 1024 (fr), 1440 (en); no sideways scroll; Arabic phone span computes `direction: ltr`. /ar/imprint and /fr/imprint: no notice, coverage leaves only GmbH, the company number, vamostaxi.site, the owner's name, the image credit and Loomlyne |

## Not verified

- The beacon actually counting on vamostaxi.site: it needs the live host, your Cloudflare switch and a real Analytics yes.
- The Worker build (`wrangler dev`) and the Playwright e2e: not run here. The updated imprint component specs pass locally at 1440 (6 tests). Picture baselines to rebaseline on the Mac: every footer picture (one extra link: Imprint), `imprint-fr`/`imprint-ar` and `legal-notice-fr`/`legal-notice-ar` (no notice bar any more).
- pgTAP: not run here; GitHub's schema job runs it (`seed_idempotent` re-pinned to the regenerated seed in `3b4b7ce1`).
- Gitleaks flagged the public Web Analytics site tag; `.gitleaks.toml` allows that exact value only (`99476a80`).
- Withdrawing Analytics consent stops the beacon from the next page on, not on the page where you withdraw.

## Migrations

None.

## Ship order (one Worker: `vamos`)

1. **You first, in Cloudflare:** Web Analytics › vamostaxi.site › switch off automatic setup (JS snippet injection). If it stays on, the new CSP lets Cloudflare's own copy run on every page without consent.
2. Then the control session deploys `vamos`. The gateway (`vamos-dashboard`) does not change.

## Your steps (owner)

1. Dashboard › Settings › City waiting included: set **30**, Save. Expected: it reads 30 after a reload. On 2026-10-01 the newest settings version still held 15.
2. Dashboard › Reviews: replace the five placeholder review texts with real ones (or send them to us). Expected: home shows your texts.
3. Cloudflare: the switch in "Ship order" step 1.
4. After the ship, vamostaxi.site in a private window, scroll to the footer. Expected: Legal ends with **Imprint**; it opens /imprint.
5. Switch to العربية, look at the footer. Expected: `+41 79 626 70 82` reads left to right.
6. Open /imprint in Français, then العربية. Expected: French / Arabic page, no grey "exists in English and German" bar on top.
7. /terms section 03. Expected: driver name, vehicle and plate "by email", no SMS. /about: Van luxury, 12 passengers.
8. Private window, a page, choose **Necessary only**. Expected: in the browser's network list, nothing from cloudflareinsights. Then Cookie preferences › Analytics on › Save. Expected: `beacon.min.js` loads; next day the visits show in Cloudflare Web Analytics.
