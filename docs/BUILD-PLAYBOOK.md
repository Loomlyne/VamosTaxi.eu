# Vamos Taxi — Build Playbook (tools × phases)

**Capacity:** ~6h/day · **Target:** 3 weeks core · **Client promise:** 3–4 weeks / 1 month  
**Canonical product lock:** `docs/DECISIONS.md` · `docs/SCOPE-OF-WORK.md` · skill `vamos-taxi`  
**Office-hours design:** `~/.gstack/projects/VamosTaxi.eu/*-design-*.md`

---

## Tool matrix (use this every session)

| Tool | Use for | Do not use for |
|------|---------|----------------|
| **Claude Design** | Screen layouts, visual system, booking UI mockups, admin wire look | Backend, Stripe, schema, deploy |
| **Claude Code** | Feature verticals, multi-file app work, PR-shaped slices | Endless redesign; secrets; SOW prose |
| **Cursor** | Fast local edits, Tailwind polish, types, small refactors | Greenfield product decisions |
| **Hermes (kossbuild)** | Scope, GSD, schema/RLS, scripts, deploy, verify, git ship, Mapbox/Stripe glue, SOW | Competing redesign of frozen screens |
| **gsd headless query** | Progress snapshot | Implementation |

### Session open ritual

1. Load skill `vamos-taxi` (Hermes) / open this playbook.  
2. `gsd headless query` or read active milestone ROADMAP.  
3. Confirm **one slice** only.  
4. If UI: check Claude Design freeze exists — else design first.  
5. Implement → verify → commit (main) when slice done.

### Decision rights

| Decision | Owner |
|----------|--------|
| Product in/out | `docs/DECISIONS.md` + SOW (Hermes updates only with user) |
| Visual look | Claude Design freeze, then implement exactly |
| Schema/security | Hermes + Supabase RLS rules |
| Pricing numbers | **Client** — never invent real CHF rates |

---

## Phase 0 — Inputs + design freeze (Days 0–2)

**Goal:** Unblock pricing; freeze 4 screens. No app feature work until freeze.

| Task | Tool |
|------|------|
| Chase client inputs (`docs/INPUTS-NEEDED.md` min set) | Hermes / you |
| SOW send / sign | Hermes + DOCX |
| Home + booking widget visual | **Claude Design** |
| Quote / vehicle cards | **Claude Design** |
| Checkout + coupon | **Claude Design** |
| Admin bookings list + detail | **Claude Design** |
| Export tokens/notes into repo `docs/design/` (optional) | Hermes |

**Exit:** 4 approved screens + at least placeholder vehicle classes + 3–5 fixed routes OR explicit “use labeled placeholders” OK.

---

## M001 — Quote foundation (Days 3–6)

**Goal:** Staging app: pin/search → route → price → vehicles.

| Slice | Work | Primary tool | Verify |
|-------|------|--------------|--------|
| S01 | Next.js + Tailwind + shadcn scaffold, Vercel project | Claude Code / Hermes | `pnpm dev` / build |
| S02 | Design tokens + homepage booking shell from Design freeze | Claude Code ← Design | Mobile layout match |
| S03 | Mapbox map + geocode + server directions contract | Hermes / Claude Code | Pin sets lat/lng; route km/min |
| S04 | Pricing engine (fixed override + calculated) + snapshot shape | Claude Code / Hermes | Unit cases for 2 routes |
| S05 | Eligible vehicle cards | Claude Code | Capacity filter works |
| S06 | Supabase schema drafts + RLS for quotes/drafts | Hermes | RLS policies applied |

**Exit demo:** Phone: ZRH → hotel, price shown, vehicle selectable, draft persisted.

**Hermes helps when:** Mapbox keys, server route secrets, schema migrations, GSD slice checkoff.

---

## M002 — Checkout + accounts + email (Days 7–10)

**Goal:** Pay → voucher → history.

| Slice | Work | Primary tool | Verify |
|-------|------|--------------|--------|
| S01 | Passenger, flight, extras, return | Claude Code | Forms validate |
| S02 | Coupons apply on server quote | Claude Code / Hermes | Discount math + snapshot |
| S03 | Supabase Auth + guest + claim | Hermes / Claude Code | Login; guest book |
| S04 | Stripe Checkout/PI + webhook idempotent | Hermes + billing skill | Test card → paid |
| S05 | Resend confirmation + voucher | Hermes / Claude Code | Email received |
| S06 | Manage booking link + account history | Claude Code | Cancel in policy |

**Exit demo:** Full paid test booking, email, appears in account.

---

## M003 — Ops dashboard (Days 11–15)

**Goal:** Run a day of dispatch without Freshpage.

| Slice | Work | Primary tool | Verify |
|-------|------|--------------|--------|
| S01 | Admin auth + role gate | Hermes / Claude Code | Non-admin blocked |
| S02 | Bookings list/calendar by pickup time | Claude Code ← Design | Sort/filter |
| S03 | Detail + status workflow | Claude Code | Status + audit |
| S04 | Assign driver/vehicle records | Claude Code | 2-click assign |
| S05 | Manual booking create | Claude Code | Phone booking path |
| S06 | Pricing/routes/coupons admin CRUD | Claude Code / Hermes | Rule change no rewrite old bookings |
| S07 | CSV export | Claude Code | File downloads |

**Exit demo:** Paid booking → assign → status → customer email on status.

---

## M004 — Launch hardening (Days 16–21)

**Goal:** Production acceptance.

| Slice | Work | Primary tool | Verify |
|-------|------|--------------|--------|
| S01 | About/FAQ/legal (Vamos-only; no Connecto) | Claude Code + client text | Pages live |
| S02 | EN+DE strings | Claude Code / Cursor | Switch language |
| S03 | Airport/route SEO shells | Claude Code | 3+ pages |
| S04 | Sentry + analytics funnel | Hermes / Claude Code | Events fire |
| S05 | Security pass (RLS, headers, secrets) | Hermes | Checklist |
| S06 | Domain cutover + handover | Hermes | Prod URL + access |

**Exit:** SOW acceptance criteria green.

---

## Daily 6h template

| Block | Minutes | Tool |
|-------|---------|------|
| Orient (GSD + slice) | 15 | Hermes |
| Build | 180–210 | Claude Code / Cursor |
| Integrate hard bits | 60–90 | Hermes |
| Verify + commit | 30–45 | Hermes / terminal |

One slice per day when possible. Never redesign and rewrite payment in the same day.

---

## Anti-patterns

1. Opening Claude Design after M001 Day 2 for “just a new look.”  
2. Stripe Connect “while we’re here.”  
3. Live GPS without driver feed.  
4. Inventing CHF prices as production truth.  
5. Building admin before quote+pay works.  
6. Three tools editing the same file without a single owner for the slice.

---

## Commands (Hermes / local)

```bash
# Progress
export PATH="$HOME/.npm-global/bin:$PATH"
cd /Users/koss/Developer/VamosTaxi.eu
gsd headless query

# SOW regenerate
python3 scripts/create-scope-of-work.py

# After app exists
pnpm typecheck && pnpm build
```

---

## Requirement coverage map

| Req | Milestone |
|-----|-----------|
| R001 Booking entry | M001 |
| R002 Route distance (Mapbox) | M001 |
| R003 Pricing + snapshot | M001–M003 |
| R004 Eligible vehicles | M001 |
| R005 Persistence + RLS | M001+ |
| R006 Passenger/extras/return | M002 |
| R007 Auth + history | M002 |
| R008 Coupons | M002–M003 |
| R009 Stripe + webhook | M002 |
| R010 Resend emails | M002–M003 |
| R011 Admin ops | M003 |
| R012 Launch/legal/SEO | M004 |
