---
phase: quick-261020-ezy
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - app/vamos-consent.js
  - apps/web/lib/consent/vamos-consent.test.ts
  - apps/web/lib/consent/web-analytics.ts            # deleted
  - apps/web/lib/consent/web-analytics.test.ts       # deleted
  - apps/web/components/consent/CookieBanner.tsx
  - apps/web/lib/security/headers.ts                 # comment only
  - .gitleaks.toml
autonomous: true
requirements: [QUICK-261020-ezy]

must_haves:
  truths:
    - "No code of ours adds a script with src https://static.cloudflareinsights.com/beacon.min.js, on any host, on mock pages or Next pages"
    - "VamosConsent.state(), save(), onChange(), cached(), turnstile() behave exactly as before (same fetches, cache writes, vamos:consent events)"
    - "The Next CookieBanner still reads /api/consent/state on mount and posts choices unchanged"
    - "CSP still allows static.cloudflareinsights.com (script-src) and cloudflareinsights.com (connect-src) so Cloudflare's auto-installed beacon can run"
  artifacts:
    - path: "app/vamos-consent.js"
      provides: "Consent runtime without BEACON_SRC/BEACON_TOKEN/startAnalytics"
    - path: "apps/web/lib/consent/vamos-consent.test.ts"
      provides: "Test asserting the runtime appends no beacon script on vamostaxi.site, localhost, dashboard host"
  key_links:
    - from: "apps/web/components/consent/CookieBanner.tsx"
      to: "apps/web/lib/consent/web-analytics.ts"
      via: "import removed; file deleted"
      pattern: "web-analytics"
---

<objective>
Stop our code loading the Cloudflare Web Analytics beacon so that, once the controller switches Web Analytics on for vamostaxi.site, Cloudflare's zone auto-install is the only beacon (no double count).

Purpose: Owner decision 2026-10-20. The Cloudflare API refuses auto_install:false for this zone (error autoInstallRequired), so our own loader must go. This supersedes the 2026-10-01 note "Cloudflare's automatic injection must stay off". The owner's 2026-10-19 rule "every visit counts whatever the banner choice" still holds; it is now delivered by Cloudflare's injection instead of our script.
Out of scope (controller does it): the Cloudflare dashboard/API switch, the rule keeping the beacon off dashboard.vamostaxi.site, deploy, push.
Output: beacon loader removed from the mock runtime and the Next app, dead module deleted, tests flipped to assert absence, one atomic commit on main (no push, no deploy).
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@./CLAUDE.local.md
@app/vamos-consent.js
@apps/web/lib/consent/vamos-consent.test.ts
@apps/web/components/consent/CookieBanner.tsx

<interfaces>
Current beacon code (all of it is removed by this plan):

app/vamos-consent.js
- lines 22-24 header comment: "Cloudflare Web Analytics (cookieless) starts on every page load: owner 2026-10-19 ... Cloudflare's automatic injection must stay off (owner 2026-10-01)."
- lines 36-38: comment + `var BEACON_SRC`, `var BEACON_TOKEN`
- lines 40-51: `function startAnalytics()`
- line 69 inside state(): `if (j.chosen === true && j.choice && j.choice.analytics === true) startAnalytics();`
- line 124 inside save(): `if (payload.analytics) startAnalytics();`
- line 233 end of IIFE: `startAnalytics();`

apps/web/lib/consent/web-analytics.ts exports WEB_ANALYTICS_SRC, WEB_ANALYTICS_TOKEN, loadWebAnalytics(doc?). Only importers: CookieBanner.tsx (line 17 import, lines 130-131 comment + call inside the mount useEffect) and web-analytics.test.ts.

apps/web/lib/consent/vamos-consent.test.ts
- harness `load(reply, host = "localhost")` returns `{ api, calls, store, events, scripts }`; `scripts` collects every element passed to `document.head.appendChild`.
- test at ~line 147 "Web Analytics starts on every page load whatever the choice ..." asserts one beacon script on vamostaxi.site.

.gitleaks.toml lines 34-36: allowlist entry for the site tag 792482ef56d84c46aee4f6501205ce68, citing the two loader files.

apps/web/lib/security/headers.ts lines 12-15: CSP comment says our code loads the beacon via lib/consent/web-analytics.ts and automatic injection must stay off. The CSP strings and headers.test.ts lines 60-62 stay unchanged.
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Remove the beacon from the mock consent runtime and flip its test</name>
  <files>app/vamos-consent.js, apps/web/lib/consent/vamos-consent.test.ts</files>
  <behavior>
    - On host vamostaxi.site with a stored "reject" choice, after load + state() + save("reject_all") + save("accept_all" with analytics true): `scripts` contains no element whose src includes "cloudflareinsights" (length 0).
    - Same on hosts "localhost", "vamostaxi.eu" and "dashboard.vamostaxi.site".
    - Runtime source text contains neither "cloudflareinsights" nor "data-cf-beacon" nor "startAnalytics".
    - All other existing tests in the file (state, save, 429, cached, ES5 style) pass unchanged.
  </behavior>
  <action>
    RED: in apps/web/lib/consent/vamos-consent.test.ts replace the test "Web Analytics starts on every page load whatever the choice (owner 2026-10-19), once, and only on the public site" with a test named "adds no Cloudflare Web Analytics beacon on any host (Cloudflare's zone auto-install owns it, owner 2026-10-20)" implementing the behavior above (loop hosts vamostaxi.site, vamostaxi.eu, localhost, dashboard.vamostaxi.site; call state(), save reject_all with ALL_OFF, save accept_all with all true; expect `scripts.filter(s => (s.src ?? "").includes("cloudflareinsights")).length` to be 0, with host as the assertion message), plus a source-text assertion on `src` (the runtime text already loaded in the file) that it does not include "cloudflareinsights", "data-cf-beacon" or "startAnalytics". Run the file; the new test must fail.
    GREEN: in app/vamos-consent.js delete the BEACON_SRC/BEACON_TOKEN lines and their comment, the whole startAnalytics function, the startAnalytics call in state() (line ~69), the call in save() (line ~124) and the bare call at the end of the IIFE (line ~233). Do not change anything else in state()/save()/turnstile()/cached()/onChange(); keep plain ES5 (var/function, no arrows). Replace the header comment lines 22-24 with: Cloudflare Web Analytics is not loaded here. Cloudflare's zone auto-install injects the beacon on every page (owner 2026-10-20; the API refuses to switch auto-install off for this zone, which supersedes the 2026-10-01 "automatic injection stays off" note). Every visit still counts whatever the banner choice (owner 2026-10-19).
    Do not edit the gitignored synced copies under apps/web/public/app/; the vitest script runs the sync, but if you run vitest directly, run `node scripts/sync-dc-mock-to-public.mjs` first.
  </action>
  <verify>
    <automated>cd /Users/koss/Developer/VamosTaxi.eu && node scripts/sync-dc-mock-to-public.mjs && cd apps/web && pnpm exec vitest run lib/consent/vamos-consent.test.ts && ! grep -n "cloudflareinsights\|startAnalytics\|BEACON_" ../../app/vamos-consent.js</automated>
  </verify>
  <done>vamos-consent.test.ts green including the new absence test; app/vamos-consent.js has no beacon code; header comment states the 2026-10-20 decision.</done>
</task>

<task type="auto">
  <name>Task 2: Delete the Next beacon module, unwire CookieBanner, update comments and gitleaks allowlist</name>
  <files>apps/web/lib/consent/web-analytics.ts, apps/web/lib/consent/web-analytics.test.ts, apps/web/components/consent/CookieBanner.tsx, apps/web/lib/security/headers.ts, .gitleaks.toml</files>
  <action>
    1. `git rm apps/web/lib/consent/web-analytics.ts apps/web/lib/consent/web-analytics.test.ts` (nothing else imports them; grep confirmed only CookieBanner.tsx).
    2. CookieBanner.tsx: remove the `import { loadWebAnalytics } from "@/lib/consent/web-analytics";` line and, in the mount useEffect, the two lines `// Owner 2026-10-19: every visit counts whatever the banner choice.` and `loadWebAnalytics();`. Leave the fetch of /api/consent/state and everything else in the effect untouched.
    3. headers.ts: rewrite only the comment block at lines 12-15 to: Cloudflare Web Analytics: static.cloudflareinsights.com serves the beacon, cloudflareinsights.com receives it. Cloudflare's zone auto-install injects it (owner 2026-10-20); none of our code loads it, and the controller keeps it off dashboard.vamostaxi.site with a Cloudflare rule. Do NOT change the CSP strings; do NOT touch headers.test.ts.
    4. .gitleaks.toml: remove the allowlist entry for 792482ef56d84c46aee4f6501205ce68 and its two comment lines (lines 34-36), since the token no longer appears in the repo. Before removing, run `git grep -n 792482ef56d84c46aee4f6501205ce68 -- ':!.planning'` and confirm zero hits outside .gitleaks.toml; if any remain, leave the entry and update its comment to name the remaining file instead.
    5. Final sweep: `git grep -n -i "cloudflareinsights\|loadWebAnalytics\|web-analytics\|data-cf-beacon" -- ':!.planning' ':!docs/build'` must show only headers.ts (CSP + comment) and headers.test.ts. docs/build/*.md mentions are historical owner Q&A and stay.
  </action>
  <verify>
    <automated>cd /Users/koss/Developer/VamosTaxi.eu && test ! -e apps/web/lib/consent/web-analytics.ts && ! grep -n "web-analytics\|loadWebAnalytics" apps/web/components/consent/CookieBanner.tsx && cd apps/web && pnpm typecheck && pnpm exec vitest run lib/security/headers.test.ts components/consent lib/consent</automated>
  </verify>
  <done>web-analytics.ts and its test deleted; CookieBanner compiles without the import; headers.ts comment reflects 2026-10-20 decision with CSP strings unchanged; gitleaks entry gone (or comment updated if a hit remains); final git grep shows only headers.ts/headers.test.ts.</done>
</task>

<task type="auto">
  <name>Task 3: Run the local gate and commit</name>
  <files>(no new edits; commit of Task 1-2 files)</files>
  <action>
    Run `pnpm gate:local` from the repo root DETACHED per control-session rules (it includes build, test:unit, test:db-lab; ~minutes): use `perl -MPOSIX -e 'POSIX::setsid(); exec @ARGV' caffeinate -i -s -m sh -c 'pnpm gate:local > ~/.vamos-scratch/gate-261020-ezy.log 2>&1; echo exit=$? >> ~/.vamos-scratch/gate-261020-ezy.log'` (mkdir -p ~/.vamos-scratch first; respect the stack.lock in ~/.vamos-scratch for test:db-lab — if another local stack is running, run the gate minus test:db-lab, i.e. check:public-env, typecheck, lint:css, lint, i18n:check, check:legal-claims, check:numbers, build, test:unit, and record that test:db-lab was skipped and why; this change touches no database code). Wait for the `exit=` line. A red that is not caused by this change (see memory gates-and-agent-load) is reported, not fixed.
    Then make one atomic commit on main containing exactly the files from Tasks 1-2 (git add -A on those paths only; leave the untracked .claude/launch.json alone), message: `fix(analytics): stop loading the Cloudflare beacon ourselves; zone auto-install owns it` with a body citing owner decision 2026-10-20 and the autoInstallRequired API refusal, ending with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Do NOT push and do NOT deploy: the controller ships, then switches Web Analytics on.
  </action>
  <verify>
    <automated>grep -q '^exit=0' ~/.vamos-scratch/gate-261020-ezy.log && cd /Users/koss/Developer/VamosTaxi.eu && git log -1 --stat | grep -q "vamos-consent.js" && git status --porcelain | grep -v "^?? .claude/launch.json" | wc -l | grep -q '^ *0$'</automated>
  </verify>
  <done>gate:local exit=0 (or every non-db step green with db-lab skip stated); one commit on local main with the 7 paths; nothing pushed or deployed.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Cloudflare edge -> visitor browser | Cloudflare injects a third-party script into our HTML once auto-install is on |
| Browser -> cloudflareinsights.com | RUM beacon POSTs leave the page |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-ezy-01 | Elevation | headers.ts CSP | accept | CSP allowance for static.cloudflareinsights.com is unchanged and is exactly what the auto-installed beacon needs; no new hosts added |
| T-ezy-02 | Info disclosure | dashboard.vamostaxi.site | transfer | Our host check is removed; controller adds a Cloudflare rule keeping the beacon off the dashboard host (outside this plan) |
| T-ezy-03 | Tampering | consent runtime | mitigate | Task 1 tests keep state/save/cache/event behaviour asserted unchanged; ES5-style test retained |
| T-ezy-04 | Repudiation | double counting | mitigate | Absence tests on mock runtime + deletion of Next loader ensure one beacon source only |
</threat_model>

<verification>
- `git grep -n -i "cloudflareinsights\|loadWebAnalytics\|data-cf-beacon" -- ':!.planning' ':!docs/build'` lists only apps/web/lib/security/headers.ts and headers.test.ts.
- vitest: lib/consent, components/consent, lib/security/headers.test.ts green.
- pnpm typecheck, lint green; pnpm gate:local exit=0.
</verification>

<success_criteria>
- No code of ours injects the Cloudflare beacon on any page.
- Consent behaviour unchanged (existing tests green).
- web-analytics.ts removed with its test; no dead code left.
- CSP hosts kept.
- One local commit on main; not pushed, not deployed.
</success_criteria>

<output>
Create `.planning/quick/261020-ezy-cf-beacon-auto-install/261020-ezy-SUMMARY.md` when done
</output>
