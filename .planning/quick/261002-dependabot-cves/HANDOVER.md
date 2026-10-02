# Hand-over — the 41 Dependabot alerts on main

**From:** job session `vamostaxi-eu-bb`, branch `fix/dependabot-high-cves`, cut from `origin/main` `3978fda9`.

## Why now

GitHub reported **41 open alerts on the default branch: 15 high, 17 medium, 9 low** — 33 in
runtime scope. This moved up the list when the repo went public on 2026-10-02: the dependency
manifest is now readable by anyone, so matching known CVEs against it takes no effort.

## What they actually were

Five packages, **every one transitive** — nothing we import directly:

| Package | Was | Now | Alerts | What |
|---|---|---|---|---|
| `undici` | 7.29.0, 8.10.0 | 7.30.0, 8.11.2 | 28 | TLS certificate validation bypass, DoS, cross-origin cache poisoning |
| `fast-uri` | 3.1.5 | 3.1.8 | 6 | SSRF, host confusion, authority injection |
| `brace-expansion` | 2.1.4, 5.0.9 | 2.1.7, 5.0.12 | 4 | DoS by uncontrolled recursion |
| `js-yaml` | 4.3.1 | 4.3.2 | 1 | CPU exhaustion via merge keys |
| `qs` | 6.15.3 | 6.16.0 | 2 | — |

The `undici` ones matter most for this product: it is the HTTP client underneath the Worker's
outbound calls, and a TLS validation bypass sits on the path to Stripe and Supabase.

## How

`overrides` in `pnpm-workspace.yaml` — **not** `package.json`. pnpm 11 no longer reads
`pnpm.overrides` from `package.json`; it warns and ignores it, which looks exactly like a
successful install that changed nothing.

**Caret, not `>=`.** My first attempt used `>=` and pnpm quietly took `fast-uri` 3 → **4** and
`js-yaml` 4 → **5** — a dependency upgrade wearing a security fix's clothes. Every bump now
stays inside its own major.

Two majors of `undici` and `brace-expansion` are in the tree, so each gets its own scoped
override (`undici@7`, `undici@8`).

## Verified

- No vulnerable version survives anywhere in `pnpm-lock.yaml` (each old version grepped for
  by name).
- `pnpm run typecheck` (all workspaces) · `lint` (6 pre-existing warnings, none from this) ·
  `test:unit` **3886 + 229 pass, 0 fail** · **`pnpm --filter web run build` succeeds** ·
  i18n:check, check:numbers, check:db-fences, check:public-env all pass.

## Not verified

- No deploy, nothing applied to live. Lockfile changes deserve a smoke test on staging after
  the deploy, since `undici` sits under the outbound calls to Stripe and Supabase.
- GitHub will only recount the alerts once this is on the default branch.
- `pnpm-lock.yaml` is a shared file: if another job lands a lockfile change first, this needs
  a re-install rather than a hand-merge of the lockfile.
