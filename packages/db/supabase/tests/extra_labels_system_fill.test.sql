-- extra_labels_system_fill.test.sql
--
-- Phase 32 plan 02 (D-02, D-10, T-32-09, T-32-10). The background fill of extra names: an empty
-- language is filled and added to machine_langs, a machine language is refreshed, a name he typed
-- (non-empty, outside machine_langs) is never changed, the payload is jsonb (a twice-serialised string
-- is unwrapped), and only vamos_system may call either function.
begin;
select plan(23);

-- ── EXECUTE per role ───────────────────────────────────────────────────────────────────── 6
select function_privs_are('public', 'system_extra_labels_missing', '{}'::text[], 'vamos_system', '{EXECUTE}'::text[], 'missing: vamos_system has EXECUTE');
select function_privs_are('public', 'system_extra_labels_missing', '{}'::text[], 'vamos_staff', '{}'::text[], 'missing: vamos_staff has no EXECUTE');
select function_privs_are('public', 'system_extra_labels_missing', '{}'::text[], 'anon', '{}'::text[], 'missing: anon has no EXECUTE');
select function_privs_are('public', 'system_extra_label_fill', '{text,jsonb}'::text[], 'vamos_system', '{EXECUTE}'::text[], 'fill: vamos_system has EXECUTE');
select function_privs_are('public', 'system_extra_label_fill', '{text,jsonb}'::text[], 'vamos_staff', '{}'::text[], 'fill: vamos_staff has no EXECUTE');
select function_privs_are('public', 'system_extra_label_fill', '{text,jsonb}'::text[], 'anon', '{}'::text[], 'fill: anon has no EXECUTE');

-- His German name (typed), no French, a machine Arabic name. And one row he filled completely.
insert into public.extra_labels (code, label_en, label_de, label_fr, label_ar, machine_langs) values
  ('xf_typed', 'Child seat', 'Kindersitz', null, 'قديم', '{ar}'),
  ('xf_full', 'Ski rack', 'Skitraeger', 'Porte-skis', 'حامل تزلج', '{}');

-- ── Missing list ───────────────────────────────────────────────────────────────────────── 3
set local role vamos_system;
select is((select label_en from public.system_extra_labels_missing() where code = 'xf_typed'), 'Child seat',
  'a code with a missing language is listed with his English name');
select is((select count(*)::int from public.system_extra_labels_missing() where code = 'xf_full'), 0,
  'a code with all four names is not listed');
select is((select missing_de || '|' || missing_fr || '|' || missing_ar from public.system_extra_labels_missing() where code = 'xf_typed'),
  'false|true|false', 'the list says which language is missing (only fr here), so the job translates only that');

-- ── Fill: empty filled, machine refreshed, his typed name kept ─────────────────────────── 5
select is(public.system_extra_label_fill('xf_typed', '{"de":"Maschinensitz","fr":"Siege enfant","ar":"مقعد أطفال"}'::jsonb), 2,
  'the fill writes two languages (empty fr, machine ar)');
reset role;
select is((select label_de from public.extra_labels where code = 'xf_typed'), 'Kindersitz', 'his typed German name is unchanged');
select is((select label_fr from public.extra_labels where code = 'xf_typed'), 'Siege enfant', 'the empty French name is filled');
select is((select label_ar from public.extra_labels where code = 'xf_typed'), 'مقعد أطفال', 'the machine Arabic name is refreshed');
select is((select array_to_string(array(select unnest(machine_langs) order by 1), ',') from public.extra_labels where code = 'xf_typed'),
  'ar,fr', 'machine_langs gains fr and never de');

-- ── Fully typed row: nothing changes ───────────────────────────────────────────────────── 2
set local role vamos_system;
select is(public.system_extra_label_fill('xf_full', '{"de":"A","fr":"B","ar":"C"}'::jsonb), 0, 'a fully typed row gets no write');
reset role;
select is((select label_de || '|' || label_fr || '|' || label_ar || '|' || cardinality(machine_langs) from public.extra_labels where code = 'xf_full'),
  'Skitraeger|Porte-skis|حامل تزلج|0', 'every typed name on that row is unchanged');

-- ── Payload shapes ─────────────────────────────────────────────────────────────────────── 5
set local role vamos_system;
select is(public.system_extra_label_fill('xf_typed', to_jsonb('{"fr":"Rehausseur"}'::text)), 1, 'a twice-serialised JSON string is unwrapped');
select is(public.system_extra_label_fill('xf_typed', '{"fr":"   ","ar":42}'::jsonb), 0, 'blank and non-string values are ignored');
select is(public.system_extra_label_fill('xf_nope', '{"fr":"X"}'::jsonb), 0, 'an unknown code writes nothing');
select throws_ok($$ select public.system_extra_label_fill('xf_typed', '["fr"]'::jsonb) $$, '22023', null, 'a non-object payload is refused');
reset role;
select is((select label_fr from public.extra_labels where code = 'xf_typed'), 'Rehausseur', 'the machine French name was refreshed again');

-- ── Refused callers ────────────────────────────────────────────────────────────────────── 2
set local role vamos_staff;
select throws_ok($$ select public.system_extra_label_fill('xf_typed', '{"de":"X"}'::jsonb) $$, '42501', null, 'vamos_staff cannot call the fill');
reset role;
set local role anon;
select throws_ok($$ select public.system_extra_label_fill('xf_typed', '{"de":"X"}'::jsonb) $$, '42501', null, 'anon cannot call the fill');
reset role;

select * from finish();
rollback;
