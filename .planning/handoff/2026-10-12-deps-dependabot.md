# Hand-over: Dependabot alerts, 2026-10-12

Work session (T3 work thread), not control. Branch `deps-dependabot-2026-10-12`, cut from `origin/main` 140c3b0b
(origin/main unchanged at hand-over). GSD entry: `/gsd-quick`. No deploy, no live database, no push to main.

## Commit

- `d7a2f0f792f3fc2b5b942d2982f4647ce66598f5` fix(deps): close Dependabot alerts 49-56
- Files: `apps/web/package.json`, `pnpm-workspace.yaml`, `pnpm-lock.yaml`
- The hand-over file is in the commit after it.

## Versions changed

| Alert | Package | From | To | How |
|---|---|---|---|---|
| #49 #50 #55 #56 | next (apps/web) | 15.5.25 | 15.5.27 | direct dependency bump (`@next/env` and `@next/swc-*` follow, 15.5.25 → 15.5.27) |
| #54 | sharp | 0.35.4 | 0.35.5 | existing override `sharp: 0.35.4` (exact) → `^0.35.5`; `@img/sharp-*` 0.35.4 → 0.35.5, `@img/sharp-libvips-*` 1.3.3 → 1.3.4 |
| #52 | proxy-addr | 2.0.7 | 2.0.8 | lockfile only; parent express 5.2.1 allows `^2.0.7` |
| #53 | source-map-js | 1.2.1 | 1.2.2 | lockfile only; parent postcss 8.5.26 allows `^1.2.1` |
| #51 | postcss-selector-parser | 7.1.5 | 7.1.6 | lockfile only; stylelint `^7.1.4`, @csstools `^7.1.1` |
| #48 | braces | 3.0.3 | 3.0.3 | no patch exists; see below |

No other resolved version moved. Checked by listing every `name@version` that changed in the lockfile diff.
There's no `eslint-config-next` or direct `@next/*` package in any manifest.

Method note: `pnpm update -r --depth Infinity <pkgs>` also bumped unrelated packages (rolldown 1.2.5 → 1.2.13,
caniuse-lite, acorn, nanoid, picomatch, prettier), so it was discarded. The three lockfile-only fixes came from
temporary overrides, an install, then removing the overrides and installing again. pnpm keeps the fixed
versions because they satisfy the parents' own ranges. No new override was left behind, and the lockfile
`overrides:` block matches `pnpm-workspace.yaml`. `pnpm install --frozen-lockfile` passes.

All fixed versions are 12 or more days old (pnpm minimumReleaseAge is not blocking).

## Audit before → after

| Command | Before | After |
|---|---|---|
| `pnpm audit --prod` | 4 (2 high: sharp, source-map-js; 2 moderate: next ×2) | **0** |
| `pnpm audit` | 7 = 1 critical (proxy-addr), 3 high (sharp, source-map-js, braces*), 3 moderate (next ×2, postcss-selector-parser) | **1 high, ignored** (braces*) |

\* braces GHSA-vfj7-8cjw-p6xm was already in `auditConfig.ignoreGhsas` before this change; the JSON metadata still counts it.

## Gates (2026-10-12, this worktree)

- `pnpm gate:local`: **EXIT 0**, 13:46:02 → 13:48:30 (+04)
  - check:public-env, typecheck, lint:css, lint, i18n:check (2699 keys), check:legal-claims, check:numbers: pass
  - build: Next.js 15.5.27, "Compiled successfully in 10.1s"
  - test:unit: packages/db 14/14, packages/emails 293/293, apps/web 5969 passed / 52 skipped (480 files, 23 skipped)
  - test:db-lab (native lab stack, destroyed after): packages/db local 76/76, web seeded 11/11, web local 39/39
- OpenNext Worker build (`opennextjs-cloudflare build` in apps/web): **EXIT 0**, 13:48:41 → 13:49:22, `.open-next/worker.js` written
- The full suite ran once only. No separate touched-test run: the change is dependencies only.
- `apps/web/.next`, `.open-next` and any `.next-*` removed afterwards. Tree clean.

## braces (#48): finding and recommendation

`pnpm why -r braces`: braces 3.0.3 ← micromatch 4.0.8 ← fast-glob 3.3.3 / globby 16.2.4 ← **stylelint 17.14.1**
(also through stylelint-use-logical 2.1.3), which is a `devDependencies` entry of `web`. `pnpm why -r braces --prod`
finds nothing. It doesn't reach the Worker or any runtime path; stylelint uses it only to glob this repo's own CSS
files in `lint:css`.

3.0.3 is still the newest on npm, and the advisory lists no fixed version.

Recommendation: keep the existing `auditConfig.ignoreGhsas` entry (its comment already says to remove it once
braces publishes a fix). Dismiss Dependabot #48 on GitHub as "vulnerable code is not actually used"
(dev tooling only), or leave it open as a reminder. Either is the controller's or owner's call; this branch makes no change for it.
No invented fix.

## Risk

- Next 15.5.26 and 15.5.27 are security-only patch releases (15.5.26: `next/og` hardening; 15.5.27: metadata image
  route info disclosure plus two SSG/ISR cache-poisoning fixes). There are no feature or behaviour notes in either release.
- OpenNext `@opennextjs/cloudflare` 1.20.2 peer range `next >=15.5.21 <16`, so 15.5.27 is in range; next-intl 4.13.7 allows `^15`.
  The OpenNext build bundles cleanly. Not proven: a `wrangler dev` / test-lab click-through on the local Worker, or live.
  The ISR/SSG cache fixes touch the cache-key path OpenNext uses, so after deploy the controller should check the home
  page, a legal page and /checkout on staging. After any deploy that touches checkout, the standing 4242 payment rule applies.
- sharp 0.35.5 / libvips 1.3.4: build-time image tooling (next, miniflare); the Worker does not run sharp.
- The `postcss: 8.5.26` exact override is unchanged.

## Not done (controller)

Clean-clone check, different-model review, PR, and the Dependabot #48 decision.
