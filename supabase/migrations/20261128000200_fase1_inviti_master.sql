-- Fase 1: anteprima degli inviti, inviti per professionisti (dal master), gestione ruoli del master.

alter table public.invites
  add column kind text not null default 'athlete' check (kind in ('athlete', 'professional'));

-- Solo il master può invitare un professionista.
drop policy invites_insert on public.invites;
create policy invites_insert on public.invites for insert to authenticated
  with check (
    invited_by = auth.uid()
    and (
      (kind = 'athlete' and (select role from public.profiles where id = auth.uid()) = 'professional')
      or public.is_master()
    )
  );

-- Anteprima pubblica di un invito: chi apre il link vede per chi è e chi lo invita, senza leggere la tabella.
create or replace function public.invite_preview(invite_token uuid)
returns table (email text, full_name text, kind text, inviter_name text, status text)
language sql stable security definer set search_path = public as $$
  select i.email, i.full_name, i.kind, p.full_name,
    case when i.accepted_at is not null then 'used'
         when i.expires_at < now() then 'expired'
         else 'valid' end
  from invites i join profiles p on p.id = i.invited_by
  where i.token = invite_token;
$$;
revoke all on function public.invite_preview(uuid) from public;
grant execute on function public.invite_preview(uuid) to anon, authenticated;

-- Accettazione: un invito da professionista promuove l'account e non crea collegamenti con un atleta.
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

  if inv.kind = 'professional' then
    update profiles set role = 'professional' where id = auth.uid();
  else
    insert into care_links (athlete_id, professional_id, studio_id, modules)
    values (auth.uid(), inv.invited_by, inv.studio_id, inv.modules)
    on conflict (athlete_id, professional_id)
      do update set status = 'active', ended_at = null, modules = excluded.modules
    returning id into link_id;
  end if;

  update invites set accepted_at = now(), accepted_by = auth.uid() where id = inv.id;
  update profiles set full_name = inv.full_name where id = auth.uid() and full_name = '' and inv.full_name <> '';
  return link_id;
end;
$$;

-- Il master può cambiare il ruolo di un account.
create or replace function public.set_user_role(target uuid, new_role text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_master() then raise exception 'forbidden'; end if;
  if new_role not in ('athlete', 'professional') then raise exception 'invalid_role'; end if;
  update profiles set role = new_role where id = target;
end;
$$;
revoke all on function public.set_user_role(uuid, text) from public, anon;
grant execute on function public.set_user_role(uuid, text) to authenticated;

-- Conteggio dei promemoria aperti per atleta, per la console del coach.
create or replace view public.coach_open_tasks with (security_invoker = true) as
  select professional_id, athlete_id, count(*)::int as open_count
  from public.coach_tasks where done_at is null
  group by professional_id, athlete_id;
grant select on public.coach_open_tasks to authenticated;

-- Link facoltativo alla chat Telegram con l'atleta, impostato dal professionista nella scheda.
alter table public.care_links add column telegram_url text
  check (telegram_url is null or telegram_url ~ '^https://(t\.me|telegram\.me)/');
