-- Fase 5 (base): catalogo alimentare condiviso.
-- Un solo catalogo per tutti gli studi: alimenti generici (tabelle CREA, BDA IEO...) e prodotti di marca.
-- I valori nutrizionali stanno in versioni: un aggiornamento di etichetta crea una nuova versione,
-- e i pasti già registrati restano legati alla versione usata al momento della conferma.

-- ---------------------------------------------------------------- Alimenti
create table public.foods (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('generic', 'branded')),
  name text not null check (length(trim(name)) > 0),
  brand text,                                   -- solo prodotti di marca
  variant text,                                 -- gusto, formato, formulazione
  category text,
  aliases text[] not null default '{}',         -- sinonimi per la ricerca ("Grana", "Parmigiano")
  state text check (state in ('raw', 'cooked', 'drained', 'prepared')),  -- crudo, cotto, sgocciolato, preparato
  basis text not null default 'g' check (basis in ('g', 'ml')),          -- valori per 100 g o per 100 ml
  edible_part_pct numeric check (edible_part_pct > 0 and edible_part_pct <= 100),
  unit_weight_g numeric check (unit_weight_g > 0),          -- peso di un pezzo
  portion_g numeric check (portion_g > 0),                  -- porzione standard o da etichetta
  portion_label text,
  drained_weight_g numeric check (drained_weight_g > 0),    -- peso sgocciolato della confezione
  barcode text,
  -- Fonte della voce: crea, bda_ieo, altra fonte istituzionale, etichetta, sito del produttore,
  -- Open Food Facts, inserimento manuale.
  source text not null check (source in ('crea', 'bda_ieo', 'institutional', 'label', 'manufacturer', 'off', 'manual')),
  source_ref text,                              -- codice CREA, codice BDA, URL, codice a barre OFF
  status text not null default 'to_verify' check (status in ('to_verify', 'auto_approved', 'verified')),
  merged_into uuid references public.foods (id),          -- duplicato ricondotto a un'altra voce
  current_version_id uuid,                                -- vedi food_versions
  search_text text not null default '',
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  verified_by uuid references public.profiles (id) on delete set null,
  verified_at timestamptz,
  check (merged_into is null or merged_into <> id),
  check (kind = 'branded' or brand is null)
);
create unique index foods_source_ref on public.foods (source, source_ref) where source_ref is not null and source in ('crea', 'bda_ieo');
create index foods_barcode on public.foods (barcode) where barcode is not null;
create index foods_status on public.foods (status) where status <> 'verified';

-- ---------------------------------------------------------------- Versioni dei valori
-- Tutti i valori sono riferiti a 100 g o 100 ml (foods.basis) della parte edibile.
create table public.food_versions (
  id uuid primary key default gen_random_uuid(),
  food_id uuid not null references public.foods (id) on delete cascade,
  version int not null,
  kcal numeric check (kcal >= 0),               -- energia dichiarata dalla fonte (non ricalcolata)
  kj numeric check (kj >= 0),
  protein_g numeric check (protein_g >= 0),
  carbs_g numeric check (carbs_g >= 0),         -- carboidrati disponibili
  sugars_g numeric check (sugars_g >= 0),
  fat_g numeric check (fat_g >= 0),
  sat_fat_g numeric check (sat_fat_g >= 0),
  fiber_g numeric check (fiber_g >= 0),
  polyols_g numeric check (polyols_g >= 0),
  salt_g numeric check (salt_g >= 0),
  sodium_mg numeric check (sodium_mg >= 0),
  water_g numeric check (water_g >= 0),
  alcohol_g numeric check (alcohol_g >= 0),
  extra jsonb not null default '{}',            -- altri nutrienti della fonte (minerali, vitamine...)
  ingredients text,                             -- elenco ingredienti da etichetta
  allergens text[] not null default '{}',
  -- Come sono stati acquisiti i valori: trascritti a mano, letti da foto dell'etichetta, importati da una fonte.
  provenance text not null check (provenance in ('manual', 'label', 'import')),
  label_photo_path text,                        -- foto in storage (bucket privato, arriverà dopo)
  unreadable text[] not null default '{}',      -- campi dell'etichetta segnalati come illeggibili
  is_estimate boolean not null default false,
  estimate_note text,                           -- da dove arriva la stima
  note text,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (food_id, version),
  check (not is_estimate or estimate_note is not null)
);
alter table public.foods add constraint foods_current_version
  foreign key (current_version_id) references public.food_versions (id) deferrable initially deferred;

-- ---------------------------------------------------------------- Ricerca
-- Testo normalizzato (minuscolo, senza accenti) per cercare per nome, marca, variante e sinonimi.
create or replace function public.food_norm(t text) returns text
language sql immutable as $$
  select lower(translate(coalesce(t, ''), 'àáâäèéêëìíîïòóôöùúûüÀÁÂÄÈÉÊËÌÍÎÏÒÓÔÖÙÚÛÜ''’',
                                          'aaaaeeeeiiiioooouuuuaaaaeeeeiiiioooouuuu  '));
$$;

create or replace function public.foods_set_search() returns trigger
language plpgsql as $$
begin
  new.search_text := public.food_norm(concat_ws(' ', new.name, new.brand, new.variant,
    array_to_string(new.aliases, ' '), new.barcode));
  return new;
end $$;
create trigger foods_search before insert or update on public.foods
  for each row execute function public.foods_set_search();

-- Ricerca nel catalogo: tutte le parole devono comparire. I duplicati riconducono alla voce principale.
-- Restituisce anche i valori della versione corrente, per mostrarli subito nell'elenco.
create or replace function public.search_foods(q text, max_rows int default 20)
returns table (
  id uuid, kind text, name text, brand text, variant text, state text, basis text,
  source text, status text, version_id uuid,
  kcal numeric, protein_g numeric, carbs_g numeric, fat_g numeric
)
language sql stable security invoker set search_path = public as $$
  with words as (
    select w from unnest(string_to_array(public.food_norm(q), ' ')) w where length(w) > 0
  )
  select f.id, f.kind, f.name, f.brand, f.variant, f.state, f.basis, f.source, f.status, v.id,
         v.kcal, v.protein_g, v.carbs_g, v.fat_g
  from public.foods f
  left join public.food_versions v on v.id = f.current_version_id
  where f.merged_into is null
    and exists (select 1 from words)
    and not exists (select 1 from words where position(w in f.search_text) = 0)
  order by (f.search_text like (select string_agg(w, ' ') from words) || '%') desc,
           (f.status = 'verified') desc, length(f.name), f.name
  limit least(greatest(max_rows, 1), 100);
$$;

-- ---------------------------------------------------------------- Inserimento da atleti e professionisti
-- Un prodotto inserito a mano è subito utilizzabile. Lo stato lo decide il database:
--  * etichetta fotografata e nessuna cifra illeggibile -> auto_approved (il master può comunque ricontrollarlo)
--  * altrimenti -> to_verify, riconoscibile nella console del master.
-- values: { kcal, kj, protein_g, carbs_g, sugars_g, fat_g, sat_fat_g, fiber_g, polyols_g, salt_g, sodium_mg,
--           ingredients, allergens[], provenance, label_photo_path, unreadable[], note }
create or replace function public.add_food(food jsonb, vals jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  fid uuid;
  vid uuid;
  prov text := coalesce(vals->>'provenance', 'manual');
  unread text[] := coalesce(array(select jsonb_array_elements_text(vals->'unreadable')), '{}');
  st text;
begin
  if auth.uid() is null then raise exception 'forbidden'; end if;
  if prov not in ('manual', 'label') then raise exception 'invalid_provenance'; end if;
  if prov = 'label' and coalesce(vals->>'label_photo_path', '') = '' then raise exception 'label_photo_required'; end if;
  st := case when prov = 'label' and cardinality(unread) = 0 then 'auto_approved' else 'to_verify' end;

  insert into foods (kind, name, brand, variant, category, aliases, state, basis, unit_weight_g, portion_g,
                     portion_label, drained_weight_g, barcode, source, status, created_by)
  values ('branded', food->>'name', nullif(trim(food->>'brand'), ''), nullif(trim(food->>'variant'), ''),
          food->>'category', '{}', food->>'state', coalesce(food->>'basis', 'g'),
          (food->>'unit_weight_g')::numeric, (food->>'portion_g')::numeric, food->>'portion_label',
          (food->>'drained_weight_g')::numeric, nullif(trim(food->>'barcode'), ''),
          case when prov = 'label' then 'label' else 'manual' end, st, auth.uid())
  returning id into fid;

  vid := public.insert_food_version(fid, 1, vals, prov, unread);
  update foods set current_version_id = vid where id = fid;
  return fid;
end $$;

create or replace function public.insert_food_version(fid uuid, ver int, vals jsonb, prov text, unread text[])
returns uuid language plpgsql security definer set search_path = public as $$
declare vid uuid;
begin
  insert into food_versions (food_id, version, kcal, kj, protein_g, carbs_g, sugars_g, fat_g, sat_fat_g, fiber_g,
                             polyols_g, salt_g, sodium_mg, ingredients, allergens, provenance, label_photo_path,
                             unreadable, is_estimate, estimate_note, note, created_by)
  values (fid, ver, (vals->>'kcal')::numeric, (vals->>'kj')::numeric, (vals->>'protein_g')::numeric,
          (vals->>'carbs_g')::numeric, (vals->>'sugars_g')::numeric, (vals->>'fat_g')::numeric,
          (vals->>'sat_fat_g')::numeric, (vals->>'fiber_g')::numeric, (vals->>'polyols_g')::numeric,
          (vals->>'salt_g')::numeric, (vals->>'sodium_mg')::numeric, vals->>'ingredients',
          coalesce(array(select jsonb_array_elements_text(vals->'allergens')), '{}'),
          prov, vals->>'label_photo_path', unread,
          coalesce((vals->>'is_estimate')::boolean, false), vals->>'estimate_note', vals->>'note', auth.uid())
  returning id into vid;
  return vid;
end $$;
revoke execute on function public.insert_food_version(uuid, int, jsonb, text, text[]) from public, anon, authenticated;

-- Nuova etichetta per un prodotto esistente: vale per gli utilizzi successivi.
-- La può caricare il master, oppure chi ha creato la voce finché il master non l'ha verificata.
create or replace function public.add_food_version(fid uuid, vals jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  f foods;
  vid uuid;
  prov text := coalesce(vals->>'provenance', 'manual');
  unread text[] := coalesce(array(select jsonb_array_elements_text(vals->'unreadable')), '{}');
begin
  select * into f from foods where id = fid;
  if f.id is null then raise exception 'not_found'; end if;
  if not (public.is_master() or (f.created_by = auth.uid() and f.status <> 'verified' and f.kind = 'branded')) then
    raise exception 'forbidden';
  end if;
  if prov not in ('manual', 'label', 'import') or (prov = 'import' and not public.is_master()) then
    raise exception 'invalid_provenance';
  end if;
  vid := public.insert_food_version(fid, (select coalesce(max(version), 0) + 1 from food_versions where food_id = fid),
                                    vals, prov, unread);
  update foods set current_version_id = vid,
    status = case when public.is_master() then status
                  when prov = 'label' and cardinality(unread) = 0 then 'auto_approved' else 'to_verify' end
  where id = fid;
  return vid;
end $$;

-- Master: conferma una voce controllata.
create or replace function public.verify_food(fid uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_master() then raise exception 'forbidden'; end if;
  update foods set status = 'verified', verified_by = auth.uid(), verified_at = now() where id = fid;
end $$;

-- Master: riconduce un duplicato alla voce principale. Le versioni del duplicato restano,
-- così i pasti già registrati con quei valori non cambiano significato.
create or replace function public.merge_food(duplicate uuid, target uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_master() then raise exception 'forbidden'; end if;
  if duplicate = target then raise exception 'same_food'; end if;
  if (select merged_into from foods where id = target) is not null then raise exception 'target_merged'; end if;
  update foods set merged_into = target where id = duplicate;
  update foods set merged_into = target where merged_into = duplicate;
  update foods t set aliases = array(select distinct unnest(t.aliases || d.name))
    from foods d where d.id = duplicate and t.id = target;
end $$;

-- ---------------------------------------------------------------- Regole
alter table public.foods enable row level security;
alter table public.food_versions enable row level security;

-- Il catalogo è comune: ogni utente autenticato lo legge.
create policy foods_read on public.foods for select to authenticated using (true);
create policy food_versions_read on public.food_versions for select to authenticated using (true);
-- Scritture dirette solo per il master (correzioni, sinonimi, import). Gli altri passano dalle funzioni sopra.
-- Nessuno cancella voci o versioni: un errore si corregge con una nuova versione o un accorpamento,
-- così i pasti registrati non perdono i valori.
create policy foods_master_insert on public.foods for insert to authenticated with check (public.is_master());
create policy foods_master_update on public.foods for update to authenticated
  using (public.is_master()) with check (public.is_master());
create policy food_versions_master_write on public.food_versions for insert to authenticated
  with check (public.is_master());

grant select, insert, update on public.foods to authenticated;
grant select, insert on public.food_versions to authenticated;
revoke all on function public.search_foods(text, int), public.add_food(jsonb, jsonb),
  public.add_food_version(uuid, jsonb), public.verify_food(uuid), public.merge_food(uuid, uuid) from public, anon;
grant execute on function public.food_norm(text), public.search_foods(text, int), public.add_food(jsonb, jsonb),
  public.add_food_version(uuid, jsonb), public.verify_food(uuid), public.merge_food(uuid, uuid)
  to authenticated;
