# Codebase Concerns

**Analysis Date:** 2026-08-17

## No Production Backend

**Status:** Expected — Phase 0 scaffolding not yet started.

**Scope:** Every data store is localStorage only. No server persistence.

**Files affected:**
- `app/vamos-ops-data.js` — all collections (vehicles, chauffeurs, bookings, customers, coupons, routes, rates, surcharges, settings, profile)
- `app/vamos-locale.js` — language and currency preference
- `app/vamos-reviews.js` — published reviews
- `app/pages/AuthForm.dc.html` — customer auth state
- `app/ops/AuthForm.dc.html` — ops staff auth state
- `app/vamos-page-transition.js` — cross-page state

**Mitigation:** Phase 2 builds the Supabase schema; Phase 3 wires Hyperdrive data access. `docs/GSD-LAUNCH.md` defines the build order.

---

## Security: Ops Auth Gate is a Mock

**Risk:** A deployable mock with no real authentication. Anyone who ships this as-is can sign into the ops console.

**Files affected:**
- `app/ops/AuthForm.dc.html` — sets `localStorage.vamosOpsAuth = '1'` with no credential check
- `app/ops/ops.dc.html` line ~40 — gate is `localStorage.getItem('vamosOpsAuth') !== '1'`

**Vulnerability:** The gate is not a security boundary; it is a convenience skip. Password is hard-coded in the mock as a test pattern only.

**Mitigation:**
1. Delete the mock authentication logic before any production launch. Replace with Supabase invite-only staff auth + TOTP MFA (mandatory for all staff per HANDOFF-CLAUDE-CODE.md §8).
2. Do not copy the mock password to production.
3. Phase 2 specification calls for `dispatcher|admin` role-based access via JWT claim.

---

## Security: Customer Auth is a Mock with Hard-Coded Email List

**Risk:** Customer sign-in does not validate against a real user database.

**Files affected:**
- `app/pages/AuthForm.dc.html` line 234 — `const REGISTERED = ['taken@vamostaxi.eu']`
- Line 337 — password "wrong" fails sign-in; all other passwords pass
- Line 341 — only `taken@vamostaxi.eu` is recognized as a registered account

**Current behavior:**
- Any email except `taken@vamostaxi.eu` can sign up with any password ≥8 characters.
- Signin with password "wrong" shows credentials error; any other password signs in.
- Fake OTP `000000` is mentioned in `MISSING-FEATURES.md` as a design requirement for email OTP flow (not implemented in this mock).

**Mitigation:**
1. Phase 2 replaces with Supabase email+password auth + email OTP verification.
2. `@supabase/ssr` handles session cookies for SSR (Phase 3).
3. Rate limiting + Turnstile on sign-in (Phase 6).

---

## No Package.json, Dependency Manifest, or Lockfile

**Status:** Expected — Phase 0 not started.

**Current state:** The mocks are plain `.dc.html` + JS, no build step, no package manager.

**Why it matters:** Before Phase 1 scaffold, there is no way to track dependencies, manage versions, or run CI checks.

**Mitigation:** Phase 1 creates the Next.js 15 + OpenNext/Cloudflare Workers project with dependency lock.

---

## React 18.3.1 and ReactDOM Loaded from Unpkg CDN at Runtime

**Risk:** Third-party runtime dependency + offline-first-load failure.

**Files affected:**
- `app/support.js` — fetches React, ReactDOM, `@babel/standalone` from unpkg with SRI pinning

**Current behavior:**
```javascript
// From app/support.js — unpkg URLs with SRI hashes
// Page fails to load if unpkg is down or unreachable
```

**Why it matters:**
1. First page load requires internet access.
2. CDN downtime blocks the entire site.
3. SRI pinning protects against tampering but does not address availability.

**Mitigation:**
1. Phase 1 bundles React via Next.js (`_next/static/chunks/`).
2. Build output is static + Workers server-side rendering.

---

## Owner Blockers — Five Hard Constraints

These are documented in `HANDOFF-CLAUDE-CODE.md` §8. Treating them as debt because they block the build.

### 1. CHF Price Matrix + Surcharges

**Issue:** Every price in the mocks reads `CHF 000` by design. No real fare table exists.

**Files affected:**
- `app/home/home.dc.html` — quote cards display `CHF 000`
- `app/pages/checkout.dc.html` — fare line items, surcharges
- `app/vamos-ops-data.js` — seed pricing tables (all placeholders)

**Block scope:** Phase 4 (pricing engine), Phase 5 (checkout payment), Phase 9 (production cutover).

**Owner decision needed:** When is the real matrix available? May interim staging use synthetic numbers behind `pricing_live=false` (safe because all UI stays `CHF 000`)?

**Ref:** `OPEN-QUESTIONS.md` Q11.

### 2. Policy Numbers Behind Data-Tok Pills

**Issue:** 173 `data-tok` spans in the app carry unconfirmed legal + operational policy numbers (`grep -ro 'data-tok' app/ | wc -l`, verified 2026-08-17).

**Files affected:** All pages. Examples:
- `app/home/home.dc.html` — cancel window, waiting fees, flight tracking, hourly mode
- `app/pages/checkout.dc.html` — child seat price, cancellation promise
- `app/pages/cancellation.dc.html` — free-cancel window, refund shares
- Legal pages: terms, privacy, cookies, imprint

**Sample data-tok values:**
- Free-cancel window (24 h or other?)
- Waiting fees (airport 60 min, city 15 min — both unconfirmed per `LEGAL-PLACEHOLDER-CHECKLIST.md` §C)
- No-show fee
- Min advance booking
- Payment methods list
- Flight tracking lead-time promise (6 h)

**Block scope:** Every token either becomes a settings-driven value (Phase 4+) or stays TBC until the owner supplies the answer.

**Owner decision needed:** See `docs/LEGAL-PLACEHOLDER-CHECKLIST.md` §A–D for all 90 tokens and which stakeholder owns each.

**Ref:** `OPEN-QUESTIONS.md` Q8, Q13–Q15.

### 3. Vehicle + Destination Photography

**Issue:** Only one photograph available (V-Class car). Economy and Business fall back to icon tiles. Hero image is repeating.

**Files affected:**
- `app/home/home.dc.html` — booking flow vehicle cards, "Why Vamos" section
- `app/pages/about.dc.html` — company imagery
- Root: `hero-arrivals.jpg` (hero image)

**Missing assets:**
- Economy vehicle photo (clean, daylight)
- Business vehicle photo (same register)
- Founder portrait (Ben Othman Houssein — daylight, no studio)
- Destination photography (coverage list: Zurich, Geneva, Basel, Alpine resorts, Chamonix)
- Routes/coverage list for About + booking widget

**Block scope:** Hero, services cards, About page, vehicle cards downgrade to icon tiles until photos arrive.

**Ref:** `LEGAL-PLACEHOLDER-CHECKLIST.md` §E (5 content/image slots).

### 4. Payment Provider + Social Brand Marks

**Issue:** Footer payment and social logos are typed placeholders.

**Files affected:**
- `app/pages/* (footer)` — payment method icons
- `app/pages/contact.dc.html` — social media links (Facebook, Instagram, YouTube, Trustpilot)

**Current state:** Marks are hand-drawn approximations or text placeholders.

**Why it matters:** Stripe, Apple Pay, TWINT, etc. are registered trademarks. Approximations are not legally safe.

**Block scope:** Footer appears on every page.

**Ref:** `HANDOFF-CLAUDE-CODE.md` §8 blocker 4.

### 5. Qurova Webfont Licence Unconfirmed

**Issue:** Only Poppins licence (OFL) is on file. Qurova redistribution rights unknown.

**Files affected:**
- `design-system/assets/fonts/` — Qurova ×5 weights + Poppins ×24
- Every page loads via `design-system/tokens/fonts.css`

**Risk:** Serving an unlicenced font from production is a copyright violation.

**Current state:**
- Licence file: `design-system/assets/fonts/OFL.txt` (Poppins only)
- No legal confirmation of Qurova redistribution rights

**Decision required:** Confirm redistribution rights **before** production launch, or choose a fallback typeface. That is a visual change (Design → Product decision).

**Ref:** `OPEN-QUESTIONS.md` Q4, `LEGAL-PLACEHOLDER-CHECKLIST.md` §A4 (blocker A4).

---

## Internationalization Debt

**Issue:** ~600 untranslated strings, mostly legal copy and policy text.

**Files affected:**
- `docs/build/i18n-todo.txt` — audit of missing translations
- Legal pages: terms, privacy, cookies, cancellation, imprint (`data-vt-legal` marks English-only)
- FAQ, Contact, About (slice 2 additions)

**Current state:**
- English is 100% translated.
- German, French, Arabic: ~600 gaps remaining.
- German will grow ~30% longer on resize.

**Block scope:** Phase 7 (i18n completion) + translation vendor turnaround.

**Owner decision needed:** Translation budget + vendor.

---

## Missing Screens (No Mock Exists)

Four screens are flagged in `MISSING-FEATURES.md` as requiring design + build:

### 1. Ops "New Booking" (Manual/Phone) — 🔴 RED

**Why:** Dispatchers take phone bookings today. Cannot ship without this.

**Current state:** No mock screen exists.

**Requirement:** Route, fields, validation, confirmation email to customer.

**Ref:** `MISSING-FEATURES.md`, `OPEN-QUESTIONS.md` Q27.

### 2. Partner Application Review Queue — 🟡 YELLOW

**Why:** Pairs with `become-a-partner.dc.html` form. Ops staff need to review applications, request documents, approve/reject.

**Current state:** `become-a-partner.dc.html` has a form draft (no screen for ops review).

**Requirement:** Ops screen showing pending applications, document uploads, status transitions.

### 3. Refund/Finance Report — 🟡 YELLOW

**Why:** Ops need visibility into refunds, payouts, fees even if data is read-only from Stripe.

**Current state:** No ops screen exists.

**Requirement:** Date range, filters, CSV export, payout summary.

### 4. Corporate Accounts — ⚪ WHITE

**Why:** Documented V1 target in `MISSING-FEATURES.md`, but no mock exists.

**Current state:** Account management is individual only.

**Requirement:** Corporate billing, invoice aggregation, team members, bulk booking.

---

## Documentation Drift

### Issue 1: Path References in HANDOFF-CLAUDE-CODE.md

**Problem:** Sections §2 and §10 reference `_ds/…` but the actual directory is `design-system/`.

**Files affected:**
- `HANDOFF-CLAUDE-CODE.md` line 99 (§2): `_ds/vamos-taxi-design-system-245af154-/`
- Line 370 (§10): `_ds/…/assets/fonts/OFL.txt`

**Reality:** All references should be `design-system/…`.

**Impact:** Low (file navigation), but breaks copy-paste instructions.

### Issue 2: Missing Per-Component Source Files

**Problem:** `design-system/readme.md` §4 and §6 reference per-component source files that do not exist.

**Files affected:**
- `design-system/readme.md` line ~100+ — references `components/{core,forms,navigation,feedback,transfer,data}/*.jsx` + `.d.ts` + `.prompt.md`
- `design-system/_ds_manifest.json` — same references
- `design-system/components/` — only contains `mobile/` (compiled, not editable source)

**Reality:** Only `design-system/_ds_bundle.js` ships (compiled UMD). Per-component sources do not exist in this repo.

**Impact:** Medium. During Phase 1 React rebuild, there are no component usage rules to read from — designers have to infer from the compiled bundle.

**Mitigation:** Phase 1 must rebuild React components from the bundle rules. Store the `.prompt.md` rebuild spec with each component for future maintenance.

### Issue 3: Booking Status Enum Mismatch

**Problem:** Two different spellings in different files.

**Files affected:**
- `app/vamos-ops-data.js` line 184 — `'no-show'` (hyphen)
- `HANDOFF-CLAUDE-CODE.md` line 305 — `no_show` (underscore)

**Reality:** The vamos-ops-data.js version is correct (hyphen matches CSS class naming).

**Impact:** Low (naming, not a functional bug), but risks mis-porting to the database schema.

**Fix:** Standardize on `no-show` (hyphen) everywhere. Update `HANDOFF-CLAUDE-CODE.md` line 305.

### Issue 4: Vehicle Class Count Disagrees

**Problem:** Three sources state different class counts and capacities.

**Files affected:**
- `design-system/readme.md` §7 — "confirmed" Economy 3/3, Business (capacity not stated), **Van 8/8** (three classes)
- `app/home/home.dc.html` line 744–749 — four classes: Economy 3/3, Business 3/3, First 3/2, **Van 7/8**
- `app/pages/checkout.dc.html` line 156 + `confirmation.dc.html` line 112 — name-map holds only `economy` and `van` (two classes)

**Conflicts:**
1. Van capacity: readme says 8/8, home/checkout say 7/8
2. Class count: readme says 3, home says 4, checkout says 2 (by name map)
3. Business capacity: never supplied (readme placeholder only)

**Owner decision needed:** See `OPEN-QUESTIONS.md` Q5, Q6, Q7 and `LEGAL-PLACEHOLDER-CHECKLIST.md` A13.

**Mitigation:**
- Phase 1 must tokenize vehicle classes (names, capacities, examples) before any React rebuild.
- Current fixture in home.dc.html defaults to Economy 3/3 + Van 7/8.

---

## Root Images Stray in Repo Root

**Issue:** Static images the mocks load directly, outside `assets/`.

**Files affected:**
- `hero-arrivals.jpg` (123 KB) — loaded by `app/home/home.dc.html`
- `rectangle-msch23iq-dqll.png` (1.9 MB)
- `rectangle-msch2rwv-7g2c.png` (1.9 MB)
- `rectangle-msch3rzt-lwc6.png` (1.3 MB)

**Why it matters:** These are design review captures, not part of the app. They clutter the repo root and should be archived.

**Mitigation:** Move to `docs/screenshots/` or `docs/uploads/` and update mock references.

---

## Hard-Coded Cancellation Promise Outside Data-Tok

**Issue:** Unconfirmed policy copy rendered as fact.

**Files affected:**
- `app/pages/checkout.dc.html` line 172 — `"Fixed price, all taxes and tolls included. Free cancellation up to 24 h before pickup."`

**Problem:** This string appears outside a `data-tok` pill. The "24 h" is an unconfirmed policy number that must be:
1. Confirmed by the owner (blocks this statement)
2. Moved to a settings-driven token (`legal.cancellation.freeCancelWindow`) once the number lands
3. If the number differs from "24 h", this checkout copy will be legally wrong

**Owner decision needed:** Confirm the free-cancel window window, or convert this line to a settings reference that shows TBC until confirmed.

**Ref:** `OPEN-QUESTIONS.md` Q15.

---

## Test Coverage: None

**Status:** Expected — Phase 0 not started.

**No tests exist** for:
- Mocks (mock data contracts are treated as specs, not tested)
- Date/time picker logic (no timezone safety checks for `Europe/Zurich`)
- Quote price calculation (Phase 4 engine)
- Booking lifecycle state machine
- Refund calculation rules
- i18n string coverage

**Mitigation:** Phase 1 scaffold sets up test infrastructure (Jest or Vitest). Phase 2–6 adds unit + integration tests per `GSD-LAUNCH.md` definition of done.

---

## 27 Open Questions Blocking the Build

All documented in `docs/build/OPEN-QUESTIONS.md`.

**Groups:**
- Group 1 (Q1–Q4): Phase 0 scaffold decisions (accounts, DNS, repo, font licence)
- Group 2 (Q5–Q10): Phase 2 schema design (vehicle classes, capacities, staff users, booking ref format)
- Group 3 (Q11–Q20): Phase 4–5 pricing + checkout (price matrix, refund policy, payment methods, flight tracking, hourly mode)
- Group 4 (Q21–Q26): Phase 6–8 legal + hardening (analytics tool, data residency, social sign-in, review import)
- Group 5 (Q27): Missing ops screens

**Impact:** Nothing can move past planning until Group 1 is answered. Group 2 must be answered before Phase 2 schema design.

---

## Archive Snapshot (Frozen — Do Not Use)

**Files:** `archive/ds-upgrade/` and `archive/design_handoff_file_architecture/`

**Status:** Frozen historical snapshots. Do not edit, do not copy from, do not resolve ambiguities by looking at them.

**Why:** They contain older versions of the same page files (pre-reorg layout). The live pages exist only in `app/`.

---

*Concerns audit: 2026-08-17*
