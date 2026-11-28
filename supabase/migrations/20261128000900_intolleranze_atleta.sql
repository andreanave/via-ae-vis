-- Intolleranze e allergie dell'atleta, usate dai suggerimenti sul piano alimentare (solo per lo staff).
-- Dato sanitario: lo vede l'atleta stesso, il professionista con il modulo alimentazione e il master
-- (in sola lettura). Lo scrive solo il professionista con il modulo alimentazione.

create table public.athlete_diet_notes (
  athlete_id uuid primary key references public.profiles (id) on delete cascade,
  lactose_intolerant boolean not null default false,
  -- Allergeni dell'allegato II del Reg. UE 1169/2011, con codici fissi.
  allergens text[] not null default '{}' check (allergens <@ array['glutine', 'crostacei', 'uova', 'pesce', 'arachidi',
    'soia', 'latte', 'frutta_a_guscio', 'sedano', 'senape', 'sesamo', 'solfiti', 'lupini', 'molluschi']::text[]),
  other text check (char_length(other) <= 500),
  updated_by uuid not null references public.profiles (id),
  updated_at timestamptz not null default now()
);
alter table public.athlete_diet_notes enable row level security;

create policy athlete_diet_notes_read on public.athlete_diet_notes for select to authenticated
  using (athlete_id = auth.uid() or public.is_professional_of(athlete_id, 'nutrition') or public.is_master());
create policy athlete_diet_notes_insert on public.athlete_diet_notes for insert to authenticated
  with check (public.is_professional_of(athlete_id, 'nutrition') and updated_by = auth.uid());
create policy athlete_diet_notes_update on public.athlete_diet_notes for update to authenticated
  using (public.is_professional_of(athlete_id, 'nutrition'))
  with check (public.is_professional_of(athlete_id, 'nutrition') and updated_by = auth.uid());

grant select, insert on public.athlete_diet_notes to authenticated;
grant update (lactose_intolerant, allergens, other, updated_by, updated_at) on public.athlete_diet_notes to authenticated;
