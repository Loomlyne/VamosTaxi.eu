# Research Brief — Residency, Consent & Audit Schema (Phase 2)

**Lane:** residency-audit · read-only research, no files written outside the permitted directory (none written — this is a text brief per instructions).

Sources read first: `.planning/ADR-007-edge-data-residency.md`, `.planning/ADR-010-privacy-subprocessor-list-cloudflare.md`, `.planning/PROJECT.md`, `.planning/STATE.md`, `.planning/ROADMAP.md`, `.planning/research/PITFALLS.md`, and the live `app/pages/CookieBanner.dc.html` (four consent categories: necessary/functional/analytics/marketing), plus current Cloudflare/Supabase/Swiss-law documentation (cited inline).

---

## 1. `consent_log` — server-side, provable, survives an account that doesn't exist yet

**What must be recorded** (mirrors `CookieBanner.dc.html`'s four fixed categories and the GDPR/nFADP evidentiary minimum — user/device identifier, precise timestamp, purposes accepted/declined, banner/policy version, collection method, and a record of subsequent changes ([secureprivacy.ai](https://secureprivacy.ai/blog/gdpr-consent-audit-evidence-requirements))):

```sql
create table consent_log (
  id                 bigint generated always as identity primary key,
  consent_subject_id uuid        not null,   -- stable id set in a functional, non-consent-gated
                                              -- first-party cookie BEFORE any account exists
  customer_id        uuid        references customers(id) on delete set null,
  booking_id         uuid        references bookings(id)  on delete set null,
  policy_version     text        not null,   -- cookie-policy copy version shown at capture time
  method             text        not null check (method in
                        ('accept_all','reject_all','save_choices','settings_change')),
  necessary          boolean     not null default true,
  functional         boolean     not null default false,
  analytics          boolean     not null default false,
  marketing          boolean     not null default false,
  locale             text        not null,          -- en|de|fr|ar, Law 03
  user_agent         text,
  ip_truncated       inet,       -- last octet/64 zeroed BEFORE insert — never store a raw IP
  recorded_at        timestamptz not null default now()
);

alter table consent_log enable row level security;

-- Anyone — including a guest with no account yet — can log their own choice.
create policy consent_log_insert_any on consent_log
  for insert to anon, authenticated with check (true);

-- A signed-in customer reads only their own history; staff (admin only — this is
-- evidence, not an ops workflow) read everything.
create policy consent_log_select_own on consent_log
  for select to authenticated using (customer_id = auth.uid());
create policy consent_log_staff_select on consent_log
  for select to authenticated using (auth.jwt() ->> 'role' = 'admin');

-- No update/delete policy exists for anyone, at any role. That is the whole control:
-- Postgres RLS defaults to deny, so omitting UPDATE/DELETE policies makes every row
-- append-only even for a role holding table-level UPDATE grants.
```

**Design decisions and why:**

- **`consent_subject_id` is the anchor, not `customer_id`.** A guest chooses cookie categories before signing up (or ever signing up). The id lives in a first-party cookie that is itself exempt from consent-gating because it exists to *prove* consent — the same GUID-in-a-functional-cookie pattern used by established consent platforms ([support.cookiebot.com](https://support.cookiebot.com/hc/en-us/articles/360003782654-Logging-and-demonstration-of-user-consents)). When the guest later creates an account, the app inserts a **new** row with `customer_id` set and the current category state — it never rewrites history, which is what makes the log provable.
- **Never mutate, only append.** A withdrawal or a changed choice is a new row with a later `recorded_at`; the full history is the proof. This satisfies both the "record of subsequent changes" requirement and the immutability property auditors expect.
- **`ip_truncated`, not raw IP.** Storing the visitor's IP address turns a consent-proof table into another store of personal data needing its own justification. Truncating (zero the last octet/64) keeps enough for abuse investigation without being individually identifying — a minimization call, not a hard requirement; flagged UNCERTAIN below.
- **Retention:** industry guidance suggests keeping active consent logs 3–5 years to cover civil-claim limitation periods ([secureprivacy.ai](https://secureprivacy.ai/blog/gdpr-consent-audit-evidence-requirements)). For rows tied to a `booking_id` that is itself under the 10-year Swiss accounting-retention duty (§3), keep the linked consent row at least as long as the booking record it helps justify (it is part of that record's evidentiary basis) — do not run a separate, shorter TTL against those rows.
- **Erasure interaction:** on account deletion, `customer_id` is set to `NULL` (never delete the row) — this removes the direct link to a named account while preserving the anonymous proof-of-consent trail. See §3 for the general redact-don't-delete pattern this follows.

**UNCERTAIN — settle with counsel, not engineering:** whether `ip_truncated` should be collected at all under nFADP/GDPR minimization, and the exact retention ceiling for consent rows *not* tied to any booking (pure marketing-cookie consent with no purchase). Recommendation stands regardless — ship the schema now with the field nullable, decide the collection policy before Phase 10 turns the banner live.

---

## 2. Audit trail — two tables, not one universal table, not per-domain tables

**Decision: `booking_events` (already forward-designed, §GSD-LAUNCH.md:70) for the booking/price/payment/assignment aggregate named in the constraint, plus one generic `audit_log` for everything else (settings, coupons, chauffeurs, vehicles, rates, content_strings, review moderation).** Not a single universal table (loses the booking-specific "who/what/when" ergonomics the ops Detail screen needs, and forces every read to filter a `table_name` column even for the highest-volume table in the system), and not N per-domain event tables (overkill for simple admin CRUD that only ever needs before/after, not semantic event types).

### 2a. `booking_events` — application-written, staff-readable only

```sql
create table booking_events (
  id          bigint generated always as identity primary key,
  booking_id  uuid        not null references bookings(id) on delete restrict,
  leg_id      uuid        references booking_legs(id) on delete set null,
  event_type  text        not null,   -- 'status_changed'|'price_recalculated'|
                                       -- 'payment_captured'|'payment_refunded'|
                                       -- 'chauffeur_assigned'|'vehicle_assigned'|'note_added'…
  actor_type  text        not null check (actor_type in ('customer','staff','system','stripe_webhook')),
  actor_id    uuid,                   -- customers.id or staff profile id; null for system/webhook
  from_value  jsonb,
  to_value    jsonb,
  detail      jsonb       not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);
create index on booking_events (booking_id, created_at);

alter table booking_events enable row level security;

-- Deliberately NO insert/update/delete policy for anon or authenticated, at any role.
create policy booking_events_staff_select on booking_events
  for select to authenticated
  using (auth.jwt() ->> 'role' in ('dispatcher','admin'));
```

- **Written by:** application code, inside the same transaction as the state change, using the Supabase **service_role** key on the server — never by a trigger. A trigger only sees an old/new row diff; it cannot express *why* (e.g., distinguishing "customer cancelled" from "no-show sweep cancelled" when both just flip `status → cancelled`), and it cannot see `actor_id` for a Stripe webhook or a cron job, which run without a user JWT at all. This matches the project's existing "server-authoritative" posture (`PROJECT.md` §Security).
- **How it survives RLS:** not by a policy that lets staff write and blocks them from deleting — by having **no INSERT/UPDATE/DELETE policy at all** for any client-facing role. Only server code holding the service_role key (which bypasses RLS by Supabase design and never ships to a browser) can write a row. A compromised staff JWT — even an `admin` one — cannot forge, edit, or delete a single event through PostgREST or the Supabase client, because there is no policy path that grants it. Corrections are new compensating events, never edits.
- Customer-facing booking timelines (if any ship) are served by the app querying this table server-side and filtering to customer-safe `event_type`s — the customer's own RLS session never touches `booking_events` directly, so an internal ops note never leaks through a policy gap.

### 2b. `audit_log` — generic, trigger-written, for everything that isn't a booking

```sql
create table audit_log (
  id           bigint generated always as identity primary key,
  table_name   text        not null,
  record_id    text        not null,   -- text: covers both uuid PKs and natural keys (rates.klass)
  action       text        not null check (action in ('insert','update','delete')),
  actor_type   text        not null check (actor_type in ('staff','system')),
  actor_id     uuid,
  before_value jsonb,
  after_value  jsonb,
  created_at   timestamptz not null default now()
);
create index on audit_log (table_name, record_id, created_at);

alter table audit_log enable row level security;
create policy audit_log_admin_select on audit_log
  for select to authenticated using (auth.jwt() ->> 'role' = 'admin');
-- no insert/update/delete policy — same immutability discipline as booking_events

create or replace function audit_log_row() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into audit_log(table_name, record_id, action, actor_type, actor_id, before_value, after_value)
  values (
    tg_table_name,
    coalesce(new.id::text, old.id::text),
    lower(tg_op),
    case when auth.role() = 'service_role' then 'system' else 'staff' end,
    auth.uid(),
    case when tg_op in ('update','delete') then to_jsonb(old) end,
    case when tg_op in ('insert','update') then to_jsonb(new) end
  );
  return coalesce(new, old);
end;
$$;

create trigger trg_audit_settings after insert or update or delete on settings
  for each row execute function audit_log_row();
-- repeat for coupons, chauffeurs, vehicles, rates, fixed_routes, surcharges, content_strings
```

Trigger-based is the right call *here* (unlike `booking_events`) because these are plain admin CRUD tables with no semantic "why" beyond the diff itself — a trigger guarantees the log fires even if a future ops screen forgets to call an app-level audit helper, which is exactly the defense-in-depth a generic admin audit trail needs.

---

## 3. Personal-data inventory, special category, and erasure vs. the 10-year financial record

**Personal data in the VamosOps contract** (all fields below are personal data once linked to an identified/identifiable natural person; fields not listed — `vehicle_classes`, `rates`, `surcharges`, `content_strings`, `settings` — are not):

| Table | Personal-data columns | Subject-access / erasure handling |
|---|---|---|
| `customers` | name, email, phone, company | SAR: export row + linked bookings. Erasure: **redact, don't delete** (see below). |
| `bookings` | customer link, pickup/dropoff (route text tied to a person's movement), flight_no, notes, manage_token | SAR: export. Erasure: redact identifiers; route/date/price stay as the financial record (Art 958f). |
| `chauffeurs` | name, phone, email, licence, photo_path | Employee/contractor data, not a customer SAR path — HR-law retention applies, not GDPR erasure-on-request in the same way; out of scope for this brief's consumer-facing consent design. |
| `reviews` | name, avatar, text | Author can request removal; `published=false` is a soft path, but Law 04/ADR-008 already tracks `source` — a "manual" review's author can ask for deletion outright since no accounting duty attaches to it. |
| `consent_log` | consent_subject_id, ip_truncated, user_agent | Erasure: `customer_id → NULL`, row otherwise kept as evidentiary trail (§1). |
| `booking_events` / `audit_log` | actor_id, jsonb snapshots that may echo customer PII | Not independently erasable — see below. |
| `coupon_redemptions` | customer_id, booking_id | Financial-adjacent (affects the price actually charged) — same 10-year duty as `bookings`. |

**Special category data (GDPR Art. 9): none is designed into the schema, and none should be — with one live product risk to flag.** The `about.dc.html` / `terms.dc.html` copy already invites a customer to "declare" a **collapsible wheelchair** as travel equipment so the right vehicle class is assigned (`app/vamos-i18n-dict.js:453,1316`). A free-text declaration of mobility equipment is *close to* Art. 9 health data (it can reveal a disability) even though, read narrowly, it's a logistics fact about cargo, not a diagnosis. **This is genuinely unsettled** — EDPB guidance treats "requires a wheelchair-accessible vehicle" as health-adjacent when the *purpose* of collecting it is accommodating a disability, which is exactly the purpose here.

- **UNCERTAIN — the check that settles it:** ask counsel whether `bookings.note` (or a future structured `accessibility_requirements` field) needs an Art. 9 explicit-consent basis and restricted-access RLS, or whether "equipment as cargo" framing keeps it as ordinary Art. 6(1)(b) contract-necessity data. **Recommendation until answered:** treat it as ordinary personal data with the same access scope as the rest of the booking row (customer + assigned staff only, via the RLS already required by DATA-02) — do not build a separate restricted-field mechanism speculatively, but do not let this field go unmentioned in the privacy policy's "when you book" list either (it currently lists only flight number, per ADR-010's own finding that that list was already incomplete once — see ADR-010's AeroDataBox finding, the same pattern applies here).

**Erasure vs. the 10-year statutory financial record.** Swiss Code of Obligations Art. 958f requires accounting records, including invoices, to be retained **10 years from the end of the financial year** in which they were created, in a form that stays readable and consistent with the underlying transaction ([findea.ch](https://www.findea.ch/en/blog/obligation-retain-accounting-records-switzerland-2024), [swissrights.ch](https://www.swissrights.ch/gesetze/Artikel-958f-OR-2025-EN.php)). GDPR Art. 17(3)(b)/(e) exempts erasure where retention is needed for a legal obligation or to establish/defend legal claims. **The schema reconciles this with redact-in-place, not row deletion:**

```sql
alter table customers add column erased_at timestamptz;

-- Erasure fulfilment (application-run, not a DB default):
update customers
set name  = 'Redacted customer',
    email = 'redacted+' || id || '@deleted.vamostaxi.eu',   -- keeps the unique constraint satisfiable
    phone = null,
    company = null,
    erased_at = now()
where id = $1;
```

- The `customers` row is **never deleted** while any FK'd `bookings`, `booking_events`, `audit_log`, `coupon_redemptions` or `consent_log` row still needs it inside its own retention window — deleting it would either cascade-null a decade of financial history or violate `on delete restrict`. Redaction removes the *direct identifiers* (name/email/phone) while the accounting-relevant fields on `bookings` (reference, date, price, route, class) stay intact, because those are the actual Art. 958f record, not "about" the person's ongoing identity.
- Guest bookings (no `customer_id`, DATA-03/PAY-03) follow the same pattern at the `bookings` row level directly: identifiers redacted after the 10-year window closes for a paid trip, or immediately for a cancelled/never-paid quote with no accounting relevance.
- **UNCERTAIN — the check that settles it:** GDPR Art. 17(3)(b) as literally worded exempts retention required by "Union or Member State law" — a Swiss federal statute is arguably neither, for an EU data subject. Counsel needs to confirm whether Art. 17(3)(b) extends pragmatically to a foreign controller's home-jurisdiction statutory duty, or whether Art. 17(3)(e) ("establishment, exercise or defence of legal claims") is the safer basis to cite instead. **This does not block the schema** — the redact-not-delete pattern above is correct under either basis; only the *citation* in the privacy policy depends on the answer.

---

## 4. Data residency — what the schema/design must actually guarantee, and what ADR-007 gets technically wrong about how to guarantee it

**Storage is easy and already correct.** Supabase is pinned to `eu-central-1` (Frankfurt) at project creation — this is a one-time, load-bearing config choice, not a schema concern, and it's already the stated constraint (`PROJECT.md`). Every table in this brief and in DATA-01 lives there. Two adjacent storage decisions need the same explicit pinning, and neither is automatic:

- **R2** (the recommended photo store for `chauffeur-photos`/`vehicle-photos`/`review-photos` per `GSD-LAUNCH.md`): a bucket can be created with a hard **jurisdictional restriction** (`jurisdiction: "eu"`) that *guarantees* objects never leave the EU — this is distinct from, and stronger than, the "location hint" option, which Cloudflare's own docs describe as "best effort and not a guarantee" ([developers.cloudflare.com/r2/reference/data-location](https://developers.cloudflare.com/r2/reference/data-location/)). The jurisdiction is set at bucket creation and **cannot be changed afterward** — this must be decided before Phase 2's bucket-creation step, not retrofitted. **Recommendation: create all three buckets with `jurisdiction=eu` from the first `wrangler`/API call that creates them.**
- **KV** (geo/quote/flight caches, per the architecture doc): KV's jurisdictional-restriction feature is currently **private beta**, not generally available ([developers.cloudflare.com/kv](https://developers.cloudflare.com/kv/)). The mitigation is architectural, not a Cloudflare setting: the cache keys as already specified (place-id pair, flight number) are **not** customer-identifying — as long as engineering discipline holds that no KV entry is ever keyed by `customer_id`, `booking_id`, or email, the cache never holds personal data in the GDPR sense regardless of which PoP replicates it. This is a design rule to write into Phase 4's quote-cache implementation, not a schema table.

**Worker execution is where ADR-007's proposed mechanism does not deliver what the ADR implies it delivers, and this needs to go back to that ADR before counsel signs off on it.**

- **Smart Placement / Placement Hints — the mechanism ADR-007 proposes — is a latency optimizer with no residency guarantee.** Cloudflare's own docs are explicit: Workers "run on Cloudflare's global network, not inside cloud provider regions," Smart Placement only considers "locations where the Worker has previously run," and "at high traffic volumes, Cloudflare may run instances across a more distributed area to balance traffic" ([developers.cloudflare.com/workers/configuration/placement](https://developers.cloudflare.com/workers/configuration/placement/)). It cannot be cited to counsel as a control that keeps booking-route execution in Frankfurt — it is a *hint*, not a *restriction*, and can drift under load.
- **The mechanism that actually restricts where a Worker executes is Regional Services, part of the Data Localization Suite — and it is an Enterprise-only add-on** requiring an account-team conversation and entitlement, not something available on a standard Workers Paid plan ([developers.cloudflare.com/data-localization/regional-services](https://developers.cloudflare.com/data-localization/regional-services/)). It also only covers requests on custom domains/`*.workers.dev`, explicitly does **not** cover Queues or Cron Triggers, and does not restrict outgoing subrequests — so even fully licensed, it would not blanket-cover every code path this project's architecture uses (Queues for Stripe webhook fan-out, Cron for quote-expiry/no-show sweeps).
- **Net effect for a solo, non-Enterprise project:** there is currently no purchasable Cloudflare control that *guarantees* Worker code processing personal data executes only inside the EU. What the schema/design *can* guarantee, and should:
  1. **No personal data ever comes to rest anywhere except Supabase (Frankfurt) and EU-jurisdiction R2** — Workers only ever hold personal data transiently, in memory, for the duration of a single request, then discard it; nothing is written to KV, Durable Objects, or logs keyed by customer identity.
  2. **Logpush/observability exports are scoped to exclude request bodies containing personal data**, or are themselves routed to an EU log destination — this is a Phase 10 concern (`PITFALLS.md` Pitfall 13 already ties Sentry to the consent-log gate; the same discipline applies to any log sink).
  3. Everything else — whether *transient* processing at a non-EU PoP, with zero persistence there, counts as a "transfer" under nFADP/GDPR at all — is exactly the open legal question ADR-007 already correctly identifies as outside engineering's competence. This brief does not attempt to answer it; it corrects the *technical* premise ADR-007's "Pin the data routes only" option rests on, so counsel is choosing between accurately described options.

**UNCERTAIN — the check that settles it, stated precisely so it can go straight back into ADR-007's revision:** contact the Cloudflare account team to confirm (a) whether Regional Services / Data Localization Suite can be added to this project's plan at all and at what cost, and (b) its exact coverage against this project's actual route list (booking POST, account reads, ops route group, **plus** Queues consumers and Cron-triggered handlers, none of which Regional Services covers per its own docs). If the answer is "not available/not affordable," ADR-007 needs to be rewritten around what's actually achievable — minimize what Worker code processes outside the DB round-trip and lean on the transient-processing legal argument — rather than presenting Smart Placement as if it were a compliance control.

---

## RECOMMENDATION

Ship four things in the Phase 2 migration set, in this shape, with no further research needed to start building:

1. **`consent_log`** as specified in §1 — append-only, anonymous-subject-first, four boolean categories matching the live cookie banner, no UPDATE/DELETE policy for any role.
2. **`booking_events`** (application-written via service_role, staff-select-only RLS, no client-facing write path at all) for booking/price/payment/assignment changes, and a separate generic **`audit_log`** (trigger-written, admin-select-only) for every other operational table — not one universal table, not per-domain tables.
3. **Redact-in-place erasure** on `customers` (`erased_at` + tombstone email, row never deleted) reconciling GDPR erasure against the Swiss Art. 958f 10-year retention duty; same pattern at the `bookings` row for guest bookings.
4. **R2 buckets created with `jurisdiction=eu` from their first creation call** (irreversible after the fact); KV caches kept non-personal by key design (place-id/flight-number keys only, never customer/booking identity); and a correction fed back into ADR-007 that Smart Placement is not a residency guarantee — the real guarantee mechanism (Regional Services) is an unconfirmed Enterprise entitlement this project may not have, which is a fact counsel needs before signing off on the "pin the data routes" option as written.

Everything else in this brief (`ip_truncated` collection policy, the wheelchair-declaration special-category question, the Art. 17(3)(b) vs (e) citation, and the Regional Services entitlement/cost check) is flagged UNCERTAIN with a concrete, single check attached — none of them block writing the migrations above; they block only the exact wording of the privacy policy and the final settings/consent defaults in Phase 10.

Sources: [Cloudflare Workers Placement](https://developers.cloudflare.com/workers/configuration/placement/) · [Cloudflare Regional Services](https://developers.cloudflare.com/data-localization/regional-services/) · [Cloudflare Workers regionalization how-to](https://developers.cloudflare.com/data-localization/how-to/workers/) · [Cloudflare R2 data location](https://developers.cloudflare.com/r2/reference/data-location/) · [Cloudflare Workers KV](https://developers.cloudflare.com/kv/) · [Cloudflare Hyperdrive — how it works](https://developers.cloudflare.com/hyperdrive/concepts/how-hyperdrive-works/) · [GDPR consent audit evidence requirements](https://secureprivacy.ai/blog/gdpr-consent-audit-evidence-requirements) · [Cookiebot — logging user consent](https://support.cookiebot.com/hc/en-us/articles/360003782654-Logging-and-demonstration-of-user-consents) · [Swiss Code of Obligations Art. 958f](https://www.swissrights.ch/gesetze/Artikel-958f-OR-2025-EN.php) · [Findea — Swiss accounting records retention](https://www.findea.ch/en/blog/obligation-retain-accounting-records-switzerland-2024)