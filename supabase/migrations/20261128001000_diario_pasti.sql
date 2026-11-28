-- Diario dei pasti (Bibbia §10), orari della giornata dell'atleta (§4) e "Da rispondere" per il coach.

-- ---------------------------------------------------------------- Orari della giornata
-- Fasce orarie scelte dall'atleta: {"meal:pranzo":"13:00","training":"18:30",...}. Vuoto = orari standard.
alter table public.profiles add column day_times jsonb not null default '{}'
  check (jsonb_typeof(day_times) = 'object');
grant update (day_times) on public.profiles to authenticated;

-- ---------------------------------------------------------------- Pasti e integratori registrati
create table public.meal_logs (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references public.profiles (id) on delete cascade,
  day date not null,
  kind text not null default 'meal' check (kind in ('meal', 'supplement')),
  item_key text not null check (length(item_key) between 1 and 200), -- chiave del pasto o nome dell'integratore
  item_name text not null default '',
  plan_id uuid references public.nutrition_plans (id) on delete set null,
  status text not null default 'done' check (status in ('done', 'skipped')),
  -- Alternativa scelta per ciascun gruppo del pasto: {"<gruppo>": "<opzione>"}; i nomi restano per lo storico.
  choices jsonb not null default '{}' check (jsonb_typeof(choices) = 'object'),
  choice_names text[] not null default '{}',
  note text not null default '' check (char_length(note) <= 1000),
  created_by uuid not null default auth.uid() references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (athlete_id, day, kind, item_key)
);
create index meal_logs_athlete_day on public.meal_logs (athlete_id, day desc);

alter table public.meal_logs enable row level security;
-- L'atleta scrive il proprio diario; chi lo segue per l'alimentazione (e il master) lo legge.
create policy meal_logs_read on public.meal_logs for select to authenticated
  using (athlete_id = auth.uid() or public.is_professional_of(athlete_id, 'nutrition') or public.is_master());
create policy meal_logs_insert on public.meal_logs for insert to authenticated
  with check (athlete_id = auth.uid() and created_by = auth.uid());
create policy meal_logs_update on public.meal_logs for update to authenticated
  using (athlete_id = auth.uid()) with check (athlete_id = auth.uid());
create policy meal_logs_delete on public.meal_logs for delete to authenticated
  using (athlete_id = auth.uid());
grant select, insert, delete on public.meal_logs to authenticated;
grant update (status, choices, choice_names, note, plan_id, item_name, updated_at) on public.meal_logs to authenticated;

-- ---------------------------------------------------------------- "Da rispondere": cosa il coach ha già visto
-- Le note dell'atleta (pasti, serie, sedute) restano "da rispondere" finché il coach non le segna come viste.
create table public.coach_reviews (
  professional_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  source text not null check (source in ('meal', 'set', 'workout')),
  source_id uuid not null,
  reviewed_at timestamptz not null default now(),
  primary key (professional_id, source, source_id)
);
alter table public.coach_reviews enable row level security;
create policy coach_reviews_own on public.coach_reviews for all to authenticated
  using (professional_id = auth.uid()) with check (professional_id = auth.uid());
grant select, insert, delete on public.coach_reviews to authenticated;

-- ---------------------------------------------------------------- Notifica al coach per una nota sul pasto
alter table public.notifications drop constraint notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check
  check (kind in ('message', 'weekly_confirmed', 'checkin_comment', 'program_active', 'meal_note'));

create or replace function public.on_meal_note() returns trigger
language plpgsql security definer set search_path = public as $$
declare p record; who text;
begin
  if new.kind = 'meal' and new.note <> '' and (tg_op = 'INSERT' or old.note is distinct from new.note) then
    select coalesce(nullif(full_name, ''), 'Un atleta') into who from profiles where id = new.athlete_id;
    for p in select professional_id from care_links
      where athlete_id = new.athlete_id and status = 'active' and 'nutrition' = any (modules) loop
      perform public.notify(p.professional_id, 'meal_note',
        who || ' ha scritto una nota su ' || lower(coalesce(nullif(new.item_name, ''), 'un pasto')),
        new.note, '/atleti/' || new.athlete_id);
    end loop;
  end if;
  return new;
end;
$$;
create trigger meal_note_notify after insert or update on public.meal_logs
  for each row execute function public.on_meal_note();
revoke execute on function public.on_meal_note() from public, anon, authenticated;

-- ---------------------------------------------------------------- Testo dell'andamento (Bibbia §5)
-- L'app propone un testo dai dati; il professionista lo può riscrivere e l'atleta vede il risultato.
create table public.progress_notes (
  athlete_id uuid primary key references public.profiles (id) on delete cascade,
  body text not null default '' check (char_length(body) <= 2000),
  updated_by uuid not null default auth.uid() references public.profiles (id),
  updated_at timestamptz not null default now()
);
alter table public.progress_notes enable row level security;
create policy progress_notes_read on public.progress_notes for select to authenticated
  using (athlete_id = auth.uid() or public.is_professional_of(athlete_id) or public.is_master());
create policy progress_notes_insert on public.progress_notes for insert to authenticated
  with check (public.is_professional_of(athlete_id) and updated_by = auth.uid());
create policy progress_notes_update on public.progress_notes for update to authenticated
  using (public.is_professional_of(athlete_id)) with check (public.is_professional_of(athlete_id) and updated_by = auth.uid());
create policy progress_notes_delete on public.progress_notes for delete to authenticated
  using (public.is_professional_of(athlete_id));
grant select, insert, delete on public.progress_notes to authenticated;
grant update (body, updated_by, updated_at) on public.progress_notes to authenticated;
