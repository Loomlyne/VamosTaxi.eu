# Phase 12: Ticket schema + #support mock — Research

**Researched:** 2026-09-10
**Domain:** Ops Support board over `contact_submissions` (no `support_tickets` table)
**Question:** What must we know to plan this phase well?

## RESEARCH COMPLETE

Hosted `yaumjzvylngfjhtuffqs` already has most of the four-status ticket schema. This phase is **not** a greenfield create. It is: put that schema in the repo, add **Responded**, FORCE RLS on the header table, align GET/PATCH + DC with D-12…D-14.

---

## 1. Hosted vs repo (census 2026-09-10)

### Hosted (live)

Migration `20260904182631_contact_ticket_schema` **is applied**. It is **not** in `packages/db/supabase/migrations/` (never committed).

| Object | Hosted fact |
|--------|-------------|
| `contact_submissions.ticket_status` | `text not null default 'new'`; CHECK `new/open/replied/closed` — **no `responded`** |
| `reply_token` | `text not null`, unique index `contact_submissions_reply_token_key` |
| `last_activity_at` | `timestamptz not null default now()` |
| `closed_at` | `timestamptz` nullable |
| RLS | `contact_submissions`: RLS **on**, FORCE **off**. `support_messages` + `support_inbound_events`: RLS + **FORCE on** |
| Staff grants | `vamos_staff`: SELECT+UPDATE on `contact_submissions`; SELECT+INSERT on `support_messages`; **none** on `support_inbound_events` |
| Policies | staff select/update on submissions; staff select/insert on messages; **no** inbound-events policies |
| `support_messages.direction` | CHECK `inbound_form` / `outbound_staff` / `inbound_email` |
| `support_messages.body_text` | `not null`, length 1–8000 |
| `support_inbound_events` | PK `email_id text`, `created_at timestamptz not null default now()` |
| `submit_contact_message` | already mints `reply_token`, sets `ticket_status='new'`, inserts `inbound_form` |
| Data | 4 submissions (1 new, 2 open, 1 replied); 4 `inbound_form` + 1 `outbound_staff`; 0 inbound events |
| Anon | no table grants on the three tables |

### Repo (this checkout)

- Tracked: `20260828000002_contact_forms.sql` (header table only, no ticket cols). `submit_contact_message` does **not** mint.
- Tracked: `apps/web/lib/ops/tickets.ts`, `tickets-map.ts`, `tickets-write.ts`, dual-mounted `GET/PATCH /api/staff/tickets` (`27c7d4d`). Four statuses. `nextTicketStatus` **refuses** closed→open. PATCH accepts `reply` and inserts `outbound_staff`.
- Untracked **stale** `packages/db/supabase/migrations/20260910000002_ops_support_write.sql`: 4-status check, direction `inbound/outbound` (wrong vs hosted), no unique token, no `support_inbound_events`, no FORCE. **Must not apply.** Rewrite is the wrong verb — **delete it**. A new delta migration is required.
- Untracked `20260910000001_bookings_select_by_contact_email.sql` is **out of bounds** (account/Phase 8). Hosted already has `20260909224633_bookings_select_by_contact_email`. Do not touch.

Local `db:reset` today **cannot** create ticket columns. Reconstruct `20260904182631_contact_ticket_schema.sql` in the repo so local matches hosted. **Do not** `apply_migration` that version — it is already in hosted `schema_migrations`.

---

## 2. Status model (D-12 / D-13)

Five statuses: `new` | `open` | `replied` | `responded` | `closed`.

| Event | Next | Who implements |
|-------|------|----------------|
| Open overlay on **new** | `open` | Phase 12 PATCH |
| Open overlay on open/replied/responded | unchanged | Phase 12 (no write) |
| Open overlay on **closed** | stays closed | Phase 12 |
| Close button | `closed` + `closed_at` | Phase 12 PATCH |
| Reopen button | `open`, clear `closed_at` | Phase 12 PATCH (discretion: `open`) |
| Staff send reply | `replied` | **Phase 13** — this slice must **not** persist `reply` |
| Customer mail on open/replied/responded | `responded` | **Phase 14** |
| Customer mail on closed | auto-reopen `responded` | **Phase 14** (rule locked; copy in overlay may mention it) |

No drag. No table status picker that PATCHes. Staff cannot PATCH `replied` or `responded` this slice.

`nextTicketStatus` today: closed is terminal except identity. Change: `closed` + requested `open` → `open`. Requested `new` still null. Requested `replied`/`responded` from staff PATCH → reject this slice (Phase 13/14 own those writes).

---

## 3. Staff API (already on main)

- `GET /api/staff/tickets` → `withStaff` → `loadTickets` → `mapTicket`. Dual-mount `app/api/staff/tickets/route.ts` re-exports. **Keep.**
- `PATCH /api/staff/tickets/:id` body `{ status?, reply? }`. This slice: `status` in `{ open, closed }` only; **reject** `reply` (`invalid-status` or `reply-not-this-phase`). Never insert `support_messages` here.
- Do **not** put `reply_token` in `OpsTicketRow` (not present today — keep it that way).
- `asStaff` already lives in `lib/ops/tickets.ts` with `export const dynamic = "force-dynamic"`. Shipped. Do not relocate unless `check:db-fences` fails on files this plan touches.
- GET fail: DC currently treats non-ok as `[]` (empty board). D-06: **error banner**, never fixtures, never fake empty-success.

Open-on-view PATCH fail: overlay stays open, status stays `new`, error on overlay. Do not `hydrate()` in a way that closes the dialog.

---

## 4. DC writer

**Only** `app/ops/OpsSupportTicket.dc.html`. Do not restore `OpsSupport` / `OpsSupportBoard`. `apps/web/public/app/` is generated — do not patch.

Today vs D-*:

| Today | Target |
|-------|--------|
| 4 columns, `repeat(4, …)`, drag + grip | 5 columns, **no** drag/grip/`draggable`, no drop hint |
| Card has `[data-quote]` preview | Name, email, time, ref/locale chips; **no** message preview |
| `isEmpty` hides kanban | GET ok + 0 tickets = **five empty columns** + `data-kb-empty` line |
| Filter one status still kanban-capable | Filter **All** = kanban (desktop Table switch kept); filter **one status** = **table** with phone + status (display, not setter) |
| No column sort | Per-column newest↔oldest arrow; default newest first |
| `sendReply` PATCH `{ status:'replied', reply }` | Composer may stay; Send must **not** PATCH |
| Closed copy: inbound does not reopen | Reopen **button**; copy must not claim inbound never reopens |
| GET fail → empty | Error banner |
| `hydrate` only on mount | Also after successful status PATCH (D-11). No polling |

Sidebar: `app/ops/OpsSidebar.dc.html` already `#support`, icon `mail`, after Customers, `vamos:support-badge`. Default `supportNew: 1` is a fake count — set default **0**. Do not add `#staff`.

Escape: thread body via DC text interpolation only; never `innerHTML`. `mapTicket` already uses `String(body_text)`.

Four languages: inline `T` in the DC script (en/de/fr/ar) — not next-intl. Same pass.

---

## 5. Schema work this phase

1. **Add** `packages/db/supabase/migrations/20260904182631_contact_ticket_schema.sql` reconstructed from hosted (idempotent `if not exists` / `create or replace` so a fresh local reset works). Match hosted CHECKs **as they are today** (four statuses) so the file is the historical migration. **Never apply this version on hosted.**
2. **Add** new `20260910YYMMSS_ticket_status_responded.sql`:
   - Drop/replace `contact_submissions_ticket_status_check` to include `responded`.
   - `ALTER TABLE public.contact_submissions FORCE ROW LEVEL SECURITY`.
   - No `support_tickets` table.
   - No anon grants.
   - Do not recreate tables that exist.
3. **Delete** untracked `20260910000002_ops_support_write.sql`.
4. pgTAP new file (do not bump `contact_forms.test.sql` `plan(20)`): five-status check, unique `reply_token`, FORCE on all three, `submit_contact_message` seeds `inbound_form` + `new`, no `support_tickets`, anon still 42501.
5. Hosted apply: **stop**. Owner says **apply**. Then MCP `apply_migration` **only** the new responded file. Readback: `list_migrations` + check constraint + `relforcerowsecurity`.

Do **not** run `supabase db push` (collides with hosted timestamps).

---

## 6. Parallel / files out of bounds

Do not touch: `OpsBoard` / `OpsDash` / `OpsDetail` / `OpsCalendar`, `api/staff/bookings`, checkout, confirmation, account `/bookings`, `20260910000001_bookings_select_by_contact_email.sql`, live `vamostaxi.eu` DNS, `env.production`, push `main`.

Do not restore `vt-ops-hash-switch` or Staff.

Hyperdrive = direct Postgres. No invented CHF.

---

## 7. Requirements coverage

| ID | This phase |
|----|------------|
| SUP-02 | **Amended** to five statuses. Board shows them. Dispatcher does **not** set any of five arbitrarily — only Open/Close/Reopen. ROADMAP success line “set any of the four” is stale. |
| SUP-01 | GET hydrates real `/contact` rows (partial; full thread UX leftover is 15). |
| SUP-04 | ref/locale on card when present. |
| SUP-05 | Filter All vs one-status table. |
| SUP-03 | Overlay thread + details; newest last (created_at asc + scroll). Reply send is 13. |
| INB-02 | Cold `info@` still out. `support_inbound_events` exists for 14; no catch-all insert. |
| SUP-F01 | Rule locked (closed + customer mail → responded) for 14; Reopen button is 12. |
| RPLY-* | Out. |

---

## 8. Validation architecture

- Unit: `tickets-map.test.ts` (five statuses + reopen + reject staff replied/responded).
- Unit: `tickets-write` transitions without Hyperdrive if extracted; otherwise mock `asStaff` **or** keep mapping pure and test PATCH reasons in a lib helper.
- pgTAP: new support schema file; `pnpm db:test` **local only** — never `test/deployed`.
- DC: no Playwright Hyperdrive. Source assertions + visual gate on `#support` if the plan touches the DC.
- Human UAT after deploy: numbered clicks on `https://dashboard.vamostaxi.site/#support`.

## 9. Threat notes (ASVS L1)

| ID | Threat | Mitigation |
|----|--------|------------|
| T-12-01 | Anon/guest reads or writes tickets | No table grants; GET/PATCH `withStaff` |
| T-12-02 | XSS via contact message | Text only; no HTML render |
| T-12-03 | `reply_token` in JSON | Omit from `OpsTicketRow` |
| T-12-04 | Staff PATCH `replied` without mail | Reject `reply` / those statuses this slice |
| T-12-05 | Apply stale `20260910000002` | Delete file; never apply |
| T-12-06 | Duplicate apply of `20260904182631` | Reconstruct in repo only; do not MCP-apply |

**Standard Stack:** Postgres + existing staff Route Handlers + DC ops console. No new npm package.

**Primary recommendation:** Reconstruct hosted ticket schema in git, delta-add `responded` + FORCE on header, slim PATCH, restyle `OpsSupportTicket` to five columns without drag.
