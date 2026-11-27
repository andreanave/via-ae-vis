-- Fase 2: check-in del mattino, della sera e settimanale.
-- Un solo check-in per atleta, condiviso tra i professionisti collegati con il modulo "checkin".
-- I campi disponibili sono definiti nell'app (src/lib/checkinFields.js); qui si salvano solo le chiavi.

-- Modelli personali del professionista. Il nome è un'informazione interna.
create table public.checkin_templates (
  id uuid primary key default gen_random_uuid(),
  professional_id uuid not null references public.profiles (id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  config jsonb not null,
  created_at timestamptz not null default now()
);

-- Configurazione attiva per l'atleta.
-- config = { morning: [chiavi], evening: [chiavi], weekly: [{ key, required, locked }], weekday: 0..6 }
create table public.checkin_settings (
  athlete_id uuid primary key references public.profiles (id) on delete cascade,
  config jsonb not null,
  updated_by uuid references public.profiles (id),
  updated_at timestamptz not null default now()
);

-- Rilevazioni giornaliere. values = { chiave: { v, source: 'manual'|'health', edited: bool } }
create table public.daily_entries (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references public.profiles (id) on delete cascade,
  day date not null,
  moment text not null check (moment in ('morning', 'evening')),
  "values" jsonb not null default '{}',
  status text not null default 'draft' check (status in ('draft', 'done')),
  updated_at timestamptz not null default now(),
  unique (athlete_id, day, moment)
);
create index daily_entries_athlete_day on public.daily_entries (athlete_id, day);

-- Settimanale. overrides = valori corretti dall'atleta rispetto a quelli calcolati;
-- answers = risposte alle domande solo settimanali.
create table public.weekly_checkins (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references public.profiles (id) on delete cascade,
  week_end date not null,
  overrides jsonb not null default '{}',
  answers jsonb not null default '{}',
  notes text not null default '',
  snapshot jsonb,
  status text not null default 'draft' check (status in ('draft', 'confirmed')),
  confirmed_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (athlete_id, week_end)
);

-- Commenti e domande del professionista su una settimana, con le risposte dell'atleta.
create table public.checkin_comments (
  id uuid primary key default gen_random_uuid(),
  weekly_checkin_id uuid not null references public.weekly_checkins (id) on delete cascade,
  author_id uuid not null references public.profiles (id) on delete cascade,
  field_key text,
  kind text not null default 'comment' check (kind in ('comment', 'question', 'answer')),
  reply_to uuid references public.checkin_comments (id) on delete cascade,
  body text not null check (length(trim(body)) > 0),
  created_at timestamptz not null default now()
);
create index checkin_comments_week on public.checkin_comments (weekly_checkin_id, created_at);

-- ---------------------------------------------------------------- Regole
alter table public.checkin_templates enable row level security;
alter table public.checkin_settings enable row level security;
alter table public.daily_entries enable row level security;
alter table public.weekly_checkins enable row level security;
alter table public.checkin_comments enable row level security;

-- Chi può leggere i dati di check-in di un atleta: l'atleta, i professionisti con il modulo, il master.
create or replace function public.can_read_checkin(athlete uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select athlete = auth.uid() or public.is_professional_of(athlete, 'checkin') or public.is_master();
$$;
grant execute on function public.can_read_checkin(uuid) to authenticated;

create policy checkin_templates_own on public.checkin_templates for all to authenticated
  using (professional_id = auth.uid() or public.is_master())
  with check (professional_id = auth.uid());

create policy checkin_settings_read on public.checkin_settings for select to authenticated
  using (public.can_read_checkin(athlete_id));
create policy checkin_settings_write on public.checkin_settings for insert to authenticated
  with check (public.is_professional_of(athlete_id, 'checkin') and updated_by = auth.uid());
create policy checkin_settings_update on public.checkin_settings for update to authenticated
  using (public.is_professional_of(athlete_id, 'checkin'))
  with check (public.is_professional_of(athlete_id, 'checkin') and updated_by = auth.uid());

-- Le rilevazioni le scrive solo l'atleta; i professionisti le leggono (le correzioni del coach arriveranno dopo).
create policy daily_entries_read on public.daily_entries for select to authenticated
  using (public.can_read_checkin(athlete_id));
create policy daily_entries_write on public.daily_entries for insert to authenticated
  with check (athlete_id = auth.uid());
create policy daily_entries_update on public.daily_entries for update to authenticated
  using (athlete_id = auth.uid()) with check (athlete_id = auth.uid());

create policy weekly_read on public.weekly_checkins for select to authenticated
  using (public.can_read_checkin(athlete_id));
create policy weekly_insert on public.weekly_checkins for insert to authenticated
  with check (athlete_id = auth.uid());
-- Una settimana confermata non si modifica più dal browser.
create policy weekly_update on public.weekly_checkins for update to authenticated
  using (athlete_id = auth.uid() and status = 'draft') with check (athlete_id = auth.uid());

create policy comments_read on public.checkin_comments for select to authenticated
  using (exists (select 1 from public.weekly_checkins w
                 where w.id = weekly_checkin_id and public.can_read_checkin(w.athlete_id)));
create policy comments_insert on public.checkin_comments for insert to authenticated
  with check (
    author_id = auth.uid()
    and exists (
      select 1 from public.weekly_checkins w where w.id = weekly_checkin_id
        and (
          (kind in ('comment', 'question') and public.is_professional_of(w.athlete_id, 'checkin'))
          or (kind = 'answer' and w.athlete_id = auth.uid() and reply_to is not null)
        )
    )
  );

grant select, insert, update, delete on public.checkin_templates to authenticated;
grant select, insert, update on public.checkin_settings, public.daily_entries, public.weekly_checkins to authenticated;
grant select, insert on public.checkin_comments to authenticated;
