-- Marchio per studio: ogni studio (es. "Vis æ Vis") ha nome, logo e accento propri,
-- visti dai suoi professionisti e dai loro atleti. Senza studio vale il marchio della piattaforma (brand.js).

alter table public.studios
  add column brand_name text,
  add column tagline text,
  add column accent text check (accent is null or accent ~ '^#[0-9a-fA-F]{6}$'),
  add column logo_light_url text check (logo_light_url is null or logo_light_url ~ '^https://'),  -- da usare su sfondo chiaro
  add column logo_dark_url text check (logo_dark_url is null or logo_dark_url ~ '^https://'),    -- da usare su sfondo scuro
  add column icon_url text check (icon_url is null or icon_url ~ '^https://'),
  add column updated_at timestamptz not null default now();

create or replace function public.is_studio_owner(studio uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from studio_members where studio_id = studio and profile_id = auth.uid() and role = 'owner');
$$;
grant execute on function public.is_studio_owner(uuid) to authenticated;

-- Lo studio lo modifica il suo titolare o il master; i membri li gestisce il master.
create policy studios_update on public.studios for update to authenticated
  using (public.is_master() or public.is_studio_owner(id))
  with check (public.is_master() or public.is_studio_owner(id));
create policy studios_delete on public.studios for delete to authenticated using (public.is_master());
create policy studio_members_write on public.studio_members for all to authenticated
  using (public.is_master()) with check (public.is_master());
grant update, delete on public.studios to authenticated;
grant insert, update, delete on public.studio_members to authenticated;

-- Studio di un professionista: quello di cui è titolare, altrimenti il primo di cui è membro.
create or replace function public.studio_of(professional uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select studio_id from studio_members where profile_id = professional
  order by (role = 'owner') desc, studio_id limit 1;
$$;

create or replace function public.studio_brand(studio uuid)
returns table (studio_id uuid, brand_name text, tagline text, accent text, logo_light_url text, logo_dark_url text, icon_url text)
language sql stable security definer set search_path = public as $$
  select s.id, coalesce(nullif(s.brand_name, ''), s.name), s.tagline, s.accent, s.logo_light_url, s.logo_dark_url, s.icon_url
  from studios s where s.id = studio;
$$;
revoke all on function public.studio_of(uuid), public.studio_brand(uuid) from public, anon;

-- Marchio da mostrare a un utente. Professionista: il suo studio. Atleta: lo studio del coach
-- dell'allenamento, altrimenti del collegamento attivo più vecchio. Un utente diverso da sé solo il master.
create or replace function public.brand_for(target uuid default null)
returns table (studio_id uuid, brand_name text, tagline text, accent text, logo_light_url text, logo_dark_url text, icon_url text)
language plpgsql stable security definer set search_path = public as $$
declare
  who uuid := coalesce(target, auth.uid());
  s uuid;
begin
  if who is null or (who <> auth.uid() and not public.is_master()) then return; end if;
  s := public.studio_of(who);
  if s is null then
    select coalesce(l.studio_id, public.studio_of(l.professional_id)) into s
    from care_links l where l.athlete_id = who and l.status = 'active'
      and coalesce(l.studio_id, public.studio_of(l.professional_id)) is not null
    order by ('training' = any (l.modules)) desc, l.started_at limit 1;
  end if;
  if s is null then return; end if;
  return query select * from public.studio_brand(s);
end;
$$;
revoke all on function public.brand_for(uuid) from public, anon;
grant execute on function public.brand_for(uuid) to authenticated;

-- Marchio di chi invita, mostrato nella pagina d'invito prima dell'accesso.
create or replace function public.invite_brand(invite_token uuid)
returns table (studio_id uuid, brand_name text, tagline text, accent text, logo_light_url text, logo_dark_url text, icon_url text)
language sql stable security definer set search_path = public as $$
  select b.* from invites i
  cross join lateral public.studio_brand(coalesce(i.studio_id, public.studio_of(i.invited_by))) b
  where i.token = invite_token and i.accepted_at is null and i.expires_at > now();
$$;
revoke all on function public.invite_brand(uuid) from public;
grant execute on function public.invite_brand(uuid) to anon, authenticated;

-- File dei marchi: bucket pubblico in lettura, cartella per studio. Scrive il titolare o il master.
-- Il blocco salta dove lo schema storage non esiste (test locali).
do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'storage') then
    insert into storage.buckets (id, name, public) values ('brand-assets', 'brand-assets', true)
      on conflict (id) do nothing;
    execute $p$
      create policy brand_assets_write on storage.objects for insert to authenticated
        with check (bucket_id = 'brand-assets' and (public.is_master()
          or public.is_studio_owner(((storage.foldername(name))[1])::uuid)))$p$;
    execute $p$
      create policy brand_assets_update on storage.objects for update to authenticated
        using (bucket_id = 'brand-assets' and (public.is_master()
          or public.is_studio_owner(((storage.foldername(name))[1])::uuid)))$p$;
    execute $p$
      create policy brand_assets_delete on storage.objects for delete to authenticated
        using (bucket_id = 'brand-assets' and (public.is_master()
          or public.is_studio_owner(((storage.foldername(name))[1])::uuid)))$p$;
  end if;
end;
$$;
