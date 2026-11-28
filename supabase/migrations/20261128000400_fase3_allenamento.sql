-- Fase 3: catalogo esercizi, schede con rotazione, calendario, sedute registrate (anche offline).

-- Catalogo riutilizzabile del professionista.
create table public.exercises (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  instructions text not null default '',
  video_url text check (video_url is null or video_url ~ '^https?://'),
  bodyweight boolean not null default false,
  created_at timestamptz not null default now()
);
create index exercises_owner on public.exercises (owner_id, name);

-- Scheda dell'atleta: rotazione di sedute (A, B, C, D) sui giorni di allenamento.
create table public.programs (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references public.profiles (id) on delete cascade,
  professional_id uuid not null references public.profiles (id) on delete cascade,
  name text not null default 'Scheda',
  notes text not null default '',
  training_weekdays int[] not null default array[1, 3, 5] check (training_weekdays <@ array[0, 1, 2, 3, 4, 5, 6]),
  status text not null default 'draft' check (status in ('draft', 'active', 'archived')),
  starts_on date not null default current_date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- Una sola scheda attiva per atleta.
create unique index programs_one_active on public.programs (athlete_id) where status = 'active';

create table public.program_sessions (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.programs (id) on delete cascade,
  position int not null,
  name text not null,
  notes text not null default '',
  unique (program_id, position) deferrable initially deferred
);

-- Prescrizione di un esercizio nella seduta.
-- set_details: [{ reps, load, rir, note }] per serie (vuoto = uguale per tutte, usa i campi generali).
create table public.session_exercises (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.program_sessions (id) on delete cascade,
  position int not null,
  exercise_id uuid references public.exercises (id) on delete set null,
  name text not null,
  group_label text,                  -- es. "A1", "A2" per i jump set
  sets int not null default 3 check (sets between 1 and 20),
  reps text not null default '',     -- es. "7-11"
  load text not null default '',     -- es. "Carico fisso", "Corpo libero"
  tempo text not null default '',    -- es. "3-1-1-1"
  rir text not null default '',      -- es. "0-0" oppure "1"
  rest_seconds int check (rest_seconds is null or rest_seconds between 0 and 1800),
  notes text not null default '',
  film text not null default '',     -- es. "Filma l'ultima serie di lato"
  video_url text check (video_url is null or video_url ~ '^https?://'),
  bodyweight boolean not null default false,
  set_details jsonb not null default '[]'
);
create index session_exercises_session on public.session_exercises (session_id, position);

-- Cambi di calendario decisi dall'atleta: un giorno diventa di allenamento o di riposo.
create table public.schedule_overrides (
  athlete_id uuid not null references public.profiles (id) on delete cascade,
  day date not null,
  kind text not null check (kind in ('training', 'rest')),
  created_at timestamptz not null default now(),
  primary key (athlete_id, day)
);

-- Seduta registrata. L'id è generato sul telefono: reinviare gli stessi dati non crea duplicati.
create table public.workout_logs (
  id uuid primary key,
  athlete_id uuid not null references public.profiles (id) on delete cascade,
  program_id uuid references public.programs (id) on delete set null,
  session_id uuid references public.program_sessions (id) on delete set null,
  session_name text not null default '',
  performed_on date not null,
  status text not null default 'in_progress' check (status in ('in_progress', 'done', 'skipped')),
  notes text not null default '',
  started_at timestamptz,
  finished_at timestamptz,
  client_updated_at timestamptz not null default now(),
  synced_at timestamptz not null default now()
);
create index workout_logs_athlete on public.workout_logs (athlete_id, performed_on desc);

create table public.set_logs (
  id uuid primary key,
  workout_id uuid not null references public.workout_logs (id) on delete cascade,
  session_exercise_id uuid references public.session_exercises (id) on delete set null,
  exercise_name text not null default '',
  set_index int not null,
  load numeric,          -- per un esercizio a corpo libero 0 = nessun carico aggiuntivo
  reps int,
  note text not null default '',
  done_at timestamptz,
  client_updated_at timestamptz not null default now(),
  unique (workout_id, session_exercise_id, set_index)
);

-- ---------------------------------------------------------------- Regole
alter table public.exercises enable row level security;
alter table public.programs enable row level security;
alter table public.program_sessions enable row level security;
alter table public.session_exercises enable row level security;
alter table public.schedule_overrides enable row level security;
alter table public.workout_logs enable row level security;
alter table public.set_logs enable row level security;

create or replace function public.can_read_training(athlete uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select athlete = auth.uid() or public.is_professional_of(athlete, 'training') or public.is_master();
$$;

create or replace function public.program_athlete(program uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select athlete_id from programs where id = program;
$$;
create or replace function public.session_athlete(session uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select p.athlete_id from program_sessions s join programs p on p.id = s.program_id where s.id = session;
$$;
create or replace function public.workout_athlete(workout uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select athlete_id from workout_logs where id = workout;
$$;
grant execute on function public.can_read_training(uuid), public.program_athlete(uuid),
  public.session_athlete(uuid), public.workout_athlete(uuid) to authenticated;

-- Esercizi: li gestisce il proprietario; li leggono anche gli atleti che segue per l'allenamento.
create policy exercises_read on public.exercises for select to authenticated
  using (owner_id = auth.uid() or public.is_master() or exists (
    select 1 from public.care_links l where l.professional_id = owner_id and l.athlete_id = auth.uid()
      and l.status = 'active' and 'training' = any (l.modules)));
create policy exercises_write on public.exercises for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- Schede: le scrive il professionista con modulo allenamento; l'atleta legge solo quelle attive o archiviate.
create policy programs_read on public.programs for select to authenticated
  using (public.is_professional_of(athlete_id, 'training') or public.is_master()
    or (athlete_id = auth.uid() and status <> 'draft'));
create policy programs_write on public.programs for all to authenticated
  using (public.is_professional_of(athlete_id, 'training'))
  with check (public.is_professional_of(athlete_id, 'training') and professional_id = auth.uid());

create policy sessions_read on public.program_sessions for select to authenticated
  using (exists (select 1 from public.programs p where p.id = program_id));
create policy sessions_write on public.program_sessions for all to authenticated
  using (public.is_professional_of(public.program_athlete(program_id), 'training'))
  with check (public.is_professional_of(public.program_athlete(program_id), 'training'));

create policy session_exercises_read on public.session_exercises for select to authenticated
  using (exists (select 1 from public.program_sessions s where s.id = session_id));
create policy session_exercises_write on public.session_exercises for all to authenticated
  using (public.is_professional_of(public.session_athlete(session_id), 'training'))
  with check (public.is_professional_of(public.session_athlete(session_id), 'training'));

-- Calendario e registrazioni: le scrive l'atleta, le leggono i professionisti dell'allenamento.
create policy overrides_read on public.schedule_overrides for select to authenticated
  using (public.can_read_training(athlete_id) or public.is_professional_of(athlete_id, 'nutrition'));
create policy overrides_write on public.schedule_overrides for all to authenticated
  using (athlete_id = auth.uid()) with check (athlete_id = auth.uid());

create policy workouts_read on public.workout_logs for select to authenticated
  using (public.can_read_training(athlete_id));
create policy workouts_write on public.workout_logs for insert to authenticated
  with check (athlete_id = auth.uid());
create policy workouts_update on public.workout_logs for update to authenticated
  using (athlete_id = auth.uid()) with check (athlete_id = auth.uid());

create policy sets_read on public.set_logs for select to authenticated
  using (public.can_read_training(public.workout_athlete(workout_id)));
create policy sets_write on public.set_logs for insert to authenticated
  with check (public.workout_athlete(workout_id) = auth.uid());
create policy sets_update on public.set_logs for update to authenticated
  using (public.workout_athlete(workout_id) = auth.uid()) with check (public.workout_athlete(workout_id) = auth.uid());
create policy sets_delete on public.set_logs for delete to authenticated
  using (public.workout_athlete(workout_id) = auth.uid());

grant select, insert, update, delete on public.exercises, public.programs, public.program_sessions,
  public.session_exercises, public.schedule_overrides, public.set_logs to authenticated;
grant select, insert, update on public.workout_logs to authenticated;

-- Il professionista attiva una scheda: la precedente attiva viene archiviata.
create or replace function public.activate_program(program uuid) returns void
language plpgsql security definer set search_path = public as $$
declare a uuid;
begin
  select athlete_id into a from programs where id = program;
  if a is null or not public.is_professional_of(a, 'training') then raise exception 'forbidden'; end if;
  update programs set status = 'archived', updated_at = now() where athlete_id = a and status = 'active' and id <> program;
  update programs set status = 'active', updated_at = now() where id = program;
end;
$$;
revoke all on function public.activate_program(uuid) from public, anon;
grant execute on function public.activate_program(uuid) to authenticated;
