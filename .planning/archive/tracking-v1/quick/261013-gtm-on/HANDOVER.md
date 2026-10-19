# Hand-over: Google Tag Manager on, owner wording adopted (job `261013-gtm-on`)

Work session on branch `quick/ga4-gtm-consent` (PR #79), worktree `.claude/worktrees/ga4-gtm`. Nothing merged, nothing deployed, no live database, Cloudflare, Google or Stripe console touched.

Owner decisions, 2026-10-13, question form: turn Google Tag Manager `GTM-KPKGT4VH` on; the wording in `.planning/decisions/2026-10-13-gtm-wording.md` (sections 1-4, en/de/fr/ar) adopted as written; container rule stays (only Google tags, no second GA4 or Ads tag, no Meta pixel inside the container).

## Commits

1. `7cfe3129` merge of `origin/main` (`47bcec66`, PR #77). Conflicts in `app/vamos-google.js` and `apps/web/lib/google/google.test.ts` resolved to this branch's side: its `consentNow()` already sends `ad_personalization: 'denied'` on Accept with main's comment, and every BOTH/ADS/ANALYTICS expectation in the test denies it. PR #77's remarketing DRAFT decision file came in from main unchanged.
2. `e56dae3b` feat: Tag Manager on.
   - Decision file renamed from `-DRAFT`, status ADOPTED; references fixed (the GA4/GTM hand-over).
   - Texts copied by script from the decision file (no hand typing) into `app/vamos-meta-texts.js` (`gtmBanner`, `gtmRow`, `gtmPrivacyLine`, `gtmProcessor`) and the four message files (`cookies.gtm-banner`, `cookies.gtm-row`, `legal.gtm-privacy-line`, `legal.gtm-processor`).
   - Placement, mock and Next: banner sentence after the current banner text in the same paragraph (both mock banners incl. the review gallery, `components/consent/CookieBanner.tsx`); cookies row after the Google Ads row in the Marketing table (`app/pages/cookies.dc.html`, `app/[locale]/cookies/page.tsx` slot); privacy line after the Google Analytics line; processor purpose as the third `Google Ireland Ltd` line (`app/pages/privacy.dc.html`, `app/[locale]/privacy/page.tsx`). The mock renders them from `vamos-meta-texts.js` under `data-vt-no-i18n`, like the GA4 texts, so no dictionary entry is needed.
   - `GTM_ON = true` / `GTM_OPEN = true`. `CONSENT_POLICY_VERSION` unchanged at `2026-10-13`. CSP unchanged (`www.googletagmanager.com` already in script/connect/img/frame on the Google rows; no new host).
   - Seed regenerated: +4 keys, header 2714, no-param-reason 106; `seed_idempotent.test.sql` re-pinned.

## Tests

- `owner-texts.test.ts`: 14 sections x 4 languages x (mock, messages, next-intl render): 171 passed.
- `google.test.ts`: the Tag Manager block now runs the file as committed (`gtm: "committed"`): both on loads gtag.js then `gtm.js?id=GTM-KPKGT4VH` after the denied default and the granted update; Analytics only, Marketing only, not chosen: no container; second choice later: once; withdraw of either: everything denied, cookies deleted, never again on that page; off-list address: nothing; no noscript/iframe; plus a `GTM_ON = false` kill-switch test. GA4/Ads blocks keep the container forced off so each config is checked alone.
- `legal-gate.test.ts`: slot lists gain `gtm-row` and `gtm-privacy-line`; banner paragraph is `meta-banner` then `gtm-banner`.
- Touched suites (lib/google, lib/consent, lib/meta, lib/security, components/consent): 43 files, 1059 passed. Wider `vitest run lib components app tests/unit` after `node scripts/sync-dc-mock-to-public.mjs`: 480 files, 6132 passed, 52 skipped.
- `pnpm i18n:check` pass; `pnpm db:seed:check` no drift.
- `pnpm gate:local` (check:public-env, typecheck, lint:css, lint, i18n:check, legal-claims, numbers, build, test:unit, test:db-lab) on commit `e56dae3b`: `exit=0` (`gate.log` here). Web unit 6132 passed / 52 skipped; db 14; emails 293; db-lab 76 + 11 + 39.
- pgTAP on an own native lab stack (`lab.sh up gtmon --no-dash`, `pgtap gtmon`, `destroy gtmon`): `Files=116, Tests=3436` PASS, `exit=0`, stack destroyed (`pgtap.log` here); covers the re-pinned `seed_idempotent.test.sql`.

## Not done

- No visual pass at 1440/1024/768/390 or in Arabic: the banner paragraph is one sentence longer, the Marketing table one row longer, the privacy section one paragraph and one processor line longer (same components as the GA4 rows). Needs the lab or Hermes.
- The GTM texts are not tied to `GTM_OPEN`: closing the flag again would leave the texts on the pages (same as the GA4 texts and `GA4_OPEN`).

## Owner steps (his browser, before the controller ships)

1. tagmanager.google.com, container `GTM-KPKGT4VH`: only Google tags; no second GA4 configuration tag for `G-K5MZME44P6`, no second Google Ads tag for `AW-368142830`, no remarketing tag, no Meta pixel, no custom HTML. Every published version is a wording check first.
2. The GA4 owner steps 1-4 in `.planning/quick/261013-ga4-gtm-consent/HANDOVER.md` still apply.
