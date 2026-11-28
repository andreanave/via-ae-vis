-- Fase 4: piano alimentare digitalizzato dal PDF Fiber.
-- Il piano si legge sempre intero ed è versionato: un'unica tabella con il contenuto in jsonb
-- (struttura prodotta da src/lib/fiber/parseFiber.js, schema 1). I registri dei pasti punteranno a
-- (plan_id, chiave dell'opzione). Il collegamento al catalogo (food_id) sta dentro content, senza FK.

create table public.nutrition_plans (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references public.profiles (id) on delete cascade,
  created_by uuid not null references public.profiles (id),
  title text not null default 'Piano alimentare',
  version int not null check (version > 0),
  valid_from date,
  status text not null default 'draft' check (status in ('draft', 'active', 'archived')),
  -- Tipo di giorno da lunedì a domenica, es. {A,A,B,A,B,A,B}.
  week_pattern text[] not null default '{}' check (cardinality(week_pattern) in (0, 7)),
  content jsonb not null,
  -- Avvisi del lettore che il professionista deve controllare (unità dubbie, porzioni senza tabella...).
  review jsonb not null default '[]',
  parser_version text,
  -- Percorso nel bucket privato nutrition-pdfs: {athlete_id}/{plan_id}.pdf
  source_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  activated_at timestamptz,
  unique (athlete_id, version)
);
create unique index nutrition_plans_one_active on public.nutrition_plans (athlete_id) where status = 'active';
alter table public.nutrition_plans enable row level security;

-- Legge: l'atleta i piani attivi e archiviati, il professionista con il modulo alimentazione, il master.
create policy nutrition_plans_read on public.nutrition_plans for select to authenticated
  using (
    public.is_professional_of(athlete_id, 'nutrition')
    or public.is_master()
    or (athlete_id = auth.uid() and status in ('active', 'archived'))
  );
-- Scrive solo il professionista, e solo le bozze: l'attivazione passa da activate_nutrition_plan.
create policy nutrition_plans_insert on public.nutrition_plans for insert to authenticated
  with check (public.is_professional_of(athlete_id, 'nutrition') and created_by = auth.uid() and status = 'draft');
create policy nutrition_plans_update on public.nutrition_plans for update to authenticated
  using (public.is_professional_of(athlete_id, 'nutrition') and status = 'draft')
  with check (public.is_professional_of(athlete_id, 'nutrition') and status = 'draft');
create policy nutrition_plans_delete on public.nutrition_plans for delete to authenticated
  using (public.is_professional_of(athlete_id, 'nutrition') and status = 'draft');

grant select, insert, delete on public.nutrition_plans to authenticated;
grant update (title, valid_from, week_pattern, content, review, parser_version, source_path, updated_at)
  on public.nutrition_plans to authenticated;

-- Attiva una bozza e archivia il piano attivo precedente dello stesso atleta.
create or replace function public.activate_nutrition_plan(plan uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  target public.nutrition_plans;
begin
  select * into target from nutrition_plans where id = plan for update;
  if target.id is null then raise exception 'plan_not_found'; end if;
  if not public.is_professional_of(target.athlete_id, 'nutrition') then raise exception 'not_allowed'; end if;
  if target.status <> 'draft' then raise exception 'plan_not_draft'; end if;
  update nutrition_plans set status = 'archived', updated_at = now()
    where athlete_id = target.athlete_id and status = 'active';
  update nutrition_plans set status = 'active', activated_at = now(), updated_at = now() where id = plan;
end;
$$;
revoke all on function public.activate_nutrition_plan(uuid) from public, anon;
grant execute on function public.activate_nutrition_plan(uuid) to authenticated;

-- ---------------------------------------------------------------- PDF originali (bucket privato)
insert into storage.buckets (id, name, public) values ('nutrition-pdfs', 'nutrition-pdfs', false)
  on conflict (id) do nothing;

-- Atleta indicato dalla prima cartella del percorso; null se il percorso non è valido.
create or replace function public.nutrition_pdf_athlete(object_name text) returns uuid
language plpgsql immutable set search_path = '' as $$
begin
  return (storage.foldername(object_name))[1]::uuid;
exception when others then
  return null;
end;
$$;
revoke all on function public.nutrition_pdf_athlete(text) from public, anon;
grant execute on function public.nutrition_pdf_athlete(text) to authenticated;

create policy nutrition_pdfs_read on storage.objects for select to authenticated
  using (bucket_id = 'nutrition-pdfs' and (
    public.nutrition_pdf_athlete(name) = auth.uid()
    or public.is_professional_of(public.nutrition_pdf_athlete(name), 'nutrition')
    or public.is_master()));
create policy nutrition_pdfs_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'nutrition-pdfs' and public.is_professional_of(public.nutrition_pdf_athlete(name), 'nutrition'));
create policy nutrition_pdfs_update on storage.objects for update to authenticated
  using (bucket_id = 'nutrition-pdfs' and public.is_professional_of(public.nutrition_pdf_athlete(name), 'nutrition'))
  with check (bucket_id = 'nutrition-pdfs' and public.is_professional_of(public.nutrition_pdf_athlete(name), 'nutrition'));
create policy nutrition_pdfs_delete on storage.objects for delete to authenticated
  using (bucket_id = 'nutrition-pdfs' and public.is_professional_of(public.nutrition_pdf_athlete(name), 'nutrition'));
