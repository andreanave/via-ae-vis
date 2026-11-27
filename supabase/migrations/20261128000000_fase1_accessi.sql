-- Fase 1: persone, studi, collegamenti atleta-professionista, inviti, note e promemoria del coach.
-- Ogni tabella ha Row Level Security attiva: il browser usa solo la chiave pubblica.

-- ---------------------------------------------------------------- Persone
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null default '',
  role text not null default 'athlete' check (role in ('athlete', 'professional')),
  is_master boolean not null default false,
  reminder_hours int not null default 4 check (reminder_hours between 1 and 72),
  telegram_url text,
  created_at timestamptz not null default now()
);

-- Un solo account master, riservato al titolare.
create unique index profiles_single_master on public.profiles (is_master) where is_master;

create table public.studios (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now()
);

create table public.studio_members (
  studio_id uuid not null references public.studios (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'member')),
  primary key (studio_id, profile_id)
);

-- ---------------------------------------------------------------- Relazione atleta-professionista
-- Moduli: training (allenamento), nutrition (alimentazione), checkin (check-in condiviso).
create table public.care_links (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references public.profiles (id) on delete cascade,
  professional_id uuid not null references public.profiles (id) on delete cascade,
  studio_id uuid references public.studios (id) on delete set null,
  modules text[] not null default array['training', 'checkin']
    check (modules <@ array['training', 'nutrition', 'checkin']),
  status text not null default 'active' check (status in ('active', 'ended')),
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  check (athlete_id <> professional_id),
  unique (athlete_id, professional_id)
);
create index care_links_professional on public.care_links (professional_id) where status = 'active';

create table public.invites (
  id uuid primary key default gen_random_uuid(),
  token uuid not null unique default gen_random_uuid(),
  email text not null,
  full_name text not null default '',
  invited_by uuid not null references public.profiles (id) on delete cascade,
  studio_id uuid references public.studios (id) on delete set null,
  modules text[] not null default array['training', 'checkin']
    check (modules <@ array['training', 'nutrition', 'checkin']),
  expires_at timestamptz not null default now() + interval '7 days',
  accepted_at timestamptz,
  accepted_by uuid references public.profiles (id),
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- Lavoro del coach
-- Nota generale per atleta: una per professionista.
create table public.coach_notes (
  athlete_id uuid not null references public.profiles (id) on delete cascade,
  professional_id uuid not null references public.profiles (id) on delete cascade,
  body text not null default '',
  updated_at timestamptz not null default now(),
  primary key (athlete_id, professional_id)
);

-- Promemoria e cose da fare, ritrovabili dall'agenda e dalla scheda dell'atleta.
create table public.coach_tasks (
  id uuid primary key default gen_random_uuid(),
  professional_id uuid not null references public.profiles (id) on delete cascade,
  athlete_id uuid references public.profiles (id) on delete cascade,
  title text not null check (length(trim(title)) > 0),
  due_on date,
  done_at timestamptz,
  created_at timestamptz not null default now()
);
create index coach_tasks_open on public.coach_tasks (professional_id, due_on) where done_at is null;

-- ---------------------------------------------------------------- Funzioni di supporto
-- security definer: leggono le tabelle senza ricadere nelle policy (evita ricorsioni).
create or replace function public.is_master() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select is_master from profiles where id = auth.uid()), false);
$$;

create or replace function public.is_professional_of(athlete uuid, module text default null) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from care_links
    where athlete_id = athlete and professional_id = auth.uid() and status = 'active'
      and (module is null or module = any (modules))
  );
$$;

create or replace function public.shares_care_link(other uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from care_links
    where status = 'active'
      and ((athlete_id = auth.uid() and professional_id = other)
        or (professional_id = auth.uid() and athlete_id = other))
  );
$$;

-- Profilo creato automaticamente alla registrazione.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', ''))
  on conflict (id) do nothing;
  return new;
end;
$$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Accettazione di un invito: collega l'account (nuovo o esistente) al professionista.
create or replace function public.accept_invite(invite_token uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  inv invites%rowtype;
  link_id uuid;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  select * into inv from invites where token = invite_token for update;
  if not found then raise exception 'invite_not_found'; end if;
  if inv.accepted_at is not null then raise exception 'invite_already_used'; end if;
  if inv.expires_at < now() then raise exception 'invite_expired'; end if;
  if lower(inv.email) <> lower(coalesce(auth.jwt() ->> 'email', '')) then raise exception 'invite_email_mismatch'; end if;

  insert into care_links (athlete_id, professional_id, studio_id, modules)
  values (auth.uid(), inv.invited_by, inv.studio_id, inv.modules)
  on conflict (athlete_id, professional_id)
    do update set status = 'active', ended_at = null, modules = excluded.modules
  returning id into link_id;

  update invites set accepted_at = now(), accepted_by = auth.uid() where id = inv.id;
  update profiles set full_name = inv.full_name where id = auth.uid() and full_name = '' and inv.full_name <> '';
  return link_id;
end;
$$;
revoke all on function public.accept_invite(uuid) from public, anon;
grant execute on function public.accept_invite(uuid) to authenticated;

-- ---------------------------------------------------------------- Row Level Security
alter table public.profiles enable row level security;
alter table public.studios enable row level security;
alter table public.studio_members enable row level security;
alter table public.care_links enable row level security;
alter table public.invites enable row level security;
alter table public.coach_notes enable row level security;
alter table public.coach_tasks enable row level security;

-- Profili: se stessi, le persone con cui si ha un collegamento attivo, tutto per il master.
create policy profiles_select on public.profiles for select to authenticated
  using (id = auth.uid() or public.shares_care_link(id) or public.is_master());
create policy profiles_update_self on public.profiles for update to authenticated
  using (id = auth.uid() or public.is_master()) with check (id = auth.uid() or public.is_master());
-- Ruolo e master non si modificano dal browser: solo alcune colonne sono aggiornabili.
revoke update on public.profiles from authenticated, anon;
grant update (full_name, reminder_hours, telegram_url) on public.profiles to authenticated;

-- Studi: visibili ai membri.
create policy studios_select on public.studios for select to authenticated
  using (public.is_master() or exists (
    select 1 from public.studio_members m where m.studio_id = studios.id and m.profile_id = auth.uid()));
create policy studios_insert on public.studios for insert to authenticated
  with check (created_by = auth.uid());
create policy studio_members_select on public.studio_members for select to authenticated
  using (profile_id = auth.uid() or public.is_master());

-- Collegamenti: le due parti li vedono; il professionista può chiuderli o cambiare i moduli.
create policy care_links_select on public.care_links for select to authenticated
  using (athlete_id = auth.uid() or professional_id = auth.uid() or public.is_master());
create policy care_links_update on public.care_links for update to authenticated
  using (professional_id = auth.uid() or public.is_master())
  with check (professional_id = auth.uid() or public.is_master());
create policy care_links_master_insert on public.care_links for insert to authenticated
  with check (public.is_master());

-- Inviti: solo chi li ha creati (e il master). L'accettazione passa da accept_invite().
create policy invites_select on public.invites for select to authenticated
  using (invited_by = auth.uid() or public.is_master());
create policy invites_insert on public.invites for insert to authenticated
  with check (invited_by = auth.uid()
    and (select role from public.profiles where id = auth.uid()) = 'professional');
create policy invites_delete on public.invites for delete to authenticated
  using ((invited_by = auth.uid() and accepted_at is null) or public.is_master());

-- Note e promemoria: privati del professionista che li scrive.
create policy coach_notes_all on public.coach_notes for all to authenticated
  using ((professional_id = auth.uid() and public.is_professional_of(athlete_id)) or public.is_master())
  with check ((professional_id = auth.uid() and public.is_professional_of(athlete_id)) or public.is_master());
create policy coach_tasks_all on public.coach_tasks for all to authenticated
  using (professional_id = auth.uid() or public.is_master())
  with check ((professional_id = auth.uid()
      and (athlete_id is null or public.is_professional_of(athlete_id))) or public.is_master());
