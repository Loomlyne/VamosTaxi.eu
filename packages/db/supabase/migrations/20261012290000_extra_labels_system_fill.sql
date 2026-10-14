-- 20261012290000_extra_labels_system_fill.sql
--
-- Phase 32 plan 02 (D-02, D-10). Extras on Pricing get their German, French and Arabic names filled
-- in the background by the translate queue (no mark anywhere, D-05). The rule from D-44 stays: a name
-- he typed always wins. extra_labels.machine_langs (internal, never shown) lists the languages the
-- machine wrote; a language outside that list with a non-empty name is his and is never changed.
--
--   system_extra_labels_missing()        codes with a missing de/fr/ar name, plus his English name
--                                        (his own words, not customer text) and which of the three is
--                                        missing, so the job translates only those (a filled name is
--                                        never translated again; PR #83 review).
--   system_extra_label_fill(code, jsonb) writes a language only when it is empty or machine-written,
--                                        and adds it to machine_langs. jsonb in, no array parameter
--                                        (the Worker pg client has no array types).
--
-- Both EXECUTE vamos_system only. No table or column is dropped. No amount.

begin;

create or replace function public.system_extra_labels_missing()
returns table (
  code pg_catalog.text,
  label_en pg_catalog.text,
  missing_de pg_catalog.bool,
  missing_fr pg_catalog.bool,
  missing_ar pg_catalog.bool
)
language sql
stable
security definer
set search_path = ''
as $$
  select e.code,
         e.label_en,
         coalesce(pg_catalog.btrim(e.label_de), '') = '',
         coalesce(pg_catalog.btrim(e.label_fr), '') = '',
         coalesce(pg_catalog.btrim(e.label_ar), '') = ''
    from public.extra_labels as e
   where coalesce(pg_catalog.btrim(e.label_de), '') = ''
      or coalesce(pg_catalog.btrim(e.label_fr), '') = ''
      or coalesce(pg_catalog.btrim(e.label_ar), '') = ''
   order by e.code
$$;

create or replace function public.system_extra_label_fill(p_code pg_catalog.text, p_labels pg_catalog.jsonb)
returns pg_catalog.int4
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_labels pg_catalog.jsonb := p_labels;
  v_row public.extra_labels;
  v_lang pg_catalog.text;
  v_new pg_catalog.text;
  v_cur pg_catalog.text;
  v_de pg_catalog.text;
  v_fr pg_catalog.text;
  v_ar pg_catalog.text;
  v_machine pg_catalog.text[];
  v_written pg_catalog.int4 := 0;
begin
  -- A payload serialised twice arrives as a JSON string; unwrap it once.
  if v_labels is not null and pg_catalog.jsonb_typeof(v_labels) = 'string' then
    v_labels := (v_labels #>> '{}')::pg_catalog.jsonb;
  end if;
  if v_labels is null or pg_catalog.jsonb_typeof(v_labels) <> 'object' then
    raise exception 'system_extra_label_fill: labels must be a JSON object' using errcode = '22023';
  end if;

  select * into v_row from public.extra_labels as e where e.code = p_code for update;
  if not found then
    return 0;
  end if;

  v_de := v_row.label_de;
  v_fr := v_row.label_fr;
  v_ar := v_row.label_ar;
  v_machine := v_row.machine_langs;

  foreach v_lang in array array['de', 'fr', 'ar']::pg_catalog.text[] loop
    if pg_catalog.jsonb_typeof(v_labels -> v_lang) is distinct from 'string' then
      continue;
    end if;
    v_new := pg_catalog.btrim(v_labels ->> v_lang);
    if v_new = '' or pg_catalog.char_length(v_new) > 80 then
      continue;
    end if;
    v_cur := case v_lang when 'de' then v_de when 'fr' then v_fr else v_ar end;
    -- D-02: his typed name (non-empty, not machine-written) is never changed.
    if coalesce(pg_catalog.btrim(v_cur), '') <> '' and not (v_lang = any (v_machine)) then
      continue;
    end if;
    if v_lang = 'de' then v_de := v_new;
    elsif v_lang = 'fr' then v_fr := v_new;
    else v_ar := v_new;
    end if;
    if not (v_lang = any (v_machine)) then
      v_machine := pg_catalog.array_append(v_machine, v_lang);
    end if;
    v_written := v_written + 1;
  end loop;

  if v_written > 0 then
    update public.extra_labels
       set label_de = v_de,
           label_fr = v_fr,
           label_ar = v_ar,
           machine_langs = v_machine,
           updated_at = pg_catalog.now(),
           updated_by = null
     where id = v_row.id;
  end if;

  return v_written;
end
$$;

do $$
declare
  f pg_catalog.regprocedure;
begin
  foreach f in array array[
    'public.system_extra_labels_missing()',
    'public.system_extra_label_fill(pg_catalog.text, pg_catalog.jsonb)'
  ]::pg_catalog.regprocedure[]
  loop
    execute pg_catalog.format('revoke all on function %s from public, anon, authenticated', f);
    execute pg_catalog.format('grant execute on function %s to vamos_system', f);
    execute pg_catalog.format(
      'comment on function %s is %L', f,
      'Phase 32 (D-02, D-10): background fill of extra names; a name he typed (outside machine_langs) is never changed. EXECUTE: vamos_system only.'
    );
  end loop;
end
$$;

commit;
