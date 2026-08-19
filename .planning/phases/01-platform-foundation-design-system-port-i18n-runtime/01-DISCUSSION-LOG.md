# Phase 1: Platform Foundation, Design System Port & i18n Runtime - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-08-20
**Phase:** 1-Platform Foundation, Design System Port & i18n Runtime
**Areas discussed:** Repo layout & mock fate, Locale routing & dictionary shape, Design-system port depth & method, Pipeline/domains/secrets scope

---

## Repo layout & mock fate

| Option | Description | Selected |
|--------|-------------|----------|
| Full monorepo now | apps/web + packages/db + packages/emails from day one | ✓ |
| Single app now, split later | apps/web only; packages appear when Phases 2 and 5 need them | |
| Flat Next app at repo root | No workspaces; collides with the mocks already owning app/ | |

| Option | Description | Selected |
|--------|-------------|----------|
| Mocks stay in app/, untouched | Remain the visual source of truth; production never imports them | ✓ |
| Move under mocks/ or design/ | Frees app/; large path churn across docs and .planning | |
| Move to archive/ once ported | Clean tree; loses the side-by-side reference late in the build | |

| Option | Description | Selected |
|--------|-------------|----------|
| pnpm workspaces | Standard for Cloudflare/OpenNext monorepos, strict isolation | ✓ |
| npm workspaces | No extra tool; slower, looser hoisting | |
| You decide | Planner picks at build time | |

| Option | Description | Selected |
|--------|-------------|----------|
| Copied into apps/web/public/brand/ | Self-contained Worker deploy, laws.css last import | ✓ |
| Shared packages/brand | One source for web and emails; more build wiring | |
| Referenced in place from design-system/ | No duplication; couples production to the mock tree | |

**User's choice:** Full monorepo, pnpm, mocks untouched. On the asset question the owner
instead supplied `/Users/koss/Desktop/Freelance/brand-guideline-vamos-taxi` as the canonical
and latest brand source, asking that the vendored design system be checked and updated against
it. The asset-location question was re-asked afterwards and answered `apps/web/public/brand/`.

**Notes:** The guideline folder was compared against the vendored system during the session.
`COLORS.pdf` gives `#FDC20B` / `#1E1F1F` / `#DEDEDE` — identical to `tokens/colors.css`. Type
is Qurova display + Poppins body, same five Qurova weights. Every guideline logo SVG shares its
viewBox with a repo file (`2490×527` lockup, `1684×2071` mark), so the repo set is derived from
these. Two gaps found: no white lockup and no white mark in `assets/logo/`. Two strays flagged
in the PDF: a `#D4632B` swatch printed beside the grey description, and a "Dm Sans Bold"
specimen page — the same spread carries an unrelated French drinks tagline.

---

## Brand strays and tagline (follow-up questions in the same area)

| Option | Description | Selected |
|--------|-------------|----------|
| Vendor the 2 missing white variants | Copy Final-white.svg and logo-White.svg; record guideline as canonical source | ✓ |
| Re-vendor the whole brand folder | Byte-identity; churns correct files, risks the Icon/CheckerMark components | |
| Change nothing in Phase 1 | Fill the gap when a surface needs it | |

| Option | Description | Selected |
|--------|-------------|----------|
| Ignore both strays as leftovers | PDF body text names three colours and Qurova + Poppins only | |
| Ask the designer before deciding | Add to the client-input pack | |
| #D4632B is real — add it | Treat the orange as a sanctioned accent | ✓ |

| Option | Description | Selected |
|--------|-------------|----------|
| "Ride with class" stays | Set artwork per CLAUDE.md; cited by the PDF's own Qurova rationale | ✓ |
| Both — one artwork, one copy | Second line becomes marketing copy needing de/fr/ar | |
| Ask the client | Add to the client-input pack | |

**User's choice:** Vendor the two white variants; include `#D4632B`; keep "Ride with class".

**Notes:** Because the PDF never assigns `#D4632B` a role, a follow-up asked what role it plays
— options were palette-token-only, marketing-surfaces-only, full accent (which would contradict
the platform law that attention is carried by charcoal, full-strength yellow, or semantic
danger/success), or "you decide". The owner chose "you decide", so it is recorded as
`--vt-orange` with no product-UI usage and an open client-input item.

---

## Locale routing & dictionary shape

| Option | Description | Selected |
|--------|-------------|----------|
| One dynamic [lang] segment | One page tree, generateStaticParams for the four languages | ✓ |
| Four route groups | Static paths; every page exists four times | |
| You decide | Researcher picks | |

| Option | Description | Selected |
|--------|-------------|----------|
| English at the root, / | Matches CLAUDE.md's /de/… alternates; needs a rewrite for /en | ✓ |
| Prefix every language, /en/… | Uniform; costs the bare-domain URLs marketing expects | |

| Option | Description | Selected |
|--------|-------------|----------|
| Per-locale JSON, dotted keys | Matches ADR-001's parameterised messages; one-time migration | ✓ |
| Keep one JS module keyed by English source | Zero migration; ADR-012 duplicates persist | |
| You decide | Planner picks | |

| Option | Description | Selected |
|--------|-------------|----------|
| Design the seam, ship files | t() reads through a loader; Phase 6 swaps in content_strings | ✓ |
| Files only, refactor in Phase 6 | Simplest now, larger change later | |
| You decide | Planner picks | |

| Option | Description | Selected |
|--------|-------------|----------|
| Trip state in sessionStorage | Survives the soft-navigation remount; no PII in the URL | |
| Trip state in URL query parameters | Shareable; puts addresses and flight numbers in history and referrers | |
| Both — URL for route, storage for the rest | Best of both; more moving parts | |
| You decide | Planner picks; the acceptance test is what binds | ✓ |

| Option | Description | Selected |
|--------|-------------|----------|
| Currency in localStorage, client-rendered | No cache Vary; one-frame CHF flash | ✓ |
| Cookie, read server-side | No flash; four-way cache split on a presentational choice | |
| You decide | Planner weighs it | |

| Option | Description | Selected |
|--------|-------------|----------|
| Build-time key check in CI | Fails the PR on a missing key | |
| Runtime dev-mode warning | Catches drift while building; blocks nothing | |
| Both | CI gate plus dev warning | ✓ |

| Option | Description | Selected |
|--------|-------------|----------|
| Resolve ADR-012 while migrating | Duplicates collapse during the rewrite that is happening anyway | ✓ |
| Migrate mechanically, clean up after | Verifiable one-to-one port; two passes | |

| Option | Description | Selected |
|--------|-------------|----------|
| hreflang generated from the route tree | One source; cannot drift page by page | ✓ |
| Per-page metadata exports | Explicit; 18 places to forget one | |
| You decide | Planner picks | |

| Option | Description | Selected |
|--------|-------------|----------|
| 404 falls back to English, keeps the shell | Never a bare Next error page on a brand domain | |
| Redirect unknown segments to English path | Masks a wrong link | |
| You decide | Planner picks | |

| Option | Description | Selected |
|--------|-------------|----------|
| RTL: lint logical properties + server-HTML snapshot | Enforced from the first component | |
| RTL: manual checklist per surface | Zero tooling; relies on the check being run | |
| RTL: both | Automated gates plus the mandated manual pass | |

| Option | Description | Selected |
|--------|-------------|----------|
| Vendor a licensed Arabic face now | Arabic is typeset, not device-dependent | |
| System font stack for Arabic | Zero weight; different on every device | |
| Ask the designer | Placeholder now, swap when the answer lands | |

**User's choice:** `[lang]` segment, English at root, per-locale JSON with dotted keys, loader
seam, currency in localStorage, both coverage mechanisms, ADR-012 resolved during migration,
hreflang from the route tree. Trip state delegated. 404 answered in free text: "it should be
translated but if even it get translated and there is a problem fallback to english." RTL
answered "you decide the best and more reliable way". Arabic font answered "use now what is
available and watch recommended and later if the designer sends me new one we will change it
so keep that in mind."

**Notes:** ADR-001 names the booking-widget survival test as a Phase 1 acceptance test and
states that if it cannot pass cleanly, the URL-segment decision itself is wrong and language
moves to a cookie. That conditional is carried into CONTEXT.md rather than dropped.

---

## Design-system port depth & method

| Option | Description | Selected |
|--------|-------------|----------|
| Foundations + funnel set | Tokens, fonts, Lenis, plus shell and funnel components | |
| Only what the success criteria name | Smallest Phase 1 | |
| All 100+ up front | Whole kit at once; weeks of work against a 2–3 week timeline | ✓ |

| Option | Description | Selected |
|--------|-------------|----------|
| Copy stylesheets verbatim, same class names | Pixel-identity is structural | |
| Extract per-component CSS modules | Tidier; every extraction can change a value | |
| You decide | Planner picks | ✓ |

| Option | Description | Selected |
|--------|-------------|----------|
| Screenshot diff, mock vs ported | Catches a changed radius the eye slides past | |
| Computed-style assertion | Cheaper; misses layout and spacing | |
| Manual side-by-side review | As good as the reviewer's attention | |
| You decide | Planner picks something that can fail a PR | ✓ |

| Option | Description | Selected |
|--------|-------------|----------|
| Icons as CSS masks | Identical to the mocks | |
| React SVG components | Tree-shaken; a genuine rendering change | |
| You decide | Planner picks | ✓ |

| Option | Description | Selected |
|--------|-------------|----------|
| Separate parallel plan, batched by kind | Foundations plan plus batched component plans | ✓ |
| One plan, one pass | Very large plan and review | |
| You decide | Planner picks | |

| Option | Description | Selected |
|--------|-------------|----------|
| One dev-only /dev/components gallery | How unused components get reviewed at all | ✓ |
| Per-component galleries only | Matches the mocks' habit; nothing central | |
| No gallery | Screenshot diffs are the only proof | |

| Option | Description | Selected |
|--------|-------------|----------|
| Typed props derived from data-props | Missing prop is a compile error | ✓ |
| Loose props, tighten on use | Faster through 100 components; late type safety | |
| You decide | Planner picks | |

| Option | Description | Selected |
|--------|-------------|----------|
| _ds_bundle.js reference only, not shipped | Production ships the ported React components | (revised ✓) |
| Ship it and wrap it | Fastest to screen; drags a UMD browser global into an SSR build | (initial) |

| Option | Description | Selected |
|--------|-------------|----------|
| No third-party script tags in production | React from the app bundle, Babel gone with the build | ✓ |
| Keep the CDN for React | Smaller Worker bundle; third-party origin dependency | |

| Option | Description | Selected |
|--------|-------------|----------|
| Lint gates for glow and tinted yellow | Stops violations being written | |
| Rely on laws.css alone | Violation renders fine but stays in the source | |
| Both | Runtime neutralisation plus lint gate | ✓ |

**User's choice:** Full 100+ port, parallel batched plans, dev-only gallery, typed props from
`data-props`, both law-enforcement mechanisms. CSS method, pixel proof and icons delegated.
CDN answered in free text: "the traveler one is on airport wi-fi. the cdn will not work…
use cdn from react or no third party, you decide" — read as no third-party origin.

**Notes:** The bundle question was answered "ship it and wrap it" first. That was raised as
incompatible with the rest: `_ds_bundle.js` attaches to `window.VamosTaxiDesignSystem_245af1`
and expects a global React, and there is no `window` in a Worker during server rendering, so
wrapping it would make the whole UI client-only — the same flash-of-wrong-content problem
ADR-001 exists to eliminate — and it would collide with the typed-props port chosen moments
earlier. Re-asked, the owner chose reference-only. The full-kit port was flagged as the largest
item in the phase and beyond the foundation size the 2–3 week timeline assumes; the owner kept
it, so that cost is recorded rather than silently absorbed.

---

## Pipeline, domains & secrets scope

| Option | Description | Selected |
|--------|-------------|----------|
| staging.vamostaxi.eu | As GSD-LAUNCH.md names it; subdomain record only | ✓ |
| A separate domain for staging | Production zone untouched; second domain and certs | |
| You decide | Planner picks | |

| Option | Description | Selected |
|--------|-------------|----------|
| Declare all bindings, implement none | Phases 3–7 add code, not infrastructure | ✓ |
| Only what Phase 1 uses | Smallest surface; each phase does its own setup | |
| You decide | Planner picks | |

| Option | Description | Selected |
|--------|-------------|----------|
| CI secret scan + NEXT_PUBLIC allowlist | Fails the PR | |
| Documented convention | Review enforces it; no tooling | |
| Both | Scan and allowlist plus the maintained matrix | ✓ |

| Option | Description | Selected |
|--------|-------------|----------|
| Handlers wired with a proven no-op | Plumbing exercised once in staging | ✓ |
| Exported but empty | Phase 4's first cron is also the first test | |
| You decide | Planner picks | |

| Option | Description | Selected |
|--------|-------------|----------|
| All CI gates blocking | CI is the only reviewer on a solo build | |
| Typecheck and build blocking, rest advisory | Fast merges; relies on discipline | |
| You decide | Planner picks which gates block | ✓ |

| Option | Description | Selected |
|--------|-------------|----------|
| Cloudflare Access + noindex | Nothing half-built indexed; payment form not public | ✓ |
| noindex only | Easy to share; public URL from Phase 7 | |
| Fully open | Risks indexing under the brand's own domain | |

| Option | Description | Selected |
|--------|-------------|----------|
| Structured logs + Logpush from day one | Trail exists before the Phase 7 incident | ✓ |
| Workers' default observability only | Zero work; harder correlation later | |
| You decide | Planner picks | |

| Option | Description | Selected |
|--------|-------------|----------|
| wrangler dev + supabase start | Local Postgres for Phase 2's schema work | ✓ |
| wrangler dev against staging resources | One environment fewer; mutates staging data | |
| You decide | Planner picks | |

**User's choice:** staging.vamostaxi.eu, all bindings declared, both secret-hygiene mechanisms,
no-op handlers wired and exercised, Cloudflare Access + noindex, structured logs and Logpush,
local wrangler + supabase. CI gating delegated.

**Notes:** Recorded as all-gates-blocking — solo owner-built means CI is the only reviewer, and
a full-kit port churning 100 components is exactly the situation where advisory gates get
ignored.

---

## Claude's Discretion

Delegated by the owner with "you decide", each recorded as a concrete decision in CONTEXT.md:

- `#D4632B` role → palette token only, no product-UI usage (D-07)
- Booking-widget state location → `sessionStorage` (D-15)
- RTL verification mechanism → lint + server-HTML assertion + manual pass (D-21)
- CSS port method → verbatim copy, same class names (D-24)
- Pixel-identity proof → screenshot diff in CI (D-25)
- Icon delivery → CSS masks as in the mocks (D-26)
- React delivery → app bundle, no third-party origin (D-31)
- CI gating → every agreed gate blocks the merge (D-39)

## Deferred Ideas

- `#D4632B` product usage — open client-input item for the designer
- The designer's Arabic typeface — swaps into D-22's token when it arrives
- The guideline's `PATTERNS/` PNGs — Phase 5 question; the repo renders the checker in CSS
- Freshpage → Cloudflare DNS sequencing risk — Phase 11 owns it
- Four-language strings for not-yet-used ported components — surfaces per-surface in Phase 5
- The design system's own review scaffolds — stay English per CLAUDE.md, no production home
