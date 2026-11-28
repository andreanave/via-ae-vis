-- Fase 6: chat atleta-professionista e notifiche nell'app.

-- Messaggi di un collegamento atleta-professionista. L'id può arrivare dal telefono (invio ripetuto senza doppioni).
create table public.messages (
  id uuid primary key default gen_random_uuid(),
  care_link_id uuid not null references public.care_links (id) on delete cascade,
  sender_id uuid not null references public.profiles (id) on delete cascade,
  body text not null check (length(trim(body)) > 0 and length(body) <= 4000),
  created_at timestamptz not null default now(),
  read_at timestamptz
);
create index messages_link on public.messages (care_link_id, created_at desc);

-- Notifiche nell'app: le crea solo il database (trigger), il destinatario le legge e le segna come lette.
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null check (kind in ('message', 'weekly_confirmed', 'checkin_comment', 'program_active')),
  title text not null,
  body text not null default '',
  link text not null default '/',
  created_at timestamptz not null default now(),
  read_at timestamptz
);
create index notifications_recipient on public.notifications (recipient_id, created_at desc);

alter table public.messages enable row level security;
alter table public.notifications enable row level security;

create or replace function public.link_party(link uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from care_links l where l.id = link and auth.uid() in (l.athlete_id, l.professional_id));
$$;
revoke execute on function public.link_party(uuid) from public, anon;
grant execute on function public.link_party(uuid) to authenticated;

-- Le due parti leggono e scrivono la propria chat; il master legge (assistenza, sola lettura).
create policy messages_read on public.messages for select to authenticated
  using (public.link_party(care_link_id) or public.is_master());
create policy messages_insert on public.messages for insert to authenticated
  with check (sender_id = auth.uid() and public.link_party(care_link_id)
    and exists (select 1 from public.care_links l where l.id = care_link_id and l.status = 'active'));
-- Solo chi riceve segna come letto (la colonna read_at è l'unica aggiornabile).
create policy messages_mark_read on public.messages for update to authenticated
  using (public.link_party(care_link_id) and sender_id <> auth.uid())
  with check (public.link_party(care_link_id) and sender_id <> auth.uid());
grant select, insert on public.messages to authenticated;
grant update (read_at) on public.messages to authenticated;

create policy notifications_read on public.notifications for select to authenticated
  using (recipient_id = auth.uid() or public.is_master());
create policy notifications_mark_read on public.notifications for update to authenticated
  using (recipient_id = auth.uid()) with check (recipient_id = auth.uid());
create policy notifications_delete on public.notifications for delete to authenticated
  using (recipient_id = auth.uid());
grant select, delete on public.notifications to authenticated;
grant update (read_at) on public.notifications to authenticated;

-- ---------------------------------------------------------------- Trigger che generano le notifiche
create or replace function public.notify(recipient uuid, k text, t text, b text, l text) returns void
language sql security definer set search_path = public as $$
  insert into notifications (recipient_id, kind, title, body, link) values (recipient, k, t, left(b, 200), l);
$$;
revoke all on function public.notify(uuid, text, text, text, text) from public, anon, authenticated;

create or replace function public.on_message() returns trigger
language plpgsql security definer set search_path = public as $$
declare l care_links%rowtype; sender_name text; recipient uuid;
begin
  select * into l from care_links where id = new.care_link_id;
  recipient := case when new.sender_id = l.athlete_id then l.professional_id else l.athlete_id end;
  select coalesce(nullif(full_name, ''), 'Nuovo messaggio') into sender_name from profiles where id = new.sender_id;
  -- Una sola notifica non letta per conversazione: si aggiorna invece di accumularsi.
  delete from notifications where recipient_id = recipient and kind = 'message' and read_at is null
    and link = '/messaggi/' || new.care_link_id;
  perform public.notify(recipient, 'message', sender_name, new.body, '/messaggi/' || new.care_link_id);
  return new;
end;
$$;
create trigger messages_notify after insert on public.messages for each row execute function public.on_message();

create or replace function public.on_weekly_confirmed() returns trigger
language plpgsql security definer set search_path = public as $$
declare p record; who text;
begin
  if new.status = 'confirmed' and (tg_op = 'INSERT' or old.status is distinct from 'confirmed') then
    select coalesce(nullif(full_name, ''), 'Un atleta') into who from profiles where id = new.athlete_id;
    for p in select professional_id from care_links
      where athlete_id = new.athlete_id and status = 'active' and 'checkin' = any (modules) loop
      perform public.notify(p.professional_id, 'weekly_confirmed', who || ' ha inviato il check-in settimanale',
        '', '/atleti/' || new.athlete_id);
    end loop;
  end if;
  return new;
end;
$$;
create trigger weekly_notify after insert or update on public.weekly_checkins
  for each row execute function public.on_weekly_confirmed();

create or replace function public.on_checkin_comment() returns trigger
language plpgsql security definer set search_path = public as $$
declare w weekly_checkins%rowtype; p record; who text;
begin
  select * into w from weekly_checkins where id = new.weekly_checkin_id;
  select coalesce(nullif(full_name, ''), 'Qualcuno') into who from profiles where id = new.author_id;
  if new.author_id <> w.athlete_id then
    perform public.notify(w.athlete_id, 'checkin_comment',
      case when new.kind = 'question' then who || ' ti ha fatto una domanda sul check-in' else who || ' ha commentato il tuo check-in' end,
      new.body, '/settimanale?settimana=' || w.week_end);
  else
    for p in select professional_id from care_links
      where athlete_id = w.athlete_id and status = 'active' and 'checkin' = any (modules) loop
      perform public.notify(p.professional_id, 'checkin_comment', who || ' ha risposto sul check-in', new.body, '/atleti/' || w.athlete_id);
    end loop;
  end if;
  return new;
end;
$$;
create trigger checkin_comment_notify after insert on public.checkin_comments
  for each row execute function public.on_checkin_comment();

create or replace function public.on_program_active() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'active' and old.status is distinct from 'active' then
    perform public.notify(new.athlete_id, 'program_active', 'Nuova scheda di allenamento', new.name, '/allenamento');
  end if;
  return new;
end;
$$;
create trigger program_notify after update on public.programs
  for each row execute function public.on_program_active();

-- Le funzioni dei trigger non si chiamano direttamente.
revoke execute on function public.on_message(), public.on_weekly_confirmed(), public.on_checkin_comment(), public.on_program_active()
  from public, anon, authenticated;

-- Aggiornamenti in tempo reale (dove esiste la pubblicazione di Supabase Realtime).
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.messages, public.notifications;
  end if;
end;
$$;
