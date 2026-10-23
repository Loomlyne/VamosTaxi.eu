# Hand-over — CSP allow ad.doubleclick.net

- Branch: `fix/csp-ad-doubleclick`, cut from `origin/main` `f08428b7` (2026-10-23). `origin/main` had not moved at commit time.
- Code commit: `83b65cb8` `fix(csp): allow ad.doubleclick.net for Google Ads hits`.
- Worktree: `.claude/worktrees/csp-ad-doubleclick`
- Job session, not the controller. No deploy, no migration, no live write.
- Controller: T3 thread `0fbbf0c1-980e-4de3-9345-e3c8fe69811b`.

## Change

`apps/web/lib/security/headers.ts` `contentSecurityPolicy()` now allows `https://ad.doubleclick.net` on `connect-src` and `img-src`, immediately after `https://*.g.doubleclick.net`. `script-src` and `frame-src` are unchanged. The comment above the function records why (GTM CSP report, container `GTM-KPKGT4VH`, 2026-10-23).

`apps/web/lib/security/headers.test.ts` updates the fixed policy string in the same two places and adds "CSP allows the Google Ads conversion host".

`*.g.doubleclick.net` does not match `ad.doubleclick.net`, so Google Ads / Floodlight conversion hits were dropped. The image pixel is the fallback when `fetch` is unavailable.

## Verified in this worktree

- `pnpm --filter web exec vitest run lib/security/headers.test.ts`: 10 tests passed.
- `pnpm typecheck`: passed (db, emails, isolation-probe, web).
- `pnpm build`: Next.js 15.5.27 compiled, 155 static pages. Pre-existing warning: Next inferred the workspace root from `/Users/koss/package-lock.json`.

## Not verified

- Live header on https://vamostaxi.site. Read 2026-10-23 14:04 UTC: `connect-src` and `img-src` still stop at `https://*.g.doubleclick.net`. That matches `origin/main`. The new host appears only after the controller deploys Worker `vamos`.
- Browser console and Network tab for `ad.doubleclick.net`. GTM's CSP report row clears only after Google re-crawls.

## Failed

None.

## Left for the controller

Merge this branch and deploy Worker `vamos` from the owner's Mac (`pnpm --filter web run deploy -- --env staging`). No database migration. The dashboard Worker does not need a redeploy.

After deploy, both `connect-src` and `img-src` on `https://vamostaxi.site/` must contain `https://ad.doubleclick.net`. Then check `/` and `/checkout` for a CSP violation naming that host. Dismiss the GTM row only after that check passes.

Rollback is reverting this commit and redeploying. The change only adds one host.
